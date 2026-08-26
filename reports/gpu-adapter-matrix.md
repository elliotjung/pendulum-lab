# WebGPU Multi-Adapter Evidence Matrix

Generated: 2026-08-25T03:30:47.159Z

Status: **partial** (1/3 required vendor classes passing)

| Vendor | Evidence | Adapter | Driver | Thermal | Fallback | Cost | N-chain | Source |
|---|---|---|---|---|---:|---:|---|---|
| intel | pass |  (xe-2lpg) | n/a | unknown | n/a | n/a | pass (6D) | `reports/gpu-benchmark-ladder.json` |
| nvidia | missing | missing (n/a) | n/a | unknown | n/a | n/a | missing/fail | none |
| amd | missing | missing (n/a) | n/a | unknown | n/a | n/a | missing/fail | none |

## Contract

- Each row must come from a physical self-hosted runner labelled `webgpu` and `intel`, `nvidia`, or `amd`.
- The ladder must pass GPU-side reductions, full spectrum, CLV, variational FTLE, and N-chain STM/QR comparisons against CPU f64.
- Missing hardware stays `missing`; the report never fills a vendor row with SwiftShader or another software adapter.

Caveat: The matrix is intentionally incomplete until missing physical vendor runners upload evidence. Software adapters do not satisfy this contract.
