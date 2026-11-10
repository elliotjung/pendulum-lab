import { SESSION_SCHEMA_VERSION } from '../../state/sessionSchema';
import { StateStore, stateHash } from '../../state/StateStore';
import { IMPLICIT_SOLVE_TOLERANCE } from '../../physics/constants';
import type { IntegratorId, RunMode, RuntimeSnapshot } from '../../types/domain';
import { validatePlanarConfig, type PlanarConfig } from '../adapters/physics/planar';
import { validateChainConfig, type ChainConfig } from '../adapters/physics/chain';
import { validatePlayback } from '../lab/views/playback-clock';
import type { ProductRuntimeProvider } from './browser-api-binding';

export interface ProductRuntimeTiming {
  readonly mode: RunMode;
  readonly stepsPerFrame: number;
}
export interface WorkspaceRuntimeModel<C extends PlanarConfig | ChainConfig> {
  readonly state: {
    readonly config: C;
    readonly sample: { readonly state: readonly number[]; readonly time: number };
    readonly status: string;
  };
  run(): void;
  pause(): void;
  reset(): void;
}
export interface WorkspaceRuntimeProviderOptions<C extends PlanarConfig | ChainConfig> {
  readonly model: WorkspaceRuntimeModel<C>;
  readonly readTiming: () => ProductRuntimeTiming;
  /** Commit both already-validated values atomically and sync inspector/diagnostic views. */
  readonly restore: (config: C, timing: ProductRuntimeTiming) => void;
  /** Use the same invalidation/busy policy as the visible reset control. */
  readonly reset?: () => void;
}

/** Native implicit defaults; explicit methods do not use this metadata for acceptance. */
export function legacySnapshotTolerance(config: Pick<PlanarConfig, 'integratorId' | 'tolerance'>): number {
  if (config.tolerance !== undefined) return config.tolerance;
  const method = config.integratorId.slice('integrator:'.length);
  return method === 'gauss2' ? 1e-12 : method === 'hmidpoint' || method === 'bdf2' ? IMPLICIT_SOLVE_TOLERANCE : 1e-7;
}

export function createWorkspaceRuntimeProvider<C extends PlanarConfig | ChainConfig>(
  options: WorkspaceRuntimeProviderOptions<C>
): ProductRuntimeProvider {
  const { model } = options;
  function snapshot(): RuntimeSnapshot {
    const { config, sample } = model.state;
    if (!['system:double', 'system:compound-double', 'system:triple'].includes(config.systemId))
      throw new Error('N중 사슬은 legacy RuntimeSnapshot으로 표현하지 않습니다. canonical 상태 JSON을 사용하세요.');
    const timing = options.readTiming();
    validatePlayback({ timingMode: 'wall-clock', speed: 1, ...timing });
    const seed = config.seed?.value;
    const numberSeed = seed === undefined ? null : Number(seed);
    if (seed !== undefined && (!Number.isSafeInteger(numberSeed) || String(numberSeed) !== seed))
      throw new Error('이 seed 문자열은 legacy 정수 seed로 손실 없이 표현할 수 없습니다. canonical JSON을 사용하세요.');
    const parameters =
      config.systemId === 'system:triple'
        ? (() => {
            const p = (config as ChainConfig).parameters;
            return {
              m1: p.masses[0]!,
              m2: p.masses[1]!,
              m3: p.masses[2]!,
              l1: p.lengths[0]!,
              l2: p.lengths[1]!,
              l3: p.lengths[2]!,
              g: p.g
            };
          })()
        : { ...(config as PlanarConfig).parameters };
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      systemType: config.systemId.slice('system:'.length) as RuntimeSnapshot['systemType'],
      method: config.integratorId.slice('integrator:'.length) as IntegratorId,
      mode: timing.mode,
      dt: config.step,
      tolerance: legacySnapshotTolerance(config),
      stepsPerFrame: timing.stepsPerFrame,
      damping: config.gamma,
      parameters,
      state: Array.from(sample.state),
      simTime: sample.time,
      seed: numberSeed,
      hash: stateHash(sample.state)
    };
  }
  return {
    snapshot,
    applySnapshot(input) {
      const before = model.state.config;
      const current = snapshot();
      const checked = StateStore.validate(input, { preserveAngleWinding: true });
      if (!checked.ok || !checked.value)
        throw new Error(`실행 상태를 적용할 수 없습니다: ${checked.problems.join('; ')}`);
      const value = checked.value;
      if (value.systemType !== current.systemType)
        throw new Error('다른 시스템의 patch는 현재 화면에 적용하지 않습니다. 해당 시스템 화면에서 원본을 여세요.');
      if (value.systemType !== 'triple' && (value.parameters.m3 !== undefined || value.parameters.l3 !== undefined))
        throw new Error(
          '현재 두 링크 모델의 m3/l3 값을 조용히 버리지 않습니다. canonical 상태나 원본 백업을 사용하세요.'
        );
      const timing = { mode: value.mode, stepsPerFrame: value.stepsPerFrame };
      validatePlayback({ timingMode: 'wall-clock', speed: 1, ...timing });
      const parameters =
        value.systemType === 'triple'
          ? {
              masses: [value.parameters.m1, value.parameters.m2, value.parameters.m3!],
              lengths: [value.parameters.l1, value.parameters.l2, value.parameters.l3!],
              g: value.parameters.g
            }
          : {
              m1: value.parameters.m1,
              m2: value.parameters.m2,
              l1: value.parameters.l1,
              l2: value.parameters.l2,
              g: value.parameters.g
            };
      // Retain omission/default behavior and complete seed metadata if unchanged.
      const tolerance =
        before.tolerance === undefined && value.tolerance === current.tolerance && value.method === current.method
          ? undefined
          : value.tolerance;
      const seed =
        value.seed === current.seed
          ? before.seed
          : value.seed === null
            ? undefined
            : {
                value: String(value.seed),
                generator: 'legacy-session-seed',
                generatorVersion: 'unversioned'
              };
      const candidate: Record<string, unknown> = {
        ...before,
        parameters,
        initialState: value.state,
        startTime: value.simTime,
        step: value.dt,
        gamma: value.damping,
        integratorId: `integrator:${value.method}`,
        tolerance,
        seed
      };
      if (tolerance === undefined) delete candidate.tolerance;
      if (seed === undefined) delete candidate.seed;
      const config = value.systemType === 'triple' ? validateChainConfig(candidate) : validatePlanarConfig(candidate);
      if (!config.ok) throw new Error(config.issues.map((issue) => issue.message).join(' '));
      options.restore(config.value as C, timing);
      return snapshot();
    },
    toggle() {
      if (model.state.status === 'running') model.pause();
      else model.run();
    },
    reset() {
      if (options.reset) options.reset();
      else model.reset();
    }
  };
}
