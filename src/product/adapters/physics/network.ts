import { chimeraDiagnostics } from '../../../chaos/chimera';
import { rk4Step } from '../../../physics/integrators';
import {
  kuramotoLocalOrderParameters,
  kuramotoOrderParameter,
  rhsHuygensPhasePair,
  rhsKuramoto,
  type KuramotoNetworkParameters
} from '../../../physics/kuramoto';
import {
  magneticPendulumEnergy,
  nearestMagnetIndex,
  rhsMagneticPendulum,
  type MagneticPendulumParameters
} from '../../../physics/magneticPendulum';
import {
  buildCouplingMatrix,
  pendulumNetworkEnergy,
  rhsPendulumNetwork,
  type PendulumNetworkParameters
} from '../../../physics/pendulumNetwork';
import type { StateVector } from '../../../physics/types';
import type { ContractIssue } from '../../contracts/validation';
import { networkStepCount, validateNetworkConfig } from './network-contract';
import {
  networkWarnings,
  type NetworkBasinCell,
  type NetworkBasinSnapshot,
  type NetworkConfig,
  type NetworkSample
} from './network-schema';
export * from './network-schema';
export * from './network-contract';

export class NetworkConfigurationError extends Error {
  constructor(readonly issues: readonly ContractIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
    this.name = 'NetworkConfigurationError';
  }
}
const number = (x: number) => (x === 0 ? 0 : x);
function validConfig(input: NetworkConfig): NetworkConfig {
  const checked = validateNetworkConfig(input);
  if (!checked.ok) throw new NetworkConfigurationError(checked.issues);
  return checked.value;
}
function finite(state: ArrayLike<number>) {
  if (Array.from(state).some((x) => !Number.isFinite(x) || Math.abs(x) > 1e6))
    throw new Error('유한 안전 범위를 벗어나 마지막 유효 상태에서 중지했습니다. 시간 간격·초기조건·물성을 줄이세요.');
}
export function networkAdjacency(config: NetworkConfig): Float64Array {
  const n = config.graph.nodes.length,
    indices = new Map(config.graph.nodes.map((node, i) => [node.id, i]));
  return buildCouplingMatrix(
    n,
    config.graph.edges.map((edge) => ({
      i: indices.get(edge.source)!,
      j: indices.get(edge.target)!,
      kappa: edge.weight
    }))
  );
}
export function networkMagneticParameters(config: NetworkConfig): MagneticPendulumParameters {
  return {
    magnets: config.graph.nodes.map((n) => ({ x: n.x, y: n.y, strength: n.strength })),
    restoring: config.parameters.restoring!,
    damping: config.parameters.damping!,
    height: config.parameters.height!
  };
}
export function networkPendulumParameters(config: NetworkConfig): PendulumNetworkParameters {
  return {
    masses: config.graph.nodes.map((n) => n.mass),
    lengths: config.graph.nodes.map((n) => n.length),
    damping: config.graph.nodes.map((n) => n.damping),
    g: config.parameters.g!,
    coupling: networkAdjacency(config)
  };
}
export function networkPhaseParameters(config: NetworkConfig): KuramotoNetworkParameters {
  return {
    naturalFrequencies: config.graph.nodes.map((n) => n.frequency),
    coupling: config.parameters.coupling!,
    phaseLag: config.parameters.phaseLag!,
    adjacency: networkAdjacency(config)
  };
}
/** Native equations only. The internal chimera step mirrors the existing exploration midpoint RK2 and wrapping. */
export function createNetworkSimulation(input: NetworkConfig) {
  const config = validConfig(input),
    id = config.systemId,
    n = config.graph.nodes.length,
    total = networkStepCount(config),
    adjacency = networkAdjacency(config);
  const magnetic = id === 'system:magnetic' ? networkMagneticParameters(config) : undefined;
  const pendulum = id === 'system:pendulum-network' ? networkPendulumParameters(config) : undefined;
  const phase = magnetic || pendulum ? undefined : networkPhaseParameters(config);
  const ringIndices = config.graph.ringOrder?.map((nodeId) =>
    config.graph.nodes.findIndex((node) => node.id === nodeId)
  );
  const warnings = networkWarnings(config);
  let state: Float64Array = Float64Array.from(config.initialState),
    index = 0,
    failure: Error | undefined;
  const rhs = (s: StateVector, out: StateVector) => {
    finite(s);
    if (magnetic) rhsMagneticPendulum(s, magnetic, out);
    else if (pendulum) rhsPendulumNetwork(s, pendulum, out);
    else if (id === 'system:huygens-phase-pair')
      rhsHuygensPhasePair(
        s,
        {
          frequencies: [phase!.naturalFrequencies[0]!, phase!.naturalFrequencies[1]!],
          coupling: phase!.coupling,
          phaseLag: phase!.phaseLag!
        },
        out
      );
    else rhsKuramoto(s, phase!, out);
  };
  function sample(s: Float64Array, step: number): NetworkSample {
    const phases = magnetic ? [] : Array.from(s.slice(0, n));
    const order = magnetic ? 0 : kuramotoOrderParameter(phases).magnitude;
    let localCoherence = magnetic ? [] : kuramotoLocalOrderParameters(phases, adjacency).map((p) => p.magnitude);
    let classification = magnetic
      ? config.graph.nodes[nearestMagnetIndex(s[0]!, s[1]!, magnetic)]!.id
      : pendulum
        ? 'angular-alignment'
        : 'phase-alignment';
    if (id === 'system:chimera-exploration') {
      const diagnostics = chimeraDiagnostics(
        ringIndices!.map((i) => phases[i]!),
        { radius: config.parameters.radius!, coherentThreshold: 0.9, incoherentThreshold: 0.3 }
      );
      classification = diagnostics.classification;
      localCoherence = phases.map((_, i) => diagnostics.localOrder[ringIndices!.indexOf(i)]!);
    }
    const positions = magnetic
      ? [{ x: s[0]!, y: s[1]! }]
      : pendulum
        ? config.graph.nodes.map((node, i) => ({
            x: node.x + node.length * Math.sin(s[i]!),
            y: node.y - node.length * Math.cos(s[i]!)
          }))
        : phases.map((p) => ({ x: Math.cos(p), y: Math.sin(p) }));
    const energy = magnetic
      ? magneticPendulumEnergy(s, magnetic).total
      : pendulum
        ? pendulumNetworkEnergy(s, pendulum).total
        : 0;
    const result: NetworkSample = {
      step,
      time: (config.startTime ?? 0) + Math.min(step * config.step, config.duration),
      state: Array.from(s).map(number),
      positions,
      nodeIds: config.graph.nodes.map((node) => node.id),
      phases,
      order: number(order),
      meanLocalOrder: localCoherence.length ? localCoherence.reduce((a, b) => a + b, 0) / localCoherence.length : 0,
      localCoherence,
      energy: number(energy),
      energyUnit: magnetic ? '정규화' : pendulum ? 'J' : '없음',
      phaseDifference:
        phases.length > 1 ? Math.atan2(Math.sin(phases[1]! - phases[0]!), Math.cos(phases[1]! - phases[0]!)) : 0,
      classification,
      warnings
    };
    finite([energy, result.meanLocalOrder, order, ...positions.flatMap((p) => [p.x, p.y]), ...localCoherence]);
    return result;
  }
  let accepted = sample(state, 0);
  function step(): NetworkSample {
    if (failure) throw failure;
    if (index >= total) return structuredClone(accepted);
    try {
      const h = Math.min(config.step, config.duration - index * config.step);
      const next = new Float64Array(state.length);
      if (id === 'system:chimera-exploration') {
        const derivative = new Float64Array(n),
          midpointDerivative = new Float64Array(n),
          midpoint = new Float64Array(n);
        rhs(state, derivative);
        for (let i = 0; i < n; i++) midpoint[i] = state[i]! + 0.5 * h * derivative[i]!;
        rhs(midpoint, midpointDerivative);
        for (let i = 0; i < n; i++) {
          const v = state[i]! + h * midpointDerivative[i]!;
          next[i] = Math.atan2(Math.sin(v), Math.cos(v));
        }
      } else rk4Step(state, h, rhs, next);
      finite(next);
      const candidate = sample(next, index + 1);
      state = next;
      index++;
      accepted = candidate;
      return structuredClone(accepted);
    } catch (cause) {
      failure = cause instanceof Error ? cause : new Error('네트워크 계산에 실패했습니다.');
      throw failure;
    }
  }
  return {
    get config() {
      return structuredClone(config);
    },
    get done() {
      return index >= total;
    },
    snapshot: () => structuredClone(accepted),
    step,
    advance(count: number) {
      if (!Number.isInteger(count) || count < 1 || count > 64) throw new RangeError('1–64 단계를 요청하세요.');
      for (let i = 0; i < count && index < total; i++) step();
      return structuredClone(accepted);
    },
    serialize: (): NetworkConfig => ({
      ...structuredClone(config),
      initialState: Array.from(state).map(number),
      startTime: accepted.time
    }),
    warnings: () => [...warnings]
  };
}
/** Bounded orchestration of the exact native settle loop, allowing cancellation inside a single grid cell. */
export function createNetworkBasinJob(input: NetworkConfig) {
  const config = validConfig(input);
  if (config.systemId !== 'system:magnetic' || !config.basin) throw new Error('자기 모델과 basin 설정이 필요합니다.');
  const b = config.basin,
    parameters = networkMagneticParameters(config),
    cells: NetworkBasinCell[] = [],
    total = b.size * b.size;
  let state = new Float64Array(4),
    steps = 0,
    restCount = 0;
  const derivative = new Float64Array(4);
  function point() {
    const i = cells.length;
    return {
      x: b.xMin + ((b.xMax - b.xMin) * (i % b.size)) / (b.size - 1),
      y: b.yMin + ((b.yMax - b.yMin) * Math.floor(i / b.size)) / (b.size - 1)
    };
  }
  function reset() {
    const p = point();
    state = Float64Array.of(p.x, p.y, 0, 0);
    steps = 0;
    restCount = 0;
  }
  reset();
  function step() {
    if (cells.length >= total) return;
    rhsMagneticPendulum(state, parameters, derivative);
    const vx = state[2]! + config.step * derivative[2]!,
      vy = state[3]! + config.step * derivative[3]!;
    const next = Float64Array.of(state[0]! + config.step * vx, state[1]! + config.step * vy, vx, vy);
    finite(next);
    state = next;
    steps++;
    const speed = Math.hypot(vx, vy);
    restCount = speed < b.speedTolerance ? restCount + 1 : 0;
    if (restCount > 50 || steps === b.maxSteps) {
      const p = point();
      cells.push({
        ...p,
        magnetId: config.graph.nodes[nearestMagnetIndex(state[0]!, state[1]!, parameters)]!.id,
        converged: speed < b.speedTolerance,
        steps
      });
      if (cells.length < total) reset();
    }
  }
  return {
    get done() {
      return cells.length >= total;
    },
    step,
    snapshot: (): NetworkBasinSnapshot => ({
      width: b.size,
      height: b.size,
      cells: structuredClone(cells),
      completed: cells.length,
      total
    })
  };
}
