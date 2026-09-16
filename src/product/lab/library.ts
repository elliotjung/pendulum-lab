import { catalog } from '../catalog';
import type { SystemDefinition } from '../contracts/catalog';
import { element, link, pageHeading } from '../app/dom';
import { createButton, createCard, createInput } from '../design-system/primitives';
import { serializeProductRoute } from '../contracts/routes';
import { selectSystems, SYSTEM_FAMILIES, type SystemSelection } from '../catalog/selectors';

export const familyNames = Object.fromEntries(SYSTEM_FAMILIES.map((family) => [family.id, family.label])) as Record<
  SystemDefinition['family'],
  string
>;

/** Page-session discovery preferences never write to existing user storage. */
const sessions = new WeakMap<Document, { favorites: Set<string>; recent: string[] }>();
function session(document: Document) {
  let value = sessions.get(document);
  if (!value) {
    value = { favorites: new Set(), recent: [] };
    sessions.set(document, value);
  }
  return value;
}

export function rememberSystem(document: Document, systemId: string): void {
  const value = session(document);
  value.recent = [systemId, ...value.recent.filter((id) => id !== systemId)].slice(0, 8);
}

export function createLibrary(document: Document): HTMLElement {
  const view = element(document, 'div', 'product-page product-lab-page lab-library');
  const preferences = session(document);
  view.append(
    element(document, 'p', 'product-eyebrow', 'LAB · 실험실'),
    pageHeading(document, '질문을 직접 시험하는 실험실'),
    element(
      document,
      'p',
      'product-lead',
      '시스템을 고르고, 조건을 정하고, 실험을 조립하세요. 모든 시스템을 학습 진도와 관계없이 탐색할 수 있습니다.'
    ),
    element(
      document,
      'p',
      'lab-preview-note',
      '이중·복합·삼중진자와 N중 사슬은 실제 계산·그래프·내보내기를 제공합니다. 다른 시스템은 조립 흐름 미리보기이며 기존 앱에서 계산할 수 있습니다.'
    )
  );
  const intro = element(document, 'div', 'lab-inline-actions');
  intro.append(link(document, '기존 앱에서 실험하기', './app.html'), link(document, '배우기 알아보기', '#/learn'));
  view.append(intro);
  const filters = element(document, 'section', 'lab-filters');
  filters.setAttribute('aria-label', '시스템 찾기');
  const search = createInput(document, {
    id: 'lab-search',
    label: '시스템 검색',
    type: 'search',
    help: '한국어·영어 이름과 키워드로 검색합니다.',
    onInput: () => render()
  });
  const familyLabel = element(document, 'label', 'ds-field', '시스템 패밀리');
  const family = element(document, 'select', 'ds-field__control');
  family.id = 'lab-family';
  familyLabel.htmlFor = family.id;
  for (const [value, title] of [['all', '모든 패밀리'], ...Object.entries(familyNames)]) {
    const option = element(document, 'option', '', title);
    option.value = value!;
    family.append(option);
  }
  family.addEventListener('change', () => render());
  familyLabel.append(family);
  const scopeLabel = element(document, 'label', 'ds-field', '목록 보기');
  const scope = element(document, 'select', 'ds-field__control');
  scope.id = 'lab-scope';
  scopeLabel.htmlFor = scope.id;
  for (const [value, title] of [
    ['all', '전체 시스템'],
    ['recent', '최근 선택'],
    ['favorites', '즐겨찾기']
  ]) {
    const option = element(document, 'option', '', title);
    option.value = value!;
    scope.append(option);
  }
  scope.addEventListener('change', () => render());
  scopeLabel.append(scope);
  filters.append(search.element, familyLabel, scopeLabel);
  const count = element(document, 'p', 'lab-result-count');
  count.setAttribute('role', 'status');
  const cards = element(document, 'div', 'lab-system-grid');
  const empty = element(document, 'div', 'lab-empty');
  empty.append(
    element(document, 'h2', '', '조건에 맞는 시스템이 없습니다'),
    element(
      document,
      'p',
      '',
      '검색어나 패밀리를 바꿔 보세요. 최근 선택과 즐겨찾기는 이 페이지를 새로고침하기 전까지 유지됩니다.'
    ),
    createButton(document, {
      label: '필터 초기화',
      variant: 'secondary',
      onClick() {
        search.input.value = '';
        family.value = 'all';
        scope.value = 'all';
        render();
        search.input.focus();
      }
    })
  );
  view.append(
    filters,
    element(
      document,
      'p',
      'lab-muted',
      '최근 선택과 즐겨찾기는 현재 페이지에서 유지됩니다. 새로고침하면 초기화됩니다.'
    ),
    count,
    cards,
    empty
  );

  function render(): void {
    const systems = selectSystems({
      query: search.input.value,
      family: family.value as SystemSelection['family'] & string,
      collection: scope.value as SystemSelection['collection'] & string,
      recentIds: preferences.recent,
      favoriteIds: [...preferences.favorites]
    });
    count.textContent = `${systems.length}개 시스템 · 전체 ${catalog.systems.length}개`;
    cards.replaceChildren();
    empty.hidden = systems.length > 0;
    for (const system of systems) {
      const card = createCard(document, {
        id: `library-${system.id.slice(7)}`,
        title: system.name.ko,
        description: system.description.ko,
        headingLevel: 2
      });
      card.body.append(
        element(
          document,
          'p',
          'lab-system-meta',
          `${familyNames[system.family]} · ${system.degreesOfFreedom.kind === 'fixed' ? `${system.degreesOfFreedom.value} 자유도` : '가변 자유도'}`
        )
      );
      const route = serializeProductRoute({ kind: 'lab-system', systemId: system.id });
      if (!route.ok) throw new Error('Registered system route must serialize.');
      const open = link(document, '선택하고 설정하기', route.value, 'ds-button ds-button--primary');
      open.setAttribute('aria-label', `${system.name.ko} 선택하고 설정하기`);
      const favorite = createButton(document, {
        label: '',
        variant: 'secondary',
        onClick() {
          if (preferences.favorites.has(system.id)) preferences.favorites.delete(system.id);
          else preferences.favorites.add(system.id);
          if (scope.value === 'favorites') {
            render();
            scope.focus();
          } else updateFavorite();
        }
      });
      function updateFavorite(): void {
        const selected = preferences.favorites.has(system.id);
        favorite.textContent = selected ? '즐겨찾기 해제' : '즐겨찾기';
        favorite.setAttribute('aria-label', `${system.name.ko} 즐겨찾기`);
        favorite.setAttribute('aria-pressed', String(selected));
      }
      updateFavorite();
      const actions = element(document, 'div', 'lab-card-actions');
      actions.append(open, favorite);
      card.body.append(actions);
      cards.append(card.element);
    }
  }
  render();
  return view;
}
