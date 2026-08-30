# Pendulum Lab Documentation

Use this page as the table of contents for the repository. Start with the job
you are trying to do; the subject index below is the second level when you need
more detail.

## Choose by purpose

| If you want to… | Read this first | Then |
| --- | --- | --- |
| Run and interpret an experiment | [`scientific-accountability.md`](scientific-accountability.md#reading-a-chaotic-trajectory) | [`known-limitations.md`](known-limitations.md) |
| Understand equations or numerical methods | [`derivations.md`](derivations.md) | [`scientific-accountability.md`](scientific-accountability.md#numerical-method-accountability) |
| Check a claim or review evidence | [`scientific-accountability.md`](scientific-accountability.md#claims-tests-and-understanding) | [`reviewer-kit.md`](reviewer-kit.md) |
| Reproduce the paper | [`tutorial-reproduce-paper.md`](tutorial-reproduce-paper.md) | [`flagship-result.md`](flagship-result.md) |
| Use the library | [`api-overview.md`](api-overview.md) | generated TypeDoc via `npm run docs:api` |
| Contribute code | [`architecture.md`](architecture.md) | [`testing-strategy.md`](testing-strategy.md) |
| Audit quality gates | [`quality-evidence-contracts.md`](quality-evidence-contracts.md) | [`artifact-policy.md`](artifact-policy.md) |
| Publish or coordinate both repositories | [`public-release-routine.md`](public-release-routine.md) | [`cross-project-release.md`](cross-project-release.md) |
| See the complete inventory and command map | [`project-reference.md`](project-reference.md) | this subject index |
| Understand work that still needs external evidence | [`expansion-gates.md`](expansion-gates.md) | [`external-owner-checklist.md`](external-owner-checklist.md) |

For the two-repository product boundary, shared physics/link contract, local
verification and Pages workflow, start with
[`product-integration.md`](product-integration.md). The numbered whole-product
audit is [`PRODUCT_AUDIT_2026-08-13.md`](PRODUCT_AUDIT_2026-08-13.md).
The post-remediation, evidence-gated expansion plan is
[`WORLD_CLASS_BACKLOG_2026-08-19.md`](WORLD_CLASS_BACKLOG_2026-08-19.md).
The item-by-item implementation, release-gate, and external-evidence record is
[`REMEDIATION_2026-08-19.md`](REMEDIATION_2026-08-19.md).

## Start Here

- [`project-reference.md`](project-reference.md) - detailed repository boundary,
  capability inventory, command catalogue, deployment outline, and portfolio
  context moved out of the top-level README.
- [`architecture.md`](architecture.md) - runtime shape, TypeScript boot flow,
  module boundaries, and the legacy-removal history.
- [`api-overview.md`](api-overview.md) - public package/API stability policy.
- [`known-limitations.md`](known-limitations.md) - scientific and numerical
  caveats that the UI must surface honestly.
- [`performance.md`](performance.md) - quality modes, slowdown triage, and
  performance regression signals.
- [`security.md`](security.md) - CSP, import validation, and DOM safety rules.

## Numerics And Physics

- [`scientific-accountability.md`](scientific-accountability.md) -
  implemented/tested/understood distinctions, numerical assumptions and
  failures, non-claims, and reference-to-ensemble interpretation.
- [`numerics.md`](numerics.md) - integrator behavior, convergence expectations,
  and diagnostics.
- [`derivations.md`](derivations.md) - equations of motion and conserved
  quantities for the supported systems.
- [`device-simulation-mapping.md`](device-simulation-mapping.md) - how the
  pendulum work maps to TCAD/device-simulation habits.
- [`examples/study-spec-example.json`](examples/study-spec-example.json) -
  example batch-study specification.

## Validation And Reproducibility

- [`quality-evidence-contracts.md`](quality-evidence-contracts.md) - standalone
  attribution, publication freshness, baseline fingerprints, mutation/CSS,
  performance, flake, and Actions policy contracts.
- [`testing-strategy.md`](testing-strategy.md) - the ordered verify gate, test
  tiers, oracle ladder, and which gate catches which regression class.
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
- [`visual-baseline-promotion.md`](visual-baseline-promotion.md) - native
  Linux/Windows/macOS regeneration, runner fingerprints, manual review artifact,
  complete-set validation, and optional policy-compatible PR promotion.

## Research Workbench

- [`engine-overview.md`](engine-overview.md) - high-level engine capabilities.
- [`schema-migrations.md`](schema-migrations.md) - persisted workspace storage
  and migration expectations.
- [`artifact-policy.md`](artifact-policy.md) - which generated artifacts are
  committed, regenerated, or kept out of git.
- [`deferred-work.md`](deferred-work.md) - intentionally deferred scope and the
  reason each item is not claimed as complete.
- [`expansion-gates.md`](expansion-gates.md) - explicit physical GPU,
  representative performance, camera, independent-formulation, large-data, and
  education/user-study evidence gates.

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
- [`education/student-lab-template-ko.md`](education/student-lab-template-ko.md),
  [`education/teacher-rubric-ko.md`](education/teacher-rubric-ko.md), and
  [`education/uncertainty-repro-checklist-ko.md`](education/uncertainty-repro-checklist-ko.md)
  - ready-to-use student, teacher, uncertainty, and reproducibility materials.
- [`education/submission-schema.md`](education/submission-schema.md) and
  [`examples/student-submission-template.csv`](examples/student-submission-template.csv)
  - machine-checkable classroom submission contract and starter file.
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
