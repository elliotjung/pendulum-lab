# GPU Benchmark Ladder

Generated: 2026-07-05T02:12:06.462Z

Status: **pass**

Browser channel: `chrome`

## Adapter

| Field | Value |
|---|---|
| name | n/a |
| vendor | intel |
| architecture | xe-2lpg |
| device |  |
| description |  |
| features | bgra8unorm-storage, chromium-experimental-multi-draw-indirect, chromium-experimental-timestamp-query-inside-passes, clip-distances, core-features-and-limits, depth-clip-control, depth32float-stencil8, dual-source-blending, float32-blendable, float32-filterable, indirect-first-instance, primitive-index, rg11b10ufloat-renderable, shader-f16, subgroups, texture-component-swizzle, texture-compression-bc, texture-compression-bc-sliced-3d, texture-formats-tier1, texture-formats-tier2, timestamp-query |
| feature fingerprint | 1aaf9848d1dbb9 |

## Timing Discipline

Warmup/compile pass: 393.00 ms

Ensemble/reduction pipelines are compiled in a separate warmup pass, so horizon GPU timings are steady-state. Single-shot sections (CLV, variational FTLE, N-chain) still include their own first-dispatch compile.

## Kernel Provenance

Kernel-set hash: `0b7311c3ad7302` · tolerance-table hash: `0b01b8e32aa4a3`

| kernel | module | WGSL hash | bytes |
|---|---|---|---:|
| ensemble-rk4 | runtime/gpuEnsemble | `00a7bbbdf16fe3` | 1386 |
| ensemble-stats-reduction | runtime/gpuEnsemble | `1fae4568564c64` | 2388 |
| lyapunov-full-spectrum | runtime/gpuLyapunov | `191189a49b2c20` | 8116 |
| clv-forward-backward | runtime/gpuChaosPromotion | `18dbc097841186` | 11012 |
| variational-ftle-field | runtime/gpuVariationalFtleKernel | `024e0b57e9a67c` | 5894 |
| flip-basin-field | runtime/gpuFields | `1127682dcfc492` | 1998 |
| sweep-lambda-field | runtime/gpuFields | `13a15f3036c837` | 2324 |
| nchain-trajectory-tape | runtime/gpuNChainVariationalKernel | `151f04d119359d` | 5434 |
| nchain-variational-stm-qr | runtime/gpuNChainVariationalKernel | `008eb5f09aec82` | 10986 |

## Ensemble f32/f64 Horizon Drift

| steps | backend | n | GPU ms | CPU ms | reduction pass | reduction mean diff | f32/f64 mean drift | f32/f64 covariance drift |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 40 | webgpu | 25 | 67.70 | 2.50 | true | 1.527e-16 | 1.527e-16 | 7.320e-6 |
| 80 | webgpu | 25 | 72.20 | 3.50 | true | 1.943e-16 | 1.943e-16 | 2.802e-6 |
| 160 | webgpu | 25 | 27.70 | 5.90 | true | 6.765e-17 | 6.765e-17 | 4.896e-6 |

Max f32/f64 mean drift: `1.943e-16`

Max f32/f64 covariance drift: `7.320e-6`

Caveat: Reduction comparisons use identical CPU f64 states to isolate GPU-side reduction correctness; f32/f64 integration drift is recorded separately because chaotic trajectories diverge with horizon.

## Full-Spectrum Horizon Sensitivity

| steps | backend | GPU ms | pass | spectrum max diff | sum diff | KY diff |
|---:|---|---:|---:|---:|---:|---:|
| 160 | webgpu | 312.90 | true | 1.618e-5 | 1.066e-7 | 0.000e+0 |
| 320 | webgpu | 51.60 | true | 4.524e-6 | 4.072e-7 | 5.109e-7 |

Max adjacent spectrum shift: `1.678e-1`

Caveat: Full-spectrum rows are promoted only after same-run CPU f64 oracle comparison; adjacent-horizon shift is a convergence/stability diagnostic, not a pass/fail tolerance.

## CLV Promotion

| Metric | Value |
|---|---:|
| backend | webgpu |
| pass | true |
| exponent max abs diff | 1.779e-6 |
| mean angle abs diff | 1.677e-5 |
| min angle abs diff | 1.206e-5 |

## Variational-FTLE Promotion

| Metric | Value |
|---|---:|
| backend | webgpu |
| pass | true |
| shape | 4x4 |
| field max abs diff | 2.429e-5 |
| field mean abs diff | 5.859e-6 |

## N-chain Trajectory/Jacobian-Tape Promotion

| Metric | Value |
|---|---:|
| backend | webgpu |
| pass | true |
| links / dimension | 3 / 6 |
| steps | 33 |
| final-state max abs diff | 2.591e-7 |
| trajectory max abs diff | 4.384e-7 |
| Jacobian-tape max abs diff | 1.109e-2 |
| GPU ms | 400.00 |

## N-chain Tiled STM/QR Promotion

| Metric | Value |
|---|---:|
| backend | webgpu |
| pass | true |
| links / dimension | 3 / 6 |
| CLV exponent max abs diff | 1.775e-4 |
| FTLE abs diff | 3.416e-5 |
| GPU ms | 397.80 |
| method | piecewise-jacobian-rk2-stm-qr |

The hardware ladder validates GPU-side reductions and promoted chaos diagnostics against CPU f64 oracles while recording horizon drift separately.

