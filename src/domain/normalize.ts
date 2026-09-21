import type { CellValue, ComparisonRule, KeyRule } from './types';

export function isBlank(value: CellValue): boolean {
  return value === null || value === '';
}

function normalizeText(value: CellValue, rule: KeyRule): string {
  let text = String(value);
  if (rule.trim) text = text.trim();
  if (rule.collapseWhitespace) text = text.replace(/\s+/gu, ' ');
  if (rule.caseInsensitive) text = text.toLocaleLowerCase('en-US');
  return text;
}

export function normalizeKeyPart(value: CellValue, rule: KeyRule): string {
  if (value === null) return 'null:';
  if (typeof value === 'number') return `number:${Object.is(value, -0) ? 0 : value}`;
  if (typeof value === 'boolean') return `boolean:${value ? '1' : '0'}`;
  return `string:${normalizeText(value, rule)}`;
}

export function serializeCompositeKey(parts: Array<{ rule: KeyRule; value: CellValue }>): string {
  return JSON.stringify(parts.map(({ rule, value }) => normalizeKeyPart(value, rule)));
}

function parseNumber(value: CellValue, format: 'plain' | 'standard' | 'european'): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  let normalized = trimmed.replace(/\s|\u00a0/gu, '');
  if (format === 'standard') normalized = normalized.replace(/,/gu, '');
  if (format === 'european') normalized = normalized.replace(/\./gu, '').replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: CellValue, format: 'iso' | 'mdy' | 'dmy'): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  if (format === 'iso') {
    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/u.exec(trimmed);
    if (!isoMatch) return null;
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? timestamp
      : null;
  }

  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/u.exec(trimmed);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  const month = format === 'mdy' ? first : second;
  const day = format === 'mdy' ? second : first;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? timestamp
    : null;
}

function parseBoolean(value: CellValue): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  return null;
}

export function compareValues(left: CellValue, right: CellValue, rule: ComparisonRule): boolean {
  if (isBlank(left) || isBlank(right)) return isBlank(left) && isBlank(right);

  if (rule.kind === 'text') {
    return normalizeText(left, rule) === normalizeText(right, rule);
  }

  if (rule.kind === 'number') {
    const leftNumber = parseNumber(left, rule.format);
    const rightNumber = parseNumber(right, rule.format);
    if (leftNumber === null || rightNumber === null) return false;
    if (Object.is(leftNumber, rightNumber) || leftNumber === rightNumber) return true;

    const difference = Math.abs(leftNumber - rightNumber);
    const absolutePass = rule.absoluteTolerance > 0 && difference <= rule.absoluteTolerance;
    const relativeBase = Math.max(Math.abs(leftNumber), Math.abs(rightNumber));
    const relativeDifference = relativeBase === 0 ? 0 : (difference / relativeBase) * 100;
    const relativePass =
      rule.relativeTolerancePercent > 0 && relativeDifference <= rule.relativeTolerancePercent;
    return absolutePass || relativePass;
  }

  if (rule.kind === 'date') {
    const leftDate = parseDate(left, rule.format);
    const rightDate = parseDate(right, rule.format);
    return leftDate !== null && rightDate !== null && leftDate === rightDate;
  }

  const leftBoolean = parseBoolean(left);
  const rightBoolean = parseBoolean(right);
  return leftBoolean !== null && rightBoolean !== null && leftBoolean === rightBoolean;
}
