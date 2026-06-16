# Roadmap

## Legacy-To-Modern Migration — COMPLETE (v10.22)

The migration is finished: the legacy `js/` runtime (≈8,080 lines) is removed and archived, and the app is 100% TypeScript under `src/`. The legacy-risk audit is **0** (from a 482 baseline). All rendering, simulation, analysis, and shell duties run on the modern stack; 173 unit tests + 13 chromium e2e pass with no legacy runtime present. History of the staged migration is below for reference.

## Stabilize Legacy-To-Modern Migration (history)

- **Done (v10.12):** unified the runtime behind the `PendulumRuntime` DI container; collapsed the five legacy globals into one adopted namespace with read-only accessors; removed dynamic `<script>` injection. The `globalRuntimeExports` and `dynamicScript` legacy-risk metrics are now `0`.
- **Done (v10.15, Stage 2 complete):** the modern Lab (`src/app/`) is the **default** lab tab — sim loop + all five side plots + presets, ensemble, visual FX, drag-to-set, export (CSV/JSON/PNG), and replay/scrubber. `?lab=legacy` is the escape hatch. 157 unit tests + 6 chromium e2e. Audio sonification and interpolated render remain legacy-only.
- **Done (v10.19, Stage 3 tab-ports):** every lab/analysis tab now runs on `src/` — Lab (default) + Lyapunov, Validation, Sweep, Compare, Bifurcation, 3D phase, and density, each gated by unit + e2e coverage and the `?lab=legacy` escape hatch.
- **In progress (v10.21, Stage 4):** a modern shell + modules are retiring the legacy runtime's responsibilities. Done: **tab navigation** (`Shell.ts`) and **audio sonification** (`AudioSonifier.ts`). Remaining shell duties before `js/` can be archived: slider value displays, presets slider-setting, keyboard shortcuts, header/diagnostics chrome, `CanvasMgr` (canvas sizing), `NaNGuard`, the dev-hub flyout; plus the `?lab=legacy` escape-hatch decision and the smoke test's `window.App` dependency. (Interpolated render is cosmetic and can be dropped.) Then delete `js/01`–`js/11`.
- Continue shrinking `js/01-core-app.js` into focused `src/runtime`, `src/ui`, `src/render`, and `src/export` modules.
- Historical note: the legacy-risk audit once centered on `innerHTML` and dynamic script usage; the current audit target is to keep the score at 0 as new UI surfaces are added.
- Move long-running sweep, bifurcation, FFT, and Lyapunov jobs to typed worker messages.

## Numerical Research Upgrades

- Replace finite-difference Hamiltonian gradients with analytic gradients.
- Add full Newton solve for implicit midpoint with Jacobian diagnostics.
- Store long-horizon energy drift curves by integrator.
- Extend Lyapunov output from convergence curves and CPU full-spectrum reports to GPU acceleration and covariant Lyapunov vectors.
- Add selectable Poincare section conditions and transient removal for bifurcation analysis.
- Implement Floquet multipliers after a reliable periodic-orbit correction path exists.

## Performance And UX

- Decouple canvas rendering cadence from physics stepping cadence.
- Add trajectory and Poincare memory caps to user-facing settings.
- Add paper figure export presets and reproducible research bundle export.
- Evaluate OffscreenCanvas and WebGPU ensemble simulation behind feature detection.
- Add visual regression, memory leak, and long-runtime browser tests to CI after the UI stabilizes.

## Architecture - Module Splits

- **Done:** `expandedModels.ts` is now a facade. Its former responsibilities are split into
  `expandedModels-types.ts`, `expandedModels-factory.ts`, `expandedModels-runners.ts`,
  `expandedModels-lyapunov.ts`, and `expandedModels-research.ts`. The largest split file is
  below the default module-size cap, and `src/physics/expandedModels.ts` has left the known-large
  ratchet list. `tests/expanded-models.test.ts` and
  `tests/expansion-lyapunov-injection.test.ts` cover preserved behavior and profiler injection.

- **`research-workbench.ts`**: UI-component helpers extracted to `research-ui-components.ts`;
  analysis superpack extracted to `superpack-panels.ts`. **Render coupling unblocked:**
  `logResearchRun` now persists run-log state and emits
  `pendulum-lab:research-workbench-changed`; the Research tab installs a render bridge for that
  event. Remaining extraction candidates: run-log renderer (`renderResearchRunLog`, ~80 lines),
  comparison matrix builder, design-study state, and batch-runner orchestration.

## Portfolio Packaging

- Keep benchmark, validation, architecture, and limitation reports current for each release.
- Add a one-page PDF summary and short GIF capture after the UI is finalized.
- Add GitHub Pages deployment, npm package metadata, and full English API documentation.
