import { courses, findCourse, findUnitSummary } from '../../../content/learn/curriculum';
import { availabilityNote, element, link, pageHeading } from '../app/dom';
import type { ResolvedRoute, RouteView } from '../app/types';
import { createButton } from '../design-system/primitives';
import { renderReferences, renderUnitBlocks, textNode } from './blocks';
import { createCheckpoints } from './checkpoint-view';
import { loadLearnUnit } from './loader';
import { mountFocus } from './focus-mount';
import type { LearnCourse, UnitSummary } from './schema';

const actionClass = 'ds-button ds-button--secondary';
const unitHref = (unit: UnitSummary) => `#/learn/${unit.courseId}/${unit.id}`;

function breadcrumbs(document: Document, course?: LearnCourse): HTMLElement {
  const nav = element(document, 'nav', 'learn-breadcrumbs');
  nav.setAttribute('aria-label', '학습 경로');
  nav.append(link(document, '전체 과정', '#/learn'));
  if (course) nav.append(link(document, `과정 ${course.order}`, `#/learn/${course.id}`));
  return nav;
}

function navigation(document: Document, course: LearnCourse, unit: UnitSummary): HTMLElement {
  const nav = element(document, 'nav', 'learn-navigation');
  nav.setAttribute('aria-label', '단원 이동');
  const index = course.units.findIndex((item) => item.id === unit.id);
  const previous = course.units[index - 1];
  const next = course.units[index + 1];
  if (previous) nav.append(link(document, `이전 단원 ${previous.id}`, unitHref(previous), actionClass));
  nav.append(link(document, '과정 목차', `#/learn/${course.id}`, actionClass));
  if (next) nav.append(link(document, `다음 단원 ${next.id}`, unitHref(next), actionClass));
  return nav;
}

function showCourses(document: Document, root: HTMLElement): void {
  root.append(pageHeading(document, '움직임을 이해하는 배우기'));
  const intro = element(document, 'div', 'learn-intro');
  intro.append(element(document, 'p', 'product-lead', '하나의 질문에서 시작해, 식의 의미를 읽고 직접 확인합니다.'));
  intro.append(
    element(
      document,
      'p',
      '',
      '8개 과정 · 86개 단원으로 이어지는 탐구 지도입니다. 과정 1의 8개 단원에서 식을 읽고 전용 실험으로 확인한 뒤 실험실에서 탐구를 이어 가세요. 나머지 과정은 준비 중입니다.'
    )
  );
  intro.append(link(document, '첫 단원 시작하기', '#/learn/course-1/1.1', 'ds-button ds-button--primary'));
  root.append(intro);
  const grid = element(document, 'div', 'learn-grid');
  for (const course of courses) {
    const card = element(document, 'article', 'learn-course-card');
    card.append(element(document, 'span', 'learn-course-number', `과정 ${course.order} · ${course.units.length}단원`));
    card.append(textNode(document, 'h2', '', course.title));
    const available = course.units.filter((unit) => unit.availability !== 'planned').length;
    card.append(
      element(document, 'p', '', available ? `학습 가능한 단원 ${available}개 · 전용 실험 포함` : '단원 콘텐츠 준비 중')
    );
    card.append(link(document, `과정 ${course.order} 목차 보기`, `#/learn/${course.id}`, actionClass));
    grid.append(card);
  }
  root.append(
    grid,
    element(
      document,
      'p',
      '',
      '선수 개념과 진도는 탐구를 돕는 안내입니다. 과정 순서와 관계없이 원하는 단원을 선택할 수 있습니다.'
    )
  );
  root.append(link(document, '실험실에서 자유롭게 탐구하기', '#/lab', actionClass));
}

function showCourse(document: Document, root: HTMLElement, course: LearnCourse): void {
  root.append(
    breadcrumbs(document),
    element(document, 'p', 'learn-course-number', `과정 ${course.order} · ${course.units.length}단원`)
  );
  root.append(pageHeading(document, course.title.ko));
  root.append(
    element(
      document,
      'p',
      'learn-intro',
      '단원 순서는 추천 경로입니다. 아직 제작 중인 단원도 학습 목표 제목과 탐구 순서를 확인할 수 있습니다.'
    )
  );
  const list = element(document, 'ol', 'learn-unit-list');
  for (const unit of course.units) {
    const item = element(document, 'li', '');
    item.append(link(document, `${unit.id} · ${unit.title.ko}`, unitHref(unit)));
    item.append(
      element(
        document,
        'p',
        'learn-unit-state',
        unit.availability === 'planned'
          ? '콘텐츠 준비 중'
          : unit.availability === 'sample'
            ? '샘플 읽기 · 확인 질문과 진도 저장'
            : '단원 읽기 · 전용 실험 · 실험실에서 계속'
      )
    );
    list.append(item);
  }
  root.append(list, link(document, '실험실 열기', '#/lab', actionClass));
}

export function createLearnView(context: ResolvedRoute, document: Document): RouteView {
  const root = element(document, 'div', 'product-page product-learn-page learn-page');
  root.append(element(document, 'p', 'product-eyebrow', 'LEARN · 배우기'));
  const route = context.route;
  if (route.kind === 'learn') {
    showCourses(document, root);
    return { element: root, title: '배우기' };
  }
  if (route.kind !== 'learn-course' && route.kind !== 'learn-unit') throw new Error('Expected Learn route');
  const course = findCourse(route.courseId);
  if (!course) throw new Error('Missing course metadata');
  if (route.kind === 'learn-course') {
    showCourse(document, root, course);
    return { element: root, title: `${course.title.ko} · 배우기` };
  }
  const summary = findUnitSummary(route.courseId, route.unitId);
  if (!summary) throw new Error('Missing unit metadata');
  const { courseId, unitId } = route;
  root.append(
    breadcrumbs(document, course),
    element(document, 'p', 'learn-course-number', `단원 ${summary.id}`),
    pageHeading(document, summary.title.ko)
  );
  const body = element(document, 'div', 'learn-unit');
  root.append(body, navigation(document, course, summary));
  let controller: AbortController | undefined;
  let disposed = false;
  let generation = 0;
  let disposeChecks: (() => void) | undefined;
  let disposeFocus: (() => void) | undefined;

  function planned(): void {
    body.dataset.contentState = 'planned';
    body.append(
      availabilityNote(
        document,
        '이 단원은 준비 중입니다',
        '콘텐츠 제작 상태이며 학습 진도로 잠긴 페이지가 아닙니다. 다른 단원 목차를 둘러보거나 실험실에서 자유롭게 탐구할 수 있습니다.'
      )
    );
    body.append(
      link(document, '첫 단원 살펴보기', '#/learn/course-1/1.1', actionClass),
      link(document, '실험실 열기', '#/lab', actionClass)
    );
  }

  async function load(): Promise<void> {
    controller?.abort();
    controller = new AbortController();
    const current = ++generation;
    body.replaceChildren();
    body.dataset.contentState = 'loading';
    body.setAttribute('aria-busy', 'true');
    const message = element(document, 'p', '', '단원 콘텐츠를 불러오는 중입니다.');
    message.setAttribute('role', 'status');
    const cancel = createButton(document, {
      label: '단원 불러오기 취소',
      variant: 'secondary',
      onClick: () => {
        controller?.abort();
        generation += 1;
        showRecovery('cancelled', '단원 불러오기를 취소했습니다');
      }
    });
    body.append(message, cancel);
    const result = await loadLearnUnit(courseId, unitId, { signal: controller.signal });
    if (disposed || current !== generation) return;
    body.removeAttribute('aria-busy');
    body.replaceChildren();
    if (result.status === 'ready') {
      body.dataset.contentState = 'ready';
      const unit = result.unit;
      const notice = element(document, 'aside', 'learn-notice');
      notice.append(
        element(document, 'h2', '', unit.kind === 'sample' ? '단원 프레임 샘플' : '이번 단원의 질문'),
        textNode(document, 'p', '', unit.summary)
      );
      body.append(notice, renderUnitBlocks(document, unit));
      if (unit.focusExperiment.status === 'ready') {
        const focus = mountFocus(document, unit);
        disposeFocus = focus.dispose;
        body.append(focus.element);
      }
      const checks = createCheckpoints(document, unit);
      disposeChecks = checks.dispose;
      body.append(checks.element);
      const footer = element(document, 'div', 'learn-unit-footer');
      if (unit.focusExperiment.status !== 'ready')
        footer.append(
          availabilityNote(
            document,
            '전용 실험은 준비 중입니다',
            '이 샘플에서는 설명과 확인 질문을 제공합니다. 이중진자를 직접 움직여 보려면 실험실을 열어 조건을 설정할 수 있습니다.'
          )
        );
      footer.append(
        link(document, '이중진자 실험실 열기', '#/lab/double', 'ds-button ds-button--primary'),
        renderReferences(document, unit)
      );
      body.append(footer);
    } else if (result.status === 'planned') planned();
    else if (result.status === 'cancelled') showRecovery('cancelled', '단원 불러오기를 취소했습니다');
    else showRecovery('error', '단원 콘텐츠를 불러오지 못했습니다');
  }

  function showRecovery(state: 'error' | 'cancelled', message: string): void {
    body.removeAttribute('aria-busy');
    body.dataset.contentState = state;
    const heading = element(document, 'h2', '', message);
    heading.tabIndex = -1;
    const info = element(
      document,
      'p',
      '',
      '주소와 기존 진도는 유지했습니다. 연결 상태를 확인하고 다시 시도하거나 과정 목차로 이동할 수 있습니다.'
    );
    info.setAttribute('role', state === 'error' ? 'alert' : 'status');
    body.replaceChildren(
      heading,
      info,
      createButton(document, {
        label: '단원 다시 시도',
        onClick: () => {
          if (state === 'error') document.defaultView?.location.reload();
          else void load();
        }
      })
    );
    heading.focus();
  }
  if (summary.availability === 'planned') planned();
  else void load();
  return {
    element: root,
    title: `${summary.id} · ${summary.title.ko} · 배우기`,
    dispose() {
      disposed = true;
      generation += 1;
      controller?.abort();
      disposeChecks?.();
      disposeFocus?.();
    }
  };
}
