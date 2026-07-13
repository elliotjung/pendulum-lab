import { energyDriven, rhsDriven, type DrivenParameters } from './driven';
import { energyChain, rhsChain, type ChainParameters } from './nPendulum';
import {
  sphericalEnergy,
  sphericalPosition,
  sphericalRhs,
  type SphericalParams,
  type SphericalState
} from './spherical';
import type { IntegratorId } from '../types/domain';
import type { StateVector } from './types';
import {
  type ExpansionModelDefinition,
  type ExpansionModelId,
  type ExpansionParameterMap,
  type ExpansionPoint,
  type ExpansionPreset,
  type ExpansionSystem
} from './expandedModels-types';

// ===== Section: Constants and Model Definitions ==============================

export const DEFAULT_EXPANSION_METHODS: readonly IntegratorId[] = ['rk4', 'dopri5', 'leapfrog', 'symplectic', 'euler'];

export const EXPANSION_MODEL_DEFINITIONS: readonly ExpansionModelDefinition[] = [
  {
    id: 'driven',
    label: 'Forced and Damped Pendulum',
    family: 'single-pendulum chaos',
    dimension: 3,
    conservative: false,
    defaultDt: 0.01,
    defaultHorizon: 28,
    defaultState: [0.2, 0, 0],
    defaultParameters: { g: 1, length: 1, damping: 0.5, driveAmplitude: 1.15, driveFrequency: 2 / 3 },
    sweep: { parameter: 'driveAmplitude', label: 'drive', min: 0.7, max: 1.45 },
    equation: "theta' = omega; omega' = -(g/l) sin(theta) - gamma omega + A cos(phi); phi' = Omega.",
    energyNote: 'Mechanical bob energy is diagnostic only because damping and drive exchange energy with the system.',
    caveat: 'Do not quote energy drift as conservation error when drive or damping is active.'
  },
  {
    id: 'coupled',
    label: 'Coupled Pendulums',
    family: 'normal modes and energy exchange',
    dimension: 4,
    conservative: true,
    defaultDt: 0.006,
    defaultHorizon: 22,
    defaultState: [0.65, -0.2, 0, 0],
    defaultParameters: { g: 9.81, length: 1, coupling: 2.2, damping: 0 },
    sweep: { parameter: 'coupling', label: 'coupling', min: 0.1, max: 5 },
    equation:
      "theta_i' = omega_i; omega_1' = -(g/l) sin(theta_1) - k(theta_1-theta_2); omega_2' = -(g/l) sin(theta_2) + k(theta_1-theta_2).",
    energyNote: 'Energy includes two pendulum potentials plus a quadratic coupling spring.',
    caveat: 'The coupling is a compact educational model, not a full elastic-rod derivation.'
  },
  {
    id: 'inverted',
    label: 'Inverted Pendulum',
    family: 'unstable equilibrium',
    dimension: 2,
    conservative: true,
    defaultDt: 0.004,
    defaultHorizon: 10,
    defaultState: [0.035, 0],
    defaultParameters: { g: 9.81, length: 1, damping: 0 },
    sweep: { parameter: 'damping', label: 'damping', min: 0, max: 1.2 },
    equation: "theta' = omega; omega' = (g/l) sin(theta) - gamma omega.",
    energyNote: 'Energy is measured relative to the upright potential peak.',
    caveat: 'The equilibrium is exponentially unstable; long-horizon agreement is not expected.'
  },
  {
    id: 'cartpole',
    label: 'Cart-Pole',
    family: 'underactuated control benchmark',
    dimension: 4,
    conservative: true,
    defaultDt: 0.006,
    defaultHorizon: 9,
    defaultState: [0, 0.12, 0, 0],
    defaultParameters: { cartMass: 1, poleMass: 0.16, length: 0.75, g: 9.81, force: 0, friction: 0 },
    sweep: { parameter: 'force', label: 'force', min: -3, max: 3 },
    equation: "x' = v; theta' = omega; accelerations follow the standard underactuated cart-pole equations.",
    energyNote: 'Energy combines cart kinetic energy, pole kinetic energy, and upright pole potential.',
    caveat: 'No controller is applied; the force parameter is open-loop and constant.'
  },
  {
    id: 'parametric',
    label: 'Parametric Pendulum',
    family: 'time-periodic excitation',
    dimension: 3,
    conservative: false,
    defaultDt: 0.008,
    defaultHorizon: 24,
    defaultState: [0.18, 0, 0],
    defaultParameters: { g: 9.81, length: 1, damping: 0.04, amplitude: 0.34, frequency: 6.25 },
    sweep: { parameter: 'amplitude', label: 'amplitude', min: 0, max: 0.7 },
    equation: "theta' = omega; omega' = -(g/l)(1 + a cos(phi)) sin(theta) - gamma omega; phi' = Omega.",
    energyNote: 'The apparent gravitational field is time-periodic, so bob energy is not conserved.',
    caveat: 'Parametric resonance is finite-time and parameter-window dependent.'
  },
  {
    id: 'spherical',
    label: 'Spherical Pendulum',
    family: '3D constrained motion',
    dimension: 4,
    conservative: true,
    defaultDt: 0.004,
    defaultHorizon: 14,
    defaultState: [0.8, 0, 0, 2.2],
    defaultParameters: { g: 9.81, length: 1, damping: 0 },
    sweep: { parameter: 'g', label: 'gravity', min: 2, max: 18 },
    equation:
      "theta' = thetaDot; phi' = phiDot; thetaDot' = sin(theta)cos(theta)phiDot^2 - (g/l)sin(theta); phiDot' = -2 cot(theta) thetaDot phiDot.",
    energyNote: 'Conservative runs preserve both energy and vertical angular momentum in exact arithmetic.',
    caveat: 'Spherical coordinates are regularized near the poles; avoid over-interpreting pole-adjacent runs.'
  },
  {
    id: 'chain',
    label: 'N-Link Pendulum',
    family: 'many-body planar chain',
    dimension: 8,
    conservative: true,
    defaultDt: 0.003,
    defaultHorizon: 12,
    defaultState: [1.05, 0.8, 0.45, 0.2, 0, 0, 0, 0],
    defaultParameters: {
      links: 4,
      g: 9.81,
      damping: 0,
      mass1: 1,
      mass2: 0.9,
      mass3: 0.8,
      mass4: 0.7,
      length1: 1,
      length2: 0.85,
      length3: 0.7,
      length4: 0.55
    },
    sweep: { parameter: 'g', label: 'gravity', min: 2, max: 18 },
    equation: 'M(theta) alpha = f(theta, omega), with state [theta_0..theta_N, omega_0..omega_N].',
    energyNote: 'Energy is the full chain kinetic plus gravitational potential energy.',
    caveat: 'Large N and energetic initial states can be stiff; compare methods before trusting fine structure.'
  }
];

export const EXPANSION_PRESETS: readonly ExpansionPreset[] = [
  {
    id: 'driven-chaos',
    label: 'Driven chaos window',
    model: 'driven',
    description: 'Classic damped-driven single pendulum route to chaos.',
    config: {
      model: 'driven',
      parameterOverrides: { driveAmplitude: 1.15 },
      horizon: 24,
      dt: 0.01,
      bifurcationColumns: 10
    }
  },
  {
    id: 'coupled-normal-mode',
    label: 'Coupled normal modes',
    model: 'coupled',
    description: 'Energy exchange between two weakly coupled pendulums.',
    config: {
      model: 'coupled',
      initialState: [0.45, -0.45, 0, 0],
      parameterOverrides: { coupling: 1.2 },
      horizon: 18,
      dt: 0.006
    }
  },
  {
    id: 'inverted-growth',
    label: 'Inverted growth',
    model: 'inverted',
    description: 'Small perturbation near the unstable upright equilibrium.',
    config: { model: 'inverted', initialState: [0.02, 0], horizon: 8, dt: 0.004 }
  },
  {
    id: 'cartpole-open-loop',
    label: 'Cart-pole open loop',
    model: 'cartpole',
    description: 'Underactuated cart-pole without feedback control.',
    config: { model: 'cartpole', parameterOverrides: { force: 0.5 }, horizon: 7, dt: 0.006 }
  },
  {
    id: 'parametric-resonance',
    label: 'Parametric resonance',
    model: 'parametric',
    description: 'Length/gravity modulation pumps energy into the bob.',
    config: { model: 'parametric', parameterOverrides: { amplitude: 0.42 }, horizon: 18, dt: 0.008 }
  },
  {
    id: 'spherical-conical',
    label: 'Spherical conical orbit',
    model: 'spherical',
    description: 'Near-conical 3D pendulum orbit with angular momentum.',
    config: { model: 'spherical', initialState: [0.75, 0, 0, 2.7], horizon: 12, dt: 0.004 }
  },
  {
    id: 'chain-cascade',
    label: 'N-link cascade',
    model: 'chain',
    description: 'Four-link chain cascade with strong nonlinear coupling.',
    config: { model: 'chain', horizon: 10, dt: 0.003, bifurcationColumns: 8 }
  }
];

export const GOLDEN_EXPANSION_PRESET_IDS = ['coupled-normal-mode', 'spherical-conical', 'chain-cascade'] as const;

function cloneParameters(
  definition: ExpansionModelDefinition,
  overrides: Partial<ExpansionParameterMap> = {}
): ExpansionParameterMap {
  const parameters: ExpansionParameterMap = { ...definition.defaultParameters };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) parameters[key] = value;
  }
  return parameters;
}

// ===== Section: Model Factory (expansionModelDefinition, createExpansionSystem) =

export function expansionModelDefinition(id: ExpansionModelId): ExpansionModelDefinition {
  const definition = EXPANSION_MODEL_DEFINITIONS.find((item) => item.id === id);
  if (!definition) throw new Error(`unknown expansion model: ${id}`);
  return definition;
}

export function numberAt(values: ArrayLike<number>, index: number, fallback = 0): number {
  const value = Number(values[index] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

export function finiteParam(parameters: ExpansionParameterMap, key: string, fallback: number): number {
  const value = parameters[key];
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function drivenParams(parameters: ExpansionParameterMap): DrivenParameters {
  return {
    g: finiteParam(parameters, 'g', 1),
    length: finiteParam(parameters, 'length', 1),
    damping: finiteParam(parameters, 'damping', 0.5),
    driveAmplitude: finiteParam(parameters, 'driveAmplitude', 1.15),
    driveFrequency: finiteParam(parameters, 'driveFrequency', 2 / 3)
  };
}

function sphericalParams(parameters: ExpansionParameterMap): SphericalParams {
  return {
    g: finiteParam(parameters, 'g', 9.81),
    l: finiteParam(parameters, 'length', 1),
    damping: finiteParam(parameters, 'damping', 0)
  };
}

export function chainParams(parameters: ExpansionParameterMap): ChainParameters {
  const n = Math.max(2, Math.min(8, Math.round(finiteParam(parameters, 'links', 4))));
  const masses = Array.from({ length: n }, (_, i) =>
    finiteParam(parameters, `mass${i + 1}`, Math.max(0.25, 1 - i * 0.1))
  );
  const lengths = Array.from({ length: n }, (_, i) =>
    finiteParam(parameters, `length${i + 1}`, Math.max(0.25, 1 - i * 0.15))
  );
  return { masses, lengths, g: finiteParam(parameters, 'g', 9.81) };
}

function wrapAngle(theta: number): number {
  let value = theta;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function pendulumPoint(theta: number, length: number, x0 = 0): ExpansionPoint {
  return { x: x0 + length * Math.sin(theta), y: -length * Math.cos(theta) };
}

function coupledRhs(state: StateVector, parameters: ExpansionParameterMap, out: StateVector): void {
  const theta1 = numberAt(state, 0);
  const theta2 = numberAt(state, 1);
  const omega1 = numberAt(state, 2);
  const omega2 = numberAt(state, 3);
  const g = finiteParam(parameters, 'g', 9.81);
  const length = finiteParam(parameters, 'length', 1);
  const coupling = finiteParam(parameters, 'coupling', 2);
  const damping = finiteParam(parameters, 'damping', 0);
  out[0] = omega1;
  out[1] = omega2;
  out[2] = -(g / length) * Math.sin(theta1) - damping * omega1 - coupling * (theta1 - theta2);
  out[3] = -(g / length) * Math.sin(theta2) - damping * omega2 + coupling * (theta1 - theta2);
}

function coupledEnergy(state: ArrayLike<number>, parameters: ExpansionParameterMap): number {
  const theta1 = numberAt(state, 0);
  const theta2 = numberAt(state, 1);
  const omega1 = numberAt(state, 2);
  const omega2 = numberAt(state, 3);
  const g = finiteParam(parameters, 'g', 9.81);
  const length = finiteParam(parameters, 'length', 1);
  const coupling = finiteParam(parameters, 'coupling', 2);
  return (
    0.5 * length * length * (omega1 * omega1 + omega2 * omega2) -
    g * length * (Math.cos(theta1) + Math.cos(theta2)) +
    0.5 * coupling * (theta1 - theta2) * (theta1 - theta2)
  );
}

function invertedRhs(state: StateVector, parameters: ExpansionParameterMap, out: StateVector): void {
  const theta = numberAt(state, 0);
  const omega = numberAt(state, 1);
  const g = finiteParam(parameters, 'g', 9.81);
  const length = finiteParam(parameters, 'length', 1);
  const damping = finiteParam(parameters, 'damping', 0);
  out[0] = omega;
  out[1] = (g / length) * Math.sin(theta) - damping * omega;
}

function invertedEnergy(state: ArrayLike<number>, parameters: ExpansionParameterMap): number {
  const theta = numberAt(state, 0);
  const omega = numberAt(state, 1);
  const g = finiteParam(parameters, 'g', 9.81);
  const length = finiteParam(parameters, 'length', 1);
  return 0.5 * length * length * omega * omega + g * length * Math.cos(theta);
}

function cartPoleRhs(state: StateVector, parameters: ExpansionParameterMap, out: StateVector): void {
  const theta = numberAt(state, 1);
  const xDot = numberAt(state, 2);
  const thetaDot = numberAt(state, 3);
  const cartMass = finiteParam(parameters, 'cartMass', 1);
  const poleMass = finiteParam(parameters, 'poleMass', 0.16);
  const length = finiteParam(parameters, 'length', 0.75);
  const g = finiteParam(parameters, 'g', 9.81);
  const force = finiteParam(parameters, 'force', 0);
  const friction = finiteParam(parameters, 'friction', 0);
  const totalMass = cartMass + poleMass;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const temp = (force - friction * xDot + poleMass * length * thetaDot * thetaDot * sin) / totalMass;
  const denom = length * (4 / 3 - (poleMass * cos * cos) / totalMass);
  const thetaAcc = (g * sin - cos * temp) / denom;
  const xAcc = temp - (poleMass * length * thetaAcc * cos) / totalMass;
  out[0] = xDot;
  out[1] = thetaDot;
  out[2] = xAcc;
  out[3] = thetaAcc;
}

function cartPoleEnergy(state: ArrayLike<number>, parameters: ExpansionParameterMap): number {
  const theta = numberAt(state, 1);
  const xDot = numberAt(state, 2);
  const thetaDot = numberAt(state, 3);
  const cartMass = finiteParam(parameters, 'cartMass', 1);
  const poleMass = finiteParam(parameters, 'poleMass', 0.16);
  const length = finiteParam(parameters, 'length', 0.75);
  const g = finiteParam(parameters, 'g', 9.81);
  const bobVx = xDot + length * Math.cos(theta) * thetaDot;
  const bobVy = -length * Math.sin(theta) * thetaDot;
  const ke = 0.5 * cartMass * xDot * xDot + 0.5 * poleMass * (bobVx * bobVx + bobVy * bobVy);
  const pe = poleMass * g * length * Math.cos(theta);
  return ke + pe;
}

function parametricRhs(state: StateVector, parameters: ExpansionParameterMap, out: StateVector): void {
  const theta = numberAt(state, 0);
  const omega = numberAt(state, 1);
  const phase = numberAt(state, 2);
  const g = finiteParam(parameters, 'g', 9.81);
  const length = finiteParam(parameters, 'length', 1);
  const damping = finiteParam(parameters, 'damping', 0.04);
  const amplitude = finiteParam(parameters, 'amplitude', 0.34);
  const frequency = finiteParam(parameters, 'frequency', 6.25);
  out[0] = omega;
  out[1] = -(g / length) * (1 + amplitude * Math.cos(phase)) * Math.sin(theta) - damping * omega;
  out[2] = frequency;
}

function parametricEnergy(state: ArrayLike<number>, parameters: ExpansionParameterMap): number {
  const theta = numberAt(state, 0);
  const omega = numberAt(state, 1);
  const length = finiteParam(parameters, 'length', 1);
  const g = finiteParam(parameters, 'g', 9.81);
  return 0.5 * length * length * omega * omega - g * length * Math.cos(theta);
}

export function createExpansionSystem(
  id: ExpansionModelId,
  parameterOverrides: Partial<ExpansionParameterMap> = {},
  initialState?: readonly number[]
): ExpansionSystem {
  const definition = expansionModelDefinition(id);
  const parameters = cloneParameters(definition, parameterOverrides);
  const state = new Float64Array(initialState ?? definition.defaultState);
  if (state.length !== definition.dimension) {
    throw new Error(`${definition.label}: expected state dimension ${definition.dimension}, got ${state.length}`);
  }

  if (id === 'driven') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => {
        rhsDriven(s, drivenParams(parameters), out);
      },
      energy: (s) => energyDriven(s, drivenParams(parameters)).total,
      coordinates: (s) => [pendulumPoint(numberAt(s, 0), finiteParam(parameters, 'length', 1))],
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0)), y: numberAt(s, 1) })
    };
  }
  if (id === 'coupled') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => coupledRhs(s, parameters, out),
      energy: (s) => coupledEnergy(s, parameters),
      coordinates: (s) => [
        pendulumPoint(numberAt(s, 0), finiteParam(parameters, 'length', 1), -0.75),
        pendulumPoint(numberAt(s, 1), finiteParam(parameters, 'length', 1), 0.75)
      ],
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0) - numberAt(s, 1)), y: numberAt(s, 2) - numberAt(s, 3) })
    };
  }
  if (id === 'inverted') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => invertedRhs(s, parameters, out),
      energy: (s) => invertedEnergy(s, parameters),
      coordinates: (s) => [pendulumPoint(numberAt(s, 0), finiteParam(parameters, 'length', 1))],
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0)), y: numberAt(s, 1) })
    };
  }
  if (id === 'cartpole') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => cartPoleRhs(s, parameters, out),
      energy: (s) => cartPoleEnergy(s, parameters),
      coordinates: (s) => {
        const x = numberAt(s, 0);
        const theta = numberAt(s, 1);
        const length = finiteParam(parameters, 'length', 0.75);
        return [
          { x, y: 0 },
          { x: x + length * Math.sin(theta), y: -length * Math.cos(theta) }
        ];
      },
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 1)), y: numberAt(s, 3) })
    };
  }
  if (id === 'parametric') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => parametricRhs(s, parameters, out),
      energy: (s) => parametricEnergy(s, parameters),
      coordinates: (s) => {
        const length =
          finiteParam(parameters, 'length', 1) *
          (1 + 0.15 * finiteParam(parameters, 'amplitude', 0.34) * Math.cos(numberAt(s, 2)));
        return [pendulumPoint(numberAt(s, 0), length)];
      },
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0)), y: numberAt(s, 1) })
    };
  }
  if (id === 'spherical') {
    return {
      definition,
      parameters,
      initialState: state,
      rhs: (s, out) => {
        const next = sphericalRhs(
          [numberAt(s, 0), numberAt(s, 1), numberAt(s, 2), numberAt(s, 3)] as SphericalState,
          sphericalParams(parameters)
        );
        out[0] = next[0];
        out[1] = next[1];
        out[2] = next[2];
        out[3] = next[3];
      },
      energy: (s) =>
        sphericalEnergy(
          [numberAt(s, 0), numberAt(s, 1), numberAt(s, 2), numberAt(s, 3)] as SphericalState,
          sphericalParams(parameters)
        ),
      coordinates: (s) => {
        const position = sphericalPosition(
          [numberAt(s, 0), numberAt(s, 1), numberAt(s, 2), numberAt(s, 3)] as SphericalState,
          sphericalParams(parameters)
        );
        return [
          { x: position.x, y: position.y },
          { x: position.z, y: position.y }
        ];
      },
      phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0)), y: numberAt(s, 2) })
    };
  }

  return {
    definition,
    parameters,
    initialState: state,
    rhs: (s, out) => rhsChain(s, chainParams(parameters), finiteParam(parameters, 'damping', 0), out),
    energy: (s) => energyChain(s, chainParams(parameters)).total,
    coordinates: (s) => {
      const params = chainParams(parameters);
      const points: ExpansionPoint[] = [];
      let x = 0;
      let y = 0;
      for (let i = 0; i < params.lengths.length; i += 1) {
        const length = params.lengths[i] ?? 1;
        x += length * Math.sin(numberAt(s, i));
        y += -length * Math.cos(numberAt(s, i));
        points.push({ x, y });
      }
      return points;
    },
    phasePoint: (s) => ({ x: wrapAngle(numberAt(s, 0)), y: numberAt(s, Math.max(1, Math.floor(s.length / 2))) })
  };
}
