# S09 — 과정 1과 Focus Experiment 왕복

## 기준과 범위

- 시작/원격 HEAD: `d21bc5b0a3a6a9f47f720e125b5e0f6484b3e862` (`codex/redesign`). 깨끗한 작업 폴더, fetch 후 일치 확인.
- S08 status commit과 CP0–CP3 history 및 Learn schema/loader/views/progress/test 산출물 확인. S07 adapter와 수치 검증 산출물 존재.
- `redesign:check` 통과. `redesign:preflight -- 9`는 sandbox의 Git subprocess EPERM 뒤 허용된 실행에서 통과.
- 목표: 1.1–1.8 완성, 선언형 전용 실험, S07 공용 엔진 재사용, canonical 설정과 출처 단원의 Lab 전달/복귀 보존.
- 범위 밖: S10 이후 시스템/과정, app.html 전환, master merge/release, 기존 데이터 migration.
- 모델 선택 UI는 런타임에서 확인하지 못했으며 사용자의 지정 프로필을 전제로 진행한다.

## 보존 경계

기존 app.html, physics/chaos/research/runtime/workers/validation, 공개 API, 기존 저장/공유 계약과 사용자 데이터, S01 golden 및 인벤토리를 보존한다. 교육용 운동방정식을 중복 구현하지 않는다. 진도는 기능 권한과 분리한다. 과학 자동/출처/사람 검토를 구분하고 사람 검토를 주장하지 않는다.

## Checkpoint

| ID | 작업 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록과 activeStage | plan check, preflight | 원격 확인 완료 |
| CP1 | 8단원 계약/콘텐츠 + Focus 수치 모델/fixture | Learn schema, 관련 Vitest, typecheck, 출처 대조 | 검증 통과, commit/push 준비 |
| CP2 | 접근 가능한 Focus UI와 Lab 왕복, 브라우저 여정 | 관련 unit/E2E, keyboard/mobile/axe/시각, build | 대기 |
| CP3 | 통합 검증·보존·검토 보고 | 전체 Vitest, required E+U, inventory/golden/secret, diff | 대기 |
| STATUS | 검증 후 완료 필드와 원격 확정 | 별도 status push/remote hash | 대기 |

예정 경로: content/learn/course-1, curriculum/modules; src/product/learn; src/product/experiments; 최소 product physics 진단 adapter; Lab 출처 연결; css/product; tests/product; e2e/redesign; documents/redesign/stage-runs 및 S09 검토 보고.

## 검증·위험·원격 증거

- 아직 S09 구현/검증/사용자 검토 완료를 주장하지 않는다.
- 기존 보안 보고(S01 npm/CodeQL, S08 별도 Dependabot 집계)는 미해결 기준선이며 이번 단계는 의존성 변경을 포함하지 않는다.
- CP0 `2c933808c4d2fa823b4bfdee3800e6adb7805076` push 성공. `git ls-remote origin refs/heads/codex/redesign`가 같은 hash를 반환했다.
- 재개(2026-09-14): fetch 후 CP0 로컬/원격 일치. 모든 미커밋 파일은 이 S09 구현으로 확인했다.
- 일부 초기 테스트/빌드 실행이 sandbox EPERM 또는 자동 승인 검토 사용량 한도로 차단되었다. 이후 동일 승인 경로의 콘텐츠 테스트 성공을 확인하고 재시도했으며, 아래 검증은 실제 실행 성공 결과다. 차단을 우회하지 않았다.
- CP1: 1.1–1.8 콘텐츠 및 schema, S07 simulation 재사용, 20초/20,000단계/801표본 제한, atomic setFields, 결정론·취소·오류·원본 보존 구현. source-checked 8/8, human-reviewed 0/8. 출처·좌표·영점 대조는 `S09-source-review.md` 참조.
- `npm test -- tests/product/learn tests/product/experiments tests/product/adapters tests/characterization/numerical-golden.test.ts --reporter=json --outputFile=tmp/S09-CP1-vitest.json` 통과. 콘텐츠 품질 26, 기존 콘텐츠/loader 89, progress 82, Focus runtime 29, 과학 12 및 기존 adapter/worker/golden/transfer 검증 포함. 자세한 수치는 최종 verification에 기록한다.
- CP1 전체 typecheck, plan check, production build 및 public artifact audit 통과. CP2 UI/시각/browser 여정과 전체 회귀는 아직 진행 중이다.
