# Long-Term Energy Benchmark

Generated: 2026-07-12T13:56:32.758Z

Conservative double pendulum, IC = [1.2, -0.6, 0, 0], dt = 0.002, steps = 100000 (T = 200 s).

Relative energy drift |ΔE / E₀|. Lower is better for conservation; note that
TR-BDF2 is L-stable and intentionally dissipative, so its drift reflects
numerical damping rather than instability.

Per-integrator drift curves (|ΔE/E₀| sampled every 500 steps) are stored
in `reports/energy-benchmark.json` under `rows[].curve`.

| Integrator | Order | Max rel. drift | Final rel. drift | Wall ms |
|---|---|---:|---:|---:|
| DOP853 8(5,3) (`dop853`) | 8 | 1.612e-14 | 1.227e-14 | 169 |
| Gragg-Bulirsch-Stoer (`gbs`) | adaptive | 8.974e-13 | 3.710e-13 | 332 |
| Dormand-Prince 5(4) (`dopri5`) | 5 | 3.793e-10 | 3.815e-10 | 99 |
| Gauss-Legendre 4 (2-stage) (`gauss2`) | implicit | 9.344e-10 | 4.619e-10 | 116 |
| RKF45 Adaptive (`rkf45`) | adaptive | 8.293e-9 | 8.351e-9 | 77 |
| Runge-Kutta 4 (`rk4`) | 4 | 5.447e-8 | 5.435e-8 | 51 |
| Implicit Midpoint (`hmidpoint`) | implicit | 4.337e-5 | 1.306e-7 | 61 |
| TR-BDF2 (stiff, L-stable) (`bdf2`) | implicit | 6.551e-5 | 7.584e-7 | 221 |
| Midpoint RK2 (`rk2`) | 2 | 3.348e-4 | 2.645e-4 | 41 |
| Yoshida 4 Composition (`yoshida4`) | 4 | 5.391e-1 | 3.465e-1 | 187 |
| Velocity Verlet Alias (`verlet`) | 2 | 5.448e-1 | 5.448e-1 | 48 |
| Leapfrog Approximation (`leapfrog`) | 2 | 5.448e-1 | 5.448e-1 | 49 |
| Semi-Implicit Euler (`symplectic`) | 1 | 5.778e-1 | 5.732e-1 | 43 |
| Explicit Euler (`euler`) | 1 | 9.922e+0 | 9.759e+0 | 43 |
