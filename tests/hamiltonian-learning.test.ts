import { describe, expect, it } from 'vitest';
import {
  estimatePhaseSpaceDerivatives,
  evaluateHamiltonian,
  hamiltonianCoefficient,
  hamiltonianVectorField,
  learnHamiltonian,
  type HamiltonianModel
} from '../src/research/hamiltonianLearning';

/** Sample a 1-DOF canonical field on a uniform (q, p) grid. */
function sampleField1d(
  field: (q: number, p: number) => { qDot: number; pDot: number },
  qs: number[],
  ps: number[]
): { q: number[][]; p: number[][]; qDot: number[][]; pDot: number[][] } {
  const q: number[][] = [];
  const p: number[][] = [];
  const qDot: number[][] = [];
  const pDot: number[][] = [];
  for (const qv of qs) {
    for (const pv of ps) {
      const f = field(qv, pv);
      q.push([qv]);
      p.push([pv]);
      qDot.push([f.qDot]);
      pDot.push([f.pDot]);
    }
  }
  return { q, p, qDot, pDot };
}

const grid = (lo: number, hi: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => lo + ((hi - lo) * i) / (count - 1));

describe('Hamiltonian learning — exact recovery from canonical fields', () => {
  it('recovers the harmonic oscillator H = ½p² + ½ω²q²', () => {
    const omega = 1.7;
    const data = sampleField1d(
      (q, p) => ({ qDot: p, pDot: -omega * omega * q }),
      grid(-1.5, 1.5, 9),
      grid(-1.5, 1.5, 9)
    );
    const model = learnHamiltonian(data.q, data.p, data.qDot, data.pDot, { degreesOfFreedom: 1, polynomialDegree: 2 });
    expect(hamiltonianCoefficient(model, 'p0^2')).toBeCloseTo(0.5, 6);
    expect(hamiltonianCoefficient(model, 'q0^2')).toBeCloseTo(0.5 * omega * omega, 6);
    expect(model.residualNorm).toBeLessThan(1e-6);
    expect(model.rSquared).toBeGreaterThan(1 - 1e-10);
  });

  it('recovers the pendulum H = ½p² + (1 − cos q) from its field', () => {
    const data = sampleField1d((q, p) => ({ qDot: p, pDot: -Math.sin(q) }), grid(-2, 2, 11), grid(-2, 2, 9));
    const model = learnHamiltonian(data.q, data.p, data.qDot, data.pDot, {
      degreesOfFreedom: 1,
      polynomialDegree: 2,
      trigCoordinates: [0]
    });
    expect(hamiltonianCoefficient(model, 'p0^2')).toBeCloseTo(0.5, 6);
    expect(hamiltonianCoefficient(model, 'cos(q0)')).toBeCloseTo(-1, 6);
    expect(hamiltonianCoefficient(model, 'sin(q0)')).toBeCloseTo(0, 6);
    expect(hamiltonianCoefficient(model, 'q0^2')).toBeCloseTo(0, 6);
    // The recovered field reproduces q̇ = p, ṗ = −sin q.
    const f = hamiltonianVectorField(model, [0.7], [0.3]);
    expect(f.qDot[0]).toBeCloseTo(0.3, 6);
    expect(f.pDot[0]).toBeCloseTo(-Math.sin(0.7), 6);
  });

  it('recovers the Duffing double-well H = ½p² − ½q² + ¼q⁴', () => {
    const data = sampleField1d((q, p) => ({ qDot: p, pDot: q - q * q * q }), grid(-1.8, 1.8, 13), grid(-1.5, 1.5, 9));
    const model = learnHamiltonian(data.q, data.p, data.qDot, data.pDot, { degreesOfFreedom: 1, polynomialDegree: 4 });
    expect(hamiltonianCoefficient(model, 'p0^2')).toBeCloseTo(0.5, 6);
    expect(hamiltonianCoefficient(model, 'q0^2')).toBeCloseTo(-0.5, 6);
    expect(hamiltonianCoefficient(model, 'q0^4')).toBeCloseTo(0.25, 6);
    expect(model.residualNorm).toBeLessThan(1e-6);
  });

  it('recovers a 2-DOF coupled oscillator', () => {
    const kappa = 0.6;
    // H = ½(p0²+p1²) + ½q0² + ½q1² + ½κ(q0−q1)²
    const qs = grid(-1, 1, 5);
    const q: number[][] = [];
    const p: number[][] = [];
    const qDot: number[][] = [];
    const pDot: number[][] = [];
    for (const a of qs)
      for (const b of qs)
        for (const c of [-0.8, 0.4])
          for (const d of [0.3, -0.6]) {
            q.push([a, b]);
            p.push([c, d]);
            qDot.push([c, d]);
            pDot.push([-(1 + kappa) * a + kappa * b, kappa * a - (1 + kappa) * b]);
          }
    const model = learnHamiltonian(q, p, qDot, pDot, { degreesOfFreedom: 2, polynomialDegree: 2 });
    expect(hamiltonianCoefficient(model, 'p0^2')).toBeCloseTo(0.5, 6);
    expect(hamiltonianCoefficient(model, 'p1^2')).toBeCloseTo(0.5, 6);
    expect(hamiltonianCoefficient(model, 'q0^2')).toBeCloseTo(0.5 + 0.5 * kappa, 6);
    expect(hamiltonianCoefficient(model, 'q1^2')).toBeCloseTo(0.5 + 0.5 * kappa, 6);
    expect(hamiltonianCoefficient(model, 'q0 q1')).toBeCloseTo(-kappa, 6);
    expect(model.residualNorm).toBeLessThan(1e-6);
  });
});

describe('Hamiltonian learning — from sampled trajectories', () => {
  it('recovers the pendulum H from several integrated orbits with estimated derivatives', () => {
    // Pendulum field q̇ = p, ṗ = −sin q. A single orbit is rank-deficient
    // (½p² − cos q is constant on it), so we integrate several energies.
    const dt = 0.005;
    const stepsPerOrbit = 1200;
    const allQ: number[][] = [];
    const allP: number[][] = [];
    const allQDot: number[][] = [];
    const allPDot: number[][] = [];
    const f = (qq: number, pp: number): [number, number] => [pp, -Math.sin(qq)];

    for (const q0 of [0.6, 1.1, 1.7, 2.3]) {
      const orbitQ: number[][] = [];
      const orbitP: number[][] = [];
      let qi = q0;
      let pi = 0;
      for (let s = 0; s < stepsPerOrbit; s += 1) {
        orbitQ.push([qi]);
        orbitP.push([pi]);
        const [k1q, k1p] = f(qi, pi);
        const [k2q, k2p] = f(qi + 0.5 * dt * k1q, pi + 0.5 * dt * k1p);
        const [k3q, k3p] = f(qi + 0.5 * dt * k2q, pi + 0.5 * dt * k2p);
        const [k4q, k4p] = f(qi + dt * k3q, pi + dt * k3p);
        qi += (dt / 6) * (k1q + 2 * k2q + 2 * k3q + k4q);
        pi += (dt / 6) * (k1p + 2 * k2p + 2 * k3p + k4p);
      }
      // Estimate derivatives per orbit (never difference across the join).
      const { qDot, pDot } = estimatePhaseSpaceDerivatives(orbitQ, orbitP, dt);
      allQ.push(...orbitQ);
      allP.push(...orbitP);
      allQDot.push(...qDot);
      allPDot.push(...pDot);
    }

    const model = learnHamiltonian(allQ, allP, allQDot, allPDot, {
      degreesOfFreedom: 1,
      polynomialDegree: 2,
      trigCoordinates: [0]
    });
    // Finite-difference derivatives → looser tolerance than the exact-field case.
    expect(hamiltonianCoefficient(model, 'p0^2')).toBeCloseTo(0.5, 3);
    expect(hamiltonianCoefficient(model, 'cos(q0)')).toBeCloseTo(-1, 3);
    expect(model.rSquared).toBeGreaterThan(0.999);
  });
});

describe('Hamiltonian learning — energy conservation of the learned flow', () => {
  it('conserves the recovered H along an RK4 trajectory of its own field', () => {
    const data = sampleField1d((q, p) => ({ qDot: p, pDot: -Math.sin(q) }), grid(-2.5, 2.5, 13), grid(-2, 2, 9));
    const model: HamiltonianModel = learnHamiltonian(data.q, data.p, data.qDot, data.pDot, {
      degreesOfFreedom: 1,
      polynomialDegree: 2,
      trigCoordinates: [0]
    });

    const deriv = (q: number, p: number): [number, number] => {
      const f = hamiltonianVectorField(model, [q], [p]);
      return [f.qDot[0] ?? 0, f.pDot[0] ?? 0];
    };
    let q = 1.2;
    let p = 0;
    const dt = 0.01;
    const h0 = evaluateHamiltonian(model, [q], [p]);
    let maxDrift = 0;
    for (let step = 0; step < 2000; step += 1) {
      const [k1q, k1p] = deriv(q, p);
      const [k2q, k2p] = deriv(q + 0.5 * dt * k1q, p + 0.5 * dt * k1p);
      const [k3q, k3p] = deriv(q + 0.5 * dt * k2q, p + 0.5 * dt * k2p);
      const [k4q, k4p] = deriv(q + dt * k3q, p + dt * k3p);
      q += (dt / 6) * (k1q + 2 * k2q + 2 * k3q + k4q);
      p += (dt / 6) * (k1p + 2 * k2p + 2 * k3p + k4p);
      maxDrift = Math.max(maxDrift, Math.abs(evaluateHamiltonian(model, [q], [p]) - h0));
    }
    expect(maxDrift).toBeLessThan(1e-4);
  });
});
