import { element } from './dom';
import { createButton } from '../design-system/primitives';

/** Publishing scripting APIs is explicit; no native runtime loads on ordinary navigation. */
export function createProductBrowserApiControl(document: Document) {
  const section = element(document, 'details', 'lab-details product-browser-api');
  section.id = 'product-browser-api';
  section.append(element(document, 'summary', '', '브라우저 스크립트 API'));
  const notice = element(
    document,
    'p',
    'lab-muted',
    '명시적으로 활성화하면 window.PendulumLab과 기존 PendulumLabIndex 별칭을 게시합니다. 현재 이중·복합·삼중 진자의 실제 workspace에 상태·실행 명령을 연결합니다.'
  );
  notice.setAttribute('role', 'status');
  const limitations = element(
    document,
    'p',
    'lab-muted',
    '다른 화면의 상태 작업과 외부 legacy App 객체는 명시적으로 거부합니다. debug 전역은 게시하지 않습니다. applyPatch는 현재 관찰 시간만큼 새 run을 시작하며 기존 StateStore의 각도 정규화·verlet→leapfrog 별칭 규칙을 따릅니다.'
  );
  let active: ReturnType<typeof import('./browser-api-runtime').publishProductRuntimeApi> | undefined;
  let researchActive: ReturnType<typeof import('./research-api-runtime').publishProductResearchApi> | undefined;
  let disposed = false;
  let generation = 0;
  const activate = createButton(document, {
    label: '스크립트 API 활성화',
    onClick: () => void load()
  });
  const researchNotice = element(
    document,
    'p',
    'lab-muted',
    '연구 API는 별도 활성화하는 product-research-api/v1 adapter입니다. 15개 기존 method 이름은 현재 S21 다중 실험·S22 관측·S24 프로젝트를 사용하며, 열지 않은 도구는 오류로 안내합니다. 반환·파일은 product snapshot/paper-pack/figure-manifest v1, canonical batch v1, research-project v1입니다. bundle()은 원본 Uint8Array 파일을 포함하며 exportBundle은 S24 ZIP을 만듭니다. 이전 localStorage/IndexedDB 구조·PNG canvas ID를 가장하지 않습니다.'
  );
  researchNotice.setAttribute('role', 'status');
  researchNotice.id = 'product-research-api-notice';
  const researchContract = researchNotice.textContent ?? '';
  const activateResearch = createButton(document, {
    label: '연구 스크립트 API 별도 활성화 · v1',
    variant: 'secondary',
    onClick: () => void loadResearch()
  });
  activateResearch.disabled = true;
  async function loadResearch() {
    if (disposed || !active || researchActive) return;
    const pending = generation;
    activateResearch.disabled = true;
    try {
      const module = await import('./research-api-runtime');
      if (disposed || pending !== generation) return;
      researchActive = module.publishProductResearchApi(document);
      section.dataset.researchApiStatus = 'ready';
      researchNotice.textContent = `${researchContract} 활성화됨: ${researchActive.api.compatibilityAdapter}. window.PendulumLab.research와 PendulumResearchWorkspace는 같은 실제 provider adapter입니다.`;
    } catch (cause) {
      if (disposed || pending !== generation) return;
      section.dataset.researchApiStatus = 'error';
      researchNotice.textContent = `${researchContract} 활성화 실패: ${cause instanceof Error ? cause.message : '연구 API를 게시하지 못했습니다.'}`;
      activateResearch.disabled = false;
    }
  }
  async function load() {
    if (disposed || active) return;
    const pending = ++generation;
    activate.disabled = true;
    notice.textContent = '현재 namespace를 보존하며 API를 준비합니다.';
    try {
      const module = await import('./browser-api-runtime');
      if (disposed || pending !== generation) return;
      active = module.publishProductRuntimeApi(document);
      section.dataset.browserApiStatus = 'ready';
      activateResearch.disabled = false;
      notice.textContent = `스크립트 API ${active.api.version} · ${active.api.compatibilityAdapter}. physics는 기존 native adapter이며 state는 현재 지원 workspace에 연결됩니다.`;
    } catch (cause) {
      if (disposed || pending !== generation) return;
      section.dataset.browserApiStatus = 'error';
      notice.textContent =
        cause instanceof Error ? cause.message : 'API를 준비하지 못했습니다. 기존 설정을 보존하고 다시 시도하세요.';
      activate.disabled = false;
    }
  }
  section.append(notice, limitations, activate, researchNotice, activateResearch);
  return {
    element: section,
    dispose() {
      disposed = true;
      generation++;
      researchActive?.dispose();
      researchActive = undefined;
      active?.dispose();
      active = undefined;
    }
  };
}
