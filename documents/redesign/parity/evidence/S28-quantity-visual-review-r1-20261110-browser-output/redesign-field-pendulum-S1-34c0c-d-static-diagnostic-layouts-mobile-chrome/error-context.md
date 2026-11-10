# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: redesign\field-pendulum.spec.ts >> S16 stochastic lattice and field laboratory >> frozen spatial heatmaps ensemble and static diagnostic layouts
- Location: e2e\redesign\field-pendulum.spec.ts:344:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  Expected an image 393px by 3140px, received 393px by 5095px. 103816 pixels (ratio 0.06 of all image pixels) are different.

  Snapshot: s16-langevin-ensemble-light.png

Call log:
  - Expect "toHaveScreenshot(s16-langevin-ensemble-light.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - Expected an image 393px by 3140px, received 393px by 5095px. 103816 pixels (ratio 0.06 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - Expected an image 393px by 3140px, received 393px by 5095px. 103816 pixels (ratio 0.06 of all image pixels) are different.

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
      - paragraph [ref=e18]: LAB · 확률·격자·장
      - heading "시드 기반 랑주뱅 앙상블" [level=1] [ref=e19]
      - paragraph [ref=e20]: 정규화 단일 진자에서 가산·곱셈·행렬 잡음과 확률 해석을 선택해 seed 기반 앙상블을 계산합니다.
      - paragraph [ref=e21]: 주 실행의 시간·공간·상태·에너지는 정규화 값입니다. 독립 진단 패널은 각 표시 단위를 따릅니다. 화면을 떠나면 계산을 종료합니다. 저장한 초기 설정은 유지합니다.
      - link "기존 앱 열기" [ref=e22] [cursor=pointer]:
        - /url: ./app.html
      - region "실행 제어" [ref=e23]:
        - heading "실행 제어" [level=2] [ref=e24]
        - generic [ref=e25]:
          - status [ref=e26]: 실행 완료
          - generic [ref=e27]:
            - button "실행" [ref=e28] [cursor=pointer]
            - button "일시정지" [disabled] [ref=e29]
            - button "한 단계" [disabled] [ref=e30]
            - button "처음으로" [ref=e31] [cursor=pointer]
            - button "실행 취소" [disabled] [ref=e32]
          - generic [ref=e33]: 재생 속도
          - combobox "재생 속도" [ref=e34]:
            - option "0.25×"
            - option "1×" [selected]
            - option "4×"
          - status "현재 정규화 시간" [ref=e35]: τ = 0.2000 (정규화)
          - generic [ref=e36]:
            - generic [ref=e37]: 실행 진행
            - progressbar "실행 진행" [ref=e38]
            - paragraph [ref=e39]: 100.0% · 21개 기록
          - paragraph [ref=e40]: 기록 간격 1단계 · 최대 1001개 시각 · 1격자점 · 16member. 모든 적분 단계를 메모리에 보관하지 않습니다.
      - generic [ref=e41]:
        - tablist "실험실 패널" [ref=e42]:
          - tab "작업 공간" [ref=e43] [cursor=pointer]
          - tab "조건" [ref=e44] [cursor=pointer]
          - tab "분석" [active] [selected] [ref=e45] [cursor=pointer]
          - tab "보관함" [ref=e46] [cursor=pointer]
          - tab "내보내기" [ref=e47] [cursor=pointer]
        - tabpanel "분석" [ref=e48]:
          - region "분석" [ref=e49]:
            - heading "분석" [level=2] [ref=e50]
            - paragraph [ref=e51]: 주 실행 그래프의 축은 정규화 값입니다. 독립 이원자 진단은 SI 단위를 따릅니다. 기록 간격·해상도·모델 범위를 확인하세요.
            - generic [ref=e52]:
              - generic [ref=e53]: 그래프 종류
              - combobox "그래프 종류" [ref=e54]:
                - option "앙상블 평균과 산포" [selected]
                - option "개별 궤적"
                - option "현재 평균 프로필"
              - paragraph [ref=e55]: 가로축은 정규화 시간 τ, 세로축은 정규화 θ입니다. 청색 선은 member별 독립 seed로 얻은 θ의 평균, 갈색 선은 평균+표준편차, 녹색 선은 평균−표준편차입니다. 표준편차는 앙상블 산포이며 평균의 신뢰구간이 아닙니다. 유한 앙상블은 확률밀도 방정식의 해를 대신하지 않습니다.
              - img "앙상블 평균과 산포. 가로축 정규화 시간 τ, 세로축 θ (정규화). 수치 데이터는 분석 결과 또는 궤적 CSV에서 확인할 수 있습니다." [ref=e57]
              - paragraph [ref=e63]: 가로축은 정규화 시간 τ, 세로축은 정규화 θ입니다. 청색 선은 member별 독립 seed로 얻은 θ의 평균, 갈색 선은 평균+표준편차, 녹색 선은 평균−표준편차입니다. 표준편차는 앙상블 산포이며 평균의 신뢰구간이 아닙니다. 유한 앙상블은 확률밀도 방정식의 해를 대신하지 않습니다. 기록 21시각 · τ=0–0.2 · N=1 · fixed.
              - region "Arrhenius 탈출 시간" [ref=e64]:
                - heading "Arrhenius 탈출 시간" [level=3] [ref=e65]
                - generic [ref=e66]:
                  - paragraph [ref=e67]: 독립적인 정규화 장벽·시도율을 입력하는 native 근사식입니다. 위의 관성 확률 진자에서 장벽이나 시도율을 추정하지 않으며 탈출 경로·최적 잡음을 계산하지 않습니다. 활성화 에너지와 kT는 같은 에너지 단위를 사용하세요. 0/∞는 부동소수점 한계이며 유한한 물리량의 인증이 아닙니다.
                  - generic [ref=e68]:
                    - generic [ref=e69]:
                      - generic [ref=e70]: 시도율 r₀ (정규화 시간⁻¹)
                      - spinbutton "시도율 r₀ (정규화 시간⁻¹)" [ref=e71]: "1"
                      - paragraph [ref=e72]: 1e-12–1000000000000
                    - generic [ref=e73]:
                      - generic [ref=e74]: 활성화 에너지 Eₐ (정규화 에너지)
                      - spinbutton "활성화 에너지 Eₐ (정규화 에너지)" [ref=e75]: "0.25"
                      - paragraph [ref=e76]: 0–1000000
                    - generic [ref=e77]:
                      - generic [ref=e78]: 열 에너지 kT (같은 정규화 에너지)
                      - spinbutton "열 에너지 kT (같은 정규화 에너지)" [ref=e79]: "0.05"
                      - paragraph [ref=e80]: 1e-12–1000000
                  - button "Arrhenius 탈출 시간 계산" [ref=e81] [cursor=pointer]
                  - button "Arrhenius 탈출 시간 JSON 다운로드" [ref=e82] [cursor=pointer]
                  - generic "Arrhenius 탈출 시간 결과" [ref=e83]: "평균 탈출 시간 148.413159 (정규화 시간) 기존 계산 경계: arrheniusMTTF 평균 탈출 시간 (정규화) 148.413159"
              - region "확률 공명 · 독립 사차 이중 우물" [ref=e84]:
                - heading "확률 공명 · 독립 사차 이중 우물" [level=3] [ref=e85]
                - generic [ref=e86]:
                  - paragraph [ref=e87]: 위의 관성 진자와 독립적인 native 과감쇠 사차 이중 우물의 Itô 모델 dx=(x−x³+A cos Ωτ)dτ+σdW입니다. 모든 값은 정규화 값이며 σ 격자마다 응답 진폭·파워·우물 점유·전이를 측정합니다. 유한 표본의 최대를 보편적인 최적 잡음으로 단정하지 마세요.
                  - generic [ref=e88]:
                    - generic [ref=e89]:
                      - generic [ref=e90]: 구동 진폭 A
                      - spinbutton "구동 진폭 A" [ref=e91]: "0.2"
                      - paragraph [ref=e92]: "-0.38–0.38 (정규화)"
                    - generic [ref=e93]:
                      - generic [ref=e94]: 구동 각주파수 Ω
                      - spinbutton "구동 각주파수 Ω" [ref=e95]: "1"
                      - paragraph [ref=e96]: 0.01–10 (정규화)
                    - generic [ref=e97]:
                      - generic [ref=e98]: 적분 간격 Δτ
                      - spinbutton "적분 간격 Δτ" [ref=e99]: "0.02"
                      - paragraph [ref=e100]: 0.0001–0.05 (정규화)
                    - generic [ref=e101]:
                      - generic [ref=e102]: 측정 주기 수
                      - spinbutton "측정 주기 수" [ref=e103]: "4"
                      - paragraph [ref=e104]: 1–100 정수 (정규화)
                    - generic [ref=e105]:
                      - generic [ref=e106]: 버릴 과도 주기 수
                      - spinbutton "버릴 과도 주기 수" [ref=e107]: "2"
                      - paragraph [ref=e108]: 0–100 정수 (정규화)
                    - generic [ref=e109]:
                      - generic [ref=e110]: 기준 seed (uint32)
                      - spinbutton "기준 seed (uint32)" [ref=e111]: "28"
                      - paragraph [ref=e112]: 0–4294967295 정수 (정규화)
                    - generic [ref=e113]:
                      - generic [ref=e114]: 초기 우물 좌표 x₀
                      - spinbutton "초기 우물 좌표 x₀" [ref=e115]: "-1"
                      - paragraph [ref=e116]: "-2–2 (정규화)"
                    - generic [ref=e117]:
                      - generic [ref=e118]: 잡음 σ 최솟값
                      - spinbutton "잡음 σ 최솟값" [ref=e119]: "0"
                      - paragraph [ref=e120]: 0–3 (정규화)
                    - generic [ref=e121]:
                      - generic [ref=e122]: 잡음 σ 최댓값
                      - spinbutton "잡음 σ 최댓값" [ref=e123]: "1.5"
                      - paragraph [ref=e124]: 0–3 (정규화)
                    - generic [ref=e125]:
                      - generic [ref=e126]: 잡음 격자 수
                      - spinbutton "잡음 격자 수" [ref=e127]: "7"
                      - paragraph [ref=e128]: 2–32 정수 (정규화)
                    - generic [ref=e129]:
                      - generic [ref=e130]: 잡음당 실현 수
                      - spinbutton "잡음당 실현 수" [ref=e131]: "4"
                      - paragraph [ref=e132]: 1–16 정수 (정규화)
                  - generic [ref=e133]:
                    - button "확률 공명 곡선 계산" [ref=e134] [cursor=pointer]
                    - button "확률 공명 계산 취소" [disabled] [ref=e135]
                    - button "확률 공명 JSON 다운로드" [disabled] [ref=e136]
                  - generic [ref=e137]:
                    - generic [ref=e138]: 확률 공명 진행
                    - progressbar "확률 공명 진행" [ref=e139]
                    - status [ref=e140]: 0% 완료
                  - status [ref=e141]: 설정을 확인한 뒤 계산하세요. 이전 진자 run을 변경하지 않습니다.
                  - region "확률 공명 수치 결과"
              - generic [ref=e142]:
                - group [ref=e143]:
                  - generic "핵심 카오스 진단" [ref=e144] [cursor=pointer]
                - group [ref=e145]:
                  - generic "고급 카오스 · 수송 · 인력권 분석" [ref=e146] [cursor=pointer]
                - group [ref=e147]:
                  - generic "고정점 · 주기궤도 · 분기와 안정성" [ref=e148] [cursor=pointer]
                - group [ref=e149]:
                  - generic "관측 데이터 · 매개변수 추정 · 불확실성" [ref=e150] [cursor=pointer]
                - group [ref=e151]:
                  - generic "데이터 기반 모델 · 대규모 고유해석" [ref=e152] [cursor=pointer]
                - group [ref=e153]:
                  - generic "연구 프로젝트 · 재현 패키지" [ref=e154] [cursor=pointer]
  - contentinfo [ref=e155]:
    - paragraph [ref=e156]: Pendulum Lab · 움직임을 이해하고, 질문을 실험으로.
    - link "컴포넌트 갤러리" [ref=e157] [cursor=pointer]:
      - /url: ./next.html?gallery=components
    - button "명령 검색 (Ctrl/⌘ K)" [ref=e159] [cursor=pointer]
    - generic [ref=e160]:
      - generic [ref=e161]: 표시 언어
      - combobox "표시 언어" [ref=e162]:
        - option "한국어" [selected]
        - option "English"
    - group [ref=e163]:
      - generic "브라우저 스크립트 API" [ref=e164] [cursor=pointer]
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