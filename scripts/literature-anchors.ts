/**
 * Literature-anchor validation report: engine-computed quantities vs published
 * / closed-form reference values (see src/validation/literatureAnchors.ts).
 *
 * Run: npm run validate:literature
 * Writes reports/literature-anchors.{json,md}.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { runLiteratureAnchors } from '../src/validation/literatureAnchors';

function fmt(x: number): string {
  if (!Number.isFinite(x)) return 'n/a';
  const abs = Math.abs(x);
  return abs !== 0 && (abs < 1e-3 || abs >= 1e5) ? x.toExponential(6) : x.toPrecision(8);
}

async function main(): Promise<void> {
  const report = runLiteratureAnchors();
  const lines = [
    '# Literature-Anchor Validation',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Engine-computed quantities compared head-to-head against published or closed-form',
    'reference values — the external counterpart to the self-consistency checks',
    '(convergence orders, spectrum constraints, independent-diagnostic agreement).',
    '',
    '| Anchor | Reference | Published | Computed | |Δ| | Tol | Verdict |',
    '|---|---|---:|---:|---:|---:|:--:|'
  ];
  for (const a of report.anchors) {
    const delta = Math.abs(a.computed - a.published);
    lines.push(
      `| ${a.description} | ${a.reference} | ${fmt(a.published)} | ${fmt(a.computed)} | ${Number.isFinite(delta) ? delta.toExponential(2) : 'n/a'} | ${a.tolerance.toExponential(0)} | ${a.pass ? 'PASS' : 'FAIL'} |`
    );
  }
  lines.push('', '## Structural checks', '', '| Check | Reference | Measured | Verdict |', '|---|---|---|:--:|');
  for (const c of report.checks) {
    lines.push(`| ${c.description} | ${c.reference} | ${c.detail} | ${c.pass ? 'PASS' : 'FAIL'} |`);
  }
  const notes = report.anchors.filter((a) => a.note);
  if (notes.length > 0) {
    lines.push('', '## Notes', '');
    for (const a of notes) lines.push(`- **${a.id}**: ${a.note}`);
  }
  lines.push('');
  await mkdir('reports', { recursive: true });
  await writeFile('reports/literature-anchors.json', JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2), 'utf8');
  await writeFile('reports/literature-anchors.md', lines.join('\n'), 'utf8');
  for (const a of report.anchors) console.log(`${a.pass ? 'PASS' : 'FAIL'} ${a.id}: computed ${fmt(a.computed)} vs published ${fmt(a.published)}`);
  for (const c of report.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}`);
  if (!report.allPass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
