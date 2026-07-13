# Pendulum Lab API Stability

TypeDoc is generated from `src/lib.ts`, the supported headless entry point.

## Stability Badges

| Badge | Meaning | Import path |
|---|---|---|
| Stable | Covered by semantic-versioning compatibility. Breaking changes require a major version. | `core`, `analysis`, `research` |
| Experimental | Useful, tested, but still allowed to change while the feature matures. | `experimental` |
| Compatibility | Flat re-exports preserved for older scripts. Prefer grouped namespaces for new code. | root-level named exports |

## Runtime Subpath Contracts

The package also exposes environment-specific entry points. These entry points
are stable API surfaces: removing an export or changing its runtime requirement
is a SemVer-major change. Import the narrowest subpath that matches the runtime
instead of relying on browser globals or bundler polyfills.

| Subpath | Stability | Runtime contract | Intended use |
|---|---|---|---|
| `./browser` | Stable | Requires a DOM-capable browser. Importing it does not install UI automatically; callers explicitly invoke adapters such as `installJsonImportGuard`. | Canvas rasterization, orbit controls, and browser import guards |
| `./worker` | Stable | Runs in Web Workers and other worker-like runtimes. It has no application-DOM dependency; callers provide the worker message/transport boundary. | `JobEngine`, protocol v2, and headless chaos jobs |
| `./node` | Stable | Headless ESM on supported Node versions (`>=22 <27`). It excludes browser UI and the experimental namespace. | CLI, batch research, validation, and report generation |

The root, `./core`, `./analysis`, and `./research` entry points remain
dependency-free ESM and are safe to bundle for either Node or browsers when the
consumer does not import an environment adapter. `./experimental` remains under
the minor-release change policy described below.

## Semantic-Versioning Policy

- Patch releases may fix bugs, add tests, improve performance, or add optional fields.
- Minor releases may add new systems, diagnostics, exports, or namespace members without removing existing stable APIs.
- Major releases may remove deprecated aliases, change stable function signatures, or change serialized artifact schemas.
- Experimental APIs may change in minor releases, but each change must be called out in `CHANGELOG.md`.
- Deprecated globals and flat compatibility exports must carry a migration target and a removal version before they are removed.

## Deprecation Timeline

| Surface | Status in 10.36.0 | Migration target | Earliest removal |
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
import { core, analysis, research } from '@elliotjung/pendulum-lab';

const rhs = core.buildRhs({ kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81, damping: 0 });
const lambda = analysis.maximalLyapunov;
const bundle = research.buildZip;
```

New application code should avoid browser globals. Browser-only debug surfaces
(`window.PendulumLabDebug`, deprecated aliases) are not part of the stable
library contract.

## Figure artifact contract

Research figure exports are application artifacts, not public library entry
points. Saved parameter-study rows regenerate deterministic, true-vector SVG.
Live analysis canvases can be exported as PNG and as provenance-labelled SVG
containers; the latter declare `data-rendering="raster-embedded"` because a
canvas does not retain the original drawing primitives. Figure manifests list
both filenames plus the source canvas id, dimensions, content hash, and
rendering mode so downstream paper tooling cannot confuse the two paths.
