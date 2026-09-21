/// <reference lib="webworker" />

import { parseFile } from '../adapters/parseFile';
import { reconcileSources } from '../domain/reconcile';
import type { WorkerRequest, WorkerResponse } from './protocol';

const cancelled = new Set<string>();

function respond(message: WorkerResponse): void {
  self.postMessage(message);
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelled.add(request.requestId);
    return;
  }

  void (async () => {
    try {
      if (request.type === 'parse') {
        const source = await parseFile(request.file, request.settings);
        respond({ requestId: request.requestId, source, type: 'parsed' });
        return;
      }

      const result = await reconcileSources(request.left, request.right, request.config, {
        isCancelled: () => cancelled.has(request.requestId),
        onProgress: (progress) => respond({ progress, requestId: request.requestId, type: 'progress' }),
        yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
      });
      respond({ requestId: request.requestId, result, type: 'reconciled' });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      respond({
        message: normalized.message,
        name: normalized.name,
        requestId: request.requestId,
        type: 'error',
      });
    } finally {
      cancelled.delete(request.requestId);
    }
  })();
});

export {};
