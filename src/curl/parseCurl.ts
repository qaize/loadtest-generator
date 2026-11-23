import type { HeaderRow, RequestDraft } from '../config/types';
import { HTTP_METHODS, type HttpMethod } from '../config/options';

export interface CurlHttpPatch {
  timeout?: string;
  maxRedirects?: string;
  insecureSkipTLSVerify?: boolean;
  noConnectionReuse?: boolean;
}

export interface CurlImport {
  request: Pick<
    RequestDraft,
    'url' | 'method' | 'headers' | 'bodyType' | 'body'
  >;
  http: CurlHttpPatch;
  warnings: string[];
}

export type CurlParseResult =
  | { ok: true; value: CurlImport }
  | { ok: false; error: string };

class CurlParseError extends Error {}

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const SHORT_VALUE_FLAGS = new Set(['X', 'H', 'd', 'm', 'u', 'A', 'e', 'b', 'o', 'F', 'T', 'x']);

const VALUE_FLAGS_WITHOUT_SUPPORT = new Set([
  '--connect-timeout',
  '--cert',
  '--key',
  '--cacert',
  '--proxy',
  '-x',
  '--proxy-user',
  '--resolve',
  '--interface',
  '--limit-rate',
  '--retry',
  '--retry-delay',
  '--retry-max-time',
  '--keepalive-time',
  '--expect100-timeout',
  '--dns-servers',
  '--local-port',
  '--trace',
  '--trace-ascii',
  '--stderr',
  '--write-out',
  '-w',
  '--cookie-jar',
  '-c',
  '--config',
  '-K',
  '--header-file',
]);

const IGNORED_FLAGS = new Set([
  '--compressed',
  '-L',
  '--location',
  '--location-trusted',
  '-s',
  '--silent',
  '-S',
  '--show-error',
  '-v',
  '--verbose',
  '-i',
  '--include',
  '-N',
  '--no-buffer',
  '--no-progress-meter',
  '-g',
  '--globoff',
  '--http1.0',
  '--http1.1',
  '--http2',
  '--http2-prior-knowledge',
  '--tlsv1.2',
  '--tlsv1.3',
  '-f',
  '--fail',
  '--fail-with-body',
  '--raw',
  '--path-as-is',
  '-4',
  '--ipv4',
  '-6',
  '--ipv6',
  '--post301',
  '--post302',
  '--post303',
  '--retry-connrefused',
  '--tcp-nodelay',
]);

function stripLineContinuations(command: string): string {
  return command
    .replace(/\\(?:\r?\n)/g, ' ')
    .replace(/\^(?:\r?\n)/g, ' ')
    .replace(/`(?:\r?\n)/g, ' ');
}

function readAnsiCString(input: string, start: number): { value: string; next: number } {
  let index = start;
  let value = '';

  while (index < input.length) {
    const character = input[index];
    if (character === "'") {
      return { value, next: index + 1 };
    }
    if (character !== '\\') {
      value += character;
      index += 1;
      continue;
    }

    const escape = input[index + 1];
    if (escape === undefined) {
      value += '\\';
      index += 1;
      continue;
    }

    if (escape === 'n') {
      value += '\n';
      index += 2;
    } else if (escape === 'r') {
      value += '\r';
      index += 2;
    } else if (escape === 't') {
      value += '\t';
      index += 2;
    } else if (escape === '\\' || escape === "'" || escape === '"') {
      value += escape;
      index += 2;
    } else if (escape === 'x') {
      const hex = input.slice(index + 2, index + 4);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 4;
      } else {
        value += 'x';
        index += 2;
      }
    } else if (escape === 'u') {
      const hex = input.slice(index + 2, index + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 6;
      } else {
        value += 'u';
        index += 2;
      }
    } else {
      value += escape;
      index += 2;
    }
  }

  throw new CurlParseError('Unterminated $... quoted string in the cURL command.');
}

/**
 * Splits a shell-style cURL command into tokens. Handles single quotes, double
 * quotes, backslash escapes, and the line continuations produced by browsers
 * on bash (`\`), Windows CMD (`^`), and PowerShell (`` ` ``).
 */
export function tokenizeCurl(command: string): string[] {
  const input = stripLineContinuations(command.trim());
  const tokens: string[] = [];
  let current = '';
  let hasCurrent = false;
  let quote: '"' | "'" | null = null;
  let index = 0;

  const pushCurrent = () => {
    if (hasCurrent) {
      tokens.push(current);
      current = '';
      hasCurrent = false;
    }
  };

  while (index < input.length) {
    const character = input[index];

    if (quote === "'") {
      if (character === "'") {
        quote = null;
      } else {
        current += character;
      }
      index += 1;
      continue;
    }

    if (quote === '"') {
      if (character === '"') {
        quote = null;
        index += 1;
        continue;
      }
      if (character === '\\') {
        const next = input[index + 1];
        if (next === '"' || next === '\\' || next === '$' || next === '`') {
          current += next;
          index += 2;
          continue;
        }
        current += character;
        index += 1;
        continue;
      }
      current += character;
      index += 1;
      continue;
    }

    if (character === '$' && input[index + 1] === "'") {
      const ansi = readAnsiCString(input, index + 2);
      current += ansi.value;
      hasCurrent = true;
      index = ansi.next;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      hasCurrent = true;
      index += 1;
      continue;
    }

    if (character === '\\') {
      const next = input[index + 1];
      if (next === undefined) {
        current += character;
        hasCurrent = true;
        index += 1;
        continue;
      }
      if (next !== '\n') {
        current += next;
        hasCurrent = true;
      }
      index += 2;
      continue;
    }

    if (/\s/.test(character)) {
      pushCurrent();
      index += 1;
      continue;
    }

    current += character;
    hasCurrent = true;
    index += 1;
  }

  if (quote !== null) {
    throw new CurlParseError('Unterminated quoted string in the cURL command.');
  }

  pushCurrent();
  return tokens;
}

function splitOption(token: string): { name: string; inlineValue?: string } {
  if (token.startsWith('--')) {
    const equals = token.indexOf('=');
    if (equals !== -1) {
      return { name: token.slice(0, equals), inlineValue: token.slice(equals + 1) };
    }
    return { name: token };
  }

  if (token.length > 2 && SHORT_VALUE_FLAGS.has(token[1])) {
    return { name: token.slice(0, 2), inlineValue: token.slice(2) };
  }

  return { name: token };
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function encodeBasicAuth(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `Basic ${btoa(binary)}`;
}

function appendQuery(url: string, query: string): string {
  const hashIndex = url.indexOf('#');
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const separator = base.includes('?')
    ? base.endsWith('?') || base.endsWith('&')
      ? ''
      : '&'
    : '?';
  return `${base}${separator}${query}${hash}`;
}

/**
 * Parses a cURL command into builder fields. The parser only understands
 * request-shape options; transfer features the builder does not support are
 * reported as warnings instead of being silently dropped.
 */
export function parseCurl(command: string): CurlParseResult {
  if (!command.trim()) {
    return { ok: false, error: 'Paste a cURL command first.' };
  }

  let tokens: string[];
  try {
    tokens = tokenizeCurl(command);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not read the cURL command.',
    };
  }

  if (tokens.length === 0 || !/^(curl|curl\.exe)$/i.test(tokens[0])) {
    return { ok: false, error: 'Start the command with curl.' };
  }

  const warnings: string[] = [];
  const headerArguments: string[] = [];
  const dataParts: string[] = [];
  const positionals: string[] = [];
  const http: CurlHttpPatch = {};

  let urlOption: string | undefined;
  let methodOption: HttpMethod | undefined;
  let headRequest = false;
  let getMode = false;
  let jsonMode = false;

  try {
    for (let index = 1; index < tokens.length; index += 1) {
      const token = tokens[index];

      if (token === '--') {
        positionals.push(...tokens.slice(index + 1));
        break;
      }

      if (!token.startsWith('-') || token === '-') {
        positionals.push(token);
        continue;
      }

      const { name, inlineValue } = splitOption(token);

      const takeValue = (): string => {
        if (inlineValue !== undefined) {
          return inlineValue;
        }
        const next = tokens[index + 1];
        if (next === undefined) {
          throw new CurlParseError(`Option ${name} is missing its value.`);
        }
        index += 1;
        return next;
      };

      switch (name) {
        case '--url':
          urlOption = takeValue();
          break;
        case '-X':
        case '--request': {
          const raw = takeValue().toUpperCase();
          if (!(HTTP_METHODS as readonly string[]).includes(raw)) {
            throw new CurlParseError(
              `HTTP method ${raw} is not supported. Use one of ${HTTP_METHODS.join(', ')}.`,
            );
          }
          methodOption = raw as HttpMethod;
          break;
        }
        case '-H':
        case '--header':
          headerArguments.push(takeValue());
          break;
        case '-d':
        case '--data':
        case '--data-raw':
        case '--data-ascii':
        case '--data-binary':
        case '--data-urlencode':
          dataParts.push(takeValue());
          break;
        case '--json':
          jsonMode = true;
          dataParts.push(takeValue());
          break;
        case '-F':
        case '--form':
        case '--form-string':
          throw new CurlParseError(
            'Multipart form data (-F) is not supported by this builder.',
          );
        case '-T':
        case '--upload-file':
          throw new CurlParseError(
            'File uploads (-T) are not supported by this builder.',
          );
        case '-I':
        case '--head':
          headRequest = true;
          break;
        case '-G':
        case '--get':
          getMode = true;
          break;
        case '-k':
        case '--insecure':
          http.insecureSkipTLSVerify = true;
          break;
        case '--no-keepalive':
          http.noConnectionReuse = true;
          break;
        case '-m':
        case '--max-time': {
          const raw = takeValue();
          const seconds = Number(raw);
          if (!Number.isFinite(seconds) || seconds <= 0) {
            warnings.push(`Skipped --max-time value "${raw}" because it is not a positive number.`);
          } else {
            http.timeout = `${raw}s`;
          }
          break;
        }
        case '--max-redirs': {
          const raw = takeValue();
          const redirects = Number(raw);
          if (!Number.isInteger(redirects) || redirects < 0 || redirects > 1_000) {
            warnings.push(
              `Skipped --max-redirs value "${raw}" because it is not a whole number from 0 to 1000.`,
            );
          } else {
            http.maxRedirects = String(redirects);
          }
          break;
        }
        case '-u':
        case '--user':
          headerArguments.push(`Authorization: ${encodeBasicAuth(takeValue())}`);
          break;
        case '-A':
        case '--user-agent':
          headerArguments.push(`User-Agent: ${takeValue()}`);
          break;
        case '-e':
        case '--referer':
          headerArguments.push(`Referer: ${takeValue()}`);
          break;
        case '-b':
        case '--cookie':
          headerArguments.push(`Cookie: ${takeValue()}`);
          break;
        case '-o':
        case '--output':
          takeValue();
          break;
        default:
          if (VALUE_FLAGS_WITHOUT_SUPPORT.has(name)) {
            takeValue();
            warnings.push(`${name} is not supported by this builder and was skipped.`);
          } else if (IGNORED_FLAGS.has(name)) {
            break;
          } else {
            warnings.push(`Unsupported option ${name} was ignored.`);
          }
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not read the cURL command.',
    };
  }

  let url = urlOption ?? positionals[0] ?? '';
  if (urlOption && positionals.length > 0) {
    warnings.push('Only one URL can be imported; the --url value was used.');
  } else if (!urlOption && positionals.length > 1) {
    warnings.push('Only the first URL was imported.');
  }

  if (!url) {
    return { ok: false, error: 'No URL found in the cURL command.' };
  }

  if (!SCHEME_PATTERN.test(url)) {
    url = `http://${url}`;
    warnings.push('The URL had no scheme, so http:// was added.');
  }

  const hasData = dataParts.length > 0;
  let body = dataParts.join('&');

  if (getMode && body) {
    url = appendQuery(url, body);
    body = '';
  }

  let method: HttpMethod;
  if (methodOption) {
    method = methodOption;
  } else if (headRequest) {
    method = 'HEAD';
  } else if (getMode) {
    method = 'GET';
  } else if (jsonMode || hasData) {
    method = 'POST';
  } else {
    method = 'GET';
  }

  const bodyAllowed = method !== 'GET' && method !== 'HEAD';
  let bodyType: RequestDraft['bodyType'] = 'none';

  if (body && bodyAllowed) {
    bodyType = looksLikeJson(body) ? 'json' : 'text';
    if (jsonMode && bodyType !== 'json') {
      warnings.push('The --json payload is not valid JSON, so it was imported as raw text.');
    }
  } else if (body && !bodyAllowed) {
    warnings.push(`${method} requests cannot carry a body, so the request data was skipped.`);
    body = '';
  } else if (hasData && !body && !getMode) {
    warnings.push('The cURL command had an empty request body, so no body was imported.');
  }

  const headers: HeaderRow[] = [];
  const headerIndex = new Map<string, number>();

  for (const argument of headerArguments) {
    const colon = argument.indexOf(':');
    if (colon <= 0) {
      warnings.push(
        `Skipped header "${argument}" because it is not in name: value form.`,
      );
      continue;
    }
    const name = argument.slice(0, colon).trim();
    const value = argument.slice(colon + 1).trim();
    if (!name) {
      warnings.push(`Skipped header "${argument}" because it has no name.`);
      continue;
    }
    const key = name.toLowerCase();
    const existingIndex = headerIndex.get(key);
    if (existingIndex !== undefined) {
      headers[existingIndex].value = value;
      warnings.push(`Header "${name}" appeared more than once; the last value was kept.`);
      continue;
    }
    headerIndex.set(key, headers.length);
    headers.push({ name, value });
  }

  if (jsonMode) {
    const implicitHeaders: HeaderRow[] = [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Accept', value: 'application/json' },
    ];
    for (const header of implicitHeaders) {
      const key = header.name.toLowerCase();
      if (!headerIndex.has(key)) {
        headerIndex.set(key, headers.length);
        headers.push(header);
      }
    }
  }

  return {
    ok: true,
    value: {
      request: {
        url,
        method,
        headers,
        bodyType,
        body: bodyType === 'none' ? '' : body,
      },
      http,
      warnings,
    },
  };
}