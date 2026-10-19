import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cpus, release } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { buildSynchronizationExploration } from '../../src/app/researchPlusModels';
import { rk4Step } from '../../src/physics/integrators';
import { rhsHuygensPhasePair, rhsKuramoto } from '../../src/physics/kuramoto';
import { magneticPendulumSettle, rhsMagneticPendulum } from '../../src/physics/magneticPendulum';
import { rhsPendulumNetwork } from '../../src/physics/pendulumNetwork';
import {
  createNetworkBasinJob,
  createNetworkSimulation,
  defaultNetworkConfig,
  fromCanonicalNetwork,
  NETWORK_SYSTEM_IDS,
  networkMagneticParameters,
  networkPendulumParameters,
  networkPhaseParameters,
  networkSeededConfig,
  resizeNetworkConfig,
  toCanonicalNetwork,
  type NetworkConfig
} from '../../src/product/adapters/physics/network';
import {
  createNetworkBasinWorkerSession,
  createNetworkWorkerSession
} from '../../src/product/adapters/physics/network-worker-protocol';

const started = performance.now(),
  tolerance = 1e-12;
const nativeRk4 = NETWORK_SYSTEM_IDS.filter((id) => id !== 'system:chimera-exploration').map((systemId) => {
  const config = { ...defaultNetworkConfig(systemId), duration: 0.2 },
    simulation = createNetworkSimulation(config);
  let state: Float64Array = Float64Array.from(config.initialState),
    maxStateAbsDifference = 0;
  const rhs = (s: Float64Array, out: Float64Array) =>
    systemId === 'system:magnetic'
      ? rhsMagneticPendulum(s, networkMagneticParameters(config), out)
      : systemId === 'system:pendulum-network'
        ? rhsPendulumNetwork(s, networkPendulumParameters(config), out)
        : systemId === 'system:huygens-phase-pair'
          ? rhsHuygensPhasePair(
              s,
              {
                frequencies: [config.graph.nodes[0]!.frequency, config.graph.nodes[1]!.frequency],
                coupling: config.parameters.coupling!,
                phaseLag: config.parameters.phaseLag!
              },
              out
            )
          : rhsKuramoto(s, networkPhaseParameters(config), out);
  while (!simulation.done) {
    const out = new Float64Array(state.length);
    rk4Step(state, config.step, rhs, out);
    state = out;
    simulation
      .step()
      .state.forEach((v, i) => (maxStateAbsDifference = Math.max(maxStateAbsDifference, Math.abs(v - state[i]!))));
  }
  return { config, maxStateAbsDifference, executedSteps: simulation.snapshot().step };
});
function run(config: NetworkConfig) {
  const simulation = createNetworkSimulation(config);
  while (!simulation.done) simulation.step();
  return simulation.snapshot();
}
const chimeraConfig = { ...defaultNetworkConfig('system:chimera-exploration'), duration: 2 },
  chimeraSample = run(chimeraConfig),
  nativeChimera = buildSynchronizationExploration(chimeraConfig.parameters.coupling!, 'chimera-seed', {
    count: 32,
    steps: 100,
    dt: 0.02
  });
const chimera = {
  config: chimeraConfig,
  nativeMaxStateAbsDifference: Math.max(
    ...chimeraSample.state.map((v, i) => Math.abs(v - nativeChimera.finalPhases[i]!))
  ),
  nativeOrderAbsDifference: Math.abs(chimeraSample.order - nativeChimera.order.at(-1)!),
  localCoherenceAbsDifference: Math.max(
    ...chimeraSample.localCoherence.map((v, i) => Math.abs(v - nativeChimera.chimera.localOrder[i]!))
  ),
  classification: chimeraSample.classification,
  nativeClassification: nativeChimera.chimera.classification,
  method:
    'Existing exploration midpoint RK2 and per-step atan2 wrapping; native diagnostic thresholds coherent0.9/incoherent0.3.'
};
const permutations = NETWORK_SYSTEM_IDS.map((systemId) => {
  const config = { ...defaultNetworkConfig(systemId), duration: 0.2 },
    indices = config.graph.nodes.map((_, i) => i).reverse(),
    n = indices.length;
  const permuted = {
    ...config,
    graph: { ...config.graph, nodes: indices.map((i) => config.graph.nodes[i]!) },
    initialState:
      systemId === 'system:magnetic'
        ? config.initialState
        : systemId === 'system:pendulum-network'
          ? [...indices.map((i) => config.initialState[i]!), ...indices.map((i) => config.initialState[n + i]!)]
          : indices.map((i) => config.initialState[i]!)
  };
  const original = run(config),
    changed = run(permuted);
  const restored =
    systemId === 'system:magnetic'
      ? changed.state
      : systemId === 'system:pendulum-network'
        ? [...changed.state.slice(0, n).reverse(), ...changed.state.slice(n).reverse()]
        : [...changed.state].reverse();
  return {
    systemId,
    duration: config.duration,
    permutation: indices,
    maxStateAbsDifference: Math.max(...restored.map((v, i) => Math.abs(v - original.state[i]!))),
    orderAbsDifference: Math.abs(original.order - changed.order),
    energyAbsDifference: Math.abs(original.energy - changed.energy),
    localCoherenceAbsDifference: original.localCoherence.length
      ? Math.max(...[...changed.localCoherence].reverse().map((v, i) => Math.abs(v - original.localCoherence[i]!)))
      : 0,
    sameClassification: original.classification === changed.classification,
    ringOrder: config.graph.ringOrder
  };
});
const seedRoundtrip = NETWORK_SYSTEM_IDS.map((systemId) => {
  const config = networkSeededConfig(defaultNetworkConfig(systemId), 'metrics-15'),
    repeated = networkSeededConfig(defaultNetworkConfig(systemId), 'metrics-15'),
    canonical = toCanonicalNetwork(config);
  if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
  const restored = fromCanonicalNetwork(canonical.value);
  if (!restored.ok) throw new Error(JSON.stringify(restored.issues));
  return {
    systemId,
    seed: config.seed,
    initialState: config.initialState,
    deterministic: isDeepStrictEqual(config, repeated),
    roundtrip: isDeepStrictEqual(config, restored.value),
    preservedTopology: isDeepStrictEqual(config.graph, restored.value.graph)
  };
});
const basinBase = defaultNetworkConfig();
function measureBasin(config: NetworkConfig) {
  const job = createNetworkBasinJob(config);
  while (!job.done) job.step();
  const cells = job.snapshot().cells.map((cell) => {
    const native = magneticPendulumSettle(networkMagneticParameters(config), cell.x, cell.y, {
      dt: config.step,
      maxSteps: config.basin!.maxSteps,
      speedTolerance: config.basin!.speedTolerance
    });
    return {
      ...cell,
      nativeMagnetId: config.graph.nodes[native.magnet]!.id,
      nativeConverged: native.converged,
      nativeSteps: native.steps,
      parity:
        cell.magnetId === config.graph.nodes[native.magnet]!.id &&
        cell.converged === native.converged &&
        cell.steps === native.steps
    };
  });
  return {
    config,
    method:
      'Native velocity-first semi-implicit Euler, one bounded RHS update at a time; stop after51consecutive low-speed updates or maxSteps; native converged mask is final speed < tolerance.',
    cells,
    unresolvedCount: cells.filter((c) => !c.converged).length
  };
}
const basin = measureBasin({ ...basinBase, basin: { ...basinBase.basin!, size: 3, maxSteps: 123 } });
const representativeBasin = measureBasin({
  ...basinBase,
  step: 0.005,
  basin: {
    ...basinBase.basin!,
    size: 2,
    xMin: -Math.sqrt(3) / 2,
    xMax: Math.sqrt(3) / 2,
    yMin: -0.5,
    yMax: 1,
    maxSteps: 10000,
    speedTolerance: 0.01
  }
});
const huygensBase = defaultNetworkConfig('system:huygens-phase-pair');
const locking = [1, -1].map((coupling) => {
  const config = {
      ...huygensBase,
      duration: 12,
      parameters: { coupling, phaseLag: 0 },
      graph: { ...huygensBase.graph, nodes: huygensBase.graph.nodes.map((n) => ({ ...n, frequency: 1 })) },
      initialState: [0, 0.4]
    },
    sample = run(config);
  return {
    config,
    phaseDifference: sample.phaseDifference,
    cosPhaseDifference: Math.cos(sample.phaseDifference),
    expectedCos: Math.sign(coupling),
    residual: Math.abs(Math.cos(sample.phaseDifference) - Math.sign(coupling))
  };
});
const synchronization = [0, 5].map((coupling) => {
  const base = defaultNetworkConfig('system:kuramoto'),
    config = { ...base, duration: 10, parameters: { ...base.parameters, coupling } };
  return { config, initialOrder: createNetworkSimulation(config).snapshot().order, finalOrder: run(config).order };
});
const performanceSamples = [8, 32, 128].map((count) => {
  const config = { ...resizeNetworkConfig(defaultNetworkConfig('system:kuramoto'), count, 2), duration: 10 },
    session = createNetworkWorkerSession(),
    initial = performance.now();
  const ready = session.handle({ type: 'initialize', id: 'size', sequence: 0, config });
  const initializationMs = performance.now() - initial,
    requestStarted = performance.now();
  const progress = session.handle({ type: 'advance', id: 'size', sequence: 1, count: 64 });
  const requestMs = performance.now() - requestStarted;
  const cancel = session.handle({ type: 'cancel', id: 'size', sequence: 2 });
  return {
    count,
    edges: config.graph.edges.length,
    initializationMs,
    requestMs,
    ready: ready.type,
    advanced: progress.type === 'progress' ? progress.advanced : 0,
    reachedStep: progress.type === 'progress' ? progress.sample.step : 0,
    incompleteBeforeCancel: progress.type === 'progress' && !progress.done,
    cancelled: cancel.type === 'cancelled',
    note: 'Single local wall-clock observation including diagnostics/serialization;8ms is a between-step budget, not a hard deadline.'
  };
});
const basinSession = createNetworkBasinWorkerSession(() => 0),
  largeBasin = { ...basinBase, basin: { ...basinBase.basin!, size: 16, maxSteps: 10000 } };
basinSession.handle({ type: 'initialize-basin', id: 'grid', sequence: 0, config: largeBasin });
const partialBasin = basinSession.handle({ type: 'advance', id: 'grid', sequence: 1, count: 64 }),
  cancelledBasin = basinSession.handle({ type: 'cancel', id: 'grid', sequence: 2 });
const basinCancellation = {
  totalCells: 256,
  maximumStepsPerCell: 10000,
  advanced: partialBasin.type === 'progress' ? partialBasin.advanced : 0,
  completedCells: partialBasin.type === 'progress' ? partialBasin.basin.completed : -1,
  cancelled: cancelledBasin.type === 'cancelled'
};
const report = {
  schemaVersion: 'S15-numerical-metrics/v1',
  recordedAtUtc: new Date().toISOString(),
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  command: 'node --import tsx scripts/redesign/measure-network-numerics.ts',
  environment: { platform: process.platform, release: release(), node: process.version, cpu: cpus()[0]?.model },
  tolerance,
  nativeRk4,
  chimera,
  permutations,
  seedRoundtrip,
  basin,
  representativeBasin,
  locking,
  synchronization,
  performanceSamples,
  basinCancellation,
  checks: {
    nativeRk4Parity: nativeRk4.every((e) => e.maxStateAbsDifference < tolerance),
    chimeraParity:
      chimera.nativeMaxStateAbsDifference < tolerance &&
      chimera.nativeOrderAbsDifference < tolerance &&
      chimera.localCoherenceAbsDifference < tolerance &&
      chimera.classification === chimera.nativeClassification,
    permutationParity: permutations.every(
      (p) =>
        [p.maxStateAbsDifference, p.orderAbsDifference, p.energyAbsDifference, p.localCoherenceAbsDifference].every(
          (v) => v < tolerance
        ) && p.sameClassification
    ),
    seedRoundtrip: seedRoundtrip.every((p) => p.deterministic && p.roundtrip && p.preservedTopology),
    basinNativeParity: [...basin.cells, ...representativeBasin.cells].every((c) => c.parity),
    selectedLocking: locking.every((l) => l.residual < 1e-8),
    largeNetworkCancellation: performanceSamples.every(
      (p) => p.ready === 'ready' && p.advanced >= 1 && p.advanced <= 64 && p.cancelled && p.incompleteBeforeCancel
    ),
    basinInsideCellCancellation:
      basinCancellation.advanced === 64 && basinCancellation.completedCells === 0 && basinCancellation.cancelled
  },
  limitations: [
    'Selected finite fixtures and component absolute differences only; no general accuracy, stability, synchronization threshold, basin/Wada boundary or long-lived chimera proof.',
    'Magnetic coordinates, coefficients, energy and time are normalized. Runtime seconds are a carrier qualified by required timeConvention metadata.',
    'Pendulum graph edge canonical J treats radians dimensionlessly; UI describes J/rad². Graph phase coupling is row-normalized without self edges, distinct from native self-inclusive mean-field K/N.',
    'Huygens is phase reduction without mechanical escapement or support motion. The zero-lag equal-frequency locking fixture does not establish general locking domains.',
    'Chimera profile uses stable ringOrder independent of storage order. Coherent0.9/incoherent0.3 are native exploration thresholds.',
    'Basin nearest IDs and final-speed masks are native finite-budget classifications. A true mask does not certify sustained rest or the mathematical attractor.',
    'Sparse128-node performance is not a dense graph benchmark, cross-device budget guarantee or percentile measurement. No human scientific review occurred.'
  ],
  elapsedMs: performance.now() - started
};
writeFileSync(
  process.argv[2]
    ? resolve(process.argv[2])
    : new URL('../../documents/redesign/stage-runs/S15-numerical-metrics.json', import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(
  JSON.stringify(
    {
      checks: report.checks,
      nativeRk4: nativeRk4.map((e) => ({
        systemId: e.config.systemId,
        maxStateAbsDifference: e.maxStateAbsDifference
      })),
      chimera: {
        nativeMaxStateAbsDifference: chimera.nativeMaxStateAbsDifference,
        classification: chimera.classification
      },
      permutations,
      unresolvedBasinCells: basin.unresolvedCount,
      representativeBasin: {
        cells: representativeBasin.cells,
        unresolvedCount: representativeBasin.unresolvedCount
      },
      locking: locking.map(({ config, ...values }) => ({ coupling: config.parameters.coupling, ...values })),
      synchronization: synchronization.map((e) => ({
        coupling: e.config.parameters.coupling,
        initialOrder: e.initialOrder,
        finalOrder: e.finalOrder
      })),
      performanceSamples,
      basinCancellation,
      elapsedMs: report.elapsedMs
    },
    null,
    2
  )
);
if (Object.values(report.checks).some((passed) => !passed))
  throw new Error('S15 numerical check failed. Inspect the saved report without changing the fixed tolerances.');
