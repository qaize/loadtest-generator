import { useState } from 'react';
import { parseCurl, type CurlImport as CurlImportValue } from '../curl/parseCurl';

interface CurlImportProps {
  onImport: (value: CurlImportValue) => void;
}

type Feedback =
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string; warnings: string[] };

function describe(value: CurlImportValue): string {
  const details = [
    `${value.request.method} ${value.request.url}`,
    value.request.headers.length > 0
      ? `${value.request.headers.length} header${value.request.headers.length === 1 ? '' : 's'}`
      : null,
    value.request.bodyType !== 'none' ? `${value.request.bodyType} body` : null,
    value.http.timeout ? `timeout ${value.http.timeout}` : null,
    value.http.insecureSkipTLSVerify ? 'TLS verification off' : null,
  ].filter((detail): detail is string => detail !== null);

  return `Imported ${details.join(' · ')}`;
}

export function CurlImport({ onImport }: CurlImportProps) {
  const [command, setCommand] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function runImport(source: string) {
    const result = parseCurl(source);
    if (!result.ok) {
      setFeedback({ kind: 'error', message: result.error });
      return;
    }

    onImport(result.value);
    setFeedback({
      kind: 'success',
      message: describe(result.value),
      warnings: result.value.warnings,
    });
  }

  return (
    <details className="curl-import" open>
      <summary>Import from cURL</summary>
      <p className="group-hint">
        Paste a command from your browser&apos;s &ldquo;Copy as cURL&rdquo;. URL,
        method, headers, body, timeout, redirects, and TLS settings fill in
        automatically.
      </p>
      <label className="sr-only" htmlFor="curl-command">
        cURL command
      </label>
      <textarea
        id="curl-command"
        rows={4}
        spellCheck={false}
        placeholder={
          "curl 'https://api.example.com/orders' \\\n  -H 'accept: application/json' \\\n  --data-raw '{\"qty\":2}'"
        }
        value={command}
        onChange={(event) => {
          setCommand(event.target.value);
          setFeedback(null);
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text');
          if (/^\s*curl(\.exe)?\s/i.test(pasted)) {
            event.preventDefault();
            setCommand(pasted);
            runImport(pasted);
          }
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            runImport(command);
          }
        }}
      />
      <div className="curl-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => runImport(command)}
          disabled={!command.trim()}
        >
          Import cURL
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setCommand('');
            setFeedback(null);
          }}
          disabled={!command && !feedback}
        >
          Clear
        </button>
        <span className="curl-shortcut">Ctrl + Enter</span>
      </div>

      {feedback ? (
        feedback.kind === 'error' ? (
          <p className="curl-feedback is-error" role="alert">
            {feedback.message}
          </p>
        ) : (
          <div className="curl-feedback is-success" role="status">
            <p>{feedback.message}</p>
            {feedback.warnings.length > 0 ? (
              <ul>
                {feedback.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      ) : null}
    </details>
  );
}