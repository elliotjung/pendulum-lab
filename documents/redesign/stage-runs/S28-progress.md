# S28 — 저장·공유 migration과 기능 동등성 심사

- 상태: in-progress / CP3 (2026-11-06 재개)
- 시작일: 2026-11-05 (Asia/Seoul)
- 기준 HEAD / fetched origin/codex/redesign: `b78cdae4ea8e707e70ecd5a454173507f60aca2a`
- 작업 branch/upstream: `codex/redesign` / `origin/codex/redesign`; 시작 시 clean, ahead/behind 0/0.
- 공식 입력 여섯 문서와 AGENTS.md를 전체 읽었다. Desktop 전달본 두 개의 raw SHA256은 저장소 원본과 일치했다.
- `redesign:check` 통과. 최초 sandbox preflight는 Node→Git spawn EPERM으로 실행하지 못했으며, 허용된 재실행에서 `redesign:preflight -- 28` 통과했다. Fetch도 sandbox의 FETCH_HEAD 쓰기 제한 뒤 허용된 재실행에서 성공했다.
- 모델 selector는 이 실행 환경에 노출되지 않았다. UI 선택을 확인하거나 변경했다고 주장하지 않는다.

## 목표와 경계

기존 저장/URL/import/share를 원본을 보존하며 preview하고, 명시적으로 지원하는 versioned adapter를 통해 canonical restart configuration으로 변환한다. S01 inventory의 각 항목에 새 UI 접근 경로, 실제 결과 비교, 테스트와 export 증거를 연결하고 자동 검증한다. migration/parity 중 미충족 항목이 있으면 100% 또는 S28 완료를 기록하지 않는다.

S29 기본 app.html 전환, audience UI 제거, master merge, force push, release/tag/branch 삭제, Landing 저장소 수정은 범위 밖이다.

## 보존 계약

- `src/physics`, `src/chaos`, `src/research`, `src/runtime`, `src/workers`, `src/validation`과 기존 공개 API/수치 golden을 보존한다.
- 기존 `app.html`, 저장 DB/localStorage, import/export/share 원본은 변경하거나 자동 덮어쓰지 않는다.
- migration은 detached copy와 원본 backup을 사용하고, 알 수 없는 버전/필드/비호환 값에는 복구 안내를 제공한다. 조용한 default/clamp/drop/solver alias는 허용하지 않는다.
- canonical restart와 solver buffer/지연 history/난수 stream의 완전한 continuation을 구분한다.
- 승인 review gates는 [7,9,17,24]만 유지한다. S28 사용자 승인과 교육 콘텐츠 사람 검토를 만들어내지 않는다.

## 내부 checkpoint

1. **CP0 준비**: 선행 S27 history/artifact, baseline inventory와 migration/UI gaps 조사. progress/status(active28, next28) 기록. plan/schema/typecheck 검증 후 commit/push.
2. **CP1 migration**: versioned legacy adapter, backup/preview/확정/오류 복구, 정상/경계/악성/round-trip fixture 및 브라우저 경로. targeted unit/typecheck/build 검증 후 commit/push.
3. **CP2 parity**: S01 inventory에 결속한 matrix와 validator, 결과/경로/export 근거 및 negative 검사. legacy/new E2E와 원본 보존 검사. 실패/미지원 항목을 정확히 기록한다.
4. **CP3 evidence**: 필수 migration/parity 전체 검사, 기존/새 E2E 병렬 검증, rollback 절차/rehearsal과 Landing URL 계약, 86단원 검토 상태, 사용자 cutover checklist. 구현 push 원격 hash 검증.
5. **최종 status**: 모든 gate 통과 시에만 별도 완료 commit/push. parity 미충족이면 next28 유지하며 S29 금지를 명시한다.

예정 경로: `src/product/persistence/`, product app/compatibility integration, `tests/product/`, `tests/fixtures/`, `e2e/redesign/`, `scripts/redesign/`, `documents/redesign/parity/`, 본 progress와 status. 구현 조사 결과에 맞추어 구체 경로와 checkpoint 크기를 갱신한다.

## 검증 및 증거

- 선행 완료: status 1..27 연속, next28; fetched remote S27 status `b78cdae`, 구현 `3d34cde`, evidence `2f4c806`이 history에 존재한다. 필수 artifact/실행 증거는 CP0 조사에서 추가 검증한다.
- CP0 선행 증거: S27 필수 progress/verification/preservation 파일 존재, 구현 `3d34cde`와 evidence `2f4c806`이 HEAD의 ancestor임을 Git으로 검증했다. 전체 연속 단계 기록도 확인했다.
- CP0 검증: `redesign:check`, `typecheck`, `git diff --check` 통과.
- 발견된 cutover 차단 위험: 새 planar/chain은 Euler/RK2/RK4만 실행하며 catalog 등록만으로 기존 적분기 전체가 실행되지는 않는다. OGY/실시간 IMU/오디오/일부 runtime·표현 제어에도 새 UI 접근 근거가 없다. 이 항목은 S28 parity에서 미통과로 남겨야 하며 기존 app 링크를 새 UI 결과 동등성으로 세지 않는다. 현재 기능 잠금 없이 기존 앱을 계속 이용할 수 있지만 이는 새 제품 parity 인증과 별개다.
- CP0 완료 후보. migration/parity/cutover 완료 아님. `lastCompletedStage=27`, `nextStage=28` 유지.
- Commit/push: 아래 checkpoint의 실제 원격 결과를 다음 기록에 추가한다.

## CP0 게시 / CP1 구현

- CP0 `d320d72051c6afaed14a332a4bff6e3ba069c9ad` 일반 push exit0, live `ls-remote` exact match, 게시 직후 clean tree 확인.
- S27 필수 산출물 누락은 없다. 현재 loader의 86/86 단원이 ready/automated/source-checked이며 human-reviewed는 0/86이다. 이번 metadata 조회가 모든 외부 참고문헌을 새로 접속했다는 뜻은 아니다.
- CP1 범위: `legacy-migration.ts`, `legacy-migration-session.ts`의 versioned preview/confirm/backup과 Lab 라이브러리의 opt-in 가져오기 패널. 사용자가 파일/텍스트를 제공하기 전에는 저장소를 열거나 열거하지 않는다. 기존 localStorage/IndexedDB 쓰기·삭제·덮어쓰기 없음.
- 변환 후보는 strict 완전한 v10/v11 double/compound/triple session, Euler/RK2/RK4, 현재 adapter의 실행 한도 안이다. 실제 writer의 run v2는 일치하는 runtimeSnapshot이 있을 때 최종 상태에서 새 run을 시작한다. 원본의 mode/stepsPerFrame/hash/fixed-step tolerance/비활성 m3/l3 및 기존 결과는 backup-only임을 알린다. 관찰 시간은 별도로 명시한다.
- share v1–v4/query/expansion/workspace/research DB/기타 파일은 전체 의미의 canonical 표현이 아직 불가능하여 recovery-required다. 손실 변환·자동 기본값·solver 별칭을 성공 처리하지 않는다. 전체 URL이나 파일의 원문 backup과 기존 앱 경로를 제공한다. 이 부분은 migration 전체 완료가 아니다.
- UTF-8 파일 읽기는 fatal decode 및 BOM 보존을 사용한다. 원문을 textarea와 분리해 CRLF/BOM backup을 보존한다. 다른 문자 인코딩/크기 초과는 읽지 않고 기존 파일의 복구를 안내한다. 원본 파일을 수정하지 않는다.
- API targeted 95/95 통과: 세 시스템×세 native stepper의 정확한 다음 상태 비교, winding/time/seed, 실제 run writer, 악성/중복 key/누락/버전/리소스 제한/preview 위조/원문 백업을 포함한다. Root 통합 검증·browser 실행은 이어서 기록한다.
- 공개 share writer 문서의 오래된 v3 설명을 실제 v4로 바로잡았다. authoritative roadmap/execution-plan은 변경하지 않았으며 Desktop 전달본 동기화 대상 변경은 없다.

### CP1 통합 검증

- migration/기존 계약/golden targeted 24파일 505/505, 실패·pending 0으로 통과했다. API 95개는 이 505개에 포함된다. 기존 session/import/share/workspace/DB/deep-link와 numerical golden 13개를 포함한다.
- 공식 plan/catalog/learn/inventory 검사 모두 통과했다. 기존 S01 inventory 883files/118capabilities/6825facts, broken imports0/orphans0이다. 카탈로그 등록과 실행 인증을 구분한다. Production build와 public artifact audit(22text/1binary skip), lint/typecheck/targeted format 검사 통과.
- 최종 기존 production browser 16/16, 새 production browser 20/20 통과했다. 각각 Chromium/Pixel5 emulation 8+8, 10+10이며 fail/skip/flaky/runner error0이다. 새 테스트에는 정확한 UTF-8 BOM/CRLF backup, canonical 확정/저장/왕복, native 한 step, 기존 앱 복구, 원본 localStorage 보존, 악성/미지원 입력·키보드 취소, 기존 ZIP byte 보존과 offline reviewer가 포함된다. 새로운 가져오기 화면의 axe 위반0, viewport overflow0, desktop/mobile capture를 확인했다.
- 병렬 원본 설정 실행은 두 30초/context 종료 timeout으로 중단되었다. 출력 폴더 분리와 진단 video off로 재실행했으나 기존 share timeout이 남아, 리소스 경합이 없는 단독 실행에서 기존 suite16과 새 suite20을 각각 완주했다. 원본 assertion·30초기본/5초expect·기존60/90/120초 개별 제한·retry0·snapshot none·trace/실패 screenshot은 유지했다. 시간 제한을 늘리지 않았다. 초기 시도와 실패 JSON/log는 tmp에 남긴다. 전체 브라우저/모든 엔진 parity를 인증한 것은 아니다.
- S04 production 검사에서 순수 교육 선언 chunk 두 개(`research-focus-definitions`, `chaos-focus-definitions`)를 기존 엔진으로 오인한 assertion을 수정했다. 기존 광범위 app/physics/chaos/research/worker 금지를 그대로 두고 정확한 두 data chunk만 제외했다. 실제 app-tabs/research-ui/engine/worker 및 source-directory/global 검사는 유지한다. 독립 코드 검토와 최종 양 프로젝트 검사로 확인했다.
- 새 Lab 라이브러리를 열기만 하면 엔진이 로드되지 않도록 migration API를 미리보기 버튼에서만 lazy import한다. 지연 import/file read는 입력 수정·취소·dispose 후 적용되지 않는다.
- S27 기준 보존 감사: 2175개 기존 파일 중 2171동일, 의도한4개(status, share 문서, Lab 연결, 위 false-positive 검사)만 다르다. 보호대상1053/1053동일, 예상 밖 변경0, Desktop 두 전달본 raw SHA256일치. 상세는 S28-preservation.json.
- CP1은 검증된 제한적 migration checkpoint이며 전체 migration/parity 완료가 아니다. CP2의 자동 심사에서 확인된35개 차이와99개 미인증 행이 남으며 S29는 금지한다. 전체 Vitest와 CP2 인증 gate 결과는 다음 기록에 남긴다.
- 최종 전체 Vitest는372파일6346/6346, 실패·pending0으로 통과했다. `--maxWorkers=2`로 실행 경합을 줄였으며 원래 testTimeout30초를 유지했다. 신규95migration/12parity 및 기존 golden13개가 모두 포함된다. 앞서 경합 중 parity beforeAll이30초를 초과해12pending이 된 시도는 이 최종 통과로 재검증했으며 실패 이력을 지우지 않는다.
- 이후 최종 ESLint가 새 lazy preview 클릭 콜백의 `no-misused-promises` 1건을 발견했다. 동일한 async body를 동기 void callback에서 호출하도록만 수정했다. 물리/migration API/기존 계약 테스트는 바뀌지 않았다. 수정 뒤 typecheck/전체 lint/대상 format/production build 모두 exit0, 최종 영향 browser6/6 및 parity12/12를 재검증했다. 전체6346과 기존16/새20 증거는 이 callback-only 수정 직전 소스에 결속되며, 후속6개 여정과 품질 검사는 최종 소스에 결속된다. 이 소스 차이를 S28-verification.json에도 구분한다.
- 최종 source fingerprint는 `78dd9f786bec7274fa503b5c73e23661aae7325f9fcfd118934902f7ca801de4`다. known-pattern secret scan은 CP1 명시적 stage 뒤1890text/0finding으로 통과했다. history/ignored/binary/임의 password 및 외부 서비스는 범위 밖이다.
- CP1 구현·targeted gate는 통과했으며 일반 push를 준비한다. 단계 완료 또는 S28 사용자 승인 상태는 아니다.

## CP1 게시 / CP2 동등성 심사 — S28 미완료

- CP1 `06757a5f4e2ce7916f59d3cf52924ca7a001bd7e` commit 및 일반 push exit0, live ls-remote exact match 확인. CP0부터 CP1까지 구현 checkpoint push는 모두 성공했다.
- 자동 ledger는 동결 S01 SHA256, 기존 source projection/AST와 새 product source fingerprint에 결속된다. 파일883/883, 의미 기능118/118, 관찰6825/6825를 모두 보존한다. 실제 심사134행 중 **35gap/99unverified/0certified**다. 인증0은 S28 실행 증거가 닫히지 않았다는 뜻이며 실제 제품의 모든 기능이 고장났다는 뜻이 아니다.
- 주요 차이: 자유 Lab의13개 기존 적분기, 일부 확률 적분기, 소리화/OGY/실시간 camera·IMU/명령 팔레트/언어/정밀 표현/기록·재생/GPU·Wasm/공개 browser namespace, 기존 share·query·tab·workspace·DB 및 제한적 session/run migration. 각 항목의 근거와 소유 경로는 matrix.gaps에 있다. 남은99행에는 실제 조작·결과 비교·round trip·test result·export attestation을 연결해야 한다. 현재 감사 도구는 정적 등록이나 임의 pass를 인증으로 받아들이지 않는다.
- `--check`는 manifest 동일성 검사이며 통과했다. `--check --certify`는35known gaps/99missing runtime evidence로 exit1이다. 이는 남은 **단계 완료 gate 실패**이고, audit targeted12/12 통과와 구분한다. 필수 기능 차이를 숨기거나 원래 app 링크로 대체해100%를 만들지 않는다.
- `blockedStage=28`, `activeStage=28`, `activeStageCheckpoint=CP2-parity-blocked`, 완료1..27/next28을 유지한다. S28 완료 status commit은 만들지 않는다. 사용자 승인28도 기록하지 않는다. S29 기본 앱 전환/old audience 제거/master merge/tag/release/Landing 변경을 시작하지 않는다.
- S28 R 범위 중 migration/기존·새 저장 여정과 동등성 감사를 실행했다. 전체 릴리스 R(전체 모든 E2E 프로젝트, standalone/PWA/성능/새 dependency audit)은 완료하지 않았으며 그 인증을 주장하지 않는다. Chromium/Pixel5 emulation 외 browser·실기기·screen-reader 음성 검토도 남는다.
- default-branch GitHub push notice26건(high15/moderate8/low3)은 기존 상태다. package/lockfile 변경·새 dependency audit·취약성 해결/사용자 위험 수락은 없다. S30 security disposition과 S24 offset-Buffer helper/attachment authenticity 및 기존 유한시간 과학적 제한은 유지한다. 새로운 strict import/preview 보안 검사는 통과했다.

## 사용자 확인과 복구

미리보기: production 또는 dev의 `/next.html#/lab`에서 아래쪽 **기존 데이터 가져오기**를 연다. 기본 `/app.html`은 계속 기존 앱이다.

- [ ] 지원 session을 미리보기해 값·단위·적분기·시각·seed와 backup-only 설정을 확인하고 원문 백업을 내려받는다.
- [ ] 미지원/손상 링크·파일에서 적용이 막히고 원문을 내려받을 수 있는지 확인한다. 기존 앱에서 원본을 다시 연다.
- [ ] [동등성 심사](../parity/README.md)의35개 차이와99개 미인증 항목이 남아 있음을 확인한다. 현재는 전환 승인 대상이 아니다.
- [ ] [복구·URL 계약](../parity/S28-compatibility-and-rollback.md), 기존 `app.html`, S27 기준 `b78cdae`와 별도 백업을 확인한다. 사용자 폴더를 reset/clean하지 않는다.
- [ ] 교육86개 단원은 automated/source-checked이나 사람·물리 전문가 검토는0/86이라는 제품 표시를 확인한다. AI/자동 검사 결과를 human-reviewed로 바꾸지 않는다.

다음 유효 단계는 **S28 재개/보완**이다. parity100%와 migration 전체 gate를 닫기 전에는 S29 요청도 실행할 수 없다. 본 보고 뒤 다음 번호를 입력하는 것만으로 실패 gate가 통과된 것으로 기록하지 않는다.

- 최종 evidence stage 뒤 known-pattern secret scan은1897text/0finding이다. 감사/검증/보존 JSON과 모든 신규 source를 포함한다. 모든 필수 targeted 검사는 통과했고, 남은 실패는 실제 parity completion gate다. CP2는 이 차단 결과를 게시하는 감사 checkpoint이며 완료 status commit이 아니다.

## 2026-11-06 재개 — 차이 구현과 실행 인증

- 사용자 요청 `그러면 계속해`에 따라 S28을 재개한다. 기준 로컬/원격은 `696dd23df56ecc2e2816fa2b7b48032b89a6305e`, clean 및 ahead/behind0/0을 확인했다. Fetch, plan check, preflight28 모두 통과했다. 직전 checkpoint push 복구는 필요 없다.
- 정적 감사는 출발점이다. 실제 기능 차이를 구현하고 각134행에 새 UI 조작·native 결과 비교·저장/공유 왕복·실제 runner 결과·export 증거를 연결한다. 카탈로그 이름, legacy 앱 링크, 임의 pass 또는 테스트 파일 존재만으로 인증하지 않는다.
- **CP3**: 기존16종 ODE 적분기를 planar/chain의 실행·설정·저장에 연결한다. 기존 native step/adaptive/rejection/constraint 정책을 재사용하고 tolerance를 버전/단위와 함께 보존한다. 동일 상태·설정에서 native 비교, 실패 원자성, worker 취소, round-trip을 검증한다.
- **CP4**: legacy share v1–v4, Landing query/tab, expansion과 session/run의 versioned migration을 실제 새 UI에 연결한다. 원문 백업과 explicit preview/confirm은 유지하며, 실행·ensemble·workflow·표시 정보의 전달 여부를 개별 검증한다. 표현하지 못한 의미를 조용히 버리지 않는다.
- **CP5**: 소리화/OGY/명령·정밀 입력/기록·재생/언어 등 기존 control의 새 제품 접근을 공용 native 도구로 연결한다. 권한·오류·취소·해제·export 경로를 포함한다.
- **CP6**: 관측 capture, 확률 steppers, GPU/Wasm, browser API, workspace/연구 DB의 남은 연결과 복구를 bounded checkpoint로 구현한다. 실제 가능한 기능과 환경 한계를 구분하고 실패 경로를 검증한다.
- **CP7**:134개 실행 행에 실제 source-bound Vitest/production browser 결과와 artifact 증거를 결속하고 negative/mutation 검사를 수행한다. 부족한 행은 fail로 유지하며 계속 구현·검증한다. 모든 구현 checkpoint를 push한 뒤 전체 필수 gate를 통과해야만 별도 완료 status를 만든다.
- CP3~CP7은 내부 작업 묶음이며 사용자가 하위 번호를 다시 요청할 필요가 없다. 필요하면 review 가능한 더 작은 구현 commit으로 나눈다. 이후 단계/S29 cutover, 엔진 재작성, 기존 데이터 덮어쓰기, master merge/release/Landing 변경은 수행하지 않는다.
- 현재 source/목록 변경 전 세부 계약 조사 중이다. 모델 selector는 여전히 노출되지 않았으며 확인/변경했다고 주장하지 않는다. 교육 사람 검토0/86 및 승인 gates[7,9,17,24]를 유지한다.

### 재개 준비 게시 / CP3 native 적분기

- 재개 준비 `122cd7249464146b61d0d38f0ed9a1a577700c3c` commit/push exit0 및 live remote exact match 확인. plan/typecheck 통과, next28 유지.
- CP3는 기존16종 method ID와 verlet alias를 planar/chain 실행·Inspector·canonical/storage에 연결했다. optional tolerance는 integrator.settings의 unit1 scalar로 저장하며 기존 settings{}의 생략 의미와 방법별 기본값을 유지한다. 기존 운동방정식·native step dispatcher·public API는 수정하지 않았다.
- 기존 native LabSimulation의 수락/거부 및 최대 두 half-step 재시도 정책을 adapter에서 보존한다. 실패 시 상태/시간을 commit하지 않는다. 입력/출력 buffer의 동일·부분 겹침과 차원 불일치도 native 호출 전에 거부한다. 오차 감시 고정 macro-step을 tolerance 기반 adaptive rejection으로 가장하지 않는다.
- targeted7파일453/453, 실패·pending0 통과.3시스템×16방법×두 tolerance 설정의40step native state/energy/accepted-step 진단, N4 native dispatcher, shortening/retry/rejection, storage/worker/cancel 및9개 buffer/dimension negative case를 포함한다. 초기 test typing·compound Jacobian 설명 오류는 최종 characterization으로 수정했다.
- post-guard whole typecheck, 대상12파일 ESLint/Prettier 통과. 실행 중 browser검사와 분리된 `tmp/S28-CP3-122cd72-dist` production compile 통과. 지원 CSS/reports/index를 복사한 뒤 공개 artifact privacy22text/1binary-skip 통과(복사 전 reports 경로 미존재 오류는 도구 이력으로 기록). native engine/public API/package/app.html diff0을 확인했다.
- 코드·검증 결속은 [S28-CP3-numerical.json](./S28-CP3-numerical.json)에 기록한다. 전체16방법의 실제 화면 여정은 CP3-E에서 별도로 검증한다. 현재는 source/targeted checkpoint이며 전체 S28 인증 또는 완료가 아니다. 각 feature의 최종 parity는 실제 runner evidence가 모인 뒤에만 갱신한다.

### CP3-E — 16방법 실제 화면 검증

- CP3 구현 commit `b48519a78f0a1cf7886c5efd1df53acd69256dc2` push exit0, live origin exact match 확인. 이후 동결 production build의 이중·복합·삼중 ×16방법 ×Chromium/Pixel5 총96/96 여정 통과. 실패·skip·flaky·retry·runner error0. 실제 selector, 한 단계 실행, canonical JSON 및 CSV 다운로드를 native 결과와 비교했다.
- 동일 runtime453검사는 exact equality를 유지한다. Node/Chromium의 Math 초월함수 ULP 차이는 기존 S01 수치 오차 fixture로 비교하며 golden·오차 한도·기본 timeout을 변경하지 않았다. 최대 state 절대 차8.673617379884035e-18, 에너지1.4210854715202004e-14. 최초 cross-runtime exact assertion5건 실패 및 새 test의 startup 교정 이력은 증거에 구분했다.
- `S28-CP3-E-ode.json`은12개 native 연결 source의 CP3 일치,257개 동결 build 파일 digest, runner JSON digest와 test/fixture SHA를 기록한다. 이후 control/migration 변경은 이 동결 build 결과로 인증하지 않으며 별도 재검증한다.
- CP4 링크·전체 작업공간 이전, CP5 실제 control, CP6 나머지 연결, CP7 전체134행 인증을 계속 진행한다. S28 완료·cutover 또는 사람 승인 주장이 아니다. next28 및 사람 science review0/86을 유지한다.

### CP3-S — 기존 확률 stepper와 확률 공명 연결

- CP3-E `4f23f733f34f71aaadd0d3e09d39276e5cf59353` commit/push exit0 및 live remote exact match 확인.
- Langevin 경로에서 기존 Euler–Maruyama, scalar Milstein, Stratonovich Heun, commutative matrix Milstein을 선택할 수 있다. optional row-affine diffusion offset/slope/matrix와 정확한 Jacobian을 versioned canonical settings에 보존한다. stochastic 옵션이 없는 기존 canonical/options{} 및 난수 stream·실행 결과는 그대로다.
- 독립 과감쇠 사차 이중 우물의 기존 stochasticResonanceCurve를 별도 worker 카드로 연결했다. 현재 진자의 공명인 것처럼 표시하지 않는다. seed·진행·취소·실패·native 결과 및 JSON/SVG 내보내기를 포함한다.
- 대상6파일123/123 단위 검사, 실제 Chromium/Pixel5 12/12 화면 여정, whole typecheck·대상 ESLint/Prettier·동결 production build 통과.4scheme 고잡음 실패는 마지막 완성 앙상블 상태를 보존하며 계속된 stream을 허용하지 않는다. 실패·skip·flaky·retry0.
- `S28-CP3-S-stochastic.json`은15개 source와 native 보존 SHA, 두 runner report 및273개 동결 asset manifest를 결속한다. 전체 S28 parity 또는 사용자·전문가 검토 완료를 뜻하지 않는다.

### CP4-A — 링크·세션·전체 호환 파일 계약

- CP3-S `2e35d3a010cfb46cf8e71f235eb4929b3ddab886` push exit0 및 live remote exact match 확인.
- 세션의16개 방법·tolerance를 보존하고 share v1–v4·명시적 base query·7개 native expansion 형식을 엄격한 versioned envelope로 변환한다. decoder의 보정이 필요한 입력을 조용히 수락하지 않는다. 전체 원문·매핑·기본값·inactive/provenance·workflow·표시·ensemble 요구를 따로 보존한다.
- 원문에서 전체 호환 파일을 다시 변환하여 매핑까지 비교하며, 프로그램으로 만든 위조 객체나 clone만으로 확정할 수 없다. 전용 product 저장 키만 명시적 확인 뒤 쓰며 기존 키 충돌·quota·손상은 원본을 덮어쓰지 않고 실패한다. 별도 UI consumer가 필요한 링크는 needs-transfer로 유지한다.
- 대상216/216 단위 검사와 대상 ESLint 통과. 병렬 개발 중 신규 연구 API test의 readonly typing 오류와 분리하여 실제 의존성을 포함한 scoped tsc도 exit0으로 통과했다. 최신 whole tsc는 그 test 오류 때문에 아직 통과했다고 보고하지 않는다.
- 이 commit은 persistence 계약 checkpoint다. 전체 UI 연결은 다음 checkpoint이며, 이전 production50검사의44통과/6실패를 현재 전체 소스 인증으로 사용하지 않는다. 실패는 새 버튼 문구4건과 새 검색 test의 모호한 선택자2건이며 수정·별도 재검증을 진행 중이다.
- `S28-CP4-A-links.json`은216개 runner 결과와 소유 source의 사후 SHA를 기록한다. 최종134행 인증은 새로운 실행 전후 source capture로 별도 수행한다. 사용자/전문가 review나 완료·cutover를 주장하지 않는다.


### CP5-P — 정밀 입력과 표시 단위

- CP4-A `be5c19a0d1a0f0b89d77d99c3a5ecb08b4fb1b11` 일반 push exit0, live remote exact match 확인.
- 2026-11-09 계속 요청의 fetch 후 branch/HEAD/origin 일치와 plan 검사를 재확인했다. preflight28은 진행 중인 허가된 S28 파일 때문에 clean-tree 검사만 실패했다. 사용자 자료를 지우거나 덮어쓰지 않았으며 이 checkpoint 이후 clean preflight를 다시 실행한다.
- 제품 quantity editor에 native와 같은 π·Unicode·decimal comma·과학 표기 및 명시 rad/deg 입력을 연결했다. 단위 선택은 cached canonical SI를 변환 표시하며 물리 입력을 다시 쓰지 않는다. 기존 strict decimal API와 native precision/physics는 보존한다.
- 대상2파일66/66 단위 검사, scoped typecheck·대상 ESLint·Prettier exit0. 소유3파일의 사후 SHA와 runner digest는 `S28-CP5-P-precision.json`에 기록했다. DOM 왕복·전체 통합 및134행 source-captured 인증은 뒤의 gate이며 이 단위 검사로 대체하지 않는다.
- S28은 계속 active/next28이다. 후속 단계·완료 status·사용자/전문가 review는 기록하지 않았다.


### CP4-Q — 정확한 원본 조건 목록·재개 기반

- CP5-P `ed058ea901954b42bbe9f64bc1f84554d5b54b46` push exit0/live remote exact match 확인.
- 기존 BatchExecutor를 사용해 원본 ID·입력·seed·순서를 보존하는 독립 조건 큐를 추가했다. byte-aware part를 모두 유지하고, 중단 run만 원래 입력에서 재개한다. 서로 다른 모델의 metric을 임의 평균하지 않으며16MiB 초과 결과는 명시 실패한다.
- 소유4파일 pre/post SHA 일치와 대상21/21 runner exit0, 대상 ESLint exit0. staged index만 새 임시 폴더에 복사해 후속 미커밋 통합을 제외한 whole typecheck도 exit0으로 검증했다. `S28-CP4-Q-queue.json`에 증거를 기록한다.
- 사용자 저장소·기존 executor/physics를 변경하지 않는다. 화면 연결과 전체134행 인증은 다음 검증이며 S28 완료·cutover·review28 승인으로 세지 않는다.


### CP4-W-workspace — 검증된 기반 모듈

- 원본 workspace·Research DB의 typed 전체 기록·원문 bytes/SHA·artifact를 별도 product 저장 공간에 명시 채택하며, 실행 가능한 canonical run과 원래 입력이 없는 partial 기록을 구분한다.
- 소유 파일 pre/post SHA 일치와 실제 runner 22/22 exit0, 대상 ESLint exit0. 후속 미커밋 통합을 제외한 staged-index whole typecheck도 exit0이다. S28-CP4-W-workspace.json에 정확한 경로·시간·hash를 기록했다.
- 중앙 화면 연결과 실제 브라우저 증거는 이 기반 commit의 인증이 아니며 별도 통합 checkpoint/최종 capture에서 검증한다. S28 완료·134행 parity·cutover·사용자/전문가 검토 주장이 아니다.


### CP4-E-expansion — 검증된 기반 모듈

- 7개 기존 확장 모델과16개 native 방법을 전용 worker suite에 연결하고 전체 입력·결과·IEEE 비유한 tag·진행/취소/재개·원본 archive를 보존한다.
- 소유 파일 pre/post SHA 일치와 실제 runner 27/27 exit0, 대상 ESLint exit0. 후속 미커밋 통합을 제외한 staged-index whole typecheck도 exit0이다. S28-CP4-E-expansion.json에 정확한 경로·시간·hash를 기록했다.
- 중앙 화면 연결과 실제 브라우저 증거는 이 기반 commit의 인증이 아니며 별도 통합 checkpoint/최종 capture에서 검증한다. S28 완료·134행 parity·cutover·사용자/전문가 검토 주장이 아니다.


### CP3-D-native-design — 검증된 기반 모듈

- 기존 Sobol/LHS/grid와 adaptive·boundary·uncertainty refinement를 실제 native studyPoint worker에 연결하고 입력·seed·정확한 원본 반환값·재개를 보존한다.
- 소유 파일 pre/post SHA 일치와 실제 runner 28/28 exit0, 대상 ESLint exit0. 후속 미커밋 통합을 제외한 staged-index whole typecheck도 exit0이다. S28-CP3-D-native-design.json에 정확한 경로·시간·hash를 기록했다.
- 중앙 화면 연결과 실제 브라우저 증거는 이 기반 commit의 인증이 아니며 별도 통합 checkpoint/최종 capture에서 검증한다. S28 완료·134행 parity·cutover·사용자/전문가 검토 주장이 아니다.


### CP4-S — 전체 공개 설정·route 기반

- 앞선 기반 CP4-Q `2b0311e76b4234463287fd065c62bc0003e90b36`, CP4-W `6f42052f5a6927e9bdfdb70437852aec50338522`, CP4-E `7a5c55fdf5d145f1e0e963e2d23667668f92b582`, CP3-D `02145d96755094de992cc939dc7186e059108db8`는 각각 일반 push exit0/live remote exact match를 확인했다.
- 기존 pe1 공유를 유지하고, 현재 SI 조건과 재생·표시·섭동·관찰 단계의 closed DTO를 별도 ps1 버전으로 추가했다. URL·파일 한도, CRC, privacy, native 범위 재검증을 분리하며 원문 URL·메모·오디오 동의를 넣지 않는다. 진짜 세션 미리보기의 명시 채택에서 원본 mode/SPF만 검증해 적용한다.
- 소유10파일을 포함한 대상265/265 cohort와 대상 lint, 후속 미커밋 UI를 제외한 staged-index whole typecheck exit0. 공유 타입 이동 전후 기존 두 runtime 파일의 emitted JS는 동일하다.
- `S28-CP4-S-product-setup.json`은 별도의 전체 작업폴더 UI26 통과와 실제22다운로드도 기록하지만 이 기반 commit의 중앙 UI 연결 인증으로 세지 않는다. 이후 중앙 연결과 최종 source capture가 필요하다. 초기 지연 로딩2실패와 접근성/재시도4실패는 실제 source 수정 뒤 원래 assertion·timeout을 유지한 재실행으로 해결한 이력을 보존했다.
- S28 완료·134행 인증·사용자/전문가 승인·기본 앱 전환을 주장하지 않는다.


### CP6-T — 실제 시간·계산 예산·표시 기반

- CP4-S `aff0e7ad454463c38a474e841015a0c5fd3dd71a` push exit0. 이후 DNS 검증 실패가 있었으나 시스템 복귀 후20초 제한의 별도 read-only 원격 조회 exit0/live exact match로 복구했다.
- 기존 SimulationClock에 버전 있는 checkpoint/restore/accountFrame 경계만 추가했다. 기존 native Git blob을 독립 VM에서 실행한19개 차등 검사가 기존 advance/reset/진단의 상태·에너지·좌표·부채·예외를 정확히 비교한다. 운동방정식·stepper는 수정하지 않는다.
- 실제 완료 worker 단계와 계산 시간을 사용하고 요청/실효 예산을 구분한다. 실제 바로 전 표본으로 보간하며 표시 RAF·관찰자·DPR·body class를 닫기/해제에서 정리한다. 내부 chain snapshot은 명시적v2다.
- 관찰된291/291 runner 중 backend10파일275/275를 별도 식별했다(테마16은 제외). 소유13파일 snapshot, staged-index whole typecheck·대상 lint exit0.12파일은 이전T/C 동결 hash와 같고 playback-clock.test.ts는 사후 snapshot임을 구분한다. 중앙 UI 및 최종134행 인증으로 세지 않는다.
- S28 active/next28과 사용자 review28 미승인 상태를 유지한다.


### CP3-T-structure-foundation

- Conservative native energy-drift and canonical diagnostics with explicit accepted-step, system and damping guards.
- 소유6파일과 대상96/96 실제 exit0, 대상 lint0, 후속 미커밋 통합을 제외한 staged-index whole typecheck0. 현재 source SHA와 runner digest를 별도 기반 보고서에 기록했다.
- 기존 native 구현은 수정하지 않는다. 중앙 화면/E2E 게시와 전체 릴리스·134행 source-captured 인증은 별도 gate다. S28 완료·사용자/전문가 review·cutover를 주장하지 않는다.


### CP6-R-backend-foundation

- Opt-in native GPU/CPU ensemble and Wasm/SIMD/CPU tape comparison. Actual backend and fallback are reported; no hardware promotion or speedup claim.
- 소유6파일과 대상51/51 실제 exit0, 대상 lint0, 후속 미커밋 통합을 제외한 staged-index whole typecheck0. 현재 source SHA와 runner digest를 별도 기반 보고서에 기록했다.
- 기존 native 구현은 수정하지 않는다. 중앙 화면/E2E 게시와 전체 릴리스·134행 source-captured 인증은 별도 gate다. S28 완료·사용자/전문가 review·cutover를 주장하지 않는다.
