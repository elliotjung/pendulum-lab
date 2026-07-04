# Certified Chaotic Dynamics Workbench - Reviewer Kit

Generated: 2026-07-04T10:58:37.957Z

Status: **READY**

# Melnikov threshold vs period-doubling onset: a quantitative gap map

**Thesis.** For the damped driven pendulum at omega=2/3, the analytic Melnikov homoclinic-tangle threshold and the measured period-doubling onset are distinct objects; their ratio closes and reverses near gamma ~= 0.69.

**Primary metric.** A_PD(gamma) / A_c(gamma), with A_PD located by Floquet multiplier rho=-1 and A_c from the closed-form Melnikov integral.

Reproduce the study with `npm run paper:study`, then render the paper with `npm run paper:build`.

## Trust Contract
- A_c is analytic and pinned by quadrature in tests.
- A_PD is measured on the attractor branch and refined by the monodromy/Floquet multiplier crossing rho=-1.
- The gamma=0.5 onset is anchored to the Baker-Gollub literature value.
- 0-1 test samples corroborate regular/chaotic sides without replacing the Floquet criterion.
- Every artifact carries parameters, commands, hashes, and caveats.

## Evidence Artifacts
- `reports/paper-study.json`
- `paper/index.html`
- `paper/paper.pdf`
- `reports/literature-anchors.json`
- `reports/reproduce/manifest.json`

## Caveats
- The comparison fixes omega=2/3 and follows the primary attractor branch; coexisting basins may have different events.
- Melnikov theory is first-order in forcing/damping and is not an ordering bound at strong damping.
- Chaotic comparisons are bounded by the predictability horizon.

## Artifact Checklist

| Priority | Available | Artifact | Reproduce | Purpose |
|---|---:|---|---|---|
| required | yes | `reports/paper-study.json` | `npm run paper:study` | Numerical source of truth for the flagship Melnikov gap map. |
| required | yes | `reports/flagship-certification.json` | `npm run flagship:certify` | Figure 1 hash, crossing interval, onset localization table, and caveat map. |
| recommended | yes | `reports/flagship-figure1.svg` | `npm run flagship:certify` | Reviewer-facing Figure 1 SVG for the Melnikov gap map. |
| recommended | yes | `reports/flagship-external-check.json` | `npm run flagship:external` | Dependency-free Python recomputation of A_c and the ratio crossing from exported A_PD values. |
| required | yes | `paper/index.html` | `npm run paper:build` | Self-contained paper with figures rendered from the study JSON. |
| recommended | yes | `paper/paper.pdf` | `npm run paper:build` | Print-reviewable PDF generated from the same HTML paper. |
| required | yes | `reports/reproduce/manifest.json` | `npm run reproduce` | Hash-stamped deterministic manifest for headline claims. |
| recommended | yes | `reports/cross-validation.json` | `npm run validate:cross` | Independent SciPy DOP853 trajectory comparison. |
| recommended | yes | `reports/sympy-validation.json` | `npm run validate:sympy` | Independent SymPy Euler-Lagrange RHS derivation check. |
| optional | yes | `reports/research-notebook.html` | `npm run notebook` | Figure-rich notebook driven through the same analysis handlers. |
| recommended | yes | `reports/gpu-scale-validation.md` | `npm run validate:gpu-scale` | CPU reference plus mocked-WebGPU contract for accelerated field/ensemble paths. |
| recommended | yes | `reports/webgpu-hardware-validation.md` | `npm run validate:webgpu-hardware` | Real-adapter WebGPU reduction comparison against the CPU f64 oracle. |
| recommended | yes | `reports/gpu-benchmark-ladder.md` | `npm run benchmark:gpu-ladder` | Real-adapter GPU ladder with f32/f64 drift, 4D diagnostics, and N-chain STM/QR promotion metrics. |
| recommended | yes | `reports/gpu-adapter-matrix.json` | `npm run benchmark:gpu-matrix` | Intel/NVIDIA/AMD physical-adapter evidence matrix with explicit missing rows. |
| required | yes | `reviewer.html` | `npm run build` | GitHub Pages reviewer console that reads the machine-readable report artifacts. |
| recommended | yes | `reports/publication-status.json` | `npm run release:status` | Public npm, Zenodo DOI, GitHub release, and Pages resolution audit. |
| recommended | yes | `reports/zenodo-deposition.json` | `npm run zenodo:publish` | Authenticated-deposition result or an explicit credential-missing boundary with no fabricated DOI. |
| recommended | yes | `reports/attestation-verification.json` | `npm run release:verify-attestations` | Verified SLSA provenance and CycloneDX attestations bound to the release tarball SHA-256 and signer workflow. |
| recommended | yes | `reports/npm-pack-dry-run.json` | `npm pack --dry-run --json` | Exact npm tarball coordinate, integrity digest, size, and included-file inventory. |
| required | yes | `reports/release-readiness.json` | `npm run release:package` | Machine-readable DOI/Pages/npm/PDF/GIF release readiness manifest. |
| recommended | yes | `reports/release-one-page.pdf` | `npm run release:package` | One-page reviewer handout for release notes and external review. |
| recommended | yes | `reports/walkthrough-30s.gif` | `npm run release:package` | Thirty-second walkthrough artifact for the GitHub release and project page. |
| required | yes | `reports/memory-regression-report.md` | `npm run benchmark:memory` | Browser memory regression report for the current build. |
| required | yes | `reports/memory-baseline.json` | `npm run benchmark:memory` | Machine-readable browser memory baseline consumed by the world-class audit. |
| recommended | yes | `reports/mutation-aggregate.json` | `npm run mutation:aggregate -- reports/mutation-shards --out-dir reports --break 60 --low 70 --high 85` | Nightly sharded Stryker aggregate with total/covered mutation scores and status counts. |
| required | yes | `reports/reviewer-kit-manifest.json` | `npm run reviewer:kit` | Machine-readable checklist of the reviewer kit itself. |

## Commands To Complete The Kit

- none

