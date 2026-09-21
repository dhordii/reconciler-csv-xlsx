import { AlertTriangle, ArrowLeft, Check, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { createMapping, defaultRule, updateMappingColumns } from '../domain/mappings';
import type {
  ColumnMapping,
  ComparisonKind,
  ParseSettings,
  ParsedSource,
  ReconciliationProgress,
} from '../domain/types';

const STEP_LABELS = [
  'Upload',
  'Select data',
  'Match columns',
  'Set rules',
  'Review & run',
  'Results',
] as const;

const NORMALIZATION_TOGGLES = [
  { label: 'Ignore outer spaces', property: 'trim' },
  { label: 'Collapse repeated spaces', property: 'collapseWhitespace' },
  { label: 'Ignore letter case', property: 'caseInsensitive' },
] as const;

export function WorkflowStepper({ current }: { current: number }) {
  return (
    <nav aria-label="Reconciliation progress" className="stepper">
      <ol>
        {STEP_LABELS.map((step, index) => (
          <li
            className={index < current ? 'is-complete' : ''}
            aria-current={index === current ? 'step' : undefined}
            key={step}
          >
            <span className="step-node" aria-hidden="true">
              {index < current ? <Check size={18} strokeWidth={2.5} /> : index + 1}
            </span>
            <span className="step-label">{step}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cellText(value: string | number | boolean | null): string {
  return value === null ? '' : String(value);
}

interface SourceSetupProps {
  busy: boolean;
  onApply: (settings: Partial<ParseSettings>) => void;
  side: string;
  source: ParsedSource;
}

function SourceSetup({ busy, onApply, side, source }: SourceSetupProps) {
  const [settings, setSettings] = useState<ParseSettings>(source.settings);

  return (
    <section className="setup-card">
      <div className="setup-card-heading">
        <div>
          <span className="source-chip">{side}</span>
          <h2>{source.meta.fileName}</h2>
        </div>
        <p>
          {formatFileSize(source.meta.fileSize)} · {source.rows.length.toLocaleString()} data rows ·{' '}
          {source.columns.length} columns
        </p>
      </div>

      <div className="settings-grid">
        {source.meta.kind === 'xlsx' ? (
          <label>
            <span>Worksheet</span>
            <select
              onChange={(event) =>
                setSettings((current) => ({ ...current, sheetName: event.currentTarget.value }))
              }
              value={settings.sheetName}
            >
              {source.meta.sheetNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              <span>Encoding</span>
              <select
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    csvEncoding: event.currentTarget.value as 'utf-8' | 'windows-1251',
                  }))
                }
                value={settings.csvEncoding}
              >
                <option value="utf-8">UTF-8</option>
                <option value="windows-1251">Windows-1251</option>
              </select>
            </label>
            <label>
              <span>Delimiter</span>
              <select
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    csvDelimiter: event.currentTarget.value as ',' | ';' | '\t' | '|',
                  }))
                }
                value={settings.csvDelimiter}
              >
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
                <option value="\t">Tab</option>
                <option value="|">Pipe</option>
              </select>
            </label>
          </>
        )}
        <label>
          <span>Header row</span>
          <input
            min={1}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                headerRow: Math.max(1, event.currentTarget.valueAsNumber),
              }))
            }
            type="number"
            value={settings.headerRow}
          />
        </label>
        <button
          className="secondary-button compact"
          disabled={busy}
          onClick={() => onApply(settings)}
          type="button"
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : null}
          Apply settings
        </button>
      </div>

      {source.warnings.length > 0 ? (
        <div className="inline-warning">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>{source.warnings[0]}</span>
        </div>
      ) : null}

      <div className="preview-scroll" tabIndex={0} aria-label={`${side} data preview`}>
        <table className="preview-table">
          <thead>
            <tr>
              <th>Source row</th>
              {source.columns.map((column) => (
                <th key={column.id}>{column.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {source.rows.slice(0, 5).map((row) => (
              <tr key={row.rowNumber}>
                <th>{row.rowNumber}</th>
                {source.columns.map((column) => (
                  <td key={column.id}>{cellText(row.values[column.id] ?? null)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface DataSelectionStepProps {
  busySide: 'a' | 'b' | null;
  left: ParsedSource;
  onApply: (side: 'a' | 'b', settings: Partial<ParseSettings>) => void;
  right: ParsedSource;
}

export function DataSelectionStep({ busySide, left, onApply, right }: DataSelectionStepProps) {
  return (
    <div className="step-content">
      <div className="step-heading">
        <h1>Confirm how each file is read</h1>
        <p>Check the worksheet or CSV settings, then confirm the header row in the preview.</p>
      </div>
      <div className="setup-grid">
        <SourceSetup
          busy={busySide === 'a'}
          key={`${left.meta.fileName}-${left.settings.headerRow}-${left.settings.sheetName ?? ''}-${left.settings.csvDelimiter ?? ''}`}
          onApply={(settings) => onApply('a', settings)}
          side="File A"
          source={left}
        />
        <SourceSetup
          busy={busySide === 'b'}
          key={`${right.meta.fileName}-${right.settings.headerRow}-${right.settings.sheetName ?? ''}-${right.settings.csvDelimiter ?? ''}`}
          onApply={(settings) => onApply('b', settings)}
          side="File B"
          source={right}
        />
      </div>
    </div>
  );
}

interface MappingStepProps {
  left: ParsedSource;
  mappings: ColumnMapping[];
  onChange: (mappings: ColumnMapping[]) => void;
  right: ParsedSource;
}

export function MappingStep({ left, mappings, onChange, right }: MappingStepProps) {
  const mappedLeft = new Set(mappings.map((mapping) => mapping.leftColumnId));
  const mappedRight = new Set(mappings.map((mapping) => mapping.rightColumnId));
  const availableLeft = left.columns.filter((column) => !mappedLeft.has(column.id));
  const availableRight = right.columns.filter((column) => !mappedRight.has(column.id));

  const replaceMapping = (id: string, replacement: ColumnMapping) =>
    onChange(mappings.map((mapping) => (mapping.id === id ? replacement : mapping)));

  const addMapping = () => {
    const leftColumn = availableLeft[0];
    const rightColumn = availableRight[0];
    if (leftColumn && rightColumn) onChange([...mappings, createMapping(leftColumn, rightColumn)]);
  };

  return (
    <div className="step-content">
      <div className="step-heading split-heading">
        <div>
          <h1>Match the columns</h1>
          <p>
            Exact header names are mapped automatically. Choose one or more columns that uniquely identify a
            row.
          </p>
        </div>
        <div className="mapping-summary">
          <strong>{mappings.length}</strong> mapped ·{' '}
          <strong>{mappings.filter((mapping) => mapping.key).length}</strong> key
        </div>
      </div>

      {mappings.filter((mapping) => mapping.key).length === 0 ? (
        <div className="inline-error" role="alert">
          Choose at least one key column before continuing.
        </div>
      ) : null}

      <div className="mapping-table-wrap">
        <table className="mapping-table">
          <thead>
            <tr>
              <th>File A column</th>
              <th>File B column</th>
              <th>Use as key</th>
              <th>Compare</th>
              <th>
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((mapping) => (
              <tr key={mapping.id}>
                <td>
                  <select
                    aria-label={`File A column paired with ${mapping.rightName}`}
                    onChange={(event) => {
                      const leftColumn = left.columns.find(
                        (column) => column.id === event.currentTarget.value,
                      );
                      const rightColumn = right.columns.find((column) => column.id === mapping.rightColumnId);
                      if (leftColumn && rightColumn)
                        replaceMapping(mapping.id, updateMappingColumns(mapping, leftColumn, rightColumn));
                    }}
                    value={mapping.leftColumnId}
                  >
                    {left.columns.map((column) => (
                      <option
                        disabled={mappedLeft.has(column.id) && column.id !== mapping.leftColumnId}
                        key={column.id}
                        value={column.id}
                      >
                        {column.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={`File B column paired with ${mapping.leftName}`}
                    onChange={(event) => {
                      const leftColumn = left.columns.find((column) => column.id === mapping.leftColumnId);
                      const rightColumn = right.columns.find(
                        (column) => column.id === event.currentTarget.value,
                      );
                      if (leftColumn && rightColumn)
                        replaceMapping(mapping.id, updateMappingColumns(mapping, leftColumn, rightColumn));
                    }}
                    value={mapping.rightColumnId}
                  >
                    {right.columns.map((column) => (
                      <option
                        disabled={mappedRight.has(column.id) && column.id !== mapping.rightColumnId}
                        key={column.id}
                        value={column.id}
                      >
                        {column.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <label className="check-label">
                    <input
                      checked={mapping.key}
                      onChange={(event) =>
                        replaceMapping(mapping.id, { ...mapping, key: event.currentTarget.checked })
                      }
                      type="checkbox"
                    />
                    <span>{mapping.key ? 'Key' : 'No'}</span>
                  </label>
                </td>
                <td>
                  <label className="check-label">
                    <input
                      checked={mapping.compare}
                      disabled={mapping.key}
                      onChange={(event) =>
                        replaceMapping(mapping.id, { ...mapping, compare: event.currentTarget.checked })
                      }
                      type="checkbox"
                    />
                    <span>{mapping.key ? 'Key only' : mapping.compare ? 'Yes' : 'No'}</span>
                  </label>
                </td>
                <td>
                  <button
                    aria-label={`Remove mapping ${mapping.leftName} to ${mapping.rightName}`}
                    className="icon-button table-action"
                    onClick={() => onChange(mappings.filter((candidate) => candidate.id !== mapping.id))}
                    type="button"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mapping-footer">
        <button
          className="secondary-button"
          disabled={availableLeft.length === 0 || availableRight.length === 0}
          onClick={addMapping}
          type="button"
        >
          <Plus size={18} /> Add mapping
        </button>
        <p>
          Unmapped: {availableLeft.length} in File A · {availableRight.length} in File B
        </p>
      </div>
    </div>
  );
}

interface RulesStepProps {
  left: ParsedSource;
  mappings: ColumnMapping[];
  onChange: (mappings: ColumnMapping[]) => void;
  right: ParsedSource;
}

export function RulesStep({ left, mappings, onChange, right }: RulesStepProps) {
  const replace = (id: string, replacement: ColumnMapping) =>
    onChange(mappings.map((mapping) => (mapping.id === id ? replacement : mapping)));

  return (
    <div className="step-content">
      <div className="step-heading">
        <h1>Set comparison rules</h1>
        <p>Rules start strict. Turn on only the normalizations and tolerances your data requires.</p>
      </div>
      <div className="rules-list">
        {mappings.map((mapping) => {
          const leftColumn = left.columns.find((column) => column.id === mapping.leftColumnId);
          const rightColumn = right.columns.find((column) => column.id === mapping.rightColumnId);
          const ambiguous = leftColumn?.ambiguity ?? rightColumn?.ambiguity;
          return (
            <section className="rule-row" key={mapping.id}>
              <div className="rule-identity">
                <strong>{mapping.leftName}</strong>
                {mapping.leftName !== mapping.rightName ? <span>↔ {mapping.rightName}</span> : null}
                <span className={`role-badge ${mapping.key ? 'key' : ''}`}>
                  {mapping.key ? 'Key' : 'Compared field'}
                </span>
              </div>

              {mapping.key ? (
                <div className="toggle-row">
                  {NORMALIZATION_TOGGLES.map(({ property, label }) => (
                    <label className="switch-label" key={property}>
                      <input
                        checked={mapping.keyRule[property as keyof typeof mapping.keyRule]}
                        onChange={(event) =>
                          replace(mapping.id, {
                            ...mapping,
                            keyRule: { ...mapping.keyRule, [property]: event.currentTarget.checked },
                          })
                        }
                        type="checkbox"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="rule-controls">
                  <label>
                    <span>Compare as</span>
                    <select
                      disabled={!mapping.compare}
                      onChange={(event) =>
                        replace(mapping.id, {
                          ...mapping,
                          rule: defaultRule(event.currentTarget.value as ComparisonKind),
                        })
                      }
                      value={mapping.rule.kind}
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="boolean">Boolean</option>
                    </select>
                  </label>
                  <label className="switch-label compare-switch">
                    <input
                      checked={mapping.compare}
                      onChange={(event) =>
                        replace(mapping.id, { ...mapping, compare: event.currentTarget.checked })
                      }
                      type="checkbox"
                    />
                    <span>Include in comparison</span>
                  </label>

                  {mapping.compare && mapping.rule.kind === 'text' ? (
                    <div className="toggle-row">
                      {NORMALIZATION_TOGGLES.map(({ property, label }) => {
                        const textRule = mapping.rule.kind === 'text' ? mapping.rule : null;
                        return (
                          <label className="switch-label" key={property}>
                            <input
                              checked={textRule?.[property] ?? false}
                              onChange={(event) =>
                                textRule &&
                                replace(mapping.id, {
                                  ...mapping,
                                  rule: { ...textRule, [property]: event.currentTarget.checked },
                                })
                              }
                              type="checkbox"
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {mapping.compare && mapping.rule.kind === 'number' ? (
                    <div className="numeric-grid">
                      <label>
                        <span>Number format</span>
                        <select
                          onChange={(event) =>
                            mapping.rule.kind === 'number' &&
                            replace(mapping.id, {
                              ...mapping,
                              rule: {
                                ...mapping.rule,
                                format: event.currentTarget.value as 'plain' | 'standard' | 'european',
                              },
                            })
                          }
                          value={mapping.rule.format}
                        >
                          <option value="plain">Plain (1234.56)</option>
                          <option value="standard">Standard (1,234.56)</option>
                          <option value="european">European (1.234,56)</option>
                        </select>
                      </label>
                      <label>
                        <span>Absolute tolerance</span>
                        <input
                          min={0}
                          onChange={(event) =>
                            mapping.rule.kind === 'number' &&
                            replace(mapping.id, {
                              ...mapping,
                              rule: {
                                ...mapping.rule,
                                absoluteTolerance: Math.max(0, event.currentTarget.valueAsNumber || 0),
                              },
                            })
                          }
                          step="any"
                          type="number"
                          value={mapping.rule.absoluteTolerance}
                        />
                      </label>
                      <label>
                        <span>Relative tolerance (%)</span>
                        <input
                          min={0}
                          onChange={(event) =>
                            mapping.rule.kind === 'number' &&
                            replace(mapping.id, {
                              ...mapping,
                              rule: {
                                ...mapping.rule,
                                relativeTolerancePercent: Math.max(0, event.currentTarget.valueAsNumber || 0),
                              },
                            })
                          }
                          step="any"
                          type="number"
                          value={mapping.rule.relativeTolerancePercent}
                        />
                      </label>
                    </div>
                  ) : null}

                  {mapping.compare && mapping.rule.kind === 'date' ? (
                    <label>
                      <span>Date format</span>
                      <select
                        onChange={(event) =>
                          mapping.rule.kind === 'date' &&
                          replace(mapping.id, {
                            ...mapping,
                            rule: {
                              ...mapping.rule,
                              format: event.currentTarget.value as 'iso' | 'mdy' | 'dmy',
                            },
                          })
                        }
                        value={mapping.rule.format}
                      >
                        <option value="iso">YYYY-MM-DD</option>
                        <option value="mdy">MM/DD/YYYY</option>
                        <option value="dmy">DD/MM/YYYY</option>
                      </select>
                    </label>
                  ) : null}

                  {ambiguous && mapping.compare ? (
                    <p className="ambiguity-note">
                      <AlertTriangle size={16} /> Confirm the {ambiguous} format for this column before
                      running.
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface ReviewStepProps {
  left: ParsedSource;
  mappings: ColumnMapping[];
  progress: ReconciliationProgress | null;
  right: ParsedSource;
}

export function ReviewStep({ left, mappings, progress, right }: ReviewStepProps) {
  const keys = mappings.filter((mapping) => mapping.key);
  const compared = mappings.filter((mapping) => mapping.compare && !mapping.key);
  return (
    <div className="step-content review-content">
      <div className="step-heading">
        <h1>Review before running</h1>
        <p>Nothing will be changed in either source file. The run uses the complete data shown below.</p>
      </div>
      <div className="review-grid">
        <section>
          <h2>Sources</h2>
          <dl>
            <div>
              <dt>File A</dt>
              <dd>
                {left.meta.fileName} · {left.rows.length.toLocaleString()} rows
              </dd>
            </div>
            <div>
              <dt>File B</dt>
              <dd>
                {right.meta.fileName} · {right.rows.length.toLocaleString()} rows
              </dd>
            </div>
          </dl>
        </section>
        <section>
          <h2>Matching</h2>
          <dl>
            <div>
              <dt>Key</dt>
              <dd>{keys.map((mapping) => mapping.leftName).join(' + ')}</dd>
            </div>
            <div>
              <dt>Compared fields</dt>
              <dd>{compared.length}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h2>Safety</h2>
          <ul className="check-list">
            <li>
              <Check size={17} /> Processing stays in this browser
            </li>
            <li>
              <Check size={17} /> Duplicate keys are isolated
            </li>
            <li>
              <Check size={17} /> Source rows remain unchanged
            </li>
          </ul>
        </section>
      </div>
      {progress ? (
        <div className="progress-panel" role="status" aria-live="polite">
          <div>
            <strong>{progress.message}</strong>
            <span>{progress.percent}%</span>
          </div>
          <progress max={100} value={progress.percent} />
        </div>
      ) : null}
    </div>
  );
}

interface WorkflowActionsProps {
  backDisabled?: boolean;
  busy?: boolean;
  nextDisabled?: boolean;
  nextLabel: string;
  onBack?: () => void;
  onCancel?: () => void;
  onNext: () => void;
}

export function WorkflowActions({
  backDisabled,
  busy,
  nextDisabled,
  nextLabel,
  onBack,
  onCancel,
  onNext,
}: WorkflowActionsProps) {
  return (
    <footer className="action-row workflow-actions">
      <div>
        {onBack ? (
          <button className="back-button" disabled={backDisabled || busy} onClick={onBack} type="button">
            <ArrowLeft size={18} /> Back
          </button>
        ) : null}
        {busy && onCancel ? (
          <button className="cancel-button" onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
      </div>
      <button className="primary-button" disabled={nextDisabled || busy} onClick={onNext} type="button">
        {busy ? <LoaderCircle className="spin" size={18} /> : null}
        {busy ? 'Working…' : nextLabel}
      </button>
    </footer>
  );
}
