import { describe, expect, it } from 'vitest';
import { arrheniusMTTF } from '../../../src/physics/kramersEscape';
import {
  diatomicBandGap,
  diatomicDispersionCurve,
  diatomicGroupVelocity
} from '../../../src/physics/latticeDispersion';
import { peierlsNabarroBarrier } from '../../../src/physics/sineGordon';
import {
  defaultFieldDiagnosticSettings,
  evaluateFieldDiagnostic,
  fieldDiagnosticDefinition,
  serializeFieldDiagnosticArtifact,
  type FieldDiagnosticId
} from '../../../src/product/lab/views/field-diagnostics';

describe('S16 bounded independent native diagnostic controls', () => {
  it.each([
    ['system:lattice-fk-limit', 'diatomic'],
    ['system:frenkel-kontorova', 'pinning'],
    ['system:langevin', 'arrhenius']
  ])('shows compatible %s independent diagnostic %s', (system, id) => {
    expect(fieldDiagnosticDefinition(system)?.id).toBe(id);
    expect(fieldDiagnosticDefinition(system)?.caveat).toContain('독립');
  });
  it('does not attach incompatible diagnostics to FPUT, continuum fields or unrelated systems', () => {
    for (const id of ['system:fput', 'system:sine-gordon', 'system:double', 'system:quantum-kicked-rotor'])
      expect(fieldDiagnosticDefinition(id)).toBeUndefined();
  });
  it('matches native diatomic branches, band gap and finite-difference group velocity', () => {
    const values = defaultFieldDiagnosticSettings('diatomic'),
      { samples, ...parameters } = values,
      nativeParameters = {
        massA: parameters.massA!,
        massB: parameters.massB!,
        forceConstant: parameters.forceConstant!,
        latticeConstant: parameters.latticeConstant!,
        onsiteOmegaSq: parameters.onsiteOmegaSq!
      },
      result = evaluateFieldDiagnostic('diatomic', values),
      native = diatomicDispersionCurve(nativeParameters, samples),
      gap = diatomicBandGap(nativeParameters);
    expect(result.rows).toEqual(native.map((row) => [row.k, row.acoustic, row.optical]));
    expect(result.settings).toEqual(values);
    expect(result.settings).not.toBe(values);
    expect(result.summary[0]).toContain(gap.gap.toPrecision(9));
    expect(result.summary[1]).toContain(
      diatomicGroupVelocity(Math.PI / 2, nativeParameters, 'acoustic').toPrecision(9)
    );
    expect(result.columns).toEqual(['k (m⁻¹)', 'ω acoustic (rad/s)', 'ω optical (rad/s)']);
  });
  it('treats equal-mass gap closure and pinned long-wave speed honestly', () => {
    const values = defaultFieldDiagnosticSettings('diatomic'),
      equal = evaluateFieldDiagnostic('diatomic', { ...values, massB: 1 });
    expect(equal.summary[0]).toContain('gap 0 rad/s');
    const pinned = evaluateFieldDiagnostic('diatomic', { ...values, onsiteOmegaSq: 1 });
    expect(pinned.summary[2]).toContain('공식을 적용하지 않습니다');
  });
  it('matches native site/bond pinning energies and flags bounded Newton nonconvergence', () => {
    const values = defaultFieldDiagnosticSettings('pinning'),
      result = evaluateFieldDiagnostic('pinning', values),
      native = peierlsNabarroBarrier(values.coupling!, {
        sites: values.sites!,
        maxIterations: values.maxIterations!,
        tolerance: values.tolerance!
      });
    expect(result.rows[0]?.[1]).toBe(native.siteEnergy);
    expect(result.rows[1]?.[1]).toBe(native.bondEnergy);
    expect(result.summary[0]).toContain(native.barrier.toPrecision(9));
    expect(evaluateFieldDiagnostic('pinning', { ...values, maxIterations: 1, tolerance: 1e-12 }).summary[1]).toContain(
      '수렴 미확인'
    );
    expect(() => evaluateFieldDiagnostic('pinning', { ...values, sites: 80 })).toThrow(/홀수/);
  });
  it('matches native Arrhenius values and explicitly reports overflow limits', () => {
    const values = defaultFieldDiagnosticSettings('arrhenius'),
      result = evaluateFieldDiagnostic('arrhenius', values);
    expect(result.rows).toEqual([[arrheniusMTTF(values.attemptRate!, values.activationEnergy!, values.kT!)]]);
    expect(evaluateFieldDiagnostic('arrhenius', { ...values, activationEnergy: 1e6, kT: 1e-12 }).rows).toEqual([
      [Infinity]
    ]);
    expect(evaluateFieldDiagnostic('arrhenius', { ...values, activationEnergy: 1e6, kT: 1e-12 }).summary[0]).toContain(
      '부동소수점 상한'
    );
    expect(evaluateFieldDiagnostic('arrhenius', { ...values, activationEnergy: 0 }).rows).toEqual([[1]]);
  });
  it('exports independent diagnostic settings, units and explicit numeric limits without null loss', () => {
    const values = { ...defaultFieldDiagnosticSettings('arrhenius'), activationEnergy: 1e6, kT: 1e-12 },
      result = evaluateFieldDiagnostic('arrhenius', values),
      json = serializeFieldDiagnosticArtifact(result),
      artifact = JSON.parse(json);
    expect(artifact.schemaVersion).toBe('pendulum-field-diagnostic/v1');
    expect(artifact.scope).toBe('independent-native-diagnostic');
    expect(artifact.source).toBe('arrheniusMTTF');
    expect(artifact.settings).toEqual(values);
    expect(artifact.settingsUnits.activationEnergy).toBe('정규화 에너지');
    expect(artifact.rows).toEqual([['positive-infinity']]);
    expect(artifact.rows.flat()).not.toContain(null);
  });
  it.each(['diatomic', 'pinning', 'arrhenius'] as const)(
    '%s rejects missing, extra, nonfinite and unsafe numeric settings',
    (id) => {
      const defaults = defaultFieldDiagnosticSettings(id),
        firstKey = Object.keys(defaults)[0]!;
      for (const settings of [
        {},
        { ...defaults, extra: 1 },
        { ...defaults, [firstKey]: NaN },
        { ...defaults, [firstKey]: Infinity },
        { ...defaults, [firstKey]: -1 }
      ]) {
        const before = structuredClone(settings);
        expect(() => evaluateFieldDiagnostic(id, settings)).toThrow();
        expect(settings).toEqual(before);
      }
    }
  );
  it.each([
    ['diatomic', { samples: 129 }],
    ['diatomic', { samples: 2.5 }],
    ['diatomic', { massA: 0 }],
    ['diatomic', { latticeConstant: 1e-30 }],
    ['pinning', { sites: 129 }],
    ['pinning', { maxIterations: 201 }],
    ['pinning', { maxIterations: 0 }],
    ['pinning', { coupling: 0 }],
    ['arrhenius', { attemptRate: 0 }],
    ['arrhenius', { activationEnergy: -1 }],
    ['arrhenius', { kT: 0 }]
  ] as const)('rejects bounded %s settings %j', (id, invalid) => {
    expect(() =>
      evaluateFieldDiagnostic(id as FieldDiagnosticId, {
        ...defaultFieldDiagnosticSettings(id as FieldDiagnosticId),
        ...invalid
      })
    ).toThrow();
  });
});
