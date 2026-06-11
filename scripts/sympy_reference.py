"""Symbolic second reference: SymPy-derived equations of motion.

This is a *derivation-level* cross-check, independent of any integrator: the
Lagrangian L = T - V of each system is written down symbolically, the
Euler-Lagrange equations are produced by symbolic differentiation alone
(mass matrix M_ij = d2L/dqdot_i dqdot_j, generalized forces from
C_i = sum_j d2L/dqdot_i dq_j * qdot_j - dL/dq_i), and the accelerations are
obtained by solving M a = -C numerically per state. No equation from the
TypeScript engine is re-used: only the coordinate conventions are shared.

Reads a JSON job on stdin:
  { "system": "double" | "triple" | "sphericalDouble" | "sphericalTriple",
    "params": { ... }, "states": [[...engine state layout...], ...] }
Writes JSON to stdout:
  { "system": ..., "accelerations": [[...], ...] }

State layouts (matching the engine):
  planar N-chain:    [th_1..th_N, w_1..w_N]          -> accelerations [a_1..a_N]
  spherical N-chain: [th_1, ph_1, .., thd_1, phd_1, ..] -> [thdd_1, phdd_1, ..]

All systems are validated conservative (gamma = 0); damping conventions are
engine-specific and excluded from the symbolic comparison by design.
"""
import json
import sys

import sympy as sp


def lagrangian_accelerations(coords, vels, T, V, states_q_qd):
    """Generic Euler-Lagrange solver.

    coords, vels: lists of sympy symbols q_i, qdot_i.
    T, V: sympy expressions in coords and vels.
    states_q_qd: list of (q values, qdot values) tuples.
    Returns: list of acceleration vectors (lists of floats).
    """
    L = T - V
    n = len(coords)
    M = sp.Matrix(n, n, lambda i, j: sp.diff(L, vels[i], vels[j]))
    # C_i = sum_j d2L/(dqdot_i dq_j) qdot_j - dL/dq_i  (no explicit time dependence)
    C = sp.Matrix(
        n,
        1,
        lambda i, _: sum(sp.diff(L, vels[i], coords[j]) * vels[j] for j in range(n))
        - sp.diff(L, coords[i]),
    )
    args = list(coords) + list(vels)
    m_fn = sp.lambdify(args, M, modules="numpy")
    c_fn = sp.lambdify(args, C, modules="numpy")

    import numpy as np

    out = []
    for q, qd in states_q_qd:
        vals = list(q) + list(qd)
        m_num = np.array(m_fn(*vals), dtype=float)
        c_num = np.array(c_fn(*vals), dtype=float).reshape(n)
        acc = np.linalg.solve(m_num, -c_num)
        out.append([float(a) for a in acc])
    return out


def planar_chain(job, n):
    masses = [sp.Float(job["params"][f"m{i+1}"]) for i in range(n)]
    lengths = [sp.Float(job["params"][f"l{i+1}"]) for i in range(n)]
    g = sp.Float(job["params"]["g"])
    th = [sp.Symbol(f"th{i}") for i in range(n)]
    w = [sp.Symbol(f"w{i}") for i in range(n)]

    # Cartesian positions/velocities built cumulatively along the chain
    # (x right, y up, angles from the downward vertical).
    x = sp.Integer(0)
    y = sp.Integer(0)
    vx = sp.Integer(0)
    vy = sp.Integer(0)
    T = sp.Integer(0)
    V = sp.Integer(0)
    for i in range(n):
        x = x + lengths[i] * sp.sin(th[i])
        y = y - lengths[i] * sp.cos(th[i])
        vx = vx + lengths[i] * sp.cos(th[i]) * w[i]
        vy = vy + lengths[i] * sp.sin(th[i]) * w[i]
        T = T + sp.Rational(1, 2) * masses[i] * (vx**2 + vy**2)
        V = V + masses[i] * g * y

    states = [(s[:n], s[n:]) for s in job["states"]]
    return lagrangian_accelerations(th, w, T, V, states)


def spherical_chain(job, n):
    masses = [sp.Float(job["params"][f"m{i+1}"]) for i in range(n)]
    lengths = [sp.Float(job["params"][f"l{i+1}"]) for i in range(n)]
    g = sp.Float(job["params"]["g"])
    th = [sp.Symbol(f"th{i}") for i in range(n)]
    ph = [sp.Symbol(f"ph{i}") for i in range(n)]
    thd = [sp.Symbol(f"thd{i}") for i in range(n)]
    phd = [sp.Symbol(f"phd{i}") for i in range(n)]

    # r_i = sum_{k<=i} l_k * (sin th cos ph, -cos th, sin th sin ph), y up.
    x = sp.Integer(0)
    y = sp.Integer(0)
    z = sp.Integer(0)
    vx = sp.Integer(0)
    vy = sp.Integer(0)
    vz = sp.Integer(0)
    T = sp.Integer(0)
    V = sp.Integer(0)
    for i in range(n):
        li = lengths[i]
        s, c = sp.sin(th[i]), sp.cos(th[i])
        sp_, cp = sp.sin(ph[i]), sp.cos(ph[i])
        x = x + li * s * cp
        y = y - li * c
        z = z + li * s * sp_
        # Velocities by the chain rule (kept explicit so T is built the same
        # cumulative way as the positions).
        vx = vx + li * (thd[i] * c * cp - phd[i] * s * sp_)
        vy = vy + li * thd[i] * s
        vz = vz + li * (thd[i] * c * sp_ + phd[i] * s * cp)
        T = T + sp.Rational(1, 2) * masses[i] * (vx**2 + vy**2 + vz**2)
        V = V + masses[i] * g * y

    coords = []
    vels = []
    for i in range(n):
        coords.extend([th[i], ph[i]])
        vels.extend([thd[i], phd[i]])

    # Engine layout: [th1, ph1, .., thd1, phd1, ..]
    dof = 2 * n
    states = [(s[:dof], s[dof:]) for s in job["states"]]
    return lagrangian_accelerations(coords, vels, T, V, states)


def main():
    job = json.load(sys.stdin)
    system = job.get("system", "double")
    if system == "double":
        acc = planar_chain(job, 2)
    elif system == "triple":
        acc = planar_chain(job, 3)
    elif system == "sphericalDouble":
        acc = spherical_chain(job, 2)
    elif system == "sphericalTriple":
        acc = spherical_chain(job, 3)
    else:
        raise SystemExit(f"unknown system: {system}")
    json.dump({"system": system, "accelerations": acc, "sympy": sp.__version__}, sys.stdout)


if __name__ == "__main__":
    main()
