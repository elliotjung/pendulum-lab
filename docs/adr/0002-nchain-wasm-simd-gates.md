# ADR 0002: Gate N-chain Jacobian WASM SIMD behind a versioned kernel ABI

- Status: Accepted; SIMD kernel implementation deferred
- Date: 2026-07-13
- Scope: N-link planar-chain RHS and central-difference Jacobian tape

## Context

`buildNChainJacobianTape` is the f64 CPU oracle used before the WebGPU variational path. For each trajectory step it evaluates a `2N x 2N` central-difference Jacobian, so the repeated mass-matrix assembly and solve are a meaningful CPU cost. Moving that loop to WASM SIMD is a reasonable optimization target.

The committed AssemblyScript build is currently a single double-pendulum ensemble kernel:

```text
asc wasm/assembly/ensemble.ts ... --runtime stub
```

It has three constraints that make an immediate N-chain SIMD append unsafe:

1. The build does not enable the SIMD feature. A scalar kernel must not be reported or benchmarked as SIMD.
2. The stub runtime exposes a bump allocator and the JS wrapper retains one reusable ensemble block. Adding variable-size state, parameter, mass-matrix, pivot, RHS, and Jacobian-tape allocations without a versioned shared layout can silently overlap or leak memory.
3. The served app intentionally does not loosen its CSP for WASM compilation. The first consumer should remain the Node/headless research lane and must preserve a JS f64 fallback.

This performance work was also constrained not to change `package.json` or workflows. Changing the AssemblyScript feature flags would therefore make the documented build and the committed binary disagree.

## Decision

Do not add an unversioned or scalar N-chain export to the existing binary. Land the benchmark/oracle harness now and require the following gates for the future kernel:

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

It writes `reports/wasm-nchain-baseline.json` for N=2/4/8 using the current f64 oracle. The exported `runNChainTapeBenchmark(candidate)` function accepts a future candidate with the same inputs, interleaves CPU and candidate rounds, and records speedup plus maximum absolute error. Until such a candidate exists, the report says `candidateBackend: "not-built"`; it never implies that SIMD work shipped.

## Consequences

- The current runtime remains numerically unchanged and gains no false acceleration claim.
- A reproducible baseline and candidate adapter seam exist before the ABI is frozen.
- Implementing the kernel later requires an intentional build-command/workflow change and regenerated committed WASM binary.
- The main trajectory/WebGL and OffscreenCanvas experiments remain independent of the WASM/CSP decision.
