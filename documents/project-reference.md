# Project Reference

This is the detail layer behind the short top-level README. It is intended for
contributors and reviewers who already know what Pendulum Lab is and now need
the repository boundaries, capability inventory, commands, and release routes.

## One product, two repositories

| Surface | Repository | Runtime responsibility |
| --- | --- | --- |
| Product entryway | `elliotjung/pendulum-landing` | Static EN/KO overview, introductory double-pendulum story, lightweight trajectory console, evidence summary, and deep links |
| Scientific workspace | `elliotjung/pendulum-lab` | Authoritative physics and integrators, interactive workspaces, analysis workers, exports, and reviewer evidence |

The surfaces share a visual token family, Lab URL contracts, and immutable
evidence coordinates. They deliberately do not share control density. The
Landing imports a small RK4 demonstration kernel derived from the same planar
double-pendulum model; the Lab remains the numerical and validation authority.
The Landing's introductory hero and this Lab's richer system catalogue therefore
must not be described as if they were one physical model.

The versioned `sensitive-dependence` handoff is a shared recipe, not merely a
matching title: planar double pendulum, `θ=(2.18, 2.64) rad`, `ω=(0, 0) rad/s`,
`γ=0.06`, RK4 with `dt=0.001`, and symmetric `Δθ₁=1e-3 rad`
(`seed=20260826`, `n=12`). The Landing URL and Lab preset are contract-tested
against those values.

See [product integration](product-integration.md),
[cross-project release](cross-project-release.md), and the numbered
[whole-product audit](PRODUCT_AUDIT_2026-08-13.md).

## Capability inventory

- **Numerics:** Euler, RK2, RK4, RKF45, Dormand–Prince 5(4), fixed-macro-step
  DOP853 8(5,3), implicit midpoint, Gauss–Legendre 4/6, Yoshida compositions,
  Gragg–Bulirsch–Stoer, and L-stable TR-BDF2. The conditions under which those
  names support stronger claims are in [scientific accountability](scientific-accountability.md).
- **Physics:** planar double/triple/N-chain, driven and damped pendula, elastic
  spring, rope/string and double-string hybrid systems, spherical pendulum, and
  spherical N-chain.
- **Chaos:** finite-time Lyapunov estimates and spectra, SALI/FLI, RQA,
  Poincaré and bifurcation analysis, FTLE/LCS, basin and Wada diagnostics,
  Floquet analysis, continuation and branch switching, Melnikov analysis,
  recurrence networks, Neimark–Sacker, and codimension-two maps.
- **Inverse problems and uncertainty:** parameter estimation, stochastic
  additive/multiplicative noise, ensemble statistics, sampling-based
  sensitivity, and a polynomial-chaos surrogate with stated input-measure
  assumptions.
- **Research workbench:** persisted profiles, batch designs, worker priorities
  and checkpoints, provenance-bearing ZIP exports, IndexedDB migrations,
  deterministic SVG figures, and executable notebook export.
- **Review:** a public reviewer page, canonical claim registry, source-bound
  evidence summary, reproduction commands, caveats, and artifact hashes.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/physics/` | Equations, integrators, event location, and numerical diagnostics |
| `src/chaos/` | Finite-time nonlinear-dynamics diagnostics |
| `src/research/` | Reproducibility, continuation, inverse, UQ, and artifact tools |
| `src/workers/` | Bounded job protocol and background computation |
| `src/runtime/` | Dependency injection, events, commands, and worker clients |
| `src/app/` | Browser presentation and workspace orchestration |
| `src/lib.ts` | Headless public-library entry point |
| `tests/`, `e2e/` | Unit, property, failure-injection, browser, and visual suites |
| `scripts/` | Validation, packaging, evidence, budget, and audit generators |
| `reports/` | Committed or transient machine evidence according to artifact policy |
| `documents/` | Architecture, derivations, policies, tutorials, and reviewer guidance |
| `paper/` | Reproducible mini-paper HTML/PDF sources and outputs |

The public TypeScript package exposes stable `core`, `analysis`, `research`,
`browser`, `worker`, and `node` subpaths. `experimental` may change in a minor
release; see [API overview](api-overview.md).

## Command catalogue

| Command | Job |
| --- | --- |
| `npm run dev`, `build`, `preview` | Develop, produce, and serve the hosted artifact |
| `npm run build:standalone` | Produce `standalone/index.html` plus required companions |
| `npm run build:lib`, `docs:api` | Build the headless package and TypeDoc API |
| `npm test`, `test:quick`, `test:slow` | Full, fast, and long-running Vitest tiers |
| `npm run test:e2e`, `smoke` | Full Playwright projects and focused browser smoke |
| `npm run verify` | Ordered lint, type, policy, test, docs, scope, and format gate |
| `npm run validate:reference` | Measured-order and energy-envelope suite |
| `npm run validate:cross` | Independent SciPy DOP853 comparison |
| `npm run validate:sympy` | Independent symbolic equation comparison |
| `npm run validate:literature` | Published-anchor comparison |
| `npm run paper:study`, `paper:build` | Recompute and render the mini-paper |
| `npm run reproduce` | Hash-stamped headline-result manifest |
| `npm run research -- <cmd>` | Headless analyses such as Lyapunov, RQA, orbit, continuation, and estimation |
| `npm run notebook`, `notebook:validate` | Generate and execute-check the research notebook |
| `npm run benchmark`, `benchmark:energy`, `benchmark:memory` | Runtime, long-energy, and memory evidence |
| `npm run budget`, `audit:standalone-bytes` | Absolute bundle gate and standalone attribution |
| `npm run mutation`, `mutation:aggregate` | Sharded Stryker run and survivor/timeout policy reports |
| `npm run reviewer:kit` | Assemble the outside-review checklist |
| `npm run release:status` | Probe npm, GitHub Release, DOI, and deployed Pages status |

## Build, package, and deployment notes

The hosted build uses relative assets and works under the GitHub Pages project
path. `npm run preview` serves the exact `dist/` output. The standalone artifact
is the only supported double-click path.

Public ESM/type consumers install `@elliotjung/pendulum-lab` from npm or JSR.
Publishing is not established by a local build: npm/JSR identity, a GitHub
Release, DOI, Pages convergence, and their source commit must be observed from a
fresh external probe. Details are in
[quality evidence contracts](quality-evidence-contracts.md#deployment-and-publication-evidence).

Pages deploys only the exact SHA that passed Mainline Full Validation. The
workflow rebuilds and rechecks the hosted, standalone, WASM, browser, and budget
artifacts before the deployment job receives write/OIDC permission. Repository
Settings must select GitHub Actions as the Pages source.

## Research focus and portfolio context

The flagship study compares the analytic Melnikov threshold with the measured
period-doubling onset over damping. Its bounded claims, parameters, reproduction
commands, and caveats live in [flagship result](flagship-result.md) and the
[paper tutorial](tutorial-reproduce-paper.md), not in the entry README.

The project is also a high-school research portfolio aimed at numerical and
device-simulation work. The relevant habits are convergence studies, analytic
Jacobians, implicit-solver diagnostics, continuation, external-oracle
comparison, and honest evidence boundaries. See
[device-simulation mapping](device-simulation-mapping.md) and the
[Korean portfolio summary](portfolio-korean.md).

## Security and artifact policy

The hosted app enforces a CSP without `unsafe-inline`, source policy rejects new
`innerHTML` patterns, and JSON imports are validated before use. A standalone
file has a different hosting/security boundary and must not inherit hosted-header
claims. Generated artifacts are committed, regenerated, or ignored according to
[artifact policy](artifact-policy.md); hand-editing generated evidence is not a
valid update path.
