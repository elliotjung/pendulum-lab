# Flagship External Check

Generated: 2026-07-10T14:01:12.288357+00:00

Max |A_c external - A_c reported|: `0.000e+00`

Crossing gamma: `0.692973` between `0.65` and `0.70`

## Independent A_PD Checks

| gamma | reported A_PD | remeasured A_PD | abs error | pass |
|---:|---:|---:|---:|---:|
| 0.50 | 1.066373 | 1.066373 | 5.916e-08 | true |
| 0.65 | 1.333771 | 1.333771 | 4.886e-08 | true |
| 0.70 | 1.424635 | 1.424635 | 4.844e-08 | true |

Caveat: A_PD checks use finite-difference monodromy and a coarser dt than the TypeScript flagship run, so they certify independent reproducibility at reviewer-kit tolerance, not bitwise equality.
