# Pendulum Lab - Certified Chaotic Dynamics Workbench

![self-hosted line coverage](https://elliotjung.github.io/pendulum-lab/reports/coverage-badge.svg)

[Mainline performance history](https://elliotjung.github.io/pendulum-lab/reports/benchmarks/)

A framework-free, zero-runtime-dependency TypeScript platform for nonlinear
pendulum dynamics: 8 physical systems (double/triple/N-chain, driven, spring,
rope/string, double-string, **3D spherical N-chain**), 15 primary measured-order
integrators (16 registered validation IDs including the velocity-Verlet alias),
a full chaos-diagnostics stack with uncertainties, and a
reproducibility pipeline (provenance, SHA-256 bundles, executable notebooks).
Every quantitative output carries a clickable Trust Inspector badge:
*visual-only → finite-time estimate → validated → publication-ready*
(+ source, parameters, uncertainty, external validation, reproduce command,
caveat, artifact, and hash).

The flagship result is the **Melnikov threshold vs period-doubling onset gap
map**: at `omega = 2/3`, the measured ratio `A_PD/A_c` closes and reverses near
`gamma ~= 0.69`, separating homoclinic-tangle onset from the attractor cascade
with Floquet, literature, 0-1-test, and reproducibility evidence. See
[`documents/flagship-result.md`](documents/flagship-result.md) and generate the outside
review package with `npm run reviewer:kit`.

The public reviewer surface is `reviewer.html` (deployed at
`https://elliotjung.github.io/pendulum-lab/reviewer.html`). It reads the
committed report JSON and exposes each claim's source, parameters, validation,
reproduce command, and caveat without hiding missing external evidence.

The project landing page lives at
[elliotjung/pendulum-landing](https://github.com/elliotjung/pendulum-landing)
(deployed at `https://elliotjung.github.io/pendulum-landing/`) — a
cinematic overview of the engine, workspaces, frontier modules, and the
validation ledger, with launch links back to this app.

## One product, two repositories

The repositories are released and reviewed as one product, but keep different
runtime responsibilities:

| Surface | Repository | Character | Runtime responsibility |
|---|---|---|---|
| Product entryway | `pendulum-landing` | cinematic / exploratory | static EN/KO pages, lazy Three.js double-pendulum story, lightweight trajectory console, product evidence and deep links |
| Scientific workspace | `pendulum-lab` (this repository) | minimal / scientific | validated physics and integrators, interactive simulation, analysis workers, research exports and reviewer evidence |

Both surfaces share the graphite/indigo/cyan token family, direct Lab URL
contracts, and an immutable evidence source commit. They intentionally do not
share control density or an animation framework. The Landing imports a small,
allocation-free RK4 kernel derived from the same double-pendulum model; the Lab
remains the authoritative numerical implementation and validation surface.

The complete cross-repository audit and its 148 concrete findings are in
[`documents/PRODUCT_AUDIT_2026-08-13.md`](documents/PRODUCT_AUDIT_2026-08-13.md).

The Research tab is now a persisted workspace: save/switch workspace profiles,
toggle compact density, export/import the full session, and keep GPU/scale claims
behind `npm run validate:gpu-scale` CPU-reference gates.

## Local development

Use a supported Node.js release (`>=22 <27`) and a clean lockfile install.
Download the standalone HTML from the latest GitHub Release and double-click it
when a local server is not desirable, or build the modular application locally:

```bash
npm ci
npm run dev               # Vite serves app.html at the printed local URL
npm run typecheck         # strict TypeScript check
npm run test:quick        # browser-free fast regression tier
npm test           # 1596 unit tests
npm run build             # production GitHub Pages bundle in dist/
npm run build:standalone  # portable standalone/index.html
npm run verify            # policy, lint, types, tests, docs and formatting gate
```

Scientific/release workflows are deliberately separate from the basic build:

```bash
npm run validate:reference # measured-order and energy envelopes
npm run validate:cross     # independent SciPy DOP853 comparison
npm run validate:sympy     # independent symbolic equation comparison
npm run reproduce          # hash-stamped headline-claim manifest
npm run reviewer:kit       # outside-review package checklist
npm run release:status     # public npm, release, DOI and Pages audit
```

`npm run preview` serves the exact `dist/` output. The application uses relative
asset URLs, so the same build works under the GitHub Pages project path. Do not
open `app.html` over `file://`; use the standalone artifact for that case.

Public ESM/type-first consumers use the version-neutral scoped name:

```bash
npm install @elliotjung/pendulum-lab
# or, from JSR
npx jsr add @elliotjung/pendulum-lab
```

Stable subpaths are `core`, `analysis`, `research`, `browser`, `worker`, and
`node`; `experimental` is explicitly allowed to change in minor releases.

For the two-repo publish path, use
[`documents/cross-project-release.md`](documents/cross-project-release.md): sim verify →
standalone build → landing evidence sync → landing smoke → tag/release.

### GitHub Pages deployment

Pages is intentionally fail-closed. The canonical app workflow is
`.github/workflows/pages.yml`; it reacts only after **Mainline Full Validation**
completes successfully on `main` or `master`, checks out that exact validated
SHA, runs the full verification/library/standalone/WASM/bundle-budget gates,
then exercises the same `dist/` artifact in desktop and mobile browser shards.
Only the final deployment job receives `pages: write` and OIDC permission.

Repository Settings → Pages → Build and deployment must use **GitHub Actions**.
The companion Landing has its own Pages workflow and publishes an explicit
static-file allowlist only after its static, EN/KO, browser, accessibility and
Lighthouse gates. Pushing a local commit is therefore not enough to claim a
deployment: confirm the corresponding Actions run and then load the public URL.

## Documentation map

Start with [`documents/README.md`](documents/README.md). It groups the architecture,
API, numerics, validation, reviewer, release, and portfolio documents so the
current source of truth is easy to find without scanning the whole repository.

UI modes (rail footer): **Beginner** (simulator only) · **Student** (+ analysis
& validation) · **Research** (everything).

## Claims, and how to reproduce each one

| # | Claim | Equation / method | Parameters | Reproduce | Evidence (JSON/report) | Caveat |
|---|---|---|---|---|---|---|
| 1 | All 16 registered integrator IDs converge at their theoretical order | dt-halving order fit per method | double pendulum, θ=(2.0, 2.5), dt halvings from 8 ms | `npm run validate:reference` | `reports/validation-reference.json` | includes the velocity-Verlet alias; adaptive methods report effective order |
| 2 | Engine RHS matches an independent SymPy symbolic derivation | component-wise Euler–Lagrange comparison at random states | double, triple, spherical double/triple; ~1e-14 agreement | `npm run validate:sympy` | `reports/sympy-validation.json` | needs python+sympy |
| 3 | Trajectories match SciPy DOP853 externally | same IC/params, rtol=atol=1e-12, 20 s | double & triple, regular ≈6e-14; chaotic to the e^{λt} floor | `npm run validate:cross` | `reports/cross-validation.json` | chaotic comparison limited by exponential amplification |
| 4 | Period-doubling onset matches literature | Floquet multiplier −1 crossing on the stroboscopic map | driven pendulum γ=0.5, ω=2/3; A_PD measured 1.0664 vs published 1.0663 | `npm run validate:literature` | `reports/literature-anchors.json` | onset localized to continuation tolerance 1e-10 |
| 5 | Melnikov chaos threshold A_c = (4γ/πω)cosh(πω/2) | analytic Melnikov integral, pinned by quadrature + 0–1 test | ω=2/3, γ sweep; dt=1e-3 RK4 | `npm run paper:study` | `reports/paper-study.json` | perturbative — first-order in (A, γ) |
| 6 | A_PD/A_c ratio reverses at γ ≈ 0.69 | claims 4+5 swept over γ | γ grid in `scripts/paper-study.ts` | `npm run paper:study && npm run paper:build` | `paper/index.html`, `paper/paper.pdf` | finite γ grid; refine grid to sharpen the crossing |
| 7 | Spherical N-chain conserves E and L_z in 3D chaos | manipulator-form EOM (`documents/derivations.md` §3) | N=2/3, dt=1e-3 RK4, drift <1e-7 over test horizons | `npm test` (`spherical-chain`, `chain-validation-hardening`) | `reports/vitest-public-results.json` | chart limit at poles: L_z≠0 grazes fail loudly (documented) |
| 8 | N≥4 mass matrix is symmetric positive definite | suffix-mass closed form + Cholesky | seeded random states, planar N=4/6, spherical N=3 | `npm test` (`chain-validation-hardening`) | same | PD away from chart-regularised poles |
| 9 | Lab Poincaré crossings sit on the section, not the step grid | event refinement: RK4 sub-step + secant root-find | analytic-crossing fixture, dt=0.05 | `npm test` (`poincare-event-refinement`) | same | refined point accurate to ~1e-7 at 50 ms steps |
| 10 | Exported ZIP bundles are integrity-verifiable | SHA-256 per file (WebCrypto, FIPS-vector tested) | any Research-tab ZIP export | `npm run test:e2e` (`research-bundle-zip`) | `manifest/checksums.json` in any bundle | crc32+fnv kept for legacy v1 readers |

Full equations and derivations: [`documents/derivations.md`](documents/derivations.md) ·
limitations: [`documents/known-limitations.md`](documents/known-limitations.md) ·
API stability / SemVer policy: [`documents/api-overview.md`](documents/api-overview.md) ·
reproducing the external (SciPy/SymPy) checks:
[`documents/reproducibility.md`](documents/reproducibility.md).
Step-by-step paper reproduction:
[`documents/tutorial-reproduce-paper.md`](documents/tutorial-reproduce-paper.md).
Final publication checklist:
[`documents/public-release-routine.md`](documents/public-release-routine.md).

## What's inside (short version)

- **Numerics** — Euler → RK4, embedded RKF45, Dormand–Prince 5(4),
  DOP853 8(5,3), Gauss–Legendre, Yoshida-4, Gragg–Bulirsch–Stoer,
  L-stable TR-BDF2.
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
| `npm run build:standalone` | Self-contained `standalone/index.html` (opens via `file://`; Git tracks only its SHA-256 manifest) |
| `npm run build:lib` / `docs:api` | Headless core library + TypeDoc API docs |
| `npm test` / `test:quick` / `test:slow` | Vitest unit suite (1596 tests across 219 files; synced from `reports/vitest-results.json`) plus quick/slow tiers for local and CI iteration |
| `npm run test:e2e` / `smoke` | Playwright E2E (Chromium/Firefox/WebKit/mobile Chrome) · smoke subset |
| `npm run typecheck` / `lint` / `verify` | Strict tsc · source-policy lint · full gate |
| `npm run validate:reference` / `cross` / `sympy` / `literature` / `julia` | Validation ladder (see claims table) |
| `npm run paper:study` / `paper:build` | Mini-paper experiment + render |
| `npm run flagship:certify` / `flagship:external` | Figure 1 certification, crossing interval, caveat map, and dependency-free Python cross-check |
| `npm run validate:gpu-scale` | CPU oracle plus GPU/scale acceptance contract report |
| `npm run reproduce` | Recompute all headline research results headlessly; writes `reports/reproduce/manifest.json` (hash-stamped, diff-able) |
| `npm run research -- <cmd>` | Headless CLI: lyapunov, spectrum, zeroone, rqa, ftle, basin, wada, studypoint, orbit, continue, switch, pitchfork, melnikov, estimate, sde, nsbranch |
| `npm run benchmark:memory` | Memory baseline and regression report (`reports/memory-baseline.json`, `reports/memory-regression-report.md`) |
| `npm run benchmark` / `benchmark:energy` | Performance · long-run energy-drift ranking |
| `npm run notebook` / `notebook:validate` | Research notebook generation + headless execution check |
| `npm run reviewer:kit` | Reviewer manifest for flagship, validation, GPU/scale, memory, and reproducibility artifacts |
| `npm run export:repro` / `reports` / `audit:legacy` / `audit:worldclass` | Repro packages · reports · audits |

## Repository map

`src/physics` equations & integrators · `src/chaos` diagnostics ·
`src/research` reproducibility tooling · `src/workers` job protocol ·
`src/runtime` DI/event/command/worker clients · `src/app` UI layer
(`parity/` research & governance modules) · `src/lib.ts` headless core entry ·
`tests/` + `e2e/` suites · `scripts/` validation & report generators ·
`documents/` architecture, numerics, derivations, security, limitations,
schema migrations, TCAD mapping, Korean portfolio summary · `paper/` mini-paper.

## Scientific limitations

Symplectic claims require canonical coordinates, γ = 0, and converged implicit
residuals. With damping, energy decrease is physics plus numerical error — not
a conservation diagnostic. All chaos diagnostics are finite-time estimates
(badged as such in the UI) and need full parameter disclosure for research
use. The spherical (θ, φ) chart degenerates at the poles; the app surfaces
this limit instead of hiding it (see `documents/derivations.md` §3).

## Why this matters

Chaotic pendulum simulation is a compact proving ground for the habits that
matter in semiconductor/device-physics work: mesh/step convergence, analytic
Jacobians, stiff implicit stepping, branch continuation, and
simulator-to-simulator benchmarking. The capability-by-capability mapping is
in [`documents/device-simulation-mapping.md`](documents/device-simulation-mapping.md);
a Korean portfolio summary is in
[`documents/portfolio-korean.md`](documents/portfolio-korean.md).

## Portfolio context

Built as a high-school research portfolio piece targeting semiconductor /
TCAD simulation roles. The project demonstrates the same validation habits
used in professional EDA tools — convergence orders, analytic Jacobians,
external cross-validation, and branch-continuation — scaled to a dynamical
system compact enough for a single developer to make every claim auditable.
See [`documents/portfolio-korean.md`](documents/portfolio-korean.md) for the Korean
summary and [`documents/device-simulation-mapping.md`](documents/device-simulation-mapping.md)
for the explicit TCAD capability mapping.

## License and citation

MIT (`LICENSE`). For academic use, cite via `CITATION.cff`.
