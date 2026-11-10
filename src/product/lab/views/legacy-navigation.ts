import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import { commandAnalysisTarget } from '../../app/command-index';

export interface LegacyDestination {
  readonly label: string;
  readonly tab?: 'workspace' | 'analysis' | 'tray';
  readonly section?: string;
  readonly analysis?: string;
  readonly batch?: string;
  readonly route?: string;
  readonly action?: 'compare' | 'expansion' | 'validation';
}
/** An old tab carries its destination intent, not the tab's unsaved private controls. */
export const LEGACY_DESTINATIONS: Readonly<Record<string, LegacyDestination>> = {
  lab: { label: '작업 공간', tab: 'workspace' },
  compare: { label: '기준·근접 궤적 비교', action: 'compare' },
  lyap: { label: 'Lyapunov 분석', analysis: 'analysis:lyapunov' },
  sweep: { label: '매개변수 sweep', batch: 'grid' },
  bifurc: { label: '분기·연속추적', analysis: 'analysis:continuation' },
  phase3d: { label: '3D 위상공간', tab: 'workspace', section: 'native-phase-space' },
  density: { label: '위상 방문 누적', tab: 'workspace', section: 'native-phase-density' },
  expansion: { label: '확장 모델 전체 suite', action: 'expansion' },
  matrix: { label: '실험 조건·결과 행렬', batch: 'grid' },
  validate: { label: '수치 검증', action: 'validation' },
  golden: { label: '기준 수치 검증', action: 'validation' },
  zeroone: { label: '0–1 chaos test', analysis: 'analysis:zero-one' },
  clv: { label: '공변 Lyapunov 벡터', analysis: 'analysis:clv' },
  basin: { label: '인력권 분석', analysis: 'analysis:basin' },
  rqa: { label: '재귀 정량화', analysis: 'analysis:rqa' },
  ftle: { label: '유한시간 Lyapunov', analysis: 'analysis:ftle' },
  architecture: { label: '실행 backend와 구조', tab: 'analysis', section: 'runtime-acceleration' },
  research: { label: '연구 프로젝트', tab: 'analysis', section: 'research-project-workflow' },
  lab3d: { label: '3D 구속 진자', route: '#/lab/spherical-chain' },
  canonical: { label: '정준 좌표 진단', tab: 'analysis', section: 'structure-diagnostics' },
  aplus: { label: '추가 수치 검증', action: 'validation' },
  docs: { label: '배우기 문서', route: '#/learn' },
  theory: { label: '식과 이론', route: '#/learn' }
};

export function createLegacyNavigation(
  document: Document,
  initialTab: string,
  options: { compare(): void; expansion(): void },
  id = 'legacy-navigation'
) {
  const root = element(document, 'section', 'ds-section');
  root.id = id;
  root.append(element(document, 'h3', '', '이전 링크의 이동 목적'));
  const status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const output = element(document, 'pre', 'core-result-json');
  let observer: MutationObserver | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    disposed = false;
  const urls = new Set<string>();
  function clear() {
    observer?.disconnect();
    observer = undefined;
    clearTimeout(timer);
    timer = undefined;
  }
  function reveal(target: LegacyDestination) {
    clear();
    const choice = target.analysis ? commandAnalysisTarget(target.analysis) : null;
    const tab = target.batch ? 'tray' : (target.tab ?? 'analysis');
    const sectionId = choice?.container ?? (target.batch ? 'batch-experiments' : target.section);
    const selector = choice?.select ?? (target.batch ? 'batch-kind' : '');
    const kind = choice?.kind ?? target.batch;
    const apply = () => {
      const button = document.getElementById(`lab-panels-tab-${tab}`) as HTMLButtonElement | null;
      if (!button) return;
      if (button.getAttribute('aria-selected') !== 'true') button.click();
      if (!sectionId) {
        clear();
        status.textContent = `${target.label}을 열었습니다.`;
        return;
      }
      const section = document.getElementById(sectionId);
      if (!section) return;
      if (section.tagName === 'DETAILS') (section as HTMLDetailsElement).open = true;
      if (selector) {
        const select = document.getElementById(selector) as HTMLSelectElement | null;
        if (!select || ![...select.options].some((option) => option.value === kind)) return;
        clear();
        select.value = kind!;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.focus();
      } else {
        clear();
        const heading = section.querySelector<HTMLElement>('summary,h2,h3,h4') ?? section;
        heading.tabIndex = heading.tagName === 'SUMMARY' ? 0 : -1;
        heading.focus();
        heading.scrollIntoView?.({ block: 'nearest' });
      }
      status.textContent = `${target.label}을 열었습니다. 계산은 해당 도구에서 직접 시작하세요.`;
    };
    observer = new MutationObserver(apply);
    observer.observe(document.getElementById('product-main') ?? document.body, { childList: true, subtree: true });
    timer = setTimeout(() => {
      clear();
      if (!disposed)
        status.textContent = '현재 시스템에서 이 도구를 열지 못했습니다. 원본 tab 값은 전체 호환 설정에 보존됩니다.';
    }, 15000);
    apply();
  }
  async function runValidation() {
    try {
      status.textContent = '독립 수치 검증을 실행합니다.';
      const { runAllValidationChecks } = await import('../../../validation/validationSuite');
      if (disposed) return;
      const report = runAllValidationChecks();
      output.textContent = JSON.stringify(report, null, 2);
      status.textContent =
        '수치 검증 보고서를 만들었습니다. 보고서에 명시한 범위의 자동 검증이며 사람 검토나 모든 모델의 인증은 아닙니다.';
    } catch (cause) {
      if (!disposed) status.textContent = cause instanceof Error ? cause.message : '검증 보고서를 만들지 못했습니다.';
    }
  }
  const validation = createButton(document, {
    label: '수치 검증 실행',
    variant: 'secondary',
    onClick: () => void runValidation()
  });
  validation.hidden = true;
  const save = createButton(document, {
    label: '수치 검증 보고서 JSON 다운로드',
    variant: 'secondary',
    onClick() {
      if (!output.textContent) {
        status.textContent = '먼저 검증을 실행하세요.';
        return;
      }
      try {
        const url = URL.createObjectURL(new Blob([output.textContent], { type: 'application/json' }));
        urls.add(url);
        const a = element(document, 'a', '');
        a.href = url;
        a.download = 'pendulum-native-validation.json';
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
        }, 1000);
      } catch {
        status.textContent = '보고서를 내려받지 못했습니다. 화면의 결과는 유지됩니다.';
      }
    }
  });
  save.hidden = true;
  function open(tab: string) {
    const destination = Object.hasOwn(LEGACY_DESTINATIONS, tab) ? LEGACY_DESTINATIONS[tab] : undefined;
    if (!destination) {
      status.textContent = `보관한 tab=${tab}에 정의된 새 이동 목적이 없습니다. 원문은 유지됩니다.`;
      return;
    }
    status.textContent = `기존 tab=${tab} → ${destination.label}`;
    if (destination.route) {
      document.defaultView!.location.hash = destination.route;
      return;
    }
    if (destination.action === 'compare') {
      options.compare();
      return;
    }
    if (destination.action === 'expansion') {
      options.expansion();
      return;
    }
    if (destination.action === 'validation') {
      validation.hidden = false;
      save.hidden = false;
      validation.focus();
      return;
    }
    reveal(destination);
  }
  const destination = LEGACY_DESTINATIONS[initialTab];
  root.append(
    element(
      document,
      'p',
      'lab-muted',
      `기존 tab=${initialTab} · ${destination?.label ?? '별도 확인'}. URL에 들어 있지 않은 과거 탭의 입력·결과는 복원했다고 간주하지 않습니다.`
    ),
    createButton(document, {
      label: `이동 목적 열기 · ${destination?.label ?? initialTab}`,
      variant: 'secondary',
      onClick: () => open(initialTab)
    }),
    validation,
    save,
    status,
    output
  );
  return {
    element: root,
    open,
    dispose() {
      disposed = true;
      clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
