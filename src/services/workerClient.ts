import type {
  ParseSettings,
  ParsedSource,
  ReconciliationConfig,
  ReconciliationProgress,
  ReconciliationResult,
} from '../domain/types';
import type { WorkerRequest, WorkerResponse } from '../workers/protocol';

interface PendingRequest<T> {
  onProgress?: (progress: ReconciliationProgress) => void;
  reject: (error: Error) => void;
  resolve: (value: T) => void;
}

function createRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export class ReconcilerWorkerClient {
  private readonly pending = new Map<string, PendingRequest<ParsedSource | ReconciliationResult>>();
  private worker: Worker;

  constructor() {
    this.worker = this.createWorker();
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL('../workers/reconciler.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) =>
      this.handleMessage(event.data),
    );
    worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'The background worker stopped unexpectedly.');
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    });
    return worker;
  }

  private handleMessage(response: WorkerResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    if (response.type === 'progress') {
      pending.onProgress?.(response.progress);
      return;
    }
    this.pending.delete(response.requestId);
    if (response.type === 'error') {
      const error = new Error(response.message);
      error.name = response.name;
      pending.reject(error);
    } else if (response.type === 'parsed') pending.resolve(response.source);
    else pending.resolve(response.result);
  }

  parse(file: File, settings?: Partial<ParseSettings>): Promise<ParsedSource> {
    const requestId = createRequestId();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        reject,
        resolve: (value) => {
          if ('columns' in value) resolve(value);
          else reject(new Error('The worker returned an unexpected reconciliation result.'));
        },
      });
      const request: WorkerRequest = {
        file,
        requestId,
        ...(settings ? { settings } : {}),
        type: 'parse',
      };
      this.worker.postMessage(request);
    });
  }

  reconcile(
    left: ParsedSource,
    right: ParsedSource,
    config: ReconciliationConfig,
    onProgress?: (progress: ReconciliationProgress) => void,
  ): { cancel: () => void; promise: Promise<ReconciliationResult> } {
    const requestId = createRequestId();
    const promise = new Promise<ReconciliationResult>((resolve, reject) => {
      this.pending.set(requestId, {
        ...(onProgress ? { onProgress } : {}),
        reject,
        resolve: (value) => {
          if ('summary' in value) resolve(value);
          else reject(new Error('The worker returned an unexpected parsed source.'));
        },
      });
      const request: WorkerRequest = { config, left, requestId, right, type: 'reconcile' };
      this.worker.postMessage(request);
    });
    return {
      cancel: () => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        const error = new Error('Reconciliation cancelled.');
        error.name = 'AbortError';
        pending.reject(error);
        const request: WorkerRequest = { requestId, type: 'cancel' };
        this.worker.postMessage(request);
      },
      promise,
    };
  }

  dispose(): void {
    this.worker.terminate();
    const error = new Error('Worker client disposed.');
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}
