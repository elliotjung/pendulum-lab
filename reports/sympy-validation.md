# SymPy Symbolic Cross-Validation

Generated: 2026-06-11T09:13:18.348Z

The engine right-hand sides are compared **component-wise at randomly sampled states**
against equations of motion that SymPy derives independently: each Lagrangian is written
symbolically and the Euler–Lagrange equations come from symbolic differentiation
(`scripts/sympy_reference.py`). Unlike a trajectory comparison there is no integrator
tolerance floor — any disagreement is a derivation bug. All systems conservative (γ = 0).

Mixed tolerance: |Δa| ≤ 1e-8 · max(1, |a|) per component.

| System | Samples | max \|Δa\| | max rel | Verdict |
|---|---|---|---|---|
| planar double pendulum — hand-derived closed form (rhsDouble) vs SymPy Euler–Lagrange | 40 | 4.47e-15 | 4.47e-15 | PASS |
| planar triple pendulum — hand-expanded 3×3 elimination (rhsTriple) vs SymPy Euler–Lagrange | 40 | 1.55e-14 | 1.25e-14 | PASS |
| spherical double pendulum (3D, 4 DOF) — manipulator-form rhsSphericalChain vs SymPy Euler–Lagrange | 40 | 1.78e-14 | 5.55e-15 | PASS |
| spherical triple pendulum (3D, 6 DOF) — manipulator-form rhsSphericalChain vs SymPy Euler–Lagrange | 40 | 1.42e-14 | 9.73e-15 | PASS |

All engine derivations agree with the independent symbolic reference to float64 round-off.
