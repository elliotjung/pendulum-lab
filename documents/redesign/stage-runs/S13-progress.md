# S13 — 구동·결합·역진자·cart-pole·매개변수 계

## 시작 상태

- 기준 로컬/원격 HEAD: `cf97e8a615a6dde4afa99b64946fc15a6655f28f` (`codex/redesign`).
- 작업 폴더 깨끗함, origin fetch 성공, `redesign:check`와 `redesign:preflight -- 13` 통과.
- 선행 S01–S12 완료 목록과 S12 원격 완료 기록 및 공간 계 adapter/UI/test 산출물을 확인했다.
- 요청 범위는 실행 계획 S13 하나다. S14 이후 모델·일반 sweep queue(S21)·교육 콘텐츠·앱 전환은 범위 밖이다.
- 실행 UI의 모델 선택값은 이 런타임에서 읽을 수 없어 검증하거나 변경했다고 주장하지 않는다.

## 목표와 보존

- driven/coupled/inverted/cartpole/parametric의 기존 plant를 제품 adapter로 연결한다.
- 구동 파형·진폭·주파수·위상, 호환 제어기의 활성화·gain·포화, reference/state error와 제한된 공명 탐색 진입을 제공한다.
- plant와 controller 설정을 분리하고 잘못된 gain·비유한 상태·제어 실패를 안전하게 중지한다.
- canonical 설정 저장/공유/복원과 CSV/SVG 출력에 구동·제어 의미를 보존한다.
- `app.html`, physics/chaos/research/runtime/workers/validation, 공개 API, 기존 저장·공유 계약, 사용자 데이터, lockfile, golden 및 기존 시각 기준을 보존한다.

## 내부 checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록과 activeStage | plan/preflight, diff | 준비 |
| CP1 | adapter/schema/worker, 원 엔진 연결·구동·제어 | passive/zero-force, 원 엔진 비교, closed-loop, saturation/invalid, worker cancel/error, typecheck | 대기 |
| CP2 | Lab UI/저장/공유/내보내기, 카탈로그·라우트 | model/storage, desktop/mobile/keyboard/axe/320px/zoom, 시각 검증, build | 대기 |
| CP3 | 과학적 한계·검증·보존 문서와 완료 후보 | 전체 Vitest, typecheck/lint/build, catalog/Learn/inventory/plan, 최종 browser | 대기 |
| STATUS | 완료 상태의 별도 commit/push | 구현 원격 존재, status 원격 hash 확인 | 대기 |

## 변경 예정 경로

- `src/product/adapters/physics/driven*`, `src/product/lab/views/driven-*`, `src/product/app/views/driven-lab.ts`
- `src/product/catalog/`, 제품 route/library 연결과 필요한 `css/product/` 스타일
- `tests/product/adapters/physics/driven*`, `tests/product/lab/driven*`, 관련 catalog/app 테스트
- `e2e/redesign/driven-pendulum.spec.ts`와 새 시각 기준
- `documents/redesign/driven-control-lab-ko.md`, 본 진행 기록·검증 JSON·`status.json`

## 검증과 원격 증거

- 시작 plan check: 30 stages / 86 unique units / next S13.
- 시작 preflight: S13 at `cf97e8a615a6`, origin과 정확히 일치.
- CP0: 아직 commit/push 전. 완료 목록은 S12, nextStage=13을 유지한다.

## 검토·위험

- 승인된 사용자 검토 게이트는 [7,9]이며 S13에는 별도 사용자 승인 게이트가 없다.
- 기존 보안 및 사람 과학 검토 미완료 상태는 해결됐다고 주장하지 않는다.
- 파형 불연속·유한 step·선형 제어기의 국소 유효 범위와 plant 각도 convention을 원 코드 및 fixture로 확인한다.
- desktop transport 사본은 종료 시 원본과 hash를 대조하고 차이를 기록한다.
