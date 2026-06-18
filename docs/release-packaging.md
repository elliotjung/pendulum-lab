# Release Packaging Checklist

This file is the publication wrapper around the reviewer kit. The code can
generate the scientific artifacts; external release steps still need maintainer
credentials or a release decision.

## Ten-Minute Reviewer Path

```bash
npm install
npm run reproduce
npm run flagship:certify
npm run flagship:external
npm run validate:gpu-scale
npm run validate:webgpu-hardware
npm run benchmark:gpu-ladder
npm run benchmark:gpu-matrix
npm run release:package
npm run reviewer:kit
npm run release:status
```

Required outputs:

- `reports/reproduce/manifest.json`
- `reports/flagship-certification.json`
- `reports/flagship-figure1.svg`
- `reports/flagship-external-check.json`
- `reports/gpu-scale-validation.md`
- `reports/webgpu-hardware-validation.md`
- `reports/gpu-benchmark-ladder.md`
- `reports/gpu-adapter-matrix.md`
- `reports/publication-status.json`
- `reports/release-readiness.md`
- `reports/release-one-page.pdf`
- `reports/walkthrough-30s.gif`
- `reports/reviewer-kit-manifest.md`

## Release Bundle

- Generated locally by `npm run release:package`: one-page PDF summary,
  30-second walkthrough GIF, SVG storyboard, and release-readiness manifest.
- The Pages build serves `reviewer.html`, the paper, and the report JSON.
- The npm workflow uses OIDC trusted publishing (`npm >= 11.5.1`) and automatic
  npm provenance. The release workflow attests the packed tgz and CycloneDX
  SBOM with GitHub's SLSA/in-toto `actions/attest@v4` path.
- `npm run zenodo:publish` creates, uploads, and publishes a token-authenticated
  Zenodo deposition. `npm run doi:sync` writes a real minted DOI into citation
  surfaces; it refuses to write a placeholder DOI.

## Promotion Gates

- `npm run verify`
- `npm run flagship:certify`
- `npm run flagship:external`
- `npm run validate:gpu-scale`
- `npm run validate:webgpu-hardware`
- `npm run benchmark:gpu-ladder`
- `npm run benchmark:gpu-matrix`
- `npm run benchmark:memory`
- `npm run release:package`
- `npm run release:verify-attestations -- --artifact <release-tarball> --source-ref refs/tags/<tag>`
- `npm run reviewer:kit`
- `npm run audit:worldclass`

The release is not research-grade until the generated reports are committed or
attached to the release, and the DOI/Pages/npm targets point at the same commit.
