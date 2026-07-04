# Release Readiness Manifest

Generated: 2026-07-04T12:59:41.501Z

Status: **ready-for-owner-publish**

| Required | Available | Artifact | Note |
|---:|---:|---|---|
| yes | yes | `.zenodo.json` | Zenodo metadata and authenticated deposition command are present. |
| yes | yes | `.github/workflows/pages.yml` | GitHub Pages deploy workflow is present. |
| yes | yes | `reviewer.html` | Pages reviewer console reads report JSON directly. |
| yes | yes | `.github/workflows/publish-npm.yml` | Manual npm workflow uses OIDC trusted publishing and automatic provenance. |
| yes | yes | `.github/workflows/release.yml` | Release workflow emits SLSA/in-toto provenance plus a CycloneDX SBOM attestation. |
| yes | yes | `paper/paper.pdf` | Flagship paper PDF exists. |
| yes | yes | `reports/reviewer-kit-manifest.json` | Reviewer kit manifest exists. |
| no | yes | `reports/webgpu-hardware-validation.md` | Real WebGPU adapter validation report exists when run on a hardware target. |
| yes | yes | `reports/gpu-benchmark-ladder.md` | Hardware GPU benchmark ladder records adapter metadata, f32/f64 drift, and CPU-oracle promotion metrics. |
| yes | yes | `reports/gpu-benchmark-ladder.json` | Machine-readable GPU benchmark ladder for release artifacts. |
| yes | yes | `reports/gpu-adapter-matrix.json` | Physical Intel/NVIDIA/AMD evidence matrix; missing hardware remains explicit. |
| yes | yes | `reports/publication-status.json` | Public registry, DOI, release, and Pages resolution audit. |
| no | yes | `reports/zenodo-deposition.json` | Authenticated deposition result or explicit credential boundary; no DOI is inferred. |
| no | yes | `reports/attestation-verification.json` | Cryptographic verification of SLSA and CycloneDX attestations against the release tarball. |
| yes | yes | `reports/npm-pack-dry-run.json` | Exact npm tarball integrity, size, and included-file inventory from a successful dry run. |
| yes | yes | `reports/mutation-aggregate.json` | Nightly sharded mutation aggregate score from Stryker reports. |
| yes | yes | `reports/release-one-page.pdf` | One-page reviewer PDF generated locally. |
| yes | yes | `reports/walkthrough-30s.gif` | Thirty-second GIF walkthrough generated locally. |
| no | yes | `reports/walkthrough-storyboard.svg` | Editable storyboard companion for the GIF. |

## Publication Boundary

- npm: npm whoami returned ENEEDAUTH and NPM_TOKEN is not set; real npm publication was not attempted.
- npm trusted publisher: Workflow has OIDC/id-token publishing contract, but npm package settings are not publicly verifiable from this unauthenticated local CLI.
- Zenodo: ZENODO_TOKEN is not set; production DOI minting was not attempted and no DOI was fabricated.
- GitHub-Zenodo integration: No Zenodo GitHub repository hook was visible to gh api repos/Elliot-Jung-17/pendulum-lab/hooks.

## Owner Publish Steps

- npm whoami returned ENEEDAUTH and NPM_TOKEN is not set; real npm publication was not attempted. Configure npm trusted publishing for publish-npm.yml or authenticate an owner credential, then dispatch publish-npm.yml with dry-run=false.
- ZENODO_TOKEN is not set; production DOI minting was not attempted and no DOI was fabricated. Publish with npm run zenodo:publish only after production credentials exist, then run npm run doi:sync.

