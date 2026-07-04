import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  buildFlagshipFigureSvg,
  certifyFlagshipGapMap,
  type FlagshipPaperStudyReport
} from '../src/research/flagshipCertification';

const studyPath = process.env.FLAGSHIP_STUDY_PATH ?? 'reports/paper-study.json';
const report = JSON.parse(await readFile(studyPath, 'utf8')) as FlagshipPaperStudyReport;
const certification = certifyFlagshipGapMap(report, studyPath);
const figureSvg = buildFlagshipFigureSvg(certification);

const lines = [
  '# Flagship Certification',
  '',
  `Generated: ${certification.generatedAt}`,
  '',
  `Status: **${certification.status.toUpperCase()}**`,
  '',
  `Source study: \`${certification.sourceStudy}\``,
  '',
  certification.crossing
    ? `Crossing: \`gamma = ${certification.crossing.gamma.toFixed(6)}\` with localization interval [${certification.crossing.lower.toFixed(6)}, ${certification.crossing.upper.toFixed(6)}].`
    : 'Crossing: not found.',
  '',
  `Figure 1 SVG hash: \`${certification.figureHash}\``,
  '',
  `Figure 1 caption: ${certification.figureCaption}`,
  '',
  `Reviewer appendix note: ${certification.reviewerAppendixNote}`,
  '',
  `Claim boundary: ${certification.claimBoundary}`,
  '',
  '## Figure Hashes',
  '',
  '| id | path | hash | description |',
  '|---|---|---|---|',
  ...certification.figureArtifacts.map((artifact) => `| ${artifact.id} | \`${artifact.path}\` | \`${artifact.hash}\` | ${artifact.description} |`),
  '',
  '## Artifact Cross-References',
  '',
  '| artifact | produced by | used by |',
  '|---|---|---|',
  ...certification.artifactCrossReferences.map((ref) => `| \`${ref.artifact}\` | \`${ref.producedBy}\` | ${ref.usedBy} |`),
  '',
  '## Onset Localization Table',
  '',
  '| gamma | A_c | A_PD | ratio | ratio err | rho below | rho above | K below | K above | caveat |',
  '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|'
];

for (const row of certification.rows) {
  lines.push(`| ${row.gamma.toFixed(2)} | ${row.Ac.toFixed(6)} | ${row.Apd.toFixed(6)} | ${row.ratio.toFixed(6)} | ${row.ratioUncertainty.toExponential(2)} | ${row.rhoBelow === null ? 'n/a' : row.rhoBelow.toFixed(4)} | ${row.rhoAbove === null ? 'n/a' : row.rhoAbove.toFixed(4)} | ${row.kBelow === null ? 'n/a' : row.kBelow.toFixed(3)} | ${row.kAbove === null ? 'n/a' : row.kAbove.toFixed(3)} | ${row.caveat} |`);
}

lines.push('', '## Basin / Transient Caveat Map', '');
for (const caveat of certification.caveats) lines.push(`- ${caveat}`);
lines.push('', '## Reproduce', '', '```bash', ...certification.reproductionCommands, '```', '');

await mkdir('reports', { recursive: true });
await writeFile('reports/flagship-certification.json', `${JSON.stringify(certification, null, 2)}\n`, 'utf8');
await writeFile('reports/flagship-certification.md', `${lines.join('\n')}\n`, 'utf8');
await writeFile('reports/flagship-figure1.svg', figureSvg, 'utf8');
console.log(lines.join('\n'));
