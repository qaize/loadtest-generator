import { describe, expect, it } from 'vitest';
import { parseCurl, tokenizeCurl } from './parseCurl';

function parse(command: string) {
  const result = parseCurl(command);
  if (!result.ok) {
    throw new Error(`Expected a successful parse, got: ${result.error}`);
  }
  return result.value;
}

describe('tokenizeCurl', () => {
  it('handles quotes and escaped quotes', () => {
    expect(tokenizeCurl(`curl 'https://x.test/a' -H "x: a b"`)).toEqual([
      'curl',
      'https://x.test/a',
      '-H',
      'x: a b',
    ]);

    expect(tokenizeCurl(`curl -d "{\\"a\\":1}" 'https://x.test/'`)).toEqual([
      'curl',
      '-d',
      '{"a":1}',
      'https://x.test/',
    ]);
  });

  it('keeps empty quoted arguments', () => {
    expect(tokenizeCurl("curl -d '' 'https://x.test/'")).toEqual([
      'curl',
      '-d',
      '',
      'https://x.test/',
    ]);
  });

  it('supports bash, CMD, and PowerShell line continuations', () => {
    expect(tokenizeCurl("curl 'https://x.test/' \\\n  -H 'a: b'")).toEqual([
      'curl',
      'https://x.test/',
      '-H',
      'a: b',
    ]);
    expect(tokenizeCurl('curl "https://x.test/" ^\n  -H "a: b"')).toEqual([
      'curl',
      'https://x.test/',
      '-H',
      'a: b',
    ]);
    expect(tokenizeCurl("curl 'https://x.test/' `\n  -H 'a: b'")).toEqual([
      'curl',
      'https://x.test/',
      '-H',
      'a: b',
    ]);
  });

  it('supports $... ANSI-C quoting', () => {
    expect(tokenizeCurl("curl -d $'line1\\nline2'")).toEqual([
      'curl',
      '-d',
      'line1\nline2',
    ]);
    expect(tokenizeCurl("curl -d $'tab\\there'")).toEqual([
      'curl',
      '-d',
      'tab\there',
    ]);
  });

  it('reports unterminated quotes', () => {
    expect(() => tokenizeCurl("curl 'https://x.test/")).toThrow(
      /Unterminated quoted string/,
    );
  });
});

describe('parseCurl', () => {
  it('parses a browser "Copy as cURL" POST with JSON', () => {
    const command = [
      "curl 'https://api.example.com/orders?page=2' \\",
      "  -H 'accept: application/json' \\",
      "  -H 'content-type: application/json' \\",
      "  -H 'authorization: Bearer abc123' \\",
      "  --data-raw '{\"name\":\"Ada\",\"qty\":2}' \\",
      '  --compressed',
    ].join('\n');

    const value = parse(command);

    expect(value.request.url).toBe('https://api.example.com/orders?page=2');
    expect(value.request.method).toBe('POST');
    expect(value.request.headers).toEqual([
      { name: 'accept', value: 'application/json' },
      { name: 'content-type', value: 'application/json' },
      { name: 'authorization', value: 'Bearer abc123' },
    ]);
    expect(value.request.bodyType).toBe('json');
    expect(value.request.body).toBe('{"name":"Ada","qty":2}');
    expect(value.http).toEqual({});
    expect(value.warnings).toEqual([]);
  });

  it('parses a Windows CMD command with escaped quotes', () => {
    const command = [
      'curl "http://localhost:8080/post" ^',
      '  -H "content-type: application/json" ^',
      '  --data-raw "{\\"ok\\":true}"',
    ].join('\r\n');

    const value = parse(command);

    expect(value.request.url).toBe('http://localhost:8080/post');
    expect(value.request.method).toBe('POST');
    expect(value.request.body).toBe('{"ok":true}');
    expect(value.request.bodyType).toBe('json');
  });

  it('parses a PowerShell command with single-quoted values', () => {
    const command = [
      "curl 'http://localhost:8080/slow' `",
      "  -H 'accept: */*'",
    ].join('\n');

    const value = parse(command);

    expect(value.request.url).toBe('http://localhost:8080/slow');
    expect(value.request.method).toBe('GET');
    expect(value.request.headers).toEqual([{ name: 'accept', value: '*/*' }]);
  });

  it('defaults to GET without a body', () => {
    const value = parse('curl --url https://test.k6.io/');

    expect(value.request).toEqual({
      url: 'https://test.k6.io/',
      method: 'GET',
      headers: [],
      bodyType: 'none',
      body: '',
    });
    expect(value.warnings).toEqual([]);
  });

  it('respects an explicit method and a HEAD request', () => {
    expect(parse("curl -X PUT 'https://x.test/items/1'").request.method).toBe('PUT');
    expect(parse("curl -I 'https://x.test/'").request.method).toBe('HEAD');
    expect(parse("curl -XPOST 'https://x.test/'").request.method).toBe('POST');
  });

  it('moves -G data into the query string', () => {
    const value = parse(
      "curl -G -d 'a=1&b=2' 'https://api.example.com/search?x=0'",
    );

    expect(value.request.url).toBe('https://api.example.com/search?x=0&a=1&b=2');
    expect(value.request.method).toBe('GET');
    expect(value.request.bodyType).toBe('none');
    expect(value.warnings).toEqual([]);
  });

  it('maps supported transfer options to HTTP behavior', () => {
    const value = parse(
      "curl -k -m 20 --max-redirs 5 --no-keepalive 'https://localhost:8443/'",
    );

    expect(value.http).toEqual({
      insecureSkipTLSVerify: true,
      timeout: '20s',
      maxRedirects: '5',
      noConnectionReuse: true,
    });
    expect(value.request.method).toBe('GET');
  });

  it('converts basic auth into an Authorization header', () => {
    const value = parse("curl -u 'user:pass' 'https://api.example.com/'");

    expect(value.request.headers).toEqual([
      { name: 'Authorization', value: 'Basic dXNlcjpwYXNz' },
    ]);
  });

  it('imports user agent, referer, and cookies as headers', () => {
    const value = parse(
      "curl -A 'Builder/1.0' -e 'https://ref.test/' -b 'sid=abc' 'https://x.test/'",
    );

    expect(value.request.headers).toEqual([
      { name: 'User-Agent', value: 'Builder/1.0' },
      { name: 'Referer', value: 'https://ref.test/' },
      { name: 'Cookie', value: 'sid=abc' },
    ]);
  });

  it('joins multiple data flags and keeps raw text', () => {
    const value = parse(
      "curl 'https://x.test/log' -d 'a=1' -d 'b=2'",
    );

    expect(value.request.method).toBe('POST');
    expect(value.request.body).toBe('a=1&b=2');
    expect(value.request.bodyType).toBe('text');
  });

  it('supports --json with implicit JSON headers', () => {
    const value = parse("curl --json '{\"a\":1}' 'https://x.test/'");

    expect(value.request.method).toBe('POST');
    expect(value.request.bodyType).toBe('json');
    expect(value.request.headers).toEqual([
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Accept', value: 'application/json' },
    ]);
  });

  it('falls back to text when --json is not valid JSON', () => {
    const value = parse("curl --json 'not-json' 'https://x.test/'");

    expect(value.request.bodyType).toBe('text');
    expect(value.warnings).toContain(
      'The --json payload is not valid JSON, so it was imported as raw text.',
    );
  });

  it('keeps explicit JSON headers when --json is used', () => {
    const value = parse(
      "curl --json '{\"a\":1}' -H 'content-type: application/vnd.api+json' 'https://x.test/'",
    );

    expect(value.request.headers).toEqual([
      { name: 'content-type', value: 'application/vnd.api+json' },
      { name: 'Accept', value: 'application/json' },
    ]);
  });

  it('keeps the last value for duplicate headers', () => {
    const value = parse(
      "curl 'https://x.test/' -H 'X-Test: one' -H 'x-test: two'",
    );

    expect(value.request.headers).toEqual([{ name: 'X-Test', value: 'two' }]);
    expect(value.warnings.some((warning) => /appeared more than once/i.test(warning))).toBe(
      true,
    );
  });

  it('skips data that GET and HEAD cannot carry', () => {
    const value = parse("curl -X GET -d 'a=1' 'https://x.test/'");

    expect(value.request.method).toBe('GET');
    expect(value.request.bodyType).toBe('none');
    expect(value.warnings.some((warning) => /cannot carry a body/i.test(warning))).toBe(
      true,
    );
  });

  it('warns about empty bodies', () => {
    const value = parse("curl 'https://x.test/' -d ''");

    expect(value.request.method).toBe('POST');
    expect(value.request.bodyType).toBe('none');
    expect(value.warnings.some((warning) => /empty request body/i.test(warning))).toBe(
      true,
    );
  });

  it('adds http:// to a URL without a scheme', () => {
    const value = parse('curl example.com/api');

    expect(value.request.url).toBe('http://example.com/api');
    expect(value.warnings.some((warning) => /no scheme/i.test(warning))).toBe(true);
  });

  it('keeps only the first URL and warns', () => {
    const value = parse("curl 'https://one.test/' 'https://two.test/'");

    expect(value.request.url).toBe('https://one.test/');
    expect(value.warnings.some((warning) => /Only the first URL/i.test(warning))).toBe(
      true,
    );
  });

  it('warns about unsupported options instead of dropping them silently', () => {
    const value = parse("curl --frobnicate --connect-timeout 5 'https://x.test/'");

    expect(value.request.url).toBe('https://x.test/');
    expect(value.warnings).toContain('Unsupported option --frobnicate was ignored.');
    expect(value.warnings.some((warning) => /--connect-timeout is not supported/.test(warning))).toBe(
      true,
    );
  });

  it('rejects multipart form data, uploads, and missing values', () => {
    const form = parseCurl("curl -F 'file=@a.png' 'https://x.test/'");
    expect(form.ok).toBe(false);
    if (!form.ok) {
      expect(form.error).toMatch(/Multipart form data/);
    }

    const upload = parseCurl("curl -T 'a.png' 'https://x.test/'");
    expect(upload.ok).toBe(false);

    const missingValue = parseCurl('curl -H');
    expect(missingValue.ok).toBe(false);
    if (!missingValue.ok) {
      expect(missingValue.error).toMatch(/missing its value/);
    }
  });

  it('rejects commands without a URL or without curl', () => {
    const noUrl = parseCurl("curl -H 'accept: */*'");
    expect(noUrl.ok).toBe(false);
    if (!noUrl.ok) {
      expect(noUrl.error).toMatch(/No URL found/);
    }

    const wrongBinary = parseCurl("wget 'https://x.test/'");
    expect(wrongBinary.ok).toBe(false);
    if (!wrongBinary.ok) {
      expect(wrongBinary.error).toMatch(/Start the command with curl/);
    }

    const empty = parseCurl('   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error).toMatch(/Paste a cURL command first/);
    }
  });

  it('rejects unsupported HTTP methods', () => {
    const result = parseCurl("curl -X TRACE 'https://x.test/'");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not supported/);
    }
  });
});