# Cross-Project Single-Trigger Release

A single annotated `v*` tag in `elliotjung/pendulum-lab` is the release trigger
for both repositories. The simulator release is kept as a draft until the
landing repository has synchronized the exact release evidence, passed its
static/browser/accessibility/Lighthouse gates, created the matching tag, and
deployed the same commit to Pages.

## Automated chain

1. The simulator tag starts `.github/workflows/release.yml`.
2. CI runs `verify`, builds the hosted and standalone apps, checks committed
   standalone/WASM synchronization, runs the real `file://` smoke, builds the
   library/docs/reviewer package, and enforces the bundle budget.
3. CI packs and attests the npm tarball and SBOM. A draft GitHub Release receives
   those files plus a directly downloadable standalone HTML, a full standalone
   ZIP, and the English/Korean one-page PDFs.
4. The workflow sends `pendulum-release` to `elliotjung/pendulum-landing` with
   the tag, release commit, evidence source commit, and orchestrator run id.
5. Landing's `cross-repo-release.yml` fetches evidence by the immutable simulator
   commit SHA, rebuilds Korean content, and runs `check`, Playwright smoke/axe,
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
`CITATION.cff`, and `.zenodo.json` agree:

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
- Landing evidence must originate in `reports/evidence-summary.json` and retain
  its source commit and expiry; copied marketing numbers are not authoritative.
- NVIDIA/AMD claims require physical-runner artifacts. Missing adapters stay
  visibly missing.
- Hosted security claims apply to the hosted CSP/header path, not to the relaxed
  double-click standalone artifact.
