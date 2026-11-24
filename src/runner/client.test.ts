import { afterEach, describe, expect, it, vi } from 'vitest';
import { startK6Run, type RunnerHandlers } from './client';

const config = {
  request: { url: 'https://test.k6.io/', method: 'GET' },
  workload: { executor: 'constant-vus', vus: '1', duration: '2s' },
};

function sseBody(events: Array<Record<string, unknown>>): string {
  return events
    .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

describe('startK6Run', () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('posts the config as-is and forwards streamed events', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(202, { id: 'run-1' }))
      .mockResolvedValueOnce(
        new Response(
          sseBody([
            { type: 'start', message: 'started' },
            { type: 'stdout', text: 'running\n' },
            { type: 'done', code: 0, signal: null, durationMs: 1200 },
          ]),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );

    const handlers: RunnerHandlers = {
      onStart: vi.fn(),
      onOutput: vi.fn(),
      onError: vi.fn(),
      onDone: vi.fn(),
    };
    const done = new Promise<void>((resolve) => {
      handlers.onDone = vi.fn(() => resolve());
    });

    const run = await startK6Run(config, handlers);
    await done;

    expect(run.runId).toBe('run-1');
    expect(handlers.onStart).toHaveBeenCalledWith('run-1');
    expect(handlers.onOutput).toHaveBeenCalledWith('running\n');
    expect(handlers.onDone).toHaveBeenCalledWith({ code: 0, signal: null });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/run');
    expect(JSON.parse(String(init.body))).toEqual(config);
  });

  it('surfaces validation errors from the runner', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, { error: 'The configuration is not valid, so nothing was run.' }),
    );

    await expect(
      startK6Run(config, {
        onStart: vi.fn(),
        onOutput: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn(),
      }),
    ).rejects.toThrow(/not valid/i);
  });

  it('explains how to start an unreachable runner', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(
      startK6Run(config, {
        onStart: vi.fn(),
        onOutput: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn(),
      }),
    ).rejects.toThrow(/npm run runner/);
  });
});