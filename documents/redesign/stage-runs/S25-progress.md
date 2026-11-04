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

### CP1 원격 확인 / CP2 과정 2

- CP1 `d2b16684604dc15c69d6aa54086dc03ab4a6f0f4` push exit0, 실제 ls-remote 및 tracking hash가 정확히 일치한다. 구현 중간 상태에서도 next25/완료1..24를 유지한다.
- CP2는 과정2 9개만 공개하는 독립 snapshot을 stage한다. 과정3의 작성된 파일은 작업 폴더에 그대로 두고, 4개 metadata/test 파일의 과정2 부분만 index에 적용한다. 사용자 파일을 옮기거나 되돌리지 않는다.
- staged snapshot을 새 `tmp/s25-cp2-check/`에 export하여 과정1+2의17개 등록, orphan0, 타입/표적/실제9개 사용자 여정을 검증한다. 설치 파일은 기존 lockfile 환경의 node_modules junction을 사용한다. 원본 작업 폴더와 과정3 초안은 변하지 않는다.

- CP2 export의 `redesign:learn:check`, typecheck, production build/privacy audit 모두 exit0. Learn/Focus **423/423 통과** (`tmp/s25-cp2-check/tmp/cp2-targeted.json`): 기존 회귀와 공통 native 과학·경계·runtime149개, 과정2만 제한해 실행한 공통 quality27개를 포함한다. 임시 제한 checker는 최종 전수 checker를 복사해 단원 집합만 과정2로 정한 검증 입력이며 제품 source를 바꾸지 않았다.
- CP2 export production Chromium **9/9 통과** (`tmp/s25-cp2-check/tmp/cp2-browser.json`). 각2.1~2.9에서 노출값을 실제 편집하고, 계산·진단 JSON·axe·정확한 canonical Lab export·복귀 결과·새로고침 후 편집값을 검사했다. retries0, 원30초, snapshot none이며 실패/skip/flaky/runner error0.
- 과정2 구현은 위 독립 export와 일치하는 명시적 staged 경로만 commit한다. 과정3 파일·그래프 보강·최종 전수 브라우저 정의는 다음 checkpoint에 남긴다.

### CP2 원격 확인 / CP3 과정 3

- CP2 `27b4ca3456cdd7360cf8daffa97b606d5987d622` commit/push exit0 및 실제 원격 hash 일치. CP3는 과정3의9개와 computation-free authoring helper·18개 전수 quality checker·사용 안내를 포함한다. 최종 metadata는26공개/60계획을 나타낸다.
- 과정3 검토 보강: 3.8의 모든 질점 x-z 궤적(1–4개)을 네 가지 색/선 모양과 대응 범례로 표시한다. 3.5에 실제 양의 초기 장력에서 시작하는 theta2.2/omega3의 적분 이완→포획 과제를 추가했다. native fixture에서 t>0·시간순·이완잔차≤1e-7N·포획잔차≤1e-7m 확인 후 내용을 갱신했다. 기본 t=0 유효성 판정과 구분한다.
- 새로운 과학/콘텐츠 검증과9개 실제 편집·Lab 왕복, typecheck/build를 통과한 후 CP3를 보존한다. 원래 엔진과 기존 adapter를 변경하지 않는다.

- CP3 관련 Learn/Focus **442/442 통과** (`tmp/s25-cp3-targeted.json`), 전체 typecheck·Learn check·production build/privacy audit exit0. 신규 과학·worker/session/runtime150개와 콘텐츠 quality45개를 포함한다.
- production Chromium 과정3 **9/9 통과** (`tmp/s25-browser-cp3.json`): 모든 노출값 편집, 실제 계산·단위·보고서·axe·canonical export 동일성·Lab/back/reload와3.8 가변 질점 그래프·범례 수 확인. retries0·30초·snapshot none, 실패/skip/flaky/runner error0.
- 과정2와 과정3는 각각9개 단원의 독립 구현 checkpoint로 나누어 보존한다. 최종 모바일·키보드/zoom·시각 baseline 및 전체 source 회귀는 구현을 원격에 보존한 뒤 CP4에서 마무리한다.

### CP3 원격 확인 / CP4 완료 후보

- CP3 `0732f2e` push exit0 및 실제 원격 hash 일치를 확인했다. 모든 제품/콘텐츠 source가 원격에 있다. 이후 발견되는 검증 결함은 별도 수정 checkpoint로 검증·push하며, 완료 status는 전체 필수 검사 후에만 만든다.
- candidate-complete: 새 전수 E2E의 Chromium/Pixel5 mobile 프로젝트, 320px·200%·keyboard·axe·로딩/빈/실패/취소·새20PNG 시각 비교, 기존 Learn/Focus와 기존 native workspace 대표 여정을 검증한다. 공개 수 변경으로 달라지는 기존 과정 목록4PNG만 명시 갱신하고 나머지 기존 baseline은 보존한다.
- 그 뒤 최종 전체 Vitest/golden·10개 품질 명령, 보존 및 전달본 해시, source와 로그 digest를 고정해 검증 증거를 commit/push한다. 제품 source는 CP3에서 고정한다.

### CP4 시각 확인과 눈금 여백 수정

- 신규20PNG 첫 생성은 CI의 missing-baseline 기록4건으로 exit1이었다 (`tmp/s25-visual-create.json`). 모든20개 실제 결과를 기록했으며 이것을 비교 통과로 취급하지 않는다. 기존 Learn 목록4건의 none 비교는 26개 공개 수·과정2/3 카드 변경의 실제 차이를 검출했다 (`tmp/s25-learn-visual-before.json`). 검토한 actual PNG를 해당 목록4개에만 복사하고 원본/새 SHA를 기록했다 (`tmp/s25-learn-baseline-updates.json`). 과정1·단원 PNG는 갱신하지 않았다.
- AI 시각 QA에서 새3.9 desktop SVG의 긴 y축 눈금이 왼쪽에서 일부 잘리는 것을 발견했다. HTML caption의 전체 값은 이미 접근 가능했으나 SVG 여백도55→90으로 넓히고 plotting width560→525로 조정했다. 수치·범위·canonical·native 결과는 바꾸지 않았다.
- 최초 전수54 실행은 이 표시 수정을 반영하기 위해 중단했으며 완료 증거로 쓰지 않는다. 수정 후 새 visual baseline만 명시 갱신하고, 모든 표시된 SVG text의 getBBox가 viewBox 안에 있는 assertion과 none 비교를 포함해54건을 처음부터 다시 검증한다. threshold0.2/maxDiffPixels100, mask없음, retry/timeout 조건은 유지한다.
- AI 확인은 사람·과학 전문가 검토가 아니며 human-reviewed0/18을 유지한다.

### CP4-V 눈금·시각 checkpoint

- 시각 none 비교 **8/8 통과** (`tmp/s25-visual-none.json`): 새20PNG와 Learn 목록/과정1/단원1의 기존 화면을 Chromium·Pixel5로 확인했다. SVG getBBox 검사로 표시되는 눈금/레이블이 viewBox 안에 있음을 검증했다. 새 matrix4PNG는 첫 생성 때와 같고, graph16PNG만 여백 수정에 맞춰 갱신했다. 기존 이미지 갱신은 계획한 과정 목록4개뿐이다.
- 최종 source의 전체 Vitest **5684/5684**,356files, 실패·pending0 (`tmp/s25-full-vitest-final.json`) 및9개 품질 명령 모두 exit0 (`tmp/s25-quality-final.json`). 새 source 과학 fixture는150개, 콘텐츠 quality45개다. secrets는 새 E2E까지 stage한 뒤 따로 수행한다.
- 병렬 최종 실행에서 tools/host가 약1.2시간 정지해 browser context setup의30초 제한 실패가 발생했다 (`tmp/s25-browser-suspension.log`). 해당 실행과 함께 돌던 단위 실행은 중단하고 완료 증거로 쓰지 않았다. 임시 process wake request를 적용한 별도 전체 재실행은 통과했다. 사용자 전원 설정은 변경하지 않으며 helper의 finally/process 종료 때 요청을 해제한다.
- 보호 helper의 PowerShell stderr 경고 처리 때문에 첫 시각 재실행이 시작 전에 중단됐다. 종료 코드로 판정하도록 수정했고, 남은 자체 preview PID13720의 경로/포트를 확인해 해당 process만 종료했다. 이후 정상8/8이 위 기록이다. 이 tooling 오류를 제품 실패/통과로 섞지 않는다.
- 눈금 보강과 검증 정의/이미지를 먼저 원격 보존한 뒤 고정 원격 source에서 완료 후보 검증을 확정한다. 공통 threshold·retry·timeout을 완화하지 않는다. 두 browser project는 독립2workers로 실행하며 결과에 실제 조건을 기록한다.
