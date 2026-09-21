import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { createReconciliationWorkbook } from '../src/reporting/report';
import type { ColumnMapping, ParsedSource, ReconciliationResult } from '../src/domain/types';

const mapping: ColumnMapping = {
  compare: true,
  id: 'note',
  key: false,
  keyRule: { caseInsensitive: false, collapseWhitespace: false, trim: false },
  leftColumnId: '1:Note',
  leftName: 'Note',
  rightColumnId: '1:Note',
  rightName: 'Note',
  rule: { caseInsensitive: false, collapseWhitespace: false, kind: 'text', trim: false },
};
const keyMapping: ColumnMapping = {
  ...mapping,
  id: 'key',
  key: true,
  leftColumnId: '0:ID',
  leftName: 'ID',
  rightColumnId: '0:ID',
  rightName: 'ID',
};

function source(fileName: string): ParsedSource {
  return {
    columns: [
      { id: '0:ID', index: 0, name: 'ID', sampleValues: [], suggestedType: 'text' },
      { id: '1:Note', index: 1, name: 'Note', sampleValues: [], suggestedType: 'text' },
    ],
    meta: { fileName, fileSize: 10, formulaWarningCount: 0, kind: 'csv', sheetNames: [] },
    rows: [],
    settings: { headerRow: 1 },
    warnings: [],
  };
}

describe('XLSX report', () => {
  it('reopens with complete sheets and preserves formula-like text as text', async () => {
    const rowA = { rowNumber: 2, values: { '0:ID': '1', '1:Note': '=2+2' } };
    const rowB = { rowNumber: 2, values: { '0:ID': '1', '1:Note': 'safe' } };
    const result: ReconciliationResult = {
      completedAt: '2026-09-19T10:00:00.000Z',
      differences: [
        {
          differences: [
            {
              label: 'Note',
              leftColumnId: '1:Note',
              leftValue: '=2+2',
              rightColumnId: '1:Note',
              rightValue: 'safe',
            },
          ],
          key: '["1"]',
          keyParts: ['1'],
          left: rowA,
          right: rowB,
        },
      ],
      duplicates: [],
      durationMs: 12,
      exactMatches: [],
      missingKeys: [],
      onlyA: [],
      onlyB: [],
      summary: {
        differences: 1,
        duplicates: 0,
        exactMatches: 0,
        missingKeys: 0,
        onlyA: 0,
        onlyB: 0,
        totalRowsA: 1,
        totalRowsB: 1,
      },
      warnings: [],
    };
    const workbook = createReconciliationWorkbook(
      source('a.csv'),
      source('b.csv'),
      { mappings: [keyMapping, mapping] },
      result,
      { includeMatches: true },
    );
    const buffer = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    expect(reopened.worksheets.map((sheet) => sheet.name)).toEqual([
      'Summary',
      'Run details',
      'Differences',
      'Only A',
      'Only B',
      'Duplicates',
      'Missing key',
      'Matches',
    ]);
    const differences = reopened.getWorksheet('Differences');
    const headerValues = differences?.getRow(1).values;
    const noteColumn = Array.isArray(headerValues)
      ? headerValues.findIndex((value) => value === 'Note · A')
      : -1;
    const formulaLike = noteColumn > 0 ? differences?.getRow(2).getCell(noteColumn) : undefined;
    expect(formulaLike?.value).toBe('=2+2');
    expect(formulaLike?.type).toBe(ExcelJS.ValueType.String);
  });
});
