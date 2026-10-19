import { fields, invalid } from './contract-checks';
import { issue, type ContractIssue } from './validation';

const systems = new Set([
  'system:magnetic',
  'system:pendulum-network',
  'system:huygens-phase-pair',
  'system:kuramoto',
  'system:chimera-exploration'
]);
const identity = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(v);

/** Structural transport validation after inspectSafeData. Adapter owns weights, dimensions and graph semantics. */
export function checkNetworkTopology(
  value: unknown,
  systemId: unknown,
  modelVersion: unknown,
  issues: ContractIssue[]
): void {
  const path = '$.topology';
  if (typeof systemId !== 'string' || !systems.has(systemId) || modelVersion !== 'network-model-v1')
    issues.push(
      issue('unsupported-topology', path, 'Topology requires the supported network model version.', 'keep-original')
    );
  if (!fields(value, ['schema', 'nodes', 'edges'], ['ringOrder'], path, issues)) return;
  if (value.schema !== 'pendulum-network-topology/v1')
    issues.push(issue('unsupported-version', `${path}.schema`, 'Unsupported topology version.', 'keep-original'));
  if (!Array.isArray(value.nodes) || value.nodes.length < 1 || value.nodes.length > 128)
    invalid(issues, `${path}.nodes`, 'Expected 1–128 stable node identifiers.');
  if (!Array.isArray(value.edges) || value.edges.length > 4096)
    invalid(issues, `${path}.edges`, 'Expected at most 4096 undirected edges.');
  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  const nodeSet = new Set(nodes);
  if (nodes.some((node) => !identity(node)) || nodeSet.size !== nodes.length)
    invalid(issues, `${path}.nodes`, 'Node identifiers must be unique ASCII names (1–32 characters).');
  const edgeIds = new Set<string>(),
    pairs = new Set<string>();
  for (const [i, edge] of (Array.isArray(value.edges) ? value.edges : []).entries()) {
    const edgePath = `${path}.edges[${i}]`;
    if (!fields(edge, ['id', 'source', 'target'], [], edgePath, issues)) continue;
    if (!identity(edge.id) || edgeIds.has(edge.id))
      invalid(issues, `${edgePath}.id`, 'Edge identifiers must be unique ASCII names.');
    else edgeIds.add(edge.id);
    if (!identity(edge.source) || !identity(edge.target) || !nodeSet.has(edge.source) || !nodeSet.has(edge.target))
      invalid(issues, edgePath, 'Both edge endpoints must name existing nodes.');
    else {
      const pair = [edge.source, edge.target].sort().join(':');
      if (edge.source === edge.target || pairs.has(pair))
        invalid(issues, edgePath, 'Self edges and parallel undirected edges are unsupported.');
      pairs.add(pair);
    }
  }
  if (Object.hasOwn(value, 'ringOrder')) {
    const order = value.ringOrder;
    if (
      !Array.isArray(order) ||
      order.length !== nodes.length ||
      new Set(order).size !== nodes.length ||
      order.some((node) => !nodeSet.has(node))
    )
      invalid(issues, `${path}.ringOrder`, 'Ring order must contain every node exactly once.');
  } else if (systemId === 'system:chimera-exploration')
    invalid(issues, `${path}.ringOrder`, 'Chimera diagnostics require explicit physical ring order.');
}
