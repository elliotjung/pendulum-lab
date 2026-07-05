# v11 Public API Migration Plan

Status: adopted (10.36). This document is the single source of truth for how the
flat export surface of `pendulum-lab-core` is reduced.

## Summary

Since 10.31 the package exposes two parallel surfaces from `src/lib.ts`:

1. **Namespaces (primary, stable):** `core`, `analysis`, `research`,
   `experimental` — also available as subpath entries
   (`pendulum-lab-core/core`, `/analysis`, `/research`, `/experimental`).
2. **Flat re-exports (deprecated aliases):** the pre-10.31 surface
   (`import { rhsChain } from 'pendulum-lab-core'`).

The flat surface is too large to govern symbol-by-symbol: every new physics or
chaos module widens it, and reviewers cannot tell the stable core from
convenience aliases. The namespaces carry the semver contract; the flat surface
is frozen and then reduced in stages.

## Stages

| Stage | Release | Action |
| --- | --- | --- |
| 0 | 10.36 (now) | Flat surface documented as deprecated in `src/lib.ts`; no removals. New modules are added to the namespaces only — the flat surface is frozen. |
| 1 | 11.0 | Flat re-exports move to a dedicated `pendulum-lab-core/compat` subpath entry. The root entry exports only the four namespaces plus the domain types (`RuntimeSnapshot`, `SystemType`, `IntegratorId`, `PendulumParameters`, `EnergyBreakdown`, `RunMode`). Importing a flat symbol from the root becomes a type error with a fix-it note in the release notes. |
| 2 | 12.0 | `pendulum-lab-core/compat` is removed. |

## Alias-to-namespace map

Every flat alias has an exact namespace replacement — nothing is renamed:

| Flat alias group | Replacement |
| --- | --- |
| Physics (`rhsDouble`, `rhsChain`, integrators, oscillators, solitons, rope/string/spherical systems, stochastic) | `core.*` |
| Chaos diagnostics (`export * from './chaos'`: Lyapunov, RQA, basins, Floquet, Melnikov, NAFF, transfer operator, ...) | `analysis.*` |
| Worker job protocol (`runChaosJob`, `JobEngine`, request/response types) | `research.*` |
| Research tooling (sampling, experiment design, SINDy/DMD/HAVOK, eigensolvers, ZIP bundles, provenance, notebooks) | `research.*` |
| Ensembles / WebGPU (`runDoublePendulumEnsemble`, GPU candidates and promotions) | `experimental.*` (promoted CPU-oracle entry points also in `research.*`) |

Migration is mechanical:

```ts
// before (deprecated)
import { rhsChain, lyapunovBenettin } from 'pendulum-lab-core';

// after (primary)
import { core, analysis } from 'pendulum-lab-core';
core.rhsChain(...); analysis.lyapunovBenettin(...);

// or subpath imports for better tree-shaking
import { rhsChain } from 'pendulum-lab-core/core';
```

## Guardrails

- `tests/public-api-snapshot.test.ts` pins the namespace key lists — the
  primary surface cannot drift silently.
- `tests/public-surface-encoding.test.ts` pins `src/lib.ts` to ASCII doc
  comments and all public-surface files to clean UTF-8 (mojibake guard).
- The freeze in Stage 0 is enforced by review convention: PRs that add a flat
  root export (outside the namespace files) should be rejected.
