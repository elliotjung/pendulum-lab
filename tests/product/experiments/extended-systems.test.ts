import { describe, expect, it } from 'vitest';
import { chainMassMatrix } from '../../../src/physics/nPendulum';
import { compoundDoubleMassMatrix } from '../../../src/physics/compoundDouble';
import {
  extendedConfig,
  extendedPresetFields,
  extendedSimulation
} from '../../../src/product/experiments/extended-config';
import {
  createSpatialSimulation,
  defaultSpatialConfig,
  spatialInitialAngles,
  withSpatialAngles
} from '../../../src/product/adapters/physics/spatial';
import { executeExtendedExperiment } from '../../../src/product/experiments/extended-science';
import { createConstraintSimulation, type ConstraintEvent } from '../../../src/product/adapters/physics/constraint';

function constraintSimulation(id: string, overrides: Readonly<Record<string, number>> = {}) {
  const source = extendedConfig(id, { ...extendedPresetFields(id), ...overrides });
  if (source.family !== 'constraint') throw new Error('Expected the constraint adapter.');
  return createConstraintSimulation(source.config);
}

describe('S25 course three independent scientific examples and boundaries', () => {
  it('3.1 recovers the exact aligned three-link matrix and scales mass and length correctly', () => {
    const config = extendedConfig('3.1', { ...extendedPresetFields('3.1'), theta: 0 });
    if (config.family !== 'chain') throw new Error('Expected the actual chain adapter.');
    expect([...chainMassMatrix(config.config.initialState, config.config.parameters)]).toEqual([
      3, 2, 1, 2, 2, 1, 1, 1, 1
    ]);
    const edited = extendedConfig('3.1', { ...extendedPresetFields('3.1'), theta: 0, mass: 2, length: 2 });
    if (edited.family !== 'chain') throw new Error('Expected the actual chain adapter.');
    expect([...chainMassMatrix(edited.config.initialState, edited.config.parameters)]).toEqual([
      24, 16, 8, 16, 16, 8, 8, 8, 8
    ]);
  });

  it('3.3 computes the coupled uniform-rod inertia with its full nonlinear angle dependence', () => {
    const source = extendedConfig('3.3', { ...extendedPresetFields('3.3'), m1: 2, m2: 3, l1: 2, l2: 0.5 });
    if (source.family !== 'planar') throw new Error('Expected the planar compound adapter.');
    const matrix = compoundDoubleMassMatrix(source.config.initialState, source.config.parameters);
    expect(matrix.m11).toBeCloseTo(44 / 3, 12);
    expect(matrix.m22).toBeCloseTo(0.25, 12);
    expect(matrix.m12).toBeCloseTo(1.5 * Math.cos(0.2), 12);
    expect(matrix.determinant).toBeGreaterThan(0);
  });

  it('3.4 maintains the gravity-shifted radial equilibrium and zero angular motion', () => {
    const source = extendedConfig('3.4', { ...extendedPresetFields('3.4'), theta: 0, r: 1.24525 });
    if (source.family !== 'constraint') throw new Error('Expected a spring adapter.');
    const simulation = createConstraintSimulation(source.config);
    const first = simulation.snapshot();
    if (!('tensions' in first)) throw new Error('Missing spring force.');
    expect(first.tensions[0]).toBeCloseTo(9.81, 10);
    while (!simulation.done) {
      const sample = simulation.step();
      expect(sample.state[0]).toBeCloseTo(1.24525, 11);
      expect(sample.state[1]).toBe(0);
      expect(sample.state[3]).toBe(0);
      expect(sample.energy.total).toBeCloseTo(first.energy.total, 11);
    }
  });

  it('3.5 distinguishes valid taut rest from initial negative-tension release and later inelastic capture', () => {
    const equilibrium = constraintSimulation('3.5', { theta: 0 });
    const first = equilibrium.snapshot();
    if (!('events' in first)) throw new Error('Missing string diagnostics.');
    expect(first.phase).toBe('taut');
    expect(first.events).toEqual([]);
    expect(first.tensions[0]).toBeCloseTo(9.81, 10);
    while (!equilibrium.done) {
      const sample = equilibrium.step();
      if (!('events' in sample)) throw new Error('Missing string diagnostics.');
      expect(sample.phase).toBe('taut');
      expect(sample.events).toEqual([]);
    }

    const released = constraintSimulation('3.5');
    const initial = released.snapshot();
    if (!('events' in initial)) throw new Error('Missing string diagnostics.');
    expect(initial.phase).toBe('slack');
    expect(initial.tensions).toEqual([0]);
    expect(initial.events).toMatchObject([{ type: 'slack', time: 0, source: 'initial-condition' }]);
    const captures: ConstraintEvent[] = [];
    while (!released.done) {
      const sample = released.step();
      if (!('events' in sample)) throw new Error('Missing string diagnostics.');
      captures.push(...sample.events.filter((event) => event.type === 'capture'));
    }
    expect(captures.length).toBeGreaterThan(0);
    expect(captures.every((event) => event.time > 0 && event.source === 'integration' && event.energyLoss >= 0)).toBe(
      true
    );
  });

  it('3.5 records a true in-run tension-zero release before recapture for a permitted moving initial state', () => {
    const result = executeExtendedExperiment('3.5', { ...extendedPresetFields('3.5'), theta: 2.2, omega: 3 });
    const first = result.trace[0]!;
    expect(first.phase).toBe('taut');
    expect(first.tensions?.[0]).toBeGreaterThan(3);
    const events = result.tables.find((table) => table.id === 'constraint-events')!.rows;
    expect(events.every((row) => row[4] === 'integration')).toBe(true);
    const release = events.find((row) => row[2] === 'slack');
    const capture = events.find((row) => row[2] === 'capture');
    expect(release).toBeDefined();
    expect(capture).toBeDefined();
    expect(Number(release![1])).toBeGreaterThan(0);
    expect(Number(capture![1])).toBeGreaterThan(Number(release![1]));
    expect(release![7]).toBe('N');
    expect(Number(release![6])).toBeLessThanOrEqual(1e-7);
    expect(capture![7]).toBe('m');
    expect(Number(capture![6])).toBeLessThanOrEqual(1e-7);
    expect(Number(capture![5])).toBeGreaterThanOrEqual(0);
    expect(events.every((row, index) => Number(row[1]) >= Number(events[index - 1]?.[1] ?? 0))).toBe(true);
  });

  it('3.6 identifies full-slack separately from the default outer-slack initial state', () => {
    const defaultSample = constraintSimulation('3.6').snapshot();
    const fullSample = constraintSimulation('3.6', { theta1: 2.5, theta2: 2.5 }).snapshot();
    if (!('events' in defaultSample) || !('events' in fullSample)) throw new Error('Missing hybrid diagnostics.');
    expect(defaultSample.phase).toBe('outer-slack');
    expect(fullSample.phase).toBe('full-slack');
    expect(defaultSample.events[0]).toMatchObject({ type: 'slack', link: 'outer', source: 'initial-condition' });
    // Losing the inner constraint triggers full-slack in the preserved three-mode model.
    expect(fullSample.events[0]).toMatchObject({ type: 'slack', link: 'inner', source: 'initial-condition' });
  });

  it('3.7 uses true upward angular momentum sign and stays planar when azimuthal speed is zero', () => {
    const source = extendedConfig('3.7', extendedPresetFields('3.7'));
    if (source.family !== 'spatial') throw new Error('Expected the spatial adapter.');
    const moving = createSpatialSimulation(source.config).snapshot();
    expect(moving.verticalMomentum).toBeCloseTo(-0.3825853473139958, 12);
    const planarSource = extendedConfig('3.7', { ...extendedPresetFields('3.7'), phiDot1: 0 });
    if (planarSource.family !== 'spatial') throw new Error('Expected the spatial adapter.');
    const planar = createSpatialSimulation(planarSource.config);
    while (!planar.done) {
      const sample = planar.step();
      expect(sample.verticalMomentum).toBeCloseTo(0, 12);
      expect(sample.positions[0]?.z).toBeCloseTo(0, 12);
    }
  });

  it('3.8 responds to relative azimuth rather than only a camera or common orientation change', () => {
    const a = extendedSimulation(extendedConfig('3.8', extendedPresetFields('3.8'))).snapshot();
    const b = extendedSimulation(extendedConfig('3.8', { ...extendedPresetFields('3.8'), phi1: 0.8 })).snapshot();
    expect(a.state).toHaveLength(8);
    expect(a.positions).toHaveLength(2);
    // Changing only one relative direction changes kinetic energy, not merely display orientation.
    expect(a.energy.KE).not.toBeCloseTo(b.energy.KE, 8);
  });

  it('3.8 changes physical link and state dimensions while retaining valid spatial geometry', () => {
    for (const links of [1, 3, 4]) {
      const source = extendedConfig('3.8', { ...extendedPresetFields('3.8'), links });
      if (source.family !== 'spatial') throw new Error('Expected the spatial-chain adapter.');
      const simulation = createSpatialSimulation(source.config);
      expect(simulation.snapshot().state).toHaveLength(4 * links);
      expect(simulation.snapshot().positions).toHaveLength(links);
      while (!simulation.done) {
        const sample = simulation.step();
        expect(Math.max(...sample.constraintErrors)).toBeLessThanOrEqual(1e-10);
      }
    }
  });

  it('3.9 maps identical physical initial conditions and preserves both embedded constraints across a near-pole passage', () => {
    const source = extendedConfig('3.9', extendedPresetFields('3.9'));
    if (source.family !== 'spatial') throw new Error('Expected the embedded spatial adapter.');
    const embedded = createSpatialSimulation(source.config);
    const polar = createSpatialSimulation(
      withSpatialAngles(
        { ...defaultSpatialConfig('system:spherical'), parameters: source.config.parameters },
        spatialInitialAngles(source.config)
      )
    );
    const embeddedInitial = embedded.snapshot();
    const polarInitial = polar.snapshot();
    expect(embeddedInitial.positions[0]?.x).toBeCloseTo(polarInitial.positions[0]?.x ?? NaN, 12);
    expect(embeddedInitial.positions[0]?.y).toBeCloseTo(polarInitial.positions[0]?.y ?? NaN, 12);
    expect(embeddedInitial.positions[0]?.z).toBeCloseTo(polarInitial.positions[0]?.z ?? NaN, 12);
    while (!embedded.done) {
      const sample = embedded.step();
      expect(Math.max(...sample.unitConstraintErrors)).toBeLessThanOrEqual(1e-10);
      expect(Math.max(...sample.tangentConstraintErrors)).toBeLessThanOrEqual(1e-10);
      expect(Number.isFinite(sample.energy.total)).toBe(true);
    }
  });

  it('3.5 rejects fractional or nonfinite inputs before running without changing the caller settings', () => {
    const fields = { ...extendedPresetFields('3.5'), step: NaN };
    expect(() => executeExtendedExperiment('3.5', fields)).toThrow();
    expect(Number.isNaN(fields.step)).toBe(true);
  });
});
