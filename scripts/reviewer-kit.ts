import { access, mkdir, writeFile } from 'node:fs/promises';
import {
  CERTIFIED_WORKBENCH_FLAGSHIP,
  REVIEWER_KIT_ARTIFACTS,
  evaluateReviewerKit,
  flagshipMarkdown,
  reviewerKitCommands
} from '../src/research/certifiedWorkbench';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function priorityIcon(priority: string): string {
  return priority === 'required' ? 'required' : priority === 'recommended' ? 'recommended' : 'optional';
}

const availability = new Map<string, boolean>();
for (const artifact of REVIEWER_KIT_ARTIFACTS) availability.set(artifact.path, await exists(artifact.path));
const evaluation = evaluateReviewerKit((path) => availability.get(path) ?? false);
const pagesBaseUrl = 'https://elliot-jung-17.github.io/pendulum-lab/';
const repositoryBlobBaseUrl = 'https://github.com/Elliot-Jung-17/pendulum-lab/blob/master/';

function publicArtifactUrl(path: string): string {
  if (path === 'reviewer.html') return `${pagesBaseUrl}reviewer.html`;
  if (path.startsWith('paper/') || path.startsWith('reports/')) return `${pagesBaseUrl}${path.replaceAll('\\', '/')}`;
  return `${repositoryBlobBaseUrl}${path.replaceAll('\\', '/')}`;
}

const manifest = {
  schemaVersion: 'pendulum-reviewer-kit/v1',
  generatedAt: new Date().toISOString(),
  flagship: CERTIFIED_WORKBENCH_FLAGSHIP,
  status: evaluation.status,
  artifacts: REVIEWER_KIT_ARTIFACTS.map((artifact) => ({
    ...artifact,
    available: availability.get(artifact.path) ?? false,
    publicUrl: publicArtifactUrl(artifact.path)
  })),
  missingRequired: evaluation.missingRequired.map((artifact) => artifact.id),
  missingRecommended: evaluation.missingRecommended.map((artifact) => artifact.id),
  missingOptional: evaluation.missingOptional.map((artifact) => artifact.id),
  commandsToComplete: reviewerKitCommands(evaluation)
};

const lines = [
  '# Certified Chaotic Dynamics Workbench - Reviewer Kit',
  '',
  `Generated: ${manifest.generatedAt}`,
  '',
  `Status: **${evaluation.status.toUpperCase()}**`,
  '',
  flagshipMarkdown(CERTIFIED_WORKBENCH_FLAGSHIP).trim(),
  '',
  '## Artifact Checklist',
  '',
  '| Priority | Available | Artifact | Reproduce | Purpose |',
  '|---|---:|---|---|---|'
];
for (const artifact of REVIEWER_KIT_ARTIFACTS) {
  const available = availability.get(artifact.path) ? 'yes' : 'no';
  lines.push(`| ${priorityIcon(artifact.priority)} | ${available} | \`${artifact.path}\` | \`${artifact.command}\` | ${artifact.description} |`);
}
lines.push('', '## Commands To Complete The Kit', '');
if (manifest.commandsToComplete.length) {
  for (const command of manifest.commandsToComplete) lines.push(`- \`${command}\``);
} else {
  lines.push('- none');
}
lines.push('');

await mkdir('reports', { recursive: true });
await writeFile('reports/reviewer-kit-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile('reports/reviewer-kit-manifest.md', `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
