export interface RunnerHandlers {
  onStart: (runId: string) => void;
  onOutput: (chunk: string) => void;
  onError: (message: string) => void;
  onDone: (summary: { code: number | null; signal: string | null }) => void;
}

const RUNNER_TIMEOUT_MS = 30 * 60 * 1000;

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { error?: unknown }).error === "string"
    ) {
      return (body as { error: string }).error;
    }
  } catch {
    // Fall through to the generic message.
  }
  return `The runner responded with ${response.status}.`;
}

function parseEvent(data: string): {
  type?: string;
  text?: string;
  message?: string;
  code?: number | null;
  signal?: string | null;
} | null {
  try {
    return JSON.parse(data) as ReturnType<typeof parseEvent>;
  } catch {
    return null;
  }
}

function readStream(runId: string, handlers: RunnerHandlers): AbortController {
  const controller = new AbortController();

  void (async () => {
    try {
      const response = await fetch(`/runs/${runId}`, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        handlers.onError(await readError(response));
        return;
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += value;

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");

          const dataLine = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!dataLine) {
            continue;
          }

          const event = parseEvent(dataLine);
          if (!event) {
            continue;
          }

          if (event.type === "stdout" || event.type === "stderr") {
            handlers.onOutput(event.text ?? "");
          } else if (event.type === "error") {
            handlers.onError(event.message ?? "k6 could not start.");
          } else if (event.type === "done") {
            handlers.onDone({ code: event.code ?? null, signal: event.signal ?? null });
          } else if (event.type === "shutdown") {
            handlers.onError(event.message ?? "The runner stopped.");
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        handlers.onError(
          error instanceof Error ? error.message : "Lost the connection to the runner.",
        );
      }
    }
  })();

  return controller;
}

export interface StartRunResult {
  runId: string;
  cancel: () => void;
}

/**
 * Sends the builder configuration to the local runner and streams k6 output.
 * The runner regenerates the script from the configuration, so no arbitrary
 * JavaScript is executed.
 */
export async function startK6Run(
  config: unknown,
  handlers: RunnerHandlers,
): Promise<StartRunResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, RUNNER_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
      signal: controller.signal,
    });
  } catch {
    window.clearTimeout(timeout);
    throw new Error(
      timedOut
        ? "The runner did not answer in time. Check the terminal running `npm run runner`."
        : "The local runner is not reachable. Start it with `npm run runner`, then try again.",
    );
  }

  if (!response.ok) {
    const message = await readError(response);
    window.clearTimeout(timeout);
    throw new Error(message);
  }

  const { id } = (await response.json()) as { id: string };
  window.clearTimeout(timeout);
  handlers.onStart(id);

  const stream = readStream(id, handlers);

  return {
    runId: id,
    cancel: () => {
      // Ask the runner to terminate k6 and keep the event stream open so the
      // final `done` event can still report the exit signal.
      void fetch(`/stop/${id}`, { method: "POST" }).catch(() => undefined);
      window.setTimeout(() => stream.abort(), 5_000);
    },
  };
}