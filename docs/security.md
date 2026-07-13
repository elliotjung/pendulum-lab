# Security Hardening

## CSP

The live application path (`app.html` in Vite, and any served deployment) uses a
strict CSP without inline script execution:

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; worker-src 'self'; connect-src 'self' ws:; object-src 'none'; base-uri 'self'
```

The release-only `standalone/index.html` is the generated, double-clickable
artifact (Git tracks only its SHA-256 manifest). It intentionally inlines JavaScript and permits `blob:` workers so it
can run from `file://`; this portable artifact is documented separately from the
served-app CSP and should not be used as evidence of the hosted security policy.

New TypeScript UI code should continue to use `createElement`, `textContent`,
event listeners, and CSS classes instead of `innerHTML`. `npm run audit:legacy`
tracks `innerHTML`, `.onclick`, inline worker, eval-like, dynamic script, global
export risks, and the served/standalone CSP split.

## JSON Import

`src/validation/importSchema.ts` rejects:

- imports larger than 5 MB,
- prototype pollution keys,
- unknown integrators,
- unknown system types,
- non-finite state values,
- out-of-range `dt` or damping,
- malformed parameter objects.

## Worker Policy

New code uses `new Worker(new URL('../workers/physics.worker.ts', import.meta.url), { type: 'module' })` through `WorkerBridge`. If module workers are unavailable, the bridge computes the fallback step on the main thread rather than returning a stale state.

When the standalone `index.html` is opened directly through `file://`, worker
creation failure explicitly falls back to the main thread so the pendulum keeps
moving.

## Event Policy

New commands are registered through `CommandRegistry` and emit typed events
through `EventBus`. Deprecated global aliases remain only as compatibility
readers for old scripts and tests.

## Export And Storage

Typed exports sanitize filenames in `src/export/manifest.ts`. Imported JSON and localStorage-derived snapshots are validated before applying to runtime state.
