import type { ValidationMessage } from '../config/types';

export function fieldDomId(path: string): string {
  return `field-${path.replace(/[^A-Za-z0-9_-]+/g, '-')}`;
}

export function errorDomId(path: string): string {
  return `${fieldDomId(path)}-error`;
}

export function hintDomId(path: string): string {
  return `${fieldDomId(path)}-hint`;
}

export function describedBy(
  path: string,
  options: { hint?: boolean; error?: ValidationMessage },
): string | undefined {
  const ids = [
    options.hint ? hintDomId(path) : null,
    options.error ? errorDomId(path) : null,
  ].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}