# GPU / Scale Validation Contract

Generated: 2026-07-04T10:27:55.170Z

Verdict: **hardware-webgpu-oracle-gates-passed**

This report deliberately separates scientific trust from acceleration. The CPU f64 path is the oracle; WebGPU may accelerate only when it either validates against CPU probes or falls back to CPU.

## Contracts

| ID | CPU Reference | Accelerated Path | Acceptance Rule | Caveat |
|---|---|---|---|---|
| ensemble-rk4 | src/runtime/gpuEnsemble.ts CPU f64 RK4 path | WGSL RK4 ensemble kernel in src/runtime/gpuEnsemble.ts | GPU integration may feed research outputs only through validated statistics; CPU force path remains the trajectory oracle. | Node CI has no real adapter; hardware WebGPU runs must still report backend=webgpu and caveat=f32. |
| ensemble-reduction-oracle | ensembleStatistics CPU f64 mean/covariance/rms/flip reduction | webgpuEnsembleStatistics GPU reduction or f32 candidate reduction | compareEnsembleStatistics(candidate, cpuOracle) must pass declared tolerances before a reduction can be used as a publication result. | The local CI candidate is f32-rounded CPU output; the self-hosted hardware workflow runs the on-device reduction when a WebGPU adapter is present. |
| field-scans | f64 probe-cell recomputation in src/runtime/gpuFields.ts | WGSL flip-basin / sweep / FTLE field kernels | GPU output is accepted only when deterministic CPU probe validation passes; otherwise the f64 CPU grid is returned. | Fractal basin boundaries allow isolated probe disagreements; the gate is on disagreement fraction. |
| chaos-acceleration-contract | existing CPU CLV/full-spectrum/variational FTLE implementations | 4D kernels plus src/runtime/gpuNChainVariational.ts tiled STM/QR/CLV/FTLE pipeline | GPU candidates must pass compareClvAcceleration / compareFtleFieldAcceleration / compareLyapunovSpectrumAcceleration against the CPU oracle before promotion. | The 4D kernels and planar N-chain N<=8 STM/QR pipeline are hardware-gated against CPU f64 oracles. The N-chain nonlinear trajectory/Jacobian-tape WebGPU candidate is scoped to N<=3 and promotes only after same-run CPU f64 final-state, trajectory, and Jacobian-tape comparison; otherwise the CPU f64 tape is used. |

## Current CPU Reference Sample

| Probe | Backend | Size | Hash / Metric |
|---|---|---:|---|
| ensemble | cpu | 36 | rmsSpread=2.8799, flipFraction=0.000 |
| ensemble reduction oracle | f32 candidate vs CPU f64 | 36 | pass=true, maxMeanDiff=2.082e-16, maxCovDiff=1.007e-7 |
| GPU-side reduction oracle | unavailable in this runtime | 36 | requires real WebGPU adapter |
| hardware report reduction oracle | webgpu | 25 | pass=true, maxMeanDiff=1.665e-16 |
| hardware report full-spectrum oracle | webgpu | 4 exponents | pass=true, spectrumDiff=4.524e-6 |
| hardware report CLV oracle | webgpu | 4 exponents | pass=true, exponentDiff=1.779e-6 |
| hardware report variational-FTLE oracle | webgpu | 4x4 | pass=true, maxDiff=2.429e-5 |
| hardware report N-chain trajectory/tape oracle | webgpu | 6D | pass=true, trajectoryDiff=4.384e-7, jacobianDiff=1.109e-2 |
| hardware report N-chain STM/QR oracle | webgpu | 6D | pass=true, CLV=true, FTLE diff=3.416e-5 |
| GPU benchmark ladder | pass | adapter | vendor=intel, arch=xe-2lpg |
| GPU ladder ensemble reductions | pass | horizons | maxMeanDrift=1.943e-16, maxCovDrift=7.320e-6 |
| GPU ladder full-spectrum sensitivity | pass | horizons | adjacentShift=1.678e-1 |
| GPU ladder N-chain trajectory/tape | webgpu | 6D | pass=true, jacobianDiff=1.109e-2 |
| GPU ladder N-chain STM/QR | webgpu | 6D | pass=true, FTLE diff=3.416e-5 |
| physical adapter matrix | partial | 1/3 vendors | missing=2, failed=0 |
| flip basin | cpu | 12x12 | labelHash=12f8f890837060 |
| sweep lambda | cpu | 4x4 | lambdaHash=086036e1ab0bf6 |
| CLV promotion gate | contract probe | 2 exponents | pass=true, exponentDiff=1.000e-3 |
| full-spectrum promotion gate | contract probe | 4 exponents | pass=true, spectrumDiff=1.000e-3 |
| FTLE promotion gate | contract probe | 2x2 | pass=true, maxDiff=2.000e-3 |

## CI Evidence

- `tests/gpu-ensemble.test.ts` verifies CPU fallback and forceCpu A/B control.
- `tests/gpu-fields-validation.test.ts` installs a mock WebGPU device and proves accept/fallback behavior.
- `tests/ensemble-statistics.test.ts` pins the f64 reduction oracle and the f32-candidate comparison gate.
- `e2e/webgpu-hardware-reductions.spec.ts` is the hardware-only gate: it fails unless a real adapter returns `backend=webgpu`, the GPU-side reduction matches the CPU oracle, and the WebGPU full-spectrum, CLV, variational-FTLE, N-chain trajectory/tape, and N-chain STM/QR candidates pass their CPU f64 promotion gates.
- `npm run benchmark:gpu-ladder` records adapter metadata, f32/f64 horizon drift, full-spectrum horizon sensitivity, 4D CLV/FTLE metrics, the N<=3 N-chain trajectory/tape promotion result, and the 6D N-chain STM/QR promotion result.
- `npm run benchmark:gpu-matrix` accepts only physical Intel, NVIDIA, and AMD ladder artifacts; absent vendors remain explicit `missing` rows.

## CLV / FTLE Promotion Gate

CLV, full-spectrum, and variational FTLE acceleration now has executable comparison contracts, 4D double-pendulum WebGPU candidates, an N<=3 N-chain nonlinear trajectory/Jacobian-tape candidate, and a tiled N-chain STM/QR path validated at 6D. The N-chain trajectory/tape path is promoted only when the same-run CPU f64 trajectory, final state, and Jacobian tape all match declared tolerances; otherwise the f64 tape is used. Downstream N-chain science still requires the final CLV/FTLE oracle gate, attaches Trust Inspector caveats, and fails closed when validation is unavailable.

