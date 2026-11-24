import { K6_DOCS_URL } from '../config/options';
import type { ValidationMessage } from '../config/types';

interface PreviewPanelProps {
  script: string | null;
  issues: ValidationMessage[];
  warnings: ValidationMessage[];
  fileName: string;
  fileNameError: string | null;
  onFileNameChange: (value: string) => void;
  onDownload: () => void;
}

export function PreviewPanel({
  script,
  issues,
  warnings,
  fileName,
  fileNameError,
  onFileNameChange,
  onDownload,
}: PreviewPanelProps) {
  const configValid = issues.length === 0 && script !== null;
  const ready = configValid && fileNameError === null;
  const lineCount = script ? script.trimEnd().split('\n').length : 0;
  const displayName = fileName.trim() || 'script.js';

  return (
    <aside className="preview-panel" aria-labelledby="preview-heading">
      <div className="preview-head">
        <div>
          <p className="eyebrow">03 · Export</p>
          <h2 id="preview-heading">Generated script</h2>
        </div>
        <span className={`status-chip${ready ? ' status-chip--on' : ' status-chip--error'}`}>
          {ready ? 'Valid' : 'Needs attention'}
        </span>
      </div>

      <div className="file-bar">
        <span className="file-icon" aria-hidden="true">
          JS
        </span>
        <div className="filename-field">
          <label htmlFor="script-filename">File name</label>
          <input
            id="script-filename"
            type="text"
            value={fileName}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={fileNameError ? true : undefined}
            aria-describedby={
              fileNameError ? 'script-filename-error' : 'script-filename-hint'
            }
            onChange={(event) => onFileNameChange(event.target.value)}
          />
          <p
            className={`filename-meta${fileNameError ? ' is-error' : ''}`}
            id={fileNameError ? 'script-filename-error' : 'script-filename-hint'}
            aria-live="polite"
          >
            {fileNameError ??
              `${lineCount > 0 ? `${lineCount} lines` : 'No preview yet'} · saved locally with this name`}
          </p>
        </div>
      </div>

      <button
        type="button"
        className="primary-button download-button"
        onClick={onDownload}
        disabled={!ready}
      >
        Download {displayName}
        <span aria-hidden="true">↓</span>
      </button>

      {issues.length > 0 ? (
        <div className="issue-summary" role="alert">
          <h3>
            Fix {issues.length} {issues.length === 1 ? 'issue' : 'issues'} to generate
            the script
          </h3>
          <ul>
            {issues.map((issue) => (
              <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="warning-summary" role="status">
          <h3>Review before running</h3>
          <ul>
            {warnings.map((warning) => (
              <li key={`${warning.path}:${warning.message}`}>{warning.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {script ? (
        <pre
          className="code-preview"
          tabIndex={0}
          aria-label={`Preview of the generated ${displayName} script`}
        >
          <code>{script}</code>
        </pre>
      ) : (
        <div className="preview-placeholder">
          <p>The script preview appears when every field is valid.</p>
        </div>
      )}

      <footer className="preview-footer">
        <p>
          Download the script or run it through the local runner below. The preview
          itself never contacts the target URL.
        </p>
        <a href={K6_DOCS_URL} target="_blank" rel="noreferrer">
          k6 documentation ↗
        </a>
      </footer>
    </aside>
  );
}