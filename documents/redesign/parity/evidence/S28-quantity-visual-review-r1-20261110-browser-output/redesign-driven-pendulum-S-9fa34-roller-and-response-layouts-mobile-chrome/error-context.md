# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: redesign\driven-pendulum.spec.ts >> S13 driven and controlled systems laboratory >> frozen driven workspace, cart-pole controller and response layouts
- Location: e2e\redesign\driven-pendulum.spec.ts:371:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  Expected an image 393px by 7180px, received 393px by 7408px. 202591 pixels (ratio 0.07 of all image pixels) are different.

  Snapshot: s13-cartpole-controller-dark.png

Call log:
  - Expect "toHaveScreenshot(s13-cartpole-controller-dark.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - Expected an image 393px by 7180px, received 393px by 7408px. 202591 pixels (ratio 0.07 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - Expected an image 393px by 7180px, received 393px by 7408px. 202591 pixels (ratio 0.07 of all image pixels) are different.

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
      - paragraph [ref=e18]: LAB · 구동과 제어
      - heading "카트폴" [level=1] [ref=e19]
      - paragraph [ref=e20]: 카트와 위쪽 진자의 결합 운동에 외력·파형·상태 피드백을 적용한다.
      - paragraph [ref=e21]: 시간은 s, 길이는 m, 각도는 rad입니다. 역진자·cart-pole의 θ=0은 수직 위, 나머지 진자의 θ=0은 수직 아래입니다. 화면 이동 시 계산을 종료하고 초기조건만 보존합니다.
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
          - paragraph [ref=e40]: 기록 간격 2단계 (0.004000 s) · 최대 2001개 표본. 마지막 수신 상태를 CSV에 포함합니다.
      - generic [ref=e41]:
        - tablist "실험실 패널" [ref=e42]:
          - tab "작업 공간" [ref=e43] [cursor=pointer]
          - tab "조건" [selected] [ref=e44] [cursor=pointer]
          - tab "분석" [ref=e45] [cursor=pointer]
          - tab "보관함" [ref=e46] [cursor=pointer]
          - tab "내보내기" [ref=e47] [cursor=pointer]
        - tabpanel "조건" [ref=e48]:
          - region "실험 조건" [ref=e49]:
            - heading "실험 조건" [level=2] [ref=e50]
            - paragraph [ref=e51]: 플랜트와 구동·제어 설정을 따로 편집한 뒤 조건 적용을 선택하세요. 적용하면 초기조건부터 시작합니다.
            - generic [ref=e52]:
              - group "플랜트" [ref=e53]:
                - generic [ref=e54]: 플랜트
                - paragraph [ref=e55]: 물리 계의 길이·중력·감쇠·결합을 설정합니다. 구동과 제어는 별도 패널에 있습니다.
                - generic [ref=e56]:
                  - generic [ref=e57]:
                    - generic [ref=e58]: 수레 질량 · cartMass (kg)
                    - textbox "수레 질량 · cartMass (kg)" [ref=e59]: "1"
                    - paragraph [ref=e60]: "SI 값입니다. 범위: 0.001–1000 kg. 기본값: 1 kg."
                  - generic [ref=e61]:
                    - generic [ref=e62]: 막대 질량 · poleMass (kg)
                    - textbox "막대 질량 · poleMass (kg)" [ref=e63]: "0.16"
                    - paragraph [ref=e64]: "SI 값입니다. 범위: 0.001–1000 kg. 기본값: 0.16 kg."
                  - generic [ref=e65]:
                    - generic [ref=e66]: 길이 · length (m)
                    - textbox "길이 · length (m)" [ref=e67]: "0.75"
                    - paragraph [ref=e68]: "SI 값입니다. 범위: 0.001–1000 m. 기본값: 0.75 m."
                  - generic [ref=e69]:
                    - generic [ref=e70]: 중력 가속도 · g (m/s^2)
                    - textbox "중력 가속도 · g (m/s^2)" [ref=e71]: "9.81"
                    - paragraph [ref=e72]: "SI 값입니다. 범위: 0–1000 m/s^2. 기본값: 9.81 m/s^2."
                  - generic [ref=e73]:
                    - generic [ref=e74]: 일정 외력 · force (N)
                    - textbox "일정 외력 · force (N)" [ref=e75]: "0"
                    - paragraph [ref=e76]: "SI 값입니다. 범위: -1000–1000 N. 기본값: 0 N."
                  - generic [ref=e77]:
                    - generic [ref=e78]: 수레 마찰 · friction (N*s/m)
                    - textbox "수레 마찰 · friction (N*s/m)" [ref=e79]: "0"
                    - paragraph [ref=e80]: "SI 값입니다. 범위: 0–1000 N*s/m. 기본값: 0 N*s/m."
              - group "초기조건" [ref=e81]:
                - generic [ref=e82]: 초기조건
                - paragraph [ref=e83]: 각도·각속도는 SI 단위입니다. 진행 위상 ψ와 구동 위상 오프셋 φ₀는 서로 다른 값이며 함께 저장합니다.
                - generic [ref=e84]:
                  - generic [ref=e85]:
                    - generic [ref=e86]: 수레 위치 · state-0 (m)
                    - textbox "수레 위치 · state-0 (m)" [ref=e87]: "0"
                    - paragraph [ref=e88]: "x의 초기값입니다. 범위: -10000–10000 m. 기본값: 0 m."
                  - generic [ref=e89]:
                    - generic [ref=e90]: 수직 위 기준 각도 · state-1 (rad)
                    - textbox "수직 위 기준 각도 · state-1 (rad)" [ref=e91]: "0.12"
                    - paragraph [ref=e92]: "theta의 초기값입니다. 범위: -10000–10000 rad. 기본값: 0.12 rad."
                    - combobox "표시 단위 · state-1" [ref=e93]:
                      - option "rad" [selected]
                      - option "deg"
                  - generic [ref=e94]:
                    - generic [ref=e95]: 수레 속도 · state-2 (m/s)
                    - textbox "수레 속도 · state-2 (m/s)" [ref=e96]: "0"
                    - paragraph [ref=e97]: "v의 초기값입니다. 범위: -10000–10000 m/s. 기본값: 0 m/s."
                  - generic [ref=e98]:
                    - generic [ref=e99]: 각속도 · state-3 (rad/s)
                    - textbox "각속도 · state-3 (rad/s)" [ref=e100]: "0"
                    - paragraph [ref=e101]: "omega의 초기값입니다. 범위: -10000–10000 rad/s. 기본값: 0 rad/s."
                    - combobox "표시 단위 · state-3" [ref=e102]:
                      - option "rad/s" [selected]
                      - option "deg/s"
              - group "구동 신호" [ref=e103]:
                - generic [ref=e104]: 구동 신호
                - paragraph [ref=e105]: "sine: sin(ψ+φ₀), square: sign(sin), triangle: 2·asin(sin)/π. cart-pole은 ψ=Ωt이며 나머지는 저장된 진행 위상을 적분합니다. Ω는 각주파수 rad/s입니다. 기본 φ₀=π/2는 기존 cos 구동과 같습니다."
                - generic [ref=e106]:
                  - generic [ref=e107]:
                    - generic [ref=e108]: 파형
                    - combobox "파형" [ref=e109]:
                      - option "정현파 · sine" [selected]
                      - option "사각파 · square"
                      - option "삼각파 · triangle"
                  - generic [ref=e110]:
                    - generic [ref=e111]: 구동 진폭 · amplitude (N)
                    - textbox "구동 진폭 · amplitude (N)" [ref=e112]: "0"
                    - paragraph [ref=e113]: "SI 값입니다. 범위: 0–1000 N. 기본값: 0 N."
                  - generic [ref=e114]:
                    - generic [ref=e115]: 구동 각주파수 Ω · frequency (rad/s)
                    - textbox "구동 각주파수 Ω · frequency (rad/s)" [ref=e116]: "1"
                    - paragraph [ref=e117]: "시간 주기 T=2π/Ω입니다. 범위: 0–1000 rad/s. 기본값: 1 rad/s."
                    - combobox "표시 단위 · frequency" [ref=e118]:
                      - option "rad/s" [selected]
                      - option "deg/s"
                  - generic [ref=e119]:
                    - generic [ref=e120]: 구동 위상 오프셋 φ₀ · phase (rad)
                    - textbox "구동 위상 오프셋 φ₀ · phase (rad)" [ref=e121]: "1.5707963267948966"
                    - paragraph [ref=e122]: "SI 값입니다. 범위: -10000–10000 rad. 기본값: 1.5707963267948966 rad."
                    - combobox "표시 단위 · phase" [ref=e123]:
                      - option "rad" [selected]
                      - option "deg"
              - group "제어기" [ref=e124]:
                - generic [ref=e125]: 제어기
                - paragraph [ref=e126]: 수레 위치 기준값 xref를 사용합니다. 수직 위 각도 목표는 0 rad입니다. u=kp·θ+kd·ω+kx·(x−xref)+kv·v (N), 이후 출력 포화를 적용합니다.
                - generic [ref=e127]:
                  - generic [ref=e128]: 제어기 사용
                  - checkbox "제어기 사용" [checked] [ref=e129]
                  - generic [ref=e130]:
                    - generic [ref=e131]: 피드백 이득 kp · kp (N/rad)
                    - textbox "피드백 이득 kp · kp (N/rad)" [ref=e132]: "40"
                    - paragraph [ref=e133]: "제어식의 출력 단위는 N입니다. kp:N/rad, kd:N·s/rad, kx:N/m, kv:N·s/m. 범위: 0–10000 N/rad. 기본값: 40 N/rad."
                  - generic [ref=e134]:
                    - generic [ref=e135]: 피드백 이득 kd · kd (N*s/rad)
                    - textbox "피드백 이득 kd · kd (N*s/rad)" [ref=e136]: "10"
                    - paragraph [ref=e137]: "제어식의 출력 단위는 N입니다. kp:N/rad, kd:N·s/rad, kx:N/m, kv:N·s/m. 범위: 0–10000 N*s/rad. 기본값: 10 N*s/rad."
                  - generic [ref=e138]:
                    - generic [ref=e139]: 피드백 이득 kx · kx (N/m)
                    - textbox "피드백 이득 kx · kx (N/m)" [ref=e140]: "1"
                    - paragraph [ref=e141]: "제어식의 출력 단위는 N입니다. kp:N/rad, kd:N·s/rad, kx:N/m, kv:N·s/m. 범위: 0–10000 N/m. 기본값: 1 N/m."
                  - generic [ref=e142]:
                    - generic [ref=e143]: 피드백 이득 kv · kv (N*s/m)
                    - textbox "피드백 이득 kv · kv (N*s/m)" [ref=e144]: "2"
                    - paragraph [ref=e145]: "제어식의 출력 단위는 N입니다. kp:N/rad, kd:N·s/rad, kx:N/m, kv:N·s/m. 범위: 0–10000 N*s/m. 기본값: 2 N*s/m."
                  - generic [ref=e146]:
                    - generic [ref=e147]: 수레 위치 기준값 · reference (m)
                    - textbox [ref=e148]: "0"
                    - paragraph [ref=e149]: "SI 값입니다. 범위: -100–100 m. 기본값: 0 m."
                  - generic [ref=e150]:
                    - generic [ref=e151]: 최대 출력 · maxOutput (N)
                    - textbox "최대 출력 · maxOutput (N)" [ref=e152]: "50"
                    - paragraph [ref=e153]: "제어기 출력만 ±최대 출력 (N) 범위입니다. 총 힘은 일정 외력+구동+제어 출력입니다. 범위: 0.001–1000 N. 기본값: 50 N."
              - group "공통 실행 조건" [ref=e154]:
                - generic [ref=e155]: 공통 실행 조건
                - paragraph [ref=e156]: 시간 간격을 줄여 결과 수렴을 확인하세요. 사각파 모서리에서는 고차 적분기의 수렴 차수가 낮아질 수 있습니다.
                - generic [ref=e157]:
                  - generic [ref=e158]:
                    - generic [ref=e159]: 관찰 시간 · duration (s)
                    - textbox "관찰 시간 · duration (s)" [ref=e160]: "8"
                    - paragraph [ref=e161]: "SI 값입니다. 범위: 0.000001–300 s. 기본값: 8 s."
                  - generic [ref=e162]:
                    - generic [ref=e163]: 시간 간격 · step (s)
                    - textbox "시간 간격 · step (s)" [ref=e164]: "0.002"
                    - paragraph [ref=e165]: "SI 값입니다. 범위: 0.000001–0.05 s. 기본값: 0.002 s."
                  - generic [ref=e166]:
                    - generic [ref=e167]: 기록 간격 (단계 수) · sampleEvery (1)
                    - textbox "기록 간격 (단계 수) · sampleEvery (1)" [ref=e168]: "1"
                    - paragraph [ref=e169]: "최대 2,001개 표본으로 추가 축약합니다. 범위: 1–100000 1. 기본값: 1 1."
                  - generic [ref=e170]:
                    - generic [ref=e171]: 적분기
                    - combobox "적분기" [ref=e172]:
                      - option "RK4" [selected]
                      - option "RK2"
                      - option "Euler"
              - generic [ref=e173]:
                - button "조건 적용" [active] [ref=e174] [cursor=pointer]
                - button "편집 취소" [disabled] [ref=e175]
                - button "기본 예제 복원" [ref=e176] [cursor=pointer]
              - status [ref=e177]: 조건을 적용했습니다. 초기조건부터 실행할 수 있습니다.
              - paragraph [ref=e178]: SI 단위와 rad를 사용합니다. 구동 주파수 Ω는 rad/s이며 Hz가 아닙니다. sine는 sin(ψ+φ₀), square는 그 부호, triangle은 2 asin(sin(ψ+φ₀))/π입니다. driven·parametric의 ψ는 저장되는 진행 위상입니다. φ₀는 별도 위상 오프셋이며 기본 π/2는 기존 cos ψ 구동을 재현합니다. cart-pole의 ψ=Ωt는 절대 시작 시간을 사용합니다. 표시 에너지는 기존 엔진의 기계적 진단값(J)입니다. 구동·감쇠·제어가 있으면 보존되지 않으며 에너지 변화량을 적분 오차로 해석하지 마세요. 기존 cart-pole 운동방정식의 4/3 관성 계수와 질점 bob 에너지 진단값은 서로 다른 관성 근사를 사용합니다. 이 에너지로 보존 정확도를 판정하지 마세요. θ=0은 위쪽이며 x는 카트 위치입니다. 선형 상태 피드백은 국소 안정화 예제이며 전역 안정성을 보장하지 않습니다. 출력은 ±maxOutput으로 포화되며, 제어 중 수직선 기준 각오차가 π/2를 넘으면 마지막 유효 상태에서 안전 중지합니다.
  - contentinfo [ref=e179]:
    - paragraph [ref=e180]: Pendulum Lab · 움직임을 이해하고, 질문을 실험으로.
    - link "컴포넌트 갤러리" [ref=e181] [cursor=pointer]:
      - /url: ./next.html?gallery=components
    - button "명령 검색 (Ctrl/⌘ K)" [ref=e183] [cursor=pointer]
    - generic [ref=e184]:
      - generic [ref=e185]: 표시 언어
      - combobox "표시 언어" [ref=e186]:
        - option "한국어" [selected]
        - option "English"
    - group [ref=e187]:
      - generic "브라우저 스크립트 API" [ref=e188] [cursor=pointer]
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