import { diagnosticJson } from '../core/result';
import type { ExperimentStateV1 } from '../../../contracts/experiment';
import type { AdvancedDiagnosticRequest, AdvancedDiagnosticResult } from './contracts';

export function advancedTimeUnit(experiment: ExperimentStateV1): 's' | 'normalized-time' {
  return ['system:magnetic', 'system:duffing', 'system:van-der-pol', 'system:mathieu', 'system:fput'].includes(
    experiment.systemId
  )
    ? 'normalized-time'
    : 's';
}
/** Shared artifact signature validates native outputs without rerunning an expensive calculation. */
export function advancedResultSignature(request: AdvancedDiagnosticRequest): {
  columns: string[];
  units: string[];
  method: string;
} {
  const time = advancedTimeUnit(request.experiment),
    rate = `${time}^-1`;
  switch (request.kind) {
    case 'rqa':
      return {
        columns: [
          'recurrenceRate',
          'determinism',
          'laminarity',
          'longestDiagonal',
          'divergence',
          'meanDiagonal',
          'entropy',
          'trappingTime',
          'epsilon',
          'embeddedLength'
        ],
        units: [
          '1',
          '1',
          '1',
          'samples',
          'sample^-1',
          'samples',
          'nat',
          'samples',
          request.series.units[Number(request.settings.coordinate)] ?? 'observable',
          'points'
        ],
        method: 'native-recurrenceQuantification+block-uncertainty'
      };
    case 'recurrence-network':
      return {
        columns: [
          'nodes',
          'edges',
          'density',
          'meanDegree',
          'maxDegree',
          'degreeStd',
          'clusteringCoefficient',
          'transitivity',
          'averagePathLength',
          'largestComponent'
        ],
        units: ['nodes', 'edges', '1', 'edges', 'edges', 'edges', '1', '1', 'edges', 'nodes'],
        method: 'native-recurrenceMatrix+recurrenceNetworkMetrics'
      };
    case 'correlation-dimension':
      return {
        columns: ['radius', 'correlationSum'],
        units: [request.series.units[Number(request.settings.coordinate)] ?? 'observable', '1'],
        method: 'native-delayEmbed+correlationDimension'
      };
    case 'multifractal':
      return {
        columns: ['q', 'Dq', 'tau', 'alpha', 'f', 'rSquared'],
        units: ['1', '1', '1', '1', '1', '1'],
        method: 'native-generalizedDimensions+singularitySpectrum'
      };
    case 'topological-entropy':
      return {
        columns: ['boxes', 'entropy', 'spectralRadius', 'iterations', 'converged'],
        units: ['cells', 'nat/iteration', '1', 'iterations', '1'],
        method: 'native-topologicalEntropy1D-explicit-benchmark'
      };
    case 'transfer-operator':
      return {
        columns: ['resolution', 'eigenvalueIndex', 'real', 'imaginary', 'modulus'],
        units: ['cells', 'index', '1', '1', '1'],
        method: 'native-ulamTransitionMatrix1D+transferOperatorSpectrum-explicit-benchmark'
      };
    case 'clv':
      return {
        columns: ['time', 'index', 'exponent'],
        units: [time, 'index', rate],
        method: 'native-covariantLyapunovVectors-RK4'
      };
    case 'ftle':
      return {
        columns: ['duration', 'ftle'],
        units: [time, rate],
        method: 'native-flowMapGradient+largestSingularValue-RK4'
      };
    case 'lcs-ridge':
      return {
        columns: ['theta1', 'theta2', 'ftle', 'ridge'],
        units: ['rad', 'rad', 's^-1', '1'],
        method: 'native-doublePendulumFtleField+extractFtleRidges'
      };
    case 'basin':
      return {
        columns: ['theta1', 'theta2', 'label'],
        units: ['rad', 'rad', 'label'],
        method: 'native-doublePendulumFlipBasin+basinEntropy'
      };
    case 'uncertainty':
      return {
        columns: ['epsilon', 'occupiedBoxes'],
        units: ['cells', 'boxes'],
        method: 'native-boundaryMask+boxCountingDimension-uncertainty-proxy'
      };
    case 'wada':
      return {
        columns: ['resolution', 'wadaFraction', 'boundaryCells', 'numColors'],
        units: ['cells', '1', 'cells', 'labels'],
        method: 'native-doublePendulumFlipBasin+wadaConvergenceFromGrids'
      };
  }
}
export function advancedResult(
  request: AdvancedDiagnosticRequest,
  summary: string,
  rows: number[][],
  details: unknown,
  warnings: string[]
): AdvancedDiagnosticResult {
  const signature = advancedResultSignature(request);
  if (rows.some((row) => row.length !== signature.columns.length || !row.every(Number.isFinite)))
    throw new RangeError('분석 결과에 유한하지 않은 값 또는 잘못된 출력 차원이 있습니다.');
  return {
    kind: request.kind,
    summary,
    ...signature,
    rows: rows.map((row) => row.map((n) => (Object.is(n, -0) ? 0 : n))),
    details: diagnosticJson(details),
    warnings: [...new Set(warnings)]
  };
}
