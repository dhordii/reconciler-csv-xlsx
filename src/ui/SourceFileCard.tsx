import { File, FileCheck2 } from 'lucide-react';
import { type DragEvent, useId, useState } from 'react';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx'];

interface SourceFileCardProps {
  disabled?: boolean;
  file: File | null;
  label: string;
  onFile: (file: File) => void;
}

function validateFile(file: File): string | null {
  const name = file.name.toLocaleLowerCase('en-US');
  if (!ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return 'Choose a CSV or XLSX file.';
  }
  if (file.size > MAX_FILE_BYTES) return 'This file is larger than 50 MB.';
  return null;
}

export function SourceFileCard({ disabled = false, file, label, onFile }: SourceFileCardProps) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (candidate: File | undefined) => {
    if (!candidate || disabled) return;
    const nextError = validateFile(candidate);
    setError(nextError);
    if (!nextError) onFile(candidate);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    acceptFile(event.dataTransfer.files.item(0) ?? undefined);
  };

  return (
    <section className="source-card" aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`}>{label}</h2>
      <div
        className={`drop-zone${isDragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {file ? (
          <FileCheck2 aria-hidden="true" className="file-icon file-ready" strokeWidth={1.6} />
        ) : (
          <File aria-hidden="true" className="file-icon" strokeWidth={1.6} />
        )}
        <input
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label={`${label} upload`}
          className="visually-hidden"
          disabled={disabled}
          id={inputId}
          onChange={(event) => acceptFile(event.currentTarget.files?.item(0) ?? undefined)}
          type="file"
        />
        <button
          aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ''}`}
          className="choose-file"
          disabled={disabled}
          onClick={() => document.getElementById(inputId)?.click()}
          type="button"
        >
          {file ? 'Replace file' : 'Choose file'}
        </button>
        <p className="file-help" id={`${inputId}-help`} title={file?.name}>
          {file ? file.name : 'CSV or XLSX · up to 50 MB'}
        </p>
        <p className="file-error" id={`${inputId}-error`} aria-live="polite">
          {error ?? '\u00a0'}
        </p>
      </div>
    </section>
  );
}
