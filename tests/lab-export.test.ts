import { describe, expect, it } from 'vitest';
import { trajectoryCsv, poincareCsv, runJson } from '../src/app/labExport';
import type { LabConfig } from '../src/app/LabSimulation';

const CONFIG: LabConfig = {
  system: 'double',
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 },
  gamma: 0,
  method: 'rk4',
  dt: 0.002,
  initialState: [2.0, 2.5, 0, 0]
};

describe('labExport', () => {
  it('builds a trajectory CSV with the right header and rows', () => {
    const csv = trajectoryCsv(
      [
        { time: 0, state: [2, 2.5, 0, 0] },
        { time: 0.002, state: [2.01, 2.49, 0.1, -0.2] }
      ],
      'double'
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('t,th1,th2,w1,w2');
    expect(lines).toHaveLength(3);
    expect(lines[1]!.split(',')).toHaveLength(5);
  });

  it('uses the triple header when the system is triple', () => {
    const csv = trajectoryCsv([{ time: 0, state: [1, 1, 1, 0, 0, 0] }], 'triple');
    expect(csv.split('\n')[0]).toBe('t,th1,th2,th3,w1,w2,w3');
  });

  it('builds a Poincaré CSV', () => {
    const csv = poincareCsv([
      { x: 1.5, y: 4.0 },
      { x: -0.3, y: 2.2 }
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('theta2,omega2');
    expect(lines).toHaveLength(3);
  });

  it('builds a self-describing run JSON', () => {
    const json = runJson(CONFIG, [2.1, 2.4, 0.3, -0.1], 1.23, -5.5, 1e-7);
    expect(json.schemaVersion).toBe(2);
    expect(json.method).toBe('rk4');
    expect(json.system).toBe('double');
    expect(json.initialState).toEqual([2.0, 2.5, 0, 0]);
    expect(json.finalState).toEqual([2.1, 2.4, 0.3, -0.1]);
    expect(json.simTime).toBeCloseTo(1.23, 12);
    expect(json.drift).toBeCloseTo(1e-7, 12);
    // Must round-trip through JSON.
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});
