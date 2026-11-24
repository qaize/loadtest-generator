import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

function preview() {
  return screen.getByLabelText(/Preview of the generated .* script/);
}

describe('App', () => {
  it('starts with a valid configuration and a downloadable preview', () => {
    render(<App />);

    const download = screen.getByRole('button', { name: /Download blabla\.js/i });
    expect(download).toBeEnabled();
    expect(preview()).toHaveTextContent('export const options');
    expect(preview()).toHaveTextContent('executor: "constant-vus"');
    expect(screen.getByLabelText('File name')).toHaveValue('blabla.js');
    expect(screen.getByText('Valid')).toBeInTheDocument();
  });

  it('shows understandable validation feedback and disables export for invalid input', async () => {
    const user = userEvent.setup();
    render(<App />);

    const url = screen.getByLabelText('Target URL');
    await user.clear(url);
    await user.type(url, 'not-a-url');

    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(/complete URL/i);
    expect(
      screen.getByRole('button', { name: /Download blabla\.js/i }),
    ).toBeDisabled();
    expect(screen.getByText(/script preview appears when every field is valid/i)).toBeInTheDocument();
  });

  it('updates conditional workload fields and the preview', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText('Executor'), 'ramping-vus');

    expect(screen.getByLabelText('Starting VUs')).toBeInTheDocument();
    expect(screen.getByLabelText('Stage 1 target vus')).toBeInTheDocument();
    expect(preview()).toHaveTextContent('executor: "ramping-vus"');
    expect(preview()).toHaveTextContent('stages: [');
  });

  it('includes and omits optional sections when their switches change', async () => {
    const user = userEvent.setup();
    render(<App />);

    const tagsSwitch = screen.getByRole('checkbox', { name: 'Tags' });
    expect(tagsSwitch).not.toBeChecked();
    expect(preview()).not.toHaveTextContent('tags: {');

    await user.click(tagsSwitch);

    expect(tagsSwitch).toBeChecked();
    expect(preview()).toHaveTextContent('tags: {');
    expect(preview()).toHaveTextContent('environment: "staging"');
  });

  it('fills the request form from a pasted cURL command', async () => {
    const user = userEvent.setup();
    render(<App />);

    const command = [
      "curl 'https://api.example.com/orders' \\",
      "  -H 'accept: application/json' \\",
      "  -H 'content-type: application/json' \\",
      "  --data-raw '{\"qty\":2}'",
    ].join('\n');

    fireEvent.change(screen.getByLabelText('cURL command'), {
      target: { value: command },
    });
    await user.click(screen.getByRole('button', { name: 'Import cURL' }));

    expect(screen.getByLabelText('Target URL')).toHaveValue(
      'https://api.example.com/orders',
    );
    expect(screen.getByLabelText('HTTP method')).toHaveValue('POST');
    expect(screen.getByLabelText('Header 1 name')).toHaveValue('accept');
    expect(screen.getByLabelText('JSON payload')).toHaveValue('{"qty":2}');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Imported POST https://api.example.com/orders',
    );
    expect(preview()).toHaveTextContent('https://api.example.com/orders');
    expect(
      screen.getByRole('button', { name: /Download blabla\.js/i }),
    ).toBeEnabled();
  });

  it('applies supported HTTP options from a cURL command', async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.change(screen.getByLabelText('cURL command'), {
      target: { value: "curl -k -m 20 'https://localhost:8443/health'" },
    });
    await user.click(screen.getByRole('button', { name: 'Import cURL' }));

    expect(preview()).toHaveTextContent('timeout: "20s"');
    expect(preview()).toHaveTextContent('insecureSkipTLSVerify: true');
  });

  it('reports cURL commands it cannot import', async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.change(screen.getByLabelText('cURL command'), {
      target: { value: "curl -H 'accept: */*'" },
    });
    await user.click(screen.getByRole('button', { name: 'Import cURL' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/No URL found/i);
    expect(screen.getByLabelText('Target URL')).toHaveValue('https://test.k6.io/');
  });

  it('opens the scenario guide modal and closes it with Escape', async () => {
    const user = userEvent.setup();
    render(<App />);

    const trigger = screen.getByRole('button', { name: /Scenario guide/i });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', {
      name: 'Build a k6 scenario in three steps',
    });
    expect(
      within(dialog).getByRole('heading', { name: 'Request and payload' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: 'Workload and executor' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: 'Optional settings and export' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('constant-arrival-rate')).toBeInTheDocument();
    expect(within(dialog).getByText(/never runs k6 by itself/i)).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes the guide from its close buttons', async () => {
    const user = userEvent.setup();
    render(<App />);

    const trigger = screen.getByRole('button', { name: /Scenario guide/i });

    await user.click(trigger);
    await user.click(
      screen.getByRole('button', { name: 'Close scenario guide' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Start building' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('downloads with a custom file name', async () => {
    const user = userEvent.setup();
    let downloadedName: string | null = null;

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:k6-script'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function handleClick(this: HTMLAnchorElement) {
        downloadedName = this.download;
      },
    );

    render(<App />);

    const nameInput = screen.getByLabelText('File name');
    await user.clear(nameInput);
    await user.type(nameInput, 'checkout-smoke.js');

    const download = screen.getByRole('button', {
      name: /Download checkout-smoke\.js/i,
    });
    expect(download).toBeEnabled();

    await user.click(download);

    expect(downloadedName).toBe('checkout-smoke.js');
    expect(preview()).toHaveAccessibleName(
      'Preview of the generated checkout-smoke.js script',
    );
  });

  it('blocks export for an invalid file name but keeps the preview', async () => {
    const user = userEvent.setup();
    render(<App />);

    const nameInput = screen.getByLabelText('File name');
    await user.clear(nameInput);
    await user.type(nameInput, 'smoke');

    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('End the file name with .js.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download smoke/i })).toBeDisabled();
    expect(preview()).toHaveTextContent('export const options');
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
  });
});