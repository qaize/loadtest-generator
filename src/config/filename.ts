export const MAX_FILENAME_LENGTH = 80;

const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/;
const WINDOWS_RESERVED_NAMES =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
}

/**
 * Validates the export file name. The browser only downloads with this name, so
 * the rules stay conservative: one flat file name ending in `.js`, with no
 * path separators, control characters, or characters Windows rejects.
 */
export function fileNameError(value: string): string | null {
  const name = value.trim();

  if (!name) {
    return 'Enter a file name.';
  }
  if (name.length > MAX_FILENAME_LENGTH) {
    return `Keep the file name to ${MAX_FILENAME_LENGTH} characters or fewer.`;
  }
  if (ILLEGAL_FILENAME_CHARS.test(name) || hasControlCharacters(name)) {
    return 'Remove characters that file systems reject: < > : " / \\ | ? *';
  }
  if (!/\.js$/i.test(name)) {
    return 'End the file name with .js.';
  }

  const base = name.slice(0, -3).trim();
  if (!base || /^\.+$/.test(base)) {
    return 'Add a name before the .js extension.';
  }
  if (WINDOWS_RESERVED_NAMES.test(base)) {
    return 'That name is reserved by Windows. Choose another.';
  }

  return null;
}

export function normalizeFileName(value: string): string {
  return value.trim();
}
