# Numerical Method Notes

## Integrator Claims

`rk4` is the recommended general baseline for browser runs. It is not symplectic, so energy behavior is a numerical diagnostic rather than a preservation guarantee.

`euler` and `rk2` are available for comparison and tests. They should not be used for research claims except as intentionally low-order references.

`leapfrog`, `symplectic`, and `yoshida4` are now genuinely implemented (previously they silently fell back to RK4 inside `step()`). They split the state vector into a position half and a velocity half:

- `symplectic` is semi-implicit (symplectic) Euler, order 1.
- `leapfrog` is velocity-Verlet kick-drift-kick, order 2.
- `yoshida4` is a fourth-order Yoshida triple composition of the leapfrog step.

They remain labeled as separable or pseudo-coordinate approximations. A symplectic claim is only defensible when the method is applied to canonical coordinates and the Hamiltonian splitting assumptions are satisfied; for the velocity-coupled pendulum acceleration the structure preservation is approximate. Empirical convergence orders are asserted in `tests/numerics.test.ts`.

`gauss2` is now the genuine 2-stage Gauss-Legendre collocation method (classical order 4, symplectic and A-stable for canonical systems), solved by fixed-point iteration with the final residual exported via `previousError`. A 3-stage order-6 variant (`gaussLegendre6Step`) is also available.

The adaptive framework in `src/physics/adaptive.ts` adds a Dormand-Prince 5(4) embedded step, an error-per-step controller (`adaptiveStep` / `integrateAdaptive` returning accepted/rejected step counts), and Richardson extrapolation (`richardsonStep`).

`hmidpoint` and `gauss2` can support canonical symplectic claims only when:

- coordinates are canonical theta/p coordinates,
- damping `gamma` is exactly `0`,
- implicit residuals and iteration limits are reported,
- replay metadata includes method, dt, tolerance, and state hash.

`rkf45` is adaptive and useful for error control, but replay determinism requires accepted/rejected step counts and effective dt history.

`dopri5` is Dormand-Prince 5(4): the fifth-order solution advances while the embedded fourth-order pair supplies the error estimate (the method behind MATLAB `ode45`).

`dop853` is the fixed-step Dormand-Prince 8(5,3) tableau used by Hairer and by SciPy's `solve_ivp(DOP853)`. The eighth-order solution advances, while the embedded fifth-order pair is exposed through `previousError` as an error monitor. It is deliberately kept as a high-accuracy macro-step reference inside the browser engine; SciPy remains the independent external oracle for cross-validation rather than a circular in-repo reference.

`gbs` is a Gragg-Bulirsch-Stoer extrapolation method (modified-midpoint substeps plus polynomial extrapolation in the squared substep size). Its effective order grows with the number of stages; the long-term energy benchmark shows it reaching machine-precision energy conservation. The extrapolation weights are *computed* from the substep ratios rather than transcribed from a tableau, while DOP853's larger tableau is separately test-pinned against order and error-monitor behavior.

`bdf2` is TR-BDF2: a one-step, self-starting, L-stable, second-order method for stiff systems, solved with Newton iteration and a finite-difference Jacobian. Because it is L-stable it adds numerical damping, so its energy "drift" in the benchmark reflects intentional dissipation, not instability; use it for stiff regimes, not for conservative long-horizon claims. A classical multistep BDF is intentionally not provided because it cannot fit the history-free single-step `step()` contract.

## Generalized Systems

`src/physics/nPendulum.ts` generalizes the chain pendulum to N links (`rhsChain`, `energyChain`). It reproduces `rhsDouble` and `rhsTriple` to machine epsilon (tested), so it is the canonical path for four or more links. `src/physics/driven.ts` (driven / damped-driven pendulum, made autonomous through a drive-phase coordinate) and `src/physics/spring.ts` (elastic pendulum) add dissipative and multi-mode systems; their energy functions are diagnostics, and for driven/damped systems energy is deliberately not a conservation target.

## Event Detection

`src/physics/events.ts` (`detectEvents`) integrates while bisecting inside each step to locate zero-crossings of user predicates, with rising/falling/both direction filtering. It is the primitive behind Poincaré sections and period measurement; the located crossing times match the analytic harmonic-oscillator zeros to better than 1e-5 in tests.

## Canonical Coordinates

`src/physics/canonical.ts` implements the double-pendulum mass matrix `M(theta)`, `theta/omega <-> theta/p` conversion, Hamiltonian evaluation, finite-difference Hamiltonian gradients, canonical RHS, and an implicit midpoint step that reports residual, iteration count, and convergence status.

The legacy theta/omega leapfrog-style methods remain classified as pseudo-coordinate approximations. The canonical implicit midpoint path is distinct and should be used for any true symplectic claim. Even there, the claim applies only for `gamma = 0` and converged residuals.

## Automated Checks

Validation reports include short-horizon energy drift, replay determinism, JSON import rejection, RK4 dt-halving discrepancy, and canonical midpoint residual. These are smoke checks, not formal proofs.

`src/validation/referenceSuite.ts` (run via `npm run validate:reference`) adds a cross-validation pass over every registered integrator: measured convergence order against the closed-form harmonic oscillator, an energy-conservation envelope on the conservative double pendulum, and agreement with the highest-accuracy method (`gbs`) as a numerical reference. The report (`reports/validation-reference.md`) records the measured order and envelope status per method; the suite exits non-zero if any method falls outside its expected envelope. This validates that each method behaves as its theory predicts — not that every method is equally accurate.

## Damping And Energy

When `gamma > 0`, energy should generally decrease because damping is part of the physical model. In that mode, total energy is not a conservation target. Reports must describe energy change as dissipative behavior plus numerical error, not pure energy drift.

## Triple Pendulum Limits

Triple pendulum trajectories are more sensitive to conditioning, time step, and browser floating-point differences. `src/physics/triple.ts` provides a finite RHS implementation for tests, but research claims still require independent comparison.

## Chaos Diagnostics

Finite-time Lyapunov values, spectra, Poincare sections, and bifurcation maps depend on transient windows, renormalization intervals, section definitions, and sampling caps. Reports should include those settings; a single Lyapunov number is not enough for a reproducible claim.

`src/chaos/` implements these diagnostics on top of the shared variational machinery (`variational.ts`: finite-difference Jacobian, tangent-flow augmented RHS, Gram-Schmidt). `maximalLyapunov` uses the Benettin two-trajectory method; `lyapunovSpectrum` uses Gram-Schmidt reorthonormalization and also returns the Kaplan-Yorke dimension and the spectrum sum (≈ 0 for conservative systems is a built-in sanity check). `saliIndicator` and `fliIndicator` are fast ordered/chaotic classifiers. `poincareSection` and `bifurcationDiagram` wrap the event-detection solver so section points sit on the section to the bisection tolerance. Every result object carries the transient and renormalization settings used to produce it, so a result is self-describing rather than a bare number. The validating tests pin the expected qualitative behavior: positive maximal exponent and decaying SALI for the damped-driven chaos preset, and ~0 exponent with O(1) SALI for regular motion.

## Browser Limits

Browser scheduling, tab throttling, GPU state, device pixel ratio, and JavaScript engine differences can affect FPS, timing, and reproducibility. The benchmark and validation reports therefore record browser and runtime metadata.
