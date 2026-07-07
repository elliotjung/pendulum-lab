# Roadmap

## Legacy-To-Modern Migration — COMPLETE (v10.22)

The migration is finished: the legacy `js/` runtime (≈8,080 lines) is removed and archived, and the app is 100% TypeScript under `src/`. The legacy-risk audit is **0** (from a 482 baseline). All rendering, simulation, analysis, and shell duties run on the modern stack; 173 unit tests + 13 chromium e2e pass with no legacy runtime present. History of the staged migration is below for reference.

## Stabilize Legacy-To-Modern Migration (history)

- **Done (v10.12):** unified the runtime behind the `PendulumRuntime` DI container; collapsed the five legacy globals into one adopted namespace with read-only accessors; removed dynamic `<script>` injection. The `globalRuntimeExports` and `dynamicScript` legacy-risk metrics are now `0`.
- **Done (v10.15, Stage 2 complete):** the modern Lab (`src/app/`) is the **default** lab tab — sim loop + all five side plots + presets, ensemble, visual FX, drag-to-set, export (CSV/JSON/PNG), and replay/scrubber. `?lab=legacy` is the escape hatch. 157 unit tests + 6 chromium e2e. Audio sonification and interpolated render remain legacy-only.
- **Done (v10.19, Stage 3 tab-ports):** every lab/analysis tab now runs on `src/` — Lab (default) + Lyapunov, Validation, Sweep, Compare, Bifurcation, 3D phase, and density, each gated by unit + e2e coverage and the `?lab=legacy` escape hatch.
- **Done (v10.22, Stage 4 complete):** the modern shell retired the remaining legacy runtime duties: slider displays, presets, keyboard shortcuts, header/diagnostics chrome, canvas sizing, fault handling, and dev/governance chrome now live under `src/`. The `?lab=legacy` escape hatch and `window.App` smoke dependency are removed with the archived `js/` runtime.
- Historical note: the old `js/01-core-app.js` shrink plan is complete; ongoing architecture work now targets known-large TypeScript orchestrators rather than the removed legacy bundle.
- Historical note: the legacy-risk audit once centered on `innerHTML` and dynamic script usage; the current audit target is to keep the score at 0 as new UI surfaces are added.
- Move long-running sweep, bifurcation, FFT, and Lyapunov jobs to typed worker messages.

## Certified Chaotic Dynamics Workbench

- **Flagship crown:** the outward-facing research thesis is now the Melnikov threshold vs period-doubling onset gap map. The contract lives in `src/research/certifiedWorkbench.ts`, with the paper-facing narrative in `docs/flagship-result.md`.
- **Trust Inspector:** result badges now open a provenance panel with source, parameters, uncertainty, external validation, reproduce command, caveat, artifact, and hash fields. Keep extending this to every new quoted number before adding new visual surfaces.
- **Research workspace UX:** the Research tab has a Certified Workspace card with persisted workspace profiles plus a Project -> Sessions -> Runs -> Artifacts storage model, density preference, export/import, reviewer-kit handoff, and run-log entries for workspace events.
- **GPU/scale validation:** `npm run validate:gpu-scale` pins CPU reference behavior, mock WebGPU accept/fallback behavior, an executable CLV/full-spectrum/FTLE acceleration contract, and an ensemble f32-candidate reduction oracle. PR and mainline CI run this contract; `.github/workflows/webgpu-hardware.yml` is the opt-in self-hosted hardware lane for actual WebGPU reduction vs CPU-oracle checks.
- **Reviewer kit:** `npm run reviewer:kit` generates `reports/reviewer-kit-manifest.json` and `.md`, tying the paper, flagship certification, external arithmetic check, notebook, validation reports, GPU contract, memory baseline, and reproducibility manifest into one checklist.
- **Remaining crown work:** attach a Zenodo DOI/release archive (`.zenodo.json`
  metadata is synced with CITATION.cff as of 2026-07-07; minting the DOI needs
  the Zenodo↔GitHub account link, an external credential), enable the external
  npm publish target (dry-run passes; blocked only on `NPM_TOKEN`), run the
  hardware WebGPU lane on NVIDIA/AMD-equipped runners (external hardware), and
  decide whether the mini-paper becomes a formal preprint or a longer
  notebook-first artifact.

## Numerical Research Upgrades

- **Done:** analytic Hamiltonian gradients (`src/physics/canonical.ts` — exact
  gradient of H(q,p), FD-verified in tests) and the full Newton implicit
  midpoint with per-iteration residual/condition-number diagnostics
  (`src/physics/implicitDiagnostics.ts`, `tests/implicit-diagnostics.test.ts`).
- Store long-horizon energy drift curves by integrator.
- Extend Lyapunov output from convergence curves and CPU full-spectrum/CLV reports to production GPU kernels once the implemented acceleration contracts pass on hardware candidates.
- Add selectable Poincare section conditions and transient removal for bifurcation analysis.
- **Done (v10.34):** Floquet multipliers are implemented for corrected nonlinear
  periodic orbits, `floquetLinearSpectrum` covers linear T-periodic Floquet/Hill
  systems including Mathieu stability tongues, and finite-dimensional quantum
  Floquet quasi-energies are exposed for the quantum kicked rotor.
- **Done (frontier arc):** five additive self-validating library modules — the
  continuum **sine-Gordon** soliton field + Frenkel–Kontorova Peierls–Nabarro
  barrier (`src/physics/sineGordon.ts`), an **echo state network**
  (`src/research/reservoir.ts`, closed-form ridge readout — the deferred Tier-A
  reservoir item), **Hamiltonian learning** (`src/research/hamiltonianLearning.ts`,
  the closed-form convex cousin of an HNN), **restarted thick-restart Lanczos**
  (`src/research/lanczos.ts`, matrix-free symmetric eigensolver scale-up), and a
  headless **Mathieu stability-diagram** sweep (`src/chaos/mathieuStability.ts`).
  Suite 875 → 907.
- **Done (spectral frontier):** the non-symmetric Arnoldi–Schur eigensolver
  landed in `src/research/arnoldi.ts` (`tests/arnoldi.test.ts`), joining the
  symmetric restarted Lanczos; HAVOK (`src/research/havok.ts`), the coupled
  pendulum-chain phonon dispersion (`src/physics/latticeDispersion.ts`,
  `src/physics/pendulumNetwork.ts`), and thermal-noise stochastic resonance /
  Kramers escape (`src/physics/stochasticResonance.ts`,
  `src/physics/kramersEscape.ts`) are likewise implemented and unit-tested.
  Next: the unitary-grid scale-up for bigger quantum Floquet problems.
- **Deferred (needs resources this environment can't exercise, kept honest):**
  GPU-execution *validation* of the WebGPU ensemble/field kernels (the kernels +
  feature detection + CPU fallback are in `src/runtime/gpuEnsemble.ts` /
  `gpuFields.ts` and the fallback path is unit-tested; a real GPU run is browser/CI
  only); Hamiltonian/Lagrangian *neural* nets and reservoir variants that require
  iterative gradient training (the closed-form analogues above are shipped instead).

## Performance And UX

- Decouple canvas rendering cadence from physics stepping cadence.
- Add trajectory and Poincare memory caps to user-facing settings.
- Add paper figure export presets and reproducible research bundle export.
- Evaluate OffscreenCanvas and WebGPU ensemble simulation behind feature detection.
- **Done (v10.34):** quick/slow/full unit-test tiers are exposed and wired into
  PR/mainline CI; benchmark output now includes original-vs-candidate deltas,
  and `benchmark:memory` emits a memory-regression baseline/report from the
  browser benchmark.
- Keep expanding cross-platform visual baselines beyond the current Chromium
  snapshots, and decide when memory regression should become a hard CI failure
  instead of a report-only gate.
  - **Decision (recorded):** the Firefox/WebKit/mobile-Chrome Playwright projects
    already exist in `playwright.config.ts`; cross-platform *baselines* must be
    generated on the actual Linux/macOS/Windows runners (snapshots are
    pixel-host-specific), so baseline promotion stays a CI task.
  - **Done (2026-07-07):** baseline promotion is now executable — the manual
    `Visual Baselines (Linux)` workflow (`.github/workflows/visual-baselines.yml`)
    regenerates chromium + mobile-chrome snapshots on ubuntu and opens a
    promotion PR. The memory-regression gate is now HARD on mainline
    (`MEMORY_FAIL_ON_REGRESSION=1` in main.yml, conditioned on the committed
    `reports/memory-baseline.json`, which has been stable at PASS with ~44×
    headroom since 2026-06-18).

## Architecture - Module Splits

- **Done:** `expandedModels.ts` is now a facade. Its former responsibilities are split into
  `expandedModels-types.ts`, `expandedModels-factory.ts`, `expandedModels-runners.ts`,
  `expandedModels-lyapunov.ts`, and `expandedModels-research.ts`. The largest split file is
  below the default module-size cap, and `src/physics/expandedModels.ts` has left the known-large
  ratchet list. `tests/expanded-models.test.ts` and
  `tests/expansion-lyapunov-injection.test.ts` cover preserved behavior and profiler injection.

- **`research-workbench.ts`**: UI-component helpers extracted to `research-ui-components.ts`,
  table rendering to `research-renderers.ts`, comparison rows/matrix to
  `research-comparison.ts`, and analysis superpack to `superpack-panels.ts`.
  **Render coupling unblocked:**
  `logResearchRun` now persists run-log state and emits
  `pendulum-lab:research-workbench-changed`; the Research tab installs a render bridge for that
  event. Remaining extraction candidates: run-log renderer (`renderResearchRunLog`, ~80 lines),
  design-study state, workspace/session controller, and batch-runner orchestration.
  The split boundary is now documented in `docs/architecture.md` so the next
  extraction keeps state/storage code in `src/app/parity/storage-sync.ts` and
  pure research helpers in `src/research`.
  - **Deferred deliberately:** the remaining `research-workbench.ts` extractions
    (run-log renderer, design-study state, workspace/session controller, batch runner) are
    UI-orchestration code with **no unit-test coverage** — they are verified only by
    the Playwright e2e suite (visual/interaction parity), which can't be exercised
    headlessly here. A pure extraction without a unit safety net risks a silent UI
    regression, so per the project's verify-first rule it waits until either unit
    coverage exists for those renderers or the extraction is done alongside an e2e
    run. The file stays within its 2200-line ratchet in the meantime.

## Portfolio Packaging

- Keep benchmark, validation, architecture, and limitation reports current for each release.
- Add a one-page PDF summary and short GIF capture after the UI is finalized.
- **Done:** npm package metadata (`keywords`, `license`, `author`, `repository`,
  `homepage`, `bugs`) is filled in and the headless core is bundled by `build:lib`
  with `exports`/`types`/`files` set, so the package is **publish-ready**. The package
  is now marked `private: false`; local `npm pack --dry-run` and
  `npm publish --dry-run --access public` pass. Live npm publication still requires
  an authenticated npm account or `NPM_TOKEN`.
- **Done:** GitHub Pages deployment, release artifact workflow, release-readiness
  manifest, one-page PDF, walkthrough GIF/storyboard, and full English API
  documentation are wired (`npm run release:package`, `npm run docs:api`).
