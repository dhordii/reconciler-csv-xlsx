import type {
  ParseSettings,
  ParsedSource,
  ReconciliationConfig,
  ReconciliationProgress,
  ReconciliationResult,
} from '../domain/types';

export type WorkerRequest =
  | { file: File; requestId: string; settings?: Partial<ParseSettings>; type: 'parse' }
  | {
      config: ReconciliationConfig;
      left: ParsedSource;
      requestId: string;
      right: ParsedSource;
      type: 'reconcile';
    }
  | { requestId: string; type: 'cancel' };

export type WorkerResponse =
  | { requestId: string; source: ParsedSource; type: 'parsed' }
  | { progress: ReconciliationProgress; requestId: string; type: 'progress' }
  | { requestId: string; result: ReconciliationResult; type: 'reconciled' }
  | { message: string; name: string; requestId: string; type: 'error' };
