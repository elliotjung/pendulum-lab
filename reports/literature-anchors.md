# Literature-Anchor Validation

Generated: 2026-06-10T10:02:09.125Z

Engine-computed quantities compared head-to-head against published or closed-form
reference values — the external counterpart to the self-consistency checks
(convergence orders, spectrum constraints, independent-diagnostic agreement).

| Anchor | Reference | Published | Computed | |Δ| | Tol | Verdict |
|---|---|---:|---:|---:|---:|:--:|
| Free pendulum period at θ₀ = 2 rad vs T = 4K(sin(θ₀/2))/ω₀ | Landau & Lifshitz, Mechanics §11 (complete elliptic integral) | 8.3497529 | 8.3497529 | 3.50e-12 | 1e-6 | PASS |
| Equal double pendulum normal mode ω²+ = (2 + √2)g/l | Goldstein, Classical Mechanics, ch. 6 (small oscillations) | 33.493435 | 33.493435 | 0.00e+0 | 1e-8 | PASS |
| Equal double pendulum normal mode ω²− = (2 − √2)g/l | Goldstein, Classical Mechanics, ch. 6 (small oscillations) | 5.7465650 | 5.7465650 | 8.88e-16 | 1e-8 | PASS |
| Melnikov critical amplitude A_c at γ = 0.5, ω = 2/3: quadrature vs closed form (2/π)cosh(π/3) | Guckenheimer & Holmes, Nonlinear Oscillations, §4.5 | 1.0187743 | 1.0187743 | 4.33e-14 | 1e-8 | PASS |
| Damped driven pendulum (γ = 0.5, ω = 2/3) period-doubling onset A_PD from ρ → −1 | Baker & Gollub, Chaotic Dynamics (damped driven pendulum cascade) | 1.0663000 | 1.0663715 | 7.15e-5 | 5e-3 | PASS |

## Structural checks

| Check | Reference | Measured | Verdict |
|---|---|---|:--:|
| Melnikov threshold lies below the period-doubling onset (tangle precedes attractor chaos) | Guckenheimer & Holmes, Nonlinear Oscillations, §4.5 | A_c ≈ 1.0188 < A_PD ≈ 1.0664 | PASS |
| Double-pendulum flip-basin boundary box-counting dimension is strictly fractal (1 < d < 2) | Daza et al., basin entropy framework (fractal exit boundaries) | measured d ≈ 1.623 at n = 48 | PASS |

## Notes

- **melnikov-threshold**: closed form ≈ 1.0187; first-order perturbation theory, so a guide rather than an exact onset at γ = 0.5
- **period-doubling-onset**: Floquet multiplier −1 crossing bracketed in [1.0649999999999997, 1.0674999999999997]
