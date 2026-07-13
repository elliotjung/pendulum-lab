# ADR 0002: Gate N-chain Jacobian WASM SIMD behind a versioned kernel ABI

- Status: Accepted; ABI-2 SIMD candidate implemented, promotion pending
- Date: 2026-07-13
- Scope: N-link planar-chain RHS and central-difference Jacobian tape

## Context

`buildNChainJacobianTape` is the f64 CPU oracle used before the WebGPU variational path. For each trajectory step it evaluates a `2N x 2N` central-difference Jacobian, so the repeated mass-matrix assembly and solve are a meaningful CPU cost. Moving that loop to WASM SIMD is a reasonable optimization target.

The committed AssemblyScript build originally contained only a double-pendulum ensemble kernel:

```text
asc wasm/assembly/ensemble.ts ... --runtime stub
```

Those constraints were resolved for an isolated, unpromoted candidate:

1. `build:wasm` now enables `simd128`, and the candidate executes f64x2 RK4 vector updates rather than labelling a scalar binary as SIMD.
2. ABI 2 exports the exact allocation size, tape offset, and maximum N. The host retains one reusable candidate block containing every variable-size input, output, and scratch lane.
3. `wasmNChain.ts` validates a minimal SIMD module before compiling the kernel and fails closed to `buildNChainJacobianTape` on feature, CSP, ABI, layout, allocation, kernel-status, or finite-output failure.
4. The served app's CSP remains unchanged. The candidate is consumed by Node/headless benchmarks and tests and is not wired into the production WebGPU path.

## Decision

The ABI-2 kernel is a candidate, not a promoted replacement. The following gates govern promotion:

- A versioned ABI export (for example `nChainKernelAbiVersion(): i32`) and an explicit maximum `N`.
- A single host-owned reusable memory layout containing state, masses, lengths, RHS scratch, pivot/matrix scratch, and output tape; all offsets and required bytes must be queryable before allocation.
- AssemblyScript compilation with SIMD explicitly enabled, plus a feature-probe that falls back before instantiation on engines without `simd128`.
- f64 output and central-difference epsilon parity with `numericalJacobian`; no f32 promotion.
- Oracle tests at N=1/2/3/4/8, including N=2 and N=3 agreement with the specialized systems, damped and undamped cases, and near-singular-but-valid configurations.
- Cross-engine validation in Node/V8 and browser Chromium/Firefox/WebKit where WASM SIMD is available.
- Interleaved benchmark rounds using `scripts/wasm-nchain-benchmark.ts`; report both elapsed time and tape values per second. Promotion requires no numerical gate failures and a repeatable median speedup, not a single best run.
- The public result type must report `backend: 'wasm-simd' | 'cpu'` and an honest caveat. Kernel load, CSP, feature, allocation, or validation failure must return the existing CPU result.

## Benchmark contract

Run the checked-in baseline directly, without a package script:

```text
npx tsx scripts/wasm-nchain-benchmark.ts
```

It writes `reports/wasm-nchain-baseline.json` for N=2/4/8, interleaving the CPU f64 oracle and ABI-2 candidate when SIMD is available. The report records speedup and maximum absolute error. If the feature probe fails, it still says `candidateBackend: "not-built"`; availability is never fabricated.

## Consequences

- The production WebGPU/runtime path remains numerically unchanged and gains no false acceleration claim.
- The candidate reports `promoted: false` even when its actual backend is `wasm-simd`.
- The build command and committed binary now agree on SIMD and are guarded by `check:wasm-sync`.
- The main trajectory/WebGL and OffscreenCanvas experiments remain independent of the WASM/CSP decision.
