# WebGPU Multi-Adapter Evidence Matrix

Generated: 2026-07-10T09:29:18.012Z

Status: **partial** (1/3 required vendor classes passing)

| Vendor | Evidence | Adapter | Architecture | N-chain | Source |
|---|---|---|---|---|---|
| intel | pass |  | xe-2lpg | pass (6D) | `C:/Users/junge/Desktop/pendulum_lab_modular/reports/gpu-benchmark-ladder.json` |
| nvidia | missing | missing | n/a | missing/fail | none |
| amd | missing | missing | n/a | missing/fail | none |

## Contract

- Each row must come from a physical self-hosted runner labelled `webgpu` and `intel`, `nvidia`, or `amd`.
- The ladder must pass GPU-side reductions, full spectrum, CLV, variational FTLE, and N-chain STM/QR comparisons against CPU f64.
- Missing hardware stays `missing`; the report never fills a vendor row with SwiftShader or another software adapter.

Caveat: The matrix is intentionally incomplete until missing physical vendor runners upload evidence. Software adapters do not satisfy this contract.
