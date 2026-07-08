# Performance Guide

Pendulum Lab prioritizes a smooth main pendulum canvas over auxiliary charts.
The Lab tab now separates the full-rate simulation/render path from heavier
diagnostic redraws so FFT, phase, energy, and Poincare plots cannot all land on
the same animation frame.

## Quality Modes

- **Performance** caps canvas DPR at `1.0`, trims long trails to about `720`
  points, limits ensemble copies to `24`, disables bob glow, and updates side
  plots more slowly.
- **Balanced** caps DPR at `1.5`, trims trails to about `1200` points, allows
  up to `60` ensemble copies, and keeps the normal visual treatment.
- **Cinematic** allows DPR up to `2.0`, trails up to `3000`, and the full
  ensemble budget for high-end machines or screenshots.

When **Auto-quality scaling** is enabled, the app lowers the mode if FPS or
render time falls below budget. The diagnostics row reports `sim ms`, `render
ms`, `quality`, and `dpr` so performance changes are visible.

## First Options To Lower

- **Trail length**: high values increase canvas paint work. Start with `900` to
  `1200` for live exploration.
- **Glow FX**: glow uses shadow blur on moving bobs. Disable it first on weak
  GPUs.
- **N copies**: ensemble members are full extra trajectories. Keep this under
  `24` on low-power CPUs.
- **Steps/frame**: this directly multiplies physics work. Use the smallest value
  that still gives the time scale you want.
- **System type**: triple pendulum runs more state dimensions and more expensive
  derivatives than double pendulum.

## Measurement Notes

Headless browser FPS is noisy and should not be the primary regression signal.
Use these metrics instead:

- `physicsMsPerFrame` from `window.__modernLab.diagnostics()`.
- `renderMsPerFrame` from the same diagnostics object.
- canvas nonblank checks after a short simulation run.
- console error checks during Playwright smoke tests.
- memory-growth checks in Playwright when the browser exposes heap metrics,
  plus manual profiling for browsers that do not.

## Current Architecture

- `SimulationClock` owns the fixed-step physics advance and hot-loop observers.
- `RenderScheduler` owns FPS/render timing, and `DiagnosticsScheduler` owns
  side-plot cadence and backpressure.
- `LabSimulation.stateView()` exposes the active typed-array state for hot-loop
  readers; snapshots still copy for exports and JSON payloads.
- The trajectory recorder and phase portrait history use fixed-size ring
  buffers.
- Poincare event detection reuses previous-state and RK4 refinement buffers.
- Side plots redraw one panel per diagnostics cadence, use the shared
  `UiTaskQueue` to avoid task buildup, and render on an `OffscreenCanvas` worker
  when the browser supports it.
- `canvasQuality.ts` owns the adaptive DPR cap used by every managed canvas.
- `e2e/performance-smoke.spec.ts` covers physics/render budgets, UI task
  backpressure, side-plot backend reporting, canvas paint, and heap growth when
  the browser exposes `performance.memory`.
