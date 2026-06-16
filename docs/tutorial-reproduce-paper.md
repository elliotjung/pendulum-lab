# Tutorial: reproduce the mini-paper results from scratch

The mini-paper (*"Measuring the gap between the Melnikov threshold and the
period-doubling cascade in the damped driven pendulum"*, `paper/index.html`)
is fully reproducible from this repository. This walks through it end to end
and explains what each number means.

## 0. Prerequisites

```bash
node --version   # ≥ 20
npm install
```

Optional cross-checks: `python` with `scipy` (`validate:cross`) and `sympy`
(`validate:sympy`), `julia` (`validate:julia`).

## 1. Establish trust: run the validation ladder

```bash
npm test                      # 756 unit tests (physics, chaos, research tooling)
npm run validate:reference    # every integrator at its theoretical order
npm run validate:literature   # elliptic period, normal modes, Melnikov A_c, A_PD
npm run validate:sympy        # symbolic second reference (needs python+sympy)
```

Outputs land in `reports/*.{md,json}`. You should see the period-doubling
onset measured at A_PD ≈ 1.0664 against the published 1.0663 — that anchor is
the cornerstone of the paper's claim.

## 2. Run the numerical experiment

```bash
npm run paper:study
```

This sweeps the damping γ over the configured grid; per γ it:

1. computes the **analytic Melnikov threshold** A_c(γ, ω) =
   (4γ/πω)·cosh(πω/2) and pins it against quadrature of M(t₀);
2. locates the **period-doubling onset A_PD** by Newton-on-the-stroboscopic-map
   periodic-orbit continuation with Floquet-multiplier monitoring (the onset is
   where the leading multiplier crosses −1);
3. corroborates the chaos onset with the **0–1 test** (K ≈ 0 → ≈ 1).

Results: `reports/paper-study.json` — for each γ: `Ac`, `Apd`, `ratio`,
Floquet residuals, and the 0–1 K values with confidence intervals.

Key parameters (in `scripts/paper-study.ts`): drive frequency ω = 2/3,
integration dt = 1e-3 (RK4 fiducial), continuation tolerance 1e-10,
transient discard before each diagnostic. Change γ grid density there if you
want a finer ratio curve.

## 3. Build the paper

```bash
npm run paper:build
```

Renders `paper/index.html` (+ `paper/paper.pdf`) with the strobe bifurcation
diagram, the A_PD/A_c ratio curve and its reversal at γ ≈ 0.69, embedded
provenance (parameters, dt, tolerances, script names, JSON paths) and the
study hash.

## 4. Verify the claims yourself

| Claim | Where to look | Independent check |
|---|---|---|
| A_c analytic formula is right | `reports/paper-study.json` → `melnikov.quadratureError` | quadrature ‖M(t₀)‖ zeros match analytic A_c |
| A_PD is a real period doubling | `floquet.multiplier` ≈ −1 at onset | re-run with halved dt: onset shifts < tolerance |
| ratio reverses at γ ≈ 0.69 | `ratio` column crosses 1 | 0–1 test K jumps 0→1 in the same window |
| onset matches literature at γ = 0.5 | `npm run validate:literature` | published A_PD = 1.0663 |

## 5. Interactive exploration (optional)

Open the app (`npm run dev`), Research mode → Govern → Research tab:

- **Periodic Orbit Finder** card: find the period-1 orbit at your own (A, γ),
  trace the branch, watch the Floquet multipliers.
- **Analysis Superpack → Melnikov Threshold**: the same A_c with quadrature
  cross-check at the current controls.
- Every number carries a result badge — `FINITE-TIME ESTIMATE` for the chaos
  diagnostics, `VALIDATED` where an independent reference was checked.

## 6. Package it

Research tab → Paper Export Pack → **Export ZIP Bundle** produces
`pendulum_research_bundle.zip` with figures (PNG + deterministic SVG),
`manifest/provenance.json` (artifact DAG), and `manifest/checksums.json`
with **SHA-256 per-file checksums** — verify any file with `sha256sum`.
