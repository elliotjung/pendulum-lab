# Control Module (`src/control/`)

Optimal control of actuated pendulums: torque-input dynamics (double pendulum
and planar N-chain), upright LQR balancing, energy-shaping swing-up with an
LQR capture stage, and iLQR trajectory optimisation with analytic RK4
chain-rule derivatives and an exact box-constrained backward pass. Exposed
through the `experimental` namespace (per the SemVer policy in
`docs/api-overview.md`: new API families land in `experimental` first), and
demonstrated live in the app's **Control** tab (swing-up animation with
torque arcs, energy bar, and controller-phase badge).

Provenance: the capability set is adopted from the DFKI-RIC `double_pendulum`
benchmark (LQR / energy / iLQR controllers, actuation modes, RoA gating) and
the DDP-family solvers of Crocoddyl / Drake / OCS2 — re-designed for this
codebase rather than transcribed. The full source survey is in
[`learn-from-this-study.md`](learn-from-this-study.md).

## Design decisions and why

### 1. Actuated dynamics mirror `rhsDouble` instead of wrapping it

`rhsDoubleActuated` re-states the double-pendulum Euler-Lagrange assembly term
by term and injects joint torques as generalised forces. Alternatives
considered:

- *Wrap `rhsDouble` and add `M⁻¹Sτ` afterwards* — costs a second mass-matrix
  build/solve per RHS call and hides the force-level entry point.
- *Add an optional torque argument to `rhsDouble` itself* — touches the
  SymPy-validated hot path (claims #2/#3 in the README) for a feature most
  callers never use.

The mirror keeps the validated path untouched while the contract
`rhsDoubleActuated(τ=0) ≡ rhsDouble` is pinned **bitwise** in
`tests/control-lqr.test.ts`, so the two implementations cannot drift silently.

Torque convention: `τ = [τ1, τ2]` are joint torques (pivot, elbow). With the
absolute-angle state used across this repo, virtual work gives the
generalised-force map `Q_θ1 = τ1 − τ2`, `Q_θ2 = τ2`; the injected power
`τ1·ω1 + τ2·(ω2 − ω1)` is verified against a numerical energy derivative in
the tests. All three DFKI actuation modes are supported: `full`, `acrobot`
(elbow only), `pendubot` (shoulder only).

### 2. LQR: discrete design, dependency-free Riccati

Where the DFKI reference calls `scipy.linalg.solve_continuous_are`, this
module:

1. linearises analytically at the upright equilibrium — A from the existing
   closed-form `jacobianDouble`, B = M⁻¹S in closed form (verified against
   central differences);
2. discretises exactly with the **Van Loan block exponential**
   `expm([[A,B],[0,0]]dt) = [[Ad,Bd],[0,I]]`, using a scaling-and-squaring
   `matExp` pinned against the closed-form rotation exponential;
3. solves the **discrete** algebraic Riccati equation by value iteration from
   `P₀ = Q` — converges to the stabilising solution for a stabilisable /
   detectable pair without an initial stabilising gain (Bertsekas, DP&OC);
4. reports the closed-loop eigenvalues of `Ad − BdK` via the existing
   `eigenvaluesGeneral` (Francis QR) so `stabilising` is a **checked claim**
   (`spectralRadius < 1`), not an assumption.

Discrete-time was chosen over continuous CARE deliberately: the simulation
loop applies one torque per integrator step, so the design clock and the
deployment clock coincide, and value iteration is the simplest solver that is
correct without a stabilising initialisation (Kleinman iteration needs one;
Hamiltonian-eigenvector methods need ordered complex Schur forms).

Matrices are plain `number[][]`: these are 4×4 design-time objects, not
hot-loop state; readability against the textbook recursion wins.

### 3. Swing-up: energy pump + Lyapunov-gated capture

For the fully-actuated pendulum the generalised forces
`Q_i = k_e (E_up − E) ω_i` give `dE/dt = k_e (E_up − E)‖ω‖² ≥ 0` below the
upright energy — a one-line Lyapunov argument (Åström–Furuta family; the
underactuated Xin–Kaneda variant in the DFKI repo trades this simplicity for
acrobot support, which iLQR covers here instead). A kick torque escapes the
degenerate `ω = 0` hanging state.

The capture stage latches to LQR when the quadratic cost-to-go
`V(x) = δxᵀPδx` falls below `captureLevel` — the same ellipsoidal
region-of-attraction gate the DFKI RoA tooling uses — and unlatches only
beyond `10× captureLevel` (hysteresis, no chatter). The default gate is
`'auto'`: `autoCaptureLevel` evaluates `0.8 · δᵣᵀPδᵣ` at a fixed reference
deviation (0.3 rad / 0.5 rad/s in the *anti-phase* sign pattern — P's cross
terms make the in-phase pattern an order of magnitude larger, so anti-phase
is the conservative direction). Because the gate is derived from the design's
own P it rescales automatically with `Q`, `R`, `dt`, and the plant
parameters; on the unit pendulum it evaluates to ≈ 2.5e3, reproducing the
previously hand-calibrated constant. The pump's first dip at the upright
level set measures `V ≈ 2.1e3` at `t ≈ 6.9 s`, so the gate catches the first
pass; the full run (hanging → captured, final wrapped deviation < 1e-3) is
pinned in `tests/control-swingup.test.ts`.

### 4. iLQR: generic solver over a discrete step map

`ilqrSolve` follows the Crocoddyl/Drake/Tassa structure — quadratic backward
recursion with **Levenberg regularisation on Q_uu** (Cholesky failure ⇒ raise
μ and retry), forward **backtracking line search that keeps the time-varying
feedback gains**, acceptance only on actual cost decrease. Consequences
pinned by tests:

- the cost history is strictly decreasing by construction;
- replaying the returned controls through the step map reproduces the
  returned states bitwise (the "solution" is a real rollout, not a
  linearisation artifact);
- calibrated swing-up results: fully-actuated hanging→inverted in 3 s
  (final angle error < 0.02 rad), acrobot recovery with the elbow motor only.

**Derivatives are analytic.** `makeRk4StepDerivatives` differentiates the RK4
step map exactly by the chain rule through the four stages, fed by the
closed-form `jacobianDoubleActuated` (the torque term's configuration
dependence included) and `controlMatrixDouble`. This removes the ~1e-9
finite-difference floor and replaces 2(n+m) rollouts per knot with four
Jacobian evaluations — the same "analytic over finite-difference" policy the
chaos pipeline follows. The central-difference path remains as the fallback
for user-supplied step maps without Jacobians, and the tests pin the two
paths against each other.

**Torque limits use a real box-constrained backward pass.** With a finite
`torqueLimit` each knot solves the box QP `min ½δuᵀQ_uu δu + Q_uᵀδu` exactly
by active-set enumeration (3^m KKT candidates — exhaustive and exact for the
m ≤ 3 inputs here; Tassa's box-DDP solves the same QP iteratively for large
m), and feedback rows of clamped inputs are zeroed so the line search never
fights a saturated channel. Rollout clamping remains as the final guard.

**Long optimisations cannot freeze the UI.** `ilqrSolveAsync` runs the solver
in warm-started chunks that yield to the event loop; determinism makes the
chunk boundary exact, so the concatenated cost history stays non-increasing.
The Control tab's plan-then-track mode is built on it.

### 5. N-chain balancing (`designChainUprightLqr`)

The upright LQR generalises to the fully-actuated planar N-chain: exact
linearisation from `jacobianChain` (extended with a constant generalised
force so the actuated Jacobian is still analytic — the −(∂M/∂x)·α term
carries the torque's configuration dependence automatically), closed-form
B = M⁻¹S, and the same discretisation + Riccati pipeline. The N = 2 case
cross-checks against the double-pendulum design to 5 decimals; N = 3 balances
the nonlinear inverted triple chain in simulation and N = 4 is Schur-stable —
a capability none of the surveyed source projects ship.

## What was deliberately not built

- **Continuous CARE solver** — subsumed by the discrete design (see §2).
- **TVLQR tracking** of iLQR trajectories — iLQR already returns the
  time-varying gains `K(t)` from its backward pass; a tracking wrapper adds
  API without new mathematics. Revisit if MPC-style receding horizons land.
- **RL controllers** (SAC/DQN/evolsac from the DFKI repo) — trained-weight
  reproducibility conflicts with the evidence-badge policy, and the learning
  track is already covered by `reservoir`/`hamiltonianLearning`/`sindy`.
- **Worker-protocol iLQR jobs** — the problem closure (dynamics + Jacobians)
  does not serialise across the worker boundary without a spec language;
  cooperative chunking (`ilqrSolveAsync`) delivers the responsiveness goal at
  a fraction of the surface area. Revisit if headless batch studies need it.

## Test map

| Property | Test |
|---|---|
| τ=0 bitwise equality with `rhsDouble`; closed-form B vs central differences; injected-power identity | `tests/control-lqr.test.ts` |
| `matExp` / Van Loan discretisation closed forms; DARE fixed-point residual; Schur stability for all 3 modes; nonlinear balancing (full + acrobot) | `tests/control-lqr.test.ts` |
| Energy-gap monotone closure; kick behaviour; hanging→captured swing-up; auto capture-level scaling; phase latch/reset; underactuated-mode rejection | `tests/control-swingup.test.ts` |
| Step-map equivalence to RK4+ZOH; strict cost monotonicity; swing-up and recovery end-states; torque-limit compliance; rollout replay equality | `tests/control-ilqr.test.ts` |
| Actuated Jacobian vs central differences; RK4 chain-rule fx/fu vs finite differences; analytic-vs-FD solution agreement; async chunking; box QP KKT cases; saturated swing-up | `tests/control-analytic-derivatives.test.ts` |
| Chain τ=0 bitwise equality; N=2 ≡ double pendulum; chain B and Jacobian vs central differences; N=2 gain cross-check; N=3 nonlinear balancing; N=4 Schur stability | `tests/control-chain.test.ts` |
| Control tab mount, hybrid run engagement, strategy/actuation coupling | `e2e/control-tab.spec.ts` |
