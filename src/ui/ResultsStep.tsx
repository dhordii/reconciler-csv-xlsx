import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Download, Eye, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import {
  buildResolvedRows,
  cellIssueId,
  duplicateIssueId,
  missingKeyIssueId,
  presenceIssueId,
  resolutionProgress,
  type ResolutionDecision,
  type ResolutionDecisions,
} from '../domain/resolution';
import type {
  ColumnMapping,
  DuplicateGroup,
  MissingKeyRecord,
  PairedRecord,
  ParsedSource,
  ReconciliationResult,
  SourceRow,
  SourceSide,
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
  onExport: (baseSide: SourceSide, decisions: ResolutionDecisions) => void;
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

function columnLetters(index: number): string {
  let current = index + 1;
  let result = '';
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function cellAddress(source: ParsedSource, columnId: string, rowNumber: number): string {
  const column = source.columns.find((candidate) => candidate.id === columnId);
  return `${column ? columnLetters(column.index) : '?'}${rowNumber}`;
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

function ResolutionChoices({
  decision,
  id,
  onDecision,
}: {
  decision: ResolutionDecision | undefined;
  id: string;
  onDecision: (id: string, decision: ResolutionDecision) => void;
}) {
  const selected = decision?.kind === 'presence' ? decision.choice : undefined;
  return (
    <div className="row-resolution" aria-label="Row decision" role="group">
      <button
        aria-pressed={selected === 'include'}
        className={selected === 'include' ? 'is-selected' : ''}
        onClick={() => onDecision(id, { choice: 'include', kind: 'presence' })}
        type="button"
      >
        Include row
      </button>
      <button
        aria-pressed={selected === 'exclude'}
        className={selected === 'exclude' ? 'is-selected' : ''}
        onClick={() => onDecision(id, { choice: 'exclude', kind: 'presence' })}
        type="button"
      >
        Exclude row
      </button>
    </div>
  );
}

function ResultRow({
  decisions,
  item,
  left,
  mappings,
  onDecision,
  right,
}: {
  decisions: ResolutionDecisions;
  item: ResultItem;
  left: ParsedSource;
  mappings: ColumnMapping[];
  onDecision: (id: string, decision: ResolutionDecision) => void;
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
            <p className="match-note">All compared values match. No decision is needed.</p>
          ) : (
            record.differences.map((difference) => {
              const issueId = cellIssueId(record, difference);
              const decision = decisions[issueId];
              const choice = decision?.kind === 'cell' ? decision.choice : undefined;
              return (
                <fieldset className="difference-cell" key={issueId}>
                  <legend>
                    {difference.label}
                    {choice ? (
                      <span className="resolved-label">
                        <Check size={13} /> Resolved
                      </span>
                    ) : null}
                  </legend>
                  <button
                    aria-pressed={choice === 'a'}
                    className={`value-choice ${choice === 'a' ? 'is-selected' : ''}`}
                    onClick={() => onDecision(issueId, { choice: 'a', kind: 'cell' })}
                    type="button"
                  >
                    <span>A · {cellAddress(left, difference.leftColumnId, record.left.rowNumber)}</span>
                    <strong>{valueText(difference.leftValue)}</strong>
                  </button>
                  <button
                    aria-pressed={choice === 'b'}
                    className={`value-choice ${choice === 'b' ? 'is-selected' : ''}`}
                    onClick={() => onDecision(issueId, { choice: 'b', kind: 'cell' })}
                    type="button"
                  >
                    <span>B · {cellAddress(right, difference.rightColumnId, record.right.rowNumber)}</span>
                    <strong>{valueText(difference.rightValue)}</strong>
                  </button>
                  <label className={`custom-choice ${choice === 'custom' ? 'is-selected' : ''}`}>
                    <span>Custom value</span>
                    <input
                      aria-label={`Custom value for ${difference.label}, key ${record.keyParts.map(valueText).join(' ')}`}
                      onChange={(event) =>
                        onDecision(issueId, {
                          choice: 'custom',
                          customValue: event.currentTarget.value,
                          kind: 'cell',
                        })
                      }
                      onFocus={(event) =>
                        onDecision(issueId, {
                          choice: 'custom',
                          customValue:
                            decision?.kind === 'cell' && decision.choice === 'custom'
                              ? (decision.customValue ?? '')
                              : event.currentTarget.value,
                          kind: 'cell',
                        })
                      }
                      placeholder="Enter replacement"
                      value={
                        decision?.kind === 'cell' && decision.choice === 'custom'
                          ? (decision.customValue ?? '')
                          : ''
                      }
                    />
                  </label>
                </fieldset>
              );
            })
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
    const side: SourceSide = item.category === 'onlyA' ? 'a' : 'b';
    const source = side === 'a' ? left : right;
    const issueId = presenceIssueId(side, item.row);
    return (
      <article className="result-row single-result">
        <div className="result-key">
          <span>{item.category === 'onlyA' ? 'Only in File A' : 'Only in File B'}</span>
          <strong>Source row {item.row.rowNumber}</strong>
          <small>
            {source.meta.fileName} · {source.meta.selectedSheet ?? 'CSV'}
          </small>
        </div>
        <div>
          <dl className="record-values compact-record-values">
            {source.columns.slice(0, 6).map((column) => (
              <div key={column.id}>
                <dt>{column.name}</dt>
                <dd>{valueText(item.row.values[column.id] ?? null)}</dd>
              </div>
            ))}
          </dl>
          <ResolutionChoices decision={decisions[issueId]} id={issueId} onDecision={onDecision} />
        </div>
        <details className="result-details">
          <summary>View complete source record</summary>
          <RecordValues row={item.row} source={source} />
        </details>
      </article>
    );
  }

  if (item.category === 'duplicates') {
    const issueId = duplicateIssueId(item.group);
    const decision = decisions[issueId];
    const choice = decision?.kind === 'duplicate' ? decision.choice : undefined;
    return (
      <article className="result-row duplicate-result">
        <div className="result-key">
          <span>Duplicate key</span>
          <strong>{item.group.keyParts.map(valueText).join(' · ')}</strong>
          <small className="provenance-lines">
            <span>A · rows {item.group.leftRows.map((row) => row.rowNumber).join(', ') || 'none'}</span>
            <span>B · rows {item.group.rightRows.map((row) => row.rowNumber).join(', ') || 'none'}</span>
          </small>
        </div>
        <div>
          <div className="duplicate-counts">
            <span>
              <strong>{item.group.leftRows.length}</strong> rows in A
            </span>
            <span>
              <strong>{item.group.rightRows.length}</strong> rows in B
            </span>
          </div>
          <div className="row-resolution duplicate-resolution" aria-label="Duplicate decision" role="group">
            <button
              aria-pressed={choice === 'a'}
              className={choice === 'a' ? 'is-selected' : ''}
              disabled={item.group.leftRows.length === 0}
              onClick={() => onDecision(issueId, { choice: 'a', kind: 'duplicate' })}
              type="button"
            >
              Keep File A rows
            </button>
            <button
              aria-pressed={choice === 'b'}
              className={choice === 'b' ? 'is-selected' : ''}
              disabled={item.group.rightRows.length === 0}
              onClick={() => onDecision(issueId, { choice: 'b', kind: 'duplicate' })}
              type="button"
            >
              Keep File B rows
            </button>
            <button
              aria-pressed={choice === 'exclude'}
              className={choice === 'exclude' ? 'is-selected' : ''}
              onClick={() => onDecision(issueId, { choice: 'exclude', kind: 'duplicate' })}
              type="button"
            >
              Exclude all
            </button>
          </div>
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
  const issueId = missingKeyIssueId(item.record);
  return (
    <article className="result-row missing-result">
      <div className="result-key">
        <span>Missing key · File {item.record.side.toUpperCase()}</span>
        <strong>Source row {item.record.row.rowNumber}</strong>
        <small>
          {source.meta.fileName} · {source.meta.selectedSheet ?? 'CSV'}
        </small>
      </div>
      <div>
        <p>Missing: {item.record.missingColumns.join(', ')}</p>
        <ResolutionChoices decision={decisions[issueId]} id={issueId} onDecision={onDecision} />
      </div>
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
  const [baseSide, setBaseSide] = useState<SourceSide>('a');
  const [decisions, setDecisions] = useState<ResolutionDecisions>({});
  const [previewOpen, setPreviewOpen] = useState(false);
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
    estimateSize: () => (category === 'differences' ? 280 : 180),
    getScrollElement: () => scrollRef.current,
    overscan: 6,
  });

  const progress = useMemo(() => resolutionProgress(result, decisions), [decisions, result]);
  const base = baseSide === 'a' ? left : right;
  const previewRows = useMemo(
    () =>
      previewOpen
        ? buildResolvedRows(left, right, mappings, result, baseSide, decisions, {
            allowUnresolved: true,
          })
        : [],
    [baseSide, decisions, left, mappings, previewOpen, result, right],
  );
  const counts: Record<ResultCategory, number> = {
    differences: result.summary.differences,
    duplicates: result.summary.duplicates,
    exactMatches: result.summary.exactMatches,
    missingKeys: result.summary.missingKeys,
    onlyA: result.summary.onlyA,
    onlyB: result.summary.onlyB,
  };
  const comparedMappings = mappings.filter((mapping) => mapping.compare && !mapping.key);
  const setDecision = (id: string, decision: ResolutionDecision) => {
    setDecisions((current) => ({ ...current, [id]: decision }));
  };
  const resolveVisibleDifferences = (choice: 'a' | 'b') => {
    setDecisions((current) => {
      const next = { ...current };
      for (const item of filtered) {
        if (item.category !== 'differences') continue;
        for (const difference of item.record.differences) {
          next[cellIssueId(item.record, difference)] = { choice, kind: 'cell' };
        }
      }
      return next;
    });
  };

  return (
    <div className="step-content results-content">
      <div className="results-heading">
        <div>
          <span className="success-badge">
            <Check size={16} /> Comparison complete
          </span>
          <h1>Resolve differences</h1>
          <p>Choose the value to keep for every exception, then export a reconciled copy of the base file.</p>
        </div>
        <div className="export-panel">
          <button className="secondary-button" onClick={onEditRules} type="button">
            <SlidersHorizontal size={18} /> Edit rules
          </button>
          <button className="secondary-button" onClick={() => setPreviewOpen(true)} type="button">
            <Eye size={18} /> Preview output
          </button>
          <button
            className="primary-button export-button"
            disabled={exporting || !progress.complete}
            onClick={() => onExport(baseSide, decisions)}
            type="button"
          >
            <Download size={18} />
            {exporting
              ? 'Building file…'
              : `Download reconciled ${base.meta.kind === 'xlsx' ? 'XLSX' : 'CSV'}`}
          </button>
        </div>
      </div>

      <section className="resolution-overview" aria-labelledby="resolution-progress-title">
        <div>
          <h2 id="resolution-progress-title">Decisions</h2>
          <strong aria-live="polite">
            {progress.resolved} of {progress.total} resolved
          </strong>
        </div>
        <progress max={Math.max(progress.total, 1)} value={progress.resolved} />
        <fieldset className="base-file-choice">
          <legend>Output structure and format</legend>
          <label>
            <input
              checked={baseSide === 'a'}
              name="base-file"
              onChange={() => setBaseSide('a')}
              type="radio"
            />
            <span>
              File A <small>{left.meta.fileName}</small>
            </span>
          </label>
          <label>
            <input
              checked={baseSide === 'b'}
              name="base-file"
              onChange={() => setBaseSide('b')}
              type="radio"
            />
            <span>
              File B <small>{right.meta.fileName}</small>
            </span>
          </label>
        </fieldset>
        {!progress.complete ? (
          <p className="resolution-hint">
            Resolve the remaining {progress.total - progress.resolved} items to export.
          </p>
        ) : (
          <p className="resolution-ready">
            <Check size={15} /> Ready to export. Your original files will not be changed.
          </p>
        )}
      </section>

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

      {category === 'differences' && filtered.length > 0 ? (
        <div className="bulk-resolution">
          <span>Apply to the visible differences:</span>
          <button onClick={() => resolveVisibleDifferences('a')} type="button">
            Use File A values
          </button>
          <button onClick={() => resolveVisibleDifferences('b')} type="button">
            Use File B values
          </button>
        </div>
      ) : null}

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
                  <ResultRow
                    decisions={decisions}
                    item={item}
                    left={left}
                    mappings={mappings}
                    onDecision={setDecision}
                    right={right}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="export-note">
        Search and filters change this view only. Export always uses every decision shown above.
      </p>

      {previewOpen ? (
        <div
          aria-labelledby="output-preview-title"
          aria-modal="true"
          className="preview-backdrop"
          role="dialog"
        >
          <section className="output-preview">
            <header>
              <div>
                <h2 id="output-preview-title">Output preview</h2>
                <p>
                  {previewRows.length.toLocaleString()} rows · based on {base.meta.fileName}
                </p>
              </div>
              <button
                aria-label="Close output preview"
                className="icon-button"
                onClick={() => setPreviewOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>
            {!progress.complete ? (
              <p className="preview-warning">
                Unresolved cells still show the value from the selected base file.
              </p>
            ) : null}
            <div className="preview-table-wrap">
              <table>
                <thead>
                  <tr>
                    {base.columns.map((column) => (
                      <th key={column.id} scope="col">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 50).map((row, index) => (
                    <tr key={`${row.originSide}-${row.originRowNumber}-${index}`}>
                      {base.columns.map((column) => (
                        <td key={column.id}>{valueText(row.values[column.id] ?? null)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewRows.length > 50 ? <p>Showing the first 50 rows.</p> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
