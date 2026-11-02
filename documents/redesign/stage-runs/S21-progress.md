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
| CP0 | 실행 기록·activeStage | plan/preflight/typecheck | ae9e2ecdd297a2df3f035d8f458bd9210721e5eb push·정확한 remote hash 확인 |
| CP1 | deterministic builder·queue·worker·artifact | scheduling/concurrency, partial failure, cancel/resume, numerical parity, input guards, typecheck | 신규300/300 + 기존golden13/13 통과; push 준비 |
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

- CP0: plan/preflight21/typecheck exit0. push exit0, local HEAD와 git ls-remote origin refs/heads/codex/redesign 모두 ae9e2ecdd297a2df3f035d8f458bd9210721e5eb로 확인했다.
- CP1 진행: 기존 adapter가 실제 허용하는 적분기를 조회한다. 예를 들어 driven/chain은 rk4/rk2/euler 경로만 비교하며 internal-only 모델에 임의 ODE 적분기를 붙이지 않는다.
- UI와 E2E는 CP1의 공개 API 계약을 먼저 합의한 뒤 병렬 작성한다. 해당 파일은 CP2까지 stage하지 않으며 CP1 검증·원격 push 전에 CP2 완료를 선언하지 않는다.

## CP1 검증 중 발견과 보완

- 35개 기존 adapter의 직접 종점·단위·실제 step 수와 210개 시스템×builder 조합을 독립 검증한다. 내부 stepper의 적분기 비교는 이유를 표시하며 실행하지 않는다.
- paired의 숨겨진 시작값이 감소 방향 비교를 막던 공통 범위 검사를 분리했다. 결정론적 canonical 모델에 존재하지 않는 seed를 추가하지 않고 표본 설계 seed를 별도 assignment에 기록한다. Langevin만 실제 지원하는 생성기·버전과 run별 seed를 canonical에 보존한다.
- 가져오기에서 빈 정적 metric, 잘못된 단위·이름·원래 analysis ID를 거부하도록 보강했다. 정적 단일 표본의 initial/final/min/max/mean/RMS 일관성과 실제 에너지 제공 여부도 검사한다.
- worker 진행은 50ms, queue 알림은 16ms, 화면 결과는 250ms로 합치고 run 목록은 64행씩 표시한다. 취소는 즉시 처리하며 완료 run은 보존한다.
- 256-run 측정 최초 실행은 결정론적 모델의 잘못된 seed로 실패했다. 보완 뒤 10/10 불변식, 동시 실행 최대4, 완료4개 보존·파일 복원·재개, native 종점 차이0을 확인했다. 이는 주입된 비동기 executor의 orchestration 측정이며 실제 browser worker의 UI latency 증거와 구분한다.
- 독립 추가 검토에서 native와 다른 `ceil(duration/step−1e−10)` 계산이 유효한 매우 짧은 마지막 step을 누락하는 문제와, Floquet diag(1,−1)의 실제 준에너지 −0이 JSON 안전 검사에서 거부되는 문제를 발견했다. 원 엔진·허용오차를 바꾸지 않고 product 경계에서 native 종료 정책과 숫자 전송을 맞추며 별도 회귀 테스트를 추가한다. 수정 검증 전 CP1을 publish하지 않는다.
- 초기 개발 서버 smoke는 작성 중 lazy 파일 로드와 Vite 개발 CSS의 CSP 충돌로 실패했다. 초기 production의 LHS test helper도 숨긴 축별 count 입력을 편집하는 오류가 있었다. 기존 테스트·timeout·retry를 변경하지 않았으며 완료 증거는 최종 production의 별도 결과만 사용한다.
- 추가 회귀: Floquet period의 유효 상한100이 log 보간에서100.00000000000004가 되는 문제를 실제 상한 fixture로 재현했다. 선형·로그 격자의 첫/마지막 값은 입력한 시작/끝 값 그대로 유지한다. 세 독립 review 회귀는3/3 통과했다.
- CP1 최종 targeted: `npx vitest run tests/product/lab/experiments tests/characterization/numerical-golden.test.ts --maxWorkers=2 --reporter=json --outputFile=tmp/s21-cp1-vitest.json` exit0, 5파일313/313, 실패·pending0. 신규300개는 core21·client14·독립 science/matrix262·review 회귀3개다. 기존 golden13개를 수정하지 않았다.
