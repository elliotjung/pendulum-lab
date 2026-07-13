import type { PendulumParameters } from '../types/domain';
import {
  ddAdd,
  ddSub,
  ddMul,
  ddMulDouble,
  ddNeg,
  ddDiv,
  ddSinCos,
  ddSin,
  ddFromNumber,
  ddToNumber,
  type DD,
  type DdDerivative
} from './doubleDouble';

/**
 * Double-double (~31-digit) reference dynamics for the *conservative* double
 * pendulum — the extended-precision ground truth the float64 integrator is
 * certified against. The mass-matrix solve of `rhsDouble` is re-expressed in
 * double-double arithmetic (using the double-double sin/cos and division), so a
 * reference orbit carries a ~1e-31 round-off floor instead of float64's ~1e-16.
 *
 * The system parameters stay ordinary doubles (they are exact inputs); only the
 * evolving state is carried in double-double. Damping is omitted: the reference
 * is for the Hamiltonian double pendulum. The port is validated component-wise
 * against the trusted float64 `rhsDouble` in the test suite, so any algebra
 * mistake is caught immediately.
 */
export function ddDoublePendulumRhs(parameters: PendulumParameters): DdDerivative {
  const { m1, m2, l1, l2, g } = parameters;
  const m11 = (m1 + m2) * l1 * l1; // M[0][0]
  const m22 = m2 * l2 * l2; // M[1][1]
  const B = m2 * l1 * l2; // coefficient of cos/sin(Δ)
  const m11m22 = m11 * m22;
  const C1 = (m1 + m2) * g * l1;
  const C2 = m2 * g * l2;

  return (yHi, yLo, outHi, outLo) => {
    const t1: DD = [yHi[0] ?? 0, yLo[0] ?? 0];
    const t2: DD = [yHi[1] ?? 0, yLo[1] ?? 0];
    const w1: DD = [yHi[2] ?? 0, yLo[2] ?? 0];
    const w2: DD = [yHi[3] ?? 0, yLo[3] ?? 0];

    // θ̇₁ = ω₁, θ̇₂ = ω₂.
    outHi[0] = yHi[2] ?? 0;
    outLo[0] = yLo[2] ?? 0;
    outHi[1] = yHi[3] ?? 0;
    outLo[1] = yLo[3] ?? 0;

    const delta = ddSub(t1, t2);
    const [sinD, cosD] = ddSinCos(delta);
    const sinT1 = ddSin(t1);
    const sinT2 = ddSin(t2);

    const m12 = ddMulDouble(cosD, B);
    const det = ddSub(ddFromNumber(m11m22), ddMul(m12, m12)); // m11·m22 − m12²
    const w1sq = ddMul(w1, w1);
    const w2sq = ddMul(w2, w2);

    // f1 = −B·sinΔ·ω₂² − C1·sinθ₁,  f2 = B·sinΔ·ω₁² − C2·sinθ₂.
    const f1 = ddSub(ddNeg(ddMulDouble(ddMul(sinD, w2sq), B)), ddMulDouble(sinT1, C1));
    const f2 = ddSub(ddMulDouble(ddMul(sinD, w1sq), B), ddMulDouble(sinT2, C2));

    // Cramer's rule: out2 = (m22·f1 − m12·f2)/det, out3 = (m11·f2 − m12·f1)/det.
    const n2 = ddSub(ddMulDouble(f1, m22), ddMul(m12, f2));
    const n3 = ddSub(ddMulDouble(f2, m11), ddMul(m12, f1));
    const o2 = ddDiv(n2, det);
    const o3 = ddDiv(n3, det);
    outHi[2] = o2[0];
    outLo[2] = o2[1];
    outHi[3] = o3[0];
    outLo[3] = o3[1];
  };
}

/** Total mechanical energy of the conservative double pendulum, in double-double. */
export function ddDoublePendulumEnergy(parameters: PendulumParameters): (yHi: Float64Array, yLo: Float64Array) => DD {
  const { m1, m2, l1, l2, g } = parameters;
  return (yHi, yLo) => {
    const t1: DD = [yHi[0] ?? 0, yLo[0] ?? 0];
    const t2: DD = [yHi[1] ?? 0, yLo[1] ?? 0];
    const w1: DD = [yHi[2] ?? 0, yLo[2] ?? 0];
    const w2: DD = [yHi[3] ?? 0, yLo[3] ?? 0];
    const [, cosT1] = ddSinCos(t1);
    const [, cosT2] = ddSinCos(t2);
    const [, cosDelta] = ddSinCos(ddSub(t1, t2));

    const w1sq = ddMul(w1, w1);
    const w2sq = ddMul(w2, w2);
    // v1² = l1²ω1²; v2² = l1²ω1² + l2²ω2² + 2 l1 l2 ω1 ω2 cosΔ.
    const v1sq = ddMulDouble(w1sq, l1 * l1);
    const cross = ddMulDouble(ddMul(ddMul(w1, w2), cosDelta), 2 * l1 * l2);
    const v2sq = ddAdd(ddAdd(ddMulDouble(w1sq, l1 * l1), ddMulDouble(w2sq, l2 * l2)), cross);
    const ke = ddAdd(ddMulDouble(v1sq, 0.5 * m1), ddMulDouble(v2sq, 0.5 * m2));
    // y1 = −l1 cosθ1; y2 = y1 − l2 cosθ2.
    const y1 = ddMulDouble(cosT1, -l1);
    const y2 = ddSub(y1, ddMulDouble(cosT2, l2));
    const pe = ddMulDouble(ddAdd(ddMulDouble(y1, m1), ddMulDouble(y2, m2)), g);
    return ddAdd(ke, pe);
  };
}

/** Convenience: relative energy drift |E(t)−E(0)|/|E(0)| of a double-double state vs a reference, as a plain number. */
export function ddRelativeEnergyDrift(energy0: DD, energyT: DD): number {
  const e0 = ddToNumber(energy0);
  const drift = ddToNumber(ddSub(energyT, energy0));
  return Math.abs(e0) > 0 ? Math.abs(drift) / Math.abs(e0) : Math.abs(drift);
}
