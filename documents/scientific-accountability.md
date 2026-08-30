# Scientific Accountability

This document answers three different questions about the mathematical parts of
Pendulum Lab: what is implemented, what a test establishes, and what someone
must understand before extending or citing it. Those are related, but they are
not interchangeable claims.

The canonical machine-readable list of public claims is
`config/claim-registry.json`. The public reviewer combines that registry with a
fresh, source-bound evidence artifact. Prose here explains the boundary; it does
not override the registry, a report, or a failed/expired probe.

## Claims, tests, and understanding

| Level | Minimum evidence | It does not establish |
| --- | --- | --- |
| Implemented | A reachable source path with validated inputs, outputs, and failure behavior | Correct mathematics, useful UX, or adequate parameter coverage |
| Tested | A named test or report, its fixture, oracle, tolerance, environment, and source commit | A proof of theory, all regimes, infinite-time behavior, or independent replication unless the oracle really is independent |
| Understood | A derivation or reference, assumptions, conditioning, error/failure mechanism, and an explanation of what would falsify the result | That future modifications preserve the argument without re-review |

Before promoting a method or result, a reviewer should be able to answer:

1. Which equation is advanced, in which coordinates and units?
2. Which approximation is made, and what is its expected order or bias?
3. Which fixture exercises that statement, and what oracle is independent of
   the implementation?
4. How does the method report rejection, non-convergence, a singular system,
   non-finite state, or exhausted work budget?
5. What parameter region, time horizon, platform, and precision were not tested?

## Numerical method accountability

| Method family | Implemented behavior | Tested statement | Assumptions and failure modes |
| --- | --- | --- | --- |
| Euler, RK2, RK4 | Fixed-step explicit one-step methods | Harmonic-oscillator and reference suites measure expected convergence; regression tests pin finite output and input contracts | Stability still depends on `dt`; RK4 is not symplectic, and a small short-run error does not promise bounded long-run energy error |
| RKF45 | Fehlberg embedded fixed macro-step with an exposed error monitor | `tests/numerics.test.ts` checks error reduction under step refinement | The exported monitor is not an adaptive integration guarantee unless a controller accepts/rejects steps and records its history |
| Dormand–Prince 5(4) | Fifth-order advance plus fourth-order embedded error; `adaptiveStep` and `integrateAdaptive` support scalar or component tolerances | Acceptance/rejection, replay metadata, min-step failure, and iteration-budget paths are exercised by numerical and hardening suites | The normalized error is the maximum component ratio shown below; reaching `minDt`, a non-finite estimate, or the iteration budget terminates without claiming the target was reached |
| DOP853 8(5,3) | Fixed macro-step eighth-order advance with Hairer's combined E5/E3 monitor | Tableau/order and monitor behavior are pinned in `tests/stiff-highorder.test.ts` and reference validation | This in-browser implementation is not the independent oracle and is not an adaptive SciPy clone; independent comparison uses SciPy's DOP853 path |
| Gragg–Bulirsch–Stoer | Modified-midpoint sequence and polynomial extrapolation in squared substep size | Measured order and energy envelopes are included in reference validation | Accuracy depends on smoothness, stage count, conditioning of extrapolation, and roundoff; one high-accuracy run is not a universal reference truth |
| Implicit midpoint | Allocation-aware fixed-point production step plus a separately instrumented Newton solve with residual/history/condition estimate | `tests/implicit-diagnostics.test.ts` injects non-finite, singular, and non-converged cases; structure tests measure bounded drift | Fixed-point convergence needs a sufficiently contractive step. A symplectic statement needs canonical `(q,p)`, `gamma = 0`, and a converged solve. Failed Newton reports return the previous state and retry guidance |
| Gauss–Legendre 4/6 | Implicit collocation stages solved iteratively; final residual is exposed | Convergence order and structure-preservation fixtures cover representative conservative systems | Classical order and A-stability do not mean every nonlinear stage solve converges. In `(theta, omega)` chain coordinates, bounded drift is evidence of time symmetry, not proof of canonical symplecticity |
| TR-BDF2 | Two Newton-solved implicit stages; analytic/RHS Jacobian is preferred and a central-difference Jacobian is the fallback | `tests/stiff-highorder.test.ts` covers stiff behavior and fail-closed diagnostics | L-stability intentionally damps stiff modes, so energy loss is not automatically an instability. Non-finite RHS/Jacobian, a singular Newton matrix, or 25 exhausted iterations rejects the step and preserves the prior state |
| Leapfrog and Yoshida compositions | Kick–drift–kick and recursive symmetric compositions over position/velocity halves | Separable oscillator order and double-pendulum drift behavior are measured | They are exact structure-preserving methods only for a compatible separable Hamiltonian split. Velocity-coupled pendulum acceleration makes the theta/omega use a pseudo-coordinate approximation; higher order does not remove that model mismatch |

For the adaptive Dormand–Prince path, the accepted error is

\[
\max_i \frac{|e_i|}{\operatorname{atol}_i +
\operatorname{rtol}_i\max(|y_i|,|y_i^{new}|)} \le 1.
\]

An exported adaptive result is incomplete without accepted and rejected counts,
the accepted-step sequence or equivalent replay metadata, final/target time,
termination reason, tolerances, and controller settings. A fixed-step result is
incomplete without the method and `dt`. For implicit methods, also retain the
residual tolerance, iterations, convergence flag, and failure code.

Analytic or automatic-differentiation Jacobians are preferred because a
finite-difference Jacobian introduces a scale choice and cancellation error.
Where the central-difference fallback is used, the report must say so; agreement
between two paths that share the same RHS is useful regression evidence but is
not an independent derivation.

## What representative tests do not prove

- A dt-halving slope on a harmonic oscillator establishes measured order near
  that fixture; it does not establish stability or accuracy for every pendulum,
  stiffness, discontinuity, or horizon.
- Energy boundedness over a chosen conservative run establishes an observed
  envelope; it does not prove exact conservation or all-time bounded error.
- SciPy/SymPy agreement is independent only to the extent described in the
  reproduction report and environment lock. Chaotic trajectories are expected
  to decorrelate after a finite shadowing horizon.
- A positive finite-time Lyapunov estimate is not a proof of asymptotic chaos.
  Window, transient, renormalization, observable, uncertainty, and step
  refinement belong to the claim.
- Passing unit, browser, accessibility-library, or visual tests does not replace
  physical hardware runs, manual assistive-technology use, tagged-PDF review, or
  classroom/user observation.

## Reading a chaotic trajectory

Start with one question, not every available diagnostic:

1. **Reference:** show one trajectory with its full initial state, units,
   integrator, `dt` or tolerances, and a visually stable reference identity.
2. **Single perturbation:** change exactly one named component by an explicit
   signed delta such as `delta theta2 = 1e-4 rad`. Keep the reference visible and
   say which colour is which.
3. **Ensemble:** only then add more members. State the perturbation distribution
   or deterministic sequence, seed, member count, and why the ensemble was
   introduced.
4. **Summary:** report finite-horizon distributions or quantiles with an
   uncertainty method. Do not let a spaghetti plot stand in for interpretation.

The machine contract in `documents/schemas/ensemble-interpretation.schema.json`
and its checked example require that progression, one reference member, explicit
perturbation magnitude/units/component, member legends, the horizon, numerical
settings, and ordered summary quantiles.

## Long-horizon interpretation policy

A single colored line may answer “what did this numerical initial state do over
this horizon?” It cannot support “what does the chaotic system do in general?”
Long-horizon claims therefore use an ensemble as the primary evidence and retain
the reference trajectory as orientation, not as the statistical result.

Every such result must disclose:

- reference initial state and the exactly perturbed component;
- perturbation model, magnitude, units, seed, and ensemble size;
- finite duration, transient removal, sampling cadence, integrator, step or
  tolerance controller, and rejected/non-converged member policy;
- observable, distribution/quantiles, uncertainty method, and effective sample
  limitations;
- a non-claim explaining that the result is finite-time and parameter-specific.

This contract improves interpretation and reproducibility. It does not by itself
establish that the UI has taught the concept successfully; that requires real
user or classroom feedback.
