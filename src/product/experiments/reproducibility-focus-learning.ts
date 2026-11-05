import { createNonlinearSimulation } from '../adapters/physics/nonlinear';
import { runDataDriven, reevaluateDataDriven } from '../adapters/analysis/data-driven/execute';
import {
  learningDefaults,
  type LearningData,
  type LearningMethod,
  type LearningModel
} from '../adapters/analysis/data-driven/learning-contracts';
import type { DataDrivenRequest } from '../adapters/analysis/data-driven/contracts';
import type { ExperimentStateV1 } from '../contracts/experiment';
import type { ResearchFields, ResearchFocusResult } from './research-focus-contracts';
import { reproducibilityHarmonicConfig } from './reproducibility-focus-config';
import { reproducibilityNativeRun, researchMetric, type ReproducibilityOutput } from './reproducibility-focus-science';
import { reproducibilityMetricMeaning, reproducibilitySpectralDiagnostics } from './reproducibility-focus-diagnostics';

export function reproducibilityLearningData(id: string, f: ResearchFields, canonical: ExperimentStateV1): LearningData {
  if (id === '8.9') {
    const native = createNonlinearSimulation(reproducibilityHarmonicConfig(f)),
      samples = [native.snapshot()];
    while (!native.done) samples.push(native.step());
    return {
      times: samples.map((s) => s.time),
      values: samples.map((s) => [s.state[0]!, s.state[1]!]),
      labels: ['q0', 'p0'],
      units: ['1', '1'],
      axisUnit: 'normalized-time',
      provenance: {
        kind: 'native-duffing-harmonic-limit',
        experiment: canonical,
        canonical: true,
        coordinateOrder: 'q,p',
        canonicalUnits: ['1', '1'],
        massConvention: 'normalized unit mass; p=dq/dtau'
      }
    };
  }
  const run = reproducibilityNativeRun(id, f);
  return {
    times: [...run.series.times],
    values: run.series.states.map((s) => [s[0]!, s[2]!]),
    labels: ['theta1', 'omega1'],
    units: ['rad', 'rad/s'],
    axisUnit: 's',
    provenance: {
      kind: 'native-double-pendulum-projection',
      experiment: canonical,
      omittedCoordinates: ['theta2', 'omega2'],
      warning: 'projected pair is generally not a closed Markov state'
    }
  };
}

/** Frozen chronological train/validation split and the preserved S23 implementation. */
export async function reproducibilityLearning(
  id: string,
  f: ResearchFields,
  canonical: ExperimentStateV1
): Promise<ReproducibilityOutput> {
  const tables: ResearchFocusResult['tables'][number][] = [],
    metrics: ResearchFocusResult['metrics'][number][] = [],
    charts: ResearchFocusResult['charts'][number][] = [],
    warnings: string[] = [];
  if (id === '8.10') {
    const n = f.dimension!,
      entries = Array.from({ length: n }, (_, row) => [
        { row, column: row, value: 2 },
        ...(row ? [{ row, column: row - 1, value: -1 }] : []),
        ...(row + 1 < n ? [{ row, column: row + 1, value: -1 }] : [])
      ]).flat();
    for (const method of ['arnoldi', 'lanczos'] as const) {
      const result = await runDataDriven({
        schema: 'pendulum-data-driven-request/v1',
        id: `learn_8_10_${method}`,
        mode: 'train',
        input: {
          kind: 'eigen',
          operator: { kind: 'sparse', dimension: n, entries },
          settings: {
            method,
            k: 2,
            krylovDim: f.krylov!,
            maxRestarts: 20,
            tolerance: f.tolerance!,
            seed: `s27-${f.seed}`,
            which: 'LA'
          }
        }
      });
      tables.push({
        id: method,
        title: `${method} · 실제 재계산 residual`,
        columns: result.output.columns.map((c, i) => `${c} (${result.output.units[i]})`),
        rows: result.output.rows
      });
      for (const [key, value] of Object.entries(result.output.metrics))
        metrics.push(researchMetric(`${method}-${key}`, `${method} · ${key}`, value));
      warnings.push(...result.output.warnings);
    }
    warnings.push(
      '표준 무차원 Dirichlet 삼대각 행렬(2,-1,-1)의 교육 benchmark입니다. 실제 진자 질량행렬이나 대규모 PDE의 전체 spectrum 인증이 아닙니다. native convergence와 독립 residual을 함께 확인하세요.'
    );
    return { tables, metrics, charts, warnings };
  }
  const data = reproducibilityLearningData(id, f, canonical),
    methods: LearningMethod[] =
      id === '8.7' ? ['sindy'] : id === '8.8' ? ['dmd', 'havok'] : ['reservoir', 'hamiltonian'];
  for (const method of methods) {
    const defaults = learningDefaults(data, method),
      settings = {
        ...defaults,
        seed: `s27-${f.seed}`,
        threshold: f.threshold!,
        delays: f.delays!,
        rank: f.rank!,
        reservoirSize: f.reservoirSize!,
        polynomialDegree: method === 'hamiltonian' ? 2 : 2,
        rolloutSteps: 12
      };
    const request: DataDrivenRequest = {
      schema: 'pendulum-data-driven-request/v1',
      id: `learn_${id.replace('.', '_')}_${method}`,
      mode: 'train',
      input: { kind: 'learning', data, settings }
    };
    const result = await runDataDriven(request),
      reevaluated = await reevaluateDataDriven(result);
    tables.push(
      {
        id: method,
        title: `${method} · 시간순 validation`,
        columns: result.output.columns.map((c, i) => `${c} (${result.output.units[i]})`),
        rows: result.output.rows
      },
      {
        id: `${method}-lineage`,
        title: `${method} · 훈련/재평가 계보`,
        columns: ['항목', '값'],
        rows: [
          ['원 입력', result.inputId],
          ['원 결과', result.id],
          ['재평가 parent', reevaluated.request.parentId!],
          ['train samples', settings.splitIndex],
          ['validation samples', data.values.length - settings.splitIndex],
          ['seed', settings.seed]
        ]
      },
      {
        id: `${method}-native-semantics`,
        title: `${method} · native 진단의 의미·정보 사용 범위`,
        columns: ['보존된 native 설명'],
        rows: result.output.details.map((detail) => [detail])
      }
    );
    for (const [key, value] of Object.entries(result.output.metrics)) {
      const meaning = reproducibilityMetricMeaning(method, key);
      metrics.push(researchMetric(`${method}-${key}`, `${method} · ${meaning.label}`, value, meaning.unit));
    }
    if (result.output.rows.length && result.output.rows[0]!.length > 1)
      charts.push({
        id: `${method}-diagnostic`,
        title: `${method} · 첫 진단 좌표`,
        xLabel: result.output.columns[0]!.endsWith(`(${result.output.units[0]})`)
          ? result.output.columns[0]!
          : `${result.output.columns[0]} (${result.output.units[0]})`,
        yLabel: result.output.columns[1]!.endsWith(`(${result.output.units[1]})`)
          ? result.output.columns[1]!
          : `${result.output.columns[1]} (${result.output.units[1]})`,
        series: [{ label: method, points: result.output.rows.map((r) => ({ x: r[0]!, y: r[1]! })) }]
      });
    warnings.push(...result.output.warnings);
    if (method === 'dmd' || method === 'havok') {
      const spectral = reproducibilitySpectralDiagnostics(result.output.model as LearningModel, data, settings);
      tables.push(...spectral.tables);
      charts.push(...spectral.charts);
      warnings.push(...spectral.warnings);
    }
    if (method === 'sindy') {
      const model = result.output.model as {
        payload: { equations: { stateIndex: number; activeTerms: { term: string; coefficient: number }[] }[] };
      };
      tables.push({
        id: 'identified-terms',
        title: '실제 회수한 library 항과 계수 (좌표·시간 단위 의존)',
        columns: ['방정식 좌표', 'library 항', '계수'],
        rows: model.payload.equations.flatMap((e) => e.activeTerms.map((t) => [e.stateIndex, t.term, t.coefficient]))
      });
    }
  }
  warnings.push(
    id === '8.9'
      ? '보존된 Duffing의 β=δ=구동=0, α=1 극한을 실제 RK4로 계산합니다. 정규화 단위 질량에서 q=x,p=v이며 물리적 이중진자 각속도를 운동량으로 바꾸어 표시하지 않습니다. Hamiltonian 모델은 native 다항 회귀이며 neural network 구현이 아닙니다.'
      : '실제 이중진자의 theta1,omega1 투영입니다. 숨은 theta2,omega2 때문에 일반적으로 닫힌 2차원 상태가 아니므로 회수 식·DMD/HAVOK를 완전한 물리 법칙으로 해석하지 마세요. validation은 미래 구간이며 외삽 장기 안정성 인증이 아닙니다.'
  );
  return { tables, metrics, charts, warnings: [...new Set(warnings)] };
}
