import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SimulationClock, type SimulationFrameResult } from '../../../src/app/SimulationClock';
import { LabSimulation } from '../../../src/app/LabSimulation';

const ORIGINAL_CLOCK_BLOB = '965d58020a3511cf095868591407143baa4edea7';
const originalSource = execFileSync('git', ['cat-file', 'blob', ORIGINAL_CLOCK_BLOB], { encoding: 'utf8' });
const compiled = ts.transpileModule(originalSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const legacyExports: Record<string, unknown> = {};
runInNewContext(
  compiled,
  {
    exports: legacyExports,
    performance: { now: () => 0 },
    require() {
      throw new Error('The immutable clock oracle must not import a current implementation.');
    }
  },
  { timeout: 1000 }
);
type ExistingClock = Pick<SimulationClock, 'advance' | 'reset' | 'diagnostics'>;
const OriginalClock = legacyExports.SimulationClock as new () => ExistingClock;
const simulation = () =>
  new LabSimulation({
    system: 'double',
    parameters: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
    initialState: [0.4, 0.2, 0, 0],
    gamma: 0,
    method: 'rk4',
    dt: 0.002
  });
function observable(frame: SimulationFrameResult) {
  expect(Number.isFinite(frame.physicsMs) && frame.physicsMs >= 0).toBe(true);
  const { physicsMs: _duration, ...value } = frame;
  return { ...value, state: Array.from(frame.state), bobs: Array.from(frame.bobs, (bob) => ({ x: bob.x, y: bob.y })) };
}

describe('S28 immutable pre-extension clock differential', () => {
  for (const mode of ['deterministic', 'wall-clock'] as const)
    for (const speedMultiplier of [0.1, 1, 1.7, 4])
      it(`${mode} ${speedMultiplier}x preserves old frame counts, real native states, debt/drop and both reset modes`, () => {
        const old = new OriginalClock(),
          current = new SimulationClock(),
          oldSim = simulation(),
          currentSim = simulation();
        for (const [index, timestampMs] of [100, 116, 132, 1000, 1016, 25000, 25016].entries()) {
          const oldSteps: number[][] = [],
            currentSteps: number[][] = [];
          const options = {
            mode,
            timestampMs,
            speedMultiplier,
            stepsPerFrame: 6.4,
            maxWallClockSteps: index % 2 ? 3 : 64
          };
          expect(
            observable(
              current.advance({
                ...options,
                sim: currentSim,
                bobsScratch: [],
                onStep: (state) => currentSteps.push(Array.from(state))
              })
            )
          ).toEqual(
            observable(
              old.advance({
                ...options,
                sim: oldSim,
                bobsScratch: [],
                onStep: (state) => oldSteps.push(Array.from(state))
              })
            )
          );
          expect(currentSteps).toEqual(oldSteps);
          expect(current.diagnostics()).toEqual(old.diagnostics());
          if (index === 3) {
            old.reset(false);
            current.reset(false);
            expect(current.diagnostics()).toEqual(old.diagnostics());
          }
        }
        old.reset();
        current.reset();
        expect(current.diagnostics()).toEqual(old.diagnostics());
        expect(current.diagnostics()).toEqual({ timingDebtSeconds: 0, droppedSimulationSeconds: 0 });
      });
  it.each([
    { mode: 'unknown' },
    { stepsPerFrame: -1 },
    { stepsPerFrame: NaN },
    { stepsPerFrame: 1_000_001 },
    { timestampMs: -1 },
    { timestampMs: NaN },
    { speedMultiplier: -1 },
    { speedMultiplier: Infinity },
    { maxWallClockSteps: 0 },
    { maxWallClockSteps: 1.5 },
    { maxWallClockSteps: 1_000_001 }
  ])('preserves original rejection and observable atomicity for %j', (patch) => {
    const old = new OriginalClock(),
      current = new SimulationClock();
    const run = (clock: ExistingClock) => {
      const sim = simulation(),
        before = Array.from(sim.stateView());
      let error: { name: string; message: string } | undefined;
      try {
        clock.advance({
          sim,
          mode: 'wall-clock',
          timestampMs: 100,
          speedMultiplier: 1,
          stepsPerFrame: 6,
          bobsScratch: [],
          onStep() {},
          ...patch
        } as Parameters<SimulationClock['advance']>[0]);
      } catch (cause) {
        const failure = cause as Error;
        error = { name: failure.name, message: failure.message };
      }
      expect(error).toBeDefined();
      expect(Array.from(sim.stateView())).toEqual(before);
      expect(sim.time).toBe(0);
      return { error, diagnostics: clock.diagnostics() };
    };
    expect(run(current)).toEqual(run(old));
  });
});
