import { describe, expect, it } from 'vitest';
import { fftInPlace } from '../../../../../src/physics/fft';
import { naffDecompose } from '../../../../../src/chaos/naff';
import { zeroOneTest } from '../../../../../src/chaos/zeroOneTest';
import { runCoreDiagnostic } from '../../../../../src/product/adapters/analysis/core/execute';
import { coreDiagnosticRejection } from '../../../../../src/product/adapters/analysis/core/settings';
import { request, signalSeries } from './fixture';

describe('S18 observed core diagnostics and native parity', () => {
  it('projects state and phase without changing samples or pretending to have canonical momenta', () => {
    const r = request('state-time'),
      original = structuredClone(r);
    const state = runCoreDiagnostic(r);
    expect(state.rows).toEqual(r.series.times.map((t, i) => [t, r.series.states[i]![0]]));
    const phase = runCoreDiagnostic({ ...r, kind: 'phase', settings: { coordinate: 0, phaseCoordinate: 1 } });
    expect(phase.rows).toEqual(r.series.states.map((row) => row.map((x) => (Object.is(x, -0) ? 0 : x))));
    expect(phase.warnings.join(' ')).toContain('정준');
    expect(r).toEqual(original);
  });
  it('keeps real energy units and physical loss warnings', () => {
    const r = request('energy');
    r.series.energy = r.series.times.map((t) => 3 - 0.1 * t);
    r.series.energyUnit = 'normalized';
    const result = runCoreDiagnostic(r);
    expect(result.units).toEqual(['s', 'normalized', 'normalized']);
    expect(result.rows.at(-1)![2]).toBe(r.series.energy.at(-1)! - 3);
    expect(result.warnings.join(' ')).toContain('물리적 일');
  });
  it('uses preserved physics FFT coefficients and reports an analytic real-tone amplitude', () => {
    const r = request('fft');
    const result = runCoreDiagnostic(r),
      details = result.details as Record<string, unknown>;
    const mean = r.series.states.reduce((a, b) => a + b[0]!, 0) / 128;
    const re = Float64Array.from(
        r.series.states,
        (s, i) => (s[0]! - mean) * 0.5 * (1 - Math.cos((2 * Math.PI * i) / 128))
      ),
      im = new Float64Array(128);
    fftInPlace(re, im);
    expect(details.real).toEqual(Array.from(re));
    expect(details.imaginary).toEqual(Array.from(im));
    const peak = result.rows.reduce((a, b) => (b[1]! > a[1]! ? b : a));
    expect(peak[0]).toBeCloseTo(0.625, 12);
    expect(peak[1]).toBeCloseTo(1, 12);
    expect(result.units[0]).toBe('Hz');
  });
  it('preserves exact native NAFF components and angular-frequency units', () => {
    const r = request('naff'),
      values = r.series.states.map((s) => s[0]!);
    const result = runCoreDiagnostic(r);
    expect((result.details as Record<string, unknown>).components).toEqual(
      naffDecompose(
        values,
        values.map(() => 0),
        0.1,
        3,
        { refineIterations: 80 }
      )
    );
    expect(result.units[0]).toBe('rad/s');
    expect(result.warnings.join(' ')).toContain('±주파수');
  });
  it('preserves the native seeded 0–1 estimate and its bootstrap uncertainty', () => {
    const r = request('zero-one'),
      result = runCoreDiagnostic(r),
      data = result.details as Record<string, unknown>;
    const native = zeroOneTest(
      r.series.states.map((s) => s[0]!),
      { cSamples: 32, ncutFraction: 0.1, seed: 257 }
    );
    expect(data).toMatchObject(native);
    expect(result.warnings.join(' ')).toContain('잡음');
    expect(runCoreDiagnostic(r)).toEqual(result);
  });
  it('refuses a shortened final interval and does not silently interpolate', () => {
    const r = request('fft');
    r.series.times[r.series.times.length - 1] = r.series.times.at(-2)! + 0.025;
    expect(() => runCoreDiagnostic(r)).toThrow('균일하지');
    expect(coreDiagnosticRejection(r.kind, r.experiment, r.series, r.settings)).toContain('자동 보간하지');
  });
  it('rejects insufficient/malformed/oversized inputs with a recoverable reason', () => {
    expect(() => runCoreDiagnostic(request('naff', { series: signalSeries(3) }))).toThrow('최소 4');
    expect(() => runCoreDiagnostic(request('zero-one', { series: signalSeries(19) }))).toThrow('최소 20');
    expect(() => runCoreDiagnostic(request('fft', { series: signalSeries(8193) }))).toThrow('8192');
    expect(() => runCoreDiagnostic(request('energy'))).toThrow('에너지 관측');
    const r = request('fft');
    r.series.states[1]![0] = NaN;
    expect(() => runCoreDiagnostic(r)).toThrow('유한한');
    const duplicate = request('fft');
    duplicate.series.times[2] = duplicate.series.times[1]!;
    expect(() => runCoreDiagnostic(duplicate)).toThrow('엄격히 증가');
    expect(() =>
      runCoreDiagnostic(request('fft', { settings: { coordinate: 0, transient: 0, window: 'hann', ignored: 1 } }))
    ).toThrow('지원하지 않는');
  });
});
