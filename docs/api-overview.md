# Pendulum Lab API Overview

TypeDoc is generated from `src/lib.ts`, the supported headless entry point.
The PRIMARY surface is the four grouped namespaces; examples come first
because that is how the API is meant to be read.

## Examples first

### core - build a system and integrate it

```ts
import { core } from 'pendulum-lab-core';

const spec = { kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81, damping: 0 } as const;
const rhs = core.buildRhs(spec);
const jacobian = core.buildJacobian(spec); // exact tangent for variational flows

const state = new Float64Array([2.0, 2.5, 0, 0]); // [theta1, theta2, omega1, omega2]
const next = new Float64Array(4);
for (let i = 0; i < 1000; i += 1) {
  core.rk4Step(state, 0.001, rhs, next);
  state.set(next);
}
```

### analysis - Lyapunov exponent with uncertainty

```ts
import { analysis, core } from 'pendulum-lab-core';

const rhs = core.buildRhs({ kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81, damping: 0 });
const { lambdaMax, blockStdError, ci95 } = analysis.maximalLyapunov(
  [2.0, 2.5, 0, 0],
  rhs,
  { dt: 0.01, steps: 20_000, transientSteps: 2_000, seed: 7 }
);
// lambdaMax ~ 1.4 for this chaotic initial condition; always report the error.
```

### research - reproducible chaos jobs and integrity-checked bundles

```ts
import { research } from 'pendulum-lab-core';

// The exact worker job the app runs, headless: Lyapunov + RQA + FTLE per point.
const result = await research.runChaosJob({
  id: 'point-1',
  kind: 'studyPoint',
  spec: { kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
  state0: [2.0, 2.5, 0, 0],
  settings: { lyapunov: { dt: 0.01 } }
});

// Integrity-verifiable ZIP bundle of any artifact set (SHA-256 manifest).
const entries = [{ path: 'results.json', data: research.textToBytes(JSON.stringify(result)) }];
const zipBytes = research.buildZip(entries);
const checksums = research.checksumEntries(entries);
```

Command-line reproduction of every headline claim: `npm run reproduce`
(writes the commit-bound `reports/reproduce/manifest.json`).

### experimental - CPU-oracle-gated WebGPU acceleration + optimal control

```ts
import { experimental } from 'pendulum-lab-core';

// Returns the CPU f64 result unless the WebGPU f32 candidate passed the
// same-run oracle comparison; `backend` + `caveat` say which one you got.
const promotion = await experimental.promotedDoublePendulumLyapunovSpectrum(
  { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
  [1.2, 0.7, 0.12, -0.04],
  { dt: 0.01, steps: 2_000 }
);
console.log(promotion.backend, promotion.result.spectrum, promotion.caveat);

// Optimal control (docs/control-module.md): swing up the double pendulum
// from hanging and hold it inverted with the LQR capture stage.
const spec = { parameters: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 }, gamma: 0, dt: 0.005 } as const;
const controller = experimental.createHybridSwingUpController(spec);
const run = experimental.simulateHybridSwingUp(controller, spec, [0.1, 0, 0, 0], { dt: 0.005, steps: 20_000 });
console.log(run.captureTime, run.finalPhase, run.finalState);
```

## Stability Badges

| Badge | Meaning | Import path |
|---|---|---|
| Stable | Covered by semantic-versioning compatibility. Breaking changes require a major version. | `core`, `analysis`, `research` |
| Experimental | Useful, tested, but still allowed to change while the feature matures. | `experimental` |
| Deprecated compatibility | Flat re-exports preserved for pre-10.31 scripts; frozen since 10.36. Use the namespaces for all new code. | root-level named exports |

## Semantic-Versioning Policy

- Patch releases may fix bugs, add tests, improve performance, or add optional fields.
- Minor releases may add new systems, diagnostics, exports, or namespace members without removing existing stable APIs.
- Major releases may remove deprecated aliases, change stable function signatures, or change serialized artifact schemas.
- Experimental APIs may change in minor releases, but each change must be called out in `CHANGELOG.md`.
- Deprecated globals and flat compatibility exports must carry a migration target and a removal version before they are removed.

## Deprecation Timeline

| Surface | Status in 10.35.0 | Migration target | Earliest removal |
|---|---|---|---|
| `window.PendulumLabIndex` | Deprecated browser alias | `window.PendulumLab` for supported API; `window.PendulumLabDebug` for diagnostics | 11.0 |
| `window.__modernLab` / `window.__modernTabs` | Debug-only compatibility alias | `window.PendulumLabDebug` | 11.0 |
| Flat root exports | Deprecated + frozen (no new flat exports) | `core`, `analysis`, `research`, `experimental` namespaces; moves to a `/compat` subpath in 11.0 — see [`docs/v11-api-migration.md`](v11-api-migration.md) | 12.0 |
| ZIP checksum v1 fields (`crc32`, `fnv1a`) | Legacy reader support | SHA-256 checksum manifest v2 | 12.0 |

Deprecations are allowed to stay longer than the earliest removal version; they
must not disappear earlier. Any removal requires a changelog migration note and
a release artifact that still documents how older archives/scripts can be read.

New application code should avoid browser globals. Browser-only debug surfaces
(`window.PendulumLabDebug`, deprecated aliases) are not part of the stable
library contract.
