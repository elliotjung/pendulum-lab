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
