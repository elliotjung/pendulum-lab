"""
Independent SciPy/NumPy reference for the Neimark-Sacker rotation number of the
delayed-logistic map  x_{n+1} = a*x_n*(1 - x_{n-1}),  written as the planar map

    (x, y) -> (a*x*(1 - y), x).

This is the textbook NS example: the fixed point ((a-1)/a, (a-1)/a) has a complex
conjugate multiplier pair that crosses the unit circle at a = 2 with arg = pi/3,
so an invariant closed curve is born with rotation number rho -> 1/6.

Two *independent* estimates of rho(a), neither using the TypeScript engine's
trigonometric-collocation solver:

  1. rhoLinear   - arg(lambda)/2pi of the analytic Jacobian eigenvalues at the
                   fixed point (numpy.linalg.eigvals), the onset prediction.
  2. rhoWinding  - the actual nonlinear rotation number, by iterating the raw map
                   and accumulating the signed winding angle of (state - centre)
                   about the fixed point (valid on the invariant circle itself).

Emits JSON: { "samples": [ {a, rhoLinear, rhoWinding, modulus}, ... ] }.
Run standalone or via scripts/ns-cross-validate.ts.
"""
import json
import sys

import numpy as np


def jacobian(a, x, y):
    # F = (a*x*(1-y), x);  dF = [[a(1-y), -a x], [1, 0]]
    return np.array([[a * (1.0 - y), -a * x], [1.0, 0.0]])


def rho_linear(a):
    x = (a - 1.0) / a
    eig = np.linalg.eigvals(jacobian(a, x, x))
    # Pick the eigenvalue with positive imaginary part (the conjugate pair).
    complex_eigs = [e for e in eig if abs(e.imag) > 1e-12]
    if not complex_eigs:
        return None, float(np.max(np.abs(eig)))
    lam = max(complex_eigs, key=lambda e: e.imag)
    arg = np.arctan2(lam.imag, lam.real)
    return float(abs(arg) / (2.0 * np.pi)), float(abs(lam))


def rho_winding(a, iterations=400000, transient=20000):
    cx = cy = (a - 1.0) / a
    # Seed a little off the fixed point so the orbit spirals onto the circle.
    x, y = cx + 0.1, cy
    for _ in range(transient):
        x, y = a * x * (1.0 - y), x
    px, py = x - cx, y - cy
    winding = 0.0
    for _ in range(iterations):
        x, y = a * x * (1.0 - y), x
        qx, qy = x - cx, y - cy
        cross = px * qy - py * qx
        dot = px * qx + py * qy
        winding += np.arctan2(cross, dot)
        px, py = qx, qy
    rho = winding / (2.0 * np.pi * iterations)
    wrapped = (rho % 1.0 + 1.0) % 1.0
    return float(min(wrapped, 1.0 - wrapped))


def main():
    a_values = [2.05, 2.04, 2.03, 2.02, 2.01]
    if len(sys.argv) > 1:
        a_values = [float(v) for v in sys.argv[1].split(",")]
    samples = []
    for a in a_values:
        lin, modulus = rho_linear(a)
        samples.append({
            "a": a,
            "rhoLinear": lin,
            "rhoWinding": rho_winding(a),
            "modulus": modulus,
        })
    print(json.dumps({
        "system": "delayed-logistic",
        "reference": "numpy.linalg.eigvals + raw-map orbit winding",
        "samples": samples,
    }))


if __name__ == "__main__":
    main()
