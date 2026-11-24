import { useEffect, useRef } from 'react';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

const EXECUTORS = [
  {
    name: 'constant-vus',
    behavior: 'A fixed number of VUs iterate for a set duration.',
    useWhen: 'Baseline, soak, or smoke tests with a known user count.',
  },
  {
    name: 'ramping-vus',
    behavior: 'VUs ramp up or down through target/duration stages.',
    useWhen: 'Spikes, stress tests, and gradual warm-ups.',
  },
  {
    name: 'shared-iterations',
    behavior: 'All VUs share one fixed pool of iterations.',
    useWhen: 'You need a fixed amount of work, regardless of timing.',
  },
  {
    name: 'per-vu-iterations',
    behavior: 'Every VU completes the same number of iterations.',
    useWhen: 'Each simulated user should behave identically.',
  },
  {
    name: 'constant-arrival-rate',
    behavior: 'Iterations start at a fixed rate, independent of response time.',
    useWhen: 'You must sustain a request rate, such as 20 req/s.',
  },
  {
    name: 'ramping-arrival-rate',
    behavior: 'The arrival rate changes through stages.',
    useWhen: 'Traffic ramps toward a target RPS profile.',
  },
] as const;

export function GuideModal({ open, onClose }: GuideModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], summary, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-heading"
        aria-describedby="guide-lead"
        ref={modalRef}
      >
        <header className="guide-head">
          <div>
            <p className="eyebrow">Scenario guide</p>
            <h2 id="guide-heading">Build a k6 scenario in three steps</h2>
            <p className="guide-lead" id="guide-lead">
              Every exported script sends one HTTP request repeatedly. Steps 1–3
              describe what is sent, how much load is applied, and which optional
              pass/fail rules are added before the download.
            </p>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close scenario guide"
            onClick={onClose}
            ref={closeRef}
          >
            ×
          </button>
        </header>

        <nav className="guide-nav" aria-label="Guide steps">
          <a href="#guide-step-1">1 · Request</a>
          <a href="#guide-step-2">2 · Workload</a>
          <a href="#guide-step-3">3 · Optional settings &amp; export</a>
        </nav>

        <section className="guide-step" id="guide-step-1">
          <p className="guide-step-label">Step 1</p>
          <h3>Request and payload</h3>
          <p>
            This is the single HTTP call that the scenario repeats. The generated
            script uses it for every iteration, so keep the target focused and
            review what is actually being sent.
          </p>
          <ul>
            <li>
              <strong>Target URL.</strong> A complete <code>http://</code> or{' '}
              <code>https://</code> URL, including path and query string. The
              builder never contacts it; only the optional local runner does, from
              your own machine.
            </li>
            <li>
              <strong>HTTP method.</strong> <code>GET</code> and <code>HEAD</code>{' '}
              cannot carry a body. <code>POST</code>, <code>PUT</code>,{' '}
              <code>PATCH</code>, <code>DELETE</code>, and <code>OPTIONS</code>{' '}
              can.
            </li>
            <li>
              <strong>Headers.</strong> One row per name and value. Empty rows are
              ignored and duplicate names are rejected. A JSON body automatically
              adds <code>Content-Type: application/json</code> unless you define
              your own Content-Type header.
            </li>
            <li>
              <strong>Body.</strong> Choose <em>None</em>, <em>JSON</em>, or{' '}
              <em>Raw text</em>. JSON must parse; raw text is sent as-is.
            </li>
          </ul>
          <p className="guide-subhead">Faster path: import from cURL</p>
          <p>
            Copy a request from DevTools → Network → <em>Copy as cURL</em>, then
            paste it into the import box. URL, method, headers, body, timeout,
            redirects, and TLS settings fill in automatically. bash, Windows CMD,
            and PowerShell formats are supported. Cookie and{' '}
            <code>Authorization</code> headers are imported as well, so never share
            an exported script that contains real credentials.
          </p>
          <p className="guide-note">
            Quick examples: <code>GET https://test.k6.io/</code>, or{' '}
            <code>POST</code> to <code>http://localhost:8080/post</code> with{' '}
            <code>{'{"name":"Ada"}'}</code>.
          </p>
        </section>

        <section className="guide-step" id="guide-step-2">
          <p className="guide-step-label">Step 2</p>
          <h3>Workload and executor</h3>
          <p>
            The workload decides how many users or iterations k6 runs and for how
            long. Pick the executor that matches the question you want the test to
            answer.
          </p>
          <div className="table-scroll">
            <table className="executor-table">
              <thead>
                <tr>
                  <th scope="col">Executor</th>
                  <th scope="col">Behavior</th>
                  <th scope="col">Choose it when</th>
                </tr>
              </thead>
              <tbody>
                {EXECUTORS.map((executor) => (
                  <tr key={executor.name}>
                    <td>
                      <code>{executor.name}</code>
                    </td>
                    <td>{executor.behavior}</td>
                    <td>{executor.useWhen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul>
            <li>
              <strong>VUs</strong> is the number of parallel virtual users, from 1
              to 100,000.
            </li>
            <li>
              <strong>Durations</strong> use k6 syntax: <code>500ms</code>,{' '}
              <code>30s</code>, <code>2m</code>, or <code>1h30m</code>. A bare
              number is rejected.
            </li>
            <li>
              <strong>Stages</strong> are target/duration pairs. For example,{' '}
              <code>0 → 10</code> over <code>30s</code>, then <code>10 → 0</code>{' '}
              over <code>10s</code>.
            </li>
            <li>
              <strong>Arrival-rate executors</strong> use a rate plus a time unit
              (for example, 50 iterations per <code>1s</code>), with{' '}
              <code>preAllocatedVUs</code> and optional <code>maxVUs</code>. Max
              VUs must be at least the pre-allocated count.
            </li>
            <li>
              <strong>Advanced scenario timing</strong> can delay the start (
              <code>startTime</code>), add a graceful stop window (
              <code>gracefulStop</code>), or control ramping shutdown (
              <code>gracefulRampDown</code>) for ramping VUs.
            </li>
          </ul>
          <p className="guide-note">
            Rule of thumb: use VU-based executors to simulate users, and
            arrival-rate executors when the requirement is expressed as requests
            per second. Start with 5–10 VUs or 30–60 seconds before scaling up.
          </p>
        </section>

        <section className="guide-step" id="guide-step-3">
          <p className="guide-step-label">Step 3</p>
          <h3>Optional settings and export</h3>
          <p>
            Each section has its own switch. Turned-off sections are omitted from
            the script entirely, so the preview shrinks as you disable things you
            do not need.
          </p>
          <ul>
            <li>
              <strong>Thresholds</strong> define pass/fail criteria and the k6 exit
              code. A rule is aggregation + operator + value, for example{' '}
              <code>p(95)&lt;500</code> for response time or{' '}
              <code>rate&lt;0.01</code> for failed requests. <code>abortOnFail</code>{' '}
              stops the test early; <code>delayAbortEval</code> waits before the
              check starts. A threshold on the <code>checks</code> metric needs at
              least one check.
            </li>
            <li>
              <strong>Checks</strong> verify status code, body text, or response
              time. Each check name becomes a submetric under <code>checks</code>.
              Body checks need response bodies, so do not discard them.
            </li>
            <li>
              <strong>Tags</strong> become <code>options.tags</code> and are
              attached to every metric, for example <code>environment: staging</code>.
            </li>
            <li>
              <strong>HTTP behavior</strong> adds a user agent, redirect limit,
              per-request timeout, discarded response bodies, disabled connection
              reuse, or skipped TLS verification. Only disable TLS verification for
              targets you trust.
            </li>
            <li>
              <strong>Iteration pacing</strong> adds <code>sleep()</code> after the
              request and checks. Arrival-rate executors already schedule
              iterations, so k6 recommends against sleeping in those scenarios.
            </li>
            <li>
              <strong>Export</strong> shows the exact script in the preview. The
              download button stays disabled until the configuration and file name
              are valid. The name must end in <code>.js</code> and cannot contain
              path separators or characters Windows rejects.
            </li>
          </ul>
          <p className="guide-note">
            To execute the test, start <code>npm run runner</code> and{' '}
            <code>npm run dev</code>, then press <strong>Run test locally</strong>{' '}
            below the preview. That is the only path that runs k6, and it runs on
            your machine so VPN-only targets are reachable.
          </p>
        </section>

        <section className="guide-example" aria-labelledby="guide-example-heading">
          <h3 id="guide-example-heading">Example: a five-minute checkout smoke test</h3>
          <ul>
            <li>
              <strong>Step 1:</strong> <code>GET https://test.k6.io/</code>.
            </li>
            <li>
              <strong>Step 2:</strong> constant-vus, 20 VUs, <code>5m</code>{' '}
              duration.
            </li>
            <li>
              <strong>Step 3:</strong> thresholds <code>p(95)&lt;500</code> on{' '}
              <code>http_req_duration</code> and <code>rate&lt;0.01</code> on{' '}
              <code>http_req_failed</code>; a check that the status is 200; a tag{' '}
              <code>environment: staging</code>; and one second of pacing.
            </li>
            <li>
              <strong>Export:</strong> keep the default <code>blabla.js</code> or
              type another name, then download and review it before running.
            </li>
          </ul>
          <p>
            Then run it yourself with <code>k6 run blabla.js</code>. Only load-test
            systems you own or have permission to test.
          </p>
        </section>

        <footer className="guide-foot">
          <p>
            The browser never runs k6 by itself. Scripts execute only through the
            local runner you start on your machine, and only against the URL you
            configured.
          </p>
          <button type="button" className="primary-button" onClick={onClose}>
            Start building
          </button>
        </footer>
      </div>
    </div>
  );
}