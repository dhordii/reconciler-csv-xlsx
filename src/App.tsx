import { useEffect, useRef, useState } from 'react';

import sampleA from '../fixtures/reconciliation-a.csv?raw';
import sampleB from '../fixtures/reconciliation-b.csv?raw';
import { autoMapColumns } from './domain/mappings';
import type {
  ColumnMapping,
  ParseSettings,
  ParsedSource,
  ReconciliationProgress,
  ReconciliationResult,
  SavedProfile,
} from './domain/types';
import {
  applyProfile,
  deleteProfile,
  duplicateProfile,
  importProfileJson,
  loadProfiles,
  profileToJson,
  saveProfile,
} from './profiles/profiles';
import { ReconcilerWorkerClient } from './services/workerClient';
import { downloadBlob } from './services/download';
import { AppHeader, type ThemeChoice } from './ui/AppHeader';
import { ResultsStep } from './ui/ResultsStep';
import { SourceFileCard } from './ui/SourceFileCard';
import {
  DataSelectionStep,
  MappingStep,
  ReviewStep,
  RulesStep,
  WorkflowActions,
  WorkflowStepper,
} from './ui/Workflow';

type BusyState = 'parsing' | 'reconciling' | 'exporting' | null;
type SourceSide = 'a' | 'b';

function initialTheme(): ThemeChoice {
  const saved = localStorage.getItem('reconciler.theme');
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}

function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(initialTheme);
  useEffect(() => {
    localStorage.setItem('reconciler.theme', theme);
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [theme, setTheme] as const;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/giu, '-').replace(/^-+|-+$/gu, '') || 'reconciliation';
}

export function App() {
  const [workerClient] = useState(() => new ReconcilerWorkerClient());

  const [theme, setTheme] = useTheme();
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<Record<SourceSide, File | null>>({ a: null, b: null });
  const [sources, setSources] = useState<Record<SourceSide, ParsedSource | null>>({ a: null, b: null });
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [profiles, setProfiles] = useState<SavedProfile[]>(loadProfiles);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [busy, setBusy] = useState<BusyState>(null);
  const [busySide, setBusySide] = useState<SourceSide | null>(null);
  const [progress, setProgress] = useState<ReconciliationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelRun = useRef<(() => void) | null>(null);

  useEffect(() => {
    const dispose = () => workerClient.dispose();
    window.addEventListener('beforeunload', dispose);
    return () => window.removeEventListener('beforeunload', dispose);
  }, [workerClient]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const left = sources.a;
  const right = sources.b;

  const applySelectedProfile = (
    profile: SavedProfile,
    parsedLeft: ParsedSource,
    parsedRight: ParsedSource,
  ) => {
    const applied = applyProfile(profile, parsedLeft, parsedRight);
    setMappings(applied.config.mappings);
    if (applied.missingKeyColumns.length > 0) {
      setError(
        `Profile cannot run because key columns are missing: ${applied.missingKeyColumns.join(', ')}.`,
      );
      setStep(2);
    } else if (applied.missingOtherColumns.length > 0) {
      setNotice(`Review schema changes: ${applied.missingOtherColumns.join(', ')} could not be mapped.`);
    } else {
      setNotice(`Profile “${profile.name}” applied. Review the mappings before running.`);
    }
  };

  const parseBothFiles = async (
    selectedFiles: Record<SourceSide, File | null> = files,
    profileToApply: SavedProfile | null | undefined = selectedProfile,
  ) => {
    const leftFile = selectedFiles.a;
    const rightFile = selectedFiles.b;
    if (!leftFile || !rightFile) return;
    setBusy('parsing');
    setError(null);
    setNotice(null);
    try {
      const [parsedLeft, parsedRight] = await Promise.all([
        workerClient.parse(leftFile),
        workerClient.parse(rightFile),
      ]);
      setSources({ a: parsedLeft, b: parsedRight });
      if (profileToApply) applySelectedProfile(profileToApply, parsedLeft, parsedRight);
      else setMappings(autoMapColumns(parsedLeft, parsedRight));
      setResult(null);
      setStep(1);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : String(parseError));
    } finally {
      setBusy(null);
    }
  };

  const loadSampleData = () => {
    if ((files.a || files.b) && !window.confirm('Replace the selected files with synthetic sample data?')) {
      return;
    }
    const sampleFiles = {
      a: new File([sampleA], 'reconciliation-a.csv', { type: 'text/csv' }),
      b: new File([sampleB], 'reconciliation-b.csv', { type: 'text/csv' }),
    };
    setSelectedProfileId('');
    setFiles(sampleFiles);
    void parseBothFiles(sampleFiles, null);
  };

  const reparseSource = async (side: SourceSide, settings: Partial<ParseSettings>) => {
    const file = files[side];
    if (!file) return;
    setBusySide(side);
    setError(null);
    try {
      const parsed = await workerClient.parse(file, settings);
      const nextSources = { ...sources, [side]: parsed };
      setSources(nextSources);
      if (nextSources.a && nextSources.b) {
        if (selectedProfile) applySelectedProfile(selectedProfile, nextSources.a, nextSources.b);
        else setMappings(autoMapColumns(nextSources.a, nextSources.b));
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : String(parseError));
    } finally {
      setBusySide(null);
    }
  };

  const startReconciliation = () => {
    if (!left || !right) return;
    setBusy('reconciling');
    setError(null);
    setProgress({ message: 'Preparing reconciliation', percent: 2 });
    const operation = workerClient.reconcile(left, right, { mappings }, setProgress);
    cancelRun.current = operation.cancel;
    void operation.promise
      .then((nextResult) => {
        setResult(nextResult);
        setStep(5);
      })
      .catch((runError: unknown) => {
        if (runError instanceof Error && runError.name === 'AbortError') {
          setNotice('Reconciliation cancelled. No result was saved.');
        } else setError(runError instanceof Error ? runError.message : String(runError));
      })
      .finally(() => {
        setBusy(null);
        setProgress(null);
        cancelRun.current = null;
      });
  };

  const exportReport = async (includeMatches: boolean) => {
    if (!left || !right || !result) return;
    setBusy('exporting');
    setError(null);
    try {
      const { buildReconciliationReport } = await import('./reporting/report');
      const blob = await buildReconciliationReport(left, right, { mappings }, result, { includeMatches });
      const date = result.completedAt.slice(0, 10);
      downloadBlob(
        blob,
        `${safeFileName(left.meta.fileName)}-vs-${safeFileName(right.meta.fileName)}-${date}.xlsx`,
      );
      setNotice('The complete XLSX report was created. Active filters did not limit the export.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setBusy(null);
    }
  };

  const selectProfile = (id: string) => {
    setSelectedProfileId(id);
    setError(null);
    const profile = profiles.find((candidate) => candidate.id === id);
    if (left && right) {
      if (busy === 'reconciling') cancelRun.current?.();
      setResult(null);
      setStep(2);
      if (profile) applySelectedProfile(profile, left, right);
      else {
        setMappings(autoMapColumns(left, right));
        setNotice('Profile cleared. Review the automatic mappings before running again.');
      }
    } else {
      setNotice(null);
    }
  };

  const saveCurrentProfile = (name: string, existing?: SavedProfile) => {
    try {
      const next = saveProfile(name, { mappings }, existing);
      setProfiles(next);
      const saved =
        next.find((profile) => profile.id === existing?.id) ??
        [...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      setSelectedProfileId(saved?.id ?? '');
      setNotice(`Profile “${name.trim()}” saved without source data or results.`);
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : String(profileError));
    }
  };

  const removeProfile = (profile: SavedProfile) => {
    if (!window.confirm(`Delete profile “${profile.name}”?`)) return;
    setProfiles(deleteProfile(profile.id));
    if (selectedProfileId === profile.id) setSelectedProfileId('');
    setNotice(`Profile “${profile.name}” deleted.`);
  };

  const copyProfile = (profile: SavedProfile) => {
    const next = duplicateProfile(profile);
    setProfiles(next);
    const copy = [...next].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setSelectedProfileId(copy?.id ?? '');
    setNotice(`Profile “${profile.name}” duplicated.`);
  };

  const exportProfile = (profile: SavedProfile) => {
    downloadBlob(
      new Blob([profileToJson(profile)], { type: 'application/json' }),
      `${safeFileName(profile.name)}.json`,
    );
  };

  const importProfile = (text: string) => {
    try {
      const next = importProfileJson(text);
      setProfiles(next);
      const imported = [...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      setSelectedProfileId(imported?.id ?? '');
      setNotice(
        `Profile “${imported?.name ?? 'Imported profile'}” imported. Review its mappings before running.`,
      );
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? `Profile import failed: ${profileError.message}`
          : String(profileError),
      );
    }
  };

  const continueWorkflow = () => {
    setError(null);
    setNotice(null);
    if (step === 0) void parseBothFiles();
    else if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else if (step === 3) setStep(4);
    else if (step === 4) startReconciliation();
  };

  const keyCount = mappings.filter((mapping) => mapping.key).length;
  const nextDisabled =
    (step === 0 && (!files.a || !files.b)) ||
    (step === 1 && (!left || !right)) ||
    (step === 2 && (mappings.length === 0 || keyCount === 0));

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-workflow">
        Skip to reconciliation workflow
      </a>
      <AppHeader
        canSaveProfile={mappings.length > 0}
        onDeleteProfile={removeProfile}
        onDuplicateProfile={copyProfile}
        onExportProfile={exportProfile}
        onImportProfile={importProfile}
        onSaveProfile={saveCurrentProfile}
        onSelectProfile={selectProfile}
        onThemeChange={setTheme}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        theme={theme}
      />

      <main className={`workflow-shell step-${step}`} id="main-workflow">
        <WorkflowStepper current={step} />
        {error ? (
          <div className="global-message error-message" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="global-message notice-message" role="status">
            {notice}
          </div>
        ) : null}

        {step === 0 ? <h1 className="visually-hidden">Compare two CSV or XLSX files</h1> : null}

        {step === 0 ? (
          <section className="sample-demo" aria-labelledby="sample-demo-title">
            <div>
              <h2 id="sample-demo-title">Try a complete example</h2>
              <p>Compare two synthetic CSV files with differences, duplicate keys, and missing keys.</p>
            </div>
            <button
              className="secondary-button sample-demo-button"
              disabled={busy !== null}
              onClick={loadSampleData}
              type="button"
            >
              Try sample data
            </button>
          </section>
        ) : null}

        {step === 0 ? (
          <div className="source-grid">
            <SourceFileCard
              disabled={busy === 'parsing'}
              file={files.a}
              label="File A"
              onFile={(file) => setFiles((current) => ({ ...current, a: file }))}
            />
            <SourceFileCard
              disabled={busy === 'parsing'}
              file={files.b}
              label="File B"
              onFile={(file) => setFiles((current) => ({ ...current, b: file }))}
            />
          </div>
        ) : null}
        {step === 1 && left && right ? (
          <DataSelectionStep
            busySide={busySide}
            left={left}
            onApply={(side, settings) => void reparseSource(side, settings)}
            right={right}
          />
        ) : null}
        {step === 2 && left && right ? (
          <MappingStep left={left} mappings={mappings} onChange={setMappings} right={right} />
        ) : null}
        {step === 3 && left && right ? (
          <RulesStep left={left} mappings={mappings} onChange={setMappings} right={right} />
        ) : null}
        {step === 4 && left && right ? (
          <ReviewStep left={left} mappings={mappings} progress={progress} right={right} />
        ) : null}
        {step === 5 && left && right && result ? (
          <ResultsStep
            exporting={busy === 'exporting'}
            left={left}
            mappings={mappings}
            onEditRules={() => {
              setResult(null);
              setNotice('Previous result cleared. Update the rules, then review and run again.');
              setStep(3);
            }}
            onExport={(include) => void exportReport(include)}
            result={result}
            right={right}
          />
        ) : null}

        {step < 5 ? (
          <WorkflowActions
            busy={busy === 'parsing' || busy === 'reconciling'}
            nextDisabled={nextDisabled}
            nextLabel={step === 4 ? 'Run reconciliation' : 'Continue'}
            {...(step > 0 ? { onBack: () => setStep((current) => Math.max(0, current - 1)) } : {})}
            {...(step === 4 && busy === 'reconciling' ? { onCancel: () => cancelRun.current?.() } : {})}
            onNext={continueWorkflow}
          />
        ) : null}
      </main>
    </div>
  );
}
