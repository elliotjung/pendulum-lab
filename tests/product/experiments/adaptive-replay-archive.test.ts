import { describe, expect, it } from 'vitest';
import { integrateAdaptive, replayAcceptedSteps } from '../../../src/physics/adaptive';
import { createPlanarSimulation } from '../../../src/product/adapters/physics/planar';
import {
  ADAPTIVE_ARCHIVE_LIMITS,
  appendAdaptiveReplayRun,
  createAdaptiveReplayArchive
} from '../../../src/product/experiments/adaptive-replay-archive';
import { validateExtendedResult } from '../../../src/product/experiments/extended-client';
import { extendedConfig, extendedPresetFields } from '../../../src/product/experiments/extended-config';
import { executeExtendedExperiment } from '../../../src/product/experiments/extended-science';
import type { ExtendedResult } from '../../../src/product/experiments/extended-results';

const cases = ['2.3', '2.7'].map((unitId) => {
  const fields = { ...extendedPresetFields(unitId), duration: 8, tolerance: 1e-9 },
    request = { id: `adaptive-tail-${unitId}`, unitId, fields },
    result = executeExtendedExperiment(unitId, fields),
    source = extendedConfig(unitId, fields);
  if (source.family !== 'planar') throw new Error('Expected planar source.');
  return { unitId, fields, request, result, config: source.config };
});

describe('S28 complete native adaptive archives beyond the display projection', () => {
  it.each(cases)(
    '$unitId retains every native call, complete schedule and exact final state after JSON export/parse',
    ({ unitId, fields, request, result, config }) => {
      const exported = JSON.parse(JSON.stringify(result)) as ExtendedResult,
        archive = exported.adaptiveArchive!;
      expect(archive.schema).toBe('pendulum-adaptive-replay/v1');
      expect(archive.scope).toBe('all-adaptive-calls');
      expect(archive.runs.map((run) => run.id)).toEqual(
        unitId === '2.3' ? ['main'] : ['main', 'reference', 'tolerance-0', 'tolerance-1', 'tolerance-2']
      );
      expect(archive.runs.some((run) => run.result.acceptedSteps.length > 400)).toBe(true);
      for (const run of archive.runs) {
        const native = createPlanarSimulation(config),
          direct = integrateAdaptive(
            Float64Array.from(config.initialState),
            fields.duration,
            native.derivative,
            run.options
          ),
          replay = replayAcceptedSteps(
            Float64Array.from(run.initialState),
            native.derivative,
            run.result.acceptedSteps
          );
        expect(run.initialState).toEqual(config.initialState);
        expect(run.result).toEqual({ ...direct, y: Array.from(direct.y) });
        expect(Array.from(replay.y)).toEqual(run.result.y);
        expect(replay.finalTime).toBe(fields.duration);
        expect(run.result.acceptedSteps.at(-1)?.endTime).toBe(fields.duration);
        expect(run.result.acceptedSteps.length).toBe(run.result.accepted);
      }
      const main = archive.runs[0]!,
        displayed = exported.tables.find((table) => table.id === 'adaptive-steps')!;
      expect(displayed.rows).toEqual(
        main.result.acceptedSteps
          .slice(0, 400)
          .map((step) => [step.index, step.startTime, step.endTime, step.dt, step.errorNorm])
      );
      expect(displayed.rows.length).toBe(Math.min(400, main.result.accepted));
      expect(validateExtendedResult(exported, request)).toEqual(exported);
      expect(exported.canonical.integrator).toMatchObject({ kind: 'selectable', id: 'integrator:rk4' });
    }
  );

  it.each([
    [
      'missing archive',
      (result: ExtendedResult) => {
        delete (result as { adaptiveArchive?: unknown }).adaptiveArchive;
      }
    ],
    [
      'omitted comparison run',
      (result: ExtendedResult) => {
        (result.adaptiveArchive!.runs as unknown[]).pop();
      }
    ],
    [
      'missing tail',
      (result: ExtendedResult) => {
        result.adaptiveArchive!.runs[1]!.result.acceptedSteps.pop();
      }
    ],
    [
      'tail index',
      (result: ExtendedResult) => {
        result.adaptiveArchive!.runs[1]!.result.acceptedSteps.at(-1)!.index = 0;
      }
    ],
    [
      'tail final time',
      (result: ExtendedResult) => {
        result.adaptiveArchive!.runs[1]!.result.acceptedSteps.at(-1)!.endTime -= 0.001;
      }
    ],
    [
      'tail finite dt',
      (result: ExtendedResult) => {
        result.adaptiveArchive!.runs[1]!.result.acceptedSteps.at(-1)!.dt *= 0.99;
      }
    ],
    [
      'tail nonfinite acceptance error',
      (result: ExtendedResult) => {
        result.adaptiveArchive!.runs[1]!.result.acceptedSteps.at(-1)!.errorNorm = NaN;
      }
    ],
    [
      'tail unaccepted error',
      (result: ExtendedResult) => {
        result.adaptiveArchive!.runs[1]!.result.acceptedSteps.at(-1)!.errorNorm = 1.01;
      }
    ],
    [
      'finite altered final y',
      (result: ExtendedResult) => {
        (result.adaptiveArchive!.runs[1]!.result.y as number[])[0]! += 1e-8;
      }
    ],
    [
      'wrong options',
      (result: ExtendedResult) => {
        (result.adaptiveArchive!.runs[1]!.options as { absTol: number }).absTol *= 2;
      }
    ],
    [
      'wrong rejected counter',
      (result: ExtendedResult) => {
        result.adaptiveArchive!.runs[1]!.result.rejected++;
      }
    ],
    [
      'wrong displayed projection',
      (result: ExtendedResult) => {
        (result.tables.find((table) => table.id === 'adaptive-steps')!.rows[0] as number[])[3]! *= 0.5;
      }
    ],
    [
      'wrong tolerance comparison',
      (result: ExtendedResult) => {
        (result.tables.find((table) => table.id === 'tolerance-cost')!.rows[0] as number[])[1]! += 1;
      }
    ]
  ] as const)('refuses %s in the complete worker/file archive', (_label, change) => {
    const { result, request } = cases[1]!,
      altered = structuredClone(result);
    expect(altered.adaptiveArchive!.runs[1]!.result.acceptedSteps.length).toBeGreaterThan(400);
    change(altered);
    expect(() => validateExtendedResult(altered, request)).toThrow();
  });

  it('refuses an over-cap native schedule as a whole without truncating or mutating the native result', () => {
    const run = cases[0]!.result.adaptiveArchive!.runs[0]!,
      archive = createAdaptiveReplayArchive(),
      acceptedSteps = Array.from({ length: ADAPTIVE_ARCHIVE_LIMITS.acceptedSteps + 1 }, (_, index) => ({
        index,
        startTime: index,
        endTime: index + 1,
        dt: 1,
        errorNorm: 0
      })),
      native = { ...run.result, y: Float64Array.from(run.result.y), acceptedSteps };
    expect(() => appendAdaptiveReplayRun(archive, 'main', run.initialState, run.options, native)).toThrow(/8,192/);
    expect(archive.runs).toEqual([]);
    expect(native.acceptedSteps.length).toBe(ADAPTIVE_ARCHIVE_LIMITS.acceptedSteps + 1);
  });
});
