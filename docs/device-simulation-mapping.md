# Why a Pendulum Lab? — Mapping to Semiconductor Device Simulation

This project is a chaotic-pendulum laboratory on the surface, but the engineering
problems it solves are the same ones that decide whether a TCAD / device-physics
simulation can be trusted. This page maps each capability onto its device-simulation
counterpart, so the connection is explicit rather than implied.

## The core thesis

A device simulator and a chaos laboratory live or die by the same question:
**how do you know the number the solver printed is physics and not artifact?**
Every validation gate in this project is a small, fully-worked instance of a
discipline that TCAD work demands at much larger scale.

## The mapping

| This project | Device-simulation counterpart |
|---|---|
| **Measured convergence order** — every integrator's order is verified by Richardson self-convergence (`empiricalOrder`), not assumed from the textbook | **Mesh/grid convergence studies** — refining the mesh and verifying the solution converges at the discretization's theoretical order; the standard way to separate physics from discretization error in drift-diffusion / hydrodynamic solvers |
| **Energy-drift accounting** per integrator, with symplectic methods labelled honestly (true symplecticity only in canonical coordinates, γ = 0) | **Conservation-law audits** — current continuity and charge conservation residuals; knowing which scheme conserves what *by construction* vs only approximately |
| **Analytic Jacobians** (`jacobianDouble`, exact closed form) replacing finite differences, removing a ~1e-7 error floor from every tangent-space quantity | **Analytic Jacobians in Newton solvers** — TCAD Newton iterations on the coupled Poisson/continuity system converge robustly only with consistent, exact Jacobians; FD Jacobians produce exactly this kind of hidden error floor |
| **Stiff integrators** (TR-BDF2, implicit midpoint with residual reporting) alongside explicit ones, selected per problem | **Stiff PDE time-stepping** — TR-BDF2 is literally *the* classic device-simulation time integrator (it was invented for power-device transients); knowing when explicit methods fail is daily TCAD reality |
| **Newton on the stroboscopic map + Floquet stability + continuation with branch switching** (`drivenPeriodicOrbit`, `continueArclength`, `switchPeriodDoubling`) | **Steady-state and small-signal analysis** — periodic steady state of driven devices (RF, power converters), pole/stability analysis, and tracing I–V branches through turning points (snapback, latch-up, NDR regions need pseudo-arclength exactly as folds do here) |
| **Predictability horizon from a 31-digit double-double reference** — float64 round-off grows from 1e-14 to decorrelation by t ≈ 20 s, measured not estimated | **Round-off and conditioning budgets** — ill-conditioned mass-matrix solves and near-degenerate meshes amplify machine epsilon the same way; knowing the *horizon* of validity is what separates a result from a plot |
| **External cross-validation against an independently derived SciPy reference** (different language, derivation, integrator family; agreement at the tolerance floor × e^{λt}) | **Simulator-to-simulator benchmarking** — validating an in-house solver against Sentaurus/Silvaco/COMSOL on shared structures before trusting it on new ones; the gold standard of credibility |
| **Uncertainty quantification on every Lyapunov estimate** (batched-means SE that respects autocorrelation, not naive SE) | **Error bars on extracted parameters** — mobility, Vth, leakage extracted from noisy simulated/measured curves need autocorrelation-aware statistics, or the error bars lie |
| **Parameter-study batch queue** (grid/random/symmetric plans, per-point diagnostics, reproducible export) | **Design-of-experiments / corner sweeps** — process-corner and parameter-sensitivity sweeps over device geometry and doping, with provenance for every point |
| **Reproducibility manifests** — hash-stamped run snapshots that re-verify to the bit | **Simulation provenance** — knowing exactly which deck, mesh, model flags and solver tolerances produced a curve; required for any qualification flow |
| **Worker architecture with a transparent main-thread fallback**, one pure job handler shared by UI, worker, CLI and tests | **HPC job orchestration** — the same solve must produce the same answer on a laptop and on the cluster; one code path, many execution contexts |
| **Honest claim boundaries** — "Wada *candidate*", "finite-time estimate", "sufficient (not necessary) fractality condition" documented per result | **Model validity ranges** — every TCAD model card has a domain of validity; over-claiming beyond calibration is the cardinal sin of device modelling |

## Concrete tool correspondences

The table above maps capabilities to *categories* of device-simulation work. The
correspondences below are deliberately specific — the exact algorithm in a named
commercial tool, and the routine in this project that exercises the same idea.
The point is not that a pendulum lab replaces a TCAD suite; it is that the
*numerical machinery* is shared, so a worked, fully-validated instance here is
direct evidence of understanding the machinery there.

| Commercial-tool algorithm | This project's counterpart | Why they are the same problem |
|---|---|---|
| **Synopsys Sentaurus Device** solves the coupled Poisson + electron/hole continuity system by **damped Newton–Raphson**, ramping the applied bias in small steps and warm-starting each solve from the previous converged bias point (bias/voltage continuation). Near snapback or breakdown the bias-controlled branch turns back on itself and a plain bias ramp stalls. | **`continueDrivenPeriodicOrbit`** (natural-parameter continuation, warm-started Newton from the previous orbit) and **`continueArclength`** (Keller pseudo-arclength) trace the driven-pendulum periodic orbit across a parameter and *around folds*. `drivenPeriodicOrbit` is the Newton solve at a single parameter; `switchPeriodDoubling` / `switchSymmetryBreaking` continue onto the bifurcated branch. | A bias sweep and a parameter sweep of a periodic orbit are the *same continuation problem*: a nonlinear system `G(x, λ) = 0` followed as `λ` varies, with warm starts for robustness and pseudo-arclength to survive the turning points (snapback / latch-up in a device; folds in the orbit family here). |
| **Synopsys/Silvaco transient device simulation** integrates the same stiff DAE in time with **TR-BDF2** (the trapezoidal/BDF2 composite step — invented for SPICE-class power-device transients) and an adaptive, error-controlled time step. | **`step('bdf2', …)`** in `src/physics/integrators.ts` (the `'bdf2'` id is the L-stable TR-BDF2 composite step, `trBdf2Step`) sits next to the explicit and other implicit methods behind one **`step()` dispatcher**; the implicit steppers accept an exact analytic Jacobian for quadratic Newton convergence. | Stiff transients (a fast RC/relaxation timescale coupled to a slow drive) make explicit methods either unstable or forced to a tiny step. Choosing an L-stable implicit method *and knowing why* is the daily judgement TR-BDF2 was built to support — demonstrated here on a system small enough to certify the order empirically (`empiricalOrder`). |
| **COMSOL Multiphysics** time-dependent solver offers **BDF** and **generalized-α** integrators with automatic order/step-size control, and reports the local error estimate driving the step. | **Embedded RKF45 / Dormand–Prince 5(4)** in this engine carry an embedded lower-order solution whose difference is the per-step **local error estimate** used for step-size control; the same `step()` dispatcher selects them per problem. | Adaptive time-stepping is error estimation plus a controller. Whether the estimate comes from an embedded RK pair (here) or a BDF predictor–corrector (COMSOL), the engineering content — "trust the step only as far as the estimated local error allows" — is identical, and is what the credibility badges surface to the user. |
| **Sentaurus / Silvaco Atlas** report **Newton convergence diagnostics** (residual norms, update norms, pivot quality) and refuse to silently return a non-converged solution. | **`assertLinearSolve` / `linearSolve`** return honest failure diagnostics (min/max pivot magnitude, matrix and RHS scales, `‖Ax − b‖` residual, a `not-positive-definite` reason) and never invent a fallback solution; `fallbackPolicy: 'throw'` fails loudly at the solve site. | A solver that hides non-convergence behind a plausible-looking number is worse than one that fails. Both the device tool and this project treat the linear-solve residual as a first-class, reportable quantity rather than an internal detail. |

These are *structural* analogies, validated at small scale — not claims of feature
parity with a production TCAD suite. The transferable asset is the judgement:
when to reach for continuation vs a plain sweep, when stiffness forces an implicit
method, and how to tell a converged result from an artifact.

## Why nonlinear dynamics specifically

Semiconductor devices are themselves nonlinear dynamical systems. Negative
differential resistance, thermal runaway, latch-up, and oscillator circuits are
bifurcation phenomena; the period-doubling cascade traced in this project
(A_PD ≈ 1.066 for the driven pendulum, located by Floquet multipliers crossing −1
and confirmed by switching onto the period-2 branch) is the same mathematics used
to analyse instability onset in power devices and the periodic steady state of
RF circuits. Learning it on a system small enough to *fully* validate — where an
independent reference, an extended-precision ground truth, and closed-form
normal modes all exist — builds the judgment to apply it where no ground truth
is available.

## Summary

The pendulum is the smallest system that exhibits every hard numerical problem a
device simulator faces: stiffness, conservation, chaos-amplified error, stability
analysis, continuation through folds, and the need for independent validation.
This project treats each of those problems at research grade. The domain
knowledge of semiconductor physics is learnable; the validation discipline is
what this portfolio demonstrates.
