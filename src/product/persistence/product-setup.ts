import type { ExperimentStateV1 } from '../contracts/experiment';
import { validateExperimentState } from '../contracts/experiment-validation';
import { failure, success, type ContractResult, type ContractIssue } from '../contracts/validation';
import type { PlaybackSettings } from '../contracts/playback';
import {
  PERTURBATION_PATTERNS,
  PERTURBATION_VARIABLES,
  stateIndexForPerturbation,
  type EnsemblePerturbationSpec
} from '../../app/ensemblePerturbation';
import { EXPERIMENT_RECIPES, experimentRecipe, type ExperimentGoal } from '../../app/experimentRecipes';
import {
  WORKFLOW_STEPS,
  TRAJECTORY_STAGES,
  type ExperimentWorkflowStep,
  type TrajectoryStage
} from '../../app/experimentWorkflowContract';
import { normalizeGoalWorkflowState } from '../../app/experimentWorkflowPolicy';
import { parseContractJson } from './json';
import { canonicalJson, DATA_LIMITS, inspectSafeData, type JsonValue } from './safe-data';
import { encodeShareToken } from './share';

export const PRODUCT_SETUP_SCHEMA = 'pendulum-product-setup/v1' as const;
export const MAX_PRODUCT_SETUP_FILE_BYTES = DATA_LIMITS.bytes;
export interface ProductSetupControlsV1 {
  readonly angleUnit: 'rad' | 'deg';
  readonly playback: PlaybackSettings;
  readonly render: {
    readonly trailMode: 'rainbow' | 'heat' | 'ice' | 'plasma' | 'white' | 'green';
    readonly trailLength: number;
    readonly phaseAxis: '1' | '2' | 'both';
    readonly qualityMode: 'performance' | 'balanced' | 'cinematic';
    readonly glow: boolean;
    readonly longExposure: boolean;
    readonly interpolate: boolean;
    readonly autoQuality: boolean;
  };
  readonly ensemble: { readonly count: number; readonly spec: EnsemblePerturbationSpec };
  readonly workflow: {
    readonly goal: ExperimentGoal;
    readonly step: ExperimentWorkflowStep;
    readonly trajectoryStage: TrajectoryStage;
  };
}
/** A public setup only: no raw legacy source, notes, results, storage references,
 * audio activation or continuation buffers. Opening it is a read-only operation. */
export interface ProductSetupV1 {
  readonly schema: typeof PRODUCT_SETUP_SCHEMA;
  readonly experiment: ExperimentStateV1;
  readonly controls: ProductSetupControlsV1;
}
class SetupError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
    readonly recovery: ContractIssue['recovery'] = 'keep-original'
  ) {
    super(message);
  }
}
function reject(code: string, path: string, message: string): never {
  throw new SetupError(code, path, message);
}
function closed(value: JsonValue | undefined, keys: readonly string[], path: string): Record<string, JsonValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    reject('invalid-product-setup', path, '명시적인 설정 객체가 필요합니다.');
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  const extra = Object.keys(value).find((key) => !keys.includes(key));
  if (missing || extra)
    reject(
      'unknown-field',
      `${path}.${missing ?? extra}`,
      '필수 설정이 없거나 알 수 없는 필드입니다. 기본값으로 보정하지 않았습니다.'
    );
  return value;
}
function oneOf(value: JsonValue | undefined, choices: readonly string[], path: string) {
  if (typeof value !== 'string' || !choices.includes(value))
    reject('invalid-product-control', path, '지원하는 명시적인 control 값이 필요합니다.');
}
function number(value: JsonValue | undefined, min: number, max: number, path: string, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    reject(
      'invalid-product-control',
      path,
      `${min}–${max} 범위의 ${integer ? '정수' : '유한한 수'}가 필요합니다. 보정하지 않았습니다.`
    );
}

/** Light, descriptor-safe canonical/control validation for metadata-only routes.
 * Native model versions, units and execution bounds are checked by the existing
 * fromCanonical adapter after its laboratory module is explicitly loaded.
 * No defaults, model substitution or workflow normalization is applied here. */
export function validateProductSetup(input: unknown): ContractResult<ProductSetupV1> {
  const safe = inspectSafeData(input);
  if (!safe.ok) return safe;
  try {
    const value = closed(safe.value, ['schema', 'experiment', 'controls'], '$');
    if (value.schema !== PRODUCT_SETUP_SCHEMA)
      throw new SetupError(
        'unsupported-version',
        '$.schema',
        '지원하는 전체 실험 설정 버전이 아닙니다. 원본을 보존하세요.',
        'use-supported-version'
      );
    const experiment = validateExperimentState(value.experiment);
    if (!experiment.ok) return experiment;
    const source = experiment.value;
    if (!['system:double', 'system:compound-double', 'system:triple'].includes(source.systemId))
      return failure(
        'unsupported-setup-system',
        '$.experiment.systemId',
        '전체 control 공유 v1은 이중·복합·삼중 진자에 적용됩니다. 다른 시스템은 기존 물리 설정 공유를 사용하세요.',
        'keep-original'
      );
    // The existing encoder checks privacy before its URL size check. A large
    // public state can still be exported as a bounded setup JSON file; the ps1
    // encoder separately enforces the unchanged URL limit on the complete setup.
    const publicState = encodeShareToken(source);
    if (!publicState.ok && publicState.issues.some((item) => item.code !== 'share-too-large')) return publicState;
    const controls = closed(value.controls, ['angleUnit', 'playback', 'render', 'ensemble', 'workflow'], '$.controls');
    oneOf(controls.angleUnit, ['rad', 'deg'], '$.controls.angleUnit');
    const playback = closed(controls.playback, ['timingMode', 'speed', 'stepsPerFrame', 'mode'], '$.controls.playback');
    if (
      !['wall-clock', 'deterministic'].includes(playback.timingMode as string) ||
      typeof playback.speed !== 'number' ||
      playback.speed < 0.1 ||
      playback.speed > 4 ||
      typeof playback.stepsPerFrame !== 'number' ||
      !Number.isSafeInteger(playback.stepsPerFrame) ||
      playback.stepsPerFrame < 1 ||
      playback.stepsPerFrame > 60 ||
      !['demo', 'education', 'research', 'benchmark', 'performance', 'recovery'].includes(playback.mode as string)
    ) {
      reject(
        'invalid-product-control',
        '$.controls.playback',
        '시간 방식·실행 용도·속도·프레임 예산을 확인하세요. 보정하지 않았습니다.'
      );
    }
    const render = closed(
      controls.render,
      ['trailMode', 'trailLength', 'phaseAxis', 'qualityMode', 'glow', 'longExposure', 'interpolate', 'autoQuality'],
      '$.controls.render'
    );
    oneOf(render.trailMode, ['rainbow', 'heat', 'ice', 'plasma', 'white', 'green'], '$.controls.render.trailMode');
    number(render.trailLength, 2, 50_000, '$.controls.render.trailLength', true);
    oneOf(render.phaseAxis, ['1', '2', 'both'], '$.controls.render.phaseAxis');
    oneOf(render.qualityMode, ['performance', 'balanced', 'cinematic'], '$.controls.render.qualityMode');
    for (const key of ['glow', 'longExposure', 'interpolate', 'autoQuality'])
      if (typeof render[key] !== 'boolean')
        reject('invalid-product-control', `$.controls.render.${key}`, '명시적인 boolean 설정이 필요합니다.');
    const ensemble = closed(controls.ensemble, ['count', 'spec'], '$.controls.ensemble');
    number(ensemble.count, 0, 80, '$.controls.ensemble.count', true);
    const spec = closed(ensemble.spec, ['variable', 'pattern', 'epsilon', 'seed'], '$.controls.ensemble.spec');
    oneOf(spec.variable, PERTURBATION_VARIABLES, '$.controls.ensemble.spec.variable');
    oneOf(spec.pattern, PERTURBATION_PATTERNS, '$.controls.ensemble.spec.pattern');
    number(spec.epsilon, 1e-7, 1e-2, '$.controls.ensemble.spec.epsilon');
    number(spec.seed, 0, 0xffff_ffff, '$.controls.ensemble.spec.seed', true);
    if (
      stateIndexForPerturbation(
        spec.variable as EnsemblePerturbationSpec['variable'],
        source.systemId.slice(7) as 'double' | 'compound-double' | 'triple'
      ) === null
    )
      reject(
        'invalid-product-control',
        '$.controls.ensemble.spec.variable',
        '선택한 모델에 없는 섭동 좌표를 대체하지 않았습니다.'
      );
    const workflow = closed(controls.workflow, ['goal', 'step', 'trajectoryStage'], '$.controls.workflow');
    oneOf(
      workflow.goal,
      EXPERIMENT_RECIPES.map((recipe) => recipe.id),
      '$.controls.workflow.goal'
    );
    oneOf(workflow.step, WORKFLOW_STEPS, '$.controls.workflow.step');
    oneOf(workflow.trajectoryStage, TRAJECTORY_STAGES, '$.controls.workflow.trajectoryStage');
    const normalized = normalizeGoalWorkflowState(
      experimentRecipe(workflow.goal as ExperimentGoal),
      workflow.step as ExperimentWorkflowStep,
      workflow.trajectoryStage as TrajectoryStage
    );
    if (normalized.step !== workflow.step || normalized.stage !== workflow.trajectoryStage)
      reject(
        'invalid-product-control',
        '$.controls.workflow',
        '이 목표에서 사용할 수 없는 관찰 단계입니다. 자동으로 다른 단계로 바꾸지 않았습니다.'
      );
    return success({
      schema: PRODUCT_SETUP_SCHEMA,
      experiment: source,
      controls: controls as unknown as ProductSetupControlsV1
    });
  } catch (cause) {
    if (cause instanceof SetupError) return failure(cause.code, cause.path, cause.message, cause.recovery);
    return failure(
      'invalid-product-setup',
      '$',
      '전체 실험 설정을 안전하게 읽지 못했습니다. 원본을 보존하세요.',
      'keep-original'
    );
  }
}
export function serializeProductSetup(input: unknown): ContractResult<string> {
  const checked = validateProductSetup(input);
  return checked.ok ? success(canonicalJson(checked.value as unknown as JsonValue)) : checked;
}
export function parseProductSetup(text: unknown): ContractResult<ProductSetupV1> {
  const parsed = parseContractJson(text);
  return parsed.ok ? validateProductSetup(parsed.value) : parsed;
}
