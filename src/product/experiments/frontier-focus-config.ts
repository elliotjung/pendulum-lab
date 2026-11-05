import { createFputModeState } from '../../physics/fput';
import {
  createKinkAntikinkField,
  sineGordonBreather,
  sineGordonKink,
  sineGordonKinkRate
} from '../../physics/sineGordon';
import {
  defaultNetworkConfig,
  resizeNetworkConfig,
  networkSeededConfig,
  toCanonicalNetwork,
  type NetworkConfig
} from '../adapters/physics/network';
import { defaultFieldConfig, resizeFieldConfig, toCanonicalField, type FieldConfig } from '../adapters/physics/field';
import { defaultDiscreteConfig, toCanonicalDiscrete, type DiscreteConfig } from '../adapters/physics/discrete';
import type { ResearchFields } from './research-focus-contracts';
import type { ContractResult } from '../contracts/validation';
import { frontierFocusDeclaration, validateFrontierFields } from './frontier-focus-definitions';
const unwrap = <T>(r: ContractResult<T>): T => {
  if (!r.ok) throw new Error(r.issues.map((x) => x.message).join(' '));
  return r.value;
};
export type FrontierConfig =
  | { family: 'network'; config: NetworkConfig }
  | { family: 'field'; config: FieldConfig }
  | { family: 'discrete'; config: DiscreteConfig };

/** Only bounded configuration and native initial-state constructors, with no new dynamics. */
export function frontierFocusConfig(id: string, input: ResearchFields): FrontierConfig {
  const v = validateFrontierFields(id, input),
    d = frontierFocusDeclaration(id);
  if (Number(id.slice(2)) <= 5 || id === '7.9') {
    let c = defaultNetworkConfig(d.systemId as NetworkConfig['systemId']);
    c = { ...c, duration: v.duration!, step: v.step!, sampleEvery: 4 };
    if (id === '7.1')
      c = {
        ...c,
        parameters: { ...c.parameters, damping: v.damping! },
        basin: { ...c.basin!, size: v.grid!, maxSteps: v.maxSteps! }
      };
    if (id === '7.2' || id === '7.9') {
      if (id === '7.9') c = resizeNetworkConfig(c, 16, 1);
      const n = c.graph.nodes.length;
      c = {
        ...c,
        parameters: { g: id === '7.9' ? 1 : 9.81 },
        graph: { ...c.graph, edges: c.graph.edges.map((e) => ({ ...e, weight: v.coupling! })) },
        initialState: [
          ...c.graph.nodes.map((_, i) =>
            id === '7.9' ? (i === Math.floor(n / 2) ? v.amplitude! : 0) : v.amplitude! * Math.cos((2 * Math.PI * i) / n)
          ),
          ...Array<number>(n).fill(0)
        ]
      };
    }
    if (id === '7.3')
      c = {
        ...c,
        parameters: { coupling: v.coupling!, phaseLag: 0 },
        graph: { ...c.graph, nodes: c.graph.nodes.map((n, i) => ({ ...n, frequency: 1 + i * v.detuning! })) },
        initialState: [0, 0.8]
      };
    if (id === '7.4') {
      c = networkSeededConfig(c, `s27-${v.seed}`);
      c = {
        ...c,
        parameters: { coupling: v.coupling!, phaseLag: 0 },
        graph: { ...c.graph, nodes: c.graph.nodes.map((n) => ({ ...n, frequency: n.frequency * v.spread! })) }
      };
    }
    if (id === '7.5') {
      c = resizeNetworkConfig(c, 32, v.radius!);
      c = { ...c, parameters: { ...c.parameters, phaseLag: v.phaseLag! } };
    }
    return { family: 'network', config: c };
  }
  if (Number(id.slice(2)) <= 11) {
    let c = defaultFieldConfig(d.systemId as FieldConfig['systemId']);
    c = { ...c, duration: v.duration!, step: v.step!, sampleEvery: 4 };
    if (id === '7.6' || id === '7.7')
      c = {
        ...c,
        parameters: { damping: v.damping!, noise: v.noise! },
        initialState: [id === '7.7' ? 0.1 : 0.5, 0],
        ensemble: { members: v.members! },
        seed: { ...c.seed, value: `s27-${v.seed}` }
      };
    if (id === '7.8') {
      c = resizeFieldConfig(c, 8);
      c = {
        ...c,
        parameters: { alpha: v.alpha!, beta: 0.5 },
        initialState: Array.from(createFputModeState(8, 1, v.amplitude!))
      };
    }
    if (id === '7.10') {
      const n = c.grid.points,
        L = c.grid.length;
      if (v.scenario === 2) {
        const field = createKinkAntikinkField({
          points: n,
          length: L,
          dt: c.step,
          separation: 2,
          velocity: v.velocity!
        });
        c = {
          ...c,
          initialState: [...field.u, ...Array.from(field.u, (u, i) => (u - field.uPrev[i]!) / c.step)],
          previousField: Array.from(field.uPrev)
        };
      } else {
        const x = Array.from({ length: n }, (_, i) => (i * L) / (n - 1)),
          t0 = Math.PI / (2 * v.frequency!);
        c = {
          ...c,
          initialState: [
            ...x.map((x) =>
              v.scenario === 1
                ? sineGordonBreather(x, t0, { omega: v.frequency!, center: L / 2 })
                : sineGordonKink(x, 0, { velocity: v.velocity!, center: L / 2 })
            ),
            ...x.map((x) => (v.scenario === 1 ? 0 : sineGordonKinkRate(x, 0, { velocity: v.velocity!, center: L / 2 })))
          ]
        };
      }
    }
    if (id === '7.11') {
      c = resizeFieldConfig(c, 41);
      c = {
        ...c,
        parameters: { coupling: v.coupling!, centerOffset: 0, maxIterations: v.maxIterations!, tolerance: 1e-9 }
      };
    }
    return { family: 'field', config: c };
  }
  let c = defaultDiscreteConfig(d.systemId as DiscreteConfig['systemId']);
  c = {
    ...c,
    iterations: v.iterations!,
    sampleEvery: 1,
    parameters: { ...c.parameters, kickStrength: v.kick!, ...(id === '7.13' ? { hbar: v.hbar! } : {}) },
    ...(id === '7.12' ? { initialState: [v.theta!, 0] } : {})
  };
  return { family: 'discrete', config: c };
}
export function frontierFocusCanonical(id: string, fields: ResearchFields) {
  const s = frontierFocusConfig(id, fields);
  return s.family === 'network'
    ? unwrap(toCanonicalNetwork(s.config))
    : s.family === 'field'
      ? unwrap(toCanonicalField(s.config))
      : unwrap(toCanonicalDiscrete(s.config));
}
