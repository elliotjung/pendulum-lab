# Releasing and Publishing

## Where publication stands (2026-07-10)

Everything automatable is in place and verified; exactly **two external-account
actions** remain, neither of which any workflow can perform:

| Lane | State | Remaining action (external) |
| --- | --- | --- |
| GitHub release + attestations | ✅ live (`v10.35.0` released; SBOM + provenance attested) | — |
| npm | 🔶 `npm publish --dry-run` passes; OIDC trusted-publishing workflow ready | Configure the trusted publisher on npmjs.com (settings below), then dispatch **Publish npm package** with `dry-run=false` |
| Zenodo DOI | 🔶 `.zenodo.json` synced with `CITATION.cff`; draft/publish/doi-sync scripts ready | Create/link the Zenodo account, mint a `ZENODO_TOKEN`, then run the Zenodo steps below |

Re-audit any time with `npm run release:status`
(`reports/publication-status.json`).

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
