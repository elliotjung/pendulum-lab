# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: redesign\constraint-pendulum.spec.ts >> S11 spring, rope and double-string laboratory >> frozen light/dark spring and slack rope layouts
- Location: e2e\redesign\constraint-pendulum.spec.ts:432:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  Expected an image 1280px by 2767px, received 1280px by 2857px. 165317 pixels (ratio 0.05 of all image pixels) are different.

  Snapshot: s11-spring-inspector-dark.png

Call log:
  - Expect "toHaveScreenshot(s11-spring-inspector-dark.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - Expected an image 1280px by 2767px, received 1280px by 2857px. 165317 pixels (ratio 0.05 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - Expected an image 1280px by 2767px, received 1280px by 2857px. 165317 pixels (ratio 0.05 of all image pixels) are different.

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
        - option "밝게"
        - option "어둡게" [selected]
        - option "기기 설정"
    - link "기존 앱 열기" [ref=e14] [cursor=pointer]:
      - /url: ./app.html
  - main [ref=e15]:
    - generic [ref=e16]:
      - link "시스템 라이브러리" [ref=e17] [cursor=pointer]:
        - /url: "#/lab"
      - paragraph [ref=e18]: LAB · 유연·구속 계
      - heading "용수철 진자" [level=1] [ref=e19]
      - paragraph [ref=e20]: 반지름 변형과 각운동이 결합된 Hooke 용수철 진자.
      - paragraph [ref=e21]: 탄성력은 인장을 양수, 압축을 음수로 표시합니다. 길이 r=0은 극좌표 특이점입니다. 화면 이동 시 계산을 종료하고 설정만 보존합니다.
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
            - paragraph [ref=e39]: 0.0% · 1개 표본
          - paragraph [ref=e40]: 기록 간격 2단계 (0.004000 s) · 최대 2001개 표본. 사건은 모든 적분 단계에서 수집합니다. CSV에 마지막 수신 상태를 포함합니다.
      - generic [ref=e41]:
        - tablist "실험실 패널" [ref=e42]:
          - tab "작업 공간" [ref=e43] [cursor=pointer]
          - tab "조건" [active] [selected] [ref=e44] [cursor=pointer]
          - tab "분석" [ref=e45] [cursor=pointer]
          - tab "보관함" [ref=e46] [cursor=pointer]
          - tab "내보내기" [ref=e47] [cursor=pointer]
        - tabpanel "조건" [ref=e48]:
          - region "실험 조건" [ref=e49]:
            - heading "실험 조건" [level=2] [ref=e50]
            - paragraph [ref=e51]: 물성과 초기조건을 편집하면 처음부터 다시 실행합니다. θ는 아래 수직선 기준 절대각입니다.
            - generic [ref=e52]:
              - generic [ref=e53]:
                - generic [ref=e54]: 탄성 운동 프리셋
                - combobox "탄성 운동 프리셋" [ref=e55]:
                  - option "기본 설정" [selected]
                  - option "방사 방향 진동"
                  - option "압축된 용수철"
              - button "프리셋 적용" [ref=e56] [cursor=pointer]
              - generic [ref=e57]:
                - generic [ref=e58]:
                  - generic [ref=e59]: 질량 · m (kg)
                  - textbox "질량 · m (kg)" [ref=e60]: "1"
                  - paragraph [ref=e61]: "질점의 질량입니다. 장력은 N, 에너지는 J로 표시합니다. 범위: 0.001–1000 kg. 기본값: 1 kg."
                - generic [ref=e62]:
                  - generic [ref=e63]: 용수철 상수 · k (N/m)
                  - textbox "용수철 상수 · k (N/m)" [ref=e64]: "40"
                  - paragraph [ref=e65]: "Hooke 법칙의 힘 상수입니다. 범위: 0–100000 N/m. 기본값: 40 N/m."
                - generic [ref=e66]:
                  - generic [ref=e67]: 자연 길이 · ℓ₀ (m)
                  - textbox "자연 길이 · ℓ₀ (m)" [ref=e68]: "1"
                  - paragraph [ref=e69]: "탄성력이 0인 길이입니다. 범위: 0.001–1000 m. 기본값: 1 m."
                - generic [ref=e70]:
                  - generic [ref=e71]: 중력 가속도 · g (m/s^2)
                  - textbox "중력 가속도 · g (m/s^2)" [ref=e72]: "9.81"
                  - paragraph [ref=e73]: "아래 방향의 중력 가속도입니다. 범위: 0–1000 m/s^2. 기본값: 9.81 m/s^2."
                - generic [ref=e74]:
                  - generic [ref=e75]: 시작 길이 · r₀ (m)
                  - textbox "시작 길이 · r₀ (m)" [ref=e76]: "1.3"
                  - paragraph [ref=e77]: "고정점과 질점 사이 거리입니다. 0은 좌표 특이점입니다. 범위: 0.000002–10000 m. 기본값: 1.3 m."
                - generic [ref=e78]:
                  - generic [ref=e79]: 시작 각도 · θ₀ (rad)
                  - textbox "시작 각도 · θ₀ (rad)" [ref=e80]: "0.4"
                  - paragraph [ref=e81]: "아래 수직선 기준 각도입니다. 범위: -10000–10000 rad. 기본값: 0.4 rad."
                  - combobox "표시 단위 · θ₀" [ref=e82]:
                    - option "rad" [selected]
                    - option "deg"
                - generic [ref=e83]:
                  - generic [ref=e84]: 시작 반지름 속도 · ṙ₀ (m/s)
                  - textbox "시작 반지름 속도 · ṙ₀ (m/s)" [ref=e85]: "0"
                  - paragraph [ref=e86]: "양수이면 용수철 길이가 증가합니다. 범위: -10000–10000 m/s. 기본값: 0 m/s."
                - generic [ref=e87]:
                  - generic [ref=e88]: 시작 각속도 · ω₀ (rad/s)
                  - textbox "시작 각속도 · ω₀ (rad/s)" [ref=e89]: "0"
                  - paragraph [ref=e90]: "각도의 시간 변화율입니다. 범위: -10000–10000 rad/s. 기본값: 0 rad/s."
                  - combobox "표시 단위 · ω₀" [ref=e91]:
                    - option "rad/s" [selected]
                    - option "deg/s"
              - heading "실행과 기록" [level=3] [ref=e92]
              - generic [ref=e93]:
                - generic [ref=e94]:
                  - generic [ref=e95]: 관찰 시간 · t (s)
                  - textbox "관찰 시간 · t (s)" [ref=e96]: "8"
                  - paragraph [ref=e97]: "초기조건부터 계산할 시간입니다. 범위: 0.000001–300 s. 기본값: 8 s."
                - generic [ref=e98]:
                  - generic [ref=e99]: 시간 간격 · Δt (s)
                  - textbox "시간 간격 · Δt (s)" [ref=e100]: "0.002"
                  - paragraph [ref=e101]: "적분 간격입니다. 강한 용수철에서는 간격을 줄이세요. 범위: 0.000001–0.05 s. 기본값: 0.002 s."
                - generic [ref=e102]:
                  - generic [ref=e103]: 기록 간격 (단계 수) · stride (1)
                  - textbox "기록 간격 (단계 수) · stride (1)" [ref=e104]: "1"
                  - paragraph [ref=e105]: "큰 실행에서는 표본 수를 추가로 제한합니다. 사건 목록은 각 단계에서 별도로 수집합니다. 범위: 1–100000 1. 기본값: 1 1."
              - generic [ref=e106]:
                - generic [ref=e107]: 적분기
                - combobox "적분기" [ref=e108]:
                  - option "RK4" [selected]
                  - option "RK2"
                  - option "Euler"
              - status
              - paragraph [ref=e109]: 각도는 아래 수직선 기준 rad, 위치는 고정점 기준 m(위쪽 y 양수), 에너지는 J, 장력은 N입니다. 용수철 힘 k(r−L₀)는 압축 시 음수입니다. 원점 근처의 극좌표 특이점에서는 계산을 중지합니다.
  - contentinfo [ref=e110]:
    - paragraph [ref=e111]: Pendulum Lab · 움직임을 이해하고, 질문을 실험으로.
    - link "컴포넌트 갤러리" [ref=e112] [cursor=pointer]:
      - /url: ./next.html?gallery=components
    - button "명령 검색 (Ctrl/⌘ K)" [ref=e114] [cursor=pointer]
    - generic [ref=e115]:
      - generic [ref=e116]: 표시 언어
      - combobox "표시 언어" [ref=e117]:
        - option "한국어" [selected]
        - option "English"
    - group [ref=e118]:
      - generic "브라우저 스크립트 API" [ref=e119] [cursor=pointer]
```

# Test source

```ts
  1  | import { expect, type Page } from '@playwright/test';
  2  | 
  3  | // S28 additions are tested in compatibility-tools/controls, product-setup,
  4  | // phase-views, structure-methods, runtime-parity, locale and browser-api.
  5  | // Keep every historical control and plot.
  6  | const additivePanels = [
  7  |   '.lab-diagnostics',
  8  |   '#legacy-playback',
  9  |   '#compatibility-tools',
  10 |   '#run-history',
  11 |   '#native-display',
  12 |   '#native-setup',
  13 |   '#native-phase-space',
  14 |   '#native-phase-density',
  15 |   '#structure-diagnostics',
  16 |   '#runtime-acceleration',
  17 |   '.product-footer > .product-command-host',
  18 |   '.product-footer > .product-locale-control',
  19 |   '.product-footer > #product-browser-api'
  20 | ].join(',');
  21 | 
  22 | /** Compare the historical panels against their frozen PNGs. The added docks have
  23 |  * dedicated light/dark, mobile and accessibility coverage in their own specs.
  24 |  */
  25 | export async function expectLegacyPanelScreenshot(page: Page, name: string) {
  26 |   const docks = await page.locator(additivePanels).elementHandles();
  27 |   if (!docks.length) {
  28 |     await expect(page).toHaveScreenshot(name, { fullPage: true });
  29 |     return;
  30 |   }
  31 |   // Production CSP rejects injected inline screenshot styles. Move only the
  32 |   // named additions during the old-panel comparison, then restore the same nodes.
  33 |   const placeholders = [];
  34 |   try {
  35 |     for (const dock of docks) {
  36 |       placeholders.push(
  37 |         await dock.evaluateHandle((node) => {
  38 |           const marker = document.createComment('additive panel snapshot placeholder');
  39 |           node.parentNode!.replaceChild(marker, node);
  40 |           return marker;
  41 |         })
  42 |       );
  43 |     }
> 44 |     await expect(page).toHaveScreenshot(name, { fullPage: true });
     |                        ^ Error: expect(page).toHaveScreenshot(expected) failed
  45 |   } finally {
  46 |     for (let i = 0; i < placeholders.length; i++) {
  47 |       await placeholders[i]!.evaluate((marker, original) => marker.replaceWith(original), docks[i]!);
  48 |       await placeholders[i]!.dispose();
  49 |     }
  50 |     for (const dock of docks) await dock.dispose();
  51 |   }
  52 | }
  53 | 
```