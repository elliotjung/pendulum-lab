# Release Readiness Manifest

Generated: 2026-06-18T10:26:59.930Z

Status: **ready-for-owner-publish**

| Required | Available | Artifact | Note |
|---:|---:|---|---|
| yes | yes | `.zenodo.json` | Zenodo DOI metadata is present; actual DOI minting requires a GitHub release and Zenodo account link. |
| yes | yes | `.github/workflows/pages.yml` | GitHub Pages deploy workflow is present. |
| yes | yes | `.github/workflows/publish-npm.yml` | Manual npm publish workflow is present; live publish requires an NPM_TOKEN repository secret. |
| yes | yes | `paper/paper.pdf` | Flagship paper PDF exists. |
| yes | yes | `reports/reviewer-kit-manifest.json` | Reviewer kit manifest exists. |
| no | yes | `reports/webgpu-hardware-validation.md` | Real WebGPU adapter validation report exists when run on a hardware target. |
| yes | yes | `reports/release-one-page.pdf` | One-page reviewer PDF generated locally. |
| yes | yes | `reports/walkthrough-30s.gif` | Thirty-second GIF walkthrough generated locally. |
| no | yes | `reports/walkthrough-storyboard.svg` | Editable storyboard companion for the GIF. |

## Owner Publish Steps

- Enable GitHub Pages for the repository if it is not already enabled.
- Create a GitHub release tag; Zenodo mints the DOI after the repo is enabled in Zenodo.
- Run the manual npm workflow with dry-run=false after adding the NPM_TOKEN repository secret.
- Attach reports/release-one-page.pdf and reports/walkthrough-30s.gif to the release notes.

