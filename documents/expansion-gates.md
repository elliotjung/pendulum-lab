# Expansion Gates

These are deliberate gates for capabilities that need hardware, larger data,
external accounts, or real users. Source code and synthetic tests may prepare a
path, but they cannot close the evidence boundary by themselves.

## Physical NVIDIA and AMD WebGPU evidence

Promotion requires native Chrome/WebGPU runs on one NVIDIA and one AMD adapter,
with unmodified adapter/vendor metadata, CPU-f64 oracle comparisons, deterministic
fixtures, repeated timing after warm-up, and the raw ladder artifact. A software
adapter, relabeled Intel result, mocked `GPUAdapterInfo`, or device-name string
is not accepted. The procedure is in [hardware validation](hardware-validation.md).

**Status:** external. No repository-only run can claim these vendors complete.

## Representative performance matrix

The intended matrix spans at least a low-power mobile device, a mainstream
laptop integrated GPU, and a discrete desktop GPU. Record browser build, power
mode, thermals where available, device-pixel ratio, problem size, worker count,
quality mode, cold/warm separation, median and tail latency, memory, and any
fallback. Promotion requires repeated measurements and a source-bound artifact;
one developer machine is diagnostic only.

**Status:** external device runs remain required.

## Camera calibration and recovery

The camera path must be evaluated as a measurement instrument, not just a media
permission demo. A representative protocol is:

1. Record device/browser, resolution, frame cadence, exposure/lighting, camera
   distance, lens orientation, and a known physical scale in the pendulum plane.
2. Calibrate pixels to length with multiple scale points; report residual error
   and repeat calibration after moving the camera.
3. Track a marker through clean motion, partial occlusion, complete loss, and
   reacquisition. Preserve confidence and dropped/interpolated-frame flags.
4. Compare extracted angle/period with an independently measured fixture and
   report bias, spread, synchronization uncertainty, and failure intervals.
5. Keep video local by default. Export or persistence must be explicit, scoped,
   deletable, and documented before capture begins.

Synthetic capture, permission, and recovery tests establish software behavior;
they do not certify real optics, lighting diversity, or privacy comprehension.

**Status:** real recordings, representative devices, and consent/privacy review
remain external.

## Independent formulation comparison

A useful future study should compare at least two genuinely distinct
formulations—such as minimal-angle coordinates and embedded Cartesian
constraints—on the same physical initial condition. The report must include the
coordinate transform and residual, constraint violation, conserved quantities,
step/tolerance refinement, conditioning near singular charts, runtime, and a
case where each approach is expected to struggle.

Sharing one RHS and changing only the integrator is not an independent
formulation comparison. Near-pole tests are especially important because the
legacy spherical chart is regularized there.

**Status:** design contract only; a full paired study and user-facing comparison
remain open.

## Large-data lifecycle

Before advertising gigabyte-scale studies, test creation, incremental writes,
quota pressure, restart/resume, export, import, migration, cancellation, and
deletion around 1 GB on supported browsers. Reports should include peak memory,
storage amplification, duration, partial-failure recovery, and a verified way to
delete the whole study. The UI must state what remains in memory, IndexedDB,
downloaded files, or worker checkpoints.

No silent telemetry or upload is required for this gate. If future remote
storage is introduced, purpose, retention, deletion, and account boundaries need
a separate consent review.

**Status:** representative browser/quota runs remain external; the existing
storage code must not be described as proven at 1 GB without those artifacts.

## Education and user comprehension

The core question is whether a learner can identify the reference, explain the
perturbation, choose interpretable initial conditions, and state what a
finite-time ensemble does and does not show. A privacy-respecting pilot can use
an observation sheet and anonymous local task codes; collect only task outcome,
time-to-first-correct-interpretation, wrong-turn category, and optional comments.
Do not collect names, accounts, camera/video, or background telemetry merely to
evaluate this interface.

Suggested tasks progress from a recognizable degree-based state to one explicit
`delta theta`, then to an ensemble summary. Report participant context and the
prompt verbatim so results are interpretable. Accessibility evaluation also
requires manual screen-reader/keyboard/zoom use; automated axe success is not a
substitute.

**Status:** classroom/user observation and manual assistive-technology review are
external. The checked templates and software tests prepare the study but do not
prove pedagogical effectiveness.
