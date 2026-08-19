# Pendulum Lab — post-remediation world-class backlog

Date: 2026-08-19. These are **new** follow-on investments, not a relabeling of
the 120 findings remediated or gated in the August hardening pass. Every item
has a falsifiable completion condition so the list cannot be satisfied by copy
changes alone. P0 means release/research integrity, P1 means next major release,
and P2 means deliberate expansion after the P0/P1 evidence exists.

## Scientific product governance (1–12)

1. **P0 — Machine-readable claim registry.** Give every public scientific claim an owner, model scope, supporting artifact hashes, and invalidating conditions. Done when CI rejects an unregistered quantitative claim in the reviewer/landing evidence feeds.
2. **P0 — Evidence expiry policy.** Assign a validity window to browser, dependency, GPU-driver, and external-reference evidence. Done when stale evidence automatically downgrades the visible claim instead of remaining green.
3. **P0 — Model maturity levels.** Label each model `educational`, `validated`, `research`, or `experimental` from one authoritative manifest. Done when UI, exports, package docs, and reviewer view derive the same label.
4. **P0 — Numerical incident process.** Define severity, embargo, correction, artifact revocation, and user notification for a discovered physics error. Done with a rehearsed incident fixture that retracts one synthetic bad artifact end to end.
5. **P1 — Experiment-schema compatibility charter.** Publish additive/breaking rules and supported migration windows for snapshots, archives, and worker messages. Done when compatibility fixtures cover the oldest supported version through current.
6. **P1 — Reproducibility service level.** Set measurable targets for rerun success, tolerated platform variance, artifact completeness, and time to reproduce. Done when the release report computes the targets from CI runs.
7. **P1 — Signed research audit ledger.** Chain important import, simulation, validation, and export events with hashes. Done when tampering with an intermediate event invalidates the final bundle verification.
8. **P1 — Supported-platform matrix.** Separate “runs”, “tested”, and “research-certified” for OS/browser/GPU/Node combinations. Done when unsupported combinations cannot inherit a certified badge.
9. **P1 — Scientific deprecation policy.** Require replacement guidance and evidence comparison before removing a model, method, or export field. Done when API diff CI blocks an undocumented scientific deprecation.
10. **P1 — Machine-readable invariant catalog.** Describe dimensions, conservation laws, admissible domains, and validation tolerances per model. Done when property tests and UI caveats are generated from the same catalog.
11. **P1 — Research ethics and dual-use review.** Cover sensors, student data, publication claims, and potentially misleading generated results. Done when new sensor/ML features require a completed review record.
12. **P2 — Claim decision records.** Store why each tolerance, reference, and promotion threshold was chosen, with alternatives and reviewers. Done when every research-grade gate links to an immutable decision record.

## Numerical methods and model depth (13–35)

13. **P0 — Runtime dimensional-analysis layer.** Attach SI dimensions to public parameters and derived outputs at validation boundaries. Done when incompatible units fail before entering a solver and exports preserve unit metadata.
14. **P1 — Automatic nondimensionalization assistant.** Recommend characteristic scales and report conditioning improvement without silently changing the problem. Done on extreme mass/length fixtures with equivalent reconstructed trajectories.
15. **P1 — Stiffness detection and method recommendation.** Estimate stiffness from Jacobian spectra and rejection history. Done when known stiff/non-stiff fixtures select appropriate advice without automatically mutating the run.
16. **P1 — Differential-algebraic constraint support.** Add an index-aware path for constrained multibody models rather than relying only on post-step projection. Done with constraint residual/order studies on at least two mechanisms.
17. **P0 — Simultaneous-event arbitration.** Define deterministic ordering and root isolation when impact, slack/taut, and section events coincide. Done with permutation-invariant fixtures and an exported event ledger.
18. **P2 — Interval/validated integration oracle.** Produce rigorous short-horizon enclosures for small reference systems. Done when ordinary trajectories are demonstrably contained and enclosure blow-up is reported honestly.
19. **P1 — Mixed-precision numerical policy.** Specify where f32, f64, WASM, and GPU arithmetic may be used and how promotion is earned. Done when every accelerated result exports precision lineage.
20. **P1 — Cross-engine deterministic-math study.** Quantify transcendental and reduction differences across V8, SpiderMonkey, JavaScriptCore, WASM, and native references. Done with per-engine error envelopes in the release evidence.
21. **P1 — Measurement covariance propagation.** Carry correlated parameter/initial-state uncertainty into trajectory and derived-metric intervals. Done on analytic linear cases and Monte Carlo cross-checks.
22. **P2 — Adjoint sensitivity engine.** Support long-horizon gradient calculation without storing every state. Done with finite-difference/forward-sensitivity agreement and checkpoint-memory budgets.
23. **P1 — Identifiability diagnostics.** Report Fisher information, rank deficiency, and parameter correlation before presenting a fit. Done when deliberately unidentifiable fixtures are refused or caveated.
24. **P2 — Bayesian parameter inference.** Add posterior estimates with convergence diagnostics, priors, chains, and seed provenance. Done only after simulation-based calibration and coverage tests pass.
25. **P2 — Polynomial-chaos uncertainty propagation.** Provide a deterministic alternative to brute-force ensembles for smooth regimes. Done with convergence against seeded Monte Carlo on three models.
26. **P2 — Multi-fidelity surrogate contract.** Combine cheap and reference solvers while preserving bias/error estimates. Done when withheld reference points satisfy a preregistered calibration bound.
27. **P1 — Sensitivity-index convergence evidence.** Require sample-size refinement and confidence intervals for Sobol results. Done when unstable rankings cannot receive a definitive UI badge.
28. **P1 — Symplectic constraint projection.** Preserve both constraints and symplectic structure for conservative embedded systems. Done with long-run invariant comparisons against ordinary projection.
29. **P2 — Variational integrators for articulated chains.** Derive discrete Euler–Lagrange updates rather than labeling coordinate splits as equivalent. Done with order, momentum, and energy-behavior validation.
30. **P2 — Quaternion/rotation-group 3D formulation.** Remove Euler-angle chart issues for rigid links and sensors. Done with norm, frame-invariance, and closed-loop rotation tests.
31. **P1 — Impact/restitution event model.** Add a documented non-smooth collision path with impulse and energy-accounting diagnostics. Done on analytic bounce cases and simultaneous-contact stress tests.
32. **P1 — Discontinuous-force verification suite.** Test convergence notions appropriate to Coulomb contact and hybrid systems rather than smooth-RHS order alone. Done with event-time and measure-level comparisons.
33. **P1 — Ensemble-first chaos summaries.** Default sensitive long-horizon claims to distributions across perturbations, not a single trajectory. Done when the claim registry records ensemble size and uncertainty.
34. **P2 — Rare-event importance sampling.** Estimate escape/failure probabilities with effective-sample-size and bias diagnostics. Done against brute-force references where probabilities remain measurable.
35. **P1 — Automatic reference-problem selection.** Map a requested model/regime to the most independent analytic, SciPy, Julia, or validated numerical oracle. Done when the choice and independence level are exported with the comparison.

## Architecture, performance, and large-data behavior (36–55)

36. **P0 — Versioned performance fixtures.** Pin device class, workload, warm-up, browser, and sample-count metadata. Done when performance claims cannot mix incomparable fixtures.
37. **P1 — Cold/warm/steady-state separation.** Report startup compile, cache-warm startup, and sustained runtime independently. Done when bundle or shader caching cannot disguise cold-start regression.
38. **P1 — Interaction-latency budget.** Measure INP-like pointer/keyboard latency during real physics and export work. Done with p50/p95/p99 gates on low- and mid-tier devices.
39. **P0 — Per-surface memory budgets.** Track retained heap/GPU/worker memory after opening and closing every tab. Done when repeated lifecycle tests return within a bounded baseline.
40. **P1 — Adaptive worker-pool concurrency.** Size pools from hardware, task cost, visibility, and thermal/load signals. Done when oversubscription fixtures improve latency without starving input.
41. **P1 — End-to-end backpressure.** Bound queued worker jobs, plot samples, exports, and sensor frames with explicit drop/coalesce policy. Done when a producer flood cannot grow memory without limit.
42. **P1 — Priority-aware task scheduling.** Separate input, animation, physics, validation, and export priorities with cancellation. Done when a large export cannot breach input-latency targets.
43. **P1 — SAB/non-SAB parity benchmark.** Compare throughput and correctness for isolated and ordinary deployments. Done when capability fallback cost is visible before enabling expensive live plots.
44. **P2 — WebGPU f64 readiness gate.** Detect actual shader-f64 support and validate it independently before changing any precision claim. Done with same-run f64 CPU oracle and vendor matrix.
45. **P1 — Shader/pipeline cache telemetry.** Separate compilation from dispatch and record cache reuse. Done when first-use jank and steady-state GPU cost are independently budgeted.
46. **P0 — Automated resource-ownership audit.** Give workers, observers, RAFs, timers, audio nodes, streams, and GPU buffers an owner and teardown assertion. Done when leaked handles fail CI.
47. **P1 — Data-saver-aware prefetch policy.** Suppress nonessential intent prefetch on constrained networks while preserving keyboard responsiveness. Done with effective-type/save-data fixtures.
48. **P1 — Chunk ownership and dependency budgets.** Assign each lazy chunk an owner, purpose, and transitive-size ceiling. Done when an unrelated dependency cannot silently enter a high-traffic chunk.
49. **P1 — Executed CSS coverage budget.** Measure initial and per-route used CSS, not only raw bytes. Done when dead selectors are attributed and regressions block release.
50. **P1 — Font and glyph loading strategy.** Guarantee fast Korean/English rendering without invisible text or accidental large glyph downloads. Done with offline, slow-network, and CJK visual metrics.
51. **P1 — IndexedDB write batching and wear reduction.** Coalesce high-frequency research state updates with crash-safe checkpoints. Done with write-count, recovery, and interruption tests.
52. **P2 — Streaming multi-gigabyte export.** Use streams/filesystem handles where available rather than holding bundles in memory. Done with cancellation, quota, checksum, and partial-file cleanup tests.
53. **P1 — Virtualized research tables.** Keep keyboard and screen-reader semantics while rendering large run libraries. Done at 100k rows within memory/latency budgets.
54. **P1 — Progressive million-sample plotting.** Combine decimation pyramids with exact selected-range export. Done when overview rendering is bounded and zoomed data remains faithful.
55. **P0 — Fully network-independent certified startup.** Verify a clean installed build launches, explains evidence freshness, and runs core experiments with the network blocked. Done as a production-artifact E2E gate.

## Accessibility, localization, and human factors (56–72)

56. **P1 — Keyboard chart explorer.** Let users traverse series, extrema, crossings, and uncertainty bands without a pointer. Done with visible focus and spoken value/units on every core chart.
57. **P1 — Semantic mathematics.** Render equations as accessible MathML/text alongside visual notation. Done with NVDA, JAWS, VoiceOver, copy/paste, and print checks.
58. **P1 — Delta-based result announcements.** Announce meaningful result changes, not every animation frame. Done with rate-limited live-region tests during continuous simulation.
59. **P2 — Accessible sonification protocol.** Pair sound mappings with captions, legends, volume control, and non-audio alternatives. Done with user tests including blind and sound-sensitive participants.
60. **P1 — Voice-control-safe naming.** Align visible labels, accessible names, and stable commands. Done with Dragon/Voice Control scripts for primary workflows.
61. **P0 — Focus-preserving state restore.** After locale, mode, history, or snapshot changes, restore focus to the logical initiating control. Done across dialog, lazy tab, and error paths.
62. **P1 — Live-region arbitration.** Prioritize safety/errors over progress/toasts and deduplicate repeated messages. Done when stress tests produce a comprehensible announcement sequence.
63. **P0 — Linked error summary.** Aggregate validation failures and move focus to the exact field while retaining entered values. Done for keyboard and screen-reader flows.
64. **P1 — Locale-safe numeric input.** Accept and normalize documented decimal/grouping conventions without ambiguity. Done with Korean/English browser-locale matrices and round-trip exports.
65. **P1 — Locale-safe dates and time zones.** Display local time while exporting UTC plus offset. Done when cross-zone imports preserve ordering and provenance.
66. **P1 — Korean line-breaking visual gate.** Test CJK wrapping, ruby/MathML adjacency, and long scientific terms at zoom. Done on all responsive breakpoints without clipped meaning.
67. **P1 — Scientific translation glossary.** Centralize approved Korean/English terms, abbreviations, units, and translator notes. Done when UI/docs lint rejects inconsistent core terminology.
68. **P1 — Bilingual artifact metadata.** Preserve the selected locale plus canonical English field identifiers in CSV/JSON/PDF. Done with lossless cross-locale re-import.
69. **P1 — Tagged accessible PDF exports.** Produce reading order, headings, table headers, alt text, and embedded fonts. Done with PAC/manual screen-reader review.
70. **P1 — Motor-accessible precision controls.** Provide typed entry and coarse/fine keyboard steps for every drag/gesture operation. Done without requiring timed or path-precise movement.
71. **P0 — Photosensitive-motion audit.** Bound flashes, high-contrast oscillation, trail frequency, and generated sonification visuals. Done with automated frequency checks plus reduced-motion verification.
72. **P0 — Assistive-technology certification matrix.** Maintain manual workflows for NVDA/Firefox, JAWS/Chrome, VoiceOver/Safari, TalkBack/Chrome, and zoom/forced-colors. Done per release with named evidence artifacts.

## Security, privacy, and data integrity (73–89)

73. **P0 — Maintained threat model.** Cover untrusted imports, archives, service workers, workers, sensor streams, shared memory, and published artifacts. Done when each boundary has owner, abuse case, and test/control.
74. **P0 — Sensor-data inventory.** State what camera/IMU data is processed, retained, exported, or discarded. Done when runtime disclosures and privacy docs derive from one manifest.
75. **P0 — Ephemeral camera-frame guarantee.** Prove raw frames are not persisted unless the user explicitly exports them. Done with storage/network instrumentation tests.
76. **P1 — Permission revocation workflow.** Detect ended/revoked camera and sensor permissions, stop cleanly, and explain recovery. Done across browser-specific revocation fixtures.
77. **P1 — Export privacy scanner.** Warn about names, paths, device IDs, GPS, and other identifiers before creating a public bundle. Done with seeded true/false-positive fixtures and an override audit record.
78. **P0 — Spreadsheet-formula injection defense.** Escape dangerous CSV cells without corrupting scientific values. Done against Excel/Sheets formula prefixes and round-trip tests.
79. **P0 — SVG/HTML export sanitization.** Permit only the required markup/attributes and reject scripts, foreign objects, and external loads. Done with a maintained malicious corpus.
80. **P0 — Archive resource limits.** Bound entry count, path depth, compression ratio, expanded bytes, and nested archives. Done with ZIP-bomb and path-traversal fixtures.
81. **P0 — Structured-clone complexity limits.** Bound depth, dimensions, and transfer sizes before worker/IndexedDB operations. Done when adversarial graphs cannot freeze or exhaust memory.
82. **P1 — Worker request rate limits.** Prevent one UI or imported script from monopolizing compute. Done with fair scheduling and explicit retry-after diagnostics.
83. **P0 — DOM-clobbering regression suite.** Protect ID/name-based lookups and global APIs from hostile imported markup or extensions. Done with shadowed-form/global-name fixtures.
84. **P0 — CSP report-to-enforce promotion process.** Collect violations on release candidates, classify them, then enforce a minimal policy. Done with zero unexplained production violations.
85. **P1 — Dependency capability allowlist.** Document why each runtime dependency needs DOM, network, eval, worker, or filesystem-like access. Done when new capabilities require review.
86. **P0 — Reproducible dependency resolution.** Pin registry integrity, package-manager version, and install scripts. Done when clean builds reproduce dependency trees and unexpected lifecycle scripts fail.
87. **P0 — Build-time secret and artifact scan.** Inspect source maps, reports, fixtures, archives, and generated HTML before upload. Done with synthetic-secret detection and allowlisted false positives.
88. **P1 — User-controlled backup rotation.** Offer encrypted/local backup sets and verify restoration before destructive migrations. Done with interrupted, wrong-password, and corrupted-backup tests.
89. **P2 — Optional at-rest encryption for research workspaces.** Use user-held keys without implying server recovery. Done with key-loss warnings, lock timeout, export, and cryptographic review.

## Testing, release engineering, and operations (90–107)

90. **P0 — Deterministic locale/time environment.** Run core tests across fixed clocks, time zones, locale data, and daylight-saving edges. Done when no evidence timestamp or ordering depends on runner locale.
91. **P1 — Flake accounting with ownership.** Record retry-free pass rates and quarantine only with an owner/expiry. Done when releases cannot hide flakes by automatic retries.
92. **P0 — Package-consumer matrix.** Install the packed tarball in Node ESM, Vite, Webpack/Rspack, Deno/JSR, and browser-worker fixtures. Done before publish for every public export map change.
93. **P0 — Semantic API diff gate.** Compare runtime exports, types, schemas, and documented behavior against the previous release. Done when version bumps match the detected compatibility impact.
94. **P0 — Historical migration corpus.** Keep real redacted snapshots/archives from every supported schema. Done when current code imports each and exports a valid current artifact.
95. **P1 — Test-to-risk traceability.** Map each claim, invariant, parser, migration, and release gate to tests. Done when uncovered high-risk controls appear in the scorecard.
96. **P1 — Risk-weighted mutation program.** Prioritize numerical predicates, data deletion, authorization/capability checks, and claim promotion. Done with target scores per risk area, not one global percentage.
97. **P1 — Differential browser numerics.** Run identical serialized workloads in Chromium, Firefox, and WebKit and compare within declared envelopes. Done for all research-certified models.
98. **P0 — Persistent fuzz corpus.** Promote minimized parser/physics/worker crashes into versioned regressions. Done when fuzz findings cannot disappear with the temporary job artifact.
99. **P1 — Failure-first E2E artifacts.** Save trace, console, network, accessibility tree, storage state, and screenshot only on failure. Done with automatic redaction and bounded retention.
100. **P1 — Statistical performance gates.** Use repeated samples, noise estimates, and practical-effect thresholds rather than one timing. Done when runner variance cannot create arbitrary pass/fail changes.
101. **P1 — Cross-platform visual approval workflow.** Require reviewed Linux/Windows/macOS and mobile baselines with artifact provenance. Done when local screenshots cannot overwrite certified baselines.
102. **P1 — Public canary channel.** Exercise migrations, PWA updates, headers, and core runs on a small immutable release candidate. Done before stable promotion with automatic evidence capture.
103. **P0 — Tested rollback.** Restore the previous web artifact, service worker, package tag guidance, and claim manifest without data loss. Done in a scheduled rehearsal.
104. **P0 — PWA upgrade transaction.** Stage cache/schema changes, verify them, and roll back atomically. Done with offline interruption at every migration phase.
105. **P1 — Source-map privacy policy.** Separate private diagnostic maps from public artifacts and prove no local paths/source secrets leak. Done with production-bundle inspection.
106. **P1 — SBOM license and policy gate.** Track runtime/dev/tooling dependencies, licenses, notices, and forbidden changes. Done with diff review on every lockfile update.
107. **P0 — Downstream provenance verification fixture.** Provide a clean consumer that verifies tarball/site attestations without repository trust. Done when the exact public artifact can be independently verified.

## Education, ecosystem, and research adoption (108–125)

108. **P1 — Submission-validator CLI.** Validate classroom CSV, manifest, hashes, units, and required evidence without opening the app. Done with actionable Korean/English diagnostics.
109. **P1 — Privacy-preserving teacher dashboard.** Summarize local submissions and rubric evidence without uploading student identity or sensor data. Done with an offline classroom fixture.
110. **P0 — Classroom offline distribution.** Package the app, lessons, references, and update verifier for restricted networks. Done on a fresh machine with no package registry or CDN access.
111. **P1 — Versioned guided-experiment library.** Treat each lesson as code with model range, expected evidence, accessibility alternatives, and tested output. Done when lessons fail CI if the product changes underneath them.
112. **P2 — Opt-in learning-outcome research.** Collect only anonymized, consented measures with a preregistered analysis and deletion plan. Done after ethics/privacy review, never as default telemetry.
113. **P1 — Python/Jupyter adapter.** Load manifests, rerun core models, and verify bundles from notebooks without reimplementing semantics. Done with cross-language golden fixtures.
114. **P2 — Julia package bridge.** Expose the same schemas and validation contracts to the independent Julia reference path. Done with bidirectional artifact round trips.
115. **P1 — RO-Crate/FAIR research packaging.** Map datasets, software, people/roles, methods, licenses, and provenance to a standard crate. Done when an external validator accepts the export.
116. **P2 — HDF5/NetCDF large-data export.** Preserve dimensions, units, compression, and chunking for long ensembles. Done with independent Python/Julia readers and checksum comparison.
117. **P1 — Dataset DOI workflow.** Mint/version data artifacts separately from software releases and link exact source/model manifests. Done with a dry-run plus one verified public example before general availability.
118. **P2 — Capability-scoped extension SDK.** Let plugins declare model/UI/storage/network needs and run behind explicit boundaries. Done with a malicious extension fixture that cannot escape its grant.
119. **P1 — Extension compatibility suite.** Give third-party model authors schema, lifecycle, accessibility, and numerical-validation tests. Done when an example external model passes without internal imports.
120. **P1 — Public benchmark datasets.** Publish representative clean/noisy/sensor/chaos datasets with licenses, expected ranges, and blind test partitions. Done with versioned hashes and leakage checks.
121. **P1 — Structured novice/expert usability studies.** Measure task completion, misconception rate, evidence quality, and accessibility—not preference alone. Done with prioritized findings tied to releases.
122. **P2 — Community terminology review.** Let educators/researchers propose glossary changes with sources and locale review. Done without allowing UI strings to drift from the approved glossary.
123. **P1 — Reproducible hardware-calibration kit.** Publish dimensions, fiducials, camera placement, IMU alignment, uncertainty, and test recordings. Done when two independent setups recover known parameters within bounds.
124. **P0 — Scientific contribution governance.** Require derivation, limitations, oracle, property tests, performance budget, and reviewer sign-off for a new research-grade model. Done through the pull-request template and CI.
125. **P2 — Reproducibility challenge corpus.** Invite independent reruns against frozen artifacts and publish failures as first-class results, not a vanity leaderboard. Done with identity/privacy rules and auditable scoring.

