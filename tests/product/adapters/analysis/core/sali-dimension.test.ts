import { describe, expect, it } from 'vitest';
import {
  defaultNetworkConfig,
  resizeNetworkConfig,
  toCanonicalNetwork,
  fromCanonicalNetwork
} from '../../../../../src/product/adapters/physics/network';
import * as source from '../../../../../src/product/adapters/analysis/core/source';
import { defaultCoreSettings } from '../../../../../src/product/adapters/analysis/core/settings';
import { runCoreDiagnostic } from '../../../../../src/product/adapters/analysis/core/execute';
import type { ExperimentStateV1 } from '../../../../../src/product/contracts/experiment';

function kuramoto(): ExperimentStateV1 {
  const converted = toCanonicalNetwork(resizeNetworkConfig(defaultNetworkConfig('system:kuramoto'), 2));
  if (!converted.ok) throw new Error('Valid two-node Kuramoto fixture required');
  return converted.value;
}
describe('S18 SALI tangent-dimension precondition', () => {
  it('refuses an actual one-node Kuramoto canonical payload through the native contract', () => {
    const canonical = kuramoto();
    const parameters = Object.fromEntries(
      Object.entries(canonical.parameters).flatMap(([key, value]) =>
        key === 'edgeWeights'
          ? []
          : [[key, value.kind === 'vector' ? { ...value, values: value.values.slice(0, 1) } : value]]
      )
    );
    const oneNode: ExperimentStateV1 = {
      ...canonical,
      parameters,
      topology: { schema: 'pendulum-network-topology/v1', nodes: [canonical.topology!.nodes[0]!], edges: [] },
      initialConditions: { phase: { kind: 'vector', values: [0.2], unit: 'rad' } }
    };
    const decoded = fromCanonicalNetwork(oneNode);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error('One-node Kuramoto must remain unsupported');
    expect(decoded.issues.some((issue) => issue.path === '$.graph.nodes.length')).toBe(true);
    expect(() =>
      runCoreDiagnostic({
        id: 'sali-one',
        kind: 'sali',
        experiment: oneNode,
        series: { axisUnit: 's', labels: ['phase'], units: ['rad'], times: [], states: [], warnings: [] },
        settings: defaultCoreSettings('sali', oneNode)
      })
    ).toThrow('nodes.length');
  });
  it('retains finite nonzero SALI for a valid two-node Kuramoto model', () => {
    const canonical = kuramoto();
    const result = runCoreDiagnostic({
      id: 'sali-two',
      kind: 'sali',
      experiment: canonical,
      series: source.createDiagnosticSeries(canonical, []),
      settings: { ...defaultCoreSettings('sali', canonical), duration: 0.1 }
    });
    const value = (result.details as Record<string, unknown>).finalSali as number;
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThanOrEqual(Math.SQRT2);
  });
});
