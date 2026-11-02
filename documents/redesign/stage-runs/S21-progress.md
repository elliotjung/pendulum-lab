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
| CP1 | deterministic builder·queue·worker·artifact | scheduling/concurrency, partial failure, cancel/resume, numerical parity, input guards, typecheck | 0102d42d933327c787dbcd7ed3678c18156d0f4a push·정확한 remote hash 확인 |
| CP2 | 공용 lazy builder·queue·summary·파일 왕복 UI | component, desktop/mobile keyboard/axe/320px/visual, build | 4bd3796ae29f3e7d815fd1908dd338c4dc47447f push·정확한 remote hash 확인 |
| CP3 | 전체 회귀·보존·검증 보고서 | 전체 Vitest, E/U, 품질·보존 검사 | c4f7c8de94591f92e663b7812efe150b4af89883 push·정확한 remote hash 확인 |
| STATUS | 구현 원격 확인 후 완료 metadata | 별도 commit/push·정확한 remote hash | 최종 검증 통과; 별도 status commit의 원격 존재가 완료 기준 |

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
- CP1 typecheck·scoped ESLint·diff 검사 exit0. push exit0, local HEAD와 git ls-remote 모두0102d42d933327c787dbcd7ed3678c18156d0f4a로 확인했다.

## CP2 UI·production 검증

- lazy builder와 결과 UI를 기존 diagnostics의 lifecycle에 연결하고 9개 concrete family의 보관함에 부착했다. 개별/전체 실패 재실행, 비교 기준·성분별 단위, 64행 pagination, 파일 복원 후 독립 실행, focus 보존과 normalized-time 표기를 구현했다.
- 초기 production24개는21pass/3fail이었다. LHS의 숨겨진 축별 count를 편집하던 새 test helper2건과 mobile200-run이155개 완료 시점에5초 기본 assertion을 먼저 평가한1건이다. LHS는 global count만 편집하고,200-run은 실제 완료 시 활성화되는 다운로드 action을 기다린 뒤 완료 상태·200개 결과를 검사한다. 기존 test/config·30초 journey budget·retry0을 바꾸지 않는다. 초기 JSON/trace/video는 tmp/s21-browser-initial.json과 관련 artifacts에 보존한다.
- light/dark·desktop/mobile의 새 PNG4개를 직접 검사했다. 마지막 production 재빌드 후 snapshot update none으로 다시 비교한다.
- 품질 검토에서 runtime 복제·종속 차원 필드가 단독 sweep 변수로 노출되는 문제를 발견했다. 원래 canonical/export는 보존하고, 독립적으로 변경 가능한 필드만 선택 목록에 남기는 CP2 보완과 회귀 검사를 진행한다.
- 해당 변수 보완10개와 native parity5개를 추가해 신규315/315가 통과했다. LHS는 기존 latinHypercube를 직접 호출한다. 동일 조건의 현재3방법과 native expansion suite 종점, 보존계의 native energy drift profile 표본을 별도로 비교했다.
- 범위 구분: 새 UI의 현재 adapter 방법은 Euler/RK2/RK4 중 실제 지원 조합이며, 기존 runExpansionSuite의 추가 방법·ghost·분기·선택 Lyapunov·ranking이나 energyDriftProfile의 추세/R²/secular 분류를 통합한 것으로 주장하지 않는다. 기존 API·앱을 보존하고 S28 전체 parity 심사에 이 차이를 남긴다. 임의 위상·제어·topology를 legacy 기본값으로 조용히 바꾸지 않는다.
- 두 번째 provisional production26개는24pass/2fail이었다. 새 test의 "기존에 준비한 유효 snapshot이 live inspector 오류 때문에 실행 불가해야 한다"는 잘못된 가정2건이었다. 실제 요구는 저장된 유효 snapshot의 독립 실행이므로 live 입력 aria-invalid를 먼저 확인하고 import·실행·원래 입력 보존을 검사하도록 새 test를 수정했다. 앱 코드는 바꾸지 않았다. tmp/s21-browser-final.json에 실패 이력을 남긴다.
- provisional26의 snapshot 정책은 기본 missing이었다. 새 PNG4개는 최초 생성 때의 actual PNG와 SHA256이 모두 같아 실제 갱신0이었다. 최종 native-LHS production build는 tmp/s21-build-final2.log exit0이며, 최종26개와 기존 대표14개는 명시적 update-snapshots=none으로 검사한다.
- 최종 production 신규26/26(Chromium13·Pixel5 13), unexpected/skip/flaky/runner error0, retries0·원래30초 timeout·명시적 snapshot update none으로 exit0 통과했다. 실행155.847초. 200-run 실제 worker 취소·파일 복원·재개와 완료 run 불변, 실패 재실행, seed 일치, 저장 snapshot의 독립 실행, 접근성/keyboard/320px/200% 확대를 확인했다. tmp/s21-browser-final2.json에 기록했다.
- 최종 코드의10개 품질 명령(typecheck/lint/format/module-size/plan/catalog/Learn/inventory/golden/secrets)은 모두exit0이다. secret scan은 이 시점의 tracked 파일 범위이며 UI를 push한 뒤 새 tracked 파일을 포함해 다시 기록한다. 보호286파일·기존 test/fixture410개·기존 PNG208개 및 바탕화면 전달본2개의 정확한 바이트/해시 일치를 확인했다.
- CP2 push exit0, local HEAD와 git ls-remote 모두4bd3796ae29f3e7d815fd1908dd338c4dc47447f로 확인했다. nextStage21·lastCompleted20을 유지한 candidate-complete 상태에서 전체 Vitest와 기존 browser14개를 확인한다.

## CP3 최종 gate

- 새 S21 scheduling 회귀의 완료 순서를 wall-clock의3–12ms 지연 대신 microtask gate로 역순 제어하도록 바꿨다. 실행량·native 결과·동시 실행 제한·seed 비교 assertion은 유지한다. CP2 push 직후의 이 새 test 전용 개선은 CP3에서 전체 검증하고 별도로 보존한다. 기존 테스트/fixture410개는 그대로다.
- 같은 최종 production build의 기존 S18/S19/S20 대표14/14도 exit0 통과했다. 신규26개와 합쳐40/40, 실패·skip·flaky·runner error0, retries0·snapshot update none·원래30초 timeout이다. tmp/s21-browser-legacy-final2.json과 tmp/s21-browser-final2.json을 확인했다.
- CP2 원격 구현을 기준으로 최종 수치 측정10/10을 생성했다. 256run·동시 최대4·취소 전 완료10개 보존·미완료 재실행·종점 오차0·전체 파일 왕복·native LHS32개 층화가 통과했다. 주입 비동기 executor orchestration896.5355ms이며 browser latency나 장치 throughput으로 해석하지 않는다. S21-numerical-metrics.json에 실제 측정과 한계를 기록했다.
- S21-preservation.json에서 보호286파일, 기존 test/fixture410개, 기존 PNG208개 모두 원래 Git blob과 정확히 일치했다. 두 바탕화면 전달본의 SHA256도 저장소 원본과 일치한다. 원본 roadmap 문서를 변경하지 않아 복사는 필요하지 않았다.
- 전체 Vitest는333파일5151/5151, 실패·pending0, exit0으로 통과했다. 기존4836개와 신규315개이며, UTC2026-11-02T04:54:00.572Z–04:55:56.447Z에 실행했다. 새 test의 역순 microtask gate까지 같은 전체 run에 포함했다. 테스트 timeout·retry·원래 golden·기존 assertion을 바꾸지 않았다.
- 마지막 전체 실행 후 typecheck도exit0으로 확인했다. 새 test/측정 script의 scoped ESLint·Prettier·diff 검사가 통과했다. 최종 production build/10개 품질 명령/40browser·수치10개와 함께 S21-verification.json에 command·건수·환경·hash·실패 이력을 기록했다.
- CP2 push 후 CP3 source/측정 경로를 stage하고 tracked1810/text1592개 known-pattern secret scan에서 finding0을 확인했다. 이 검사는 최종 verification JSON 생성 전이며 history·ignored·binary·외부 서비스는 제외다. 패키지 변경·새 dependency audit·보안 위험 수용은 없다. S01 high2/moderate2·CodeQL32는 미해결이며 CP2 GitHub 기본 branch 알림22(12high/7moderate/3low)는 별도 관측이다.
- approved review gates[7,9,17]와 Learn 사람 검토 상태는 그대로다. 사람의 과학 검토를 수행하지 않았다. 실제 기기·Firefox/WebKit·screen-reader 음성은 미검증이다. 원래 app.html과 S20 4158b6b를 복구 기준으로 보존했다. S22 이후 구현·master merge·force push·tag·release·cutover는 하지 않았다.

## 완료 status gate

- CP3 push exit0, local HEAD와 git ls-remote 모두c4f7c8de94591f92e663b7812efe150b4af89883로 확인했다. clean tree에서 redesign:preflight -- 21과 plan check가exit0으로 통과했다.
- 이 마지막 변경은 progress/status 두 파일이다. lastCompleted21/next22, completed1..21, active/checkpoint null을 기록한다. 이전 구현·증거 commit은 모두 원격에 있다. 이 별도 status commit을 push하고 정확한 원격 hash를 확인하기 전에는 완료가 아니다.
- 최종 보고는 실제 status commit hash와 push 결과를 제공한다. S21은 사용자 review gate가 아니며 다음 유효 요청은 “22단계 실행해줘.”다. S28 전체 parity와 사람의 과학 검토를 완료했다고 주장하지 않는다.
