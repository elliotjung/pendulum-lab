# Pendulum Lab API Stability

TypeDoc is generated from `src/lib.ts`, the supported headless entry point.

## Stability Badges

| Badge | Meaning | Import path |
|---|---|---|
| Stable | Covered by semantic-versioning compatibility. Breaking changes require a major version. | `core`, `analysis`, `research` |
| Experimental | Useful, tested, but still allowed to change while the feature matures. | `experimental` |
| Compatibility | Flat re-exports preserved for older scripts. Prefer grouped namespaces for new code. | root-level named exports |

## Semantic-Versioning Policy

- Patch releases may fix bugs, add tests, improve performance, or add optional fields.
- Minor releases may add new systems, diagnostics, exports, or namespace members without removing existing stable APIs.
- Major releases may remove deprecated aliases, change stable function signatures, or change serialized artifact schemas.
- Experimental APIs may change in minor releases, but each change must be called out in `CHANGELOG.md`.
- Deprecated globals and flat compatibility exports must carry a migration target and a removal version before they are removed.

## Deprecation Timeline

| Surface | Status in 10.34.0 | Migration target | Earliest removal |
|---|---|---|---|
| `window.PendulumLabIndex` | Deprecated browser alias | `window.PendulumLab` for supported API; `window.PendulumLabDebug` for diagnostics | 11.0 |
| `window.__modernLab` / `window.__modernTabs` | Debug-only compatibility alias | `window.PendulumLabDebug` | 11.0 |
| Flat root exports | Compatibility surface | `core`, `analysis`, `research`, `experimental` grouped namespaces | 12.0 |
| ZIP checksum v1 fields (`crc32`, `fnv1a`) | Legacy reader support | SHA-256 checksum manifest v2 | 12.0 |

Deprecations are allowed to stay longer than the earliest removal version; they
must not disappear earlier. Any removal requires a changelog migration note and
a release artifact that still documents how older archives/scripts can be read.

## Recommended Imports

```ts
import { core, analysis, research } from 'pendulum-lab-core';

const rhs = core.buildRhs({ kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81, damping: 0 });
const lambda = analysis.maximalLyapunov;
const bundle = research.buildZip;
```

New application code should avoid browser globals. Browser-only debug surfaces
(`window.PendulumLabDebug`, deprecated aliases) are not part of the stable
library contract.
