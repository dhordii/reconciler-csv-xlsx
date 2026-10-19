import { describe, expect, it } from 'vitest';

import {
  countFormulaLikeValues,
  isFormulaLikeValue,
  makeSpreadsheetSafe,
} from '../src/domain/spreadsheetSafety';

describe('spreadsheet formula safety', () => {
  it.each(['=1+1', '+2', '-3', '@SUM(A1)', '\t@SUM(A1)', '\r-2', '  +3', '\u00a0＝cmd', '\ufeff＋1'])(
    'detects formula-like text %j',
    (value) => {
      expect(isFormulaLikeValue(value)).toBe(true);
      expect(makeSpreadsheetSafe(value)).toBe(`'${value}`);
    },
  );

  it.each(['', 'plain text', '1-2', "'=1+1", 42, true, null])('leaves safe value %j unchanged', (value) => {
    expect(isFormulaLikeValue(value)).toBe(false);
    expect(makeSpreadsheetSafe(value)).toBe(value);
  });

  it('counts only formula-like text values', () => {
    expect(countFormulaLikeValues(['=1', 'safe', '\t@cmd', 10, null])).toBe(2);
  });
});
