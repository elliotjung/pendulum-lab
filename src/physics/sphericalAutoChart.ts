import { PhysicsEvaluationError } from './errors';
import {
  SphericalChain,
  sphericalChainEnergy,
  sphericalChainLength,
  sphericalChainLz,
  type SphericalChainParams
} from './sphericalChain';
import {
  EmbeddedSphericalChain,
  angleChainToEmbedded,
  embeddedChainEnergy,
  embeddedChainLz,
  embeddedChainPositions,
  embeddedChainToAngle,
  type EmbeddedChainState
} from './sphericalEmbeddedChain';

export type SphericalChartKind = 'polar' | 'embedded';

export interface SphericalChartTransition {
  time: number;
  from: SphericalChartKind;
  to: SphericalChartKind;
  energyRelativeError: number;
  lzRelativeError: number;
}

export interface AutoChartSphericalChainOptions {
  dt?: number;
  /** Enter the embedded chart when any |sin(theta_k)| is at/below this value. */
  enterPoleSin?: number;
  /** Return to polar only when every link is beyond this value (hysteresis). */
  exitPoleSin?: number;
  /** Maximum invariant mismatch allowed during a coordinate conversion. */
  invariantTolerance?: number;
}

export interface AutoChartSphericalChainDiagnostics {
  time: number;
  chart: SphericalChartKind;
  energy: number;
  energyDrift: number;
  lz: number;
  lzDrift: number;
  transitions: readonly SphericalChartTransition[];
  maxTransitionInvariantError: number;
  caveat: string;
}

/**
 * Hysteretic polar ↔ embedded atlas for the spherical N-chain. The familiar
 * angle chart is used away from a pole; a globally regular embedded S² chart is
 * selected before the azimuthal mass-matrix column degenerates. Every switch is
 * accepted only after energy and vertical-angular-momentum invariants agree.
 */
export class AutoChartSphericalChain {
  private readonly n: number;
  private readonly dt: number;
  private readonly enterPoleSin: number;
  private readonly exitPoleSin: number;
  private readonly invariantTolerance: number;
  private polar: SphericalChain | undefined;
  private embedded: EmbeddedSphericalChain | undefined;
  private chartValue: SphericalChartKind = 'polar';
  private timeValue = 0;
  private readonly transitionsValue: SphericalChartTransition[] = [];
  private readonly initialEnergy: number;
  private readonly initialLz: number;

  constructor(
    readonly params: SphericalChainParams,
    initialPolar: ArrayLike<number>,
    options: AutoChartSphericalChainOptions = {}
  ) {
    this.n = sphericalChainLength(params);
    this.dt = options.dt ?? 0.001;
    this.enterPoleSin = options.enterPoleSin ?? 1e-3;
    this.exitPoleSin = options.exitPoleSin ?? 5e-3;
    this.invariantTolerance = options.invariantTolerance ?? 1e-10;
    if (!(this.dt > 0) || !Number.isFinite(this.dt)) {
      throw new RangeError('AutoChartSphericalChain: dt must be positive and finite.');
    }
    if (
      !(this.enterPoleSin > 0) ||
      !(this.exitPoleSin > this.enterPoleSin) ||
      !(this.exitPoleSin < 1) ||
      !Number.isFinite(this.enterPoleSin) ||
      !Number.isFinite(this.exitPoleSin)
    ) {
      throw new RangeError('AutoChartSphericalChain: require 0 < enterPoleSin < exitPoleSin < 1.');
    }
    if (!(this.invariantTolerance > 0) || !Number.isFinite(this.invariantTolerance)) {
      throw new RangeError('AutoChartSphericalChain: invariantTolerance must be positive and finite.');
    }
    const expectedLength = 4 * this.n;
    if (initialPolar.length < expectedLength) {
      throw new RangeError(`AutoChartSphericalChain: initial state must contain ${expectedLength} components.`);
    }
    const initial = Float64Array.from({ length: expectedLength }, (_, i) => Number(initialPolar[i]));
    for (let i = 0; i < initial.length; i += 1) {
      if (!Number.isFinite(initial[i])) throw new RangeError('AutoChartSphericalChain: initial state must be finite.');
    }
    this.initialEnergy = sphericalChainEnergy(initial, params).total;
    this.initialLz = sphericalChainLz(initial, params);
    this.polar = new SphericalChain(params, initial, { dt: this.dt, method: 'rk4' });
    if (this.polarNearPole(initial)) this.switchToEmbedded();
  }

  get chart(): SphericalChartKind {
    return this.chartValue;
  }

  step(elapsed: number): void {
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      throw new RangeError('AutoChartSphericalChain.step: elapsed must be finite and non-negative.');
    }
    let remaining = elapsed;
    while (remaining > 1e-12) {
      const h = Math.min(this.dt, remaining);
      remaining -= h;
      if (this.chartValue === 'polar') {
        this.polar!.step(h);
        this.timeValue += h;
        if (this.polarNearPole(this.polar!.current())) this.switchToEmbedded();
      } else {
        this.embedded!.step(h);
        this.timeValue += h;
        if (this.embeddedAwayFromPoles(this.embedded!.current())) this.switchToPolar();
      }
    }
  }

  current(): { chart: SphericalChartKind; state: Float64Array } {
    return {
      chart: this.chartValue,
      state: this.chartValue === 'polar' ? this.polar!.current() : this.embedded!.current()
    };
  }

  currentEmbedded(): EmbeddedChainState {
    return this.chartValue === 'embedded'
      ? this.embedded!.current()
      : angleChainToEmbedded(this.polar!.current(), this.n);
  }

  currentPolar(): Float64Array {
    return this.chartValue === 'polar' ? this.polar!.current() : embeddedChainToAngle(this.embedded!.current(), this.n);
  }

  positions(): Array<{ x: number; y: number; z: number }> {
    return this.chartValue === 'polar'
      ? this.polar!.positions()
      : embeddedChainPositions(this.embedded!.current(), this.params);
  }

  diagnostics(): AutoChartSphericalChainDiagnostics {
    const state = this.current();
    const energy =
      state.chart === 'polar'
        ? sphericalChainEnergy(state.state, this.params).total
        : embeddedChainEnergy(state.state, this.params).total;
    const lz =
      state.chart === 'polar' ? sphericalChainLz(state.state, this.params) : embeddedChainLz(state.state, this.params);
    let maxTransitionInvariantError = 0;
    for (const transition of this.transitionsValue) {
      maxTransitionInvariantError = Math.max(
        maxTransitionInvariantError,
        transition.energyRelativeError,
        transition.lzRelativeError
      );
    }
    return {
      time: this.timeValue,
      chart: this.chartValue,
      energy,
      energyDrift: Math.abs(energy - this.initialEnergy) / Math.max(Math.abs(this.initialEnergy), 1),
      lz,
      lzDrift: Math.abs(lz - this.initialLz) / Math.max(Math.abs(this.initialLz), 1),
      transitions: this.transitionsValue.map((transition) => ({ ...transition })),
      maxTransitionInvariantError,
      caveat:
        this.params.damping > 0
          ? 'Damping is active: use dissipated-work balance; chart transitions still certify instantaneous E/Lz equivalence.'
          : 'Automatic chart atlas with hysteresis; every transition is invariant-checked before acceptance.'
    };
  }

  private polarNearPole(state: ArrayLike<number>): boolean {
    for (let k = 0; k < this.n; k += 1) {
      if (Math.abs(Math.sin(Number(state[2 * k]))) <= this.enterPoleSin) return true;
    }
    return false;
  }

  private embeddedAwayFromPoles(state: ArrayLike<number>): boolean {
    for (let k = 0; k < this.n; k += 1) {
      const ux = Number(state[3 * k]);
      const uz = Number(state[3 * k + 2]);
      if (Math.hypot(ux, uz) < this.exitPoleSin) return false;
    }
    return true;
  }

  private switchToEmbedded(): void {
    const polarState = this.polar!.current();
    const beforeEnergy = sphericalChainEnergy(polarState, this.params).total;
    const beforeLz = sphericalChainLz(polarState, this.params);
    const embeddedState = angleChainToEmbedded(polarState, this.n);
    const afterEnergy = embeddedChainEnergy(embeddedState, this.params).total;
    const afterLz = embeddedChainLz(embeddedState, this.params);
    this.acceptTransition('polar', 'embedded', beforeEnergy, afterEnergy, beforeLz, afterLz);
    this.embedded = new EmbeddedSphericalChain(this.params, embeddedState, this.dt);
    this.polar = undefined;
    this.chartValue = 'embedded';
  }

  private switchToPolar(): void {
    const embeddedState = this.embedded!.current();
    const beforeEnergy = embeddedChainEnergy(embeddedState, this.params).total;
    const beforeLz = embeddedChainLz(embeddedState, this.params);
    const polarState = embeddedChainToAngle(embeddedState, this.n);
    const afterEnergy = sphericalChainEnergy(polarState, this.params).total;
    const afterLz = sphericalChainLz(polarState, this.params);
    this.acceptTransition('embedded', 'polar', beforeEnergy, afterEnergy, beforeLz, afterLz);
    this.polar = new SphericalChain(this.params, polarState, { dt: this.dt, method: 'rk4' });
    this.embedded = undefined;
    this.chartValue = 'polar';
  }

  private acceptTransition(
    from: SphericalChartKind,
    to: SphericalChartKind,
    beforeEnergy: number,
    afterEnergy: number,
    beforeLz: number,
    afterLz: number
  ): void {
    const energyRelativeError = Math.abs(afterEnergy - beforeEnergy) / Math.max(Math.abs(beforeEnergy), 1);
    const lzRelativeError = Math.abs(afterLz - beforeLz) / Math.max(Math.abs(beforeLz), 1);
    if (
      !Number.isFinite(energyRelativeError) ||
      !Number.isFinite(lzRelativeError) ||
      Math.max(energyRelativeError, lzRelativeError) > this.invariantTolerance
    ) {
      throw new PhysicsEvaluationError(
        'INVALID_PARAMETER',
        'AutoChartSphericalChain: chart conversion failed invariants',
        {
          operation: 'AutoChartSphericalChain.chartTransition',
          retryable: false,
          from,
          to,
          energyRelativeError,
          lzRelativeError,
          invariantTolerance: this.invariantTolerance
        }
      );
    }
    this.transitionsValue.push({
      time: this.timeValue,
      from,
      to,
      energyRelativeError,
      lzRelativeError
    });
  }
}
