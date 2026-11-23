import type {
  CheckRow,
  HeaderRow,
  LoadTestDraft,
  StageRow,
  TagRow,
  ThresholdRow,
} from './types';

export function createHeaderRow(): HeaderRow {
  return { name: '', value: '' };
}

export function createStageRow(): StageRow {
  return { target: '10', duration: '10s' };
}

export function createThresholdRow(
  overrides: Partial<ThresholdRow> = {},
): ThresholdRow {
  return {
    metric: 'http_req_duration',
    aggregation: 'p(95)',
    operator: '<',
    value: '500',
    abortOnFail: false,
    delayAbortEval: '',
    ...overrides,
  };
}

export function createCheckRow(name = 'response is successful'): CheckRow {
  return { name, type: 'status', expected: '200' };
}

export function createTagRow(): TagRow {
  return { name: '', value: '' };
}

export function createDefaultDraft(): LoadTestDraft {
  return {
    request: {
      url: 'https://test.k6.io/',
      method: 'GET',
      headers: [],
      bodyType: 'none',
      body: '',
    },
    workload: {
      executor: 'constant-vus',
      vus: '10',
      duration: '30s',
      iterations: '100',
      maxDuration: '',
      startVUs: '0',
      startRate: '5',
      rate: '10',
      timeUnit: '1s',
      preAllocatedVUs: '10',
      maxVUs: '50',
      stages: [
        { target: '10', duration: '10s' },
        { target: '10', duration: '20s' },
        { target: '0', duration: '10s' },
      ],
      startTime: '',
      gracefulStop: '',
      gracefulRampDown: '',
    },
    thresholds: {
      enabled: true,
      rows: [
        createThresholdRow({
          metric: 'http_req_duration',
          aggregation: 'p(95)',
          operator: '<',
          value: '500',
        }),
      ],
    },
    checks: {
      enabled: true,
      rows: [createCheckRow('status is 200')],
    },
    tags: {
      enabled: false,
      rows: [{ name: 'environment', value: 'staging' }],
    },
    http: {
      enabled: false,
      userAgent: '',
      maxRedirects: '',
      discardResponseBodies: false,
      noConnectionReuse: false,
      insecureSkipTLSVerify: false,
      timeout: '',
    },
    pacing: {
      enabled: false,
      sleepSeconds: '1',
    },
  };
}