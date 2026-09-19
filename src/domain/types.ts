export type CellValue = string | number | boolean | null;
export type SourceSide = 'a' | 'b';
export type FileKind = 'csv' | 'xlsx';
export type CsvEncoding = 'utf-8' | 'windows-1251';
export type CsvDelimiter = ',' | ';' | '\t' | '|';

export interface SourceColumn {
  id: string;
  index: number;
  name: string;
  sampleValues: CellValue[];
  suggestedType: ComparisonKind;
  ambiguity?: 'date' | 'number';
}

export interface SourceRow {
  rowNumber: number;
  values: Record<string, CellValue>;
}

export interface ParseSettings {
  csvDelimiter?: CsvDelimiter;
  csvEncoding?: CsvEncoding;
  headerRow: number;
  sheetName?: string;
}

export interface SourceMeta {
  fileName: string;
  fileSize: number;
  kind: FileKind;
  sheetNames: string[];
  selectedSheet?: string;
  detectedDelimiter?: CsvDelimiter;
  detectedEncoding?: CsvEncoding;
  formulaWarningCount: number;
}

export interface ParsedSource {
  columns: SourceColumn[];
  meta: SourceMeta;
  rows: SourceRow[];
  settings: ParseSettings;
  warnings: string[];
}

export type ComparisonKind = 'text' | 'number' | 'date' | 'boolean';

export interface TextComparisonRule {
  caseInsensitive: boolean;
  collapseWhitespace: boolean;
  kind: 'text';
  trim: boolean;
}

export interface NumberComparisonRule {
  absoluteTolerance: number;
  format: 'plain' | 'standard' | 'european';
  kind: 'number';
  relativeTolerancePercent: number;
}

export interface DateComparisonRule {
  format: 'iso' | 'mdy' | 'dmy';
  kind: 'date';
}

export interface BooleanComparisonRule {
  kind: 'boolean';
}

export type ComparisonRule =
  TextComparisonRule | NumberComparisonRule | DateComparisonRule | BooleanComparisonRule;

export interface KeyRule {
  caseInsensitive: boolean;
  collapseWhitespace: boolean;
  trim: boolean;
}

export interface ColumnMapping {
  compare: boolean;
  id: string;
  key: boolean;
  keyRule: KeyRule;
  leftColumnId: string;
  leftName: string;
  rightColumnId: string;
  rightName: string;
  rule: ComparisonRule;
}

export interface ReconciliationConfig {
  mappings: ColumnMapping[];
}

export interface DifferenceCell {
  label: string;
  leftColumnId: string;
  leftValue: CellValue;
  rightColumnId: string;
  rightValue: CellValue;
}

export interface PairedRecord {
  differences: DifferenceCell[];
  key: string;
  keyParts: CellValue[];
  left: SourceRow;
  right: SourceRow;
}

export interface DuplicateGroup {
  key: string;
  keyParts: CellValue[];
  leftRows: SourceRow[];
  rightRows: SourceRow[];
}

export interface MissingKeyRecord {
  missingColumns: string[];
  row: SourceRow;
  side: SourceSide;
}

export interface ReconciliationSummary {
  differences: number;
  duplicates: number;
  exactMatches: number;
  missingKeys: number;
  onlyA: number;
  onlyB: number;
  totalRowsA: number;
  totalRowsB: number;
}

export interface ReconciliationResult {
  completedAt: string;
  differences: PairedRecord[];
  duplicates: DuplicateGroup[];
  durationMs: number;
  exactMatches: PairedRecord[];
  missingKeys: MissingKeyRecord[];
  onlyA: SourceRow[];
  onlyB: SourceRow[];
  summary: ReconciliationSummary;
  warnings: string[];
}

export interface ReconciliationProgress {
  message: string;
  percent: number;
}

export interface SavedMapping {
  compare: boolean;
  key: boolean;
  keyRule: KeyRule;
  leftName: string;
  rightName: string;
  rule: ComparisonRule;
}

export interface SavedProfile {
  createdAt: string;
  id: string;
  mappings: SavedMapping[];
  name: string;
  updatedAt: string;
  version: 1;
}
