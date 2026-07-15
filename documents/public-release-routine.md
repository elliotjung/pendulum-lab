# Public Release Routine

This checklist is intentionally tied to `reports/evidence-summary.json`, so the
README, landing page, reviewer kit, and final publication state do not drift.

## Evidence Refresh

```bash
npm run test:json
npm run test:check
npm run reviewer:kit
npm run release:status
npm run benchmark:gpu-matrix
npm run evidence:summary
```

`npm run evidence:summary` writes:

- `reports/evidence-summary.json`
- `../landing page/pendulum-landing/assets/evidence-summary.json` when the
  sibling landing repository is present

## External Gates

| Gate | Command | Current blocker |
|---|---|---|
| npm package | `npm publish --access public` | Requires npm credentials and intentional publish approval. |
| Zenodo DOI | `npm run zenodo:publish && npm run doi:sync` | Requires Zenodo credentials and a final public record. |
| NVIDIA/AMD GPU matrix | `npm run benchmark:gpu-matrix` on self-hosted vendor runners | Requires physical NVIDIA and AMD WebGPU runners. |
| Attestation check | `npm run release:verify-attestations` | Must be rerun after the final release artifact is attached. |

The public status is not considered final until `reports/evidence-summary.json`
shows all `finalization[*].status` values as `complete`.
