import { describe, expect, it } from 'vitest';
import { createDefaultDraft, createThresholdRow } from './defaults';
import type { LoadTestDraft } from './types';
import { durationToMilliseconds, validateConfig } from './validation';

function validDraft(): LoadTestDraft {
  return createDefaultDraft();
}

describe('durationToMilliseconds', () => {
  it('parses simple and compound k6 durations', () => {
    expect(durationToMilliseconds('30s')).toBe(30_000);
    expect(durationToMilliseconds('500ms')).toBe(500);
    expect(durationToMilliseconds('2m')).toBe(120_000);
    expect(durationToMilliseconds('1h2m3s500ms')).toBe(3_723_500);
    expect(durationToMilliseconds('0s')).toBe(0);
  });

  it('rejects unsupported duration formats', () => {
    expect(durationToMilliseconds('')).toBeNull();
    expect(durationToMilliseconds('30')).toBeNull();
    expect(durationToMilliseconds('1d')).toBeNull();
    expect(durationToMilliseconds('1m 30s')).toBeNull();
    expect(durationToMilliseconds('abc')).toBeNull();
  });
});

describe('validateConfig request fields', () => {
  it('accepts the default configuration', () => {
    const result = validateConfig(validDraft());

    expect(result.valid).toBe(true);
    expect(result.config?.request.url).toBe('https://test.k6.io/');
    expect(result.config?.request.method).toBe('GET');
    expect(result.config?.workload.executor).toBe('constant-vus');
  });

  it.each([
    ['empty', ''],
    ['incomplete', 'not a url'],
    ['unsupported protocol', 'ftp://example.com'],
    ['missing host', 'https://'],
    ['contains whitespace', 'https://example.com/a b'],
  ])('rejects a %s URL', (_label, url) => {
    const draft = validDraft();
    draft.request.url = url;

    const result = validateConfig(draft);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'request.url')).toBe(true);
  });

  it('rejects bodies on GET and HEAD requests', () => {
    const draft = validDraft();
    draft.request.bodyType = 'json';
    draft.request.body = '{"ok":true}';

    const result = validateConfig(draft);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: 'request.body' }),
    );
  });

  it('parses JSON bodies and preserves values', () => {
    const draft = validDraft();
    draft.request.method = 'POST';
    draft.request.bodyType = 'json';
    draft.request.body = '{"name":"Ada","count":2}';

    const result = validateConfig(draft);

    expect(result.valid).toBe(true);
    expect(result.config?.request.body).toEqual({
      type: 'json',
      value: { name: 'Ada', count: 2 },
    });
  });

  it('reports malformed and deeply nested JSON bodies', () => {
    const malformed = validDraft();
    malformed.request.method = 'POST';
    malformed.request.bodyType = 'json';
    malformed.request.body = '{"name":';

    const malformedResult = validateConfig(malformed);
    expect(malformedResult.valid).toBe(false);
    expect(malformedResult.issues.some((issue) => issue.path === 'request.body')).toBe(
      true,
    );

    let nested: unknown = 'deep';
    for (let index = 0; index < 25; index += 1) {
      nested = { next: nested };
    }
    const tooDeep = validDraft();
    tooDeep.request.method = 'POST';
    tooDeep.request.bodyType = 'json';
    tooDeep.request.body = JSON.stringify(nested);

    const deepResult = validateConfig(tooDeep);
    expect(deepResult.valid).toBe(false);
    expect(deepResult.issues).toContainEqual(
      expect.objectContaining({ path: 'request.body' }),
    );
  });

  it('accepts a raw text body and rejects an empty one', () => {
    const draft = validDraft();
    draft.request.method = 'PUT';
    draft.request.bodyType = 'text';
    draft.request.body = 'hello world';

    expect(validateConfig(draft).valid).toBe(true);

    draft.request.body = '   ';
    expect(validateConfig(draft).valid).toBe(false);
  });

  it('validates header names, values, and duplicates', () => {
    const draft = validDraft();
    draft.request.headers = [
      { name: 'Authorization', value: 'Bearer token' },
      { name: '', value: '' },
      { name: 'authorization', value: 'Bearer other' },
      { name: 'X-Bad Header', value: 'line\r\nbreak' },
    ];

    const result = validateConfig(draft);
    const paths = result.issues.map((issue) => issue.path);

    expect(paths).toContain('request.headers.2.name');
    expect(paths).toContain('request.headers.3.name');
    expect(paths).toContain('request.headers.3.value');
  });

  it('reports incomplete header rows', () => {
    const draft = validDraft();
    draft.request.headers = [{ name: 'Accept', value: '  ' }];

    const result = validateConfig(draft);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: 'request.headers.0.value' }),
    );
  });
});

describe('validateConfig workload fields', () => {
  it.each([
    'constant-vus',
    'ramping-vus',
    'shared-iterations',
    'per-vu-iterations',
    'constant-arrival-rate',
    'ramping-arrival-rate',
  ] as const)('accepts the default fields for the %s executor', (executor) => {
    const draft = validDraft();
    draft.workload.executor = executor;

    const result = validateConfig(draft);

    expect(result.valid).toBe(true);
    expect(result.config?.workload.executor).toBe(executor);
  });

  it('rejects invalid counts and durations', () => {
    const draft = validDraft();
    draft.workload.vus = '0';
    draft.workload.duration = '30';

    const result = validateConfig(draft);
    const paths = result.issues.map((issue) => issue.path);

    expect(paths).toContain('workload.vus');
    expect(paths).toContain('workload.duration');
  });

  it('requires valid ramping stages', () => {
    const draft = validDraft();
    draft.workload.executor = 'ramping-vus';
    draft.workload.stages = [{ target: '', duration: '10s' }];

    const result = validateConfig(draft);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: 'workload.stages.0.target' }),
    );
  });

  it('requires maxVUs to be at least preAllocatedVUs', () => {
    const draft = validDraft();
    draft.workload.executor = 'constant-arrival-rate';
    draft.workload.preAllocatedVUs = '20';
    draft.workload.maxVUs = '10';

    const result = validateConfig(draft);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: 'workload.maxVUs' }),
    );
  });

  it('validates optional scenario timing values', () => {
    const draft = validDraft();
    draft.workload.startTime = 'later';
    draft.workload.gracefulStop = '0s';

    const result = validateConfig(draft);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: 'workload.startTime' }),
    );
  });
});

describe('validateConfig optional sections', () => {
  it('omits disabled optional sections', () => {
    const draft = validDraft();
    draft.thresholds.enabled = false;
    draft.checks.enabled = false;
    draft.tags.enabled = false;
    draft.http.enabled = false;
    draft.pacing.enabled = false;

    const result = validateConfig(draft);

    expect(result.valid).toBe(true);
    expect(result.config?.thresholds).toBeNull();
    expect(result.config?.checks).toBeNull();
    expect(result.config?.tags).toBeNull();
    expect(result.config?.http).toBeNull();
    expect(result.config?.pacing).toBeNull();
  });

  it('requires content when thresholds are enabled', () => {
    const draft = validDraft();
    draft.thresholds.rows = [];

    const result = validateConfig(draft);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: 'thresholds.rows' }),
    );
  });

  it('validates threshold ranges, delays, and duplicates', () => {
    const draft = validDraft();
    draft.thresholds.rows = [
      createThresholdRow({
        metric: 'http_req_failed',
        aggregation: 'rate',
        value: '1.5',
        delayAbortEval: '10s',
      }),
      createThresholdRow({ metric: 'http_req_duration' }),
      createThresholdRow({ metric: 'http_req_duration' }),
    ];

    const result = validateConfig(draft);
    const messages = result.issues.map((issue) => issue.message);

    expect(result.valid).toBe(false);
    expect(messages.some((message) => message.includes('between 0 and 1'))).toBe(true);
    expect(messages.some((message) => message.includes('Abort on fail'))).toBe(true);
    expect(messages.some((message) => message.includes('duplicated'))).toBe(true);
  });

  it('warns when a checks threshold has no checks', () => {
    const draft = validDraft();
    draft.checks.enabled = false;
    draft.thresholds.rows = [
      createThresholdRow({ metric: 'checks', aggregation: 'rate', value: '0.9' }),
    ];

    const result = validateConfig(draft);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.path === 'thresholds.rows')).toBe(
      true,
    );
  });

  it('validates check names and expected values', () => {
    const draft = validDraft();
    draft.checks.rows = [
      { name: 'duplicate', type: 'status', expected: '700' },
      { name: 'duplicate', type: 'bodyIncludes', expected: '  ' },
      { name: 'slow', type: 'duration', expected: '0' },
    ];

    const result = validateConfig(draft);
    const paths = result.issues.map((issue) => issue.path);

    expect(paths).toContain('checks.rows.0.expected');
    expect(paths).toContain('checks.rows.1.name');
    expect(paths).toContain('checks.rows.1.expected');
    expect(paths).toContain('checks.rows.2.expected');
  });

  it('validates tag names, values, and duplicates', () => {
    const draft = validDraft();
    draft.tags.enabled = true;
    draft.tags.rows = [
      { name: 'bad name', value: 'x' },
      { name: 'env', value: 'line\nbreak' },
      { name: 'env', value: 'duplicate' },
    ];

    const result = validateConfig(draft);
    const paths = result.issues.map((issue) => issue.path);

    expect(paths).toContain('tags.rows.0.name');
    expect(paths).toContain('tags.rows.1.value');
    expect(paths).toContain('tags.rows.2.name');
  });

  it('requires at least one configured HTTP option', () => {
    const draft = validDraft();
    draft.http.enabled = true;

    const result = validateConfig(draft);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: 'http.enabled' }),
    );

    draft.http.timeout = '30s';
    const configured = validateConfig(draft);
    expect(configured.valid).toBe(true);
    expect(configured.config?.http?.timeout).toBe('30s');
  });

  it('warns when TLS verification is disabled', () => {
    const draft = validDraft();
    draft.http.enabled = true;
    draft.http.insecureSkipTLSVerify = true;

    const result = validateConfig(draft);

    expect(result.valid).toBe(true);
    expect(
      result.warnings.some((warning) => warning.path === 'http.insecureSkipTLSVerify'),
    ).toBe(true);
  });

  it('warns when sleeping with an arrival-rate executor', () => {
    const draft = validDraft();
    draft.workload.executor = 'constant-arrival-rate';
    draft.pacing.enabled = true;

    const result = validateConfig(draft);

    expect(result.valid).toBe(true);
    expect(
      result.warnings.some((warning) => warning.path === 'pacing.sleepSeconds'),
    ).toBe(true);
  });

  it('warns when body checks are combined with discarded bodies', () => {
    const draft = validDraft();
    draft.checks.rows = [
      { name: 'body has welcome', type: 'bodyIncludes', expected: 'welcome' },
    ];
    draft.http.enabled = true;
    draft.http.discardResponseBodies = true;

    const result = validateConfig(draft);

    expect(result.valid).toBe(true);
    expect(
      result.warnings.some(
        (warning) => warning.path === 'http.discardResponseBodies',
      ),
    ).toBe(true);
  });
});