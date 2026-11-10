import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { ContractResult } from '../../contracts/validation';
import { PERTURBATION_PATTERNS, PERTURBATION_VARIABLES } from '../../../app/ensemblePerturbation';
import { legacyEnsembleEntries, type LegacyLinkConsumerSettings } from '../../persistence/legacy-link-consumer';
import { createProductSetupRoute } from '../../persistence/share-route';
import { PRODUCT_SETUP_SCHEMA, validateProductSetup, serializeProductSetup } from '../../persistence/product-setup';
import type { PlaybackSettings } from './playback-clock';
import type { NativeDisplayOptions } from './native-display';
import { createLegacyWorkflow } from './legacy-workflow';
import { createLegacyNavigation } from './legacy-navigation';
import { createLegacyRunListPanel } from '../experiments/legacy-run-list-panel';
import { createSetupFileControl } from '../../persistence/product-setup-file-control';

export const DEFAULT_CURRENT_ENSEMBLE: LegacyLinkConsumerSettings['ensemble'] = {
  count: 0,
  spec: { variable: 'th1', pattern: 'alternating', epsilon: 1e-4, seed: 1 }
};
export interface NativeSetupPanelOptions {
  experiment(): ContractResult<ExperimentStateV1>;
  canUse(): boolean;
  playback(): PlaybackSettings;
  render(): NativeDisplayOptions;
  angleUnit(): 'rad' | 'deg';
  initial?: Pick<LegacyLinkConsumerSettings, 'ensemble' | 'workflow'> | undefined;
}
/** Fresh and imported Lab configurations share the same exact native rule.
 * Every prepared list is an immutable snapshot of current physical inputs. */
export function createNativeSetupPanel(document: Document, options: NativeSetupPanelOptions) {
  const root = element(document, 'details', 'lab-details');
  root.id = 'native-setup';
  root.append(element(document, 'summary', '', '근접 궤적 · 목표 · 전체 설정 공유'));
  root.style.minWidth = '0';
  const initial = options.initial ?? {
    ensemble: DEFAULT_CURRENT_ENSEMBLE,
    workflow: { goal: 'sensitive-dependence', step: 'choose', trajectoryStage: 'reference' }
  };
  const fields = element(document, 'div', 'lab-inspector-grid');
  function input(id: string, title: string, value: number, min: number, max: number, step: string) {
    const label = element(document, 'label', 'ds-field__label', title);
    label.htmlFor = id;
    const control = element(document, 'input', 'ds-field__control');
    Object.assign(control, { id, type: 'number', value: String(value), min: String(min), max: String(max), step });
    fields.append(label, control);
    return control;
  }
  function select(id: string, title: string, choices: readonly string[], value: string) {
    const label = element(document, 'label', 'ds-field__label', title);
    label.htmlFor = id;
    const control = element(document, 'select', 'ds-field__control');
    control.id = id;
    for (const value of choices) {
      const option = element(document, 'option', '', value);
      option.value = value;
      control.append(option);
    }
    control.value = value;
    fields.append(label, control);
    return control;
  }
  const count = input('setup-ensemble-count', '근접 궤적 개수', initial.ensemble.count, 0, 80, '1');
  const source = readExperiment();
  const variable = select(
    'setup-perturbation-variable',
    '섭동할 좌표',
    PERTURBATION_VARIABLES.filter((v) => source.systemId === 'system:triple' || !['th3', 'iw3'].includes(v)),
    initial.ensemble.spec.variable
  );
  const pattern = select(
    'setup-perturbation-pattern',
    '섭동 분포',
    PERTURBATION_PATTERNS,
    initial.ensemble.spec.pattern
  );
  const epsilon = input(
    'setup-perturbation-epsilon',
    '섭동 ε (각도 rad 또는 각속도 rad/s)',
    initial.ensemble.spec.epsilon,
    1e-7,
    1e-2,
    'any'
  );
  const seed = input('setup-perturbation-seed', '섭동 uint32 seed', initial.ensemble.spec.seed, 0, 0xffff_ffff, '1');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  const status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const host = element(document, 'div', '');
  let queue: ReturnType<typeof createLegacyRunListPanel> | undefined;
  const urls = new Set<string>();
  function readExperiment() {
    const checked = options.experiment();
    if (!checked.ok) throw new Error(checked.issues.map((i) => i.message).join(' '));
    return checked.value;
  }
  function ensemble(): LegacyLinkConsumerSettings['ensemble'] {
    if ([count, epsilon, seed].some((control) => !control.value.trim()))
      throw new Error('개수·ε·seed를 모두 명시하세요. 빈 입력을0으로 바꾸지 않았습니다.');
    return {
      count: Number(count.value),
      spec: {
        variable: variable.value as LegacyLinkConsumerSettings['ensemble']['spec']['variable'],
        pattern: pattern.value as LegacyLinkConsumerSettings['ensemble']['spec']['pattern'],
        epsilon: Number(epsilon.value),
        seed: Number(seed.value)
      }
    };
  }
  function prepare(requested = ensemble().count) {
    if (!options.canUse()) throw new Error('현재 물리 실행과 분석을 먼저 멈추세요.');
    const entries = legacyEnsembleEntries(readExperiment(), { ...ensemble(), count: requested });
    const next = createLegacyRunListPanel(document, entries);
    queue?.dispose();
    queue = next;
    host.replaceChildren(next.element);
    (next.element as HTMLDetailsElement).open = true;
    error.textContent = '';
    status.textContent = `현재 조건의 기준1개와 근접 궤적${entries.length - 1}개를 준비했습니다. 계산은 목록에서 직접 시작하세요. 조건 편집 후 목록을 다시 준비해야 새 값이 적용됩니다.`;
  }
  const navigation = createLegacyNavigation(
    document,
    'lab',
    {
      compare: () => prepare(Math.max(1, ensemble().count)),
      expansion() {
        status.textContent = '확장 suite 입력은 Lab 라이브러리의 기존 데이터 가져오기에서 별도로 확인하세요.';
      }
    },
    'current-setup-navigation'
  );
  navigation.element.hidden = true;
  const workflow = createLegacyWorkflow(
    document,
    readExperiment,
    {
      ...initial,
      playback: {},
      tab: 'lab',
      inheritedDefaults: []
    },
    prepare,
    (tab) => navigation.open(tab),
    { idPrefix: 'current-workflow', ensemble }
  );
  function setup() {
    if (!options.canUse()) throw new Error('현재 실행과 분석을 멈추고 입력 오류를 확인한 뒤 공유하세요.');
    const checked = validateProductSetup({
      schema: PRODUCT_SETUP_SCHEMA,
      experiment: readExperiment(),
      controls: {
        angleUnit: options.angleUnit(),
        playback: options.playback(),
        render: options.render(),
        ensemble: ensemble(),
        workflow: workflow.settings()
      }
    });
    if (!checked.ok) throw new Error(checked.issues.map((i) => i.message).join(' '));
    return checked.value;
  }
  function shareRoute() {
    try {
      return createProductSetupRoute(setup());
    } catch (cause) {
      return {
        ok: false as const,
        issues: [
          {
            code: 'invalid-current-setup',
            path: '$',
            message: cause instanceof Error ? cause.message : '현재 설정을 확인하세요.',
            recovery: 'keep-original' as const
          }
        ]
      };
    }
  }
  const share = element(document, 'a', 'ds-button ds-button--secondary', '전체 설정 공유 링크 열기');
  share.hidden = true;
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(
    createButton(document, {
      label: '현재 기준·근접 궤적 목록 준비',
      onClick() {
        try {
          prepare();
        } catch (cause) {
          error.textContent = cause instanceof Error ? cause.message : '조건을 확인하세요.';
        }
      }
    }),
    createButton(document, {
      label: '전체 설정 공유 링크 만들기',
      variant: 'secondary',
      onClick() {
        const route = shareRoute();
        if (!route.ok) {
          error.textContent = route.issues.map((i) => i.message).join(' ');
          return;
        }
        const url = new URL(document.defaultView!.location.href);
        url.search = '';
        url.hash = route.value;
        share.href = url.href;
        share.hidden = false;
        error.textContent = '';
      }
    }),
    createButton(document, {
      label: '전체 설정 JSON 다운로드',
      variant: 'secondary',
      onClick() {
        try {
          const serialized = serializeProductSetup(setup());
          if (!serialized.ok) throw new Error(serialized.issues.map((i) => i.message).join(' '));
          const url = URL.createObjectURL(new Blob([serialized.value], { type: 'application/json' }));
          urls.add(url);
          const a = element(document, 'a', '');
          a.href = url;
          a.download = 'pendulum-product-setup.json';
          a.click();
          setTimeout(() => {
            URL.revokeObjectURL(url);
            urls.delete(url);
          }, 1000);
          error.textContent = '';
        } catch (cause) {
          error.textContent = cause instanceof Error ? cause.message : '설정을 내려받지 못했습니다.';
        }
      }
    }),
    share
  );
  const files = createSetupFileControl(document, options.canUse);
  root.append(
    fields,
    element(
      document,
      'p',
      'lab-muted',
      '네 가지 분포는 기존 buildPerturbedStates를 그대로 사용합니다. normalized는 각도와 각속도를 섞는 좌표 유클리드 규칙이며 단위 불변 물리 거리가 아닙니다. 전체 설정 공유에는 현재 SI 조건·요청 재생 예산·표시·섭동·관찰 단계가 포함되며 기록·과거 결과·원문 URL·메모·오디오 활성화는 포함되지 않습니다.'
    ),
    actions,
    error,
    status,
    workflow.element,
    navigation.element,
    files.element,
    host
  );
  root.addEventListener('input', () => {
    share.hidden = true;
  });
  root.addEventListener('change', () => {
    share.hidden = true;
  });
  return {
    element: root,
    setup,
    shareRoute,
    update() {
      // A prepared list is deliberately independent of later main-run edits.
      share.hidden = true;
    },
    dispose() {
      queue?.dispose();
      workflow.dispose();
      navigation.dispose();
      files.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
