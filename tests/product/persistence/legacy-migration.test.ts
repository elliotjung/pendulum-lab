import { describe, expect, it, vi } from 'vitest';
import { runJson } from '../../../src/app/labExport';
import { encodeBase64UrlText } from '../../../src/app/base64UrlText';
import type { RuntimeSnapshot } from '../../../src/types/domain';
import { createDoublePendulumDerivative } from '../../../src/physics/double';
import { createCompoundDoublePendulumDerivative } from '../../../src/physics/compoundDouble';
import { rhsTriple } from '../../../src/physics/triple';
import { rk4Step, rk2Step, eulerStep } from '../../../src/physics/integrators';
import { fromCanonicalPlanar, createPlanarSimulation } from '../../../src/product/adapters/physics/planar';
import { fromCanonicalChain, createChainSimulation } from '../../../src/product/adapters/physics/chain';
import { serializeExperiment, parseExperiment } from '../../../src/product/persistence/serialization';
import {
  confirmLegacyMigration,
  exportLegacyMigrationBackup,
  previewLegacyMigration,
  type LegacyMigrationPreview
} from '../../../src/product/persistence/legacy-migration';
import { migrateLegacySession } from '../../../src/product/persistence/legacy-migration-session';

function fixture(systemType: 'double' | 'compound-double' | 'triple' = 'double'): RuntimeSnapshot {
  return {
    schemaVersion: 'pendulum-session/v11-ts',
    systemType,
    method: 'rk4',
    mode: 'research',
    dt: 0.002,
    tolerance: 1e-7,
    stepsPerFrame: 8,
    damping: 0.08,
    parameters: {
      m1: 1.2,
      m2: 0.8,
      l1: 1.1,
      l2: 0.9,
      g: 9.81,
      ...(systemType === 'triple' ? { m3: 0.6, l3: 0.7 } : {})
    },
    state:
      systemType === 'triple'
        ? [9 * Math.PI, -8 * Math.PI, 0.3, 0.125, -0.25, 0.05]
        : [9 * Math.PI, -8 * Math.PI, 0.125, -0.25],
    simTime: 42.5,
    seed: -123456789,
    hash: 'original-hash'
  };
}
const options = { durationSeconds: 0.02 };
function confirmed(source: unknown) {
  const preview = previewLegacyMigration(JSON.stringify(source), options);
  expect(preview.status, JSON.stringify(preview.issues)).toBe('ready');
  const result = confirmLegacyMigration(preview, preview.id);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

describe('S28 explicit source-preserving legacy restart migration', () => {
  it.each(['double', 'compound-double', 'triple'] as const)(
    '%s preserves physical inputs, winding, time and exact signed seed',
    (system) => {
      const source = fixture(system),
        before = structuredClone(source),
        canonical = confirmed(source);
      expect(canonical.systemId).toBe(`system:${system}`);
      expect(canonical.runtime).toEqual({
        domain: 'time',
        start: { value: 42.5, unit: 's' },
        duration: { value: 0.02, unit: 's' },
        step: { value: 0.002, unit: 's' },
        sampleEvery: 1
      });
      expect(canonical.seed).toEqual({
        value: '-123456789',
        generator: 'legacy-session-seed',
        generatorVersion: 'unversioned'
      });
      const config = system === 'triple' ? fromCanonicalChain(canonical) : fromCanonicalPlanar(canonical);
      expect(config.ok).toBe(true);
      if (!config.ok) throw new Error('adapter');
      expect(config.value.initialState).toEqual(source.state);
      expect(config.value.gamma).toBe(source.damping);
      expect(config.value.startTime).toBe(source.simTime);
      const serialized = serializeExperiment(canonical);
      expect(serialized.ok).toBe(true);
      if (serialized.ok) expect(parseExperiment(serialized.value)).toEqual({ ok: true, value: canonical });
      expect(source).toEqual(before);
    }
  );

  it.each(['double', 'triple'] as const)(
    'reads historical v10 %s without pretending it is the compound model',
    (system) => {
      const source = { ...fixture(system), schemaVersion: 'pendulum-session/v10-ts' };
      const preview = previewLegacyMigration(JSON.stringify(source), options);
      expect(preview.status).toBe('ready');
      expect(preview.warnings.join(' ')).toContain('v10');
      expect(preview.canonical?.systemId).toBe(`system:${system}`);
      expect(preview.summary.join(' ')).toContain('pendulum-session/v10-ts');
    }
  );

  it.each([null, 0, -1, 0xffffffff, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])(
    'retains seed %s without uint32 coercion',
    (seed) => {
      const canonical = confirmed({ ...fixture(), seed });
      expect(canonical.seed?.value).toBe(seed === null ? undefined : String(seed));
    }
  );

  it.each(['double', 'compound-double', 'triple'] as const)(
    '%s executes the migrated restart through the unchanged native stepper',
    (system) => {
      for (const [method, stepper] of [
        ['rk4', rk4Step],
        ['rk2', rk2Step],
        ['euler', eulerStep]
      ] as const) {
        const source = { ...fixture(system), method },
          canonical = confirmed(source);
        const state = Float64Array.from(source.state),
          next = new Float64Array(state.length);
        const rhs =
          system === 'triple'
            ? (input: Float64Array, output: Float64Array) =>
                rhsTriple(
                  input,
                  {
                    ...source.parameters,
                    m3: source.parameters.m3!,
                    l3: source.parameters.l3!
                  },
                  source.damping,
                  output
                )
            : system === 'double'
              ? createDoublePendulumDerivative(source.parameters, source.damping)
              : createCompoundDoublePendulumDerivative(source.parameters, source.damping);
        stepper(state, source.dt, rhs, next);
        if (system === 'triple') {
          const config = fromCanonicalChain(canonical);
          if (!config.ok) throw new Error('chain');
          expect(createChainSimulation(config.value).step().state).toEqual(Array.from(next));
        } else {
          const config = fromCanonicalPlanar(canonical);
          if (!config.ok) throw new Error('planar');
          expect(createPlanarSimulation(config.value).step().state).toEqual(Array.from(next));
        }
      }
    }
  );

  it('retains exact supplied text including BOM, CRLF, whitespace and escaped Unicode before and after confirmation', () => {
    const raw = `\uFEFF  ${JSON.stringify(fixture(), null, 2).replaceAll('\n', '\r\n')}\r\n`;
    const preview = previewLegacyMigration(raw, options);
    expect(preview.status).toBe('ready');
    expect(exportLegacyMigrationBackup(preview)).toEqual({
      fileName: `${preview.id}-original.txt`,
      mediaType: 'text/plain;charset=utf-8',
      text: raw
    });
    expect(new TextEncoder().encode(exportLegacyMigrationBackup(preview).text)).toEqual(new TextEncoder().encode(raw));
    expect(confirmLegacyMigration(preview, preview.id).ok).toBe(true);
    expect(preview.sourceText).toBe(raw);
    expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
  });

  it('makes restart horizon, output sampling and backup-only metadata explicit', () => {
    const raw = JSON.stringify({ ...fixture(), parameters: { ...fixture().parameters, m3: 2, l3: 0.7 } });
    const preview = previewLegacyMigration(raw, options);
    expect(preview.status).toBe('ready');
    expect(preview.summary.join(' ')).toContain('0.02 s');
    expect(preview.summary.join(' ')).toContain('매 step 1개');
    for (const field of ['mode=research', 'stepsPerFrame=8', 'hash=original-hash', 'tolerance=1e-7', 'm3/l3', 'resume'])
      expect(preview.warnings.join(' ')).toContain(field);
    expect(preview.canonical?.integrator.settings).toEqual({});
    expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
  });

  it('requires an issued frozen ready preview and the matching explicit confirmation ID', () => {
    const preview = previewLegacyMigration(JSON.stringify(fixture()), options);
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.canonical?.parameters)).toBe(true);
    expect(confirmLegacyMigration(preview, 'other-preview').ok).toBe(false);
    expect(confirmLegacyMigration(structuredClone(preview), preview.id).ok).toBe(false);
    const first = confirmLegacyMigration(preview, preview.id),
      second = confirmLegacyMigration(preview, preview.id);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value).toEqual(second.value);
      expect(first.value).not.toBe(second.value);
      expect(first.value.parameters).not.toBe(second.value.parameters);
    }
    expect(previewLegacyMigration(preview.sourceText, options).id).toBe(preview.id);
    expect(previewLegacyMigration(preview.sourceText, { durationSeconds: 1 }).id).not.toBe(preview.id);
  });

  it('never accesses or writes browser storage during preview, backup or confirmation', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('forbidden');
      }),
      setItem: vi.fn(() => {
        throw new Error('forbidden');
      })
    };
    vi.stubGlobal('localStorage', storage);
    try {
      const preview = previewLegacyMigration(JSON.stringify(fixture()), options);
      expect(confirmLegacyMigration(preview, preview.id).ok).toBe(true);
      exportLegacyMigrationBackup(preview);
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('S28 modern run snapshot restart boundary', () => {
  function run() {
    const source = fixture();
    return runJson(
      {
        system: 'double',
        method: 'rk4',
        dt: source.dt,
        gamma: source.damping,
        parameters: source.parameters,
        initialState: [0.5, 0.25, 0, 0],
        tolerance: source.tolerance
      },
      source.state,
      source.simTime,
      12,
      0.001,
      { mode: source.mode, stepsPerFrame: source.stepsPerFrame, seed: source.seed, hash: source.hash, locale: 'ko' }
    );
  }
  it('reads the actual runJson exporter and keeps its original results as backup-only data', () => {
    const source = run(),
      raw = JSON.stringify(source),
      preview = previewLegacyMigration(raw, options);
    expect(preview.sourceKind).toBe('modern-run');
    expect(preview.status).toBe('ready');
    expect(preview.warnings.join(' ')).toContain('기존 initialState');
    expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
    expect(preview.canonical?.initialConditions.theta1).toEqual({
      kind: 'scalar',
      value: source.finalState[0],
      unit: 'rad'
    });
  });
  it.each(Object.keys(fixture()))('fails recoverably when nested snapshot omits %s', (field) => {
    const source = run(),
      nested = { ...source.runtimeSnapshot } as Record<string, unknown>;
    delete nested[field];
    const raw = JSON.stringify({ ...source, runtimeSnapshot: nested });
    expect(() => previewLegacyMigration(raw, options)).not.toThrow();
    const preview = previewLegacyMigration(raw, options);
    expect(preview.status).toBe('recovery-required');
    expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
  });
  it.each([
    { system: 'triple' },
    { method: 'euler' },
    { dt: 0.003 },
    { gamma: 0.2 },
    { simTime: 0 },
    { physicalModel: 'uniform-rigid-rods' },
    { finalState: [0, 0, 0, 0] },
    { parameters: { m1: 3 } },
    { runtimeSnapshot: [] },
    { runtimeSnapshot: null },
    { runtimeSnapshot: { state: {} } },
    { unexpected: 1 }
  ])('refuses inconsistent or hostile run metadata %j', (patch) => {
    const raw = JSON.stringify({ ...run(), ...patch });
    const preview = previewLegacyMigration(raw, options);
    expect(preview.status).toBe('recovery-required');
    expect(confirmLegacyMigration(preview, preview.id).ok).toBe(false);
    expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
  });
});

describe('S28 unsupported and hostile input recovery', () => {
  it.each([
    { schemaVersion: 'pendulum-session/v12-ts' },
    { schemaVersion: 'pendulum-session/v9-ts' },
    { method: 'verlet' },
    { method: 'leapfrog' },
    { method: 'dopri5' },
    { method: 'bdf2' },
    { systemType: 'spherical' },
    { mode: null },
    { hash: 123 },
    { seed: Number.MAX_SAFE_INTEGER + 1 },
    { state: [0, 1, 2] },
    { state: [1e7, 0, 0, 0] },
    { parameters: { ...fixture().parameters, m1: 1e5 } },
    { dt: 1e-12 },
    { unexpected: 1 },
    { schemaVersion: 'pendulum-session/v10-ts', systemType: 'compound-double' }
  ])('keeps source on unrepresentable session %j', (patch) => {
    const raw = JSON.stringify({ ...fixture(), ...patch }),
      preview = previewLegacyMigration(raw, options);
    expect(preview.status).toBe('recovery-required');
    expect(preview.canonical).toBeNull();
    expect(preview.issues.length).toBeGreaterThan(0);
    expect(preview.issues.every((entry) => entry.recovery === 'keep-original')).toBe(true);
    expect(confirmLegacyMigration(preview, preview.id).ok).toBe(false);
    expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
  });
  it.each([undefined, 0, -1, NaN, Infinity, 10000])(
    'does not invent or clamp restart duration %s',
    (durationSeconds) => {
      const preview = previewLegacyMigration(
        JSON.stringify(fixture()),
        durationSeconds === undefined ? undefined : { durationSeconds }
      );
      expect(preview.status).toBe('recovery-required');
    }
  );
  it.each([
    '{"schemaVersion":"pendulum-session/v11-ts","state":[],"state":[]}',
    '{"a":1,"\\u0061":2}',
    '{"__proto__":{"polluted":true}}',
    '{"nested":{"constructor":{}}}',
    '{"prototype":[]}',
    '{"a":1e999}',
    '{"a":-0}',
    '{broken',
    `${'['.repeat(30)}0${']'.repeat(30)}`,
    'x'.repeat(256 * 1024 + 1),
    JSON.stringify({ state: [1], text: '😀'.repeat(70000) })
  ])('returns a recoverable untouched backup for malformed/resource-limited input', (raw) => {
    const preview = previewLegacyMigration(raw, options);
    expect(preview.status).toBe('recovery-required');
    expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it.each([1, 2, 3, 4])('recognizes share v%i but refuses incomplete execution/ensemble/workflow migration', (v) => {
    const hash = `#experiment=${encodeBase64UrlText(JSON.stringify({ v, physics: { system: 'double' } }))}`;
    for (const raw of [hash, `https://example.test/app.html?th1=0.2${hash}`]) {
      const preview = previewLegacyMigration(raw, options);
      expect(preview.sourceKind).toBe('legacy-share');
      expect(preview.status).toBe('recovery-required');
      expect(preview.issues[0]?.code).toBe('legacy-share-recovery-required');
      expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
    }
  });
  it.each([
    '#experiment=%%%%',
    '#experiment=wA',
    `#experiment=${encodeBase64UrlText('{"v":4,"v":1}')}`,
    `#experiment=${encodeBase64UrlText('{"v":999}')}`,
    `#experiment=${encodeBase64UrlText('{"v":4,"__proto__":{}}')}`,
    `#experiment=${'a'.repeat(8193)}`
  ])('rejects corrupted shared payloads without running the lossy decoder', (raw) => {
    const preview = previewLegacyMigration(raw, options);
    expect(preview.status).toBe('recovery-required');
    expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
  });
  it.each([
    ['workspace', JSON.stringify({ schemaVersion: 'pendulum-workspace/v1', research: {} })],
    ['research', JSON.stringify({ schemaVersion: 'pendulum-research-db/v1', stores: {} })],
    ['research', JSON.stringify({ schemaVersion: 'pendulum-research-workbench/v4', research: {} })],
    ['legacy-url', 'https://example.test/app.html?sysType=triple&w1=0.123&method=leapfrog'],
    ['expansion', 'https://example.test/app.html#expansion=original'],
    ['legacy-url', 'https://example.test/app.html?tab=research#a-section']
  ])('gives explicit recovery for %s while retaining its complete source', (kind, raw) => {
    const preview = previewLegacyMigration(raw!, options);
    expect(preview.sourceKind).toBe(kind);
    expect(preview.status).toBe('recovery-required');
    expect(exportLegacyMigrationBackup(preview).text).toBe(raw);
  });
  it('does not evaluate programmatic accessors at the internal session boundary', () => {
    let calls = 0;
    const source = {
      ...fixture(),
      get method() {
        calls++;
        return 'rk4';
      }
    };
    expect(migrateLegacySession(source, 1, 'fixture').ok).toBe(false);
    expect(calls).toBe(0);
  });
  it('refuses backup export from fabricated preview objects', () => {
    expect(() => exportLegacyMigrationBackup({} as LegacyMigrationPreview)).toThrow(/issued/);
  });
});
