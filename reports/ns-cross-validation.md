# Neimark-Sacker rotation-number cross-validation

Engine (`continueNeimarkSackerTorus`, `planarMapRotationNumber`) vs an independent
SciPy/NumPy reference (`scripts/scipy_neimark_sacker.py`) on the delayed-logistic map.
All rotation numbers → 1/6 ≈ 0.16667 at the NS onset a = 2.

| a | SciPy winding ρ | engine winding ρ | engine collocation ρ | SciPy linear ρ | |Δwinding| | pass |
|---|---|---|---|---|---|---|
| 2.050 | 0.161772 | 0.161772 | 0.161772 | 0.168872 | 1.95e-7 | PASS |
| 2.040 | 0.162804 | 0.162804 | 0.162804 | 0.168445 | 2.35e-7 | PASS |
| 2.030 | 0.163807 | 0.163807 | 0.163807 | 0.168011 | 8.87e-8 | PASS |
| 2.020 | 0.164784 | 0.164785 | 0.164784 | 0.167571 | 3.01e-7 | PASS |
| 2.010 | 0.165737 | 0.165737 | 0.165737 | 0.167122 | 8.28e-8 | PASS |

The winding ρ is the same nonlinear quantity computed in two languages, so it must agree to ~1e-3;
the collocation ρ is compared to SciPy's winding ρ on the same circle; SciPy's linear ρ = arg(λ)/2π
is the onset prediction and differs by O(amplitude²) away from a = 2.
