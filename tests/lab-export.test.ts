import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText, trajectoryCsv, poincareCsv, runJson } from '../src/app/labExport';
import type { LabConfig } from '../src/app/LabSimulation';
import { parseStrictJsonImport } from '../src/validation/importSchema';

const CONFIG: LabConfig = {
  system: 'double',
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 },
  gamma: 0,
  method: 'rk4',
  dt: 0.002,
  initialState: [2.0, 2.5, 0, 0]
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
    const json = runJson(CONFIG, [2.1, 2.4, 0.3, -0.1], 1.23, -5.5, 1e-7, {
      mode: 'research',
      stepsPerFrame: 9,
      seed: 42
    });
    expect(json.schemaVersion).toBe(2);
    expect(json.method).toBe('rk4');
    expect(json.system).toBe('double');
    expect(json.gamma).toBe(0);
    expect(json.runtimeSnapshot).toMatchObject({
      schemaVersion: 'pendulum-session/v10-ts',
      mode: 'research',
      systemType: 'double',
      damping: 0,
      stepsPerFrame: 9,
      seed: 42
    });
    expect(json.initialState).toEqual([2.0, 2.5, 0, 0]);
    expect(json.finalState).toEqual([2.1, 2.4, 0.3, -0.1]);
    expect(json.runtimeSnapshot.state).toEqual(json.finalState);
    expect(json.simTime).toBeCloseTo(1.23, 12);
    expect(json.drift).toBeCloseTo(1e-7, 12);
    const imported = parseStrictJsonImport(JSON.stringify(json));
    expect(imported.ok).toBe(true);
    expect(imported.value?.state).toEqual(json.finalState);
    expect(imported.value?.simTime).toBe(json.simTime);
    // Must round-trip through JSON.
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });

  it('delays object-URL revocation until after the download click can consume it', () => {
    vi.useFakeTimers();
    const anchor = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() }
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pendulum-run');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    downloadText('run.json', '{}', 'application/json');

    expect(anchor.click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith('blob:pendulum-run');
  });

  it('keeps invalid optional seed/frame metadata from breaking session import', () => {
    const json = runJson(CONFIG, [2.1, 2.4, 0.3, -0.1], 1.23, -5.5, 1e-7, {
      stepsPerFrame: Number.NaN,
      seed: 1.5
    });
    expect(json.runtimeSnapshot.stepsPerFrame).toBe(6);
    expect(json.runtimeSnapshot.seed).toBeNull();
    expect(parseStrictJsonImport(JSON.stringify(json)).ok).toBe(true);
  });

  it('preserves historical signed integer seeds in exact runtime metadata', () => {
    const json = runJson(CONFIG, [2.1, 2.4, 0.3, -0.1], 1.23, -5.5, 1e-7, { seed: -1 });
    expect(json.runtimeSnapshot.seed).toBe(-1);
    expect(parseStrictJsonImport(JSON.stringify(json)).value?.seed).toBe(-1);
  });

  it('migrates historical numeric-v2 run envelopes without changing their public schema', () => {
    const historical = {
      schemaVersion: 2,
      generator: 'pendulum-lab-modern-lab',
      system: 'double',
      method: 'rk4',
      dt: 0.002,
      gamma: 0,
      parameters: CONFIG.parameters,
      initialState: CONFIG.initialState,
      finalState: [0.123456789, -0.234567891, 0.345678912, -0.456789123],
      simTime: 12.5,
      energy: -5.5,
      drift: 1e-7
    };
    const imported = parseStrictJsonImport(JSON.stringify(historical));
    expect(imported.ok).toBe(true);
    expect(imported.value).toMatchObject({
      schemaVersion: 'pendulum-session/v10-ts',
      systemType: 'double',
      state: historical.finalState,
      simTime: historical.simTime
    });
  });
});
