# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: redesign\shell.spec.ts >> S04 parallel application shell >> opens and reloads every route family without pretending future content is available
- Location: e2e\redesign\shell.spec.ts:204:3

# Error details

```
Error: expect(locator).toHaveJSProperty(expected) failed

Locator: locator('#product-main').getByRole('progressbar', { name: '단원 확인 진도', exact: true })
Expected: 0
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveJSProperty" with timeout 5000ms
  - waiting for locator('#product-main').getByRole('progressbar', { name: '단원 확인 진도', exact: true })

```

```yaml
- link "본문으로 건너뛰기":
  - /url: "#product-main"
- banner:
  - link "Pendulum Lab":
    - /url: "#/learn"
  - text: 새 공간 미리보기
  - navigation "주요 공간":
    - link "배우기":
      - /url: "#/learn"
    - link "실험실":
      - /url: "#/lab"
  - text: 화면 테마
  - combobox "화면 테마":
    - option "밝게" [selected]
    - option "어둡게"
    - option "기기 설정"
  - link "기존 앱 열기":
    - /url: ./app.html
- main:
  - paragraph: LEARN · 배우기
  - navigation "학습 경로":
    - link "전체 과정":
      - /url: "#/learn"
    - link "과정 8":
      - /url: "#/learn/course-8"
  - paragraph: 단원 8.12
  - heading "notebook·figure·report·검토 패키지" [level=1]
  - complementary:
    - heading "이번 단원의 질문" [level=2]
    - paragraph: 연구 질문에서 실제 기록·그림·보고서·정적 reviewer까지 이어지는 검증 가능한 ZIP을 완성합니다.
  - heading "학습 목표" [level=2]
  - list:
    - listitem: 그림의 각 축·표본이 원 run으로 연결됨을 확인한다.
    - listitem: notebook·report·reviewer와 원본 bytes를 함께 검토 패키지로 묶는다.
  - heading "필요할 때 펼치는 선수 개념" [level=2]
  - group: 모형의 전제·좌표·선수 개념
  - heading "질문과 모델의 가정" [level=2]
  - article:
    - heading "주장과 그림에 원본 연결" [level=3]
    - paragraph: notebook은 질문·방법·관찰·한계를 plain text로 기록하고 artifact ID를 참조합니다. figure는 원 run과 정확한 series artifact를 지정하며 축·단위·표본 수·원 SHA256을 출력 metadata에 남깁니다. 그림을 보기 좋게 다시 그리는 행위가 원 자료 변환이나 새로운 측정을 숨겨서는 안 됩니다.
    - paragraph: "출처: native-0, native-1, primary-reference · 아래 참고 문헌에서 확인할 수 있습니다."
  - article:
    - heading "정적 보기와 실행 검증을 구별" [level=3]
    - paragraph: 실제 ZIP에는 원 설정·series, project/package/checksum manifest, notebook.json, report.md, figures의 SVG/CSV와 reviewer.html을 함께 넣습니다. 다시 import해 checksum과 계보를 검증한 후 제공하지만 정적 reviewer 자체는 재계산하거나 checksum을 다시 검사하지 않습니다. 사람의 과학 검토는 별도입니다.
    - paragraph: "출처: native-0, native-1, primary-reference · 아래 참고 문헌에서 확인할 수 있습니다."
  - article:
    - heading "핵심 정리와 다음 탐구" [level=3]
    - paragraph: 독립 검토자에게 질문·원본·변환·실패 조건을 함께 전달하고 실제 피드백을 별도 기록하세요. 이를 수행하기 전 사람 검토 완료를 주장하지 않습니다.
    - paragraph: "출처: native-0, native-1, primary-reference · 아래 참고 문헌에서 확인할 수 있습니다."
  - heading "식을 읽고 기호 연결하기" [level=2]
  - article:
    - heading "그림의 기록 시간축" [level=3]
    - math "균일 기록의 시각은 시작 t0에 표본 번호 i와 간격 h의 곱을 더한 값입니다. 실제 figure는 이 식으로 보간하지 않고 보존된 time 배열 값을 그대로 씁니다."
    - paragraph: 균일 기록의 시각은 시작 t0에 표본 번호 i와 간격 h의 곱을 더한 값입니다. 실제 figure는 이 식으로 보간하지 않고 보존된 time 배열 값을 그대로 씁니다.
    - term: t [s]
    - definition: 표본 기록 시각
    - term: t0 [s]
    - definition: 기록 시작 시각
    - term: i [1]
    - definition: 0부터 시작한 표본 번호
    - term: h [s]
    - definition: 기록 간격
    - paragraph: "출처: native-0, native-1, primary-reference · 아래 참고 문헌에서 확인할 수 있습니다."
  - article:
    - heading "원본과 파생 출력의 크기 예산" [level=3]
    - math "패키지 크기는 원본 bytes·생성 그림/문서·manifest와 ZIP metadata를 모두 포함합니다. byte 수는 무차원 개수이고 개별 파일과 전체 크기 한도를 함께 검사합니다."
    - paragraph: 패키지 크기는 원본 bytes·생성 그림/문서·manifest와 ZIP metadata를 모두 포함합니다. byte 수는 무차원 개수이고 개별 파일과 전체 크기 한도를 함께 검사합니다.
    - term: Btotal [1]
    - definition: 총 byte 수
    - term: Boriginal [1]
    - definition: 원본 파일 bytes
    - term: Bderived [1]
    - definition: 파생 그림·문서 bytes
    - term: Bmetadata [1]
    - definition: manifest와 ZIP metadata bytes
    - paragraph: "출처: native-0, native-1, primary-reference · 아래 참고 문헌에서 확인할 수 있습니다."
  - heading "용어" [level=2]
  - term: 검토 패키지 Review package
  - definition: 주장·그림·원 run·원본 bytes·검증 manifest를 함께 전달하는 재현 산출물 묶음입니다.
  - region "전용 실험":
    - heading "직접 확인하는 전용 실험" [level=2]
    - paragraph: 예측하고 조건을 바꿔 공용 엔진으로 실행하세요. 비교 계산의 별도 설정은 결과 JSON에 보존되며 실험실에는 표시된 기준 실험의 초기조건·적분기·시간·지원 분석 설정을 전달합니다. 뒤로가기는 결과를 유지하고 새로고침은 재시작 설정을 복원합니다.
    - list:
      - listitem: 패키지 실험을 실행하고 그림 출처·ZIP 경로 표를 확인한 뒤 다운로드하여 reviewer.html과 원본 figures CSV를 함께 살펴보세요.
    - text: 첫 시작 각도 · theta1 (rad)
    - textbox "첫 시작 각도 · theta1 (rad)": "0.4"
    - paragraph: "이 단원의 설정입니다. 값을 바꾸면 계산을 초기조건부터 다시 시작합니다. 범위: 0.1–1.2 rad. 기본값: 0.4 rad."
    - combobox "표시 단위 · theta1":
      - option "rad" [selected]
      - option "deg"
    - text: 관찰 기간 · duration (s)
    - textbox "관찰 기간 · duration (s)": "0.8"
    - paragraph: "이 단원의 설정입니다. 값을 바꾸면 계산을 초기조건부터 다시 시작합니다. 범위: 0.4–2 s. 기본값: 0.8 s."
    - group: 고정 조건과 단위 확인
    - status: 실험 준비 완료
    - button "실험 실행"
    - button "실험 취소" [disabled]
    - button "실험 처음으로"
    - status "전용 실험의 관찰 시간": t = 0.0000 s
    - text: 전용 실험 진행
    - progressbar "전용 실험 진행"
    - paragraph: 0.0%
    - status: 설정은 이 탭의 세션에 보관됩니다. 학습 진도와 기능 권한은 별개입니다.
    - paragraph: 아직 계산 결과가 없습니다. 예측한 뒤 실험을 실행하세요.
    - heading "예측 → 실행 → 관찰 → 설명" [level=3]
    - article:
      - paragraph: 연구 그림을 추가하면 원 시계열을 없애도 되는지, 다운로드 ZIP에 어떤 원본과 검토 파일이 필요한지 먼저 예측하세요.
      - paragraph: 패키지 실험을 실행하고 그림 출처·ZIP 경로 표를 확인한 뒤 다운로드하여 reviewer.html과 원본 figures CSV를 함께 살펴보세요.
      - group: 예상 관찰과 해석 펼치기
    - button "실험 결과 JSON 내보내기" [disabled]
    - button "실험실에서 계속"
    - paragraph: 기준 run의 정확한 canonical 물성·초기조건·단위·RK4와 단원 출처를 Lab에 전달합니다. notebook·그림·report·reviewer는 별도 검증 ZIP 다운로드로 보존하며 현재 Lab 프로젝트에 자동 합치지 않습니다.
    - link "실험실 라이브러리":
      - /url: "#/lab"
    - button "연구 ZIP 내보내기" [disabled]
    - status
    - paragraph: ZIP 내보내기는 완료한 단원과 같은 설정·출처로 제한된 실제 run을 다시 생성하고, manifest·checksum·원 기록을 검증합니다. 8.12는 notebook·figure·report·offline reviewer도 포함합니다.
  - heading "이해 확인" [level=2]
  - paragraph: 답을 확인하면 이 브라우저에 진도가 저장됩니다. 정답 여부와 관계없이 모든 과정과 실험실에 접근할 수 있습니다.
  - text: 단원 확인 진도
  - progressbar
  - paragraph: 0 / 2개 확인
  - status: 진도는 이 브라우저에만 저장됩니다.
  - group "SVG 그림만 있으면 재현 패키지가 완전한가요?":
    - text: SVG 그림만 있으면 재현 패키지가 완전한가요?
    - radio "원 run·원본 기록·설정·계보·검증도 필요하다."
    - text: 원 run·원본 기록·설정·계보·검증도 필요하다.
    - radio "보기 좋은 그림이면 원본 데이터는 삭제한다."
    - text: 보기 좋은 그림이면 원본 데이터는 삭제한다.
    - button "답 확인"
    - status
  - group "정적 reviewer를 열면 무엇이 완료되나요?":
    - text: 정적 reviewer를 열면 무엇이 완료되나요?
    - radio "저장된 보고서를 본 것이며 사람 검토·재계산 인증은 별도다."
    - text: 저장된 보고서를 본 것이며 사람 검토·재계산 인증은 별도다.
    - radio "과학 전문가 검토와 재계산이 자동 완료된다."
    - text: 과학 전문가 검토와 재계산이 자동 완료된다.
    - button "답 확인"
    - status
  - button "이 단원 진도 초기화"
  - link "단원 시스템 실험실 열기":
    - /url: "#/lab/double"
  - heading "참고 문헌과 검토 상태" [level=2]
  - list:
    - listitem:
      - link "native-0 · 보존된 Pendulum Lab — src/product/provenance/render.ts":
        - /url: https://github.com/elliotjung/pendulum-lab/blob/9cfd9842570cdd3137e3ea866a1266de2585b941/src/product/provenance/render.ts
      - paragraph: Pendulum Lab contributors · renderResearchFigure/researchExportEntries의 원본 축·SVG/CSV·정적 reviewer · 확인 2026-11-05
    - listitem:
      - link "native-1 · 보존된 Pendulum Lab — src/product/provenance/package.ts":
        - /url: https://github.com/elliotjung/pendulum-lab/blob/9cfd9842570cdd3137e3ea866a1266de2585b941/src/product/provenance/package.ts
      - paragraph: Pendulum Lab contributors · ZIP manifest/checksum과 안전한 생성 출력 경로 검사 · 확인 2026-11-05
    - listitem:
      - link "primary-reference · PROV Model Primer":
        - /url: https://www.w3.org/TR/prov-primer/
      - paragraph: W3C Provenance Working Group; Y. Gil and S. Miles, editors · 3장의 generation·derivation 예와 산출물 계보 연결 · 확인 2026-11-05
  - paragraph: "콘텐츠 구조: 자동 검사 완료 · 과학 예제: 자동 검증 완료 · 출처: 대조 완료 · 사람·전문가: 검토 전"
  - paragraph: 식·부호·단위와 실패 조건을 보존된 실제 소스 및 명시된 1차 자료와 대조했습니다. 자동 수치 fixture와 전달 검증 대상이며 사람·물리 전문가 검토는 미완료입니다.
  - navigation "단원 이동":
    - link "이전 단원 8.11":
      - /url: "#/learn/course-8/8.11"
    - link "과정 목차":
      - /url: "#/learn/course-8"
- contentinfo:
  - paragraph: Pendulum Lab · 움직임을 이해하고, 질문을 실험으로.
  - link "컴포넌트 갤러리":
    - /url: ./next.html?gallery=components
  - button "명령 검색 (Ctrl/⌘ K)"
  - text: 표시 언어
  - combobox "표시 언어":
    - option "한국어" [selected]
    - option "English"
  - group: 브라우저 스크립트 API
```

# Test source

```ts
  43  | 
  44  | async function captureStorageBeforeMount(page: Page): Promise<void> {
  45  |   await page.addInitScript(() => {
  46  |     (window as unknown as { __s28ShellStorageBeforeMount: unknown }).__s28ShellStorageBeforeMount = {
  47  |       local: Object.fromEntries(
  48  |         Object.keys(localStorage)
  49  |           .sort()
  50  |           .map((key) => [key, localStorage.getItem(key)])
  51  |       ),
  52  |       session: Object.fromEntries(
  53  |         Object.keys(sessionStorage)
  54  |           .sort()
  55  |           .map((key) => [key, sessionStorage.getItem(key)])
  56  |       )
  57  |     };
  58  |   });
  59  | }
  60  | 
  61  | async function expectStorageUnchanged(page: Page): Promise<void> {
  62  |   const state = await page.evaluate(() => ({
  63  |     before: (window as unknown as { __s28ShellStorageBeforeMount: unknown }).__s28ShellStorageBeforeMount,
  64  |     after: {
  65  |       local: Object.fromEntries(
  66  |         Object.keys(localStorage)
  67  |           .sort()
  68  |           .map((key) => [key, localStorage.getItem(key)])
  69  |       ),
  70  |       session: Object.fromEntries(
  71  |         Object.keys(sessionStorage)
  72  |           .sort()
  73  |           .map((key) => [key, sessionStorage.getItem(key)])
  74  |       )
  75  |     }
  76  |   }));
  77  |   expect(state.before).toBeDefined();
  78  |   expect(state.after).toEqual(state.before);
  79  | }
  80  | 
  81  | async function expectNativeLaboratory(page: Page, slug: 'double' | 'quantum-kicked-rotor', initialTime = 0) {
  82  |   const core = slug === 'double';
  83  |   const workspace = page.locator(core ? '.core-workspace' : '.discrete-workspace');
  84  |   await expect(page.getByRole('heading', { level: 1 })).toHaveText(core ? '점질량 이중 진자' : '양자 킥 회전자');
  85  |   await expect(workspace).toHaveAttribute('data-lab-status', 'ready');
  86  |   await expect(page.locator('#product-main .lab-workspace')).toHaveCount(1);
  87  |   await expect(page.locator('#product-main .lab-flow-preview')).toHaveCount(0);
  88  |   const run = workspace.locator(core ? '#lab-run-bar' : '#discrete-run');
  89  |   await expect(run.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
  90  |   await expect(run.getByRole('button', { name: '한 단계', exact: true })).toBeEnabled();
  91  |   await expect(run.getByRole('button', { name: '일시정지', exact: true })).toBeDisabled();
  92  |   await expect(run.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  93  |   await expect(workspace.getByRole('tab', { name: '작업 공간', exact: true })).toHaveAttribute('aria-selected', 'true');
  94  |   await expect(workspace.getByRole('tab', { name: '조건', exact: true })).toBeEnabled();
  95  |   const clock = workspace.locator(core ? '#lab-time' : '#discrete-iteration');
  96  |   await expect(clock).toHaveAttribute(core ? 'data-time' : 'data-iteration', String(initialTime));
  97  |   if (core) {
  98  |     await expect(workspace.getByRole('img', { name: '진자 애니메이션', exact: true })).toBeVisible();
  99  |   } else {
  100 |     await expect(workspace).toHaveAttribute('data-busy', 'false');
  101 |     await expect(
  102 |       workspace.locator('#discrete-preview').getByRole('img', { name: /^운동량 확률 분포\./ })
  103 |     ).toBeVisible();
  104 |     await expect(workspace.locator('#discrete-summary')).toHaveAttribute('data-norm', '1');
  105 |   }
  106 |   await page.evaluate(
  107 |     () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  108 |   );
  109 |   await expect(workspace).toHaveAttribute('data-lab-status', 'ready');
  110 |   await expect(clock).toHaveAttribute(core ? 'data-time' : 'data-iteration', String(initialTime));
  111 | }
  112 | 
  113 | async function expectPublishedRoute(page: Page, hash: string): Promise<void> {
  114 |   const main = page.locator('#product-main');
  115 |   if (hash === '#/learn') {
  116 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('움직임을 이해하는 배우기');
  117 |     await expect(main.locator('.learn-course-card')).toHaveCount(8);
  118 |     await expect(main).toContainText('현재 8개 과정의 86개 단원');
  119 |     await expect(main.getByRole('link', { name: '첫 단원 시작하기', exact: true })).toHaveAttribute(
  120 |       'href',
  121 |       '#/learn/course-1/1.1'
  122 |     );
  123 |   } else if (hash === '#/learn/course-1') {
  124 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('이중진자의 모델과 운동방정식');
  125 |     await expect(main.locator('.learn-unit-list > li')).toHaveCount(8);
  126 |     await expect(main.locator('.learn-unit-state')).toHaveText(
  127 |       Array.from({ length: 8 }, () => '단원 읽기 · 전용 실험 · 실험실에서 계속')
  128 |     );
  129 |     for (let unit = 1; unit <= 8; unit++)
  130 |       await expect(main.locator(`.learn-unit-list a[href="#/learn/course-1/1.${unit}"]`)).toBeVisible();
  131 |   } else if (hash === '#/learn/course-8/8.12') {
  132 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('notebook·figure·report·검토 패키지');
  133 |     await expect(main.locator('.learn-unit')).toHaveAttribute('data-content-state', 'ready');
  134 |     await expect(main.getByRole('heading', { name: '이번 단원의 질문', exact: true })).toBeVisible();
  135 |     await expect(main.locator('.focus-mount')).toHaveAttribute('data-focus-load', 'ready');
  136 |     const focus = main.locator('.focus-experiment');
  137 |     await expect(focus).toHaveAttribute('data-focus-unit', '8.12');
  138 |     await expect(focus).toHaveAttribute('data-focus-status', 'idle');
  139 |     await expect(focus.locator('#focus-time')).toHaveAttribute('data-time', '0');
  140 |     await expect(focus.getByRole('button', { name: '실험 실행', exact: true })).toBeEnabled();
  141 |     await expect(focus.getByRole('button', { name: '실험 취소', exact: true })).toBeDisabled();
  142 |     await expect(focus.locator('[data-focus-results]')).toContainText('아직 계산 결과가 없습니다.');
> 143 |     await expect(main.getByRole('progressbar', { name: '단원 확인 진도', exact: true })).toHaveJSProperty('value', 0);
      |                                                                                    ^ Error: expect(locator).toHaveJSProperty(expected) failed
  144 |     await expect(main.locator('.learn-review-status')).toContainText('출처: 대조 완료');
  145 |     await expect(main.locator('.learn-review-status')).toContainText('사람·전문가: 검토 전');
  146 |   } else if (hash === '#/lab') {
  147 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('질문을 직접 시험하는 실험실');
  148 |     await expect(main.locator('.lab-library')).toBeVisible();
  149 |     await expect(main.locator('.lab-system-grid a[href="#/lab/double"]')).toBeVisible();
  150 |     await expect(main.locator('.lab-system-grid a[href="#/lab/quantum-kicked-rotor"]')).toBeVisible();
  151 |     await expect(main.locator('canvas')).toHaveCount(0);
  152 |   } else if (hash === '#/lab/double') await expectNativeLaboratory(page, 'double');
  153 |   else if (hash === '#/lab/quantum-kicked-rotor') await expectNativeLaboratory(page, 'quantum-kicked-rotor');
  154 |   else throw new Error('Every selected route must have an explicit current published-content contract.');
  155 |   await expectStorageUnchanged(page);
  156 | }
  157 | 
  158 | test.describe('S04 parallel application shell', () => {
  159 |   test('retains a deep URL and recovery guidance when the entry script cannot load', async ({ page }) => {
  160 |     const entry = (url: URL) =>
  161 |       url.pathname === '/src/product/app/entry.ts' || /\/assets\/next-[^/]+\.js$/.test(url.pathname);
  162 |     await page.route(entry, (route) => route.abort('failed'));
  163 |     const hash = '#/lab/double';
  164 |     await page.goto(`/next.html${hash}`, { waitUntil: 'domcontentloaded' });
  165 |     await expect(page.locator('#product-root')).toHaveAttribute('data-bootstrap-state', 'loading');
  166 |     await expect(page.getByRole('status')).toContainText('브라우저에서 새로고침');
  167 |     await expect(page.getByRole('link', { name: '기존 앱 열기' })).toBeVisible();
  168 |     await expect(page.getByRole('link')).toHaveCount(1);
  169 |     expect(new URL(page.url()).hash).toBe(hash);
  170 |     await page.unroute(entry);
  171 |     await page.reload();
  172 |     await ready(page, 'lab');
  173 |     expect(new URL(page.url()).hash).toBe(hash);
  174 |   });
  175 | 
  176 |   test('opens Learn by default and preserves browser back, forward and reload', async ({ page }) => {
  177 |     const pageErrors: string[] = [];
  178 |     const consoleErrors: string[] = [];
  179 |     page.on('pageerror', (error) => pageErrors.push(error.message));
  180 |     page.on('console', (message) => {
  181 |       if (message.type() === 'error') consoleErrors.push(message.text());
  182 |     });
  183 |     await page.goto('/next.html');
  184 |     await ready(page, 'learn');
  185 |     await expect(page.locator('#product-root')).toHaveCSS('display', 'flex');
  186 |     await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(246, 247, 242)');
  187 |     await expect(page).toHaveURL(/\/next\.html#\/learn$/);
  188 |     await expect(page).toHaveTitle('배우기 | Pendulum Lab');
  189 |     await chooseSpace(page, 'lab');
  190 |     await expect(page).toHaveURL(/#\/lab$/);
  191 |     await expect(page).toHaveTitle('실험실 | Pendulum Lab');
  192 |     await page.reload();
  193 |     await ready(page, 'lab');
  194 |     await page.goBack();
  195 |     await ready(page, 'learn');
  196 |     await expect(page).toHaveURL(/#\/learn$/);
  197 |     await page.goForward();
  198 |     await ready(page, 'lab');
  199 |     await expect(page).toHaveURL(/#\/lab$/);
  200 |     expect(pageErrors).toEqual([]);
  201 |     expect(consoleErrors).toEqual([]);
  202 |   });
  203 | 
  204 |   test('opens and reloads every route family without pretending future content is available', async ({ page }) => {
  205 |     await captureStorageBeforeMount(page);
  206 |     for (const [hash, space] of [
  207 |       ['#/learn', 'learn'],
  208 |       ['#/learn/course-1', 'learn'],
  209 |       ['#/learn/course-8/8.12', 'learn'],
  210 |       ['#/lab', 'lab'],
  211 |       ['#/lab/double', 'lab'],
  212 |       ['#/lab/quantum-kicked-rotor', 'lab']
  213 |     ] as const) {
  214 |       await test.step(hash, async () => {
  215 |         await page.goto(`/next.html${hash}`);
  216 |         await ready(page, space);
  217 |         await expectPublishedRoute(page, hash);
  218 |         const heading = await page.getByRole('heading', { level: 1 }).textContent();
  219 |         await page.reload();
  220 |         await ready(page, space);
  221 |         expect(new URL(page.url()).hash).toBe(hash);
  222 |         await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading!);
  223 |         // These registered routes are published/native by S28. Unknown or
  224 |         // malformed routes still require the explicit recovery checks below.
  225 |         await expectPublishedRoute(page, hash);
  226 |       });
  227 |     }
  228 |   });
  229 | 
  230 |   test('validates shared experiment routes without starting or persisting an experiment', async ({ page }) => {
  231 |     await captureStorageBeforeMount(page);
  232 |     const config = {
  233 |       ...defaultPlanarConfig(),
  234 |       parameters: { m1: 1.25, m2: 0.75, l1: 1.1, l2: 0.8, g: 9.8 },
  235 |       initialState: [0.125, -0.25, 0.5, -0.75] as const,
  236 |       gamma: 0.025,
  237 |       startTime: 1.25,
  238 |       duration: 0.04,
  239 |       step: 0.002
  240 |     };
  241 |     const canonical = toCanonicalPlanar(config);
  242 |     if (!canonical.ok) throw new Error('The native planar setup must produce a canonical experiment.');
  243 |     const shared = createExperimentRoute(canonical.value);
```