import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { parseFile } from '../src/adapters/parseFile';
import { cellIssueId, presenceIssueId, type ResolutionDecisions } from '../src/domain/resolution';
import { reconcileSources } from '../src/domain/reconcile';
import type { ColumnMapping, ParsedSource } from '../src/domain/types';
import { buildReconciledFile } from '../src/services/reconciledExport';

function fileFromBytes(name: string, bytes: Uint8Array): File {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return {
    arrayBuffer: async () => arrayBuffer,
    name,
    size: bytes.byteLength,
  } as File;
}

function mappings(left: ParsedSource, right: ParsedSource): ColumnMapping[] {
  return left.columns.map((leftColumn, index) => {
    const rightColumn = right.columns[index]!;
    const key = index === 0;
    return {
      compare: true,
      id: `mapping-${index}`,
      key,
      keyRule: { caseInsensitive: false, collapseWhitespace: false, trim: false },
      leftColumnId: leftColumn.id,
      leftName: leftColumn.name,
      rightColumnId: rightColumn.id,
      rightName: rightColumn.name,
      rule: key
        ? { caseInsensitive: false, collapseWhitespace: false, kind: 'text', trim: false }
        : { absoluteTolerance: 0, format: 'plain', kind: 'number', relativeTolerancePercent: 0 },
    } satisfies ColumnMapping;
  });
}

async function bytesFromBlob(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('reconciled file export', () => {
  it('preserves the base CSV dialect and exports selected values and rows', async () => {
    const textA = '\ufeffID;Amount\r\n1;10\r\n2;20\r\n';
    const textB = '\ufeffID;Amount\r\n1;11\r\n3;30\r\n';
    const fileA = fileFromBytes('a.csv', new TextEncoder().encode(textA));
    const fileB = fileFromBytes('b.csv', new TextEncoder().encode(textB));
    const [left, right] = await Promise.all([parseFile(fileA), parseFile(fileB)]);
    const configMappings = mappings(left, right);
    const result = await reconcileSources(left, right, { mappings: configMappings });
    const difference = result.differences[0]!;
    const decisions: ResolutionDecisions = {
      [cellIssueId(difference, difference.differences[0]!)]: { choice: 'b', kind: 'cell' },
      [presenceIssueId('a', result.onlyA[0]!)]: { choice: 'exclude', kind: 'presence' },
      [presenceIssueId('b', result.onlyB[0]!)]: { choice: 'include', kind: 'presence' },
    };

    const exported = await buildReconciledFile(fileA, left, right, configMappings, result, 'a', decisions);
    const outputBytes = await bytesFromBlob(exported.blob);
    const output = new TextDecoder().decode(outputBytes);

    expect(exported.extension).toBe('csv');
    expect([...outputBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(output).toBe('ID;Amount\r\n1;11\r\n3;30\r\n');
  });

  it('updates only resolved XLSX cells while preserving other sheets and formulas', async () => {
    const workbookA = new ExcelJS.Workbook();
    const dataA = workbookA.addWorksheet('Data');
    dataA.addRow(['ID', 'Amount', 'Formula']);
    dataA.addRow(['1', 10, { formula: 'B2*2', result: 20 }]);
    dataA.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    workbookA.addWorksheet('Archive').addRow(['keep me']);
    const bufferA = await workbookA.xlsx.writeBuffer();

    const workbookB = new ExcelJS.Workbook();
    const dataB = workbookB.addWorksheet('Data');
    dataB.addRow(['ID', 'Amount', 'Formula']);
    dataB.addRow(['1', 11, { formula: 'B2*3', result: 33 }]);
    const bufferB = await workbookB.xlsx.writeBuffer();

    const fileA = fileFromBytes('a.xlsx', new Uint8Array(bufferA as unknown as ArrayBuffer));
    const fileB = fileFromBytes('b.xlsx', new Uint8Array(bufferB as unknown as ArrayBuffer));
    const [left, right] = await Promise.all([parseFile(fileA), parseFile(fileB)]);
    const configMappings = mappings(left, right);
    const result = await reconcileSources(left, right, { mappings: configMappings });
    const amountDifference = result.differences[0]!.differences.find(
      (difference) => difference.label === 'Amount',
    )!;
    const formulaDifference = result.differences[0]!.differences.find(
      (difference) => difference.label === 'Formula',
    )!;
    const decisions: ResolutionDecisions = {
      [cellIssueId(result.differences[0]!, amountDifference)]: { choice: 'b', kind: 'cell' },
      [cellIssueId(result.differences[0]!, formulaDifference)]: { choice: 'a', kind: 'cell' },
    };

    const exported = await buildReconciledFile(fileA, left, right, configMappings, result, 'a', decisions);
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load((await exported.blob.arrayBuffer()) as unknown as ExcelJS.Buffer);

    expect(reopened.worksheets.map((sheet) => sheet.name)).toEqual(['Data', 'Archive']);
    expect(reopened.getWorksheet('Data')?.getCell('B2').value).toBe(11);
    expect(reopened.getWorksheet('Data')?.getCell('B2').fill).toMatchObject({
      fgColor: { argb: 'FFFFFF00' },
    });
    expect(reopened.getWorksheet('Data')?.getCell('C2').value).toMatchObject({ formula: 'B2*2' });
    expect(reopened.getWorksheet('Archive')?.getCell('A1').value).toBe('keep me');
  });
});
