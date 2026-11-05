import type { ExperimentStateV1 } from '../contracts/experiment';
import {
  createResearchProject,
  addResearchSession,
  captureResearchRun,
  verifyResearchBundle
} from '../provenance/project';
import { buildResearchPackage, importResearchPackage, readResearchZip } from '../provenance/package';
import { researchExportEntries, renderResearchFigure } from '../provenance/render';
import { researchMetric, reproducibilityNativeRun, type ReproducibilityOutput } from './reproducibility-focus-science';
import type { ResearchFields } from './research-focus-contracts';
import { reproducibilityFocusFields, reproducibilityFocusCanonical } from './reproducibility-focus-config';

async function prepareReproducibilityPackage(id: string, f: ResearchFields, canonical: ExperimentStateV1) {
  const run = reproducibilityNativeRun(id, f),
    timestamp = '2026-11-05T00:00:00.000Z';
  let bundle = addResearchSession(
    createResearchProject({
      title: '과정8 · 실제 run 재현 실험',
      description: '동일 입력을 복제하고 원 기록과 결과 계보를 보존합니다.',
      id: 'project-learn-s27',
      createdAt: timestamp
    }),
    { id: 'session-learn-s27', title: '제한된 교육 세션', createdAt: timestamp }
  );
  bundle = await captureResearchRun(bundle, {
    experiment: canonical,
    series: run.series,
    label: '실제 공용 엔진 run',
    sessionId: 'session-learn-s27',
    id: 'run-original-s27',
    createdAt: timestamp,
    status: 'completed'
  });
  const copy = reproducibilityNativeRun(id, f);
  bundle = await captureResearchRun(bundle, {
    experiment: canonical,
    series: copy.series,
    label: '같은 초기조건 복제 run',
    sessionId: 'session-learn-s27',
    id: 'run-repeated-s27',
    createdAt: timestamp,
    status: 'completed'
  });
  const originalSeries = bundle.project.artifacts.find((a) => a.runId === 'run-original-s27' && a.kind === 'series')!;
  if (id === '8.12') {
    bundle.project.notebook.push({
      id: 'note-s27',
      title: '연구 질문·증거·한계',
      text: '같은 canonical 입력에서 반복한 유한 RK4 기록이 같은가? 원본과 복제 series를 비교했다. 이는 외부 장치·장기 점근 동역학·사람 검토를 인증하지 않는다.',
      artifactIds: [originalSeries.id]
    });
    bundle.project.figures.push({
      id: 'figure-s27',
      title: '첫 각도의 실제 기록',
      caption: '보간하지 않은 실제 기록. 오차막대의 측정 불확실성은 추정하지 않음.',
      runId: 'run-original-s27',
      sourceArtifactId: originalSeries.id,
      xColumn: -1,
      yColumn: 0,
      theme: 'light'
    });
    bundle.project.citations.push({
      id: 'prov-primer',
      text: 'W3C PROV Primer — entities, activities and derivation',
      url: 'https://www.w3.org/TR/prov-primer/'
    });
  }
  bundle.project.updatedAt = timestamp;
  const verified = await verifyResearchBundle(bundle),
    entries = id === '8.12' ? researchExportEntries(verified) : [];
  const zip = await buildResearchPackage(verified, { extraEntries: entries }),
    restored = await importResearchPackage(zip);
  const same = JSON.stringify(run.series) === JSON.stringify(copy.series),
    files = readResearchZip(zip);
  return { run, copy, bundle, verified, originalSeries, zip, restored, same, files };
}

/** Rebuild the same bounded instructional inputs and validate the actual downloadable package.
 * The caller may supply the exact source-bound canonical configuration used by the Focus run.
 */
export async function buildReproducibilityPackage(
  id: '8.11' | '8.12',
  input: ResearchFields,
  source?: ExperimentStateV1
): Promise<Uint8Array> {
  const fields = reproducibilityFocusFields(id, input),
    baseline = reproducibilityFocusCanonical(id, fields);
  if (source) {
    const { provenance: _expected, ...expected } = baseline,
      { provenance: _actual, ...actual } = source;
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      throw new Error('패키지 기준 실험이 단원 입력과 다릅니다.');
  }
  return (await prepareReproducibilityPackage(id, fields, source ?? baseline)).zip;
}

export async function reproducibilityProject(
  id: string,
  f: ResearchFields,
  canonical: ExperimentStateV1
): Promise<ReproducibilityOutput> {
  const { run, bundle, verified, originalSeries, zip, restored, same, files } = await prepareReproducibilityPackage(
    id,
    f,
    canonical
  );
  return {
    metrics: [
      researchMetric('recorded-samples', 'run당 실제 기록 표본', run.series.times.length),
      researchMetric('repeated-equal', '동일 입력 실제 기록 일치 (1=참)', Number(same)),
      researchMetric('restored-runs', 'ZIP 복원 run', restored.project.runs.length),
      researchMetric('restored-artifacts', '검증·복원한 원본 artifact', restored.project.artifacts.length),
      researchMetric('package-bytes', '실제 생성 ZIP bytes', zip.length),
      researchMetric('export-files', '실제 ZIP 파일 수', files.length)
    ],
    tables: [
      {
        id: 'lineage',
        title: '검증 후 복원된 run→artifact→parent 계보',
        columns: ['run', 'artifact', '종류', 'parent IDs', 'SHA256', 'bytes'],
        rows: restored.project.artifacts.map((a) => [
          a.runId,
          a.id,
          a.kind,
          a.parentIds.join(',') || '(root)',
          a.sha256,
          a.bytes
        ])
      },
      {
        id: 'package-manifest',
        title: '실제 ZIP 경로와 크기',
        columns: ['경로', 'bytes'],
        rows: files.map((e) => [e.path, e.data.length])
      },
      ...(id === '8.12'
        ? [
            {
              id: 'figure-provenance',
              title: '생성 그림의 원 run과 단위',
              columns: ['그림', '원 run', '원 artifact', '출처 설명'],
              rows: [
                [
                  bundle.project.figures[0]!.id,
                  'run-original-s27',
                  originalSeries.id,
                  renderResearchFigure(verified, verified.project.figures[0]!).description
                ]
              ]
            }
          ]
        : [])
    ],
    charts: [
      {
        id: 'recorded-series',
        title: '캡처한 실제 첫 각도',
        xLabel: '시간 (s)',
        yLabel: 'theta1 (rad)',
        series: [{ label: '원 기록', points: run.series.times.map((x, i) => ({ x, y: run.series.states[i]![0]! })) }]
      }
    ],
    warnings: [
      ...restored.project.warnings,
      '실제 ZIP을 생성·재검증하며 다운로드 요청 시 같은 입력의 짧은 run을 다시 계산합니다. 다운로드 ZIP의 canonical 출처는 현재 단원을 보존합니다. 표와 진단 JSON은 계산 요약이며 ZIP bytes 자체는 별도로 저장합니다.',
      '완료 run은 시작부터 종료까지 실제 기록된 경우에만 표시합니다. 체크섬은 bytes 무결성이며 출처 진위·과학적 타당성·사람 승인 인증이 아닙니다. 같은 환경의 유한 기록 일치는 모든 장치의 bitwise 재현을 보장하지 않습니다.'
    ]
  };
}
