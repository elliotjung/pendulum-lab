# S12 — 구면·구면 사슬·embedded 계

## 기준과 범위

- 기준 HEAD와 fetch 후 origin/codex/redesign: `200193df0a61d8611ebb136cee9abc7030da8e66`. 작업 폴더는 깨끗했다.
- S01–S11 완료 상태와 S11 status/implementation history, constraint adapter/worker/UI/tests 및 S11 progress·verification 산출물을 확인했다.
- `npm run redesign:check`, `npm run redesign:preflight -- 12` 통과. sandbox의 FETCH_HEAD 쓰기/Git subprocess 제한은 허용된 escalation으로 해결했다.
- 목표: spherical/spherical-chain/embedded 공용 엔진 연결, 3차원 카메라·벡터/평면, 각운동량·구속 잔차, 특이점 안내, canonical 저장·복원과 renderer 실패 시 수치 접근.
- 범위 밖: S13 이후 기능·콘텐츠, legacy migration, app.html 전환, master merge/release.
- 모델 선택 UI의 실제 값은 읽을 수 없으며 지정 프로필을 전제로 진행한다.

## 보존 경계

기존 `app.html`, physics/chaos/research/runtime/workers/validation, 공개 API, legacy preset/import/export, 사용자 데이터, S03 계약, lockfile, S01 golden을 보존한다. product adapter만 기존 계산 경계를 호출한다.

## Checkpoint

| ID | 작업 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 범위·보존·진행 기록 | plan/preflight, 선행 history·산출물 | 준비 |
| CP1 | 공간 엔진 adapter·canonical·worker | 기존 엔진 parity, 회전 대칭·잔차·결정론, 왕복, 취소/실패, typecheck | 대기 |
| CP2 | 공간 Lab·3D 조작·수치 접근·export | 단위/저장, build, desktop/mobile, keyboard/touch, WebGL fallback, axe/시각 | 대기 |
| CP3 | 독립 검토·증거 문서 | 전체 Vitest, E+U, catalog/inventory, 보존 diff | 대기 |
| STATUS | 별도 완료 commit/push | 구현 원격 존재, 최종 필수 검사, 원격 hash | 대기 |

변경 예정 경로: `src/product/adapters/physics/spatial*`, `src/product/lab/views/spatial*`, product route/catalog/library, `css/product/spatial.css`, 관련 tests/E2E, S12 진행·검증 문서와 status.

## 위험과 검토

- 중력 아래의 회전 불변성은 중력축 주위 회전을 뜻한다. 임의 축 회전을 보존 법칙으로 주장하지 않는다.
- angular/embedded 좌표, 중력축, 단위와 구속 알고리즘의 한계를 실제 엔진과 대조한다.
- worker와 결과 표본 크기를 제한하고 실패 시 마지막 유효 결과를 보존한다.
- S12는 별도 사용자 승인 게이트가 아니다. 승인 [7,9]와 과학 human-reviewed 상태는 그대로 유지한다.
- 기존 보안 기준선은 해결·위험 수용으로 표시하지 않는다.
