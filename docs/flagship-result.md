# Flagship Result - Certified Chaotic Dynamics Workbench

## Crown Result

**Melnikov threshold vs period-doubling onset: a quantitative gap map.**

The damped driven pendulum has two thresholds that are often blurred together:

- `A_c(gamma)`: the analytic Melnikov threshold for a transverse homoclinic
  tangle.
- `A_PD(gamma)`: the measured period-doubling onset of the primary period-1
  attractor, located by a Floquet multiplier crossing `rho = -1`.

Pendulum Lab's flagship claim is that, at `omega = 2/3`, the ratio
`A_PD / A_c` closes as damping increases and reverses near `gamma ~= 0.69`.
That makes the project more than a simulator: it is a verified workbench for
separating transient-chaos geometry from attractor-cascade dynamics.

## Why This Is The Crown

This result uses nearly every serious part of the platform:

- analytic threshold: `melnikovCriticalAmplitude`,
- measured nonlinear orbit: Newton stroboscopic fixed point,
- stability: Floquet monodromy eigenvalues,
- branch following: continuation from a stable seed,
- corroboration: 0-1 chaos test around the onset,
- validation: literature anchor at `gamma = 0.5`,
- reproducibility: JSON study, generated paper, PDF, manifest, hashes.

The result is compact enough for an outside reviewer to reproduce, but deep
enough to show the project's research discipline.

## Reproduce

```bash
npm run paper:study
npm run flagship:certify
npm run flagship:external
npm run paper:build
npm run reviewer:kit
```

For the one-command deterministic backbone:

```bash
npm run reproduce
```

For external validation:

```bash
npm run validate:cross
npm run validate:sympy
npm run validate:literature
```

## Trust Contract

- `A_c` is analytic and pinned by quadrature.
- `A_PD` is not inferred from visual bifurcation plots; it is refined through
  the Floquet multiplier crossing `rho = -1`.
- The classic `gamma = 0.5` value is anchored to the published Baker-Gollub
  period-doubling onset.
- Every figure in `paper/index.html` is regenerated from
  `reports/paper-study.json`.
- Figure 1 is certified separately by `reports/flagship-certification.json`,
  `reports/flagship-certification.md`, and `reports/flagship-figure1.svg`.
- The paper's Appendix A-C embeds the onset uncertainty table, independent
  Python A_PD measurements, the Python bracket/bisection search trace, caveat
  ledger, embedded deterministic figure hashes, the certified SVG hash,
  reproduction commands, and artifact cross-references.
- A dependency-free Python external check recomputes `A_c`, recomputes the ratio
  crossing, and independently remeasures selected `A_PD` values by RK4
  stroboscopic integration plus finite-difference Floquet bisection in
  `reports/flagship-external-check.json`.
- The claim boundary is narrow by design: Melnikov threshold versus
  Floquet-refined period-doubling onset for the specified driven-pendulum branch
  at `omega = 2/3`, not a global basin statement or higher-order Melnikov bound.
- The caveat is part of the claim: first-order Melnikov theory is asymptotic
  and should not be treated as a strong-damping ordering bound.

## Reviewer Kit

See `docs/reviewer-kit.md` and the generated
`reports/reviewer-kit-manifest.md`.
