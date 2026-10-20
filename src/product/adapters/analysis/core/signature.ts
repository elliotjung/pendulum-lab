import type { CoreDiagnosticRequest } from './contracts';
import { createDiagnosticFlow } from './source';
import { numeric } from './settings';

/** Stable v1 result metadata, validated on reload without rerunning numerical estimators. */
export function coreResultSignature(request: CoreDiagnosticRequest): {
  columns: string[];
  units: string[];
  method: string;
} {
  const { kind, series, settings } = request;
  const coordinate = typeof settings.coordinate === 'number' ? settings.coordinate : 0,
    axis = series.axisUnit === 'iteration' ? '반복' : '시간';
  const label = series.labels[coordinate]!,
    unit = series.units[coordinate]!;
  const selected =
    request.experiment.integrator.kind === 'selectable' ? request.experiment.integrator.id.slice(11) : 'internal';
  const method = ['euler', 'rk2', 'rk4'].includes(selected) ? selected : 'rk4';
  const timeUnit = ['poincare', 'lyapunov', 'sali', 'fli', 'shadowing'].includes(kind)
    ? createDiagnosticFlow(request.experiment).timeUnit
    : series.axisUnit;
  const exponentUnit = timeUnit === 's' ? 's⁻¹' : '1/normalized-time';
  switch (kind) {
    case 'state-time':
      return { columns: [axis, label], units: [series.axisUnit, unit], method: 'native-observations' };
    case 'energy':
      return {
        columns: [axis, '에너지', '처음 대비 변화'],
        units: [series.axisUnit, series.energyUnit!, series.energyUnit!],
        method: 'native-energy-observations / relativeEnergyDrift'
      };
    case 'phase':
      return {
        columns: [label, series.labels[numeric(settings, 'phaseCoordinate')]!],
        units: [unit, series.units[numeric(settings, 'phaseCoordinate')]!],
        method: 'native-observation-projection'
      };
    case 'fft':
      return {
        columns: ['주파수', '단측 진폭'],
        units: [series.axisUnit === 's' ? 'Hz' : `cycles/${series.axisUnit}`, unit],
        method: 'physics/fft.fftInPlace'
      };
    case 'naff':
      return {
        columns: ['각주파수', '복소 진폭 크기'],
        units: [`rad/${series.axisUnit}`, unit],
        method: 'chaos/naff.naffDecompose'
      };
    case 'zero-one':
      return { columns: ['시험 주파수 c', 'Kc'], units: ['rad/sample', '1'], method: 'chaos/zeroOneTest.zeroOneTest' };
    case 'lyapunov':
      return {
        columns: ['지수 순서', 'Lyapunov 지수', 'SE', 'block SE'],
        units: ['1', exponentUnit, exponentUnit, exponentUnit],
        method: `chaos/lyapunov.lyapunovSpectrum / ${method}`
      };
    case 'sali':
    case 'fli':
      return {
        columns: ['native 측정 시간', kind.toUpperCase()],
        units: [timeUnit, '1'],
        method: `chaos/indicators.${kind}Indicator / rk4`
      };
    case 'poincare': {
      const dimension = createDiagnosticFlow(request.experiment).initial.length,
        projected = dimension > 1 ? (coordinate + 1) % dimension : 0;
      return {
        columns: ['교차 시간', `상태 ${projected}`],
        units: [timeUnit, series.units[projected] ?? 'native'],
        method: 'chaos/poincare.poincareSection / rk4'
      };
    }
    case 'shadowing':
      return {
        columns: ['시간', '궤도 차이', '참조 불확실성', '하한', '상한'],
        units: [timeUnit, 'native max norm', 'native max norm', 'native max norm', 'native max norm'],
        method: `chaos/shadowing.shadowingHorizon / ${method} vs gbs`
      };
  }
}
