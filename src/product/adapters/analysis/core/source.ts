import type { ExperimentStateV1 } from '../../../contracts/experiment';
import { constraintWarnings } from '../../physics/constraint';
import { chainWarnings } from '../../physics/chain';
import { spatialIsEmbedded, spatialWarnings } from '../../physics/spatial';
import { nonlinearStateFields, nonlinearWarnings } from '../../physics/nonlinear';
import { networkIsPhase, networkWarnings } from '../../physics/network';
import { fieldIsDiagnostic, fieldWarnings } from '../../physics/field';
import { discreteWarnings } from '../../physics/discrete-schema';
import { drivenWarnings } from '../../physics/driven';
import type { DiagnosticSeries } from './contracts';
import { readDiagnosticConfiguration, type DiagnosticConfiguration } from './source-config';
export { createDiagnosticFlow, diagnosticFlowRejection } from './source-flow';
export type { DiagnosticFlow } from './source-flow';

type Column = readonly [label: string, unit: string];
/** Retains strict family/version/unit/option checks for reloaded signal-only artifacts too. */
export function validateDiagnosticExperiment(experiment: ExperimentStateV1): void {
  readDiagnosticConfiguration(experiment);
}
const paired = (n: number, q: string, v: string, qu = 'rad', vu = 'rad/s'): Column[] => [
  ...Array.from({ length: n }, (_, i): Column => [`${q}${i + 1}`, qu]),
  ...Array.from({ length: n }, (_, i): Column => [`${v}${i + 1}`, vu])
];
const angles: Column[] = [
  ['theta1', 'rad'],
  ['theta2', 'rad'],
  ['omega1', 'rad/s'],
  ['omega2', 'rad/s']
];

function columns(source: DiagnosticConfiguration): Column[] {
  const { config: c } = source,
    id = c.systemId;
  switch (source.family) {
    case 'planar':
      return angles;
    case 'chain':
      return paired(source.config.parameters.masses.length, 'theta', 'omega');
    case 'constraint':
      return id === 'system:spring'
        ? [
            ['r', 'm'],
            ['theta', 'rad'],
            ['rDot', 'm/s'],
            ['omega', 'rad/s']
          ]
        : id === 'system:rope'
          ? [
              ['x', 'm'],
              ['y', 'm'],
              ['vx', 'm/s'],
              ['vy', 'm/s']
            ]
          : [
              ['x1', 'm'],
              ['y1', 'm'],
              ['x2', 'm'],
              ['y2', 'm'],
              ['vx1', 'm/s'],
              ['vy1', 'm/s'],
              ['vx2', 'm/s'],
              ['vy2', 'm/s']
            ];
    case 'spatial': {
      const n = source.config.parameters.masses.length;
      return spatialIsEmbedded(id)
        ? [
            ...Array.from({ length: n }, (_, i) =>
              ['x', 'y', 'z'].map((axis): Column => [`u${axis}${i + 1}`, '1'])
            ).flat(),
            ...Array.from({ length: n }, (_, i) =>
              ['x', 'y', 'z'].map((axis): Column => [`w${axis}${i + 1}`, 's^-1'])
            ).flat()
          ]
        : [
            ...Array.from({ length: n }, (_, i): Column[] => [
              [`theta${i + 1}`, 'rad'],
              [`phi${i + 1}`, 'rad']
            ]).flat(),
            ...Array.from({ length: n }, (_, i): Column[] => [
              [`thetaDot${i + 1}`, 'rad/s'],
              [`phiDot${i + 1}`, 'rad/s']
            ]).flat()
          ];
    }
    case 'driven':
      return id === 'system:cartpole'
        ? [
            ['x', 'm'],
            ['theta', 'rad'],
            ['v', 'm/s'],
            ['omega', 'rad/s']
          ]
        : id === 'system:coupled'
          ? angles
          : [
              ['theta', 'rad'],
              ['omega', 'rad/s'],
              ...(id === 'system:inverted' ? [] : [['drivePhase', 'rad'] as const])
            ];
    case 'nonlinear':
      return nonlinearStateFields(source.config.systemId).map((f) => [f.key, f.canonicalUnit]);
    case 'network':
      return id === 'system:magnetic'
        ? [
            ['x', '1'],
            ['y', '1'],
            ['vx', '1'],
            ['vy', '1']
          ]
        : [
            ...source.config.graph.nodes.map((node): Column => [`phase:${node.id}`, 'rad']),
            ...(id === 'system:pendulum-network'
              ? source.config.graph.nodes.map((node): Column => [`omega:${node.id}`, 'rad/s'])
              : [])
          ];
    case 'field':
      return id === 'system:langevin'
        ? [
            ['member-1:theta', '1'],
            ['member-1:omega', '1']
          ]
        : paired(
            source.config.grid.points,
            id === 'system:fput' ? 'q' : 'u',
            id === 'system:fput' ? 'v' : 'backwardRate',
            '1',
            '1'
          );
    case 'discrete':
      return id === 'system:standard-map'
        ? [
            ['theta', 'rad'],
            ['p', '1']
          ]
        : [
            ['meanSquareMomentum', '1'],
            ['norm', '1']
          ];
  }
}
function modelWarnings(source: DiagnosticConfiguration): string[] {
  switch (source.family) {
    case 'chain':
      return [...chainWarnings(source.config)];
    case 'constraint':
      return [...constraintWarnings(source.config)];
    case 'spatial':
      return [...spatialWarnings(source.config)];
    case 'nonlinear':
      return [...nonlinearWarnings(source.config)];
    case 'network':
      return networkWarnings(source.config);
    case 'field':
      return [
        ...fieldWarnings(source.config),
        ...(source.config.systemId === 'system:langevin'
          ? [
              '상태 신호는 member-1의 단일 경로이며 에너지는 전체 앙상블 평균입니다. 두 값을 동일 궤적의 에너지 수지로 해석하지 마세요.'
            ]
          : [])
      ];
    case 'discrete':
      return discreteWarnings(source.config);
    case 'driven':
      return drivenWarnings(source.config).map((warning) =>
        warning.startsWith('표시 에너지는')
          ? `에너지는 ${source.config.systemId === 'system:cartpole' ? '질량을 포함한 J' : '단위 질량 기준 m²/s²'} 진단값입니다. 구동·감쇠·제어가 있으면 보존량이 아닙니다.`
          : warning
      );
    default:
      return ['각도 rad, 각속도 rad/s, 에너지 J입니다. 감쇠가 있으면 총역학에너지는 보존되지 않습니다.'];
  }
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function finiteVector(value: unknown, dimension: number, path: string): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== dimension ||
    Array.from(value).some((v) => typeof v !== 'number' || !Number.isFinite(v))
  )
    throw new Error(`${path}: ${dimension}개 유한한 상태 값이 필요합니다.`);
  return [...value] as number[];
}

/** Retained observations only: no interpolation, phase unwrapping, normalization, or invented energies. */
export function createDiagnosticSeries(experiment: ExperimentStateV1, samples: readonly unknown[]): DiagnosticSeries {
  const source = readDiagnosticConfiguration(experiment),
    id = experiment.systemId;
  const warnings = modelWarnings(source);
  const normalizedTime =
    source.family === 'field' ||
    id === 'system:magnetic' ||
    ['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(id);
  const axisUnit = source.family === 'discrete' ? 'iteration' : normalizedTime ? 'normalized-time' : 's';
  if ((source.family === 'field' && fieldIsDiagnostic(id)) || id === 'system:unitary-floquet')
    return {
      axisUnit,
      labels: [],
      units: [],
      times: [],
      states: [],
      warnings: [...warnings, '정적 평가에는 관측 시계열이 없습니다. 시간·궤적 기반 카오스 진단을 실행할 수 없습니다.']
    };
  if (!Array.isArray(samples) || samples.length > 100_001) throw new RangeError('관측 표본은 최대 100001개입니다.');
  const fields = columns(source),
    times: number[] = [],
    states: number[][] = [],
    energies: number[] = [];
  const hasEnergy = source.family !== 'discrete' && !(source.family === 'network' && networkIsPhase(id));
  const energyUnit =
    source.family === 'field' ||
    (source.family === 'network' && id === 'system:magnetic') ||
    (source.family === 'nonlinear' && ['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(id))
      ? 'normalized'
      : (source.family === 'driven' && id !== 'system:cartpole') ||
          (source.family === 'nonlinear' && ['system:kapitza', 'system:pyragas'].includes(id))
        ? 'm^2/s^2'
        : 'J';
  for (const [index, value] of samples.entries()) {
    if (!record(value)) throw new Error(`표본 ${index}: 관측 객체가 필요합니다.`);
    const time = value[axisUnit === 'iteration' ? 'iteration' : 'time'];
    if (
      typeof time !== 'number' ||
      !Number.isFinite(time) ||
      (axisUnit === 'iteration' && !Number.isInteger(time)) ||
      (index > 0 && time <= times[index - 1]!)
    )
      throw new Error(`표본 ${index}: 관측 축은 유한하고 엄격히 증가해야 합니다.`);
    const state = id === 'system:quantum-kicked-rotor' ? [value.meanSquareMomentum, value.norm] : value.state;
    states.push(finiteVector(state, fields.length, `표본 ${index}`));
    times.push(time);
    if (hasEnergy) {
      const energy = record(value.energy) ? value.energy.total : value.energy;
      if (typeof energy !== 'number' || !Number.isFinite(energy))
        throw new Error(`표본 ${index}: 유한한 실제 에너지 진단값이 필요합니다.`);
      energies.push(energy);
    }
    if (Array.isArray(value.warnings))
      for (const warning of value.warnings)
        if (typeof warning === 'string' && !warnings.includes(warning)) warnings.push(warning);
  }
  return {
    axisUnit,
    labels: fields.map(([label]) => label),
    units: fields.map(([, unit]) => unit),
    times,
    states,
    ...(hasEnergy ? { energy: energies, energyUnit } : {}),
    warnings
  };
}
