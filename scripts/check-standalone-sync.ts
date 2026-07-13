import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';

interface StandaloneArtifact {
  path: string;
  bytes: number;
  sha256: string;
}

interface StandaloneManifest {
  schemaVersion: 'pendulum-standalone-manifest/v1';
  artifacts: StandaloneArtifact[];
}

async function generatedManifest(): Promise<StandaloneManifest> {
  const names = (await readdir('standalone'))
    .filter((name) => name === 'index.html' || /\.worker.*\.js$/i.test(name))
    .sort();
  const artifacts: StandaloneArtifact[] = [];
  for (const name of names) {
    const bytes = await readFile(`standalone/${name}`);
    artifacts.push({
      path: `standalone/${name}`,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex')
    });
  }
  if (!artifacts.some((artifact) => artifact.path === 'standalone/index.html')) {
    throw new Error('standalone/index.html is missing; run npm run build:standalone first');
  }
  return { schemaVersion: 'pendulum-standalone-manifest/v1', artifacts };
}

const next = await generatedManifest();
if (process.argv.includes('--write')) {
  await writeFile('standalone-manifest.json', `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`standalone-manifest.json written (${next.artifacts.length} artifacts)`);
} else {
  const committed = JSON.parse(await readFile('standalone-manifest.json', 'utf8')) as StandaloneManifest;
  if (JSON.stringify(committed) !== JSON.stringify(next)) {
    console.error(
      'standalone-sync check FAILED: generated hashes differ from standalone-manifest.json.\n' +
      'Run `npm run build:standalone && npm run standalone:manifest`, review the release artifact, and commit the compact manifest.'
    );
    process.exit(1);
  }
  console.log(`standalone-sync check ok (${next.artifacts.length} generated artifacts match committed SHA-256 hashes)`);
}
