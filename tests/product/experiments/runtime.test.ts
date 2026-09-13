import { afterEach, describe, expect, test, vi } from 'vitest';
import unit1 from '../../../content/learn/course-1/1.1';
import unit2 from '../../../content/learn/course-1/1.2';
import unit3 from '../../../content/learn/course-1/1.3';
import unit4 from '../../../content/learn/course-1/1.4';
import unit5 from '../../../content/learn/course-1/1.5';
import unit6 from '../../../content/learn/course-1/1.6';
import unit7 from '../../../content/learn/course-1/1.7';
import unit8 from '../../../content/learn/course-1/1.8';
import type { FocusExperimentDefinition } from '../../../src/product/learn/schema';
import {
  createFocusRuntime,
  focusPresetConfig,
  validateFocusConfig,
  MAX_FOCUS_STEPS,
  MAX_FOCUS_SAMPLES,
  MAX_FOCUS_SECONDS
} from '../../../src/product/experiments/runtime';
import { createPlanarSimulation, type PlanarConfig } from '../../../src/product/adapters/physics/planar';
import { focusScheduler, unwrap } from './fixtures';

const units = [unit1, unit2, unit3, unit4, unit5, unit6, unit7, unit8];
const definition = unit1.focusExperiment;
afterEach(() => vi.restoreAllMocks());

describe('S09 Focus engine execution and restart contract', () => {
  test.each(units)('unit $id is deterministic and every stored sample equals the S07 Lab engine', (unit) => {
    const scheduler = focusScheduler();
    const runtime = createFocusRuntime(unit.focusExperiment, { schedule: scheduler.schedule });
    const input = runtime.getSnapshot();
    expect(input.status).toBe('idle');
    expect(input.series).toHaveLength(1);
    runtime.run();
    expect(runtime.getSnapshot().status).toBe('running');
    expect(runtime.getSnapshot().sample.step).toBe(0);
    scheduler.flush();
    const result = runtime.getSnapshot();
    expect(result.status).toBe('completed');
    expect(result.progress).toBe(1);
    expect(result.series.length).toBeLessThanOrEqual(MAX_FOCUS_SAMPLES);
    expect(result.series.at(-1)?.sample).toEqual(result.sample);
    const lab = createPlanarSimulation(result.config);
    for (const entry of result.series) {
      while (lab.snapshot().step < entry.sample.step) lab.step();
      expect(entry.sample).toEqual(lab.snapshot());
    }
    runtime.run();
    scheduler.flush();
    expect(runtime.getSnapshot()).toEqual(result);
    runtime.restart();
    expect(runtime.getSnapshot()).toEqual(input);
    runtime.dispose();
  });

  test('cancellation retains observations and stale callbacks cannot advance a restarted run', () => {
    const scheduler = focusScheduler();
    const runtime = createFocusRuntime(unit8.focusExperiment, { schedule: scheduler.schedule });
    runtime.run();
    scheduler.next();
    const active = runtime.getSnapshot();
    expect(active.sample.step).toBeGreaterThan(0);
    expect(active.sample.step).toBeLessThanOrEqual(64);
    expect(active.progress).toBeGreaterThan(0);
    expect(active.progress).toBeLessThan(1);
    expect(runtime.setField('theta1', 1).ok).toBe(false);
    runtime.cancel();
    const cancelled = runtime.getSnapshot();
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.sample).toEqual(active.sample);
    runtime.run();
    const rerun = runtime.getSnapshot();
    expect(rerun.sample.step).toBe(0);
    scheduler.next(true);
    expect(runtime.getSnapshot()).toEqual(rerun);
    scheduler.flush();
    expect(runtime.getSnapshot().status).toBe('completed');
  });

  test('restart and disposal invalidate pending work and unsubscribe listeners', () => {
    const scheduler = focusScheduler();
    const runtime = createFocusRuntime(definition, { schedule: scheduler.schedule });
    const listener = vi.fn();
    const remove = runtime.subscribe(listener);
    runtime.run();
    runtime.restart();
    expect(runtime.getSnapshot().status).toBe('idle');
    scheduler.next(true);
    expect(runtime.getSnapshot().sample.step).toBe(0);
    remove();
    const count = listener.mock.calls.length;
    runtime.run();
    runtime.dispose();
    const disposed = runtime.getSnapshot();
    scheduler.next(true);
    runtime.run();
    runtime.cancel();
    runtime.restart();
    runtime.subscribe(listener);
    expect(runtime.setField('theta1', 1).ok).toBe(false);
    expect(runtime.getSnapshot()).toEqual(disposed);
    expect(listener).toHaveBeenCalledTimes(count);
  });

  test('failed edits preserve config and observation, including failed engine construction', () => {
    const scheduler = focusScheduler();
    let rejectCreation = false;
    const runtime = createFocusRuntime(definition, {
      schedule: scheduler.schedule,
      simulationFactory: (config) => {
        if (rejectCreation) throw new Error('injected construction failure');
        return createPlanarSimulation(config);
      }
    });
    runtime.run();
    scheduler.flush();
    const completed = runtime.getSnapshot();
    expect(runtime.setField('l1', 2).ok).toBe(false);
    expect(runtime.setField('theta1', Number.NaN).ok).toBe(false);
    expect(runtime.getSnapshot()).toEqual(completed);
    expect(runtime.setFields({ theta1: 0.1, theta2: Number.NaN }).ok).toBe(false);
    expect(runtime.getSnapshot()).toEqual(completed);
    rejectCreation = true;
    const rejected = runtime.setField('theta1', 0.2);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.issues[0]?.code).toBe('focus-evaluation');
    expect(runtime.getSnapshot()).toEqual(completed);
    rejectCreation = false;
    expect(runtime.setField('theta1', 0.2).ok).toBe(true);
    expect(runtime.getSnapshot().config.initialState[0]).toBe(0.2);
    expect(runtime.getSnapshot().status).toBe('idle');
  });

  test.each(['primary', 'companion'] as const)(
    '%s numerical failure yields a recoverable error without accepting a partial pair',
    (fault) => {
      const scheduler = focusScheduler();
      let shouldThrow = true;
      let creations = 0;
      const runtime = createFocusRuntime(unit8.focusExperiment, {
        schedule: scheduler.schedule,
        simulationFactory: (config) => {
          const ordinal = creations++ % 2;
          const simulation = createPlanarSimulation(config);
          return {
            config: simulation.config,
            derivative: simulation.derivative,
            get done() {
              return simulation.done;
            },
            snapshot: () => simulation.snapshot(),
            step: () => {
              if (shouldThrow && ordinal === (fault === 'primary' ? 0 : 1))
                throw new Error('injected numerical failure');
              return simulation.step();
            }
          };
        }
      });
      runtime.run();
      scheduler.flush();
      const failed = runtime.getSnapshot();
      expect(failed.status).toBe('error');
      expect(failed.error).toContain('injected numerical failure');
      expect(failed.sample.step).toBe(0);
      expect(failed.series).toHaveLength(1);
      shouldThrow = false;
      runtime.run();
      scheduler.flush();
      expect(runtime.getSnapshot().status).toBe('completed');
      expect(runtime.getSnapshot().error).toBeNull();
    }
  );

  test('scheduler and rerun initialization errors remain bounded and can be retried', () => {
    const scheduler = focusScheduler();
    let scheduleFails = true;
    let factoryFails = false;
    const runtime = createFocusRuntime(definition, {
      schedule: (callback) => {
        if (scheduleFails) throw new Error('scheduler unavailable');
        return scheduler.schedule(callback);
      },
      simulationFactory: (config) => {
        if (factoryFails) throw new Error('x'.repeat(1000));
        return createPlanarSimulation(config);
      }
    });
    runtime.run();
    expect(runtime.getSnapshot().status).toBe('error');
    expect(runtime.getSnapshot().error).toContain('scheduler unavailable');
    scheduleFails = false;
    factoryFails = true;
    runtime.run();
    expect(runtime.getSnapshot().error).toHaveLength(500);
    runtime.restart();
    expect(runtime.getSnapshot().status).toBe('error');
    factoryFails = false;
    runtime.run();
    scheduler.flush();
    expect(runtime.getSnapshot().status).toBe('completed');
  });

  test('external mutations cannot alter configured presets, active states, diagnostics or observations', () => {
    const declaration = structuredClone(definition);
    const config = unwrap(focusPresetConfig(declaration));
    const scheduler = focusScheduler();
    const runtime = createFocusRuntime(declaration, { config, schedule: scheduler.schedule });
    const expected = runtime.getSnapshot();
    config.parameters.g = 100;
    (declaration.defaultPreset.fields as unknown as { value: number }[])[0]!.value = 99;
    const snapshot = runtime.getSnapshot();
    snapshot.config.parameters.g = 0;
    (snapshot.sample.state as unknown as number[])[0] = 999;
    (snapshot.diagnostics.massMatrix[0] as unknown as number[])[0] = 999;
    (snapshot.series as unknown[]).length = 0;
    expect(runtime.getSnapshot()).toEqual(expected);
  });
});

describe('Focus declarations, settings and resource limits', () => {
  test.each([
    ['unavailable', { status: 'planned' }],
    ['wrong system', { systemId: 'system:compound-double' }],
    ['unknown integrator', { defaultPreset: { ...definition.defaultPreset, integratorId: 'integrator:unknown' } }],
    [
      'missing preset field',
      { defaultPreset: { ...definition.defaultPreset, fields: definition.defaultPreset.fields.slice(1) } }
    ],
    [
      'duplicate preset',
      {
        defaultPreset: {
          ...definition.defaultPreset,
          fields: [...definition.defaultPreset.fields, definition.defaultPreset.fields[0]!]
        }
      }
    ],
    [
      'wrong unit',
      {
        defaultPreset: {
          ...definition.defaultPreset,
          fields: definition.defaultPreset.fields.map((f, i) => (i === 0 ? { ...f, unit: 'm' } : f))
        }
      }
    ],
    ['duplicate fixed field', { fixedFields: [...definition.fixedFields, definition.fixedFields[0]!] }],
    ['fixed/exposed overlap', { exposedFields: [...definition.exposedFields, 'l1'] }],
    ['duplicate exposed', { exposedFields: ['theta1', 'theta1'] }],
    ['unknown exposed', { exposedFields: ['unknown'] }]
  ])('rejects %s declarations', (_, change) => {
    const bad = { ...definition, ...change } as FocusExperimentDefinition;
    expect(focusPresetConfig(bad).ok).toBe(false);
    expect(() => createFocusRuntime(bad)).toThrow();
  });

  test('restored fixed/hidden parameters and integrator cannot drift silently', () => {
    const config = unwrap(focusPresetConfig(definition));
    expect(validateFocusConfig(definition, { ...config, parameters: { ...config.parameters, l1: 2 } }).ok).toBe(false);
    expect(validateFocusConfig(definition, { ...config, integratorId: 'integrator:euler' }).ok).toBe(false);
    const hidden = { ...definition, fixedFields: definition.fixedFields.filter((field) => field.id !== 'l1') };
    expect(validateFocusConfig(hidden, { ...config, parameters: { ...config.parameters, l1: 2 } }).ok).toBe(false);
    expect(validateFocusConfig(definition, { ...config, surprise: 1 }).ok).toBe(false);
  });

  test('enforces exactly 20 seconds / 20000 steps and bounds stored samples even at the maximum', () => {
    const adjustable: FocusExperimentDefinition = {
      ...definition,
      exposedFields: [...definition.exposedFields, 'duration', 'step'],
      fixedFields: definition.fixedFields.filter((field) => !['duration', 'step'].includes(field.id))
    };
    const preset = unwrap(focusPresetConfig(adjustable));
    const maximum: PlanarConfig = { ...preset, duration: MAX_FOCUS_SECONDS, step: MAX_FOCUS_SECONDS / MAX_FOCUS_STEPS };
    expect(validateFocusConfig(adjustable, maximum).ok).toBe(true);
    expect(validateFocusConfig(adjustable, { ...maximum, duration: MAX_FOCUS_SECONDS + 0.001 }).ok).toBe(false);
    expect(validateFocusConfig(adjustable, { ...maximum, step: maximum.step / 2 }).ok).toBe(false);
    const scheduler = focusScheduler();
    const runtime = createFocusRuntime(adjustable, { config: maximum, schedule: scheduler.schedule });
    runtime.run();
    scheduler.flush();
    expect(runtime.getSnapshot().sample.step).toBe(MAX_FOCUS_STEPS);
    expect(runtime.getSnapshot().series).toHaveLength(MAX_FOCUS_SAMPLES);
  });

  test('fractional terminal steps and absolute start time retain exact engine semantics', () => {
    const adjustable: FocusExperimentDefinition = {
      ...definition,
      exposedFields: [...definition.exposedFields, 'duration', 'step'],
      fixedFields: definition.fixedFields.filter((field) => !['duration', 'step'].includes(field.id))
    };
    const config = {
      ...unwrap(focusPresetConfig(adjustable)),
      duration: 0.005,
      step: 0.002,
      startTime: 13,
      sampleEvery: 2
    };
    const scheduler = focusScheduler();
    const runtime = createFocusRuntime(adjustable, { config, schedule: scheduler.schedule });
    runtime.run();
    scheduler.flush();
    const snapshot = runtime.getSnapshot();
    expect(snapshot.sample.time).toBe(13.005);
    expect(snapshot.sample.step).toBe(3);
    expect(snapshot.progress).toBe(1);
    expect(snapshot.series.map((frame) => frame.sample.step)).toEqual([0, 2, 3]);
  });

  test('nearby initial condition must also fit the angle range', () => {
    const config = unwrap(focusPresetConfig(unit8.focusExperiment));
    expect(validateFocusConfig(unit8.focusExperiment, { ...config, initialState: [1e6, 0, 0, 0] }).ok).toBe(false);
  });
});
