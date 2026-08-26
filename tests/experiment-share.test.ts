import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAB_CONTROLS_COMMITTED_EVENT, type LabControlCommitDetail } from '../src/app/controlCommit';
import {
  MAX_SHARE_HASH_LENGTH,
  MAX_SHARE_URL_LENGTH,
  SHARE_URL_WARNING_LENGTH,
  canonicalSharedExperimentParameterHash,
  decodeSharedExperiment,
  diagnoseExperimentShareUrl,
  encodeSharedExperiment,
  experimentShareUrl,
  restoreSharedExperiment,
  type SharedExperimentV1,
  type SharedExperimentV2,
  type SharedExperimentV3
} from '../src/app/experimentShare';

const setupV1: SharedExperimentV1 = {
  v: 1,
  system: 'triple',
  method: 'yoshida4',
  dt: 0.0015,
  damping: 0.04,
  toleranceExponent: -9,
  parameters: { m1: 1, m2: 1.2, m3: 0.8, l1: 1.1, l2: 0.9, l3: 0.7, g: 9.81 },
  initial: { theta: [1.1, -0.4, 0.2], omega: [0.1, 0.2, -0.3] },
  tab: 'bifurc'
};

function setupV3(): SharedExperimentV3 {
  const setup: SharedExperimentV3 = {
    v: 3,
    scope: { kind: 'setup-only', includesResults: false, omittedUnsafeControls: ['audioOn', 'backgroundSim'] },
    provenance: {
      packageName: '@elliotjung/pendulum-lab',
      packageVersion: '10.36.0',
      physicsVersion: '10.36.0',
      physicsSchema: 'pendulum-session/v11-ts',
      sourceCommit: 'a'.repeat(40),
      parameterHash: { algorithm: 'fnv1a32-canonical-json', value: '' }
    },
    physics: {
      system: 'triple',
      method: 'yoshida4',
      dt: 0.0015,
      damping: 0.04,
      toleranceExponent: -9,
      parameters: { m1: 1, m2: 1.2, m3: 0.8, l1: 1.1, l2: 0.9, l3: 0.7, g: 9.81 },
      initial: { theta: [1.1, -0.4, 0.2], omega: [0.1, 0.2, -0.3] }
    },
    execution: {
      seed: 42,
      timingMode: 'deterministic',
      speed: 1.7,
      stepsPerFrame: 11,
      ensemble: { count: 17, epsilonExponent: -4.5 }
    },
    render: {
      trailMode: 'ice',
      trailLength: 1450,
      phaseAxis: 'both',
      qualityMode: 'cinematic',
      glow: true,
      longExposure: false,
      interpolate: true,
      autoQuality: false
    },
    tab: 'bifurc'
  };
  setup.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(setup);
  return setup;
}

function setupV2(): SharedExperimentV2 {
  const latest = setupV3();
  return {
    ...latest,
    v: 2,
    provenance: { ...latest.provenance, physicsSchema: 'pendulum-session/v10-ts' },
    physics: { ...latest.physics, system: 'triple' }
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('versioned experiment share hashes', () => {
  it('round-trips V3 physics, execution, render, scope, and provenance', () => {
    const setup = setupV3();
    const hash = encodeSharedExperiment(setup);
    const decoded = decodeSharedExperiment(hash);

    expect(hash).toMatch(/^#experiment=/);
    expect(hash).not.toContain('+');
    expect(decoded).toEqual({ ok: true, payload: setup, diagnostics: [] });
    expect(decoded.payload?.scope).toEqual({
      kind: 'setup-only',
      includesResults: false,
      omittedUnsafeControls: ['audioOn', 'backgroundSim']
    });
  });

  it('round-trips the uniform-rod model without downgrading it to point masses', () => {
    const setup = setupV3();
    setup.physics.system = 'compound-double';
    setup.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(setup);
    const decoded = decodeSharedExperiment(encodeSharedExperiment(setup));
    expect(decoded.ok).toBe(true);
    expect(decoded.payload?.physics.system).toBe('compound-double');
    expect(decoded.diagnostics).toEqual([]);
  });

  it('makes a stored persona and locale explicit without dropping attribution', () => {
    const setup = setupV3();
    const url = experimentShareUrl(
      'https://example.test/lab?mode=beginner&tab=lab&utm_source=landing',
      setup,
      'student',
      'ko'
    );
    expect(url.searchParams.get('audience')).toBe('student');
    expect(url.searchParams.get('lang')).toBe('ko');
    expect(url.searchParams.get('mode')).toBeNull();
    expect(url.searchParams.get('utm_source')).toBe('landing');
    expect(decodeSharedExperiment(url.hash).payload).toEqual(setup);
  });

  it('migrates V1 while leaving settings V1 never carried explicitly unknown', () => {
    const decoded = decodeSharedExperiment(encodeSharedExperiment(setupV1));

    expect(decoded.ok).toBe(true);
    expect(decoded.payload?.v).toBe(3);
    expect(decoded.payload?.physics).toEqual({
      system: setupV1.system,
      method: setupV1.method,
      dt: setupV1.dt,
      damping: setupV1.damping,
      toleranceExponent: setupV1.toleranceExponent,
      parameters: setupV1.parameters,
      initial: setupV1.initial
    });
    expect(decoded.payload?.execution).toEqual({
      seed: null,
      timingMode: null,
      speed: null,
      stepsPerFrame: null,
      ensemble: null
    });
    expect(decoded.payload?.render).toBeNull();
    expect(decoded.payload?.provenance.sourceCommit).toBeNull();
    expect(decoded.diagnostics.map((entry) => entry.code)).toContain('migrated-v1');
  });

  it('migrates historical V2 point-mass shares to V3 and the v11 physics schema', () => {
    const decoded = decodeSharedExperiment(encodeSharedExperiment(setupV2()));

    expect(decoded.ok).toBe(true);
    expect(decoded.payload?.v).toBe(3);
    expect(decoded.payload?.provenance.physicsSchema).toBe('pendulum-session/v11-ts');
    expect(decoded.payload?.physics.system).toBe('triple');
    expect(decoded.diagnostics.map((entry) => entry.code)).toContain('migrated-v2');
  });

  it('returns coded failures instead of silently defaulting malformed or future hashes', () => {
    expect(decodeSharedExperiment('#motion').diagnostics[0]?.code).toBe('not-share-hash');
    expect(decodeSharedExperiment('#experiment=%%%').diagnostics[0]?.code).toBe('malformed-base64');

    const invalidJson = `#experiment=${btoa('{').replace(/=+$/u, '')}`;
    expect(decodeSharedExperiment(invalidJson).diagnostics[0]?.code).toBe('invalid-json');

    const future = `#experiment=${btoa(JSON.stringify({ ...setupV3(), v: 4 })).replace(/=+$/u, '')}`;
    expect(decodeSharedExperiment(future).diagnostics[0]?.code).toBe('unsupported-version');

    const tooLong = decodeSharedExperiment(`#experiment=${'A'.repeat(MAX_SHARE_HASH_LENGTH)}`);
    expect(tooLong.ok).toBe(false);
    expect(tooLong.diagnostics[0]?.code).toBe('hash-too-long');
  });

  it('sanitizes unsafe V3 fields and reports both repairs and fingerprint mismatch', () => {
    const unsafe = setupV3() as unknown as Record<string, unknown>;
    unsafe.physics = {
      ...(unsafe.physics as Record<string, unknown>),
      method: 'eval-javascript',
      dt: -1,
      damping: 999,
      initial: { theta: [Infinity, -999, 1], omega: ['bad', 200, 0] }
    };
    unsafe.execution = {
      seed: -9,
      timingMode: 'turbo',
      speed: 99,
      stepsPerFrame: 1.5,
      ensemble: { count: 999, epsilonExponent: -99 }
    };
    const decoded = decodeSharedExperiment(encodeSharedExperiment(unsafe as unknown as SharedExperimentV3));

    expect(decoded.ok).toBe(true);
    expect(decoded.payload?.physics.method).toBe('rk4');
    expect(decoded.payload?.physics.dt).toBe(0.0001);
    expect(decoded.payload?.physics.damping).toBe(10);
    expect(decoded.payload?.physics.initial.theta[1]).toBeCloseTo(-Math.PI);
    expect(decoded.payload?.physics.initial.omega[1]).toBe(64);
    expect(decoded.payload?.execution).toEqual({
      seed: 0,
      timingMode: null,
      speed: 4,
      stepsPerFrame: 2,
      ensemble: { count: 80, epsilonExponent: -7 }
    });
    expect(decoded.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(['parameter-hash-mismatch', 'sanitized-fields'])
    );
  });

  it('reports portable, warning, and rejected URL lengths and enforces the hard limit', () => {
    const setup = setupV3();
    const portable = experimentShareUrl('https://example.test/lab', setup, 'research', 'en');
    expect(diagnoseExperimentShareUrl(portable).status).toBe('portable');

    const warning = experimentShareUrl(
      `https://example.test/lab?context=${'a'.repeat(SHARE_URL_WARNING_LENGTH)}`,
      setup,
      'research',
      'en'
    );
    expect(diagnoseExperimentShareUrl(warning).diagnostics[0]?.code).toBe('url-length-warning');

    const rejected = diagnoseExperimentShareUrl(`https://example.test/${'a'.repeat(MAX_SHARE_URL_LENGTH)}`);
    expect(rejected.status).toBe('rejected');
    expect(rejected.diagnostics[0]?.code).toBe('url-too-long');
    expect(() =>
      experimentShareUrl(
        `https://example.test/lab?context=${'a'.repeat(MAX_SHARE_URL_LENGTH)}`,
        setup,
        'research',
        'en'
      )
    ).toThrow(/too long|safety limit/u);
  });
});

class FakeControl extends EventTarget {
  value: string;
  checked: boolean;
  options: Array<{ value: string }>;

  constructor(value: string, options: string[] = [], checked = false) {
    super();
    this.value = value;
    this.checked = checked;
    this.options = options.map((entry) => ({ value: entry }));
  }
}

describe('atomic shared setup restoration', () => {
  it('updates every available control before one semantic commit and emits no native event storm', () => {
    const setup = setupV3();
    const selectValues: Record<string, string[]> = {
      sysType: ['double', 'compound-double', 'triple'],
      method: ['rk4', 'yoshida4'],
      timeMode: ['deterministic', 'wall-clock'],
      trailMode: ['rainbow', 'ice'],
      phaseAxis: ['1', '2', 'both'],
      qualityMode: ['performance', 'balanced', 'cinematic']
    };
    const valueIds = [
      'sysType',
      'method',
      'dt',
      'gamma',
      'tol',
      'm1',
      'm2',
      'm3',
      'l1',
      'l2',
      'l3',
      'g',
      'th1',
      'th2',
      'th3',
      'iw1',
      'iw2',
      'iw3',
      'seed',
      'timeMode',
      'speed',
      'spf',
      'ensN',
      'ensEps',
      'trailMode',
      'trailLen',
      'phaseAxis',
      'qualityMode'
    ];
    const controls = new Map<string, FakeControl | { textContent: string }>();
    for (const id of valueIds) controls.set(id, new FakeControl('0', selectValues[id]));
    for (const id of ['glowMode', 'longExpose', 'interpolateRender', 'autoQual']) {
      controls.set(id, new FakeControl('on', [], id === 'interpolateRender' || id === 'autoQual'));
    }
    for (const id of valueIds) controls.set(`${id}V`, { textContent: '' });

    const documentEvents = new EventTarget();
    vi.stubGlobal('document', {
      getElementById: (id: string) => controls.get(id) ?? null,
      dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents)
    });
    const switchTo = vi.fn();
    vi.stubGlobal('window', { __modernShell: { switchTo } });

    const commits: LabControlCommitDetail[] = [];
    documentEvents.addEventListener(LAB_CONTROLS_COMMITTED_EVENT, (event) => {
      commits.push((event as CustomEvent<LabControlCommitDetail>).detail);
    });
    let nativeEvents = 0;
    for (const control of controls.values()) {
      if (!(control instanceof FakeControl)) continue;
      control.addEventListener('input', () => (nativeEvents += 1));
      control.addEventListener('change', () => (nativeEvents += 1));
    }

    const restored = restoreSharedExperiment(setup);

    expect(restored.ok).toBe(true);
    expect(restored.skippedControlIds).toEqual([]);
    expect(nativeEvents).toBe(0);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.source).toBe('deep-link');
    expect(commits[0]?.controlIds).toEqual(expect.arrayContaining(['sysType', 'seed', 'timeMode', 'trailMode']));
    expect((controls.get('seed') as FakeControl).value).toBe('42');
    expect((controls.get('timeMode') as FakeControl).value).toBe('deterministic');
    expect((controls.get('trailMode') as FakeControl).value).toBe('ice');
    expect((controls.get('glowMode') as FakeControl).checked).toBe(true);
    expect((controls.get('audioOn') as FakeControl | undefined)?.checked).toBeUndefined();
    expect(switchTo).toHaveBeenCalledOnce();
    expect(switchTo).toHaveBeenCalledWith('bifurc');
  });
});
