import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { hashText } from '../src/research/researchExportUtils';
import { generateKoreanPortfolioPdf } from './portfolio-korean-pdf';

interface ReleaseArtifact {
  id: string;
  path: string;
  required: boolean;
  available: boolean;
  hash?: string;
  note: string;
}

interface PublicationStatus {
  npm?: { published?: boolean };
  zenodo?: { published?: boolean };
  githubRelease?: { published?: boolean };
  pages?: { published?: boolean };
}

interface AttestationStatus {
  status?: string;
  predicates?: Array<{ status?: string; predicateType?: string }>;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

function pdfEscape(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function wrapPdfLines(lines: readonly string[], maxCharacters = 88): string[] {
  const wrapped: string[] = [];
  for (const sourceLine of lines) {
    if (!sourceLine.trim()) {
      wrapped.push('');
      continue;
    }
    const words = sourceLine.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxCharacters) {
        line = candidate;
      } else {
        if (line) wrapped.push(line);
        line = word;
      }
    }
    if (line) wrapped.push(line);
  }
  return wrapped;
}

function buildOnePagePdf(lines: readonly string[]): Buffer {
  const bodyLines = wrapPdfLines(lines.slice(1), 88).slice(0, 40);
  const content = [
    'BT',
    '/F1 18 Tf',
    '72 748 Td',
    `(${pdfEscape(lines[0] ?? 'Pendulum Lab Reviewer Kit')}) Tj`,
    '/F1 9.5 Tf',
    ...bodyLines.map((line) => `0 -16 Td (${pdfEscape(line)}) Tj`),
    'ET'
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

function writeWord(out: number[], value: number): void {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

function writeAscii(out: number[], value: string): void {
  for (let i = 0; i < value.length; i += 1) out.push(value.charCodeAt(i));
}

function packCodes(codes: readonly number[], minCodeSize: number): number[] {
  let codeSize = minCodeSize + 1;
  let nextCode = (1 << minCodeSize) + 2;
  const clear = 1 << minCodeSize;
  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  for (const code of codes) {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
    if (code === clear) {
      codeSize = minCodeSize + 1;
      nextCode = clear + 2;
    } else {
      nextCode += 1;
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize += 1;
    }
  }
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);
  return bytes;
}

function lzwEncode(indices: readonly number[], minCodeSize: number): number[] {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const dictionary = new Map<string, number>();
  const reset = (): void => {
    dictionary.clear();
    for (let i = 0; i < clear; i += 1) dictionary.set(String(i), i);
  };
  reset();
  const codes: number[] = [clear];
  let nextCode = end + 1;
  let phrase = String(indices[0] ?? 0);
  for (let i = 1; i < indices.length; i += 1) {
    const k = String(indices[i] ?? 0);
    const combined = `${phrase},${k}`;
    if (dictionary.has(combined)) {
      phrase = combined;
    } else {
      codes.push(dictionary.get(phrase) ?? 0);
      if (nextCode < 4096) {
        dictionary.set(combined, nextCode);
        nextCode += 1;
      } else {
        codes.push(clear);
        reset();
        nextCode = end + 1;
      }
      phrase = k;
    }
  }
  codes.push(dictionary.get(phrase) ?? 0, end);
  return packCodes(codes, minCodeSize);
}

function subBlocks(bytes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

function makeFrame(width: number, height: number, frame: number): number[] {
  const pixels = new Array<number>(width * height).fill(0);
  const accent = 2 + (frame % 5);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (y < 28) pixels[i] = 1;
      else if (x < width * ((frame + 1) / 6) && y > height - 18) pixels[i] = accent;
      else if ((Math.floor(x / 24) + Math.floor(y / 18) + frame) % 7 === 0) pixels[i] = accent;
      else if (x > 24 && x < width - 24 && y > 46 + frame * 10 && y < 66 + frame * 10) pixels[i] = 6;
    }
  }
  return pixels;
}

function buildWalkthroughGif(): Buffer {
  const width = 320;
  const height = 180;
  const palette = [
    [248, 250, 252],
    [15, 23, 42],
    [15, 118, 110],
    [180, 83, 9],
    [37, 99, 235],
    [190, 24, 93],
    [226, 232, 240],
    [51, 65, 85]
  ];
  const out: number[] = [];
  writeAscii(out, 'GIF89a');
  writeWord(out, width);
  writeWord(out, height);
  out.push(0xf2, 0, 0); // global colour table, 8 colours
  for (const [r, g, b] of palette) out.push(r!, g!, b!);
  // Netscape loop extension.
  out.push(0x21, 0xff, 0x0b);
  writeAscii(out, 'NETSCAPE2.0');
  out.push(0x03, 0x01, 0x00, 0x00, 0x00);
  for (let frame = 0; frame < 6; frame += 1) {
    out.push(0x21, 0xf9, 0x04, 0x04);
    writeWord(out, 500); // 5 seconds each, 30 seconds total.
    out.push(0, 0);
    out.push(0x2c);
    writeWord(out, 0);
    writeWord(out, 0);
    writeWord(out, width);
    writeWord(out, height);
    out.push(0);
    const minCodeSize = 3;
    out.push(minCodeSize);
    out.push(...subBlocks(lzwEncode(makeFrame(width, height, frame), minCodeSize)));
  }
  out.push(0x3b);
  return Buffer.from(out);
}

function storyboardSvg(): string {
  const labels = ['Reviewer Kit', 'Figure 1', 'Trust Inspector', 'GPU Oracle', 'Workspace', 'Release'];
  const cards = labels
    .map((label, i) => {
      const x = 28 + i * 122;
      const fill = ['#0f766e', '#b45309', '#2563eb', '#be185d', '#475569', '#166534'][i]!;
      return `<rect x="${x}" y="42" width="102" height="86" rx="8" fill="${fill}"/><text x="${x + 51}" y="92" text-anchor="middle" font-size="13" font-family="Arial" fill="#fff">${label}</text>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="790" height="170" viewBox="0 0 790 170" role="img" aria-label="30 second reviewer walkthrough storyboard">
<rect width="100%" height="100%" fill="#f8fafc"/>
<text x="28" y="26" font-size="18" font-family="Arial" fill="#0f172a">30 second walkthrough storyboard</text>
${cards}
<text x="28" y="152" font-size="12" font-family="Arial" fill="#475569">Six five-second beats: reproduce, inspect evidence, validate GPU/CPU agreement, continue in the research workspace, publish release artifacts.</text>
</svg>
`;
}

const reviewerManifestText = await readOptional('reports/reviewer-kit-manifest.json');
const scorecardText = await readOptional('reports/worldclass-scorecard.json');
const flagshipText = await readOptional('reports/flagship-certification.json');
const publicationText = await readOptional('reports/publication-status.json');
const publication = publicationText ? (JSON.parse(publicationText) as PublicationStatus) : {};
const attestationText = await readOptional('reports/attestation-verification.json');
const attestation = attestationText ? (JSON.parse(attestationText) as AttestationStatus) : {};
const summaryLines = [
  'Pendulum Lab Certified Chaotic Dynamics Workbench',
  `Generated: ${new Date().toISOString()}`,
  '',
  'Flagship: Melnikov threshold vs period-doubling onset gap map.',
  'Reviewer path: npm run validate:gpu-scale; npm run validate:webgpu-hardware; npm run flagship:certify; npm run flagship:external; npm run reviewer:kit.',
  'Trust model: every headline number carries source, params, uncertainty, reproduce command, artifact hash, and caveat.',
  'GPU rule: 4D and N-chain accelerated results must match CPU f64 or fail closed; the vendor matrix never simulates missing hardware.',
  'Release surfaces: Pages reviewer console, npm OIDC provenance, Zenodo deposition API, SLSA/SBOM attestations, and paper PDF.',
  '',
  `Reviewer manifest hash: ${reviewerManifestText ? hashText(reviewerManifestText).slice(0, 16) : 'missing'}`,
  `Scorecard hash: ${scorecardText ? hashText(scorecardText).slice(0, 16) : 'missing'}`,
  `Flagship certification hash: ${flagshipText ? hashText(flagshipText).slice(0, 16) : 'missing'}`
];

await mkdir('reports', { recursive: true });
await writeFile('reports/release-one-page.pdf', buildOnePagePdf(summaryLines));
await writeFile('reports/walkthrough-30s.gif', buildWalkthroughGif());
await writeFile('reports/walkthrough-storyboard.svg', storyboardSvg(), 'utf8');
await generateKoreanPortfolioPdf();

const artifactSpecs = [
  ['zenodo-metadata', '.zenodo.json', true, 'Zenodo metadata and authenticated deposition command are present.'],
  ['pages-workflow', '.github/workflows/pages.yml', true, 'GitHub Pages deploy workflow is present.'],
  ['reviewer-dashboard', 'reviewer.html', true, 'Pages reviewer console reads report JSON directly.'],
  [
    'npm-workflow',
    '.github/workflows/publish-npm.yml',
    true,
    'Manual npm workflow uses OIDC trusted publishing and automatic provenance.'
  ],
  [
    'attestation-workflow',
    '.github/workflows/release.yml',
    true,
    'Release workflow emits SLSA/in-toto provenance plus a CycloneDX SBOM attestation.'
  ],
  ['paper-pdf', 'paper/paper.pdf', true, 'Flagship paper PDF exists.'],
  [
    'portfolio-korean-pdf',
    'reports/portfolio-korean.pdf',
    true,
    'Korean portfolio PDF is generated from documents/portfolio-korean.md with Playwright Chromium.'
  ],
  [
    'portfolio-korean-pdf-validation',
    'reports/portfolio-korean-pdf-validation.json',
    true,
    'Poppler-rendered page previews, dimensions, hashes, and structural PDF checks passed.'
  ],
  ['reviewer-manifest', 'reports/reviewer-kit-manifest.json', true, 'Reviewer kit manifest exists.'],
  [
    'webgpu-hardware-validation',
    'reports/webgpu-hardware-validation.md',
    false,
    'Real WebGPU adapter validation report exists when run on a hardware target.'
  ],
  [
    'gpu-benchmark-ladder',
    'reports/gpu-benchmark-ladder.md',
    true,
    'Hardware GPU benchmark ladder records adapter metadata, f32/f64 drift, and CPU-oracle promotion metrics.'
  ],
  [
    'gpu-benchmark-ladder-json',
    'reports/gpu-benchmark-ladder.json',
    true,
    'Machine-readable GPU benchmark ladder for release artifacts.'
  ],
  [
    'gpu-adapter-matrix',
    'reports/gpu-adapter-matrix.json',
    true,
    'Physical Intel/NVIDIA/AMD evidence matrix; missing hardware remains explicit.'
  ],
  [
    'publication-status',
    'reports/publication-status.json',
    true,
    'Public registry, DOI, release, and Pages resolution audit.'
  ],
  [
    'zenodo-deposition',
    'reports/zenodo-deposition.json',
    false,
    'Authenticated deposition result or explicit credential boundary; no DOI is inferred.'
  ],
  [
    'attestation-verification',
    'reports/attestation-verification.json',
    false,
    'Cryptographic verification of SLSA and CycloneDX attestations against the release tarball.'
  ],
  [
    'npm-pack-dry-run',
    'reports/npm-pack-dry-run.json',
    true,
    'Exact npm tarball integrity, size, and included-file inventory from a successful dry run.'
  ],
  [
    'mutation-aggregate',
    'reports/mutation-aggregate.json',
    true,
    'Nightly sharded mutation aggregate score from Stryker reports.'
  ],
  ['one-page-pdf', 'reports/release-one-page.pdf', true, 'One-page reviewer PDF generated locally.'],
  ['walkthrough-gif', 'reports/walkthrough-30s.gif', true, 'Thirty-second GIF walkthrough generated locally.'],
  [
    'narrated-demo',
    'reports/demo-narrated-ko.mp4',
    true,
    '67-second Korean narrated walkthrough, attached to the GitHub Release.'
  ],
  [
    'narrated-demo-captions',
    'reports/demo-narrated-ko.vtt',
    true,
    'Timed Korean WebVTT captions generated from the narration segments.'
  ],
  ['narrated-demo-transcript', 'reports/demo-narrated-ko.md', true, 'Accessible Korean narration transcript.'],
  ['walkthrough-storyboard', 'reports/walkthrough-storyboard.svg', false, 'Editable storyboard companion for the GIF.']
] as const;

const artifacts: ReleaseArtifact[] = [];
for (const [id, path, required, note] of artifactSpecs) {
  const available = await exists(path);
  const text =
    path.endsWith('.json') || path.endsWith('.md') || path.endsWith('.yml') || path.endsWith('.svg')
      ? await readOptional(path)
      : '';
  artifacts.push({ id, path, required, available, ...(text ? { hash: hashText(text).slice(0, 16) } : {}), note });
}
const missingRequired = artifacts
  .filter((artifact) => artifact.required && !artifact.available)
  .map((artifact) => artifact.id);
const externalPublishSteps: string[] = [];
if (!publication.pages?.published)
  externalPublishSteps.push('Deploy reviewer.html through GitHub Pages and verify reports/publication-status.json.');
if (!publication.npm?.published)
  externalPublishSteps.push(
    'Bootstrap the npm package with owner credentials or configure its trusted publisher, then dispatch publish-npm.yml with dry_run=false.'
  );
if (!publication.zenodo?.published)
  externalPublishSteps.push('Authenticate Zenodo, run npm run zenodo:publish, then run npm run doi:sync.');
const verifiedPredicateTypes = new Set(
  attestation.predicates?.filter((item) => item.status === 'verified').map((item) => item.predicateType)
);
if (
  attestation.status !== 'verified' ||
  !verifiedPredicateTypes.has('https://slsa.dev/provenance/v1') ||
  !verifiedPredicateTypes.has('https://cyclonedx.org/bom')
) {
  externalPublishSteps.push('Run npm run release:verify-attestations against the published release tarball.');
}
const manifest = {
  schemaVersion: 'pendulum-release-readiness/v1',
  generatedAt: new Date().toISOString(),
  status: missingRequired.length ? 'missing-required' : 'ready-for-owner-publish',
  externalPublishSteps,
  artifacts
};
const lines = [
  '# Release Readiness Manifest',
  '',
  `Generated: ${manifest.generatedAt}`,
  '',
  `Status: **${manifest.status}**`,
  '',
  '| Required | Available | Artifact | Note |',
  '|---:|---:|---|---|',
  ...artifacts.map(
    (artifact) =>
      `| ${artifact.required ? 'yes' : 'no'} | ${artifact.available ? 'yes' : 'no'} | \`${artifact.path}\` | ${artifact.note} |`
  ),
  '',
  '## Owner Publish Steps',
  '',
  ...manifest.externalPublishSteps.map((step) => `- ${step}`),
  ''
];
await writeFile('reports/release-readiness.json', `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile('reports/release-readiness.md', `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
