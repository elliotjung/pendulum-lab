# GitHub Actions supply-chain policy

- Every third-party action reference is pinned to a reviewed full commit SHA.
  The trailing major-version comment is informational and lets Dependabot
  propose auditable SHA updates without returning to a mutable tag.
- `permissions` is read-only by default. Write, Pages OIDC, attestation, and
  publishing scopes are granted only to the job that performs that operation.
- Dependabot reviews Actions and package ecosystems weekly. Dependency Review
  blocks new moderate-or-higher advisories, and CodeQL runs on pushes, pull
  requests, and a weekly schedule.
- New actions require an upstream repository review, a full-SHA pin, minimal
  permissions, a timeout, and explicit artifact retention/failure behavior.
- Release workflows consume the exact tarball they attest; rebuilding between
  attestation and publication is prohibited.
- `.node-version` is the runtime source of truth. The local Actions validator
  requires the composite setup action's default to match it; a Node runtime
  change must be reviewed together with standalone `file://` smoke and native
  visual-baseline jobs because browser/build behavior can change across majors.
- A GitHub warning about an action's embedded Node runtime is an upstream fact,
  not something a local YAML scan can clear. Review the upstream release and
  pinned commit, update the SHA if appropriate, and retain the warning as open
  until a fresh hosted run no longer reports it.
- Visual baseline regeneration defaults to a read-only review artifact. Enabling
  the optional pull-request promotion mode is a repository-policy decision and
  grants write permissions only to that final job.
