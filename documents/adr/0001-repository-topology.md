# ADR 0001: Two repositories, not a monorepo

- **Status:** accepted (2026-07-10)
- **Deciders:** Elliot Jung
- **Context surfaces:** `pendulum-lab` (simulation platform), `pendulum-landing` (landing page)

## Question

The simulation platform and its landing page are tightly coupled — the landing
quotes the platform's evidence (test counts, GPU status, mutation score) and
ships a distilled demo kernel of `rhsDouble`. Should they merge into one
pnpm-workspace monorepo, or stay two repositories?

## Decision

**Keep two repositories.** The coupling is real but narrow: exactly one
evidence artifact (`evidence-summary.json`) plus a demo-kernel manifest whose
behavioral parity is pinned by a landing smoke test. That seam is now held
together *structurally* rather than by checklist:

- `pendulum-lab/.github/workflows/evidence-dispatch.yml` fires a
  `repository_dispatch` at the landing repo whenever the committed evidence
  summary changes on the default branch;
- `pendulum-landing/.github/workflows/evidence-sync.yml` pulls the summary,
  realigns the kernel-manifest provenance, re-runs the full static gate and
  the kernel-parity smoke test, and only then auto-commits to `main` (which
  GitHub Pages serves); a weekly cron catches missed dispatches;
- releases additionally dispatch `pendulum-release`, and landing CI verifies
  the dispatched source commit against the evidence it is serving
  (`PENDULUM_EXPECTED_SOURCE_COMMIT`).

## Why not a monorepo

- **GitHub Pages topology.** Both surfaces are project Pages sites with their
  own URLs (`…/pendulum-lab/`, `…/pendulum-landing/`). One repo can serve only
  one Pages site; merging means path juggling or losing a URL, for no user
  benefit.
- **Blast radius and cadence.** The platform runs a heavy CI matrix (full
  validation, benchmarks, mutation shards, GPU lanes); the landing runs a
  seconds-fast static gate. Merging couples every landing typo fix to the
  platform's mainline pipeline and vice versa.
- **Dependency graphs are disjoint.** The landing is deliberately
  dependency-free at runtime (self-hosted vendor three.js/GSAP, one Playwright
  devDep). A workspace would share nothing but tooling noise.
- **The one real monorepo benefit — atomic cross-repo changes — is rare
  here** (evidence schema changes), and the sync workflow turns those into a
  dispatch-verified two-step rather than a foot-gun.

## Consequences

- Cross-repo evidence flow is automated; the manual step in
  `documents/cross-project-release.md` becomes a fallback, not the mechanism.
- The landing repo needs the `LANDING_DISPATCH_TOKEN` secret in this repo
  (already required by the release workflow) and grants its own
  `contents: write` to the sync workflow.
- Schema changes to `evidence-summary.json` must stay backward-compatible or
  land in lockstep with a landing-side check update; the sync workflow's full
  gate fails loudly if they do not.

## Revisit triggers

Reopen this decision if (a) a second substantial shared artifact appears,
(b) the landing grows a build step that wants the platform's toolchain, or
(c) Pages topology stops mattering (custom domain consolidation).
