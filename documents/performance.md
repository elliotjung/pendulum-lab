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

The A/B CI report records both physics milliseconds per paint frame and the
number of fixed-dt steps advanced. Its regression gate divides those values to
compare `physicsMsPerStep`; this avoids treating the accumulator's intentional
catch-up work after a slow paint as an integrator regression.

| Metric | Source | Regression signal |
| --- | --- | --- |
| `physicsMsPerFrame` | `window.__modernLab.diagnostics()` | interactive frame budget; interpret alongside `stepsAdvanced` |
| `physicsMsPerStep` | A/B benchmark derivation | integrator/config changes that slow one fixed-dt step |
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
- `?mainCanvasWorker=1` opts supported browsers into the tested
  `OffscreenCanvas` main-trajectory worker; failed transfers remain on the main
  renderer without changing the fixed-dt simulation clock.
- `?webglTrail=1` opts Cinematic mode into the tested WebGL2 instanced long-trail
  layer. Canvas2D remains the default and fail-closed fallback.
- `canvasQuality.ts` owns DPR caps and the recent quality-reason log.

## WASM Ensemble Lane (headless hot loop)

Large ensemble / basin sweeps spend their time in one hot loop: RK4 over
`rhsDouble` for N independent trajectories. That loop now has a WASM lane:

- **Kernel**: `wasm/assembly/ensemble.ts` (AssemblyScript), a 1:1 f64 port of
  `rhsDouble` + `rk4Step` with the same floating-point grouping and the same
  mass-matrix singularity guard. Compiled by `npm run build:wasm` to
  `src/runtime/wasm/pendulum-kernel.wasm` (committed; CI recompiles and fails
  on drift via `check:wasm-sync`).
- **API**: `src/runtime/wasmEnsemble.ts` — `runDoublePendulumEnsembleWasm`,
  same fallback contract as the GPU lane (JS loop, `backend: 'cpu'`) when the
  kernel cannot load.
- **Contract tests**: `tests/wasm-ensemble.test.ts` — round-off-level parity
  vs the JS f64 oracle over short horizons, undamped energy conservation,
  memory-block reuse, forced-fallback equivalence.
- **Measured**: `npm run benchmark:wasm` (interleaved A/B, medians) —
  **8.2× vs the production JS loop** on Node 22 / win32-x64 (N=4096, 400
  steps: JS 1957 ms → WASM 240 ms, ≈6.8M trajectory-steps/s). Report:
  `reports/wasm-benchmark.json`.
- Bonus property: the kernel binary gives bit-identical results across JS
  engines, which `Math.sin`/`Math.cos` in JS do not guarantee.

**Adoption boundary (decision recorded)**: the lane is wired for headless
paths (research CLI, paper studies, Node benchmarks). Running it inside the
served app requires `'wasm-unsafe-eval'` in the CSP `script-src`; that posture
change is deferred until an in-app workload needs it. **SIMD (decision
recorded)**: the inner loop is trig-dominated (4 libm calls per rhs), so
2-lane f64x2 SIMD without a vectorized sin/cos yields little; revisit with a
SLEEF-style vector libm if ensemble scale ever outgrows the 8× scalar win.

## N-chain Jacobian WASM SIMD candidate

The committed binary also contains a versioned ABI-2 candidate for the planar
N<=8 f64 RHS and central-difference Jacobian tape. It uses one queryable,
host-owned reusable memory layout, probes `simd128` before module compilation,
and falls back to the JS f64 oracle on feature, ABI, layout, kernel-status, or
finite-output failure. RK4 vector updates use f64x2 SIMD; the mass-matrix solve
and trigonometric functions stay scalar f64.

`npm run benchmark:wasm-nchain` interleaves the CPU oracle and candidate. The
2026-07-13 Node 26/win32-x64 diagnostic run recorded maximum tape error
`1.08e-9` and median speedups of 7.60x (N=2), 1.03x (N=4), and 2.89x (N=8).
These local diagnostics are not a production promotion claim: results remain
`promoted: false` until ADR 0002's cross-engine and repeatable-speedup gates
are complete.

## Hardware And Claim Boundaries

Intel WebGPU evidence is recorded. NVIDIA/AMD claims remain bounded until
physical runners upload passing artifacts. A tested SharedArrayBuffer/local
ring primitive and Cloudflare COOP/COEP configuration exist, but side plots
retain transferable snapshots until the deployed mirror proves cross-origin
isolation end to end.
