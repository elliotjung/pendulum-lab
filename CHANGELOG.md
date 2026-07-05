# Changelog

## Unreleased

### Architecture, evidence attestation, and science hardening (additive)

- **Research workbench split** (`src/app/parity/`): the 1.8k-line
  `research-workbench.ts` is now a thin facade over five focused modules -
  `research-workbench-state` (workspace profile, experiment library, run log),
  `study-batch-controller` (parameter studies + worker batches),
  `design-study-controller` (multi-variable design + refinement),
  `comparison-controller` (comparison matrix), and `research-workbench-view`
  (DOM construction and render orchestration). All existing imports keep
  working; behavior is pinned by the research-workbench e2e suite.
- **v11 API migration plan** (`docs/v11-api-migration.md`): the four
  namespaces (`core`/`analysis`/`research`/`experimental`) are the primary
  API; the flat root exports are documented as DEPRECATED, frozen aliases with
  a staged reduction schedule (compat subpath in 11.0, removal in 12.0).
  `src/lib.ts` is pinned ASCII-only and all public-surface files are guarded
  by a UTF-8/mojibake round-trip test (`tests/public-surface-encoding.test.ts`).
- **Attested evidence SHAs** (`scripts/report-metadata.ts`,
  `scripts/verify-report-shas.ts`): report metadata now carries
  `sourceSha`/`buildSha`/`attested` plus source-scoped dirtiness
  (`sourceDirty`, ignoring generated artifacts). The release workflow
  regenerates release-critical reports at the release ref and fails unless
  each attests `sourceSha === buildSha === GITHUB_SHA`.
- **Config-driven scorecard** (`scripts/worldclass-scorecard.ts`): evidence
  signals are a declarative rule registry (file / script / text / JSON-check
  kinds); adding an evidence rule is one entry. Behavior verified identical to
  the previous hard-coded checks. npm/Zenodo remain fail-closed: never
  reported complete without public registry/DOI resolution.
- **GPU evidence provenance** (`scripts/gpu-benchmark-ladder.ts`,
  `scripts/gpu-adapter-matrix.ts`, `src/runtime/gpuKernelRegistry.ts`): the
  ladder separates warmup/compile from steady-state timings, and pins WGSL
  kernel hashes, an adapter feature fingerprint, and the tolerance-table hash
  (verified on Intel hardware). The vendor matrix adds an artifact TTL,
  freshness ages, and an environment fingerprint that flags driver/browser
  drift between successive artifacts.
- **GPU result tiers** (`src/runtime/promotionContract.ts`): one classifier
  ("GPU promoted" / "GPU candidate" / "CPU fallback") documents the
  oracle-candidate-promotion-report layer contract and drives the Basin,
  Sweep, and FTLE tab badges.
- **Jacobian oracle-independence table**
  (`tests/jacobian-contract-table.test.ts`): analytic, dual-number-AD, and
  central-difference Jacobians compared pairwise on shared seeded states
  (double pendulum agrees analytic-vs-AD to 1.8e-14; FD floor ~1e-8 measured
  and documented as the driver for tighter N-chain GPU tape gates).
- **Levy areas / rough-path correction** (`src/physics/levyArea.ts`, `core`):
  packed Levy-area sampling (subdivision law pinned), grid-exact block areas,
  iterated Ito integrals, and `milsteinLevyStep` - strong order 1.0 on
  non-commutative noise (measured slope 0.90 with areas vs 0.59 without,
  51x finest-level error separation).
- **Basin-conditioned onset** (`src/chaos/basinConditionedOnset.ts`,
  `analysis`): the flagship-safe extension - drive amplitude at which a
  chosen fraction of an initial-condition region sustains chaos (finite-time
  lambda classifier, bracketed bisection that refuses unbracketed onsets).
  Measured onset 1.084 for the chaos preset, 1.064x the Melnikov A_c,
  matching the literature period-doubling accumulation.
- **Polar vs embedded chart verification**
  (`src/physics/sphericalChartComparison.ts`, `core`; 3D-lab card + e2e):
  the same spherical-chain IC integrated through both formulations with
  position-agreement and per-chart E/L_z drift reporting (regular ICs agree
  to 7.5e-9 over 5 s; chaotic divergence grows with the Lyapunov time).
- **Mutation hardening** (integrator registry, double-string, stochastic,
  RQA/Lyapunov/estimation/embedded-chain): 34 new behavior tests along the
  known survivor classes - dispatch equivalence, damping-support semantics,
  the unknown-integrator fail-closed contract (unknown ids degrade bitwise to
  the RK4 baseline, never a cheaper method), taut/slack transition
  bracketing, event-storm boundedness,
  seed reproducibility, Brownian-grid invariants, EM-vs-Milstein strong-order
  separation, and machine-precision chart roundtrips.
- **Reviewer console** (`src/reviewer/`): per-evidence TTL freshness badges,
  attested-SHA/source-run provenance (deep links), a missing-evidence filter,
  and a one-click offline evidence bundle.
- **CI**: label a PR `full-validation` to run the entire mainline validation
  lane pre-merge; all GitHub Actions bumped to their Node 24 majors
  (checkout v7, setup-node v6, setup-python v6, upload-artifact v7,
  download-artifact v8, Pages v5/v6). The module-size gate now covers
  `scripts/` and `e2e/`. The Stryker/Vitest/Vite major upgrades are tracked
  as a separate toolchain-modernization branch item in
  `docs/deferred-work.md`.

## 10.35.0 - 2026-06-19

### Certified WebGPU chaos pipeline and reviewer release (additive; suite 940 -> 1056)

The GPU acceleration claim now covers the missing chaos diagnostics without
pretending beyond the verified scope.

- **CLV WebGPU promotion** (`src/runtime/gpuChaosPromotion.ts`, `experimental`):
  a scoped 4D double-pendulum WGSL kernel records a forward QR tape and performs
  the backward triangular solve in storage-buffer compute. The public promotion
  path still computes the CPU f64 Ginelli oracle first and returns WebGPU only
  when the exponent and hyperbolicity-angle comparison passes.
- **Variational-FTLE WebGPU promotion** (`src/runtime/gpuChaosPromotion.ts`,
  `experimental`): a separate WGSL STM field kernel propagates the variational
  flow per grid cell and compares cellwise against the CPU f64 variational-STM
  oracle before promotion.
- **Hardware evidence expanded** (`e2e/webgpu-hardware-reductions.spec.ts`,
  `scripts/webgpu-hardware-validation.ts`): the self-hosted WebGPU gate now
  fails unless ensemble GPU-side reductions, full-spectrum Lyapunov, CLV, and
  variational-FTLE all report `backend=webgpu` and pass CPU-oracle comparison.
- **GPU benchmark ladder** (`scripts/gpu-benchmark-ladder.ts`): a release
  artifact records adapter metadata, f32/f64 ensemble horizon drift, reduction
  correctness, full-spectrum horizon sensitivity, and CLV/FTLE promotion
  metrics. It is wired into the WebGPU hardware workflow and release readiness
  package.
- **N-chain tiled STM/QR pipeline** (`src/runtime/gpuNChainVariational.ts`):
  planar chains up to eight links use CPU-f64 trajectory/Jacobian tapes and
  WebGPU f32 tangent propagation, QR tape, Ginelli backward solve, and FTLE
  reduction. A 3-link/6D hardware run passes the same-run CPU oracle gate.
- **Physical vendor evidence matrix** (`scripts/gpu-adapter-matrix.ts`): Intel,
  NVIDIA, and AMD evidence is collected only from labelled hardware runners.
  The release records Intel as passing and keeps unavailable vendors explicitly
  missing rather than substituting a software adapter.
- **Reviewer Console** (`reviewer.html`, `src/reviewer/`): a GitHub Pages entry
  point reads the machine-readable flagship, GPU, release, and publication
  reports and exposes their source, parameters, error, reproduce command, and
  caveat in an evidence dialog.
- **Publication and supply-chain closure**: npm trusted-publisher OIDC, exact
  version guards, SLSA/in-toto provenance, CycloneDX SBOM attestation, an
  authenticated Zenodo deposition client, DOI synchronization, and public
  registry/DOI/Pages status auditing are now release-gated workflows.
- **Paper appendix and reviewer artifacts**: the flagship PDF includes the
  certified onset table, independent Python A_PD integration/Floquet checks,
  caveat ledger, and Figure 1 hash cross-reference. The one-page reviewer PDF
  and 30-second walkthrough are regenerated with the release manifest.

Inverse-problem and uncertainty-quantification library extensions, a symmetry-breaking branch-following step, multiplicative-noise SDEs, reproducibility packaging, and build/line-ending hygiene — followed by **Neimark–Sacker torus continuation**, a **singularity-free embedded spherical-pendulum chart**, and **ensemble statistics**, then a **forward-list pass** that turns the library-only solvers into a full research toolchain: the **embedded spherical *chain*** (pole-clamp-free), the **NS-torus research instruments** (Arnold tongues, torus Lyapunov spectrum, spectral-convergence gate, SciPy cross-validation, Bifurcation-tab UI), **matrix-noise + adaptive SDE schemes**, a **structure-preservation drift profiler**, **transcritical** branch-switching surfacing, a **one-command reproduce pipeline**, expanded **mutation coverage**, and a **Research+ Lab tab** surfacing the inverse problem / PCE surrogate / SDE ensemble. All additive — the 595-test suite grows to 674 with no behavioural change to existing APIs.

### FPUT recurrence, kink collisions, trajectory derivatives, restarted Arnoldi & WebGPU spectrum gate (additive; suite 907 -> 940)

Five additive research-frontier extensions close the next verified gaps while keeping
the existing public API stable and explicit.

- **Fermi-Pasta-Ulam-Tsingou lattice** (`src/physics/fput.ts`, `core`): alpha/beta
  anharmonic chains with fixed-end normal modes, modal energy accounting, symplectic
  velocity-Verlet stepping, and a recurrence tracker. Tests pin the harmonic mode
  energy decomposition, total-energy conservation, nonlinear mode spreading, and a
  measured single-mode recurrence window.
- **Sine-Gordon kink-antikink collision helpers** (`src/physics/sineGordon.ts`,
  `core`): a neutral kink-antikink field builder plus multi-crossing kink-position
  detection, tested through topological charge conservation and collision approach.
- **Trajectory-derived Hamiltonian learning inputs** (`src/research/hamiltonianLearning.ts`,
  `research`): uniform-time phase-space samples can now be converted to centered
  finite-difference derivatives, enabling recovery from real trajectories rather than
  only analytic vector fields.
- **Restarted Arnoldi for non-symmetric operators** (`src/research/arnoldi.ts`,
  `research`): a matrix-free Krylov eigensolver companion to restarted Lanczos, tested
  against `eigenvaluesGeneral` for real spectra and dominant complex-conjugate pairs
  with direct residual checks.
- **WebGPU full-spectrum Lyapunov promotion gate** (`src/runtime/gpuLyapunov.ts`,
  `experimental`): a scoped 4D double-pendulum WGSL variational-flow kernel computes
  the full Lyapunov spectrum in f32, then promotes only after same-run comparison
  against the CPU f64 oracle. The hardware e2e now validates both GPU-side ensemble
  reductions and the full-spectrum promotion gate, while CLV and variational-FTLE
  GPU kernels remain CPU-fallback until their own hardware candidates pass the same
  contract.

### Physics & chaos expansion (additive; suite 707 → 771)

A breadth pass adding canonical nonlinear systems and analysis methods that tie the
pendulum family to MEMS / solid-state / device-reliability physics — every module
pinned against closed forms or canonical benchmarks, with no behavioural change to
existing APIs. All exposed through the `core` / `analysis` namespaces and the flat
`pendulum-lab-core` surface (public-API snapshot updated).

- **Duffing oscillator** (`src/physics/duffing.ts`): forced double-well x″+δx′+αx+βx³=γcosωt — the MEMS/NEMS-resonator archetype and the smooth bistable potential behind Kramers escape; exposes the analytic well geometry (barrier α²/4β, well/barrier curvatures). Pinned on energy conservation, the linear period, the double-well fixed points and the Ueda attractor's boundedness (`tests/duffing.test.ts`).
- **Van der Pol oscillator** (`src/physics/vanDerPol.ts`): self-sustained limit cycle (amplitude→2, period→2π as μ→0), globally attracting from inside and outside (`tests/van-der-pol.test.ts`).
- **Kapitza pendulum** (`src/physics/kapitza.ts`): dynamic stabilization of the *inverted* equilibrium by a fast vertical drive; effective potential + criterion a²Ω²>2gl validated by direct integration and the slow-envelope frequency (`tests/kapitza.test.ts`).
- **Magnetic pendulum** (`src/physics/magneticPendulum.ts`): N-magnet fractal-basin system with a settling kernel feeding the basin/Wada diagnostics (`tests/magnetic-pendulum.test.ts`).
- **Kramers escape rate + reliability MTTF** (`src/physics/kramersEscape.ts`): overdamped rate r=(ω₀ω_b/2π)·exp(−ΔU/D) + Arrhenius MTTF (EM/NBTI/HCI analog), Monte-Carlo cross-validated — activation exponent recovered tightly, prefactor to the known first-passage factor (`tests/kramers-escape.test.ts`).
- **Diatomic phonon dispersion** (`src/physics/latticeDispersion.ts`): acoustic + optical bands with a band gap (the semiconductor phonon picture; the monatomic ring already existed), pinned on the zone-centre/boundary closed forms, the monatomic-fold limit, sound speed and group velocity (`tests/lattice-dispersion.test.ts`).
- **Correlation dimension** (`src/chaos/correlationDimension.ts`): Grassberger–Procaccia D₂ + delay embedding, an independent cross-check of Kaplan–Yorke; pinned on line/square/circle and the Hénon attractor D₂≈1.22 (`tests/correlation-dimension.test.ts`).
- **Multifractal spectrum** (`src/chaos/multifractal.ts`): Rényi dimensions D_q + f(α) singularity spectrum, validated to 6 digits against the binomial-cascade closed form (`tests/multifractal.test.ts`).
- **UPO detection + OGY chaos control** (`src/chaos/chaosControl.ts`): Newton shooting for period-p orbits and Ott–Grebogi–Yorke stabilization of a saddle UPO; on Hénon the fixed point and a period-2 orbit are found to machine precision and OGY drives the orbit onto the UPO with |δa|<0.05 while the uncontrolled orbit escapes (`tests/chaos-control.test.ts`).
- **Newton-instrumented implicit midpoint** (`src/physics/implicitDiagnostics.ts`): true Newton solve with per-iteration residual history and the ∞-norm condition number of I−(dt/2)J — the convergence/conditioning diagnostic the fixed-point production stepper lacks; pinned on the exact harmonic update and the closed-form 2×2 condition number (`tests/implicit-diagnostics.test.ts`).

### Research-platform review follow-ups (additive; suite 678 → 707)

A pass over open improvement/extension/risk items: two new physics extensions, two
numerical-honesty upgrades, a data-integrity fix, a decoupling that unblocks a file
split, and supporting docs/config — every item test-pinned, with no behavioural
change to existing APIs.

- **Coupled-pendulum network — the lattice / phonon extension** (`src/physics/pendulumNetwork.ts`): N planar pendula coupled by linear torsional springs (Lagrangian `L = Σ_i[½I_iθ_i'² − m_ig l_i(1−cosθ_i)] − ½Σ_{i<j}κ_ij(θ_i−θ_j)²`), the harmonic limit of which is the discrete sine-Gordon / monatomic-lattice chain. `rhsPendulumNetwork`, `pendulumNetworkEnergy`, a small-angle `pendulumNetworkStiffnessMatrix` whose eigenvalues are the squared normal-mode frequencies, and the closed-form `ringPhononDispersion` ω²(q)=g/l+(2κ/I)(1−cosq), plus `buildCouplingMatrix`/`ringCouplingMatrix` assembly. Pinned in `tests/pendulum-network.test.ts`: N=1 reduction to the bare pendulum, RK4 energy conservation with 4th-order dt-shrinkage (and strict dissipation under damping), the two-pendulum in-phase/anti-phase modes, the ring's Fourier modes diagonalising K to the phonon dispersion, and the nonlinear RHS reproducing the small-amplitude mode frequencies. Library API (core group).
- **Stochastic resonance** (`src/physics/stochasticResonance.ts`): the canonical overdamped quartic double well under a sub-threshold periodic drive and white noise (`dx=(x−x³+A cosΩt)dt+σdW`), built on the existing seeded Langevin machinery. `stochasticResonanceResponse` measures the spectral response at the drive frequency; `stochasticResonanceCurve` sweeps the noise strength. Pinned in `tests/stochastic-resonance.test.ts`: no-noise sub-threshold motion never leaves its well, the response-vs-noise curve has an **interior maximum** (the resonance — peak ≈8× the weak-noise end), inter-well hopping rises monotonically with σ, and a fixed seed is bit-reproducible. Library API (core group).
- **Automatic-batch-length Lyapunov standard error** (`autoBatchedStandardError`, `integratedAutocorrelationTime` in `src/chaos/lyapunov.ts`): the batched-means `blockStdError` on every Lyapunov result now picks its batch length from the estimated integrated autocorrelation time (Sokal self-consistent windowing) instead of a fixed block count, so the decorrelated uncertainty adapts to how fast the local exponents mix. Pinned in `tests/auto-batched-se.test.ts` (τ≈1 for white noise, τ≫1 for AR(1), SE inflation vs the naive i.i.d. estimate for correlated data). Exported from `src/chaos/index.ts`.
- **Neimark–Sacker winding fallback at Arnold tongues** (`continueNeimarkSackerTorusRobust` in `src/chaos/arnoldTongue.ts`): where the trigonometric-collocation invariant-circle solver cannot represent a phase-locked conjugacy, the rotation number is now measured directly by orbit winding (valid mode-locked *or* quasi-periodic) and substituted, with a `rotationNumberSource` tag and a `fallbackParameters` list — turning the previously caveat-only out-of-scope case into a usable number. Pinned in `tests/ns-winding-fallback.test.ts`. Exported from `src/chaos/index.ts`.
- **Commutativity guard for matrix-noise Milstein** (`commutativityDefect` in `src/physics/noiseCommutativity.ts`): the diagnostic `max_{i,j<k}|L_j B_{i,k} − L_k B_{i,j}|` that tells whether `commutativeMilsteinStep` is actually valid for a given diffusion matrix (0 for commutative noise, > 0 otherwise — where the scheme silently drops to strong order ½ and needs Lévy-area terms). Pinned in `tests/commutativity-defect.test.ts` (decoupled-diagonal → 0; cross-coupled → the closed-form defect). Library API (core group).
- **Expansion Lyapunov profiler is now injectable** (`ExpansionLyapunovProfiler` in `src/physics/expandedModels.ts`): `runExpansionSuite` and `runResearchMatrixStudy` take an optional `lyapunovProfiler` (defaulting to `expansionLyapunovProfile`) instead of hard-calling it. This removes the runners↔profiler coupling that blocked splitting the file into factory/runners/lyapunov modules (now a mechanical follow-up — ROADMAP "Architecture"), and lets the runners be driven by a cheap stub. Pinned in `tests/expansion-lyapunov-injection.test.ts`.
- **Atomic research-archive import** (`ResearchDb.importArchive`, `src/research/researchDb.ts`): a `replace` import previously cleared each store and refilled it in separate transactions, so an interruption could leave a store cleared-but-empty (silent data loss). It now runs the whole import — every store's clear and put — inside a single transaction, so it is all-or-nothing. Pinned in `tests/research-db.test.ts`.
- **Numerical-honesty test coverage** extended (`stryker.config.json`): the chaos diagnostics `rqa.ts` and `ftle.ts` are now mutation-tested alongside `lyapunov.ts`/`melnikov.ts`.
- **Docs & CI**: `docs/device-simulation-mapping.md` gains a concrete tool-correspondence table (Sentaurus damped Newton / bias continuation ↔ `continueArclength`/`continueDrivenPeriodicOrbit`; Silvaco/COMSOL stiff time-stepping ↔ the `bdf2` TR-BDF2 stepper and embedded RK error control); the webkit-audio e2e is explicitly skipped on Windows (a documented host-audio-backend flake, not a regression); and a manual-dispatch `publish-npm.yml` documents the npm-publish path (GitHub Pages deploy already ships via `pages.yml`).

- **Embedded spherical *N*-chain — the pole-clamp removed for the whole chain** (`EmbeddedSphericalChain`, `src/physics/sphericalEmbeddedChain.ts`): the N-link generalisation of the embedded single-pendulum chart. Each link is a Cartesian unit vector u_k ∈ S² with the rod constraints enforced by N Lagrange multipliers. The key structural fact is that the kinetic metric in the embedded chart is the *constant* suffix-mass matrix A_{jk}=l_j l_k S_{max(j,k)} — there are **no configuration-dependent Coriolis/Christoffel terms**, and the per-step multiplier system G λ = c has G = B∘U (the SPD inverse-metric Hadamard-multiplied by the unit-diagonal Gram matrix of the link directions), which is **positive-definite for *every* configuration by the Schur product theorem**. So unlike the polar chain there is no singular solve and no pole clamp anywhere. Pinned in `tests/spherical-embedded-chain.test.ts`: exact reduction to `EmbeddedSphericalPendulum` at N=1 (RHS + ~7e-10 trajectory), polar-chain agreement to ~1.8e-7 away from the poles, E/L_z conservation to ~1e-5 through a near-pole passage where the clamped polar chain drifts >10× more, 4th-order drift shrinkage, and a positive-definite multiplier matrix at a link *on* the pole. Mutation-tested at 79.2%. Exported from `src/lib.ts`; library API (core group).
- **Neimark–Sacker torus → research instruments** (`src/chaos/arnoldTongue.ts`, `src/chaos/torusAnalysis.ts`): three follow-ons turn the invariant-circle solver into analysis. (1) **Arnold tongues / phase-locking** — the rotation number is measured directly by lift/orbit winding (valid mode-locked *or* quasi-periodic, where the collocation solver is not), so the parameters the solver declares out of scope become a detectable feature; pinned on the sine circle map (ρ=Ω at K=0; the 1/2 tongue located at K=1; a monotone devil's staircase) and cross-checked against the delayed-logistic ρ→1/6. (2) **Lyapunov spectrum on the torus** (`torusLyapunovSpectrum`) — a Benettin/QR spectrum whose largest exponent is ≈0 on a quasi-periodic torus (a self-consistency gate mirroring the Hamiltonian-spectrum check): pure rotation gives two ≈0 exponents, the delayed-logistic torus gives [≈0, −0.021] and a `quasi-periodic-torus` verdict. (3) **Spectral-convergence gate** (`neimarkSackerSpectralConvergence`) — ln(residual) is linear in the collocation count M (geometric/spectral), beating an algebraic fit, with a >6·10⁵× drop over M=9→33. `tests/torus-analysis.test.ts`; CLI `arnold` / `toruslyap` / `nsconv`.
- **NS rotation-number cross-validation against SciPy** (`npm run validate:ns`, `scripts/scipy_neimark_sacker.py`, `scripts/ns-cross-validate.ts`): the delayed-logistic ρ(a) is reproduced in an independent NumPy reference (analytic Jacobian eigenvalues at onset *and* raw-map orbit winding). The engine's winding ρ matches SciPy's to ~1e-7 and the warm-started collocation ρ to ~1e-3, all → 1/6 at a=2. Extends the SciPy/SymPy cross-checks from the ODE engine to the map/bifurcation toolbox. Report: `reports/ns-cross-validation.md`.
- **Matrix-noise + adaptive SDE schemes** (`src/physics/stochastic.ts`): `stochasticHeunStratonovichStep` (Stratonovich predictor–corrector) and `commutativeMilsteinStep` (strong-order-1 commutative-noise) are now wired into `runLangevinEnsemble` (a `matrixNoise` path), and **adaptive step-size integration** (`runAdaptiveLangevinPath`) runs over a frozen dyadic `buildBrownianGrid` so step doubling refines on a consistent Wiener path. Validated by exact σ=0 reduction to an adaptive Euler ODE, grid-seed reproducibility, pathwise convergence to the all-fine Milstein solution, and the GBM/Brownian ensemble moments under the matrix schemes (`tests/stochastic.test.ts`).
- **Structure-preservation drift profiler** (`energyDriftProfile`, `src/research/structurePreservation.ts`): integrates a conservative system for thousands of periods and classifies the relative-energy drift as *secular* (high-R² monotone trend) or *bounded* (oscillation). On the planar double pendulum (~1000 periods) **rk4 drifts secularly** (R²=0.99999) while the time-symmetric **gauss2 stays bounded** (R²≈0.19, ≲7·10⁻⁸) — the structure-preserving signature, the long-time analogue of the `empiricalOrder` certification. The same `method` selection is exposed on the chain integrators. `tests/structure-preservation.test.ts`; CLI `drift`.
- **Transcritical branch-switching surfacing**: `switchTranscriticalBranch` (already implemented) is now exercised end-to-end on the headless CLI (`research -- transcritical`) on the normal form r(x,λ)=λx−x², completing every codim-1 branch-following case (−1 period-doubling, +1 pitchfork, +1 transcritical, NS torus).
- **One-command reproduction** (`npm run reproduce`, `scripts/reproduce-all.ts`): recomputes every headline research result deterministically from the library and writes a single hash-stamped manifest (`reports/reproduce/manifest.json` + `REPRODUCE.md`), with the browser/external one-liners (`paper:build`, `notebook`, `validate:*`) listed alongside.
- **Mutation coverage** extended (`stryker.config.json`): the new modules (`sphericalEmbeddedChain`, `stochastic`, `arnoldTongue`, `torusAnalysis`, `structurePreservation`) are now mutated; a scoped run on the embedded chain scored 79.2% (505 killed / 97 survived / 0 errors).
- **UI — NS invariant circle in the Bifurcation tab** (`src/app/BifurcationTab.ts`, `app.html`): a "Neimark–Sacker invariant circle" accordion traces the delayed-logistic curve family from a=2.05 toward onset and draws the shrinking circles on canvas (ρ→1/6). Cross-browser e2e in `e2e/modern-bifurcation-tab.spec.ts`.
- **UI — Research+ tab** (`src/app/ResearchPlusTab.ts`, `app.html`, `src/app/index.ts`): a new Lab tab surfaces three previously library/CLI-only solvers — a **stochastic ensemble** (log-variance plot), the **inverse problem** (recovers g≈9.81 with its standard error), and the **PCE surrogate** (analytic Sobol indices summing to ≈1 for an additive response). Cross-browser e2e in `e2e/modern-research-plus.spec.ts`.

- **Neimark–Sacker invariant-torus continuation** (`continueNeimarkSackerTorus`, `src/chaos/neimarkSacker.ts`): the previously-deferred hard case. The invariant closed curve born at an NS bifurcation of a 2D stroboscopic map is computed by **trigonometric collocation** of the invariance equation F(u(θ)) = u(θ + 2πρ) — damped Newton on the M curve samples *and* the rotation number ρ together, with an exact Dirichlet-kernel rotation operator (the rotation operator is linear in the samples for fixed ρ) and a Poincaré phase condition removing the rotational gauge — seeded as the critical-eigenspace ellipse and continued in the parameter. Validated three independent ways in `tests/neimark-sacker-torus.test.ts`: (1) a pure planar rotation, where every circle is exactly invariant with ρ = α/2π (machine precision); (2) the textbook **delayed-logistic map** x_{n+1}=a·x_n(1−x_{n−1}), NS onset at a = 2, where the continuation finds ρ → 1/6 and amplitude → 0 monotonically toward onset with off-grid invariance error ≤ 3e-8; and (3) an **independent re-iteration check** — iterating the *raw* map from a point on the computed curve keeps the orbit on the curve (drift/amplitude ≈ 0.5%). The reported `invarianceResidual` is sampled *between* collocation nodes, so it is a genuine truncation error, not the Newton residual driven to zero. Exported from `src/chaos/index.ts`; library API (analysis group).
- **Embedded (singularity-free) spherical pendulum** (`EmbeddedSphericalPendulum`, `src/physics/sphericalEmbedded.ts`): the S² atlas's ambient chart. Instead of polar (θ, φ) — singular at the poles, where φ̈ = −2cotθ·θ̇·φ̇ forces the |sinθ| ≥ ε clamp — the bob direction is carried as a Cartesian unit vector u with the rod reaction ü = −(g/l)ŷ + [(g/l)(u·ŷ) − |u̇|²]u − γu̇ and a per-step projection onto S². Globally regular: it agrees with the validated polar chart to ~2e-10 away from the poles, and through a near-pole passage (minθ ≈ 7e-3) conserves E and L_z to ~1e-11 while the clamped polar chart loses ~30% of the energy (or diverges to NaN). Pinned in `tests/spherical-embedded.test.ts` (round-trip conversions, the u·ü = −|u̇|² constraint identity, away-from-pole equivalence, the pole-passage conservation gap, and damped dissipation). Exported from `src/lib.ts`; library API (core group).
- **Ensemble statistics** (`ensembleStatistics`, `src/runtime/gpuEnsemble.ts`): the reduction layer a basin / uncertainty-cloud study consumes — ensemble mean, full 4×4 covariance, dispersion radius √trace(Σ) and flip fraction (|θ₁| > π), via single-pass Welford for numerical stability over large clouds. The WebGPU/CPU ensemble integrator now feeds it directly. Pinned in `tests/ensemble-statistics.test.ts` on a hand-computable pair, cross-checked against a naive two-pass covariance over 50 trajectories, and exercised on a real CPU-fallback ensemble (mean finite, covariance symmetric, √trace identity). Exported from `src/lib.ts`; library API.

- **Parameter estimation — the inverse problem** (`src/research/parameterEstimation.ts`): a Levenberg–Marquardt least-squares solver (Marquardt diagonal scaling, forward-difference Jacobian, projected bound handling) plus a double-pendulum specialisation `fitDoublePendulum` that recovers physical parameters (masses, lengths, g) from an observed angle trajectory by re-integrating the platform's own `rhsDouble` in the fit loop. This inverts the otherwise forward-only engine — the same *parameter-extraction* habit device/TCAD work depends on. The fit reports **uncertainty**: degrees of freedom, residual variance s², the parameter covariance s²·(JᵀJ)⁻¹, standard errors, and the correlation matrix. Pinned in `tests/parameter-estimation.test.ts`: exact recovery of linear- and exponential-model coefficients, single- and two-parameter recovery of (g, l₂) from synthetic double-pendulum data to ≤1e-3, the textbook standard-error-of-the-mean closed form, a Monte-Carlo check that the reported SEs match the empirical scatter of a linear fit (Gauss–Markov-exact), graceful behaviour under observation noise, and an under-determined guard. Library API (research group); short horizons are recommended since the chaotic forward map is ill-conditioned over long windows.
- **Stochastic (Langevin) dynamics** (`src/physics/stochastic.ts`): additive- *and* multiplicative-noise SDE support — a seeded Box–Muller `gaussianSampler`, `eulerMaruyamaStep` (strong order ½), `milsteinStep` (strong order 1, with the ½·b·b′ correction that vanishes to recover EM exactly for additive noise), and `runLangevinEnsemble` (scheme- and noise-selectable) which accumulates ensemble mean/variance with Welford online moments (O(samples) memory, not O(realisations)). Validated against closed forms in `tests/stochastic.test.ts`: free Brownian motion variance σ²t, the Ornstein–Uhlenbeck mean decay and stationary variance σ²/2θ, the **Geometric Brownian Motion** moments E=x₀e^{μt} / Var=x₀²e^{2μt}(e^{σ²t}−1) under multiplicative Milstein, exact (bit-identical) reduction to Euler–Maruyama for additive noise, deterministic-Euler reduction at σ=0, and bit-for-bit reproducibility per seed. Library API (core group); deterministic given a seed.
- **Polynomial-chaos surrogate** (`src/research/surrogate.ts`): regression PCE on an orthonormal Legendre basis (total-degree multi-index set) that emulates an expensive scalar model *and* yields the full Sobol decomposition analytically from its spectral coefficients — no extra model runs, complementing the sampling-based `sobolSensitivity`. Pinned in `tests/surrogate.test.ts`: exact reproduction of a degree-2 polynomial with closed-form mean/variance/Sobol checks (S₁=4/9, S_T1=1, S_T2=5/9), additive-model index splitting, a smooth-function (exp) approximation at R²>0.99999, and an under-determined guard. Library API (research group).
- **Symmetry-breaking pitchfork branch following** (`switchSymmetryBreaking`, `src/chaos/branchSwitching.ts`): the previously-deferred **+1** crossing case (the docs listed only −1 period-doubling as implemented). When the Z₂-symmetric driven-pendulum period-1 orbit loses stability via a real multiplier through +1 (near A ≈ 1.005, *before* the period-doubling), two mirror-image asymmetric period-1 orbits branch off. The routine seeds Newton along the critical +1 eigenvector in both directions, clusters the converged stable orbits, and returns the straddling pair — confirming the pitchfork only when the pair's **midpoint coincides with the symmetric orbit** (`pitchforkResidual`), a falsifiable Z₂ signature rather than an assumption. Pinned in `tests/branch-switching.test.ts`: the two stable distinct period-1 branches and the midpoint signature at the continuation-detected onset, plus a no-false-positive check on a stable symmetric orbit. Library API (analysis group). Neimark–Sacker torus continuation remains future.
- **UI surfacing — Floquet & pitchfork in the Bifurcation tab** (`src/app/BifurcationTab.ts`, `app.html`): a new "Driven Orbit: Floquet & Pitchfork" accordion adds two analyses to the existing tab — *Floquet @ A* (traces the symmetric driven-pendulum branch from A = 0.7 to the chosen amplitude and reports the period-1 orbit's Floquet multipliers + stability) and *Find pitchfork* (locates the +1 crossing by continuation and follows the two mirror-image branches, displaying the midpoint Z₂ residual). Both run on the main thread behind a single-flight guard with a paint-yield so the "computing…" status shows. Verified by cross-browser e2e (chromium/firefox/webkit) in `e2e/modern-bifurcation-tab.spec.ts`; the inline-style CSP regression this surfaced was fixed by moving to the existing `.plx-log` class (the app ships CSP without `unsafe-inline`). The standalone `index.html` artifact picks this up on the next `npm run build:standalone`.
- **Headless CLI surfacing** (`scripts/research-cli.ts`): the three new capabilities are exposed through the documented `npm run research -- <cmd>` interface — `estimate` (synthesises a trajectory from `--m1/--g/…` truth and recovers the `--estimate` subset, reporting standard errors), `pitchfork` (continues to the +1 crossing and follows the symmetry-breaking pair), and `sde` (a Langevin ensemble of the double pendulum with selectable `--scheme euler-maruyama|milstein`). Each runs in Node with no browser; verified end-to-end (e.g. `estimate --estimate g,l2 --guess 8,0.8` recovers g=9.81, l₂=1.0 to ~1e-15).
- **Reproducible validation environment**: pinned `requirements.txt` (numpy/scipy/sympy) and a `Dockerfile` bundling Node + Python so the external SciPy/SymPy cross-checks (README claims 2–3) reproduce from a clean container on any machine, plus `docs/reproducibility.md` documenting both the local-venv and Docker paths. Closes the "works only if you happen to have the right SciPy" gap in the claims table.
- **Build/line-ending hygiene**: the standalone build now emits hash-free worker filenames (`chaos.worker.js` / `expansion.worker.js`) via `vite.config.standalone.ts`, so the git-tracked worker artifact no longer changes name on every rebuild (which orphaned the old file and risked an `index.html` pointing at an untracked worker). A new `.gitattributes` pins LF line endings for source, ending the whole-file CRLF↔LF churn on Windows checkouts.

## 10.34.0 - 2026-06-15

Research-grade Lyapunov spectrum for the Expansion Lab, an application-wide build split, and a first-run mode-selection screen.

- **True variational/QR Lyapunov spectrum for the expansion models** (`expansionLyapunovProfile` in `src/physics/expandedModels.ts`): the Expansion Lab and Research Matrix previously summarised chaos with a single-perturbation *ghost divergence* whose "secondary" exponent was a fabricated placeholder (`-leading/(dim-1)` for conservative models, `-|leading|·0.35` otherwise). That timeline is replaced by the standard Benettin–Shimada–Nagashima / Wolf algorithm — the model is integrated together with a full orthonormal frame of deviation vectors under the variational equation `v' = J(x)·v`, with Gram–Schmidt reorthonormalisation at a fixed cadence — so **every** exponent is a genuine finite-time Lyapunov exponent. The driven pendulum and the planar N-link chain use their **exact analytic Jacobian** (closed form / `jacobians.ts` autodiff), removing the finite-difference floor; the other models use an O(h²) central-difference Jacobian. Each exponent carries a **block-bootstrap standard error**, and the whole spectrum is checked for **Hamiltonian self-consistency** (`analyzeSpectrumConsistency`: Σλ ≈ 0, symplectic pairing) with a `symplectic ✓ / pairing ✗` verdict — a free, independent validation of the tangent-space pipeline. The result carries the descending spectrum, per-exponent SE, Σλ, Kaplan–Yorke dimension, leading exponent, the consistency verdict, and a running (λ₁, λ₂) timeline that converges onto the first two exponents. Pinned in `tests/expansion-lyapunov.test.ts`: a positive leading exponent and a ~zero, symplectically paired spectrum for the chaotic Hamiltonian N-link chain; the conserved sum for coupled pendulums; the timeline tracking the real first two exponents rather than the retired ratio; and the exact-Jacobian spectrum agreeing with central differences. Surfaced as a "Lyapunov spectrum (variational/QR)" readout (spectrum, λ₁ ± SE, Σλ, D_KY, consistency badge, Jacobian type) in the Expansion Lab and a full-spectrum row in the Research Matrix; the ghost-divergence figure remains as an honest single-perturbation illustration. The shared tangent-space machinery (`makeVariationalRhs`, Gram–Schmidt, seed frame) and the spectrum self-consistency check moved to `src/physics/` (re-exported from `src/chaos/`) since they depend only on the physics primitives.
- **Expansion-family jobs run off the UI thread**: the Research Matrix study and the Golden Center sweep — which together run dozens of integrator suites plus the variational spectrum — previously executed synchronously on the main thread (only a `setTimeout(0)` yield), freezing the simulation for seconds. A single discriminated worker protocol (`src/workers/expansionJobProtocol.ts`, pure dispatcher `runExpansionJob`) now backs all three Expansion tabs through a shared `expansionWorkerClient` (worker + transparent main-thread fallback, like `ChaosClient`), so the model suite, the matrix study, and the golden sweep all run on the dedicated worker. The hand-rolled worker lifecycle inside the Expansion Lab tab is replaced by the shared client. `tests/expansion-job-protocol.test.ts` covers the dispatcher.
- **Application build code-split** (`vite.config.ts` `manualChunks`): the production build emitted one ~520 kB application chunk, over Vite's 500 kB warning threshold. It is now split on subsystem boundaries — `physics`, `chaos`, `research`, and the `app-tabs` UI — so the largest chunk is ~370 kB, the browser parses the layers in parallel, and caching is per-subsystem. The warning is gone (and not merely suppressed). The standalone single-file build inlines everything and is unaffected.
- **First-run mode-selection screen**: the Beginner / Student / Research workspace chooser is now a full-screen welcome screen (dimmed backdrop, centred card, keyboard-focusable choices, Escape to keep the default) shown the first time `index.html` is opened, instead of a corner panel. The choice persists and is changeable any time from the sidebar Mode selector. The E2E suite seeds a returning-visitor mode by default (`playwright.config.ts`) so the screen is exercised by its own spec without covering the UI in every other test.

## 10.33.0 - 2026-06-13

Completes the partially-implemented research extensions: global sensitivity, automatic conserved-quantity detection, LCS visualisation, the Melnikov overlay, a six-module 3D-lab decomposition, full spectrum / energy-shell chain analyses, and WebGPU-accelerated field scans with a CPU cross-validation contract.

- **Sobol global sensitivity** (`src/research/sobolSensitivity.ts`): variance-based first-order (S_i, Saltelli-2010) and total (S_Ti, Jansen-1999) indices via the Saltelli radial sampling scheme on a joint Sobol stream, cost N·(d+2). Pinned against the analytic additive-linear and Ishigami benchmarks (`tests/sobol-sensitivity.test.ts`), including the signature S₃≈0 with S_T3>0 interaction case. Surfaced as the "Sobol Sensitivity" superpack panel (λ_max over the (A, γ) box), complementing the per-study local |Δλ/Δp| slope.
- **Noether conserved-quantity detection** (`src/physics/conservedQuantities.ts`): for the planar and spherical N-chains, each candidate symmetry (time translation → energy; vertical/horizontal rotations → angular momentum) is tested two independent ways — central-difference invariance of the Hamiltonian under the group action, and momentum drift along an RK4 trajectory — and the two verdicts are cross-checked (the numerical Noether statement). With gravity only the vertical rotation survives; at g → 0 the full rotation group appears; damping breaks every charge. `tests/conserved-quantities.test.ts`. New 3D-lab "Detect Conserved Quantities" button.
- **FTLE → LCS ridge overlay**: the FTLE tab now overlays the extracted ridge cells (repelling Lagrangian Coherent Structures) on the σ_T heatmap with a toggle and a ridge-cell readout — the field and its transport barriers in one figure.
- **Codim-2 Melnikov overlay**: the (A, γ) regime map draws the first-order Melnikov threshold curve A_c(γ) on top of the measured λ-sign map, so the analytic homoclinic-tangle prediction and the numerical chaos boundary are compared directly.
- **3D-lab six-module decomposition**: `parity/lab3d.ts` (former ~1,100-line module) is now a thin orchestrator over `lab3d-render-loop.ts` (shared state, frame loop, timing card), `lab3d-rope-ui.ts`, `lab3d-double-string-ui.ts`, `lab3d-spherical-chain-ui.ts`, `lab3d-diagnostics.ts`, and `lab3d-exports.ts`, joining the existing `lab3d-chain-config/timing/utils` leaves. The frame loop fans a single timing quantum out to registered per-card hooks; demo (wall-clock) vs research (deterministic) timing is unchanged. Public surface re-exported from `lab3d.ts` for compatibility.
- **Spherical-chain analysis UI**: new buttons for the full Lyapunov spectrum (all 4N exponents + Kaplan–Yorke dimension + the Hamiltonian self-consistency gate Σλ≈0 / symplectic pairing) and an energy-shell monitor that integrates a fresh trajectory and plots the relative E(t) and L_vert(t) drift (the visible proof the conservative flow stays on its invariant shell).
- **WebGPU-accelerated field scans** (`src/runtime/gpuFields.ts`): flip-basin labels, sweep λ_max grids (two-trajectory Benettin), and finite-difference FTLE fields run as WebGPU f32 compute kernels through a shared `runComputeKernel`, with an algorithm-identical f64 CPU fallback. **CPU cross-validation contract**: every GPU run recomputes a probe subset on the CPU with the same algorithm; if it exceeds tolerance the full grid is recomputed on the CPU and that result is returned — the GPU is an accelerator, never an oracle. Results carry a `backend` tag and a separate validated/caveat credibility badge. Opt-in toggles on the Sweep, Basin, and FTLE tabs. `tests/gpu-fields.test.ts` (CPU path) and `tests/gpu-fields-validation.test.ts` (a faithful mocked-WebGPU device exercising the accept and fallback branches in CI without hardware).

## 10.32.0 - 2026-06-12

Physics-core exactness pass: machine-precision Jacobians via forward-mode autodiff, one shared event locator for every hybrid transition, a hardened linear solver with honest failure diagnostics, and a tiered CI pipeline.

- **Exact analytic Jacobians by autodiff** (`src/physics/autodiff.ts` + `src/physics/jacobians.ts`): the planar N-chain and spherical N-chain mass-matrix/force assemblies are re-expressed in multi-directional dual-number arithmetic (allocation-free `DualArena` pooling), and the mass-matrix solve is differentiated analytically via dy'/dy = M^-1(df/dy - (dM/dy)*q") with one Cholesky factorisation reused across all columns. The result is the machine-precision tangent of the *implemented* RHS, including the spherical pole-chart clamp - removing the ~1e-7 finite-difference floor from the Lyapunov/variational pipeline for every chain system (previously only the closed-form double had this). `jacobianDriven` covers the driven pendulum. Pinned against `jacobianDouble` (closed form) and central differences over random states (`tests/autodiff-jacobians.test.ts`).
- **Jacobians wired through the stack**: `buildJacobian(spec)` now returns exact Jacobians for `chain`, `spherical-chain`, and `driven` specs (workspace-cached per closure), so worker jobs (Lyapunov spectrum, CLV, SALI/FLI) and the implicit steppers benefit automatically. TR-BDF2 / implicit steppers accept an optional exact `jacobian` (quadratic Newton convergence; falls back to the central-difference Jacobian otherwise).
- **Shared event locator** (`src/physics/eventLocator.ts`): one guarded secant/bisection bracket refiner (Dekker-style guard, superlinear on smooth event functions, never slower than bisection) now serves Poincare section crossings (`events.ts`), the rope pendulum's taut/slack transitions, and the double-string slack/capture events - replacing three hand-rolled root finders with identical tolerance semantics. Rope/string events now carry the refined event time and an explicit `residual` field; grazing contacts are handled deliberately. Poincare refinement gains a Dormand-Prince 5(4) dense-output back-end alongside RK4 prefix re-advancing (`tests/dense-output-events.test.ts`).
- **Linear solver hardening** (`src/physics/linearSolve.ts`): new `choleskyFactor`/`choleskySolveFactored` fast path for SPD mass matrices with pivoted-GE fallback; failure diagnostics now include min/max pivot magnitude, matrix/RHS scales, optional ||Ax-b|| residual, and a `not-positive-definite` reason; `fallbackPolicy: 'throw'` (`assertLinearSolve`) lets callers fail loudly at the solve site instead of propagating NaNs. The solver never invents a fallback solution.
- **Centralised numerical policy** (`src/physics/constants.ts`): every cross-module threshold (mass-matrix singularity, pole-chart clamps, FD epsilon, implicit-solve tolerance) lives in one documented place, values unchanged. `DampingConvention` type + `dampingConventionFor(kind)` makes the force-level vs rate-level damping split explicit and queryable (surfaced so cross-system gamma comparisons are never silently misinterpreted).
- **3D Lab decomposition continued**: pure logic extracted from `parity/lab3d.ts` into `lab3d-chain-config.ts` (N-link parameter-list parsing/validation), `lab3d-timing.ts` (frame-time accumulator), and `lab3d-utils.ts`, each with direct unit tests.
- **Tiered CI**: the single workflow is split into `ci.yml` (fast PR verify: lint + typecheck + units + coverage ratchet + builds + budget + Chromium smoke), `main.yml` (mainline full validation: full e2e matrix, SciPy/SymPy/literature cross-validation, Julia reference, Windows/macOS smoke), `nightly.yml` (weekly Stryker mutation run with report artifact), and `release.yml` (tagged release artifacts: dist + standalone + lib + API docs + scorecard).
- **Coverage-scope guard** (`npm run coverage:scope`, part of `test:coverage`): fails CI when a newly added `src/` file is missing from the v8 coverage map (the silent blind spot of `all:false`), against a checked-in baseline (`config/coverage-scope-baseline.json`).
- **API stability policy** (`docs/api-overview.md`): stability badges (stable/experimental/compatibility), the SemVer policy, and a deprecation timeline with migration targets and earliest-removal versions for every deprecated surface.

## 10.31.0 - 2026-06-12

Architecture decomposition, research-stack integration for the 3D systems, validation hardening, credibility badges, and supply-chain-grade exports.

- **FeatureParityLayer decomposed**: the 6,037-line monolith is now six real modules under `src/app/parity/` (research-workbench, storage-sync, figure-export, runtime-diagnostics, lab3d, governance-ui) plus a leaf `shared`; `FeatureParityLayer.ts` is a thin install orchestrator. `main.ts` boots in five documented stages (core runtime -> safety -> simulation -> research -> shell).
- **API surfaces**: globals split into public `window.PendulumLab` and debug `window.PendulumLabDebug` (old names kept as deprecated aliases); `src/lib.ts` reorganised into `core` / `analysis` / `research` / `experimental` namespace groups with the flat surface preserved.
- **DomBinder/TabController layer**: all 12 analysis tabs and LabApp reach the DOM exclusively through a typed binder (idempotent install, single-flight run guard); duplicated `num`/`str`/spec readers removed.
- **Spherical N-chain in the research stack**: new `spherical-chain` and `double-string` SystemSpec kinds flow through `buildRhs`/`energyForSpec` into every spec-generic worker job (Lyapunov max/spectrum, RQA, 0-1, CLV, studyPoint). 3D Lab chain card: N = 1..5, per-link theta/phi lists + mass/length lists, integrator selection (RK4/DoPri5/GBS/Gauss2/Yoshida4) with dt/tolerance, worker lambda/RQA/FTLE analysis, trajectory CSV + PNG/JSON snapshot exports with reproducibility hashes, live pole-chart-limit warnings. Double string promoted to first-class: presets for the qualitative regimes, `doubleStringTautFraction` validity probe gating taut-branch analyses, CSV/snapshot exports.
- **Performance**: allocation-free hot paths - chain workspace reuse in spec closures, flat per-link frame buffers in the spherical RHS, module-reused tension scratch in the string system.
- **Validation hardening**: mass-matrix symmetry + Cholesky positive-definiteness over seeded random states (planar N=4/6, spherical N=3), measured RK4 dt-halving order on both chains, seeded conservation/dissipation property tests, an in-test analytic normal-mode external reference (1% agreement), and explicit pole-chart contracts (planar Lz=0 passages at machine precision; Lz!=0 grazes fail loudly). Lab Poincare crossings are now event-refined (RK4 sub-step + secant root-find) instead of linearly interpolated; 3D sphere section crossings interpolated. `depthSortIndices` painter ordering with golden projection tests (the previous inline bob sort was inverted).
- **UX**: Beginner/Student/Research audience modes (rail footer, persisted); five-level result-credibility badges (visual-only / finite-time estimate / validated / publication-ready / caveat) stamped on every analysis tab, the validation tab, 3D analyses, and exports. Rail submenus auto-close when the pointer leaves (shipped into the standalone page; e2e covered).
- **Security & integrity**: CSP drops `style-src 'unsafe-inline'` (inline markup styles extracted to generated classes; dynamic CSS via Constructable Stylesheets); ZIP bundle checksums upgraded to v2 with cryptographic SHA-256 per file.
- **Quality gates**: per-directory coverage ratchet (`npm run test:coverage`), bundle budget gate (`npm run budget`), Stryker mutation testing on the numerical core (`npm run mutation`, weekly CI job), and Windows/macOS Chromium smoke jobs in CI.
- **Docs**: README compressed to a claims-first layout with a 10-row per-claim reproduction table (equation, parameters, command, evidence JSON, caveat); new `docs/derivations.md`, `docs/tutorial-reproduce-paper.md`, `docs/schema-migrations.md` (policy + archive compatibility matrix), `docs/portfolio-korean.md`.

## 10.30.0 - 2026-06-11

Research output tier: a reproducible mini-paper with a new measured result, a symbolic second reference, and the spherical double/triple pendulum (full 3D chain physics).

- **Mini research paper** (`paper/index.html` + `paper/paper.pdf`, regenerated by `npm run paper:study && npm run paper:build`): *"Measuring the gap between the Melnikov threshold and the period-doubling cascade in the damped driven pendulum."* For γ ∈ [0.1, 0.8] (ω = 2/3) the period-doubling onset A_PD of the primary attractor is measured by an attractor-strobed warm-started march + bisection, then refined with the Floquet multiplier of a Newton periodic orbit *seeded from the physical attractor* (onset interpolated at ρ = −1; only verified ρ → −1 crossings are accepted). Results: A_PD/A_c falls monotonically from 2.38 (γ = 0.1) to 0.987 (γ = 0.8) and the textbook ordering A_c < A_PD **reverses near γ ≈ 0.69**; at γ = 0.5 the measured A_PD = 1.06637 agrees with Baker & Gollub's 1.0663 to four digits; dt-halving moves the onset by ~7e-13. Corroborated by the 0–1 test on strobe series below/above each onset; includes a 220-step strobe bifurcation diagram at γ = 0.5 and an honest multistability caveat for the lowest dampings (a basin-capture transition observed below the doubling at γ = 0.15). Data: `reports/paper-study.json`; every number in the paper text is injected from the JSON.
- **SymPy symbolic second reference** (`npm run validate:sympy`, also a CI step): `scripts/sympy_reference.py` writes each Lagrangian symbolically and produces the Euler–Lagrange equations by symbolic differentiation alone (mass matrix ∂²L/∂q̇ᵢ∂q̇ⱼ, forces from ∂²L/∂q̇ᵢ∂qⱼ·q̇ⱼ − ∂L/∂qᵢ, solved per state with numpy). The engine RHS is compared **component-wise at 40 random states per system** — no integrator tolerance floor, so any disagreement is a derivation bug. Covered: planar double, planar triple, spherical double, spherical triple. Measured max relative deviation ≈ 1e-14 (float64 round-off) for all four. Report: `reports/sympy-validation.{md,json}`.
- **Spherical N-chain physics** (`src/physics/sphericalChain.ts`): the true 3D double/triple pendulum — N ball-jointed rigid links, coordinates (θ_k, φ_k), equations assembled in manipulator form (M = Σ mᵢ JᵢᵀJᵢ, Coriolis from Jᵀ(J̇q̇)) with *closed-form* Jacobian columns and their time derivatives (no finite differences, no hand-expanded Christoffel symbols). Pinned four ways: reduces exactly to `sphericalRhs` at N = 1 (with damping), reduces to the planar `rhsChain`/`rhsDouble` for in-plane motion (≤1e-9, and azimuthal accelerations vanish identically), conserves E and L_z in fully 3D chaotic motion with verified 4th-order drift shrinkage under dt-halving, and matches the SymPy derivation to ~1e-14. Chart regularised near the poles (|sinθ| < 1e-6). Exported from `src/lib.ts`; 8 unit tests (`tests/spherical-chain.test.ts`).
- **3D Lab: Spherical Double Pendulum card** (Govern → 3D Lab): both bobs rendered through an orbit camera with depth-faded trails and the outer-reach envelope sphere, live E and L_z drift readouts, θ/φ̇ initial conditions, m₂/l₁/l₂/g/γ controls; E2E covered (`e2e/lab3d.spec.ts`).
- Versions: package.json, `window.PendulumLabIndex.version`, CITATION.cff → 10.30.0 (CITATION.cff and main.ts had drifted at 10.28.0 — both now synced).

## 10.29.0 - 2026-06-11

Elite research-platform upgrade: reproducible experiment infrastructure, real artifact bundles, large-data storage, adaptive studies, worker orchestration, publication figures, deep chaos/bifurcation tooling, and 3D pendulum physics.

- **Real ZIP research bundle** (`src/research/zipBundle.ts`): dependency-free ZIP writer/reader (STORE, CRC32, UTF-8 names) exporting `manifest/{submission,provenance,checksums}.json`, `paper/{paper-pack.json,methods.md,methods.tex,notebook.ipynb}`, `data/{parameter-study-results.csv,design-study-results.csv,comparison-matrix.csv,run-log.json,experiments.json}`, and **binary PNG figures** decoded from canvas data URLs. Per-file CRC32 + FNV-1a hashes; archive integrity round-trip-verified in unit tests and a download-and-parse E2E. The portable JSON bundle remains as fallback.
- **IndexedDB ResearchStore** (`src/research/researchDb.ts`): seven object stores (experiments, runLog, parameterStudies, studyResults, figures, bundles, settings); one-time localStorage-v2 migration; corruption recovery (auto-rebuild on unopenable/missing-store DBs); quota display via the Storage API; full-DB JSON archive export/import (replace/merge); debounced mirroring + recovery of experiments after localStorage loss. 9 unit tests on fake-indexeddb + 2 E2E.
- **Worker protocol V2** (`src/workers/jobProtocol.ts`, `src/runtime/JobClient.ts`): jobId envelopes, priority queue, progress/checkpoint events, protocol-level **cancel/pause/resume/status** at phase boundaries (studyPoint = lyapunov → rqa → ftle), engine-side deadline + client-side wedged-kernel backstop, resume-from-checkpoint without recomputing finished phases, retry helper, worker **pool** with backpressure (maxQueued). The study batch runs on the pool (configurable 1–4 workers); the legacy bare-request protocol is still served. 18 protocol tests.
- **Multi-dimensional experiment design** (`src/research/experimentDesign.ts` + workbench card): true multi-variable Sobol (Joe–Kuo direction numbers, Gray code) and Latin hypercube (stratified marginals), factorial grid, replicates, budgets (max points/time/failures), **adaptive refinement** across the steepest |∇λ| pairs, **boundary refinement** bisecting λ-sign changes, **uncertainty-driven resampling** above 2× median SE; variable-set editor, scatter preview, diverging λ heatmap, CSV/JSON exports with method/uncertainty/caveat headers. 9 unit tests + E2E.
- **Analysis Superpack** (workbench card; every readout carries method, dt/tolerance, transient handling, uncertainty, caveat, reproducibility hash):
  - **`wadaResolutionConvergence`** (`src/chaos/wadaConvergence.ts`): the grid Wada test at several independent resolutions → fraction convergence curve, adjacent deltas, `stable-wada-evidence | stable-non-wada | unstable | insufficient-data` verdict, per-grid hashes, and an explicit finite-grid-evidence-vs-proof caveat. Worker job kind, ChaosClient method, CLI `wadaconv`, UI panel, 8 unit tests.
  - Recurrence **network** metrics (density, degree stats, clustering, transitivity, BFS path length) from the recurrence matrix.
  - **FTLE ridge extraction** (percentile + transverse local-maximum LCS proxy) with red-overlay rendering.
  - **Automated bifurcation detection** (period-doubling/halving, chaos onset/exit, attractor changes with bracketed parameters).
  - **Poincaré fixed-point classification** (node/spiral/saddle/center/PD-critical/fold-critical from Floquet multipliers) + **Neimark–Sacker scan** along the continuation branch with rotation numbers and strong-resonance flags + torus indicator.
  - **Codim-2 regime map** (`src/chaos/codimTwo.ts`): λ-sign classification over the (A, γ) plane, worker job + CLI `codim2` + canvas heatmap.
  - **Shadowing reliability score** (horizon vs GBS reference) and **Melnikov threshold** readout with a perturbative-validity warning.
- **Executable notebook v2** (`src/research/notebookBuilder.ts`): embedded study CSV/comparison CSV/paper pack/figure manifest, λ(parameter) matplotlib error-bar plot with stdlib fallback, summary cells; `npm run notebook:validate` validates nbformat structure and **executes the code cells** (jupyter nbconvert when present, plain python fallback — verified green locally). 6 unit tests.
- **Publication figure pipeline** (`src/research/figurePipeline.ts`): deterministic vector SVG λ(parameter) chart (error bars, zero line) with **byte-stable visual-regression fingerprints**, light/dark/print/Okabe-Ito themes, 1×/2×/4× PNG (OffscreenCanvas when available), per-figure source CSV with provenance headers, caption editor with persisted overrides, figure regeneration from saved studies without re-running physics. 7 unit tests.
- **Research library UX** (`src/research/libraryUx.ts`): search across name/notes/tags/DOI, tag filter, favorites, field-level experiment diff (hash/timestamp-insensitive), fork with lineage notes, timeline view, DOI/reference fields with validation, quality badges (reproducible/validated/unstable/incomplete/export-ready). 10 unit tests.
- **Provenance graph** (`src/research/provenance.ts`): typed artifact DAG snapshot → experiment → study → worker job → result → figure → paper pack → bundle; every node has id, content hash, schemaVersion, generatedAt, parentIds, source command, environment metadata; cycle/duplicate validation; `provenance.json` in every ZIP bundle + standalone export + in-app table viewer. 5 unit tests.
- **Performance tier**: budgeted progressive renderer with adaptive chunking and cancellation backpressure (`src/render/progressive.ts`), Research Workbench **performance budget panel** (fps, physics ms/frame, JS heap, jobs in flight, localStorage, IndexedDB quota), WebGPU **ensemble integrator** with f64 CPU fallback and in-app benchmark (`src/runtime/gpuEnsemble.ts`), long-run browser soak spec. 11 unit tests + E2E.
- **Rope/string pendulum** (`src/physics/rope.ts`): hybrid taut/slack dynamics — tension T/m = g·cosθ + lω² gates the constraint, slack flight is a damped projectile, capture at |r| = l is inelastic (radial velocity destroyed, energy monotone); tension readout, near-zero-tension and slack warnings, rope/rod rendering toggle in the new **Govern → 3D Lab** tab. 8 unit tests + E2E.
- **Spherical pendulum — true 3D dynamics** (`src/physics/spherical.ts`): θ̈ = sinθcosθ·φ̇² − (g/l)sinθ − γθ̇, φ̈ = −2cotθ·θ̇φ̇ − γφ̇ with conserved E and L_z diagnostics (drift < 1e-7 over 10 s at dt = 1 ms), conical-pendulum equilibrium verified against φ̇² = g/(l·cosθ₀), pole regularisation, rod/string mode with **tension-collapse warnings**. 8 unit tests + E2E.
- **3D rendering** (`src/viz/orbit3d.ts` over the existing pure `rotateProject` core): orbit camera (drag rotate, wheel zoom, perspective foreshortening), depth-faded trajectory polylines, sphere wireframe, θ̇ = 0 **Poincaré inset**, exportable **3D diagnostic snapshots** (PNG + JSON with method/dt/hash). 2D mode untouched.
- **CLI batch from JSON spec** (`src/research/cliBatchSpec.ts`, `npm run research -- batch --spec file.json`): validated job lists with per-job request/response hashes and timings. 4 unit tests.
- **Library extraction + docs**: `src/lib.ts` public API, `npm run build:lib` (ESM + d.ts to `dist-lib/`), `npm run docs:api` (TypeDoc to `docs/api/`).
- **Workspace save/restore**: one JSON capturing research state, design study, figure captions, and the live snapshot — restored through the same sanitizers as storage.
- **CI**: standalone/lib/docs builds, notebook validation, and an optional Julia **Vern9 external reference** job (`scripts/julia_reference.jl` + `npm run validate:julia`, skips cleanly without Julia); `.zenodo.json` + `docs/RELEASING.md` for Pages/Zenodo publishing.
- Tests: **427 unit tests across 64 files** (from 274), plus 7 new Playwright specs (ZIP bundle, storage, design, superpack, 3D lab, long-run performance).

## 10.28.0 - 2026-06-10

Validation hardening (Tier-1 batch 1): every headline claim now rests on an external reference, a published value, or an explicit error bar.

- **Triple-pendulum external cross-validation**: `scripts/scipy_reference.py` gains an independently derived triple-pendulum reference (general N-chain mass-matrix formulation solved with `numpy.linalg.solve` — a different derivation *and* linear-solve path than the engine's hand-expanded 3×3 elimination), with deliberately asymmetric masses/lengths so index transpositions cannot cancel. Measured: regular ~6e-14 over 20 s, strongly chaotic ~4e-8 at T = 8 s (tolerance floor × e^{λ₁t}). Closes the long-standing "triple pendulum needs an independent reference" limitation.
- **Melnikov analytic chaos threshold** (`src/chaos/melnikov.ts`, CLI `npm run research -- melnikov`): closed-form M(τ₀) = −8δ + 2πf·sech(πΩ/2)·cos(Ωτ₀) and A_c = (4γω₀/π)·cosh(πω/2ω₀) for the damped driven pendulum, pinned three ways — Simpson quadrature along the separatrix (≤1e-8), the known A_c ≈ 1.0187 at γ = 0.5, ω = 2/3, and 0–1-test physics consistency (regular well below A_c; the chaotic preset above it).
- **Literature anchors** (`src/validation/literatureAnchors.ts`, `npm run validate:literature`, new CI step): engine output vs published/closed-form values — elliptic-integral pendulum period (|Δ| < 1e-6), equal-double-pendulum normal modes (2 ∓ √2)g/l, Melnikov quadrature-vs-closed-form, and the **period-doubling onset measured from the Floquet multiplier crossing −1: A_PD = 1.06637 vs 1.0663 published** (Baker & Gollub). Structural checks: A_c < A_PD ordering; flip-basin boundary strictly fractal. Report: `reports/literature-anchors.{md,json}`.
- **Uncertainty for every non-variational diagnostic**: 0–1 test K now carries a seeded-bootstrap SE + percentile 95% CI (over the i.i.d. per-frequency K_c); RQA DET/DIV carry block-resampled SEs (contiguous blocks, batched-means style, ~1/k of the O(N²) cost); basin entropy Sb/Sbb carry SEMs over boxes; box-counting dimension carries the regression slope SE, Student-t 95% CI and R². All surfaced in the 0–1 / RQA / Basin tab readouts, status lines and CSV/metrics exports.
- **Citability**: root `LICENSE` (MIT) and `CITATION.cff` added; README links them.
- New tests: `tests/melnikov.test.ts` (8), `tests/literature-anchors.test.ts` (6), `tests/uncertainty.test.ts` (9).

## 10.27.0 - 2026-06-10

Premium UI pass: a fourth presentation layer (`css/04-premium.css`) plus a small visual-interaction module (`src/app/UiPolish.ts`). **278 unit tests; full cross-browser e2e at baseline parity (103/104, the one failure being a pre-existing environment-dependent webkit audio case that fails identically on the unmodified baseline); typecheck/build green.**

- **Gradient & material finish**: richer page mesh (recoloured at identical layer count — see the performance note), gradient-ink title, glossy gradient buttons with a sliding-gradient primary, glass selects with a custom chevron, springy checkbox check-pop, refined diagnostics chips and toast (spring entrance).
- **Progress-filled sliders**: every range input paints its filled fraction as a cyan→violet gradient (`--sp` custom property kept in sync by `UiPolish`), with a luminous thumb that scales on hover/drag; the row's value readout flashes when its slider moves.
- **Click ripple**: a pointer-anchored ripple on buttons (JS-inserted span; rail/tooltip buttons excluded so their CSS tooltips are never clipped).
- **Smooth panel collapse/expand**: the right control panel now glides — the grid track animates to zero width while the panel fades/slides, with `display:none` deferred to transition end via `transition-behavior:allow-discrete` and the entrance driven by `@starting-style` (browsers without these keep the old instant behavior; end state identical, so persistence/tests are untouched).
- **Animated accordions**: `interpolate-size:allow-keywords` + `::details-content` height transition gives settings groups a real open/close glide where supported.
- **Tab-switch motion**: refined panel entrance curve; reduced-motion guards on every new animation.
- **Performance discipline (measured, not assumed)**: three regressions were found and fixed during this pass on WebKit's software compositor (headless e2e), where the simulation loop shares the thread with paint — (1) an enriched aurora (conic sheen, heavier blur, more fields) starved rAF and froze the sim: reverted, ambience now comes from an equal-layer-count mesh recolour; (2) an always-running box-shadow "breathing" animation on the active rail tab forced continuous repaints: now a static glow; (3) the value-readout flash restarted its animation with a forced synchronous reflow per slider event, turning preset loads (input+change per slider) into a layout-thrash burst: now restarted via the Web Animations API, with no-op `--sp` style writes skipped.

## 10.26.0 - 2026-06-10

Period-doubling branch switching, a figure-rich research notebook generator, the TCAD career-mapping document, and the repository's first git commit. **278 unit tests; 26 chromium e2e; typecheck/build green.**

- **Branch switching at period-doubling** (`src/chaos/branchSwitching.ts`): `drivenPeriodicOrbitN` finds fixed points of the n-fold stroboscopic map (Newton with the n-period monodromy as Jacobian), and `switchPeriodDoubling` switches onto the period-2 branch by seeding along the critical eigenvector of the multiplier nearest −1, with a separation check that rejects Newton falling back onto the period-1 point. Verified on the classic γ = 0.5, ω = 2/3 driven pendulum: μ crosses −1 between A = 1.065/1.07 (literature A_PD ≈ 1.0663), the switched period-2 orbit is **stable** (residual ~3e-12) and matches the direct-simulation attractor; the P2 point is confirmed *not* period-1. CLI command `npm run research -- switch`.
- **Fix — strobe period rounding**: the period-1 solver's strobe and monodromy used raw `dt` with a rounded step count, so the map strobed at a slightly wrong period and the fixed point sat ~1e-3 off the true orbit; the step is now snapped so steps·dt = T exactly (all Floquet/continuation tests still pass).
- **Research notebook generator** (`npm run notebook`): writes a self-contained, print-to-PDF-friendly `reports/research-notebook.html` — abstract, headline diagnostics (spectrum ± block SE + consistency gate, 0–1 K, RQA, FTLE, basin entropy/box-dimension/Wada fraction, PD cascade incl. the branch switch, measured convergence orders, SciPy cross-validation table) with **15 figures captured from the live application** (each analysis tab driven to completion headlessly over `file://`; every number comes from the same `runChaosJob` handler the worker/CLI/tests share).
- **Device-simulation mapping** (`docs/device-simulation-mapping.md`): capability-by-capability mapping of this project onto TCAD problems — mesh-convergence ↔ measured order, analytic Newton Jacobians, TR-BDF2 stiff stepping, periodic steady state/Floquet ↔ RF analysis, pseudo-arclength ↔ snapback/NDR I–V tracing, SciPy cross-check ↔ simulator-to-simulator benchmarking. Linked from the README.
- **Repository initialized**: first commit (v10.25.0, 233 files) with the existing CI + Pages workflows ready for the first push.

## 10.25.0 - 2026-06-10

Research-workbench automation, external SciPy cross-validation, a headless research CLI, Wada-boundary candidacy, a periodic-orbit finder UI, and a liquid-glass v2 UI pass. **274 unit tests; 26 chromium e2e (plus firefox/webkit/mobile-chrome projects); typecheck/build green.**

- **Parameter-study batch queue**: a new `studyPoint` chaos-worker job computes maximal Lyapunov (± batched-means SE), RQA determinism/divergence, and a per-point FTLE in one round-trip; the Research workbench "Run Batch" button executes every study point sequentially (progress + cancel), persists results with the plan, renders them as a table, and includes them in the study export.
- **External cross-validation (SciPy)**: `npm run validate:cross` runs `scripts/scipy_reference.py` — an *independently derived* double-pendulum RHS integrated by `solve_ivp` DOP853 at 1e-13 tolerances — against the TS engine. Regular orbit: agreement ~4e-14 over 20 s; chaotic orbit: ~6e-11 at T = 10 s (tolerance floor × e^{λ₁t}). Report at `reports/cross-validation.{md,json}`; wired as a CI job.
- **Headless research CLI**: `npm run research -- <lyapunov|spectrum|zeroone|rqa|ftle|basin|wada|studypoint|orbit|continue>` runs the same pure `runChaosJob` handler the app's worker uses (plus Floquet/continuation), printing or writing JSON.
- **Wada-boundary candidate test**: `wadaCandidate` (grid method of Daza–Wagemakers–Sanjuán) reports the fraction of boundary cells touching ≥ 3 basins; pinned on synthetic grids (half-plane 0, three-sector pie < 0.3, fine interleaving = 1) and surfaced in the Basin tab status and the basin worker response.
- **Periodic-orbit finder UI**: a Research-workbench card finds the driven-pendulum period-1 orbit at user-set amplitude/frequency/damping (Newton on the stroboscopic map; Floquet multipliers + stability) and traces the branch over amplitude, reporting the first bifurcation and its classification.
- **Figure pack export**: "Export Figures" captures every *drawn* analysis canvas (20 captioned ids; blank canvases skipped) into a self-contained, print-to-PDF-friendly HTML gallery stamped with the run's snapshot hash; figure PNGs also ride along in the paper-pack JSON.
- **Liquid-glass v2**: collapsible right control panel (header toggle + `\` shortcut, persisted; canvas gets full width), calmer at-rest panel opacity, jewel-polish rail (hover lift, gradient group labels, refined active state), glass tables/scrollbars/badges, soft photographic grain over the aurora, tactile button press — with reduced-motion guards.
- **Fix — integrity badge stretched down the whole right edge**: conflicting `top`/`bottom` anchors left `#figBadge` covering (and intercepting clicks over) the entire right side; it is now a compact bottom-right chip that expands on hover/focus.
- **Fix — Space was a no-op**: the inert `LegacyBridge` registered a second Space/R handler alongside the modern shell's, so pause was toggled twice per keypress. `LegacyBridge`/`IndexPhysicsBridge` are deleted (archived); `window.PendulumLabIndex` and the default commands now install from `main.ts`.
- **Mobile e2e**: a phone-viewport spec drives Govern → Research (rail reachability, single-column workbench, no horizontal overflow, study generation). Plus new e2e for the batch queue, orbit finder, figure export, and panel toggle.
- **CI**: new `cross-validate` job (Python 3.12 + scipy) and a GitHub Pages deploy workflow (`.github/workflows/pages.yml`).

## 10.23.0 - 2026-06-09

Double-click-to-open standalone build + a substantial Lab rendering performance pass. 174 unit tests pass; 13 chromium e2e pass; typecheck/build/audit(0) green.

- **Standalone build for `file://`**: `npm run build:standalone` produces a single self-contained `standalone/index.html` (all JS/CSS inlined, classic loading via `vite-plugin-singlefile`, CSP relaxed for inline) that opens by **double-clicking** — no server. Verified in a real browser over `file://`: the Lab renders and animates with zero console errors. (The Lyapunov/Bifurcation chaos worker stays a sibling file and falls back to the main thread if a browser blocks `file://` workers.)
- **Performance — incremental trail**: the Lab trail is now drawn incrementally (fade the canvas + stroke only the *new* tip segment) instead of redrawing the whole 1.5k–3k-point trail every frame. This is O(1) per frame instead of O(trail length) — the dominant frame cost — and reproduces the legacy long-exposure look. `viz/renderTrajectoryTrace` was also optimized (quantised colour LUT cached across frames + batched strokes) for any remaining callers.
- **Performance — throttling & gating**: the expensive diagnostic side plots (FFT, scatter/line redraws) and the header/diagnostics DOM writes now run at a reduced cadence (every 3rd frame) while the pendulum renders every frame; and the Lab skips all drawing entirely while its tab is hidden (the sim keeps advancing), so the active analysis tab stays smooth.
- **Functionality restored**: trail **colour modes** (rainbow hue-cycling + heat/ice/plasma/white/phosphor) are wired again, and the **trail-length** slider is meaningful once more (it maps to the fade/persistence). Removed dead `window.App`-mirroring code from the Lab.

## 10.22.1 - 2026-06-09

Post-removal fixes: the app could appear blank, and a few references to the removed legacy were stale.

- **Blank page when opened from `file://`**: this is an ES-module app — browsers block module scripts over `file://`, so it must be **served** (`npm run dev`, or `npm run build && npm run preview`, then open the printed `http://` URL). Documented prominently in the README; previously the legacy classic scripts ran over `file://`, which is why double-clicking used to work.
- **`vite.config.ts` `base: './'`**: the production build now uses **relative** asset paths, so it works when served from any sub-path (e.g. a GitHub Pages project site), not only the web root. Verified the built app renders when served — including the chaos-worker-backed Lyapunov tab.
- **Fix: `?lab=legacy` blanked the page** — the removed escape hatch still suppressed the modern mount. The modern app now always mounts (the query param is ignored); verified by e2e.
- **Cleanups**: removed the ignored `frame-ancestors` directive from the `<meta>` CSP (valid only as an HTTP header); updated stale `?lab=legacy`/`index-loader` references in tab doc-comments and `docs/architecture.md`; pointed `scripts/benchmark.ts` and `scripts/worldclass-scorecard.ts` at the modern metrics (`__modernLab.diagnostics()` now also reports `fps` and `physicsMsPerFrame`) and refreshed the scorecard's architecture item to "done".

## 10.22.0 - 2026-06-09

**Stage 4 complete — the legacy `js/` runtime is removed; the app is now 100% TypeScript.** Legacy-risk score **482 → 0** (every metric zero). 173 unit tests pass; 13 chromium e2e pass with no legacy runtime present; typecheck + build green.

- **Removed**: all `js/00`–`js/11` legacy scripts (≈8,080 lines) and the `direct-file-runtime.js`/`index-loader.js` shims — moved to `archive/`. `index.html` now loads only `src/main.ts` (plus the hand-written CSS that styles the static shell). The `?lab=legacy` escape hatch is gone.
- **`src/app/Shell.ts`** now owns every shell duty the legacy runtime used to provide: tab navigation, slider value-display updates (matching the legacy formats), presets (sets the controls; the Lab/analysis modules rebuild), and keyboard shortcuts (Space/R/C/P + 1–8 for tabs).
- **`LabApp`** fills the header/diagnostics chrome directly (fps, time, θ/ω, energy, drift with status class, λ, Poincaré count, mode) — previously driven by the legacy frame loop.
- **Build/audit scripts** updated: `copy-legacy-assets.mjs` ships CSS only; `audit-legacy.ts` tolerates the archived `js/`.
- **Tests**: `smoke.spec.ts` rewritten onto the modern surface (`__modernLab.diagnostics()`, modern validation, `PendulumRuntime`); the legacy-only `modern-lab-takeover` and `legacy-lab` specs removed; the probe and shell specs no longer assert on `window.App`.
- **Dropped (documented in known-limitations)**: interpolated render and trail color-mode selection (cosmetic), the NaN-recovery overlay, some dev-hub-only actions, and the submission manifest now reflects control defaults rather than a live legacy snapshot.

## 10.21.0 - 2026-06-09

Stage 4 continues — audio sonification ported to the modern Lab (the last *functional* legacy-only feature). 173 unit tests pass; 15 chromium e2e pass; typecheck + build green; legacy-risk 122.

- **`src/app/AudioSonifier.ts`**: two Web Audio oscillators whose pitch/loudness track |ω₁|/|ω₂| (the legacy sonification law). The frequency/gain mappings (`sonifyFrequency`/`sonifyGain`) are pure and unit-tested; the audio graph is created lazily on enable so nothing touches `AudioContext` in Node. Wired into `LabApp` (per-frame `update`), with the audio controls taken over (clone-to-strip-legacy) so no double `AudioContext` is created.
- `tests/audio-sonifier.test.ts` (3): the clamp/scale laws for both voices. `e2e/modern-audio.spec.ts`: toggling audio + changing volume raises no errors and the sim keeps running.
- With audio ported, the remaining blockers to deleting `js/` are shell-chrome duties (slider value displays, presets slider-setting, keyboard shortcuts, header/diagnostics, `CanvasMgr` sizing, `NaNGuard`, dev-hub) and the `?lab=legacy` escape-hatch decision — interpolated render is cosmetic and can be dropped.

## 10.20.0 - 2026-06-09

Stage 4 begins — a modern shell starts taking over the legacy runtime's responsibilities, beginning with tab navigation. Plus a correctness fix. 170 unit tests pass; 14 chromium e2e pass; typecheck + build green; legacy-risk 122.

- **Fix (double-draw)**: the legacy `Render.all` guard now suppresses the phase3d/density legacy renderers too (not just the lab side plots) when the modern app is active, so legacy and modern no longer both draw to `#p3dCanvas`/`#gpuCanvas`. `?lab=legacy` still renders everything the classic way.
- **`src/app/Shell.ts`**: the modern application shell. It owns tab navigation — takes over the `.tab` buttons (clone-to-strip-legacy) and toggles the active `.tabpanel` exactly as the legacy `switchTab` did (aria-selected + `active` class), keeping `window.App.activeTab` in sync for legacy-chrome coherence. Mounted via `maybeMountModernShell()`, gated by `?lab=legacy`.
- `e2e/modern-shell.spec.ts`: navigates several tabs via the rail buttons and asserts the right panel/aria activate and exactly one panel is active; the smoke test's tab switching now also exercises the modern nav.
- This is the first step toward removing `js/`; sliders, presets, keyboard shortcuts, header diagnostics, `CanvasMgr`, and `NaNGuard` remain on the legacy runtime until ported.

## 10.19.0 - 2026-06-09

Stage 3 tab-ports complete — the last three analysis tabs (Bifurcation, 3D phase, density) are on the modern stack. Every lab/analysis tab now runs on `src/`. 170 unit tests pass; 13 chromium e2e pass; typecheck + build green; legacy-risk 122.

- **`src/app/BifurcationTab.ts`**: sweeps gravity g and records θ₂ at the θ₁=0 (θ̇₁>0) Poincaré section (reusing the tested `poincareSection`), one column per g in time-budgeted chunks, rendered with `viz/renderBifurcation`.
- **`src/app/Phase3DTab.ts`** + pure `src/app/phase3d.ts`: rotatable orthographic (θ1, θ2, ω2) point cloud with drag-to-rotate and depth fade; `rotateProject` is unit-tested (identity, axis swaps, norm preservation).
- **`src/app/DensityTab.ts`**: (θ1, ω1) phase-density via Canvas2D additive blending (`globalCompositeOperation='lighter'`) — the portable, headless-testable equivalent of the legacy WebGL density with its Canvas2D fallback.
- Both visual tabs render only while their tab panel is active. New tests: `tests/phase3d.test.ts` (4); e2e `modern-bifurcation-tab`, `modern-phase3d-density`.

## 10.18.0 - 2026-06-09

Stage 3 continues — the Sweep (chaos map) and Compare (integrator) tabs are ported. 166 unit tests pass; 10 chromium e2e pass; typecheck + build green; legacy-risk 122.

- **`src/app/SweepTab.ts`**: chaos-map tab. Computes maximal Lyapunov over a grid of (θ1, θ2) initial conditions (reusing the tested `maximalLyapunov`) in **time-budgeted animation-loop chunks** — responsive, cancellable, with a progress bar — and paints a heatmap via the pure `src/app/sweepColor.ts` ramp. Click-to-set initial angles, PNG/CSV export.
- **`src/app/CompareTab.ts`**: integrator-comparison tab. Runs RK4 / Leapfrog / RKF45 / Yoshida-4 from one initial condition simultaneously (each a `LabSimulation`), overlays them on #cmpCanvas, and plots live energy drift and divergence-from-RK4 (new `renderMultiLine` in `labPlots`). The benchmark button measures steps/ms for all eight registered methods and fills the result fields + a bar chart.
- New tests: `tests/sweep-and-plots.test.ts` (6: colormap monotonicity/clamping, `renderMultiLine`, `renderSpectrumBars`). New e2e `modern-sweep-compare.spec.ts` (sweep paints + exports; compare animates + benchmarks).

## 10.17.0 - 2026-06-09

Stage 3 continues — the Validation tab is ported to the modern stack. 160 unit tests pass; 8 chromium e2e pass; typecheck + build green; legacy-risk 122.

- **`src/app/ValidationTab.ts`**: modern port of the Validation tab. It takes over the five buttons (clone-to-strip-legacy pattern, via the new shared `src/app/domTakeover.ts`) and drives the tested `src/validation` suites — `runAllValidationChecks` (energy drift, replay determinism, JSON-import rejection, dt-halving, canonical residual), the flagship `runReferenceValidation` integrator-order cross-validation (one row per method) for Convergence, replay determinism, and a 200k-step RK4 energy-drift stress test. Results render into `#validateResults` and the `#testPassed`/`#testFailed`/`#testTime` counters with safe element-by-element DOM construction (no markup strings). Gated by `?lab=legacy`.
- **`src/app/domTakeover.ts`**: shared `takeOverButton` / `setText` / `clearChildren` helpers; `LyapunovTab` refactored onto them.
- `e2e/modern-validation-tab.spec.ts`: open tab → run-all renders 5 passing cases + counters; Convergence renders one row per integrator (≥12). The smoke test (which clicks Run-All) now exercises the modern Validation path.

## 10.16.0 - 2026-06-09

Legacy-removal Stage 3 begins — the Lyapunov-spectrum analysis tab is ported to the modern stack. 160 unit tests pass; 7 chromium e2e pass; typecheck + build green; legacy-risk 122.

- **Chaos worker protocol** gains a `lyapunovSpectrum` job (`src/workers/chaosProtocol.ts`): it runs the tested `lyapunovSpectrum` for any `SystemSpec` and returns the descending spectrum, its sum (≈0 for Hamiltonian systems), and the Kaplan-Yorke dimension. Exposed on `ChaosClient.lyapunovSpectrum(...)` with the existing worker + transparent main-thread fallback.
- **`src/app/LyapunovTab.ts`**: modern port of the λ tab. It takes over the tab controls by *cloning the buttons to strip the legacy handlers* (a clean, surgical takeover that needs no edits to the legacy JS), builds the current system spec from the on-page controls, computes the full spectrum off the main thread, fills `#L1…#KY`, and draws a spectrum bar chart (`renderSpectrumBars` in `labPlots`). Export writes a spectrum CSV. Gated by the same `?lab=legacy` escape hatch.
- `tests/lyapunov-spectrum-job.test.ts` (3): descending/positive-λ1/≈0-sum/KY-in-range for the conservative double pendulum, main-thread fallback resolution, and error propagation. `e2e/modern-lyapunov-tab.spec.ts`: open tab → Start → results populate and the canvas renders.

## 10.15.0 - 2026-06-09

Legacy-removal Stage 2 complete — the modern Lab is now the **default** lab experience. 157 unit tests pass; 6 chromium e2e pass; typecheck + build green; legacy-risk 122.

- **Default flip**: `src/app` mounts the modern Lab by default; `?lab=legacy` is the escape hatch that keeps the classic lab (covered by `e2e/legacy-lab.spec.ts`). The legacy lab render is guarded off via `App.__modernLabActive` and legacy state is mirrored for chrome coherence.
- **Parity features wired into the modern Lab**:
  - **Presets** — the existing preset buttons reconfigure the modern sim (`e2e/modern-lab-parity.spec.ts`).
  - **Ensemble** — N perturbed copies (from `ensN`/`ensEps`) integrated alongside the reference and drawn as faint tips (chaos-divergence view).
  - **Visual FX** — glow / long-exposure checkboxes drive the renderer fade.
  - **Drag-to-set** — pointer drag on `#main` repositions a bob (legacy atan2 mapping) and restarts.
  - **Export** — `src/app/labExport.ts` builds trajectory CSV, Poincaré CSV, and a reproducible run JSON; the toolbar buttons download them, plus PNG via `canvas.toDataURL` (`tests/lab-export.test.ts`, 5 tests).
  - **Replay/scrubber** — frames are recorded into a capped ring; the scrubber renders a recorded frame; rewind jumps to the start; dragging to the end resumes live.
- **Deferred (use `?lab=legacy` meanwhile)**: audio sonification (Web Audio, not headless-testable) and interpolated render (cosmetic) are not yet ported to the modern Lab. These plus the analysis tabs (Stage 3) gate deleting the legacy lab code (Stage 4).
- New tests: `tests/lab-export.test.ts`; new e2e `legacy-lab`, `modern-lab-parity`.

## 10.14.0 - 2026-06-09

Legacy-removal Stage 2 — full modern Lab tab takes over the real lab canvases behind `?lab=modern`. 153 unit tests pass; 4 chromium e2e (smoke, accessibility, probe, takeover) pass; typecheck + build green; legacy-risk score unchanged at 122.

- **`src/app/LabApp.ts`**: the complete modern Lab — simulation loop plus every side plot (energy/drift, Lyapunov convergence, phase portrait, Poincaré section, FFT) — reading the on-page controls and driving the real `#main`/`#energy`/`#lyap`/`#phase`/`#poincare`/`#fft` canvases. On mount it sets `App.__modernLabActive` (the legacy lab render stands down, guarded in `Render.all`), pauses legacy stepping, and mirrors its state into `window.App` so the legacy chrome (diagnostics, hash, drift/λ badges, export) stays coherent. Controls and Reset/Pause/Clear buttons are wired; changing any control restarts the modern sim.
- **`src/app/fft.ts`**: dependency-free radix-2 Cooley-Tukey FFT + Hann-windowed real magnitude spectrum (`magnitudeSpectrum`, `dominantBin`). Unit-tested: a pure sinusoid peaks in the matching bin.
- **`src/app/PoincareAccumulator.ts`**: rising θ₁=0 (θ̇₁>0) section detector with linear interpolation to the crossing instant, recording (θ₂, ω₂). Unit-tested.
- **`src/app/LyapunovEstimator.ts`**: incremental Benettin maximal-exponent estimator (running value + convergence curve). Unit-tested: positive for the chaotic double pendulum.
- **`src/app/labPlots.ts`**: `renderPhasePortrait` and `renderSpectrum` (Ctx2D, Node-testable).
- **Feature flag** `?lab=modern` mounts the takeover; `e2e/modern-lab-takeover.spec.ts` verifies (real Chromium) that #main animates under modern control, the legacy lab stands down, side plots draw, energy stays conserved (drift < 1e-2), `App.simTime` is mirrored, and other tabs (validation) still work.
- New tests: `tests/lab-analysis.test.ts` (8), `tests/lab-plots.test.ts` (4).

Not yet at full parity (so `?lab=modern` is opt-in, not the default): ensemble members, audio sonification, glow/long-exposure FX, interpolated render, scrubber/replay, drag-to-set bobs, preset wiring, and CSV/PNG/JSON export of the modern trajectory remain to be ported before the legacy lab code can be deleted.

## 10.13.0 - 2026-06-09

Legacy-removal Stage 2 — the modern Lab simulation/render loop. 141 unit tests pass; chromium smoke (legacy, unchanged) + new modern-lab e2e + full typecheck + build all pass.

- **`src/app/LabSimulation.ts`**: headless integration core for the Lab tab. Drives the shared typed `physicsAdapter` (same tested integrators used everywhere) for double/triple systems, with energy, relative drift, solver residual, deterministic stepping, and Cartesian bob positions in metres. A unit test asserts it reproduces a hand-rolled `rk4Step`+`rhsDouble` loop **bit-for-bit**, proving it uses the engine faithfully rather than reimplementing physics.
- **`src/app/LabRenderer.ts`**: canvas pendulum renderer targeting the structural `Ctx2D` (so it unit-tests in Node like the `viz/` renderers). Reproduces the legacy `#main` geometry for visual parity (pivot `w/2, h·0.38`, 110 px/m), with gradient trail (`viz/trace`), rods, pivot, and Okabe-Ito bobs.
- **`src/app/LabController.ts`**: `mountModernLab(canvas, config)` — a self-contained rAF loop wiring simulation→renderer with a trail ring buffer and an injectable scheduler (for tests). It never reads `window.App`, so it is independently mountable and parity-testable before the legacy lab is removed.
- **Feature flag**: `?modernLabProbe` mounts the modern Lab onto a dedicated probe canvas without disturbing the legacy `#main`. `e2e/modern-lab.spec.ts` verifies (in real Chromium) that it animates, advances time, conserves energy (γ=0 RK4 drift < 1e-2), and leaves the legacy app working.
- `tests/lab-simulation.test.ts` (8) + `tests/lab-renderer.test.ts` (5): engine fidelity, determinism, conservation/dissipation, geometry-to-pixel parity, controller stepping/trail/scheduler.
- Docs: `architecture.md` module boundaries + Stage-2 staging updated.

## 10.12.0 - 2026-06-09

Runtime unification — Stage 1 of the legacy-removal program. 128 unit tests pass; chromium smoke + full typecheck pass; legacy-risk score 156 → 122.

- **`src/runtime/ServiceContainer.ts`**: zero-dependency typed DI container (lazy singletons, optional transients, throwing `resolve` + non-throwing `tryResolve`, typed service map, lifecycle `reset`/`invalidate`). `tests/service-container.test.ts` (7 tests).
- **`src/runtime/PendulumRuntime.ts`**: the single canonical runtime surface `window.PendulumRuntime`, backed by the container. Registers `events`, `commands`, `state`, `physics`, `worker`, and *adopts* the legacy app/physics as `legacyApp`/`legacyPhysics` instead of reading ambient globals. Booted first in `src/main.ts`.
- **`js/01-core-app.js`**: the five scattered globals (`App`, `Physics`, `NaNGuard`, `CanvasMgr`, `UI`) collapsed into one `window.PendulumLabLegacyRuntime` namespace; the historical names are now **read-only, non-reassignable** accessors backed by it. Removed both dynamic `<script>` injections (decorative metadata nothing read). Legacy-risk metrics `globalRuntimeExports` and `dynamicScript` are now **0**.
- **`src/render/performance.ts`**: resolves the legacy app through the container (with a safe fallback), demonstrating modern code consuming the DI surface rather than a bare global.
- **`docs/architecture.md`**: added the layered (domain/application/infrastructure/legacy) dependency table, the DI-container description, the minimized public-API-surface section, and the four-stage Legacy Removal Staging plan.
- **`e2e/smoke.spec.ts`**: now also asserts `window.PendulumRuntime` is installed, adopted the legacy app via the container, and that `window.App` rejects external reassignment.

## 10.11.0 - 2026-06-09

Portfolio landing page and documentation. 121 unit tests pass; landing + modern Playwright smoke specs pass on chromium.

- **`landing.html`**: framework-free, colorblind-safe (Okabe-Ito), mobile-responsive landing page with a hero, a live double-pendulum mini-canvas (`src/landing.ts`, reusing the tested physics core and the viz gradient trace), a stats row, an eight-card feature grid covering the seven layers, and links to the lab, docs, and generated reports. Wired into `vite.config.ts` rollup inputs.
- **`docs/engine-overview.md`**: English overview with the layer map, the **measured** integrator-order table (12/12 within envelope), and representative chaos-diagnostic results (Lyapunov, SALI, FLI; Hamiltonian spectrum pairing).
- **`README.md`**: added a "What's inside" feature summary and a full `npm run` script catalog.
- **`e2e/landing-smoke.spec.ts`**: asserts the page mounts, the hero canvas animates (changing pixels), the feature grid and CTA are present, and there are no console errors.

## 10.10.0 - 2026-06-09

Reproducibility-package exporter for machine-checkable run provenance. 121 unit tests pass.

- **`src/research/reproPackage.ts`** builds a self-contained JSON manifest for a run (system spec, integrator, dt, steps, initial state, seed) with a dependency-free content hash of the inputs (`canonicalJson` + `cyrb53`), the resulting final state, and key diagnostics (energy drift, maximal Lyapunov estimate), plus library version and timestamp.
- **`verifyReproPackage`** re-runs the manifest and confirms the final state reproduces (the integration is fully deterministic, so round-trip Δstate is 0) and the input hash matches — detecting tampering of either the recorded state or the hash.
- **`reproMethodsText`** emits a Markdown methods paragraph + citation line for inclusion in write-ups.
- `tests/repro-package.test.ts` (10 tests): build → verify round-trip, hash stability and key-order independence, JSON serializability, and tamper detection (corrupted state and corrupted hash both fail).
- **`npm run export:repro`** (`scripts/export-repro.ts`) builds, verifies, and writes packages to `reports/reproducibility/` — e.g. a double pendulum (`gbs`, drift 1.3e-12) and the driven chaos preset (`dopri5`, λ ≈ 0.134), both verifying with Δstate = 0.

## 10.9.0 - 2026-06-09

Integrator reference-validation suite proving each method matches trusted references. 111 unit tests pass.

- **`src/validation/referenceSuite.ts`** validates every registered integrator three ways: (1) **theoretical convergence order** on the harmonic oscillator (closed form) — every method hits its order (euler 1.03, rk2/leapfrog/hmidpoint/bdf2 2.00, rk4/yoshida4/gauss2 4.00, rkf45/dopri5 5.00, gbs round-off-limited); (2) **energy-conservation envelope** on the conservative double pendulum; (3) **agreement** with the highest-accuracy method (`gbs`) as a numerical reference, reported as max state divergence. Result: **12 / 12 integrators within their expected envelopes.**
- Grading is done by pure helpers (`gradeOrder`, `gradeBelow`) that are unit-tested directly (`tests/reference-validation.test.ts`, 10 tests), alongside structural assertions on the full run (orders met, gbs self-agreement is exactly 0, higher-order methods beat Euler, no NaN/Inf blow-ups).
- **`npm run validate:reference`** (`scripts/validate-reference.ts`, pure Node/tsx) writes `reports/validation-reference.{md,json}` and exits non-zero if any integrator falls outside its envelope.

## 10.8.0 - 2026-06-09

Moved the heavy chaos computations off the main thread behind a typed worker protocol. 101 unit tests pass; the `modern.html` Playwright specs pass on chromium with the worker path confirmed active in-browser.

- **Serializable system descriptor** (`src/physics/systemSpec.ts`): a data-only `SystemSpec` union plus `buildRhs(spec)` that reconstructs the `Derivative` on the far side of the worker boundary (a function can't be posted to a worker). `tests/chaos-protocol.test.ts` checks `buildRhs` matches the direct physics RHS to machine epsilon. `src/demo/systems.ts` now derives every system's RHS from its spec, so the main thread and worker run identical math.
- **Typed message protocol** (`src/workers/chaosProtocol.ts`): discriminated-union `ChaosRequest`/`ChaosResponse` and a pure `runChaosJob` handler used both inside the worker and as the synchronous fallback — the two paths cannot diverge.
- **Worker** (`src/workers/chaos.worker.ts`): a trivial `postMessage(runChaosJob(data))` wrapper.
- **Promise client** (`src/runtime/ChaosClient.ts`): `lyapunov(...)` / `bifurcation(...)` returning Promises, with an injectable worker factory and a graceful main-thread fallback when workers are unavailable. `tests/chaos-client.test.ts` covers the worker path (via a fake worker), the fallback path, worker/fallback result parity, and error-response rejection.
- **UI**: the `modern.html` Lyapunov and bifurcation buttons now call the client; the status bar reports whether the chaos backend is the worker or the fallback. `e2e/modern-smoke.spec.ts` asserts the worker backend is active and the panels fill with no console errors.

## 10.7.0 - 2026-06-09

Three-panel interactive workspace in `modern.html` (left settings / center canvas / right analysis), wiring the chaos/numerics/viz layers together. 91 unit tests pass; Playwright smoke specs for `modern.html` pass on chromium.

- **Demo system registry** (`src/demo/systems.ts`): a thin, DOM-free, unit-tested abstraction (`tests/demo-systems.test.ts`, 22 tests) wrapping double / triple / N=5 chain / driven / spring with an initial state, parameter-bound RHS, energy scalar, body positions, and a per-system Poincaré-crossing rule.
- **Three-panel responsive layout**: left settings (system + integrator selectors, dt/speed, toggles), center animated canvas, right analysis (status + four diagnostic canvases). Collapses to a single column under 820px.
- **Integrator selector** populated from `integratorRegistry`, with each method's `stabilityNotes` surfaced in a live note box and the `<select>` title (tooltip).
- **Live + on-demand panels**: live energy/drift and Poincaré section; on-demand Lyapunov-convergence (`maximalLyapunov`) and bifurcation sweep (`bifurcationDiagram`, driven only), computed off the render path with a "Computing…" state.
- **Colorblind-mode toggle** swaps the Okabe-Ito safe theme for a deliberately non-safe red/green theme across all renderers and the scatter colors.
- **Gradient trajectory trace** of the tip via `renderTrajectoryTrace`, stored in physical units so it stays correct across canvas resizes.
- **E2E**: new `e2e/modern-smoke.spec.ts` (panels mount, animation advances, system switch, canonical toggle, Lyapunov compute, zero console/page errors). Removed the obsolete modern-core test from `e2e/smoke.spec.ts`.

## 10.6.0 - 2026-06-09

Visualization layer (`src/viz/`) surfacing the chaos/numerics engine in the browser. Framework-free, pure `render(ctx, data, opts)` functions that unit-test against a recording 2D-context stub (`tests/viz.test.ts`, 14 tests); 69 unit tests pass overall.

- **Colorblind-safe palette** (`palette.ts`): the Okabe-Ito categorical set plus dark/light themes and hex interpolation helpers.
- **Pure scale/axis helpers** (`scales.ts`): `makeScale`/`invert`, 1/2/5-snapped `niceTicks`, and a reusable `drawFrame` (gridlines, ticks, axis box) — all DOM-independent.
- **Renderers**: `renderEnergyPlot` + `renderDriftGauge`, `renderLyapunovConvergence` (pairs with `maximalLyapunov(...).convergence`), `renderPoincareSection` (with pure `autoViewport`/`zoomViewport` for pan/zoom), `renderBifurcation` raster, and `renderTrajectoryTrace` (gradient fade with a head marker). All are empty-data safe (tested).
- **Testable canvas seam** (`types.ts` `Ctx2D`): the minimal `CanvasRenderingContext2D` subset the renderers use, so they render in Node against a stub and in the browser against the real context.
- **Live wiring**: `modern.html` now hosts an energy/drift plot and a live Poincaré section (θ₂ = 0, θ̇₂ > 0) fed by the running double pendulum, verified rendering headlessly with zero code-originated console errors.

## 10.5.0 - 2026-06-09

Chaos Analysis layer (`src/chaos/`), built on the v10.4.0 physics/numerics core. All diagnostics are test-covered (`tests/chaos.test.ts`, 11 tests); 55 unit tests pass overall.

- **Shared variational machinery** (`variational.ts`): finite-difference Jacobian, an augmented "reference + tangent vectors" RHS that propagates deviation vectors under the linearized flow, modified Gram-Schmidt, and a reproducible (mulberry32-seeded) orthonormal frame.
- **Lyapunov exponents** (`lyapunov.ts`):
  - `maximalLyapunov` — Benettin two-trajectory method (Jacobian-free). Gives ≈0.10 for the damped-driven chaos preset and ≈0 for the harmonic oscillator.
  - `lyapunovSpectrum` — full spectrum via Gram-Schmidt of the variational flow. The conservative double pendulum reproduces the Hamiltonian pairing (λ₁ ≈ −λ₄, sum ≈ 0).
  - `kaplanYorkeDimension` — Lyapunov dimension from the spectrum.
- **Fast chaos indicators** (`indicators.ts`): `saliIndicator` (SALI → 0 exponentially for chaos, O(1) for regular motion) and `fliIndicator` (overflow-safe via accumulated log).
- **Poincaré sections & bifurcation** (`poincare.ts`): `poincareSection` (wraps `detectEvents`, so points lie exactly on the section), `bifurcationDiagram` over a parameter sweep, and `distinctValueCount` for period classification.
- Every result object carries the transient/renormalization settings it was computed with, per the project's reproducibility discipline.

## 10.4.0 - 2026-06-09

Numerics and physics-engine expansion (all additions test-covered; 44 unit tests pass).

- **New physical systems** (`src/physics/`):
  - `nPendulum.ts` — generalized N-link chain pendulum (`rhsChain`/`energyChain`). Reduces exactly to `rhsDouble` (N=2) and `rhsTriple` (N=3) to machine epsilon, verified in `tests/n-pendulum.test.ts`; the quadruple pendulum (N=4) is covered there too.
  - `driven.ts` — sinusoidally driven, damped pendulum made autonomous via a drive-phase coordinate, with the classic `DAMPED_DRIVEN_CHAOS_PRESET` (A=1.15, ω=2/3, q=2). Sensitive-dependence and dissipation are asserted in tests.
  - `spring.ts` — elastic (spring) pendulum in (r, θ); energy conservation under leapfrog is asserted.
- **New integrators** (wired into `IntegratorId`, `integratorRegistry`, and `step()`):
  - `dopri5` — Dormand-Prince 5(4).
  - `gbs` — Gragg-Bulirsch-Stoer modified-midpoint extrapolation (DOP853-class accuracy; weights are computed from substep ratios, not transcribed, so there is no large hand-written tableau to get wrong). Reaches machine-precision energy conservation in the benchmark.
  - `bdf2` — one-step, self-starting, L-stable TR-BDF2 stiff solver (`src/physics/stiff.ts`) with Newton iteration and a finite-difference Jacobian. L-stability verified on a stiff decay where explicit Euler diverges.
- **Event-detection solver** (`src/physics/events.ts`, `detectEvents`): integrates while bisecting to locate zero-crossings of user predicates, with direction filtering — the primitive behind Poincaré sections and period detection. A double-pendulum Poincaré section test is included.
- **Adaptive framework additions** (`src/physics/adaptive.ts`): `bulirschStoerStep` extrapolation step.
- **Long-term energy benchmark** (`scripts/energy-benchmark.ts`, `npm run benchmark:energy`): ranks every integrator by relative energy drift over 100k steps; writes `reports/energy-benchmark.{md,json}`.

## 10.3.0 - 2026-06-09

- Implemented the previously-advertised integrators that silently fell back to RK4 in `step()`:
  - `symplectic` now runs true semi-implicit (symplectic) Euler.
  - `leapfrog` now runs a velocity-Verlet kick-drift-kick step.
  - `yoshida4` now runs a fourth-order Yoshida triple composition of leapfrog.
  - `rkf45` now runs a real embedded Runge-Kutta-Fehlberg 4(5) pair that exports a local error estimate.
- Upgraded `gauss2` from a 1-stage implicit midpoint to the genuine 2-stage Gauss-Legendre (order 4) collocation method, and added a 3-stage Gauss-Legendre (order 6) stepper (`gaussLegendre6Step`).
- Added `src/physics/adaptive.ts`: Dormand-Prince 5(4) embedded step, an error-per-step adaptive controller (`adaptiveStep`, `integrateAdaptive`), and Richardson extrapolation (`richardsonStep`).
- Added `tests/numerics.test.ts` (11 tests) verifying empirical convergence orders, symplectic energy boundedness, embedded error scaling, adaptive accept/reject behavior, and Richardson error reduction.

## 10.2.0 - 2026-06-09

- Fixed direct `index.html` execution so blocked or unavailable workers fall back to main-thread physics and the pendulum keeps moving.
- Removed clipped left-rail English tooltip labels while preserving title and ARIA labels.
- Added `src/runtime/ModernPhysicsBridge.ts` so served legacy execution uses the TypeScript double-pendulum RHS, energy, and RK/Euler core paths.
- Moved the module worker entry to `src/workers/physics.worker.ts` and hardened `WorkerBridge` fallback.
- Added canonical theta/p Hamiltonian helpers, residual-reporting implicit midpoint, and TypeScript triple RHS tests.
- Expanded `modern.html` into a working TypeScript physics demo page.
- Added legacy risk audit reports with weighted risk reduction tracking.
- Added unit/E2E coverage for motion, canonical residuals, JSON guards, extreme parameters, and import/export round-trip.

## 10.1.0

- Introduced Vite, TypeScript, Vitest, Playwright, benchmark scripts, validation reports, CSP notes, and CI.
