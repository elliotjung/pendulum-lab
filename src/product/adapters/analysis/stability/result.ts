import { diagnosticJson } from '../core/result';
import type { StabilityRequest, StabilityResult, StabilityPoint, StabilityLog } from './contracts';
import { parameterUnit } from './source';

/** Pure signature used by strict artifact import without rerunning native computations. */
export function stabilityResultSignature(request: StabilityRequest): {
  columns: string[];
  units: string[];
  method: string;
} {
  switch (request.kind) {
    case 'fixed-point':
      return {
        columns: ['theta', 'omega', 'residual', 'mu1Real', 'mu1Imag', 'mu2Real', 'mu2Imag', 'stable'],
        units: ['rad', 'rad/s', 'mixed-state-infinity-norm', '1', '1', '1', '1', '1'],
        method: 'native-findPeriodicOrbit+mapJacobianFD+classifyFixedPoint-current-section'
      };
    case 'periodic-shooting':
      return {
        columns: ['period', 'cycleIndex', 'theta', 'omega', 'residual', 'stable'],
        units: ['drive-periods', 'index', 'rad', 'rad/s', 'mixed-state-infinity-norm', '1'],
        method: 'native-findPeriodicOrbit+buildPeriodicOrbitDatabase-current-section'
      };
    case 'floquet':
      return {
        columns: ['index', 'real', 'imaginary', 'modulus', 'exponentReal', 'exponentImaginary'],
        units: ['index', '1', '1', '1', 's^-1', 'rad/s'],
        method:
          request.settings.source === 'linear-oscillator'
            ? 'native-floquetLinearSpectrum-explicit-linear-oscillator'
            : 'native-findPeriodicOrbit+floquetAnalysis-current-section'
      };
    case 'melnikov':
      return {
        columns: ['tau0', 'analytic', 'quadrature', 'absoluteError'],
        units: ['normalized-time', '1', '1', '1'],
        method: 'native-melnikovFunction+melnikovFunctionNumeric-current-driven'
      };
    case 'continuation':
      return {
        columns: ['parameter', 'theta', 'omega', 'residual', 'spectralRadius', 'stable'],
        units: [
          parameterUnit(String(request.settings.parameter)),
          'rad',
          'rad/s',
          'mixed-state-infinity-norm',
          '1',
          '1'
        ],
        method: 'native-findPeriodicOrbit-natural-continuation+detectBifurcations-current-section'
      };
    case 'pseudo-arclength':
      return {
        columns: ['lambda', 'x', 'residual', 'tangentLambda'],
        units: ['1', '1', '1', '1'],
        method: 'native-continueArclength-explicit-fold-normal-form'
      };
    case 'branch-switch':
      return {
        columns: ['parameter', 'branch', 'state0', 'state1', 'residual', 'stable'],
        units:
          request.settings.source === 'current-driven'
            ? ['rad/s^2', 'index', 'rad', 'rad/s', 'mixed-state-infinity-norm', '1']
            : ['1', 'index', '1', '1', '1', '1'],
        method:
          request.settings.source === 'current-driven'
            ? 'native-switchPeriodDoubling-phase-conjugacy-current-driven'
            : 'native-findPeriodicOrbit-off-branch-seeds-explicit-pitchfork-normal-form'
      };
    case 'neimark-sacker':
      return {
        columns: ['parameter', 'x', 'y', 'spectralRadius', 'residual'],
        units: ['1', '1', '1', '1', '1'],
        method: 'native-findPeriodicOrbit+detectNeimarkSacker-explicit-delayed-logistic'
      };
    case 'torus':
      return {
        columns: ['parameter', 'amplitude', 'rotationNumber', 'invarianceResidual', 'converged'],
        units: ['1', '1', 'turns/iteration', '1', '1'],
        method: 'native-continueNeimarkSackerTorus+torusLyapunovSpectrum-explicit-delayed-logistic'
      };
    case 'arnold-tongue':
      return {
        columns: ['omega', 'rotationNumber'],
        units: ['turns/iteration', 'turns/iteration'],
        method: 'native-scanModeLocking+sineCircleMap-explicit-circle-map'
      };
    case 'codim-two':
      return {
        columns: ['x', 'y', 'lambda', 'regime'],
        units: [
          parameterUnit(String(request.settings.xParameter)),
          parameterUnit(String(request.settings.yParameter)),
          's^-1',
          'label'
        ],
        method: 'native-codimTwoDiagram-current-driven-phase-extended-flow'
      };
  }
}
export function stabilityResult(
  request: StabilityRequest,
  summary: string,
  rows: number[][],
  details: unknown,
  warnings: string[],
  branch: StabilityPoint[] = [],
  log: StabilityLog[] = [],
  status: StabilityResult['status'] = 'diagnostic'
): StabilityResult {
  const signature = stabilityResultSignature(request);
  if (rows.length > 8192 || rows.some((row) => row.length !== signature.columns.length || !row.every(Number.isFinite)))
    throw new RangeError('안정성 결과에 유한하지 않은 값 또는 잘못된 열 차원이 있습니다.');
  if (
    branch.some((p) => !Number.isFinite(p.parameter) || !Number.isFinite(p.residual) || !p.state.every(Number.isFinite))
  )
    throw new RangeError('안정성 가지가 유한 범위를 벗어났습니다.');
  return {
    kind: request.kind,
    source: String(request.settings.source),
    summary,
    ...signature,
    rows: diagnosticJson(rows) as number[][],
    details: diagnosticJson(details),
    warnings: [...new Set(warnings)],
    branch: diagnosticJson(branch) as unknown as StabilityPoint[],
    log: diagnosticJson(log) as unknown as StabilityLog[],
    status
  };
}
