import { describe, expect, it } from 'vitest';
import { encodeBase64UrlText } from '../../../src/app/base64UrlText';
import {
  basePayload,
  canonicalSharedExperimentParameterHash,
  decodeSharedExperiment,
  encodeSharedExperiment
} from '../../../src/app/experimentShareCodec';
import type {
  SharedExperimentV1,
  SharedExperimentV2,
  SharedExperimentV3,
  SharedExperimentV4
} from '../../../src/app/experimentShareTypes';
import { createExpansionSystem } from '../../../src/physics/expandedModels-factory';
import { EXPANSION_MODEL_IDS } from '../../../src/physics/expandedModels-types';
import { parseExpansionShareHash } from '../../../src/physics/expandedModels-runners';
import { rk4Step } from '../../../src/physics/integrators';
import { integratorRegistry } from '../../../src/physics/integratorRegistry';
import type { IntegratorId } from '../../../src/types/domain';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  fromCanonicalPlanar,
  createPlanarSimulation
} from '../../../src/product/adapters/physics/planar';
import {
  defaultChainConfig,
  toCanonicalChain,
  fromCanonicalChain,
  createChainSimulation
} from '../../../src/product/adapters/physics/chain';
import { fromCanonicalDriven, createDrivenSimulation } from '../../../src/product/adapters/physics/driven';
import { fromCanonicalSpatial, createSpatialSimulation } from '../../../src/product/adapters/physics/spatial';
import {
  migrateLegacyLink,
  restoreLegacyLinkCompatibility,
  serializeLegacyLinkCompatibility,
  LEGACY_LINK_COMPATIBILITY_SCHEMA
} from '../../../src/product/persistence/legacy-link';

const options = { durationSeconds: 0.1, sourceId: 'test-legacy-link' };
function v4(): SharedExperimentV4 {
  return basePayload(
    {
      system: 'triple',
      method: 'rk4',
      dt: 0.005,
      damping: 0.03,
      toleranceExponent: -7,
      parameters: { m1: 1, m2: 1.2, m3: 0.8, l1: 1.1, l2: 0.9, l3: 0.7, g: 9.81 },
      initial: { theta: [1.1, -0.4, 0.2], omega: [0.1, 0.2, -0.3] }
    },
    'lyap',
    {
      packageName: '@elliotjung/pendulum-lab',
      packageVersion: '10.36.0',
      physicsVersion: '10.36.0',
      physicsSchema: 'pendulum-session/v11-ts',
      sourceCommit: 'a'.repeat(40)
    },
    {
      seed: 0,
      timingMode: 'deterministic',
      speed: 1.7,
      stepsPerFrame: 11,
      ensemble: { count: 17, epsilon: 0.00012345678901234567, variable: 'th2', pattern: 'random', seed: 42 }
    },
    {
      trailMode: 'ice',
      trailLength: 1450,
      phaseAxis: 'both',
      qualityMode: 'cinematic',
      glow: true,
      longExposure: false,
      interpolate: true,
      autoQuality: false
    },
    { angleUnit: 'deg' },
    { goal: 'sensitive-dependence', step: 'measure', trajectoryStage: 'ensemble' }
  );
}
function v3(): SharedExperimentV3 {
  const { preferences: _preferences, workflow: _workflow, ...source } = v4();
  const value: SharedExperimentV3 = {
    ...source,
    v: 3,
    execution: { ...source.execution, ensemble: { count: 17, epsilonExponent: -4.5 } }
  };
  value.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(value);
  return value;
}
function v2(): SharedExperimentV2 {
  const source = v3();
  const value: SharedExperimentV2 = {
    ...source,
    v: 2,
    physics: { ...source.physics, system: 'triple' },
    provenance: { ...source.provenance, physicsSchema: 'pendulum-session/v10-ts' }
  };
  value.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(value);
  return value;
}
function v1(): SharedExperimentV1 {
  const source = v4();
  return { v: 1, ...source.physics, system: 'triple', tab: source.tab };
}
function base(triple = false) {
  const result = triple
    ? toCanonicalChain({ ...defaultChainConfig('system:triple'), duration: 0.1 })
    : toCanonicalPlanar({ ...defaultPlanarConfig(), duration: 0.1 });
  if (!result.ok) throw new Error('fixture');
  return result.value;
}
const share = (value: unknown) => `#experiment=${encodeBase64UrlText(JSON.stringify(value))}`;

describe('S28 actual versioned legacy link conversion', () => {
  it.each([v1, v2, v3, v4])('converts a valid v1-v4 setup without changing physical values (%#)', (fixture) => {
    const source = fixture();
    const original = ` \nhttps://example.test/app.html?th1=99${encodeSharedExperiment(source)}\n `;
    const result = migrateLegacyLink(original, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonical).not.toBeNull();
    const canonical = result.value.canonical!;
    const restored = fromCanonicalChain(canonical);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.value.initialState).toEqual([1.1, -0.4, 0.2, 0.1, 0.2, -0.3]);
      expect(restored.value.parameters).toEqual({ masses: [1, 1.2, 0.8], lengths: [1.1, 0.9, 0.7], g: 9.81 });
      expect(restored.value.gamma).toBe(0.03);
      expect(restored.value.step).toBe(0.005);
    }
    expect(canonical.integrator.settings.tolerance).toEqual({ kind: 'scalar', value: 1e-7, unit: '1' });
    expect(result.value.compatibility.sourceText).toBe(original);
    expect(result.value.compatibility.decoded).toEqual(source);
    expect(result.value.compatibility.resolved).toEqual(decodeSharedExperiment(encodeSharedExperiment(source)).payload);
    expect(result.value.compatibility.sourceVersion).toBe(source.v);
    if (source.v < 4)
      expect(
        result.value.compatibility.declaredDefaults.some(
          (value) => value.path === '$.resolved.provenance.parameterHash'
        )
      ).toBe(true);
    expect(JSON.parse(serializeLegacyLinkCompatibility(result.value.compatibility))).toEqual(
      result.value.compatibility
    );
    expect(result.value.compatibility.schema).toBe(LEGACY_LINK_COMPATIBILITY_SCHEMA);
    expect(JSON.stringify(canonical)).not.toContain('example.test');
  });

  it('preserves exact v4 ensemble/workflow/display values as explicit consumer requirements', () => {
    const source = v4();
    const result = migrateLegacyLink(share(source), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const envelope = result.value.compatibility;
    expect(envelope.decoded).toEqual(source);
    expect(envelope.transferRequirements.map((requirement) => requirement.kind)).toEqual(
      expect.arrayContaining(['ensemble', 'workflow', 'display', 'navigation', 'provenance'])
    );
    expect(result.value.canonical?.seed?.value).toBe('0');
    expect(result.value.canonical?.initialConditions.theta).toEqual({
      kind: 'vector',
      values: [1.1, -0.4, 0.2],
      unit: 'rad'
    });
    expect(envelope.declaredDefaults).toEqual([]);
  });

  it.each(Object.keys(integratorRegistry) as IntegratorId[])(
    'preserves legacy share integrator identity %s and tolerance',
    (method) => {
      const source = v4();
      source.physics.method = method;
      source.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(source);
      const result = migrateLegacyLink(share(source), options);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.canonical?.integrator).toMatchObject({
          id: `integrator:${method}`,
          settings: { tolerance: { kind: 'scalar', value: 1e-7, unit: '1' } }
        });
      }
    }
  );

  it.each([
    (source: SharedExperimentV4) => {
      source.physics.parameters.g = 999;
    },
    (source: SharedExperimentV4) => {
      source.execution.ensemble!.count = 1;
    },
    (source: SharedExperimentV4) => {
      (source.physics as unknown as Record<string, unknown>).unknown = true;
    },
    (source: SharedExperimentV4) => {
      delete (source.execution as unknown as Record<string, unknown>).seed;
    },
    (source: SharedExperimentV4) => {
      source.preferences.angleUnit = 'bad' as 'deg';
    }
  ])('rejects a share needing decoder clamps/defaults or unknown-field dropping (%#)', (mutate) => {
    const source = v4();
    mutate(source);
    source.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(source);
    expect(migrateLegacyLink(share(source), options).ok).toBe(false);
  });

  it('rejects a tampered provenance fingerprint instead of recomputing authority', () => {
    const source = v4();
    source.provenance.parameterHash.value = '00000000';
    const result = migrateLegacyLink(share(source), options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe('legacy-parameter-hash-mismatch');
  });

  it.each([
    '#experiment=%%%',
    '#experiment=A',
    '#experiment=' + encodeBase64UrlText('{"v":1,"v":4}'),
    '#experiment=' + encodeBase64UrlText('{"v":4,"__proto__":{}}')
  ])('rejects malformed/ambiguous/prototype share input %s', (text) => {
    expect(migrateLegacyLink(text, options).ok).toBe(false);
  });

  it('requires an explicitly chosen restart duration for setup-only shares', () => {
    const result = migrateLegacyLink(share(v4()), { sourceId: options.sourceId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe('restart-duration-required');
  });

  it('applies exact Landing numeric controls and velocity aliases to an explicit base', () => {
    const queryBase = base();
    const original = structuredClone(queryBase);
    const result = migrateLegacyLink(
      'https://example.test/?goal=explore&audience=beginner&lang=en&tab=lab&th1=2.18&th2=2.64&w1=3.1&w2=-2.4&g=9.81',
      { ...options, queryBase }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decoded = fromCanonicalPlanar(result.value.canonical!);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.value.initialState).toEqual([2.18, 2.64, 3.1, -2.4]);
    expect(result.value.canonical!.parameters.g).toEqual({ kind: 'scalar', value: 9.81, unit: 'm/s^2' });
    expect(result.value.compatibility.inheritedFromBase).toContain('$.parameters.m1');
    expect(result.value.compatibility.transferRequirements.map((value) => value.kind)).toContain('display');
    expect(queryBase).toEqual(original);
  });

  it('maps triple vector positions without swapping angle and angular-velocity blocks', () => {
    const result = migrateLegacyLink('?system=triple&th3=.3&iw3=-.25&m3=2&l3=.8&g=9.81', {
      ...options,
      queryBase: base(true)
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonical!.initialConditions.theta).toMatchObject({
      values: [expect.any(Number), expect.any(Number), 0.3]
    });
    expect(result.value.canonical!.initialConditions.omega).toMatchObject({ values: [0, 0, -0.25] });
    expect(result.value.canonical!.parameters.masses).toMatchObject({ values: [1, 1, 2] });
    expect(result.value.compatibility.inheritedFromBase).toEqual(
      expect.arrayContaining([
        '$.parameters.masses[0]',
        '$.parameters.masses[1]',
        '$.initialConditions.theta[0]',
        '$.initialConditions.theta[1]'
      ])
    );
  });

  it('keeps partial query links without a base or with a different model pending instead of inventing values', () => {
    for (const supplied of [{ ...options }, { ...options, queryBase: base() }]) {
      const result = migrateLegacyLink('?system=triple&th1=.4', supplied);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.canonical).toBeNull();
        expect(result.value.compatibility.transferRequirements.some((value) => value.kind === 'base-experiment')).toBe(
          true
        );
      }
    }
  });

  it('retains unknown attribution and original preset requirements without treating them as controls', () => {
    const result = migrateLegacyLink('?utm_source=test&preset=classic&goal=reproduce', {
      ...options,
      queryBase: base()
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonical).toBeNull();
    expect(result.value.compatibility.decoded).toEqual({ utm_source: 'test', preset: 'classic', goal: 'reproduce' });
    expect(result.value.compatibility.transferRequirements.map((value) => value.kind)).toEqual(
      expect.arrayContaining(['unknown-query', 'preset', 'navigation'])
    );
  });

  it.each([
    '?th1=1abc',
    '?th1=999',
    '?g=9.8&g=9.81',
    '?w1=1&iw1=2',
    '?method=made-up',
    '?spf=2.5',
    '?lang=bad',
    '?foo=%GG',
    '?foo=%FF',
    '?__proto__=1',
    '?system=triple&sysType=double'
  ])('rejects invalid and conflicting query contract %s', (query) => {
    expect(migrateLegacyLink(query, { ...options, queryBase: base() }).ok).toBe(false);
  });

  it('records explicit tab precedence over Landing goal and all workflow/ensemble inputs', () => {
    const result = migrateLegacyLink(
      '?goal=classroom&tab=lab&experimentSchema=pendulum-sensitive-dependence/v1&experiment=sensitive-dependence&workflowStep=measure&trajectoryStage=ensemble&epsilon=.000123456789&ensembleCount=17&perturbationSeed=42&perturbationVar=th2&perturbationPattern=random&angleUnit=deg',
      { ...options, queryBase: base() }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compatibility.resolved).toMatchObject({ tab: 'lab' });
      expect(result.value.compatibility.transferRequirements.map((value) => value.kind)).toEqual(
        expect.arrayContaining(['workflow', 'ensemble', 'display', 'navigation'])
      );
    }
  });

  it.each(EXPANSION_MODEL_IDS)(
    'translates native expansion %s parameters/defaults and matches a short RK4 endpoint',
    (model) => {
      const source = { model, dt: 0.005, horizon: 0.1, methods: ['rk4'], parameterOverrides: {} };
      const hash = `#expansion=${btoa(JSON.stringify(source)).replace(/=+$/, '')}`;
      expect(parseExpansionShareHash(hash)).toEqual(source);
      const result = migrateLegacyLink(hash, options);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const canonical = result.value.canonical!;
      expect(canonical).not.toBeNull();
      expect(result.value.compatibility.transferRequirements.some((requirement) => requirement.kind === 'suite')).toBe(
        true
      );
      const native = createExpansionSystem(model),
        state = native.initialState.slice(),
        out = state.slice();
      for (let index = 0; index < 20; index++) {
        rk4Step(state, 0.005, native.rhs, out);
        state.set(out);
      }
      let endpoint: readonly number[];
      if (model === 'chain') {
        const config = fromCanonicalChain(canonical);
        if (!config.ok) throw new Error('chain');
        const run = createChainSimulation(config.value);
        while (!run.done) run.step();
        endpoint = run.snapshot().state;
      } else if (model === 'spherical') {
        const config = fromCanonicalSpatial(canonical);
        if (!config.ok) throw new Error('spherical');
        const run = createSpatialSimulation(config.value);
        while (!run.done) run.step();
        endpoint = run.snapshot().state;
      } else {
        const config = fromCanonicalDriven(canonical);
        if (!config.ok) throw new Error('driven');
        const run = createDrivenSimulation(config.value);
        while (!run.done) run.step();
        endpoint = run.snapshot().state;
      }
      expect(Math.max(...endpoint.map((value, index) => Math.abs(value - state[index]!)))).toBeLessThan(1e-12);
    }
  );

  it('preserves an unsupported expansion method suite and URI encoding without choosing a substitute', () => {
    const source = {
      model: 'driven',
      dt: 0.005,
      horizon: 0.1,
      methods: ['dopri5', 'rk4'],
      parameterOverrides: { driveAmplitude: 0.9 }
    };
    const result = migrateLegacyLink(`#expansion=${encodeURIComponent(JSON.stringify(source))}`, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.compatibility.decoded).toEqual(source);
    expect(result.value.canonical).toBeNull();
    expect(result.value.compatibility.transferRequirements.map((value) => value.kind)).toEqual(
      expect.arrayContaining(['unsupported-method', 'suite'])
    );
  });

  it.each([
    { model: 'made-up' },
    { model: 'driven', dt: 0 },
    { model: 'driven', methods: [] },
    { model: 'driven', methods: ['rk4', 'rk4'] },
    { model: 'driven', parameterOverrides: { hidden: 1 } },
    { model: 'driven', dt: 0.05, horizon: 0.01 },
    { model: 'driven', initialState: [0.1, 0, 0] }
  ])('rejects expansion settings the native decoder would discard or runner would clamp (%#)', (source) => {
    expect(migrateLegacyLink(`#expansion=${btoa(JSON.stringify(source)).replace(/=+$/, '')}`, options).ok).toBe(false);
  });

  it('never executes getters, navigates, starts a run or mutates an explicit base during inspection', () => {
    let reads = 0;
    const unsafe = {
      sourceId: options.sourceId,
      get queryBase() {
        reads++;
        return base();
      }
    };
    expect(migrateLegacyLink('?th1=.2', unsafe).ok).toBe(false);
    expect(reads).toBe(0);
    const source = base(),
      before = structuredClone(source);
    const result = migrateLegacyLink('?th1=.2', { ...options, queryBase: source });
    expect(source).toEqual(before);
    if (result.ok && result.value.canonical) {
      const configuration = fromCanonicalPlanar(result.value.canonical);
      expect(configuration.ok).toBe(true);
      if (configuration.ok) expect(createPlanarSimulation(configuration.value).snapshot().time).toBe(0);
    }
  });

  it('only exports issued immutable envelopes and does not evaluate a forged toJSON callback', () => {
    const result = migrateLegacyLink('?th1=.2', { ...options, queryBase: base() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value.compatibility)).toBe(true);
    expect(Object.isFrozen(result.value.compatibility.decoded)).toBe(true);
    let calls = 0;
    const forged = {
      ...result.value.compatibility,
      toJSON() {
        calls++;
        return {};
      }
    };
    expect(() => serializeLegacyLinkCompatibility(forged)).toThrow('issued');
    expect(calls).toBe(0);
  });

  for (const payload of [v1(), v2(), v3(), v4()])
    it(`revalidates full downloaded v${payload.v} envelopes and rejects forged mapping or source`, () => {
      const result = migrateLegacyLink(encodeSharedExperiment(payload), options);
      if (!result.ok) throw new Error(JSON.stringify(result));
      const exported = JSON.parse(serializeLegacyLinkCompatibility(result.value.compatibility));
      const restored = restoreLegacyLinkCompatibility(exported);
      expect(restored.ok).toBe(true);
      if (restored.ok) {
        expect(restored.value).toEqual(result.value);
        expect(() => serializeLegacyLinkCompatibility(restored.value.compatibility)).not.toThrow();
      }
      const changed = structuredClone(exported);
      changed.fieldMappings[0].transform = 'invented';
      expect(restoreLegacyLinkCompatibility(changed).ok).toBe(false);
      const extra = { ...exported, complete: true };
      expect(restoreLegacyLinkCompatibility(extra).ok).toBe(false);
    });
});
