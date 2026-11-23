import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadK6Script } from './downloadScript';

describe('downloadK6Script', () => {
  const createObjectURL = vi.fn((blob: Blob) => {
    void blob;
    return 'blob:k6-script';
  });
  const revokeObjectURL = vi.fn((url: string) => {
    void url;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it('downloads a JavaScript blob as blabla.js', async () => {
    let clicked: {
      download: string;
      href: string;
      connected: boolean;
    } | null = null;

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function handleClick(this: HTMLAnchorElement) {
        clicked = {
          download: this.download,
          href: this.href,
          connected: this.isConnected,
        };
      },
    );

    downloadK6Script('export default function () {}\n');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/javascript;charset=utf-8');
    await expect(blob.text()).resolves.toBe('export default function () {}\n');

    expect(clicked).toEqual({
      download: 'blabla.js',
      href: 'blob:k6-script',
      connected: true,
    });
    expect(document.querySelector('a')).toBeNull();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:k6-script');
  });

  it('allows an explicit file name', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function handleClick(this: HTMLAnchorElement) {
        expect(this.download).toBe('custom.js');
      },
    );

    downloadK6Script('// custom', 'custom.js');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});