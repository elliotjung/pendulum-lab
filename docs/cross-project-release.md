# Cross-Project Release Checklist

Use this checklist when publishing Pendulum Lab and the landing page together.
The goal is to keep evidence, wording, and performance defaults synchronized.

> **Repository topology:** two repos by decision — see
> [ADR 0001](adr/0001-repository-topology.md). Evidence synchronization is
> automated: pushing a changed `reports/evidence-summary.json` to the default
> branch dispatches the landing repo's `evidence-sync` workflow, which pulls
> the summary, realigns the demo-kernel manifest, re-runs the landing gate
> (including the kernel-parity smoke test), and auto-commits. The manual step
> 3 below remains as local convenience / fallback, not the mechanism.

## URLs And Rollback

| Surface | Production URL | Preview URL | Rollback |
| --- | --- | --- | --- |
| Simulation app | `https://elliotjung.github.io/pendulum-lab/` | GitHub Actions Pages preview or local `npm run preview` | revert the Pages deployment or redeploy the previous tag |
| Landing page | `https://elliotjung.github.io/pendulum-landing/` | landing CI artifact / local static server | redeploy the previous landing commit |

## Release Order

1. Run simulation checks: `npm run verify`.
2. Build standalone app: `npm run build:standalone`.
3. Sync evidence into the landing repo: `npm run evidence:summary`.
4. In the landing repo, run `npm run check` and `npm run smoke`.
5. Review landing claims against `assets/evidence-summary.json`.
6. Tag/release the simulation repo, then deploy the landing page.

## Shared Policy

| Topic | Shared rule |
| --- | --- |
| Quality modes | Use the same names: Performance, Balanced, Cinematic. |
| Slow devices | Landing should fall back to static/low-power hero; app should start no higher than Balanced and let auto-quality downgrade. |
| Evidence | Landing claims must come from `assets/evidence-summary.json` or link to the simulation reports. |
| Security | Prefer self-hosted assets, pinned dependencies, CSP with zero external runtime resources, Dependabot, and license manifests. |
| Hardware claims | Do not claim NVIDIA/AMD WebGPU coverage until physical-runner artifacts exist. |
