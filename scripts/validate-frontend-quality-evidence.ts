export interface PerformanceSample {
  lcpMs: number;
  tbtMs: number;
}

interface PerformanceLane {
  samples?: PerformanceSample[];
  thresholds?: PerformanceSample;
  status?: string;
}

export interface FrontendPerformanceEvidence {
  schemaVersion?: string;
  generatedAt?: string;
  sourceCommit?: string;
  runnerFingerprint?: { osImage?: string; browserRevision?: string; nodeVersion?: string };
  cold?: PerformanceLane;
  warm?: PerformanceLane;
  longTasks?: Array<{ lane?: string; durationMs?: number; attribution?: string }>;
  regressionFixture?: { name?: string; coldFailed?: boolean; warmFailed?: boolean };
}

export interface FlakeLedger {
  schemaVersion?: string;
  generatedAt?: string;
  windowDays?: number;
  suite?: string;
  totalRuns?: number;
  thresholdRate?: number;
  retryPolicy?: { preserveOriginalFailure?: boolean };
  events?: Array<{
    occurredAt?: string;
    browser?: string;
    step?: string;
    traceArtifact?: string;
    knownUpstream?: string | null;
    expiresAt?: string | null;
  }>;
  alert?: boolean;
}

function validInstant(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function laneStatus(lane: PerformanceLane): 'pass' | 'fail' | null {
  const samples = lane.samples ?? [];
  const thresholds = lane.thresholds;
  if (
    samples.length === 0 ||
    !thresholds ||
    !(thresholds.lcpMs > 0) ||
    !(thresholds.tbtMs > 0) ||
    samples.some((sample) => !(sample.lcpMs >= 0) || !(sample.tbtMs >= 0))
  ) {
    return null;
  }
  return samples.some((sample) => sample.lcpMs > thresholds.lcpMs || sample.tbtMs > thresholds.tbtMs) ? 'fail' : 'pass';
}

export function validateFrontendPerformanceEvidence(report: FrontendPerformanceEvidence): string[] {
  const problems: string[] = [];
  if (report.schemaVersion !== 'pendulum-frontend-performance/v1') problems.push('unsupported performance schema');
  if (!validInstant(report.generatedAt) || !/^[a-f0-9]{40}$/u.test(report.sourceCommit ?? '')) {
    problems.push('performance evidence requires generation time and full source commit');
  }
  if (
    !report.runnerFingerprint?.osImage ||
    !report.runnerFingerprint.browserRevision ||
    !report.runnerFingerprint.nodeVersion
  ) {
    problems.push('runner fingerprint is incomplete');
  }
  if ((report.cold?.samples?.length ?? 0) !== 1)
    problems.push('cold lane must contain exactly one uncalibrated sample');
  if ((report.warm?.samples?.length ?? 0) < 3) problems.push('warm lane must contain at least three samples');
  for (const [name, lane] of [
    ['cold', report.cold],
    ['warm', report.warm]
  ] as const) {
    if (!lane || laneStatus(lane) === null || laneStatus(lane) !== lane.status) {
      problems.push(`${name} status does not match its samples and thresholds`);
    }
  }
  for (const task of report.longTasks ?? []) {
    if (!['cold', 'warm'].includes(task.lane ?? '') || !(task.durationMs! >= 0) || !task.attribution?.trim()) {
      problems.push('every long task requires lane, duration, and attribution');
    }
  }
  if (
    !report.regressionFixture?.name ||
    !(report.regressionFixture.coldFailed === true || report.regressionFixture.warmFailed === true)
  ) {
    problems.push('a real bundle regression fixture must fail at least one lane');
  }
  return problems;
}

export function validateFlakeLedger(report: FlakeLedger, options: { now?: number } = {}): string[] {
  const problems: string[] = [];
  const now = options.now ?? Date.now();
  if (report.schemaVersion !== 'pendulum-flake-ledger/v1' || report.windowDays !== 30) {
    problems.push('flake ledger must use the 30-day v1 schema');
  }
  if (!validInstant(report.generatedAt) || !report.suite?.trim() || !(report.totalRuns! > 0)) {
    problems.push('flake ledger identity/count metadata is incomplete');
  }
  if (report.thresholdRate !== 0.01 || report.retryPolicy?.preserveOriginalFailure !== true) {
    problems.push('flake threshold must be 1% and retries must preserve original failures');
  }
  const windowStart = now - 30 * 86_400_000;
  const events = report.events ?? [];
  for (const event of events) {
    const occurredAt = Date.parse(event.occurredAt ?? '');
    if (
      !Number.isFinite(occurredAt) ||
      occurredAt < windowStart ||
      occurredAt > now ||
      !event.browser?.trim() ||
      !event.step?.trim() ||
      !event.traceArtifact?.trim()
    ) {
      problems.push('every flake event requires an in-window browser/step/raw-trace record');
    }
    if (event.knownUpstream && (!validInstant(event.expiresAt) || Date.parse(event.expiresAt ?? '') <= now)) {
      problems.push('known-upstream exceptions require a future expiry');
    }
  }
  const rate = events.length / Math.max(1, report.totalRuns ?? 0);
  if (report.alert !== rate > 0.01) problems.push('flake alert must reflect a rate strictly above 1%');
  return problems;
}
