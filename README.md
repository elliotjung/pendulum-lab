# Pendulum Lab

An interactive laboratory for understanding and measuring nonlinear dynamics.

![self-hosted line coverage](https://elliotjung.github.io/pendulum-lab/reports/coverage-badge.svg)

[Open the Lab](https://elliotjung.github.io/pendulum-lab/app.html) ·
[Inspect claim evidence](https://elliotjung.github.io/pendulum-lab/reviewer.html) ·
[See the product overview](https://elliotjung.github.io/pendulum-landing/)

![Thirty-second Pendulum Lab walkthrough](reports/walkthrough-30s.gif)

Pendulum Lab lets you set recognizable initial conditions, compare a reference
trajectory with deliberate perturbations, change numerical methods, and inspect
finite-time chaos diagnostics. It also exposes the provenance and caveats behind
quantitative claims instead of treating a passing test as a proof.

## Start in 60 seconds

Use Node.js `>=22 <27` and a clean lockfile install:

```bash
npm ci
npm run dev        # open app.html at the printed local URL
npm test           # 1651 unit tests
```

For a double-clickable build, download `standalone/index.html` from a GitHub
Release or run `npm run build:standalone`. Do not open the modular `app.html`
through `file://`; its assets require a server.

The application has three disclosure modes: **Beginner** keeps the simulator
central, **Student** adds analysis and validation, and **Research** exposes the
full workbench. A useful first experiment is reference trajectory → one explicit
perturbation → ensemble. The reference, changed variable, delta, units, and
colour meaning should remain visible throughout that progression.

The shared first recipe is **Sensitive dependence**: planar double pendulum,
`θ=(2.18, 2.64) rad`, `ω=(0, 0) rad/s`, `γ=0.06`, RK4 with `dt=0.001`, and a
symmetric `Δθ₁=1e-3 rad` perturbation (`seed=20260826`, `n=12`). The Landing
passes this same definition into the Lab without rounding or retyping.

## Choose your path

| I want to… | Start here |
| --- | --- |
| Run or understand an experiment | [Experiment workflow and interpretation](documents/scientific-accountability.md#reading-a-chaotic-trajectory) |
| Understand the equations or integrators | [Derivations](documents/derivations.md) and [numerical accountability](documents/scientific-accountability.md#numerical-method-accountability) |
| Evaluate a research claim | [Scientific claims and non-claims](documents/scientific-accountability.md#claims-tests-and-understanding) |
| Reproduce the paper result | [Paper reproduction tutorial](documents/tutorial-reproduce-paper.md) |
| Use the TypeScript library | [API overview](documents/api-overview.md) |
| Contribute or review architecture | [Architecture](documents/architecture.md), [testing strategy](documents/testing-strategy.md), and [quality evidence](documents/quality-evidence-contracts.md) |
| Publish or audit a release | [Release routine](documents/public-release-routine.md) and [deployment evidence lifecycle](documents/quality-evidence-contracts.md#deployment-and-publication-evidence) |
| Find all project details | [Project reference](documents/project-reference.md) or the [complete documentation map](documents/README.md) |

## What is in the Lab

- Planar and spherical pendulum systems, including double, triple, N-chain,
  driven, spring, rope/string, and double-string models.
- Fixed, adaptive, implicit, stiff, and structure-preserving numerical methods,
  with explicit assumptions and failure signals.
- Finite-time Lyapunov, recurrence, Poincaré, bifurcation, continuation,
  uncertainty, parameter-estimation, and ensemble workflows.
- Reproducible exports, source-bound evidence, integrity hashes, and a public
  reviewer surface.

The Landing and Lab are separate repositories with separate responsibilities.
The Landing introduces the product; this repository owns the scientific engine,
interactive workspace, and validation evidence. Their synchronization contract
is documented in [cross-project release](documents/cross-project-release.md).

## Common development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `preview` | Develop · build the hosted app · serve the exact build |
| `npm run build:standalone` | Build the portable single-file application |
| `npm test` / `test:quick` / `test:slow` | Vitest unit suite (1651 tests across 230 files; synced from `reports/vitest-results.json`) plus quick/slow tiers for local and CI iteration |
| `npm run test:e2e` / `smoke` | Cross-browser Playwright suite · focused browser smoke |
| `npm run typecheck` / `lint` / `verify` | Strict types · source policy · complete local gate |
| `npm run validate:reference` / `cross` / `sympy` | In-repo envelopes · independent SciPy · independent symbolic comparison |
| `npm run reproduce` / `reviewer:kit` | Recompute research outputs · assemble reviewer evidence |
| `npm run budget` | Enforce hosted and standalone byte ceilings and write byte attribution |

The full script catalogue, repository map, feature inventory, package subpaths,
deployment outline, and portfolio context moved to
[the project reference](documents/project-reference.md) so first-time readers do
not have to parse release operations before finding the app.

## Scientific honesty

Chaos diagnostics here are finite-time estimates whose meaning depends on the
initial state, perturbation, transient, horizon, numerical method, step or
tolerances, and uncertainty procedure. Symplectic claims additionally require
canonical coordinates, an undamped system, and a converged implicit solve.
Tests establish bounded software statements; they do not prove a physical
theory, infinite-time behavior, every parameter regime, or agreement on
unmeasured hardware. See [scientific accountability](documents/scientific-accountability.md)
and [known limitations](documents/known-limitations.md).

Public npm, GitHub Release, DOI, hardware, and deployed-site status are external
facts. Treat missing or expired evidence as **unknown**, and use the reviewer
surface or a fresh source-bound probe before repeating a publication claim.

## License and citation

MIT (`LICENSE`). For academic use, cite via `CITATION.cff`.
