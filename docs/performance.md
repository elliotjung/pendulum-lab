# Performance Guide

Pendulum Lab prioritizes the main pendulum canvas over auxiliary diagnostics.
The Lab tab separates full-rate physics/rendering from side-plot redraws, sends
side-plot payloads to the worker as transferable typed arrays, and records why
adaptive quality changes happen.

## Quality Modes

| Mode | DPR cap | Trail cap | Side-plot cadence | Ensemble cap | CSS/FX policy |
| --- | ---: | ---: | ---: | ---: | --- |
| Performance | 1.0 | 720 | every 3 diagnostics ticks | 24 | disables glow and the heavier kinetic/HUD effects |
| Balanced | 1.5 | 1200 | every 2 diagnostics ticks | 60 | normal visual treatment |
| Cinematic | 2.0 | 3000 | every diagnostics tick | 200 | full glow/trail budget for screenshots or fast GPUs |

When **Auto-quality scaling** is enabled, the app looks at `fps`,
`physicsMsPerFrame`, `renderMsPerFrame`, and `sidePlotMsPerFrame`. Render
pressure lowers the visual mode. Physics pressure lowers the effective
`stepsPerFrame` first. Side-plot pressure relaxes redraw cadence. The diagnostics
row reports the latest reason in `reason`, and
`window.__modernLab.diagnostics().canvasQualityEvents` keeps the recent history.

## Fast Fixes

| Symptom | First option to lower | Why it helps |
| --- | --- | --- |
| Main motion stutters but plots are smooth | Steps/frame (`spf`) | Directly reduces physics work per animation frame. |
| Pendulum is smooth but side plots lag | Quality: Performance or disable worker pool only for debugging | Increases side-plot cadence interval and trims transferred plot snapshots. |
| GPU fan/noise rises on the Lab tab | Glow FX, trail length, Cinematic mode | Removes shadow blur and long trail composites. |
| Mobile browser janks | Performance mode, trail <= 520, ensemble <= 24 | Matches compact-viewport caps used by the runtime. |
| Long sessions grow memory | Clear trail, clear Poincare, export then reset | Ring buffers are capped, but screenshots/exports and browser tooling can retain memory. |

## Measurement Notes

Headless browser FPS is noisy and should not be the only regression signal. Use:

| Metric | Source | Regression signal |
| --- | --- | --- |
| `physicsMsPerFrame` | `window.__modernLab.diagnostics()` | integrator/config changes that slow the hot loop |
| `renderMsPerFrame` | same | canvas/CSS/trail regressions |
| `sidePlotMsPerFrame` | same | FFT/Poincare/phase redraw pressure |
| `pendingUiTasks` | same | side-plot queue backlog or idle-task starvation |
| heap growth | Playwright `performance.memory` where available | long-session leaks |
| long tasks | browser performance trace/manual profile | main-thread stalls missed by FPS |

## Current Architecture

- `SimulationClock` owns fixed-step physics and reports `physicsMs`.
- `RenderScheduler` owns FPS/render timing.
- `DiagnosticsScheduler` coalesces side-plot UI work so old plot jobs do not
  build an unbounded backlog.
- `LabSidePlotWorkerClient` transfers `Float32Array` buffers to the
  `OffscreenCanvas` worker when supported and reports worker render time back to
  the diagnostics row.
- The side-plot worker keeps only the latest pending job per plot and runs
  higher-priority plots first.
- `LabRecording` owns the fixed-size trajectory recording ring used by scrubber
  replay and exports.
- `PoincareAccumulator.policy()` exposes the sampling cap, crossing direction,
  and refinement state; `toFloat32Pairs()` avoids object-heavy worker payloads.
- `LabRenderer` keeps the exact ring-buffer trail fallback, but on browser canvas
  contexts it accumulates long trails into a separate layer and redraws only the
  newest segment each frame.
- `canvasQuality.ts` owns DPR caps and the recent quality-reason log.

## Hardware And Claim Boundaries

Intel WebGPU evidence is recorded. NVIDIA/AMD claims remain bounded until
physical runners upload passing artifacts. SharedArrayBuffer is intentionally not
enabled yet; adopting it requires COOP/COEP deployment headers and cross-project
release testing.
