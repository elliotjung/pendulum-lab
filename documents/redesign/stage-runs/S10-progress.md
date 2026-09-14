# S10 — 삼중진자·N중 사슬

## 기준과 범위

- 기준 HEAD / fetch 후 원격 HEAD: `4ba54ed9f52966f87f9de06e7f9a1e3bcad09ca6`, `codex/redesign`. 작업 폴더는 깨끗했다.
- S09 완료 status commit, CP0–CP3 Git history, 과정 1/Focus/Lab 및 검증·review 산출물을 확인했다. S01–S09 완료 상태와 S10 의존성을 확인했다.
- `redesign:check` 통과. fetch의 FETCH_HEAD 쓰기와 preflight의 Git subprocess는 sandbox 권한 오류 후 허용된 escalation으로 성공했다. `redesign:preflight -- 10` 통과.
- 사용자의 S10 실행 요청에 따라 S09 학습 경험 구조 승인을 기록한다. 과학 전문가 검토 완료를 의미하지 않는다.
- 목표: triple/N-chain 공용 엔진 adapter, 링크별·일괄 편집, 가변 자유도 animation/plot, worker 진행/취소/오류, 성능 안내, 저장·공유·import/export 왕복.
- 범위 밖: S11 이후 시스템/콘텐츠, 기존 앱 전환, 기존 데이터 migration, master merge/release.
- 모델 선택 UI의 실제 값은 확인할 수 없으며 지정된 실행 프로필을 전제로 진행한다.

## 보존 경계

기존 `app.html`, `src/physics`, `chaos`, `research`, `runtime`, `workers`, `validation`, 공개 API, legacy preset/import/export, 사용자 데이터, S03 canonical 계약, S07/S09 경로, S01 golden을 보존한다. 새 product adapter/worker가 기존 엔진을 호출하며 운동방정식을 복제하지 않는다.

## Checkpoint

| ID | 작업 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록·S09 구조 승인 | plan, preflight, dependency/history | 준비 |
| CP1 | triple/N-chain 계약·수치 adapter·편집·worker | N 경계, parity/golden, round trip, 취소/오류, typecheck | 대기 |
| CP2 | Lab 연결·링크 도구·가변 표시·파일·사용자 여정 | unit, production build, desktop/mobile, keyboard/axe/320px/zoom, 시각 | 대기 |
| CP3 | 통합 검증·보존·성능·결과 기록 | 전체 Vitest, 관련 E+U, catalog/inventory, diff | 대기 |
| STATUS | 별도 완료 상태 commit/push | 구현 원격 존재와 최종 검사·원격 hash | 대기 |

예정 경로: `src/product/adapters/physics/chain*`, product worker/model, `src/product/lab/views/chain*`, product app route/catalog, `css/product`, `tests/product`, `e2e/redesign`, `documents/redesign/stage-runs/S10*`와 S10 보고.

## 위험·검증·원격 증거

- 기존 보안 기준선의 미해결 npm/CodeQL/GitHub 경고는 이번 단계에서 해결 또는 위험 수용을 주장하지 않는다. 의존성 변경은 예정하지 않는다.
- N-chain 기존 dense solver의 지원 범위는 1–128이다. 큰 N의 비용·메모리를 제한하고 worker로 실행하며, resize 시 각도/각속도 배열의 대응을 따로 보존해야 한다.
- 진행 중. 구현 push 전에 완료 필드를 바꾸지 않는다.
