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
3. `audit:modules` — module-size ratchet: a default per-file line cap plus
   exact-pinned ratchets for known-large modules, so orchestrators cannot grow
   silently and new modules stay focused.
4. `test:json` — the full Vitest unit suite, written as a machine-readable
   report to `reports/vitest-results.json`. The JSON reporter prints almost
   nothing to stdout, which is why the next step exists.
5. `test:check` — re-reads the JSON report and hard-fails unless
   `numPassedTests === numTotalTests` with zero failed suites. A green verify
   therefore genuinely means every test passed.
6. `docs:sync` — regenerates the evidence summary and rewrites the synced test
   counts in the README and docs from the report, so quoted numbers cannot
   drift from measured results.
7. `format:check` — the repository Prettier config is enforced last for all
   TypeScript/JSON sources (markdown prose is exempt because the `docs:sync`
   generators own its synced numbers).

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
  per-platform baselines (win32 and Linux Chromium + mobile-chrome).
  Baselines are regenerated deliberately, reviewed by eye, and promoted via
  the manual `Visual Baselines (Linux)` workflow; see
  [`visual-baseline-promotion.md`](visual-baseline-promotion.md).

## Coverage, mutation, and performance gates

- **Coverage scope** (CI): `npm run test:coverage` plus
  `coverage:scope`, which fails if any new `src/**/*.ts` file is missing from
  the v8 coverage map. Browser-only/DOM modules are consciously listed in
  `config/coverage-scope-baseline.json` because the unit environment is
  headless Node.
- **Mutation testing** (nightly): the sharded Stryker workflow aggregates with
  `mutation:aggregate` and enforces break/low/high bands, so assertion
  strength is tracked, not just line coverage.
- **Performance**: PRs run a real A/B benchmark (merge-base vs candidate
  served on separate ports in one browser process); mainline runs the
  browser benchmark, the long-run energy-drift ranking, and a hard
  memory-regression gate against the committed baseline.
- **Bundle budget**: `npm run budget` fails the build when initial/chunk/
  standalone assets exceed the committed raw/gzip/brotli budgets.

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
steps in [`deferred-work.md`](deferred-work.md) and the worldclass scorecard
rather than being claimed as covered.
