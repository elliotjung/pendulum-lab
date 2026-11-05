import { describe, expect, it } from 'vitest';
import { frontierFocusDeclaration } from '../../../src/product/experiments/frontier-focus-definitions';
import { frontierFocusCanonical, frontierFocusConfig } from '../../../src/product/experiments/frontier-focus-config';
import { executeFrontierFocus } from '../../../src/product/experiments/frontier-focus-science';
import { linearizedDensityMoments } from '../../../src/product/experiments/frontier-focus-field';
import { twistedFkEquilibrium, twistedFkImpulseConfig } from '../../../src/product/experiments/frontier-focus-fk';
import { createFieldSimulation } from '../../../src/product/adapters/physics/field';
import { buildCouplingMatrix, rhsPendulumNetwork } from '../../../src/physics/pendulumNetwork';
import { createSineGordonField, stepSineGordon } from '../../../src/physics/sineGordon';
import { fromCanonicalNetwork, toCanonicalNetwork } from '../../../src/product/adapters/physics/network';
import { fromCanonicalField, toCanonicalField } from '../../../src/product/adapters/physics/field';
import { fromCanonicalDiscrete, toCanonicalDiscrete } from '../../../src/product/adapters/physics/discrete';
const preset = (id: string) => Object.fromEntries(frontierFocusDeclaration(id).fields.map((f) => [f.id, f.value]));
const metric = (id: string, name: string, override: Record<string, number> = {}) =>
  executeFrontierFocus(id, { ...preset(id), ...override }).metrics.find((m) => m.id === name)!.value;
const ids = Array.from({ length: 13 }, (_, i) => `7.${i + 1}`);
describe('S27 native network, stochastic, lattice, field and quantum Focus experiments', () => {
  it.each(ids)('%s executes actual bounded native calculations without mutating inputs', (id) => {
    const fields = preset(id),
      before = structuredClone(fields),
      p: number[] = [];
    const result = executeFrontierFocus(id, fields, (x) => p.push(x));
    expect(fields).toEqual(before);
    expect(result.unitId).toBe(id);
    expect(result.metrics.length).toBeGreaterThan(0);
    expect(result.metrics.every((m) => Number.isFinite(m.value))).toBe(true);
    expect(result.charts.length).toBeGreaterThan(0);
    expect(p.every((x, i) => x >= 0 && x <= 1 && x >= (p[i - 1] ?? 0))).toBe(true);
    expect(p.at(-1)).toBe(1);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it.each(ids)('%s preserves exact native configuration through canonical round trip', (id) => {
    const fields = preset(id),
      s = frontierFocusConfig(id, fields),
      canonical = frontierFocusCanonical(id, fields);
    const back =
      s.family === 'network'
        ? fromCanonicalNetwork(canonical)
        : s.family === 'field'
          ? fromCanonicalField(canonical)
          : fromCanonicalDiscrete(canonical);
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error('Native round trip failed.');
    const again =
      s.family === 'network'
        ? toCanonicalNetwork(back.value as never)
        : s.family === 'field'
          ? toCanonicalField(back.value as never)
          : toCanonicalDiscrete(back.value as never);
    expect(again).toEqual({ ok: true, value: canonical });
  });
  it('rejects unsafe nonfinite, fractional, missing, unknown and hidden settings before calculation', () => {
    for (const override of [{ noise: NaN }, { members: 9.5 }, { duration: 30 }, { unknown: 1 }, { step: 0.02 }])
      expect(() => executeFrontierFocus('7.7', { ...preset('7.7'), ...override })).toThrow();
    expect(() => frontierFocusDeclaration('7.14')).toThrow();
    const { noise: _noise, ...missing } = preset('7.7');
    expect(() => executeFrontierFocus('7.7', missing)).toThrow();
  });
  it('7.2 exactly recovers the uncoupled mode frequency and nonlinear small-angle limit', () => {
    const result = executeFrontierFocus('7.2', { ...preset('7.2'), coupling: 0, amplitude: 0.01 });
    expect(result.tables[0]!.rows.every((r) => Math.abs(Number(r[1]) - 9.81) < 1e-13)).toBe(true);
    expect(result.metrics.find((m) => m.id === 'linear-error')!.value).toBeLessThan(2e-6);
  });
  it('7.3 follows the native positive-coupling locking prediction and rejects a false locking claim at K=0', () => {
    const result = executeFrontierFocus('7.3', preset('7.3'));
    const row = result.tables.find((t) => t.id === 'locking')!.rows;
    expect(Number(row[0]![1])).toBeCloseTo(Math.asin(0.2), 12);
    expect(Math.abs(Number(row[1]![1]) - Math.asin(0.2))).toBeLessThan(0.001);
    const free = executeFrontierFocus('7.3', { ...preset('7.3'), coupling: 0 });
    expect(free.tables.find((t) => t.id === 'locking')!.rows[0]![1]).toBe('해당 해 없음');
  });
  it('7.6 preserves deterministic independent seed streams and zero-noise collapse', () => {
    const fields = preset('7.6'),
      a = executeFrontierFocus('7.6', fields),
      b = executeFrontierFocus('7.6', fields);
    expect(a).toEqual(b);
    expect(metric('7.6', 'theta-variance', { noise: 0 })).toBe(0);
    expect(metric('7.6', 'theta-variance', { seed: 24 })).not.toBe(
      a.metrics.find((m) => m.id === 'theta-variance')!.value
    );
  });
  it('7.7 analytic Kramers covariance has the exact zero-damping limit and early-time variance', () => {
    expect(linearizedDensityMoments(1, 0, 0.2).variance).toBeCloseTo(0.04 * (0.5 - Math.sin(2) / 4), 13);
    expect(linearizedDensityMoments(0, 0.2, 0.2)).toEqual({ mean: 0.1, variance: 0 });
    expect(linearizedDensityMoments(0.001, 0.2, 0.2).variance / ((0.04 * 1e-9) / 3)).toBeCloseTo(1, 3);
    expect(() => linearizedDensityMoments(1, 3, 0.2)).toThrow();
    const result = executeFrontierFocus('7.7', preset('7.7'));
    const actual = result.metrics.find((m) => m.id === 'theta-variance')!.value,
      predicted = result.metrics.find((m) => m.id === 'fp-variance')!.value;
    expect(actual / predicted).toBeGreaterThan(0.5);
    expect(actual / predicted).toBeLessThan(1.6);
    expect(result.warnings.join(' ')).toContain('선형화');
  });
  it('7.8 resolves weak quartic mode leakage and 7.9 has exact zero-coupling localization', () => {
    expect(metric('7.8', 'minimum-mode-fraction', { alpha: 0 })).toBeGreaterThan(0.99);
    expect(metric('7.9', 'participation', { coupling: 0 })).toBeCloseTo(1, 13);
  });
  it('7.10 distinguishes kink charge from breather/collision and respects continuum accuracy', () => {
    expect(metric('7.10', 'charge')).toBeGreaterThan(0.999);
    expect(Math.abs(metric('7.10', 'charge', { scenario: 1 }))).toBeLessThan(1e-10);
    expect(Math.abs(metric('7.10', 'charge', { scenario: 2 }))).toBeLessThan(1e-10);
    expect(metric('7.10', 'continuum-error')).toBeLessThan(0.15);
  });
  it('7.11 resolves finite commensurate/misfit impulse transport while retaining PN and convergence limits', () => {
    const result = executeFrontierFocus('7.11', preset('7.11'));
    expect(result.metrics.find((m) => m.id === 'stationary-residual')!.value).toBeLessThan(1e-8);
    expect(result.metrics.find((m) => m.id === 'pn-barrier')!.value).toBeGreaterThan(0);
    const rows = result.tables.find((t) => t.id === 'impulse-depinning')!.rows;
    expect(rows.filter((r) => r[1] === 0).every((r) => Math.abs(Number(r[2])) < 1e-7)).toBe(true);
    expect(rows.filter((r) => r[1] === 3).every((r) => Number(r[4]) > 1 && r[5] === '역치 통과')).toBe(true);
    const commensurate = rows.find((r) => r[0] === 1 && r[1] === 1)!,
      misfit = rows.find((r) => r[0] !== 1 && r[1] === 1)!;
    expect(Number(misfit[2])).toBeGreaterThan(3 * Number(commensurate[2]));
    expect(result.metrics.find((m) => m.id === 'twist-count')!.value).toBe(2);
    expect(result.metrics.find((m) => m.id === 'twist-equilibrium-residual')!.value).toBeLessThan(1e-7);
    expect(result.metrics.find((m) => m.id === 'twist-min-curvature')!.value).toBeGreaterThan(1e-6);
    expect(result.warnings.join(' ')).toContain('평균 twist');
    const failed = executeFrontierFocus('7.11', { ...preset('7.11'), maxIterations: 1 });
    expect(failed.warnings.join(' ')).toContain('허용치');
  });
  it('7.11 uses unchanged native fixed-boundary FK evolution and preserves both imposed endpoint phases', () => {
    const equilibrium = twistedFkEquilibrium(1, 0.6180339887498949, 80),
      config = twistedFkImpulseConfig(equilibrium, 1, 1, 0.2, 0.02),
      simulation = createFieldSimulation(config),
      first = simulation.snapshot();
    expect(equilibrium.converged).toBe(true);
    while (!simulation.done) {
      const s = simulation.step();
      expect(s.profile[0]).toBe(first.profile[0]);
      expect(s.profile.at(-1)).toBe(first.profile.at(-1));
    }
    expect((first.profile.at(-1)! - first.profile[0]!) / (2 * Math.PI * (first.profile.length - 1))).toBeCloseTo(
      equilibrium.twist,
      14
    );
    expect(() => twistedFkEquilibrium(1, 1.5, 80)).toThrow();
    expect(() => twistedFkImpulseConfig({ ...equilibrium, converged: false }, 1, 1, 1, 0.02)).toThrow();
  });
  it('7.11 fixed-boundary sine-Gordon acceleration equals the native finite FK interior force', () => {
    const n = 9,
      coupling = 0.7,
      dx = 1 / Math.sqrt(coupling),
      dt = 0.001,
      profile = Array.from({ length: n }, (_, i) => 2 * Math.PI * 0.618 * i + (i === 4 ? 0.1 : 0)),
      parameters = {
        masses: Array<number>(n).fill(1),
        lengths: Array<number>(n).fill(1),
        g: 1,
        coupling: buildCouplingMatrix(
          n,
          Array.from({ length: n - 1 }, (_, i) => ({ i, j: i + 1, kappa: coupling }))
        )
      },
      derivative = new Float64Array(2 * n),
      grid = createSineGordonField({
        points: n,
        length: (n - 1) * dx,
        dt,
        boundary: 'fixed',
        initial: (x) => profile[Math.min(n - 1, Math.round(x / dx))]!
      });
    rhsPendulumNetwork([...profile, ...Array<number>(n).fill(0)], parameters, derivative);
    stepSineGordon(grid);
    for (let i = 1; i < n - 1; i++)
      expect((2 * (grid.u[i]! - profile[i]!)) / (dt * dt)).toBeCloseTo(derivative[n + i]!, 7);
    const a = 2 * Math.PI * 0.618,
      restEnergy = profile.slice(1).reduce((sum, q, i) => sum + (coupling * (q - profile[i]! - a) ** 2) / 2, 0),
      zeroRestEnergy = profile.slice(1).reduce((sum, q, i) => sum + (coupling * (q - profile[i]!) ** 2) / 2, 0);
    expect(restEnergy - zeroRestEnergy).toBeCloseTo(
      -coupling * a * (profile.at(-1)! - profile[0]!) + (coupling * (n - 1) * a * a) / 2,
      12
    );
  });
  it('7.12 preserves the integrable K=0 momentum and 7.13 preserves norm without renormalization', () => {
    const map = executeFrontierFocus('7.12', { ...preset('7.12'), kick: 0 });
    expect(map.metrics.find((m) => m.id === 'momentum-displacement')!.value).toBe(0);
    expect(map.tables[0]!.rows.every((r) => r[1] === 1 && r[2] === 0)).toBe(true);
    expect(metric('7.13', 'norm-drift')).toBeLessThan(2e-13);
    expect(metric('7.13', 'quantum-momentum-square', { kick: 0 })).toBeLessThan(1e-20);
  });
});
