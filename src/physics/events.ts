import type { Derivative, StateVector } from './types';
import { rk4Step } from './integrators';
import { dormandPrince54StepDense } from './adaptive';
import { refineCrossing } from './eventLocator';
import { checkedWorkProduct, integrationStepCount, NUMERICAL_WORK_BUDGETS } from '../validation/numericalBudgets';

/**
 * Event-detection solver. Integrates a system while watching scalar event
 * functions g(state); whenever one crosses zero it refines the crossing time
 * and state inside the step (shared secant/bisection hybrid from
 * `eventLocator.ts`) to a requested tolerance. This is the primitive behind
 * Poincare sections, period measurement, and apex/return detection.
 *
 * Two refinement back-ends are available: re-advancing the step prefix with
 * RK4 per probe (default, matches the historical behaviour), or a single
 * Dormand-Prince 5(4) step whose free 4th-order dense output makes each probe
 * a polynomial evaluation instead of a re-integration (`denseOutput: true`).
 */

export type EventFunction = (state: StateVector) => number;

export type CrossingDirection = 'rising' | 'falling' | 'both';

export interface EventSpec {
  /** Scalar function whose sign change marks an event. */
  g: EventFunction;
  /** Which zero-crossing direction to report. Defaults to 'both'. */
  direction?: CrossingDirection;
  /** Optional label carried through to the hit record. */
  label?: string;
}

export interface EventHit {
  time: number;
  /** Index of the triggering spec in the input array. */
  eventIndex: number;
  label: string | undefined;
  /** +1 for a rising crossing (g goes - to +), -1 for falling. */
  direction: 1 | -1;
  state: StateVector;
}

export interface EventSolveOptions {
  dt?: number;
  maxTime: number;
  /** Root-refinement tolerance on the crossing time. */
  rootTol?: number;
  /** Stop after this many events (default: the platform safety ceiling). */
  maxEvents?: number;
  /** Optional stricter cap on endpoint and root-refinement event-function calls. */
  maxEventFunctionEvaluations?: number;
  /**
   * Advance with Dormand-Prince 5(4) and refine crossings on its dense-output
   * interpolant (one polynomial evaluation per probe) instead of re-running
   * RK4 prefixes. Higher-order trajectory and cheaper refinement.
   */
  denseOutput?: boolean;
}

export interface EventSolveResult {
  events: EventHit[];
  finalState: StateVector;
  finalTime: number;
}

function accepts(direction: CrossingDirection | undefined, g0: number, g1: number): 1 | -1 | 0 {
  const rising = g0 <= 0 && g1 > 0;
  const falling = g0 >= 0 && g1 < 0;
  const dir = direction ?? 'both';
  if (rising && (dir === 'rising' || dir === 'both')) return 1;
  if (falling && (dir === 'falling' || dir === 'both')) return -1;
  return 0;
}

export function detectEvents(
  state0: StateVector,
  rhs: Derivative,
  specs: readonly EventSpec[],
  options: EventSolveOptions
): EventSolveResult {
  const dt = options.dt ?? 1e-3;
  const rootTol = options.rootTol ?? 1e-9;
  const maxEvents = options.maxEvents ?? NUMERICAL_WORK_BUDGETS.events.maxRecordedEvents;
  const maxEventFunctionEvaluations =
    options.maxEventFunctionEvaluations ?? NUMERICAL_WORK_BUDGETS.events.maxEventFunctionEvaluations;
  const dense = options.denseOutput ?? false;
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new Error('detectEvents: dt must be positive and finite.');
  }
  if (!Number.isFinite(options.maxTime) || options.maxTime < 0) {
    throw new Error('detectEvents: maxTime must be finite and non-negative.');
  }
  if (!(rootTol > 0) || !Number.isFinite(rootTol)) {
    throw new Error('detectEvents: rootTol must be positive and finite.');
  }
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 0) {
    throw new Error('detectEvents: maxEvents must be a non-negative safe integer.');
  }
  if (maxEvents > NUMERICAL_WORK_BUDGETS.events.maxRecordedEvents) {
    throw new Error(`detectEvents: maxEvents must not exceed ${NUMERICAL_WORK_BUDGETS.events.maxRecordedEvents}.`);
  }
  if (!Number.isSafeInteger(maxEventFunctionEvaluations) || maxEventFunctionEvaluations < 0) {
    throw new Error('detectEvents: maxEventFunctionEvaluations must be a non-negative safe integer.');
  }
  if (maxEventFunctionEvaluations > NUMERICAL_WORK_BUDGETS.events.maxEventFunctionEvaluations) {
    throw new Error(
      `detectEvents: maxEventFunctionEvaluations must not exceed ${NUMERICAL_WORK_BUDGETS.events.maxEventFunctionEvaluations}.`
    );
  }
  const plannedSteps = integrationStepCount(options.maxTime, dt, 'detectEvents');
  if (plannedSteps > NUMERICAL_WORK_BUDGETS.events.maxIntegrationSteps) {
    throw new Error(
      `detectEvents: maxTime/dt must not exceed ${NUMERICAL_WORK_BUDGETS.events.maxIntegrationSteps} integration steps.`
    );
  }
  // Every spec is evaluated at both endpoints of every planned step. Root
  // refinement probes are input-dependent and are charged dynamically below.
  const minimumEventFunctionWork = checkedWorkProduct([plannedSteps, specs.length, 2], 'detectEvents');
  if (minimumEventFunctionWork > maxEventFunctionEvaluations) {
    throw new Error(
      `detectEvents: requested event scan exceeds the ${maxEventFunctionEvaluations}-evaluation work budget.`
    );
  }
  const events: EventHit[] = [];
  let eventFunctionEvaluations = 0;
  const evaluateEventFunction = (spec: EventSpec, value: StateVector): number => {
    if (eventFunctionEvaluations >= maxEventFunctionEvaluations) {
      throw new Error(
        `detectEvents: event-function evaluation work budget of ${maxEventFunctionEvaluations} exhausted.`
      );
    }
    eventFunctionEvaluations += 1;
    return spec.g(value);
  };

  const state = new Float64Array(state0);
  let t = 0;
  const next = new Float64Array(state.length);
  const probe = new Float64Array(state.length);
  let guard = 0;
  const guardMax = plannedSteps;

  while (t < options.maxTime && events.length < maxEvents && guard < guardMax) {
    guard += 1;
    // Accumulating a decimal dt can leave t one ulp below maxTime after the
    // nominal final step (for example 10 * 0.1). Make the last planned step the
    // exact remaining span so both the state and reported time land on maxTime.
    const stepDt = guard === guardMax ? options.maxTime - t : Math.min(dt, options.maxTime - t);
    // `stateAt(tau)` evaluates the in-step trajectory at offset tau into `probe`.
    let stateAt: (tau: number) => StateVector;
    if (dense) {
      const denseStep = dormandPrince54StepDense(state, stepDt, rhs);
      next.set(denseStep.y);
      stateAt = (tau) => denseStep.interpolate(tau / stepDt, probe);
    } else {
      rk4Step(state, stepDt, rhs, next);
      stateAt = (tau) => rk4Step(state, tau, rhs, probe);
    }

    const stepEvents: Array<EventHit & { offset: number }> = [];
    for (let s = 0; s < specs.length; s += 1) {
      const spec = specs[s]!;
      const g0 = evaluateEventFunction(spec, state);
      const g1 = evaluateEventFunction(spec, next);
      const dir = accepts(spec.direction, g0, g1);
      if (dir === 0) continue;
      const crossing = refineCrossing((tau) => evaluateEventFunction(spec, stateAt(tau)), 0, stepDt, g0, g1, {
        tol: rootTol
      });
      stepEvents.push({
        time: t + crossing.tAfter,
        eventIndex: s,
        label: spec.label,
        direction: dir,
        state: new Float64Array(stateAt(crossing.tAfter)),
        offset: crossing.tAfter
      });
    }

    // Multiple event functions may cross within one integration step. Input
    // spec order is not chronological, so refine all candidates before taking
    // the earliest ones required by maxEvents.
    stepEvents.sort((a, b) => a.offset - b.offset || a.eventIndex - b.eventIndex);
    for (const { offset: _offset, ...event } of stepEvents) {
      events.push(event);
      if (events.length >= maxEvents) {
        // Stopping on an event means the terminal state/time is the refined
        // crossing itself, not the end of the enclosing integration step.
        return { events, finalState: new Float64Array(event.state), finalTime: event.time };
      }
    }

    state.set(next);
    t = guard === guardMax ? options.maxTime : t + stepDt;
  }

  return { events, finalState: state, finalTime: t };
}
