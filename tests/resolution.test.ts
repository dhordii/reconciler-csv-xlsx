import { describe, expect, it } from 'vitest';

import {
  buildResolvedExportPlan,
  buildResolvedRows,
  cellIssueId,
  duplicateIssueId,
  getResolutionIssues,
  missingKeyIssueId,
  presenceIssueId,
  resolutionProgress,
  type ResolutionDecisions,
} from '../src/domain/resolution';
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

describe('resolution', () => {
  it('requires an explicit decision for every actionable difference', async () => {
    const left = source('a.csv', [
      { rowNumber: 2, values: { '0:ID': '1', '1:Amount': 10 } },
      { rowNumber: 3, values: { '0:ID': '2', '1:Amount': 20 } },
    ]);
    const right = source('b.csv', [
      { rowNumber: 2, values: { '0:ID': '1', '1:Amount': 11 } },
      { rowNumber: 3, values: { '0:ID': '3', '1:Amount': 30 } },
    ]);
    const result = await reconcileSources(left, right, { mappings });
    const issues = getResolutionIssues(result);

    expect(issues.map((issue) => issue.type)).toEqual(['cell', 'presence', 'presence']);
    expect(resolutionProgress(result, {})).toEqual({ complete: false, resolved: 0, total: 3 });
    expect(() => buildResolvedRows(left, right, mappings, result, 'a', {})).toThrow(/3 reconciliation/iu);
  });

  it('builds a base-shaped result with A, B, custom and presence decisions', async () => {
    const left = source('a.csv', [
      { rowNumber: 2, values: { '0:ID': '1', '1:Amount': 10 } },
      { rowNumber: 3, values: { '0:ID': '2', '1:Amount': 20 } },
      { rowNumber: 4, values: { '0:ID': '', '1:Amount': 40 } },
    ]);
    const right = source('b.csv', [
      { rowNumber: 2, values: { '0:ID': '1', '1:Amount': 11 } },
      { rowNumber: 3, values: { '0:ID': '3', '1:Amount': 30 } },
      { rowNumber: 4, values: { '0:ID': '', '1:Amount': 50 } },
    ]);
    const result = await reconcileSources(left, right, { mappings });
    const difference = result.differences[0];
    const missingA = result.missingKeys.find((item) => item.side === 'a');
    const missingB = result.missingKeys.find((item) => item.side === 'b');
    expect(difference).toBeDefined();
    expect(missingA).toBeDefined();
    expect(missingB).toBeDefined();

    const decisions: ResolutionDecisions = {
      [cellIssueId(difference!, difference!.differences[0]!)]: { choice: 'b', kind: 'cell' },
      [presenceIssueId('a', result.onlyA[0]!)]: { choice: 'exclude', kind: 'presence' },
      [presenceIssueId('b', result.onlyB[0]!)]: { choice: 'include', kind: 'presence' },
      [missingKeyIssueId(missingA!)]: { choice: 'include', kind: 'presence' },
      [missingKeyIssueId(missingB!)]: { choice: 'exclude', kind: 'presence' },
    };
    const plan = buildResolvedExportPlan(left, right, mappings, result, 'a', decisions);

    expect(resolutionProgress(result, decisions).complete).toBe(true);
    expect(plan.rows.map((row) => row.values)).toEqual([
      { '0:ID': '1', '1:Amount': 11 },
      { '0:ID': '', '1:Amount': 40 },
      { '0:ID': '3', '1:Amount': 30 },
    ]);
    expect(plan.deletedRowNumbers).toEqual([3]);
    expect(plan.updatedRows.map((row) => row.originRowNumber)).toEqual([2]);
    expect(plan.addedRows.map((row) => row.originRowNumber)).toEqual([3]);
  });

  it('replaces duplicate base rows with the selected source group', async () => {
    const left = source('a.csv', [
      { rowNumber: 2, values: { '0:ID': '1', '1:Amount': 10 } },
      { rowNumber: 3, values: { '0:ID': '1', '1:Amount': 20 } },
    ]);
    const right = source('b.csv', [{ rowNumber: 2, values: { '0:ID': '1', '1:Amount': 99 } }]);
    const result = await reconcileSources(left, right, { mappings });
    const group = result.duplicates[0];
    expect(group).toBeDefined();
    const decisions: ResolutionDecisions = {
      [duplicateIssueId(group!)]: { choice: 'b', kind: 'duplicate' },
    };

    const rows = buildResolvedRows(left, right, mappings, result, 'a', decisions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.values).toEqual({ '0:ID': '1', '1:Amount': 99 });
    expect(rows[0]?.originSide).toBe('b');
  });

  it('uses File B columns and row order when File B is the output base', async () => {
    const left = source('a.csv', [
      { rowNumber: 2, values: { '0:ID': '1', '1:Amount': 10 } },
      { rowNumber: 3, values: { '0:ID': '2', '1:Amount': 20 } },
    ]);
    const right = source('b.csv', [
      { rowNumber: 2, values: { '0:ID': '1', '1:Amount': 11 } },
      { rowNumber: 3, values: { '0:ID': '3', '1:Amount': 30 } },
    ]);
    const result = await reconcileSources(left, right, { mappings });
    const difference = result.differences[0]!;
    const decisions: ResolutionDecisions = {
      [cellIssueId(difference, difference.differences[0]!)]: { choice: 'a', kind: 'cell' },
      [presenceIssueId('a', result.onlyA[0]!)]: { choice: 'include', kind: 'presence' },
      [presenceIssueId('b', result.onlyB[0]!)]: { choice: 'exclude', kind: 'presence' },
    };

    const rows = buildResolvedRows(left, right, mappings, result, 'b', decisions);

    expect(rows.map((row) => row.values)).toEqual([
      { '0:ID': '1', '1:Amount': 10 },
      { '0:ID': '2', '1:Amount': 20 },
    ]);
    expect(rows.map((row) => row.originSide)).toEqual(['b', 'a']);
  });
});
