import type { LegacyBinding, LocalizedText, SystemDefinition } from '../contracts/catalog';
import { ordinaryIntegratorIds, splitIntegratorIds, splitSystemIds } from './integrators';

export const l = (ko: string, en: string): LocalizedText => ({ ko, en });
export const b = (module: string, exportName: string): LegacyBinding => ({ module: `src/${module}.ts`, exportName });
export const p = (file: string, exportName: string): LegacyBinding => b(`physics/${file}`, exportName);

export interface SystemRow {
  id: string;
  baselineIds?: readonly string[];
  family: SystemDefinition['family'];
  evolution: SystemDefinition['evolution'];
  stage: number;
  name: LocalizedText;
  description: LocalizedText;
  binding: LegacyBinding;
  parameters: LegacyBinding;
  coordinates: LocalizedText;
  dof: number | LocalizedText;
  limitation: LocalizedText;
  state?: LegacyBinding;
  engines?: readonly LegacyBinding[];
  internal?: { binding: LegacyBinding; description: LocalizedText };
}

export function define(row: SystemRow): SystemDefinition {
  const id = `system:${row.id}` as const;
  const selectable = [
    ...ordinaryIntegratorIds,
    ...(splitSystemIds.some((candidate) => candidate === id) ? splitIntegratorIds : [])
  ];
  return {
    id,
    category: 'system',
    family: row.family,
    evolution: row.evolution,
    name: row.name,
    description: row.description,
    tags: [row.id, row.family, row.evolution],
    baselineIds: row.baselineIds ?? [id],
    integrationStage: row.stage,
    legacyBindings: [row.binding],
    engineAdapters: row.engines ?? [row.binding],
    parameters: {
      kind: 'legacy-api',
      version: 'unversioned',
      bindings: [row.parameters],
      description: l(
        '참조한 기존 API의 매개변수 계약을 따른다. 제품 상태 schema나 새 버전을 도입하지 않는다.',
        'Uses the referenced existing parameter API, without introducing a product state schema or a new version.'
      )
    },
    state: {
      kind: 'legacy-api',
      version: 'unversioned',
      bindings: [row.state ?? row.binding],
      description: row.coordinates
    },
    coordinates: row.coordinates,
    degreesOfFreedom:
      typeof row.dof === 'number' ? { kind: 'fixed', value: row.dof } : { kind: 'variable', description: row.dof },
    stepping: row.internal ? { kind: 'internal', ...row.internal } : { kind: 'selectable', integratorIds: selectable },
    limitations: [row.limitation]
  };
}

export const coupledLimit = l(
  '각도/각속도는 정준 좌표가 아니며 속도 결합이 있다. 분할 적분기의 심플렉틱 성질을 가정하지 않는다.',
  'Angles/angular velocities are not canonical coordinates and include velocity coupling. Do not assume split-step symplecticity.'
);
export const driveLimit = l(
  '구동 위상을 상태에 포함한다. 구동·감쇠가 있으면 역학 에너지는 보존량이 아니며 q/v 분할 적분기는 적용하지 않는다.',
  'Carries drive phase in the state. With drive or damping mechanical energy is not conserved; q/v split steppers do not apply.'
);
export const polarLimit = l(
  '극점에서 각 좌표계가 정칙화되어 궤적이 교란될 수 있다. 극점 통과에는 embedded 경로를 검토한다.',
  'The angular chart is regularized at poles and can perturb trajectories. Consider the embedded path for pole crossings.'
);
export const projectionLimit = l(
  '매 단계의 단위 길이·접선 속도 투영이 구속 계약의 일부이다. RHS만 일반 적분기에 넘기는 것은 동일한 엔진이 아니다.',
  'Unit-length and tangent-velocity projection at every step is part of the constraint contract. Passing only the RHS to a generic integrator is not the same engine.'
);
export const nDof = l('N개 링크가 N개 일반화 좌표를 가진다.', 'N links have N generalized coordinates.');
export const spatialDof = l('N개 링크가 2N개 일반화 좌표를 가진다.', 'N links have 2N generalized coordinates.');
export const state2 = l('[theta, omega] 각도와 각속도.', '[theta, omega] angle and angular velocity.');
export const state3 = l(
  '[theta, omega, phase] 각도·각속도·구동 위상.',
  '[theta, omega, phase] angle, angular velocity, and drive phase.'
);
export const state4 = l(
  '[theta1, theta2, omega1, omega2] 두 각도와 두 각속도.',
  '[theta1, theta2, omega1, omega2] two angles and two angular velocities.'
);
export const pendulumParams = b('types/domain', 'PendulumParameters');
export const expansionParams = p('expandedModels-types', 'ExpansionParameterMap');
export const expansionFactory = p('expandedModels-factory', 'createExpansionSystem');
export const expansionDefinitions = p('expandedModels-factory', 'EXPANSION_MODEL_DEFINITIONS');
