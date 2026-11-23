import type {
  BodyType,
  CheckType,
  Executor,
  HttpMethod,
  ThresholdAggregation,
  ThresholdMetricId,
  ThresholdOperator,
} from './options';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface HeaderRow {
  name: string;
  value: string;
}

export interface StageRow {
  target: string;
  duration: string;
}

export interface ThresholdRow {
  metric: ThresholdMetricId;
  aggregation: ThresholdAggregation;
  operator: ThresholdOperator;
  value: string;
  abortOnFail: boolean;
  delayAbortEval: string;
}

export interface CheckRow {
  name: string;
  type: CheckType;
  expected: string;
}

export interface TagRow {
  name: string;
  value: string;
}

export interface RequestDraft {
  url: string;
  method: HttpMethod;
  headers: HeaderRow[];
  bodyType: BodyType;
  body: string;
}

export interface WorkloadDraft {
  executor: Executor;
  vus: string;
  duration: string;
  iterations: string;
  maxDuration: string;
  startVUs: string;
  startRate: string;
  rate: string;
  timeUnit: string;
  preAllocatedVUs: string;
  maxVUs: string;
  stages: StageRow[];
  startTime: string;
  gracefulStop: string;
  gracefulRampDown: string;
}

export interface ThresholdsDraft {
  enabled: boolean;
  rows: ThresholdRow[];
}

export interface ChecksDraft {
  enabled: boolean;
  rows: CheckRow[];
}

export interface TagsDraft {
  enabled: boolean;
  rows: TagRow[];
}

export interface HttpBehaviorDraft {
  enabled: boolean;
  userAgent: string;
  maxRedirects: string;
  discardResponseBodies: boolean;
  noConnectionReuse: boolean;
  insecureSkipTLSVerify: boolean;
  timeout: string;
}

export interface PacingDraft {
  enabled: boolean;
  sleepSeconds: string;
}

export interface LoadTestDraft {
  request: RequestDraft;
  workload: WorkloadDraft;
  thresholds: ThresholdsDraft;
  checks: ChecksDraft;
  tags: TagsDraft;
  http: HttpBehaviorDraft;
  pacing: PacingDraft;
}

/* -------------------------------------------------------------------------- */
/*                              Validated config                              */
/* -------------------------------------------------------------------------- */

export type RequestBody =
  | { type: 'none' }
  | { type: 'json'; value: JsonValue }
  | { type: 'text'; value: string };

export interface ValidatedRequest {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: RequestBody;
}

export interface Stage {
  target: number;
  duration: string;
}

interface ScenarioTiming {
  startTime?: string;
  gracefulStop?: string;
}

export type Workload =
  | ({
      executor: 'constant-vus';
      vus: number;
      duration: string;
    } & ScenarioTiming)
  | ({
      executor: 'ramping-vus';
      startVUs: number;
      stages: Stage[];
      gracefulRampDown?: string;
    } & ScenarioTiming)
  | ({
      executor: 'shared-iterations';
      vus: number;
      iterations: number;
      maxDuration?: string;
    } & ScenarioTiming)
  | ({
      executor: 'per-vu-iterations';
      vus: number;
      iterations: number;
      maxDuration?: string;
    } & ScenarioTiming)
  | ({
      executor: 'constant-arrival-rate';
      duration: string;
      rate: number;
      timeUnit: string;
      preAllocatedVUs: number;
      maxVUs?: number;
    } & ScenarioTiming)
  | ({
      executor: 'ramping-arrival-rate';
      startRate: number;
      timeUnit: string;
      preAllocatedVUs: number;
      maxVUs?: number;
      stages: Stage[];
    } & ScenarioTiming);

export interface ThresholdRule {
  metric: ThresholdMetricId;
  aggregation: ThresholdAggregation;
  operator: ThresholdOperator;
  value: number;
  abortOnFail: boolean;
  delayAbortEval?: string;
}

export type CheckRule =
  | { name: string; type: 'status'; expectedStatus: number }
  | { name: string; type: 'bodyIncludes'; expectedText: string }
  | { name: string; type: 'duration'; maxDurationMs: number };

export interface HttpOptions {
  userAgent?: string;
  maxRedirects?: number;
  discardResponseBodies?: boolean;
  noConnectionReuse?: boolean;
  insecureSkipTLSVerify?: boolean;
  timeout?: string;
}

export interface LoadTestConfig {
  request: ValidatedRequest;
  workload: Workload;
  thresholds: ThresholdRule[] | null;
  checks: CheckRule[] | null;
  tags: Record<string, string> | null;
  http: HttpOptions | null;
  pacing: { sleepSeconds: number } | null;
}

export interface ValidationMessage {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  config: LoadTestConfig | null;
  issues: ValidationMessage[];
  warnings: ValidationMessage[];
}