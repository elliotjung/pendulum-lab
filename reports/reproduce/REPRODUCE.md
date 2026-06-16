# Reproduce — research result manifest

Every result below is recomputed deterministically by `npm run reproduce` from the
library (the same code paths as the tests/worker/CLI). Each carries a content hash so
a re-run can be diffed bit-for-bit.

| id | result | hash | command |
|---|---|---|---|
| embedded-chain-pole-passage | energyDrift=4.268e-12, lzDrift=1.902e-10, unitConstraintError=0.000 | `06e173457e42` | `(library) EmbeddedSphericalChain — tests/spherical-embedded-chain.test.ts` |
| ns-torus-rotation-number | a=2.010, rotationNumber=0.1657, invarianceResidual=2.253e-11, converged=true | `1205872ecd42` | `npm run research -- nstorus` |
| arnold-tongue-half | start=0.4650, end=0.5350, width=0.07000, monotone=true | `13b2b8bd4697` | `npm run research -- arnold --k 1` |
| torus-lyapunov | largest=-1.078e-7, transverse=-0.02083, verdict=quasi-periodic-torus | `1cadaa68203c` | `npm run research -- toruslyap --a 2.02` |
| ns-spectral-convergence | spectral=true, geometricRate=-0.5543, dropFactor=6.642e+5, spectralR2=0.9596, algebraicR2=0.8918 | `0b514c333e76` | `npm run research -- nsconv --a 2.02` |
| structure-preservation | rk4Secular=true, rk4MaxDrift=0.0002902, gauss2Secular=false, gauss2MaxDrift=6.715e-8 | `0c653938faa6` | `npm run research -- drift` |
| sde-gbm-moments | mean=1.349, variance=0.3225, expectedMean=1.350, expectedVar=0.3162 | `186cc1a94053` | `npm run research -- sde --scheme milstein` |
| transcritical-switch | switched=true, state=0.2, separation=0.2000, residual=0.000 | `18922d6bb87a` | `npm run research -- transcritical --step 0.2` |

## Remaining one-liners (browser / external)

- `npm run paper:build` — the mini-paper (inline SVG figures + print PDF) from `paper:study`.
- `npm run notebook` — the figure-rich research notebook (analysis tabs driven headlessly).
- `npm run validate:cross` / `validate:sympy` / `validate:ns` — SciPy/SymPy external cross-checks.
- `npm run reports` — the consolidated validation report.
