# S28 — 저장·공유 migration과 기능 동등성 심사

- 상태: in-progress / CP0
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
