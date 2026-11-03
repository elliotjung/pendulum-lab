import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  createPlanarSimulation,
  defaultPlanarConfig,
  toCanonicalPlanar,
  type PlanarConfig
} from '../../src/product/adapters/physics/planar';
import { createDiagnosticSeries } from '../../src/product/adapters/analysis/core/source';
import { defaultCoreSettings } from '../../src/product/adapters/analysis/core/settings';
import { runCoreDiagnostic } from '../../src/product/adapters/analysis/core/execute';
import {
  createCoreDiagnosticArtifact,
  exportCoreDiagnosticArtifact
} from '../../src/product/adapters/analysis/core/artifact';
import {
  addResearchArtifact,
  addResearchSession,
  captureResearchRun,
  createResearchProject,
  verifyResearchBundle
} from '../../src/product/provenance/project';
import { buildResearchPackage, importResearchPackage } from '../../src/product/provenance/package';
import { researchExportEntries } from '../../src/product/provenance/render';
import { parseZip, textToBytes } from '../../src/research/zipBundle';

const output = process.argv[2] ?? 'documents/redesign/stage-runs/S24-example.zip';
const timestamp = '2026-11-03T00:00:00.000Z';
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
let bundle = createResearchProject({
  id: 's24-example-project',
  title: '이중진자 기록에서 검토 패키지까지',
  description:
    '같은 물리 엔진으로 계산한 두 초기조건의 짧은 기록을 보존하고 원 run에서 그림과 보고서를 추적할 수 있는가?',
  createdAt: timestamp
});
bundle = addResearchSession(bundle, { id: 's24-example-session', title: '두 초기조건의 기록', createdAt: timestamp });
for (const index of [0, 1]) {
  const defaults = defaultPlanarConfig();
  const config: PlanarConfig = {
    ...defaults,
    duration: 0.2,
    step: 0.01,
    initialState: [
      defaults.initialState[0] + index * 0.001,
      defaults.initialState[1],
      defaults.initialState[2],
      defaults.initialState[3]
    ]
  };
  const canonical = toCanonicalPlanar(config);
  if (!canonical.ok) throw new Error('Example canonical configuration failed validation.');
  const simulation = createPlanarSimulation(config);
  const samples = [simulation.snapshot()];
  while (!simulation.done) samples.push(simulation.step());
  const series = createDiagnosticSeries(canonical.value, samples);
  bundle = await captureResearchRun(bundle, {
    id: `s24-example-run-${index}`,
    sessionId: 's24-example-session',
    label: `초기각 차이 ${index * 0.001} rad`,
    experiment: canonical.value,
    series,
    createdAt: timestamp
  });
  const run = bundle.project.runs.at(-1)!;
  const source = bundle.project.artifacts.find((artifact) => artifact.runId === run.id && artifact.kind === 'series')!;
  const request = {
    id: `s24-native-energy-${index}`,
    kind: 'energy' as const,
    experiment: canonical.value,
    series,
    settings: defaultCoreSettings('energy', canonical.value)
  };
  const result = runCoreDiagnostic(request);
  const native = createCoreDiagnosticArtifact(request, result, {
    artifactId: `s24-native-energy-artifact-${index}`,
    inputRunId: `s24-native-input-${index}`,
    createdAt: timestamp
  });
  bundle = await addResearchArtifact(bundle, {
    runId: run.id,
    filename: `energy-${index}.json`,
    data: textToBytes(exportCoreDiagnosticArtifact(native)),
    kind: 'core',
    parentIds: [source.id],
    note: '보존한 원 기록에서 기존 native 에너지 분석을 실행했습니다. native input ID도 별도로 보존합니다.'
  });
  bundle.project.figures.push({
    id: `s24-example-figure-${index}`,
    title: `첫 각도 기록 ${index + 1}`,
    caption: `21개 원본 기록 표본. 초기각 차이 ${index * 0.001} rad, 관찰 0.2 s. 유한한 기록으로 카오스를 판정하지 않습니다.`,
    runId: run.id,
    sourceArtifactId: source.id,
    xColumn: -1,
    yColumn: 0,
    theme: index ? 'colorblind' : 'print'
  });
}
bundle.project.notebook.push({
  id: 's24-example-narrative',
  title: '기록과 해석의 구분',
  text: `기존 엔진의 두 run을 초기조건부터 종료시간까지 실행했습니다. 원본 표본과 설정·단위·적분기를 그대로 보존합니다. 그림은 재적분 없이 기록에서 생성하며 에너지 분석은 별도 native artifact입니다. 이 예시는 장기 발산률이나 카오스를 입증하지 않습니다. 생성 소스 commit: ${sourceHead}.`,
  artifactIds: bundle.project.artifacts.map((artifact) => artifact.id)
});
bundle.project.citations.push({
  id: 's24-example-citation',
  text: 'Pendulum Lab preserved planar adapter and core energy diagnostics. Repository source accompanying this package.',
  url: 'https://github.com/elliotjung/pendulum-lab'
});
bundle.project.updatedAt = timestamp;
bundle = await verifyResearchBundle(bundle);
const bytes = await buildResearchPackage(bundle, { extraEntries: researchExportEntries(bundle) });
const restored = await importResearchPackage(bytes);
if (JSON.stringify(restored.project) !== JSON.stringify(bundle.project))
  throw new Error('Example project round trip differs.');
for (const original of bundle.files) {
  const restoredFile = restored.files.find((file) => file.path === original.path);
  if (!restoredFile || !Buffer.from(restoredFile.data).equals(Buffer.from(original.data)))
    throw new Error('Example original bytes differ.');
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, bytes);
const members = parseZip(bytes);
const report = {
  schema: 'pendulum-s24-example-evidence/v1',
  generatedAt: new Date().toISOString(),
  sourceHead,
  fixtureTimestamp: timestamp,
  fixtureTimestampPolicy: 'Fixed example timestamp; not a test execution timestamp.',
  output,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  sessions: bundle.project.sessions.length,
  runs: bundle.project.runs.length,
  artifacts: bundle.project.artifacts.length,
  figures: bundle.project.figures.length,
  notebookBlocks: bundle.project.notebook.length,
  projectRoundTripEqual: true,
  originalArtifactBytesEqual: true,
  members: members.map((member) => ({
    path: member.path,
    bytes: member.data.length,
    sha256: createHash('sha256').update(member.data).digest('hex')
  })),
  humanReviewed: false,
  limitation: 'Short deterministic illustration; no scientific claim or external provenance authentication.'
};
await writeFile(output.replace(/\.zip$/i, '') + '-manifest.json', JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    output,
    bytes: bytes.length,
    sha256: report.sha256,
    sessions: report.sessions,
    runs: report.runs,
    artifacts: report.artifacts,
    figures: report.figures,
    roundTrip: true
  })
);
