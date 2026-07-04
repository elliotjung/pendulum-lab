# WebGPU Multi-Adapter Evidence Matrix

Generated: 2026-07-04T10:27:12.873Z

Status: **partial** (1/3 required vendor classes passing)

| Vendor | Evidence | Adapter | Architecture | N-chain tape | N-chain STM/QR | Source | Next action |
|---|---|---|---|---|---|---|---|
| intel | pass |  | xe-2lpg | pass (6D) | pass (6D) | `reports/gpu-benchmark-ladder.json` | Keep this vendor runner on the scheduled WebGPU evidence cadence and refresh after driver/browser updates. |
| nvidia | missing | missing | n/a | missing/fail | missing/fail | none | Provision or enable a physical nvidia WebGPU runner labelled self-hosted, webgpu, nvidia; dispatch WebGPU Vendor Evidence with vendor=nvidia; download artifact gpu-ladder-nvidia; rerun npm run benchmark:gpu-matrix. |
| amd | missing | missing | n/a | missing/fail | missing/fail | none | Provision or enable a physical amd WebGPU runner labelled self-hosted, webgpu, amd; dispatch WebGPU Vendor Evidence with vendor=amd; download artifact gpu-ladder-amd; rerun npm run benchmark:gpu-matrix. |

## Contract

- Each row must come from a physical self-hosted runner labelled `webgpu` and `intel`, `nvidia`, or `amd`.
- The ladder must pass GPU-side reductions, full spectrum, CLV, variational FTLE, N-chain trajectory/tape, and N-chain STM/QR comparisons against CPU f64.
- Missing hardware stays `missing`; the report never fills a vendor row with SwiftShader or another software adapter.
- Missing rows list the exact self-hosted labels and artifact name required to close the evidence gap.

Caveat: The matrix is intentionally incomplete until missing physical vendor runners upload evidence. Software adapters do not satisfy this contract.
