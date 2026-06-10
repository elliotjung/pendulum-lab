"""Independent pendulum references (double + triple) for cross-validation.

The equations of motion are re-derived here rather than ported from the
TypeScript engine, and the integration uses SciPy's DOP853 with tight
tolerances - a genuinely independent code path (different language, different
derivation, different integrator family). Reads a JSON job from stdin, writes
JSON samples to stdout.

Double job: { "system": "double" (default), "m1": .., "m2": .., "l1": .., "l2": ..,
              "g": .., "state0": [th1, th2, w1, w2], "tEnd": .., "sampleEvery": .. }
Triple job: { "system": "triple", "m1": .., "m2": .., "m3": .., "l1": .., "l2": ..,
              "l3": .., "g": .., "state0": [th1..th3, w1..w3], "tEnd": .., "sampleEvery": .. }

The double pendulum uses the closed-form Lagrangian equations; the triple uses
the general N-pendulum chain formulation (mass matrix M_ij = c_ij l_i l_j
cos(th_i - th_j) with c_ij = sum of masses at or below max(i, j)) solved with
numpy.linalg.solve - a different derivation route and a different linear-solve
path than the TypeScript engine's hand-expanded 3x3 Gaussian elimination.
"""
import json
import sys

import numpy as np
from scipy.integrate import solve_ivp


def make_double(job):
    m1, m2 = job["m1"], job["m2"]
    l1, l2 = job["l1"], job["l2"]
    g = job["g"]

    def rhs(_t, y):
        th1, th2, w1, w2 = y
        d = th1 - th2
        cd, sd = np.cos(d), np.sin(d)
        den = m1 + m2 * sd * sd
        # Lagrangian equations of motion (point masses, massless rods, no damping).
        a1 = (
            -m2 * l1 * w1 * w1 * sd * cd
            - m2 * l2 * w2 * w2 * sd
            - (m1 + m2) * g * np.sin(th1)
            + m2 * g * np.sin(th2) * cd
        ) / (l1 * den)
        a2 = (
            (m1 + m2) * l1 * w1 * w1 * sd
            + (m1 + m2) * g * np.sin(th1) * cd
            - (m1 + m2) * g * np.sin(th2)
            + m2 * l2 * w2 * w2 * sd * cd
        ) / (l2 * den)
        return [w1, w2, a1, a2]

    def energy(y):
        th1, th2, w1, w2 = y
        v1 = l1 * w1
        kinetic = 0.5 * m1 * v1 * v1 + 0.5 * m2 * (
            v1 * v1 + (l2 * w2) ** 2 + 2 * l1 * l2 * w1 * w2 * np.cos(th1 - th2)
        )
        potential = -(m1 + m2) * g * l1 * np.cos(th1) - m2 * g * l2 * np.cos(th2)
        return kinetic + potential

    return rhs, energy


def make_triple(job):
    masses = np.array([job["m1"], job["m2"], job["m3"]], dtype=float)
    lengths = np.array([job["l1"], job["l2"], job["l3"]], dtype=float)
    g = job["g"]
    n = 3
    # c[i][j] = total mass hanging at or below link max(i, j).
    tail = np.array([masses[i:].sum() for i in range(n)])
    coeff = np.empty((n, n))
    for i in range(n):
        for j in range(n):
            coeff[i, j] = tail[max(i, j)]

    def rhs(_t, y):
        th = y[:n]
        w = y[n:]
        dth = th[:, None] - th[None, :]
        ll = lengths[:, None] * lengths[None, :]
        mass_matrix = coeff * ll * np.cos(dth)
        # Coriolis/centrifugal + gravity torques of the chain Lagrangian.
        force = -(coeff * ll * np.sin(dth)) @ (w * w) - g * tail * lengths * np.sin(th)
        acc = np.linalg.solve(mass_matrix, force)
        return np.concatenate([w, acc])

    def energy(y):
        th = y[:n]
        w = y[n:]
        vx = np.cumsum(lengths * np.cos(th) * w)
        vy = np.cumsum(lengths * np.sin(th) * w)
        py = np.cumsum(-lengths * np.cos(th))
        kinetic = 0.5 * np.sum(masses * (vx * vx + vy * vy))
        potential = g * np.sum(masses * py)
        return kinetic + potential

    return rhs, energy


def main() -> None:
    job = json.load(sys.stdin)
    system = job.get("system", "double")
    if system == "triple":
        rhs, energy = make_triple(job)
    else:
        rhs, energy = make_double(job)

    t_end = job["tEnd"]
    times = np.arange(0.0, t_end + 1e-12, job["sampleEvery"])
    sol = solve_ivp(
        rhs,
        (0.0, t_end),
        job["state0"],
        method="DOP853",
        t_eval=times,
        rtol=1e-13,
        atol=1e-13,
        max_step=0.01,
    )
    if not sol.success:
        raise SystemExit(f"solve_ivp failed: {sol.message}")

    e0 = energy(np.asarray(job["state0"], dtype=float))
    samples = [
        {"t": float(t), "state": [float(v) for v in sol.y[:, k]]}
        for k, t in enumerate(sol.t)
    ]
    json.dump(
        {
            "method": "scipy.solve_ivp DOP853 rtol=atol=1e-13",
            "scipyEnergyDrift": float(abs(energy(sol.y[:, -1]) - e0)),
            "samples": samples,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
