import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAB_CONTROLS_COMMITTED_EVENT, type LabControlCommitDetail } from '../src/app/controlCommit';
import {
  MAX_SHARE_HASH_LENGTH,
  MAX_SHARE_URL_LENGTH,
  SHARE_URL_WARNING_LENGTH,
  canonicalSharedExperimentParameterHash,
  captureSharedExperiment,
  decodeSharedExperiment,
  diagnoseExperimentShareUrl,
  encodeSharedExperiment,
  experimentShareUrl,
  restoreSharedExperiment,
  type SharedExperimentV1,
  type SharedExperimentV2,
  type SharedExperimentV3,
  type SharedExperimentV4
} from '../src/app/experimentShare';

const EXACT_EPSILON = 0.00012345678901234567;

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

function setupV4(): SharedExperimentV4 {
  const legacy = setupV3();
  const setup: SharedExperimentV4 = {
    ...legacy,
    v: 4,
    execution: {
      ...legacy.execution,
      ensemble: {
        count: 17,
        epsilon: EXACT_EPSILON,
        variable: 'th2',
        pattern: 'random',
        seed: 20260826
      }
    },
    preferences: { angleUnit: 'deg' },
    workflow: { goal: 'sensitive-dependence', step: 'measure', trajectoryStage: 'ensemble' }
  };
  setup.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(setup);
  return setup;
}

afterEach(() => vi.unstubAllGlobals());

describe('versioned experiment share hashes', () => {
  it('round-trips V4 physics, exact perturbation, workflow, preferences, render, scope, and provenance', () => {
    const setup = setupV4();
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
    expect(Object.is(EXACT_EPSILON, 10 ** Math.log10(EXACT_EPSILON))).toBe(false);
    expect(decoded.payload?.execution.ensemble?.epsilon).toBe(EXACT_EPSILON);
  });

  it('preserves the requested ensemble size while the guided view shows only one perturbation', () => {
    const setup = setupV4();
    setup.workflow.trajectoryStage = 'perturbed';
    setup.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(setup);

    const decoded = decodeSharedExperiment(encodeSharedExperiment(setup));

    expect(decoded.ok).toBe(true);
    expect(decoded.payload?.execution.ensemble?.count).toBe(17);
    expect(decoded.payload?.workflow.trajectoryStage).toBe('perturbed');
  });

  it('round-trips the uniform-rod model without downgrading it to point masses', () => {
    const setup = setupV4();
    setup.physics.system = 'compound-double';
    setup.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(setup);
    const decoded = decodeSharedExperiment(encodeSharedExperiment(setup));
    expect(decoded.ok).toBe(true);
    expect(decoded.payload?.physics.system).toBe('compound-double');
    expect(decoded.diagnostics).toEqual([]);
  });

  it('repairs an ensemble coordinate that the shared model does not own', () => {
    const setup = setupV4();
    setup.physics.system = 'double';
    setup.execution.ensemble!.variable = 'th3';
    setup.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(setup);

    const decoded = decodeSharedExperiment(encodeSharedExperiment(setup));

    expect(decoded.payload?.execution.ensemble?.variable).toBe('th1');
    expect(decoded.diagnostics.find((entry) => entry.code === 'sanitized-fields')?.fields).toContain(
      'execution.ensemble.variable'
    );
  });

  it('repairs a V4 ensemble count that contradicts an ensemble workflow stage', () => {
    const setup = setupV4();
    setup.execution.ensemble!.count = 1;
    setup.workflow.trajectoryStage = 'ensemble';
    setup.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(setup);

    const decoded = decodeSharedExperiment(encodeSharedExperiment(setup));

    expect(decoded.payload?.execution.ensemble?.count).toBe(2);
    expect(decoded.payload?.workflow.trajectoryStage).toBe('ensemble');
    expect(decoded.diagnostics.find((entry) => entry.code === 'sanitized-fields')?.fields).toContain(
      'execution.ensemble.count'
    );
  });

  it('sanitizes an invented ensemble and hidden steps from a reference-only goal', () => {
    const setup = setupV4();
    setup.workflow = { goal: 'energy-drift', step: 'observe', trajectoryStage: 'ensemble' };
    setup.provenance.parameterHash.value = canonicalSharedExperimentParameterHash(setup);

    const decoded = decodeSharedExperiment(encodeSharedExperiment(setup));

    expect(decoded.payload?.execution.ensemble).toBeNull();
    expect(decoded.payload?.workflow).toEqual({ goal: 'energy-drift', step: 'measure', trajectoryStage: 'reference' });
    expect(decoded.diagnostics.find((entry) => entry.code === 'sanitized-fields')?.fields).toEqual(
      expect.arrayContaining(['execution.ensemble', 'workflow.step', 'workflow.trajectoryStage'])
    );
  });

  it('makes a stored persona and locale explicit without dropping attribution', () => {
    const setup = setupV4();
    const url = experimentShareUrl(
      'https://example.test/lab?mode=beginner&tab=lab&th1=-1&w1=2&speed=3&method=euler&experimentSchema=old&audioOn=1&backgroundSim=1&utm_source=landing',
      setup,
      'student',
      'ko'
    );
    expect(url.searchParams.get('audience')).toBe('student');
    expect(url.searchParams.get('lang')).toBe('ko');
    expect(url.searchParams.get('mode')).toBeNull();
    expect(url.searchParams.get('th1')).toBeNull();
    expect(url.searchParams.get('experimentSchema')).toBeNull();
    expect(url.searchParams.get('w1')).toBeNull();
    expect(url.searchParams.get('speed')).toBeNull();
    expect(url.searchParams.get('method')).toBeNull();
    expect(url.searchParams.get('audioOn')).toBeNull();
    expect(url.searchParams.get('backgroundSim')).toBeNull();
    expect(url.searchParams.get('utm_source')).toBe('landing');
    expect(decodeSharedExperiment(url.hash).payload).toEqual(setup);
  });

  it('migrates V1 while leaving settings V1 never carried explicitly unknown', () => {
    const decoded = decodeSharedExperiment(encodeSharedExperiment(setupV1));

    expect(decoded.ok).toBe(true);
    expect(decoded.payload?.v).toBe(4);
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
    expect(decoded.payload?.preferences).toEqual({ angleUnit: 'rad' });
    expect(decoded.payload?.workflow).toEqual({
      goal: 'sensitive-dependence',
      step: 'choose',
      trajectoryStage: 'reference'
    });
    expect(decoded.payload?.provenance.sourceCommit).toBeNull();
    expect(decoded.diagnostics.map((entry) => entry.code)).toContain('migrated-v1');
  });

  it('migrates historical V2 point-mass shares to V4 and the v11 physics schema', () => {
    const decoded = decodeSharedExperiment(encodeSharedExperiment(setupV2()));

    expect(decoded.ok).toBe(true);
    expect(decoded.payload?.v).toBe(4);
    expect(decoded.payload?.provenance.physicsSchema).toBe('pendulum-session/v11-ts');
    expect(decoded.payload?.physics.system).toBe('triple');
    expect(decoded.diagnostics.map((entry) => entry.code)).toContain('migrated-v2');
  });

  it('migrates V3 with explicit safe defaults for fields the old schema never carried', () => {
    const decoded = decodeSharedExperiment(encodeSharedExperiment(setupV3()));
    expect(decoded.payload?.v).toBe(4);
    expect(decoded.payload?.execution.ensemble).toEqual({
      count: 17,
      epsilon: 10 ** -4.5,
      variable: 'th1',
      pattern: 'alternating',
      seed: 1
    });
    expect(decoded.payload?.preferences.angleUnit).toBe('rad');
    expect(decoded.diagnostics.map((entry) => entry.code)).toContain('migrated-v3');
  });

  it('returns coded failures instead of silently defaulting malformed or future hashes', () => {
    expect(decodeSharedExperiment('#motion').diagnostics[0]?.code).toBe('not-share-hash');
    expect(decodeSharedExperiment('#experiment=%%%').diagnostics[0]?.code).toBe('malformed-base64');

    const invalidJson = `#experiment=${btoa('{').replace(/=+$/u, '')}`;
    expect(decodeSharedExperiment(invalidJson).diagnostics[0]?.code).toBe('invalid-json');

    const future = `#experiment=${btoa(JSON.stringify({ ...setupV4(), v: 5 })).replace(/=+$/u, '')}`;
    expect(decodeSharedExperiment(future).diagnostics[0]?.code).toBe('unsupported-version');

    const tooLong = decodeSharedExperiment(`#experiment=${'A'.repeat(MAX_SHARE_HASH_LENGTH)}`);
    expect(tooLong.ok).toBe(false);
    expect(tooLong.diagnostics[0]?.code).toBe('hash-too-long');
  });

  it('sanitizes unsafe V4 fields and reports repairs, unsupported fields, and fingerprint mismatch', () => {
    const unsafe = setupV4() as unknown as Record<string, unknown>;
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
      ensemble: { count: 999, epsilon: -1, variable: 'script', pattern: 'eval', seed: -20, futureRule: true }
    };
    (unsafe.physics as Record<string, unknown>).futurePhysics = true;
    ((unsafe.physics as Record<string, unknown>).parameters as Record<string, unknown>).futureMass = 7;
    (unsafe.execution as Record<string, unknown>).futureExecution = true;
    unsafe.render = { ...(unsafe.render as Record<string, unknown>), futureRender: true };
    unsafe.futureTopLevel = true;
    const decoded = decodeSharedExperiment(encodeSharedExperiment(unsafe as unknown as SharedExperimentV4));

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
      ensemble: { count: 80, epsilon: 1e-7, variable: 'th1', pattern: 'alternating', seed: 0 }
    });
    expect(decoded.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(['parameter-hash-mismatch', 'sanitized-fields', 'unsupported-fields'])
    );
    expect(decoded.diagnostics.find((entry) => entry.code === 'unsupported-fields')?.fields).toEqual(
      expect.arrayContaining([
        'futureTopLevel',
        'physics.futurePhysics',
        'physics.parameters.futureMass',
        'execution.futureExecution',
        'execution.ensemble.futureRule',
        'render.futureRender'
      ])
    );
  });

  it('reports portable, warning, and rejected URL lengths and enforces the hard limit', () => {
    const setup = setupV4();
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
  type = 'text';
  dataset: Record<string, string | undefined> = {};

  constructor(value: string, options: string[] = [], checked = false) {
    super();
    this.value = value;
    this.checked = checked;
    this.options = options.map((entry) => ({ value: entry }));
  }
}

describe('atomic shared setup restoration', () => {
  it('captures a reference-only goal without a hidden fallback ensemble', () => {
    const controls = new Map<string, FakeControl>([
      ['experimentGoal', new FakeControl('energy-drift')],
      ['workflowStep', new FakeControl('perturb')],
      ['trajectoryStage', new FakeControl('ensemble')]
    ]);
    vi.stubGlobal('document', {
      getElementById: (id: string) => controls.get(id) ?? null,
      querySelector: () => null
    });

    const captured = captureSharedExperiment();

    expect(captured.execution.ensemble).toBeNull();
    expect(captured.workflow).toEqual({ goal: 'energy-drift', step: 'reference', trajectoryStage: 'reference' });
  });

  it('renders a migrated V1 setup as reference-only even when the fresh control default is an ensemble', () => {
    const decoded = decodeSharedExperiment(encodeSharedExperiment(setupV1));
    if (!decoded.ok || !decoded.payload) throw new Error('V1 fixture did not migrate');
    const controls = new Map<string, FakeControl>([
      ['ensN', new FakeControl('12')],
      ['ensembleRequestedCount', new FakeControl('12')],
      ['angleUnit', new FakeControl('deg', ['rad', 'deg'])],
      ['experimentGoal', new FakeControl('energy-drift', ['sensitive-dependence', 'energy-drift'])],
      ['workflowStep', new FakeControl('measure', ['choose', 'measure'])],
      ['trajectoryStage', new FakeControl('ensemble', ['reference', 'perturbed', 'ensemble'])]
    ]);
    const documentEvents = new EventTarget();
    vi.stubGlobal('document', {
      getElementById: (id: string) => controls.get(id) ?? null,
      dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents)
    });
    vi.stubGlobal('window', { __modernShell: { switchTo: vi.fn() } });
    const commits: LabControlCommitDetail[] = [];
    documentEvents.addEventListener(LAB_CONTROLS_COMMITTED_EVENT, (event) => {
      commits.push((event as CustomEvent<LabControlCommitDetail>).detail);
    });

    const restored = restoreSharedExperiment(decoded.payload);

    expect(restored.ok).toBe(true);
    expect(controls.get('ensN')?.value).toBe('0');
    expect(controls.get('ensembleRequestedCount')?.value).toBe('12');
    expect(restored.appliedControlIds).not.toContain('ensembleRequestedCount');
    expect(controls.get('trajectoryStage')?.value).toBe('reference');
    expect(restored.changedControlIds).toEqual(expect.arrayContaining(['ensN', 'trajectoryStage']));
    expect(commits).toHaveLength(1);
    expect(commits[0]?.controlIds).toContain('ensN');
  });

  it('updates every available control before one semantic commit and emits no native event storm', () => {
    const setup = setupV4();
    const selectValues: Record<string, string[]> = {
      sysType: ['double', 'compound-double', 'triple'],
      method: ['rk4', 'yoshida4'],
      timeMode: ['deterministic', 'wall-clock'],
      trailMode: ['rainbow', 'ice'],
      phaseAxis: ['1', '2', 'both'],
      qualityMode: ['performance', 'balanced', 'cinematic'],
      ensVariable: ['th1', 'th2', 'th3', 'iw1', 'iw2', 'iw3'],
      ensPattern: ['alternating', 'symmetric', 'random', 'normalized'],
      angleUnit: ['rad', 'deg'],
      experimentGoal: ['sensitive-dependence', 'periodic-vs-chaotic', 'energy-drift', 'poincare-structure'],
      workflowStep: ['choose', 'reference', 'perturb', 'observe', 'measure', 'explain'],
      trajectoryStage: ['reference', 'perturbed', 'ensemble']
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
      'ensembleRequestedCount',
      'ensEps',
      'ensVariable',
      'ensPattern',
      'ensSeed',
      'angleUnit',
      'experimentGoal',
      'workflowStep',
      'trajectoryStage',
      'trailMode',
      'trailLen',
      'phaseAxis',
      'qualityMode'
    ];
    const controls = new Map<string, FakeControl | { textContent: string }>();
    for (const id of valueIds) controls.set(id, new FakeControl('0', selectValues[id]));
    const epsilonControl = controls.get('ensEps') as FakeControl;
    epsilonControl.type = 'range';
    epsilonControl.dataset.precisionKeyboardStep = '0.1';
    epsilonControl.dataset.precisionCanonical = '0';
    epsilonControl.dataset.precisionEpsilonCanonical = '1';
    for (const id of ['glowMode', 'longExpose', 'interpolateRender', 'autoQual']) {
      controls.set(id, new FakeControl('on', [], id === 'interpolateRender' || id === 'autoQual'));
    }
    for (const id of valueIds) controls.set(`${id}V`, { textContent: '' });

    const documentEvents = new EventTarget();
    vi.stubGlobal('document', {
      getElementById: (id: string) => controls.get(id) ?? null,
      dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents),
      querySelector: () => null
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
    expect((controls.get('ensVariable') as FakeControl).value).toBe('th2');
    expect((controls.get('ensPattern') as FakeControl).value).toBe('random');
    expect((controls.get('ensSeed') as FakeControl).value).toBe('20260826');
    expect(epsilonControl.value).toBe(String(Math.log10(EXACT_EPSILON)));
    expect(epsilonControl.dataset.precisionEpsilonCanonical).toBe(String(EXACT_EPSILON));
    expect(captureSharedExperiment().execution.ensemble?.epsilon).toBe(EXACT_EPSILON);
    expect(
      decodeSharedExperiment(encodeSharedExperiment(captureSharedExperiment())).payload?.execution.ensemble?.epsilon
    ).toBe(EXACT_EPSILON);
    expect((controls.get('ensembleRequestedCount') as FakeControl).value).toBe('17');
    expect((controls.get('ensN') as FakeControl).value).toBe('17');
    expect((controls.get('angleUnit') as FakeControl).value).toBe('deg');
    expect((controls.get('workflowStep') as FakeControl).value).toBe('measure');
    expect((controls.get('glowMode') as FakeControl).checked).toBe(true);
    expect((controls.get('audioOn') as FakeControl | undefined)?.checked).toBeUndefined();
    expect(switchTo).toHaveBeenCalledOnce();
    expect(switchTo).toHaveBeenCalledWith('bifurc');
  });
});
