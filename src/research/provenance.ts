import { hashText } from './researchExportUtils';

/**
 * Provenance graph for research artifacts. Every artifact the workbench can
 * produce is a node in a DAG:
 *
 *   snapshot -> experiment -> study -> worker job -> result -> figure -> paper pack -> bundle
 *
 * Nodes carry a content hash, schema version, generation time, parents, the
 * command that produced them, and environment metadata, so an exported
 * `provenance.json` lets a reader reconstruct exactly how each figure or table
 * came to exist.
 */

export type ProvenanceKind =
  'snapshot' | 'experiment' | 'study' | 'worker-job' | 'result' | 'figure' | 'paper-pack' | 'bundle';

export interface ProvenanceNode {
  id: string;
  kind: ProvenanceKind;
  label: string;
  hash: string;
  schemaVersion: string;
  generatedAt: string;
  parentIds: string[];
  /** The user/CLI command or app action that produced the artifact. */
  sourceCommand: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface ProvenanceEnvironment {
  userAgent: string;
  platform: string;
  language: string;
  appVersion: string;
  generatedAt: string;
}

export interface ProvenanceGraph {
  schemaVersion: 'pendulum-provenance/v1';
  generatedAt: string;
  environment: ProvenanceEnvironment;
  nodes: ProvenanceNode[];
  /** Convenience edge list (parent -> child), derivable from parentIds. */
  edges: { from: string; to: string }[];
  graphHash: string;
}

const KIND_ORDER: ProvenanceKind[] = [
  'snapshot',
  'experiment',
  'study',
  'worker-job',
  'result',
  'figure',
  'paper-pack',
  'bundle'
];

export function kindRank(kind: ProvenanceKind): number {
  return KIND_ORDER.indexOf(kind);
}

export function collectEnvironment(appVersion: string): ProvenanceEnvironment {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  return {
    userAgent: nav?.userAgent ?? 'node',
    platform: nav?.platform ?? (typeof process === 'undefined' ? 'unknown' : process.platform),
    language: nav?.language ?? 'en',
    appVersion,
    generatedAt: new Date().toISOString()
  };
}

export class ProvenanceBuilder {
  private nodes = new Map<string, ProvenanceNode>();

  constructor(private readonly environment: ProvenanceEnvironment) {}

  addNode(input: {
    id: string;
    kind: ProvenanceKind;
    label: string;
    content: unknown;
    schemaVersion: string;
    parentIds?: string[];
    sourceCommand: string;
    generatedAt?: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): ProvenanceNode {
    const parents = (input.parentIds ?? []).filter((parentId) => this.nodes.has(parentId));
    const node: ProvenanceNode = {
      id: input.id,
      kind: input.kind,
      label: input.label.slice(0, 160),
      hash: hashText(JSON.stringify(input.content ?? input.id)),
      schemaVersion: input.schemaVersion,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      parentIds: parents,
      sourceCommand: input.sourceCommand.slice(0, 200),
      metadata: input.metadata ?? {}
    };
    this.nodes.set(node.id, node);
    return node;
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  build(): ProvenanceGraph {
    const nodes = [...this.nodes.values()].sort(
      (a, b) => kindRank(a.kind) - kindRank(b.kind) || a.generatedAt.localeCompare(b.generatedAt)
    );
    const edges: { from: string; to: string }[] = [];
    for (const node of nodes) {
      for (const parent of node.parentIds) edges.push({ from: parent, to: node.id });
    }
    return {
      schemaVersion: 'pendulum-provenance/v1',
      generatedAt: new Date().toISOString(),
      environment: this.environment,
      nodes,
      edges,
      graphHash: hashText(JSON.stringify(nodes.map((node) => [node.id, node.hash, node.parentIds])))
    };
  }
}

/** Validate a parsed provenance graph: ids unique, parents resolvable, acyclic. */
export function validateProvenanceGraph(graph: ProvenanceGraph): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) problems.push(`duplicate node id ${node.id}`);
    ids.add(node.id);
  }
  for (const node of graph.nodes) {
    for (const parent of node.parentIds) {
      if (!ids.has(parent)) problems.push(`node ${node.id} references missing parent ${parent}`);
    }
  }
  // Cycle check via Kahn's algorithm over the recorded edges.
  const inDegree = new Map<string, number>(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  const queue = graph.nodes.filter((node) => (inDegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const edge of graph.edges) {
      if (edge.from !== id) continue;
      const next = (inDegree.get(edge.to) ?? 0) - 1;
      inDegree.set(edge.to, next);
      if (next === 0) queue.push(edge.to);
    }
  }
  if (visited !== graph.nodes.length) problems.push('provenance graph contains a cycle');
  return { ok: problems.length === 0, problems };
}
