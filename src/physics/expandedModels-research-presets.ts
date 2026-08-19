/**
 * Declarative research-study settings for the expansion suite.
 *
 * The runner imports these values but never owns them, making the scientific
 * choice of sweep coordinates and regression identities reviewable without
 * reading integration or rendering code.
 */
import type { IntegratorId } from '../types/domain';
import { expansionModelDefinition, finiteParam } from './expandedModels-factory';
import type { ExpansionModelId, ExpansionParameterMap, ExpansionSweepAxis } from './expandedModels-types';

export interface ExpansionResearchSweepPreset {
  x: Omit<ExpansionSweepAxis, 'unit'>;
  y: Omit<ExpansionSweepAxis, 'unit'>;
}

const RESEARCH_PARAMETER_UNITS: Readonly<Record<string, string>> = Object.freeze({
  g: 'm/s^2',
  length: 'm',
  length1: 'm',
  length2: 'm',
  length3: 'm',
  length4: 'm',
  damping: '1/s',
  driveAmplitude: 'rad/s^2',
  driveFrequency: 'rad/s',
  frequency: 'rad/s',
  amplitude: '1',
  coupling: '1/s^2',
  force: 'N',
  friction: 'N s/m',
  cartMass: 'kg',
  poleMass: 'kg',
  links: 'count',
  lengthScale: '1'
});

/** Each model's explicit, unit-bearing default research sweep. */
export const EXPANSION_RESEARCH_SWEEP_PRESETS: Readonly<Record<ExpansionModelId, ExpansionResearchSweepPreset>> =
  Object.freeze({
    driven: {
      x: { parameter: 'driveAmplitude', label: 'drive amplitude', min: 0.7, max: 1.45 },
      y: { parameter: 'damping', label: 'damping', min: 0.05, max: 0.9 }
    },
    cartpole: {
      x: { parameter: 'force', label: 'cart force', min: -3, max: 3 },
      y: { parameter: 'length', label: 'pole length', min: 0.35, max: 1.4 }
    },
    parametric: {
      x: { parameter: 'amplitude', label: 'modulation amplitude', min: 0, max: 0.7 },
      y: { parameter: 'frequency', label: 'modulation frequency', min: 3, max: 9 }
    },
    coupled: {
      x: { parameter: 'coupling', label: 'coupling', min: 0.1, max: 5 },
      y: { parameter: 'length', label: 'length', min: 0.45, max: 1.8 }
    },
    inverted: {
      x: { parameter: 'g', label: 'gravity', min: 2, max: 18 },
      y: { parameter: 'length', label: 'length', min: 0.35, max: 1.8 }
    },
    spherical: {
      x: { parameter: 'g', label: 'gravity', min: 2, max: 18 },
      y: { parameter: 'length', label: 'length', min: 0.45, max: 1.8 }
    },
    chain: {
      x: { parameter: 'g', label: 'gravity', min: 2, max: 18 },
      y: { parameter: 'lengthScale', label: 'link length scale', min: 0.65, max: 1.35 }
    }
  });

export function parameterUnit(model: ExpansionModelId, parameter: string): string {
  if (model === 'spherical' && parameter === 'length') return 'm';
  return RESEARCH_PARAMETER_UNITS[parameter] ?? 'model unit';
}

export function modelAxis(
  model: ExpansionModelId,
  parameter: string,
  label: string,
  min: number,
  max: number
): ExpansionSweepAxis {
  return { parameter, label, unit: parameterUnit(model, parameter), min, max };
}

export function researchAxes(model: ExpansionModelId): { xAxis: ExpansionSweepAxis; yAxis: ExpansionSweepAxis } {
  const preset = EXPANSION_RESEARCH_SWEEP_PRESETS[model];
  return {
    xAxis: modelAxis(model, preset.x.parameter, preset.x.label, preset.x.min, preset.x.max),
    yAxis: modelAxis(model, preset.y.parameter, preset.y.label, preset.y.min, preset.y.max)
  };
}

export function withResearchAxisValue(
  model: ExpansionModelId,
  base: Partial<ExpansionParameterMap>,
  axis: ExpansionSweepAxis,
  value: number
): Partial<ExpansionParameterMap> {
  const next: ExpansionParameterMap = {};
  for (const [key, item] of Object.entries(base)) {
    if (item !== undefined) next[key] = item;
  }
  if (model === 'chain' && axis.parameter === 'lengthScale') {
    const definition = expansionModelDefinition(model);
    const links = Math.max(
      2,
      Math.min(8, Math.round(finiteParam(next, 'links', definition.defaultParameters.links ?? 4)))
    );
    for (let i = 1; i <= links; i += 1) {
      const key = `length${i}`;
      const baseLength = finiteParam(definition.defaultParameters, key, Math.max(0.25, 1 - (i - 1) * 0.15));
      next[key] = baseLength * value;
    }
    return next;
  }
  next[axis.parameter] = value;
  return next;
}

export function researchPhaseIndexes(
  model: ExpansionModelId,
  stateLength: number
): { position: number; velocity: number } {
  switch (model) {
    case 'cartpole':
      return { position: 1, velocity: 3 };
    case 'coupled':
    case 'spherical':
      return { position: 0, velocity: 2 };
    case 'chain':
      return { position: 0, velocity: Math.max(1, Math.floor(stateLength / 2)) };
    case 'driven':
    case 'inverted':
    case 'parametric':
      return { position: 0, velocity: 1 };
  }
}

export function primaryResearchLength(parameters: ExpansionParameterMap): number {
  const direct = finiteParam(parameters, 'length', Number.NaN);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const length1 = finiteParam(parameters, 'length1', Number.NaN);
  return Number.isFinite(length1) && length1 > 0 ? length1 : 1;
}

export function primaryResearchMass(parameters: ExpansionParameterMap): number {
  const cartMass = finiteParam(parameters, 'cartMass', Number.NaN);
  const poleMass = finiteParam(parameters, 'poleMass', Number.NaN);
  if (Number.isFinite(cartMass) && Number.isFinite(poleMass)) return Math.max(1e-9, cartMass + poleMass);
  return Math.max(1e-9, finiteParam(parameters, 'mass1', 1));
}

/** Immutable hashes accepted by the golden regression center. */
export const GOLDEN_REGRESSION_BASELINES: Readonly<Record<string, Partial<Record<IntegratorId, string>>>> =
  Object.freeze({
    'driven-chaos': {
      rk4: 'exp-d4df1991',
      dopri5: 'exp-02e3f836',
      leapfrog: 'exp-46ffd90b',
      symplectic: 'exp-a15c4262',
      euler: 'exp-8633ecb8'
    },
    'coupled-normal-mode': {
      rk4: 'exp-50ed08d1',
      dopri5: 'exp-cde68620',
      leapfrog: 'exp-903d21ef',
      symplectic: 'exp-2f56e213',
      euler: 'exp-6bdd225a'
    },
    'inverted-growth': {
      rk4: 'exp-26212d81',
      dopri5: 'exp-ea58c760',
      leapfrog: 'exp-49255901',
      symplectic: 'exp-2bc2741c',
      euler: 'exp-b7ce02a9'
    },
    'cartpole-open-loop': {
      rk4: 'exp-f2b35906',
      dopri5: 'exp-3d195f04',
      leapfrog: 'exp-0d97aad4',
      symplectic: 'exp-6053f497',
      euler: 'exp-1fb29c06'
    },
    'parametric-resonance': {
      rk4: 'exp-5d7918d0',
      dopri5: 'exp-9d76947e',
      leapfrog: 'exp-0de34b55',
      symplectic: 'exp-29a1bdb7',
      euler: 'exp-90e7641f'
    },
    'spherical-conical': {
      rk4: 'exp-e32cfcda',
      dopri5: 'exp-59d1105c',
      leapfrog: 'exp-6b1635f9',
      symplectic: 'exp-ef0f627c',
      euler: 'exp-df184220'
    },
    'chain-cascade': {
      rk4: 'exp-cc31d2b4',
      dopri5: 'exp-beff4a42',
      leapfrog: 'exp-c77e95b3',
      symplectic: 'exp-5591e72b',
      euler: 'exp-f1b6295e'
    }
  });
