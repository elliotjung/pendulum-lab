# Theory vs Hardware: fitting the model to a tracked physical pendulum

Every other validation lane in this project compares *simulation to simulation*
(SciPy/Julia cross-checks, literature anchors, GPU-vs-CPU oracles). This
chapter closes the remaining gap: **simulation vs measurement** — the same
inverse-problem habit device/TCAD work calls *parameter extraction*, with the
platform's own solver in the fitting loop.

```
phone video → tracker export (pixels) → scale-free angle extraction
           → Levenberg–Marquardt over {l1, l2, g} (+ initial angles)
           → residual + uncertainty report (reports/hardware-comparison.*)
```

## Status and honesty label

The committed dataset (`data/experimental/double-pendulum-tracker.csv`) is a
**synthetic camera emulation** — a seeded, reproducible fixture produced by
`npm run fixture:hardware` that walks the full measurement chain (frame-rate
sampling, pixel projection with a y-down image convention, sub-pixel tracker
noise). It is *not* real footage yet; its purpose is to keep the entire
pipeline executable and regression-tested (`tests/hardware-comparison.test.ts`)
so that dropping in a real tracked CSV is a data swap, not an engineering
project. The sidecar metadata (`.meta.json`) records this provenance, and the
generated report repeats it. When a real capture replaces the fixture, update
`provenance.realFootage` and this section.

## Capture protocol (what to do with a phone)

1. **Rig**: rigid double pendulum (two links, low-friction pivots), high-contrast
   markers on both bobs and the pivot. A dark background helps the tracker.
2. **Camera**: phone on a tripod, lens axis perpendicular to the swing plane,
   60 fps (slow-motion modes are fine *if* the true fps is recorded — see the
   time-base warning below). Lock focus/exposure.
3. **Protocol**: displace both links, hold still, release from rest. A clean
   release makes ω₀ = 0 a *protocol fact*, so only the initial angles need
   co-estimation.
4. **Independent measurements**: bob masses on a scale (m1, m2), and the
   damping γ from a separate small-amplitude decay video (logarithmic
   decrement). The dynamic fit then estimates `l1`, `l2`, `g` — length and
   local gravity are recovered from *timing*, which is the interesting check.
5. **Tracking**: extract per-frame bob coordinates with
   [Tracker](https://physlets.org/tracker/) (or OpenCV template matching).
   Export CSV columns `time,x1,y1,x2,y2` in pixels (`#` comment lines are
   ignored). Note the pivot pixel position and whether y grows downward
   (image convention, the default) or upward.

No pixel→meter calibration is needed: the importer converts positions to
angles with `atan2` of pixel *differences*, which is scale-free. Fitted lengths
come from the dynamics, not from image geometry.

## Time base is a first-class measurement

A 1% error in the time axis biases the fitted g by ≈2% (g scales with time²).
During fixture development this was directly observable: a frame-interval
rounding slip of 1.01% moved the recovered g by 5σ before the time base was
fixed. Treat the camera's true fps as metadata to verify (film a stopwatch
once), and prefer container-reported timestamps over nominal mode names.

## Running the comparison

```bash
npm run fixture:hardware   # regenerate the seeded fixture (or skip: bring your own CSV)
npm run compare:hardware   # fit + report
# custom data:
npx tsx scripts/hardware-comparison.ts --csv path/to/tracked.csv --meta path/to/tracked.meta.json
```

The sidecar `meta.json` carries everything the fit needs: pivot pixel, y-axis
convention, fixed (independently measured) `m1/m2/gamma`, which parameters to
estimate, and initial guesses. See
`data/experimental/double-pendulum-tracker.meta.json` for the schema.

Outputs: `reports/hardware-comparison.json` and `.md` — convergence status,
angle RMSE, and for each estimated parameter the value, 1σ standard error
(linearised covariance at the optimum), and — when nominal values exist — the
relative error and a 2σ consistency verdict.

## Current fixture result (regression-tested)

With 361 frames at 60 fps, 0.7 px (1σ) tracker noise, released from rest:

| parameter | nominal | recovered | verdict |
|---|---:|---:|---|
| l1 | 0.320 m | within ±2σ | ✔ |
| l2 | 0.240 m | within ±2σ | ✔ |
| g  | 9.799 m/s² | within ±2σ | ✔ |

Angle RMSE sits at the injected noise floor (≈6 mrad), i.e. the model explains
the "measurement" down to instrument noise. The initial angles are co-estimated
(`estimateInitialAngles`) because freezing θ₀ at a single noisy first sample
injects a systematic state error that the optimiser can only absorb by biasing
the physical parameters.

## Why this chapter matters

Semiconductor device work ultimately validates simulation against measured
devices. This lane demonstrates the same discipline end-to-end on accessible
hardware: an independent measurement chain, an inverse problem with the
production solver in the loop, honest uncertainty, and a report that says *how
wrong* the theory is, not just that it "looks right".
