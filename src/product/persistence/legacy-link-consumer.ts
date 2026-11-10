import type { SharedExperimentV4 } from '../../app/experimentShareTypes';
import {
  buildPerturbedStates,
  PERTURBATION_PATTERNS,
  PERTURBATION_VARIABLES,
  type EnsemblePerturbationSpec
} from '../../app/ensemblePerturbation';
import { experimentRecipe } from '../../app/experimentRecipes';
import {
  trajectoryStageForStep,
  type ExperimentWorkflowStep,
  type TrajectoryStage
} from '../../app/experimentWorkflowContract';
import { normalizeGoalWorkflowState, trajectoryStageCount } from '../../app/experimentWorkflowPolicy';
import type { ExperimentStateV1 } from '../contracts/experiment';
import { fromCanonicalPlanar, toCanonicalPlanar } from '../adapters/physics/planar';
import { fromCanonicalChain, toCanonicalChain } from '../adapters/physics/chain';
import type { PlaybackSettings } from '../lab/views/playback-clock';
import type { NativeDisplayOptions } from '../lab/views/native-display';
import { serializeLegacyLinkCompatibility, type LegacyLinkCompatibilityV1 } from './legacy-link';

export interface LegacyLinkConsumerSettings {
  readonly playback: Partial<PlaybackSettings>;
  readonly display?: NativeDisplayOptions;
  readonly angleUnit?: 'rad' | 'deg';
  readonly locale?: 'ko' | 'en';
  readonly audience?: string;
  readonly workflow: { goal: string; step: string; trajectoryStage: string };
  readonly tab: string;
  readonly ensemble: { count: number; spec: EnsemblePerturbationSpec };
  readonly inheritedDefaults: readonly string[];
}
export function legacyLinkConsumerSettings(envelope: LegacyLinkCompatibilityV1): LegacyLinkConsumerSettings {
  serializeLegacyLinkCompatibility(envelope);
  const defaults: string[] = [];
  if (envelope.sourceKind === 'legacy-share') {
    const value = envelope.resolved as unknown as SharedExperimentV4;
    const e = value.execution,
      ensemble = e.ensemble;
    return {
      playback: {
        ...(e.speed === null ? {} : { speed: e.speed }),
        ...(e.stepsPerFrame === null ? {} : { stepsPerFrame: e.stepsPerFrame }),
        ...(e.timingMode === null ? {} : { timingMode: e.timingMode })
      },
      ...(value.render ? { display: { ...value.render } } : {}),
      angleUnit: value.preferences.angleUnit,
      workflow: { ...value.workflow },
      tab: value.tab,
      ensemble: {
        count: ensemble?.count ?? 0,
        spec: ensemble
          ? { variable: ensemble.variable, pattern: ensemble.pattern, epsilon: ensemble.epsilon, seed: ensemble.seed }
          : { variable: 'th1', pattern: 'alternating', epsilon: 1e-4, seed: 1 }
      },
      inheritedDefaults: ensemble ? [] : ['원본 execution.ensemble=null → 근접 궤적 0개; 기준만 실행합니다.']
    };
  }
  if (envelope.sourceKind !== 'legacy-url') throw new Error('Expansion은 전용 native suite consumer에서 실행하세요.');
  const raw = envelope.decoded as Record<string, string>,
    resolved = envelope.resolved as { values: Record<string, number>; tab: string | null };
  const pick = (key: string, fallback: string) => {
    if (raw[key] === undefined) defaults.push(`${key}=${fallback} (기존 control 기본값; 원본에 없음)`);
    return raw[key] ?? fallback;
  };
  const goal = pick('experiment', 'sensitive-dependence'),
    recipe = experimentRecipe(goal);
  const requestedStep = pick('workflowStep', 'choose') as ExperimentWorkflowStep;
  const requestedStage = pick('trajectoryStage', trajectoryStageForStep(requestedStep)) as TrajectoryStage;
  const workflow = normalizeGoalWorkflowState(recipe, requestedStep, requestedStage);
  const handoffRelevant = ['experiment', 'experimentSchema', 'workflowStep'].some((key) => raw[key] !== undefined);
  const count = handoffRelevant
    ? trajectoryStageCount(recipe, workflow.stage, Number(raw.ensembleCount ?? recipe.perturbation.count))
    : 0;
  return {
    playback: {
      ...(resolved.values.speed === undefined ? {} : { speed: resolved.values.speed }),
      ...(resolved.values.spf === undefined ? {} : { stepsPerFrame: resolved.values.spf })
    },
    ...(raw.angleUnit ? { angleUnit: raw.angleUnit as 'rad' | 'deg' } : {}),
    ...(raw.lang ? { locale: raw.lang as 'ko' | 'en' } : {}),
    ...(raw.audience ? { audience: raw.audience } : {}),
    workflow: { goal, step: workflow.step, trajectoryStage: workflow.stage },
    tab: resolved.tab ?? 'lab',
    ensemble: {
      count,
      spec: {
        variable: pick('perturbationVar', 'th1') as EnsemblePerturbationSpec['variable'],
        pattern: pick('perturbationPattern', 'alternating') as EnsemblePerturbationSpec['pattern'],
        epsilon: Number(raw.epsilon ?? raw.deltaTheta ?? pick('epsilon', '0.0001')),
        seed: Number(pick('perturbationSeed', '1'))
      }
    },
    inheritedDefaults: defaults
  };
}

/** The native perturbation rule owns every member's exact floating-point input.
 * The adapter preserves all requested members rather than silently quality-capping the archive. */
export function legacyEnsembleEntries(source: ExperimentStateV1, settings: LegacyLinkConsumerSettings['ensemble']) {
  if (!Number.isSafeInteger(settings.count) || settings.count < 0 || settings.count > 80)
    throw new Error('근접 궤적 수는0–80 정수여야 합니다.');
  const spec = settings.spec;
  if (
    !PERTURBATION_VARIABLES.includes(spec.variable) ||
    !PERTURBATION_PATTERNS.includes(spec.pattern) ||
    !Number.isFinite(spec.epsilon) ||
    spec.epsilon < 1e-7 ||
    spec.epsilon > 1e-2 ||
    !Number.isInteger(spec.seed) ||
    spec.seed < 0 ||
    spec.seed > 0xffff_ffff
  )
    throw new Error('명시적인 섭동 변수·pattern·epsilon·uint32 seed가 필요합니다. 보정하지 않았습니다.');
  const triple = source.systemId === 'system:triple';
  const parsed = triple ? fromCanonicalChain(source) : fromCanonicalPlanar(source);
  if (!parsed.ok) throw new Error(parsed.issues.map((i) => i.message).join(' '));
  const config = parsed.value;
  const members = buildPerturbedStates(
    config.initialState,
    config.initialState.length,
    settings.count,
    settings.count,
    triple ? 'triple' : source.systemId === 'system:compound-double' ? 'compound-double' : 'double',
    settings.spec
  ).members;
  const entries = [{ sourceId: 'reference', experiment: structuredClone(source) }];
  members.forEach((member, index) => {
    const next = triple
      ? toCanonicalChain({
          ...config,
          initialState: Array.from(member)
        } as import('../adapters/physics/chain').ChainConfig)
      : toCanonicalPlanar({
          ...(config as import('../adapters/physics/planar').PlanarConfig),
          initialState: [member[0]!, member[1]!, member[2]!, member[3]!]
        });
    if (!next.ok) throw new Error(`근접 궤적${index + 1}: ${next.issues.map((i) => i.message).join(' ')}`);
    entries.push({
      sourceId: `perturbed-${index + 1}`,
      experiment: {
        ...next.value,
        provenance: {
          createdByVersion: 'legacy-ensemble-v1',
          source: { kind: 'derived', id: `perturbed-${index + 1}` },
          parentExperimentIds: source.provenance?.source.id ? [source.provenance.source.id] : []
        }
      }
    });
  });
  return entries;
}
