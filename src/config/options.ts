/**
 * Catalogs of values that the builder supports. Keeping these centralized
 * prevents the UI and validator from accepting unsupported k6 features.
 *
 * Sources (verified against the current k6 docs):
 * - Options: https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/
 * - Scenarios: https://grafana.com/docs/k6/latest/using-k6/scenarios/
 * - Thresholds: https://grafana.com/docs/k6/latest/using-k6/thresholds/
 * - Checks: https://grafana.com/docs/k6/latest/using-k6/checks/
 * - HTTP request: https://grafana.com/docs/k6/latest/javascript-api/k6-http/request/
 */

export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export const METHODS_WITHOUT_BODY: readonly HttpMethod[] = ['GET', 'HEAD'];

export const BODY_TYPES = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Raw text' },
] as const;

export type BodyType = (typeof BODY_TYPES)[number]['id'];

export const EXECUTORS = [
  {
    id: 'constant-vus',
    label: 'Constant VUs',
    description: 'A fixed number of VUs iterate for a set duration.',
    hasStages: false,
  },
  {
    id: 'ramping-vus',
    label: 'Ramping VUs',
    description: 'VUs ramp up or down through a series of stages.',
    hasStages: true,
  },
  {
    id: 'shared-iterations',
    label: 'Shared iterations',
    description: 'A fixed iteration count is shared by all VUs.',
    hasStages: false,
  },
  {
    id: 'per-vu-iterations',
    label: 'Iterations per VU',
    description: 'Every VU completes the same number of iterations.',
    hasStages: false,
  },
  {
    id: 'constant-arrival-rate',
    label: 'Constant arrival rate',
    description: 'Iterations start at a fixed rate, independent of response time.',
    hasStages: false,
  },
  {
    id: 'ramping-arrival-rate',
    label: 'Ramping arrival rate',
    description: 'The iteration arrival rate changes through stages.',
    hasStages: true,
  },
] as const;

export type Executor = (typeof EXECUTORS)[number]['id'];

export function usesStages(executor: Executor): boolean {
  return EXECUTORS.find((item) => item.id === executor)?.hasStages ?? false;
}

export function isArrivalRateExecutor(executor: Executor): boolean {
  return executor === 'constant-arrival-rate' || executor === 'ramping-arrival-rate';
}

export const THRESHOLD_AGGREGATIONS = [
  'avg',
  'min',
  'max',
  'med',
  'p(90)',
  'p(95)',
  'p(99)',
  'count',
  'rate',
] as const;

export type ThresholdAggregation = (typeof THRESHOLD_AGGREGATIONS)[number];

export const THRESHOLD_OPERATORS = ['<', '<=', '>', '>=', '==', '!='] as const;

export type ThresholdOperator = (typeof THRESHOLD_OPERATORS)[number];

export interface ThresholdMetric {
  id: string;
  label: string;
  kind: 'trend' | 'rate' | 'counter';
  aggregations: readonly ThresholdAggregation[];
  valueHint: string;
}

export const THRESHOLD_METRICS: readonly ThresholdMetric[] = [
  {
    id: 'http_req_duration',
    label: 'http_req_duration — response time',
    kind: 'trend',
    aggregations: ['avg', 'min', 'max', 'med', 'p(90)', 'p(95)', 'p(99)'],
    valueHint: 'Time in milliseconds',
  },
  {
    id: 'http_req_waiting',
    label: 'http_req_waiting — time to first byte',
    kind: 'trend',
    aggregations: ['avg', 'min', 'max', 'med', 'p(90)', 'p(95)', 'p(99)'],
    valueHint: 'Time in milliseconds',
  },
  {
    id: 'http_req_failed',
    label: 'http_req_failed — failed request rate',
    kind: 'rate',
    aggregations: ['rate'],
    valueHint: 'Ratio from 0 to 1 (0.01 = 1%)',
  },
  {
    id: 'http_reqs',
    label: 'http_reqs — total requests',
    kind: 'counter',
    aggregations: ['count', 'rate'],
    valueHint: 'Count or per-second rate',
  },
  {
    id: 'iterations',
    label: 'iterations — completed iterations',
    kind: 'counter',
    aggregations: ['count', 'rate'],
    valueHint: 'Count or per-second rate',
  },
  {
    id: 'checks',
    label: 'checks — successful check rate',
    kind: 'rate',
    aggregations: ['rate'],
    valueHint: 'Ratio from 0 to 1 (0.9 = 90%)',
  },
];

export type ThresholdMetricId = (typeof THRESHOLD_METRICS)[number]['id'];

export function getThresholdMetric(id: string): ThresholdMetric | undefined {
  return THRESHOLD_METRICS.find((metric) => metric.id === id);
}

export const CHECK_TYPES = [
  { id: 'status', label: 'Response status equals' },
  { id: 'bodyIncludes', label: 'Response body includes' },
  { id: 'duration', label: 'Response time is under (ms)' },
] as const;

export type CheckType = (typeof CHECK_TYPES)[number]['id'];

export const DEFAULT_SCRIPT_FILENAME = 'blabla.js';

export const K6_DOCS_URL = 'https://grafana.com/docs/k6/latest/';