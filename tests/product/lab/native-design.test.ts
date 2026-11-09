import { describe, expect, it } from 'vitest';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../../src/product/adapters/physics/planar';
import { defaultChainConfig, toCanonicalChain } from '../../../src/product/adapters/physics/chain';
import {
  generateDesign,
  adaptiveRefinement,
  boundaryRefinement,
  uncertaintyResampling
} from '../../../src/research/experimentDesign';
import { runChaosJob } from '../../../src/workers/chaosProtocol';
import { JobClient, inProcessTransportFactory } from '../../../src/runtime/JobClient';
import {
  defaultNativeDesignSettings,
  generateNativeDesign,
  refineNativeDesign,
  validateNativeDesign,
  validateStudyPointResult,
  designCondition
} from '../../../src/product/lab/experiments/native-design';
import {
  createNativeDesignQueue,
  parseNativeDesignQueue,
  serializeNativeDesignQueue,
  validateNativeDesignSnapshot
} from '../../../src/product/lab/experiments/native-design-queue';
import type { NativeDesignSettings } from '../../../src/product/lab/experiments/native-design';
import type { ExperimentStateV1 } from '../../../src/product/contracts/experiment';

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; issues: readonly unknown[] }): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
};
const source = (gamma = 0) => unwrap(toCanonicalPlanar({ ...defaultPlanarConfig(), gamma, duration: 0.02 }));
const quick = (): NativeDesignSettings => ({
  ...defaultNativeDesignSettings(),
  count: 2,
  evaluation: {
    lyapunov: { dt: 0.01, steps: 64, transientSteps: 8, renormEvery: 4, seed: 123, method: 'rk4' },
    rqa: { dt: 0.01, samples: 24, sampleEvery: 2, transientSteps: 8 },
    ftleHorizon: 0.05,
    ftleDt: 0.01
  }
});
async function settled(queue: ReturnType<typeof createNativeDesignQueue>) {
  return await new Promise<ReturnType<typeof queue.snapshot>>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('queue did not settle'));
    }, 5000);
    const unsubscribe = queue.subscribe((state) => {
      if (['completed', 'partial'].includes(state.status)) {
        clearTimeout(timer);
        queueMicrotask(() => unsubscribe());
        resolve(state);
      }
    });
    queue.start();
  });
}
describe('S28 actual native design generation/refinement and studyPoint consumer', () => {
  it.each(['sobol', 'latin-hypercube', 'grid'] as const)(
    'matches the unchanged %s generator including replicates and seed exactly',
    (strategy) => {
      const settings = {
        ...quick(),
        strategy,
        count: 5,
        replicates: 2,
        variables: [
          { key: 'theta1', min: -1, max: 1 },
          { key: 'mass-ratio', min: 0.5, max: 2 }
        ]
      };
      const plan = generateNativeDesign(source(), settings);
      expect(plan.points.map(({ values, origin, replicate }) => ({ values, origin, replicate }))).toEqual(
        generateDesign(settings.variables, strategy, 5, {
          seedText: settings.seedText,
          replicates: 2,
          budget: settings.budget
        })
      );
      expect(validateNativeDesign(plan)).toEqual(plan);
      expect(plan.source).toEqual(source());
    }
  );
  it.each(['adaptive', 'boundary', 'uncertainty'] as const)(
    'matches native %s refinement and preserves declared λ/SE evidence',
    (kind) => {
      const plan = generateNativeDesign(source(), quick());
      const evaluated = [
        { values: { theta1: 0.8 }, lambdaMax: -0.2, lambdaStdError: 0.01 },
        { values: { theta1: 1 }, lambdaMax: 0.2, lambdaStdError: 0.02 },
        { values: { theta1: 1.2 }, lambdaMax: 0.4, lambdaStdError: 0.2 }
      ];
      const record = {
        kind,
        maxNew: 2,
        relativeThreshold: 2,
        evidenceSource: 'declared native reference study',
        evaluated
      };
      const refined = refineNativeDesign(plan, record);
      const expected =
        kind === 'adaptive'
          ? adaptiveRefinement(evaluated, plan.settings.variables, 2)
          : kind === 'boundary'
            ? boundaryRefinement(evaluated, plan.settings.variables, 2)
            : uncertaintyResampling(evaluated, 2, 2);
      expect(
        refined.points.slice(plan.points.length).map(({ values, origin, replicate }) => ({ values, origin, replicate }))
      ).toEqual(expected);
      expect(refined.refinements).toEqual([record]);
      expect(validateNativeDesign(refined)).toEqual(refined);
    }
  );
  it('uses the native JobClient engine and retains every studyPoint output exactly through export/import', async () => {
    const plan = generateNativeDesign(source(), quick()),
      queue = createNativeDesignQueue(plan, { client: new JobClient(inProcessTransportFactory(), { poolSize: 1 }) });
    try {
      const state = await settled(queue);
      expect(state.status).toBe('completed');
      for (let i = 0; i < plan.points.length; i++)
        expect(state.runs[i]!.result).toEqual(runChaosJob(plan.points[i]!.request!));
      expect(parseNativeDesignQueue(serializeNativeDesignQueue(state))).toEqual(state);
      const restored = createNativeDesignQueue(parseNativeDesignQueue(serializeNativeDesignQueue(state)));
      restored.start();
      expect(restored.snapshot().runs).toEqual(state.runs);
      expect(restored.snapshot().workConsumed).toBe(state.workConsumed);
      restored.dispose();
    } finally {
      queue.dispose();
    }
  });
  it('preserves γ>0 conditions without secretly evaluating an undamped spec', async () => {
    const original = source(0.1),
      plan = generateNativeDesign(original, quick());
    expect(plan.source).toEqual(original);
    expect(plan.points.every((p) => p.request === null && p.unsupported?.includes('γ>0'))).toBe(true);
    expect(plan.points[0]!.experiment.parameters.gamma).toEqual(original.parameters.gamma);
    const queue = createNativeDesignQueue(plan);
    const result = await settled(queue);
    expect(result.status).toBe('partial');
    expect(result.workConsumed).toBe(0);
    expect(result.runs.every((r) => r.status === 'unsupported')).toBe(true);
    queue.dispose();
  });
  it.each(['system:compound-double', 'system:triple'] as const)(
    'matches every native output for %s through the real JobClient engine',
    async (systemId) => {
      const original =
        systemId === 'system:triple'
          ? unwrap(toCanonicalChain(defaultChainConfig(systemId)))
          : unwrap(toCanonicalPlanar(defaultPlanarConfig(systemId)));
      const plan = generateNativeDesign(original, { ...quick(), count: 1 });
      const queue = createNativeDesignQueue(plan, {
        client: new JobClient(inProcessTransportFactory(), { poolSize: 1 })
      });
      try {
        const done = await settled(queue);
        expect(done.status).toBe('completed');
        expect(done.runs[0]!.result).toEqual(runChaosJob(plan.points[0]!.request!));
      } finally {
        queue.dispose();
      }
    }
  );
  it('binds effective per-point Lyapunov dt to unchanged native study policy and retains all source settings', () => {
    const settings = { ...quick(), strategy: 'grid' as const, variables: [{ key: 'dt', min: 0.002, max: 0.004 }] };
    const plan = generateNativeDesign(source(), settings);
    expect(plan.points.map((point) => point.request!.settings!.lyapunov!.dt)).toEqual(
      plan.points.map((point) =>
        point.experiment.runtime.domain === 'time' ? Math.min(0.01, point.experiment.runtime.step.value) : NaN
      )
    );
    expect(new Set(plan.points.map((point) => point.request!.settings!.lyapunov!.dt)).size).toBe(2);
    expect(plan.settings.evaluation).toEqual(settings.evaluation);
    expect(plan.source).toEqual(source());
  });
  it('guards damping at each generated point and validates nested settings even with no supported automatic point', () => {
    const plan = generateNativeDesign(source(), {
      ...quick(),
      strategy: 'grid',
      variables: [{ key: 'damping', min: 0, max: 0.1 }]
    });
    expect(plan.points[0]!.request).not.toBeNull();
    expect(plan.points[1]!.request).toBeNull();
    expect(plan.points[1]!.experiment.parameters.gamma).toMatchObject({ value: 0.1 });
    const dampedSource = generateNativeDesign(source(0.1), {
      ...quick(),
      variables: [{ key: 'damping', min: 0, max: 0 }]
    });
    expect(dampedSource.points.every((point) => point.request === null)).toBe(true);
    expect(dampedSource.source.parameters.gamma).toMatchObject({ value: 0.1 });
    const settings = quick();
    Object.assign(settings.evaluation.lyapunov!, { unexpected: true });
    expect(() => generateNativeDesign(source(0.1), settings)).toThrow();
    const unsupported = quick();
    unsupported.evaluation.lyapunov!.steps = 2_000_000_000;
    expect(() => generateNativeDesign(source(0.1), unsupported)).toThrow();
  });
  it('retains a failure, explicitly prepares retry and keeps cumulative attempt/work lineage', async () => {
    const plan = generateNativeDesign(source(), { ...quick(), count: 1 });
    let calls = 0;
    const client = {
      usesWorkers: () => true,
      terminate: () => undefined,
      submit: () => ({
        result:
          ++calls === 1
            ? Promise.reject(new Error('controlled transport failure'))
            : Promise.resolve(runChaosJob(plan.points[0]!.request!)),
        cancel: () => undefined
      })
    } as unknown as JobClient;
    const queue = createNativeDesignQueue(plan, { client });
    try {
      const failed = await settled(queue);
      expect(failed.runs[0]!.error).toContain('controlled transport failure');
      queue.retryFailed();
      const done = await settled(queue);
      expect(done.status).toBe('completed');
      expect(done.runs[0]).toMatchObject({ attempts: 2, failures: 1 });
      expect(done.workConsumed).toBe(2 * plan.estimatedWork);
      expect(validateNativeDesignSnapshot(done)).toEqual(done);
    } finally {
      queue.dispose();
    }
  });
  it('patches triple state/ratios canonically and keeps the selected main trajectory distinct', () => {
    const canonical = unwrap(toCanonicalChain(defaultChainConfig('system:triple')));
    const patched = designCondition(canonical, {
      theta2: 0.3,
      omega1: 0.4,
      'mass-ratio': 1.5,
      'length-ratio': 2,
      dt: 0.002
    });
    expect(patched.initialConditions.theta).toMatchObject({ values: [expect.any(Number), 0.3, expect.any(Number)] });
    expect(patched.initialConditions.omega).toMatchObject({ values: [0.4, expect.any(Number), expect.any(Number)] });
    expect(patched.parameters.masses).toMatchObject({ values: [1, 1.5, 1] });
    expect(patched.integrator).toEqual(canonical.integrator);
    expect(patched.runtime).toMatchObject({ step: { value: 0.002 } });
  });
  it('cancels at a run boundary, ignores late replies and resumes only unfinished points', async () => {
    const plan = generateNativeDesign(source(), quick());
    let resolve!: (response: ReturnType<typeof runChaosJob>) => void,
      cancelled = 0;
    const client = {
      usesWorkers: () => true,
      terminate: () => undefined,
      submit: () => ({
        result: new Promise<ReturnType<typeof runChaosJob>>((yes) => {
          resolve = yes;
        }),
        cancel: () => {
          cancelled++;
        }
      })
    } as unknown as JobClient;
    const queue = createNativeDesignQueue(plan, { client });
    queue.start();
    queue.cancel();
    resolve(runChaosJob(plan.points[0]!.request!));
    await Promise.resolve();
    expect(cancelled).toBe(1);
    expect(queue.snapshot().runs[0]!.status).toBe('pending');
    expect(queue.snapshot().runs[0]!.result).toBeUndefined();
    const saved = parseNativeDesignQueue(serializeNativeDesignQueue(queue.snapshot()));
    queue.dispose();
    const restored = createNativeDesignQueue(saved, {
      client: new JobClient(inProcessTransportFactory(), { poolSize: 1 })
    });
    try {
      const done = await settled(restored);
      expect(done.runs.map((r) => r.attempts)).toEqual([2, 1]);
      expect(done.status).toBe('completed');
    } finally {
      restored.dispose();
    }
  });
  it('retains full completed outputs on cancellation and restarts only running imported rows', async () => {
    const plan = generateNativeDesign(source(), quick());
    const first = validateStudyPointResult(runChaosJob(plan.points[0]!.request!), plan.points[0]!.request!);
    const snapshot = {
      schema: 'pendulum-native-design-queue/v1' as const,
      plan,
      status: 'running' as const,
      runs: [
        { id: plan.points[0]!.id, status: 'completed' as const, attempts: 1, failures: 0, progress: 1, result: first },
        { id: plan.points[1]!.id, status: 'running' as const, attempts: 1, failures: 0, progress: 0.5 }
      ],
      elapsedMs: 12,
      workConsumed: plan.estimatedWork,
      usesWorkers: true,
      stopReason: null
    };
    const queue = createNativeDesignQueue(snapshot, {
      client: new JobClient(inProcessTransportFactory(), { poolSize: 1 })
    });
    expect(queue.snapshot().status).toBe('cancelled');
    expect(queue.snapshot().runs[0]!.result).toEqual(first);
    try {
      const done = await settled(queue);
      expect(done.runs.map((r) => r.attempts)).toEqual([1, 2]);
      expect(done.runs[0]!.result).toEqual(first);
    } finally {
      queue.dispose();
    }
  });
  it('stops dispatch at cumulative time/failure/work budgets without throwing away pending inputs', async () => {
    const plan = generateNativeDesign(source(), quick()),
      queue = createNativeDesignQueue(plan, {
        now: (() => {
          let time = 0;
          return () => (time += 1_000_000);
        })()
      });
    const state = await settled(queue);
    expect(state.status).toBe('partial');
    expect(state.stopReason).toContain('시간');
    expect(state.runs.every((r) => r.attempts === 0)).toBe(true);
    queue.dispose();
  });
  it.each([
    (s: NativeDesignSettings) => {
      s.count = 257;
    },
    (s: NativeDesignSettings) => {
      s.replicates = 9;
    },
    (s: NativeDesignSettings) => {
      s.variables[0]!.max = 0.1;
    },
    (s: NativeDesignSettings) => {
      s.variables.push({ ...s.variables[0]! });
    },
    (s: NativeDesignSettings) => {
      s.variables[0]!.key = '__proto__';
    },
    (s: NativeDesignSettings) => {
      s.budget.maxPoints = 1;
    },
    (s: NativeDesignSettings) => {
      s.evaluation.lyapunov!.steps = 2_000_000_000;
    },
    (s: NativeDesignSettings) => {
      s.variables = [{ key: 'mass-ratio', min: -1, max: -0.5 }];
    }
  ])('rejects invalid native generation inputs before dispatch %s', (mutate) => {
    const settings = quick();
    mutate(settings);
    expect(() => generateNativeDesign(source(), settings)).toThrow();
  });
  it('rejects forged generated conditions, effective settings, outputs and archive accounting', () => {
    const plan = generateNativeDesign(source(), quick());
    const changed = structuredClone(plan);
    changed.points[0]!.request!.state0[0] = 9;
    expect(() => validateNativeDesign(changed)).toThrow();
    const queue = createNativeDesignQueue(plan);
    const snapshot = queue.snapshot();
    queue.dispose();
    snapshot.workConsumed = 1;
    expect(() => validateNativeDesignSnapshot(snapshot)).toThrow();
    expect(() => parseNativeDesignQueue('{"schema":"x","schema":"y"}')).toThrow();
    const valid = runChaosJob(plan.points[0]!.request!);
    expect(() => validateStudyPointResult({ ...valid, id: 'wrong' }, plan.points[0]!.request!)).toThrow();
    expect(() => validateStudyPointResult({ ...valid, lambdaBlockStdError: -1 }, plan.points[0]!.request!)).toThrow();
  });
  it('rejects programmatic accessors without evaluating them at queue construction', () => {
    let called = false;
    const unsafe = Object.defineProperty({}, 'schema', {
      enumerable: true,
      get() {
        called = true;
        return 'pendulum-native-design-queue/v1';
      }
    });
    expect(() => createNativeDesignQueue(unsafe as ReturnType<typeof generateNativeDesign>)).toThrow();
    expect(called).toBe(false);
  });
  it('rejects a model outside native studyPoint scope instead of using another equation', () => {
    expect(() =>
      generateNativeDesign({ ...source(), systemId: 'system:network' } as ExperimentStateV1, quick())
    ).toThrow();
  });
});
