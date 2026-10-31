import { findPeriodicOrbit, type MapFn } from '../../../../chaos/chaosControl';
import type { StabilityLog } from './contracts';
import { mapResidual } from './source';

/** One native Newton update at a time provides real residual history, checked at the returned state. */
export function shootMap(
  map: MapFn,
  guess: readonly number[],
  period: number,
  tolerance: number,
  maxIterations: number
) {
  let point = [...guess],
    residual = mapResidual(map, point, period),
    iterations = 0;
  const log: StabilityLog[] = [{ step: 0, residual, converged: residual <= tolerance }];
  let failure: string | null = null;
  for (let i = 0; i < maxIterations && residual > tolerance; i++) {
    try {
      const native = findPeriodicOrbit(map, point, period, { tolerance, maxIterations: 1, jacobianStep: 1e-7 });
      if (!native.point.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6))
        throw new RangeError('Newton 상태가 유한 안전 범위를 벗어났습니다.');
      const actualResidual = mapResidual(map, native.point, period);
      point = native.point;
      residual = actualResidual;
      iterations = i + 1;
      log.push({ step: iterations, residual, converged: residual <= tolerance });
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : 'Newton 계산 실패';
      break;
    }
  }
  return { point, residual, converged: residual <= tolerance, iterations, log, failure };
}
