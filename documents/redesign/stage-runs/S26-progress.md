# S26 — 교육과정 4~5 제작

## 시작과 범위

- 기준 로컬/원격 HEAD: `04c770e3b1af185fda11748dbb1940adf328a9db`.
- Git으로 저장소 루트와 `codex/redesign`/`origin/codex/redesign`을 확인했다. 깨끗한 작업 폴더에서 fetch 후 HEAD가 일치했다.
- 권위 문서 6개와 AGENTS.md를 읽었다. plan check 통과. sandbox의 Git spawn EPERM 후 동일 preflight26을 확장 권한으로 실행해 통과했다.
- status의 S01~S25 연속 완료, 각 status Git 이력, S25 검증/보존 산출물, S13~14 및 S18~19 실제 adapter를 확인한다.
- 목표: 4.1~4.10, 5.1~5.13의 이론·유도·예측/관찰·Focus·checkpoint·출처·정확한 Lab 전달 23개 단원.
- 범위 밖: S27 이후 콘텐츠, 엔진 재작성, 전체 migration/parity, app.html 전환, master merge/tag/release, Landing 수정.
- 모델 선택 UI는 런타임에서 확인할 수 없다. 선택 변경이나 검증을 주장하지 않는다.

## 보존 계약

physics/chaos/research/runtime/workers/validation, 기존 product adapter, public API, app.html, package/lockfile, 저장/공유 형식, 기존 콘텐츠와 수치 golden을 보존한다. 새 실험은 실제 공용 engine/analysis를 호출한다. canonical에 지원하지 않는 진단 설정을 삽입하지 않고 별도 비교 설정은 보고서에 명시한다. 과학 사람 검토를 생성하지 않는다.

## 내부 checkpoint

1. CP0: 진행 기록과 active26/CP0. next26/완료1..25 유지. plan 검사, commit/push.
2. CP1: 공통 제한 입력·worker·결과·session·Lab 전달·접근성 화면. 정상/경계/악성/취소 검증 및 기존 Focus 회귀.
3. CP2: 과정4의 10개 단원과 실제 비선형/제어 실험. known-regime fixture, 전수 콘텐츠/route/transfer, typecheck/build 후 commit/push.
4. CP3: 과정5의 13개 단원과 실제 핵심/고급 카오스 실험. synthetic/known-regime·sampling/threshold 실패 fixture와 전수 여정 후 commit/push.
5. CP4: 고정 source 전체 Vitest/golden, typecheck/lint/format/build, plan/catalog/Learn/inventory, desktop/mobile/keyboard/axe/시각, 보존·전달본 해시. 검증 증거 commit/push.
6. 별도 status: 모든 구현 원격 확인 및 필수 검증 성공 후 lastCompleted26/next27, active null을 commit/push. 실제 원격 hash 확인 전 완료 아님.

## 변경 예정 경로

`content/learn/course-4/`, `content/learn/course-5/`, modules/curriculum metadata, 새 research/nonlinear/chaos Focus 및 authoring helper, Learn schema/validation/mount, 관련 tests/E2E/CSS, S26 문서/증거/status. 기존 테스트 metadata와 공개 과정 목록 시각 변화는 의도한 변경만 검토한다.

## 진행과 위험

- 현재 CP0. 이후 검증·commit·push 증거를 추가한다.
- 유한시간 지표를 엄밀한 카오스 판정이나 UPO 안정화 증명으로 표현하지 않는다. 좌표/시간/에너지 단위와 tangent·sampling·threshold 한계를 각각 표시한다.
- source-checked와 automated-verified는 실제 출처 대조 및 fixture 뒤에만 완료로 판단한다. human-reviewed는 미완료다.
- 기존 dependency/CodeQL 부채는 S30 판정 범위이며 이번 단계가 새 보안 감사나 위험 수락을 의미하지 않는다.

### CP0 원격 / CP1 구현 중

- CP0 `10f44da79bd4db8048c6ffa62d45ae0f21aa0bc2` commit/push exit0, 실제 ls-remote hash 일치. next26/완료1..25 유지.
- 신규 23개 실제 기본 실험과 worker 결과 계약 23/23, 별도 설정/worker/session 경계 25/25, 합계48/48 초기 통과 (`tmp/s26-integration-initial.json`). 후속 콘텐츠·과학 fixture·전체 여정 검증을 대체하지 않는다.
- Lab의 S18/S19 panel이 canonical 분석을 기본값으로 열던 경로를 발견해 원래 versioned settings를 복원·저장하도록 UI adapter를 추가한다. 기존 physics/analysis adapter는 바꾸지 않는다.
- Mathieu/Duffing/Van der Pol의 정규화 시간은 초와 구분해 표시한다. Poincare·recurrence 그래프는 실제 점 분포를 연결선 없이 표시한다. 부호 있는0은 JSON 경계에서0으로 정규화하며 비유한 수치는 거부한다.
- 초기 typecheck 실패는 아직 작성 중인 단원 import와 공통 worker 타입/검사 narrowing이었다. 공통 타입을 수정했으며 전체 완료 검증 전까지 통과로 기록하지 않는다.
- 개발 서버의 Vite style injection이 보존된 strict CSP에 막힌 handoff browser 실행은 최종 증거가 아니다. CSP를 완화하지 않고 production build에서 재검증한다.

### CP1 검증 및 source 보존

- 명시적 44개 staged 경로를 `tmp/s26-cp1-check`로 export해 새 콘텐츠 없이 기존 26개 단원만으로 독립 검증했다. 사용자 작업 폴더의 과정4/5 초안은 이동하거나 되돌리지 않았다.
- export 표적 **611/611, 49files**, 실패0 (`tmp/s26-cp1-check/tmp/cp1-targeted.json`), typecheck/build/privacy/lint/format 모두 exit0. 포함: 실제 신규23개 실행, nonlinear21, chaos26, 설정/worker/session25, 독립 lifecycle/scatter7, Lab 분석 전달35 및 기존 Learn/Focus/모델 회귀.
- production handoff **10/10**, Chromium5/Pixel5 5, 오류/skip/flaky0 (`tmp/s26-cp1-check/tmp/cp1-browser.json`). 실제 분석 종류·값 복원/편집·실행·save/share/export/reload, 과거 S07과 driven/Pyragas 복귀를 확인했다. retries0, snapshot none, 원30초 조건이다.
- 독립 검토로 취소 subscriber가 emit 중 취소한 뒤 worker가 시작되는 경우를 재현하고 guard를 추가했다. 재현 테스트 포함32개 경계/검토 통과. 임의 유한 수치의 위조 인증을 주장하지 않고 구조·한도·계보를 검사한다.
- 새 콘텐츠 수식의 제한 문법·기호 누락과 fixture helper 복사 누락을 교정했다. 표시 문법/과학 검사를 완화하지 않았다. 23개 독립 SI 검사는 통과했고 콘텐츠 최종70/70도 확인했다.
- CP1 검증 뒤5.12의 로그 축을 `log(r / 1 rad)`로 명확히 했다. 수치 알고리즘 변경 없이 chaos26/26을 다시 확인했다 (`tmp/s26-cp1-check/tmp/cp1-axis-check.json`).
- 첫 export format 검사는 task 생성 browser JSON이 snapshot 루트에 있어 실패했다. 해당 보고서를 export의 tmp로 이동한 뒤 동일 전체 format 검사 통과. 검사 자체와 허용 범위는 그대로다.
- CP1은 새 실행·진단·Lab 전달 계층만 포함한다. 공개 콘텐츠와 metadata는 CP2/CP3로 분리하고, 최종 전체 회귀와 시각 검증 후에만 완료 상태를 기록한다.

### CP1 원격 / CP2 과정 4

- CP1 `57c9cc58f14613c642c2701663b7470f1345c8c6` push exit0, 실제 원격 hash 일치.
- 23개 전체 콘텐츠 초안의 Learn 표적312/312와 독립 새 콘텐츠 품질70/70 통과. 본문·기호·SI 차원과 출처·미검토 상태를 확인했다. 신규 운동식/적분기 중복은 없다.
- CP2는 과정4의10개만 공개하는 snapshot을 stage한다. 최종 metadata/test의 과정5 부분과 13개 초안은 작업 폴더에 보존한다. staged tree export의36개 공개 단원과 관련 품질·실제10개 편집/계산/Lab 왕복을 검증한 뒤 보존한다.

- CP2 export의 Learn 표적 **273/273** (기존 회귀+과정4에 제한한 동일 품질 checker31), typecheck/build/privacy exit0. `tmp/s26-cp2-check/tmp/cp2-content.json`과 typecheck/build 로그에 기록했다. 제한 checker와 브라우저 정의는 최종 전수 정의의 단원 집합만 좁힌 검증 입력이며 제품 source는 바꾸지 않았다.
- production Chromium **10/10**, 실패/skip/flaky/runner error0 (`tmp/s26-cp2-check/tmp/cp2-browser.json`): 노출값 실제 편집, 수식/체크, 실제 계산·결과 JSON·axe·정확한 canonical Lab export·복귀 결과·새로고침 설정과 사용자 저장 원본 보존. retries0, 원30초, snapshot none이다.
- 최초 CP2 typecheck/build 호출은 export의 tmp 로그 폴더가 없어 명령 자체가 실행되지 않았다. 디렉터리 생성 후 두 명령을 다시 실행해 실제 exit0을 확인했다. 처음 wrapper의 exit0을 검증 성공으로 사용하지 않았다.

### CP2 원격 / CP3 과정 5

- CP2 `e22da19d1e1fd6f2814985ace4c33387253d2c84` push exit0와 실제 원격 동일 hash 확인.
- CP3은 과정5의13개와 computation-free authoring helper, 전체23개 품질70개, 최종49공개/37준비 metadata와 안내를 포함한다. 공개 수를 반영한 기존 metadata 기대값 외 수치 assertion을 완화하지 않았다.
- 13개 실제 분석은 S18/S19를 호출하며9점 SALI/FLI, 동일 run의 창/관측량/threshold 비교, 실제 epsilon·fitRange·bootstrap/block 변동을 표시한다. 수치 참조와 유한 구간의 한계를 본문과 결과에 구분했다.
- 한국어 띄어쓰기·영문 결합 단어를 교정하고, 수식의 모든 기호·SI 차원을 검사했다. 정확히23개 고유 탐구 활동이며 사람 검토는0/23이다.

- 최종 Learn **312/312** (신규 품질70 포함), CP3 typecheck와 production build/privacy exit0. 실제 native/synthetic 과정5 fixture26개는 CP1 source에서 통과했으며 원래 분석 코드를 바꾸지 않았다.
- production Chromium 과정5 **13/13**, 실패/skip/flaky/runner error0 (`tmp/s26-cp3-browser.json`). 노출값 편집·실제 분석·진단 JSON·axe·분석 옵션/단위를 포함한 canonical Lab export 동일성·복귀·새로고침을 전수 확인했다. retries0, 원30초, snapshot none이다.
- 신규16PNG의 최초 생성16/16과 SVG text bounds 검사를 통과했다 (`tmp/s26-visual-create.json`). 이는 기준 생성이며 비교 통과로 취급하지 않는다. AI 시각 QA에서5개 Mathieu 곡선 중 첫/다섯 선의 모양이 겹쳐 CP4에서 구별되는12개 선 패턴으로 보강하고 해당4PNG만 갱신한다. 기존 시각 기준의 완화나 마스크 추가는 하지 않는다.

### CP3 원격 / CP4 검증

- CP3 `62e9cce8559d23f420d010d43ad97699eff162d6` push exit0, 실제 원격 hash 동일. 49개 공개 콘텐츠가 원격에 있다.
- CP4 시각 QA에서 재귀 행렬의 앞2500개만 표시하면 뒤쪽 행이 잘리는 표시 편향도 확인했다. native 전체 계산은 유지하고 전체 연결 배열에서 첫/마지막을 포함해 균일 간격으로 최대2500개를 추출한다. 실제 연결만 표시하는 두 회귀를 추가해 과정5 **28/28** 통과 (`tmp/s26-display-sampling.json`). 표시 방식과 전체 분석의 차이를 경고에 명시한다.
- 과정 목록 none 비교4건은 49공개/5개과정 확장의 의도한 차이를 검출했다 (`tmp/s26-learn-visual-before.json`). 확인한 actual4개만 해당 목록 baseline으로 복사하고 전후 SHA를 기록했다 (`tmp/s26-learn-baseline-updates.json`). 나머지 과거 PNG는 수정하지 않는다.
- 보존 hash 초기 확인: 보호388/388 동일, 기존test/fixture443 중439동일/4metadata·fixture 수정, 과거PNG238 중234동일/4과정목록 변경, desktop 전달본2개 hash일치. 느린 순차 Git reader는 확인한 task 소유 process만 종료하고 동일 범위를 단일 Git batch reader로 검사했다. 사용자 파일은 삭제하지 않았다.
- CP4-V에서 표시·E2E·시각 기준을 검증/push하고 고정된 원격 source로 전체 Vitest/golden·품질·production 여정을 확정한다. 완료 status는 그 뒤 별도 push한다.

- CP4-V production 표적 **28/28**, Chromium14/Pixel5 14, 실패/skip/flaky/runner error0 (`tmp/s26-visual-boundaries-none.json`). 신규16PNG 및 기존 Learn12PNG를 snapshot none으로 비교했고, 빈 단면·invalid/corrupt draft 원본 보존·worker 시작 실패·취소/재실행·320px·키보드·200% 확대를 확인했다. 모든 표시 SVG text는 viewBox 안에 있었다. threshold0.2/maxDiffPixels100, mask없음, retries0, 새 test30초와 기존 Learn60초를 유지했다.
- 선 패턴4PNG와 전체 재귀 표시4PNG만 신규 기준 생성 뒤 갱신했다. 이외 신규8PNG는 최초 생성과 같다. 새16개 최종 none 비교 전 SHA를 보존하고 비교 후 변경이 없음을 확인한다. 기존 이미지 변경은 과정 목록4개뿐이다.
- 표시 보강 source는 native 과정5 **28/28**, 전체 typecheck와 production build/privacy 통과. 원래 수치·엔진은 그대로이며 regression2개는 표시된 모든 점이 native 연결이고 첫/마지막 행렬 범위를 보존하는지 검사한다.

### CP4-F 검증 실행 격리

- CP4-V `54b900f7b7f5c30e6b3655f642224cf093a1d0d3` commit/push exit0 및 실제 원격 hash 일치. 전체 제품/콘텐츠/브라우저 정의·PNG는 여기서 고정했다.
- 첫 동시 전체 실행은 Vitest5871pass/1fail/21skip of5893이었다. 신규 native10개를 모은 beforeAll이10초를 초과했고 기존 S24 exact inventory가37.56초로 원래30초를 초과했다. 다른 단독 실행도 browser3workers와 겹쳐30.82초였다. 수치·baseline assertion의 불일치가 아니며 이 결과를 완료 증거로 사용하지 않는다.
- 같은 기간 신규 browser79/80은4.7 dark 계산완료의 원5초 expect를 초과했고, 기존 회귀37/40은 S18/S19 다중 진단의 원30초 test를 초과했다. 시각 기준·수치·접근성 assertion 실패는 없었다. 실패 보고서를 각각 `tmp/s26-full-vitest-contention.json`, `s26-browser-contention.json`, `s26-regression-contention.json`에 보존한다.
- 새 native test만10개 일괄 startup 대신 각 단원 검사에서 최초1회 계산하는 cache로 분리했다.21개 assertion·조건·수치 한도와 기존10/30초 설정은 그대로다. 표적21/21과 ESLint 통과. 제품 코드·계산·브라우저 정의·PNG는 수정하지 않았다.
- 다른 browser/quality 종료 후 기존 인벤토리14/14가 통과했다 (`tmp/s26-inventory-quiet.json`). 정확한 baseline 검사는17.519초였다. 기존 scanner/compiler options/테스트/수치 golden은 전혀 수정하지 않았다.
- 최종 전체 검증은 resource phase를 분리한다. 전체 Vitest는1worker/forks/isolate로 단독 실행하고, 품질/build를 마친 후 browser 전수를 별도 실행한다. retry·snapshot/시간 한도·threshold를 완화하지 않는다. 이 test 실행 분리 checkpoint를 먼저 push한 뒤 최종 결과로만 완료를 판정한다.
