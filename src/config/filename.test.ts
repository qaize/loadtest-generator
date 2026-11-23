import { describe, expect, it } from 'vitest';
import { fileNameError, MAX_FILENAME_LENGTH, normalizeFileName } from './filename';

describe('fileNameError', () => {
  it.each([
    'blabla.js',
    'checkout-smoke.js',
    'My Test 01.js',
    'api_test.v2.js',
    'UPPER.JS',
    'loadtest.js',
  ])('accepts %s', (name) => {
    expect(fileNameError(name)).toBeNull();
  });

  it('accepts a name at the maximum length', () => {
    const name = `${'a'.repeat(MAX_FILENAME_LENGTH - 3)}.js`;

    expect(fileNameError(name)).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['only whitespace', '   '],
    ['missing extension', 'smoke'],
    ['wrong extension', 'smoke.txt'],
    ['only the extension', '.js'],
    ['only dots', '...js'],
    ['forward slash path', 'dir/smoke.js'],
    ['backslash path', 'dir\\smoke.js'],
    ['angle brackets', 'bad<name>.js'],
    ['question mark', 'bad?.js'],
    ['pipe', 'bad|name.js'],
    ['quote', 'bad"name.js'],
    ['colon', 'bad:name.js'],
    ['control character', 'bad\u0001name.js'],
    ['newline', 'bad\nname.js'],
    ['Windows reserved name', 'CON.js'],
    ['Windows reserved numbered name', 'lpt1.js'],
  ])('rejects a %s', (_label, name) => {
    expect(fileNameError(name)).not.toBeNull();
  });

  it('rejects a name longer than the limit', () => {
    const name = `${'a'.repeat(MAX_FILENAME_LENGTH - 2)}.js`;

    expect(name.length).toBe(MAX_FILENAME_LENGTH + 1);
    expect(fileNameError(name)).toBe(`Keep the file name to ${MAX_FILENAME_LENGTH} characters or fewer.`);
  });

  it('explains missing and wrong extensions', () => {
    expect(fileNameError('smoke')).toBe('End the file name with .js.');
    expect(fileNameError('smoke.txt')).toBe('End the file name with .js.');
  });
});

describe('normalizeFileName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeFileName('  smoke.js \n')).toBe('smoke.js');
  });
});