import { describe, expect, it } from 'vitest';
import { collectEnvironment, kindRank, ProvenanceBuilder, validateProvenanceGraph } from '../src/research/provenance';

function sampleGraph() {
  const builder = new ProvenanceBuilder(collectEnvironment('test-app'));
  builder.addNode({
    id: 'snapshot:s1',
    kind: 'snapshot',
    label: 'snapshot',
    content: { state: [1, 2] },
    schemaVersion: 'pendulum-snapshot/v2',
    sourceCommand: 'test'
  });
  builder.addNode({
    id: 'experiment:e1',
    kind: 'experiment',
    label: 'experiment',
    content: { name: 'exp' },
    schemaVersion: 'v2',
    parentIds: ['snapshot:s1'],
    sourceCommand: 'test'
  });
  builder.addNode({
    id: 'study:st1',
    kind: 'study',
    label: 'study',
    content: { plan: true },
    schemaVersion: 'v1',
    parentIds: ['snapshot:s1'],
    sourceCommand: 'test'
  });
  builder.addNode({
    id: 'bundle:b1',
    kind: 'bundle',
    label: 'bundle',
    content: { zip: true },
    schemaVersion: 'v1',
    parentIds: ['experiment:e1', 'study:st1'],
    sourceCommand: 'test'
  });
  return builder.build();
}

describe('provenance graph', () => {
  it('orders nodes by artifact rank and records edges', () => {
    const graph = sampleGraph();
    expect(graph.schemaVersion).toBe('pendulum-provenance/v1');
    expect(graph.nodes.map((node) => node.kind)).toEqual(['snapshot', 'experiment', 'study', 'bundle']);
    expect(graph.edges).toContainEqual({ from: 'snapshot:s1', to: 'experiment:e1' });
    expect(graph.edges).toContainEqual({ from: 'study:st1', to: 'bundle:b1' });
    expect(graph.graphHash).toMatch(/^[0-9a-f]+$/);
  });

  it('every node carries hash, schemaVersion, generatedAt, sourceCommand, environment present', () => {
    const graph = sampleGraph();
    for (const node of graph.nodes) {
      expect(node.hash.length).toBeGreaterThan(0);
      expect(node.schemaVersion.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(node.generatedAt))).toBe(false);
      expect(node.sourceCommand.length).toBeGreaterThan(0);
    }
    expect(graph.environment.appVersion).toBe('test-app');
  });

  it('drops references to unknown parents instead of recording dangling edges', () => {
    const builder = new ProvenanceBuilder(collectEnvironment('x'));
    builder.addNode({
      id: 'figure:f1',
      kind: 'figure',
      label: 'fig',
      content: 1,
      schemaVersion: 'v1',
      parentIds: ['missing:p'],
      sourceCommand: 'test'
    });
    const graph = builder.build();
    expect(graph.nodes[0]!.parentIds).toEqual([]);
    expect(validateProvenanceGraph(graph).ok).toBe(true);
  });

  it('validates a healthy graph and flags duplicates and cycles', () => {
    const graph = sampleGraph();
    expect(validateProvenanceGraph(graph)).toEqual({ ok: true, problems: [] });

    const broken = JSON.parse(JSON.stringify(graph)) as ReturnType<typeof sampleGraph>;
    broken.nodes.push({ ...broken.nodes[0]! });
    expect(validateProvenanceGraph(broken).ok).toBe(false);

    const cyclic = JSON.parse(JSON.stringify(graph)) as ReturnType<typeof sampleGraph>;
    cyclic.edges.push({ from: 'bundle:b1', to: 'snapshot:s1' });
    cyclic.nodes.find((node) => node.id === 'snapshot:s1')!.parentIds.push('bundle:b1');
    const verdict = validateProvenanceGraph(cyclic);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join(' ')).toContain('cycle');
  });

  it('ranks all eight artifact kinds', () => {
    expect(kindRank('snapshot')).toBe(0);
    expect(kindRank('bundle')).toBe(7);
    expect(kindRank('worker-job')).toBeLessThan(kindRank('result'));
  });
});
