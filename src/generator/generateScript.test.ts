import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { createDefaultDraft } from '../config/defaults';
import type { LoadTestConfig, LoadTestDraft } from '../config/types';
import { validateConfig } from '../config/validation';
import { generateK6Script } from './generateScript';

function configFrom(draft: LoadTestDraft): LoadTestConfig {
  const result = validateConfig(draft);
  if (!result.valid || !result.config) {
    throw new Error(
      `Expected a valid config, got: ${result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return result.config;
}

function scriptFrom(draft: LoadTestDraft): string {
  return generateK6Script(configFrom(draft));
}

function parseModule(script: string) {
  return parse(script, { ecmaVersion: 'latest', sourceType: 'module' });
}

function walkAst(
  node: unknown,
  visit: (node: Record<string, unknown>) => void,
): void {
  if (node === null || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walkAst(item, visit);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  if (typeof record.type === 'string') {
    visit(record);
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === 'start' || key === 'end' || key === 'loc') {
      continue;
    }
    walkAst(value, visit);
  }
}

function expectNoExecutableInjection(script: string) {
  const ast = parseModule(script);
  walkAst(ast, (node) => {
    expect(
      node.type === 'MemberExpression' &&
        (node.object as Record<string, unknown> | undefined)?.type === 'Identifier' &&
        (node.object as Record<string, unknown>).name === 'console',
    ).toBe(false);
    expect(
      node.type === 'CallExpression' &&
        (node.callee as Record<string, unknown> | undefined)?.type === 'Identifier' &&
        ['eval', 'Function'].includes(
          (node.callee as Record<string, unknown>).name as string,
        ),
    ).toBe(false);
  });
}

describe('generateK6Script', () => {
  it('generates a documented, parseable k6 script for the default config', () => {
    const script = scriptFrom(createDefaultDraft());

    expect(() => parseModule(script)).not.toThrow();
    expect(script).toContain('import http from "k6/http";');
    expect(script).toContain('import { check } from "k6";');
    expect(script).toContain('export const options = {');
    expect(script).toContain('executor: "constant-vus"');
    expect(script).toContain('vus: 10');
    expect(script).toContain('duration: "30s"');
    expect(script).toContain('"p(95)<500"');
    expect(script).toContain('http.request("GET", TARGET_URL);');
    expect(script).toContain('const response = http.request');
    expect(script).toContain('"status is 200": (r) => r.status === 200');
    expect(script).toContain('export default function () {');
    expect(script).toContain('Review this script before running it');
  });

  it('is deterministic for the same configuration', () => {
    const draft = createDefaultDraft();
    const first = scriptFrom(draft);
    const second = scriptFrom(draft);

    expect(first).toBe(second);
  });

  it('omits disabled optional sections entirely', () => {
    const draft = createDefaultDraft();
    draft.thresholds.enabled = false;
    draft.checks.enabled = false;
    draft.tags.enabled = false;
    draft.http.enabled = false;
    draft.pacing.enabled = false;

    const script = scriptFrom(draft);

    expect(script).not.toContain('thresholds:');
    expect(script).not.toContain('tags:');
    expect(script).not.toContain('check(');
    expect(script).not.toContain('sleep(');
    expect(script).not.toContain('import { check');
    expect(script).not.toContain('import { sleep');
    expect(() => parseModule(script)).not.toThrow();
  });

  it('includes only the optional sections that are enabled', () => {
    const draft = createDefaultDraft();
    draft.thresholds.enabled = false;
    draft.checks.enabled = false;
    draft.tags.enabled = true;
    draft.http.enabled = true;
    draft.http.timeout = '15s';
    draft.http.maxRedirects = '5';
    draft.http.discardResponseBodies = true;
    draft.http.noConnectionReuse = true;
    draft.http.insecureSkipTLSVerify = true;
    draft.http.userAgent = 'Builder/1.0';
    draft.pacing.enabled = true;
    draft.pacing.sleepSeconds = '0.5';

    const script = scriptFrom(draft);

    expect(script).not.toContain('thresholds:');
    expect(script).not.toContain('check(');
    expect(script).toContain('tags: {');
    expect(script).toContain('environment: "staging"');
    expect(script).toContain('maxRedirects: 5');
    expect(script).toContain('discardResponseBodies: true');
    expect(script).toContain('noConnectionReuse: true');
    expect(script).toContain('insecureSkipTLSVerify: true');
    expect(script).toContain('userAgent: "Builder/1.0"');
    expect(script).toContain('timeout: "15s"');
    expect(script).toContain('import { sleep } from "k6";');
    expect(script).toContain('sleep(0.5);');
    expect(() => parseModule(script)).not.toThrow();
  });

  it.each([
    'constant-vus',
    'ramping-vus',
    'shared-iterations',
    'per-vu-iterations',
    'constant-arrival-rate',
    'ramping-arrival-rate',
  ] as const)('generates a parseable %s scenario', (executor) => {
    const draft = createDefaultDraft();
    draft.workload.executor = executor;

    const script = scriptFrom(draft);

    expect(script).toContain(`executor: "${executor}"`);
    expect(() => parseModule(script)).not.toThrow();
  });

  it('emits ramping stages and advanced scenario timing', () => {
    const draft = createDefaultDraft();
    draft.workload.executor = 'ramping-vus';
    draft.workload.stages = [
      { target: '5', duration: '5s' },
      { target: '20', duration: '10s' },
      { target: '0', duration: '5s' },
    ];
    draft.workload.startTime = '2s';
    draft.workload.gracefulStop = '15s';
    draft.workload.gracefulRampDown = '0s';

    const script = scriptFrom(draft);

    expect(script).toContain('startVUs: 0');
    expect(script).toContain('target: 20');
    expect(script).toContain('startTime: "2s"');
    expect(script).toContain('gracefulStop: "15s"');
    expect(script).toContain('gracefulRampDown: "0s"');
    expect(() => parseModule(script)).not.toThrow();
  });

  it('sends JSON bodies with an automatic Content-Type header', () => {
    const draft = createDefaultDraft();
    draft.request.method = 'POST';
    draft.request.bodyType = 'json';
    draft.request.body = '{"name":"Ada"}';

    const script = scriptFrom(draft);

    expect(script).toContain('const REQUEST_BODY = {');
    expect(script).toContain('JSON.stringify(REQUEST_BODY)');
    expect(script).toContain('"Content-Type": "application/json"');
    expect(script).toContain('headers: {');
    expect(() => parseModule(script)).not.toThrow();
  });

  it('does not override a user-provided Content-Type header', () => {
    const draft = createDefaultDraft();
    draft.request.method = 'POST';
    draft.request.bodyType = 'json';
    draft.request.body = '{"name":"Ada"}';
    draft.request.headers = [{ name: 'Content-Type', value: 'application/vnd.api+json' }];

    const script = scriptFrom(draft);

    expect(script).toContain('"Content-Type": "application/vnd.api+json"');
    expect(script).not.toContain('application/json');
  });

  it('emits the long threshold format with abort settings', () => {
    const draft = createDefaultDraft();
    draft.thresholds.rows = [
      {
        metric: 'http_req_duration',
        aggregation: 'p(99)',
        operator: '<',
        value: '900',
        abortOnFail: true,
        delayAbortEval: '10s',
      },
    ];

    const script = scriptFrom(draft);

    expect(script).toContain('threshold: "p(99)<900"');
    expect(script).toContain('abortOnFail: true');
    expect(script).toContain('delayAbortEval: "10s"');
    expect(() => parseModule(script)).not.toThrow();
  });

  it('emits all supported check predicates', () => {
    const draft = createDefaultDraft();
    draft.checks.rows = [
      { name: 'status is 201', type: 'status', expected: '201' },
      { name: 'body has welcome', type: 'bodyIncludes', expected: 'welcome' },
      { name: 'fast enough', type: 'duration', expected: '800' },
    ];

    const script = scriptFrom(draft);

    expect(script).toContain('(r) => r.status === 201');
    expect(script).toContain('(r) => r.body.includes("welcome")');
    expect(script).toContain('(r) => r.timings.duration < 800');
    expect(() => parseModule(script)).not.toThrow();
  });

  it('escapes untrusted strings instead of injecting executable code', () => {
    const draft = createDefaultDraft();
    draft.request.method = 'POST';
    draft.request.headers = [
      { name: 'X-Injection', value: '"); console.log("pwned"); //' },
    ];
    draft.request.bodyType = 'text';
    draft.request.body = 'quote " backslash \\ newline\n next line';
    draft.checks.rows = [
      {
        name: 'status "quoted"\ncheck',
        type: 'bodyIncludes',
        expected: '"); console.log("pwned"); //',
      },
    ];
    draft.tags.enabled = true;
    draft.tags.rows = [
      { name: 'owner', value: 'quote " slash \\ separator \u2028 middle' },
    ];

    const script = scriptFrom(draft);

    expect(() => parseModule(script)).not.toThrow();
    expectNoExecutableInjection(script);
    expect(script).toContain('\\"');
    expect(script).toContain('\\n');
    expect(script).toContain('\\u2028');
    expect(script).not.toContain('\u2028');
  });

  it('serializes __proto__ keys as safe own properties', () => {
    const draft = createDefaultDraft();
    draft.request.method = 'POST';
    draft.request.bodyType = 'json';
    draft.request.body = JSON.stringify({
      ['__proto__']: { polluted: true },
      name: 'Ada',
    });

    const script = scriptFrom(draft);

    expect(script).toContain('["__proto__"]: {');
    expect(() => parseModule(script)).not.toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps the request body and params optional', () => {
    const draft = createDefaultDraft();
    draft.request.headers = [{ name: 'Accept', value: 'application/json' }];

    const script = scriptFrom(draft);

    expect(script).toContain(
      'http.request("GET", TARGET_URL, null, {\n    headers: {',
    );
    expect(script).toContain('Accept: "application/json"');
    expect(() => parseModule(script)).not.toThrow();
  });
});