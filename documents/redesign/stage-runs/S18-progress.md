# S18 핵심 카오스 진단 실행 기록

## 기준과 범위

- 기준 local/remote HEAD: `21bd6692ba2a3228035d95cb355eacbcfda96a01`, branch `codex/redesign`, upstream `origin/codex/redesign`. fetch 후 일치, 작업 폴더 clean.
- authoritative 여섯 문서를 전체 읽었다. 의존 S17 status commit 및 CP0~CP3 이력, native adapters/UI/tests, `S17-verification.json`의 validated 결과를 확인했다. S01~S17 연속 완료.
- `redesign:check`, `redesign:preflight -- 18` 통과. sandbox의 FETCH_HEAD/Git 자식 프로세스 제한은 동일 명령의 확장 권한 실행으로 해결했다.
- S17 보고 뒤 S18 요청을 사용자 checkpoint 승인으로 기록한다. 사람 과학 검토를 의미하지 않는다.
- 모델 selector는 런타임에 노출되지 않는다. 기록된 사용자 선택을 전제로 진행하며 UI 선택 검증·변경을 주장하지 않는다.
- 목표: state/time, energy, phase, FFT, NAFF, Poincaré, Lyapunov spectrum, SALI, FLI, 0–1, shadowing의 공용 adapter/worker/호환성/화면 및 versioned artifact 재로드.
- 제외: S19 이후 고급 분석, 새 교육 콘텐츠, 연구 queue, migration/cutover, master merge/release.

## 보존 계약

- 기존 app.html, physics/chaos/research/runtime/workers/validation/lib, public API, 사용자 데이터, package/lockfile, golden과 과거 시각 baseline을 보존한다.
- 공용 product adapter는 기존 계산 함수를 호출한다. hybrid/delay/stochastic/quantum 모델에 없는 연속 접선 모델을 꾸며내지 않으며 이유를 표시한다.
- 기록된 데이터의 단위·sampling·과도구간과 원래 초기조건에서 별도로 수행하는 분석을 구분한다. 유한시간 지표를 수학적 카오스 증명으로 표시하지 않는다.

## 내부 checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록·activeStage·S17 승인 | plan/preflight/typecheck | 완료 |
| CP1 | 공용 계약·native 분석·호환성·worker·artifact | synthetic/native parity, invalid/resource/cancel, typecheck | 완료 |
| CP2 | 모든 패밀리 공용 Dock·설정·plots·재로드 | component/unit, build, desktop/mobile/keyboard/axe/visual | 완료 |
| CP3 | 전체 검증·수치·보존 기록 | 전체 Vitest, quality checks, E2E, preservation | 검증 통과 |
| STATUS | 별도 완료 상태 | 구현 원격 확인 뒤 status push/hash | 검증 성공·이 commit 원격 확인 뒤 완료 |

## 변경 예정 경로

- `src/product/adapters/analysis/core/`, `tests/product/adapters/analysis/core/`
- `src/product/lab/views/diagnostics*`, 기존 패밀리 workspace의 공용 mount 경계, 관련 catalog metadata
- `tests/product/lab/diagnostics*`, `e2e/redesign/core-diagnostics*`
- `documents/redesign/core-diagnostics-ko.md`, `stage-runs/S18-*`, `status.json`, 필요한 검증 script

## 위험과 증거

- 데이터 길이·차원·계산량을 제한하고 별도 worker를 terminate하여 취소한다. 계산 중인 오래된 결과는 폐기한다.
- checkpoint targeted 검증 성공 후 명시적 경로만 commit/push하고 remote hash를 확인한다. status 전 nextStage=18 유지.
- 기존 dependency/CodeQL 위험은 본 단계에서 해결·수용했다고 주장하지 않는다.
- CP0: plan/preflight/전체 typecheck exit0. 명시적 두 경로만 commit/push한 뒤 구현을 시작한다.
- CP0 `b4d0c3057035ff69bfc798564914c16ff27e6194` push 성공. `git ls-remote`와 정확한 원격 hash 일치 확인.
- CP1 카탈로그·기존 수치 golden 검사: `tmp/S18-catalog-vitest.json` **81/81**, 7파일, 실패0. 기존 135정의·35시스템·134 frozen baseline 참조를 유지하고 S18의 기존 8개 분석 정의에 worker/cancellable metadata만 추가했다. 상태/시간·위상과 SALI/FLI 분리는 공용 실행 종류에 표현한다.
- 전달용 두 desktop 사본 SHA256은 변경하지 않은 원본 roadmap/execution과 각각 일치한다. 계획 원문을 수정하지 않았다.

## CP1 구현과 검증

- 11개 실행 종류의 공용 계약·native adapter, 원래 매개변수·감쇠·구동을 보존하는 source provider, 실제 작업 수 progress/worker 즉시 취소/오류/30초 무응답 종료를 추가했다.
- 모든 35시스템의 원래 관측·단위를 읽는다. 22개 smooth RHS를 지원하며 13개에는 hybrid/구속/지연/잡음/이산 전파/정적 평가별 명시적 이유를 제공한다. 구동 product adapter의 기존 RHS closure만 추출해 simulation과 분석이 공유한다. 기존 pure physics/chaos 엔진은 변경하지 않았다.
- SI 초·정규화 시간·iteration과 J·단위질량당 에너지를 구분한다. 전체 spectrum은 원래 uncertainty/Jacobian metadata를 보존하며 에너지 보존만으로 Hamiltonian consistency를 인증하지 않는다.
- artifact는 원 실험·관측·단위·설정·알고리즘·결과를 보존하고 모델 metadata/결과 signature를 검사한다. 16MiB·구조/깊이/표본 예산, 위험 키/getter/희소 배열/비유한 값/알 수 없는 버전·필드를 거부한다. shadowing 미초과는 명시적 null+의미로 저장한다.
- 35×11 matrix: **385조합** 중 **297개 실제 계산+artifact 왕복**, **88개 이유 있는 거부**. 22개 smooth native one-step parity, 구동5개와 Mathieu의 감쇠/phase/비0 startTime, off-stride 기록을 검사했다. 1노드 Kuramoto payload는 기존 native 계약으로 거부하고 실제2노드 SALI도 검증한다.
- 최종 통합 `tmp/S18-cp1-vitest.json`: **664/664**, 18파일, failed/pending0. 개발 중 유효한10step/renorm10을 거부 대상으로 삼은 fixture를 실제 잘못된11로 고친 뒤 동일 scope를 재실행했다. golden 값과 tolerance를 바꾸지 않았다.
- 전체 typecheck, scoped ESLint, source policy 전 단계의 범위 보존, `audit:modules` 661파일·초과0. module-size 검사의 첫 sandbox 실행은 esbuild EPERM으로 실패했고 동일 명령을 확장 권한 실행해 통과했다.
- `S18-numerical-metrics.json` **16/16**: FFT6.25Hz/진폭1.5, NAFF 각주파수 오차 `1.6312506900817425e-11`, periodic K `-0.011819115097078715`, seeded noise K `0.9986884414047166`. 조화진동자 spectrum 약1e-12, SALI1.4142/FLI약6e-13, 단면6교차·잔차9.89e-10. 6개 native 결과 비교의 차이 모두0(고정 허용오차1e-12).
- UI는 별도 CP2에서 publish한다. 첫 exploratory Chromium run은 새 시각 baseline 부재만 실패했으며 완료 증거로 세지 않는다. 최종 동결 build·정상 snapshot-none 검증이 남았다.
- CP1 `66d7b34` push 성공. 정확한 원격 hash를 확인한 뒤 CP2 최종 production 검증을 진행한다.

## CP2 화면과 실행 검증

- 기존 9개 실제 workspace의 분석 영역에 공용 진단을 연결했다. 기본 접힌 작은 facade만 로드하며 패널을 처음 열 때 분석 UI/provider를 lazy import한다. 실행 순간의 원 실험·실제 관측을 복사하며 animation worker와 분리한다.
- 모든 설정에 범위·기본값·단위·의미와 실패 안내, 실제 진행/즉시 취소, 결과 plot/수치 표, 원 실험을 바꾸지 않는 artifact 다운로드·재로드를 제공한다. 늦은 chunk/worker 응답과 route dispose를 검사했다.
- 동결 production build `tmp/S18-final-build.log` exit0. 신규 전용 browser `tmp/S18-final-playwright.json`: **46/46**, Chromium23+Pixel5 23, snapshot none, retry0, unexpected/skipped/flaky/runner errors0, tool exit0. 모든35route/9family 실제 worker/11diagnostic/단위·거부/파일 왕복/320px/keyboard/axe/CSS zoom2를 포함한다.
- 새 S18 PNG4개만 준비하고 agent가 전부 직접 시각 검사했다. 기존 PNG는 갱신하지 않는다. 초기 exploratory missing-baseline 실패와 preparation은 최종 정상 검증과 구분한다. `tmp/S18-ui-validation.json`에 build/browser/image hash와 명령·검토 범위를 기록했다.
- 첫 기존 화면 probe는 추가 summary로 높이가 늘어 실패했다. 기존 PNG 보존을 위해 새 영역만 제외하는 screenshot style 옵션을 시도했으나 설치 API는 stylePath를 요구했고, production CSP가 그 inline 스타일 주입을 차단했다. 앱 CSP는 유지한다. 최종 helper는 새 진단 DOM만 Comment marker로 잠시 분리하고 `finally`에서 같은 노드를 복원한다. 기존 기능·계산 assertion과 24개 시각 assertion은 유지하고 새 기능은 전용 시각 검사로 확인한다.
- CSP 차단 run은 중단하고 완료 근거에서 제외했다. `tmp/S18-legacy-csp-diagnostic.json`/startup failure 및 trace를 보존했다. 최종 기존48case는 snapshot none·retry0·원래 timeout으로 재실행 중이다.
- 최종 품질11개: typecheck/scoped ESLint/changed-file format/source policy/module-size/plan/catalog/Learn/inventory/secrets/numerics 모두 exit0. 최초 JSON format와 style 옵션의 타입 오류를 수정한 뒤 영향 범위만 재실행했다. 새 제품 코드는 build 이후 변경하지 않았다.
- 보안 패턴 scan1704tracked/1498text·발견0. dependency 새 감사나 위험 수용은 하지 않았다. baseline inventory883파일·깨진 import0/orphan0, catalog135정의/35시스템, Learn8과정/86예약/8공개 그대로다.
- 최종 기존 회귀 `tmp/S18-legacy-playwright.json`: **48/48**, 9패밀리 파일, Chromium24+Pixel5 24, snapshot none/retry0, failed/skipped/flaky/runner errors0, tool exit0. `tmp/S18-legacy-validation.json`은 기존 E2E PNG190개 모두 hash동일, 기존 Git PNG변경0임을 확인한다. 신규46개와 합계 **94/94** production case 통과.
- 모든 CP2 필수 targeted 검증 성공. UI·전용 시각 baseline·기존 화면 비교 helper·진행 metadata만 명시적으로 commit/push하고, 전체 Vitest와 최종 보존 기록은 CP3에서 확인한다.
- CP2 `b6df2cf9a4d35c103ec9ff70528a211f942a153b` push 성공과 정확한 원격 hash 확인. 작업 폴더 clean 상태를 확인했으며 전체 Vitest를 maxWorkers2·원래 timeout으로 실행한다.

## CP3 완료 후보

- 현재 phase: candidate-complete. nextStage=18을 유지한다. `tmp/S18-final-vitest.json` **3,896/3,896**, 314파일, failed/pending/todo0, tool exit0. maxWorkers2와 기존 timeout을 유지했고 browser 종료 후 실행했다.
- `tmp/S18-preservation.json`: 보호 엔진/API/app.html/package/lockfile/golden 변경0, 기존3,404개 assertion 이름·중복 횟수 손실0, 추적 PNG196개(그중 E2E190개) 모두 byte-identical. 동적 Date fixture 이름의 시각만 기존 좁은 정규식으로 정규화했다. 신규492개 테스트·4PNG를 추가했다.
- 원본 roadmap/execution은 바꾸지 않았다. 두 desktop 전달 사본의 SHA256이 각각 원본과 일치해 동기화가 필요한 차이0이다.
- `S18-verification.json` validated, gate8/8 true: targeted664, 전체3896, production46+48, 품질11, 수치16, 보존, 새4PNG 검사. 35×11 matrix385조합과297개의 실제 계산/artifact 왕복을 포함한다.
- 검증 문서를 stage한 뒤 최종 known-pattern scan1705tracked/1499text·발견0을 확인했다. 새 검증 JSON과 진행 상태에 대한 plan/format 검사도 통과했다. 원본 계획·pure engine·PNG 기준은 그대로다.
- 사람 과학 검토, 실제 기기, Firefox/WebKit, screen-reader 음성은 검증하지 않았다. 기존 S01 공급망/CodeQL 위험과 S11~S17 모델 한계는 유지한다. S17 사용자 gate는 이번18요청으로 승인했고 사람 검토로 표시하지 않는다.
- 구현/검증 기록 CP3를 먼저 commit/push한 뒤, 원격 hash 확인과 clean guard를 통과해야 별도 STATUS commit에서만18완료·next19로 갱신한다. master merge/force push/tag/release/cutover와19이후 구현은 하지 않았다.

## STATUS

- CP3 `0f5b98313e5b92fbf6cf2217077238e45a9b12f1` push 성공과 정확한 원격 hash 확인. 모든 구현·검증 근거가 원격에 있는 상태에서 완료 metadata만 별도 갱신한다.
- stage18 완료 목록·nextStage19·activeStage 해제, approvedReviewGates=[7,9,17]. S17 사용자 승인과 사람 과학 검토를 구분한다.
- 이 STATUS commit도 origin/codex/redesign에 push되고 정확한 원격 hash가 확인되어야 S18 완료다.
