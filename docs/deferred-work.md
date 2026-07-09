# Deferred work — what is intentionally *not* done here, and why

This project gates every change on `npm run verify` (lint → strict typecheck →
module-size audit → full test suite → docs sync) and only claims a feature done
once it is test-pinned. The items below are deliberately deferred because they
need a resource this environment cannot exercise, or a decision that is the
maintainer's to make. Deferring with a clear rationale is preferred over
shipping something unverified.

The expansion work that *was* completed (canonical oscillators, escape-rate and
phonon analysis, correlation/multifractal dimensions, UPO/OGY control, the
Newton-instrumented implicit midpoint) is documented in the CHANGELOG and is
fully covered by the headless test suite.

## GPU scope that remains intentionally bounded

- **Beyond the validated planar N<=8 hybrid path.** Production WebGPU kernels
  now cover the 4D full-spectrum/CLV/variational-FTLE diagnostics and a planar
  N-chain tiled STM/QR/CLV/FTLE path. The N-chain path intentionally leaves the
  nonlinear reference trajectory and Jacobian tape in CPU f64. Moving those
  two stages to GPU, extending beyond 16 state dimensions, or adding spherical
  chains requires a new CPU-oracle promotion campaign rather than a silent
  widening of the current claim.
- **Vendor breadth.** Intel evidence is recorded. Physical NVIDIA and AMD
  runners are still required for a complete three-vendor matrix.
- **SharedArrayBuffer plot transport.** The current side-plot path uses
  transferable typed-array snapshots. A shared ring buffer is deferred until the
  app and landing deployments both ship COOP/COEP, because enabling it in source
  without those headers would create a false local-only claim.

## Needs an external toolchain or license

- **MATLAB / Julia pinning + promotion to required cross-validation gates.** The
  Julia cross-check (`npm run validate:julia`) exists as an opt-in reference. Making
  MATLAB/Julia comparisons *required* CI gates needs a pinned, reproducible toolchain
  (Julia project manifest, MATLAB license/runner) wired into the workflow — an
  infrastructure/licensing decision, not a code change verifiable here.

## Needs browser baselines or an e2e display

- **Visual-regression golden snapshots + local browser review.** Golden images are
  platform-dependent (font/AA/GPU rasterisation); baselines must be captured on the
  designated reference platform and reviewed by eye. Generating them in this
  environment would bake in machine-specific artifacts and produce flaky diffs.
- **Full Playwright e2e across all browsers.** Needs the browser binaries and a
  display/headful context; it is usage-limited here. The CI matrix is already
  configured for it — what remains is a full local cross-browser run.
- **UI exposures verifiable only by e2e.** These are interactive wirings whose
  correctness is a rendering/interaction fact, not a numerical one, so they belong
  with the browser-driven tests rather than the headless suite:
  - `EmbeddedSphericalChain` pole-free chart surfaced in the 3D-lab UI (the solver
    and its conservation guarantees are already unit-tested headlessly);
  - selectable Poincaré section conditions in the analysis UI;
  - energy-drift persistence + its UI panel;
  - adaptive-step history plot;
  - streaming sweep UI;
  - provenance-DAG SVG rendering.
  - General higher-dimensional Floquet spectrum is partly numerical (the monodromy
    machinery exists) but its *surfacing* is UI-bound; the headless spectrum can be
    added independently when prioritised.

## Needs an external account

- **npm registry publication.** The OIDC workflow, exact-version guard, package
  build, dry-run, and provenance contract are complete. npm still requires the
  owner to configure `publish-npm.yml` as the trusted publisher (or authenticate
  the first publish with an owner credential).
- **Zenodo DOI minting.** The authenticated deposition/upload/publish command and
  DOI synchronization guard are complete. A production `ZENODO_TOKEN` with
  `deposit:write` and `deposit:actions` is still required.
- **NVIDIA/AMD hardware evidence.** CI wiring exists, but physical runners cannot
  be created from source code. Missing vendor rows remain explicit in the report.

## Deferred on correctness-risk grounds

- **DOP853 dense output and SciPy-style adaptive controller parity.** The fixed
  Hairer/SciPy DOP853 8(5,3) macro-step is now implemented and test-pinned in
  `src/physics/integrators.ts`. What remains deferred is the optional
  `solve_ivp`-style adaptive controller and dense-output interpolation. That
  should be added only if the UI needs event-located DOP853 traces with exact
  replay metadata; the current browser engine already has RKF45/DoPri5 adaptive
  control and keeps SciPy DOP853 as the independent external oracle.
- **Legacy public API removal.** `legacyCompat`, `copy-legacy-assets`, and
  deprecated globals remain guarded by `npm run audit:legacy`. Removing them is a
  major-version decision because older saved pages and reviewer artifacts may
  still rely on the compatibility surface.

## Long-running gates

- **Monolithic `npm run mutation` remains too slow for ordinary PR feedback.**
  The release gate is now the sharded Nightly Mutation workflow plus
  `npm run mutation:aggregate -- reports/mutation-shards --out-dir reports --break 60 --low 70 --high 85`.
  The latest aggregate artifact is committed as `reports/mutation-aggregate.json`
  for reviewer visibility. Raising the aggregate threshold and reducing surviving
  mutants is still hardening work; the existence of the gate is no longer
  deferred.
