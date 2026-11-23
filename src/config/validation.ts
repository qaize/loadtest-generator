import {
  CHECK_TYPES,
  EXECUTORS,
  HTTP_METHODS,
  METHODS_WITHOUT_BODY,
  THRESHOLD_OPERATORS,
  getThresholdMetric,
  isArrivalRateExecutor,
} from './options';
import type {
  CheckRule,
  HttpOptions,
  JsonValue,
  LoadTestConfig,
  LoadTestDraft,
  Stage,
  ThresholdRule,
  ValidatedRequest,
  ValidationMessage,
  ValidationResult,
  Workload,
} from './types';

const MAX_URL_LENGTH = 2048;
const MAX_HEADER_COUNT = 30;
const MAX_BODY_LENGTH = 100_000;
const MAX_JSON_DEPTH = 20;
const MAX_TAGS = 20;
const MAX_THRESHOLD_COUNT = 20;
const MAX_CHECK_COUNT = 20;

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const TAG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const INTEGER_PATTERN = /^\d+$/;

interface NumberBounds {
  min: number;
  max: number;
  integer?: boolean;
  unit?: string;
}

interface DurationOptions {
  allowZero?: boolean;
  optional?: boolean;
}

function hasLineBreak(value: string): boolean {
  return /[\r\n]/.test(value);
}

function parseNumber(
  raw: string,
  path: string,
  label: string,
  bounds: NumberBounds,
  issues: ValidationMessage[],
): number | undefined {
  const value = raw.trim();
  if (value === '') {
    issues.push({ path, message: `${label} is required.` });
    return undefined;
  }
  if (bounds.integer && !INTEGER_PATTERN.test(value)) {
    issues.push({ path, message: `${label} must be a whole number.` });
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    issues.push({ path, message: `${label} must be a number.` });
    return undefined;
  }
  if (bounds.integer && !Number.isInteger(parsed)) {
    issues.push({ path, message: `${label} must be a whole number.` });
    return undefined;
  }
  if (parsed < bounds.min || parsed > bounds.max) {
    const suffix = bounds.unit ? ` ${bounds.unit}` : '';
    issues.push({
      path,
      message: `${label} must be between ${bounds.min} and ${bounds.max}${suffix}.`,
    });
    return undefined;
  }
  return parsed;
}

/**
 * Converts a k6/Go-style duration such as "30s", "2m", "1m30s", or "500ms"
 * into milliseconds. Returns null for unsupported or malformed values.
 */
export function durationToMilliseconds(value: string): number | null {
  const input = value.trim();
  if (input === '') {
    return null;
  }

  const tokenPattern = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let total = 0;
  let consumed = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(input)) !== null) {
    if (match.index !== consumed) {
      return null;
    }
    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier =
      unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : unit === 's' ? 1_000 : 1;
    total += amount * multiplier;
    consumed = tokenPattern.lastIndex;
  }

  if (consumed !== input.length) {
    return null;
  }
  return total;
}

function parseDuration(
  raw: string,
  path: string,
  label: string,
  options: DurationOptions,
  issues: ValidationMessage[],
): string | undefined {
  const value = raw.trim();
  if (value === '') {
    if (!options.optional) {
      issues.push({ path, message: `${label} is required.` });
    }
    return undefined;
  }

  const milliseconds = durationToMilliseconds(value);
  if (milliseconds === null) {
    issues.push({
      path,
      message: `${label} must use a k6 duration such as 30s, 2m, 1m30s, or 500ms.`,
    });
    return undefined;
  }
  if (!options.allowZero && milliseconds <= 0) {
    issues.push({ path, message: `${label} must be greater than zero.` });
    return undefined;
  }
  return value;
}

function validateRequest(
  draft: LoadTestDraft['request'],
  issues: ValidationMessage[],
): ValidatedRequest | null {
  const url = typeof draft.url === 'string' ? draft.url.trim() : '';
  let validUrl = false;

  if (url === '') {
    issues.push({ path: 'request.url', message: 'Enter the target URL.' });
  } else if (url.length > MAX_URL_LENGTH) {
    issues.push({
      path: 'request.url',
      message: `The URL must be ${MAX_URL_LENGTH} characters or fewer.`,
    });
  } else if (/\s/.test(url)) {
    issues.push({
      path: 'request.url',
      message: 'The URL cannot contain spaces. Encode spaces as %20.',
    });
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        issues.push({
          path: 'request.url',
          message: 'Only http:// and https:// URLs are supported.',
        });
      } else if (parsed.hostname === '') {
        issues.push({ path: 'request.url', message: 'The URL must include a hostname.' });
      } else {
        validUrl = true;
      }
    } catch {
      issues.push({
        path: 'request.url',
        message: 'Enter a complete URL, for example https://api.example.com/orders.',
      });
    }
  }

  const method = HTTP_METHODS.find((item) => item === draft.method);
  if (!method) {
    issues.push({ path: 'request.method', message: 'Choose a supported HTTP method.' });
  }

  const headers: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  const seenHeaders = new Set<string>();
  const headerRows = Array.isArray(draft.headers) ? draft.headers : [];

  if (headerRows.length > MAX_HEADER_COUNT) {
    issues.push({
      path: 'request.headers',
      message: `Use at most ${MAX_HEADER_COUNT} headers.`,
    });
  }

  headerRows.slice(0, MAX_HEADER_COUNT).forEach((row, index) => {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const value = typeof row.value === 'string' ? row.value : '';

    if (name === '' && value.trim() === '') {
      return;
    }
    if (name === '') {
      issues.push({
        path: `request.headers.${index}.name`,
        message: 'Enter a header name or remove this row.',
      });
      return;
    }
    if (!HEADER_NAME_PATTERN.test(name)) {
      issues.push({
        path: `request.headers.${index}.name`,
        message: 'Header names may only contain letters, numbers, and token symbols.',
      });
    }
    if (value.trim() === '') {
      issues.push({
        path: `request.headers.${index}.value`,
        message: 'Enter a header value or remove this row.',
      });
    }
    if (hasLineBreak(value)) {
      issues.push({
        path: `request.headers.${index}.value`,
        message: 'Header values cannot contain line breaks.',
      });
    }
    if (value.length > 4_096) {
      issues.push({
        path: `request.headers.${index}.value`,
        message: 'Header values must be 4,096 characters or fewer.',
      });
    }

    const normalized = name.toLowerCase();
    if (seenHeaders.has(normalized)) {
      issues.push({
        path: `request.headers.${index}.name`,
        message: `The ${name} header is already defined.`,
      });
    } else {
      seenHeaders.add(normalized);
      headers[name] = value;
    }
  });

  let body: ValidatedRequest['body'] = { type: 'none' };

  if (method && METHODS_WITHOUT_BODY.includes(method) && draft.bodyType !== 'none') {
    issues.push({
      path: 'request.body',
      message: `${method} requests cannot include a body. Choose the None body type.`,
    });
  } else if (draft.bodyType === 'json') {
    const rawBody = typeof draft.body === 'string' ? draft.body : '';
    if (rawBody.trim() === '') {
      issues.push({ path: 'request.body', message: 'Enter a JSON body or choose None.' });
    } else if (rawBody.length > MAX_BODY_LENGTH) {
      issues.push({
        path: 'request.body',
        message: `The body must be ${MAX_BODY_LENGTH.toLocaleString('en-US')} characters or fewer.`,
      });
    } else {
      try {
        const parsed: unknown = JSON.parse(rawBody);
        if (!isJsonDepthAllowed(parsed as JsonValue)) {
          issues.push({
            path: 'request.body',
            message: `The JSON body can be nested at most ${MAX_JSON_DEPTH} levels deep.`,
          });
        } else {
          body = { type: 'json', value: parsed as JsonValue };
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown parse error.';
        issues.push({
          path: 'request.body',
          message: `The body is not valid JSON. ${detail}`,
        });
      }
    }
  } else if (draft.bodyType === 'text') {
    const rawBody = typeof draft.body === 'string' ? draft.body : '';
    if (rawBody.trim() === '') {
      issues.push({ path: 'request.body', message: 'Enter a text body or choose None.' });
    } else if (rawBody.length > MAX_BODY_LENGTH) {
      issues.push({
        path: 'request.body',
        message: `The body must be ${MAX_BODY_LENGTH.toLocaleString('en-US')} characters or fewer.`,
      });
    } else {
      body = { type: 'text', value: rawBody };
    }
  } else if (draft.bodyType !== 'none') {
    issues.push({ path: 'request.bodyType', message: 'Choose a supported body format.' });
  }

  if (!validUrl || !method) {
    return null;
  }

  return { url, method, headers, body };
}

function isJsonDepthAllowed(value: JsonValue, depth = 0): boolean {
  if (depth > MAX_JSON_DEPTH) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonDepthAllowed(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).every((item) => isJsonDepthAllowed(item, depth + 1));
  }
  return true;
}

function parseStages(
  rows: LoadTestDraft['workload']['stages'],
  issues: ValidationMessage[],
  targetLabel: string,
  maxTarget: number,
): Stage[] | null {
  const stageRows = Array.isArray(rows) ? rows : [];
  if (stageRows.length === 0) {
    issues.push({ path: 'workload.stages', message: 'Add at least one stage.' });
    return null;
  }
  if (stageRows.length > 20) {
    issues.push({ path: 'workload.stages', message: 'Use at most 20 stages.' });
    return null;
  }

  const stages: Stage[] = [];
  stageRows.forEach((row, index) => {
    const target = parseNumber(
      row.target,
      `workload.stages.${index}.target`,
      `${targetLabel} for stage ${index + 1}`,
      { min: 0, max: maxTarget, integer: true },
      issues,
    );
    const duration = parseDuration(
      row.duration,
      `workload.stages.${index}.duration`,
      `Duration for stage ${index + 1}`,
      {},
      issues,
    );
    if (target !== undefined && duration !== undefined) {
      stages.push({ target, duration });
    }
  });

  return stages.length === stageRows.length ? stages : null;
}

function parseOptionalMaxDuration(
  raw: string,
  path: string,
  issues: ValidationMessage[],
): string | undefined {
  return parseDuration(raw, path, 'Maximum duration', { optional: true }, issues);
}

function buildScenarioTiming(
  draft: LoadTestDraft['workload'],
  issues: ValidationMessage[],
): { startTime?: string; gracefulStop?: string } {
  const startTime = parseDuration(
    draft.startTime,
    'workload.startTime',
    'Scenario start time',
    { allowZero: true, optional: true },
    issues,
  );
  const gracefulStop = parseDuration(
    draft.gracefulStop,
    'workload.gracefulStop',
    'Graceful stop',
    { allowZero: true, optional: true },
    issues,
  );

  return {
    ...(startTime !== undefined ? { startTime } : {}),
    ...(gracefulStop !== undefined ? { gracefulStop } : {}),
  };
}

function validateWorkload(
  draft: LoadTestDraft['workload'],
  issues: ValidationMessage[],
): Workload | null {
  const executor = EXECUTORS.find((item) => item.id === draft.executor)?.id;
  if (!executor) {
    issues.push({ path: 'workload.executor', message: 'Choose a supported executor.' });
    return null;
  }

  const timing = buildScenarioTiming(draft, issues);
  const maxVusBounds: NumberBounds = { min: 1, max: 100_000, integer: true };
  const startVusBounds: NumberBounds = { min: 0, max: 100_000, integer: true };
  const iterationsBounds: NumberBounds = { min: 1, max: 100_000_000, integer: true };

  switch (executor) {
    case 'constant-vus': {
      const vus = parseNumber(draft.vus, 'workload.vus', 'Virtual users', maxVusBounds, issues);
      const duration = parseDuration(
        draft.duration,
        'workload.duration',
        'Duration',
        {},
        issues,
      );
      if (vus === undefined || duration === undefined) {
        return null;
      }
      return { executor, vus, duration, ...timing };
    }
    case 'ramping-vus': {
      const startVUs = parseNumber(
        draft.startVUs,
        'workload.startVUs',
        'Starting VUs',
        startVusBounds,
        issues,
      );
      const stages = parseStages(draft.stages, issues, 'Target VUs', 100_000);
      const gracefulRampDown = parseDuration(
        draft.gracefulRampDown,
        'workload.gracefulRampDown',
        'Graceful ramp-down',
        { allowZero: true, optional: true },
        issues,
      );
      if (startVUs === undefined || stages === null) {
        return null;
      }
      return {
        executor,
        startVUs,
        stages,
        ...(gracefulRampDown !== undefined ? { gracefulRampDown } : {}),
        ...timing,
      };
    }
    case 'shared-iterations':
    case 'per-vu-iterations': {
      const vus = parseNumber(draft.vus, 'workload.vus', 'Virtual users', maxVusBounds, issues);
      const iterations = parseNumber(
        draft.iterations,
        'workload.iterations',
        'Iterations',
        iterationsBounds,
        issues,
      );
      const maxDuration = parseOptionalMaxDuration(
        draft.maxDuration,
        'workload.maxDuration',
        issues,
      );
      if (vus === undefined || iterations === undefined) {
        return null;
      }
      return {
        executor,
        vus,
        iterations,
        ...(maxDuration !== undefined ? { maxDuration } : {}),
        ...timing,
      };
    }
    case 'constant-arrival-rate': {
      const rate = parseNumber(
        draft.rate,
        'workload.rate',
        'Iteration rate',
        { min: 1, max: 1_000_000, integer: true },
        issues,
      );
      const timeUnit = parseDuration(
        draft.timeUnit,
        'workload.timeUnit',
        'Rate time unit',
        {},
        issues,
      );
      const duration = parseDuration(
        draft.duration,
        'workload.duration',
        'Duration',
        {},
        issues,
      );
      const preAllocatedVUs = parseNumber(
        draft.preAllocatedVUs,
        'workload.preAllocatedVUs',
        'Pre-allocated VUs',
        maxVusBounds,
        issues,
      );
      const maxVUs = parseOptionalMaxVUs(draft.maxVUs, preAllocatedVUs, issues);
      if (
        rate === undefined ||
        timeUnit === undefined ||
        duration === undefined ||
        preAllocatedVUs === undefined
      ) {
        return null;
      }
      return {
        executor,
        duration,
        rate,
        timeUnit,
        preAllocatedVUs,
        ...(maxVUs !== undefined ? { maxVUs } : {}),
        ...timing,
      };
    }
    case 'ramping-arrival-rate': {
      const startRate = parseNumber(
        draft.startRate,
        'workload.startRate',
        'Starting rate',
        { min: 0, max: 1_000_000, integer: true },
        issues,
      );
      const timeUnit = parseDuration(
        draft.timeUnit,
        'workload.timeUnit',
        'Rate time unit',
        {},
        issues,
      );
      const stages = parseStages(draft.stages, issues, 'Target rate', 1_000_000);
      const preAllocatedVUs = parseNumber(
        draft.preAllocatedVUs,
        'workload.preAllocatedVUs',
        'Pre-allocated VUs',
        maxVusBounds,
        issues,
      );
      const maxVUs = parseOptionalMaxVUs(draft.maxVUs, preAllocatedVUs, issues);
      if (
        startRate === undefined ||
        timeUnit === undefined ||
        stages === null ||
        preAllocatedVUs === undefined
      ) {
        return null;
      }
      return {
        executor,
        startRate,
        timeUnit,
        preAllocatedVUs,
        ...(maxVUs !== undefined ? { maxVUs } : {}),
        stages,
        ...timing,
      };
    }
  }
}

function parseOptionalMaxVUs(
  raw: string,
  preAllocatedVUs: number | undefined,
  issues: ValidationMessage[],
): number | undefined {
  const value = raw.trim();
  if (value === '') {
    return undefined;
  }
  const maxVUs = parseNumber(
    raw,
    'workload.maxVUs',
    'Maximum VUs',
    { min: 1, max: 100_000, integer: true },
    issues,
  );
  if (
    maxVUs !== undefined &&
    preAllocatedVUs !== undefined &&
    maxVUs < preAllocatedVUs
  ) {
    issues.push({
      path: 'workload.maxVUs',
      message: 'Maximum VUs must be greater than or equal to the pre-allocated VUs.',
    });
    return undefined;
  }
  return maxVUs;
}

function validateThresholds(
  draft: LoadTestDraft['thresholds'],
  issues: ValidationMessage[],
): ThresholdRule[] | null {
  if (!draft.enabled) {
    return null;
  }

  const rows = Array.isArray(draft.rows) ? draft.rows : [];
  if (rows.length === 0) {
    issues.push({
      path: 'thresholds.rows',
      message: 'Add at least one threshold or disable this section.',
    });
    return null;
  }
  if (rows.length > MAX_THRESHOLD_COUNT) {
    issues.push({
      path: 'thresholds.rows',
      message: `Use at most ${MAX_THRESHOLD_COUNT} thresholds.`,
    });
    return null;
  }

  const rules: ThresholdRule[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const path = `thresholds.rows.${index}`;
    const metric = getThresholdMetric(row.metric);
    if (!metric) {
      issues.push({ path: `${path}.metric`, message: 'Choose a supported metric.' });
      return;
    }

    const aggregation = metric.aggregations.find((item) => item === row.aggregation);
    if (!aggregation) {
      issues.push({
        path: `${path}.aggregation`,
        message: `Choose ${metric.aggregations.join(', ')} for ${metric.id}.`,
      });
    }

    const operator = THRESHOLD_OPERATORS.find((item) => item === row.operator);
    if (!operator) {
      issues.push({ path: `${path}.operator`, message: 'Choose a supported operator.' });
    }

    const value = parseNumber(
      row.value,
      `${path}.value`,
      'Threshold value',
      metric.kind === 'rate' ? { min: 0, max: 1 } : { min: 0, max: 1_000_000_000 },
      issues,
    );

    const delayAbortEval = parseDuration(
      row.delayAbortEval,
      `${path}.delayAbortEval`,
      'Delay before abort check',
      { allowZero: true, optional: true },
      issues,
    );

    if (delayAbortEval !== undefined && !row.abortOnFail) {
      issues.push({
        path: `${path}.delayAbortEval`,
        message: 'A delay only applies when Abort on fail is enabled.',
      });
    }

    if (aggregation && operator && value !== undefined) {
      const signature = `${metric.id}|${aggregation}|${operator}|${value}`;
      if (seen.has(signature)) {
        issues.push({
          path,
          message: 'This threshold condition is duplicated.',
        });
      } else {
        seen.add(signature);
        rules.push({
          metric: metric.id,
          aggregation,
          operator,
          value,
          abortOnFail: row.abortOnFail,
          ...(delayAbortEval !== undefined ? { delayAbortEval } : {}),
        });
      }
    }
  });

  return rules.length === rows.length ? rules : null;
}

function validateChecks(
  draft: LoadTestDraft['checks'],
  issues: ValidationMessage[],
): CheckRule[] | null {
  if (!draft.enabled) {
    return null;
  }

  const rows = Array.isArray(draft.rows) ? draft.rows : [];
  if (rows.length === 0) {
    issues.push({
      path: 'checks.rows',
      message: 'Add at least one check or disable this section.',
    });
    return null;
  }
  if (rows.length > MAX_CHECK_COUNT) {
    issues.push({
      path: 'checks.rows',
      message: `Use at most ${MAX_CHECK_COUNT} checks.`,
    });
    return null;
  }

  const checks: CheckRule[] = [];
  const names = new Set<string>();

  rows.forEach((row, index) => {
    const path = `checks.rows.${index}`;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (name === '') {
      issues.push({ path: `${path}.name`, message: 'Give the check a name.' });
      return;
    }
    if (name.length > 120) {
      issues.push({
        path: `${path}.name`,
        message: 'Check names must be 120 characters or fewer.',
      });
    }
    if (names.has(name)) {
      issues.push({ path: `${path}.name`, message: 'Check names must be unique.' });
    } else {
      names.add(name);
    }

    const type = CHECK_TYPES.find((item) => item.id === row.type)?.id;
    if (!type) {
      issues.push({ path: `${path}.type`, message: 'Choose a supported check type.' });
      return;
    }

    if (type === 'status') {
      const expectedStatus = parseNumber(
        row.expected,
        `${path}.expected`,
        'Expected status',
        { min: 100, max: 599, integer: true },
        issues,
      );
      if (expectedStatus !== undefined) {
        checks.push({ name, type, expectedStatus });
      }
    } else if (type === 'bodyIncludes') {
      const expectedText = typeof row.expected === 'string' ? row.expected : '';
      if (expectedText.trim() === '') {
        issues.push({
          path: `${path}.expected`,
          message: 'Enter the text to look for in the response body.',
        });
      } else if (expectedText.length > 2_000) {
        issues.push({
          path: `${path}.expected`,
          message: 'The response text must be 2,000 characters or fewer.',
        });
      } else {
        checks.push({ name, type, expectedText });
      }
    } else if (type === 'duration') {
      const maxDurationMs = parseNumber(
        row.expected,
        `${path}.expected`,
        'Maximum response time',
        { min: 1, max: 600_000, integer: true },
        issues,
      );
      if (maxDurationMs !== undefined) {
        checks.push({ name, type, maxDurationMs });
      }
    }
  });

  return checks.length === rows.length ? checks : null;
}

function validateTags(
  draft: LoadTestDraft['tags'],
  issues: ValidationMessage[],
): Record<string, string> | null {
  if (!draft.enabled) {
    return null;
  }

  const rows = Array.isArray(draft.rows) ? draft.rows : [];
  if (rows.length > MAX_TAGS) {
    issues.push({ path: 'tags.rows', message: `Use at most ${MAX_TAGS} tags.` });
    return null;
  }

  const tags: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  let count = 0;

  rows.forEach((row, index) => {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const value = typeof row.value === 'string' ? row.value.trim() : '';
    if (name === '' && value === '') {
      return;
    }
    count += 1;
    if (name === '') {
      issues.push({
        path: `tags.rows.${index}.name`,
        message: 'Enter a tag name or remove this row.',
      });
      return;
    }
    if (!TAG_NAME_PATTERN.test(name)) {
      issues.push({
        path: `tags.rows.${index}.name`,
        message: 'Tag names may only contain letters, numbers, dots, colons, dashes, and underscores.',
      });
    }
    if (hasLineBreak(value)) {
      issues.push({
        path: `tags.rows.${index}.value`,
        message: 'Tag values cannot contain line breaks.',
      });
    }
    if (value.length > 500) {
      issues.push({
        path: `tags.rows.${index}.value`,
        message: 'Tag values must be 500 characters or fewer.',
      });
    }
    if (Object.hasOwn(tags, name)) {
      issues.push({
        path: `tags.rows.${index}.name`,
        message: `The ${name} tag is already defined.`,
      });
    } else {
      tags[name] = value;
    }
  });

  if (count === 0) {
    issues.push({
      path: 'tags.rows',
      message: 'Add at least one tag or disable this section.',
    });
    return null;
  }

  return tags;
}

function validateHttpBehavior(
  draft: LoadTestDraft['http'],
  issues: ValidationMessage[],
  warnings: ValidationMessage[],
): HttpOptions | null {
  if (!draft.enabled) {
    return null;
  }

  const options: HttpOptions = {};
  let configured = false;

  const userAgent = typeof draft.userAgent === 'string' ? draft.userAgent.trim() : '';
  if (userAgent !== '') {
    configured = true;
    if (hasLineBreak(userAgent)) {
      issues.push({
        path: 'http.userAgent',
        message: 'The user agent cannot contain line breaks.',
      });
    } else if (userAgent.length > 512) {
      issues.push({
        path: 'http.userAgent',
        message: 'The user agent must be 512 characters or fewer.',
      });
    } else {
      options.userAgent = userAgent;
    }
  }

  if (draft.maxRedirects.trim() !== '') {
    configured = true;
    const maxRedirects = parseNumber(
      draft.maxRedirects,
      'http.maxRedirects',
      'Maximum redirects',
      { min: 0, max: 1_000, integer: true },
      issues,
    );
    if (maxRedirects !== undefined) {
      options.maxRedirects = maxRedirects;
    }
  }

  const timeout = parseDuration(
    draft.timeout,
    'http.timeout',
    'Request timeout',
    { optional: true },
    issues,
  );
  if (timeout !== undefined) {
    configured = true;
    options.timeout = timeout;
  }

  if (draft.discardResponseBodies) {
    configured = true;
    options.discardResponseBodies = true;
  }
  if (draft.noConnectionReuse) {
    configured = true;
    options.noConnectionReuse = true;
  }
  if (draft.insecureSkipTLSVerify) {
    configured = true;
    options.insecureSkipTLSVerify = true;
    warnings.push({
      path: 'http.insecureSkipTLSVerify',
      message: 'TLS certificate verification is disabled. Use this only for trusted test targets.',
    });
  }

  if (!configured) {
    issues.push({
      path: 'http.enabled',
      message: 'Configure at least one HTTP option or disable this section.',
    });
    return null;
  }

  return options;
}

function validatePacing(
  draft: LoadTestDraft['pacing'],
  issues: ValidationMessage[],
): { sleepSeconds: number } | null {
  if (!draft.enabled) {
    return null;
  }
  const sleepSeconds = parseNumber(
    draft.sleepSeconds,
    'pacing.sleepSeconds',
    'Sleep time',
    { min: 0.001, max: 3_600 },
    issues,
  );
  return sleepSeconds === undefined ? null : { sleepSeconds };
}

export function validateConfig(draft: LoadTestDraft): ValidationResult {
  const issues: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];

  const request = validateRequest(draft.request, issues);
  const workload = validateWorkload(draft.workload, issues);
  const thresholds = validateThresholds(draft.thresholds, issues);
  const checks = validateChecks(draft.checks, issues);
  const tags = validateTags(draft.tags, issues);
  const http = validateHttpBehavior(draft.http, issues, warnings);
  const pacing = validatePacing(draft.pacing, issues);

  if (pacing && workload && isArrivalRateExecutor(workload.executor)) {
    warnings.push({
      path: 'pacing.sleepSeconds',
      message:
        'Sleep is not recommended with arrival-rate executors; k6 already paces their iterations.',
    });
  }

  if (thresholds?.some((rule) => rule.metric === 'checks') && !checks) {
    warnings.push({
      path: 'thresholds.rows',
      message: 'The checks threshold needs at least one generated check to produce data.',
    });
  }

  if (
    http?.discardResponseBodies &&
    checks?.some((check) => check.type === 'bodyIncludes')
  ) {
    warnings.push({
      path: 'http.discardResponseBodies',
      message:
        'Response bodies are discarded, so body-content checks cannot pass. Disable body discarding or remove those checks.',
    });
  }

  if (issues.length > 0 || !request || !workload) {
    return { valid: false, config: null, issues, warnings };
  }

  const config: LoadTestConfig = {
    request,
    workload,
    thresholds,
    checks,
    tags,
    http,
    pacing,
  };

  return { valid: true, config, issues: [], warnings };
}

/** Returns the first issue for an exact field path. */
export function issueAt(
  issues: ValidationMessage[],
  path: string,
): ValidationMessage | undefined {
  return issues.find((issue) => issue.path === path);
}

/** Returns all issues below a path prefix (for row groups). */
export function issuesUnder(
  issues: ValidationMessage[],
  prefix: string,
): ValidationMessage[] {
  return issues.filter(
    (issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`),
  );
}