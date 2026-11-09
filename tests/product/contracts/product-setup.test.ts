import { crc32 } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  fromCanonicalPlanar
} from '../../../src/product/adapters/physics/planar';
import { defaultChainConfig, toCanonicalChain, fromCanonicalChain } from '../../../src/product/adapters/physics/chain';
import { buildPerturbedStates } from '../../../src/app/ensemblePerturbation';
import {
  MAX_SHARE_TOKEN_LENGTH,
  parseProductRoute,
  serializeProductRoute
} from '../../../src/product/contracts/routes';
import type { ContractResult } from '../../../src/product/contracts/validation';
import { canonicalJson, type JsonValue } from '../../../src/product/persistence/safe-data';
import { encodeShareToken, decodeShareToken } from '../../../src/product/persistence/share';
import {
  createExperimentRoute,
  createProductSetupRoute,
  resolveProductRoute
} from '../../../src/product/persistence/share-route';
import {
  PRODUCT_SETUP_SCHEMA,
  validateProductSetup,
  parseProductSetup,
  serializeProductSetup,
  type ProductSetupV1
} from '../../../src/product/persistence/product-setup';
import { encodeProductSetupToken, decodeProductSetupToken } from '../../../src/product/persistence/product-setup-codec';

function value<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}
function fixture(system: 'double' | 'compound-double' | 'triple' = 'double'): ProductSetupV1 {
  const seed = { value: '-9007199254740991', generator: 'legacy-session-seed', generatorVersion: 'unversioned' };
  const experiment =
    system === 'triple'
      ? toCanonicalChain({
          ...defaultChainConfig('system:triple'),
          parameters: { masses: [1.3, 0.7, 2.1], lengths: [0.8, 1.1, 0.65], g: 9.7 },
          gamma: 0.04,
          initialState: [9 * Math.PI, -8 * Math.PI, 0.15, 0.125, -0.0625, 0.02],
          integratorId: 'integrator:gauss2',
          tolerance: 1e-9,
          step: 0.002,
          duration: 0.02,
          startTime: 3.5,
          seed
        })
      : toCanonicalPlanar({
          ...defaultPlanarConfig(`system:${system}`),
          parameters: { m1: 1.3, m2: 0.7, l1: 0.8, l2: 1.1, g: 9.7 },
          gamma: 0.04,
          initialState: [9 * Math.PI, -8 * Math.PI, 0.125, -0.0625],
          integratorId: 'integrator:gauss2',
          tolerance: 1e-9,
          step: 0.002,
          duration: 0.02,
          startTime: 3.5,
          seed
        });
  return {
    schema: PRODUCT_SETUP_SCHEMA,
    experiment: value(experiment),
    controls: {
      angleUnit: 'deg',
      playback: { timingMode: 'deterministic', speed: 1.7, stepsPerFrame: 11, mode: 'research' },
      render: {
        trailMode: 'ice',
        trailLength: 50000,
        phaseAxis: 'both',
        qualityMode: 'cinematic',
        glow: true,
        longExposure: true,
        interpolate: false,
        autoQuality: false
      },
      ensemble: {
        count: 7,
        spec: { variable: 'iw2', pattern: 'random', epsilon: 0.00012345678901234567, seed: 0xffff_ffff }
      },
      workflow: { goal: 'sensitive-dependence', step: 'measure', trajectoryStage: 'ensemble' }
    }
  };
}
const tokenText = (text: string) => `ps1.${Buffer.from(text, 'utf8').toString('base64url')}`;
function forged(input: unknown, extra: Record<string, unknown> = {}) {
  const setup = JSON.parse(JSON.stringify(input)) as JsonValue;
  const c = crc32(Buffer.from(canonicalJson(setup), 'utf8'))
    .toString(16)
    .padStart(8, '0');
  return tokenText(JSON.stringify({ v: 1, s: setup, c, ...extra }));
}

describe('S28 additive public full product setup sharing', () => {
  it.each(['double', 'compound-double', 'triple'] as const)(
    '%s round-trips exact canonical/native inputs and every current control without defaults',
    (system) => {
      const setup = fixture(system),
        before = structuredClone(setup),
        text = value(serializeProductSetup(setup));
      const token = value(encodeProductSetupToken(setup));
      expect(token.startsWith('ps1.')).toBe(true);
      expect(value(parseProductSetup(text))).toEqual(before);
      expect(value(decodeProductSetupToken(token))).toEqual(before);
      const route = value(createProductSetupRoute(setup));
      expect(route).toBe(`#/lab/${system}?state=${token}`);
      expect(value(parseProductRoute(`/next.html${route}`))).toEqual({
        kind: 'lab-system',
        systemId: `system:${system}`,
        stateToken: token
      });
      expect(value(serializeProductRoute(value(parseProductRoute(route))))).toBe(route);
      const restored = value(resolveProductRoute(route));
      expect(restored.setup).toEqual(before);
      expect(restored.experiment).toEqual(before.experiment);
      expect(restored.setup).not.toBe(setup);
      expect(restored.experiment).not.toBe(setup.experiment);
      expect(value(createProductSetupRoute(restored.setup))).toBe(route);
      expect(setup).toEqual(before);
    }
  );
  it('keeps existing pe1 bytes and physical-only resolution without a fabricated setup', () => {
    const experiment = fixture().experiment,
      token = value(encodeShareToken(experiment));
    const before = value(createExperimentRoute(experiment));
    expect(before).toBe(`#/lab/double?state=${token}`);
    expect(value(resolveProductRoute(before))).toEqual({
      route: { kind: 'lab-system', systemId: 'system:double', stateToken: token },
      experiment: value(decodeShareToken(token))
    });
    expect(value(resolveProductRoute(before))).not.toHaveProperty('setup');
    expect(value(createExperimentRoute(experiment))).toBe(before);
  });
  it('uses canonical ordering while preserving native Float64 perturbation inputs and signed source seed', () => {
    const setup = fixture('triple');
    const reordered = {
      controls: Object.fromEntries(Object.entries(setup.controls).reverse()),
      experiment: Object.fromEntries(Object.entries(setup.experiment).reverse()),
      schema: setup.schema
    };
    expect(value(encodeProductSetupToken(reordered))).toBe(value(encodeProductSetupToken(setup)));
    const restored = value(decodeProductSetupToken(value(encodeProductSetupToken(setup))));
    const source = value(fromCanonicalChain(setup.experiment)),
      next = value(fromCanonicalChain(restored.experiment));
    expect(
      buildPerturbedStates(
        source.initialState,
        6,
        setup.controls.ensemble.count,
        80,
        'triple',
        setup.controls.ensemble.spec
      )
    ).toEqual(
      buildPerturbedStates(
        next.initialState,
        6,
        restored.controls.ensemble.count,
        80,
        'triple',
        restored.controls.ensemble.spec
      )
    );
    expect(restored.controls.ensemble.spec.epsilon).toBe(0.00012345678901234567);
    expect(restored.experiment.seed?.value).toBe('-9007199254740991');
  });
  it('rejects a valid setup under the wrong system route without partial restoration', () => {
    const route = value(createProductSetupRoute(fixture())).replace('/lab/double?', '/lab/triple?');
    expect(resolveProductRoute(route)).toMatchObject({
      ok: false,
      issues: [{ code: 'route-state-mismatch', recovery: 'keep-original' }]
    });
    expect(resolveProductRoute(route)).not.toHaveProperty('value');
  });
  it('does not read storage, navigate, fetch, run an engine or activate audio while opening/encoding', () => {
    const forbidden = vi.fn(() => {
      throw new Error('forbidden');
    });
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden, key: forbidden });
    vi.stubGlobal('AudioContext', forbidden);
    vi.stubGlobal('fetch', forbidden);
    try {
      const route = value(createProductSetupRoute(fixture()));
      expect(value(resolveProductRoute(route)).setup).toEqual(fixture());
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('S28 strict full setup trust boundaries', () => {
  it.each([
    'audioOn',
    'backgroundSim',
    'sourceText',
    'rawLegacyUrl',
    'notes',
    'privateMetadata',
    'storageKey',
    'results'
  ])('rejects unknown/private root field %s on JSON and checksum-valid wire input', (key) => {
    const setup = { ...fixture(), [key]: 'https://private.example.test/original' };
    expect(validateProductSetup(setup).ok).toBe(false);
    expect(parseProductSetup(JSON.stringify(setup)).ok).toBe(false);
    expect(encodeProductSetupToken(setup).ok).toBe(false);
    expect(decodeProductSetupToken(forged(setup)).ok).toBe(false);
  });
  it.each(['angleUnit', 'playback', 'render', 'ensemble', 'workflow'])('does not invent omitted %s controls', (key) => {
    const setup = fixture() as unknown as { controls: Record<string, unknown> };
    delete setup.controls[key];
    expect(validateProductSetup(setup)).toMatchObject({ ok: false, issues: [{ code: 'unknown-field' }] });
  });
  it.each([
    ['playback', { mode: 'unknown' }],
    ['playback', { speed: 0.099 }],
    ['playback', { stepsPerFrame: 1.5 }],
    ['playback', { stepsPerFrame: 61 }],
    ['playback', { timingMode: 'auto' }],
    ['render', { trailLength: 50001 }],
    ['render', { trailMode: 'url' }],
    ['render', { glow: 'true' }],
    ['render', { phaseAxis: '3' }],
    ['render', { qualityMode: 'custom' }],
    ['ensemble', { count: 81 }],
    ['ensemble', { count: -1 }],
    ['workflow', { goal: 'private-goal' }],
    ['workflow', { step: 'auto-run' }],
    ['workflow', { trajectoryStage: 'unknown' }]
  ] as const)('rejects invalid exact controls %s %j', (key, patch) => {
    const original = fixture(),
      setup = { ...original, controls: { ...original.controls, [key]: { ...original.controls[key], ...patch } } };
    expect(validateProductSetup(setup).ok).toBe(false);
    expect(encodeProductSetupToken(setup).ok).toBe(false);
  });
  it.each([
    { variable: 'th3' },
    { variable: 'iw3' },
    { pattern: 'unknown' },
    { epsilon: 0 },
    { epsilon: 0.1 },
    { seed: -1 },
    { seed: 0x1_0000_0000 },
    { seed: 0.5 }
  ])('rejects unsupported/unbounded native perturbation %j instead of normalizing', (patch) => {
    const setup = fixture();
    const patched = {
      ...setup,
      controls: {
        ...setup.controls,
        ensemble: { ...setup.controls.ensemble, spec: { ...setup.controls.ensemble.spec, ...patch } }
      }
    };
    expect(validateProductSetup(patched).ok).toBe(false);
  });
  it('does not silently normalize an unavailable workflow stage', () => {
    const setup = fixture();
    const patched = {
      ...setup,
      controls: { ...setup.controls, workflow: { goal: 'energy-drift', step: 'perturb', trajectoryStage: 'ensemble' } }
    };
    expect(validateProductSetup(patched)).toMatchObject({ ok: false, issues: [{ path: '$.controls.workflow' }] });
  });
  it('preserves inactive ensemble request count without treating workflow stage as permission to run', () => {
    const setup = fixture();
    const input = {
      ...setup,
      controls: {
        ...setup.controls,
        workflow: { goal: 'sensitive-dependence', step: 'reference', trajectoryStage: 'reference' }
      }
    };
    expect(value(validateProductSetup(input)).controls.ensemble.count).toBe(7);
  });
  it('rejects unsupported full-setup systems while keeping their physical-only pe1 sharing', () => {
    const canonical = value(toCanonicalChain(defaultChainConfig('system:chain')));
    expect(createExperimentRoute(canonical).ok).toBe(true);
    expect(validateProductSetup({ ...fixture(), experiment: canonical })).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported-setup-system' }]
    });
  });
  it('keeps route validation metadata-only and leaves model-specific rejection to the explicitly loaded native lab adapter', () => {
    const setup = fixture();
    const pendingNativeCheck = {
      ...setup,
      experiment: { ...setup.experiment, modelVersion: 'future-native-model-v2' }
    };
    const restored = value(resolveProductRoute(value(createProductSetupRoute(pendingNativeCheck))));
    expect(restored.setup).toEqual(pendingNativeCheck);
    expect(fromCanonicalPlanar(restored.experiment).ok).toBe(false);
    expect(restored.experiment).toEqual(pendingNativeCheck.experiment);
  });
  it('reuses existing canonical privacy rejection, even for otherwise valid analysis options', () => {
    const setup = fixture();
    const experiment = {
      ...setup.experiment,
      analyses: [
        { id: 'analysis:fft' as const, algorithmVersion: 'fft-v1', settings: {}, options: { apiKey: 'opaque-secret' } }
      ]
    };
    expect(encodeShareToken(experiment)).toMatchObject({ ok: false, issues: [{ code: 'private-share-data' }] });
    for (const result of [
      validateProductSetup({ ...setup, experiment }),
      decodeProductSetupToken(forged({ ...setup, experiment }))
    ])
      expect(result).toMatchObject({ ok: false, issues: [{ code: 'private-share-data' }] });
  });
  it('never evaluates getters or toJSON at any setup/control boundary', () => {
    let calls = 0;
    const setup = fixture();
    const getter = () => {
      calls++;
      throw new Error('forbidden');
    };
    const cases = [
      Object.defineProperty({ ...setup }, 'experiment', { enumerable: true, get: getter }),
      {
        ...setup,
        controls: Object.defineProperty({ ...setup.controls }, 'playback', { enumerable: true, get: getter })
      },
      { ...setup, controls: { ...setup.controls, render: { ...setup.controls.render, toJSON: getter } } }
    ];
    for (const input of cases) {
      expect(validateProductSetup(input).ok).toBe(false);
      expect(encodeProductSetupToken(input).ok).toBe(false);
    }
    expect(calls).toBe(0);
  });
  it.each([
    'ps1.A',
    'ps1.Zh',
    'ps1._w',
    tokenText('null'),
    tokenText('[]'),
    tokenText('{"v":1,"v":1}'),
    tokenText('\ufeff{}'),
    forged(fixture(), { extra: true }),
    forged(fixture(), { v: 2 })
  ])('rejects malformed, damaged or future wire data %s', (token) => {
    expect(decodeProductSetupToken(token).ok).toBe(false);
    expect(resolveProductRoute(`#/lab/double?state=${token}`).ok).toBe(false);
  });
  it('detects changed native values and controls using an independently verified CRC', () => {
    const token = value(encodeProductSetupToken(fixture()));
    const envelope = JSON.parse(Buffer.from(token.slice(4), 'base64url').toString('utf8'));
    expect(envelope.c).toBe(
      crc32(Buffer.from(canonicalJson(envelope.s), 'utf8'))
        .toString(16)
        .padStart(8, '0')
    );
    envelope.s.controls.playback.stepsPerFrame = 12;
    expect(decodeProductSetupToken(tokenText(JSON.stringify(envelope)))).toMatchObject({
      ok: false,
      issues: [{ code: 'damaged-share' }]
    });
    expect(decodeProductSetupToken(forged({ ...fixture(), schema: 'pendulum-product-setup/v2' }))).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported-version' }]
    });
  });
  it('keeps the original URL cap and explicitly offers a bounded full setup JSON for larger public data', () => {
    const setup = fixture();
    const experiment = {
      ...setup.experiment,
      analyses: [
        {
          id: 'analysis:fft' as const,
          algorithmVersion: 'fft-v1',
          settings: {
            signal: {
              kind: 'vector' as const,
              unit: '1' as const,
              values: Array.from({ length: 3000 }, (_, index) => index + 0.123456789)
            }
          }
        }
      ]
    };
    const large = { ...setup, experiment },
      original = structuredClone(large);
    const text = value(serializeProductSetup(large));
    expect(value(parseProductSetup(text))).toEqual(original);
    expect(encodeProductSetupToken(large)).toMatchObject({
      ok: false,
      issues: [{ code: 'share-too-large', recovery: 'export-file' }]
    });
    expect(decodeProductSetupToken(`ps1.${'A'.repeat(MAX_SHARE_TOKEN_LENGTH)}`)).toMatchObject({
      ok: false,
      issues: [{ code: 'share-too-large', recovery: 'export-file' }]
    });
    const privateLarge = {
      ...large,
      experiment: { ...experiment, analyses: [{ ...experiment.analyses[0]!, options: { apiKey: 'opaque-secret' } }] }
    };
    expect(serializeProductSetup(privateLarge)).toMatchObject({ ok: false, issues: [{ code: 'private-share-data' }] });
    expect(large).toEqual(original);
  });
});
