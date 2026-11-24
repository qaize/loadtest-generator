const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
};

/**
 * Parses a k6 duration such as `500ms`, `30s`, `2m`, or `1h30m`. Returns null
 * for anything that is not a complete, positive duration.
 */
export function parseK6Duration(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const input = value.trim();
  if (!input) {
    return null;
  }

  const pattern = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let total = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    if (match.index !== lastIndex) {
      return null;
    }
    total += Number(match[1]) * UNIT_MS[match[2]];
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex !== input.length || total <= 0) {
    return null;
  }
  return total;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stagesDuration(stages: unknown): number | null {
  if (!Array.isArray(stages) || stages.length === 0) {
    return null;
  }

  let total = 0;
  for (const stage of stages) {
    if (!isRecord(stage)) {
      return null;
    }
    const duration = parseK6Duration(stage.duration);
    if (duration === null) {
      return null;
    }
    total += duration;
  }
  return total;
}

/**
 * Estimates the planned wall-clock duration of the configured scenario so the
 * UI can show progress while k6's own progress lines stay hidden.
 */
export function estimateRunDurationMs(config: unknown): number | null {
  if (!isRecord(config) || !isRecord(config.workload)) {
    return null;
  }

  const workload = config.workload;
  const startTime = parseK6Duration(workload.startTime) ?? 0;
  let active: number | null;

  switch (workload.executor) {
    case 'constant-vus':
    case 'constant-arrival-rate':
      active = parseK6Duration(workload.duration);
      break;
    case 'ramping-vus':
    case 'ramping-arrival-rate':
      active = stagesDuration(workload.stages);
      break;
    case 'shared-iterations':
    case 'per-vu-iterations':
      active = parseK6Duration(workload.maxDuration);
      break;
    default:
      return null;
  }

  if (active === null) {
    return null;
  }
  return startTime + active;
}

export function formatRunTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');

  return hours > 0
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}