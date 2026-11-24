import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "../src/config/validation";
import { generateK6Script } from "../src/generator/generateScript";
import type { LoadTestDraft } from "../src/config/types";

const HOST = process.env.K6_RUNNER_HOST ?? "127.0.0.1";
const PORT = Number(process.env.K6_RUNNER_PORT ?? 8787);
const ALLOWED_ORIGINS = (
  process.env.K6_RUNNER_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const K6_BINARY = process.env.K6_BINARY ?? "k6";
const requestedLimit = Number(process.env.K6_RUNNER_MAX_MS ?? 10 * 60 * 1000);
const GRACEFUL_TIMEOUT_MS =
  Number.isFinite(requestedLimit) && requestedLimit > 0
    ? requestedLimit
    : 10 * 60 * 1000;
const CONFIG_BODY_LIMIT = 64 * 1024;

const here = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(here, "..");

interface JobEvent {
  type:
    | "start"
    | "stdout"
    | "stderr"
    | "done"
    | "error"
    | "killed"
    | "shutdown";
  text?: string;
  code?: number | null;
  signal?: NodeJS.Signals | null;
  message?: string;
  durationMs?: number;
}

interface Job {
  id: string;
  process: ChildProcess;
  events: JobEvent[];
  subscribers: Set<http.ServerResponse>;
  finished: boolean;
  startedAt: number;
}

const jobs = new Map<string, Job>();

function json(
  response: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return (
      (host === "localhost" || host === "127.0.0.1" || host === "[::1]") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

function applyCors(response: http.ServerResponse, request: http.IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin !== undefined && !ALLOWED_ORIGINS.includes(origin) && !isLoopbackOrigin(origin)) {
    return false;
  }
  response.setHeader("Access-Control-Allow-Origin", origin ?? ALLOWED_ORIGINS[0]);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return true;
}

function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > CONFIG_BODY_LIMIT) {
        rejectBody(new Error("The configuration payload is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        rejectBody(new Error("The request body is not valid JSON."));
      }
    });
    request.on("error", rejectBody);
  });
}

function publish(job: Job, event: JobEvent): void {
  job.events.push(event);
  for (const subscriber of job.subscribers) {
    writeEvent(subscriber, event);
  }
}

function writeEvent(response: http.ServerResponse, event: JobEvent): void {
  if (response.writableEnded) {
    return;
  }
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function finishJob(job: Job, event: JobEvent): void {
  if (job.finished) {
    return;
  }
  job.finished = true;
  publish(job, event);
  for (const subscriber of job.subscribers) {
    subscriber.end();
  }
  job.subscribers.clear();

  const cleanup = setTimeout(() => jobs.delete(job.id), 5 * 60 * 1000);
  cleanup.unref();
}

function isLoadTestDraft(value: unknown): value is LoadTestDraft {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.request === "object" &&
    candidate.request !== null &&
    typeof candidate.workload === "object" &&
    candidate.workload !== null
  );
}

async function startRun(request: http.IncomingMessage, response: http.ServerResponse) {
  let payload: unknown;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    json(response, 400, {
      error: error instanceof Error ? error.message : "Could not read the request body.",
    });
    return;
  }

  if (!isLoadTestDraft(payload)) {
    json(response, 400, { error: "Send the builder configuration as a JSON object." });
    return;
  }

  const validation = validateConfig(payload);
  if (!validation.valid || !validation.config) {
    json(response, 422, {
      error: "The configuration is not valid, so nothing was run.",
      issues: validation.issues,
    });
    return;
  }

  const script = generateK6Script(validation.config);
  const directory = await mkdtemp(join(tmpdir(), "k6-builder-"));
  const scriptPath = join(directory, "loadtest.js");
  await writeFile(scriptPath, script, "utf8");

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const summaryPath = join(directory, "summary.json");

  const child = spawn(
    K6_BINARY,
    ["run", "--summary-export", summaryPath, "--quiet", scriptPath],
    {
      cwd: projectRoot,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  const job: Job = {
    id,
    process: child,
    events: [],
    subscribers: new Set(),
    finished: false,
    startedAt: Date.now(),
  };
  jobs.set(id, job);

  const timer = setTimeout(() => {
    publish(job, {
      type: "stderr",
      text: `\n[runner] Time limit of ${Math.round(GRACEFUL_TIMEOUT_MS / 1000)}s reached, stopping k6.\n`,
    });
    child.kill();
  }, GRACEFUL_TIMEOUT_MS);

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => publish(job, { type: "stdout", text: chunk }));
  child.stderr?.on("data", (chunk: string) => publish(job, { type: "stderr", text: chunk }));

  child.on("error", (error: NodeJS.ErrnoException) => {
    clearTimeout(timer);
    const message =
      error.code === "ENOENT"
        ? `k6 was not found. Install it or set K6_BINARY (tried "${K6_BINARY}").`
        : error.message;
    finishJob(job, { type: "error", message });
    void rm(directory, { recursive: true, force: true });
  });

  child.on("close", (code, signal) => {
    clearTimeout(timer);
    finishJob(job, {
      type: "done",
      code,
      signal,
      durationMs: Date.now() - job.startedAt,
    });
    void rm(directory, { recursive: true, force: true });
  });

  publish(job, {
    type: "start",
    message: `k6 run started · ${validation.config.request.method} ${validation.config.request.url}`,
  });

  json(response, 202, { id });
}

function streamJob(jobId: string, request: http.IncomingMessage, response: http.ServerResponse) {
  const job = jobs.get(jobId);
  if (!job) {
    json(response, 404, { error: "That run has already finished or never existed." });
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write(": connected\n\n");

  for (const event of job.events) {
    writeEvent(response, event);
  }

  if (job.finished) {
    response.end();
    return;
  }

  job.subscribers.add(response);
  const heartbeat = setInterval(() => response.write(": ping\n\n"), 15_000);

  const detach = () => {
    clearInterval(heartbeat);
    job.subscribers.delete(response);
  };
  request.on("close", detach);
  response.on("close", detach);
}

function killJob(jobId: string, response: http.ServerResponse) {
  const job = jobs.get(jobId);
  if (!job) {
    json(response, 404, { error: "That run has already finished or never existed." });
    return;
  }
  if (job.finished) {
    json(response, 409, { error: "That run has already finished." });
    return;
  }

  publish(job, { type: "stderr", text: "\n[runner] Stop requested, sending SIGTERM to k6.\n" });
  job.process.kill();
  json(response, 202, { id: job.id, stopping: true });
}

const server = http.createServer((request, response) => {
  void handle(request, response);
});

async function handle(request: http.IncomingMessage, response: http.ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (!applyCors(response, request)) {
    json(response, 403, { error: "Origin not allowed." });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (url.pathname === "/health" && request.method === "GET") {
    json(response, 200, { ok: true, k6: K6_BINARY });
    return;
  }

  if (url.pathname === "/run" && request.method === "POST") {
    try {
      await startRun(request, response);
    } catch (error) {
      json(response, 500, {
        error: error instanceof Error ? error.message : "Could not start k6.",
      });
    }
    return;
  }

  const jobRoute = /^\/(runs|stop)\/([a-z0-9-]+)$/.exec(url.pathname);
  if (jobRoute) {
    const [, action, jobId] = jobRoute;
    if (action === "runs" && request.method === "GET") {
      streamJob(jobId, request, response);
      return;
    }
    if (action === "stop" && request.method === "POST") {
      killJob(jobId, response);
      return;
    }
  }

  json(response, 404, { error: "Unknown route." });
}

server.listen(PORT, HOST, () => {
  console.log(`k6 runner listening on http://${HOST}:${PORT}`);
  console.log(`k6 binary: ${K6_BINARY}`);
  console.log(`allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});

function shutdown() {
  for (const job of jobs.values()) {
    if (!job.finished) {
      publish(job, { type: "shutdown", message: "The runner is shutting down." });
      job.process.kill();
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);