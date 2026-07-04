#!/usr/bin/env python3
"""Independent, dependency-free check of the flagship gap-map artifacts.

The script uses only Python's standard library. It verifies three layers:

1. Recompute the closed-form Melnikov threshold A_c.
2. Recompute the A_PD/A_c crossing from the exported study table.
3. Independently remeasure selected A_PD values by integrating the driven
   pendulum stroboscopic map, solving the period-1 orbit with finite-difference
   Newton, and bisection-searching the Floquet multiplier crossing rho = -1.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


STUDY = Path("reports/paper-study.json")
OUT_JSON = Path("reports/flagship-external-check.json")
OUT_MD = Path("reports/flagship-external-check.md")


def melnikov_ac(gamma: float, omega: float) -> float:
    return (4.0 * gamma / math.pi) * math.cosh((math.pi * omega) / 2.0)


def crossing(rows: list[dict[str, float]]) -> dict[str, float] | None:
    for a, b in zip(rows, rows[1:]):
        ra = a["ratio"] - 1.0
        rb = b["ratio"] - 1.0
        if ra == 0:
            return {"gamma": a["gamma"], "betweenLow": a["gamma"], "betweenHigh": a["gamma"]}
        if ra * rb <= 0 and a["ratio"] != b["ratio"]:
            t = (1.0 - a["ratio"]) / (b["ratio"] - a["ratio"])
            return {
                "gamma": a["gamma"] + t * (b["gamma"] - a["gamma"]),
                "betweenLow": a["gamma"],
                "betweenHigh": b["gamma"],
            }
    return None


def rhs(state: tuple[float, float, float], gamma: float, amplitude: float, omega_drive: float) -> tuple[float, float, float]:
    theta, velocity, phase = state
    return (
        velocity,
        -math.sin(theta) - gamma * velocity + amplitude * math.cos(phase),
        omega_drive,
    )


def rk4_step(state: tuple[float, float, float], dt: float, gamma: float, amplitude: float, omega_drive: float) -> tuple[float, float, float]:
    k1 = rhs(state, gamma, amplitude, omega_drive)
    k2 = rhs(tuple(state[i] + 0.5 * dt * k1[i] for i in range(3)), gamma, amplitude, omega_drive)
    k3 = rhs(tuple(state[i] + 0.5 * dt * k2[i] for i in range(3)), gamma, amplitude, omega_drive)
    k4 = rhs(tuple(state[i] + dt * k3[i] for i in range(3)), gamma, amplitude, omega_drive)
    return tuple(state[i] + (dt / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]) for i in range(3))


def strobe_map(point: tuple[float, float], gamma: float, amplitude: float, omega_drive: float, dt0: float) -> tuple[float, float]:
    period = 2.0 * math.pi / omega_drive
    steps = max(1, round(period / dt0))
    dt = period / steps
    state = (point[0], point[1], 0.0)
    for _ in range(steps):
        state = rk4_step(state, dt, gamma, amplitude, omega_drive)
    return (state[0], state[1])


def strobe_attractor(gamma: float, amplitude: float, omega_drive: float, dt0: float, transient_periods: int = 220) -> tuple[float, float]:
    point = (0.1, 0.0)
    for _ in range(transient_periods):
        point = strobe_map(point, gamma, amplitude, omega_drive, dt0)
        point = (math.atan2(math.sin(point[0]), math.cos(point[0])), point[1])
    return point


def map_jacobian_fd(point: tuple[float, float], gamma: float, amplitude: float, omega_drive: float, dt0: float) -> tuple[float, float, float, float]:
    eps = 1.0e-6
    base = strobe_map(point, gamma, amplitude, omega_drive, dt0)
    col0 = strobe_map((point[0] + eps, point[1]), gamma, amplitude, omega_drive, dt0)
    col1 = strobe_map((point[0], point[1] + eps), gamma, amplitude, omega_drive, dt0)
    return (
        (col0[0] - base[0]) / eps,
        (col1[0] - base[0]) / eps,
        (col0[1] - base[1]) / eps,
        (col1[1] - base[1]) / eps,
    )


def eigenvalues_2x2(matrix: tuple[float, float, float, float]) -> list[complex]:
    a, b, c, d = matrix
    trace = a + d
    det = a * d - b * c
    disc = trace * trace - 4.0 * det
    if disc >= 0:
        root = math.sqrt(disc)
        return [complex((trace + root) / 2.0, 0.0), complex((trace - root) / 2.0, 0.0)]
    root = math.sqrt(-disc) / 2.0
    return [complex(trace / 2.0, root), complex(trace / 2.0, -root)]


def periodic_orbit(
    gamma: float,
    amplitude: float,
    omega_drive: float,
    guess: tuple[float, float],
    dt0: float,
    max_iterations: int = 16,
) -> tuple[tuple[float, float], bool, float, tuple[float, float, float, float]]:
    theta, velocity = guess
    residual = float("inf")
    jac = (1.0, 0.0, 0.0, 1.0)
    for _ in range(max_iterations):
        mapped = strobe_map((theta, velocity), gamma, amplitude, omega_drive, dt0)
        f0 = mapped[0] - theta
        f1 = mapped[1] - velocity
        residual = math.hypot(f0, f1)
        if residual < 5.0e-8:
            break
        jac = map_jacobian_fd((theta, velocity), gamma, amplitude, omega_drive, dt0)
        a = jac[0] - 1.0
        b = jac[1]
        c = jac[2]
        d = jac[3] - 1.0
        det = a * d - b * c
        if abs(det) < 1.0e-12:
            return (theta, velocity), False, residual, jac
        dtheta = (-f0 * d + b * f1) / det
        dvelocity = (-a * f1 + c * f0) / det
        theta += max(-0.5, min(0.5, dtheta))
        velocity += max(-0.5, min(0.5, dvelocity))
    jac = map_jacobian_fd((theta, velocity), gamma, amplitude, omega_drive, dt0)
    return (theta, velocity), residual < 1.0e-5, residual, jac


def min_real_multiplier(jacobian: tuple[float, float, float, float]) -> float:
    values = eigenvalues_2x2(jacobian)
    real_values = [value.real for value in values if abs(value.imag) < 5.0e-4]
    return min(real_values) if real_values else float("nan")


def external_apd(row: dict[str, float], omega_drive: float, dt0: float = 0.02) -> dict[str, float | bool | str]:
    gamma = float(row["gamma"])
    reported = float(row["Apd"])
    ac = float(row["Ac"])
    width = max(0.003 * ac, 0.0015)
    lo = reported - width
    hi = reported + width
    guess = strobe_attractor(gamma, lo, omega_drive, dt0)
    trace: list[dict[str, float | bool | str | None]] = []

    def rho_at(amplitude: float, seed: tuple[float, float]) -> tuple[float, tuple[float, float], bool, float]:
        orbit, converged, residual, jac = periodic_orbit(gamma, amplitude, omega_drive, seed, dt0)
        return min_real_multiplier(jac), orbit, converged, residual

    rho_lo, guess, ok_lo, res_lo = rho_at(lo, guess)
    rho_hi, guess_hi, ok_hi, res_hi = rho_at(hi, guess)
    trace.append({
        "stage": "initial-bracket",
        "lo": lo,
        "hi": hi,
        "mid": None,
        "rhoLow": rho_lo,
        "rhoHigh": rho_hi,
        "rhoMid": None,
        "okLow": ok_lo,
        "okHigh": ok_hi,
        "residualLow": res_lo,
        "residualHigh": res_hi,
    })
    for expand in range(6):
        if ok_lo and ok_hi and math.isfinite(rho_lo) and math.isfinite(rho_hi) and rho_lo > -1.0 and rho_hi < -1.0:
            break
        width *= 1.7
        lo = reported - width
        hi = reported + width
        guess = strobe_attractor(gamma, lo, omega_drive, dt0)
        rho_lo, guess, ok_lo, res_lo = rho_at(lo, guess)
        rho_hi, guess_hi, ok_hi, res_hi = rho_at(hi, guess)
        trace.append({
            "stage": f"expand-{expand + 1}",
            "lo": lo,
            "hi": hi,
            "mid": None,
            "rhoLow": rho_lo,
            "rhoHigh": rho_hi,
            "rhoMid": None,
            "okLow": ok_lo,
            "okHigh": ok_hi,
            "residualLow": res_lo,
            "residualHigh": res_hi,
        })

    if not (ok_lo and ok_hi and math.isfinite(rho_lo) and math.isfinite(rho_hi) and rho_lo > -1.0 and rho_hi < -1.0):
        return {
            "gamma": gamma,
            "reportedApd": reported,
            "remeasuredApd": None,
            "absError": None,
            "passed": False,
            "rhoLow": rho_lo,
            "rhoHigh": rho_hi,
            "residualLow": res_lo,
            "residualHigh": res_hi,
            "searchTrace": trace,
            "caveat": "Could not bracket rho=-1 with the dependency-free finite-difference Newton probe.",
        }

    seed = guess
    left, right = lo, hi
    rleft, rright = rho_lo, rho_hi
    for _ in range(18):
        mid = 0.5 * (left + right)
        rmid, orbit, ok_mid, _res_mid = rho_at(mid, seed)
        trace.append({
            "stage": "bisect",
            "lo": left,
            "hi": right,
            "mid": mid,
            "rhoLow": rleft,
            "rhoHigh": rright,
            "rhoMid": rmid,
            "okLow": True,
            "okHigh": True,
            "okMid": ok_mid,
            "residualLow": res_lo,
            "residualHigh": res_hi,
        })
        if not ok_mid or not math.isfinite(rmid):
            break
        seed = orbit
        if rmid > -1.0:
            left, rleft = mid, rmid
        else:
            right, rright = mid, rmid
    measured = left + ((-1.0 - rleft) * (right - left)) / (rright - rleft)
    error = abs(measured - reported)
    return {
        "gamma": gamma,
        "reportedApd": reported,
        "remeasuredApd": measured,
        "absError": error,
        "passed": error <= max(0.004, 0.004 * reported),
        "rhoLow": rleft,
        "rhoHigh": rright,
        "residualLow": res_lo,
        "residualHigh": res_hi,
        "searchTrace": trace,
        "caveat": "Stdlib RK4 + finite-difference monodromy; tolerance is intentionally looser than the TypeScript variational refinement.",
    }


def selected_rows(rows: Iterable[dict[str, float]]) -> list[dict[str, float]]:
    wanted = {0.5, 0.65, 0.7}
    out = [row for row in rows if round(float(row["gamma"]), 2) in wanted and row.get("Apd") is not None]
    return sorted(out, key=lambda item: float(item["gamma"]))


def fmt_optional(value: object, digits: int = 8) -> str:
    return f"{float(value):.{digits}g}" if isinstance(value, (int, float)) and math.isfinite(float(value)) else "n/a"


def main() -> None:
    data = json.loads(STUDY.read_text(encoding="utf-8"))
    omega = float(data["driveFrequency"])
    rows = []
    max_ac_error = 0.0
    for row in data["measurements"]:
        if row.get("Apd") is None or row.get("ratio") is None:
            continue
        gamma = float(row["gamma"])
        ac_external = melnikov_ac(gamma, omega)
        ac_reported = float(row["Ac"])
        max_ac_error = max(max_ac_error, abs(ac_external - ac_reported))
        rows.append(
            {
                "gamma": gamma,
                "AcExternal": ac_external,
                "AcReported": ac_reported,
                "ApdReported": float(row["Apd"]),
                "ratio": float(row["Apd"]) / ac_external,
            }
        )
    cross = crossing(rows)
    apd_checks = [external_apd(row, omega) for row in selected_rows(data["measurements"])]
    result = {
        "schemaVersion": "pendulum-flagship-external-check/v2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceStudy": str(STUDY),
        "method": "Python stdlib recomputation of A_c, crossing arithmetic, and selected A_PD values via RK4 strobe-map Newton/Floquet search.",
        "maxAcAbsError": max_ac_error,
        "crossing": cross,
        "apdChecks": apd_checks,
        "apdChecksPassed": all(bool(item["passed"]) for item in apd_checks),
        "rows": rows,
        "caveat": "A_PD checks use finite-difference monodromy and a coarser dt than the TypeScript flagship run, so they certify independent reproducibility at reviewer-kit tolerance, not bitwise equality.",
    }
    OUT_JSON.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    md = [
        "# Flagship External Check",
        "",
        f"Generated: {result['generatedAt']}",
        "",
        f"Max |A_c external - A_c reported|: `{max_ac_error:.3e}`",
        "",
        f"Crossing gamma: `{cross['gamma']:.6f}` between `{cross['betweenLow']:.2f}` and `{cross['betweenHigh']:.2f}`" if cross else "Crossing gamma: not found",
        "",
        "## Independent A_PD Checks",
        "",
        "| gamma | reported A_PD | remeasured A_PD | abs error | pass |",
        "|---:|---:|---:|---:|---:|",
    ]
    for item in apd_checks:
        remeasured = item["remeasuredApd"]
        abs_error = item["absError"]
        md.append(
            f"| {float(item['gamma']):.2f} | {float(item['reportedApd']):.6f} | "
            f"{float(remeasured):.6f} | {float(abs_error):.3e} | {str(bool(item['passed'])).lower()} |"
            if isinstance(remeasured, (int, float)) and isinstance(abs_error, (int, float))
            else f"| {float(item['gamma']):.2f} | {float(item['reportedApd']):.6f} | n/a | n/a | false |"
        )
    md.extend([
        "",
        "## A_PD Search Trace",
        "",
        "| gamma | stage | lo | hi | mid | rho(lo) | rho(mid) | rho(hi) |",
        "|---:|---|---:|---:|---:|---:|---:|---:|",
    ])
    for item in apd_checks:
        gamma = float(item["gamma"])
        for trace in item.get("searchTrace", []):
            md.append(
                f"| {gamma:.2f} | {trace.get('stage', 'n/a')} | "
                f"{fmt_optional(trace.get('lo'))} | {fmt_optional(trace.get('hi'))} | {fmt_optional(trace.get('mid'))} | "
                f"{fmt_optional(trace.get('rhoLow'))} | {fmt_optional(trace.get('rhoMid'))} | {fmt_optional(trace.get('rhoHigh'))} |"
            )
    md.extend(["", f"Caveat: {result['caveat']}", ""])
    OUT_MD.write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
