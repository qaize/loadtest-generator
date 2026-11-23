import { useCallback, useMemo, useState } from 'react';
import { ChecksSection } from './components/ChecksSection';
import { GuideModal } from './components/GuideModal';
import { HttpBehaviorSection } from './components/HttpBehaviorSection';
import { OptionalGroup } from './components/OptionalGroup';
import { PacingSection } from './components/PacingSection';
import { PreviewPanel } from './components/PreviewPanel';
import { RequestSection } from './components/RequestSection';
import { TagsSection } from './components/TagsSection';
import { ThresholdsSection } from './components/ThresholdsSection';
import { WorkloadSection } from './components/WorkloadSection';
import { createDefaultDraft } from './config/defaults';
import { fileNameError, normalizeFileName } from './config/filename';
import { DEFAULT_SCRIPT_FILENAME } from './config/options';
import type { CurlImport as CurlImportValue } from './curl/parseCurl';
import type {
  ChecksDraft,
  HttpBehaviorDraft,
  LoadTestDraft,
  PacingDraft,
  RequestDraft,
  TagsDraft,
  ThresholdsDraft,
  WorkloadDraft,
} from './config/types';
import { issuesUnder, validateConfig } from './config/validation';
import { downloadK6Script } from './download/downloadScript';
import { generateK6Script } from './generator/generateScript';

export default function App() {
  const [draft, setDraft] = useState<LoadTestDraft>(createDefaultDraft);
  const [fileName, setFileName] = useState(DEFAULT_SCRIPT_FILENAME);
  const [guideOpen, setGuideOpen] = useState(false);

  const closeGuide = useCallback(() => setGuideOpen(false), []);

  const { validation, script } = useMemo(() => {
    const result = validateConfig(draft);
    return {
      validation: result,
      script:
        result.valid && result.config ? generateK6Script(result.config) : null,
    };
  }, [draft]);

  const filenameIssue = fileNameError(fileName);

  function updateRequest(patch: Partial<RequestDraft>) {
    setDraft((current) => ({
      ...current,
      request: { ...current.request, ...patch },
    }));
  }

  function updateWorkload(patch: Partial<WorkloadDraft>) {
    setDraft((current) => ({
      ...current,
      workload: { ...current.workload, ...patch },
    }));
  }

  function updateThresholds(next: ThresholdsDraft) {
    setDraft((current) => ({ ...current, thresholds: next }));
  }

  function updateChecks(next: ChecksDraft) {
    setDraft((current) => ({ ...current, checks: next }));
  }

  function updateTags(next: TagsDraft) {
    setDraft((current) => ({ ...current, tags: next }));
  }

  function updateHttp(patch: Partial<HttpBehaviorDraft>) {
    setDraft((current) => ({
      ...current,
      http: { ...current.http, ...patch },
    }));
  }

  function updatePacing(patch: Partial<PacingDraft>) {
    setDraft((current) => ({
      ...current,
      pacing: { ...current.pacing, ...patch },
    }));
  }

  function handleCurlImport(value: CurlImportValue) {
    setDraft((current) => ({
      ...current,
      request: { ...current.request, ...value.request },
      http:
        Object.keys(value.http).length > 0
          ? { ...current.http, ...value.http, enabled: true }
          : current.http,
    }));
  }

  function handleDownload() {
    if (script && !filenameIssue) {
      downloadK6Script(script, normalizeFileName(fileName));
    }
  }

  const issues = validation.issues;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            k6
          </span>
          <div>
            <p className="brand-kicker">Script builder</p>
            <h1>Load Test Builder</h1>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="guide-button"
            aria-haspopup="dialog"
            onClick={() => setGuideOpen(true)}
          >
            <span className="guide-dot" aria-hidden="true">
              ?
            </span>
            Scenario guide
          </button>
          <div className="header-note">
            <span className="live-dot" aria-hidden="true" />
            Configure · Preview · Export
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="hero" aria-labelledby="hero-heading">
          <div>
            <p className="eyebrow">Grafana k6 · script export</p>
            <h2 id="hero-heading">
              Shape a load test. Export a script you can review.
            </h2>
            <p>
              Build a single-scenario HTTP test with documented k6 options,
              inspect the generated JavaScript, then download it with the file
              name you choose — <code>blabla.js</code> by default.
            </p>
          </div>
          <p className="hero-badge">
            <strong>Export only</strong>
            No test runs from this page.
          </p>
        </section>

        <div className="workspace">
          <form
            className="config-column"
            onSubmit={(event) => event.preventDefault()}
            noValidate
          >
            <RequestSection
              request={draft.request}
              issues={issues}
              onChange={updateRequest}
              onImportCurl={handleCurlImport}
            />

            <WorkloadSection
              workload={draft.workload}
              issues={issues}
              onChange={updateWorkload}
            />

            <section className="optional-stack" aria-labelledby="optional-heading">
              <div className="section-intro">
                <p className="eyebrow">03 · Optional settings</p>
                <h2 id="optional-heading">Sections to include</h2>
                <p>
                  Each section has its own switch. Turned-off sections are left
                  out of the exported script entirely.
                </p>
              </div>

              <OptionalGroup
                id="thresholds"
                title="Thresholds"
                description="Pass/fail criteria written into options.thresholds."
                enabled={draft.thresholds.enabled}
                errorCount={issuesUnder(issues, 'thresholds').length}
                onEnabledChange={(enabled) =>
                  updateThresholds({ ...draft.thresholds, enabled })
                }
              >
                <ThresholdsSection
                  thresholds={draft.thresholds}
                  issues={issues}
                  onChange={updateThresholds}
                />
              </OptionalGroup>

              <OptionalGroup
                id="checks"
                title="Checks"
                description="Assertions added after the request with k6 check()."
                enabled={draft.checks.enabled}
                errorCount={issuesUnder(issues, 'checks').length}
                onEnabledChange={(enabled) =>
                  updateChecks({ ...draft.checks, enabled })
                }
              >
                <ChecksSection
                  checks={draft.checks}
                  issues={issues}
                  onChange={updateChecks}
                />
              </OptionalGroup>

              <OptionalGroup
                id="tags"
                title="Tags"
                description="Test-wide tags applied through options.tags."
                enabled={draft.tags.enabled}
                errorCount={issuesUnder(issues, 'tags').length}
                onEnabledChange={(enabled) => updateTags({ ...draft.tags, enabled })}
              >
                <TagsSection tags={draft.tags} issues={issues} onChange={updateTags} />
              </OptionalGroup>

              <OptionalGroup
                id="http"
                title="HTTP behavior"
                description="User agent, redirects, connection, TLS, and request timeout."
                enabled={draft.http.enabled}
                errorCount={issuesUnder(issues, 'http').length}
                onEnabledChange={(enabled) => updateHttp({ enabled })}
              >
                <HttpBehaviorSection
                  http={draft.http}
                  issues={issues}
                  onChange={updateHttp}
                />
              </OptionalGroup>

              <OptionalGroup
                id="pacing"
                title="Iteration pacing"
                description="Adds k6 sleep() after each iteration to create think time."
                enabled={draft.pacing.enabled}
                errorCount={issuesUnder(issues, 'pacing').length}
                onEnabledChange={(enabled) => updatePacing({ enabled })}
              >
                <PacingSection
                  pacing={draft.pacing}
                  issues={issues}
                  onChange={updatePacing}
                />
              </OptionalGroup>
            </section>

            <section className="scope-card" aria-labelledby="scope-heading">
              <div>
                <p className="eyebrow">Scope</p>
                <h2 id="scope-heading">Supported in this version</h2>
                <ul className="scope-list">
                  <li>One HTTP request: URL, method, headers, JSON or text body</li>
                  <li>Import URL, method, headers, and body from a cURL command</li>
                  <li>All six documented k6 executors, including stages</li>
                  <li>Structured thresholds on built-in HTTP metrics</li>
                  <li>Status, body-content, and response-time checks</li>
                  <li>Test-wide tags and selected HTTP options</li>
                  <li>Iteration sleep and a live script preview</li>
                  <li>Editable export file name, defaulting to blabla.js</li>
                </ul>
              </div>
              <div className="scope-deferred">
                <h2>Deferred</h2>
                <ul className="scope-list">
                  <li>Multiple scenarios and setup/teardown lifecycle hooks</li>
                  <li>Custom metrics and arbitrary threshold expressions</li>
                  <li>Arbitrary JavaScript or arbitrary CLI flags</li>
                  <li>Form-data, file uploads, cookies, and auth helpers</li>
                  <li>Browser, gRPC, and WebSocket APIs or k6 extensions</li>
                  <li>Result outputs, cloud execution, and test history</li>
                </ul>
              </div>
            </section>
          </form>

          <PreviewPanel
            script={script}
            issues={issues}
            warnings={validation.warnings}
            fileName={fileName}
            fileNameError={filenameIssue}
            onFileNameChange={setFileName}
            onDownload={handleDownload}
          />
        </div>
      </main>

      <footer className="app-footer">
        <p>Local configuration and export only. No backend, no saved tests.</p>
        <p>Not affiliated with Grafana Labs.</p>
      </footer>

      <GuideModal open={guideOpen} onClose={closeGuide} />
    </div>
  );
}