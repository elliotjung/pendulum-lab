import { defaultPlanarConfig, toCanonicalPlanar } from '../../../../../src/product/adapters/physics/planar';
import { defaultCoreSettings } from '../../../../../src/product/adapters/analysis/core/settings';
import type {
  CoreDiagnosticKind,
  CoreDiagnosticRequest,
  DiagnosticSeries
} from '../../../../../src/product/adapters/analysis/core/contracts';
export function experiment() {
  const state = toCanonicalPlanar({ ...defaultPlanarConfig(), step: 0.01, duration: 2 });
  if (!state.ok) throw new Error('fixture canonical failure');
  return state.value;
}
export function signalSeries(n = 128, dt = 0.1): DiagnosticSeries {
  return {
    axisUnit: 's',
    labels: ['x', 'v'],
    units: ['m', 'm/s'],
    times: Array.from({ length: n }, (_, i) => i * dt),
    states: Array.from({ length: n }, (_, i) => [
      Math.cos(2 * Math.PI * 0.625 * i * dt),
      -Math.sin(2 * Math.PI * 0.625 * i * dt)
    ]),
    warnings: []
  };
}
export function request(
  kind: CoreDiagnosticKind,
  overrides: Partial<CoreDiagnosticRequest> = {}
): CoreDiagnosticRequest {
  const state = experiment();
  return {
    id: 'test-diagnostic',
    kind,
    experiment: state,
    series: signalSeries(),
    settings: defaultCoreSettings(kind, state),
    ...overrides
  };
}
