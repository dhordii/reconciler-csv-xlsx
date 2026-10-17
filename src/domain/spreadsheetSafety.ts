import type { CellValue } from './types';

const FORMULA_PREFIX = /^[\s\uFEFF]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/u;

export type CsvFormulaMode = 'original' | 'safe';

export function isFormulaLikeValue(value: CellValue): value is string {
  return typeof value === 'string' && FORMULA_PREFIX.test(value);
}

export function makeSpreadsheetSafe(value: CellValue): CellValue {
  return isFormulaLikeValue(value) ? `'${value}` : value;
}

export function countFormulaLikeValues(values: Iterable<CellValue>): number {
  let count = 0;
  for (const value of values) {
    if (isFormulaLikeValue(value)) count += 1;
  }
  return count;
}
