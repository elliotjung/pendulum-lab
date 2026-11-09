import type { IntegratorId, RuntimeSnapshot } from '../../../src/types/domain';
import {
  defaultResearchProjectProfile,
  defaultResearchSessionProfile,
  defaultResearchWorkspaceProfile,
  defaultResearchLayoutPreferences
} from '../../../src/app/parity/shared-types';
import { buildZip, textToBytes } from '../../../src/research/zipBundle';
import {
  RESEARCH_DB_SCHEMA_VERSION,
  RESEARCH_DB_STORES,
  type ResearchDbArchive
} from '../../../src/research/researchDb';

export const timestamp = '2026-11-06T00:00:00.000Z';
export const workspaceOptions = { durationSeconds: 0.02, sourceId: 'workspace-test', importedAt: timestamp };
export function workspaceSnapshot(
  systemType: RuntimeSnapshot['systemType'] = 'double',
  method: IntegratorId = 'rk4'
): RuntimeSnapshot {
  return {
    schemaVersion: 'pendulum-session/v11-ts',
    systemType,
    method,
    mode: 'research',
    dt: 0.002,
    tolerance: 1e-8,
    stepsPerFrame: 6,
    damping: 0.03,
    parameters: {
      m1: 1.2,
      m2: 0.8,
      l1: 1.1,
      l2: 0.9,
      g: 9.81,
      ...(systemType === 'triple' ? { m3: 0.6, l3: 0.7 } : {})
    },
    state:
      systemType === 'triple'
        ? [7 * Math.PI, -8 * Math.PI, 0.3, 0.1, -0.2, 0.05]
        : [7 * Math.PI, -8 * Math.PI, 0.1, -0.2],
    simTime: 4.2,
    seed: -42,
    hash: 'source-snapshot-hash'
  };
}
export const metrics = {
  drift: 0.001,
  lambdaMax: 0.2,
  fps: 60,
  physicsMsPerFrame: 0.1,
  poincarePoints: 12,
  qualityScore: 88,
  validationStatus: 'historical'
};
export function workspaceExperiment(index = 0, snapshot = workspaceSnapshot()) {
  return {
    id: `experiment-${index}`,
    name: `원본 실험 ${index}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    notes: '원본 note',
    tags: ['source'],
    snapshot,
    metrics,
    favorite: true,
    citation: { doi: '10.1234/example', reference: '원본 참고문헌' }
  };
}
export function nativeWorkspace(count = 1) {
  const project = defaultResearchProjectProfile(timestamp),
    session = defaultResearchSessionProfile(project.id, timestamp),
    workspace = defaultResearchWorkspaceProfile(timestamp);
  return {
    schemaVersion: 'pendulum-workspace/v1',
    savedAt: timestamp,
    research: {
      schemaVersion: 'pendulum-research-workbench/v4',
      savedAt: timestamp,
      migrations: [],
      droppedEntries: 0,
      project,
      sessions: [session],
      workspace,
      workspaces: [workspace],
      layout: defaultResearchLayoutPreferences(),
      experiments: Array.from({ length: count }, (_, index) => workspaceExperiment(index)),
      selectedExperimentId: 'experiment-0',
      runLog: [
        {
          id: 'historical-run',
          type: 'experiment',
          label: '원본 기록',
          timestamp,
          experimentId: 'experiment-0',
          snapshotHash: 'source-snapshot-hash',
          method: 'rk4',
          system: 'double',
          dt: 0.002,
          damping: 0.03,
          metrics,
          summary: '과거 측정'
        }
      ],
      parameterStudy: {
        id: 'study-a',
        generatedAt: timestamp,
        variable: 'theta1',
        strategy: 'grid',
        min: 0.1,
        max: 0.2,
        count: 1,
        values: [0.1],
        experiments: [
          {
            id: 'point-a',
            label: 'grid point',
            patch: { theta1: 0.1 },
            snapshot: workspaceSnapshot(),
            estimate: 'historical estimate',
            attempts: 2,
            results: {
              lambdaMax: 0.2,
              lambdaBlockStdError: 0.01,
              rqaDeterminism: 0.5,
              rqaDivergence: 0.3,
              ftle: 0.1,
              completedAt: timestamp
            }
          }
        ]
      },
      batchCheckpoint: {
        id: 'batch-a',
        planId: 'study-a',
        planHash: 'old-hash',
        status: 'cancelled',
        startedAt: timestamp,
        updatedAt: timestamp,
        completed: 1,
        failed: 0,
        pending: 2,
        nextIndex: 1,
        total: 3,
        timeoutMs: 10000,
        message: '원본 취소'
      },
      comparisonRows: [
        {
          id: 'comparison-a',
          label: '비교',
          source: 'old',
          timestamp,
          method: 'rk4',
          system: 'double',
          dt: 0.002,
          damping: 0.03,
          drift: 0.001,
          lambdaMax: 0.2,
          fps: 60,
          score: 88,
          hash: 'old-comparison'
        }
      ]
    },
    designStudy: {
      schemaVersion: 'pendulum-design-study/v1',
      id: 'design-a',
      generatedAt: timestamp,
      strategy: 'latin-hypercube',
      variables: [{ key: 'theta1', min: 0.1, max: 0.3 }],
      count: 1,
      replicates: 1,
      budget: { maxPoints: 4, maxTimeMs: 10000, maxFailures: 1 },
      points: [{ id: 'design-point-a', values: { theta1: 0.15 }, origin: 'design', replicate: 0 }],
      status: 'cancelled',
      message: '원본 계획'
    },
    figureCaptions: { labCanvas: '원본 caption' },
    snapshot: workspaceSnapshot()
  };
}
export const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2ZixkAAAAASUVORK5CYII=';
export function nativeArchive(): ResearchDbArchive {
  const stores = Object.fromEntries(
    RESEARCH_DB_STORES.map((store) => [store, []])
  ) as unknown as ResearchDbArchive['stores'];
  const row = (id: string, payload: unknown) => ({ id, updatedAt: timestamp, payload });
  stores.experiments.push(row('experiment-0', workspaceExperiment()));
  stores.runLog.push(
    row('old-run', {
      id: 'old-run',
      type: 'experiment',
      experimentId: 'experiment-0',
      timestamp,
      method: 'rk4',
      system: 'double',
      metrics
    })
  );
  stores.parameterStudies.push(
    row('study-a', {
      id: 'study-a',
      variable: 'theta1',
      experiments: [{ id: 'point-a', snapshot: workspaceSnapshot(), patch: { theta1: 0.1 } }]
    })
  );
  stores.studyResults.push(
    row('study-a:point-a', {
      studyId: 'study-a',
      pointId: 'point-a',
      patch: { theta1: 0.1 },
      results: { lambdaMax: 0.2 }
    })
  );
  stores.figures.push(
    row('figure-a', {
      id: 'figure-a',
      caption: '원본 이미지',
      dataUrl: `data:image/png;base64,${tinyPng}`,
      width: 1,
      height: 1
    })
  );
  stores.bundles.push(
    row('bundle-a', {
      fileCount: 1,
      figureCount: 0,
      bytes: 0,
      zip: Object.fromEntries(
        [...buildZip([{ path: 'reports/source.txt', data: textToBytes('원본 ZIP') }])].map((byte, index) => [
          String(index),
          byte
        ])
      )
    })
  );
  stores.settings.push(
    row('workbench-state', {
      project: defaultResearchProjectProfile(timestamp),
      sessions: [defaultResearchSessionProfile(undefined, timestamp)],
      layout: defaultResearchLayoutPreferences(),
      selectedExperimentId: 'experiment-0',
      comparisonRows: []
    })
  );
  stores.settings.push(row('unknown-setting', { arbitrary: ['원본', 0.12345678901234567], nested: { flag: true } }));
  return { schemaVersion: RESEARCH_DB_SCHEMA_VERSION, exportedAt: timestamp, stores };
}
