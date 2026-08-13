# UI hardening report — 2026-07-20

범위: `app.html`, `css/`, `src/app/`, UI 단위 계약 및 Chromium E2E. 아래 번호는 통합 감사의 전역 번호이며 **67–105, 정확히 39개**이다.

| 번호 | 발견한 문제 | 구현한 수정 | 증거 / 검증 |
|---:|---|---|---|
| 67 | 768/1024px의 좁은 세로 레일 안에서 Mode/Language 네이티브 선택기가 레일 밖으로 넘쳤다. | 데스크톱·태블릿 레일에는 44px `Aa` 환경설정 버튼과 2열 플라이아웃을 만들고, 열림·닫힘·외부 클릭·Escape·포커스 복귀를 연결했다. 이 독립 UI는 `audiencePreferences.ts`로 분리해 mode policy 모듈의 크기 gate도 지켰다. | `mode and language fields stay unbroken…` E2E에서 768/1024 실측; module-size audit 통과. |
| 68 | 320/375px 하단 레일에서 두 선택기가 서로 겹치고 메뉴 아이콘에 눌렸다. | 모바일에서는 플라이아웃 버튼을 숨기고, 팔레트 버튼을 피해 고정된 2열 환경설정 도크를 배치했다. | 같은 E2E에서 320/375의 교차 영역 0 및 문서 가로 스크롤 0 검증. |
| 69 | 320px에서 높이를 42px로 낮추려던 규칙이 터치 계약을 약화했다. | 모든 모바일 폭에서 Mode/Language를 최소 44px로 고정하고 320px 예외 축소를 제거했다. | E2E가 두 선택기 높이 `>=44`를 강제; source contract의 `--ui-target: 44px`. |
| 70 | 긴 한국어 옵션과 레이블이 select의 화살표·경계를 밀어냈다. | `minmax(0,1fr)`, `min-width:0`, 말줄임, 전용 chevron 여백, 줄바꿈 안전 규칙을 적용했다. | 375px KO E2E에서 select가 field 경계 안에 있고 `text-overflow: ellipsis`인지 검증. |
| 71 | Mode와 Language가 한 덩어리처럼 보여 각 필드의 이름과 설명 연결이 약했다. | 각각 독립 `.audience-field-*`, `<label>`, `name`, `autocomplete`, `aria-describedby`와 숨은 도움말을 부여했다. | `models mode and locale…` source contract 및 KO E2E. |
| 72 | 모드 변경 후 현재 상태를 스크린리더가 알 수 없었다. | polite/atomic 공용 live region을 만들고 Beginner/Student/Research 변경을 EN/KO로 알리게 했다. | KO E2E에서 `사용자 모드: 학생` 확인; modal source contract. |
| 73 | 언어 변경이 동적 검색 UI까지 전파되지 않고 상태 안내도 없었다. | `pendulum:ui-locale-changed` 이벤트와 EN/KO live announcement를 추가해 구조 UI와 검색 UI가 동기화되게 했다. | KO→EN→KO E2E 및 locale source contract. |
| 74 | 패널 접기 버튼의 제목/접근성 이름이 한국어 UI에서도 영어로 남았다. | 현재 locale과 collapsed 상태를 함께 반영해 표시/숨기기 `title`·`aria-label`을 매번 갱신했다. | KO preference E2E에서 양방향 언어 전환 후 레이블 확인. |
| 75 | 첫 방문 모드 선택창이 짧은 화면, 노치, 가상 키보드에서 잘릴 수 있었다. | `dvh`와 측정된 visual viewport, safe-area, 내부 스크롤, overscroll containment, 낮은 화면 전용 밀도 규칙을 추가했다. | audience CSS source contract가 viewport/safe-area/short-height 규칙을 검증. |
| 76 | 현재 모드 배지가 카드 본문과 겹칠 수 있었다. | 현재 카드에 별도 상단 여백을 확보하고 작은 화면에서도 배지 공간을 유지했다. | `.audience-choice-current` hardening source contract 및 3카드 E2E 렌더. |
| 77 | forced-colors에서 custom select 화살표·현재 카드 상태가 사라졌다. | 강제색에서도 custom select를 유지하되 `appearance:none`, 2px `ButtonText` 경계·내부 outline, `Highlight` focus outline과 시스템 색을 적용하고 화살표를 명시적으로 표시했다. | forced-colors E2E에서 select border/outline/appearance와 focus 상태 검증. |
| 78 | 모드 선택창의 포커스가 배경으로 빠지고 키보드 이동·닫기 후 복귀가 불완전했다. | 공용 focus trap, Arrow/Home/End roving, Escape/backdrop 닫기, 원래 포커스 복귀를 구현했다. | chooser isolation E2E에서 이동·Escape·backdrop·복귀 전부 검증. |
| 79 | div 기반 모달들이 배경을 실제로 inert 처리하지 않아 Tab/AT가 뒤 UI에 접근할 수 있었다. | body 직계 surface의 기존 `inert`/`aria-hidden`을 저장하고 top modal 외 배경을 격리한 뒤 정확히 복원하는 공용 stack을 추가했다. | modal source contract 및 chooser/palette E2E의 `.app-shell` inert 검증. |
| 80 | 이미 숨김 상태로 snapshot된 두 번째 모달을 중첩해서 열면 화면에는 보이지만 AT에는 `aria-hidden`으로 남았다. | top modal과 그 body ancestor는 stack 활성 중 무조건 `inert=false`, `aria-hidden` 제거 후 stack 해제 때 원상복구하도록 했다. | chooser→palette 중첩 E2E에서 modal depth 2, 양쪽 접근성 상태, depth 1 복원 검증. |
| 81 | 모달이 열린 뒤 PWA 배너 같은 새 top-level 버튼이 추가되면 배경 격리를 우회했다. | modal depth 동안만 `MutationObserver(childList)`를 운용해 새 body child도 즉시 inert/hidden 처리하고 마지막 modal에서 해제한다. | 중첩 modal E2E가 동적 버튼을 append해 격리와 최종 원복을 검증. |
| 82 | 토스트·수치 오류 오버레이·부트 HUD·환경설정 live region까지 격리되면 중요한 상태 안내가 사라질 수 있었다. | 의도적인 `LIVE_SURFACE_IDS` 예외를 유지하고 `uiPreferenceStatus`도 명시했다. | modal source contract가 live 예외와 polite/atomic 속성을 검증. |
| 83 | Trust result inspector가 focus trap, 배경 inert, 닫기 후 복귀가 없는 독자 모달이었다. | 공용 modal lifecycle, 명시적 heading 연결, Tab trap, Escape/backdrop 닫기, 44px close, viewport/safe-area/forced-color 규칙을 적용했다. | `wires modal activation…` contract 및 result inspector 정적 lint/typecheck. |
| 84 | Stable Help는 클래스만 토글해 `aria-modal`, 배경 격리, focus trap, focus restore가 없었고 한국어 전환 뒤에도 영문 정책을 표시했다. | backdrop/panel 역할, 공용 modal stack, Escape/Tab/backdrop, 호출 버튼 복귀를 구현하고 중앙 EN/KO copy와 locale-change 동기화를 갖춘 `stable-help.ts`로 분리했다. | modal/localization contract, Trust Drawer layering E2E, module-size audit. |
| 85 | 숨겨진 도움말의 `aria-modal=true`만으로 Trust Drawer Escape가 영구 차단되는 버그가 있었다. | 실제 활성 custom modal stack 또는 열린 native `dialog[open]`만 차단하도록 판정을 바꿨다. | `does not let a hidden help dialog…` source contract와 drawer E2E. |
| 86 | Trust Drawer를 Escape로 닫은 뒤 호출 버튼으로 돌아가지 않고 탭 키보드 이동도 제한적이었다. | return-focus 저장/복원, Up/Down 탭 이동, nested modal 우선권을 구현했다. | KO control-search/drawer E2E에서 help→drawer 순차 Escape와 toggle focus 검증. |
| 87 | Keyboard Shortcuts native dialog가 작은 viewport에서 넘치고 close target/forced-colors가 약했다. | visual viewport 기반 max-height, 내부 스크롤, 44px close, forced-colors 및 reduced-motion 스타일을 추가했다. | UI source contract + Trust Drawer layering E2E에서 실제 열림/닫힘 검증. |
| 88 | 브라우저 확대·pinch·가상 키보드 시 고정 UI가 layout viewport만 사용했다. | idempotent `UiPolish`가 visual viewport의 width/height/offset을 CSS 변수로 동기화하고 resize/scroll/orientation을 추적하게 했다. | `tracks visual viewport…` contract, 짧은 viewport E2E 및 200% CDP E2E. |
| 89 | `innerHeight - visualViewport.height`만으로 키보드를 추정하면 pinch zoom도 키보드로 오분류되고 값도 소비되지 않았다. | dead `--ui-keyboard-inset`/`data-virtual-keyboard` 휴리스틱을 제거하고 실제 소비되는 viewport 측정치만 유지했다. | source contract가 두 dead telemetry 문자열의 부재를 검증. |
| 90 | ripple은 좌표가 0인 정상 포인터를 중앙 클릭으로 오인하고, 기존 ripple 누적·disabled 실행 가능성이 있었다. | 0을 fallback sentinel로 쓰던 식을 제거하고, 이전 ripple 제거, animation fallback cleanup, disabled/rail/tooltip 제외, 설치 idempotence와 input modality 추적을 추가했다. | UiPolish source contract, ESLint, 통합 typecheck. |
| 91 | Command Palette가 visual viewport offset/높이와 노치 영역을 무시해 200% 확대·짧은 화면에서 잘렸다. | overlay를 측정된 visual viewport 좌표/크기로 고정하고 panel max-height, safe-area, 짧은 화면 레이아웃을 추가했다. | short-viewport E2E 및 Chromium 200% page-scale E2E. |
| 92 | 모바일 검색 input이 16px보다 작아 iOS 확대를 유발하고 긴 명령명이 한 줄에서 깨졌다. | 모바일 input 16px, 44/48px target, 2줄 clamp, anywhere wrap, list scroll gutter를 적용했다. | palette CSS source contract와 short-viewport E2E의 font-size 실측. |
| 93 | Palette 열림/닫힘 때 background inert, `aria-hidden`, combobox `aria-expanded`, 호출자 focus가 일관되지 않았고 열린 native dialog 위에 열리면 top-layer dialog를 inert 처리했다. | 공용 modal lifecycle과 focus 복원을 적용하고, `dialog[open]` 중에는 shortcut·직접 호출 모두 새 Palette를 열지 않도록 막았다. | palette/nested-modal E2E와 native Shortcut dialog 우선권 E2E. |
| 94 | lazy Palette가 아직 설치되기 전 실행 버튼에 포커스가 있으면 broad interactive guard가 Ctrl/Cmd+K를 버렸다. | early shim은 text-entry만 제외하게 좁히고, 설치 후에는 capture listener와 launcher fallback이 shortcut을 소유하게 했다. | early/installed source contracts 및 launcher-focus keyboard E2E. |
| 95 | 한글 IME 조합 중 매 keystroke마다 Palette가 필터링되어 결과가 깜박였다. | `InputEvent.isComposing` 동안 렌더를 보류하고 `compositionend`에서 한 번만 필터링한다. | palette IME E2E에서 조합 중 count 유지 후 종료 뒤 0건 전환 검증. |
| 96 | debounce 동안 검색 결과가 바뀌는지 AT가 알 수 없었고, 입력 직후 Enter가 stale 기본 명령을 실행할 수 있었다. | listbox `aria-busy`를 동기화하고 Arrow/Home/Page/Enter 전에 현재 input 값으로 pending render를 동기 flush한다. | source contract와 `type + immediate Enter` E2E. |
| 97 | 검색어를 빠르게 지우는 명확한 44px action이 없었다. | EN/KO 접근성 이름의 clear 버튼을 추가하고 값·활성 index·결과·focus·hidden 상태를 원자적으로 초기화했다. | palette E2E에서 노출→클릭→빈 값→focus→숨김 검증. |
| 98 | 0건 검색이 빈 listbox와 숫자 status만 남겨 시각적으로 실패처럼 보였다. | locale별 empty state와 live result count를 렌더하고 긴 검색에도 안정적인 최소 높이를 부여했다. | palette E2E에서 0건 status와 empty surface 검증. |
| 99 | PageUp/PageDown가 끝에서 modulo wrap되어 페이지 이동 의미가 깨졌고 Arrow/Home/End 규칙도 섞였다. | Arrow만 순환, Home/End/PageUp/PageDown은 clamp하도록 selection API를 분리했다. | palette E2E가 Page boundary 고정과 Arrow wrap을 각각 검증. |
| 100 | accent/조합형 검색과 locale별 정렬이 일관되지 않았다. | NFKD+combining-mark 제거 정규화, 다중 term 매칭, 현재 locale의 표시 label 기준 tie-break 정렬을 적용했다. | palette source contract 및 KO 검색 E2E 경로. |
| 101 | Control Search가 일반 text input이고 label/help/status/controls 관계가 없었다. | `type=search`, maxLength, input/enter hint, label, `aria-controls`, `aria-describedby`, clear, polite atomic status를 추가하고 IME·locale 로직을 `control-search.ts`로 분리했다. | governance source contract, KO control-search E2E, module-size audit. |
| 102 | Control Search의 placeholder·help·clear·결과 수가 언어 전환 뒤 영어로 남았다. | 중앙 EN/KO copy와 locale-change listener를 만들고 초기/필터 상태 수를 현재 언어로 렌더한다. | KO E2E에서 placeholder, clear label, 0건/전체 status 검증. |
| 103 | Control Search가 IME 조합 중 필터링하고 조합 취소 Escape까지 검색 초기화로 오인했으며 option/id/name/title을 놓쳤다. | composition defer와 composing Escape 무시, 정규화된 metadata 검색, 일반 Escape의 검색만 초기화를 구현했다. | KO E2E에서 composing Escape 값 유지, IME 전후 hidden row, 일반 Escape 후 drawer 유지 검증. |
| 104 | Rail section click은 항상 열기만 했고, 화살표 이동이 다른 tablist로 샜으며 coarse 768px tablet을 CSS와 달리 horizontal로 알렸다. | click/focus/Escape 복귀, 현재 tablist 범위 roving, 실제 560px CSS breakpoint만 쓰는 orientation sync, reduced-motion scroll을 적용했다. | rail E2E에서 1024 vertical→375 horizontal 및 coarse 768px vertical 실측. |
| 105 | UI 전반에 환경별 마지막 방어층이 없고, modal 중 Ctrl+P를 쓰면 숨긴 overlay의 body scroll-lock이 인쇄 본문까지 잘랐다. | 마지막 CSS layer에 touch/focus/safe-area/contrast/motion/print 규칙을 통합하고 print에서는 modal body overflow를 명시적으로 복원했다. | source contracts, forced-colors/reduced-motion E2E, load-order 및 print overflow contract. |

## 검증 명령

- `npx eslint ... --max-warnings 0` — 수정 UI/신규 테스트 파일 통과.
- `npx tsc --noEmit` — 전체 프로젝트 통과.
- `npx vitest run tests/ui-hardening-contracts-2026-07.test.ts` — 14/14 통과.
- `npm run audit:modules` — 324개 source와 13개 ratchet 통과; split 결과를 새 기준선으로 낮춰 `audienceMode.ts` 734/735, `governance-ui.ts` 937/938 line gate 이내.
- production preview에서 `npx playwright test e2e/ui-hardening-2026-07.spec.ts --project=chromium ...` — **11/11 통과(3.6분)**. 320/375/768/1024 반응형, 중첩 모달, IME, 즉시 Enter, rail, coarse tablet, forced colors/reduced motion, KO 검색, 200% page scale을 한 묶음으로 검증했다.
