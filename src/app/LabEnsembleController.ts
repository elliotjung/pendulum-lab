import type { Point2D } from '../viz/poincare';
import { physicsAdapter } from '../physics';
import type { LabConfig } from './LabSimulation';
import type { LabRenderer } from './LabRenderer';

/**
 * Owns the ensemble of perturbed initial states behind the chaos-divergence
 * view: building the copies from the requested count, stepping them alongside
 * the main simulation, and projecting each member's tip to pixels for the
 * renderer. Extracted from `LabApp` so the frame loop only orchestrates.
 */
export class LabEnsembleController {
  private members: Float64Array[] = [];
  private scratch: Float64Array[] = [];
  private tipScratch: Point2D[] = [];

  /** Build N perturbed copies of the initial state for the ensemble view. */
  build(config: LabConfig, dim: number, requested: number, cap: number, epsExponent: number): void {
    const n = Math.max(0, Math.min(cap, Math.round(requested)));
    const eps = 10 ** epsExponent;
    this.members = [];
    this.scratch = [];
    this.tipScratch = [];
    for (let i = 0; i < n; i += 1) {
      const st = new Float64Array(dim);
      for (let j = 0; j < dim; j += 1) st[j] = config.initialState[j] ?? 0;
      // Perturb the first angle by a small ± multiple of eps.
      st[0] = (config.initialState[0] ?? 0) + eps * (i + 1) * (i % 2 === 0 ? 1 : -1);
      this.members.push(st);
      this.scratch.push(new Float64Array(dim));
    }
  }

  /** Advance every ensemble member by `steps` integrator steps. */
  step(steps: number, config: LabConfig, rhs: ((s: Float64Array, o: Float64Array) => void) | null): void {
    if (this.members.length === 0 || !rhs) return;
    const { method, dt, tolerance } = config;
    const options = tolerance === undefined ? {} : { tolerance };
    for (let m = 0; m < this.members.length; m += 1) {
      const state = this.members[m]!;
      const scratch = this.scratch[m]!;
      for (let s = 0; s < steps; s += 1) {
        physicsAdapter.step(method, state, dt, rhs, scratch, options);
        state.set(scratch);
      }
    }
  }

  /** Pre-mapped pixel positions of each ensemble member's tip. */
  tips(config: LabConfig, renderer: LabRenderer | null): Point2D[] {
    if (!renderer || this.members.length === 0) return [];
    const { l1, l2, l3 } = config.parameters;
    const triple = config.system === 'triple';
    this.tipScratch.length = this.members.length;
    for (let i = 0; i < this.members.length; i += 1) {
      const s = this.members[i]!;
      const x1 = l1 * Math.sin(s[0]!);
      const y1 = l1 * Math.cos(s[0]!);
      const x2 = x1 + l2 * Math.sin(s[1]!);
      const y2 = y1 + l2 * Math.cos(s[1]!);
      const out = this.tipScratch[i] ?? { x: 0, y: 0 };
      this.tipScratch[i] = out;
      if (triple) {
        const ell3 = l3 ?? 1;
        renderer.toPixelsXYInto(x2 + ell3 * Math.sin(s[2]!), y2 + ell3 * Math.cos(s[2]!), out);
      } else {
        renderer.toPixelsXYInto(x2, y2, out);
      }
    }
    return this.tipScratch;
  }

  /** Drop members beyond the quality budget's ensemble cap. */
  trimToCap(cap: number): void {
    if (this.members.length <= cap) return;
    this.members.length = cap;
    this.scratch.length = cap;
    this.tipScratch.length = cap;
  }
}
