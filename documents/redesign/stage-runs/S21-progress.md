# S21 비교·sweep·ensemble·적분기 비교 실행 기록

## 기준·범위·보존

- 기준 local/remote HEAD: 4158b6b293883c2558519ecf9e0c7bccaf199798. clean tree, codex/redesign/upstream 일치, origin fetch와 redesign:check/preflight -- 21 통과.
- authoritative 여섯 문서를 전체 확인했다. S01–S20 연속 완료, S20 status commit과 CP0–CP3 산출물·history 확인. 승인 review gates [7,9,17] 유지. 모델 selector는 노출되지 않아 사용자 선택 기록을 전제로 진행한다.
- S21 범위: paired compare, grid/log/LHS parameter sweep, seeded ensemble, integrator comparison builder, bounded worker queue, progress/cancel/resume/failed-run retry, 개별 run·aggregate 관계와 전체 설정 export/import.
- 보존: app.html, physics/chaos/research/runtime/workers/validation, 공개 API, 기존 저장·공유·사용자 데이터·수치 golden·기존 테스트·PNG·package/lockfile. 기존 product physics adapter의 계산을 재사용한다.
- 제외: S22 이후 관측/UQ/학습/연구 프로젝트/교육 콘텐츠/migration/cutover, master merge/force push/tag/release.

## checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록·activeStage | plan/preflight/typecheck | 진행 중 |
| CP1 | deterministic builder·queue·worker·artifact | scheduling/concurrency, partial failure, cancel/resume, numerical parity, input guards, typecheck | 대기 |
| CP2 | 공용 lazy builder·queue·summary·파일 왕복 UI | component, desktop/mobile keyboard/axe/320px/visual, build | 대기 |
| CP3 | 전체 회귀·보존·검증 보고서 | 전체 Vitest, E/U, 품질·보존 검사 | 대기 |
| STATUS | 구현 원격 확인 후 완료 metadata | 별도 commit/push·정확한 remote hash | 대기 |

예정 경로: src/product/lab/experiments/, 공용 lab 통합 경계, css/product/experiments.css, tests/product/lab/experiments/, e2e/redesign/batch-experiments*, documents/redesign/.

## 검증·위험·판단

- 개별 run은 canonical 입력 snapshot과 deterministic ID/seed를 보존하며 집계는 완료 순서가 아닌 계획 순서로 생성한다.
- 허용 적분기는 기존 adapter의 실제 지원 범위를 따른다. 이산/양자 계에 연속 적분기를 적용하거나 실패 run을 성공으로 표시하지 않는다.
- 장기·대량 계산은 제한된 worker concurrency와 입력/출력 크기 한도를 두고 UI 응답·취소·재개를 검사한다.
- 원래 실험과 기존 저장 데이터는 변형하지 않는다. S24의 연구 project/run 저장 계층을 선행 구현하지 않는다.
- sandbox의 Git 쓰기와 하위 프로세스 제한은 동일 작업의 확장 권한으로 해결했다. fetch와 preflight는 실제 exit0으로 확인했다.
- 구현 checkpoint의 검증과 원격 hash 확인 전에는 다음 checkpoint로 진행하지 않는다. 완료 목록/nextStage는 최종 status gate까지 유지한다.

## commit·push 증거

checkpoint 검증 후 명시적 경로만 stage하고 origin/codex/redesign에 push하며 git ls-remote의 정확한 hash를 확인한다. 최종 완료는 별도 status commit의 원격 존재가 기준이다.
