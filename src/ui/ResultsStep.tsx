import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import type {
  ColumnMapping,
  DuplicateGroup,
  MissingKeyRecord,
  PairedRecord,
  ParsedSource,
  ReconciliationResult,
  SourceRow,
} from '../domain/types';

type ResultCategory = 'differences' | 'onlyA' | 'onlyB' | 'duplicates' | 'missingKeys' | 'exactMatches';

type ResultItem =
  | { category: 'differences'; record: PairedRecord }
  | { category: 'exactMatches'; record: PairedRecord }
  | { category: 'onlyA'; row: SourceRow }
  | { category: 'onlyB'; row: SourceRow }
  | { category: 'duplicates'; group: DuplicateGroup }
  | { category: 'missingKeys'; record: MissingKeyRecord };

interface ResultsStepProps {
  exporting: boolean;
  left: ParsedSource;
  mappings: ColumnMapping[];
  onEditRules: () => void;
  onExport: (includeMatches: boolean) => void;
  result: ReconciliationResult;
  right: ParsedSource;
}

const CATEGORY_LABELS: Record<ResultCategory, string> = {
  differences: 'Differences',
  duplicates: 'Duplicates',
  exactMatches: 'Matches',
  missingKeys: 'Missing key',
  onlyA: 'Only A',
  onlyB: 'Only B',
};

function valueText(value: string | number | boolean | null): string {
  if (value === null || value === '') return 'Blank';
  return String(value);
}

function itemSearchText(item: ResultItem): string {
  if ('record' in item && 'keyParts' in item.record) {
    return [
      ...item.record.keyParts,
      JSON.stringify(item.record.left.values),
      JSON.stringify(item.record.right.values),
      ...item.record.differences.flatMap((difference) => [
        difference.label,
        difference.leftValue,
        difference.rightValue,
      ]),
    ]
      .map(String)
      .join(' ')
      .toLocaleLowerCase('en-US');
  }
  if ('row' in item) return JSON.stringify(item.row.values).toLocaleLowerCase('en-US');
  if ('group' in item)
    return `${item.group.keyParts.join(' ')} ${JSON.stringify(item.group)}`.toLocaleLowerCase('en-US');
  return item.category === 'missingKeys'
    ? `${item.record.missingColumns.join(' ')} ${JSON.stringify(item.record.row.values)}`.toLocaleLowerCase(
        'en-US',
      )
    : '';
}

function keyForItem(item: ResultItem, index: number): string {
  if ('record' in item && 'key' in item.record) return `${item.category}-${item.record.key}-${index}`;
  if ('row' in item) return `${item.category}-${item.row.rowNumber}-${index}`;
  if ('group' in item) return `${item.category}-${item.group.key}-${index}`;
  return item.category === 'missingKeys'
    ? `${item.category}-${item.record.side}-${item.record.row.rowNumber}-${index}`
    : `${item.category}-${index}`;
}

function RecordValues({ row, source }: { row: SourceRow; source: ParsedSource }) {
  return (
    <dl className="record-values full-record-values">
      {source.columns.map((column) => (
        <div key={column.id}>
          <dt>{column.name}</dt>
          <dd title={valueText(row.values[column.id] ?? null)}>{valueText(row.values[column.id] ?? null)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ResultRow({
  item,
  left,
  mappings,
  right,
}: {
  item: ResultItem;
  left: ParsedSource;
  mappings: ColumnMapping[];
  right: ParsedSource;
}) {
  if (item.category === 'differences' || item.category === 'exactMatches') {
    const record = item.record;
    return (
      <article className="result-row paired-result">
        <div className="result-key">
          <span>Key</span>
          <strong>{record.keyParts.map(valueText).join(' · ')}</strong>
          <small className="provenance-lines">
            <span>
              A · {left.meta.fileName} · {left.meta.selectedSheet ?? 'CSV'} · row {record.left.rowNumber}
            </span>
            <span>
              B · {right.meta.fileName} · {right.meta.selectedSheet ?? 'CSV'} · row {record.right.rowNumber}
            </span>
          </small>
        </div>
        <div className="difference-cells">
          {record.differences.length === 0 ? (
            <p className="match-note">All compared values match.</p>
          ) : (
            record.differences.map((difference) => (
              <div className="difference-cell" key={`${difference.leftColumnId}-${difference.rightColumnId}`}>
                <strong>{difference.label}</strong>
                <div>
                  <span>A</span>
                  <mark>{valueText(difference.leftValue)}</mark>
                </div>
                <div>
                  <span>B</span>
                  <mark>{valueText(difference.rightValue)}</mark>
                </div>
              </div>
            ))
          )}
        </div>
        <details className="result-details">
          <summary>View full paired record</summary>
          <dl className="paired-values">
            {mappings.map((mapping) => (
              <div key={mapping.id}>
                <dt>
                  {mapping.leftName === mapping.rightName
                    ? mapping.leftName
                    : `${mapping.leftName} / ${mapping.rightName}`}
                </dt>
                <dd>
                  <span>A</span> {valueText(record.left.values[mapping.leftColumnId] ?? null)}
                </dd>
                <dd>
                  <span>B</span> {valueText(record.right.values[mapping.rightColumnId] ?? null)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </article>
    );
  }

  if (item.category === 'onlyA' || item.category === 'onlyB') {
    const source = item.category === 'onlyA' ? left : right;
    return (
      <article className="result-row single-result">
        <div className="result-key">
          <span>{item.category === 'onlyA' ? 'Only in File A' : 'Only in File B'}</span>
          <strong>Source row {item.row.rowNumber}</strong>
          <small>
            {source.meta.fileName} · {source.meta.selectedSheet ?? 'CSV'}
          </small>
        </div>
        <dl className="record-values">
          {source.columns.slice(0, 6).map((column) => (
            <div key={column.id}>
              <dt>{column.name}</dt>
              <dd>{valueText(item.row.values[column.id] ?? null)}</dd>
            </div>
          ))}
        </dl>
        <details className="result-details">
          <summary>View complete source record</summary>
          <RecordValues row={item.row} source={source} />
        </details>
      </article>
    );
  }

  if (item.category === 'duplicates') {
    return (
      <article className="result-row duplicate-result">
        <div className="result-key">
          <span>Duplicate key</span>
          <strong>{item.group.keyParts.map(valueText).join(' · ')}</strong>
          <small className="provenance-lines">
            <span>
              A · {left.meta.fileName} · {left.meta.selectedSheet ?? 'CSV'} · rows{' '}
              {item.group.leftRows.map((row) => row.rowNumber).join(', ') || 'none'}
            </span>
            <span>
              B · {right.meta.fileName} · {right.meta.selectedSheet ?? 'CSV'} · rows{' '}
              {item.group.rightRows.map((row) => row.rowNumber).join(', ') || 'none'}
            </span>
          </small>
        </div>
        <div className="duplicate-counts">
          <span>
            <strong>{item.group.leftRows.length}</strong> rows in A
          </span>
          <span>
            <strong>{item.group.rightRows.length}</strong> rows in B
          </span>
        </div>
        <details className="result-details">
          <summary>View all duplicate rows</summary>
          <div className="duplicate-records">
            {item.group.leftRows.map((row) => (
              <section key={`a-${row.rowNumber}`}>
                <h3>File A · source row {row.rowNumber}</h3>
                <RecordValues row={row} source={left} />
              </section>
            ))}
            {item.group.rightRows.map((row) => (
              <section key={`b-${row.rowNumber}`}>
                <h3>File B · source row {row.rowNumber}</h3>
                <RecordValues row={row} source={right} />
              </section>
            ))}
          </div>
        </details>
      </article>
    );
  }

  const source = item.record.side === 'a' ? left : right;
  return (
    <article className="result-row missing-result">
      <div className="result-key">
        <span>Missing key · File {item.record.side.toUpperCase()}</span>
        <strong>Source row {item.record.row.rowNumber}</strong>
        <small>
          {source.meta.fileName} · {source.meta.selectedSheet ?? 'CSV'}
        </small>
      </div>
      <p>Missing: {item.record.missingColumns.join(', ')}</p>
      <details className="result-details">
        <summary>View complete source record</summary>
        <RecordValues row={item.record.row} source={source} />
      </details>
    </article>
  );
}

export function ResultsStep({
  exporting,
  left,
  mappings,
  onEditRules,
  onExport,
  result,
  right,
}: ResultsStepProps) {
  const [category, setCategory] = useState<ResultCategory>('differences');
  const [search, setSearch] = useState('');
  const [changedColumn, setChangedColumn] = useState('');
  const [descending, setDescending] = useState(false);
  const [includeMatches, setIncludeMatches] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const items = useMemo<ResultItem[]>(() => {
    if (category === 'differences')
      return result.differences.map((record) => ({ category: 'differences', record }));
    if (category === 'exactMatches')
      return result.exactMatches.map((record) => ({ category: 'exactMatches', record }));
    if (category === 'onlyA') return result.onlyA.map((row) => ({ category: 'onlyA', row }));
    if (category === 'onlyB') return result.onlyB.map((row) => ({ category: 'onlyB', row }));
    if (category === 'duplicates')
      return result.duplicates.map((group) => ({ category: 'duplicates', group }));
    return result.missingKeys.map((record) => ({ category: 'missingKeys', record }));
  }, [category, result]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('en-US');
    const matching = items.filter((item) => {
      if (needle && !itemSearchText(item).includes(needle)) return false;
      if (changedColumn && item.category === 'differences') {
        return item.record.differences.some((difference) => difference.leftColumnId === changedColumn);
      }
      return true;
    });
    return descending ? [...matching].reverse() : matching;
  }, [changedColumn, descending, items, search]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    estimateSize: () => (category === 'differences' ? 154 : 112),
    getScrollElement: () => scrollRef.current,
    overscan: 8,
  });

  const counts: Record<ResultCategory, number> = {
    differences: result.summary.differences,
    duplicates: result.summary.duplicates,
    exactMatches: result.summary.exactMatches,
    missingKeys: result.summary.missingKeys,
    onlyA: result.summary.onlyA,
    onlyB: result.summary.onlyB,
  };

  const comparedMappings = mappings.filter((mapping) => mapping.compare && !mapping.key);

  return (
    <div className="step-content results-content">
      <div className="results-heading">
        <div>
          <span className="success-badge">
            <CheckIcon /> Reconciliation complete
          </span>
          <h1>Review the result</h1>
          <p>
            {result.summary.totalRowsA.toLocaleString()} rows in A ·{' '}
            {result.summary.totalRowsB.toLocaleString()} rows in B · {(result.durationMs / 1000).toFixed(2)}{' '}
            seconds
          </p>
        </div>
        <div className="export-panel">
          <button className="secondary-button" onClick={onEditRules} type="button">
            <SlidersHorizontal size={18} /> Edit rules
          </button>
          <label className="switch-label">
            <input
              checked={includeMatches}
              onChange={(event) => setIncludeMatches(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>Include exact matches</span>
          </label>
          <button
            className="primary-button export-button"
            disabled={exporting}
            onClick={() => onExport(includeMatches)}
            type="button"
          >
            <Download size={18} /> {exporting ? 'Building report…' : 'Download XLSX report'}
          </button>
        </div>
      </div>

      <div className="summary-strip" aria-label="Result summary">
        {(['exactMatches', 'differences', 'onlyA', 'onlyB', 'duplicates', 'missingKeys'] as const).map(
          (key) => (
            <button
              aria-pressed={category === key}
              className={category === key ? 'is-active' : ''}
              key={key}
              onClick={() => setCategory(key)}
              type="button"
            >
              <strong>{counts[key].toLocaleString()}</strong>
              <span>{CATEGORY_LABELS[key]}</span>
            </button>
          ),
        )}
      </div>

      <div className="result-toolbar">
        <label className="search-control">
          <Search aria-hidden="true" size={18} />
          <input
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search by key or value"
            type="search"
            value={search}
          />
        </label>
        <label>
          <span>Changed column</span>
          <select
            disabled={category !== 'differences'}
            onChange={(event) => setChangedColumn(event.currentTarget.value)}
            value={changedColumn}
          >
            <option value="">All columns</option>
            {comparedMappings.map((mapping) => (
              <option key={mapping.id} value={mapping.leftColumnId}>
                {mapping.leftName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select
            onChange={(event) => setDescending(event.currentTarget.value === 'desc')}
            value={descending ? 'desc' : 'asc'}
          >
            <option value="asc">Source order</option>
            <option value="desc">Reverse order</option>
          </select>
        </label>
        <span className="filter-count">Showing {filtered.length.toLocaleString()}</span>
      </div>

      <div className="virtual-results" ref={scrollRef} tabIndex={0}>
        {filtered.length === 0 ? (
          <div className="empty-results">
            <h2>No records in this view</h2>
            <p>Change the category or clear the active filters.</p>
          </div>
        ) : (
          <div className="virtual-canvas" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = filtered[virtualRow.index];
              if (!item) return null;
              return (
                <div
                  className="virtual-item"
                  data-index={virtualRow.index}
                  key={keyForItem(item, virtualRow.index)}
                  ref={virtualizer.measureElement}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <ResultRow item={item} left={left} mappings={mappings} right={right} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="export-note">
        Filters affect this view only. The XLSX report always includes the complete reconciliation.
      </p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="m3 8.2 3.1 3.1L13 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
