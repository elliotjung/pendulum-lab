import { readDiagnosticConfiguration } from '../../adapters/analysis/core/source-config';
import { batchMetricMetadata, batchStepCount } from './metadata';
import { createPlanarSimulation } from '../../adapters/physics/planar';
import { createChainSimulation } from '../../adapters/physics/chain';
import { createConstraintSimulation } from '../../adapters/physics/constraint';
import { createSpatialSimulation } from '../../adapters/physics/spatial';
import { createDrivenSimulation } from '../../adapters/physics/driven';
import { createNonlinearSimulation } from '../../adapters/physics/nonlinear';
import { createNetworkSimulation } from '../../adapters/physics/network';
import { createFieldSimulation } from '../../adapters/physics/field';
import { createDiscreteSimulation } from '../../adapters/physics/discrete-engine';
import {
  BATCH_LIMITS,
  BATCH_VERSION,
  type BatchMetric,
  type BatchRunResult,
  type BatchWorkerRequest
} from './contracts';

function simulation(request: BatchWorkerRequest) {
  const source = readDiagnosticConfiguration(request.run.experiment);
  switch (source.family) {
    case 'planar':
      return createPlanarSimulation(source.config);
    case 'chain':
      return createChainSimulation(source.config);
    case 'constraint':
      return createConstraintSimulation(source.config);
    case 'spatial':
      return createSpatialSimulation(source.config);
    case 'driven':
      return createDrivenSimulation(source.config);
    case 'nonlinear':
      return createNonlinearSimulation(source.config);
    case 'network':
      return createNetworkSimulation(source.config);
    case 'field':
      return createFieldSimulation(source.config);
    case 'discrete':
      return createDiscreteSimulation(source.config);
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function vector(sample: Record<string, unknown>, systemId: string): number[] {
  const spectrum = sample.spectrum;
  const value =
    systemId === 'system:quantum-kicked-rotor'
      ? [sample.meanSquareMomentum, sample.norm]
      : systemId === 'system:unitary-floquet' && record(spectrum)
        ? spectrum.quasiEnergies
        : sample.state;
  if (
    !Array.isArray(value) ||
    value.length > BATCH_LIMITS.dimension ||
    value.some((v) => typeof v !== 'number' || !Number.isFinite(v))
  )
    throw new Error('native 결과의 상태 차원·유한값 조건을 확인하세요.');
  return value as number[];
}
const energy = (sample: Record<string, unknown>): number | undefined => {
  const value = record(sample.energy) ? sample.energy.total : sample.energy;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};
/** Synchronous only inside a dedicated worker; every physical step delegates to the existing adapter. */
export function executeBatchRun(
  request: BatchWorkerRequest,
  onProgress: (fraction: number) => void = () => undefined
): BatchRunResult {
  const experiment = request.run.experiment,
    metadata = batchMetricMetadata(experiment),
    native = simulation(request),
    evaluation = experiment.runtime.domain === 'evaluation';
  const first = native.snapshot() as unknown as Record<string, unknown>,
    initial = vector(first, experiment.systemId),
    count = initial.length;
  const min = [...initial],
    max = [...initial],
    mean = [...initial],
    square = initial.map((v) => v * v);
  let final = [...initial],
    n = 1,
    steps = 0,
    last = first;
  const stride = experiment.runtime.domain === 'evaluation' ? 1 : experiment.runtime.sampleEvery;
  const expected = batchStepCount(experiment);
  if (expected > BATCH_LIMITS.steps) throw new Error('개별 run 단계 한도를 넘었습니다.');
  const warnings = [...metadata.warnings];
  const accept = (sample: Record<string, unknown>) => {
    const values = vector(sample, experiment.systemId);
    if (values.length !== count) throw new Error('실행 중 상태 차원이 바뀌었습니다.');
    final = values;
    n++;
    values.forEach((v, i) => {
      min[i] = Math.min(min[i]!, v);
      max[i] = Math.max(max[i]!, v);
      mean[i] = mean[i]! + (v - mean[i]!) / n;
      square[i] = square[i]! + (v * v - square[i]!) / n;
    });
  };
  let lastProgressAt = performance.now();
  onProgress(0);
  while (!native.done) {
    if (++steps > BATCH_LIMITS.steps) throw new Error('native 실행이 단계 한도 안에 종료되지 않았습니다.');
    last = native.step() as unknown as Record<string, unknown>;
    if (steps % stride === 0 || native.done) accept(last);
    if (steps % 64 === 0 && performance.now() - lastProgressAt >= 50) {
      lastProgressAt = performance.now();
      onProgress(Math.min(1, steps / Math.max(1, expected)));
    }
  }
  if (last.converged === false)
    throw new Error('정적 Newton 평가가 수렴하지 않았습니다. 반복 수와 허용오차를 확인하세요.');
  if (Array.isArray(last.warnings))
    for (const message of last.warnings)
      if (typeof message === 'string' && !warnings.includes(message)) warnings.push(message);
  const z = (value: number) => (value === 0 ? 0 : value);
  const metrics: BatchMetric[] = initial.map((value, i) => ({
    key: `state-${i}`,
    label:
      metadata.labels[i] ??
      (experiment.systemId === 'system:unitary-floquet'
        ? `quasienergy-${i + 1}`
        : experiment.systemId === 'system:lattice-fk-limit'
          ? `omegaSquared-${i + 1}`
          : `state-${i + 1}`),
    unit: metadata.units[i] ?? '1',
    initial: z(value),
    final: z(final[i]!),
    min: z(min[i]!),
    max: z(max[i]!),
    mean: z(mean[i]!),
    rms: z(Math.sqrt(Math.max(0, square[i]!)))
  }));
  const e0 = energy(first),
    e1 = energy(last),
    hasEnergy = metadata.energyUnit !== undefined && e0 !== undefined && e1 !== undefined;
  const start = evaluation ? 0 : Number(first[metadata.axisUnit === 'iteration' ? 'iteration' : 'time']),
    end = evaluation ? 0 : Number(last[metadata.axisUnit === 'iteration' ? 'iteration' : 'time']);
  if (
    ![start, end, ...metrics.flatMap((m) => [m.initial, m.final, m.min, m.max, m.mean, m.rms])].every(Number.isFinite)
  )
    throw new Error('요약 통계가 유한하지 않습니다. 입력 범위를 줄이세요.');
  if (hasEnergy)
    warnings.push(
      '에너지 변화는 native 진단값의 차이이며 감쇠·구동·제어·확률계의 수치 오차가 아닙니다. 모델별 에너지 전제를 확인하세요.'
    );
  onProgress(1);
  return {
    schema: 'pendulum-batch-run/v1',
    algorithmVersion: BATCH_VERSION,
    runId: request.run.id,
    batchId: request.batchId,
    inputIndex: request.run.index,
    summary: {
      steps,
      sampleCount: n,
      axisUnit: evaluation ? 'evaluation' : metadata.axisUnit,
      axisStart: start,
      axisEnd: end,
      metrics,
      ...(hasEnergy
        ? {
            energy: {
              initial: z(e0),
              final: z(e1),
              change: z(e1 - e0),
              unit: metadata.energyUnit ?? (typeof last.energyUnit === 'string' ? last.energyUnit : '1')
            }
          }
        : {}),
      warnings,
      evaluation
    }
  };
}
