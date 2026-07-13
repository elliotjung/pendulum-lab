/**
 * Recurrence network analysis (Donner et al., New J. Phys. 2010): interpret the
 * recurrence matrix R as the adjacency matrix of an undirected graph (self-loops
 * removed). Network measures — edge density, degree statistics, local
 * clustering / global transitivity, average shortest path — characterise the
 * attractor's geometry independently of the diagonal-line RQA measures.
 */

export interface RecurrenceNetworkMetrics {
  nodes: number;
  edges: number;
  /** Edge density = 2E / (N(N-1)) — equals the recurrence rate without the LOI. */
  density: number;
  meanDegree: number;
  maxDegree: number;
  degreeStd: number;
  /** Mean local clustering coefficient (Watts–Strogatz). */
  clusteringCoefficient: number;
  /** Global transitivity = 3·triangles / connected triples. */
  transitivity: number;
  /** Average shortest-path length over the largest connected component (BFS). */
  averagePathLength: number;
  /** Nodes in the largest connected component. */
  largestComponent: number;
  caveat: string;
}

/** Build metrics from a row-major 0/1 recurrence matrix of size n×n. */
export function recurrenceNetworkMetrics(matrix: ArrayLike<number>, n: number): RecurrenceNetworkMetrics {
  // Adjacency lists, excluding the trivial self-recurrence diagonal.
  const neighbors: number[][] = Array.from({ length: n }, () => []);
  let edges = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if ((matrix[i * n + j] ?? 0) > 0) {
        neighbors[i]!.push(j);
        neighbors[j]!.push(i);
        edges += 1;
      }
    }
  }

  const degrees = neighbors.map((list) => list.length);
  const meanDegree = n > 0 ? degrees.reduce((sum, d) => sum + d, 0) / n : 0;
  const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0;
  const degreeVariance = n > 0 ? degrees.reduce((sum, d) => sum + (d - meanDegree) ** 2, 0) / n : 0;

  // Local clustering and triangle census.
  const adjacency = new Set<number>();
  for (let i = 0; i < n; i += 1) {
    for (const j of neighbors[i]!) adjacency.add(i * n + j);
  }
  let clusteringSum = 0;
  let clusteringNodes = 0;
  let trianglesX3 = 0;
  let triples = 0;
  for (let i = 0; i < n; i += 1) {
    const list = neighbors[i]!;
    const k = list.length;
    triples += (k * (k - 1)) / 2;
    if (k < 2) continue;
    let links = 0;
    for (let a = 0; a < k; a += 1) {
      for (let b = a + 1; b < k; b += 1) {
        if (adjacency.has(list[a]! * n + list[b]!)) links += 1;
      }
    }
    trianglesX3 += links; // each triangle counted once per vertex => 3 total
    clusteringSum += (2 * links) / (k * (k - 1));
    clusteringNodes += 1;
  }

  // BFS path lengths over the largest component (exact for the small RQA plots used here).
  const component = new Int32Array(n).fill(-1);
  let componentCount = 0;
  const componentSizes: number[] = [];
  for (let start = 0; start < n; start += 1) {
    if (component[start] !== -1) continue;
    const queue = [start];
    component[start] = componentCount;
    let size = 0;
    while (queue.length > 0) {
      const node = queue.pop()!;
      size += 1;
      for (const next of neighbors[node]!) {
        if (component[next] === -1) {
          component[next] = componentCount;
          queue.push(next);
        }
      }
    }
    componentSizes.push(size);
    componentCount += 1;
  }
  const largestComponentIndex = componentSizes.indexOf(Math.max(0, ...componentSizes));
  const largestComponent = componentSizes[largestComponentIndex] ?? 0;

  let pathSum = 0;
  let pathPairs = 0;
  if (largestComponent > 1 && largestComponent <= 1200) {
    const members: number[] = [];
    for (let i = 0; i < n; i += 1) if (component[i] === largestComponentIndex) members.push(i);
    const distanceRow = new Int32Array(n);
    for (const source of members) {
      distanceRow.fill(-1);
      distanceRow[source] = 0;
      const queue = [source];
      let head = 0;
      while (head < queue.length) {
        const node = queue[head]!;
        head += 1;
        for (const next of neighbors[node]!) {
          if (distanceRow[next] === -1) {
            distanceRow[next] = distanceRow[node]! + 1;
            queue.push(next);
          }
        }
      }
      for (const target of members) {
        if (target > source && distanceRow[target]! > 0) {
          pathSum += distanceRow[target]!;
          pathPairs += 1;
        }
      }
    }
  }

  return {
    nodes: n,
    edges,
    density: n > 1 ? (2 * edges) / (n * (n - 1)) : 0,
    meanDegree,
    maxDegree,
    degreeStd: Math.sqrt(degreeVariance),
    clusteringCoefficient: clusteringNodes > 0 ? clusteringSum / clusteringNodes : 0,
    transitivity: triples > 0 ? trianglesX3 / triples : 0,
    averagePathLength: pathPairs > 0 ? pathSum / pathPairs : 0,
    largestComponent,
    caveat:
      'Network measures depend on the embedding/threshold used to build the recurrence matrix; compare only across runs with identical RQA settings.'
  };
}
