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

## Hardware Matrix Boundary

`npm run benchmark:gpu-matrix` only counts physical self-hosted WebGPU runners
with vendor labels. Missing NVIDIA or AMD rows mean the corresponding
`gpu-ladder-nvidia` or `gpu-ladder-amd` artifact has not been supplied from a
runner labelled `self-hosted`, `webgpu`, and that vendor. Do not replace those
rows with SwiftShader, a mocked adapter, or an Intel run.

## GPU Science Boundary

CPU f64 remains the scientific oracle. The N-chain WebGPU path may promote an
N<=3 nonlinear trajectory/Jacobian-tape candidate only after matching the
same-run CPU f64 final state, trajectory, and Jacobian-tape tolerances; otherwise
the CPU tape is used. The downstream N-chain STM/QR, CLV, and FTLE result still
needs its own CPU-oracle promotion gate before it can be reported as GPU
evidence.
