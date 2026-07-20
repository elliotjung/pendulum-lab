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
