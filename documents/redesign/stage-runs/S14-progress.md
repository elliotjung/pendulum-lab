# S14 — Duffing·Van der Pol·Kapitza·Mathieu·마찰·Pyragas

## 시작 상태와 범위

- 기준 로컬/원격 HEAD: `f52cbe4150e702cb1a2f754aa10b9db8ee07547f`, `codex/redesign`.
- 작업 폴더 깨끗함, origin fetch와 정확한 HEAD 일치 확인.
- `redesign:check` 통과. `redesign:preflight -- 14`는 sandbox Node Git spawn EPERM 뒤 같은 읽기 전용 명령의 확장 권한 재실행으로 통과.
- S01–S13 연속 완료 목록, 각 status commit 이력, stage progress/verification, S13 adapter·UI·테스트 산출물 확인.
- S14의 여섯 모델과 전용 관찰·preset·경고·history 저장만 실행한다. S15 이후, 일반 sweep queue, 새 교육 단원, 앱 전환은 범위 밖이다.
- 런타임에서 앱 모델 선택값을 읽을 수 없으므로 검증·변경했다고 주장하지 않는다.

## 목표와 보존

- 기존 Duffing/Van der Pol/Kapitza RHS, Mathieu coefficient/Floquet, 마찰 complementarity, Pyragas DDE 경계를 재사용한다.
- 퍼텐셜/한계주기/평균화/안정성/stick-slip/지연 이력을 시스템에 맞게 표시한다.
- Mathieu의 정규화 선형 진단과 마찰 구성 도구의 기존 의미를 보존하고 Lab wrapper의 가정을 명시한다.
- Pyragas 초기 이력과 재현 가능한 지연 상태를 versioned 계약으로 저장·복원하며 유한 시간 간격과 보간 한계를 알린다.
- `app.html`, 기존 physics/chaos/research/runtime/workers/validation, 공개 API, 사용자 데이터, 기존 schema 동작, package/lockfile, golden과 기존 시각 기준을 보존한다.

## 내부 checkpoint

| ID | 범위 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록·activeStage | plan/preflight, diff | 준비 |
| CP1 | schema/adapter/worker와 수치 계약 | native parity, known limits, delay restore, 마찰 전환, stability, cancel/error, typecheck | 대기 |
| CP2 | 전용 UI·preset·저장·공유·export·route/catalog | unit/component, desktop/mobile/keyboard/axe/320px/zoom, 시각 검토, build | 대기 |
| CP3 | 과학적 한계·검증·보존 증거와 완료 후보 | 문서/JSON/plan, 전체 Vitest·관련 production browser·정적 검사 | 대기 |
| STATUS | 별도 완료 commit/push | 구현 원격 존재·최종 원격 hash | 대기 |

## 변경 예정 경로

- `src/product/adapters/physics/nonlinear*`, `src/product/lab/views/nonlinear-*`, `src/product/app/views/nonlinear-lab.ts`
- 제품 route/library/catalog 연결, 필요한 `css/product/` 스타일
- `tests/product/` 관련 adapter/worker/model/storage tests, `e2e/redesign/nonlinear*.spec.ts`와 새 시각 기준
- `documents/redesign/nonlinear-lab-ko.md`, `stage-runs/S14-*`, `status.json`

## 위험·검토·원격 증거

- 사용자 승인 게이트 [7,9] 유지. S14는 별도 승인 게이트가 아니며 사람 과학 검토를 수행했다고 표시하지 않는다.
- 정규화 단위, Duffing softening 발산, 큰 μ의 강성, Kapitza 평균화 조건, 마찰 격자 사건, 지연 보간과 자원 한계를 검증한다.
- 기존 dependency/CodeQL 미해결 항목은 해결되거나 승인됐다고 주장하지 않는다.
- 각 checkpoint 검증과 명시적 staging 뒤 push하고 정확한 원격 hash를 기록한다. nextStage는 마지막 STATUS까지 14를 유지한다.
