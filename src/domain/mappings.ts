import type { ColumnMapping, ComparisonKind, ComparisonRule, ParsedSource, SourceColumn } from './types';

export function defaultRule(kind: ComparisonKind): ComparisonRule {
  if (kind === 'number') {
    return {
      absoluteTolerance: 0,
      format: 'standard',
      kind,
      relativeTolerancePercent: 0,
    };
  }
  if (kind === 'date') return { format: 'iso', kind };
  if (kind === 'boolean') return { kind };
  return { caseInsensitive: false, collapseWhitespace: false, kind: 'text', trim: false };
}

function sharedType(left: SourceColumn, right: SourceColumn): ComparisonKind {
  return left.suggestedType === right.suggestedType ? left.suggestedType : 'text';
}

export function createMapping(left: SourceColumn, right: SourceColumn): ColumnMapping {
  return {
    compare: true,
    id: crypto.randomUUID(),
    key: false,
    keyRule: { caseInsensitive: false, collapseWhitespace: false, trim: false },
    leftColumnId: left.id,
    leftName: left.name,
    rightColumnId: right.id,
    rightName: right.name,
    rule: defaultRule(sharedType(left, right)),
  };
}

export function autoMapColumns(left: ParsedSource, right: ParsedSource): ColumnMapping[] {
  const rightByName = new Map(
    right.columns.map((column) => [column.name.trim().toLocaleLowerCase('en-US'), column]),
  );
  const mappings = left.columns.flatMap((leftColumn) => {
    const rightColumn = rightByName.get(leftColumn.name.trim().toLocaleLowerCase('en-US'));
    return rightColumn ? [createMapping(leftColumn, rightColumn)] : [];
  });

  const preferred = mappings.find((mapping) =>
    /^(?:id|identifier|key|account(?:\s+id)?|invoice(?:\s+(?:id|number|no))?|reference)$/iu.test(
      mapping.leftName.trim(),
    ),
  );
  const first = preferred ?? mappings[0];
  if (first) first.key = true;
  return mappings;
}

export function updateMappingColumns(
  mapping: ColumnMapping,
  leftColumn: SourceColumn,
  rightColumn: SourceColumn,
): ColumnMapping {
  return {
    ...mapping,
    leftColumnId: leftColumn.id,
    leftName: leftColumn.name,
    rightColumnId: rightColumn.id,
    rightName: rightColumn.name,
    rule: defaultRule(sharedType(leftColumn, rightColumn)),
  };
}
