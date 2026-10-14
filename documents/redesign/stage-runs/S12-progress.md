# S12 — 구면·구면 사슬·embedded 계

## 기준과 범위

- 기준 HEAD와 fetch 후 origin/codex/redesign: `200193df0a61d8611ebb136cee9abc7030da8e66`. 작업 폴더는 깨끗했다.
- S01–S11 완료 상태와 S11 status/implementation history, constraint adapter/worker/UI/tests 및 S11 progress·verification 산출물을 확인했다.
- `npm run redesign:check`, `npm run redesign:preflight -- 12` 통과. sandbox의 FETCH_HEAD 쓰기/Git subprocess 제한은 허용된 escalation으로 해결했다.
- 목표: spherical/spherical-chain/embedded 공용 엔진 연결, 3차원 카메라·벡터/평면, 각운동량·구속 잔차, 특이점 안내, canonical 저장·복원과 renderer 실패 시 수치 접근.
- 범위 밖: S13 이후 기능·콘텐츠, legacy migration, app.html 전환, master merge/release.
- 모델 선택 UI의 실제 값은 읽을 수 없으며 지정 프로필을 전제로 진행한다.

## 보존 경계

기존 `app.html`, physics/chaos/research/runtime/workers/validation, 공개 API, legacy preset/import/export, 사용자 데이터, S03 계약, lockfile, S01 golden을 보존한다. product adapter만 기존 계산 경계를 호출한다.

## Checkpoint

| ID | 작업 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 범위·보존·진행 기록 | plan/preflight, 선행 history·산출물 | 원격 보존 `1498e7c` |
| CP1 | 공간 엔진 adapter·canonical·worker | 기존 엔진 parity, 회전 대칭·잔차·결정론, 왕복, 취소/실패, typecheck | 원격 보존 `e1a3353` |
| CP2 | 공간 Lab·3D 조작·수치 접근·export | 단위/저장, build, desktop/mobile, keyboard/touch, WebGL fallback, axe/시각 | 원격 보존 `787ae0b` |
| CP3 | 독립 검토·증거 문서 | 전체 Vitest, E+U, catalog/inventory, 보존 diff | candidate-complete 문서 준비, 최종 검증 대기 |
| STATUS | 별도 완료 commit/push | 구현 원격 존재, 최종 필수 검사, 원격 hash | 대기 |

변경 예정 경로: `src/product/adapters/physics/spatial*`, `src/product/lab/views/spatial*`, product route/catalog/library, `css/product/spatial.css`, 관련 tests/E2E, S12 진행·검증 문서와 status.

## 위험과 검토

- 중력 아래의 회전 불변성은 중력축 주위 회전을 뜻한다. 임의 축 회전을 보존 법칙으로 주장하지 않는다.
- angular/embedded 좌표, 중력축, 단위와 구속 알고리즘의 한계를 실제 엔진과 대조한다.
- worker와 결과 표본 크기를 제한하고 실패 시 마지막 유효 결과를 보존한다.
- S12는 별도 사용자 승인 게이트가 아니다. 승인 [7,9]와 과학 human-reviewed 상태는 그대로 유지한다.
- 기존 보안 기준선은 해결·위험 수용으로 표시하지 않는다.

## 2026-10-09 동일 단계 재개

- 사용량 제한으로 중단되었던 S12를 사용자 `계속` 요청으로 재개했다. 새 fetch 후 로컬/원격은 `1498e7c6af4ac458e6c88be58ccd4d0aaa599c8c`로 일치한다.
- 수정된 4개 추적 파일과 9개 신규 경로는 위 CP0 범위의 공간 adapter/schema, UI/model/storage/renderer, route/catalog/library와 E2E 초안이다. 이전 작업 내역과 대조하여 같은 S12의 미완성 작업임을 확인했다. 무관한 변경은 없으며 모든 파일을 보존했다.
- 계획 검사는 재통과했다. clean-worktree preflight는 진행 중 파일 때문에 재통과할 수 없으므로, 최초 clean preflight와 원격 CP0/activeStage=12를 근거로 동일 checkpoint를 계속한다. 구현을 검증·commit/push한 뒤 clean preflight를 다시 실행한다.
- 이전 중단 시 worker와 workspace/plots/CSS 및 검증이 미완성이다. 그 상태를 완료나 검증 성공으로 간주하지 않는다.
- 원격 CP0 push 시 default branch 취약점 high7/moderate3가 보고되었다. 별도 보안 해결이나 위험 수용은 하지 않았다.

## 2026-10-13 동일 단계 재개

- 사용자 `계속` 요청 후 다시 fetch했으며 로컬/원격 CP0 `1498e7c`가 일치한다. 진행 중 파일은 이전 S12 작업 기록과 대응하며 새로운 무관한 변경은 없다. 파일을 보존한 상태에서 동일 단계를 이어간다.
- worker·workspace·plots·CSS와 엔진/renderer 테스트 초안이 추가된 상태를 회수했다. 전체 typecheck 및 production build/공개 산출물 검사가 통과했다. 아직 구현 checkpoint나 완료 상태를 push하지 않았다.
- 엔진·저장/입력·렌더러 독립 검토와 실제 Chromium desktop/mobile 검증을 진행한다. 이전 미완성 검사와 이번 통과 결과를 구별해 기록한다.

## CP1 검증 및 2026-10-14 재개

- 재차 사용자 `계속` 요청 후 fetch한 로컬/원격은 CP0 `1498e7c`이며 진행 파일은 기존 S12 기록과 일치한다. 원본과 진행 파일은 그대로 보존했다.
- `tmp/S12-engine-vitest-final.json`: 7파일 **112/112** 통과, 실패/pending 0. 새 adapter 41개, worker 25개, 기존 공간 엔진 33개, S01 golden 13개를 포함한다.
- 처음 105/106이었던 검사에서는 새 worker 테스트가 stride=2에서 기록되지 않아야 하는 첫 표본을 누락 표본으로 가정했다. 짧은 실행으로 stride=1을 구성해 실제 누락을 검사하도록 fixture만 수정했다. 첫 실패 보고서는 `tmp/S12-engine-vitest.json`에 보존했다. 기존 engine/golden/timeout은 변경하지 않았다.
- 원래 엔진별 상태·에너지·좌표 동등성, 단일/사슬 각운동량 부호 변환, 중력축 주위 회전 대칭, 극점 native 재시작, 구속 잔차, 1/16/17 링크 경계, 유한한 마지막 상태, 닫힌 계약·단위·공유 왕복, worker 취소/실패/표본 제한을 검증했다.
- 대표 기본값 8s, dt=0.002s 측정에서 상대 에너지 변화 최대 6.0623e-10, Ly 절대 변화 최대 3.8055e-9 kg·m²/s, 길이 잔차 최대 4.44e-16m였다. 16링크 0.4s 두 경로도 유한하며 길이 잔차 최대 1.12e-15m였다. 이는 해당 fixture의 관측치이며 모든 초기조건의 정확도 보증은 아니다.
- 첫 production browser 기능 검사 `tmp/S12-first-playwright.json`은 desktop/mobile 합계 **32/32** 통과했다. 시각 기준선과 이후 추가한 실제 터치 입력·최대 링크·넓은 화면 정렬 검사는 아직 포함하지 않는다.
- 독립 renderer 검토에서 넓은 화면의 max-height 제한이 WebGL canvas만 늘여 SVG와 어긋나던 결함을 수정했다. `object-fit: contain`과 같은 SVG 중앙 정렬을 적용하고 좌표 일치 테스트를 추가했다. renderer 12/12 및 scoped lint 통과이며 최종 browser 정렬 검증은 CP2에서 수행한다.

## CP1 원격 보존과 CP2 검증

- CP1 `e1a33532630bc00090d26fc9702c4de1e52d9d48`을 push하고 `git ls-remote origin refs/heads/codex/redesign`의 정확한 hash 일치를 확인했다.
- 편집 13개·저장/내보내기 17개·모델 수명주기 11개·renderer 12개를 합친 `tmp/S12-ui-final-vitest.json`은 4파일 53/53 통과했다. 추가 모델 테스트의 readonly 배열 변조 검증에서 typecheck 오류 2건이 발견되어 타입 경계를 명시해 수정·재검증한다.
- `tmp/S12-extra-playwright.json`의 desktop/mobile 6/6은 실제 Chromium 터치 이벤트, 링크 축소 후 16링크 실행, 넓은 화면 canvas/SVG 좌표 정렬을 검증한다.
- 새 시각 기준선 생성은 4개 테스트에서 이미지 12장이 없다는 오류로 종료되었다. `tmp/S12-new-visuals.json`에 실패를 보존하며 통과로 세지 않는다. 12장 모두 직접 확인했고 기존 기준 이미지는 변경하지 않았다. 새 이름으로 고정 비교를 실행한다.
- source policy, legacy inventory(883파일, broken import/orphan 0), Learn(8과정·86예약 단원), production build·공개 산출물 검사를 통과했다.
- 독립 문서 검토에 따라 라우트 이동은 마지막 궤적을 복원하지 않고 초기조건·보관 설정만 유지한다고 명확히 했다. 현재 화면의 취소/오류 시 마지막 수신 결과 보존과 구별한다.
- 넓힌 browser 검사 중 기존 keyboard/reflow 검사가 31.8초 timeout으로 실패했다. 실패 증거와 원인을 검토하며, timeout과 기존 assertions는 변경하지 않는다. 최종 통과 전 CP2를 publish하지 않는다.

## 2026-10-15 동일 단계 재개

- 자동 승인 검토가 계정 사용량 제한으로 완료되지 못해 마지막 재검증 명령은 실행되지 않았다. 사용자 `계속` 요청 후 다시 fetch했으며 HEAD와 origin/codex/redesign은 CP1 `e1a3353`로 일치한다. 수정·신규 파일은 이전 S12 작업과 대응하고 무관한 변경이 없다. 계획 검사는 재통과했다.
- 새 모델 테스트의 readonly 대입을 `Reflect.set`과 성공 여부 검사로 바꾸어 런타임 복사 격리 검증을 유지했다. 해당 11/11, 전체 typecheck, S12 UI·시험 파일 scoped ESLint가 통과했다.
- `tmp/S12-cp2-playwright.json`: 88개 중 87개 통과. 공간 진자 40/40, 새 시각 기준 12장 고정 비교는 모두 통과했다. retained mock의 마지막 axe 검사 중 전체 30초 예산을 넘겼다. trace에서 선행 assertions와 최종 위반 0 결과를 확인했다.
- 독립 재실행 `tmp/S12-cp2-recovery-playwright.json`은 desktop 통과, mobile 30초 초과였다. 누적 지연이 재발하여 320px keyboard/패널 검사와 200% zoom/640px 검사를 별도 여정으로 나눴다. 원래 모든 assertions와 각 테스트의 30초 한도는 유지한다. 첫 실패 trace는 `tmp/S12-cp2-timeout-diagnostics`, 재실행 실패 trace는 `tmp/S12-cp2-recovery-timeout-diagnostics`에 보존한다.
- 분리한 네 여정을 `tmp/S12-cp2-bounded-playwright.json`으로 검증한다. 전체 필수 검사와 완료 status push는 아직 수행하지 않았다.
- 네 여정 중 3개 통과, desktop 320px 검사는 다시 30초를 넘겼다. 이번 trace는 BrowserContext 생성 15.29초, axe 보조 페이지 생성 5.11초 등의 준비 지연을 보였으며 세 번째 분석 패널의 보조 페이지 생성 도중 만료되었다. 앞선 두 패널의 axe 위반은 0, 분석 탭/viewport 검사와 페이지 오류 검사도 통과했다. 첫 실패의 마지막 axe 지연과 이번 실패 위치를 구별한다.
- 반복되는 여러 axe 검사 누적을 제거하기 위해 retained mock과 공간 Lab 양쪽의 5개 패널을 각각 독립 테스트로 구성했다. 원래 각 패널의 viewport/axe와 keyboard 검증을 유지했고, 확대 화면 검사는 별도로 유지했다. 테스트당 30초, retries=0, 원래 assertions와 시각 기준은 바꾸지 않았다. `tmp/S12-cp2-panels-playwright.json`에서 desktop/mobile 24개 여정을 검사한다.
- 패널별 최종 검사 **24/24** 통과, skip/flaky/retry 0. 기존 넓힌 검사에서 통과한 공간 진자 실행·저장·camera·fallback·12개 시각 기준과 합쳐 CP2의 필수 동작·접근성 검증을 충족한다. 실패 결과는 별도로 보존한다. 구현 commit 뒤 최종 필수 검증에서 이 구조를 다시 사용한다.

## CP2 원격 보존과 CP3 완료 후보

- CP2 `787ae0b3b37bee9c40da606b21203ae0b8be69e6`을 push하고 원격 branch의 정확한 hash 일치를 확인했다. UI 53/53와 변경 시험 파일 scoped ESLint를 마지막 수정 뒤 재통과했으며, 알려진 비밀정보 패턴 검사는 추적 파일 1,461개에서 0건이다.
- 새 좌표/단위/알고리즘 한계·저장/복구 안내는 `spatial-lab-ko.md`, 수치 측정은 `S12-numerical-metrics.json`, 검증 및 보존 증거는 `S12-verification.json`에 모은다. 이 문서 checkpoint를 원격 보존한 뒤 깨끗한 preflight와 전체 Vitest, 최종 production browser 및 typecheck/lint/build/inventory 검사를 실행한다.
- 현재 상태는 **candidate-complete**이며 완료 목록과 nextStage는 S11/S12 그대로이다. 필수 검증이 통과하고 별도 STATUS commit의 원격 hash가 확인되어야 S12 완료로 간주한다. S13은 시작하지 않았다.
