# k6 Load Test Builder

A small React + TypeScript app for configuring one Grafana k6 HTTP load test, previewing the generated JavaScript, downloading it as a `.js` file — **`blabla.js` by default, or any valid name you type** — and optionally running it through a local k6 runner.

The browser still only configures, previews, and exports. A separate **local runner** (`npm run runner`) is required to execute k6: the browser cannot start processes, and running on your machine is what makes VPN-only targets reachable. See [Local runner](#local-runner).

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

The modal also includes a worked example and the reminder that the browser itself never runs k6. It closes with `Escape`, the close button, the backdrop, or the **Start building** button; focus is trapped inside and returned to the trigger on close.

## Local runner

The **Run against a local k6** panel sends the form to a small Node server that rebuilds the script from the form, runs k6 on your machine, and streams the output back over Server-Sent Events.

Why a local runner:

- Browsers cannot spawn `k6`.
- Traffic must leave from your network, so targets reachable only through your VPN work.
- Deploying this UI to a remote host does **not** let it call a runner on your laptop. The page and runner must run on the same machine (or the runner must be exposed deliberately, which is not recommended).

### Requirements

- k6 installed and on `PATH` (`k6 version`), or set `K6_BINARY` to the executable.
- Node 22+ (the repo already requires a modern Node for Vite).

### Run it

```bash
npm install
npm run runner   # terminal 1: http://127.0.0.1:8787
npm run dev      # terminal 2: http://localhost:5173
```

Open the app and press **Run test locally** in the panel under the preview. **Stop** terminates k6 and keeps the final exit signal.

### What the runner does

1. Receives the draft configuration as JSON (`POST /run`).
2. Re-validates it on the server. Invalid input is rejected with `422`; the browser-side validation is never trusted.
3. Generates a temporary `loadtest.js`, runs `k6 run --summary-export summary.json --quiet loadtest.js`, and deletes the directory afterwards. `--quiet` hides the per-second progress lines; the final summary and any errors are still streamed.
4. Streams `start`, `stdout`, `stderr`, and `done` events through `GET /runs/:id` (SSE).
5. Stops the process through `POST /stop/:id`.

### Safety limits

- Binds to `127.0.0.1` by default and rejects non-loopback origins, so a website on the internet cannot drive it. `npm run dev -- --host` would expose the Vite proxy, so keep the dev server on localhost when the runner is running.
- Never accepts arbitrary JavaScript or arbitrary CLI flags, only the structured form fields.
- 64 KB request-body limit, one process per run, and a 10-minute wall-clock limit.
- Job output is kept in memory only for the run and five minutes after it finishes.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `K6_BINARY` | `k6` | Path to the k6 executable |
| `K6_RUNNER_HOST` | `127.0.0.1` | Bind address |
| `K6_RUNNER_PORT` | `8787` | Port |
| `K6_RUNNER_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Extra allowed origins; loopback origins on any port are always allowed |
| `K6_RUNNER_MAX_MS` | `600000` | Hard per-run time limit in milliseconds |

If the target needs a VPN, connect the VPN first and confirm it works from the same terminal:

```bash
k6 run blabla.js
```

The runner inherits the machine's network stack. A full-tunnel VPN is used automatically; for split tunneling, make sure the target's route goes through the VPN.

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
  runner/
    client.ts         Browser client for the local runner (POST + SSE)
  download/
    downloadScript.ts Browser download behavior
  components/         Focused UI controls, preview, and run panel
  App.tsx             State orchestration
  styles.css          Responsive interface styles
server/
  runner.ts           Local k6 HTTP runner (Node, SSE, stop)
```

## Commands

```bash
npm install
npm run dev        # start the app
npm run runner     # start the local k6 runner on 127.0.0.1:8787
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm test           # Vitest unit and UI tests
npm run build      # typecheck + production build
npm run preview    # preview the production build (also proxies the runner)
```

## Documentation verified

- https://grafana.com/docs/k6/latest/
- https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/
- https://grafana.com/docs/k6/latest/using-k6/scenarios/
- https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/
- https://grafana.com/docs/k6/latest/using-k6/thresholds/
- https://grafana.com/docs/k6/latest/using-k6/checks/
- https://grafana.com/docs/k6/latest/javascript-api/k6-http/request/