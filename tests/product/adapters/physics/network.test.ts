import { describe, expect, it } from 'vitest';
import { buildSynchronizationExploration } from '../../../../src/app/researchPlusModels';
import { rk4Step } from '../../../../src/physics/integrators';
import { rhsHuygensPhasePair, rhsKuramoto } from '../../../../src/physics/kuramoto';
import { magneticPendulumSettle, rhsMagneticPendulum } from '../../../../src/physics/magneticPendulum';
import { rhsPendulumNetwork } from '../../../../src/physics/pendulumNetwork';
import {
  createNetworkBasinJob,
  createNetworkSimulation,
  defaultNetworkConfig,
  fromCanonicalNetwork,
  networkMagneticParameters,
  networkPendulumParameters,
  networkPhaseParameters,
  networkSeededConfig,
  NETWORK_SYSTEM_IDS,
  resizeNetworkConfig,
  toCanonicalNetwork,
  validateNetworkConfig,
  type NetworkConfig
} from '../../../../src/product/adapters/physics/network';

function permute(c: NetworkConfig): NetworkConfig {
  const indices = c.graph.nodes.map((_, i) => i).reverse(),
    n = indices.length;
  return {
    ...c,
    graph: { ...c.graph, nodes: indices.map((i) => c.graph.nodes[i]!) },
    initialState:
      c.systemId === 'system:magnetic'
        ? c.initialState
        : c.systemId === 'system:pendulum-network'
          ? [...indices.map((i) => c.initialState[i]!), ...indices.map((i) => c.initialState[n + i]!)]
          : indices.map((i) => c.initialState[i]!)
  };
}
describe('S15 native equations, identity, and finite numerical fixtures', () => {
  it.each(NETWORK_SYSTEM_IDS.filter((id) => id !== 'system:chimera-exploration'))(
    '%s matches native RK4 states at every step',
    (systemId) => {
      const c = { ...defaultNetworkConfig(systemId), duration: 0.2 },
        sim = createNetworkSimulation(c);
      let state: Float64Array = Float64Array.from(c.initialState);
      const rhs = (s: Float64Array, out: Float64Array) =>
        systemId === 'system:magnetic'
          ? rhsMagneticPendulum(s, networkMagneticParameters(c), out)
          : systemId === 'system:pendulum-network'
            ? rhsPendulumNetwork(s, networkPendulumParameters(c), out)
            : systemId === 'system:huygens-phase-pair'
              ? rhsHuygensPhasePair(
                  s,
                  {
                    frequencies: [c.graph.nodes[0]!.frequency, c.graph.nodes[1]!.frequency],
                    coupling: c.parameters.coupling!,
                    phaseLag: c.parameters.phaseLag!
                  },
                  out
                )
              : rhsKuramoto(s, networkPhaseParameters(c), out);
      while (!sim.done) {
        const next = new Float64Array(state.length);
        rk4Step(state, c.step, rhs, next);
        state = next;
        expect(sim.step().state).toEqual(Array.from(state));
      }
    }
  );
  it('chimera matches the existing midpoint/wrapping exploration, with its actual thresholds', () => {
    const c = { ...defaultNetworkConfig('system:chimera-exploration'), duration: 2 },
      sim = createNetworkSimulation(c);
    while (!sim.done) sim.step();
    const native = buildSynchronizationExploration(c.parameters.coupling!, 'chimera-seed', {
      count: 32,
      steps: 100,
      dt: 0.02
    });
    expect(sim.snapshot().state).toEqual(native.finalPhases);
    expect(sim.snapshot().order).toBe(native.order.at(-1));
    expect(sim.snapshot().classification).toBe(native.chimera.classification);
    expect(sim.snapshot().localCoherence).toEqual(native.chimera.localOrder);
  });
  it.each(NETWORK_SYSTEM_IDS)('%s node permutation preserves dynamics, metrics, and ring identity', (systemId) => {
    const c = { ...defaultNetworkConfig(systemId), duration: 0.2 },
      a = createNetworkSimulation(c),
      b = createNetworkSimulation(permute(c));
    while (!a.done) {
      a.step();
      b.step();
    }
    const sa = a.snapshot(),
      sb = b.snapshot(),
      n = c.graph.nodes.length;
    const restored =
      systemId === 'system:magnetic'
        ? sb.state
        : systemId === 'system:pendulum-network'
          ? [...sb.state.slice(0, n).reverse(), ...sb.state.slice(n).reverse()]
          : [...sb.state].reverse();
    restored.forEach((v, i) => expect(Math.abs(v - sa.state[i]!)).toBeLessThan(1e-12));
    expect(Math.abs(sa.order - sb.order)).toBeLessThan(1e-12);
    expect(Math.abs(sa.energy - sb.energy)).toBeLessThan(1e-12);
    [...sb.localCoherence].reverse().forEach((v, i) => expect(Math.abs(v - sa.localCoherence[i]!)).toBeLessThan(1e-12));
    expect(sa.classification).toBe(sb.classification);
  });
  it.each(NETWORK_SYSTEM_IDS)(
    '%s deterministic seed is keyed by identity and survives canonical roundtrip',
    (systemId) => {
      const c = defaultNetworkConfig(systemId),
        a = networkSeededConfig(c, 'repeat-42'),
        b = networkSeededConfig(c, 'repeat-42');
      expect(a).toEqual(b);
      expect(a.initialState).not.toEqual(networkSeededConfig(c, 'other-42').initialState);
      expect(networkSeededConfig(permute(c), 'repeat-42')).toEqual(permute(a));
      const canonical = toCanonicalNetwork(a);
      if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
      expect(fromCanonicalNetwork(canonical.value)).toEqual({ ok: true, value: a });
    }
  );
  it('Huygens positive/negative coupling approach in-phase/anti-phase locking', () => {
    const base = defaultNetworkConfig('system:huygens-phase-pair');
    for (const coupling of [1, -1]) {
      const c = {
          ...base,
          duration: 12,
          parameters: { coupling, phaseLag: 0 },
          graph: { ...base.graph, nodes: base.graph.nodes.map((n) => ({ ...n, frequency: 1 })) },
          initialState: [0, 0.4]
        },
        s = createNetworkSimulation(c);
      while (!s.done) s.step();
      expect(Math.abs(Math.cos(s.snapshot().phaseDifference) - Math.sign(coupling))).toBeLessThan(1e-8);
    }
  });
  it('isolated phase nodes have zero local coherence and exact free drift', () => {
    const c = defaultNetworkConfig('system:kuramoto'),
      config = { ...c, graph: { ...c.graph, edges: [] }, duration: 0.1 },
      s = createNetworkSimulation(config);
    while (!s.done) s.step();
    expect(s.snapshot().localCoherence.every((x) => x === 0)).toBe(true);
    s.snapshot().state.forEach((x, i) =>
      expect(Math.abs(x - c.initialState[i]! - 0.1 * c.graph.nodes[i]!.frequency)).toBeLessThan(1e-12)
    );
  });
  it.each(['system:pendulum-network', 'system:kuramoto'] as const)(
    '%s regenerates radius ring including two-node boundary and maximum sparse network',
    (id) => {
      const c = defaultNetworkConfig(id),
        pair = resizeNetworkConfig(c, 2, 1),
        large = resizeNetworkConfig(c, 128, 2);
      expect(pair.graph.edges).toHaveLength(1);
      expect(validateNetworkConfig(pair).ok).toBe(true);
      expect(large.graph.edges).toHaveLength(256);
      expect(validateNetworkConfig(large).ok).toBe(true);
      const s = createNetworkSimulation({ ...large, duration: large.step });
      expect(s.step().nodeIds).toHaveLength(128);
    }
  );
  it('magnetic basin grid reproduces each native semi-implicit Euler cell including unresolved mask', () => {
    const c = defaultNetworkConfig(),
      config: NetworkConfig = { ...c, basin: { ...c.basin!, size: 3, maxSteps: 123 } },
      job = createNetworkBasinJob(config);
    while (!job.done) job.step();
    expect(job.snapshot().cells).toHaveLength(9);
    expect(job.snapshot().cells.some((cell) => !cell.converged)).toBe(true);
    for (const cell of job.snapshot().cells) {
      const native = magneticPendulumSettle(networkMagneticParameters(config), cell.x, cell.y, {
        dt: config.step,
        maxSteps: config.basin!.maxSteps,
        speedTolerance: config.basin!.speedTolerance
      });
      expect(cell).toMatchObject({
        magnetId: config.graph.nodes[native.magnet]!.id,
        steps: native.steps,
        converged: native.converged
      });
    }
  });
  it('continuation retains current node state and time while snapshots are detached', () => {
    const c = { ...defaultNetworkConfig('system:pendulum-network'), duration: 0.02 },
      a = createNetworkSimulation(c);
    a.step();
    const snapshot = a.snapshot(),
      restart = a.serialize(),
      b = createNetworkSimulation(restart);
    (snapshot.state as number[])[0] = 999;
    expect(a.step().state).toEqual(b.step().state);
    expect(a.snapshot().time).toBe(b.snapshot().time);
  });
});
