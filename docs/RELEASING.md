# Releasing and Publishing

## Preflight

```bash
npm ci
npm run verify
npm run build
npm run build:lib
npm run release:package
npm run release:status
```

The public package coordinate is read directly from `package.json`. Never reuse
an npm version or a Git tag.

## Release-candidate PRs

Label a PR `full-validation` to run the entire Mainline Full Validation
workflow (slow tier, coverage, benchmarks, reproduce, flagship certification,
cross-validation, OS smoke) against the PR head before merging. The lane
re-runs on every push while the label stays on.

## Evidence must attest the released commit

The release workflow regenerates `release-readiness`, `worldclass-scorecard`,
and `publication-status` at the release ref and then runs
`npm run release:verify-report-shas`, which fails unless each report's
metadata is source-clean and `sourceSha === buildSha === GITHUB_SHA`. Locally,
regenerate evidence AFTER committing source changes (a dirty source tree
cannot attest a commit; regenerated `reports/` files alone do not un-attest
it), then commit the reports.

## GitHub Release and Pages

Push the release commit and tag. `.github/workflows/release.yml` builds the npm
tgz, generates a CycloneDX SBOM, and records SLSA/in-toto attestations through
`actions/attest@v4`. Verify a downloaded package with:

```bash
gh attestation verify pendulum-lab-v10-<version>.tgz --repo Elliot-Jung-17/pendulum-lab
npm run release:verify-attestations -- --artifact pendulum-lab-v10-<version>.tgz --source-ref refs/tags/v<version>
```

`.github/workflows/pages.yml` deploys the workbench, paper, report JSON, and
`reviewer.html` console from `dist/`.

## npm Trusted Publishing

Configure npm's trusted publisher for:

- owner: `Elliot-Jung-17`
- repository: `pendulum-lab`
- workflow filename: `publish-npm.yml`
- environment: `npm`
- allowed action: publish

Then dispatch **Publish npm package** with the exact expected version and
`dry-run=false`. The workflow pins Node 24 and npm 11.5.1, requests
`id-token: write`, rejects an existing registry version, and publishes without
a long-lived token. Public OIDC publishing adds npm provenance automatically.

## Zenodo DOI

Production API publishing is explicit and irreversible:

```bash
$env:ZENODO_TOKEN = '<owner token with deposit:write and deposit:actions>'
npm run zenodo:publish
npm run doi:sync
```

The deposition contains the packed library, paper PDF, reviewer manifest, GPU
matrix, and flagship certification. `doi:sync` accepts only a real production
`10.x/zenodo.x` DOI from `reports/zenodo-deposition.json`, then updates
`CITATION.cff`, the README badge, and release packaging documentation.

Use `ZENODO_SANDBOX_TOKEN` plus `npm run zenodo:draft -- --sandbox` to validate
the API without minting a production DOI.

## Hardware Evidence

Each physical runner carries `self-hosted`, `webgpu`, and one vendor label:
`intel`, `nvidia`, or `amd`. Dispatch **WebGPU Vendor Evidence** per vendor,
download the three ladder artifacts into one directory, and run:

```bash
$env:GPU_MATRIX_INPUT_DIR = '<artifact directory>'
$env:GPU_MATRIX_REQUIRE_COMPLETE = '1'
npm run benchmark:gpu-matrix
```

Software adapters never satisfy the vendor matrix.
