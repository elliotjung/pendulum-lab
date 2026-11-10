import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import { loadLegacyLinkSession } from '../../persistence/legacy-link-session';
import {
  legacyLinkConsumerSettings,
  legacyEnsembleEntries,
  type LegacyLinkConsumerSettings
} from '../../persistence/legacy-link-consumer';
import { serializeLegacyLinkCompatibility, type LegacyLinkCompatibilityV1 } from '../../persistence/legacy-link';
import { createLegacyRunListPanel } from '../experiments/legacy-run-list-panel';
import { createLegacyWorkflow } from './legacy-workflow';
import { createLegacyNavigation } from './legacy-navigation';

export interface LegacyLinkContext {
  envelope?: LegacyLinkCompatibilityV1;
  settings?: LegacyLinkConsumerSettings;
  warning: string;
  dispose(): void;
}
/** Resolve only the explicitly adopted product key, before quantity controls are created. */
export function prepareLegacyLinkContext(document: Document, experiment?: ExperimentStateV1): LegacyLinkContext {
  if (!experiment) return { warning: '', dispose() {} };
  try {
    const envelope = loadLegacyLinkSession(document.defaultView!.localStorage, experiment);
    if (!envelope) return { warning: '', dispose() {} };
    if (envelope.sourceKind === 'expansion')
      return { envelope, warning: '확장 suite의 전체 설정은 전용 native 실행 도구에서 확인하세요.', dispose() {} };
    const settings = legacyLinkConsumerSettings(envelope),
      previous = document.documentElement.dataset.productAngleUnit;
    if (settings.angleUnit) document.documentElement.dataset.productAngleUnit = settings.angleUnit;
    return {
      envelope,
      settings,
      warning: '',
      dispose() {
        if (settings.angleUnit) {
          if (previous === undefined) delete document.documentElement.dataset.productAngleUnit;
          else document.documentElement.dataset.productAngleUnit = previous;
        }
      }
    };
  } catch (cause) {
    return {
      warning: `보관한 호환 설정을 적용하지 못했습니다. 원본은 보존됩니다. ${cause instanceof Error ? cause.message : ''}`,
      dispose() {}
    };
  }
}

export function createLegacyLinkContextPanel(
  document: Document,
  context: LegacyLinkContext,
  experiment: ExperimentStateV1
) {
  const root = element(document, 'details', 'lab-details');
  root.id = 'legacy-link-context';
  root.append(element(document, 'summary', '', '이전 링크의 전체 전달 설정'));
  const envelope = context.envelope,
    settings = context.settings;
  let queue: ReturnType<typeof createLegacyRunListPanel> | undefined;
  let expansion:
    ReturnType<typeof import('../experiments/legacy-expansion-panel').createLegacyExpansionPanel> | undefined;
  let generation = 0,
    disposed = false;
  const urls = new Set<string>();
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  root.append(notice);
  if (!envelope || !settings) {
    notice.textContent = context.warning;
    root.hidden = !context.warning;
    return { element: root, dispose() {} };
  }
  root.open = true;
  notice.textContent =
    '원본의 물리 설정과 별도 표시·시간·workflow·섭동 규칙을 함께 보존했습니다. 목록 계산은 아래에서 직접 시작합니다. 가져온 과거 결과로 인증하지 않습니다.';
  const list = element(document, 'dl', 'product-detail-list');
  const entries: readonly [string, string][] = [
    ['원본', `${envelope.sourceKind} ${envelope.sourceVersion}`],
    ['기존 tab 목적', settings.tab],
    ['단계', `${settings.workflow.goal} / ${settings.workflow.step} / ${settings.workflow.trajectoryStage}`],
    [
      '근접 궤적',
      `${settings.ensemble.count}개 · ${settings.ensemble.spec.variable} · ${settings.ensemble.spec.pattern} · ε=${settings.ensemble.spec.epsilon} · seed=${settings.ensemble.spec.seed}`
    ],
    ['메타데이터', `기본값 ${envelope.declaredDefaults.length}개 / base 상속 ${envelope.inheritedFromBase.length}개`]
  ];
  for (const [key, value] of entries) list.append(element(document, 'dt', '', key), element(document, 'dd', '', value));
  const metadata = element(document, 'details', 'lab-details');
  metadata.append(
    element(document, 'summary', '', '원본 · 매핑 · provenance · 비활성 값 전체 보기'),
    element(document, 'pre', 'core-result-json', serializeLegacyLinkCompatibility(envelope))
  );
  const defaults = element(document, 'ul', '');
  for (const value of settings.inheritedDefaults) defaults.append(element(document, 'li', '', value));
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  const host = element(document, 'div', '');
  function prepareList(count: number) {
    generation++;
    expansion?.dispose();
    expansion = undefined;
    const entries = legacyEnsembleEntries(experiment, { ...settings!.ensemble, count });
    const next = createLegacyRunListPanel(document, entries);
    queue?.dispose();
    queue = next;
    host.replaceChildren(next.element);
    (next.element as HTMLDetailsElement).open = true;
    error.textContent = '';
  }
  async function prepareExpansion() {
    const pending = ++generation;
    try {
      const module = await import('../experiments/legacy-expansion-panel');
      if (disposed || pending !== generation) return;
      const next = module.createLegacyExpansionPanel(
        document,
        { model: 'driven' },
        { sourceText: envelope!.sourceText }
      );
      queue?.dispose();
      queue = undefined;
      expansion?.dispose();
      expansion = next;
      host.replaceChildren(next.element);
      (next.element as HTMLDetailsElement).open = true;
      notice.textContent =
        '이 링크에는 확장 suite의 별도 입력이 직렬화되어 있지 않습니다. 기존 구동 모델의 명시된 기본값을 표시했으며 계산은 직접 시작하세요. 원래 물리 설정은 이 화면과 전체 호환 설정에 유지됩니다.';
    } catch (cause) {
      if (!disposed && pending === generation)
        error.textContent = cause instanceof Error ? cause.message : '확장 도구를 불러오지 못했습니다.';
    }
  }
  const prepare = createButton(document, {
    label: '기준과 근접 궤적 조건 목록 준비',
    variant: 'secondary',
    onClick() {
      try {
        prepareList(settings.ensemble.count);
      } catch (cause) {
        error.textContent =
          cause instanceof Error ? cause.message : '조건 목록을 준비하지 못했습니다. 원본을 보존하세요.';
      }
    }
  });
  const download = createButton(document, {
    label: '원본과 전체 호환 설정 다운로드',
    variant: 'secondary',
    onClick() {
      try {
        const url = URL.createObjectURL(
          new Blob([serializeLegacyLinkCompatibility(envelope)], { type: 'application/json' })
        );
        urls.add(url);
        const a = element(document, 'a', '');
        a.href = url;
        a.download = 'pendulum-legacy-link-compatibility.json';
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
        }, 1000);
      } catch {
        error.textContent = '다운로드를 만들지 못했습니다. 전달 설정은 이 화면에 유지됩니다.';
      }
    }
  });
  const navigation = createLegacyNavigation(document, settings.tab, {
    compare: () => prepareList(Math.max(1, settings.ensemble.count)),
    expansion: () => void prepareExpansion()
  });
  const workflow = createLegacyWorkflow(document, experiment, settings, prepareList, (tab) => navigation.open(tab));
  root.append(list, defaults, prepare, download, error, navigation.element, workflow.element, host, metadata);
  if (settings.locale) {
    const locale = document.getElementById('product-locale') as HTMLSelectElement | null;
    if (locale) {
      locale.value = settings.locale;
      locale.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  return {
    element: root,
    dispose() {
      disposed = true;
      generation++;
      expansion?.dispose();
      navigation.dispose();
      queue?.dispose();
      workflow.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
