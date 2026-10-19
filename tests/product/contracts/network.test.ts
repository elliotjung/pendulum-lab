import { describe, expect, it } from 'vitest';
import {
  defaultNetworkConfig,
  fromCanonicalNetwork,
  NETWORK_SYSTEM_IDS,
  resizeNetworkConfig,
  toCanonicalNetwork,
  validateNetworkConfig
} from '../../../src/product/adapters/physics/network';

describe('S15 closed network configuration and canonical graph transport', () => {
  it.each(NETWORK_SYSTEM_IDS)('%s preserves stable IDs, node vectors, units and unknown originals', (id) => {
    const c = defaultNetworkConfig(id),
      canonical = toCanonicalNetwork(c);
    if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
    expect(canonical.value.topology!.nodes).toEqual(c.graph.nodes.map((n) => n.id));
    expect(canonical.value.topology!.edges).toEqual(
      c.graph.edges.map(({ id, source, target }) => ({ id, source, target }))
    );
    expect(fromCanonicalNetwork(canonical.value)).toEqual({ ok: true, value: c });
    expect(fromCanonicalNetwork({ ...canonical.value, modelVersion: 'network-model-v2' }).ok).toBe(false);
    expect(
      fromCanonicalNetwork({
        ...canonical.value,
        parameters: { ...canonical.value.parameters, unknown: { kind: 'scalar', value: 1, unit: '1' } }
      }).ok
    ).toBe(false);
    expect(
      fromCanonicalNetwork({
        ...canonical.value,
        initialConditions: { ...canonical.value.initialConditions, unknown: { kind: 'scalar', value: 1, unit: '1' } }
      }).ok
    ).toBe(false);
    expect(
      fromCanonicalNetwork({
        ...canonical.value,
        integrator: { ...canonical.value.integrator, settings: { dt: { kind: 'scalar', value: 1, unit: 's' } } }
      }).ok
    ).toBe(false);
  });
  it.each([
    'self',
    'parallel',
    'endpoint',
    'duplicate-node',
    'duplicate-edge',
    'negative',
    'nonfinite',
    'unknown-node-field',
    'unknown-graph-field'
  ])('rejects %s graph without mutating input', (kind) => {
    const c = structuredClone(defaultNetworkConfig('system:pendulum-network')) as unknown as {
      graph: { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[]; other?: number };
    };
    if (kind === 'self') c.graph.edges[0]!.target = c.graph.edges[0]!.source;
    if (kind === 'parallel') c.graph.edges.push({ ...c.graph.edges[0]!, id: 'extra' });
    if (kind === 'endpoint') c.graph.edges[0]!.source = 'missing';
    if (kind === 'duplicate-node') c.graph.nodes[1]!.id = c.graph.nodes[0]!.id;
    if (kind === 'duplicate-edge') c.graph.edges[1]!.id = c.graph.edges[0]!.id;
    if (kind === 'negative') c.graph.edges[0]!.weight = -1;
    if (kind === 'nonfinite') c.graph.nodes[0]!.frequency = Infinity;
    if (kind === 'unknown-node-field') c.graph.nodes[0]!.unknown = 1;
    if (kind === 'unknown-graph-field') c.graph.other = 1;
    const original = structuredClone(c);
    expect(validateNetworkConfig(c).ok).toBe(false);
    expect(c).toEqual(original);
  });
  it.each(['system:magnetic', 'system:chimera-exploration'] as const)(
    '%s rejects malicious plain coercion objects without throwing',
    (id) => {
      const c = defaultNetworkConfig(id),
        malicious = { toString: 'n1', valueOf: 2 };
      for (const v of [
        { ...c, graph: { ...c.graph, ringOrder: [malicious, ...c.graph.nodes.slice(1).map((n) => n.id)] } },
        { ...c, parameters: { ...c.parameters, radius: malicious } },
        { ...c, basin: { ...c.basin, xMin: malicious } }
      ]) {
        expect(() => validateNetworkConfig(v)).not.toThrow();
        expect(validateNetworkConfig(v).ok).toBe(false);
      }
    }
  );
  it('rejects wrong chimera ring identity, topology weights and Huygens graph', () => {
    const c = defaultNetworkConfig('system:chimera-exploration');
    for (const graph of [
      { ...c.graph, ringOrder: undefined },
      { ...c.graph, ringOrder: c.graph.nodes.map(() => 'n1') },
      { ...c.graph, edges: c.graph.edges.slice(1) },
      { ...c.graph, edges: c.graph.edges.map((e, i) => (i ? e : { ...e, weight: 2 })) }
    ])
      expect(validateNetworkConfig({ ...c, graph }).ok).toBe(false);
    const h = defaultNetworkConfig('system:huygens-phase-pair');
    expect(validateNetworkConfig({ ...h, graph: { ...h.graph, edges: [] } }).ok).toBe(false);
  });
  it('rejects invalid stepping, seed, units and resource limits', () => {
    const c = defaultNetworkConfig('system:kuramoto');
    for (const extra of [
      { step: 0 },
      { duration: 1e4 },
      { sampleEvery: 0 },
      { sampleEvery: null },
      { startTime: Number.MAX_VALUE },
      { step: 0.00001, duration: 100 },
      { seed: { value: 'same', generator: 'unknown', generatorVersion: '1' } },
      { analyses: [{}] },
      { integratorId: 'internal' }
    ])
      expect(validateNetworkConfig({ ...c, ...extra }).ok).toBe(false);
    expect(() => resizeNetworkConfig(c, 129)).toThrow();
    expect(() => resizeNetworkConfig(c, 128, 63)).toThrow();
    const canonical = toCanonicalNetwork(c);
    if (!canonical.ok) throw new Error('canonical');
    expect(
      fromCanonicalNetwork({
        ...canonical.value,
        initialConditions: { phase: { kind: 'vector', values: c.initialState, unit: 'm' } }
      }).ok
    ).toBe(false);
  });
  it('rejects callbacks/accessors/prototype payloads before evaluation', () => {
    const c = defaultNetworkConfig();
    let called = false;
    const getter = Object.defineProperty({ ...c }, 'parameters', {
      enumerable: true,
      get: () => {
        called = true;
        return c.parameters;
      }
    });
    expect(validateNetworkConfig(getter).ok).toBe(false);
    expect(called).toBe(false);
    expect(validateNetworkConfig(JSON.parse('{"__proto__":{"polluted":true}}')).ok).toBe(false);
    expect(validateNetworkConfig({ ...c, callback: () => 1 }).ok).toBe(false);
  });
});
