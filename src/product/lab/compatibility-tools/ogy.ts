import {
  findPeriodicOrbit,
  mapJacobianFD,
  ogyAnalyze,
  simulateOgyControl,
  type ParametrizedMapFn,
  type OgySpec
} from '../../../chaos/chaosControl';
import { OGY_ALGORITHM_VERSION, OGY_LIMITATIONS, type OgyArtifact, type OgyRow } from './contracts';
import { validateOgyRequest } from './request';

/** The exact independent map used by tests/chaos-control.test.ts; no pendulum dynamics live here. */
export function henonBenchmark(b: number): ParametrizedMapFn {
  return (x, a, out) => {
    out[0] = 1 - a * x[0]! * x[0]! + x[1]!;
    out[1] = b * x[0]!;
  };
}

/** All orbit, Jacobian, eigensystem and control calculations call the preserved native tools. */
export function executeOgyRequest(
  input: unknown,
  onProgress: (value: number, message: string) => void = () => {}
): OgyArtifact {
  const request = validateOgyRequest(input);
  const settings = request.settings;
  const map = henonBenchmark(settings.b);
  const nominal = (x: readonly number[], out: number[]) => map(x, settings.a, out);
  onProgress(0, '기존 Newton 탐색으로 Hénon 고정점을 찾습니다.');
  const orbit = findPeriodicOrbit(nominal, [0.5, 0.1], 1, { tolerance: 1e-12, maxIterations: 32 });
  if (!orbit.converged || !Number.isFinite(orbit.residual) || orbit.residual > 1e-10)
    throw new Error('고정점 탐색이 수렴하지 않았습니다. 원 실험을 유지하고 기준 매개변수를 바꿔 보세요.');
  const jacobian = mapJacobianFD(nominal, orbit.point);
  const spec: OgySpec = {
    fixedPoint: orbit.point,
    jacobian: [
      [jacobian[0]![0]!, jacobian[0]![1]!],
      [jacobian[1]![0]!, jacobian[1]![1]!]
    ],
    parameterSensitivity: [-orbit.point[0]! * orbit.point[0]!, 0]
  };
  const analysis = ogyAnalyze(spec);
  const controllability =
    analysis.leftUnstableVector[0] * spec.parameterSensitivity[0] +
    analysis.leftUnstableVector[1] * spec.parameterSensitivity[1];
  if (!Number.isFinite(controllability) || Math.abs(controllability) < 1e-10)
    throw new Error('이 고정점의 매개변수 방향은 국소 제어에 적합하지 않습니다.');
  const initial = [orbit.point[0]! + settings.offsetX, orbit.point[1]! + settings.offsetY];
  function simulate(maxDelta: number, phase: number) {
    const rows: OgyRow[] = [[0, initial[0]!, initial[1]!, 0, Math.hypot(settings.offsetX, settings.offsetY)]];
    const record: ParametrizedMapFn = (x, parameter, out) => {
      map(x, parameter, out);
      if (!out.every(Number.isFinite)) throw new Error('기준 사상이 유한하지 않아 결과를 보존하지 않았습니다.');
      rows.push([
        rows.length,
        out[0]!,
        out[1]!,
        parameter - settings.a,
        Math.hypot(out[0]! - orbit.point[0]!, out[1]! - orbit.point[1]!)
      ]);
      if ((rows.length - 1) % 256 === 0)
        onProgress(
          0.1 + 0.4 * phase + (0.4 * (rows.length - 1)) / settings.steps,
          '기존 OGY 제어·대조군 반복 중입니다.'
        );
    };
    const summary = simulateOgyControl(
      record,
      spec,
      { nominalParameter: settings.a, maxDelta, region: settings.region, steps: settings.steps },
      initial
    );
    return { summary, rows };
  }
  onProgress(0.1, '같은 초기조건에서 제어군과 대조군을 비교합니다.');
  const controlled = simulate(settings.maxDelta, 0);
  const uncontrolled = simulate(0, 1);
  onProgress(1, '유한 반복 결과와 전체 설정·출처를 보존했습니다.');
  return {
    schema: 'pendulum-ogy-artifact/v1',
    algorithmVersion: OGY_ALGORITHM_VERSION,
    createdAt: new Date().toISOString(),
    request,
    benchmark: 'independent-henon-map',
    nativeExports: ['findPeriodicOrbit', 'mapJacobianFD', 'ogyAnalyze', 'simulateOgyControl'].map(
      (name) => `src/chaos/chaosControl.ts#${name}`
    ),
    fixedPoint: orbit.point,
    residual: orbit.residual,
    unstableEigenvalue: analysis.unstableEigenvalue,
    stableEigenvalue: analysis.stableEigenvalue,
    parameterSensitivity: spec.parameterSensitivity,
    controlled: controlled.summary,
    uncontrolled: uncontrolled.summary,
    controlledRows: controlled.rows,
    uncontrolledRows: uncontrolled.rows,
    limitations: OGY_LIMITATIONS
  };
}
