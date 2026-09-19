import ExcelJS from 'exceljs';

import type {
  CellValue,
  ColumnMapping,
  ParsedSource,
  ReconciliationConfig,
  ReconciliationResult,
  SourceRow,
} from '../domain/types';

export interface ReportOptions {
  includeMatches: boolean;
}

const HEADER_FILL = 'E8EEFF';
const HEADER_TEXT = '172033';
const DIFFERENCE_FILL = 'FFF1E8';
const WARNING_FILL = 'FFF7D6';

function displayValue(value: CellValue): string | number | boolean {
  return value ?? '';
}

function styleSheet(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: HEADER_TEXT } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle' };
  header.height = 24;
  sheet.autoFilter = { from: { column: 1, row: 1 }, to: { column: Math.max(sheet.columnCount, 1), row: 1 } };
  for (const column of sheet.columns) {
    let width = 12;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      width = Math.max(width, Math.min(String(cell.value ?? '').length + 2, 42));
    });
    column.width = width;
  }
}

function keyText(keyParts: CellValue[]): string {
  return keyParts.map((part) => String(part ?? '')).join(' · ');
}

function rowValues(source: ParsedSource, row: SourceRow): Array<string | number | boolean> {
  return source.columns.map((column) => displayValue(row.values[column.id] ?? null));
}

function describeMapping(mapping: ColumnMapping): string {
  if (mapping.key) {
    const options = [
      mapping.keyRule.trim ? 'trim' : '',
      mapping.keyRule.collapseWhitespace ? 'collapse spaces' : '',
      mapping.keyRule.caseInsensitive ? 'ignore case' : '',
    ].filter(Boolean);
    return options.length > 0 ? `Key · ${options.join(', ')}` : 'Key · exact';
  }
  if (!mapping.compare) return 'Not compared';
  if (mapping.rule.kind === 'number') {
    return `Number · ${mapping.rule.format} · absolute tolerance ${mapping.rule.absoluteTolerance} · relative tolerance ${mapping.rule.relativeTolerancePercent}%`;
  }
  if (mapping.rule.kind === 'date') return `Date · ${mapping.rule.format}`;
  if (mapping.rule.kind === 'boolean') return 'Boolean';
  const options = [
    mapping.rule.trim ? 'trim' : '',
    mapping.rule.collapseWhitespace ? 'collapse spaces' : '',
    mapping.rule.caseInsensitive ? 'ignore case' : '',
  ].filter(Boolean);
  return options.length > 0 ? `Text · ${options.join(', ')}` : 'Text · exact';
}

function addRunDetails(
  workbook: ExcelJS.Workbook,
  left: ParsedSource,
  right: ParsedSource,
  config: ReconciliationConfig,
  result: ReconciliationResult,
): void {
  const sheet = workbook.addWorksheet('Run details');
  sheet.addRow(['Field', 'File A', 'File B']);
  sheet.addRow(['File', left.meta.fileName, right.meta.fileName]);
  sheet.addRow(['Worksheet', left.meta.selectedSheet ?? 'CSV', right.meta.selectedSheet ?? 'CSV']);
  sheet.addRow(['Header row', left.settings.headerRow, right.settings.headerRow]);
  sheet.addRow(['Rows', left.rows.length, right.rows.length]);
  sheet.addRow(['Completed', result.completedAt, '']);
  sheet.addRow(['Duration (ms)', Math.round(result.durationMs), '']);
  sheet.addRow([]);
  sheet.addRow(['Mapped column A', 'Mapped column B', 'Role / rule']);
  for (const mapping of config.mappings) {
    sheet.addRow([mapping.leftName, mapping.rightName, describeMapping(mapping)]);
  }
  styleSheet(sheet);
}

function addSummary(workbook: ExcelJS.Workbook, result: ReconciliationResult): void {
  const sheet = workbook.addWorksheet('Summary');
  sheet.addRow(['Category', 'Count']);
  sheet.addRows([
    ['Exact matches', result.summary.exactMatches],
    ['Differences', result.summary.differences],
    ['Only in File A', result.summary.onlyA],
    ['Only in File B', result.summary.onlyB],
    ['Duplicate-key rows', result.summary.duplicates],
    ['Missing-key rows', result.summary.missingKeys],
    ['Total rows in File A', result.summary.totalRowsA],
    ['Total rows in File B', result.summary.totalRowsB],
  ]);
  if (result.warnings.length > 0) {
    sheet.addRow([]);
    sheet.addRow(['Warnings', '']);
    for (const warning of result.warnings) sheet.addRow([warning, '']);
  }
  styleSheet(sheet);
}

function addPairedSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  records: ReconciliationResult['differences'],
  mappings: ColumnMapping[],
  left: ParsedSource,
  right: ParsedSource,
): void {
  const sheet = workbook.addWorksheet(name);
  const compared = mappings.filter((mapping) => mapping.compare && !mapping.key);
  sheet.addRow([
    'Key',
    'File A source',
    'File A worksheet',
    'File A row',
    'File B source',
    'File B worksheet',
    'File B row',
    ...compared.flatMap((mapping) => [`${mapping.leftName} · A`, `${mapping.rightName} · B`]),
  ]);

  for (const record of records) {
    const changedIds = new Set(
      record.differences.flatMap((difference) => [difference.leftColumnId, difference.rightColumnId]),
    );
    const row = sheet.addRow([
      keyText(record.keyParts),
      left.meta.fileName,
      left.meta.selectedSheet ?? 'CSV',
      record.left.rowNumber,
      right.meta.fileName,
      right.meta.selectedSheet ?? 'CSV',
      record.right.rowNumber,
      ...compared.flatMap((mapping) => [
        displayValue(record.left.values[mapping.leftColumnId] ?? null),
        displayValue(record.right.values[mapping.rightColumnId] ?? null),
      ]),
    ]);
    compared.forEach((mapping, index) => {
      if (!changedIds.has(mapping.leftColumnId)) return;
      const leftCell = row.getCell(8 + index * 2);
      const rightCell = row.getCell(9 + index * 2);
      const fill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DIFFERENCE_FILL } };
      leftCell.fill = fill;
      rightCell.fill = fill;
    });
  }
  styleSheet(sheet);
}

function addOnlySheet(
  workbook: ExcelJS.Workbook,
  name: string,
  source: ParsedSource,
  rows: SourceRow[],
): void {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(['Source file', 'Worksheet', 'Source row', ...source.columns.map((column) => column.name)]);
  for (const row of rows) {
    sheet.addRow([
      source.meta.fileName,
      source.meta.selectedSheet ?? 'CSV',
      row.rowNumber,
      ...rowValues(source, row),
    ]);
  }
  styleSheet(sheet);
}

export function createReconciliationWorkbook(
  left: ParsedSource,
  right: ParsedSource,
  config: ReconciliationConfig,
  result: ReconciliationResult,
  options: ReportOptions,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Reconciler';
  workbook.created = new Date(result.completedAt);
  workbook.modified = new Date(result.completedAt);
  workbook.calcProperties.fullCalcOnLoad = false;

  addSummary(workbook, result);
  addRunDetails(workbook, left, right, config, result);
  addPairedSheet(workbook, 'Differences', result.differences, config.mappings, left, right);
  addOnlySheet(workbook, 'Only A', left, result.onlyA);
  addOnlySheet(workbook, 'Only B', right, result.onlyB);

  const duplicates = workbook.addWorksheet('Duplicates');
  duplicates.addRow(['Key', 'Side', 'Source file', 'Worksheet', 'Source row', 'Values']);
  for (const group of result.duplicates) {
    for (const [side, source, rows] of [
      ['A', left, group.leftRows],
      ['B', right, group.rightRows],
    ] as const) {
      for (const row of rows) {
        duplicates.addRow([
          keyText(group.keyParts),
          side,
          source.meta.fileName,
          source.meta.selectedSheet ?? 'CSV',
          row.rowNumber,
          JSON.stringify(row.values),
        ]);
      }
    }
  }
  styleSheet(duplicates);

  const missing = workbook.addWorksheet('Missing key');
  missing.addRow(['Side', 'Source file', 'Worksheet', 'Source row', 'Missing key columns', 'Values']);
  for (const item of result.missingKeys) {
    const source = item.side === 'a' ? left : right;
    const row = missing.addRow([
      item.side.toUpperCase(),
      source.meta.fileName,
      source.meta.selectedSheet ?? 'CSV',
      item.row.rowNumber,
      item.missingColumns.join(', '),
      JSON.stringify(item.row.values),
    ]);
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNING_FILL } };
  }
  styleSheet(missing);

  if (options.includeMatches)
    addPairedSheet(workbook, 'Matches', result.exactMatches, config.mappings, left, right);
  return workbook;
}

export async function buildReconciliationReport(
  left: ParsedSource,
  right: ParsedSource,
  config: ReconciliationConfig,
  result: ReconciliationResult,
  options: ReportOptions,
): Promise<Blob> {
  const workbook = createReconciliationWorkbook(left, right, config, result, options);
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as unknown as ArrayBuffer);
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
