import { useEffect, useMemo, useRef, useState } from 'react';
import { estimateRunDurationMs, formatRunTime } from '../runner/duration';
import { startK6Run } from '../runner/client';

type RunStatus = 'idle' | 'starting' | 'running' | 'passed' | 'failed' | 'stopped' | 'error';

interface RunPanelProps {
  /** Validated k6 configuration, or null while the form is invalid. */
  config: unknown;
  valid: boolean;
}

const MAX_OUTPUT_CHARS = 200_000;

function statusLabel(status: RunStatus): string {
  switch (status) {
    case 'idle':
      return 'Not started';
    case 'starting':
      return 'Starting';
    case 'running':
      return 'Running';
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'stopped':
      return 'Stopped';
    case 'error':
      return 'Error';
  }
}

export function RunPanel({ config, valid }: RunPanelProps) {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [output, setOutput] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [exitInfo, setExitInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const cancelRef = useRef<(() => void) | null>(null);
  const requestedStopRef = useRef(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const startedAtRef = useRef(0);

  const active = status === 'starting' || status === 'running';
  const blockedByConfig = active && !valid;
  const plannedMs = useMemo(() => estimateRunDurationMs(config), [config]);
  const progress = plannedMs ? Math.min(100, (elapsedMs / plannedMs) * 100) : null;

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 500);

    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    const element = outputRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [output]);

  useEffect(() => () => cancelRef.current?.(), []);

  function appendOutput(chunk: string) {
    setOutput((current) => {
      const next = current + chunk;
      return next.length > MAX_OUTPUT_CHARS
        ? `… earlier output trimmed …\n${next.slice(next.length - MAX_OUTPUT_CHARS)}`
        : next;
    });
  }

  async function handleRun() {
    if (!valid || config === null || active) {
      return;
    }

    cancelRef.current?.();
    cancelRef.current = null;
    requestedStopRef.current = false;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setStatus('starting');
    setOutput('');
    setRunId(null);
    setExitInfo(null);
    setError(null);

    try {
      const run = await startK6Run(config, {
        onStart: (id) => {
          setRunId(id);
          setStatus('running');
        },
        onOutput: appendOutput,
        onError: (message) => {
          setStatus('error');
          setError(message);
        },
        onDone: ({ code, signal }) => {
          cancelRef.current = null;
          setExitInfo(
            signal
              ? `k6 stopped by signal ${signal}`
              : `k6 exited with code ${code === null ? 'unknown' : code}`,
          );
          if (requestedStopRef.current) {
            setStatus('stopped');
          } else if (code === 0) {
            setStatus('passed');
          } else {
            setStatus('failed');
          }
          setRunId(null);
        },
      });
      cancelRef.current = run.cancel;
      setRunId(run.runId);
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'The run could not start.');
    }
  }

  function handleStop() {
    if (!cancelRef.current) {
      return;
    }
    requestedStopRef.current = true;
    cancelRef.current();
    setStatus('stopped');
    setExitInfo('Stop requested. Waiting for k6 to confirm.');
  }

  const hasOutput = output.length > 0;

  return (
    <section className="run-panel" aria-labelledby="run-heading">
      <div className="run-head">
        <div>
          <p className="eyebrow">04 · Local runner</p>
          <h2 id="run-heading">Run against a local k6</h2>
        </div>
        <span className={`run-status run-status--${status}`} aria-live="polite">
          <span className="run-status-dot" aria-hidden="true" />
          {statusLabel(status)}
        </span>
      </div>

      <p className="run-note">
        Traffic leaves from your machine, so anything reachable only through your
        VPN works. The runner rebuilds the script from this form on the server and
        never executes pasted code. A run keeps the settings it started with;
        changes apply to the next run.
      </p>

      <ol className="run-setup">
        <li>
          Terminal 1: <code>npm run runner</code>
        </li>
        <li>
          Terminal 2: <code>npm run dev</code>
        </li>
      </ol>

      <div className="run-actions">
        <button
          type="button"
          className="run-button"
          onClick={() => void handleRun()}
          disabled={!valid || active}
        >
          {active ? 'Running…' : 'Run test locally'}
        </button>
        <button
          type="button"
          className="secondary-button run-stop"
          onClick={handleStop}
          disabled={!active}
        >
          Stop
        </button>
        {runId ? <span className="run-id">run {runId}</span> : null}
      </div>

      {active ? (
        <div className="run-progress" role="timer" aria-label="Run progress">
          <div className="run-progress-meta">
            <span>
              {formatRunTime(elapsedMs)}
              {plannedMs ? ` / ${formatRunTime(plannedMs)}` : ''}
            </span>
            {progress !== null ? (
              <span>{Math.round(progress)}%</span>
            ) : (
              <span>running</span>
            )}
          </div>
          <div className="run-progress-track">
            <div
              className={`run-progress-fill${progress === null ? ' is-indeterminate' : ''}`}
              style={progress === null ? undefined : { width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="run-feedback is-error" role="alert">
          {error}
        </p>
      ) : null}

      {!valid ? (
        <p className="run-feedback" role="status">
          Fix the configuration issues first — the runner only receives valid
          settings.
          {blockedByConfig
            ? ' The run in progress keeps going; press Stop to cancel it.'
            : null}
        </p>
      ) : null}

      {exitInfo ? <p className="run-exit">{exitInfo}</p> : null}

      <pre className="run-output" tabIndex={0} aria-label="Live k6 output" ref={outputRef}>
        <code>
          {hasOutput
            ? output
            : 'Live progress is shown above. Detailed k6 metrics appear here when the run finishes.'}
        </code>
      </pre>

      <p className="run-hint">
        The runner listens on 127.0.0.1 only, rejects unknown origins, enforces a
        10-minute limit per run, and never accepts loose JavaScript.
      </p>
    </section>
  );
}