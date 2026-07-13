# Theory vs Hardware: fitting the model to a tracked physical pendulum

Every other validation lane in this project compares _simulation to simulation_
(SciPy/Julia cross-checks, literature anchors, GPU-vs-CPU oracles). This
chapter closes the remaining gap: **simulation vs measurement** — the same
inverse-problem habit device/TCAD work calls _parameter extraction_, with the
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
noise). It is _not_ real footage yet; its purpose is to keep the entire
pipeline executable and regression-tested (`tests/hardware-comparison.test.ts`)
so that dropping in a real tracked CSV is a data swap, not an engineering
project. The sidecar metadata (`.meta.json`) records this provenance, and the
generated report repeats it. When a real capture replaces the fixture, update
`provenance.realFootage` and this section.

## Capture protocol (what to do with a phone)

1. **Rig**: rigid double pendulum (two links, low-friction pivots), high-contrast
   markers on both bobs and the pivot. A dark background helps the tracker.
2. **Camera**: phone on a tripod, lens axis perpendicular to the swing plane,
   60 fps (slow-motion modes are fine _if_ the true fps is recorded — see the
   time-base warning below). Lock focus/exposure.
3. **Protocol**: displace both links, hold still, release from rest. A clean
   release makes ω₀ = 0 a _protocol fact_, so only the initial angles need
   co-estimation.
4. **Independent measurements**: bob masses on a scale (m1, m2), and the
   damping γ from a separate small-amplitude decay video (logarithmic
   decrement). The dynamic fit then estimates `l1`, `l2`, `g` — length and
   local gravity are recovered from _timing_, which is the interesting check.
5. **Tracking**: extract per-frame bob coordinates with
   [Tracker](https://physlets.org/tracker/) (or OpenCV template matching).
   Export CSV columns `time,x1,y1,x2,y2` in pixels (`#` comment lines are
   ignored). Note the pivot pixel position and whether y grows downward
   (image convention, the default) or upward.

No pixel→meter calibration is needed: the importer converts positions to
angles with `atan2` of pixel _differences_, which is scale-free. Fitted lengths
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

| parameter |    nominal |  recovered | verdict |
| --------- | ---------: | ---------: | ------- |
| l1        |    0.320 m | within ±2σ | ✔       |
| l2        |    0.240 m | within ±2σ | ✔       |
| g         | 9.799 m/s² | within ±2σ | ✔       |

Angle RMSE sits at the injected noise floor (≈6 mrad), i.e. the model explains
the "measurement" down to instrument noise. The initial angles are co-estimated
(`estimateInitialAngles`) because freezing θ₀ at a single noisy first sample
injects a systematic state error that the optimiser can only absorb by biasing
the physical parameters.

## Why this chapter matters

Semiconductor device work ultimately validates simulation against measured
devices. This lane demonstrates the same discipline end-to-end on accessible
hardware: an independent measurement chain, an inverse problem with the
production solver in the loop, honest uncertainty, and a report that says _how
wrong_ the theory is, not just that it "looks right".

## One-time guest runner for NVIDIA or AMD evidence

The vendor matrix must come from a physical adapter. A friend or school can
lend a Windows PC for one run without becoming a permanent infrastructure
operator. Treat the machine and repository as mutually untrusted: use an
ephemeral repository runner, expose no repository or personal secrets, accept
only a maintainer-dispatched workflow from the protected default branch, and
remove the runner immediately after downloading the artifact.

### Before registration (maintainer and device owner together)

1. Confirm the adapter and driver in Windows Task Manager or the vendor control
   panel. Update Chrome and the stable NVIDIA/AMD driver, reboot, and verify
   `chrome://gpu` reports WebGPU hardware acceleration rather than a software
   adapter.
2. Create a temporary, non-administrator local Windows account. Do not use a
   daily-use account, do not mount personal/cloud folders, and do not leave
   browser sessions, SSH keys, npm tokens, or GitHub credentials in it. Allow
   outbound HTTPS; no inbound port or public IP is required.
3. In GitHub, review `.github/workflows/webgpu-vendor-evidence.yml` at the exact
   default-branch commit to run. It is `workflow_dispatch` only and uploads
   `reports/gpu-benchmark-ladder.*`. Do not register a guest runner while an
   untrusted pull request can select or alter the job. Repository Actions must
   require approval for first-time contributors.
4. The maintainer opens **Settings -> Actions -> Runners -> New self-hosted
   runner**, selects Windows x64, and shares the displayed registration command
   privately during the setup call. The registration token is short-lived and
   must never be pasted into an issue, chat log, screenshot, or report.

### Register and run once

From an empty directory owned by the temporary account, download and verify the
runner archive using the SHA-256 command GitHub shows on the registration page.
Then use the displayed URL/token with an explicit vendor label and ephemeral
mode (replace `nvidia` with `amd` as appropriate):

```powershell
.\config.cmd --url https://github.com/elliotjung/pendulum-lab --token <one-time-token> `
  --name guest-nvidia-<random-suffix> --labels webgpu,nvidia --ephemeral --unattended
.\run.cmd
```

Do not install the runner as a Windows service for this procedure. In the
repository Actions UI, dispatch **WebGPU Vendor Evidence**, choose the matching
vendor, and record the workflow URL and source commit. The job must land on a
runner whose labels include `self-hosted`, `webgpu`, and exactly one of
`nvidia`/`amd`. Stay present until it exits; cancel it if the checkout SHA or
workflow differs from the reviewed commit.

### Evidence acceptance and artifact handling

1. Download `gpu-ladder-nvidia` or `gpu-ladder-amd` from that workflow run.
   Keep the GitHub artifact archive unchanged and compute its SHA-256 locally.
2. Inspect `gpu-benchmark-ladder.json`: adapter name/vendor/device metadata must
   identify the expected physical GPU, the software-adapter flag must be false,
   and the CPU-f64 comparison gates must pass. A label alone is not evidence.
3. Store the workflow URL, commit SHA, runner OS/driver/Chrome versions, artifact
   SHA-256, and owner consent in the release evidence note. Do not publish the
   device owner's username, machine name, IP address, or runner registration
   log.
4. Combine vendor artifacts in a clean directory and require a complete matrix:

```powershell
$env:GPU_MATRIX_INPUT_DIR = '<downloaded artifact directory>'
$env:GPU_MATRIX_REQUIRE_COMPLETE = '1'
npm run benchmark:gpu-matrix
```

The generated `reports/gpu-adapter-matrix.*` remains explicit about any vendor
that was not physically measured. Never relabel an Intel, software, or cloud
adapter as NVIDIA/AMD evidence.

### Revoke and clean up (mandatory)

After the workflow finishes, stop `run.cmd`. An ephemeral runner should remove
itself after one job, but the maintainer must still confirm it is offline or
absent in **Settings -> Actions -> Runners** and force-remove any residual
entry. Delete the runner directory and temporary Windows account, then reboot
or sign out. The device owner checks that no `Runner.Listener`, `Runner.Worker`,
Node, Vite, or Chrome process from the run remains. Registration/removal tokens
must not be retained; if any credential or personal file appeared in a log,
delete the artifact/log where possible and rotate the exposed credential before
using the evidence.

The maintainer finally records a four-state closeout: `artifact downloaded`,
`hash recorded`, `runner removed`, and `temporary account deleted`. A guest run
is incomplete until all four are true.
