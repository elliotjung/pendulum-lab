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
