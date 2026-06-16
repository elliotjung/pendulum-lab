# Architecture

Pendulum Lab V10 is a **100% TypeScript** application. The original ~8,080-line legacy
`js/` runtime has been fully removed (archived under `archive/`). The live Vite shell
(`app.html`) loads `src/main.ts` plus the hand-written CSS that styles the static shell
DOM; the project-root `index.html` is the generated self-contained build. A single
dependency-injection container (`runtime/ServiceContainer`, exposed through
`window.PendulumLabDebug.runtime`) is the canonical source of truth for runtime services.

```mermaid
flowchart LR
  HTML[app.html\nstatic shell DOM + CSS] --> TS[src/main.ts]
  TS --> Runtime[runtime/PendulumRuntime\nServiceContainer DI]
  TS --> Shell[app/Shell\nnav + sliders + presets + keys]
  TS --> Lab[app/LabApp\nsim + render + side plots]
  TS --> Tabs[app/*Tab\nLyapunov/Validation/Sweep/Compare/Bifurcation/Phase3D/Density]
  Runtime --> Events[runtime/EventBus + CommandRegistry]
  Runtime --> State[state/StateStore]
  Runtime --> Physics[physics/*]
  Runtime --> WorkerBridge[runtime/WorkerBridge]
  Lab --> Physics
  Lab --> Viz[viz/*]
  Tabs --> Chaos[chaos/*]
  Tabs --> ChaosClient[runtime/ChaosClient]
  ChaosClient --> Worker[workers/chaos.worker.ts]
  WorkerBridge --> SimWorker[workers/physics.worker.ts]
```

## Layered Architecture

The codebase is split into a **domain layer** (pure, browser-free, deterministic) and an
**infrastructure layer** (DOM, workers, globals, browser APIs). The domain layer never
imports the infrastructure layer, which keeps the physics/chaos engine unit-testable in
Node and reusable outside the browser.

| Layer | Packages | May depend on | Must NOT depend on |
|---|---|---|---|
| Domain (pure) | `physics/`, `chaos/`, `viz/` (math), `validation/` (checks), `export/manifest` | other domain modules, `types/` | DOM, `window`, workers, `runtime/` |
| Application/runtime | `runtime/ServiceContainer`, `runtime/PendulumRuntime`, `EventBus`, `CommandRegistry`, `StateStore`, `app/Shell`, `app/LabApp`, `app/*Tab` | domain layer, `types/` | DOM specifics leaking into domain |
| Infrastructure | `runtime/*Bridge`, `render/performance`, `ui/`, `workers/` | application + domain | — |

The legacy `js/` runtime has been removed (see `archive/`). The former
`runtime/LegacyBridge` and `runtime/IndexPhysicsBridge` shims are gone; only
small compatibility accessors remain for old scripts and tests that still read
`window.App`, `window.Physics`, `window.PendulumLabIndex`, or
`window.PendulumRuntime`.

## Dependency Injection Container

`ServiceContainer<M>` is a zero-dependency typed container: lazy singletons by default,
optional transients, throwing `resolve` plus non-throwing `tryResolve`, and a typed
service map `PendulumServiceMap`. `installPendulumRuntime()` registers `events`,
`commands`, `state`, `physics`, and `worker`, then publishes the DI surface under
`window.PendulumLabDebug.runtime` with `window.PendulumRuntime` kept as a
deprecated debug alias. Public scripting uses `window.PendulumLab`.

## Module Boundaries

- `src/app/`: the modern Lab application layer — `LabSimulation` (headless integration core driving the typed `physicsAdapter`), `LabRenderer` (canvas pendulum renderer targeting the structural `Ctx2D`, legacy-parity geometry: pivot at `w/2, h·0.38`, 110 px/m), `LabController` (`mountModernLab`, an independently-mountable rAF loop), and `LabApp` (the full lab tab: loop + energy/Lyapunov/phase/Poincaré/FFT side plots + control wiring). Analysis helpers: `fft`, `PoincareAccumulator`, `LyapunovEstimator`, `labPlots`. Mounted by default in browser contexts; `?modernLabProbe` still mounts a standalone probe for diagnostics.
- `src/physics/`: typed equations, energy helpers, integrator metadata, and pure integrator implementations.
- `src/state/`: strict StateStore snapshot validation, state synchronization, and import-safe runtime patches.
- `src/runtime/`: central event bus, command registry, public/debug API publishing, compatibility accessors, and module worker bridge.
- `src/ui/`: safe DOM helpers and accessibility upgrades.
- `src/validation/`: deterministic validation checks and strict JSON import parsing.
- `src/export/`: typed submission manifest and report export helpers.
- `src/render/`: runtime metric probes for FPS, physics time, memory, and worker latency.
- `src/workers/`: separate module worker with main-thread fallback through `WorkerBridge`.
- `app.html`: the live Vite shell (static shell DOM + CSS); it loads `src/main.ts`, which boots the runtime, Lab, analysis tabs, and shell. The project-root `index.html` is the self-contained portable build produced by `npm run build:standalone`.

## Module Size Ratchet

`npm run audit:modules` prevents new oversized source files and caps the known
large modules while they are being split. The current ratchet targets are:
`app/parity/research-workbench.ts`, `app/parity/figure-export.ts`,
`app/parity/governance-ui.ts`, `app/ExpansionLabTab.ts`,
`workers/chaosProtocol.ts`, and `app/parity/runtime-diagnostics.ts`.
`physics/expandedModels.ts` has already left this list after being split into
types, factory, suite-runner, Lyapunov, and research-matrix modules. A module
should leave the known-large list only after its responsibilities have been
extracted into smaller, tested units.

## Public API Surface (minimized)

The public scripting API is `window.PendulumLab` (`{ version, commands, events,
state, physics }`). Internal tooling uses `window.PendulumLabDebug`, including
the DI runtime surface (`runtime: { version, container, resolve, tryResolve,
has, events, commands, state, describe }`) and modern app handles. Deprecated
aliases (`window.PendulumLabIndex`, `window.PendulumRuntime`, `window.__modernLab`,
`window.__modernTabs`) remain for compatibility.

## Legacy Removal (complete)

The migration ran in four verifiable stages, each keeping `npm run typecheck`, `npm test`,
the Playwright e2e suite, and `npm run audit:legacy` green so the legacy-risk score only
ever moved down (482 → 0):

1. **Runtime unification.** Single DI container; the five legacy globals collapsed to one
   namespace + read-only accessors; dynamic `<script>` injection removed.
2. **Modern Lab as default.** `src/app/LabApp` drives the lab tab — simulation loop, all
   side plots, controls, presets, ensemble, FX, drag-to-set, export, and replay.
3. **Analysis tabs.** Lyapunov, Validation, Sweep, Compare, Bifurcation, 3D-phase, and
   density were each ported (taking over their controls by cloning the buttons to drop the
   legacy handlers) and covered by unit + e2e tests.
4. **Shell + cut.** `src/app/Shell` took over navigation, slider displays, presets, and
   keyboard shortcuts; audio was ported (`AudioSonifier`); `LabApp` took over the header
   chrome. The legacy `<script>` tags were removed from `index.html` and `js/00`–`js/11`
   moved to `archive/`. The app is now served entirely from `src/` via Vite.

The bridge shims were deleted after their useful responsibilities moved into
`src/main.ts`, `runtime/globalApi.ts`, and the modern shell.
