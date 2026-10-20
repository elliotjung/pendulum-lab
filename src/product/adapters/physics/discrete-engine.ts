import { standardMapStep } from '../../../physics/standardMap';
import { createQkrPlan, qkrMeanSquareMomentum, qkrNorm, qkrStep } from '../../../physics/quantumKickedRotor';
import { qkrQuasiEnergySpectrum } from '../../../research/qkrFloquet';
import { complexUnitaryFloquetSpectrum, type UnitaryFloquetSpectrum } from '../../../research/unitaryFloquet';
import type { ContractIssue } from '../../contracts/validation';
import { discreteStepCount, validateDiscreteConfig } from './discrete-contract';
import { MAX_DISCRETE_MATRIX, discreteWarnings, type DiscreteConfig, type DiscreteSample } from './discrete-schema';
export class DiscreteConfigurationError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
    this.name = 'DiscreteConfigurationError';
  }
}
const z = (x: number) => (x === 0 ? 0 : x);
function finite(values: readonly number[]) {
  if (values.some((v) => !Number.isFinite(v)))
    throw new Error(
      '비유한 계산 결과가 나와 마지막 유효 상태에서 중지했습니다. 매개변수와 복소수·행렬 입력을 확인하세요.'
    );
}
export function createDiscreteSession(input: DiscreteConfig) {
  const checked = validateDiscreteConfig(input);
  if (!checked.ok) throw new DiscreteConfigurationError(checked.issues);
  const config = checked.value,
    id = config.systemId,
    total = discreteStepCount(config);
  const params = config.parameters,
    plan =
      id === 'system:quantum-kicked-rotor'
        ? createQkrPlan({ gridSize: config.gridSize, kickStrength: params.kickStrength!, hbar: params.hbar! })
        : undefined;
  let state = [...config.initialState],
    wave = {
      re: Float64Array.from(config.wavefunction?.re ?? []),
      im: Float64Array.from(config.wavefunction?.im ?? [])
    },
    index = 0,
    failure: Error | undefined;
  const warnings = discreteWarnings(config);
  let spectrum: UnitaryFloquetSpectrum | undefined;
  if (id === 'system:unitary-floquet')
    spectrum = complexUnitaryFloquetSpectrum(config.matrix!, {
      hbar: params.hbar!,
      period: params.period!,
      projectToUnitCircle: false
    });
  else if (plan && config.gridSize <= MAX_DISCRETE_MATRIX) {
    const native = qkrQuasiEnergySpectrum(
      { gridSize: config.gridSize, kickStrength: params.kickStrength!, hbar: params.hbar! },
      { projectToUnitCircle: false, period: 1 }
    );
    spectrum = {
      eigenvalues: native.eigenvalues,
      phases: native.phases,
      quasiEnergies: native.quasiEnergies,
      unitarityDefect: native.unitarityDefect,
      maxUnitCircleDrift: native.maxUnitCircleDrift
    };
  }
  if (spectrum)
    finite([
      ...spectrum.phases,
      ...spectrum.quasiEnergies,
      ...spectrum.eigenvalues.flatMap((e) => [e.re, e.im]),
      spectrum.unitarityDefect,
      spectrum.maxUnitCircleDrift
    ]);
  function sample(nextState: number[], nextWave: typeof wave, step: number): DiscreteSample {
    const norm = plan ? qkrNorm(nextWave) : 0;
    const result: DiscreteSample = {
      step,
      iteration: config.startIteration + step,
      state: nextState.map(z),
      theta: z(nextState[0] ?? 0),
      p: z(nextState[1] ?? 0),
      re: Array.from(nextWave.re).map(z),
      im: Array.from(nextWave.im).map(z),
      momentum: plan ? Array.from(plan.momentum) : [],
      probability: Array.from(nextWave.re, (r, i) => z(r * r + nextWave.im[i]! ** 2)),
      norm: z(norm),
      normDrift: plan ? Math.abs(norm - 1) : 0,
      meanSquareMomentum: plan ? z(qkrMeanSquareMomentum(nextWave, plan)) : 0,
      ...(spectrum ? { spectrum: structuredClone(spectrum) } : {}),
      warnings
    };
    finite([
      ...result.state,
      ...result.re,
      ...result.im,
      ...result.probability,
      result.norm,
      result.normDrift,
      result.meanSquareMomentum
    ]);
    return result;
  }
  let accepted = sample(state, wave, 0);
  function step(): DiscreteSample {
    if (failure) throw failure;
    if (index >= total) return structuredClone(accepted);
    try {
      const nextState = [...state],
        nextWave = { re: Float64Array.from(wave.re), im: Float64Array.from(wave.im) };
      if (plan) qkrStep(nextWave, plan);
      else {
        const next = standardMapStep(state[0]!, state[1]!, params.kickStrength!);
        nextState[0] = next.theta;
        nextState[1] = next.p;
      }
      const candidate = sample(nextState, nextWave, index + 1);
      state = nextState;
      wave = nextWave;
      index++;
      accepted = candidate;
      return structuredClone(accepted);
    } catch (cause) {
      failure = cause instanceof Error ? cause : new Error('이산 계산에 실패했습니다.');
      throw failure;
    }
  }
  return {
    get config() {
      return structuredClone(config);
    },
    get done() {
      return index >= total;
    },
    snapshot: () => structuredClone(accepted),
    step,
    advance(count: number) {
      if (!Number.isSafeInteger(count) || count < 1 || count > 64) throw new RangeError('한 묶음은 1–64회여야 합니다.');
      const samples: DiscreteSample[] = [];
      for (let i = 0; i < count && index < total; i++) samples.push(step());
      return samples;
    },
    restartConfig(): DiscreteConfig {
      return {
        ...structuredClone(config),
        initialState: [...accepted.state],
        startIteration: accepted.iteration,
        ...(plan ? { wavefunction: { re: [...accepted.re], im: [...accepted.im] } } : {})
      };
    }
  };
}
export const createDiscreteSimulation = createDiscreteSession;
export const createDiscreteAdapter = createDiscreteSession;
