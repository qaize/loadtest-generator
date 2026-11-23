import { DEFAULT_SCRIPT_FILENAME } from '../config/options';

export const SCRIPT_MIME_TYPE = 'text/javascript;charset=utf-8';

/**
 * Starts a browser download for the generated script. Keeping this separate
 * from React makes the file behavior straightforward to test and replace.
 */
export function downloadK6Script(
  script: string,
  filename: string = DEFAULT_SCRIPT_FILENAME,
): void {
  const blob = new Blob([script], { type: SCRIPT_MIME_TYPE });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Give the browser a chance to start the download before releasing the URL.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}