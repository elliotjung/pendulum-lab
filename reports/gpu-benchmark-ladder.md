# GPU Benchmark Ladder

Generated: 2026-07-10T09:29:21.172Z

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
| features | bgra8unorm-storage, chromium-experimental-multi-draw-indirect, chromium-experimental-timestamp-query-inside-passes, clip-distances, core-features-and-limits, depth-clip-control, depth32float-stencil8, dual-source-blending, float32-blendable, float32-filterable, indirect-first-instance, primitive-index, rg11b10ufloat-renderable, shader-f16, subgroup-size-control, subgroups, texture-component-swizzle, texture-compression-bc, texture-compression-bc-sliced-3d, texture-formats-tier1, texture-formats-tier2, timestamp-query |

## Ensemble f32/f64 Horizon Drift

| steps | backend | n | GPU ms | CPU ms | reduction pass | reduction mean diff | f32/f64 mean drift | f32/f64 covariance drift |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 40 | webgpu | 25 | 250.20 | 3.00 | true | 1.527e-16 | 1.527e-16 | 7.320e-6 |
| 80 | webgpu | 25 | 32.70 | 4.00 | true | 1.943e-16 | 1.943e-16 | 2.802e-6 |
| 160 | webgpu | 25 | 33.60 | 7.60 | true | 1.110e-16 | 1.110e-16 | 4.896e-6 |

Max f32/f64 mean drift: `1.943e-16`

Max f32/f64 covariance drift: `7.320e-6`

Caveat: Reduction comparisons use identical CPU f64 states to isolate GPU-side reduction correctness; f32/f64 integration drift is recorded separately because chaotic trajectories diverge with horizon.

## Full-Spectrum Horizon Sensitivity

| steps | backend | GPU ms | pass | spectrum max diff | sum diff | KY diff |
|---:|---|---:|---:|---:|---:|---:|
| 160 | webgpu | 215.50 | true | 1.618e-5 | 1.066e-7 | 0.000e+0 |
| 320 | webgpu | 40.70 | true | 4.524e-6 | 4.072e-7 | 5.109e-7 |

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

## N-chain Tiled STM/QR Promotion

| Metric | Value |
|---|---:|
| backend | webgpu |
| pass | true |
| links / dimension | 3 / 6 |
| CLV exponent max abs diff | 2.576e-6 |
| FTLE abs diff | 6.481e-7 |
| GPU ms | 851.70 |
| method | piecewise-jacobian-rk2-stm-qr |

The hardware ladder validates GPU-side reductions and promoted chaos diagnostics against CPU f64 oracles while recording horizon drift separately.

