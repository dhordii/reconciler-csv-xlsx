import { describe, expect, it } from 'vitest';

import { reconcileSources } from '../src/domain/reconcile';
import type { ColumnMapping, ParsedSource, SourceRow } from '../src/domain/types';

function source(name: string, rows: SourceRow[]): ParsedSource {
  return {
    columns: [
      { id: '0:ID', index: 0, name: 'ID', sampleValues: [], suggestedType: 'text' },
      { id: '1:Amount', index: 1, name: 'Amount', sampleValues: [], suggestedType: 'number' },
    ],
    meta: { fileName: name, fileSize: 1, formulaWarningCount: 0, kind: 'csv', sheetNames: [] },
    rows,
    settings: { headerRow: 1 },
    warnings: [],
  };
}

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
    id: 'amount',
    key: false,
    keyRule: { caseInsensitive: false, collapseWhitespace: false, trim: false },
    leftColumnId: '1:Amount',
    leftName: 'Amount',
    rightColumnId: '1:Amount',
    rightName: 'Amount',
    rule: { absoluteTolerance: 0, format: 'plain', kind: 'number', relativeTolerancePercent: 0 },
  },
];

describe('reconcileSources', () => {
  it('isolates duplicates and missing keys before pairing', async () => {
    const left = source('a.csv', [
      { rowNumber: 2, values: { '0:ID': '1', '1:Amount': 10 } },
      { rowNumber: 3, values: { '0:ID': '2', '1:Amount': 20 } },
      { rowNumber: 4, values: { '0:ID': '2', '1:Amount': 21 } },
      { rowNumber: 5, values: { '0:ID': '', '1:Amount': 30 } },
      { rowNumber: 6, values: { '0:ID': '3', '1:Amount': 40 } },
    ]);
    const right = source('b.csv', [
      { rowNumber: 2, values: { '0:ID': '1', '1:Amount': 11 } },
      { rowNumber: 3, values: { '0:ID': '2', '1:Amount': 20 } },
      { rowNumber: 4, values: { '0:ID': '4', '1:Amount': 50 } },
    ]);

    const result = await reconcileSources(left, right, { mappings });
    expect(result.summary).toMatchObject({
      differences: 1,
      duplicates: 3,
      missingKeys: 1,
      onlyA: 1,
      onlyB: 1,
    });
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]?.leftRows).toHaveLength(2);
    expect(result.duplicates[0]?.rightRows).toHaveLength(1);
  });
});
