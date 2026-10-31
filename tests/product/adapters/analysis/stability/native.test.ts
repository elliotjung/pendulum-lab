import { describe, expect, test } from 'vitest';
import {
  defaultDrivenConfig,
  toCanonicalDriven,
  createDrivenFlow
} from '../../../../../src/product/adapters/physics/driven';
import { rk4Step } from '../../../../../src/physics/integrators';
import { drivenPeriodicOrbit } from '../../../../../src/chaos/floquet';
import { continueDrivenPeriodicOrbit } from '../../../../../src/chaos/continuation';
import { melnikovFunction } from '../../../../../src/chaos/melnikov';
import { codimTwoDiagram } from '../../../../../src/chaos/codimTwo';
import { runStability, executeStabilityJob } from '../../../../../src/product/adapters/analysis/stability/execute';
import {
  defaultStabilitySettings,
  stabilityRejection
} from '../../../../../src/product/adapters/analysis/stability/settings';
import { validateStabilityRequest } from '../../../../../src/product/adapters/analysis/stability/validation';
import type {
  StabilityKind,
  StabilityRequest,
  StabilityResult
} from '../../../../../src/product/adapters/analysis/stability/contracts';

function config(amplitude = 0.3, phase = Math.PI / 2) {
  return {
    ...defaultDrivenConfig(),
    parameters: { g: 1, length: 1, damping: 0.5 },
    initialState: [0.1, 0, 0],
    forcing: { waveform: 'sine' as const, amplitude, frequency: 2 / 3, phase }
  };
}
function request(
  kind: StabilityKind,
  changes: Record<string, number | string> = {},
  amplitude = 0.3,
  phase = Math.PI / 2
): StabilityRequest {
  const parsed = toCanonicalDriven(config(amplitude, phase));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const source = typeof changes.source === 'string' ? changes.source : undefined;
  return {
    id: 'native-test',
    kind,
    experiment: parsed.value,
    settings: { ...defaultStabilitySettings(kind, parsed.value, source), ...changes }
  };
}
function details(result: StabilityResult): Record<string, any> {
  return result.details as Record<string, any>;
}
function restart(parent: StabilityRequest, result: StabilityResult, kind = parent.kind): StabilityRequest {
  const point = result.branch.at(-1)!;
  return {
    ...parent,
    kind,
    restart: {
      artifactId: 'saved-artifact',
      inputRunId: 'saved-run',
      source: result.source,
      state: [...point.state],
      parameter: point.parameter,
      direction: details(result).restartDirection ?? 1
    }
  };
}
function finiteResult(value: unknown): void {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteResult);
}
describe('S20 native current-run stability adapters', () => {
  test('a fixed point retains the real sine phase and agrees with the original product physical flow', () => {
    const job = request('fixed-point', { tolerance: 1e-10 }, 0.3, 0.37),
      before = structuredClone(job);
    const result = runStability(job),
      point = result.branch[0]!;
    expect(result.status).toBe('converged');
    const physical = config(0.3, 0.37),
      flow = createDrivenFlow({ ...physical, initialState: [...point.state, 0] });
    const state = Float64Array.from(flow.initial),
      next = new Float64Array(3),
      period = 3 * Math.PI;
    for (let i = 0; i < 256; i++) {
      rk4Step(state, period / 256, flow.rhs, next);
      state.set(next);
    }
    expect(Math.max(Math.abs(state[0]! - point.state[0]!), Math.abs(state[1]! - point.state[1]!))).toBeLessThan(1e-9);
    expect(details(result).nativeSectionPhase).toBeCloseTo(0.37 - Math.PI / 2, 14);
    expect(result.log.at(-1)!.residual).toBeCloseTo(point.residual, 14);
    expect(job).toEqual(before);
  });
  test('phase-zero section reproduces native driven shooting and Floquet Liouville determinant', () => {
    const job = request('floquet', { tolerance: 1e-10 }),
      result = runStability(job);
    const native = drivenPeriodicOrbit(
      { g: 1, length: 1, damping: 0.5, driveAmplitude: 0.3, driveFrequency: 2 / 3 },
      [0.1, 0],
      { dt: (3 * Math.PI) / 256, tolerance: 1e-10 }
    );
    expect(result.branch[0]!.state[0]).toBeCloseTo(native.orbit[0], 7);
    expect(result.branch[0]!.state[1]).toBeCloseTo(native.orbit[1], 7);
    expect(details(result).native.determinant).toBeCloseTo(Math.exp(-0.5 * 3 * Math.PI), 6);
    expect(result.rows.every((row) => row[3]! < 1)).toBe(true);
  });
  test('periodic shooting uses the native primitive-cycle database rather than claiming a period-two fixed point', () => {
    const result = runStability(request('periodic-shooting', { period: 2 }));
    expect(result.status).toBe('converged');
    expect(details(result).database.attempts).toBe(3);
    expect(details(result).database.records[0].period).toBe(1);
    expect(result.rows[0]![0]).toBe(1);
  });
  test('Melnikov retains zero-damping undefined amplitude ratio explicitly and matches native analytic function', () => {
    const job = request('melnikov', { phaseCount: 9, intervals: 1024 });
    job.experiment = {
      ...job.experiment,
      parameters: { ...job.experiment.parameters, damping: { kind: 'scalar', value: 0, unit: 's^-1' } }
    };
    const result = runStability(job);
    expect(details(result).verdict.amplitudeRatio).toBeNull();
    expect(result.rows[0]![1]).toBeCloseTo(
      melnikovFunction(0, { g: 1, length: 1, damping: 0, driveAmplitude: 0.3, driveFrequency: 2 / 3 }),
      12
    );
    expect(Math.max(...result.rows.map((r) => r[3]!))).toBeLessThan(1e-8);
    finiteResult(result);
  });
  test('natural continuation agrees with native phase-zero continuation and restarts from a saved solution', () => {
    const job = request('continuation', { start: 0.2, end: 0.4, points: 3, tolerance: 1e-10 });
    const result = runStability(job);
    const native = continueDrivenPeriodicOrbit(
      { g: 1, length: 1, damping: 0.5, driveAmplitude: 0.3, driveFrequency: 2 / 3 },
      {
        parameter: 'driveAmplitude',
        start: 0.2,
        end: 0.4,
        step: 0.1,
        guess: [0.1, 0],
        dt: (3 * Math.PI) / 256,
        tolerance: 1e-10,
        maxIterations: 20
      }
    );
    expect(result.status).toBe('converged');
    result.branch.forEach((point, i) => {
      expect(point.state[0]).toBeCloseTo(native.branch[i]!.orbit[0], 7);
      expect(point.state[1]).toBeCloseTo(native.branch[i]!.orbit[1], 7);
    });
    const next = restart(job, result);
    next.settings = { ...next.settings, end: 0.5 };
    const continued = runStability(next);
    expect(continued.branch[0]!.parameter).toBeCloseTo(0.4, 12);
    expect(continued.branch[0]!.state).toEqual(result.branch.at(-1)!.state);
    expect(continued.branch.at(-1)!.parameter).toBe(0.5);
    expect(details(continued).restart.artifactId).toBe('saved-artifact');
    expect(next.experiment).toEqual(job.experiment);
  });
  test('saved fixed-point solution hands off to Floquet without altering the original physical experiment', () => {
    const job = request('fixed-point'),
      solution = runStability(job);
    const next = restart(job, solution, 'floquet');
    next.settings = defaultStabilitySettings('floquet', job.experiment);
    const result = runStability(next);
    expect(result.status).toBe('converged');
    expect(result.branch[0]!.state).toEqual(solution.branch[0]!.state);
    const invalid = structuredClone(next);
    invalid.restart!.parameter += 0.1;
    expect(() => validateStabilityRequest(invalid)).toThrow(/진폭/);
  });
  test('exhausted Newton iterations keep the returned-state residual, omit unknown stability rows, and preserve inputs', () => {
    const job = request('fixed-point', { guess0: 3, guess1: 2, maxIterations: 1, tolerance: 1e-12 });
    const result = runStability(job);
    expect(result.status).toBe('nonconverged');
    expect(result.rows).toEqual([]);
    expect(result.branch[0]!.stable).toBeNull();
    expect(result.log.at(-1)!.residual).toBe(result.branch[0]!.residual);
    expect(result.log.at(-1)!.residual).not.toBe(result.log[0]!.residual);
    finiteResult(result);
  });
  test('native period-doubling switch verifies a genuine P2 branch on the actual current section', () => {
    const job = request(
      'branch-switch',
      {
        source: 'current-driven',
        guess0: -0.2926,
        guess1: 1.9745,
        stepsPerPeriod: 512,
        maxIterations: 10,
        tolerance: 1e-8
      },
      1.07
    );
    const result = runStability(job);
    expect(result.status).toBe('converged');
    expect(details(result).switched).toBe(true);
    expect(details(result).primitiveSeparation).toBeGreaterThan(0.05);
    expect(result.branch[0]!.residual).toBeLessThanOrEqual(1e-8);
  });
  test('codim map matches native augmented-flow sign grid and keeps physical model snapshot', () => {
    const job = request('codim-two', { resolution: 4, lyapunovSteps: 500 });
    const result = runStability(job);
    const native = codimTwoDiagram(
      (amplitude, damping) => ({
        kind: 'driven',
        g: 1,
        length: 1,
        damping,
        driveAmplitude: amplitude,
        driveFrequency: 2 / 3
      }),
      [0.1, 0, 0],
      'forcingAmplitude',
      [0.2, 1.3],
      'damping',
      [0.1, 0.6],
      { n: 4, steps: 500, dt: 0.01, neutralBand: 0.005 }
    );
    expect(result.rows).toEqual(native.cells.map((cell) => [cell.x, cell.y, cell.lambda, cell.regime]));
    expect(details(result).transientSteps).toBe(2000);
    expect(result.warnings.some((warning) => warning.includes('중립 방향'))).toBe(true);
  });
});

describe('S20 explicit stability benchmarks and recovery', () => {
  test('linear Floquet benchmark reproduces analytic damped oscillator modulus', () => {
    const result = runStability(
      request('floquet', { source: 'linear-oscillator', period: 1, linearFrequency: 0.7, linearDamping: 0.2 })
    );
    result.rows.forEach((row) => expect(row[3]).toBeCloseTo(Math.exp(-0.1), 8));
    expect(result.source).toBe('linear-oscillator');
    expect(result.branch).toEqual([]);
    expect(details(result).native.diagnostics.convergence.maxEntryDelta).toBeLessThan(1e-8);
  });
  test('pseudo-arclength crosses a known fold and restart preserves the post-fold orientation', () => {
    const job = request('pseudo-arclength'),
      result = runStability(job);
    expect(result.status).toBe('converged');
    expect(details(result).native.folds).toHaveLength(1);
    expect(result.branch.at(-1)!.state[0]).toBeLessThan(-1);
    expect(details(result).restartDirection).toBe(1);
    const next = restart(job, result);
    next.settings = { ...next.settings, steps: 8 };
    const continued = runStability(next);
    expect(continued.branch[0]!.state).toEqual(result.branch.at(-1)!.state);
    expect(continued.branch.at(-1)!.state[0]).toBeLessThan(result.branch.at(-1)!.state[0]!);
    continued.branch.forEach((point) => expect(Math.abs(point.state[0]! ** 2 - point.parameter)).toBeLessThan(1e-8));
  });
  test('arclength fails safely with a bounded nonconverged corrector and invalid initial solution is rejected', () => {
    const result = runStability(request('pseudo-arclength', { ds: 0.2, maxIterations: 1 }));
    expect(result.status).toBe('nonconverged');
    expect(result.branch).toHaveLength(1);
    expect(() => runStability(request('pseudo-arclength', { guess0: 0, start: 0 }))).toThrow(/비특이/);
  });
  test('pitchfork switching finds both nonzero symmetric branches, then restarts the selected branch', () => {
    const job = request('branch-switch'),
      result = runStability(job);
    expect(result.status).toBe('converged');
    result.branch.forEach((point) => expect(Math.abs(point.state[0]!)).toBeCloseTo(Math.sqrt(point.parameter), 6));
    const next = restart(job, result);
    next.settings = { ...next.settings, end: 0.5, points: 4 };
    const continued = runStability(next);
    expect(continued.branch.every((point) => point.state[0]! < 0)).toBe(true);
    expect(continued.branch.at(-1)!.state[0]).toBeCloseTo(-Math.sqrt(0.5), 6);
    const zero = structuredClone(next);
    zero.restart!.state = [0];
    expect(() => validateStabilityRequest(zero)).toThrow(/비영/);
  });
  test('NS detects the analytic delayed-logistic crossing and restarts from the saved nonzero fixed point', () => {
    const job = request('neimark-sacker'),
      result = runStability(job),
      scan = details(result).scan;
    expect(result.status).toBe('converged');
    expect(scan.points).toHaveLength(1);
    expect(scan.points[0].paramCritical).toBeCloseTo(2, 5);
    result.branch.forEach((point) => expect(point.state[0]).toBeCloseTo((point.parameter - 1) / point.parameter, 6));
    const next = restart(job, result);
    next.settings = { ...next.settings, end: 2.08, points: 3 };
    expect(runStability(next).branch[0]!.parameter).toBe(2.05);
  });
  test('torus saves full collocation curves and independently checks nonzero invariant circles', () => {
    const result = runStability(request('torus', { start: 2.03, end: 2.01, points: 3, collocation: 21 }));
    expect(result.status).toBe('converged');
    expect(details(result).fullCurvePreserved).toBe(true);
    expect(details(result).native.points[0].curve).toHaveLength(42);
    result.rows.forEach((row) => {
      expect(row[1]).toBeGreaterThan(0.01);
      expect(row[3]).toBeLessThan(1e-6);
    });
    const last = result.rows.at(-1)!;
    expect(last[2]).toBeCloseTo(1 / 6, 2);
    const rejected = restart(request('torus'), result);
    expect(() => validateStabilityRequest(rejected)).toThrow(/재시작/);
  });
  test('circle-map rigid rotation is exact and finite locking plateaus are detected', () => {
    const rigid = runStability(request('arnold-tongue', { coupling: 0, points: 7 }));
    rigid.rows.forEach((row) => expect(row[1]).toBeCloseTo(row[0]!, 10));
    const locking = runStability(request('arnold-tongue'));
    expect(
      details(locking).native.tongues.some(
        (tongue: any) => tongue.p === 1 && tongue.q === 2 && tongue.end > tongue.start
      )
    ).toBe(true);
    expect(details(locking).scanDimension).toBe(1);
  });
});

describe('S20 request guards and honest worker events', () => {
  test('guards expensive cumulative work, physics/waveform mismatch, duplicate grid axes and source spoofing', () => {
    expect(() => runStability(request('continuation', { points: 128, maxIterations: 40 }))).toThrow(/예산/);
    expect(() => runStability(request('codim-two', { resolution: 16, lyapunovSteps: 4000 }))).toThrow(/예산/);
    const invalid = request('fixed-point');
    invalid.experiment = {
      ...invalid.experiment,
      modelOptions: { ...invalid.experiment.modelOptions, forcingWaveform: 'square' }
    };
    expect(stabilityRejection(invalid.kind, invalid.experiment, invalid.settings)).toMatch(/sine/);
    expect(() => runStability(request('codim-two', { xParameter: 'damping', yParameter: 'damping' }))).toThrow(
      /서로 다른/
    );
    expect(() => runStability(request('torus', { source: 'current-driven' }))).toThrow(/source/);
  });
  test('unsafe getters are never executed and valid worker IDs survive a settings error', () => {
    let touched = false;
    const unsafe = Object.defineProperty({}, 'id', {
      enumerable: true,
      get: () => {
        touched = true;
        return 'bad';
      }
    });
    const unsafeEvents: unknown[] = [];
    executeStabilityJob(unsafe as StabilityRequest, (event) => unsafeEvents.push(event));
    expect(touched).toBe(false);
    expect(unsafeEvents).toEqual([expect.objectContaining({ type: 'error', id: 'invalid' })]);
    const invalid = request('fixed-point', { maxIterations: 0 }),
      events: unknown[] = [];
    executeStabilityJob(invalid, (event) => events.push(event));
    expect(events).toEqual([expect.objectContaining({ type: 'error', id: 'native-test' })]);
  });
  test('progress is bounded, monotone in measured work and completes after the result is computed', () => {
    const events: { fraction: number | null; work: number; phase: string }[] = [];
    const result = runStability(request('neimark-sacker', { points: 3 }), (event) => events.push(event));
    expect(events[0]).toEqual({ fraction: null, work: 0, phase: 'calculating' });
    expect(events.at(-1)).toEqual(expect.objectContaining({ fraction: 1, phase: 'complete' }));
    for (let i = 1; i < events.length; i++) expect(events[i]!.work).toBeGreaterThanOrEqual(events[i - 1]!.work);
    finiteResult(result);
  });
});
