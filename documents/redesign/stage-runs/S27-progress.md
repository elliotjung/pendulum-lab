# S27 — 교육과정 6~8 제작

## 시작과 범위

- 기준 로컬/원격 HEAD: `9cfd9842570cdd3137e3ea866a1266de2585b941` (S26 status).
- Git 루트·worktree·upstream 확인, 무관한 변경 없음, fetch 후 HEAD 일치(0/0).
- 권위 문서 6개와 AGENTS.md 전체 확인. redesign:check 통과. sandbox Git spawn EPERM 이후 동일 preflight27을 확장 권한으로 재실행해 통과.
- S01~S26 연속 완료, 원격 S26 status 및 progress/verification/preservation 산출물과 S15~S24 공용 adapter 이력을 확인한다.
- 목표: 과정6 12개, 과정7 13개, 과정8 12개 단원과 실제 Focus/전달, 전체86단원 색인·용어·참고문헌·추천 경로.
- 범위 밖: S28 migration/parity, S29 cutover, S30 release, master 변경/merge/tag/release 및 Landing 수정.
- 모델 선택 UI는 노출되지 않아 선택값 검증이나 변경을 주장하지 않는다.

## 보존 계약

기존 physics/chaos/research/runtime/workers/validation, native product adapters, public API, app.html, package/lockfile, 수치 golden, 기존 단원과 사용자 저장/공유 데이터를 보존한다. 새 Focus는 공용 계산을 호출하는 bounded adapter이며 별도 운동방정식을 구현하지 않는다. 정확히 지원되는 canonical baseline과 분석만 전달하고 동반 실행/학습 데이터는 결과에 명시한다. 사람 검토를 만들어내지 않는다.

## 내부 checkpoint

1. CP0: 진행 기록, active27/CP0, next27/완료1..26 유지. plan check, 명시적 stage/commit/push.
2. CP1: 공통 S27 authoring/worker/계약 확장, 과정6 12단원·분기/인력권 Focus 및 수치·실패·전달 검증, typecheck/build. commit/push.
3. CP2: 과정7 13단원·네트워크/장/양자 Focus 및 seed/단위/경계·전달 검증. commit/push.
4. CP3: 과정8 12단원·연구/데이터/재현 패키지 Focus 및 비동기/오류/계보·전달 검증. commit/push.
5. CP4: 전체86 ID/route/schema/실험/transfer, 색인/용어/출처/추천 경로, 전체Vitest·golden·typecheck·lint·build·desktop/mobile·keyboard/axe/시각, 보존/문서 hash 증거. commit/push.
6. 별도 status: 구현 원격 존재와 최종 검증 성공 후 lastCompleted27/next28, active null. commit/push 후 live remote hash 확인.

## 변경 예정 경로

`content/learn/course-{6,7,8}/`, curriculum/modules/index, `src/product/experiments/`의 S27 연결과 공통 dispatch, Learn schema/validation/mount/index UI, 관련 tests/E2E/CSS, S27 증거/status.

## 진행과 위험

- CP0 진행 중. checkpoint별 필수 targeted 검증 실패 시 push하지 않는다.
- 유한 branch/grid/표본 실험은 전역 분기/엄밀한 Wada/비국소화 증명이 아니다. 단위·정규화 시간·근사·표본 한계를 단원에 기록한다.
- source-checked는 공용 소스 및 1차 자료 대조로, automated-verified는 실제 fixture로 검증한다. human-reviewed는 미완료다.
- 기존 보안·dependency 부채의 릴리스 판정은 S30 범위이며 이번 단계 완료가 위험 수락을 뜻하지 않는다.
