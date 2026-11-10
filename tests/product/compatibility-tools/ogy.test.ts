import { describe, expect, it } from 'vitest';
import { findPeriodicOrbit, mapJacobianFD, simulateOgyControl } from '../../../src/chaos/chaosControl';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../../src/product/adapters/physics/planar';
import {
  defaultOgySettings,
  OGY_MAX_STEPS,
  type OgyRequest
} from '../../../src/product/lab/compatibility-tools/contracts';
import { executeOgyRequest, henonBenchmark } from '../../../src/product/lab/compatibility-tools/ogy';
import { validateOgyRequest } from '../../../src/product/lab/compatibility-tools/request';
import { ogyArtifactCsv, serializeOgyArtifact } from '../../../src/product/lab/compatibility-tools/export';

function request(): OgyRequest {
  const source = toCanonicalPlanar(defaultPlanarConfig());
  if (!source.ok) throw new Error('Invalid fixture');
  return { id: 'ogy-native-fixture', source: source.value, settings: defaultOgySettings() };
}

describe('S28 product-native OGY benchmark and provenance', () => {
  it('matches preserved native control results and distinguishes the uncontrolled escape', () => {
    const input = request(),
      before = structuredClone(input);
    const artifact = executeOgyRequest(input);
    const map = henonBenchmark(input.settings.b);
    const nominal = (x: readonly number[], out: number[]) => map(x, input.settings.a, out);
    const point = findPeriodicOrbit(nominal, [0.5, 0.1], 1, { tolerance: 1e-12, maxIterations: 32 }).point;
    const jacobian = mapJacobianFD(nominal, point);
    const spec = {
      fixedPoint: point,
      jacobian: [
        [jacobian[0]![0]!, jacobian[0]![1]!],
        [jacobian[1]![0]!, jacobian[1]![1]!]
      ] as const,
      parameterSensitivity: [-point[0]! * point[0]!, 0] as const
    };
    const start = [point[0]! + input.settings.offsetX, point[1]! + input.settings.offsetY];
    const sim = { nominalParameter: 1.4, maxDelta: 0.05, region: 0.05, steps: 1024 };
    expect(artifact.controlled).toEqual(simulateOgyControl(map, spec, sim, start));
    expect(artifact.uncontrolled).toEqual(simulateOgyControl(map, spec, { ...sim, maxDelta: 0 }, start));
    expect(artifact.controlled.captured).toBe(true);
    expect(artifact.controlled.settledDeviation).toBeLessThan(1e-6);
    expect(artifact.controlled.maxControl).toBeGreaterThan(0);
    expect(artifact.controlled.maxControl).toBeLessThanOrEqual(sim.maxDelta);
    expect(artifact.uncontrolled.captured).toBe(false);
    expect(artifact.fixedPoint[0]).toBeCloseTo(0.63135, 4);
    expect(artifact.unstableEigenvalue).toBeCloseTo(-1.9237, 3);
    expect(artifact.stableEigenvalue).toBeCloseTo(0.1559, 3);
    expect(input).toEqual(before);
  });

  it('exports complete bounded finite histories and exact source identity, never applying the benchmark to the pendulum', () => {
    const input = request();
    const artifact = executeOgyRequest(input);
    const restored = JSON.parse(serializeOgyArtifact(artifact));
    expect(restored.request).toEqual(input);
    expect(restored.benchmark).toBe('independent-henon-map');
    expect(restored.nativeExports).toContain('src/chaos/chaosControl.ts#simulateOgyControl');
    expect(restored.limitations.join(' ')).toContain('현재 선택한 진자');
    expect(artifact.controlledRows).toHaveLength(input.settings.steps + 1);
    expect(artifact.uncontrolledRows.length).toBeLessThan(input.settings.steps + 1);
    expect(artifact.controlledRows.every((row) => row.every(Number.isFinite))).toBe(true);
    const csv = ogyArtifactCsv(artifact).trim().split('\r\n');
    expect(csv).toHaveLength(1 + artifact.controlledRows.length + artifact.uncontrolledRows.length);
    expect(csv[0]).toContain('delta_a_dimensionless');
    expect(
      csv.slice(1).every((line) =>
        line
          .split(',')
          .slice(1)
          .every((cell) => Number.isFinite(Number(cell)))
      )
    ).toBe(true);
  });

  it('allows zero authority as an honest no-control comparison', () => {
    const input = request();
    const artifact = executeOgyRequest({ ...input, settings: { ...input.settings, maxDelta: 0 } });
    expect(artifact.controlled).toEqual(artifact.uncontrolled);
    expect(artifact.controlledRows).toEqual(artifact.uncontrolledRows);
    expect(artifact.controlled.maxControl).toBe(0);
  });

  it('rejects a native non-saddle rather than reporting false stabilization', () => {
    const input = request();
    expect(() => executeOgyRequest({ ...input, settings: { ...input.settings, a: 0.1 } })).toThrow(/saddle/);
  });

  it.each([
    { steps: OGY_MAX_STEPS + 1 },
    { steps: 32.5 },
    { steps: 0 },
    { a: NaN },
    { b: 0 },
    { offsetX: Infinity },
    { region: 0 },
    { maxDelta: -0.01 },
    { unknown: 1 }
  ])('rejects invalid setting %j without changing the input', (patch) => {
    const input = request();
    const before = structuredClone(input);
    expect(() => validateOgyRequest({ ...input, settings: { ...input.settings, ...patch } })).toThrow();
    expect(input).toEqual(before);
  });

  it('rejects unsafe, incomplete or wrong-version source/requests and malformed exports', () => {
    const input = request();
    expect(() => validateOgyRequest({ ...input, source: { ...input.source, schema: 'future' } })).toThrow();
    expect(() => validateOgyRequest({ ...input, id: '../unsafe' })).toThrow();
    expect(() => validateOgyRequest({ ...input, extra: true })).toThrow();
    expect(() => validateOgyRequest(JSON.parse('{"__proto__":{}}'))).toThrow();
    const artifact = executeOgyRequest(input);
    expect(() => serializeOgyArtifact({ ...artifact, controlledRows: [[0, NaN, 0, 0, 0]] })).toThrow();
    expect(() =>
      serializeOgyArtifact({ ...artifact, controlledRows: Array(OGY_MAX_STEPS + 2).fill([0, 0, 0, 0, 0]) })
    ).toThrow();
  });

  it('bounds native progress and reaches completion with maximum iteration budget', () => {
    const input = request();
    const progress: number[] = [];
    const artifact = executeOgyRequest({ ...input, settings: { ...input.settings, steps: OGY_MAX_STEPS } }, (value) =>
      progress.push(value)
    );
    expect(artifact.controlledRows.length).toBe(OGY_MAX_STEPS + 1);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(progress.length).toBeLessThan(30);
  });
});
