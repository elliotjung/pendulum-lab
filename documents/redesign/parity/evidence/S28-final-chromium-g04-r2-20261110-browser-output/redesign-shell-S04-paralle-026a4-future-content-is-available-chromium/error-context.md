# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: redesign\shell.spec.ts >> S04 parallel application shell >> opens and reloads every route family without pretending future content is available
- Location: e2e\redesign\shell.spec.ts:89:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('#product-main canvas')
Expected: 0
Received: 2
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('#product-main canvas')
    14 × locator resolved to 2 elements
       - unexpected value "2"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "본문으로 건너뛰기" [ref=e3] [cursor=pointer]:
    - /url: "#product-main"
  - banner [ref=e4]:
    - generic [ref=e5]:
      - link "Pendulum Lab" [ref=e6] [cursor=pointer]:
        - /url: "#/learn"
      - generic [ref=e7]: 새 공간 미리보기
    - navigation "주요 공간" [ref=e8]:
      - link "배우기" [ref=e9] [cursor=pointer]:
        - /url: "#/learn"
      - link "실험실" [ref=e10] [cursor=pointer]:
        - /url: "#/lab"
    - generic [ref=e11]:
      - generic [ref=e12]: 화면 테마
      - combobox "화면 테마" [ref=e13]:
        - option "밝게" [selected]
        - option "어둡게"
        - option "기기 설정"
    - link "기존 앱 열기" [ref=e14] [cursor=pointer]:
      - /url: ./app.html
  - main [ref=e15]:
    - generic [ref=e16]:
      - link "시스템 라이브러리" [ref=e17] [cursor=pointer]:
        - /url: "#/lab"
      - paragraph [ref=e18]: LAB · 고전 진자
      - heading "점질량 이중 진자" [active] [level=1] [ref=e19]
      - paragraph [ref=e20]: 두 질점과 질량 없는 두 막대의 평면 운동.
      - paragraph [ref=e21]: 기존 물리 엔진으로 계산합니다. θ는 아래 수직선 기준 절대각입니다. 저장한 설정은 초기조건에서 재실행하며, 화면을 이동하면 계산을 멈춥니다.
      - link "기존 앱 열기" [ref=e22] [cursor=pointer]:
        - /url: ./app.html
      - region "실행 제어" [ref=e23]:
        - heading "실행 제어" [level=2] [ref=e24]
        - generic [ref=e25]:
          - status [ref=e26]: 실행 준비 완료
          - generic [ref=e27]:
            - button "실행" [ref=e28] [cursor=pointer]
            - button "일시정지" [disabled] [ref=e29]
            - button "한 단계" [ref=e30] [cursor=pointer]
            - button "처음으로" [ref=e31] [cursor=pointer]
            - button "실행 취소" [disabled] [ref=e32]
          - generic [ref=e33]: 재생 속도
          - combobox "재생 속도" [ref=e34]:
            - option "0.25×"
            - option "1×" [selected]
            - option "4×"
          - status "현재 물리 시간" [ref=e35]: t = 0.0000 s
          - generic [ref=e36]:
            - generic [ref=e37]: 실행 진행
            - progressbar "실행 진행" [ref=e38]
            - paragraph [ref=e39]: 1개 기록 표본 · 0.0%
          - group [ref=e40]:
            - generic "실행 시계 · 프레임 예산" [ref=e41] [cursor=pointer]
            - option "실제 시간에 맞추기" [selected]
            - option "프레임마다 정해진 단계 실행"
            - option "demo" [selected]
            - option "education"
            - option "research"
            - option "benchmark"
            - option "performance"
            - option "recovery"
      - generic [ref=e42]:
        - tablist "실험실 패널" [ref=e43]:
          - tab "작업 공간" [selected] [ref=e44] [cursor=pointer]
          - tab "조건" [ref=e45] [cursor=pointer]
          - tab "분석" [ref=e46] [cursor=pointer]
          - tab "보관함" [ref=e47] [cursor=pointer]
          - tab "내보내기" [ref=e48] [cursor=pointer]
        - tabpanel "작업 공간" [ref=e49]:
          - region "작업 공간" [ref=e50]:
            - heading "작업 공간" [level=2] [ref=e51]
            - paragraph [ref=e52]: 현재 자세와 수치 상태를 함께 확인하세요.
            - generic [ref=e53]:
              - generic [ref=e54]:
                - img "진자 애니메이션" [ref=e55]
                - paragraph [ref=e60]: 질점 모델 · θ₁ 1.2000 rad · θ₂ 0.6000 rad. 아래 방향이 각도 0입니다.
              - generic [ref=e61]:
                - term [ref=e62]: 각속도 (rad/s)
                - definition [ref=e63]: ω₁ 0.00000 · ω₂ 0.00000
                - term [ref=e64]: 운동 / 위치 / 총 에너지 (J)
                - definition [ref=e65]: 0.000000 / -15.206002 / -15.206002
                - term [ref=e66]: 초기 총에너지 대비 변화 (J)
                - definition [ref=e67]: "0.0000e+0"
              - group [ref=e68]:
                - generic "소리화 · OGY 기준 제어" [ref=e69] [cursor=pointer]
              - group [ref=e70]:
                - generic "기록 · 되감기 · 재생" [ref=e71] [cursor=pointer]
              - group [ref=e72]:
                - generic "궤적 · 표시 품질 · 보간" [ref=e73] [cursor=pointer]
                - option "rainbow" [selected]
                - option "heat"
                - option "ice"
                - option "plasma"
                - option "white"
                - option "green"
                - option "performance"
                - option "balanced" [selected]
                - option "cinematic"
                - option "1"
                - option "2"
                - option "both" [selected]
              - group [ref=e74]:
                - generic "근접 궤적 · 목표 · 전체 설정 공유" [ref=e75] [cursor=pointer]
                - option "th1" [selected]
                - option "th2"
                - option "iw1"
                - option "iw2"
                - option "alternating" [selected]
                - option "symmetric"
                - option "random"
                - option "normalized"
                - option "초기조건 민감도" [selected]
                - option "주기 운동과 혼돈 비교"
                - option "적분기 에너지 오차"
                - option "푸앵카레 구조"
                - option "choose" [selected]
                - option "reference"
                - option "perturb"
                - option "observe"
                - option "measure"
                - option "explain"
                - option "reference" [selected]
                - option "perturbed"
                - option "ensemble"
              - group [ref=e76]:
                - generic "3D 위상공간 · 회전·좌표 선택" [ref=e77] [cursor=pointer]
              - group [ref=e78]:
                - generic "위상 방문 누적 · θ₁/ω₁" [ref=e79] [cursor=pointer]
  - contentinfo [ref=e80]:
    - paragraph [ref=e81]: Pendulum Lab · 움직임을 이해하고, 질문을 실험으로.
    - link "컴포넌트 갤러리" [ref=e82] [cursor=pointer]:
      - /url: ./next.html?gallery=components
    - button "명령 검색 (Ctrl/⌘ K)" [ref=e84] [cursor=pointer]
    - generic [ref=e85]:
      - generic [ref=e86]: 표시 언어
      - combobox "표시 언어" [ref=e87]:
        - option "한국어" [selected]
        - option "English"
    - group [ref=e88]:
      - generic "브라우저 스크립트 API" [ref=e89] [cursor=pointer]
```

# Test source

```ts
  8   |   return (url) =>
  9   |     url.pathname === `/src/product/app/${source}.ts` || new RegExp(`/assets/${name}-[^/]+\\.js$`).test(url.pathname);
  10  | }
  11  | 
  12  | async function ready(page: Page, space: 'learn' | 'lab'): Promise<void> {
  13  |   await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'ready');
  14  |   await expect(page.getByRole('main')).toHaveCount(1);
  15  |   await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  16  |   await expect(
  17  |     page.getByRole('navigation', { name: '주요 공간' }).getByRole('link', {
  18  |       name: space === 'learn' ? '배우기' : '실험실',
  19  |       exact: true
  20  |     })
  21  |   ).toHaveAttribute('aria-current', 'page');
  22  | }
  23  | 
  24  | async function chooseSpace(page: Page, space: 'learn' | 'lab'): Promise<void> {
  25  |   await page
  26  |     .getByRole('navigation', { name: '주요 공간' })
  27  |     .getByRole('link', { name: space === 'learn' ? '배우기' : '실험실', exact: true })
  28  |     .click();
  29  |   await ready(page, space);
  30  | }
  31  | 
  32  | async function audit(page: Page): Promise<void> {
  33  |   const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  34  |   expect(
  35  |     result.violations.map((item) => ({
  36  |       id: item.id,
  37  |       impact: item.impact,
  38  |       targets: item.nodes.map((node) => node.target)
  39  |     }))
  40  |   ).toEqual([]);
  41  | }
  42  | 
  43  | test.describe('S04 parallel application shell', () => {
  44  |   test('retains a deep URL and recovery guidance when the entry script cannot load', async ({ page }) => {
  45  |     const entry = (url: URL) =>
  46  |       url.pathname === '/src/product/app/entry.ts' || /\/assets\/next-[^/]+\.js$/.test(url.pathname);
  47  |     await page.route(entry, (route) => route.abort('failed'));
  48  |     const hash = '#/lab/double';
  49  |     await page.goto(`/next.html${hash}`, { waitUntil: 'domcontentloaded' });
  50  |     await expect(page.locator('#product-root')).toHaveAttribute('data-bootstrap-state', 'loading');
  51  |     await expect(page.getByRole('status')).toContainText('브라우저에서 새로고침');
  52  |     await expect(page.getByRole('link', { name: '기존 앱 열기' })).toBeVisible();
  53  |     await expect(page.getByRole('link')).toHaveCount(1);
  54  |     expect(new URL(page.url()).hash).toBe(hash);
  55  |     await page.unroute(entry);
  56  |     await page.reload();
  57  |     await ready(page, 'lab');
  58  |     expect(new URL(page.url()).hash).toBe(hash);
  59  |   });
  60  | 
  61  |   test('opens Learn by default and preserves browser back, forward and reload', async ({ page }) => {
  62  |     const pageErrors: string[] = [];
  63  |     const consoleErrors: string[] = [];
  64  |     page.on('pageerror', (error) => pageErrors.push(error.message));
  65  |     page.on('console', (message) => {
  66  |       if (message.type() === 'error') consoleErrors.push(message.text());
  67  |     });
  68  |     await page.goto('/next.html');
  69  |     await ready(page, 'learn');
  70  |     await expect(page.locator('#product-root')).toHaveCSS('display', 'flex');
  71  |     await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(246, 247, 242)');
  72  |     await expect(page).toHaveURL(/\/next\.html#\/learn$/);
  73  |     await expect(page).toHaveTitle('배우기 | Pendulum Lab');
  74  |     await chooseSpace(page, 'lab');
  75  |     await expect(page).toHaveURL(/#\/lab$/);
  76  |     await expect(page).toHaveTitle('실험실 | Pendulum Lab');
  77  |     await page.reload();
  78  |     await ready(page, 'lab');
  79  |     await page.goBack();
  80  |     await ready(page, 'learn');
  81  |     await expect(page).toHaveURL(/#\/learn$/);
  82  |     await page.goForward();
  83  |     await ready(page, 'lab');
  84  |     await expect(page).toHaveURL(/#\/lab$/);
  85  |     expect(pageErrors).toEqual([]);
  86  |     expect(consoleErrors).toEqual([]);
  87  |   });
  88  | 
  89  |   test('opens and reloads every route family without pretending future content is available', async ({ page }) => {
  90  |     for (const [hash, space] of [
  91  |       ['#/learn', 'learn'],
  92  |       ['#/learn/course-1', 'learn'],
  93  |       ['#/learn/course-8/8.12', 'learn'],
  94  |       ['#/lab', 'lab'],
  95  |       ['#/lab/double', 'lab'],
  96  |       ['#/lab/quantum-kicked-rotor', 'lab']
  97  |     ] as const) {
  98  |       await test.step(hash, async () => {
  99  |         await page.goto(`/next.html${hash}`);
  100 |         await ready(page, space);
  101 |         const heading = await page.getByRole('heading', { level: 1 }).textContent();
  102 |         await page.reload();
  103 |         await ready(page, space);
  104 |         expect(new URL(page.url()).hash).toBe(hash);
  105 |         await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading!);
  106 |         if (hash !== '#/learn' && hash !== '#/lab') {
  107 |           await expect(page.locator('#product-main')).toContainText(/준비|예정|아직|제공/);
> 108 |           await expect(page.locator('#product-main canvas')).toHaveCount(0);
      |                                                              ^ Error: expect(locator).toHaveCount(expected) failed
  109 |         }
  110 |       });
  111 |     }
  112 |   });
  113 | 
  114 |   test('validates shared experiment routes without starting or persisting an experiment', async ({ page }) => {
  115 |     const shared = createExperimentRoute(experimentFixture());
  116 |     if (!shared.ok) throw new Error('The existing S03 fixture must produce a valid share.');
  117 |     await page.goto(`/next.html${shared.value}`);
  118 |     await ready(page, 'lab');
  119 |     await expect(page.locator('#product-main')).toContainText(/공유/);
  120 |     expect(new URL(page.url()).hash).toBe(shared.value);
  121 |     await page.reload();
  122 |     await ready(page, 'lab');
  123 |     expect(new URL(page.url()).hash).toBe(shared.value);
  124 | 
  125 |     const mismatch = shared.value.replace('#/lab/double?', '#/lab/compound-double?');
  126 |     await page.goto(`/next.html${mismatch}`);
  127 |     await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'invalid-route');
  128 |     expect(new URL(page.url()).hash).toBe(mismatch);
  129 |     await expect(page.locator('#product-main')).not.toContainText(shared.value.split('state=')[1]!);
  130 |   });
  131 | 
  132 |   test('keeps unknown and malformed URLs intact and offers working navigation', async ({ page }) => {
  133 |     for (const hash of ['#/missing', '#/learn/course-9', '#/lab/%64ouble', '#/lab/double?state=pe1.bm90LWpzb24']) {
  134 |       await test.step(hash, async () => {
  135 |         await page.goto(`/next.html${hash}`);
  136 |         await expect(page.locator('#product-main')).toHaveAttribute('data-product-state', 'invalid-route');
  137 |         expect(new URL(page.url()).hash).toBe(hash);
  138 |         await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  139 |         await expect(page.getByRole('alert')).toBeVisible();
  140 |         await expect(page.locator('#product-main')).not.toContainText(hash);
  141 |         await chooseSpace(page, 'learn');
  142 |         await expect(page).toHaveURL(/#\/learn$/);
  143 |       });
  144 |     }
  145 |   });
  146 | 
  147 |   test('keeps user storage unchanged and never loads the legacy runtime', async ({ page }) => {
  148 |     await page.addInitScript(() => {
  149 |       localStorage.setItem('pendulum-lab/s04-preservation-fixture', '{"opaque":"keep-original"}');
  150 |       sessionStorage.setItem('pendulum-lab/s04-session-fixture', 'keep-original-session');
  151 |       (window as unknown as { __s04StorageBefore: unknown }).__s04StorageBefore = {
  152 |         local: Object.fromEntries(
  153 |           Object.keys(localStorage)
  154 |             .sort()
  155 |             .map((key) => [key, localStorage.getItem(key)])
  156 |         ),
  157 |         session: Object.fromEntries(
  158 |           Object.keys(sessionStorage)
  159 |             .sort()
  160 |             .map((key) => [key, sessionStorage.getItem(key)])
  161 |         )
  162 |       };
  163 |     });
  164 |     const requests: string[] = [];
  165 |     page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  166 |     await page.goto('/next.html#/learn');
  167 |     await ready(page, 'learn');
  168 |     const snapshot = () =>
  169 |       page.evaluate(() => ({
  170 |         local: Object.fromEntries(
  171 |           Object.keys(localStorage)
  172 |             .sort()
  173 |             .map((key) => [key, localStorage.getItem(key)])
  174 |         ),
  175 |         session: Object.fromEntries(
  176 |           Object.keys(sessionStorage)
  177 |             .sort()
  178 |             .map((key) => [key, sessionStorage.getItem(key)])
  179 |         )
  180 |       }));
  181 |     const before = await page.evaluate(() => (window as unknown as { __s04StorageBefore: unknown }).__s04StorageBefore);
  182 |     expect(await snapshot()).toEqual(before);
  183 |     await chooseSpace(page, 'lab');
  184 |     await chooseSpace(page, 'learn');
  185 |     await page.reload();
  186 |     await ready(page, 'learn');
  187 |     expect(await snapshot()).toEqual(before);
  188 |     expect(
  189 |       await page.evaluate(() =>
  190 |         ['__modernLab', '__modernShell', 'PendulumRuntime', 'PendulumLabIndex'].filter((key) => key in window)
  191 |       )
  192 |     ).toEqual([]);
  193 |     expect(
  194 |       requests.filter((path) => /\/src\/(main\.ts|app\/|physics\/|chaos\/|runtime\/|workers\/|research\/)/.test(path))
  195 |     ).toEqual([]);
  196 |     // Curriculum declarations share the research/chaos prefix but contain no
  197 |     // runtime kernels. Keep every original runtime/worker-prefix prohibition,
  198 |     // exempting only these two exact data chunks. Imported engines still get
  199 |     // separate physics/chaos/research chunks from Vite's manualChunks policy.
  200 |     expect(
  201 |       requests.filter(
  202 |         (path) =>
  203 |           /\/assets\/(?:app|physics|chaos|research|.*worker)-/.test(path) &&
  204 |           !/\/assets\/(?:research|chaos)-focus-definitions-[A-Za-z0-9_-]{8}\.js$/.test(path)
  205 |       )
  206 |     ).toEqual([]);
  207 |   });
  208 | 
```