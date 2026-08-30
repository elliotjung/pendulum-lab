import type { Point2D } from '../viz/poincare';
import { physicsAdapter } from '../physics';
import type { LabConfig } from './LabSimulation';
import type { LabRenderer } from './LabRenderer';
import { buildPerturbedStates, type EnsemblePerturbationSpec } from './ensemblePerturbation';

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
  private meterTipScratch: Point2D[] = [];
  private firstDelta: Float64Array | null = null;
  private spec: EnsemblePerturbationSpec = { variable: 'th1', pattern: 'alternating', epsilon: 1e-4, seed: 1 };

  /** Build N perturbed copies of the initial state for the ensemble view. */
  build(config: LabConfig, dim: number, requested: number, cap: number, spec: EnsemblePerturbationSpec): void {
    const built = buildPerturbedStates(config.initialState, dim, requested, cap, config.system, spec);
    this.spec = { ...spec };
    this.members = built.members;
    this.firstDelta = built.firstDelta;
    this.scratch = this.members.map(() => new Float64Array(dim));
    this.tipScratch = [];
    this.meterTipScratch = [];
  }

  /** Reproducible rule and first displacement used by UI/readout tooling. */
  description(): { count: number; spec: EnsemblePerturbationSpec; firstDelta: Float64Array | null } {
    return {
      count: this.members.length,
      spec: { ...this.spec },
      firstDelta: this.firstDelta ? this.firstDelta.slice() : null
    };
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
    const meters = this.tipPositionsMeters(config);
    this.tipScratch.length = meters.length;
    for (let i = 0; i < meters.length; i += 1) {
      const out = this.tipScratch[i] ?? { x: 0, y: 0 };
      this.tipScratch[i] = out;
      renderer.toPixelsInto(meters[i]!, out);
    }
    return this.tipScratch;
  }

  /** Cartesian metre-space tips for a renderer living in another thread. */
  tipPositionsMeters(config: LabConfig): Point2D[] {
    if (this.members.length === 0) return [];
    const { l1, l2, l3 } = config.parameters;
    const triple = config.system === 'triple';
    this.meterTipScratch.length = this.members.length;
    for (let i = 0; i < this.members.length; i += 1) {
      const s = this.members[i]!;
      const x1 = l1 * Math.sin(s[0]!);
      const y1 = l1 * Math.cos(s[0]!);
      const x2 = x1 + l2 * Math.sin(s[1]!);
      const y2 = y1 + l2 * Math.cos(s[1]!);
      const out = this.meterTipScratch[i] ?? { x: 0, y: 0 };
      this.meterTipScratch[i] = out;
      if (triple) {
        const ell3 = l3 ?? 1;
        out.x = x2 + ell3 * Math.sin(s[2]!);
        out.y = y2 + ell3 * Math.cos(s[2]!);
      } else {
        out.x = x2;
        out.y = y2;
      }
    }
    return this.meterTipScratch;
  }

  /** Drop members beyond the quality budget's ensemble cap. */
  trimToCap(cap: number): void {
    if (this.members.length <= cap) return;
    this.members.length = cap;
    this.scratch.length = cap;
    this.tipScratch.length = cap;
    this.meterTipScratch.length = cap;
    if (cap <= 0) this.firstDelta = null;
  }
}
