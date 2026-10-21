# S19 고급 카오스·수송·인력권 분석 실행 기록

## 기준과 범위

- 기준 local/remote HEAD: `a7f4081a98adf4469efe69acc246e93598aa5b9d`, branch `codex/redesign`, upstream `origin/codex/redesign`. fetch 후 일치, 작업 폴더 clean.
- authoritative 여섯 문서를 전체 읽었다. S01–S18 연속 완료, S18 status/CP0–CP3 이력과 검증 산출물을 확인했다.
- `redesign:check`, `redesign:preflight -- 19` 통과. sandbox의 Git 쓰기/자식 프로세스 제한은 동일 명령의 확장 권한 실행으로 해결했다.
- 모델 selector는 노출되지 않는다. 기록된 사용자 선택을 전제로 진행하며 selector 검증·변경을 주장하지 않는다.
- 목표: RQA, recurrence network, correlation dimension, multifractal, topological entropy, transfer operator, CLV, FTLE/LCS, basin/uncertainty/Wada의 실제 native 계산, 공용 Dock, worker, provenance/export.
- 제외: S20 이후 안정성·분기·연구 queue·새 교육 콘텐츠·migration/cutover, master merge/release.

## 보존 계약과 과학적 한계

- 기존 app.html, pure physics/chaos/research/runtime/workers/validation/lib, public API, 사용자 데이터, package/lockfile, golden과 과거 PNG를 보존한다.
- S18의 원 실험/관측 provider와 smooth native RHS를 재사용한다. hybrid/delay/stochastic/quantum 모델의 부적절한 접선 진단은 이유를 표시한다.
- 1D scalar map 전용 entropy/Ulam 도구는 명명된 독립 benchmark source를 명시하고 원래 진자 결과로 오인시키지 않는다. 임의 함수 실행은 제공하지 않는다.
- 반전 basin은 보존계 double의 from-rest 각도 격자에 대한 유한시간 분류다. Wada 후보와 FTLE ridge 후보는 엄밀한 증명이나 LCS 인증이 아니다.
- 표본·해상도·threshold·척도·비용과 유한시간/유한표본 불확실성을 UI와 artifact에 보존한다.

## 내부 checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록·activeStage | plan/preflight/typecheck | 완료 |
| CP1 | native 고급 분석·계약·검증·worker·artifact | synthetic/native parity, resource/invalid/cancel, typecheck | 완료 |
| CP2 | lazy Dock·registry·설정·결과·export | component/build, desktop/mobile/keyboard/axe/visual | 완료 |
| CP3 | 전체 수치·회귀·보존 증거 | 전체 Vitest, quality, production E2E | 대기 |
| STATUS | 별도 완료 상태 | 구현 원격 확인 뒤 status push/hash | 대기 |

## 변경 예정 경로

- `src/product/adapters/analysis/advanced/`, `tests/product/adapters/analysis/advanced/`
- `src/product/lab/views/advanced*`, 공용 diagnostics facade, catalog metadata
- `e2e/redesign/advanced-diagnostics*`, 관련 component/registry tests
- `scripts/redesign/measure-advanced-diagnostics.ts`, `documents/redesign/advanced-diagnostics-ko.md`, `stage-runs/S19-*`, `status.json`

## 진행·위험·원격 증거

- 완료 목록과 nextStage=19를 유지한다. 검증된 checkpoint만 명시적 경로로 commit/push하고 정확한 원격 hash를 확인한다.
- 기존 dependency/CodeQL 위험은 본 단계에서 해결·수용했다고 주장하지 않는다. 사람 과학 검토를 꾸며내지 않는다.


- CP0 `b78adfc54ac51f0763b618d4ed93824ce88363cb` push 성공. `git ls-remote`의 정확한 hash 일치 확인. plan/preflight/typecheck exit0.
- CP1 진행: native adapter/strict input/worker/artifact 구현. 원래 관측의 transient·stride 후 첫 maxSamples를 명시적으로 선택하며 선택 시각과 표본 수를 보존한다.
- 독립 닫힌 해 benchmark 14/14. logistic Ulam CDF 오차32상자0.079456은 고정0.06기준에 미달했고,64·128상자에서 동일 기준 및 감소 추세를 통과했다. 거친 격자 결과도 보존한다.

## CP1 계산·worker·artifact

- 12도구 native 연결,35시스템×12=420호환 조합의 실제 계산/artifact왕복 또는 설명 있는 거부를 검증했다. 기존 S18 native source/flow를 공유한다.
- 통합 targeted493/493 및 최종 worker/artifact/native-parity42/42, 전체 typecheck, 담당ESLint/Prettier 통과. full Vitest는 별도로 실행 중이다.
- 원래 관측·단위·선택 시각, 별도 scalar source/정지 격자,원 실험,runID와 생성 시각을 versioned artifact에 보존한다.16MiB/구조/깊이/위험키/getter/희소배열/비유한값/서명·단위·계산법·파생source를 검증한다.
- 취소/dispose는 별도worker를 종료하며 늦은 응답을 폐기한다.30초무응답 종료. 동기native 내부 진행률은 indeterminate이고 결과 준비 상태만 확정한다.
- 교차검토로 Wada native numColors=max(label)+1의 오해를 막고 실제 distinct label 수를 계산한다. {0,2}/{1,2}를 세종류로 오인하지 않는 회귀 통과. 세격자를 한 번씩 계산하고 정확한 누적작업 예산을 적용한다.
- FTLE는 native gradient를 한 번 전파하고 zero/subnormal STM 및 비유한 특이값을 거부한다. 극단감쇠 underflow 회귀와 정상native결과 exact parity를 통과했다. pure엔진/API 변경0.
- 경계·스케일 부족 uncertainty와 CLV expanding/contracting쌍 부재는 null+이유로 보존한다. native기본값을 유효한 과학적 판정으로 대신 쓰지 않는다.

- CP1 `43b5803038b7c14500fb891f3ba5a9ed20355e5f` push 성공. 정확한 원격hash 일치 확인. CP2 공용 lazy Dock/registry/접근성/시각검증 진행.
- production Chromium exploratory4/4: 전체12도구 실제worker와artifact왕복,독립map source,입력/자원거부,worker오류복구/취소. 최종 동결browser 검증과 구분한다.
- 첫 시각검토에서320px 수치표의 과도한 줄바꿈을 발견했다. 셀nowrap+가로scroll로 수정하고 새4PNG만 다시 준비한다. 과거PNG는 변경하지 않는다.

## 최종 검증 진행

- 전체 Vitest `tmp/S19-final-vitest.json` **4375/4375**,320파일,failed/pending/todo0,exit0,maxWorkers2·기존timeout 유지. 기존3896개 assertion 이름·중복 횟수 보존. 변경 없는 Learn Date fixture의 동적 시각1개만 좁게 정규화했다.
- 독립수치 `S19-numerical-metrics.json` **14/14**. logisticCDF오차32/64/128상자=0.07945625/0.05577607/0.04128365. 고정오차0.06과세분오차감소를 확인했다.
- 품질10종 typecheck/ESLint/format/policy/module-size/plan/catalog/Learn/inventory/secrets exit0. Catalog135/35시스템/134frozen참조,Learn8과정/86예약/8공개,inventory883파일·brokenimport0·orphan0 유지.
- 보호경로diff0,기존PNG200개 byte-identical,desktop roadmap/execution 사본hash 각각일치. 기존app/pure엔진/product물리adapter/publicAPI/package/lockfile/golden 원본보존.
- 최초최종browser는27pass/3fail로완료근거에서제외했다. 취소fixture의짧은CLV가버튼클릭전완료해실패했고,동일실행에서44분typecheck/47분browser벽시계정지와모바일2timeout을관측했다. 중단원인은단정하지않는다. `tmp/S19-interrupted-playwright.json/log`와trace를보존했다.
- 취소fixture를1.92million tangent-work의유효한실제CLV로바꿨다. 제품코드·timeout·retry설정은변경하지않고신규30case전체를snapshot-none/retries0으로다시실행한다.
- 최종build exit0. 새light/dark desktop/Pixel5 PNG4개만준비하고agent가모두직접검사했다. 준비2/2통과는최종정상회귀와구분한다. `tmp/S19-ui-validation.json`에hash와320px표수정근거를기록했다.

## CP2 공용 Dock 완료

-9개패밀리35route에서기존공용mount를공유하는별도lazy Dock를추가했다. 11개기존S19카탈로그정의로12실행도구를검색·발견하며nativebinding과135정의를유지한다.
-새 production 최종30/30: Chromium15+Pixel5 15,failed/skipped/flaky/runnererror/retry0,snapshot-none,exit0. 원래timeout을유지했다. 모든도구실제worker/원실험보존import·export/source분리/invalid·resource·cancel·error·lazyload·키보드·axe·320px·zoom2검증.
-계산·불확실성·원자료표와재귀행렬/복소고유값/CLV성분/다중프랙탈/FTLE능선·반전격자를표시한다. 수치표는가로scroll로정확한숫자를보존한다.
-기존시각helper는새공용wrapper만잠시분리하고동일노드를finally복원한다. 기존assertion·PNG·CSP를변경하지않는다. S18 및기존9패밀리94case검증은CP3에서확인한다.
