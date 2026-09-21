import { describe, expect, it } from 'vitest';

import { compareValues, serializeCompositeKey } from '../src/domain/normalize';

describe('normalization and comparison', () => {
  it('serializes composite keys without delimiter collisions', () => {
    const exact = { caseInsensitive: false, collapseWhitespace: false, trim: false };
    expect(
      serializeCompositeKey([
        { rule: exact, value: 'a|b' },
        { rule: exact, value: 'c' },
      ]),
    ).not.toBe(
      serializeCompositeKey([
        { rule: exact, value: 'a' },
        { rule: exact, value: 'b|c' },
      ]),
    );
  });

  it('keeps blanks distinct from zero and false', () => {
    expect(
      compareValues('', null, {
        caseInsensitive: false,
        collapseWhitespace: false,
        kind: 'text',
        trim: false,
      }),
    ).toBe(true);
    expect(
      compareValues('', 0, {
        absoluteTolerance: 0,
        format: 'plain',
        kind: 'number',
        relativeTolerancePercent: 0,
      }),
    ).toBe(false);
    expect(compareValues(null, false, { kind: 'boolean' })).toBe(false);
  });

  it('accepts either absolute or relative numeric tolerance', () => {
    const rule = {
      absoluteTolerance: 0.1,
      format: 'plain' as const,
      kind: 'number' as const,
      relativeTolerancePercent: 1,
    };
    expect(compareValues(100, 100.5, rule)).toBe(true);
    expect(compareValues(1, 1.5, rule)).toBe(false);
  });

  it('applies opt-in text normalization only', () => {
    const strict = { caseInsensitive: false, collapseWhitespace: false, kind: 'text' as const, trim: false };
    const relaxed = { caseInsensitive: true, collapseWhitespace: true, kind: 'text' as const, trim: true };
    expect(compareValues('  North  Wind ', 'north wind', strict)).toBe(false);
    expect(compareValues('  North  Wind ', 'north wind', relaxed)).toBe(true);
  });
});
