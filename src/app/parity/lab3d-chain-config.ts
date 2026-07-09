import type { IntegratorId } from '../../types/domain';
import type { SphericalChainParams } from '../../physics/sphericalChain';
import type { SystemSpec } from '../../physics/systemSpec';
import { parseClampedNumberList, type ClampNumber } from './lab3d-utils';

export const LAB3D_CHAIN_METHODS = ['rk4', 'dopri5', 'dop853', 'gbs', 'gauss2', 'yoshida4'] as const;

export interface Lab3dChainInput {
  nValue: number;
  methodValue: string;
  massesText: string;
  lengthsText: string;
  thetaText: string;
  phiText: string;
  thetaDotText: string;
  phiDotText: string;
  gravityValue: number;
  dampingValue: number;
  clampNumber: ClampNumber;
}

export function normalizeLab3dChainN(value: number, clampNumber: ClampNumber): number {
  return Math.round(clampNumber(value, 2, 1, 5));
}

export function normalizeLab3dChainMethod(value: string): IntegratorId {
  return (LAB3D_CHAIN_METHODS as readonly string[]).includes(value) ? value as IntegratorId : 'rk4';
}

export function buildLab3dChainParams(input: Lab3dChainInput): SphericalChainParams {
  const n = normalizeLab3dChainN(input.nValue, input.clampNumber);
  return {
    masses: parseClampedNumberList(input.massesText, n, 1, 0.1, 5, input.clampNumber),
    lengths: parseClampedNumberList(input.lengthsText, n, 0.8, 0.2, 3, input.clampNumber),
    g: input.clampNumber(input.gravityValue, 9.81, 0.5, 30),
    damping: input.clampNumber(input.dampingValue, 0, 0, 5)
  };
}

/** Full initial state [theta_k, phi_k ..., thetaDot_k, phiDot_k ...]. */
export function buildLab3dChainInitialState(input: Lab3dChainInput): number[] {
  const n = normalizeLab3dChainN(input.nValue, input.clampNumber);
  const thetas = parseClampedNumberList(input.thetaText, n, 1.6, -3.05, 3.05, input.clampNumber);
  const phis = parseClampedNumberList(input.phiText, n, 0, -Math.PI, Math.PI, input.clampNumber);
  const thetaDots = parseClampedNumberList(input.thetaDotText, n, 0, -10, 10, input.clampNumber);
  const phiDots = parseClampedNumberList(input.phiDotText, n, 0, -10, 10, input.clampNumber);
  const state: number[] = [];
  for (let k = 0; k < n; k += 1) state.push(thetas[k]!, phis[k]!);
  for (let k = 0; k < n; k += 1) state.push(thetaDots[k]!, phiDots[k]!);
  return state;
}

export function buildLab3dChainSpec(params: SphericalChainParams): Extract<SystemSpec, { kind: 'spherical-chain' }> {
  return {
    kind: 'spherical-chain',
    masses: [...params.masses],
    lengths: [...params.lengths],
    g: params.g,
    damping: params.damping
  };
}
