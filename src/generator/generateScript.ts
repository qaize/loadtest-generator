import { K6_DOCS_URL } from '../config/options';
import type {
  CheckRule,
  LoadTestConfig,
  ThresholdRule,
  ValidatedRequest,
  Workload,
} from '../config/types';
import {
  formatPropertyKey,
  quoteJsString,
  toJsLiteral,
} from './serialize';

function scenarioTiming(workload: Workload): Record<string, string> {
  return {
    ...(workload.startTime !== undefined ? { startTime: workload.startTime } : {}),
    ...(workload.gracefulStop !== undefined
      ? { gracefulStop: workload.gracefulStop }
      : {}),
  };
}

function buildScenario(workload: Workload): Record<string, unknown> {
  const timing = scenarioTiming(workload);

  switch (workload.executor) {
    case 'constant-vus':
      return {
        executor: workload.executor,
        vus: workload.vus,
        duration: workload.duration,
        ...timing,
      };
    case 'ramping-vus':
      return {
        executor: workload.executor,
        startVUs: workload.startVUs,
        stages: workload.stages,
        ...(workload.gracefulRampDown !== undefined
          ? { gracefulRampDown: workload.gracefulRampDown }
          : {}),
        ...timing,
      };
    case 'shared-iterations':
    case 'per-vu-iterations':
      return {
        executor: workload.executor,
        vus: workload.vus,
        iterations: workload.iterations,
        ...(workload.maxDuration !== undefined
          ? { maxDuration: workload.maxDuration }
          : {}),
        ...timing,
      };
    case 'constant-arrival-rate':
      return {
        executor: workload.executor,
        duration: workload.duration,
        rate: workload.rate,
        timeUnit: workload.timeUnit,
        preAllocatedVUs: workload.preAllocatedVUs,
        ...(workload.maxVUs !== undefined ? { maxVUs: workload.maxVUs } : {}),
        ...timing,
      };
    case 'ramping-arrival-rate':
      return {
        executor: workload.executor,
        startRate: workload.startRate,
        timeUnit: workload.timeUnit,
        preAllocatedVUs: workload.preAllocatedVUs,
        ...(workload.maxVUs !== undefined ? { maxVUs: workload.maxVUs } : {}),
        stages: workload.stages,
        ...timing,
      };
  }
}

function buildThresholds(
  rules: ThresholdRule[],
): Record<string, Array<string | Record<string, unknown>>> {
  const thresholds: Record<string, Array<string | Record<string, unknown>>> = {};

  for (const rule of rules) {
    const expression = `${rule.aggregation}${rule.operator}${rule.value}`;
    const entry: string | Record<string, unknown> = rule.abortOnFail
      ? {
          threshold: expression,
          abortOnFail: true,
          ...(rule.delayAbortEval !== undefined
            ? { delayAbortEval: rule.delayAbortEval }
            : {}),
        }
      : expression;

    if (!Object.hasOwn(thresholds, rule.metric)) {
      thresholds[rule.metric] = [];
    }
    thresholds[rule.metric].push(entry);
  }

  return thresholds;
}

function buildOptions(config: LoadTestConfig): Record<string, unknown> {
  const options: Record<string, unknown> = {
    scenarios: {
      main: buildScenario(config.workload),
    },
  };

  if (config.thresholds) {
    options.thresholds = buildThresholds(config.thresholds);
  }
  if (config.tags) {
    options.tags = config.tags;
  }

  if (config.http) {
    if (config.http.userAgent !== undefined) {
      options.userAgent = config.http.userAgent;
    }
    if (config.http.maxRedirects !== undefined) {
      options.maxRedirects = config.http.maxRedirects;
    }
    if (config.http.discardResponseBodies) {
      options.discardResponseBodies = true;
    }
    if (config.http.noConnectionReuse) {
      options.noConnectionReuse = true;
    }
    if (config.http.insecureSkipTLSVerify) {
      options.insecureSkipTLSVerify = true;
    }
  }

  return options;
}

function requestHeaders(request: ValidatedRequest): Record<string, string> {
  const headers = { ...request.headers };
  if (request.body.type === 'json') {
    const hasContentType = Object.keys(headers).some(
      (name) => name.toLowerCase() === 'content-type',
    );
    if (!hasContentType) {
      headers['Content-Type'] = 'application/json';
    }
  }
  return headers;
}

function buildRequestParams(config: LoadTestConfig): Record<string, unknown> {
  const headers = requestHeaders(config.request);
  const params: Record<string, unknown> = {};

  if (Object.keys(headers).length > 0) {
    params.headers = headers;
  }
  if (config.http?.timeout !== undefined) {
    params.timeout = config.http.timeout;
  }

  return params;
}

function checkPredicate(rule: CheckRule): string {
  switch (rule.type) {
    case 'status':
      return `(r) => r.status === ${rule.expectedStatus}`;
    case 'bodyIncludes':
      return `(r) => r.body.includes(${quoteJsString(rule.expectedText)})`;
    case 'duration':
      return `(r) => r.timings.duration < ${rule.maxDurationMs}`;
  }
}

function buildCheckBlock(checks: CheckRule[]): string[] {
  return [
    '  check(response, {',
    ...checks.map(
      (rule) =>
        `    ${formatPropertyKey(rule.name)}: ${checkPredicate(rule)},`,
    ),
    '  });',
  ];
}

function buildRequestCall(config: LoadTestConfig, indent: string): string {
  const { request } = config;
  const params = buildRequestParams(config);
  const hasBody = request.body.type !== 'none';
  const hasParams = Object.keys(params).length > 0;

  const args = [quoteJsString(request.method), 'TARGET_URL'];
  if (hasBody) {
    args.push(
      request.body.type === 'json'
        ? 'JSON.stringify(REQUEST_BODY)'
        : 'REQUEST_BODY',
    );
  } else if (hasParams) {
    args.push('null');
  }
  if (hasParams) {
    args.push(toJsLiteral(params, indent.length));
  }

  return `${indent}http.request(${args.join(', ')});`;
}

/**
 * Generates a complete k6 script from a validated configuration. The function
 * is deterministic and never interpolates untrusted text as executable code:
 * strings go through the JSON-based serializer and only catalog values reach
 * option names and predicates.
 */
export function generateK6Script(config: LoadTestConfig): string {
  const checks = config.checks;
  const lineList: string[] = [
    '// Generated by the k6 Load Test Builder.',
    `// Review this script before running it, then run it with k6.`,
    `// k6 documentation: ${K6_DOCS_URL}`,
    '',
    'import http from "k6/http";',
  ];

  const k6Imports = [
    ...(checks ? ['check'] : []),
    ...(config.pacing ? ['sleep'] : []),
  ];
  if (k6Imports.length > 0) {
    lineList.push(`import { ${k6Imports.join(', ')} } from "k6";`);
  }

  lineList.push('');
  lineList.push(`export const options = ${toJsLiteral(buildOptions(config), 0)};`);
  lineList.push('');
  lineList.push(`const TARGET_URL = ${quoteJsString(config.request.url)};`);

  if (config.request.body.type !== 'none') {
    lineList.push('');
    lineList.push(
      `const REQUEST_BODY = ${toJsLiteral(config.request.body.value, 0)};`,
    );
  }

  lineList.push('');
  lineList.push('export default function () {');

  const requestCall = buildRequestCall(config, '  ');
  if (checks) {
    lineList.push(`  const response = ${requestCall.trimStart()}`);
  } else {
    lineList.push(requestCall);
  }

  if (checks) {
    lineList.push('');
    lineList.push(...buildCheckBlock(checks));
  }

  if (config.pacing) {
    lineList.push('');
    lineList.push(`  sleep(${config.pacing.sleepSeconds});`);
  }

  lineList.push('}');
  lineList.push('');

  return lineList.join('\n');
}