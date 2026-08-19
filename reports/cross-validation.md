# External Cross-Validation — TypeScript engine vs SciPy DOP853

Generated: 2026-08-19T09:50:03.814Z

The SciPy reference re-derives the equations of motion independently (different
language, different derivation route, different integrator family) and integrates
with `solve_ivp` DOP853 at rtol = atol = 1e-13. The TypeScript engine integrates the
same initial conditions with its own RHS via RK4 at dt = 2e-5. The double pendulum is
compared against closed-form Lagrangian equations; the triple pendulum against the
general N-chain mass-matrix formulation solved with `numpy.linalg.solve` (the engine
uses a hand-expanded 3×3 Gaussian elimination — a different linear-solve path).

| Case | System | Horizon | Max ‖Δ‖∞ | At end | Bound | Verdict | TS energy drift | SciPy energy drift |
|---|---|---:|---:|---:|---:|:--:|---:|---:|
| regular small-angle | double | 20 s | 4.70e-14 | 4.53e-14 | 1.00e-8 | PASS | 2.84e-14 | 7.11e-15 |
| chaotic | double | 10 s | 3.91e-11 | 3.91e-11 | 1.00e-5 | PASS | 3.77e-13 | 6.82e-12 |
| regular small-angle | triple | 20 s | 5.65e-14 | 3.66e-14 | 1.00e-8 | PASS | 7.82e-14 | 7.11e-15 |
| chaotic | triple | 8 s | 2.10e-8 | 2.10e-8 | 1.00e-4 | PASS | 3.06e-13 | 8.43e-12 |

For the chaotic cases the divergence grows like e^{λ₁ t} from the shared tolerance
floor, so agreement is only asserted on the predictability horizon; the regular cases
must agree essentially to the tolerance floor over the full window.
