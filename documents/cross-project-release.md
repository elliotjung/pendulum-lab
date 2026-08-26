# Cross-Project Single-Trigger Release

A single annotated `v*` tag in `elliotjung/pendulum-lab` is the release trigger
for both repositories. The simulator release is kept as a draft until the
landing repository has synchronized the exact release evidence, passed its
static/browser/accessibility/Lighthouse gates, created the matching tag, and
deployed the same commit to Pages.

## Coordinate policy

Two coordinates exist and they are deliberately not interchangeable:

- **Continuous Pages evidence** is identified by the Lab source commit, the
  successful Mainline run id, the successful Pages run id and attempt, plus
  SHA-256 values for the deployed evidence, Landing kernel, kernel manifest,
  and Lab deployment manifest. `Evidence Dispatch` waits until the exact
  evidence and deployment-manifest bytes are observable on public Lab Pages,
  then sends those validated bytes to Landing. Landing has no branch-tip,
  scheduled, or committed `reports/evidence-summary.json` fallback.
- **Immutable release evidence** is identified by the annotated `v*` tag,
  release commit, orchestrator run id, and dispatched evidence/kernel hashes.
  Only `release.yml` and Landing's `pendulum-release` workflow may create that
  coordinated tag. Later continuous evidence can advance default branches but
  cannot rewrite an existing release coordinate.

If a continuous dispatch is missed, manually run Lab `Evidence Dispatch` with
the successful Pages run id. The workflow re-downloads that run's handoff and
will resend it only if its exact bytes are still the live Pages deployment.

## Automated chain

1. The simulator tag starts `.github/workflows/release.yml`.
2. CI runs `verify`, builds the hosted and standalone apps, checks committed
   standalone/WASM synchronization, runs the real `file://` smoke, builds the
   library/documents/reviewer package, and enforces the bundle budget.
3. CI packs and attests the npm tarball and SBOM. A draft GitHub Release receives
   those files plus a directly downloadable standalone HTML, a full standalone
   ZIP, and the English/Korean one-page PDFs.
4. The workflow sends `pendulum-release` to `elliotjung/pendulum-landing` with
   the tag, release commit, evidence source commit, and orchestrator run id.
5. Landing's `cross-repo-release.yml` materializes the exact base64 evidence and
   demo-kernel pair whose hashes were dispatched by the release run, then realigns changelog highlights,
   rewrites the static copy counts (meta descriptions, OG alt text, no-JS
   fallbacks, Korean dictionary), regenerates the OG card image from the same
   evidence, rebuilds Korean content, and runs `check`, Playwright smoke/axe,
   and LHCI. It commits synchronized generated data, creates the matching tag,
   and deploys an immutable Pages artifact.
6. The simulator workflow polls that exact landing workflow. Only a successful
   conclusion publishes the draft GitHub Release. npm and JSR tag workflows use
   the same tag; Zenodo publishes in the release job when its token is present.

This is fail-closed: a missing cross-repository credential, a mismatched evidence
SHA, a failed landing gate, or a tag collision leaves the simulator release as a
draft and never reports the pair as coordinated.

## One-time repository settings

| Repository | Setting | Required access |
| --- | --- | --- |
| `pendulum-lab` | `LANDING_DISPATCH_TOKEN` Actions secret | Fine-grained token or GitHub App token with landing **Actions: read** and **Contents: read/write** (repository dispatch) |
| `pendulum-lab` | npm trusted publisher | Package `@elliotjung/pendulum-lab`, workflow `publish-npm.yml`, environment `npm` |
| `pendulum-lab` | JSR linked repository | Package `@elliotjung/pendulum-lab` linked to this GitHub repository for OIDC |
| `pendulum-lab` | `ZENODO_TOKEN` Actions secret | Optional until DOI publication; deposition create/upload/publish |
| `pendulum-landing` | Pages source | GitHub Actions; environment protection must permit `deploy-pages` |

Rotate the cross-repository token after use outside Actions. Never place it in a
workflow input, issue, artifact, or report.

## Release command and rollback

After the default branch is green and versions in `package.json`, `jsr.json`,
and `CITATION.cff` agree (the release workflow enforces exactly those three
against the tag; `.zenodo.json` carries no version — the Zenodo script injects
it at publication):

```bash
git tag -a v10.36.0 -m "Pendulum Lab v10.36.0"
git push origin v10.36.0
```

If the chain fails, inspect the simulator release run and the dispatched landing
run. Fix forward and move to a new version tag; do not retarget a published tag.
While the release is still a draft, it can be deleted and the local/remote tag
removed only if no package, DOI, or public release has been published. Pages can
be rolled back by redeploying the previous landing tag's artifact.

## Shared claims policy

- Quality mode names remain Performance, Balanced, and Cinematic.
- Landing evidence must originate in `reports/evidence-summary.json`, carry a
  full source commit, report `dirtyWorktree: false`, and remain inside its
  expiry window. Copied marketing numbers are not authoritative, and expired
  or dirty evidence blocks dispatch and release.
- NVIDIA/AMD claims require physical-runner artifacts. Missing adapters stay
  visibly missing.
- Hosted security claims apply to the hosted CSP/header path, not to the relaxed
  double-click standalone artifact.
