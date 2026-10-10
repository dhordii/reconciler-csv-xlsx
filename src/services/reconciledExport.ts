import ExcelJS from 'exceljs';
import Papa from 'papaparse';

import {
  buildResolvedExportPlan,
  type ResolutionDecisions,
  type ResolvedOutputRow,
} from '../domain/resolution';
import type {
  CellValue,
  ColumnMapping,
  ParsedSource,
  ReconciliationResult,
  SourceSide,
} from '../domain/types';

const CSV_MIME = 'text/csv;charset=utf-8';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const WINDOWS_1251_CODE_POINTS = [
  0x0402,
  0x0403,
  0x201a,
  0x0453,
  0x201e,
  0x2026,
  0x2020,
  0x2021,
  0x20ac,
  0x2030,
  0x0409,
  0x2039,
  0x040a,
  0x040c,
  0x040b,
  0x040f,
  0x0452,
  0x2018,
  0x2019,
  0x201c,
  0x201d,
  0x2022,
  0x2013,
  0x2014,
  0xfffd,
  0x2122,
  0x0459,
  0x203a,
  0x045a,
  0x045c,
  0x045b,
  0x045f,
  0x00a0,
  0x040e,
  0x045e,
  0x0408,
  0x00a4,
  0x0490,
  0x00a6,
  0x00a7,
  0x0401,
  0x00a9,
  0x0404,
  0x00ab,
  0x00ac,
  0x00ad,
  0x00ae,
  0x0407,
  0x00b0,
  0x00b1,
  0x0406,
  0x0456,
  0x0491,
  0x00b5,
  0x00b6,
  0x00b7,
  0x0451,
  0x2116,
  0x0454,
  0x00bb,
  0x0458,
  0x0405,
  0x0455,
  0x0457,
  ...Array.from({ length: 64 }, (_, index) => 0x0410 + index),
];

const WINDOWS_1251_BYTES = new Map(
  WINDOWS_1251_CODE_POINTS.map((codePoint, index) => [codePoint, index + 0x80] as const).filter(
    ([codePoint]) => codePoint !== 0xfffd,
  ),
);

export interface ReconciledFile {
  blob: Blob;
  extension: 'csv' | 'xlsx';
}

function encodeWindows1251(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0x3f;
    if (codePoint < 0x80) bytes.push(codePoint);
    else bytes.push(WINDOWS_1251_BYTES.get(codePoint) ?? 0x3f);
  }
  return Uint8Array.from(bytes);
}

function csvBlob(text: string, encoding: ParsedSource['meta']['detectedEncoding']): Blob {
  if (encoding === 'windows-1251') {
    const bytes = encodeWindows1251(text);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return new Blob([arrayBuffer], { type: CSV_MIME });
  }
  return new Blob([text], { type: CSV_MIME });
}

async function buildCsvFile(
  baseFile: File,
  base: ParsedSource,
  rows: ResolvedOutputRow[],
): Promise<ReconciledFile> {
  const originalBytes = await baseFile.arrayBuffer();
  const encoding = base.meta.detectedEncoding ?? 'utf-8';
  const originalByteView = new Uint8Array(originalBytes);
  const hasBom =
    encoding === 'utf-8' &&
    originalByteView[0] === 0xef &&
    originalByteView[1] === 0xbb &&
    originalByteView[2] === 0xbf;
  const sourceText = new TextDecoder(encoding).decode(originalBytes);
  const delimiter = base.meta.detectedDelimiter ?? ',';
  const parsed = Papa.parse<CellValue[]>(sourceText, { delimiter, skipEmptyLines: false });
  if (parsed.errors.length > 0) {
    throw new Error(`The base CSV could not be reconstructed: ${parsed.errors[0]?.message ?? 'parse error'}`);
  }

  const prefix = parsed.data.slice(0, base.settings.headerRow);
  const body = rows.map((row) => base.columns.map((column) => row.values[column.id] ?? null));
  const newline = sourceText.includes('\r\n') ? '\r\n' : sourceText.includes('\r') ? '\r' : '\n';
  const trailingNewline = /(?:\r\n|\r|\n)$/u.test(sourceText);
  const serialized = Papa.unparse([...prefix, ...body], { delimiter, newline });
  const output = `${hasBom && encoding === 'utf-8' ? '\ufeff' : ''}${serialized}${trailingNewline ? newline : ''}`;
  return { blob: csvBlob(output, encoding), extension: 'csv' };
}

function serializableClone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

async function buildXlsxFile(
  baseFile: File,
  base: ParsedSource,
  plan: ReturnType<typeof buildResolvedExportPlan>,
): Promise<ReconciledFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await baseFile.arrayBuffer()) as unknown as ExcelJS.Buffer);
  const sheetName = base.meta.selectedSheet;
  const worksheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!worksheet) throw new Error('The selected worksheet is no longer available in the base file.');

  const originalByNumber = new Map(base.rows.map((row) => [row.rowNumber, row]));
  const templateRowNumber = base.rows[0]?.rowNumber ?? base.settings.headerRow + 1;
  const templateRow = worksheet.getRow(templateRowNumber);
  const templateHeight = templateRow.height;
  const templateStyles = base.columns.map((column) =>
    serializableClone(worksheet.getCell(templateRowNumber, column.index + 1).style),
  );
  const templateValidations = base.columns.map((column) =>
    serializableClone(worksheet.getCell(templateRowNumber, column.index + 1).dataValidation),
  );

  for (const outputRow of plan.updatedRows) {
    const original = originalByNumber.get(outputRow.originRowNumber);
    for (const column of base.columns) {
      const nextValue = outputRow.values[column.id] ?? null;
      const previousValue = original?.values[column.id] ?? null;
      if (!Object.is(nextValue, previousValue)) {
        worksheet.getCell(outputRow.originRowNumber, column.index + 1).value = nextValue;
      }
    }
  }

  const deletedDescending = [...plan.deletedRowNumbers].sort((left, right) => right - left);
  for (const rowNumber of deletedDescending) worksheet.spliceRows(rowNumber, 1);

  if (plan.addedRows.length > 0) {
    const lastOriginalDataRow = Math.max(base.settings.headerRow, ...base.rows.map((row) => row.rowNumber));
    const deletedBeforeBoundary = plan.deletedRowNumbers.filter(
      (rowNumber) => rowNumber <= lastOriginalDataRow,
    ).length;
    const insertionRow = lastOriginalDataRow + 1 - deletedBeforeBoundary;
    const insertedValues = plan.addedRows.map((row) =>
      base.columns.map((column) => row.values[column.id] ?? null),
    );
    worksheet.spliceRows(insertionRow, 0, ...insertedValues);

    plan.addedRows.forEach((_, rowOffset) => {
      const row = worksheet.getRow(insertionRow + rowOffset);
      if (templateHeight !== undefined) row.height = templateHeight;
      base.columns.forEach((column, columnOffset) => {
        const cell = row.getCell(column.index + 1);
        const style = templateStyles[columnOffset];
        const validation = templateValidations[columnOffset];
        if (style) cell.style = serializableClone(style);
        if (validation) cell.dataValidation = serializableClone(validation);
      });
    });
  }

  workbook.modified = new Date();
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as unknown as ArrayBuffer);
  return { blob: new Blob([bytes], { type: XLSX_MIME }), extension: 'xlsx' };
}

export async function buildReconciledFile(
  baseFile: File,
  left: ParsedSource,
  right: ParsedSource,
  mappings: ColumnMapping[],
  result: ReconciliationResult,
  baseSide: SourceSide,
  decisions: ResolutionDecisions,
): Promise<ReconciledFile> {
  const plan = buildResolvedExportPlan(left, right, mappings, result, baseSide, decisions);
  if (plan.base.meta.kind === 'csv') return buildCsvFile(baseFile, plan.base, plan.rows);
  return buildXlsxFile(baseFile, plan.base, plan);
}
