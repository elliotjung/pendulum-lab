import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface MutationAggregate {
  schemaVersion?: string;
  generatedAt?: string;
  mutationScore?: number;
  coveredMutationScore?: number;
  statusCounts?: Record<string, number>;
  files?: Array<{ filePath?: string }>;
}

export function validateReleaseMutation(
  report: MutationAggregate,
  options: { now?: number; minimumScore?: number; maximumAgeDays?: number } = {}
): void {
  const minimumScore = options.minimumScore ?? 70;
  const maximumAgeDays = options.maximumAgeDays ?? 14;
  const now = options.now ?? Date.now();
  if (report.schemaVersion !== 'pendulum-mutation-aggregate/v1') {
    throw new Error('mutation aggregate schema is missing or unsupported');
  }
  if (!Number.isFinite(report.mutationScore) || report.mutationScore! < minimumScore) {
    throw new Error(`release mutation score must be at least ${minimumScore}% (got ${String(report.mutationScore)})`);
  }
  const generatedAt = Date.parse(report.generatedAt ?? '');
  if (!Number.isFinite(generatedAt) || generatedAt > now || now - generatedAt > maximumAgeDays * 86_400_000) {
    throw new Error(`mutation evidence must be no older than ${maximumAgeDays} days`);
  }
  const paths = new Set((report.files ?? []).map((file) => file.filePath?.replaceAll('\\', '/')));
  if (!paths.has('src/app/tabRouting.ts')) {
    throw new Error('mutation aggregate does not cover the routing lifecycle');
  }
  if ((report.statusCounts?.RuntimeError ?? 0) > 0) {
    throw new Error('mutation aggregate contains runtime-error mutants');
  }
}

async function main(): Promise<void> {
  const report = JSON.parse(await readFile('reports/mutation-aggregate.json', 'utf8')) as MutationAggregate;
  validateReleaseMutation(report);
  console.log(`Release mutation gate passed: ${report.mutationScore}% total / ${report.coveredMutationScore}% covered`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await main();
