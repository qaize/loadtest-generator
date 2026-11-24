import { describe, expect, it } from 'vitest';
import {
  estimateRunDurationMs,
  formatRunTime,
  parseK6Duration,
} from './duration';

describe('parseK6Duration', () => {
  it('parses single and compound k6 durations', () => {
    expect(parseK6Duration('500ms')).toBe(500);
    expect(parseK6Duration('30s')).toBe(30_000);
    expect(parseK6Duration('2m')).toBe(120_000);
    expect(parseK6Duration('1h30m')).toBe(5_400_000);
    expect(parseK6Duration('1m30s')).toBe(90_000);
    expect(parseK6Duration('1.5s')).toBe(1_500);
    expect(parseK6Duration(' 10s ')).toBe(10_000);
  });

  it('rejects incomplete or non-positive values', () => {
    expect(parseK6Duration('30')).toBeNull();
    expect(parseK6Duration('30 s')).toBeNull();
    expect(parseK6Duration('soon')).toBeNull();
    expect(parseK6Duration('0s')).toBeNull();
    expect(parseK6Duration('')).toBeNull();
    expect(parseK6Duration(undefined)).toBeNull();
    expect(parseK6Duration(30)).toBeNull();
  });
});

describe('estimateRunDurationMs', () => {
  it('uses the duration of fixed-duration executors', () => {
    expect(
      estimateRunDurationMs({
        workload: { executor: 'constant-vus', duration: '30s', startTime: '5s' },
      }),
    ).toBe(35_000);

    expect(
      estimateRunDurationMs({
        workload: { executor: 'constant-arrival-rate', duration: '2m' },
      }),
    ).toBe(120_000);
  });

  it('sums stages for ramping executors', () => {
    expect(
      estimateRunDurationMs({
        workload: {
          executor: 'ramping-vus',
          stages: [
            { target: '10', duration: '30s' },
            { target: '0', duration: '10s' },
          ],
        },
      }),
    ).toBe(40_000);
  });

  it('uses maxDuration for iteration executors when present', () => {
    expect(
      estimateRunDurationMs({
        workload: {
          executor: 'shared-iterations',
          maxDuration: '1m',
        },
      }),
    ).toBe(60_000);

    expect(
      estimateRunDurationMs({
        workload: { executor: 'per-vu-iterations', maxDuration: '' },
      }),
    ).toBeNull();
  });

  it('returns null when the duration is unknown or malformed', () => {
    expect(estimateRunDurationMs(null)).toBeNull();
    expect(estimateRunDurationMs({})).toBeNull();
    expect(estimateRunDurationMs({ workload: { executor: 'nope' } })).toBeNull();
    expect(
      estimateRunDurationMs({
        workload: {
          executor: 'ramping-vus',
          stages: [{ target: '10', duration: 'soon' }],
        },
      }),
    ).toBeNull();
  });
});

describe('formatRunTime', () => {
  it('formats minutes and seconds, adding hours when needed', () => {
    expect(formatRunTime(0)).toBe('00:00');
    expect(formatRunTime(30_000)).toBe('00:30');
    expect(formatRunTime(90_000)).toBe('01:30');
    expect(formatRunTime(3_600_000)).toBe('1:00:00');
    expect(formatRunTime(3_661_000)).toBe('1:01:01');
  });
});