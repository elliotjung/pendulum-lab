# Mathematical derivations

The equations of motion implemented in `src/physics/`, derived from first
principles. Conventions: angles θ are measured from the downward vertical,
g > 0 acts downward, y is up, and every system hangs from a fixed pivot at the
origin. State layouts match the code exactly.

## 1. Planar double pendulum (`double.ts`)

Generalized coordinates (θ₁, θ₂); bob positions

- x₁ = l₁ sinθ₁, y₁ = −l₁ cosθ₁
- x₂ = x₁ + l₂ sinθ₂, y₂ = y₁ − l₂ cosθ₂

Lagrangian L = T − V with

- T = ½ m₁ l₁² ω₁² + ½ m₂ [ l₁² ω₁² + l₂² ω₂² + 2 l₁ l₂ ω₁ ω₂ cos(θ₁−θ₂) ]
- V = −(m₁+m₂) g l₁ cosθ₁ − m₂ g l₂ cosθ₂

The Euler–Lagrange equations give the standard coupled form

```
(m₁+m₂) l₁ α₁ + m₂ l₂ α₂ cosΔ =  −m₂ l₂ ω₂² sinΔ − (m₁+m₂) g sinθ₁
m₂ l₂ α₂ + m₂ l₁ α₁ cosΔ       =   m₂ l₁ ω₁² sinΔ − m₂ g sinθ₂
```

with Δ = θ₁−θ₂, solved in closed form in `rhsDouble`. Linear rate damping is a
generalized torque `Qᵢ = −γωᵢ` on the right-hand side of the coupled system;
the acceleration contribution is therefore `M(θ)⁻¹Q`, not an independent
post-step velocity decay. The analytic Jacobian (`jacobianDouble`) is the exact
derivative of this RHS and removes the finite-difference floor from the
Lyapunov spectrum.

**Validation:** energy conservation at machine precision over RK4 dt-halving
(`tests/`), small-angle normal modes ω± = √((g/l)(2±√2)) for m₁=m₂, l₁=l₂
(literature anchors), SciPy DOP853 and SymPy cross-checks.

## 2. Planar N-chain (`nPendulum.ts`)

For N links with suffix masses S_j = Σ_{i≥j} m_i, the kinetic energy of the
chain gives the mass matrix and force terms

```
M_jk(θ) = S_max(j,k) · l_j l_k · cos(θ_j − θ_k)
C_jk    = S_max(j,k) · l_j l_k · sin(θ_j − θ_k)
M α = −[C ω²]_j − g l_j S_j sinθ_j − γ ω_j
```

Each RHS evaluation builds M and the force vector into a reusable workspace
and solves with partially-pivoted Gaussian elimination (`linearSolve.ts`).
M is symmetric positive definite for every configuration (suffix-mass
structure); `chainMassMatrix` exposes it and
`tests/chain-validation-hardening.test.ts` verifies symmetry + Cholesky PD
over seeded random states, plus a small-angle normal-mode external reference
solved independently in the test.

**Reductions:** N=2 reproduces `rhsDouble`, N=3 reproduces `rhsTriple` to
machine epsilon (`tests/n-pendulum.test.ts`).

## 3. Spherical N-chain (`sphericalChain.ts`)

Each link k carries two coordinates (θ_k, φ_k) — polar from the downward
vertical and azimuth. With unit link direction

```
u_k = ( sinθ cosφ, −cosθ, sinθ sinφ )
```

bob positions are r_i = Σ_{k≤i} l_k u_k. The position Jacobian has exact
columns ∂r_i/∂θ_k = l_k a_k and ∂r_i/∂φ_k = l_k b_k where

```
a = ∂u/∂θ = ( cosθ cosφ, sinθ, cosθ sinφ )
b = ∂u/∂φ = sinθ · e_φ,            e_φ = ( −sinφ, 0, cosφ )
ȧ = −θ̇ u + φ̇ cosθ e_φ
ḃ = θ̇ cosθ e_φ − φ̇ sinθ ρ,        ρ = ( cosφ, 0, sinφ )
```

The manipulator-form equations M(q) q̈ = Q_grav − C(q, q̇) then have exact
entries (no finite differences anywhere):

```
M_(jα)(kβ) = S_max(j,k) · l_j l_k · d_jα·d_kβ      (d = a for θ, b for φ)
C_(jα)     = Σ_k S_max(j,k) · l_j d_jα · v_k,       v_k = l_k (θ̇_k ȧ_k + φ̇_k ḃ_k)
Q_grav,θj  = −g l_j sinθ_j S_j                       (φ rows: 0)
```

Damping is per-coordinate rate damping applied after the solve (matches
`spherical.ts`, so N=1 reduces exactly to `sphericalRhs`).

**Chart limit (pole singularity).** At sinθ_k → 0 the azimuth is undefined
and the φ_k row/column of M degenerates ∝ sin²θ. The chart is regularised by
clamping |sinθ| ≥ 1e-6 inside b. Consequences, tested in
`tests/chain-validation-hardening.test.ts`:

- planar motion (all φ̇ = 0 ⇒ L_z = 0) passes through the pole smoothly —
  energy drift stays at machine precision;
- L_z ≠ 0 trajectories that graze the pole genuinely diverge in this chart
  (φ̇ = L_z/(m l² sin²θ)); the solver fails loudly with a diagnostic error
  instead of emitting NaN, and the 3D Lab displays a chart-limit warning.

**Conserved quantities.** Undamped: total energy and the vertical angular
momentum L_z = Σ m_i (z_i ẋ_i − x_i ż_i) (proved by the φ-independence of the
Lagrangian under simultaneous azimuth rotation). Both are live diagnostics.

**Validation:** N=1 ≡ spherical pendulum; vertical-plane motion ≡ planar
chain; E and L_z conservation in full 3D chaos; independent SymPy symbolic
derivation compared component-wise at random states (`npm run validate:sympy`).

## 4. Double string pendulum (`doubleString.ts`)

Same geometry as the rigid double pendulum but the links are inextensible
strings: the constraint is *unilateral* (a string can pull, not push). The
taut dynamics equal the rigid system; the string tensions follow from the
per-bob Newton equations,

```
T₂ = m₂ ( g cosθ₂ − a₂·ê₂ )
T₁ = m₁ ( g cosθ₁ − a₁·ê₁ ) + T₂ cos(θ₁−θ₂)
```

with êᵢ the inward unit vectors and aᵢ the bob accelerations from the rigid
RHS. Phase logic:

- **taut** while T₁, T₂ ≥ 0 (integrated with RK4 on the rigid equations);
- T₂ < 0 → **outer-slack**: bob 2 in ballistic flight, bob 1 on a single
  string (with its own tension gate);
- T₁ < 0 → **full-slack**: both ballistic;
- recapture when |r| returns to the string length with outward radial
  velocity — the radial component is removed (perfectly inelastic), which
  loses energy; every event is recorded with its energy loss.

Because the slack/capture events are non-smooth, the smooth `double-string`
SystemSpec exposes only the taut-branch vector field; the
`doubleStringTautFraction` probe quantifies how valid that chart is for a
given initial condition (fraction of time taut, event counts, energy lost),
and analyses are badge-gated on it.

## 5. Melnikov threshold (`melnikov.ts`)

For the damped driven pendulum θ̈ = −sinθ − γθ̇ + A cos(ωt), the homoclinic
orbit of the unperturbed pendulum is θ₀(t) = 4 arctan(e^t). The Melnikov
function along it,

```
M(t₀) = ∫ θ̇₀(t) [ −γ θ̇₀(t) + A cos(ω(t+t₀)) ] dt
      = −8γ + 2πAω sech(πω/2) sin(ωt₀)
```

has simple zeros (transverse homoclinic intersection ⇒ chaos) when

```
A > A_c(γ, ω) = (4γ/πω) cosh(πω/2)
```

The implementation pins the analytic A_c against numerical quadrature of
M(t₀) and corroborates the onset with the 0–1 test; the mini-paper measures
the gap between A_c and the period-doubling onset A_PD as γ varies.

## 6. Lyapunov spectrum (`lyapunov.ts`)

Benettin/Shimada–Nagashima: integrate the flow plus an orthonormal tangent
frame (exact Jacobian where available, central differences otherwise),
re-orthonormalising with modified Gram–Schmidt every `renormEvery` steps; the
exponents are time-averaged log expansion rates of the R diagonal. Reported
with batched standard errors and, for Hamiltonian systems, the symplectic
pairing self-check (λᵢ + λ_{2n+1−i} ≈ 0 and Σλ ≈ 0) as an internal
consistency gate. All values are finite-time estimates and are badged as such
in the UI.

## 7. Conserved quantities by Noether detection (`conservedQuantities.ts`)

For the autonomous (γ = 0) chain Lagrangians, Noether's theorem pairs each
one-parameter symmetry group with a conserved charge. The detector verifies
each candidate two independent ways and requires them to agree:

1. **Symmetry of the Hamiltonian.** The group action g_ε (a Rodrigues rotation
   of every link direction u_k and velocity u̇_k about a fixed axis, converted
   back to the (θ, φ) chart) is applied to probe states and the directional
   derivative |dH/dε| is measured by a central difference. Rotations about the
   vertical (gravity) axis leave the energy invariant; rotations about a
   horizontal axis change bob heights, so |dH/dε| = O(m·g·l) unless g ≈ 0.
2. **Conservation along the flow.** The candidate momentum (the axis-projected
   total angular momentum L·n̂ = Σ mᵢ rᵢ × vᵢ · n̂, or the energy) is sampled
   along an RK4 trajectory and its relative drift is measured.

A symmetry ⟺ a conserved momentum, so the two verdicts must match; a mismatch
flags an unconverged trajectory or a derivation bug rather than physics. With
gravity present only the vertical-axis charge survives; as g → 0 the full
rotation group SO(3) reappears and all three components are conserved; any
damping breaks the Lagrangian structure and every charge decays. This is
numerical detection on finite probes/horizons, not a symbolic proof, and the
chart conversion degrades near the poles (|sinθ| → 0).

## 8. Variance-based sensitivity (Sobol indices, `sobolSensitivity.ts`)

For an output Y = f(X₁, …, X_d) of independent inputs, the first-order Sobol
index S_i = Var(E[Y | X_i]) / Var(Y) is the fraction of output variance
explained by X_i alone, and the total index S_Ti = E[Var(Y | X_{∼i})] / Var(Y)
adds every interaction involving X_i, so S_Ti ≥ S_i with equality iff X_i has
no interactions. They are estimated by the Saltelli radial scheme from two
independent sample matrices A, B (a joint 2d-dimensional Sobol low-discrepancy
stream split in half) and the radial matrices AB_i (A with column i taken from
B):

```
S_i  = (1/N) Σ f(B)·(f(AB_i) − f(A)) / V            (Saltelli 2010)
S_Ti = (1/2N) Σ (f(A) − f(AB_i))² / V               (Jansen 1999)
```

with V the sample variance over A ∪ B; cost N·(d + 2) evaluations. The
estimators carry O(1/√N) Monte-Carlo noise, so small negative S_i and
S_Ti < S_i within noise are expected, not contradictions. Pinned against the
analytic additive-linear model and the Ishigami benchmark (whose third input
has zero first-order but a real total effect through the X₁X₃ interaction).

## 9. WebGPU field scans and the CPU cross-validation contract (`gpuFields.ts`)

The flip-basin, sweep λ_max, and finite-difference FTLE grids optionally run as
WebGPU f32 compute kernels. Because WebGPU integrates in single precision, the
per-cell result inherits f32 round-off, which in chaotic regions grows at the
Lyapunov rate. The accelerator is therefore never trusted blindly: on every GPU
run a deterministic probe subset (corners, edge midpoints, centre) is recomputed
on the CPU in f64 *with the same algorithm* and compared. If the discrepancy
exceeds a per-field tolerance the entire grid is recomputed on the CPU and the
f64 result is returned instead. Results report their `backend` and carry a
validated-vs-caveat credibility badge; the sweep kernel uses the two-trajectory
(finite-separation) Benettin estimator and the FTLE kernel the Shadden-style
finite-difference flow-map gradient, both of which differ in method from the
variational CPU references and are documented as such.

## 10. Uniform-rigid-rod compound double pendulum (`compoundDouble.ts`)

This model has two uniform rods joined serially. The generalized coordinates
θ₁ and θ₂ are the rods' absolute angles from the downward vertical. Their
centres of mass are

```
r₁c = ( (l₁/2) sinθ₁,                    −(l₁/2) cosθ₁ )
r₂c = ( l₁ sinθ₁ + (l₂/2) sinθ₂, −l₁ cosθ₁ − (l₂/2) cosθ₂ ) .
```

The kinetic energy is assembled from COM translation plus rotation about each
COM,

```
T = ½m₁|ṙ₁c|² + ½I₁c θ̇₁² + ½m₂|ṙ₂c|² + ½I₂c θ̇₂²,
Iᵢc = mᵢlᵢ²/12,
```

so a hinge inertia is never added on top of COM translation. This avoids the
common double-counting error. With Δ = θ₁ − θ₂, the result is

```
T = ½ M₁₁ θ̇₁² + M₁₂ θ̇₁θ̇₂ + ½ M₂₂ θ̇₂²,

M₁₁ = l₁²(m₁/3 + m₂),
M₁₂ = (m₂l₁l₂/2) cosΔ,
M₂₂ = m₂l₂²/3.
```

Taking zero height at the hinge gives

```
V = −(m₁/2 + m₂)gl₁ cosθ₁ − (m₂gl₂/2) cosθ₂.
```

Define `B = m₂l₁l₂/2`, `G₁ = (m₁/2 + m₂)gl₁`, and
`G₂ = m₂gl₂/2`. Euler–Lagrange then gives the explicit linear solve

```
[ M₁₁  M₁₂ ] [ θ̈₁ ] = [ −B sinΔ θ̇₂² − G₁ sinθ₁ − γθ̇₁ ]
[ M₁₂  M₂₂ ] [ θ̈₂ ]   [ +B sinΔ θ̇₁² − G₂ sinθ₂ − γθ̇₂ ] .
```

Here γ is the existing generalized-coordinate damping convention: each joint
receives `−γθ̇ᵢ`. The implementation scales the 2×2 system before solving and
reports the raw determinant, a scale-free relative determinant, matrix scale,
positive-definiteness, and the numerical-singularity verdict. For all strictly
positive physical masses and lengths,

```
det M ≥ m₂l₁²l₂²(m₁/9 + m₂/12) > 0,
```

because the minimum occurs at `cos²Δ = 1`; therefore a singular verdict for
valid inputs indicates numerical ill-scaling rather than a physical
configuration singularity.

`compoundDoubleReference.ts` supplies an independent check based on Cartesian
virtual work. It constructs every inertia term as `Σ m JᵀJ + I_cm`, writes each
COM acceleration as `Jq̈ + b`, projects gravity and the Cartesian acceleration
bias through `Jᵀ`, and only then solves for `q̈`. It does not reuse the closed
Euler–Lagrange RHS above. Regression coverage compares both routes and checks
undamped energy conservation, the two generalized small-angle normal modes,
reflection and 2π periodicity, the `m₂ → 0` uniform-single-rod limit, the
zero-gravity static limit, and invalid/ill-scaled parameter diagnostics.
