import { describe, expect, it } from 'vitest';
import type { ExperimentStateV1 } from '../../../src/product/contracts/experiment';
import { validateExperimentState } from '../../../src/product/contracts/experiment-validation';
import {
  serializeExperiment,
  parseExperiment,
  createExperimentRoute,
  resolveProductRoute
} from '../../../src/product/persistence';

function fixture(): ExperimentStateV1 {
  return {
    schema: 'pendulum-experiment/v1',
    systemId: 'system:pendulum-network',
    modelVersion: 'network-model-v1',
    parameters: {},
    initialConditions: {},
    topology: {
      schema: 'pendulum-network-topology/v1',
      nodes: ['bobA', 'bobB', 'bobC'],
      edges: [{ id: 'springAB', source: 'bobA', target: 'bobB' }],
      ringOrder: ['bobC', 'bobA', 'bobB']
    },
    integrator: { kind: 'selectable', id: 'integrator:rk4', version: 'network-integrator-v1', settings: {} },
    runtime: {
      domain: 'time',
      start: { value: 0, unit: 's' },
      duration: { value: 1, unit: 's' },
      step: { value: 0.01, unit: 's' },
      sampleEvery: 1
    },
    analyses: []
  };
}
type Data = Record<string, any>; // Malformed transport fixtures intentionally break the contract.
describe('S15 versioned graph identity transport', () => {
  it('preserves stable identity, vector order and independent physical ring order through JSON and share', () => {
    const source = fixture();
    const saved = serializeExperiment(source);
    if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
    expect(parseExperiment(saved.value)).toEqual({ ok: true, value: source });
    const route = createExperimentRoute(source);
    if (!route.ok) throw new Error(JSON.stringify(route.issues));
    const restored = resolveProductRoute(route.value);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.value.experiment).toEqual(source);
    const checked = validateExperimentState(source);
    expect(checked.ok).toBe(true);
    (source.topology!.nodes as string[])[0] = 'changed';
    if (checked.ok) expect(checked.value.topology!.nodes[0]).toBe('bobA');
  });
  it.each([
    (v: Data) => {
      v.topology.schema = 'pendulum-network-topology/v2';
    },
    (v: Data) => {
      v.topology.layout = {};
    },
    (v: Data) => {
      v.topology.nodes = ['same', 'same'];
    },
    (v: Data) => {
      v.topology.nodes = [];
    },
    (v: Data) => {
      v.topology.nodes = ['<script>'];
    },
    (v: Data) => {
      v.topology.nodes = Array.from({ length: 129 }, (_, i) => `node${i}`);
    },
    (v: Data) => {
      v.topology.edges[0].source = 'missing';
    },
    (v: Data) => {
      v.topology.edges[0].target = 'bobA';
    },
    (v: Data) => {
      v.topology.edges.push({ id: 'other', source: 'bobB', target: 'bobA' });
    },
    (v: Data) => {
      v.topology.edges.push({ id: 'springAB', source: 'bobB', target: 'bobC' });
    },
    (v: Data) => {
      v.topology.edges[0].weight = 2;
    },
    (v: Data) => {
      v.topology.ringOrder = ['bobA', 'bobB', 'bobB'];
    },
    (v: Data) => {
      v.topology.ringOrder = ['bobA', 'bobB', 'other'];
    },
    (v: Data) => {
      v.topology.ringOrder = null;
    }
  ])('rejects malformed topology without overwriting original (%#)', (mutate) => {
    const value = structuredClone(fixture()) as unknown as Data;
    mutate(value);
    const before = structuredClone(value);
    expect(validateExperimentState(value).ok).toBe(false);
    expect(value).toEqual(before);
  });
  it('accepts disconnected nodes but limits graph metadata to exact supported network model', () => {
    const source = fixture();
    expect(validateExperimentState({ ...source, topology: { ...source.topology, edges: [] } }).ok).toBe(true);
    for (const systemId of ['system:double', 'system:duffing', 'system:standard-map'])
      expect(validateExperimentState({ ...source, systemId }).ok).toBe(false);
    for (const modelVersion of ['legacy', 'network-model-v2'])
      expect(validateExperimentState({ ...source, modelVersion }).ok).toBe(false);
    const { topology: _topology, ...legacy } = source;
    expect(validateExperimentState({ ...legacy, modelVersion: 'legacy' }).ok).toBe(true);
  });
  it('requires physical ring order for chimera only when topology is present', () => {
    const source = fixture();
    const { ringOrder: _order, ...topology } = source.topology!;
    const chimera = {
      ...source,
      systemId: 'system:chimera-exploration',
      integrator: { kind: 'internal', version: 'v1', settings: {} },
      topology
    };
    expect(validateExperimentState(chimera).ok).toBe(false);
    expect(validateExperimentState({ ...chimera, topology: source.topology }).ok).toBe(true);
  });
  it('rejects accessors and polluted payload before reading graph fields', () => {
    let reads = 0;
    const source = fixture();
    Object.defineProperty(source.topology!, 'nodes', {
      enumerable: true,
      get() {
        reads++;
        return ['nodeA'];
      }
    });
    expect(validateExperimentState(source).ok).toBe(false);
    expect(reads).toBe(0);
    expect(
      validateExperimentState({
        ...fixture(),
        topology: JSON.parse('{"__proto__":{},"schema":"pendulum-network-topology/v1","nodes":["nodeA"],"edges":[]}')
      }).ok
    ).toBe(false);
  });
});
