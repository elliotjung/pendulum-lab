# WebGPU Hardware Validation

Generated: 2026-07-10T09:27:17.238Z

Status: **pass**

Browser channel: `chrome`

Ensemble backend: `webgpu`

Full-spectrum backend: `webgpu`

CLV backend: `webgpu`

Variational-FTLE backend: `webgpu`

N-chain variational backend: `webgpu`

## Ensemble Reduction

| Metric | Value |
|---|---:|
| n | 25 |
| rmsSpread GPU | 2.7608410 |
| rmsSpread CPU | 2.7608408 |
| max mean diff | 1.665e-16 |
| max covariance diff | 1.082e-6 |
| rms spread diff | 2.420e-7 |

## Full-Spectrum Promotion

| Metric | Value |
|---|---:|
| passed | true |
| spectrum max abs diff | 4.524e-6 |
| sum abs diff | 4.072e-7 |
| Kaplan-Yorke abs diff | 5.109e-7 |

## CLV Promotion

| Metric | Value |
|---|---:|
| passed | true |
| exponent max abs diff | 1.779e-6 |
| mean angle abs diff | 1.677e-5 |
| min angle abs diff | 1.206e-5 |

## Variational-FTLE Promotion

| Metric | Value |
|---|---:|
| passed | true |
| shape | 4x4 |
| field max abs diff | 2.429e-5 |
| field mean abs diff | 5.859e-6 |

## N-chain Tiled STM/QR Promotion

| Metric | Value |
|---|---:|
| passed | true |
| links / dimension | 3 / 6 |
| CLV exponent max abs diff | 2.576e-6 |
| FTLE abs diff | 6.481e-7 |
| method | piecewise-jacobian-rk2-stm-qr |

The on-device WebGPU ensemble reduction, 4D chaos diagnostics, and N-chain tiled STM/QR candidate matched their CPU f64 oracles within the declared f32 tolerances.
