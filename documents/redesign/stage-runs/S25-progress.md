# S25 — 교육과정 2~3 제작

## 시작과 범위

- 기준 로컬/원격 HEAD: `831e7afeda1c5d94439a2bf52276b2ff5996587d`.
- 저장소: `C:/Users/junge/Desktop/pendulum_lab_modular`, 브랜치/upstream: `codex/redesign` / `origin/codex/redesign`.
- 작업 폴더는 깨끗했고 fetch 후 두 HEAD가 일치했다. `redesign:check`와 `redesign:preflight -- 25` 통과. sandbox에서 Git 하위 프로세스 EPERM이 발생한 preflight는 동일 명령의 확장 권한 실행으로 통과했다.
- S01~S24 완료 상태와 Git 이력, S24 status commit 및 review/verification/preservation/example ZIP 산출물을 확인했다. S10~S12 시스템 adapter, S21 batch 실행 및 기존 S09 Focus를 재사용한다.
- 사용자의 다음 번호 요청에 따라 S24 워크플로 사용자 gate를 승인 목록에 기록한다. 사람의 과학 검토와는 별개다.
- 목표: 2.1~2.9 및 3.1~3.9의 이론·유도·예제·실행 가능한 전용 실험·확인 질문·출처·Lab 전달 18개 단원.
- 범위 밖: S26 이후 단원, 기존 엔진 재작성, app.html 전환, 전체 parity/migration, master merge/tag/release.

## 보존 계약

- 기존 physics/chaos/research/runtime/workers/validation, 공개 API, app.html, 저장/공유 형식과 사용자 데이터.
- 기존 수치 golden/fixture와 과정 1 콘텐츠 및 Focus 동작. 새 학습 실험은 실제 공용 adapter/engine을 호출하고 운동방정식을 복제하지 않는다.
- 기존 테스트 assertion·시각 baseline은 기능 확장에 필요한 metadata 기대값 외에는 약화하지 않는다.
- 실행 모델 UI 선택값은 런타임에서 확인할 수 없으므로 선택 변경/검증을 주장하지 않는다.

## 내부 checkpoint와 검증

1. **CP0 준비**: 이 기록과 active25/CP0, S24 사용자 gate 승인. 계획/JSON 검증 후 commit/push.
2. **CP1 공통 Focus 확장**: bounded/cancellable 실제 adapter 실행, 단원별 진단, 안전한 draft와 canonical Lab 왕복. 신규 정상/경계/실패 검증, 기존 Focus 회귀, typecheck, 콘텐츠 계약 검증. 검증한 경로만 commit/push.
3. **CP2 과정 2**: 수치해석 9개 단원과 scientific fixture, route/transfer 전수. 출처 확인과 targeted 검증 후 commit/push.
4. **CP3 과정 3**: 다중·비강체·공간 진자 9개 단원과 scientific fixture, route/transfer 전수. 사건/구속 허용 오차와 targeted 검증 후 commit/push.
5. **CP4 통합 증거**: 전체 Vitest, golden, typecheck/lint/format/build, 계획/catalog/Learn/inventory 검사, desktop/mobile/keyboard/a11y/시각 및 18개 route/transfer 전수. 보존 해시와 desktop 전달본 해시 기록. 검증 증거 commit/push.
6. **완료 status**: 모든 구현 원격 확인 후 별도 lastCompleted25/next26 status commit/push. 실제 원격 hash 일치 전 완료 아님.

## 변경 예정 경로

`content/learn/course-2/`, `content/learn/course-3/`, curriculum/modules metadata, `src/product/learn/`, `src/product/experiments/`, 관련 `tests/product/`, `e2e/redesign/`, 필요한 product CSS, 이 progress와 S25 증거/status. 기존 엔진/adapter 수정은 먼저 characterization 근거 없이는 하지 않는다.

## 진행·위험·원격 증거

- 현재: CP0 준비. 완료 목록1..24와 next25는 유지한다.
- 수치 방법별 실제 adapter 지원 범위, stiff/implicit 및 사건 root 표시의 의미를 기존 API에서 확인한다. 지원되지 않는 계산을 실행한 것처럼 표시하지 않는다.
- 공개 과학 내용은 primary 참고문헌 대조 및 자동 fixture 결과와 사람 검토 대기를 구분한다. 기존 보안 부채의 해소/승인이나 새 전면 감사는 이번 단계의 주장이 아니다.
- commit/push와 검증 결과는 각 checkpoint 종료 시 아래에 추가한다.

### CP0 원격 확인 / CP1 진행

- CP0 `03cead0afc0ee9252ea90a5f787d172e5cb4bd47` commit 및 push exit0, 실제 `git ls-remote origin refs/heads/codex/redesign`의 동일 hash를 확인했다.
- S24 연구 워크플로 사용자 gate24는 이번 S25 요청으로 승인했다. 과학 전문가 검토는 여전히 대기다.
- CP1 진행: 새 선언형 필드/단원 실험 registry, 실제 adapter 입력과 canonical 변환, worker 격리 진단, session/보고서/전달 UI. 과정별 콘텐츠 작성은 병렬 진행하며 원격 checkpoint는 검증된 응집 경로만 포함한다.
- 기존 Lab adapter는 Euler/RK2/RK4 또는 native internal stepper를 지원한다. 적응형·symplectic·implicit 비교에는 보존된 별도 native 수치 방법을 호출하고, Lab에 전달되는 baseline 설정과 비교 설정·결과를 구분해 보고서에 보존한다. 학습용 운동식/적분기 재구현은 하지 않는다.
- root 통합: 18개 단원 metadata/lazy imports, Learn 목록의 실제 공개 수와 시스템 연결, 기존 metadata 기대값/임시 content fixture 경로를 확장한다. 새 전수 quality 검사에는 SI 차원 대조와 계산 코드 금지 검사를 포함한다.

### CP1/콘텐츠 초기 검증

- 과정 2·3의 18개 모듈 작성 및 등록, `redesign:learn:check` 통과. 26개 공개 단원과 60개 계획 단원의 구분을 metadata에서 계산한다. 새로운 심화 단원은 공개하지 않았다.
- 초기 Learn+기존 Focus 표적은 283/284였다. 실패 1건은 fresh-process fixture가 curriculum의 courses만 합성해 새 authoring helper 의존성을 누락한 것이었다. 실제 curriculum과 computation-free helper를 임시 폴더에 복사하도록 고쳐 기존 오류 검출 assertion을 유지했다. Learn 재검사 234/234 통과 (`tmp/s25-learn-fixed.json`).
- 18개 신규 단원의 quality 37/37: 모든 schema·과정/단원 제목·출처·bilingual task·SI 차원 일관성 검사 통과. 실행 기능과 관찰값의 과학 검증은 별도 native fixture로 수행한다.
- 독립 과학 검토에서 adapter 호출 인수, native spatial의 빈 analyses 계약, 단면 방향, adaptive 비용 계수 등과 현재 코드의 차이를 교정한다. 실제 공간 결과에는 native intrinsic 에너지·수직각운동량·구속 잔차를 표시하며 지원하지 않는 분석을 canonical에 삽입하지 않는다.
- 초기 보존 검사: protected353/353, 기존 PNG218/218 바이트 동일. 기존 test/fixture441개 중 변경은 공개 metadata와 fixture 연결을 반영하는 3개 경로뿐이다. 전달본 roadmap/plan SHA256이 원본과 일치하므로 복사할 변경이 없다.
- 초기 typecheck는 구현 중 새 파일의 import 상대 경로·union narrowing·배열 타입 문제를 찾아 수정 중이었다. 완료 검증으로 취급하지 않는다. sandbox esbuild EPERM은 같은 검사의 확장 권한 실행으로 해결했다.

### CP1 검증 통과와 구현 보존 후보

- 최종 표적 Learn/Focus 433/433 통과, 실패·pending0 (`tmp/s25-cp1-targeted.json`). 신규 native science56, systems10, compound6, worker/session 경계69, runtime8을 포함한다. 초기13 worker 계약 누락과3 chart numeric 변조 재현, native −0 정규화·수정 반환 객체 alias 재현을 보강한 뒤 모든 정상18개 결과와 악성/경계 입력을 통과했다. native source는 수정하지 않았다.
- 독립 검토에 따라 3.8 링크 수1–4 변경, 모든 적분 단계의 공간 보존/구속/단위/접선 잔차, 3.3의 실제 막대·질점 궤적과 동방향 교차 간격을 추가했다. 교차 간격은 다중 모드 계의 고유 주기로 인증하지 않으며 교차 두 개 미만이면 평균을 만들지 않는다.
- native spring의 k4000/h0.05는 안전하게 실패하고 h0.01에서 복구됨을 fixture로 검증했다. source-checked 문구는 실패한 비교를 완료 결과로 표현하지 않는다.
- production build와 privacy audit, 전체 lint(policy+ESLint), format:check, module-size audit, plan check 통과. 이후 기존 경고/threshold/timeout/retry를 완화하지 않았다.
- 최초 브라우저 시도는 새 테스트가 quantity 입력을 spinbutton으로 가정한 selector 문제로 중단했다. 실제 textbox를 선택하도록 수정했다. 다음 대표6건은4통과/2실패: native Lab의 학습 출처 복귀 링크 누락이었다. chain/constraint/spatial에 검증된 learn provenance일 때만 안내를 추가했다.
- 수정 후 production Chromium 대표8/8 통과 (`tmp/s25-browser-cp1.json`): 실제 계산/보고서/Lab/back/reload, invalid edit·cancel/restart, 빈 단면, worker 시작 실패 복구, lazy chunk 실패/지연 취소. 실제 snapshot policy none, retries0·원래30초 조건. 일반 Lab과 기존 core는 그대로이며 출처 notice는 학습 공유 설정에만 표시한다.
- CP1은 실행/계약/과학 fixture·공통 화면 경로만 포함한다. 과정별 콘텐츠/metadata와 최종18개 편집 왕복/모바일/시각 검증은 후속 checkpoint에서 따로 보존한다. 마지막 전체 회귀도 진행하며 상태는 next25/완료1..24를 유지한다.

### 검토된 실험 프로필 연결 보강

- root 계약 검토에서 2.1의 focus.kind/plot만 S09 configuration으로 바꾸면 검증을 통과하는 경우를 새 회귀 테스트로 재현했다 (`tmp/s25-profile-repro.json`). 과정2/3은 항상 단원별 reviewed declaration에 연결하도록 분기를 고정했다. 다른 native system·지원하지 않는 solver·hidden 물성 변경·unknown 좌표·plot·분석 누락·전달 출처 변조도 거부한다.
- 보강 후 전체 관련 표적 441/441, 실패·pending0 (`tmp/s25-cp1-targeted-final.json`), 전체 typecheck와 변경 TS의 ESLint 통과.
- 첫 전체 Vitest는 시작 후 프로필 회귀 테스트/guard가 추가되던 실행으로, 캐시된 보강 전 validator에서 새 회귀1건만 실패했다 (5682/5683, `tmp/s25-full-vitest.json`). 이 혼합 시점 결과를 최종 전체 통과로 사용하지 않는다. 제품·테스트 source를 고정하고 전체 검증을 다시 실행한다 (`tmp/s25-full-vitest-stable.json`). 최종 실패가 남으면 checkpoint를 publish하지 않는다.

- 고정 source 전체 Vitest **5683/5683 통과**, 실패·pending0 (`tmp/s25-full-vitest-stable.json`). 이 source에서 최종 관련441/441, typecheck, 콘텐츠 검사, lint/format/module audit/build 및 production 대표8/8을 확인했다. CP1 공통 실행 계층을 명시적 경로만 stage해 보존한다.
