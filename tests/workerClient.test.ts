import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ParsedSource } from '../src/domain/types';
import { ReconcilerWorkerClient } from '../src/services/workerClient';
import type { WorkerRequest } from '../src/workers/protocol';

class FakeWorker extends EventTarget {
  static latest: FakeWorker | undefined;
  readonly messages: WorkerRequest[] = [];

  constructor() {
    super();
    FakeWorker.latest = this;
  }

  postMessage(message: WorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {}
}

const source: ParsedSource = {
  columns: [],
  meta: { fileName: 'source.csv', fileSize: 1, formulaWarningCount: 0, kind: 'csv', sheetNames: [] },
  rows: [],
  settings: { headerRow: 1 },
  warnings: [],
};

afterEach(() => {
  FakeWorker.latest = undefined;
  vi.unstubAllGlobals();
});

describe('ReconcilerWorkerClient', () => {
  it('invalidates a cancelled reconciliation before the worker can return a stale result', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const client = new ReconcilerWorkerClient();
    const worker = FakeWorker.latest;
    if (!worker) throw new Error('Expected the worker client to create a worker.');

    const operation = client.reconcile(source, source, { mappings: [] });
    const rejection = expect(operation.promise).rejects.toMatchObject({ name: 'AbortError' });
    operation.cancel();

    await rejection;
    expect(worker.messages.map((message) => message.type)).toEqual(['reconcile', 'cancel']);
    client.dispose();
  });
});
