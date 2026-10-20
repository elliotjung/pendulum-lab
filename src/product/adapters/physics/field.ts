import { createFputVerletScratch, fputEnergy, fputModeEnergies, fputVelocityVerletStep } from '../../../physics/fput';
import {
  pendulumNetworkEnergy,
  rhsPendulumNetwork,
  ringPhononDispersion,
  type PendulumNetworkParameters
} from '../../../physics/pendulumNetwork';
import {
  createSineGordonField,
  relaxFrenkelKontorovaKink,
  sineGordonFieldEnergy,
  stepSineGordon,
  topologicalCharge
} from '../../../physics/sineGordon';
import { eulerMaruyamaStep, gaussianSampler } from '../../../physics/stochasticSteppers';
import type { ContractIssue } from '../../contracts/validation';
import { fieldStepCount, validateFieldConfig } from './field-contract';
import { fieldEnsembleProvenance, fieldWarnings, type FieldConfig, type FieldSample } from './field-schema';
export * from './field-schema';
export * from './field-contract';

export class FieldConfigurationError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
    this.name = 'FieldConfigurationError';
  }
}
export function fieldPendulumParameters(c: FieldConfig): PendulumNetworkParameters {
  return { masses: [1], lengths: [1], g: 1, coupling: [0], damping: [c.parameters.damping!] };
}
const finite = (values: readonly number[]) => {
  if (values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1000))
    throw new Error('상태가 유한 범위를 벗어났습니다. dt·초기 진폭·결합·잡음을 줄이세요.');
};
/** All physical evolution delegates to preserved native routines; only bounded scheduling/statistics live here. */
export function createFieldSimulation(input: FieldConfig) {
  const checked = validateFieldConfig(input);
  if (!checked.ok) throw new FieldConfigurationError(checked.issues);
  const config = checked.value,
    p = config.parameters,
    n = config.grid.points,
    total = fieldStepCount(config),
    id = config.systemId;
  const ensemble = fieldEnsembleProvenance(config),
    warnings = fieldWarnings(config),
    nativePendulum = fieldPendulumParameters(config);
  let index = 0,
    failure: Error | undefined,
    state = Float64Array.from(config.initialState);
  const members = Array.from({ length: id === 'system:langevin' ? config.ensemble.members : 0 }, () =>
    Float64Array.from(config.initialState)
  );
  const samplers = ensemble.seeds.map((seed) => gaussianSampler(seed));
  const scratch = createFputVerletScratch(n);
  const field =
    id === 'system:sine-gordon'
      ? createSineGordonField({
          points: n,
          length: config.grid.length,
          dt: config.step,
          boundary: config.grid.boundary,
          initial: (x) =>
            config.initialState[
              Math.min(n - 1, Math.round(x / (config.grid.length / (config.grid.boundary === 'periodic' ? n : n - 1))))
            ]!,
          initialRate: (x) =>
            config.initialState[
              n +
                Math.min(
                  n - 1,
                  Math.round(x / (config.grid.length / (config.grid.boundary === 'periodic' ? n : n - 1)))
                )
            ]!
        })
      : undefined;
  if (field && config.previousField) field.uPrev = Float64Array.from(config.previousField);
  const relaxed =
    id === 'system:frenkel-kontorova'
      ? relaxFrenkelKontorovaKink(p.coupling!, {
          sites: n,
          centerOffset: p.centerOffset!,
          maxIterations: p.maxIterations!,
          tolerance: p.tolerance!
        })
      : undefined;
  let gradNorm = 0;
  if (relaxed) {
    // Native relaxation reports a pre-update residual on budget exhaustion. Evaluate the final state through the native RHS.
    const coupling = new Float64Array(n * n);
    for (let i = 0; i < n - 1; i++) {
      coupling[i * n + i + 1] = p.coupling!;
      coupling[(i + 1) * n + i] = p.coupling!;
    }
    const derivative = new Float64Array(2 * n);
    rhsPendulumNetwork(
      [...relaxed.angles, ...Array<number>(n).fill(0)],
      { masses: Array<number>(n).fill(1), lengths: Array<number>(n).fill(1), g: 1, coupling },
      derivative
    );
    gradNorm = Math.max(...Array.from(derivative.subarray(n + 1, 2 * n - 1), Math.abs));
    if (gradNorm > p.tolerance!)
      warnings.push(
        'FK Newton 계산이 지정 허용치에 도달하지 않았습니다. 반복 수·초기 중심·결합을 바꾸어 잔차를 확인하세요.'
      );
  }
  if (id === 'system:lattice-fk-limit')
    state = Float64Array.from(ringPhononDispersion(p.onsiteOmegaSq!, p.couplingRate!, n));
  if (relaxed) state = relaxed.angles.slice();
  function makeSample(): FieldSample {
    let current = Array.from(state),
      profile: number[] = [],
      variance: number[] = [],
      mean: number[] = [],
      memberStates: number[][] = [],
      energy = 0,
      modeEnergies: number[] = [],
      charge = 0;
    if (id === 'system:langevin') {
      current = Array.from(members[0]!);
      memberStates = members.map((s) => Array.from(s));
      mean = [0, 0];
      const m2 = [0, 0];
      memberStates.forEach((s, r) =>
        s.forEach((value, i) => {
          const delta = value - mean[i]!;
          mean[i] = mean[i]! + delta / (r + 1);
          m2[i] = m2[i]! + delta * (value - mean[i]!);
        })
      );
      profile = [mean[0]!];
      variance = [m2[0]! / (members.length - 1)];
      energy =
        memberStates.reduce((sum, s) => sum + pendulumNetworkEnergy(s, nativePendulum).total, 0) / members.length;
    } else if (field) {
      profile = Array.from(field.u);
      current = [...profile, ...Array.from(field.u, (u, i) => (u - field.uPrev[i]!) / config.step)];
      if (index === 0 && !config.previousField) current = [...config.initialState];
      energy = sineGordonFieldEnergy(field);
      charge = topologicalCharge(field.u);
    } else if (id === 'system:fput') {
      profile = current.slice(0, n);
      energy = fputEnergy(state, { size: n, alpha: p.alpha!, beta: p.beta! });
      modeEnergies = fputModeEnergies(state, { size: n });
    } else {
      profile = [...current];
      energy = relaxed?.energy ?? 0;
      charge = relaxed?.charge ?? 0;
    }
    finite(current);
    finite(profile);
    finite(mean);
    memberStates.forEach(finite);
    if (![energy, charge, gradNorm, ...variance, ...modeEnergies].every(Number.isFinite))
      throw new Error('진단값이 유한하지 않습니다. 설정을 줄여 다시 시도하세요.');
    return {
      step: index,
      time: (config.startTime ?? 0) + (total > 0 && index === total ? config.duration : index * config.step),
      state: current,
      profile,
      variance,
      mean,
      memberStates,
      previousField: field ? Array.from(field.uPrev) : [],
      energy,
      energyUnit: '정규화',
      modeEnergies,
      charge,
      gradNorm,
      converged: !relaxed || gradNorm <= p.tolerance!,
      iterations: relaxed?.iterations ?? 0,
      ensemble: structuredClone(ensemble),
      warnings: [...warnings]
    };
  }
  let accepted = makeSample();
  return {
    config,
    get done() {
      return index >= total;
    },
    snapshot: () => structuredClone(accepted),
    step(): FieldSample {
      if (failure) throw failure;
      if (index >= total) return structuredClone(accepted);
      try {
        if (id === 'system:langevin') {
          members.forEach((s, i) => {
            const next = new Float64Array(2);
            eulerMaruyamaStep(
              s,
              config.step,
              (v, out) => rhsPendulumNetwork(v, nativePendulum, out),
              [0, p.noise!],
              samplers[i]!,
              next
            );
            finite(Array.from(next));
            s.set(next);
          });
        } else if (id === 'system:fput')
          fputVelocityVerletStep(state, config.step, { size: n, alpha: p.alpha!, beta: p.beta! }, scratch);
        else if (field) stepSineGordon(field);
        index++;
        accepted = makeSample();
        return structuredClone(accepted);
      } catch (cause) {
        // Keep the last accepted sample available even if a native in-place step fails.
        index = accepted.step;
        failure = cause instanceof Error ? cause : new Error('계산에 실패했습니다.');
        throw failure;
      }
    },
    restartConfig(): FieldConfig {
      if (id === 'system:langevin')
        throw new Error(
          '확률 실행의 중간 재시작에는 Gaussian stream cursor가 필요합니다. 원 seed와 초기 설정으로 재실행하세요.'
        );
      if (field) {
        const current = [
          ...accepted.profile,
          ...accepted.profile.map((v, i) => (v - accepted.previousField[i]!) / config.step)
        ];
        return {
          ...structuredClone(config),
          initialState: current,
          previousField: [...accepted.previousField],
          startTime: accepted.time
        };
      }
      return {
        ...structuredClone(config),
        initialState: id === 'system:fput' ? [...accepted.state] : [],
        startTime: accepted.time
      };
    }
  };
}
export const createFieldAdapter = createFieldSimulation;
