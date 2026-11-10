import path from 'node:path';
import { createHash } from 'node:crypto';
export interface RunnerAttachment {
  readonly name: string;
  readonly path?: string;
  readonly embeddedSha256?: string;
  readonly embeddedBytes?: number;
  readonly contentType?: string;
}
export interface RunnerCase {
  readonly file: string;
  readonly title: string;
  readonly project: string | null;
  readonly status: string;
  readonly attachments: readonly RunnerAttachment[];
}
export interface RunnerReport {
  readonly cases: readonly RunnerCase[];
  readonly errors: readonly string[];
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
export const MAX_EMBEDDED_ATTACHMENT_BYTES = 64 * 1024 * 1024;
export function decodeEmbeddedAttachment(value: unknown, maximumBytes = MAX_EMBEDDED_ATTACHMENT_BYTES): Buffer {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0 || maximumBytes > MAX_EMBEDDED_ATTACHMENT_BYTES)
    throw new Error('Invalid embedded attachment byte bound.');
  if (
    typeof value !== 'string' ||
    value.length % 4 !== 0 ||
    value.length > 4 * Math.ceil(maximumBytes / 3) ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('Embedded attachment is not bounded canonical base64.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > maximumBytes || bytes.toString('base64') !== value)
    throw new Error('Embedded attachment is not bounded canonical base64.');
  return bytes;
}
function attachments(root: string, input: unknown, budget: { bytes: number }): RunnerAttachment[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 256) throw new Error('Malformed or excessive runner attachments.');
  return input.map((item) => {
    if (!record(item) || typeof item.name !== 'string' || !item.name.length || item.name.length > 512)
      throw new Error('Malformed runner attachment name.');
    const mime = typeof item.contentType === 'string' ? { contentType: item.contentType } : {};
    if (Object.hasOwn(item, 'path') && Object.hasOwn(item, 'body'))
      throw new Error('Runner attachment cannot ambiguously contain both a path and embedded body.');
    if (typeof item.path === 'string') return { name: item.name, path: runnerRelativePath(root, item.path), ...mime };
    if (Object.hasOwn(item, 'body')) {
      const bytes = decodeEmbeddedAttachment(item.body);
      budget.bytes += bytes.length;
      if (budget.bytes > 256 * 1024 * 1024)
        throw new Error('Embedded runner attachments exceed the total report byte budget.');
      return {
        name: item.name,
        embeddedSha256: createHash('sha256').update(bytes).digest('hex'),
        embeddedBytes: bytes.length,
        ...mime
      };
    }
    throw new Error('Runner attachment has no retained path or embedded executed bytes.');
  });
}
export function runnerRelativePath(root: string, value: string, base = ''): string {
  const normalized = value.replaceAll('\\', '/');
  const absolute = path.isAbsolute(normalized) ? normalized : path.resolve(root, base, normalized);
  const relative = path.relative(path.resolve(root), absolute).replaceAll('\\', '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative))
    throw new Error('Runner path escapes repository.');
  return relative;
}
export const runnerCaseKey = (item: Pick<RunnerCase, 'file' | 'title' | 'project'>): string =>
  JSON.stringify([item.file, item.title, item.project]);

/** Full runner statuses are checked; aggregate pass counts never conceal failed/skipped/retried cases. */
export function parseRunnerReport(root: string, kind: 'vitest' | 'playwright', input: unknown): RunnerReport {
  const errors: string[] = [],
    cases: RunnerCase[] = [];
  if (!record(input))
    return { cases, errors: ['Runner report is not an object.'], startedAtMs: NaN, finishedAtMs: NaN };
  let startedAtMs = NaN,
    finishedAtMs = NaN;
  const attachmentBudget = { bytes: 0 };
  try {
    if (kind === 'vitest') {
      startedAtMs = Number(input.startTime);
      finishedAtMs = startedAtMs;
      if (
        input.success !== true ||
        input.numFailedTests !== 0 ||
        input.numPendingTests !== 0 ||
        input.numTodoTests !== 0 ||
        input.numFailedTestSuites !== 0 ||
        input.numPendingTestSuites !== 0
      )
        errors.push('Vitest report has failed/pending/todo suites or cases.');
      for (const suite of list(input.testResults)) {
        if (!record(suite)) {
          errors.push('Malformed Vitest suite.');
          continue;
        }
        if (
          suite.status !== 'passed' ||
          list(suite.message).length ||
          (typeof suite.message === 'string' && suite.message.length)
        )
          errors.push('Vitest suite did not pass cleanly.');
        const file = runnerRelativePath(root, text(suite.name));
        finishedAtMs = Math.max(finishedAtMs, Number(suite.endTime));
        for (const assertion of list(suite.assertionResults)) {
          if (!record(assertion)) {
            errors.push('Malformed Vitest test.');
            continue;
          }
          if (assertion.status !== 'passed' || list(assertion.failureMessages).length)
            errors.push(`Vitest case is not passed: ${text(assertion.fullName)}`);
          const artifacts = record(assertion.meta) ? list(assertion.meta.parityArtifacts) : [];
          const retained = attachments(root, artifacts, attachmentBudget);
          cases.push({
            file,
            title: text(assertion.fullName),
            project: null,
            status: text(assertion.status),
            attachments: retained
          });
        }
      }
      if (input.numTotalTests !== cases.length || input.numPassedTests !== cases.length)
        errors.push('Vitest aggregate counts disagree with actual cases.');
    } else {
      const stats = record(input.stats) ? input.stats : {},
        config = record(input.config) ? input.config : {};
      startedAtMs = Date.parse(text(stats.startTime));
      finishedAtMs = startedAtMs + Number(stats.duration);
      if (stats.skipped !== 0 || stats.unexpected !== 0 || stats.flaky !== 0 || list(input.errors).length)
        errors.push('Playwright report has skipped/failed/flaky cases or runner errors.');
      const base = typeof config.rootDir === 'string' ? runnerRelativePath(root, config.rootDir) : 'e2e';
      function visit(value: unknown, titles: string[], fileSuite = false) {
        if (!record(value)) {
          errors.push('Malformed Playwright suite.');
          return;
        }
        // The file suite title is only a platform-specific filename; the key stores file separately.
        const next = fileSuite ? titles : [...titles, text(value.title)];
        for (const spec of list(value.specs)) {
          if (!record(spec)) {
            errors.push('Malformed Playwright spec.');
            continue;
          }
          const file = runnerRelativePath(root, text(spec.file), base),
            title = [...next, text(spec.title)].filter(Boolean).join(' › ');
          for (const test of list(spec.tests)) {
            if (!record(test)) {
              errors.push('Malformed Playwright test.');
              continue;
            }
            const results = list(test.results);
            if (
              test.status !== 'expected' ||
              test.expectedStatus !== 'passed' ||
              results.length !== 1 ||
              !record(results[0]) ||
              results[0].status !== 'passed' ||
              list(results[0].errors).length ||
              (results[0].retry !== undefined && results[0].retry !== 0)
            )
              errors.push(`Playwright case did not pass once without retry: ${title}`);
            const result = record(results[0]) ? results[0] : {};
            const retained = attachments(root, result.attachments, attachmentBudget);
            cases.push({
              file,
              title,
              project: text(test.projectName),
              status: test.status === 'expected' && result.status === 'passed' ? 'passed' : text(result.status),
              attachments: retained
            });
          }
        }
        for (const child of list(value.suites)) visit(child, next);
      }
      for (const suite of list(input.suites)) visit(suite, [], true);
      if (stats.expected !== cases.length) errors.push('Playwright aggregate counts disagree with actual cases.');
    }
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : 'Cannot parse runner report.');
  }
  if (!cases.length || cases.some((item) => !item.file || !item.title || (kind === 'playwright' && !item.project)))
    errors.push('Runner report has empty cases or identifiers.');
  if (new Set(cases.map(runnerCaseKey)).size !== cases.length)
    errors.push('Runner report contains duplicate exact case identifiers.');
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(finishedAtMs) || finishedAtMs < startedAtMs)
    errors.push('Runner report times are invalid.');
  return { cases, errors, startedAtMs, finishedAtMs };
}
