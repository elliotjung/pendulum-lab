# Pendulum Lab — a research-grade chaotic-pendulum platform

A framework-free, zero-runtime-dependency TypeScript platform for nonlinear
pendulum dynamics: 8 physical systems (double/triple/N-chain, driven, spring,
rope/string, double-string, **3D spherical N-chain**), 12 measured-order
integrators, a full chaos-diagnostics stack with uncertainties, and a
reproducibility pipeline (provenance, SHA-256 bundles, executable notebooks).
Every quantitative output carries a credibility badge: *visual-only →
finite-time estimate → validated → publication-ready* (+ *caveat*).

**Run it:** double-click the project-root `index.html` (self-contained,
no server) — or:

```bash
npm install
npm run dev        # live dev shell (app.html) at the printed URL
npm test           # 714 unit tests
npm run reproduce  # reproduce all headline claims headlessly (hash-stamped manifest)
```

UI modes (rail footer): **Beginner** (simulator only) · **Student** (+ analysis
& validation) · **Research** (everything).

## Claims, and how to reproduce each one

| # | Claim | Equation / method | Parameters | Reproduce | Evidence (JSON/report) | Caveat |
|---|---|---|---|---|---|---|
| 1 | All 12 integrators converge at their theoretical order | dt-halving order fit per method | double pendulum, θ=(2.0, 2.5), dt halvings from 8 ms | `npm run validate:reference` | `reports/validation-reference.json` | adaptive methods report effective order |
| 2 | Engine RHS matches an independent SymPy symbolic derivation | component-wise Euler–Lagrange comparison at random states | double, triple, spherical double/triple; ~1e-14 agreement | `npm run validate:sympy` | `reports/sympy-validation.json` | needs python+sympy |
| 3 | Trajectories match SciPy DOP853 externally | same IC/params, rtol=atol=1e-12, 20 s | double & triple, regular ≈6e-14; chaotic to the e^{λt} floor | `npm run validate:cross` | `reports/cross-validation.json` | chaotic comparison limited by exponential amplification |
| 4 | Period-doubling onset matches literature | Floquet multiplier −1 crossing on the stroboscopic map | driven pendulum γ=0.5, ω=2/3; A_PD measured 1.0664 vs published 1.0663 | `npm run validate:literature` | `reports/literature-anchors.json` | onset localized to continuation tolerance 1e-10 |
| 5 | Melnikov chaos threshold A_c = (4γ/πω)cosh(πω/2) | analytic Melnikov integral, pinned by quadrature + 0–1 test | ω=2/3, γ sweep; dt=1e-3 RK4 | `npm run paper:study` | `reports/paper-study.json` | perturbative — first-order in (A, γ) |
| 6 | A_PD/A_c ratio reverses at γ ≈ 0.69 | claims 4+5 swept over γ | γ grid in `scripts/paper-study.ts` | `npm run paper:study && npm run paper:build` | `paper/index.html`, `paper/paper.pdf` | finite γ grid; refine grid to sharpen the crossing |
| 7 | Spherical N-chain conserves E and L_z in 3D chaos | manipulator-form EOM (`docs/derivations.md` §3) | N=2/3, dt=1e-3 RK4, drift <1e-7 over test horizons | `npm test` (`spherical-chain`, `chain-validation-hardening`) | `reports/vitest-results.json` | chart limit at poles: L_z≠0 grazes fail loudly (documented) |
| 8 | N≥4 mass matrix is symmetric positive definite | suffix-mass closed form + Cholesky | seeded random states, planar N=4/6, spherical N=3 | `npm test` (`chain-validation-hardening`) | same | PD away from chart-regularised poles |
| 9 | Lab Poincaré crossings sit on the section, not the step grid | event refinement: RK4 sub-step + secant root-find | analytic-crossing fixture, dt=0.05 | `npm test` (`poincare-event-refinement`) | same | refined point accurate to ~1e-7 at 50 ms steps |
| 10 | Exported ZIP bundles are integrity-verifiable | SHA-256 per file (WebCrypto, FIPS-vector tested) | any Research-tab ZIP export | `npm run test:e2e` (`research-bundle-zip`) | `manifest/checksums.json` in any bundle | crc32+fnv kept for legacy v1 readers |

Full equations and derivations: [`docs/derivations.md`](docs/derivations.md) ·
limitations: [`docs/known-limitations.md`](docs/known-limitations.md) ·
API stability / SemVer policy: [`docs/api-overview.md`](docs/api-overview.md) ·
reproducing the external (SciPy/SymPy) checks:
[`docs/reproducibility.md`](docs/reproducibility.md).
Step-by-step paper reproduction:
[`docs/tutorial-reproduce-paper.md`](docs/tutorial-reproduce-paper.md).

## What's inside (short version)

- **Numerics** — Euler → RK4, embedded RKF45 & Dormand–Prince 5(4),
  Gauss–Legendre, Yoshida-4, Gragg–Bulirsch–Stoer, L-stable TR-BDF2.
- **Physics** — planar double/triple/N-chain, driven/damped, elastic spring,
  rope/string and double-string (unilateral tension gates, hybrid
  slack/recapture), spherical pendulum and spherical N-chain (full 3D
  ball-joint dynamics; exact closed-form mass matrix and Coriolis terms).
- **Chaos** — Lyapunov max/spectrum (+ block std errors, symplectic pairing
  self-check), Kaplan–Yorke, RQA, 0–1 test, CLVs, FTLE/LCS + ridges, basin
  entropy/Wada, Floquet + continuation + branch switching (period-doubling
  *and* symmetry-breaking pitchfork), Melnikov, recurrence networks,
  Neimark–Sacker, codim-2 maps.
- **Inverse & UQ** — parameter estimation (Levenberg–Marquardt recovery of
  physical parameters from observed trajectories, with covariance/standard-error
  uncertainties), additive- and multiplicative-noise Langevin SDEs
  (Euler–Maruyama + Milstein) with ensemble statistics, and a polynomial-chaos
  surrogate with analytic Sobol indices (alongside the sampling-based Sobol
  analysis). Library APIs.
- **Research workbench** — experiments/run-log/parameter & multi-variable
  adaptive designs, worker job protocol V2 (priority, checkpoints, resume),
  ZIP bundles with provenance DAG + SHA-256 manifest, IndexedDB long-term
  store with migrations, figure pipeline (themed deterministic SVG, print
  DPI), executable notebook export (validated headlessly).
- **3D Lab** — rope, double-string (presets + validity-gated analysis),
  spherical pendulum, and the spherical N-chain (N=1…5, per-link initial
  conditions, integrator selection, λ/RQA/FTLE worker analysis, CSV/PNG/JSON
  exports with reproducibility hashes).
- **Architecture** — staged boot pipeline; public (`window.PendulumLab`) vs
  debug (`window.PendulumLabDebug`) API split; DomBinder/TabController layer
  (no direct DOM coupling in tabs); the research/governance UI decomposed
  into `src/app/parity/*` modules; headless core published from `src/lib.ts`
  as `core` / `analysis` / `research` / `experimental` groups.
- **Security** — CSP without `unsafe-inline` (styles included; dynamic CSS
  via Constructable Stylesheets), no-innerHTML lint, sanitized JSON imports.
- **Mini research paper** — `paper/index.html` (+ PDF): *"Measuring the gap
  between the Melnikov threshold and the period-doubling cascade in the
  damped driven pendulum"* — fully reproducible (claims 5–6 above).

## Script catalog

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `preview` | Dev server · production build · serve build |
| `npm run build:standalone` | Self-contained `index.html` (opens via `file://`) |
| `npm run build:lib` / `docs:api` | Headless core library + TypeDoc API docs |
| `npm test` | Vitest unit suite (714 tests across 104 files; synced from `reports/vitest-results.json`) |
| `npm run test:e2e` / `smoke` | Playwright E2E (Chromium/Firefox/WebKit/mobile Chrome) · smoke subset |
| `npm run typecheck` / `lint` / `verify` | Strict tsc · source-policy lint · full gate |
| `npm run validate:reference` / `cross` / `sympy` / `literature` / `julia` | Validation ladder (see claims table) |
| `npm run paper:study` / `paper:build` | Mini-paper experiment + render |
| `npm run reproduce` | Recompute all headline research results headlessly; writes `reports/reproduce/manifest.json` (hash-stamped, diff-able) |
| `npm run research -- <cmd>` | Headless CLI: lyapunov, spectrum, zeroone, rqa, ftle, basin, wada, studypoint, orbit, continue, switch, pitchfork, melnikov, estimate, sde, nsbranch |
| `npm run benchmark` / `benchmark:energy` | Performance · long-run energy-drift ranking |
| `npm run notebook` / `notebook:validate` | Research notebook generation + headless execution check |
| `npm run export:repro` / `reports` / `audit:legacy` / `audit:worldclass` | Repro packages · reports · audits |

## Repository map

`src/physics` equations & integrators · `src/chaos` diagnostics ·
`src/research` reproducibility tooling · `src/workers` job protocol ·
`src/runtime` DI/event/command/worker clients · `src/app` UI layer
(`parity/` research & governance modules) · `src/lib.ts` headless core entry ·
`tests/` + `e2e/` suites · `scripts/` validation & report generators ·
`docs/` architecture, numerics, derivations, security, limitations,
schema migrations, TCAD mapping, Korean portfolio summary · `paper/` mini-paper.

## Scientific limitations

Symplectic claims require canonical coordinates, γ = 0, and converged implicit
residuals. With damping, energy decrease is physics plus numerical error — not
a conservation diagnostic. All chaos diagnostics are finite-time estimates
(badged as such in the UI) and need full parameter disclosure for research
use. The spherical (θ, φ) chart degenerates at the poles; the app surfaces
this limit instead of hiding it (see `docs/derivations.md` §3).

## Why this matters

Chaotic pendulum simulation is a compact proving ground for the habits that
matter in semiconductor/device-physics work: mesh/step convergence, analytic
Jacobians, stiff implicit stepping, branch continuation, and
simulator-to-simulator benchmarking. The capability-by-capability mapping is
in [`docs/device-simulation-mapping.md`](docs/device-simulation-mapping.md);
a Korean portfolio summary is in
[`docs/portfolio-korean.md`](docs/portfolio-korean.md).

## Portfolio context

Built as a high-school research portfolio piece targeting semiconductor /
TCAD simulation roles. The project demonstrates the same validation habits
used in professional EDA tools — convergence orders, analytic Jacobians,
external cross-validation, and branch-continuation — scaled to a dynamical
system compact enough for a single developer to make every claim auditable.
See [`docs/portfolio-korean.md`](docs/portfolio-korean.md) for the Korean
summary and [`docs/device-simulation-mapping.md`](docs/device-simulation-mapping.md)
for the explicit TCAD capability mapping.

## License and citation

MIT (`LICENSE`). For academic use, cite via `CITATION.cff`.
