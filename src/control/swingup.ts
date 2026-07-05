import type { PendulumParameters } from '../types/domain';
import type { StateVector } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { energyDouble } from '../physics/double';
import { rhsDoubleActuated, uprightEnergyDouble } from './actuated';
import { designUprightLqr, lqrLyapunovLevel, lqrTorque, type LqrDesign, type LqrSpec } from './lqr';

/**
 * Energy-shaping swing-up with an LQR capture stage — the classic two-phase
 * strategy of the swing-up benchmarks (energy control after Åström & Furuta;
 * the acrobot variant is Xin & Kaneda's energy controller in the DFKI
 * `double_pendulum` repo), specialised here to the fully-actuated double
 * pendulum where a clean Lyapunov argument exists.
 *
 * Phase 1 (pumping): choose generalised forces Q_i = k_e·(E_up − E)·ω_i.
 * Along trajectories dE/dt = Σ Q_i ω_i = k_e (E_up − E)(ω1² + ω2²) ≥ 0 for
 * E < E_up, so the total energy climbs monotonically toward the upright level
 * (with damping γ > 0 the pump must also cover the dissipation, which the
 * proportional law does once k_e·|E_up − E| exceeds γ). Joint torques follow
 * from the inverse virtual-work map τ2 = Q2, τ1 = Q1 + Q2. A small kick
 * escapes the ω = 0 hanging equilibrium where the law is degenerate.
 *
 * Phase 2 (capture): once the LQR cost-to-go level V(x) = δxᵀPδx drops below
 * `captureLevel` — the quadratic region-of-attraction gate used by the DFKI
 * LQR RoA tooling — the controller latches to the LQR balance law. It
 * unlatches only if the state leaves a 10× larger level set, so measurement
 * of the boundary cannot chatter between phases.
 *
 * Energy pumping steers the *energy*, not the *phase*, so the time to first
 * capture depends on initial conditions; the tests pin a concrete
 * configuration reaching capture and holding the inverted state.
 */

export interface SwingUpGains {
  /** Energy-pump gain k_e. */
  ke: number;
  /** Kick torque applied when the state is stuck near ω = 0 away from the goal energy. */
  kick: number;
  /** |ω1| + |ω2| below which the kick engages. */
  kickOmegaThreshold: number;
  /** Symmetric joint-torque saturation. */
  torqueLimit: number;
  /** V(x) = δxᵀPδx level below which the LQR capture stage engages. */
  captureLevel: number;
}

/**
 * Defaults calibrated on the unit double pendulum (m = l = 1, g = 9.81) with
 * the default LQR weights at dt = 5 ms: the energy pump reaches the upright
 * level set in ~7 s and first dips to V ≈ 2.1e3 there, so the 2.5e3 gate
 * catches the first pass (`tests/control-swingup.test.ts` pins this run).
 * `captureLevel` is measured in units of the *discrete* cost-to-go δxᵀPδx and
 * must be recalibrated if Q, R, dt, or the plant parameters change.
 */
export const DEFAULT_SWINGUP_GAINS: SwingUpGains = {
  ke: 1.2,
  kick: 2,
  kickOmegaThreshold: 0.05,
  torqueLimit: 30,
  captureLevel: 2500
};

export type SwingUpPhase = 'pump' | 'capture';

export interface HybridSwingUpController {
  /** Compute the joint torque for the current state, writing into `out`. */
  torque(state: ArrayLike<number>, out: Float64Array): Float64Array;
  /** Phase the controller is currently latched to. */
  phase(): SwingUpPhase;
  design: LqrDesign;
  gains: SwingUpGains;
  reset(): void;
}

/**
 * Pure energy-pump torque (phase 1 only) — exposed separately so the energy
 * monotonicity property can be tested in isolation from the hybrid latch.
 */
export function energyPumpTorque(
  state: ArrayLike<number>,
  parameters: PendulumParameters,
  gains: Pick<SwingUpGains, 'ke' | 'kick' | 'kickOmegaThreshold' | 'torqueLimit'>,
  out: Float64Array
): Float64Array {
  const w1 = Number(state[2] ?? 0);
  const w2 = Number(state[3] ?? 0);
  const energyGap = uprightEnergyDouble(parameters) - energyDouble(state, parameters).total;
  const q1 = gains.ke * energyGap * w1;
  const q2 = gains.ke * energyGap * w2;
  // Inverse of the virtual-work map Q1 = τ1 − τ2, Q2 = τ2.
  let tau1 = q1 + q2;
  let tau2 = q2;
  if (Math.abs(w1) + Math.abs(w2) < gains.kickOmegaThreshold && Math.abs(energyGap) > 1e-6) {
    tau1 += gains.kick;
  }
  const limit = gains.torqueLimit;
  out[0] = Math.min(limit, Math.max(-limit, tau1));
  out[1] = Math.min(limit, Math.max(-limit, tau2));
  return out;
}

export function createHybridSwingUpController(
  spec: LqrSpec,
  gains: Partial<SwingUpGains> = {}
): HybridSwingUpController {
  if ((spec.mode ?? 'full') !== 'full') {
    throw new Error('createHybridSwingUpController: the energy-pump phase requires full actuation; use iLQR for acrobot/pendubot swing-up');
  }
  const resolved: SwingUpGains = { ...DEFAULT_SWINGUP_GAINS, ...gains };
  const design = designUprightLqr(spec);
  let phase: SwingUpPhase = 'pump';
  return {
    design,
    gains: resolved,
    phase: () => phase,
    reset: () => {
      phase = 'pump';
    },
    torque(state: ArrayLike<number>, out: Float64Array): Float64Array {
      const level = lqrLyapunovLevel(design, state);
      if (phase === 'pump' && level <= resolved.captureLevel) phase = 'capture';
      else if (phase === 'capture' && level > 10 * resolved.captureLevel) phase = 'pump';
      if (phase === 'capture') {
        return lqrTorque(design, state, out, { torqueLimit: resolved.torqueLimit });
      }
      return energyPumpTorque(state, spec.parameters, resolved, out);
    }
  };
}

export interface ControlledSimOptions {
  dt: number;
  steps: number;
  /** Record every `sampleEvery`-th state (default 10). */
  sampleEvery?: number;
}

export interface ControlledSimResult {
  finalState: Float64Array;
  /** Sampled [t, θ1, θ2, ω1, ω2, τ1, τ2, E] rows. */
  samples: number[][];
  /** First time the controller latched to the capture phase (null = never). */
  captureTime: number | null;
  /** Phase at the end of the run. */
  finalPhase: SwingUpPhase;
}

/**
 * Closed-loop rollout: zero-order-hold torque from the controller, RK4 on the
 * actuated dynamics. One entry point shared by tests, docs, and notebooks so
 * every quoted swing-up result comes from the same loop.
 */
export function simulateHybridSwingUp(
  controller: HybridSwingUpController,
  spec: LqrSpec,
  state0: ArrayLike<number>,
  options: ControlledSimOptions
): ControlledSimResult {
  const sampleEvery = options.sampleEvery ?? 10;
  const state = new Float64Array(4);
  for (let i = 0; i < 4; i += 1) state[i] = Number(state0[i] ?? 0);
  const out = new Float64Array(4);
  const tau = new Float64Array(2);
  const samples: number[][] = [];
  let captureTime: number | null = null;
  const rhs = (s: StateVector, o: StateVector): void => {
    rhsDoubleActuated(s, spec.parameters, spec.gamma, tau, o);
  };
  for (let i = 0; i < options.steps; i += 1) {
    controller.torque(state, tau);
    if (captureTime === null && controller.phase() === 'capture') captureTime = i * options.dt;
    if (i % sampleEvery === 0) {
      samples.push([
        i * options.dt,
        state[0]!,
        state[1]!,
        state[2]!,
        state[3]!,
        tau[0]!,
        tau[1]!,
        energyDouble(state, spec.parameters).total
      ]);
    }
    rk4Step(state, options.dt, rhs, out);
    state.set(out);
  }
  return { finalState: state, samples, captureTime, finalPhase: controller.phase() };
}
