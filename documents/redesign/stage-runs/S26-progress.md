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
