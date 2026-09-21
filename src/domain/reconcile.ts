import { compareValues, isBlank, serializeCompositeKey } from './normalize';
import type {
  ColumnMapping,
  DuplicateGroup,
  MissingKeyRecord,
  ParsedSource,
  ReconciliationConfig,
  ReconciliationProgress,
  ReconciliationResult,
  SourceRow,
  SourceSide,
} from './types';

interface IndexedRow {
  key: string;
  keyParts: Array<string | number | boolean | null>;
  row: SourceRow;
}

interface IndexedSide {
  missing: MissingKeyRecord[];
  rowsByKey: Map<string, IndexedRow[]>;
}

export interface ReconcileOptions {
  isCancelled?: () => boolean;
  onProgress?: (progress: ReconciliationProgress) => void;
  yieldControl?: () => Promise<void>;
}

const DEFAULT_OPTIONS: Required<ReconcileOptions> = {
  isCancelled: () => false,
  onProgress: () => undefined,
  yieldControl: async () => undefined,
};

function keyMappings(config: ReconciliationConfig): ColumnMapping[] {
  return config.mappings.filter((mapping) => mapping.key);
}

function indexSide(source: ParsedSource, side: SourceSide, mappings: ColumnMapping[]): IndexedSide {
  const missing: MissingKeyRecord[] = [];
  const rowsByKey = new Map<string, IndexedRow[]>();

  for (const row of source.rows) {
    const values = mappings.map(
      (mapping) => row.values[side === 'a' ? mapping.leftColumnId : mapping.rightColumnId] ?? null,
    );
    const missingColumns = mappings
      .filter((_, index) => isBlank(values[index] ?? null))
      .map((mapping) => (side === 'a' ? mapping.leftName : mapping.rightName));

    if (missingColumns.length > 0) {
      missing.push({ missingColumns, row, side });
      continue;
    }

    const key = serializeCompositeKey(
      mappings.map((mapping, index) => ({ rule: mapping.keyRule, value: values[index] ?? null })),
    );
    const indexed = { key, keyParts: values, row };
    const existing = rowsByKey.get(key);
    if (existing) existing.push(indexed);
    else rowsByKey.set(key, [indexed]);
  }

  return { missing, rowsByKey };
}

function comparePair(left: IndexedRow, right: IndexedRow, mappings: ColumnMapping[]) {
  const differences = mappings
    .filter((mapping) => mapping.compare && !mapping.key)
    .filter(
      (mapping) =>
        !compareValues(
          left.row.values[mapping.leftColumnId] ?? null,
          right.row.values[mapping.rightColumnId] ?? null,
          mapping.rule,
        ),
    )
    .map((mapping) => ({
      label:
        mapping.leftName === mapping.rightName
          ? mapping.leftName
          : `${mapping.leftName} / ${mapping.rightName}`,
      leftColumnId: mapping.leftColumnId,
      leftValue: left.row.values[mapping.leftColumnId] ?? null,
      rightColumnId: mapping.rightColumnId,
      rightValue: right.row.values[mapping.rightColumnId] ?? null,
    }));

  return {
    differences,
    key: left.key,
    keyParts: left.keyParts,
    left: left.row,
    right: right.row,
  };
}

export async function reconcileSources(
  leftSource: ParsedSource,
  rightSource: ParsedSource,
  config: ReconciliationConfig,
  providedOptions: ReconcileOptions = {},
): Promise<ReconciliationResult> {
  const options = { ...DEFAULT_OPTIONS, ...providedOptions };
  const startedAt = performance.now();
  const keys = keyMappings(config);
  if (keys.length === 0) throw new Error('Choose at least one mapped key column.');

  options.onProgress({ message: 'Indexing File A', percent: 8 });
  const leftIndex = indexSide(leftSource, 'a', keys);
  await options.yieldControl();
  if (options.isCancelled()) throw new DOMException('Reconciliation cancelled.', 'AbortError');

  options.onProgress({ message: 'Indexing File B', percent: 20 });
  const rightIndex = indexSide(rightSource, 'b', keys);
  await options.yieldControl();
  if (options.isCancelled()) throw new DOMException('Reconciliation cancelled.', 'AbortError');

  const duplicateKeys = new Set<string>();
  for (const [key, rows] of leftIndex.rowsByKey) {
    if (rows.length > 1) duplicateKeys.add(key);
  }
  for (const [key, rows] of rightIndex.rowsByKey) {
    if (rows.length > 1) duplicateKeys.add(key);
  }

  const duplicates: DuplicateGroup[] = [...duplicateKeys].sort().map((key) => ({
    key,
    keyParts:
      leftIndex.rowsByKey.get(key)?.[0]?.keyParts ?? rightIndex.rowsByKey.get(key)?.[0]?.keyParts ?? [],
    leftRows: (leftIndex.rowsByKey.get(key) ?? []).map(({ row }) => row),
    rightRows: (rightIndex.rowsByKey.get(key) ?? []).map(({ row }) => row),
  }));

  options.onProgress({ message: 'Comparing unique keys', percent: 36 });
  const exactMatches: ReconciliationResult['exactMatches'] = [];
  const differences: ReconciliationResult['differences'] = [];
  const onlyA: SourceRow[] = [];
  const onlyB: SourceRow[] = [];
  const processedRight = new Set<string>();
  const leftEntries = [...leftIndex.rowsByKey.entries()];

  for (let index = 0; index < leftEntries.length; index += 1) {
    if (index % 1000 === 0) {
      if (options.isCancelled()) throw new DOMException('Reconciliation cancelled.', 'AbortError');
      options.onProgress({
        message: 'Comparing rows',
        percent: 36 + Math.round((index / Math.max(leftEntries.length, 1)) * 54),
      });
      await options.yieldControl();
    }

    const entry = leftEntries[index];
    if (!entry) continue;
    const [key, leftRows] = entry;
    if (duplicateKeys.has(key)) continue;
    const left = leftRows[0];
    if (!left) continue;
    const rightRows = rightIndex.rowsByKey.get(key);
    const right = rightRows?.[0];
    if (!right) {
      onlyA.push(left.row);
      continue;
    }
    processedRight.add(key);
    const pair = comparePair(left, right, config.mappings);
    if (pair.differences.length === 0) exactMatches.push(pair);
    else differences.push(pair);
  }

  for (const [key, rightRows] of rightIndex.rowsByKey) {
    if (duplicateKeys.has(key) || processedRight.has(key)) continue;
    const right = rightRows[0];
    if (right) onlyB.push(right.row);
  }

  const missingKeys = [...leftIndex.missing, ...rightIndex.missing];
  const durationMs = performance.now() - startedAt;
  options.onProgress({ message: 'Finalizing results', percent: 100 });

  return {
    completedAt: new Date().toISOString(),
    differences,
    duplicates,
    durationMs,
    exactMatches,
    missingKeys,
    onlyA,
    onlyB,
    summary: {
      differences: differences.length,
      duplicates: duplicates.reduce(
        (total, group) => total + group.leftRows.length + group.rightRows.length,
        0,
      ),
      exactMatches: exactMatches.length,
      missingKeys: missingKeys.length,
      onlyA: onlyA.length,
      onlyB: onlyB.length,
      totalRowsA: leftSource.rows.length,
      totalRowsB: rightSource.rows.length,
    },
    warnings: [...leftSource.warnings, ...rightSource.warnings],
  };
}
