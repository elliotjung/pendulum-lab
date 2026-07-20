# Deployment and release prerequisites

The repository is intentionally fail-closed: a missing credential does not
produce a green “skipped” deployment. Configure the settings below before
requiring every deployment workflow as a branch check.

## GitHub Pages

1. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
2. Keep the `github-pages` environment. Optional reviewer protection may be
   enabled, but the environment must permit the default branch.
3. `.github/workflows/pages.yml` is the only Pages publisher. It creates one
   build, runs verify/library/standalone/WASM/budget gates, exercises that exact
   `dist/` artifact via sharded production-preview E2E across desktop and mobile
   engines, and gives Pages/OIDC write scope only to the final deploy job.

## Cloudflare isolation mirror

Configure the `cloudflare-pages` GitHub environment with:

- secret `CLOUDFLARE_API_TOKEN`: project-scoped Pages deploy token;
- secret `CLOUDFLARE_ACCOUNT_ID`;
- variable `CLOUDFLARE_MIRROR_URL`: canonical HTTPS URL to probe after deploy.

The token should be limited to this Pages project. The workflow fails when any
value is absent and verifies COOP, COEP, and `nosniff` headers on the live URL.
It runs only from an explicit workflow dispatch, keeping this optional mirror
strict without making the canonical GitHub Pages release depend on its secrets.

## Cross-repository evidence and releases

- `LANDING_DISPATCH_TOKEN` is required for ordinary evidence dispatch and tag
  releases. Use a fine-grained token scoped only to `elliotjung/pendulum-landing`
  with repository-dispatch permission and Actions read permission (the release
  gate polls the exact dispatched run).
- Configure npm Trusted Publishing for `.github/workflows/release.yml`, the
  `npm` environment, and package `@elliotjung/pendulum-lab`.
- Link the JSR package to this repository for OIDC publishing.
- `ZENODO_TOKEN` remains optional and is reported as a pending external owner
  action when absent; no DOI publication is claimed.

## Repository governance

Enable default-branch protection/rulesets after the first hardened run. Require
at least `PR Verify / verify`, `PR Verify / node-compatibility`,
`PR Verify / docker-reproducibility`, dependency review, and CodeQL; require
review, conversation resolution, linear history, and disallow force pushes and
deletions. Preserve an administrator recovery path. All Actions are pinned to
full SHAs and are updated through Dependabot review.

Self-hosted WebGPU runners must carry `webgpu` plus the appropriate vendor label
(`intel`, `nvidia`, or `amd`) and provide a free port 5173. Workflows refuse to
kill an unknown process on the runner.
