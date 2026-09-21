import ExcelJS from 'exceljs';
import Papa from 'papaparse';

import type {
  CellValue,
  ComparisonKind,
  CsvDelimiter,
  CsvEncoding,
  ParseSettings,
  ParsedSource,
  SourceColumn,
} from '../domain/types';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_ROWS = 100_000;
const MAX_CELLS = 2_000_000;
const DELIMITERS: CsvDelimiter[] = [',', ';', '\t', '|'];

interface MatrixResult {
  formulaWarningCount: number;
  matrix: CellValue[][];
  sheetNames: string[];
  warnings: string[];
}

function assertFileSize(file: File): void {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the 50 MB file limit.`);
}

function assertLimits(file: File, rows: number, columns: number): void {
  assertFileSize(file);
  if (rows > MAX_ROWS) throw new Error(`${file.name} exceeds the 100,000-row limit.`);
  if (rows * columns > MAX_CELLS) throw new Error(`${file.name} exceeds the 2 million-cell limit.`);
}

function decodeCsv(buffer: ArrayBuffer, requested?: CsvEncoding): { encoding: CsvEncoding; text: string } {
  if (requested) return { encoding: requested, text: new TextDecoder(requested).decode(buffer) };
  try {
    return { encoding: 'utf-8', text: new TextDecoder('utf-8', { fatal: true }).decode(buffer) };
  } catch {
    return { encoding: 'windows-1251', text: new TextDecoder('windows-1251').decode(buffer) };
  }
}

function countDelimiter(line: string, delimiter: CsvDelimiter): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (character === '"') {
      if (quoted && line.charAt(index + 1) === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) count += 1;
  }
  return count;
}

function detectDelimiter(text: string): CsvDelimiter {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 20);

  const ranked = DELIMITERS.map((delimiter) => {
    const counts = lines.map((line) => countDelimiter(line, delimiter)).filter((count) => count > 0);
    const frequency = new Map<number, number>();
    for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1);
    const consistency = Math.max(0, ...frequency.values());
    const typicalColumns = Math.max(0, ...counts) + 1;
    return { consistency, delimiter, typicalColumns };
  }).sort(
    (left, right) => right.consistency - left.consistency || right.typicalColumns - left.typicalColumns,
  );

  return ranked[0]?.delimiter ?? ',';
}

function autoDetectHeaderRow(matrix: CellValue[][]): number {
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  const searchRows = matrix.slice(0, 20);

  searchRows.forEach((row, index) => {
    const nonBlank = row.filter((value) => value !== null && String(value).trim() !== '');
    const unique = new Set(nonBlank.map((value) => String(value).trim().toLocaleLowerCase('en-US'))).size;
    const strings = nonBlank.filter((value) => typeof value === 'string').length;
    const nextWidth =
      matrix[index + 1]?.filter((value) => value !== null && String(value).trim() !== '').length ?? 0;
    const score = nonBlank.length * 3 + unique * 2 + strings + Math.min(nonBlank.length, nextWidth) - index;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestIndex + 1;
}

function cellValueFromExcel(cell: ExcelJS.Cell, warningCounter: { value: number }): CellValue {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return cell.text || value.toISOString();

  if ('formula' in value || 'sharedFormula' in value) {
    const result = value.result;
    if (result === undefined || result === null) {
      warningCounter.value += 1;
      return null;
    }
    if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean')
      return result;
    if (result instanceof Date) return result.toISOString();
    if ('error' in result) return result.error;
    return String(result);
  }

  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('text' in value) return value.text;
  if ('error' in value) return value.error;
  return cell.text || String(value);
}

async function readCsv(
  file: File,
  settings: ParseSettings,
): Promise<MatrixResult & { delimiter: CsvDelimiter; encoding: CsvEncoding }> {
  const decoded = decodeCsv(await file.arrayBuffer(), settings.csvEncoding);
  const delimiter = settings.csvDelimiter ?? detectDelimiter(decoded.text);
  const parsed = Papa.parse<string[]>(decoded.text, {
    delimiter,
    skipEmptyLines: false,
  });
  const warnings = parsed.errors.slice(0, 10).map((error) => `CSV row ${error.row ?? '?'}: ${error.message}`);
  const matrix = parsed.data.map((row) => row.map((value) => value ?? null));
  assertLimits(file, matrix.length, Math.max(0, ...matrix.map((row) => row.length)));
  return { delimiter, encoding: decoded.encoding, formulaWarningCount: 0, matrix, sheetNames: [], warnings };
}

async function readXlsx(
  file: File,
  settings: ParseSettings,
): Promise<MatrixResult & { selectedSheet: string }> {
  const workbook = new ExcelJS.Workbook();
  const data = await file.arrayBuffer();
  // ExcelJS accepts ArrayBuffer in its browser build, while its declaration still names Node Buffer.
  await workbook.xlsx.load(data as unknown as ExcelJS.Buffer);
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  const selectedSheet = settings.sheetName ?? sheetNames[0];
  if (!selectedSheet) throw new Error(`${file.name} does not contain any worksheets.`);
  const worksheet = workbook.getWorksheet(selectedSheet);
  if (!worksheet) throw new Error(`Worksheet “${selectedSheet}” was not found in ${file.name}.`);

  const formulaWarningCounter = { value: 0 };
  const matrix: CellValue[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values: CellValue[] = [];
    const width = Math.max(worksheet.actualColumnCount, row.cellCount);
    for (let column = 1; column <= width; column += 1) {
      values.push(cellValueFromExcel(row.getCell(column), formulaWarningCounter));
    }
    matrix.push(values);
  });
  assertLimits(file, matrix.length, Math.max(worksheet.actualColumnCount, worksheet.columnCount));
  const warnings =
    formulaWarningCounter.value > 0
      ? [
          `${formulaWarningCounter.value} formula cell${formulaWarningCounter.value === 1 ? '' : 's'} had no cached result and were read as blank.`,
        ]
      : [];
  return {
    formulaWarningCount: formulaWarningCounter.value,
    matrix,
    selectedSheet,
    sheetNames,
    warnings,
  };
}

function inferType(values: CellValue[]): { ambiguity?: 'date' | 'number'; type: ComparisonKind } {
  const sample = values.filter((value) => value !== null && value !== '').slice(0, 100);
  if (sample.length === 0) return { type: 'text' };
  if (sample.every((value) => typeof value === 'boolean')) return { type: 'boolean' };
  if (sample.every((value) => typeof value === 'number')) return { type: 'number' };

  const strings = sample.map(String);
  const booleanLike = strings.every((value) => /^(?:true|false|yes|no|0|1)$/iu.test(value.trim()));
  if (booleanLike) return { type: 'boolean' };

  const dateLike = strings.filter((value) => /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/u.test(value.trim()));
  if (dateLike.length / strings.length >= 0.8) {
    const ambiguity = dateLike.some((value) => {
      const parts = value.split(/[./-]/u).map(Number);
      return (
        parts.length === 3 &&
        (parts[0] ?? 99) <= 12 &&
        (parts[1] ?? 99) <= 12 &&
        String(parts[2] ?? '').length === 4
      );
    });
    return ambiguity ? { ambiguity: 'date', type: 'date' } : { type: 'date' };
  }

  const numericLike = strings.filter((value) => /^[+-]?[\d\s.,]+$/u.test(value.trim()));
  if (numericLike.length / strings.length >= 0.8) {
    const ambiguity = numericLike.some((value) => value.includes(',') && value.includes('.'));
    return ambiguity ? { ambiguity: 'number', type: 'number' } : { type: 'number' };
  }

  return { type: 'text' };
}

function buildSource(
  file: File,
  kind: 'csv' | 'xlsx',
  matrixResult: MatrixResult,
  settings: ParseSettings,
  extra: {
    delimiter?: CsvDelimiter;
    encoding?: CsvEncoding;
    selectedSheet?: string;
  },
): ParsedSource {
  const headerRow = settings.headerRow > 0 ? settings.headerRow : autoDetectHeaderRow(matrixResult.matrix);
  const headerIndex = headerRow - 1;
  const header = matrixResult.matrix[headerIndex];
  if (!header) throw new Error(`Header row ${headerRow} does not exist in ${file.name}.`);

  const warnings = [...matrixResult.warnings];
  const usedNames = new Map<string, number>();
  const names = header.map((value, index) => {
    const proposed = String(value ?? '').trim() || `Column ${index + 1}`;
    const seen = (usedNames.get(proposed) ?? 0) + 1;
    usedNames.set(proposed, seen);
    if (seen > 1) {
      warnings.push(`Duplicate header “${proposed}” was renamed to “${proposed} (${seen})”.`);
      return `${proposed} (${seen})`;
    }
    return proposed;
  });

  const body = matrixResult.matrix
    .slice(headerIndex + 1)
    .map((row, rowIndex) => ({ row, rowNumber: headerRow + rowIndex + 1 }))
    .filter(({ row }) => row.some((value) => value !== null && value !== ''));
  const rows = body.map(({ row, rowNumber }) => {
    const values: Record<string, CellValue> = {};
    names.forEach((name, columnIndex) => {
      values[`${columnIndex}:${name}`] = row[columnIndex] ?? null;
    });
    return { rowNumber, values };
  });

  const columns: SourceColumn[] = names.map((name, index) => {
    const sampleValues = rows.slice(0, 20).map((row) => row.values[`${index}:${name}`] ?? null);
    const inference = inferType(rows.slice(0, 100).map((row) => row.values[`${index}:${name}`] ?? null));
    return {
      ...(inference.ambiguity ? { ambiguity: inference.ambiguity } : {}),
      id: `${index}:${name}`,
      index,
      name,
      sampleValues,
      suggestedType: inference.type,
    };
  });

  return {
    columns,
    meta: {
      ...(extra.delimiter ? { detectedDelimiter: extra.delimiter } : {}),
      ...(extra.encoding ? { detectedEncoding: extra.encoding } : {}),
      fileName: file.name,
      fileSize: file.size,
      formulaWarningCount: matrixResult.formulaWarningCount,
      kind,
      ...(extra.selectedSheet ? { selectedSheet: extra.selectedSheet } : {}),
      sheetNames: matrixResult.sheetNames,
    },
    rows,
    settings: {
      ...(extra.delimiter ? { csvDelimiter: extra.delimiter } : {}),
      ...(extra.encoding ? { csvEncoding: extra.encoding } : {}),
      headerRow,
      ...(extra.selectedSheet ? { sheetName: extra.selectedSheet } : {}),
    },
    warnings,
  };
}

export async function parseFile(file: File, supplied?: Partial<ParseSettings>): Promise<ParsedSource> {
  assertFileSize(file);
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('en-US');
  const settings: ParseSettings = { headerRow: supplied?.headerRow ?? 0, ...supplied };
  if (extension === 'csv') {
    const result = await readCsv(file, settings);
    return buildSource(file, 'csv', result, settings, {
      delimiter: result.delimiter,
      encoding: result.encoding,
    });
  }
  if (extension === 'xlsx') {
    const result = await readXlsx(file, settings);
    return buildSource(file, 'xlsx', result, settings, { selectedSheet: result.selectedSheet });
  }
  throw new Error(`${file.name} is not a supported CSV or XLSX file.`);
}
