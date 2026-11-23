# k6 Load Test Builder

A small React + TypeScript app for configuring one Grafana k6 HTTP load test, previewing the generated JavaScript, and downloading it as a `.js` file — **`blabla.js` by default, or any valid name you type**.

This version is **configuration and export only**:

- It does **not** run k6 or start a process.
- It does **not** send requests to the target URL.
- It has no backend, saved configurations, or test history.
- There are no Start/Stop controls.

## Supported settings

### Request

- Target URL (`http://` or `https://`)
- Method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- Headers with duplicate, token, CRLF, and length validation
- Optional JSON or raw text body
- JSON bodies get an automatic `Content-Type: application/json` header when no Content-Type is supplied
- Bodies are rejected for `GET` and `HEAD`

### cURL import

Paste a command from your browser's **Copy as cURL** menu (bash, Windows CMD, or PowerShell formats). The importer fills in the URL, method, headers, body, and supported HTTP options. Pasting a command that starts with `curl` imports immediately; the **Import cURL** button or `Ctrl + Enter` does the same.

Supported flags: `--url`, `-X/--request`, `-H/--header`, `-d/--data*/--json`, `-I/--head`, `-G/--get`, `-u/--user`, `-A/--user-agent`, `-e/--referer`, `-b/--cookie`, `-k/--insecure`, `-m/--max-time`, `--max-redirs`, `--no-keepalive`. Harmless transfer flags such as `--compressed`, `-L`, `-s`, and `-i` are ignored.

Not supported: multipart `-F`, uploads `-T`, proxies, client certificates, cookie jars, and config files. Unsupported flags produce a warning; unsupported request shapes produce an error instead of a partial import.

### Workload

All six documented k6 executors are available:

- `constant-vus`
- `ramping-vus` with stages
- `shared-iterations`
- `per-vu-iterations`
- `constant-arrival-rate`
- `ramping-arrival-rate` with stages

Optional scenario timing: `startTime`, `gracefulStop`, and `gracefulRampDown` for ramping VUs.

### Optional, switchable sections

Each section has an enable checkbox. Disabled sections are omitted from the exported script entirely.

- **Thresholds** — structured rules over documented built-in metrics (`http_req_duration`, `http_req_waiting`, `http_req_failed`, `http_reqs`, `iterations`, `checks`), with aggregation, operator, value, `abortOnFail`, and optional `delayAbortEval`
- **Checks** — status code, response body contains text, or response time under a limit
- **Tags** — test-wide `options.tags`
- **HTTP behavior** — user agent, max redirects, request timeout, discard response bodies, disable connection reuse, skip TLS verification
- **Iteration pacing** — adds `sleep()` after each iteration

### Deferred in this version

- Multiple scenarios or scenario selection
- `setup` / `teardown` lifecycle hooks
- Custom metrics and arbitrary threshold expressions
- Arbitrary JavaScript or arbitrary CLI flags
- Form-data, file uploads, cookies, authentication helpers
- Browser, gRPC, WebSocket APIs, and k6 extensions
- Result outputs, cloud execution, and test history
- Custom CAs, client certificates, and other advanced TLS options

## Scenario guide

The **Scenario guide** button in the header opens an accessible modal that explains the three builder steps in full:

- **Step 1 — Request and payload:** URL, method rules, headers, body formats, and the cURL importer (including credential-sharing warnings).
- **Step 2 — Workload and executor:** a comparison table for all six executors, duration syntax, stage rules, arrival-rate sizing, and advanced scenario timing.
- **Step 3 — Optional settings and export:** thresholds, checks, tags, HTTP behavior, pacing, and file-name/download rules.

The modal also includes a worked example and the reminder that scripts are exported only. It closes with `Escape`, the close button, the backdrop, or the **Start building** button; focus is trapped inside and returned to the trigger on close.

## Generated script

`src/generator/generateScript.ts` accepts only a validated `LoadTestConfig` and returns a deterministic script. It uses documented k6 APIs:

- `import http from "k6/http"`
- `import { check, sleep } from "k6"` only when needed
- `export const options = { scenarios: { main: ... } }`
- `http.request(method, url, body?, params?)`
- `check(response, { ... })`
- `sleep(seconds)`

Untrusted values are serialized with a JSON-based literal serializer (`src/generator/serialize.ts`). Strings, object keys, `__proto__` keys, line/paragraph separators, and nested JSON are escaped or emitted as safe object properties. The generator never interpolates user input as executable code and only uses catalog values for option names, metric names, and predicate operators.

The tests parse every generated script with Acorn as an ES module and walk the AST to confirm that injected text did not become executable code.

## Download behavior

The **File name** field in the export panel defaults to `blabla.js` and is editable. A name must:

- end in `.js`
- have a non-empty base name
- contain no path separators or characters Windows rejects (`< > : " / \ | ? *`), and no control characters
- stay within 80 characters
- not be a Windows reserved device name (`CON`, `NUL`, `COM1`, and so on)

While the name is invalid, the download button is disabled and the field shows the specific problem; the script preview stays visible. On download, `src/download/downloadScript.ts` creates a `Blob` with JavaScript MIME type, creates an object URL, triggers a hidden anchor with `download="<your name>"`, removes the anchor, and revokes the URL. The download logic is independent of React and covered by a unit test.

## Project structure

```text
src/
  config/
    options.ts        Supported method, executor, metric, and check catalogs
    types.ts          Draft and validated configuration models
    defaults.ts       Safe default form values
    validation.ts     Validation schema and normalization
    filename.ts       Export file name rules
  generator/
    generateScript.ts Deterministic k6 script generator
    serialize.ts      Safe JavaScript literal serialization
  curl/
    parseCurl.ts      cURL command tokenizer and importer
  download/
    downloadScript.ts Browser download behavior
  components/         Focused UI controls and preview panel
  App.tsx             State orchestration
  styles.css          Responsive interface styles
```

## Commands

```bash
npm install
npm run dev        # start the app
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm test           # Vitest unit and UI tests
npm run build      # typecheck + production build
npm run preview    # preview the production build
```

## Documentation verified

- https://grafana.com/docs/k6/latest/
- https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/
- https://grafana.com/docs/k6/latest/using-k6/scenarios/
- https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/
- https://grafana.com/docs/k6/latest/using-k6/thresholds/
- https://grafana.com/docs/k6/latest/using-k6/checks/
- https://grafana.com/docs/k6/latest/javascript-api/k6-http/request/