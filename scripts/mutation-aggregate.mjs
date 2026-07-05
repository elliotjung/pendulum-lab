#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const root = args.find((arg) => !arg.startsWith('--')) ?? 'reports/mutation-shards';
function stringArg(name, fallback) {
  const prefix = '--' + name + '=';
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf('--' + name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return fallback;
}
const outDir = stringArg('out-dir', 'reports/mutation');
const repository = stringArg('repository', process.env.GITHUB_REPOSITORY ?? 'Elliot-Jung-17/pendulum-lab');
const serverUrl = stringArg('server-url', process.env.GITHUB_SERVER_URL ?? 'https://github.com');
const runId = stringArg('run-id', process.env.GITHUB_RUN_ID ?? '');
const runAttempt = stringArg('run-attempt', process.env.GITHUB_RUN_ATTEMPT ?? '');
const artifactId = stringArg('artifact-id', process.env.MUTATION_AGGREGATE_ARTIFACT_ID ?? '');
const artifactName = stringArg('artifact-name', process.env.MUTATION_AGGREGATE_ARTIFACT_NAME ?? 'mutation-aggregate');
const artifactDigest = stringArg('artifact-digest', process.env.MUTATION_AGGREGATE_ARTIFACT_DIGEST ?? '');
const artifactExpiresAt = stringArg('artifact-expires-at', process.env.MUTATION_AGGREGATE_ARTIFACT_EXPIRES_AT ?? '');
const artifactUrl = stringArg(
  'artifact-url',
  runId && artifactId ? `${serverUrl}/${repository}/actions/runs/${runId}/artifacts/${artifactId}` : ''
);
function numberArg(name, fallback) {
  const prefix = '--' + name + '=';
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return Number(inline.slice(prefix.length));
  const index = args.indexOf('--' + name);
  if (index >= 0 && args[index + 1]) return Number(args[index + 1]);
  return fallback;
}

const thresholds = {
  high: numberArg('high', 85),
  low: numberArg('low', 70),
  break: numberArg('break', 60)
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name === 'mutation-report.json') out.push(full);
  }
  return out;
}

const reports = walk(root).sort();
if (reports.length === 0) {
  console.error('No mutation-report.json files found under ' + root);
  process.exit(1);
}

const statusCounts = new Map();
const files = [];
let total = 0;
let killedLike = 0;
let coveredTotal = 0;
let coveredKilledLike = 0;

for (const reportPath of reports) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  for (const [filePath, file] of Object.entries(report.files ?? {})) {
    const localCounts = new Map();
    for (const mutant of file.mutants ?? []) {
      const status = String(mutant.status ?? 'Unknown');
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
      localCounts.set(status, (localCounts.get(status) ?? 0) + 1);
      total += 1;
      const killed = status === 'Killed' || status === 'Timeout';
      if (killed) killedLike += 1;
      if (status !== 'NoCoverage') {
        coveredTotal += 1;
        if (killed) coveredKilledLike += 1;
      }
    }
    files.push({ reportPath, filePath, counts: Object.fromEntries([...localCounts].sort()) });
  }
}

const mutationScore = total > 0 ? (100 * killedLike) / total : 0;
const coveredScore = coveredTotal > 0 ? (100 * coveredKilledLike) / coveredTotal : 0;
const status = mutationScore >= thresholds.break ? 'passed' : 'failed';
const generatedAt = new Date().toISOString();
const summary = {
  schemaVersion: 'pendulum-mutation-aggregate/v1',
  generatedAt,
  status,
  ci: {
    repository,
    runId: runId || null,
    runAttempt: runAttempt || null,
    runUrl: runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : null,
    artifactId: artifactId || null,
    artifactName,
    artifactUrl: artifactUrl || null,
    artifactDigest: artifactDigest || null,
    artifactExpiresAt: artifactExpiresAt || null,
    artifactBoundary: runId && artifactId
      ? 'GitHub Actions artifact metadata was supplied for this aggregate.'
      : 'No GitHub Actions run/artifact id was supplied; local aggregate evidence has no remote artifact link.'
  },
  thresholds,
  reportCount: reports.length,
  total,
  killedEquivalent: killedLike,
  coveredTotal,
  coveredKilledEquivalent: coveredKilledLike,
  mutationScore: Number(mutationScore.toFixed(2)),
  coveredMutationScore: Number(coveredScore.toFixed(2)),
  statusCounts: Object.fromEntries([...statusCounts].sort()),
  files
};

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'mutation-aggregate.json'), JSON.stringify(summary, null, 2) + '\n');
writeFileSync(path.join(outDir, 'mutation-aggregate.md'), [
  '# Mutation Aggregate',
  '',
  'Generated: ' + generatedAt,
  'Status: ' + status,
  'Reports: ' + reports.length,
  'Total score: ' + summary.mutationScore + '%',
  'Covered score: ' + summary.coveredMutationScore + '%',
  'Threshold: break >= ' + thresholds.break + '%',
  'Actions run: ' + (summary.ci.runUrl ?? 'not supplied'),
  'Aggregate artifact: ' + (summary.ci.artifactUrl ?? 'not supplied'),
  '',
  '```json',
  JSON.stringify(summary.statusCounts, null, 2),
  '```',
  ''
].join('\n'));

console.log('Mutation aggregate: ' + summary.mutationScore + '% total, ' + summary.coveredMutationScore + '% covered across ' + reports.length + ' shard reports.');
if (status !== 'passed') process.exit(1);
