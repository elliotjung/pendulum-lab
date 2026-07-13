import type { IntegratorId } from '../types/domain';
import type { IntegratorMeta } from './types';

/** Public method metadata kept separate from the numerical tableaux/steppers. */
export const integratorRegistry: Readonly<Record<IntegratorId, IntegratorMeta>> = Object.freeze({
  euler: {
    id: 'euler', name: 'Explicit Euler', order: 1, symplectic: 'no', dampingSupport: 'supported',
    stabilityNotes: ['Fast smoke-test method only; large energy drift is expected.'], recommendedDt: [0.0005, 0.002]
  },
  rk2: {
    id: 'rk2', name: 'Midpoint RK2', order: 2, symplectic: 'no', dampingSupport: 'supported',
    stabilityNotes: ['Useful for qualitative comparison, not a publication baseline.'], recommendedDt: [0.0005, 0.004]
  },
  rk4: {
    id: 'rk4', name: 'Runge-Kutta 4', order: 4, symplectic: 'no', dampingSupport: 'supported',
    stabilityNotes: ['Good general baseline; energy conservation is diagnostic only.'], recommendedDt: [0.0005, 0.006]
  },
  verlet: {
    id: 'verlet', name: 'Velocity Verlet Alias', order: 2, symplectic: 'separable-approximation', dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Legacy compatibility alias for the leapfrog KDK path.', 'Kept for imported sessions that used the single-file compatibility method id.'],
    recommendedDt: [0.0005, 0.004]
  },
  leapfrog: {
    id: 'leapfrog', name: 'Leapfrog Approximation', order: 2, symplectic: 'separable-approximation', dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Only symplectic for separable canonical Hamiltonians; theta/omega coordinates are not sufficient for a blanket claim.'],
    recommendedDt: [0.0005, 0.004]
  },
  symplectic: {
    id: 'symplectic', name: 'Semi-Implicit Euler', order: 1, symplectic: 'pseudo-coordinate', dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Treat as a qualitative phase-space view unless canonical coordinates are explicitly used.'], recommendedDt: [0.0005, 0.002]
  },
  yoshida4: {
    id: 'yoshida4', name: 'Yoshida 4 Composition', order: 4, symplectic: 'separable-approximation', dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Composition method inherits symplectic claims only from a valid separable canonical sub-step.'], recommendedDt: [0.0005, 0.004]
  },
  yoshida6: {
    id: 'yoshida6', name: 'Yoshida 6 Composition', order: 6, symplectic: 'separable-approximation', dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Symmetric triple-jump composition of Yoshida-4; the symplectic claim still requires a valid separable canonical split.', 'Negative substeps enlarge the error constant on velocity-coupled or dissipative systems.'],
    recommendedDt: [0.0005, 0.004]
  },
  yoshida8: {
    id: 'yoshida8', name: 'Yoshida 8 Composition', order: 8, symplectic: 'separable-approximation', dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Symmetric triple-jump composition of Yoshida-6; the symplectic claim still requires a valid separable canonical split.', 'Twenty-seven leapfrog substeps make this a high-accuracy research method, not the default interactive method.'],
    recommendedDt: [0.0005, 0.004]
  },
  hmidpoint: {
    id: 'hmidpoint', name: 'Implicit Midpoint', order: 'implicit', symplectic: 'canonical-only', dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Canonical symplectic claims require theta/p coordinates, gamma = 0, and residual reporting.', 'Uses Newton iteration when an analytic Jacobian is supplied; otherwise falls back to Picard fixed-point iteration.'],
    recommendedDt: [0.0005, 0.008]
  },
  gauss2: {
    id: 'gauss2', name: 'Gauss-Legendre 4 (2-stage)', order: 'implicit', symplectic: 'canonical-only', dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Two-stage collocation: classical order 4, symplectic and A-stable for canonical systems.', 'Stage equations are solved by fixed-point iteration; the final residual is exported via previousError.'],
    recommendedDt: [0.0005, 0.012]
  },
  rkf45: {
    id: 'rkf45', name: 'RKF45 Adaptive', order: 'adaptive', symplectic: 'no', dampingSupport: 'supported',
    stabilityNotes: ['Adaptive step statistics must be exported for replay and comparison.'], recommendedDt: [0.0002, 0.01]
  },
  dopri5: {
    id: 'dopri5', name: 'Dormand-Prince 5(4)', order: 5, symplectic: 'no', dampingSupport: 'supported',
    stabilityNotes: ['The fifth-order solution advances; the embedded fourth-order pair provides the error estimate (the method underlying MATLAB ode45).'],
    recommendedDt: [0.0002, 0.012]
  },
  dop853: {
    id: 'dop853', name: 'DOP853 8(5,3)', order: 8, symplectic: 'no', dampingSupport: 'supported',
    stabilityNotes: ['Explicit Dormand-Prince 8th-order tableau with embedded 5th/3rd error monitors.', 'Use as a high-accuracy fixed macro-step reference; SciPy DOP853 remains the independent external oracle.'],
    recommendedDt: [0.0005, 0.03]
  },
  gbs: {
    id: 'gbs', name: 'Gragg-Bulirsch-Stoer', order: 'adaptive', symplectic: 'no', dampingSupport: 'supported',
    stabilityNotes: ['Modified-midpoint extrapolation; effective order grows with the number of stages.', 'Extrapolation weights are computed from substep ratios, not transcribed, so high accuracy is reached without a large hand-written tableau.'],
    recommendedDt: [0.001, 0.05]
  },
  bdf2: {
    id: 'bdf2', name: 'TR-BDF2 (stiff, L-stable)', order: 'implicit', symplectic: 'no', dampingSupport: 'supported',
    stabilityNotes: ['One-step, self-starting, L-stable second-order method for stiff systems.', 'Each stage uses Newton iteration with a finite-difference Jacobian; the final residual is exported via previousError.'],
    recommendedDt: [0.001, 0.05]
  }
});
