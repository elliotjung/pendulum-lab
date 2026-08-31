import type { Point2D } from '../viz/poincare';
import { physicsAdapter } from '../physics';
import type { LabConfig } from './LabSimulation';
import type { LabRenderer } from './LabRenderer';
import { buildPerturbedStates, type EnsemblePerturbationSpec } from './ensemblePerturbation';
import { endpointSeparationQuantiles, type EnsembleSeparationSample } from './ensembleSeparationStatistics';

const MAX_SEPARATION_SAMPLES = 240;
const SEPARATION_SAMPLE_INTERVAL_SECONDS = 0.125;

function endpointInto(state: ArrayLike<number>, config: LabConfig, out: Point2D): Point2D {
  const { l1, l2, l3 } = config.parameters;
  const x1 = l1 * Math.sin(state[0]!);
  const y1 = l1 * Math.cos(state[0]!);
  const x2 = x1 + l2 * Math.sin(state[1]!);
  const y2 = y1 + l2 * Math.cos(state[1]!);
  if (config.system === 'triple') {
    out.x = x2 + (l3 ?? 1) * Math.sin(state[2]!);
    out.y = y2 + (l3 ?? 1) * Math.cos(state[2]!);
  } else {
    out.x = x2;
    out.y = y2;
  }
  return out;
}

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
  private requestedCount = 0;
  private endpointIndex: 2 | 3 = 2;
  private readonly referenceTipScratch: Point2D = { x: 0, y: 0 };
  private readonly separationSamples: EnsembleSeparationSample[] = [];

  /** Build N perturbed copies of the initial state for the ensemble view. */
  build(config: LabConfig, dim: number, requested: number, cap: number, spec: EnsemblePerturbationSpec): void {
    const built = buildPerturbedStates(config.initialState, dim, requested, cap, config.system, spec);
    this.spec = { ...spec };
    this.requestedCount = Math.max(0, Math.round(requested));
    this.endpointIndex = config.system === 'triple' ? 3 : 2;
    this.members = built.members;
    this.firstDelta = built.firstDelta;
    this.scratch = this.members.map(() => new Float64Array(dim));
    this.tipScratch = [];
    this.meterTipScratch = [];
    this.separationSamples.length = 0;
  }

  /** Reproducible rule and first displacement used by UI/readout tooling. */
  description(): { count: number; spec: EnsemblePerturbationSpec; firstDelta: Float64Array | null } {
    return {
      count: this.members.length,
      spec: { ...this.spec },
      firstDelta: this.firstDelta ? this.firstDelta.slice() : null
    };
  }

  /** Sample a 30-second live window at a simulation-time cadence independent of render quality and tab visibility. */
  sample(time: number, referenceState: ArrayLike<number>, config: LabConfig): EnsembleSeparationSample | null {
    if (this.members.length === 0 || !Number.isFinite(time)) return null;
    const previous = this.separationSamples.at(-1);
    if (previous && time < previous.time) this.separationSamples.length = 0;
    else if (previous && time - previous.time < SEPARATION_SAMPLE_INTERVAL_SECONDS) return null;
    const reference = endpointInto(referenceState, config, this.referenceTipScratch);
    const memberTips = this.tipPositionsMeters(config);
    const summary: EnsembleSeparationSample = {
      time,
      ...endpointSeparationQuantiles(reference, memberTips, this.members.length)
    };
    this.separationSamples.push(summary);
    while (this.separationSamples[0] && this.separationSamples[0].time < time - 30) {
      this.separationSamples.shift();
    }
    if (this.separationSamples.length > MAX_SEPARATION_SAMPLES) this.separationSamples.shift();
    return summary;
  }

  statistics(): {
    requestedCount: number;
    memberCount: number;
    endpointIndex: 2 | 3;
    spec: EnsemblePerturbationSpec;
    latest: EnsembleSeparationSample | null;
    samples: readonly EnsembleSeparationSample[];
  } {
    return {
      requestedCount: this.requestedCount,
      memberCount: this.members.length,
      endpointIndex: this.endpointIndex,
      spec: { ...this.spec },
      latest: this.separationSamples.at(-1) ?? null,
      samples: this.separationSamples
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
  tips(config: LabConfig, renderer: LabRenderer | null, includeIndividualTraces = true): Point2D[] {
    if (!renderer || this.members.length === 0) return [];
    const meters = this.tipPositionsMeters(config, includeIndividualTraces);
    this.tipScratch.length = meters.length;
    for (let i = 0; i < meters.length; i += 1) {
      const out = this.tipScratch[i] ?? { x: 0, y: 0 };
      this.tipScratch[i] = out;
      renderer.toPixelsInto(meters[i]!, out);
    }
    return this.tipScratch;
  }

  /** Cartesian metre-space tips for a renderer living in another thread. */
  tipPositionsMeters(config: LabConfig, includeIndividualTraces = true): Point2D[] {
    if (this.members.length === 0) return [];
    const count = includeIndividualTraces ? this.members.length : Math.min(1, this.members.length);
    this.meterTipScratch.length = count;
    for (let i = 0; i < count; i += 1) {
      const s = this.members[i]!;
      const out = this.meterTipScratch[i] ?? { x: 0, y: 0 };
      this.meterTipScratch[i] = out;
      endpointInto(s, config, out);
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
    this.separationSamples.length = 0;
    if (cap <= 0) this.firstDelta = null;
  }
}
