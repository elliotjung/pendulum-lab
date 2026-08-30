# Testing strategy

How this repository decides that a change is correct, and which gate catches
which class of regression. The companion policies are
[`artifact-policy.md`](artifact-policy.md) (what generated evidence is
committed) and [`api-overview.md`](api-overview.md) (public API stability).

## The ordered local gate

Every change must pass `npm run verify` before it is claimed done:

1. `lint` — source-policy lint (`scripts/lint-source.ts`: no `innerHTML`,
   CSP-safe DOM construction) plus ESLint with `--max-warnings 0`.
2. `typecheck` — strict `tsc` including `noUncheckedIndexedAccess`.
3. `claims:check` and `quality:contracts` — validate the canonical claim
   registry, numerical risk register, Actions runtime/pins, and the checked
   reference-to-ensemble interpretation example.
4. `audit:markdown-assets`, `audit:public-artifacts`, and `audit:modules` —
   validate referenced public files and hold every source file to the
   default per-file line cap, so orchestrators cannot grow silently and new
   modules stay focused.
5. `smoke:miniflare-images` — verify the worker image route before unit results
   are promoted.
6. `test:json` — the full Vitest unit suite, written as a machine-readable
   report to `reports/vitest-results.json`. The JSON reporter prints almost
   nothing to stdout, which is why the next step exists.
7. `test:check` — re-reads the JSON report and hard-fails unless
   `numPassedTests === numTotalTests` with zero failed suites. A green verify
   therefore genuinely means every test passed.
8. `docs:sync` — rewrites synced test counts in the README and docs from the
   successful report, so quoted numbers cannot drift from measured results.
   It deliberately does not rewrite public release evidence from a dirty
   development worktree.
9. `validate:scope` — records the independent-validation boundary without
   claiming unavailable external tools or hardware as local evidence.
10. `format:check` — the repository Prettier config is enforced last for all
   TypeScript/JSON sources (markdown prose is exempt because the `docs:sync`
   generators own its synced numbers).

`npm run release:evidence:check` is intentionally separate from the local
verification gate. It proves that the committed public evidence is clean,
fresh, provenance-bound and release-ready; `npm run evidence:refresh` may
only be run from a clean committed tree. This separation prevents a developer
worktree from being presented as public release evidence while keeping
ordinary implementation verification runnable before a commit exists.

## Unit suite conventions

- **Measured thresholds, not guessed ones.** Numerical assertions are pinned
  from probe runs of the real implementation (convergence orders, drift
  bounds, Lyapunov exponents, onset locations), then guarded with tolerances
  that fail on regression rather than on noise.
- **Oracle ladder.** Where possible a result is checked against, in order:
  closed-form/analytic values, the double-double extended-precision reference,
  the independent SciPy DOP853 cross-validation, the pinned Julia
  OrdinaryDiffEq Vern9 gate, and published literature anchors
  (`npm run validate:reference`, `validate:cross`, `validate:sympy`,
  `validate:julia`, `validate:literature`).
- **Property and invariant tests.** `tests/property-invariants.test.ts` and
  the physics edge-case suites assert seeded-random invariants (energy
  conservation, symplectic pairing, mass-matrix positive-definiteness,
  round-trip import/export) instead of single fixtures.
- **Determinism.** Replay determinism and provenance hashing have dedicated
  suites; anything nondeterministic must carry an explicit seed.

## Test tiers

- `npm run test:quick` — the suite minus the slow files listed in
  `vitest.tiers.ts`; the fast PR signal.
- `npm run test:slow` — only those slow files (long-horizon basins,
  continuation, correlation dimension, stochastic ensembles).
- `npm test` / `test:json` — everything; this is what `verify` runs.

CI wires the tiers as: PR verify runs `test:quick` first for fast failure,
then the full gate; Mainline Full Validation additionally runs `test:slow`
and the coverage run.

## Browser (Playwright) coverage

Projects: `chromium`, `firefox`, `webkit`, `mobile-chrome`, `mobile-webkit`
(`playwright.config.ts`). The dev server serves `app.html` at `/`.

- `npm run smoke` — boot, tab switching, export, validation in Chromium; runs
  on every PR.
- `npm run test:e2e:mainline` — the mainline set (smoke, accessibility,
  lazy-mount, research storage/ZIP/design/workbench, Trust Inspector,
  long-run and performance smoke) on mainline pushes.
- Cross-engine smokes and the mobile projects run in Mainline Full
  Validation; engine-specific caveats (software-compositor rAF starvation)
  are documented in the specs that gate them.
- **Visual regression** — `e2e/visual-regression.spec.ts` compares committed
  per-platform Chromium and mobile-Chrome baselines for Linux, Windows, and
  macOS. Native runner metadata binds the Chromium executable, runner image,
  fonts, scale, locale, source commit, and PNG hashes. Baselines are regenerated
  deliberately, reviewed by eye, and promoted through a read-only review
  artifact or an explicitly requested policy-compatible PR; see
  [`visual-baseline-promotion.md`](visual-baseline-promotion.md).

## Coverage, mutation, and performance gates

- **Coverage scope** (CI): `npm run test:coverage` plus
  `coverage:scope`, which fails if any new `src/**/*.ts` file is missing from
  the v8 coverage map. Browser-only/DOM modules are consciously listed in
  `config/coverage-scope-baseline.json` because the unit environment is
  headless Node.
- **Mutation testing** (nightly): the sharded Stryker workflow aggregates with
  `mutation:aggregate`. The historical 60% break floor prevents a severe
  regression; the quality target requires both total and covered mutation
  scores to reach 70%. Survivors and timeouts have separate machine/human
  triage, and a timeout increase needs a reviewed failure classification.
- **Risk-focused coverage**: `documents/testing-risk-register.json` binds the
  adaptive, implicit, event, import, cancellation, and resource-boundary areas
  to source, named tests, and injected failures. The promotion targets are 65%
  line/statement and 60% branch/function for that designated surface; the
  measured report, not this policy sentence, decides whether they pass.
- **CSS reachability**: `npm run audit:css-coverage` unions two independent
  Chromium launches across locale, disclosure mode, theme, viewport, print,
  reduced-motion, forced-color, focus/hover, delayed, and overlay states. A
  candidate still needs source review and the three native visual gates before
  deletion; Chromium cannot decide Firefox/WebKit-only reachability.
- **Performance**: PRs run a real A/B benchmark (merge-base vs candidate
  served on separate ports in one browser process); mainline runs the
  browser benchmark, the long-run energy-drift ranking, and a hard
  memory-regression gate against the committed baseline.
- **Cold/warm and flakes**: the schemas under `documents/schemas/` keep one
  uncalibrated cold sample separate from at least three warm runs and preserve a
  30-day browser-flake ledger with raw traces, a 1% alert threshold, and expiring
  upstream exceptions. These are evidence contracts; collecting Landing and
  hosted-browser history remains a separate run responsibility.
- **Bundle budget**: `npm run budget` fails the build when initial/chunk/
  standalone assets exceed the committed raw/gzip/brotli budgets, and writes an
  exact standalone HTML byte partition plus a non-additive functional proxy.

## Generated-artifact drift gates

Committed generated artifacts are never hand-edited; each has a checker that
rebuilds and compares:

- `check:standalone-sync` — the portable standalone HTML matches the
  committed SHA-256 manifest.
- `check:wasm-sync` — the committed WASM ensemble kernel matches its
  AssemblyScript source.
- `test:visual:contract` — the visual-baseline set is complete per platform.
- `audit:legacy` / `audit:mojibake:strict` — the no-legacy-risk and encoding
  contracts stay at zero findings.

## What is deliberately not tested here

Real-GPU WebGPU execution, cross-vendor hardware evidence, and
platform-specific visual baselines require hardware or accounts this
repository cannot exercise headlessly; they are tracked as explicit external
steps in [`expansion-gates.md`](expansion-gates.md) and the worldclass scorecard
rather than being claimed as covered. Manual assistive-technology use, tagged
PDF inspection, and classroom/user comprehension likewise stay external even
when automated accessibility and document-generation tests pass.
