# GPU / Scale Validation Contract

Generated: 2026-06-18T10:26:43.248Z

Verdict: **cpu-reference-mock-and-contract-gates-ready**

This report deliberately separates scientific trust from acceleration. The CPU f64 path is the oracle; WebGPU may accelerate only when it either validates against CPU probes or falls back to CPU.

## Contracts

| ID | CPU Reference | Accelerated Path | Acceptance Rule | Caveat |
|---|---|---|---|---|
| ensemble-rk4 | src/runtime/gpuEnsemble.ts CPU f64 RK4 path | WGSL RK4 ensemble kernel in src/runtime/gpuEnsemble.ts | GPU integration may feed research outputs only through validated statistics; CPU force path remains the trajectory oracle. | Node CI has no real adapter; hardware WebGPU runs must still report backend=webgpu and caveat=f32. |
| ensemble-reduction-oracle | ensembleStatistics CPU f64 mean/covariance/rms/flip reduction | webgpuEnsembleStatistics GPU reduction or f32 candidate reduction | compareEnsembleStatistics(candidate, cpuOracle) must pass declared tolerances before a reduction can be used as a publication result. | The local CI candidate is f32-rounded CPU output; the self-hosted hardware workflow runs the on-device reduction when a WebGPU adapter is present. |
| field-scans | f64 probe-cell recomputation in src/runtime/gpuFields.ts | WGSL flip-basin / sweep / FTLE field kernels | GPU output is accepted only when deterministic CPU probe validation passes; otherwise the f64 CPU grid is returned. | Fractal basin boundaries allow isolated probe disagreements; the gate is on disagreement fraction. |
| chaos-acceleration-contract | existing CPU CLV/full-spectrum/variational FTLE implementations | GPU or parallel candidate that emits the same public result schema | GPU candidates must pass compareClvAcceleration / compareFtleFieldAcceleration / compareLyapunovSpectrumAcceleration against the CPU oracle before promotion. | The acceleration contract is implemented; the default production CLV/full-spectrum kernels remain CPU until a hardware candidate passes it. |

## Current CPU Reference Sample

| Probe | Backend | Size | Hash / Metric |
|---|---|---:|---|
| ensemble | cpu | 36 | rmsSpread=2.8799, flipFraction=0.000 |
| ensemble reduction oracle | f32 candidate vs CPU f64 | 36 | pass=true, maxMeanDiff=2.082e-16, maxCovDiff=1.007e-7 |
| GPU-side reduction oracle | unavailable in this runtime | 36 | requires real WebGPU adapter |
| flip basin | cpu | 12x12 | labelHash=12f8f890837060 |
| sweep lambda | cpu | 4x4 | lambdaHash=086036e1ab0bf6 |
| CLV promotion gate | contract probe | 2 exponents | pass=true, exponentDiff=1.000e-3 |
| full-spectrum promotion gate | contract probe | 4 exponents | pass=true, spectrumDiff=1.000e-3 |
| FTLE promotion gate | contract probe | 2x2 | pass=true, maxDiff=2.000e-3 |

## CI Evidence

- `tests/gpu-ensemble.test.ts` verifies CPU fallback and forceCpu A/B control.
- `tests/gpu-fields-validation.test.ts` installs a mock WebGPU device and proves accept/fallback behavior.
- `tests/ensemble-statistics.test.ts` pins the f64 reduction oracle and the f32-candidate comparison gate.
- `e2e/webgpu-hardware-reductions.spec.ts` is the hardware-only gate: it fails unless a real adapter returns `backend=webgpu` and the GPU-side reduction matches the CPU oracle.

## CLV / FTLE Promotion Gate

CLV, full-spectrum, and variational FTLE acceleration now has executable comparison contracts. A GPU path must emit the same public result schema, pass CPU oracle comparisons on representative regular/chaotic cases, attach Trust Inspector caveats, and fail closed to the CPU path when validation is unavailable.

