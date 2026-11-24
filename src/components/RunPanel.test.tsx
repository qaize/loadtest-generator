import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunPanel } from './RunPanel';
import type { RunnerHandlers, StartRunResult } from '../runner/client';

const { startK6Run } = vi.hoisted(() => ({ startK6Run: vi.fn() }));

vi.mock('../runner/client', () => ({ startK6Run }));

const config = {
  request: { url: 'https://test.k6.io/' },
  workload: { executor: 'constant-vus', duration: '30s' },
};

describe('RunPanel', () => {
  beforeEach(() => {
    startK6Run.mockReset();
  });

  it('runs k6 and reports a passing exit code', async () => {
    const user = userEvent.setup();
    startK6Run.mockImplementation(async (_config, handlers: RunnerHandlers) => {
      handlers.onStart('run-1');
      handlers.onOutput('scenarios: (100.00%) 1 scenario, 1 max VUs\n');
      handlers.onDone({ code: 0, signal: null });
      return { runId: 'run-1', cancel: vi.fn() };
    });

    render(<RunPanel config={config} valid />);
    await user.click(screen.getByRole('button', { name: 'Run test locally' }));

    expect(startK6Run).toHaveBeenCalledWith(config, expect.any(Object));
    expect(await screen.findByText('Passed')).toBeInTheDocument();
    expect(screen.getByLabelText('Live k6 output')).toHaveTextContent('max VUs');
    expect(screen.getByText('k6 exited with code 0')).toBeInTheDocument();
  });

  it('reports a failing exit code', async () => {
    const user = userEvent.setup();
    startK6Run.mockImplementation(async (_config, handlers: RunnerHandlers) => {
      handlers.onStart('run-2');
      handlers.onDone({ code: 99, signal: null });
      return { runId: 'run-2', cancel: vi.fn() };
    });

    render(<RunPanel config={config} valid />);
    await user.click(screen.getByRole('button', { name: 'Run test locally' }));

    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('k6 exited with code 99')).toBeInTheDocument();
  });

  it('stops a run through the cancel handle', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    let release: (() => void) | undefined;

    startK6Run.mockImplementation(
      (_config, handlers: RunnerHandlers) =>
        new Promise<StartRunResult>((resolve) => {
          handlers.onStart('run-3');
          release = () => resolve({ runId: 'run-3', cancel });
        }),
    );

    render(<RunPanel config={config} valid />);
    await user.click(screen.getByRole('button', { name: 'Run test locally' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    });
    expect(release).toBeDefined();
    release?.();

    expect(await screen.findByRole('timer')).toHaveTextContent('00:00 / 00:30');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: 'Stop' }));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('shows runner errors and keeps the button usable', async () => {
    const user = userEvent.setup();
    startK6Run.mockRejectedValue(
      new Error('The local runner is not reachable. Start it with `npm run runner`.'),
    );

    render(<RunPanel config={config} valid />);
    await user.click(screen.getByRole('button', { name: 'Run test locally' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not reachable/i);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run test locally' })).toBeEnabled();
  });

  it('disables the run button while the configuration is invalid', () => {
    render(<RunPanel config={null} valid={false} />);

    expect(screen.getByRole('button', { name: 'Run test locally' })).toBeDisabled();
    expect(screen.getByText(/fix the configuration issues/i)).toBeInTheDocument();
  });
});