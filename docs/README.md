# Pendulum Lab Documentation

Use this page as the table of contents for the repository. The app is a browser
simulation surface, a typed TypeScript library, and a reproducible research
package; the docs are grouped by those jobs.

## Start Here

- [`architecture.md`](architecture.md) - runtime shape, TypeScript boot flow,
  module boundaries, and the legacy-removal history.
- [`api-overview.md`](api-overview.md) - public package/API stability policy.
- [`known-limitations.md`](known-limitations.md) - scientific and numerical
  caveats that the UI must surface honestly.
- [`performance.md`](performance.md) - quality modes, slowdown triage, and
  performance regression signals.
- [`security.md`](security.md) - CSP, import validation, and DOM safety rules.

## Numerics And Physics

- [`numerics.md`](numerics.md) - integrator behavior, convergence expectations,
  and diagnostics.
- [`derivations.md`](derivations.md) - equations of motion and conserved
  quantities for the supported systems.
- [`device-simulation-mapping.md`](device-simulation-mapping.md) - how the
  pendulum work maps to TCAD/device-simulation habits.
- [`examples/study-spec-example.json`](examples/study-spec-example.json) -
  example batch-study specification.

## Validation And Reproducibility

- [`flagship-result.md`](flagship-result.md) - Melnikov threshold vs
  period-doubling onset result.
- [`reproducibility.md`](reproducibility.md) - external SciPy/SymPy checks,
  report generation, and repeatable runs.
- [`tutorial-reproduce-paper.md`](tutorial-reproduce-paper.md) - step-by-step
  reproduction path for the mini-paper.
- [`reviewer-kit.md`](reviewer-kit.md) - reviewer package contents and how to
  inspect evidence.
- [`hardware-validation.md`](hardware-validation.md) - physical experiment and
  isolated one-time NVIDIA/AMD guest-runner procedure.
- [`reference-manifest.md`](reference-manifest.md) - report and artifact
  manifest conventions.

## Research Workbench

- [`engine-overview.md`](engine-overview.md) - high-level engine capabilities.
- [`schema-migrations.md`](schema-migrations.md) - persisted workspace storage
  and migration expectations.
- [`artifact-policy.md`](artifact-policy.md) - which generated artifacts are
  committed, regenerated, or kept out of git.
- [`deferred-work.md`](deferred-work.md) - intentionally deferred scope and the
  reason each item is not claimed as complete.

## Release And Portfolio

- [`release-packaging.md`](release-packaging.md) - package and release artifact
  assembly.
- [`RELEASING.md`](RELEASING.md) - release checklist.
- [`public-release-routine.md`](public-release-routine.md) - public readiness
  routine for GitHub Pages, npm, DOI, and reviewer materials.
- [`external-owner-checklist.md`](external-owner-checklist.md) - executable
  account, device, accessibility, and publication owner actions.
- [`submission-tracks.md`](submission-tracks.md) - KPS/ISEF/Samsung candidate
  routes with official-source freshness policy and reviewer-kit mapping.
- [`curriculum-mapping-ko.md`](curriculum-mapping-ko.md) - one-page Korean
  Physics I/II and AP Physics C classroom mapping.
- [`portfolio-korean.md`](portfolio-korean.md) - Korean portfolio summary.
- [`portfolio-summary.html`](portfolio-summary.html) - rendered portfolio page.
- [`articles/01-melnikov-vs-period-doubling-ko.md`](articles/01-melnikov-vs-period-doubling-ko.md)
  and [`articles/02-how-a-student-built-verifiable-chaos-research-ko.md`](articles/02-how-a-student-built-verifiable-chaos-research-ko.md)
  - Korean technical-explainer series.

## Maintenance Notes

- Generated dependency folders, build outputs, Playwright reports, TypeDoc
  output, and transient reports are ignored by `.gitignore`.
- `npm run build:standalone` generates the portable release HTML from
  `app.html` under the ignored `standalone/` directory. Release automation
  attaches that file to GitHub Releases, while `standalone-manifest.json`
  keeps the committed integrity hashes.
- Keep new docs linked from this file so reviewers can find the current source
  of truth without scanning the whole repository.
