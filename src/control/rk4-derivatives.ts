import type { ControlledSystem, StepDerivatives } from './ilqr-types';

/**
 * Exact analytic Jacobians of the classical RK4 step map by the chain rule
 * through the four stages. This is the derivative of the implemented discrete
 * map, so it removes the finite-difference floor without changing the rollout.
 */
export function makeRk4StepDerivatives(system: ControlledSystem, dt: number): StepDerivatives {
  const { n, m } = system;
  const stage = new Float64Array(n);
  const k = new Float64Array(n);
  const a = new Float64Array(n * n);
  const bmat = new Float64Array(n * m);
  const dPrev = new Float64Array(n * n);
  const dCur = new Float64Array(n * n);
  const dSum = new Float64Array(n * n);
  const ePrev = new Float64Array(n * m);
  const eCur = new Float64Array(n * m);
  const eSum = new Float64Array(n * m);
  const xBase = new Float64Array(n);

  // dCur = A * (I + scale*dPrev); eCur = A * (scale*ePrev) + B.
  const propagate = (scale: number): void => {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        let acc = a[i * n + j] ?? 0; // A*I term
        for (let r = 0; r < n; r += 1) acc += (a[i * n + r] ?? 0) * scale * (dPrev[r * n + j] ?? 0);
        dCur[i * n + j] = acc;
      }
      for (let c = 0; c < m; c += 1) {
        let acc = bmat[i * m + c] ?? 0;
        for (let r = 0; r < n; r += 1) acc += (a[i * n + r] ?? 0) * scale * (ePrev[r * m + c] ?? 0);
        eCur[i * m + c] = acc;
      }
    }
  };
  const accumulate = (weight: number): void => {
    for (let i = 0; i < n * n; i += 1) dSum[i] = (dSum[i] ?? 0) + weight * (dCur[i] ?? 0);
    for (let i = 0; i < n * m; i += 1) eSum[i] = (eSum[i] ?? 0) + weight * (eCur[i] ?? 0);
  };

  return (x, u, fx, fu) => {
    for (let i = 0; i < n; i += 1) xBase[i] = Number(x[i] ?? 0);
    dSum.fill(0);
    eSum.fill(0);

    system.stateJacobian(xBase, u, a);
    system.controlJacobian(xBase, u, bmat);
    dCur.set(a);
    eCur.set(bmat);
    accumulate(1);
    system.rhs(xBase, u, k);

    const stageScales = [dt / 2, dt / 2, dt] as const;
    const weights = [2, 2, 1] as const;
    for (let s = 0; s < 3; s += 1) {
      const scale = stageScales[s]!;
      for (let i = 0; i < n; i += 1) stage[i] = xBase[i]! + scale * (k[i] ?? 0);
      dPrev.set(dCur);
      ePrev.set(eCur);
      system.stateJacobian(stage, u, a);
      system.controlJacobian(stage, u, bmat);
      propagate(scale);
      accumulate(weights[s]!);
      if (s < 2) system.rhs(stage, u, k);
    }

    const h6 = dt / 6;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) fx[i]![j] = (i === j ? 1 : 0) + h6 * (dSum[i * n + j] ?? 0);
      for (let c = 0; c < m; c += 1) fu[i]![c] = h6 * (eSum[i * m + c] ?? 0);
    }
  };
}
