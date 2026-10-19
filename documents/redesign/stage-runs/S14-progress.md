# S14 — Duffing·Van der Pol·Kapitza·Mathieu·마찰·Pyragas

## 시작 상태와 범위

- 기준 로컬/원격 HEAD: `f52cbe4150e702cb1a2f754aa10b9db8ee07547f`, `codex/redesign`.
- 작업 폴더 깨끗함, origin fetch와 정확한 HEAD 일치 확인.
- `redesign:check` 통과. `redesign:preflight -- 14`는 sandbox Node Git spawn EPERM 뒤 같은 읽기 전용 명령의 확장 권한 재실행으로 통과.
- S01–S13 연속 완료 목록, 각 status commit 이력, stage progress/verification, S13 adapter·UI·테스트 산출물 확인.
- S14의 여섯 모델과 전용 관찰·preset·경고·history 저장만 실행한다. S15 이후, 일반 sweep queue, 새 교육 단원, 앱 전환은 범위 밖이다.
- 런타임에서 앱 모델 선택값을 읽을 수 없으므로 검증·변경했다고 주장하지 않는다.

## 목표와 보존

- 기존 Duffing/Van der Pol/Kapitza RHS, Mathieu coefficient/Floquet, 마찰 complementarity, Pyragas DDE 경계를 재사용한다.
- 퍼텐셜/한계주기/평균화/안정성/stick-slip/지연 이력을 시스템에 맞게 표시한다.
- Mathieu의 정규화 선형 진단과 마찰 구성 도구의 기존 의미를 보존하고 Lab wrapper의 가정을 명시한다.
- Pyragas 초기 이력과 재현 가능한 지연 상태를 versioned 계약으로 저장·복원하며 유한 시간 간격과 보간 한계를 알린다.
- `app.html`, 기존 physics/chaos/research/runtime/workers/validation, 공개 API, 사용자 데이터, 기존 schema 동작, package/lockfile, golden과 기존 시각 기준을 보존한다.

## 내부 checkpoint

| ID | 범위 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록·activeStage | plan/preflight, diff | 원격 확인 완료 |
| CP1 | schema/adapter/worker와 수치 계약 | native parity, known limits, delay restore, 마찰 전환, stability, cancel/error, typecheck | 검증 완료·push 준비 |
| CP1-FIX | production에서 발견한 지연 꼬리 중복 시각 수정 | 전체 client horizon·초기/후기 continuation·기존 계약, typecheck/lint | 검증 완료·push 준비 |
| CP2 | 전용 UI·preset·저장·공유·export·route/catalog | unit/component, desktop/mobile/keyboard/axe/320px/zoom, 시각 검토, build | UI 구현·unit 검증 완료, browser 대기 |
| CP3 | 과학적 한계·검증·보존 증거와 완료 후보 | 문서/JSON/plan, 전체 Vitest·관련 production browser·정적 검사 | 대기 |
| STATUS | 별도 완료 commit/push | 구현 원격 존재·최종 원격 hash | 대기 |

## 변경 예정 경로

- `src/product/adapters/physics/nonlinear*`, `src/product/lab/views/nonlinear-*`, `src/product/app/views/nonlinear-lab.ts`
- 제품 route/library/catalog 연결, 필요한 `css/product/` 스타일
- `tests/product/` 관련 adapter/worker/model/storage tests, `e2e/redesign/nonlinear*.spec.ts`와 새 시각 기준
- `documents/redesign/nonlinear-lab-ko.md`, `stage-runs/S14-*`, `status.json`

## 위험·검토·원격 증거

- 사용자 승인 게이트 [7,9] 유지. S14는 별도 승인 게이트가 아니며 사람 과학 검토를 수행했다고 표시하지 않는다.
- 정규화 단위, Duffing softening 발산, 큰 μ의 강성, Kapitza 평균화 조건, 마찰 격자 사건, 지연 보간과 자원 한계를 검증한다.
- 기존 dependency/CodeQL 미해결 항목은 해결되거나 승인됐다고 주장하지 않는다.
- 각 checkpoint 검증과 명시적 staging 뒤 push하고 정확한 원격 hash를 기록한다. nextStage는 마지막 STATUS까지 14를 유지한다.
- CP0 `0997c032ffbf5800ab50a07e74d061f72140a161` push 성공, `ls-remote` 정확한 hash 일치. Git 쓰기와 네트워크 sandbox 제한은 동일 명령 확장 권한으로 실행했다. 이후 깨끗한 CP0 HEAD에서 preflight를 다시 통과했다.
- 기본 branch push 알림 high8/moderate3은 기존 미해결 알림이며 S14 신규 audit·해결 증거가 아니다.
- 두 desktop transport 사본은 저장소 원본과 SHA256이 일치한다. roadmap `1D46E04691D4119CED60DACB41945C75D9D1A20F66CBAED2B3664909F47F8995`, execution `803B191496EDD95EBF2199A8983B920058109BB159D55F8BAFEB0737FA735FC5`.

## 구현 중 조사·검증

- 기존 여섯 모델 native 테스트 `tmp/S14-native-baseline-vitest.json`: **34/34**, 6파일, 실패 0.
- catalog 134정의, Learn 8과정/86예약, legacy inventory 883파일·broken import/orphan 0 확인. catalog/Learn은 sandbox esbuild EPERM 뒤 동일 명령 확장 권한 재실행으로 통과했다.
- 정규화 Duffing/Van der Pol/Mathieu는 canonical `modelOptions.timeConvention=normalized`로 시간 carrier의 의미를 명시한다. 물리 모델은 `si`이며 잘못된 convention을 거부한다. 기존 공통 runtime schema는 변경하지 않는다.
- 지연 이력 초기화 경계의 불연속을 작은 가짜 ramp로 대신하지 않도록 검토했다. 이어가기에는 원래 analytic 과거 이력 경계의 상대 시각을 함께 보존하고, 표시 축약과 독립된 계산 tape를 사용한다.
- S06의 실행 흐름 mock 검증은 실제 계산으로 승격되는 Pyragas 대신 같은 기존 mock 구현의 Langevin으로 옮긴다. 기존 assertion과 이전 시각 파일은 유지하고 S14 시각 이름을 새로 사용한다.

## CP1 검증

- `tmp/S14-cp1-vitest.json`: adapter/worker 53개, 기존 experiment contract 32개, 신규 runtime contract 3개, **88/88**, 4파일, 실패·skip 0.
- 전체 typecheck와 CP1 변경 TS의 scoped ESLint 통과. `git diff --check` 통과.
- Duffing/Van der Pol/Kapitza의 native RK4 상태·에너지 동등성, 조화 극한·우물 평형·한계주기·Kapitza 역평형 비교, native Mathieu coefficient/Floquet, 마찰 stick/breakaway·마지막 유효 상태를 검증했다.
- 지연은 native batch 비교·해석 극한·비정수 delay/dt·짧은 최종 step·출력 decimation 독립성·여러 번의 초기/후기 continuation·malformed tape·수치 실패 rollback을 검증했다. worker는 64단계/8ms, 2,001표본, 65점 표시 곡선/이력, 2,048점 계산 이력, 순서·오류·취소·15s timeout을 검사한다.
- 개발 중 early continuation 측정 오차 `2.6655945675815862e-5`를 발견했다. 원래 불연속 경계의 양쪽을 부동소수점 오차로 다르게 선택한 것이 원인이었다. 저장된 경계에서만 32 ulp 이내를 승인된 오른쪽 상태로 일관되게 선택한다. 같은 고정 fixture의 최신 최대 오차는 `2.7755575615628914e-17`, 허용오차 `1e-12`이다. 실패 측정은 `tmp/S14-numerical-development-early-boundary.json`에 보존했다.
- 초기 통합 typecheck의 미완성 client 필드·typed-array 타입 오류는 수정 후 통과했다. 첫 UI targeted 실행의 diagnostic/time 계약 불일치도 정확한 `nonlinear-model-v1` wrapper 확장으로 수정했다. 기존 버전·알 수 없는 버전의 evaluation 계약과 다른 diagnostic 모델을 회귀 테스트로 보존했다.
- CP1에는 adapter 6파일·adapter/worker 테스트 2파일, 최소 runtime 계약 확장·회귀 테스트, 상태 계약 문서·진행 기록·activeStageCheckpoint만 stage한다. 제품 UI·route/catalog·수치 보고서는 다음 checkpoint에 남긴다.
- CP1 `50254b7c7307a7e516a5a9745a3cfa67457477e2` push 성공, `ls-remote` 정확한 hash 일치.
- CP2 production build와 public-artifact privacy 검사 통과. browser 준비 실행을 시작한다. 기존 앱·물리/분석/런타임/worker/validation·공개 API·package/lockfile·golden 경로의 변경은 0개다.

## CP2 browser 준비 중 발견

- 첫 production browser 실행에서 기본 Pyragas가 약 0.210 s에 client의 잘못된 worker 결과 거부 경로로 들어갔다. 해당 실패와 30s timeout을 통과 결과로 세지 않는다. CP2를 push하기 전에 전체 delay 구간을 통과하는 client 회귀 fixture를 추가하고 원인을 수정한다.
- 새로운 시각 기준이 없는 첫 실행의 screenshot 실패도 별도로 기록한다. 기존 시각 파일을 갱신하거나 timeout/retry/assertion을 완화하지 않는다.
- 실제 원인은 0.216 s의 crop 대상과 기존 승인 격자점이 같은 상대 double(-0.2)로 변환되어 strict-order 검사를 실패한 것이었다. analytic 구간 이후에는 `[-τ−dt,-τ]`의 실제 승인 bracket을 보존한다. 아직 analytic 구간인 crop은 정확한 원래 함수를 유지하고 동일한 상대 표현의 합성 crop만 제거한다. validator의 엄격한 순서 검사는 유지했다.
- `tmp/S14-cp1-fix-vitest.json`: **93/93**, 4파일. adapter/worker는 58개이며 실제 client로 전체 기본 10s·chunk 1/7/64·초기 9단계/후기 109단계 이어가기를 검증하는 5개 회귀를 추가했다. typecheck·변경 TS ESLint 통과. 기존 물리식·golden·허용오차 변경은 없다.
