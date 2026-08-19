# Pendulum Lab product audit — 2026-08-13

Scope: `elliotjung/pendulum-lab` and its companion
`elliotjung/pendulum-landing`, treated as one product. Findings are intentionally
concrete and non-duplicative. Status uses **done** for changes implemented in
this pass, **existing** for a sound control already present, and **next** for
work that needs a separate evidence or design cycle.

## Physics and numerical analysis

1. **done** — Make the landing demo's damping part of every RK4 stage instead of applying an operator-split velocity decay after the step (`pendulum-demo-kernel.js`, `orbit-console.js`).
2. **done** — Keep the cinematic hero explicitly conservative while the console accepts damping, so both surfaces state their actual model (`scene.js`, demo-kernel tests).
3. **done** — Pin the landing kernel's damped RHS against the Lab force-level damping convention with browser tests.
4. **existing** — Preserve the allocation-free RK4 work buffers used by both landing simulations.
5. **existing** — Keep the hero fixed step at 240 Hz and cap catch-up work after suspended frames.
6. **existing** — Keep the console fixed step independent of display refresh and bound its accumulator.
7. **existing** — Maintain the analytic double-pendulum Jacobian for tangent-space diagnostics (`src/physics/double.ts`).
8. **existing** — Retain the mass-matrix determinant guard for degenerate double-pendulum parameters.
9. **next** — Return a structured singularity diagnostic from `rhsDouble` rather than silently writing zero acceleration at the threshold.
10. **next** — Scale the determinant threshold relative to the mass-matrix norm for extreme unit scales.
11. **existing** — Preserve Cholesky-first / pivoted-GE fallback for spherical chain solves.
12. **next** — Promote the globally regular embedded spherical-chain chart as the default near polar singularities.
13. **next** — Add automatic polar-to-embedded chart switching with invariant-preserving state conversion.
14. **existing** — Continue to label theta/omega split methods as pseudo-coordinate approximations.
15. **existing** — Reserve true symplectic claims for canonical, undamped, converged implicit methods.
16. **next** — Surface implicit residual and iteration-limit failures directly beside the integrator selector.
17. **existing** — Retain Dormand–Prince rejection/acceptance counts in adaptive integration metadata.
18. **next** — Export the accepted adaptive-step sequence for bit-for-bit replay of adaptive runs.
19. **existing** — Keep Poincaré crossings sub-step refined rather than snapped to the integrator grid.
20. **next** — Report section root residual and direction in every Poincaré export row.
21. **existing** — Preserve energy drift as a conservative-run diagnostic only.
22. **next** — Add a dissipated-work balance diagnostic for damped runs instead of showing only energy change.
23. **existing** — Keep independent SciPy, SymPy and Julia reference paths separate from the browser implementation.
24. **next** — Add interval/error-bound language to the external-reference report where chaotic divergence dominates absolute error.
25. **existing** — Retain seeded/property invariant tests over mass, length and state ranges.
26. **next** — Add fuzzed invalid-parameter tests at all public physics entry points, not only worker/import boundaries.
27. **next** — Return per-component embedded errors so adaptive controllers normalize `|e_i| / (atol + rtol * scale_i)` instead of applying one global absolute maximum to every scale.
28. **next** — Reject a tolerance failure at `minDt` with an explicit failure result rather than silently accepting the inaccurate state.
29. **next** — Validate adaptive duration, step limits, tolerances, safety factors, controller order and factor bounds at every public entry point.
30. **next** — Report whether adaptive integration reached the requested final time when its iteration budget is exhausted.
31. **next** — Either use genuine reject/retry step control in the live Lab or label fixed-macro-step embedded methods as monitored fixed-step methods.
32. **next** — Complete the DOP853 E3/E5 combined error estimator or narrow the displayed method claim to the implemented estimator.
33. **next** — Validate GBS extrapolation depth and add adaptive order/macro-step selection before calling it fully adaptive.
34. **next** — Fail closed and surface diagnostics when implicit midpoint, Gauss–Legendre or TR-BDF2 does not converge.
35. **next** — Pass the analytic double-pendulum Jacobian to Newton-based Lab steppers rather than relying on finite-difference fallback.
36. **next** — Reuse explicit/implicit integrator stage arrays instead of allocating new scratch vectors on every physics step.
37. **next** — Replace triple-pendulum per-RHS matrix allocation with a reusable, conditioned SPD solve and explicit failure diagnostic.
38. **done** — Align the core double-pendulum damping derivation with the implemented generalized-force convention `M(q)q̈ = F(q,q̇) - gamma q̇`.
39. **done** — Stop presenting damped-run mechanical-energy change as a red/amber numerical failure; label it as physical dissipation (a full dissipated-work balance and mixed scale remain future work).
40. **next** — Advance displayed simulation time from accepted-step metadata to avoid unbounded repeated-addition error.

## Lab architecture, rendering, performance, and UX

41. **done** — Selecting Explore from the home/mode chooser must activate the real Lab panel, not merely change UI complexity.
42. **done** — Canonicalize that transition to `?tab=lab` while preserving unrelated query parameters and the hash.
43. **done** — Cover the icon → chooser → Explore → Lab path with an E2E regression test (executed successfully before the final lazy-failure hardening; the final-source rerun was sandbox-blocked).
44. **done** — Synchronize tab selection with browser history without reloading the simulation.
45. **done** — Handle back/forward navigation through the same guarded tab router.
46. **done** — Do not create duplicate history entries when reselecting the active Lab.
47. **done** — Keep the rail logo keyboard-equivalent for Enter and Space.
48. **done** — Add a restrained logo hover/press response while keeping the scientific visual language.
49. **done** — Add icon motion to menu expansion without animating layout-heavy properties.
50. **done** — Add pressed feedback to buttons with touch-hover neutralization.
51. **done** — Make submenu arrival use opacity/transform rather than costly geometry animation.
52. **done** — Give active tabs a subtle state transition that does not obscure selection.
53. **done** — Add panel-collapse feedback and keep it covered by reduced-motion rules.
54. **existing** — Preserve modal focus trapping and focus restoration for the audience chooser.
55. **existing** — Keep non-active tab panels inert and `aria-hidden`.
56. **existing** — Maintain roving tab index and arrow-key navigation inside rail tablists.
57. **next** — Add `aria-current` to the active workflow-strip step in every tab.
58. **existing** — Retain 44 px coarse-pointer targets for primary controls.
59. **next** — Enlarge the few remaining 36–42 px desktop-only rail targets when zoom reaches 200%.
60. **existing** — Keep the compact rail breakpoint tied to layout width rather than pointer type.
61. **existing** — Preserve visual-viewport CSS variables for mobile browser chrome and virtual keyboards.
62. **next** — Add a ResizeObserver-based canvas size contract where a tab can resize without a window resize.
63. **existing** — Keep DPR and trail-length quality budgets centralized in `LabQualityBudget`.
64. **next** — Feed long-task observations into quality degradation, not FPS alone.
65. **existing** — Retain worker/offscreen paths for main canvas and side plots with explicit fallbacks.
66. **next** — Add a worker teardown assertion after repeated Lab mount/unmount cycles.
67. **existing** — Keep analysis tabs dynamically imported and prefetch only on intent.
68. **next** — Abort stale dynamic-tab initialization when a user switches away before import completion.
69. **existing** — Preserve the simulation clock's bounded catch-up behavior.
70. **next** — Expose dropped-simulation-time count in Trust & Diagnostics.
71. **existing** — Keep renderer buffers reusable and avoid frame-path object allocation.
72. **next** — Pool remaining temporary arrays in high-frequency phase-space plot transforms.
73. **existing** — Preserve WebGL trail feature gating and Canvas2D fallback.
74. **next** — Add explicit WebGL context loss/restoration E2E coverage to the Lab, matching Landing coverage.
75. **existing** — Keep all imported JSON guarded before DOM or engine mutation.
76. **done** — Stop adding duplicate FFT/history/recording samples on display frames that advanced zero physics steps (uniform accepted-step resampling remains a future extension).
77. **next** — Preserve and expose bounded catch-up debt instead of dropping the entire accumulator remainder silently.
78. **done** — Reset the wall-clock accumulator on pause/resume so resuming cannot inject a catch-up jump.
79. **next** — Pause hidden Lab physics/analysis work or make background continuation an explicit user setting.
80. **next** — Replace shifting render/history arrays with bounded rings and accumulated totals on high-frequency paths.
81. **next** — Add full Lab teardown for workers, audio, idle work, GPU resources, timers and global listeners.
82. **done** — Remove the Phase 3D duplicate interval, use bounded elapsed-time integration, and configure DPR-aware backing-store resize.
83. **next** — Recover main/side canvases and pointer wiring after an OffscreenCanvas worker failure.
84. **next** — Fit renderer scale and pivot to total chain length and viewport aspect ratio to avoid mobile clipping.
85. **next** — Preserve pause state across reset and make drag-to-set coalesce pointer moves instead of fully resetting each event.

## Landing, cinematic motion, responsive design, and accessibility

86. **existing** — Use the actual double-pendulum equations for the hero rather than a decorative rotation.
87. **existing** — Advance both primary and nearby trajectories through the same deterministic RK4 kernel.
88. **existing** — Keep the 3D camera/stage transformation separate from physical joint motion.
89. **existing** — Preserve depth trails, nearby-orbit divergence and scroll-driven camera descent.
90. **done** — Make console damping numerically consistent with the Lab model.
91. **done** — Add complete abortable listener cleanup for the trajectory console.
92. **done** — Disconnect console ResizeObserver and IntersectionObserver on terminal page hide.
93. **done** — Cancel RAF, resize RAF, reset RAF and idle warm-up work on disposal.
94. **done** — Resume safely from BFCache without registering duplicate listeners.
95. **done** — Expose a small console lifecycle hook for deterministic cleanup tests.
96. **existing** — Stop the hero outside its visible hero/descent regions.
97. **existing** — Pause both simulations when the document is hidden.
98. **existing** — Avoid eagerly downloading Three.js until pointer, keyboard, scroll or explicit-toggle intent.
99. **existing** — Probe WebGL2 before importing the heavy hero bundle.
100. **existing** — Keep a static art path for reduced motion, reduced data and low-memory devices.
101. **existing** — Cap hero DPR separately for compact and cinematic tiers.
102. **existing** — Degrade post-processing after sustained high render cost.
103. **next** — Allow the balanced quality tier to recover after a long stable window, with hysteresis.
104. **existing** — Use shared geometry for line/spark/halo trail passes rather than duplicate buffers.
105. **next** — Drop the widest haze pass on integrated GPUs before lowering DPR.
106. **existing** — Idle-slice deterministic trail prewarming to avoid startup long tasks.
107. **next** — Use scheduler `postTask` when available while retaining idle/timer fallbacks.
108. **existing** — Batch scroll reads/writes through one RAF and cache section geometry.
109. **existing** — Keep reveal effects one-shot and transform/opacity-only.
110. **existing** — Preserve section depth variables without per-element scroll listeners.
111. **existing** — Keep `content-visibility:auto` on below-fold bands.
112. **next** — Audit contain-intrinsic-size values against KO text height to reduce late scroll correction.
113. **existing** — Maintain a CSS-only usable small-screen menu.
114. **next** — Add menu open/close state announcement for screen-reader users on mobile.
115. **existing** — Retain first-focus skip navigation and a focusable main target.
116. **existing** — Keep EN and KO as separate static documents with no translation cost at runtime.
117. **next** — Replace the CSP-hashed inline language boot with an external blocking micro-script if measurable startup remains equal.
118. **existing** — Preserve moderate-or-higher axe gates for both languages.
119. **existing** — Retain forced-colors, increased-contrast and print adaptations.
120. **existing** — Keep all primary CTAs as direct, meaningful Lab deep links.
121. **existing** — Keep Landing links on canonical Lab routes and preserve experiment parameters (static contract covered; live cross-repository follow-through remains item 122).
122. **next** — Add a live deployment link-check that follows one Landing CTA through the Lab's final route.
123. **existing** — Maintain responsive image variants for the app preview and hero fallback.

## Maintainability, build, deployment, and documentation

124. **done** — Add this single cross-repository product audit with explicit statuses rather than disconnected wish lists.
125. **done** — Rewrite the Lab README quick start around supported Node, install, dev, test and production build.
126. **done** — Document the two-repository relationship and visual-system split from the Lab side.
127. **done** — Expand Landing README with the shared physics kernel, 3D lifecycle and cleanup contract.
128. **done** — Document the exact double-pendulum equations and state convention used by Landing.
129. **done** — Document RK4 step size, damping semantics and catch-up limits.
130. **done** — Document both GitHub Pages workflows and their default-branch trigger differences.
131. **done** — State that Lab Pages deploys only after mainline validation and full production E2E.
132. **done** — State that Landing Pages publishes an allowlisted static artifact after browser/Lighthouse gates.
133. **existing** — Keep generated `ko.html` and `scene.bundle.js` freshness checks fail-closed.
134. **existing** — Retain the landing bundle transfer ceiling.
135. **next** — Add gzip and Brotli ceilings for the Landing Three.js bundle, not raw bytes alone.
136. **existing** — Preserve Lab raw/gzip/Brotli budgets for initial and lazy chunks.
137. **existing** — Keep exact Actions SHAs rather than floating action tags.
138. **next** — Consolidate duplicated CI install/check prefixes into a reusable workflow after measuring maintenance benefit.
139. **existing** — Continue to publish only explicit allowlists to Landing Pages.
140. **existing** — Keep Lab production assets built once and reused for E2E and deployment.
141. **next** — Add artifact SHA display to both deployed footers for release correlation.
142. **existing** — Keep evidence/changelog/demo-kernel provenance pinned to immutable source commits.
143. **next** — Automatically sync the Landing demo-kernel source text from a generated Lab package artifact, not only its manifest.
144. **existing** — Retain zero high-severity npm-audit gates in both repositories.
145. **done** — Re-run TODO/FIXME, mojibake, legacy-risk, dependency and static console-contract audits after changes.
146. **next** — Review final diffs for generated noise, secrets and accidental artifacts immediately before staging.
147. **next** — Restore GitHub CLI authentication before publication; never claim push/deploy while the token is invalid.
148. **next** — Verify both public Pages URLs against the pushed commit SHA after Actions completes.

## Implementation policy

This pass deliberately avoids a framework migration, an animation dependency,
or a physics-engine rewrite. Existing validated numerical paths, the Lab's
minimal/scientific character, and the Landing's cinematic/exploratory character
remain intact. “Next” items require either a scientific validation cycle,
cross-browser performance evidence, or repository-owner credentials and are not
represented as completed.
