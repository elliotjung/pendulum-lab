import { describe, expect, it } from 'vitest';
import { basinEntropy, doublePendulumFlipBasin } from '../../../../../src/chaos/basin';
import { doublePendulumFtleField } from '../../../../../src/chaos/ftle';
import { extractFtleRidges } from '../../../../../src/chaos/ftleRidge';
import { defaultPlanarConfig, toCanonicalPlanar } from '../../../../../src/product/adapters/physics/planar';
import { runAdvancedDiagnostic } from '../../../../../src/product/adapters/analysis/advanced/execute';
import { defaultAdvancedSettings } from '../../../../../src/product/adapters/analysis/advanced/settings';
import type { AdvancedDiagnosticRequest } from '../../../../../src/product/adapters/analysis/advanced/contracts';
import { signalSeries } from '../core/fixture';

function request(kind: 'basin' | 'lcs-ridge') {
  const physical = {
    ...defaultPlanarConfig(),
    gamma: 0,
    parameters: { m1: 0.9, m2: 1.3, l1: 0.8, l2: 1.2, g: 9.81 }
  };
  const canonical = toCanonicalPlanar(physical);
  if (!canonical.ok) throw new Error('Invalid physical fixture.');
  const input: AdvancedDiagnosticRequest = {
    id: `independent-${kind}`,
    kind,
    experiment: canonical.value,
    series: signalSeries(32),
    settings: {
      ...defaultAdvancedSettings(kind, canonical.value),
      resolution: 6,
      rangeLow: -3,
      rangeHigh: 3,
      duration: kind === 'basin' ? 2 : 0.2,
      dt: 0.01
    }
  };
  return { input, parameters: physical.parameters };
}
const wireNumber = (value: number) => (Object.is(value, -0) ? 0 : value);

describe('S28 independent native advanced grid parity', () => {
  it('basin labels, physical grid coordinates and entropy exactly match direct original native calls', () => {
    const { input, parameters } = request('basin');
    const before = structuredClone(input);
    const nativeGrid = doublePendulumFlipBasin(parameters, { n: 6, range: [-3, 3], dt: 0.01, maxTime: 2 });
    const nativeEntropy = basinEntropy(nativeGrid, Number(input.settings.boxSide));
    const result = runAdvancedDiagnostic(input);
    const details = result.details as Record<string, unknown>;
    expect(details.grid).toEqual({ ...nativeGrid, labels: Array.from(nativeGrid.labels) });
    expect(details.native).toEqual(nativeEntropy);
    const rows = [];
    for (let y = 0; y < nativeGrid.height; y++)
      for (let x = 0; x < nativeGrid.width; x++)
        rows.push([-3 + (6 * x) / 5, -3 + (6 * y) / 5, nativeGrid.labels[y * nativeGrid.width + x]!]);
    expect(result.rows).toEqual(rows);
    expect(input).toEqual(before);
  });

  it('LCS candidate field, native trust metadata and every ridge mask cell match direct original native calls', () => {
    const { input, parameters } = request('lcs-ridge');
    const before = structuredClone(input);
    const field = doublePendulumFtleField(parameters, { n: 6, range: [-3, 3], dt: 0.01, totalTime: 0.2 });
    const ridges = extractFtleRidges(field.values, field.width, field.height, {
      percentile: Number(input.settings.percentile),
      margin: Number(input.settings.margin)
    });
    const result = runAdvancedDiagnostic(input);
    const details = result.details as Record<string, unknown>;
    expect(details.field).toEqual({ ...field, values: Array.from(field.values, wireNumber) });
    expect(details.ridges).toEqual({ ...ridges, mask: Array.from(ridges.mask) });
    const rows = [];
    for (let y = 0; y < field.height; y++)
      for (let x = 0; x < field.width; x++) {
        const index = y * field.width + x;
        rows.push([-3 + (6 * x) / 5, -3 + (6 * y) / 5, wireNumber(field.values[index]!), ridges.mask[index]!]);
      }
    expect(result.rows).toEqual(rows);
    expect(input).toEqual(before);
  });
});
