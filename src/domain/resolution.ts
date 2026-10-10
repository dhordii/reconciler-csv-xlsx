import type {
  CellValue,
  DifferenceCell,
  DuplicateGroup,
  MissingKeyRecord,
  PairedRecord,
  ParsedSource,
  ReconciliationResult,
  SourceRow,
  SourceSide,
  ColumnMapping,
} from './types';

export type CellResolutionChoice = 'a' | 'b' | 'custom';
export type PresenceResolutionChoice = 'include' | 'exclude';
export type DuplicateResolutionChoice = SourceSide | 'exclude';

export type ResolutionDecision =
  | { choice: CellResolutionChoice; customValue?: string; kind: 'cell' }
  | { choice: PresenceResolutionChoice; kind: 'presence' }
  | { choice: DuplicateResolutionChoice; kind: 'duplicate' };

export type ResolutionDecisions = Record<string, ResolutionDecision | undefined>;

export type ResolutionIssue =
  | {
      difference: DifferenceCell;
      id: string;
      record: PairedRecord;
      type: 'cell';
    }
  | {
      category: 'onlyA' | 'onlyB';
      id: string;
      row: SourceRow;
      side: SourceSide;
      type: 'presence';
    }
  | {
      group: DuplicateGroup;
      id: string;
      type: 'duplicate';
    }
  | {
      id: string;
      record: MissingKeyRecord;
      type: 'missingKey';
    };

export interface ResolutionProgress {
  complete: boolean;
  resolved: number;
  total: number;
}

export interface ResolvedOutputRow {
  originRowNumber: number;
  originSide: SourceSide;
  values: Record<string, CellValue>;
}

export interface ResolvedExportPlan {
  addedRows: ResolvedOutputRow[];
  base: ParsedSource;
  baseSide: SourceSide;
  deletedRowNumbers: number[];
  rows: ResolvedOutputRow[];
  updatedRows: ResolvedOutputRow[];
}

function issueToken(type: string, ...parts: Array<number | string>): string {
  return `${type}:${JSON.stringify(parts)}`;
}

export function cellIssueId(record: PairedRecord, difference: DifferenceCell): string {
  return issueToken('cell', record.key, difference.leftColumnId, difference.rightColumnId);
}

export function presenceIssueId(side: SourceSide, row: SourceRow): string {
  return issueToken('presence', side, row.rowNumber);
}

export function duplicateIssueId(group: DuplicateGroup): string {
  return issueToken('duplicate', group.key);
}

export function missingKeyIssueId(record: MissingKeyRecord): string {
  return issueToken('missing', record.side, record.row.rowNumber);
}

export function getResolutionIssues(result: ReconciliationResult): ResolutionIssue[] {
  const issues: ResolutionIssue[] = [];
  for (const record of result.differences) {
    for (const difference of record.differences) {
      issues.push({
        difference,
        id: cellIssueId(record, difference),
        record,
        type: 'cell',
      });
    }
  }
  for (const row of result.onlyA) {
    issues.push({ category: 'onlyA', id: presenceIssueId('a', row), row, side: 'a', type: 'presence' });
  }
  for (const row of result.onlyB) {
    issues.push({ category: 'onlyB', id: presenceIssueId('b', row), row, side: 'b', type: 'presence' });
  }
  for (const group of result.duplicates) {
    issues.push({ group, id: duplicateIssueId(group), type: 'duplicate' });
  }
  for (const record of result.missingKeys) {
    issues.push({ id: missingKeyIssueId(record), record, type: 'missingKey' });
  }
  return issues;
}

export function isIssueResolved(issue: ResolutionIssue, decision: ResolutionDecision | undefined): boolean {
  if (!decision) return false;
  if (issue.type === 'cell') {
    return (
      decision.kind === 'cell' &&
      (decision.choice === 'a' ||
        decision.choice === 'b' ||
        (decision.choice === 'custom' && typeof decision.customValue === 'string'))
    );
  }
  if (issue.type === 'duplicate') {
    return (
      decision.kind === 'duplicate' &&
      (decision.choice === 'exclude' ||
        (decision.choice === 'a' && issue.group.leftRows.length > 0) ||
        (decision.choice === 'b' && issue.group.rightRows.length > 0))
    );
  }
  return decision.kind === 'presence' && (decision.choice === 'include' || decision.choice === 'exclude');
}

export function resolutionProgress(
  result: ReconciliationResult,
  decisions: ResolutionDecisions,
): ResolutionProgress {
  const issues = getResolutionIssues(result);
  const resolved = issues.filter((issue) => isIssueResolved(issue, decisions[issue.id])).length;
  return { complete: resolved === issues.length, resolved, total: issues.length };
}

function coerceCustomValue(value: string, difference: DifferenceCell): CellValue {
  if (value === '') return null;
  if (typeof difference.leftValue === 'number' || typeof difference.rightValue === 'number') {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  if (typeof difference.leftValue === 'boolean' || typeof difference.rightValue === 'boolean') {
    if (/^(?:true|yes|1)$/iu.test(value.trim())) return true;
    if (/^(?:false|no|0)$/iu.test(value.trim())) return false;
  }
  return value;
}

function selectedCellValue(difference: DifferenceCell, decision: ResolutionDecision): CellValue {
  if (decision.kind !== 'cell') throw new Error('A cell difference requires a cell decision.');
  if (decision.choice === 'a') return difference.leftValue;
  if (decision.choice === 'b') return difference.rightValue;
  return coerceCustomValue(decision.customValue ?? '', difference);
}

function valuesForBaseRow(row: SourceRow): Record<string, CellValue> {
  return { ...row.values };
}

function mapRowToBase(
  row: SourceRow,
  sourceSide: SourceSide,
  baseSide: SourceSide,
  base: ParsedSource,
  mappings: ColumnMapping[],
): Record<string, CellValue> {
  if (sourceSide === baseSide) return valuesForBaseRow(row);
  const values: Record<string, CellValue> = {};
  for (const column of base.columns) {
    const mapping = mappings.find((candidate) =>
      baseSide === 'a' ? candidate.leftColumnId === column.id : candidate.rightColumnId === column.id,
    );
    const sourceColumnId = mapping
      ? baseSide === 'a'
        ? mapping.rightColumnId
        : mapping.leftColumnId
      : undefined;
    values[column.id] = sourceColumnId ? (row.values[sourceColumnId] ?? null) : null;
  }
  return values;
}

function unresolvedIssues(result: ReconciliationResult, decisions: ResolutionDecisions): ResolutionIssue[] {
  return getResolutionIssues(result).filter((issue) => !isIssueResolved(issue, decisions[issue.id]));
}

export function buildResolvedRows(
  left: ParsedSource,
  right: ParsedSource,
  mappings: ColumnMapping[],
  result: ReconciliationResult,
  baseSide: SourceSide,
  decisions: ResolutionDecisions,
  options: { allowUnresolved?: boolean } = {},
): ResolvedOutputRow[] {
  const unresolved = unresolvedIssues(result, decisions);
  if (!options.allowUnresolved && unresolved.length > 0) {
    throw new Error(
      `${unresolved.length} reconciliation decision${unresolved.length === 1 ? '' : 's'} remain.`,
    );
  }

  const base = baseSide === 'a' ? left : right;
  const retained = new Map<number, ResolvedOutputRow>(
    base.rows.map((row) => [
      row.rowNumber,
      { originRowNumber: row.rowNumber, originSide: baseSide, values: valuesForBaseRow(row) },
    ]),
  );
  const added: ResolvedOutputRow[] = [];

  for (const record of result.differences) {
    const baseRecord = baseSide === 'a' ? record.left : record.right;
    const output = retained.get(baseRecord.rowNumber);
    if (!output) continue;
    for (const difference of record.differences) {
      const decision = decisions[cellIssueId(record, difference)];
      if (!decision || decision.kind !== 'cell') continue;
      const baseColumnId = baseSide === 'a' ? difference.leftColumnId : difference.rightColumnId;
      output.values[baseColumnId] = selectedCellValue(difference, decision);
    }
  }

  const applyPresence = (rows: SourceRow[], side: SourceSide) => {
    for (const row of rows) {
      const decision = decisions[presenceIssueId(side, row)];
      if (side === baseSide) {
        if (decision?.kind === 'presence' && decision.choice === 'exclude') retained.delete(row.rowNumber);
      } else if (decision?.kind === 'presence' && decision.choice === 'include') {
        added.push({
          originRowNumber: row.rowNumber,
          originSide: side,
          values: mapRowToBase(row, side, baseSide, base, mappings),
        });
      }
    }
  };
  applyPresence(result.onlyA, 'a');
  applyPresence(result.onlyB, 'b');

  for (const group of result.duplicates) {
    const decision = decisions[duplicateIssueId(group)];
    if (!decision || decision.kind !== 'duplicate') continue;
    const baseRows = baseSide === 'a' ? group.leftRows : group.rightRows;
    if (decision.choice === baseSide) continue;
    for (const row of baseRows) retained.delete(row.rowNumber);
    if (decision.choice === 'exclude') continue;
    const selectedRows = decision.choice === 'a' ? group.leftRows : group.rightRows;
    for (const row of selectedRows) {
      added.push({
        originRowNumber: row.rowNumber,
        originSide: decision.choice,
        values: mapRowToBase(row, decision.choice, baseSide, base, mappings),
      });
    }
  }

  for (const record of result.missingKeys) {
    const decision = decisions[missingKeyIssueId(record)];
    if (record.side === baseSide) {
      if (decision?.kind === 'presence' && decision.choice === 'exclude') {
        retained.delete(record.row.rowNumber);
      }
    } else if (decision?.kind === 'presence' && decision.choice === 'include') {
      added.push({
        originRowNumber: record.row.rowNumber,
        originSide: record.side,
        values: mapRowToBase(record.row, record.side, baseSide, base, mappings),
      });
    }
  }

  const orderedBaseRows = base.rows
    .map((row) => retained.get(row.rowNumber))
    .filter((row): row is ResolvedOutputRow => Boolean(row));
  return [...orderedBaseRows, ...added];
}

export function buildResolvedExportPlan(
  left: ParsedSource,
  right: ParsedSource,
  mappings: ColumnMapping[],
  result: ReconciliationResult,
  baseSide: SourceSide,
  decisions: ResolutionDecisions,
): ResolvedExportPlan {
  const base = baseSide === 'a' ? left : right;
  const rows = buildResolvedRows(left, right, mappings, result, baseSide, decisions);
  const retainedBaseNumbers = new Set(
    rows.filter((row) => row.originSide === baseSide).map((row) => row.originRowNumber),
  );
  const originalByNumber = new Map(base.rows.map((row) => [row.rowNumber, row]));
  const updatedRows = rows.filter((row) => {
    if (row.originSide !== baseSide) return false;
    const original = originalByNumber.get(row.originRowNumber);
    return base.columns.some(
      (column) => !Object.is(row.values[column.id] ?? null, original?.values[column.id] ?? null),
    );
  });

  return {
    addedRows: rows.filter((row) => row.originSide !== baseSide),
    base,
    baseSide,
    deletedRowNumbers: base.rows
      .filter((row) => !retainedBaseNumbers.has(row.rowNumber))
      .map((row) => row.rowNumber),
    rows,
    updatedRows,
  };
}
