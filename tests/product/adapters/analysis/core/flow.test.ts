import { describe, expect, it } from 'vitest';
import { lyapunovSpectrum } from '../../../../../src/chaos/lyapunov';
import { saliIndicator, fliIndicator } from '../../../../../src/chaos/indicators';
import { poincareSection } from '../../../../../src/chaos/poincare';
import { shadowingHorizon } from '../../../../../src/chaos/shadowing';
import { createDiagnosticFlow } from '../../../../../src/product/adapters/analysis/core/source';
import { runCoreDiagnostic } from '../../../../../src/product/adapters/analysis/core/execute';
import type { CoreDiagnosticProgress } from '../../../../../src/product/adapters/analysis/core/contracts';
import { request } from './fixture';

describe('S18 native continuous core diagnostics parity', () => {
  it('preserves the entire spectrum, uncertainties, tangent trust, and physical work progress', () => {
    const r = request('lyapunov'),
      flow = createDiagnosticFlow(r.experiment),
      events: CoreDiagnosticProgress[] = [];
    const result = runCoreDiagnostic(r, (event) => events.push(event));
    const native = lyapunovSpectrum(flow.initial, flow.rhs, 4, {
      dt: 0.01,
      steps: 200,
      transientSteps: 0,
      renormEvery: 10,
      seed: 40503,
      method: 'rk4'
    });
    expect(result.details).toMatchObject(native);
    expect(result.rows.map((row) => row[1])).toEqual(native.spectrum);
    expect(events.at(-1)).toMatchObject({ phase: 'complete', fraction: 1 });
    expect(events.at(-1)!.work).toBeGreaterThan(0);
    expect(events.filter((event) => event.phase === 'calculating').every((event) => event.fraction === null)).toBe(
      true
    );
    expect(events.every((event, i) => i === 0 || event.work >= events[i - 1]!.work)).toBe(true);
  });
  for (const kind of ['sali', 'fli'] as const)
    it(`preserves ${kind.toUpperCase()} values and native timestamp convention`, () => {
      const r = request(kind),
        flow = createDiagnosticFlow(r.experiment),
        options = { dt: 0.01, steps: 200, transientSteps: 0, seed: 40503, sampleEvery: 10 };
      const native =
        kind === 'sali'
          ? saliIndicator(flow.initial, flow.rhs, options)
          : fliIndicator(flow.initial, flow.rhs, options);
      const result = runCoreDiagnostic(r);
      expect(result.details).toEqual(native);
      expect(result.rows[0]![0]).toBe(0);
      expect(result.warnings.join(' ')).toContain('첫 step 뒤');
    });
  it('retains refined Poincare root certification and every crossing', () => {
    const r = request('poincare'),
      flow = createDiagnosticFlow(r.experiment),
      result = runCoreDiagnostic(r);
    const native = poincareSection(flow.initial, flow.rhs, {
      dt: 0.01,
      maxTime: 2,
      section: (s) => s[0]!,
      direction: 'both',
      transientCrossings: 0,
      maxPoints: 512,
      rootTol: 1e-9
    });
    expect(result.details).toMatchObject({ ...native, points: native.points.map((p) => Array.from(p)) });
  });
  it('keeps native reference uncertainty while encoding horizon non-exceedance explicitly', () => {
    const r = request('shadowing');
    r.settings.duration = 0.1;
    const flow = createDiagnosticFlow(r.experiment),
      result = runCoreDiagnostic(r);
    const native = shadowingHorizon(flow.initial, flow.rhs, {
      dt: 0.01,
      T: 0.1,
      threshold: 0.001,
      method: 'rk4',
      referenceMethod: 'gbs',
      referenceDt: 0.01 / 8,
      sampleEvery: 10,
      estimateReferenceUncertainty: true
    });
    expect(result.details).toMatchObject({
      ...native,
      horizon: null,
      possibleHorizon: null,
      certifiedHorizon: null,
      nullHorizonMeaning: 'threshold-not-exceeded-within-observation-window'
    });
    expect(result.summary).toContain('넘지 않았습니다');
  });
  it('refuses work budgets and invalid dimension/renormalization settings before computation', () => {
    const r = request('lyapunov');
    r.settings.duration = 300;
    r.settings.transient = 300;
    if (r.experiment.runtime.domain !== 'time') throw new Error('time fixture');
    r.experiment = { ...r.experiment, runtime: { ...r.experiment.runtime, step: { value: 0.001, unit: 's' } } };
    expect(() => runCoreDiagnostic(r)).toThrow('100000');
    r.settings.duration = 0.01;
    r.settings.transient = 0;
    r.settings.renormEvery = 11;
    expect(() => runCoreDiagnostic(r)).toThrow('재규격화');
    r.settings.renormEvery = 1;
    r.settings.count = 5;
    expect(() => runCoreDiagnostic(r)).toThrow('지수 수');
  });
});
