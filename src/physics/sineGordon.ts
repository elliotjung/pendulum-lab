/**
 * **Continuum sine-Gordon field** u_tt − u_xx + sin u = 0 — the relativistic
 * nonlinear-wave limit of the discrete Frenkel–Kontorova / coupled-pendulum
 * chain in `pendulumNetwork.ts`. Where that module gives the *harmonic* phonon
 * dispersion of small-amplitude lattice waves, this one carries the genuinely
 * nonlinear content: **topological solitons (kinks)** and **breathers**.
 *
 * A chain of pendula coupled by torsional springs, in the long-wavelength limit
 * a_lattice → 0 with the coupling scaled so that c² = κa²/I stays finite, obeys
 * exactly this equation (after rescaling x and t so c = 1 and the on-site
 * frequency ω₀ = 1). It is the canonical model for dislocations in a crystal
 * lattice, magnetic-flux quanta (fluxons) in long Josephson junctions, and
 * charge-density waves — all solid-state systems where a *topologically*
 * protected, particle-like excitation moves through a periodic substrate. That
 * makes the kink the nonlinear counterpart of `latticeDispersion`'s phonon: the
 * most direct soliton/defect extension of the pendulum family.
 *
 * Normalised units (c = 1, m = 1, substrate period 2π). Useful exact facts the
 * helpers below encode and the tests pin against finite-difference residuals:
 *
 *   - **Kink / antikink** u(x,t) = 4·arctan[ exp( ±γ(x − vt − x₀) ) ], the
 *     Lorentz-boosted static kink with γ = 1/√(1 − v²). Topological charge
 *     Q = [u(+∞) − u(−∞)]/2π = ±1. Rest energy E₀ = 8; a moving kink carries
 *     E = 8γ and momentum P = 8γv — it is a relativistic particle.
 *   - **Breather** u(x,t) = 4·arctan[ (√(1−ω²)/ω)·sin(ωt) / cosh(√(1−ω²)·x) ],
 *     a bound kink–antikink pair oscillating at 0 < ω < 1 with energy
 *     16√(1−ω²) (→ 0 as ω → 1, → 2·E₀ as ω → 0).
 *   - **Linear dispersion** (sin u ≈ u): ω² = 1 + k², the massive Klein–Gordon
 *     band with a gap ω(0) = 1 — the continuum image of the gravity-pinned
 *     pendulum lattice's optical-like cutoff.
 *
 * A second-order **leapfrog (Störmer–Verlet)** integrator advances an arbitrary
 * initial field on a uniform grid; launched from the analytic moving kink it
 * translates at speed v with the topological charge and a discrete energy both
 * conserved to the discretisation floor.
 */

/** +1 → kink (charge +1); −1 → antikink (charge −1). */
export type KinkSign = 1 | -1;

/** Rest energy of a static sine-Gordon kink in normalised units. */
export const SINE_GORDON_KINK_REST_ENERGY = 8;

export interface SineGordonKinkParams {
  /** Translation velocity v with |v| < 1 (the "speed of light" is 1). */
  velocity: number;
  /** Kink centre x₀ at t = 0. Default 0. */
  center?: number;
  /** +1 kink or −1 antikink. Default +1. */
  sign?: KinkSign;
}

function lorentzGamma(velocity: number, who: string): number {
  if (!(Math.abs(velocity) < 1)) throw new Error(`${who}: |velocity| must be < 1 (the wave speed).`);
  return 1 / Math.sqrt(1 - velocity * velocity);
}

/**
 * Analytic kink/antikink displacement u(x, t) = 4·arctan(exp(±γ(x − vt − x₀))).
 * Satisfies u_tt − u_xx + sin u = 0 exactly.
 */
export function sineGordonKink(x: number, t: number, params: SineGordonKinkParams): number {
  const v = params.velocity;
  const gamma = lorentzGamma(v, 'sineGordonKink');
  const sign = params.sign ?? 1;
  const xi = gamma * (x - v * t - (params.center ?? 0));
  return 4 * Math.atan(Math.exp(sign * xi));
}

/**
 * Time derivative u_t of the kink, for launching it as an initial condition.
 * d/dt 4·atan(e^{s·γ(x−vt−x₀)}) = 4·(−s·γv)·e^{ξ}/(1+e^{2ξ}) = −2 s γ v sech(ξ).
 */
export function sineGordonKinkRate(x: number, t: number, params: SineGordonKinkParams): number {
  const v = params.velocity;
  const gamma = lorentzGamma(v, 'sineGordonKinkRate');
  const sign = params.sign ?? 1;
  const xi = sign * gamma * (x - v * t - (params.center ?? 0));
  return -2 * sign * gamma * v * sech(xi);
}

/** Total energy E = 8γ of a kink moving at velocity v (rest energy at v = 0). */
export function kinkEnergy(velocity: number): number {
  return SINE_GORDON_KINK_REST_ENERGY * lorentzGamma(velocity, 'kinkEnergy');
}

/** Relativistic momentum P = 8γv of a kink moving at velocity v. */
export function kinkMomentum(velocity: number): number {
  return SINE_GORDON_KINK_REST_ENERGY * lorentzGamma(velocity, 'kinkMomentum') * velocity;
}

export interface SineGordonBreatherParams {
  /** Internal oscillation frequency ω with 0 < ω < 1. */
  omega: number;
  /** Spatial centre x₀. Default 0. */
  center?: number;
}

function breatherScale(omega: number, who: string): number {
  if (!(omega > 0 && omega < 1)) throw new Error(`${who}: omega must satisfy 0 < omega < 1.`);
  return Math.sqrt(1 - omega * omega);
}

/**
 * Analytic standing breather u(x,t) = 4·arctan[ (η/ω)·sin(ωt)/cosh(ηx) ] with
 * η = √(1−ω²). A bound kink–antikink pair; satisfies the sine-Gordon equation.
 */
export function sineGordonBreather(x: number, t: number, params: SineGordonBreatherParams): number {
  const { omega } = params;
  const eta = breatherScale(omega, 'sineGordonBreather');
  const xc = x - (params.center ?? 0);
  return 4 * Math.atan(((eta / omega) * Math.sin(omega * t)) / Math.cosh(eta * xc));
}

/** Energy 16√(1−ω²) of a breather of frequency ω. */
export function breatherEnergy(omega: number): number {
  return 16 * breatherScale(omega, 'breatherEnergy');
}

/** Massive Klein–Gordon dispersion ω(k) = √(1 + k²) of small-amplitude waves. */
export function sineGordonDispersion(k: number): number {
  return Math.sqrt(1 + k * k);
}

/** Group velocity dω/dk = k/√(1+k²) (→ ±1 as |k| → ∞, 0 at the band edge). */
export function sineGordonGroupVelocity(k: number): number {
  return k / Math.sqrt(1 + k * k);
}

/** Phase velocity ω/k = √(1+k²)/k (superluminal — the band is gapped). */
export function sineGordonPhaseVelocity(k: number): number {
  if (k === 0) throw new Error('sineGordonPhaseVelocity: phase velocity diverges at k = 0.');
  return Math.sqrt(1 + k * k) / k;
}

/**
 * PDE residual u_tt − u_xx + sin u of a field supplied as a function u(x, t),
 * evaluated at (x, t) by second-order central finite differences with step h.
 * For an exact solution (kink, breather) this is O(h²) ≈ 0 — the test oracle.
 */
export function sineGordonResidual(u: (x: number, t: number) => number, x: number, t: number, h = 1e-3): number {
  const utt = (u(x, t + h) - 2 * u(x, t) + u(x, t - h)) / (h * h);
  const uxx = (u(x + h, t) - 2 * u(x, t) + u(x - h, t)) / (h * h);
  return utt - uxx + Math.sin(u(x, t));
}

/**
 * Topological charge Q = [u(x_last) − u(x_first)] / 2π of a sampled profile —
 * the conserved winding number (integer for a clean kink configuration).
 */
export function topologicalCharge(field: ArrayLike<number>): number {
  const n = field.length;
  if (n < 2) throw new Error('topologicalCharge: need at least two samples.');
  return ((field[n - 1] ?? 0) - (field[0] ?? 0)) / (2 * Math.PI);
}

function sech(z: number): number {
  return 1 / Math.cosh(z);
}

// --- numerical field integrator (leapfrog / Störmer–Verlet) ----------------

export type SineGordonBoundary = 'periodic' | 'fixed';

export interface SineGordonGrid {
  /** Displacement u at the current time level, length `points`. */
  u: Float64Array;
  /** Displacement at the previous time level (for the leapfrog three-level step). */
  uPrev: Float64Array;
  /** Number of spatial samples. */
  points: number;
  /** Grid spacing Δx = length/points (periodic) or length/(points−1) (fixed). */
  dx: number;
  /** Time step Δt. Stable while Δt ≤ Δx (CFL with wave speed 1). */
  dt: number;
  /** Domain length L. */
  length: number;
  /** Current simulation time. */
  time: number;
  /** Boundary condition. */
  boundary: SineGordonBoundary;
}

export interface SineGordonFieldSpec {
  /** Number of grid points (≥ 3). */
  points: number;
  /** Domain length L (> 0). */
  length: number;
  /** Time step Δt (> 0); keep Δt ≤ Δx for stability. */
  dt: number;
  /** Initial displacement u(x, 0). */
  initial: (x: number) => number;
  /** Initial rate u_t(x, 0). Default 0 (released from rest). */
  initialRate?: (x: number) => number;
  /** Boundary condition. Default 'fixed' (Dirichlet, asymptote-clamped). */
  boundary?: SineGordonBoundary;
}

/**
 * Build a leapfrog field. The previous level uPrev is seeded with a Taylor
 * back-step u(x,−Δt) ≈ u₀ − Δt·u̇₀ + ½Δt²·u₀'' so the very first step is
 * second-order accurate (and exact-velocity for a launched kink).
 */
export function createSineGordonField(spec: SineGordonFieldSpec): SineGordonGrid {
  const { points, length, dt } = spec;
  if (!Number.isInteger(points) || points < 3) throw new Error('createSineGordonField: points must be an integer ≥ 3.');
  if (!(length > 0)) throw new Error('createSineGordonField: length must be positive.');
  if (!(dt > 0)) throw new Error('createSineGordonField: dt must be positive.');
  const boundary = spec.boundary ?? 'fixed';
  const dx = boundary === 'periodic' ? length / points : length / (points - 1);
  const rate = spec.initialRate ?? (() => 0);

  const u = new Float64Array(points);
  const uPrev = new Float64Array(points);
  for (let i = 0; i < points; i += 1) u[i] = spec.initial(i * dx);

  // Second-order seed of the previous level using the spatial Laplacian of u₀.
  for (let i = 0; i < points; i += 1) {
    const lap = laplacian(u, i, dx, boundary);
    const u0 = u[i] ?? 0;
    const acc = lap - Math.sin(u0); // u_tt at t = 0
    uPrev[i] = u0 - dt * rate(i * dx) + 0.5 * dt * dt * acc;
  }
  return { u, uPrev, points, dx, dt, length, time: 0, boundary };
}

/** Second-order central Laplacian at site i with the given boundary rule. */
function laplacian(u: Float64Array, i: number, dx: number, boundary: SineGordonBoundary): number {
  const n = u.length;
  let left: number;
  let right: number;
  if (boundary === 'periodic') {
    left = u[(i - 1 + n) % n] ?? 0;
    right = u[(i + 1) % n] ?? 0;
  } else {
    // Fixed (Dirichlet): clamp the stencil at the ends to the boundary value.
    left = i === 0 ? (u[0] ?? 0) : (u[i - 1] ?? 0);
    right = i === n - 1 ? (u[n - 1] ?? 0) : (u[i + 1] ?? 0);
  }
  return (right - 2 * (u[i] ?? 0) + left) / (dx * dx);
}

/**
 * One explicit leapfrog step in place:
 *   u_i^{n+1} = 2u_i^n − u_i^{n−1} + Δt²·(u_xx − sin u_i).
 * Interior points update; fixed boundaries hold their value, periodic wrap.
 */
export function stepSineGordon(grid: SineGordonGrid): void {
  const { u, uPrev, dx, dt, points, boundary } = grid;
  const next = new Float64Array(points);
  const dt2 = dt * dt;
  const lo = boundary === 'fixed' ? 1 : 0;
  const hi = boundary === 'fixed' ? points - 1 : points;
  if (boundary === 'fixed') {
    next[0] = u[0] ?? 0;
    next[points - 1] = u[points - 1] ?? 0;
  }
  for (let i = lo; i < hi; i += 1) {
    const lap = laplacian(u, i, dx, boundary);
    next[i] = 2 * (u[i] ?? 0) - (uPrev[i] ?? 0) + dt2 * (lap - Math.sin(u[i] ?? 0));
  }
  grid.uPrev = grid.u;
  grid.u = next;
  grid.time += dt;
}

/**
 * Discrete field Hamiltonian
 *   E = Σ_i Δx [ ½((u_i − uPrev_i)/Δt)² + ½((u_{i+1} − u_i)/Δx)² + (1 − cos u_i) ].
 * The kinetic term uses the backward time difference available on the grid; the
 * value drifts only at the discretisation floor under the leapfrog flow.
 */
export function sineGordonFieldEnergy(grid: SineGordonGrid): number {
  const { u, uPrev, dx, dt, points, boundary } = grid;
  let energy = 0;
  for (let i = 0; i < points; i += 1) {
    const vel = ((u[i] ?? 0) - (uPrev[i] ?? 0)) / dt;
    let grad = 0;
    if (i < points - 1) grad = ((u[i + 1] ?? 0) - (u[i] ?? 0)) / dx;
    else if (boundary === 'periodic') grad = ((u[0] ?? 0) - (u[points - 1] ?? 0)) / dx;
    energy += dx * (0.5 * vel * vel + 0.5 * grad * grad + (1 - Math.cos(u[i] ?? 0)));
  }
  return energy;
}

/**
 * Estimate the kink centre — the position where u crosses π (the substrate
 * saddle) — by linear interpolation of the first upward crossing. Returns NaN
 * if no crossing exists. Used to measure kink propagation speed.
 */
export function kinkCenter(grid: SineGordonGrid): number {
  const { u, dx, points } = grid;
  for (let i = 0; i < points - 1; i += 1) {
    const a = u[i] ?? 0;
    const b = u[i + 1] ?? 0;
    if ((a - Math.PI) * (b - Math.PI) <= 0 && a !== b) {
      const frac = (Math.PI - a) / (b - a);
      return (i + frac) * dx;
    }
  }
  return Number.NaN;
}

/**
 * All positions where u crosses π (mod 2π is not applied) by linear
 * interpolation — one entry per soliton (kink or antikink) on the grid. A clean
 * kink–antikink pair on the u = 0 vacuum has two crossings; tracking them gives
 * the soliton separation through a collision.
 */
export function sineGordonKinkPositions(grid: SineGordonGrid): number[] {
  const { u, dx, points } = grid;
  const out: number[] = [];
  for (let i = 0; i < points - 1; i += 1) {
    const a = u[i] ?? 0;
    const b = u[i + 1] ?? 0;
    if ((a - Math.PI) * (b - Math.PI) < 0) {
      const frac = (Math.PI - a) / (b - a);
      out.push((i + frac) * dx);
    }
  }
  return out;
}

export interface KinkAntikinkSpec {
  /** Grid points (≥ 3). */
  points: number;
  /** Domain length L (> 0); the pair is centred at L/2. */
  length: number;
  /** Time step Δt (> 0); keep Δt ≤ Δx. */
  dt: number;
  /** Initial half-separation: kink at L/2 − d, antikink at L/2 + d. */
  separation: number;
  /** Approach speed v (0 ≤ v < 1): kink moves +v, antikink −v. */
  velocity: number;
}

/**
 * Build a **kink–antikink collision** field: a +1 kink and a −1 antikink set to
 * approach each other on the u = 0 vacuum (net topological charge 0). Integrate
 * it with {@link stepSineGordon} to watch the solitons collide — in sine-Gordon
 * they pass through one another (topologically protected), exchanging only a
 * phase shift, with the charge and energy conserved.
 */
export function createKinkAntikinkField(spec: KinkAntikinkSpec): SineGordonGrid {
  const mid = spec.length / 2;
  const kinkParams: SineGordonKinkParams = { velocity: spec.velocity, center: mid - spec.separation, sign: 1 };
  const antiParams: SineGordonKinkParams = { velocity: -spec.velocity, center: mid + spec.separation, sign: -1 };
  return createSineGordonField({
    points: spec.points,
    length: spec.length,
    dt: spec.dt,
    boundary: 'fixed',
    initial: (x) => sineGordonKink(x, 0, kinkParams) + sineGordonKink(x, 0, antiParams) - 2 * Math.PI,
    initialRate: (x) => sineGordonKinkRate(x, 0, kinkParams) + sineGordonKinkRate(x, 0, antiParams)
  });
}

// --- discrete Frenkel–Kontorova chain & Peierls–Nabarro barrier ------------

/**
 * Static Frenkel–Kontorova energy of an angle configuration on a chain:
 *   V(θ) = Σ_n [ ½K(θ_{n+1} − θ_n)² + (1 − cos θ_n) ],
 * the discrete substrate (1 − cos θ) plus harmonic coupling K. The discrete
 * sine-Gordon kink interpolates θ from 0 to 2π over a width ~√K lattice sites.
 */
export function frenkelKontorovaEnergy(angles: ArrayLike<number>, coupling: number): number {
  const n = angles.length;
  if (n < 2) throw new Error('frenkelKontorovaEnergy: need at least two sites.');
  if (!(coupling >= 0)) throw new Error('frenkelKontorovaEnergy: coupling K must be ≥ 0.');
  let energy = 0;
  for (let i = 0; i < n; i += 1) {
    energy += 1 - Math.cos(angles[i] ?? 0);
    if (i < n - 1) {
      const d = (angles[i + 1] ?? 0) - (angles[i] ?? 0);
      energy += 0.5 * coupling * d * d;
    }
  }
  return energy;
}

export interface RelaxedKinkResult {
  /** Relaxed angle configuration (boundary sites held fixed). */
  angles: Float64Array;
  /** Static FK energy of the relaxed configuration. */
  energy: number;
  /** Topological charge [θ_last − θ_first]/2π (≈ 1 for a single kink). */
  charge: number;
  /** Final ‖∇V‖∞ over the interior sites (descent convergence witness). */
  gradNorm: number;
  /** Iterations actually run. */
  iterations: number;
}

export interface RelaxKinkOptions {
  /** Chain length in sites (≥ 5). Default 81. */
  sites?: number;
  /** Initial kink-centre offset in lattice units (0 = on a site). Default 0. */
  centerOffset?: number;
  /** Max Newton iterations. Default 200. */
  maxIterations?: number;
  /** Convergence tolerance on ‖∇V‖∞. Default 1e-11. */
  tolerance?: number;
}

/**
 * Solve the symmetric tridiagonal system (sub = super = `off`, diagonal `diag`)
 * for `rhs` by the Thomas algorithm. Returns null on a (near-)zero pivot. The
 * arrays have one entry per interior unknown; `off[i]` couples unknown i to i−1.
 */
function solveTridiagonal(diag: Float64Array, off: Float64Array, rhs: Float64Array): Float64Array | null {
  const m = diag.length;
  const cPrime = new Float64Array(m);
  const dPrime = new Float64Array(m);
  let beta = diag[0] ?? 0;
  if (Math.abs(beta) < 1e-300) return null;
  cPrime[0] = (m > 1 ? (off[1] ?? 0) : 0) / beta;
  dPrime[0] = (rhs[0] ?? 0) / beta;
  for (let i = 1; i < m; i += 1) {
    const lower = off[i] ?? 0; // couples i to i−1 (symmetric: same as upper of i−1)
    beta = (diag[i] ?? 0) - lower * (cPrime[i - 1] ?? 0);
    if (Math.abs(beta) < 1e-300) return null;
    const upper = i + 1 < m ? (off[i + 1] ?? 0) : 0;
    cPrime[i] = upper / beta;
    dPrime[i] = ((rhs[i] ?? 0) - lower * (dPrime[i - 1] ?? 0)) / beta;
  }
  const x = new Float64Array(m);
  x[m - 1] = dPrime[m - 1] ?? 0;
  for (let i = m - 2; i >= 0; i -= 1) x[i] = (dPrime[i] ?? 0) - (cPrime[i] ?? 0) * (x[i + 1] ?? 0);
  return x;
}

/**
 * Relax a single FK kink to a stationary configuration by **Newton's method**
 * on ∇V = 0 (interior sites only; the two ends are clamped to 0 and 2π so the
 * topological charge stays +1). The interior Hessian is tridiagonal — diagonal
 * 2K + cos θ_i, off-diagonal −K — so each Newton step is one Thomas solve, and
 * the iteration converges quadratically to machine precision. Newton finds the
 * stationary point in the seed's basin and preserves the seed's reflection
 * symmetry, so a site-centred seed yields the site-centred saddle and a
 * bond-centred seed the bond-centred minimum (the two Peierls–Nabarro states).
 * Deterministic: the seed is the continuum kink sampled on the lattice.
 */
export function relaxFrenkelKontorovaKink(coupling: number, options: RelaxKinkOptions = {}): RelaxedKinkResult {
  if (!(coupling > 0)) throw new Error('relaxFrenkelKontorovaKink: coupling K must be > 0.');
  const sites = options.sites ?? 81;
  if (!Number.isInteger(sites) || sites < 5)
    throw new Error('relaxFrenkelKontorovaKink: sites must be an integer ≥ 5.');
  const maxIterations = options.maxIterations ?? 200;
  const tol = options.tolerance ?? 1e-11;
  const center = (sites - 1) / 2 + (options.centerOffset ?? 0);
  const width = Math.max(0.5, Math.sqrt(coupling));

  const theta = new Float64Array(sites);
  for (let i = 0; i < sites; i += 1) theta[i] = 4 * Math.atan(Math.exp((i - center) / width));
  // Clamp the asymptotes exactly so the winding number is pinned at +1.
  theta[0] = 0;
  theta[sites - 1] = 2 * Math.PI;

  const m = sites - 2; // interior unknowns
  const grad = new Float64Array(m);
  const diag = new Float64Array(m);
  const off = new Float64Array(m); // off[k] couples interior k to k−1; off[0] unused
  let gradNorm = Infinity;
  let iter = 0;
  for (; iter < maxIterations; iter += 1) {
    gradNorm = 0;
    for (let k = 0; k < m; k += 1) {
      const i = k + 1;
      const g = -coupling * ((theta[i + 1] ?? 0) - 2 * (theta[i] ?? 0) + (theta[i - 1] ?? 0)) + Math.sin(theta[i] ?? 0);
      grad[k] = -g; // solve H·δ = −∇V
      diag[k] = 2 * coupling + Math.cos(theta[i] ?? 0);
      off[k] = -coupling;
      const ag = Math.abs(g);
      if (ag > gradNorm) gradNorm = ag;
    }
    if (gradNorm < tol) break;
    const delta = solveTridiagonal(diag, off, grad);
    if (!delta) break; // singular Hessian — stop at the best configuration so far
    for (let k = 0; k < m; k += 1) theta[k + 1] = (theta[k + 1] ?? 0) + (delta[k] ?? 0);
  }
  return {
    angles: theta,
    energy: frenkelKontorovaEnergy(theta, coupling),
    charge: topologicalCharge(theta),
    gradNorm,
    iterations: iter
  };
}

export interface PeierlsNabarroResult {
  /** Coupling K used. */
  coupling: number;
  /** Relaxed energy with the kink centred on a lattice site. */
  siteEnergy: number;
  /** Relaxed energy with the kink centred between two sites (½ offset). */
  bondEnergy: number;
  /** Peierls–Nabarro barrier |E_bond − E_site| ≥ 0 — the pinning energy a kink
   * must overcome to glide by one lattice period. Shrinks (∼ exp(−π²√K)) as the
   * coupling grows toward the continuum limit, where translation is free. */
  barrier: number;
}

/**
 * Peierls–Nabarro barrier: relax the FK kink centred on a site and centred on a
 * bond, and return |ΔE|. The continuum sine-Gordon kink translates with zero
 * cost; the lattice breaks that symmetry and pins the kink, exactly the
 * dislocation-glide / depinning barrier of a crystal defect.
 */
export function peierlsNabarroBarrier(coupling: number, options: RelaxKinkOptions = {}): PeierlsNabarroResult {
  const onSite = relaxFrenkelKontorovaKink(coupling, { ...options, centerOffset: 0 });
  const onBond = relaxFrenkelKontorovaKink(coupling, { ...options, centerOffset: 0.5 });
  return {
    coupling,
    siteEnergy: onSite.energy,
    bondEnergy: onBond.energy,
    barrier: Math.abs(onBond.energy - onSite.energy)
  };
}
