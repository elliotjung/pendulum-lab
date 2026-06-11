# Pendulum Lab V10 TypeScript Modular Build

This project keeps the original visual runtime intact while adding a typed TypeScript/Vite layer for maintainability, testing, benchmarks, reports, security hardening, and CI.

## What's inside

A framework-free, zero-runtime-dependency TypeScript engine for nonlinear pendulum
dynamics, organized as tested layers (see `docs/engine-overview.md`):

- **Numerics** — twelve integrators (Euler → RK4, embedded RKF45 & Dormand-Prince 5(4), Gauss-Legendre 4/6, Yoshida-4, Gragg-Bulirsch-Stoer, L-stable TR-BDF2), each **measured at its theoretical order**.
- **Physics** — double, triple, generalized N-pendulum, driven/damped-driven, elastic spring, rope/string, and **spherical N-chain** systems (the spherical double/triple pendulum: full 3D ball-joint dynamics in manipulator form, conserving E and L_z, cross-checked against an independent SymPy symbolic derivation to ~1e-14).
- **Chaos** — maximal & full-spectrum Lyapunov, Kaplan-Yorke dimension, SALI/FLI, Poincaré sections, bifurcation sweeps.
- **Visualization** — pure-canvas, colorblind-safe (Okabe-Ito) renderers, unit-tested against a stub context.
- **Performance** — heavy chaos jobs run in a typed Web Worker with a graceful main-thread fallback.
- **Validation** — every integrator cross-checked against closed-form, energy, and reference-method criteria (12 / 12 pass), plus an **automated external cross-check against an independent SciPy DOP853 reference** for both the double *and* triple pendulum (regular orbits agree to ~6e-14 over 20 s; chaotic to the e^{λ₁t}-amplified tolerance floor), **literature anchors** (elliptic-integral period, normal modes, Melnikov threshold, period-doubling onset A_PD = 1.0664 measured vs 1.0663 published), and a **Melnikov analytic chaos threshold** pinned against quadrature and the 0–1 test. Every non-variational diagnostic (0–1 K, RQA, basin entropy, box-counting dimension) reports an uncertainty estimate.
- **Reproducibility** — hash-stamped run manifests that re-verify to the bit.
- **Research platform (v10.29)** — Govern → Research workbench with: real **ZIP research bundles** (binary PNG figures, per-file CRC32/FNV checksums, `manifest/provenance.json` artifact DAG), an **IndexedDB long-term store** (7 object stores, localStorage-v2 migration, quota display, corruption recovery, full-DB archive import/export), **worker job protocol V2** (jobId, priority queue, progress/checkpoint events, protocol-level cancel/pause/resume, phase-boundary timeouts, resume-from-checkpoint, worker pool), **multi-dimensional experiment design** (true multi-variable Sobol & Latin hypercube, adaptive |∇λ| refinement, λ-sign boundary bisection, uncertainty-driven resampling, replicates, point/time/failure budgets, preview + λ heatmap), an **Analysis Superpack** (multi-resolution **Wada convergence** with stable/unstable verdicts and grid hashes, recurrence-network metrics, FTLE ridge extraction, automated bifurcation detection, Poincaré fixed-point classification + Neimark–Sacker scan, codim-2 (A×γ) regime maps, shadowing reliability score, Melnikov threshold), an **executable notebook export** (embedded data, matplotlib λ(parameter) error-bar plot, validated and executed headlessly by `npm run notebook:validate`), a **publication figure pipeline** (deterministic themed SVG with visual-regression fingerprints, 1×/2×/4× PNG, per-figure source CSV, caption editor, regeneration from saved studies), **library UX** (search/tags/favorites/diff/fork/timeline/DOI/quality badges), a **performance budget panel** + WebGPU/CPU ensemble benchmark, and full **workspace save/restore**.
- **3D Lab (Govern → 3D Lab)** — a **rope/string pendulum** (hybrid taut/slack dynamics with tension readout, slack warnings, inelastic capture), a **true spherical pendulum** (θ̈ = sinθcosθφ̇² − (g/l)sinθ with conserved E and L_z diagnostics), and a **spherical double pendulum** (3D chaos with 4 degrees of freedom, E and L_z conservation readouts) rendered through orbit cameras (drag to rotate, wheel to zoom) with a θ̇=0 Poincaré inset and exportable 3D diagnostic snapshots.
- **Mini research paper** — `paper/index.html` (+ PDF): *"Measuring the gap between the Melnikov threshold and the period-doubling cascade in the damped driven pendulum"* — a damping sweep showing the measured A_PD/A_c ratio falling from ~2.4 (γ = 0.1) through 1 (γ ≈ 0.69), with Floquet-verified onsets, 0–1-test corroboration, a strobe bifurcation diagram, and full reproducibility (`npm run paper:study && npm run paper:build`).
- **Headless core as a library** — `npm run build:lib` emits `dist-lib/pendulum-lab-core.js` + type declarations from `src/lib.ts`; `npm run docs:api` builds TypeDoc API docs; `npm run research -- batch --spec file.json` runs JSON-spec batch studies; `npm run validate:julia` cross-checks against an external Julia Vern9 reference when Julia is installed.

Entry point: the full simulator runs from `index.html`. The TypeScript modules in `src/` now reinforce that page directly instead of maintaining separate demo pages.

## Quick Start

```bash
npm install
npm run dev                     # then OPEN the printed URL, e.g. http://127.0.0.1:5173/
npm run build && npm run preview  # serve the production build, then open its printed URL
npm test
```

> **Viewing the app:**
> - **Double-click, no server (default):** the project-root **`index.html`** is a single
>   self-contained file (all JS/CSS inlined) generated by `npm run build:standalone`, so it
>   opens straight from the file system — just double-click it. The Lab runs fully; the
>   Lyapunov/Bifurcation tabs fall back to the main thread if the browser blocks their
>   `file://` worker. Re-run `npm run build:standalone` after changing the source to refresh it.
> - **Dev / HMR:** the live module shell lives in **`app.html`**; `npm run dev` serves it at
>   `/` with hot reload (open the printed URL, e.g. `http://127.0.0.1:5173/`).
> - **Served production build:** `npm run build && npm run preview`. The build uses relative
>   asset paths, so it deploys under any sub-path (e.g. GitHub Pages) and emits `dist/index.html`.

## Script catalog

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server for the index simulation page |
| `npm run build` | Production build (relative asset paths) + CSS copy |
| `npm run build:standalone` | Single self-contained `standalone/index.html` that opens via `file://` (double-click) |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | Source-policy lint (unsafe DOM/code-generation sinks, citation/license files, stale worker bundles) + strict typecheck |
| `npm test` | Vitest unit suite (446 tests across 66 files; synced from `reports/vitest-results.json`) |
| `npm run test:e2e` / `npm run smoke` | Playwright end-to-end / smoke; full E2E covers Chromium, Firefox, WebKit, and mobile Chrome |
| `npm run benchmark` | FPS, physics ms/frame, memory, and worker latency report |
| `npm run validate:reference` | Cross-validate every integrator → `reports/validation-reference.{md,json}` |
| `npm run validate:cross` | **External** cross-validation vs an independent SciPy DOP853 reference (double **and** triple pendulum) → `reports/cross-validation.{md,json}` (needs python + scipy) |
| `npm run validate:sympy` | **Symbolic second reference**: engine RHS vs SymPy-derived Euler–Lagrange equations, compared component-wise at random states — no integrator floor (double, triple, spherical double & triple) → `reports/sympy-validation.{md,json}` (needs python + sympy) |
| `npm run validate:literature` | **Literature anchors**: engine-computed values vs published/closed-form references (elliptic-integral period, normal modes, Melnikov A_c, period-doubling onset) → `reports/literature-anchors.{md,json}` |
| `npm run paper:study` / `paper:build` | Run the damping-sweep numerical experiment (→ `reports/paper-study.json`) and render the mini-paper `paper/index.html` + `paper/paper.pdf` |
| `npm run research -- <cmd>` | Headless research CLI: `lyapunov`, `spectrum`, `zeroone`, `rqa`, `ftle`, `basin`, `wada`, `studypoint`, `orbit`, `continue`, `switch`, `melnikov` |
| `npm run notebook` | Generate `reports/research-notebook.html` — a figure-rich research report (numbers from the shared job handler + figures captured from the live app) |
| `npm run benchmark:energy` | Long-run energy-drift ranking → `reports/energy-benchmark.{md,json}` |
| `npm run export:repro` | Build + verify reproducibility packages → `reports/reproducibility/` |
| `npm run reports` | Validation report generation |
| `npm run audit:legacy` | Legacy-risk audit |
| `npm run audit:worldclass` | Readiness scorecard across architecture, UI, numerics, testing, performance, security, and docs |

## Structure

- `index.html`: full simulator shell plus CSP and TypeScript runtime bridge.
- `css/`: hand-written stylesheets (base shell + `03-liquid-glass.css` / `04-premium.css` presentation layers).
- `src/physics/`: typed equations, energy helpers, and integrator registry.
- `src/physics/canonical.ts`: canonical theta/p Hamiltonian helpers and residual-reporting implicit midpoint.
- `src/state/`: strict StateStore and JSON-safe runtime snapshots.
- `src/runtime/`: command registry, event bus, chaos/worker clients, and the DI runtime.
- `src/ui/`: accessibility and safe DOM helpers.
- `src/validation/`: unit validation and strict JSON import parsing.
- `src/export/`: submission manifest generation.
- `src/workers/`: module worker entry with fallback support.
- `tests/`: integrator, energy drift, replay determinism, and JSON import tests.
- `e2e/`: Playwright smoke and accessibility checks.
- `scripts/`: benchmark and validation report generation.
- `docs/`: architecture, numerics, security, and known limitations.

## Submission Artifacts

- Architecture diagram: `docs/architecture.md`
- Numerical analysis notes: `docs/numerics.md`
- Security notes: `docs/security.md`
- Benchmark report template/output: `reports/benchmark-report.md`
- Validation report template/output: `reports/validation-report.md`
- World-class readiness scorecard: `reports/worldclass-scorecard.md`
- CI workflow: `.github/workflows/ci.yml`
- Legacy risk audit: `reports/legacy-risk-report.md`

## Scientific Limitations

Symplectic claims require canonical theta/p coordinates, `gamma = 0`, and converged implicit residuals. With damping enabled, energy decrease is physical dissipation plus numerical error, not a conservation diagnostic. Lyapunov, Poincare, bifurcation, and FFT outputs are finite-time estimates and need full parameter disclosure for research use.

## Why This Matters

Chaotic pendulum simulation is a compact way to show numerical stability, state reproducibility, and validation discipline. The same habits matter in semiconductor and device-physics work: small integration errors, parameter drift, and unreported solver assumptions can become large interpretation errors. A capability-by-capability mapping onto TCAD / device-simulation problems (mesh convergence, analytic Newton Jacobians, TR-BDF2 stiff stepping, branch continuation through folds, simulator-to-simulator benchmarking) is in [`docs/device-simulation-mapping.md`](docs/device-simulation-mapping.md).

## License and Citation

MIT-licensed (`LICENSE`). If you use this software in academic work, please cite it via `CITATION.cff` (GitHub renders a "Cite this repository" button from it).

## Compatibility Notes

The app is **100% TypeScript**: the dev/HMR shell `app.html` loads only `src/main.ts` (plus the hand-written CSS that styles the static shell, including the `03-liquid-glass.css` and `04-premium.css` presentation layers). The legacy `js/` runtime (≈8,080 lines) has been fully removed and archived under `archive/` — the legacy-risk audit now reports **0** (from a 482 baseline). Every tab (Lab + the seven analysis tabs) runs on `src/`. Two ways to view: the self-contained project-root `index.html` opens directly via `file://` (double-click), and `npm run dev` serves the live `app.html` with hot reload.
