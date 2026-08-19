# Integrator Reference Validation

Generated: 2026-08-19T09:49:43.793Z

Numerical reference method: `gbs`. Order is measured on the harmonic oscillator (closed form); energy drift on the conservative double pendulum; agreement as max state divergence from the reference.

**16 / 16 integrators within their expected envelopes.**

| Integrator | Measured order | Expected | Order | Energy drift | Energy | Agreement | Agree |
|---|---|---:|:--:|---:|:--:|---:|:--:|
| Explicit Euler (`euler`) | 1.03 | 1 | ✓ | 1.117e+0 | ✓ | 2.625e-1 | ✓ |
| Midpoint RK2 (`rk2`) | 2.00 | 2 | ✓ | 1.214e-4 | ✓ | 1.893e-3 | ✓ |
| Runge-Kutta 4 (`rk4`) | 4.00 | 4 | ✓ | 1.089e-8 | ✓ | 7.333e-8 | ✓ |
| Velocity Verlet Alias (`verlet`) | 2.00 | 2 | ✓ | 2.332e-1 | ✓ | 4.422e-3 | ✓ |
| Leapfrog Approximation (`leapfrog`) | 2.00 | 2 | ✓ | 2.332e-1 | ✓ | 4.422e-3 | ✓ |
| Semi-Implicit Euler (`symplectic`) | 1.01 | 1 | ✓ | 3.774e-1 | ✓ | 8.366e-3 | ✓ |
| Yoshida 4 Composition (`yoshida4`) | 4.00 | 4 | ✓ | 5.370e-1 | ✓ | 2.680e-2 | ✓ |
| Yoshida 6 Composition (`yoshida6`) | 6.01 | 6 | ✓ | 5.566e-1 | ✓ | 1.152e-1 | ✓ |
| Yoshida 8 Composition (`yoshida8`) | 7.99 | 8 | ✓ | 3.268e+0 | ✓ | 3.809e-1 | ✓ |
| Implicit Midpoint (`hmidpoint`) | 2.00 | 2 | ✓ | 4.109e-5 | ✓ | 9.210e-4 | ✓ |
| Gauss-Legendre 4 (2-stage) (`gauss2`) | 4.00 | 4 | ✓ | 8.234e-10 | ✓ | 1.149e-8 | ✓ |
| RKF45 embedded (monitored fixed-step) (`rkf45`) | 5.00 | 5 | ✓ | 1.672e-9 | ✓ | 3.292e-10 | ✓ |
| Dormand-Prince 5(4) (`dopri5`) | 5.00 | 5 | ✓ | 7.640e-11 | ✓ | 8.725e-11 | ✓ |
| DOP853 8(5,3) (`dop853`) | round-off | 8 | ✓ | 7.476e-15 | ✓ | 9.459e-14 | ✓ |
| GBS extrapolation (fixed macro-step) (`gbs`) | round-off | 6 | ✓ | 2.303e-13 | ✓ | 0.000e+0 | ✓ |
| TR-BDF2 (stiff, L-stable) (`bdf2`) | 2.00 | 2 | ✓ | 5.974e-5 | ✓ | 4.786e-4 | ✓ |
