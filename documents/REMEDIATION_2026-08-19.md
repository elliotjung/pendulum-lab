# Pendulum Lab remediation map — 2026-08-19

This is the traceability record for the 120 findings in the supplied review.
It deliberately distinguishes code that exists in this checkout from a release
claim backed by a clean, immutable artifact.  In particular, **this document
does not claim that a public deployment, npm publication, DOI, external landing
repository, cross-browser run, or physical GPU run has happened**.

## Status key

- **Code** — the repository contains the named implementation and focused
  contract coverage.  It still has to be included in the final clean-tree
  verification run.
- **Gate** — a script/workflow rejects a release until the stated evidence is
  current and valid.  A gate is not evidence until it has actually passed for
  the release tag.
- **External** — an owner credential, a second repository, a hosted response,
  or physical hardware/browser is required; the repository fails closed rather
  than pretending this evidence exists.
- **Partial** — useful extraction/contract work exists, but the exact requested
  end-state is not yet fully represented by separate source modules.  It is
  kept visible rather than being relabelled as complete.

The paths below are deliberately stable entry points; their linked tests and
release commands are the acceptance evidence, not prose assertions.

## 1–12 — immediate failures and evidence integrity

| # | Status | Implementation / required evidence |
|---:|---|---|
| 1 | Code | `src/app/tabRouting.ts` narrows optional DOM access; `tests/shell-shortcuts.test.ts` exercises non-DOM doubles. |
| 2 | Code + Gate | Lazy replacement and preset/URL merge contracts live in `tests/shell-shortcuts.test.ts`; `npm run verify` runs the suite. |
| 3 | Code + Gate | `audienceChooser.ts` provides the first-visit modal; `e2e/audience-mode.spec.ts` verifies first visit, choice persistence, reopen-from-Home, and the actual preferences surface. |
| 4 | Gate | `npm run format:check` is in `verify`; the touched entry/test files are formatted rather than exempted. |
| 5 | Code + Gate | `src/app/LabApp.ts` and `src/app/audienceMode.ts` were separated into responsibility modules; `npm run audit:modules` now enforces the default cap with zero large-module exceptions. |
| 6 | Gate | `package.json` makes lint, typecheck, module audit, image smoke, JSON tests, successful-result test-count synchronization, validation scope, and format checks part of `npm run verify`; strict committed public-evidence verification is separately required by `npm run release:evidence:check`. |
| 7 | Code + Gate | `scripts/sync-test-counts.ts` accepts only a successful `reports/vitest-results.json` and synchronizes README/docs from it. |
| 8 | Code + Gate | `scripts/evidence-summary.ts` rejects dirty-tree refreshes and stale/mismatched provenance; evidence check rejects dirty or expired public evidence. |
| 9 | Gate + External | `scripts/product-release-manifest.ts` binds tag, tarball, lockfile, evidence, attestation, Lab and landing artifacts; it must run on the actual `v10.36.0` tag. |
| 10 | Gate | The product manifest validates the exact package version, SHA and attestation report rather than treating an older report as current. |
| 11 | Gate | `scripts/bundle-budget.ts` and release workflow rebuild/revalidate the current artifact before publication; a historical report is not accepted as proof. |
| 12 | Gate + External | `config/product-release.json`, `scripts/product-release-manifest.ts`, and the cross-repository dispatch define the two-repository contract.  The landing checkout/deployment is not present here and must supply its real commit/CTA/kernel evidence. |

## 13–35 — numerical methods and physics integrity

| # | Status | Implementation / required evidence |
|---:|---|---|
| 13 | Code | `src/physics/errors.ts` and the double-pendulum RHS return a structured singular-mass-matrix failure rather than a fake zero acceleration. |
| 14 | Code | `src/physics/linearSolve.ts` uses scale-aware pivot/matrix diagnostics; `tests/numerical-correctness-hardening.test.ts` covers tiny but conditioned systems. |
| 15 | Code | `src/physics/sphericalAutoChart.ts` promotes an embedded chart near polar singularities. |
| 16 | Code | The same atlas carries polar/embedded transforms and invariant checks around automatic transitions. |
| 17 | Code | `src/physics/implicitDiagnostics.ts`, integrator registry metadata, and Lab diagnostics expose residual, iterations, and convergence outcome. |
| 18 | Code | `src/physics/adaptive.ts` exports/replays accepted-step metadata, not only a seed. |
| 19 | Code | `src/chaos/poincare.ts` CSV export includes crossing direction and root residual. |
| 20 | Code | `src/physics/energy.ts` distinguishes dissipated-work balance from numerical energy drift. |
| 21 | Code | `src/chaos/shadowing.ts` reports a shadowing horizon and discretization band for chaotic comparison. |
| 22 | Code + Gate | `tests/public-physics-fuzz.test.ts` fixes a seeded 26-entry public-boundary inventory and fuzzes NaN/Infinity, negative mass, dimension/buffer, allocation and solver-option failures; new public kernels must join this inventory before release. |
| 23 | Code | Component-wise `atol + rtol × scale` error vectors are implemented in `src/physics/adaptive.ts`/`adaptiveController.ts`. |
| 24 | Code | A rejected minimum step terminates as `minimum-step-tolerance`; it is not silently accepted. |
| 25 | Code | Duration, step bounds, factor/safety/controller settings and maximum iterations are validated by `adaptiveController.ts`. |
| 26 | Code | Adaptive result metadata carries target-reached versus iteration-budget-exhausted termination. |
| 27 | Code | Lab/registry copy labels live fixed-step embedded operation as monitored fixed-step rather than a dishonest reject/retry adaptive run. |
| 28 | Code | `src/physics/embeddedIntegrators.ts` scopes the DOP853 estimator to the implemented error contract; unsupported completeness is not advertised. |
| 29 | Code | GBS depth/order/macro-step validation and metadata constrain when it may be described as adaptive. |
| 30 | Code | Implicit solvers retain the prior state on non-convergence, return a structured code, and surface a retry path. |
| 31 | Code | `src/physics/double.ts`/Jacobian wiring passes the analytic double-pendulum Jacobian to Newton stepping. |
| 32 | Code | `src/physics/integratorScratch.ts` pools stage arrays and is used by explicit/implicit integrator paths. |
| 33 | Code | Triple/N-chain solving uses reusable conditioned SPD workspaces and solve diagnostics in `src/physics/triple.ts` and `linearSolve.ts`. |
| 34 | Code | Accepted-step time metadata advances the display/simulation clock rather than repeated nominal-dt addition. |
| 35 | Code + Gate | `systemSpec.ts`/`types.ts` expose per-model Jacobian provenance: analytic model, forward-mode automatic differentiation for chain/triple/spherical-chain, or explicit central-difference fallback.  `public-physics-fuzz.test.ts` and derivative contracts verify the provenance; the spring fallback remains visibly caveated. |

## 36–57 — rendering, performance, and interaction

| # | Status | Implementation / required evidence |
|---:|---|---|
| 36 | Code | `src/app/CanvasResizeCoordinator.ts` owns ResizeObserver-driven backing-store updates for panel/layout/lazy-mount changes. |
| 37 | Code | `src/app/LongTaskMonitor.ts` feeds long-task count/duration into `LabQualityBudget`. |
| 38 | Code + Gate | Lifecycle/resource assertions are added to `e2e/cross-engine-resource-pressure.spec.ts`; execute them on the target browser matrix. |
| 39 | Code | Lazy-tab routing uses generation/cancellation checks so stale imports cannot mount after a newer navigation. |
| 40 | Code | `SimulationClock`/Lab diagnostics expose dropped simulation time to Trust & Diagnostics. |
| 41 | Code | Phase-space/history paths use reusable/ring-buffer storage rather than per-frame temporary collections where high frequency matters. |
| 42 | Code + Gate | WebGL loss/restoration and fallback contracts are covered by renderer/E2E checks; a production browser run remains required. |
| 43 | Code | Catch-up remainder is retained as observable simulation debt rather than discarded invisibly. |
| 44 | Code | Lab lifecycle/visibility handling pauses background work unless an explicit continuation policy applies. |
| 45 | Code | `src/app/LabHistory.ts` replaces shift/splice history maintenance with bounded ring semantics. |
| 46 | Code | `LabCanvasLifecycle.ts`, `FeatureParityLayer.ts`, and `parity/disposable.ts` centralize teardown of listeners, timers, workers, RAF and related resources. |
| 47 | Code | `MainCanvasWorkerClient` rebuilds main/side canvas and pointer wiring after OffscreenCanvas worker failure. |
| 48 | Code | `LabRenderer.ts` derives scale/pivot from chain extent and viewport aspect ratio. |
| 49 | Code | Pointer drag updates are coalesced and preserve pre-reset pause state. |
| 50 | Code | `LabQualityBudget` has degradation/recovery hysteresis instead of one-way quality loss. |
| 51 | Code | `LabRenderPolicy.ts` removes costly haze/post-process work before DPR reduction on constrained GPUs. |
| 52 | Code | `UiTaskQueue.ts` prefers `scheduler.postTask` while retaining idle/timer fallback. |
| 53 | Code | UI hardening CSS reserves Korean-content intrinsic space to reduce late scroll correction. |
| 54 | Code | `src/app/Phase3DTrailBuffer.ts` replaces object/splice trails with typed ring buffers. |
| 55 | Code | Phase3D now consumes the shared Lab quality/DPR policy rather than a divergent independent cap. |
| 56 | Code | Phase3D decorative animation respects reduced-motion. |
| 57 | Partial + Gate | Intent-oriented parity/UI extractions and lazy imports reduce responsibility coupling; `npm run build`/`npm run budget` must certify the resulting `research-ui` chunk. |

## 58–72 — accessibility, localization, and PWA

| # | Status | Implementation / required evidence |
|---:|---|---|
| 58 | Code | Workflow presenters set `aria-current="step"` for the active stage. |
| 59 | Code | `css/11-ui-hardening.css` enforces 44px rail targets under zoom/touch conditions. |
| 60 | Code | Shell/mobile-menu state changes are announced through the shared polite live region. |
| 61 | Code | `LabAccessibilityPresenter.ts` and `uiLocale.ts` extend KO/EN strings into Lab chrome, diagnostics, errors, and export surfaces. |
| 62 | Code | `public/manifest.ko.webmanifest` supplies Korean install identity, shortcuts, description and screenshot strategy. |
| 63 | Code | `LabAccessibilityPresenter.ts` synchronizes a current numerical text summary with canvas output. |
| 64 | Code + Gate | `audienceChooser.ts` implements Escape, arrows/Home/End, focus trap and restoration; the audience E2E exercises modal entry/reopen and must still run in every supported engine. |
| 65 | Code + Gate | Forced-colors/high-contrast focus and interaction CSS is included; native assistive/contrast validation remains a release matrix run. |
| 66 | Code | `LabControls.ts` renders an inline reason for invalid/out-of-range input instead of silently falling back. |
| 67 | Code | Audience-aware integrator guidance turns advanced labels into actionable beginner/student selection advice. |
| 68 | Code | `audienceModeContent.ts` explains hidden research features and the route back to them. |
| 69 | Code + Gate | Locale event propagation and localization contract tests cover chrome, aria/toast/error and download metadata consistency. |
| 70 | Code | `PwaLifecycle.ts` surfaces offline/cache freshness/update/evidence state. |
| 71 | Code | `public/sw.js` manages both entry and byte quotas with LRU metadata and storage-pressure handling. |
| 72 | Code | Both manifests expose screenshots; PWA UX includes offline capability and update-note guidance. |

## 73–88 — architecture, state, and preservation

| # | Status | Implementation / required evidence |
|---:|---|---|
| 73 | Code | The `research-workbench.ts` barrel now delegates tab UI, experiments/run log, parameter batches, design studies, and rendering to `research-workbench-{ui,experiments,parameter-study,design-study,rendering}.ts`. |
| 74 | Code | Figure export is split by artifact into `figure-export-{methods,figures,paper,notebook,provenance,zip}.ts`, with the compatibility barrel retaining its public API. |
| 75 | Code | `governance-ui.ts` delegates tab construction, panels, audit, and mode controls to `governance-{tabs,panels,audit,modes}.ts`. |
| 76 | Code | Validation UI, benchmark probes, and runtime snapshot/error rendering reside in `runtime-diagnostics-{validation,probes,renderers}.ts`. |
| 77 | Code | Schema/migration, local-cache + IndexedDB mirror/hydration, and explicit archive/workspace import-export are isolated in `storage-{schema,local-cache,import-export}.ts`. |
| 78 | Code | `shared.ts` is now a compatibility barrel over dedicated `shared-{types,state,dom,runtime,behavior}.ts` modules. |
| 79 | Code | `ExpansionLabTab.ts` retains controller ownership while worker client, UI construction, rendering, and history/persistence live in `expansionLab{Ui,Rendering,History}.ts` and `expansionWorkerClient.ts`. |
| 80 | Code | Audience policy/persistence, chooser modal, surface, navigation, localized content and styles are separated into `audienceMode*`, `audienceChooser.ts`, and `audienceNavigation.ts`. |
| 81 | Code | `ResearchMatrixTab.ts` now delegates UI construction and golden-run/matrix rendering to `researchMatrixUi.ts` and `researchMatrixRendering.ts`. |
| 82 | Code | `chaosProtocol.ts` is a compatibility boundary over `chaosProtocolSchema.ts` validation and `chaosJobHandlers.ts` execution. |
| 83 | Code | Research preset data is isolated in `expandedModels-research-presets.ts`; runners, types, factory, and Lyapunov work retain focused modules. |
| 84 | Code | The barrel `stochasticSteppers.ts` delegates additive, multiplicative, matrix-noise, and common contracts to `stochastic{Additive,Multiplicative,MatrixNoise,StepperShared}.ts`. |
| 85 | Code | GPU promotion is partitioned into contracts plus full-spectrum, CLV, and FTLE promotion modules. |
| 86 | Code | `gpuFields.ts` is a compatibility barrel over `gpuFieldContracts.ts`, `gpuFieldKernels.ts`, and `gpuFieldDispatch.ts` for WGSL, dispatch, and readback. |
| 87 | Code | `parity/disposable.ts` gives `FeatureParityLayer` an idempotent lifecycle for installers, timers and global listeners. |
| 88 | Code | `researchDb.ts` fails closed on corruption; `research-db-recovery-ui.ts` lets the user export/rebuild deliberately rather than auto-deleting research data. |

## 89–106 — security, CI, and release operations

| # | Status | Implementation / required evidence |
|---:|---|---|
| 89 | Gate + External | `.github/workflows/cloudflare-pages.yml` treats Cloudflare as an explicit credentialed mirror and refuses to claim GitHub Pages applies Cloudflare `_headers`. |
| 90 | Gate + External | The Cloudflare workflow calls `scripts/verify-deployment-security.ts --profile isolated` after deployment to prove COOP/COEP/CORP from live headers. |
| 91 | Gate + External | `verify-deployment-security.ts` checks CSP, frame protection, referrer, permissions, HSTS and isolation against the public response. |
| 92 | Code + Gate | `scripts/sbom-diff.ts`, its tests, and security workflow make lockfile/SBOM/CVE regressions reviewable. |
| 93 | Gate + External | Release workflow creates/verifies provenance and SBOM attestations for the newly packed tag tarball; an old v10.35 artifact is not accepted as v10.36 proof. |
| 94 | Gate + External | OIDC npm publish is wired in `release.yml`; npm trusted-publisher/account setup and the actual first publication remain owner-controlled external actions. |
| 95 | Gate + External | Zenodo/DOI scripts and conditional release job exist; no DOI is claimed unless the configured token publishes and syncs it. |
| 96 | Gate + External | GPU ladder/matrix scripts retain vendor evidence metadata, but NVIDIA/AMD physical-adapter validation must be captured separately. |
| 97 | Gate + External | `visual-baselines.yml` requires native Linux/Windows/macOS artifact generation; mobile/browser vendor results remain external CI evidence. |
| 98 | Gate + External | CI/test configuration provides cross-engine and mobile routes; Firefox/WebKit/mobile actual runs must be retained as release evidence. |
| 99 | Code + Gate | Cross-engine resource-pressure E2E and observable fallback metrics avoid treating Chromium-only `performance.memory` as universal; run results remain required. |
| 100 | Gate | `scripts/release-mutation-gate.ts` blocks release below 70%, stale evidence, runtime-error mutants, or missing routing coverage.  The historic 65.32% score is therefore not silently accepted. |
| 101 | Code + Gate | New lifecycle/routing/a11y contracts add branch-focused coverage; mutation/e2e evidence must demonstrate their effectiveness on release. |
| 102 | Gate + External | Release workflows build the real dist/standalone artifact and run artifact/PWA paths; live deployment execution is still required. |
| 103 | Gate + External | The product manifest fetches landing entries and follows verified CTA URLs to the required Lab route; it requires the deployed landing repository. |
| 104 | Code | `.github/actions/setup-node-project` centralizes repeated install/check setup while workflows keep minimum permissions. |
| 105 | Gate + External | The release workflow performs `build:wasm` then `check:wasm-sync` on trusted CI; local child-process limitations are not mistaken for a code failure or a successful attestation. |
| 106 | Code + Gate | Evidence/provenance and product-release manifests bind clean tree, source SHA, package version, lockfile SHA and timestamps atomically. |

## 107–120 — product, research, and education expansion

| # | Status | Implementation / required evidence |
|---:|---|---|
| 107 | Code + Gate + External | `vite.config.landing-kernel.ts` and `scripts/landing-kernel-sync.ts` build/hash the Lab-owned demo kernel; release dispatch copies it to a real landing checkout only after its own gate passes. |
| 108 | Code | `videoMarkerCapture.ts` adds permission/calibration metadata, loss/occlusion thresholding, automatic recovery and exportable capture context. |
| 109 | Code | `imuMotionCapture.ts` adds axis alignment, explicit bias calibration, jitter/rejected-event telemetry and consent/permission metadata. |
| 110 | Code + Gate + External | `gpuNChainVariational.ts` labels the current hybrid CPU-trajectory/GPU-tangent scope; CPU f64 oracle, speedup and multi-engine hardware evidence are prerequisites for promotion. |
| 111 | Code + Gate + External | `LabSidePlotSharedTransport.ts`, protocol/client, and side-plot worker implement a bounded SAB ring with handshake, sequence safety, backpressure and transferable fallback; `tests/lab-side-plot-shared-transport.test.ts` covers every payload layout.  It activates only after the live COOP/COEP isolation proof in item 90. |
| 112 | Code | GPU ladder/adapter reports now carry driver version, thermal state, estimated cost and fallback rate. |
| 113 | Code | `reports/independent-validation-scope.json`/script separates internal, SciPy and Julia evidence and explicitly marks MATLAB unavailable rather than implying it ran. |
| 114 | Code | `research/trainingProtocol.ts` supplies seed, early-stop, epoch/duration/memory/hardware budget and deterministic checkpoint contracts for training experiments. |
| 115 | Code | `cycleExpansionConvergence` exports max-period refinement and coefficient-tail convergence evidence. |
| 116 | Code | `HUYGENS_PHASE_REDUCTION_METADATA` states the phase-only scope and excludes escapement/contact mechanics. |
| 117 | Code | `friction.ts` now supplies a static-friction complementarity stick/slip solver alongside regularized laws. |
| 118 | Code | `pyragasDde.ts` adds dt-halving refinement and resolution-caveated delay-stability boundary study output. |
| 119 | Code | `autoSwitchDrivenBranch` detects eligible real Floquet crossings and initiates period-doubling/symmetry branch tracking fail-closed. |
| 120 | Code | `documents/education/` contains student instructions, teacher rubric, CSV schema/example, and uncertainty/reproducibility checklist; curriculum mapping links them. |

## Release interpretation

P0/P1 rows marked **Gate** or **External** are intentionally release blockers:
they become complete only after a clean committed tag has passed the relevant
workflow and any external source/device/service has supplied its immutable
artifact.  The **Partial** rows are deliberately retained as visible
engineering work, not counted as completed merely because a line-count ratchet
or a new helper file exists.

## Additional world-class backlog check

[`WORLD_CLASS_BACKLOG_2026-08-19.md`](WORLD_CLASS_BACKLOG_2026-08-19.md)
contains **125** newly numbered items (1–125), above the requested 100.  They
are split across seven substantive domains: governance (12), numerical methods
(23), architecture/performance (20), accessibility/localization (17),
security/privacy (17), testing/release operations (18), and
education/ecosystem/research adoption (18).  Every entry has a priority and a
falsifiable closure criterion (for example “Done when”, “Done with”, “Done on”,
or “Done only after”); it is a development backlog, not a count-only list.
