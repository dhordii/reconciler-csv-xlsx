import { expect, it } from 'vitest';

import { reconcileSources } from '../src/domain/reconcile';
import type { ColumnMapping, ParsedSource } from '../src/domain/types';

const mappings: ColumnMapping[] = [
  {
    compare: true,
    id: 'id',
    key: true,
    keyRule: { caseInsensitive: false, collapseWhitespace: false, trim: false },
    leftColumnId: '0:ID',
    leftName: 'ID',
    rightColumnId: '0:ID',
    rightName: 'ID',
    rule: { caseInsensitive: false, collapseWhitespace: false, kind: 'text', trim: false },
  },
  {
    compare: true,
    id: 'value',
    key: false,
    keyRule: { caseInsensitive: false, collapseWhitespace: false, trim: false },
    leftColumnId: '1:Value',
    leftName: 'Value',
    rightColumnId: '1:Value',
    rightName: 'Value',
    rule: { absoluteTolerance: 0, format: 'plain', kind: 'number', relativeTolerancePercent: 0 },
  },
];

function largeSource(fileName: string, offset: number): ParsedSource {
  return {
    columns: [
      { id: '0:ID', index: 0, name: 'ID', sampleValues: [], suggestedType: 'number' },
      { id: '1:Value', index: 1, name: 'Value', sampleValues: [], suggestedType: 'number' },
    ],
    meta: { fileName, fileSize: 1, formulaWarningCount: 0, kind: 'csv', sheetNames: [] },
    rows: Array.from({ length: 100_000 }, (_, index) => ({
      rowNumber: index + 2,
      values: { '0:ID': index + 1, '1:Value': index + offset },
    })),
    settings: { headerRow: 1 },
    warnings: [],
  };
}

it('reconciles two 100,000-row sources within the 30-second product budget', async () => {
  const startedAt = performance.now();
  const result = await reconcileSources(largeSource('a.csv', 0), largeSource('b.csv', 1), {
    mappings,
  });
  const elapsed = performance.now() - startedAt;

  expect(result.summary.differences).toBe(100_000);
  expect(elapsed).toBeLessThan(30_000);
}, 35_000);
