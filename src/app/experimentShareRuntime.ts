import { integratorRegistry } from '../physics/integratorRegistry';
import { APP_VERSION } from '../runtime/version';
import type { IntegratorId } from '../types/domain';
import { currentAudienceMode, type AudienceMode } from './audienceMode';
import { commitLabControls } from './controlCommit';
import { NUMERIC_CONTROL_IDS } from './deepLinkControls';
import {
  normalizePerturbationVariableForSystem,
  PERTURBATION_PATTERNS,
  PERTURBATION_VARIABLES
} from './ensemblePerturbation';
import { experimentRecipe, type ExperimentGoal } from './experimentRecipes';
import {
  ANGLE_UNITS,
  basePayload,
  decodeSharedExperiment,
  diag,
  encodeSharedExperiment,
  EXPERIMENT_GOALS,
  HASH_PREFIX,
  MAX_SHARE_URL_LENGTH,
  PACKAGE_NAME,
  PHASES,
  PHYSICS_SCHEMA,
  pick,
  QUALITY,
  sanitizeVersioned,
  SHA,
  SHARE_URL_WARNING_LENGTH,
  TABS,
  TIMING,
  TRAILS,
  UINT32_MAX
} from './experimentShareCodec';
import {
  type SharedExperimentDiagnostic,
  type SharedExperimentPayload,
  type SharedExperimentRestoreResult,
  type SharedExperimentUrlDiagnostics,
  type SharedExperimentV2,
  type SharedExperimentV3,
  type SharedExperimentV4
} from './experimentShareTypes';
import {
  TRAJECTORY_STAGES,
  WORKFLOW_STEPS,
  type ExperimentWorkflowStep,
  type TrajectoryStage
} from './experimentWorkflowContract';
import { normalizeGoalWorkflowState } from './experimentWorkflowPolicy';
import { epsilonCanonicalValue, precisionCanonicalValue, setEpsilonCanonicalValue } from './precisionControls';

const SUPERSEDED_HANDOFF_PARAMS = [
  'mode',
  'goal',
  'preset',
  'tab',
  'system',
  'sysType',
  'experiment',
  'experimentSchema',
  'workflowStep',
  'trajectoryStage',
  'angleUnit',
  'perturbationVar',
  'perturbationPattern',
  'perturbationSeed',
  'deltaTheta',
  'epsilon',
  'ensembleCount',
  'ensN',
  'ensEps',
  'ensVariable',
  'ensPattern',
  'ensSeed',
  'w1',
  'w2',
  'method',
  'tol',
  'seed',
  'timeMode',
  'trailMode',
  'trailLen',
  'phaseAxis',
  'qualityMode',
  'glowMode',
  'longExpose',
  'interpolateRender',
  'autoQual',
  'audioOn',
  'backgroundSim',
  ...NUMERIC_CONTROL_IDS
] as const;

export function diagnoseExperimentShareUrl(value: URL | string): SharedExperimentUrlDiagnostics {
  const length = String(value).length;
  const common = { length, warningLength: SHARE_URL_WARNING_LENGTH, maximumLength: MAX_SHARE_URL_LENGTH };
  if (length > MAX_SHARE_URL_LENGTH)
    return {
      status: 'rejected',
      ...common,
      diagnostics: [diag('error', 'url-too-long', `Shared setup URL exceeds ${MAX_SHARE_URL_LENGTH} characters.`)]
    };
  if (length > SHARE_URL_WARNING_LENGTH)
    return {
      status: 'warning',
      ...common,
      diagnostics: [
        diag(
          'warning',
          'url-length-warning',
          `The ${length}-character URL may be unreliable in QR codes, LMS tools, or messaging apps.`
        )
      ]
    };
  return { status: 'portable', ...common, diagnostics: [] };
}

export function experimentShareUrl(
  href: string,
  payload: SharedExperimentPayload,
  audience: AudienceMode,
  locale: 'en' | 'ko'
): URL {
  const url = new URL(href);
  for (const name of SUPERSEDED_HANDOFF_PARAMS) url.searchParams.delete(name);
  url.searchParams.set('audience', audience);
  url.searchParams.set('lang', locale);
  url.hash = encodeSharedExperiment(payload);
  const length = diagnoseExperimentShareUrl(url);
  if (length.status === 'rejected')
    throw new RangeError(`Shared setup URL is too long: ${length.diagnostics[0]?.message ?? 'safety limit exceeded.'}`);
  return url;
}

export function sharedControlNumber(id: string, fallback: number): number {
  const input = document.getElementById(id) as HTMLInputElement | null;
  const value =
    id === 'ensEps'
      ? epsilonCanonicalValue(input, fallback)
      : input?.type === 'range' && input.dataset.precisionKeyboardStep !== undefined
        ? precisionCanonicalValue(input, fallback)
        : Number.parseFloat(input?.value ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function selected<T extends string>(id: string, allowed: readonly T[], fallback: T): T {
  const value = (document.getElementById(id) as HTMLSelectElement | null)?.value;
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

function checked(id: string, fallback: boolean): boolean {
  const input = document.getElementById(id) as HTMLInputElement | null;
  return typeof input?.checked === 'boolean' ? input.checked : fallback;
}

function sourceCommit(): string | null {
  const value = document.querySelector<HTMLMetaElement>('meta[name="pendulum-source-commit"]')?.content ?? '';
  return SHA.test(value) ? value : null;
}

export function captureSharedExperiment(): SharedExperimentV4 {
  const methodValue = (document.getElementById('method') as HTMLSelectElement | null)?.value ?? 'rk4';
  const system = selected('sysType', ['double', 'compound-double', 'triple'], 'double');
  const seed = sharedControlNumber('seed', Number.NaN);
  const panel = document.querySelector<HTMLElement>('.tabpanel.active');
  const goal = selected('experimentGoal', EXPERIMENT_GOALS, 'sensitive-dependence') as ExperimentGoal;
  const recipe = experimentRecipe(goal);
  const workflow = normalizeGoalWorkflowState(
    recipe,
    selected('workflowStep', WORKFLOW_STEPS, 'choose') as ExperimentWorkflowStep,
    selected('trajectoryStage', TRAJECTORY_STAGES, 'reference') as TrajectoryStage
  );
  return basePayload(
    {
      system,
      method: Object.hasOwn(integratorRegistry, methodValue) ? (methodValue as IntegratorId) : 'rk4',
      dt: sharedControlNumber('dt', 0.003),
      damping: sharedControlNumber('gamma', 0),
      toleranceExponent: sharedControlNumber('tol', -6),
      parameters: {
        m1: sharedControlNumber('m1', 1),
        m2: sharedControlNumber('m2', 1),
        m3: sharedControlNumber('m3', 1),
        l1: sharedControlNumber('l1', 1.2),
        l2: sharedControlNumber('l2', 1),
        l3: sharedControlNumber('l3', 0.8),
        g: sharedControlNumber('g', 9.81)
      },
      initial: {
        theta: [sharedControlNumber('th1', 2), sharedControlNumber('th2', 2.5), sharedControlNumber('th3', 1)],
        omega: [sharedControlNumber('iw1', 0), sharedControlNumber('iw2', 0), sharedControlNumber('iw3', 0)]
      }
    },
    pick(panel?.id.startsWith('tab-') ? panel.id.slice(4) : 'lab', TABS, 'lab', 'tab', new Set()),
    {
      packageName: PACKAGE_NAME,
      packageVersion: APP_VERSION,
      physicsVersion: APP_VERSION,
      physicsSchema: PHYSICS_SCHEMA,
      sourceCommit: sourceCommit()
    },
    {
      seed: Number.isSafeInteger(seed) && seed >= 0 && seed <= UINT32_MAX ? seed : null,
      timingMode: selected('timeMode', TIMING, 'wall-clock'),
      speed: sharedControlNumber('speed', 1),
      stepsPerFrame: sharedControlNumber('spf', 6),
      ensemble: recipe.perturbation.count
        ? {
            // Preserve the configured final ensemble size even while the current
            // progression stage intentionally renders zero or one nearby path.
            count: Math.max(
              2,
              Math.round(sharedControlNumber('ensembleRequestedCount', sharedControlNumber('ensN', 12)))
            ),
            epsilon: sharedControlNumber('ensEps', 1e-4),
            variable: normalizePerturbationVariableForSystem(
              selected('ensVariable', PERTURBATION_VARIABLES, 'th1'),
              system
            ),
            pattern: selected('ensPattern', PERTURBATION_PATTERNS, 'alternating'),
            seed: Math.max(0, Math.min(UINT32_MAX, Math.round(sharedControlNumber('ensSeed', 1))))
          }
        : null
    },
    {
      trailMode: selected('trailMode', TRAILS, 'rainbow'),
      trailLength: sharedControlNumber('trailLen', 1200),
      phaseAxis: selected('phaseAxis', PHASES, '1'),
      qualityMode: selected('qualityMode', QUALITY, 'balanced'),
      glow: checked('glowMode', false),
      longExposure: checked('longExpose', false),
      interpolate: checked('interpolateRender', true),
      autoQuality: checked('autoQual', true)
    },
    { angleUnit: selected('angleUnit', ANGLE_UNITS, 'rad') },
    {
      goal,
      step: workflow.step,
      trajectoryStage: workflow.stage
    }
  );
}

type Control = {
  value?: string;
  checked?: boolean;
  options?: ArrayLike<{ value: string }>;
  type?: string;
  dataset?: Record<string, string | undefined>;
};

const FORMATS: Record<string, (value: string) => string> = {
  th1: (v) => Number(v).toFixed(3),
  th2: (v) => Number(v).toFixed(3),
  th3: (v) => Number(v).toFixed(3),
  iw1: (v) => Number(v).toFixed(1),
  iw2: (v) => Number(v).toFixed(1),
  iw3: (v) => Number(v).toFixed(1),
  m1: (v) => Number(v).toFixed(2),
  m2: (v) => Number(v).toFixed(2),
  m3: (v) => Number(v).toFixed(2),
  l1: (v) => Number(v).toFixed(2),
  l2: (v) => Number(v).toFixed(2),
  l3: (v) => Number(v).toFixed(2),
  g: (v) => Number(v).toFixed(2),
  gamma: (v) => Number(v).toFixed(2),
  dt: (v) => Number(v).toFixed(4),
  tol: (v) => `1.0e${v}`,
  speed: (v) => `${Number(v).toFixed(1)}×`,
  spf: String,
  trailLen: String,
  ensN: String,
  ensEps: (v) => Number(v).toExponential(3)
};

function applyValue(
  id: string,
  value: string | number,
  applied: Set<string>,
  changed: Set<string>,
  skipped: Set<string>
): void {
  const control = document.getElementById(id) as Control | null;
  const next = String(value);
  if (
    !control ||
    typeof control.value !== 'string' ||
    (control.options?.length && !Array.from(control.options).some((option) => option.value === next))
  ) {
    skipped.add(id);
    return;
  }
  applied.add(id);
  if (id === 'ensEps') {
    const epsilon = Number(value);
    const exponent = Math.log10(epsilon);
    if (!Number.isFinite(epsilon) || epsilon <= 0 || !Number.isFinite(exponent)) {
      skipped.add(id);
      applied.delete(id);
      return;
    }
    const current = epsilonCanonicalValue(control as HTMLInputElement, 1e-4);
    if (!Object.is(current, epsilon)) changed.add(id);
    setEpsilonCanonicalValue(control as HTMLInputElement, epsilon);
    const output = document.getElementById(`${id}V`);
    if (output && FORMATS[id]) output.textContent = FORMATS[id]!(String(epsilon));
    return;
  }
  if (control.value !== next) changed.add(id);
  if (control.type === 'range' && control.dataset?.precisionKeyboardStep !== undefined)
    control.dataset.precisionCanonical = next;
  control.value = next;
  const output = document.getElementById(`${id}V`);
  if (output && FORMATS[id]) output.textContent = FORMATS[id]!(next);
}

function applyChecked(
  id: string,
  value: boolean,
  applied: Set<string>,
  changed: Set<string>,
  skipped: Set<string>
): void {
  const control = document.getElementById(id) as Control | null;
  if (!control || typeof control.checked !== 'boolean') {
    skipped.add(id);
    return;
  }
  applied.add(id);
  if (control.checked !== value) changed.add(id);
  control.checked = value;
}

/** Populate controls atomically, then emit exactly one semantic Lab commit and no native input storm. */
export function restoreSharedExperiment(
  payload: SharedExperimentV2 | SharedExperimentV3 | SharedExperimentV4
): SharedExperimentRestoreResult {
  if (typeof document === 'undefined')
    return {
      ok: false,
      appliedControlIds: [],
      changedControlIds: [],
      skippedControlIds: [],
      diagnostics: [diag('error', 'document-unavailable', 'Shared setup restoration requires a document.')]
    };
  const diagnostics: SharedExperimentDiagnostic[] = [];
  const setup = sanitizeVersioned(payload as unknown as Record<string, unknown>, diagnostics, payload.v);
  const applied = new Set<string>(),
    changed = new Set<string>(),
    skipped = new Set<string>();
  const set = (id: string, value: string | number) => applyValue(id, value, applied, changed, skipped);
  const p = setup.physics;
  [
    ['sysType', p.system],
    ['method', p.method],
    ['dt', p.dt],
    ['gamma', p.damping],
    ['tol', p.toleranceExponent]
  ].forEach(([id, value]) => set(id as string, value!));
  Object.entries(p.parameters).forEach(([id, value]) => set(id, value));
  p.initial.theta.forEach((value, index) => set(`th${index + 1}`, value));
  p.initial.omega.forEach((value, index) => set(`iw${index + 1}`, value));
  const executionValues: [string, string | number | null][] = [
    ['seed', setup.execution.seed],
    ['timeMode', setup.execution.timingMode],
    ['speed', setup.execution.speed],
    ['spf', setup.execution.stepsPerFrame],
    ['ensembleRequestedCount', setup.execution.ensemble?.count ?? null],
    [
      'ensN',
      setup.workflow.trajectoryStage === 'reference'
        ? 0
        : setup.workflow.trajectoryStage === 'perturbed'
          ? 1
          : (setup.execution.ensemble?.count ?? null)
    ],
    ['ensEps', setup.execution.ensemble?.epsilon ?? null],
    ['ensVariable', setup.execution.ensemble?.variable ?? null],
    ['ensPattern', setup.execution.ensemble?.pattern ?? null],
    ['ensSeed', setup.execution.ensemble?.seed ?? null],
    ['angleUnit', setup.preferences.angleUnit],
    ['experimentGoal', setup.workflow.goal],
    ['workflowStep', setup.workflow.step],
    ['trajectoryStage', setup.workflow.trajectoryStage]
  ];
  executionValues.forEach(([id, value]) => {
    if (value !== null) set(id, value);
  });
  if (setup.render) {
    [
      ['trailMode', setup.render.trailMode],
      ['trailLen', setup.render.trailLength],
      ['phaseAxis', setup.render.phaseAxis],
      ['qualityMode', setup.render.qualityMode]
    ].forEach(([id, value]) => set(id as string, value!));
    [
      ['glowMode', setup.render.glow],
      ['longExpose', setup.render.longExposure],
      ['interpolateRender', setup.render.interpolate],
      ['autoQual', setup.render.autoQuality]
    ].forEach(([id, value]) => applyChecked(id as string, value as boolean, applied, changed, skipped));
  }
  if (skipped.size)
    diagnostics.push(
      diag(
        'warning',
        'control-unavailable',
        'Some controls are unavailable in this build and were left unchanged.',
        skipped
      )
    );
  if (applied.size) commitLabControls('deep-link', changed);
  const shell =
    typeof window === 'undefined'
      ? undefined
      : (window as Window & { __modernShell?: { switchTo(name: string): void } }).__modernShell;
  if (shell) shell.switchTo(setup.tab);
  else diagnostics.push(diag('warning', 'tab-unavailable', 'The shared tab could not be activated yet.'));
  return {
    ok: applied.size > 0,
    appliedControlIds: [...applied],
    changedControlIds: [...changed],
    skippedControlIds: [...skipped],
    diagnostics
  };
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const area = document.createElement('textarea');
  area.value = value;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function notify(message: string, duration = 2_800): void {
  const toast = (window as Window & { toast?: unknown }).toast;
  if (typeof toast === 'function') {
    (toast as (text: string, timeout?: number) => void)(message, duration);
    return;
  }
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  window.setTimeout(() => box.classList.remove('show'), duration);
}

const localized = (en: string, ko: string) => (document.documentElement.lang === 'ko' ? ko : en);

export function installExperimentShare(): void {
  if (typeof document === 'undefined') return;
  const restoreHash = () => {
    if (!location.hash.startsWith(HASH_PREFIX)) return;
    const decoded = decodeSharedExperiment(location.hash);
    if (!decoded.ok || !decoded.payload) {
      notify(
        localized('Shared setup is invalid or unsupported.', '공유 설정 링크가 잘못되었거나 지원되지 않습니다.'),
        4_200
      );
      return;
    }
    const restored = restoreSharedExperiment(decoded.payload);
    const warned = [...decoded.diagnostics, ...restored.diagnostics].some((item) => item.severity !== 'info');
    notify(
      restored.ok
        ? localized(
            warned
              ? 'Shared setup restored with warnings; results were not included.'
              : 'Shared setup restored; results were not included.',
            warned
              ? '경고와 함께 공유 설정을 복원했습니다. 결과는 포함되지 않았습니다.'
              : '공유 설정을 복원했습니다. 결과는 포함되지 않았습니다.'
          )
        : localized('Shared setup controls are unavailable.', '공유 설정 컨트롤을 사용할 수 없습니다.'),
      warned ? 4_200 : 2_800
    );
  };
  restoreHash();
  window.addEventListener('hashchange', restoreHash);
  const button = document.getElementById('shareUrl') as HTMLButtonElement | null;
  if (!button || button.dataset.shareBound === '1') return;
  button.dataset.shareBound = '1';
  button.dataset.testid = 'share-experiment';
  button.addEventListener('click', () => {
    const locale = document.documentElement.lang === 'ko' ? 'ko' : 'en';
    let url: URL;
    try {
      url = experimentShareUrl(location.href, captureSharedExperiment(), currentAudienceMode(), locale);
    } catch {
      notify(
        localized('Setup link is too long to share safely.', '설정 링크가 너무 길어 안전하게 공유할 수 없습니다.'),
        4_200
      );
      return;
    }
    const length = diagnoseExperimentShareUrl(url);
    history.replaceState(history.state, '', url);
    void copyText(url.href)
      .then(() =>
        notify(
          localized(
            length.status === 'warning'
              ? 'Setup link copied, but it may be too long for QR/LMS tools. Results are not included.'
              : 'Setup-only link copied; results are not included.',
            length.status === 'warning'
              ? '설정 링크를 복사했지만 QR/LMS에서 너무 길 수 있습니다. 결과는 포함되지 않습니다.'
              : '설정 전용 링크를 복사했습니다. 결과는 포함되지 않습니다.'
          ),
          length.status === 'warning' ? 4_200 : 2_800
        )
      )
      .catch(() =>
        notify(
          localized(
            'Setup-only link created in the address bar; results are not included.',
            '주소창에 설정 전용 링크를 만들었습니다. 결과는 포함되지 않습니다.'
          )
        )
      );
  });
}
