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
const survivors = [];
let total = 0;
let killedLike = 0;
let coveredTotal = 0;
let coveredKilledLike = 0;

function normalized(pathname) {
  return pathname.replaceAll('\\', '/');
}

function suggestedCategory(mutant) {
  const coveredBy = Array.isArray(mutant.coveredBy) ? mutant.coveredBy : [];
  if (coveredBy.length === 0) {
    return {
      category: 'coverage-gap-candidate',
      basis: 'No covering test id is recorded for this survivor; inspect the shard coverage map before confirming.'
    };
  }
  const mutator = String(mutant.mutatorName ?? 'Unknown');
  if (/BooleanLiteral|ConditionalExpression|EqualityOperator|LogicalOperator|UpdateOperator/i.test(mutator)) {
    return {
      category: 'weak-assertion-candidate',
      basis: `The ${mutator} mutation was executed but survived; inspect assertions before confirming.`
    };
  }
  if (/StringLiteral|ObjectLiteral|ArrayDeclaration|BlockStatement/i.test(mutator)) {
    return {
      category: 'equivalent-candidate',
      basis: `The ${mutator} replacement may be observationally equivalent on the supported domain; prove equivalence before excluding it.`
    };
  }
  return {
    category: 'unclassified-candidate',
    basis: 'No reliable automatic category applies; manual review is required.'
  };
}

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
      if (status === 'Survived') {
        const suggestion = suggestedCategory(mutant);
        survivors.push({
          reportPath: normalized(reportPath),
          filePath: normalized(filePath),
          id: String(mutant.id ?? ''),
          mutatorName: String(mutant.mutatorName ?? 'Unknown'),
          line: Number(mutant.location?.start?.line ?? 0),
          column: Number(mutant.location?.start?.column ?? 0),
          endLine: Number(mutant.location?.end?.line ?? mutant.location?.start?.line ?? 0),
          endColumn: Number(mutant.location?.end?.column ?? mutant.location?.start?.column ?? 0),
          replacement: String(mutant.replacement ?? ''),
          description: String(mutant.description ?? ''),
          coveredBy: Array.isArray(mutant.coveredBy) ? mutant.coveredBy.map(String).sort() : [],
          reviewClassification: 'unclassified',
          suggestedCategory: suggestion.category,
          suggestionBasis: suggestion.basis
        });
      }
    }
    files.push({
      reportPath: normalized(reportPath),
      filePath: normalized(filePath),
      counts: Object.fromEntries([...localCounts].sort())
    });
  }
}

survivors.sort(
  (a, b) =>
    a.filePath.localeCompare(b.filePath) ||
    a.line - b.line ||
    a.column - b.column ||
    a.mutatorName.localeCompare(b.mutatorName) ||
    a.id.localeCompare(b.id)
);

const survivorGroups = new Map();
for (const survivor of survivors) {
  const key = `${survivor.filePath}\u0000${survivor.mutatorName}\u0000${survivor.suggestedCategory}`;
  const group = survivorGroups.get(key) ?? {
    filePath: survivor.filePath,
    mutatorName: survivor.mutatorName,
    suggestedCategory: survivor.suggestedCategory,
    count: 0,
    lines: []
  };
  group.count += 1;
  if (survivor.line > 0 && !group.lines.includes(survivor.line)) group.lines.push(survivor.line);
  survivorGroups.set(key, group);
}
const triageGroups = [...survivorGroups.values()]
  .map((group) => ({ ...group, lines: group.lines.sort((a, b) => a - b) }))
  .sort(
    (a, b) => b.count - a.count || a.filePath.localeCompare(b.filePath) || a.mutatorName.localeCompare(b.mutatorName)
  );

const mutationScore = total > 0 ? (100 * killedLike) / total : 0;
const coveredScore = coveredTotal > 0 ? (100 * coveredKilledLike) / coveredTotal : 0;
const gatePassed = mutationScore >= thresholds.break;
const status = mutationScore >= thresholds.high ? 'high' : mutationScore >= thresholds.low ? 'standard' : 'low';
const generatedAt = new Date().toISOString();
const summary = {
  schemaVersion: 'pendulum-mutation-aggregate/v1',
  generatedAt,
  status,
  gatePassed,
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
writeFileSync(
  path.join(outDir, 'mutation-aggregate.md'),
  [
    '# Mutation Aggregate',
    '',
    'Generated: ' + generatedAt,
    'Status: ' + status,
    'Reports: ' + reports.length,
    'Total score: ' + summary.mutationScore + '%',
    'Covered score: ' + summary.coveredMutationScore + '%',
    'Quality band: ' + status,
    'Regression floor: ' + thresholds.break + '% (' + (gatePassed ? 'passed' : 'failed') + ')',
    '',
    '```json',
    JSON.stringify(summary.statusCounts, null, 2),
    '```',
    ''
  ].join('\n')
);

const triage = {
  schemaVersion: 'pendulum-mutation-survivor-triage/v1',
  generatedAt,
  survivorCount: survivors.length,
  reviewPolicy: {
    defaultClassification: 'unclassified',
    note: 'suggestedCategory values are triage candidates, never automatic final classifications; a human must confirm equivalent mutant, coverage gap, or weak assertion.'
  },
  groups: triageGroups,
  survivors
};
writeFileSync(path.join(outDir, 'mutation-survivor-triage.json'), JSON.stringify(triage, null, 2) + '\n');

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(';') : String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
const csvColumns = [
  'filePath',
  'line',
  'column',
  'endLine',
  'endColumn',
  'mutatorName',
  'id',
  'reviewClassification',
  'suggestedCategory',
  'suggestionBasis',
  'replacement',
  'description',
  'coveredBy',
  'reportPath'
];
const csv =
  [
    csvColumns.join(','),
    ...survivors.map((survivor) => csvColumns.map((column) => csvCell(survivor[column])).join(','))
  ].join('\n') + '\n';
writeFileSync(path.join(outDir, 'mutation-survivor-triage.csv'), csv);

const markdownGroups = triageGroups.slice(0, 100).map((group) => {
  const file = group.filePath.replaceAll('|', '\\|');
  const mutator = group.mutatorName.replaceAll('|', '\\|');
  const lines = group.lines.slice(0, 12).join(', ') + (group.lines.length > 12 ? ', ...' : '');
  return `| \`${file}\` | ${mutator} | ${group.suggestedCategory} | ${group.count} | ${lines || '-'} |`;
});
writeFileSync(
  path.join(outDir, 'mutation-survivor-triage.md'),
  [
    '# Mutation Survivor Triage',
    '',
    `Survivors awaiting review: ${survivors.length}.`,
    '',
    '> Every row remains `unclassified`. Suggested categories are candidates for review, not automatic claims of equivalence, missing coverage, or weak assertions.',
    '',
    '| File | Mutator | Suggested candidate | Count | Lines |',
    '| --- | --- | --- | ---: | --- |',
    ...markdownGroups,
    '',
    triageGroups.length > markdownGroups.length
      ? `The table shows the largest ${markdownGroups.length} groups; use the JSON or CSV for all survivors.`
      : 'The JSON and CSV contain one row per survivor.',
    ''
  ].join('\n')
);

console.log(
  'Mutation aggregate: ' +
    summary.mutationScore +
    '% total (' +
    status +
    ' band), ' +
    summary.coveredMutationScore +
    '% covered across ' +
    reports.length +
    ' shard reports; ' +
    survivors.length +
    ' survivors written to triage JSON/CSV/MD.'
);
if (!gatePassed) process.exit(1);
