# Pendulum Lab 세계 수준 감사 대장 — 2026-07-15

이 문서는 2026-07-15 작업 트리의 실제 구현을 기준으로 다시 확인한 110개 항목이다. 대화 압축으로 최초 메모의 일부 문장이 소실되어, 번호 체계는 남아 있던 CI 매핑, JobClient 69–78 매핑, 기존 2026-07-14 감사와 현재 diff를 대조해 재구성했다. 따라서 확인하지 못한 일을 완료로 표기하지 않았다.

상태 의미:

- **완료(전용 검증)**: 구현과 해당 회귀 테스트 또는 실행형 검증을 확인했다.
- **완료(정적 검증)**: 구현과 타입·lint·구성 검증을 확인했으며 전체 라이브 매트릭스는 배포 단계에서 다시 돈다.
- **추가 확인**: 구현 일부는 있으나 특정 브라우저·표면·통합 검증이 남았다.
- **외부 조건**: 계정, 저장소 설정, 토큰, 공개 레지스트리 또는 물리 장비가 필요하다.

## 1. CI, Pages, 브라우저 및 릴리스 경계

| 번호 | 상태 | 확인한 문제와 조치 | 구현·검증 근거 |
|---:|---|---|---|
| 1 | 완료(정적 검증) | Pages 배포가 품질 검사보다 먼저 실행될 수 있던 의존성을 `quality-gate → browser gates → deploy`로 고정했다. | `.github/workflows/pages.yml`, actionlint |
| 2 | 완료(정적 검증) | Pages 쓰기 권한이 넓게 열려 있던 것을 실제 deploy job의 `pages`/`id-token` 쓰기로 제한했다. | `.github/workflows/pages.yml` |
| 3 | 완료(정적 검증) | 앱만 빌드하고 공개 라이브러리 산출물을 누락하던 경로에 `build:lib`를 추가했다. | `.github/workflows/ci.yml`, `pages.yml` |
| 4 | 완료(정적 검증) | 단일 브라우저 smoke만 통과해도 배포되던 구조를 production E2E shard와 호환성 gate로 확장했다. | `.github/workflows/pages.yml`, Playwright 목록 검증 |
| 5 | 완료(정적 검증) | mainline의 과학·빌드와 브라우저·릴리스 검증을 분리하고 후자가 앞 단계 artifact만 소비하게 했다. | `.github/workflows/main.yml` |
| 6 | 완료(정적 검증) | 무기한 머무를 수 있던 주요 CI job에 명시적 timeout을 부여했다. | `.github/workflows/main.yml` 및 workflow 전반 |
| 7 | 완료(정적 검증) | standalone/WASM 동기화, bundle budget, module audit가 PR·Pages 경로에서 빠지지 않게 했다. | `.github/workflows/ci.yml`, `pages.yml` |
| 8 | 완료(정적 검증) | Pages가 검증되지 않은 benchmark-history를 `curl`로 섞던 경로를 제거했다. | `.github/workflows/pages.yml` |
| 9 | 완료(정적 검증) | 별도 원격 history가 같은 배포 디렉터리를 바꾸는 artifact race를 제거했다. | `.github/workflows/pages.yml` |
| 10 | 완료(정적 검증) | history 다운로드 실패를 무시해 오래되거나 부분적인 artifact를 배포하던 fail-open 동작을 없앴다. | `.github/workflows/pages.yml` |
| 11 | 완료(정적 검증) | PR 기본 품질선에 lint, typecheck, 테스트 결과 계약을 묶었다. | `.github/workflows/ci.yml`, `package.json` |
| 12 | 완료(정적 검증) | 빌드 결과를 후속 job이 다시 만들며 달라질 수 있던 경로를 artifact 전달 방식으로 축소했다. | `.github/workflows/main.yml`, `release.yml` |
| 13 | 완료(정적 검증) | 브라우저 검증이 개발 서버가 아니라 배포와 같은 production preview를 대상으로 하게 했다. | `playwright.config.ts`, workflow preview 단계 |
| 14 | 완료(정적 검증) | workflow 최상위 권한을 read-only로 두고 각 job에 필요한 최소 권한만 부여했다. | `.github/workflows/release.yml`, `main.yml`, `pages.yml` |
| 15 | 완료(정적 검증) | 동일 ref의 오래된 배포·릴리스 실행이 뒤늦게 덮어쓰지 않도록 concurrency를 명시했다. | release/Pages/Cloudflare workflows |
| 16 | 완료(정적 검증) | 의존성 설치 경로를 lockfile 기반으로 고정하고 캐시 키도 lockfile에 결속했다. | workflow의 Node setup/npm ci 단계 |
| 17 | 완료(정적 검증) | 테스트 evidence 입력을 암묵적 최신 파일 대신 명시적 `vitest-results.json`으로 제한했다. | `scripts/evidence-summary.ts`, workflows |
| 18 | 완료(정적 검증) | 빠른 테스트와 느린 수치 테스트가 서로 가려지지 않게 별도 gate로 유지했다. | `package.json`, main/CI workflows |
| 19 | 완료(정적 검증) | PR 의존성 변경의 중간 이상 위험을 자동 차단하는 dependency review를 추가했다. | `.github/workflows/ci.yml` |
| 20 | 완료(정적 검증) | TypeScript/JavaScript 정적 보안 분석을 CodeQL gate로 추가했다. | `.github/workflows/ci.yml` |
| 21 | 완료(정적 검증) | 허용되지 않은 Action 사용과 mutable reference를 검사하는 정책을 추가했다. | `.github/actionlint.yaml`, workflow policy 단계 |
| 22 | 완료(전용 검증) | 전체 workflow YAML을 actionlint 1.7.12로 검사해 현재 0 findings를 확인했다. | actionlint checksum 검증 및 실행 결과 |
| 23 | 완료(정적 검증) | Docker image가 실제로 non-root이며 컨테이너 안 typecheck가 되는지 PR에서 실행한다. | `.github/workflows/ci.yml` `docker-reproducibility` |
| 24 | 외부 조건 | GitHub Pages source를 Actions로 전환하는 저장소 설정은 코드만으로 확정할 수 없다. | `.github/DEPLOYMENT.md` |
| 25 | 외부 조건 | Cloudflare 실제 배포에는 account/project token과 공개 URL 설정이 필요하다. | `.github/DEPLOYMENT.md`, `cloudflare-pages.yml` |
| 26 | 외부 조건 | landing evidence dispatch에는 `LANDING_DISPATCH_TOKEN`이 필요하다. | `.github/DEPLOYMENT.md`, `evidence-dispatch.yml` |
| 27 | 외부 조건 | required checks와 force-push 차단은 GitHub branch ruleset에서 활성화해야 한다. | `.github/DEPLOYMENT.md` |
| 28 | 외부 조건 | npm/JSR trusted publishing은 소유자 계정의 OIDC 등록과 공개 의사결정이 필요하다. | `.github/DEPLOYMENT.md`, publish workflows |
| 29 | 완료(정적 검증) | Playwright가 개발 서버가 아닌 production preview 명령을 사용하도록 했다. | `playwright.config.ts` |
| 30 | 완료(정적 검증) | 고정 포트 충돌을 피하도록 검증 서버 포트를 동적으로 선택하게 했다. | `playwright.config.ts`, workflow |
| 31 | 완료(정적 검증) | flaky 성공을 숨기는 CI retry를 0으로 고정했다. | `playwright.config.ts` |
| 32 | 완료(정적 검증) | 실패 원인 재현을 위해 trace를 보존한다. | `playwright.config.ts` |
| 33 | 완료(정적 검증) | 실패 시 screenshot을 보존한다. | `playwright.config.ts` |
| 34 | 완료(정적 검증) | 실패 시 video를 보존한다. | `playwright.config.ts` |
| 35 | 완료(정적 검증) | Pages Chromium 테스트를 첫 번째 shard로 분할했다. | `.github/workflows/pages.yml` |
| 36 | 완료(정적 검증) | Pages Chromium 테스트를 두 번째 shard로 분할해 전체 목록을 덮는다. | `.github/workflows/pages.yml` |
| 37 | 완료(정적 검증) | Firefox production 호환성 gate를 추가했다. | `.github/workflows/pages.yml` |
| 38 | 완료(정적 검증) | WebKit production 호환성 gate를 추가했다. | `.github/workflows/pages.yml` |
| 39 | 완료(정적 검증) | mobile viewport/project를 배포 전 호환성 gate에 포함했다. | `.github/workflows/pages.yml`, `playwright.config.ts` |
| 40 | 완료(정적 검증) | Cloudflare live 응답에서 COOP, COEP, `nosniff`를 확인하고 secret/URL 누락을 성공으로 위장하지 않게 했다. | `.github/workflows/cloudflare-pages.yml` |
| 41 | 추가 확인 | axe의 moderate 이상 위반 0 ratchet을 추가했으나 default/trust 두 표면은 동시 HMR 검증 중 navigation/hidden 상태를 다시 실측해야 한다. | `e2e/axe-audit.spec.ts`; validation/research 표면 통과 |
| 42 | 완료(정적 검증) | production CSP에 개발용 `ws:` 연결 허용이 남지 않도록 제거했다. | `app.html` |
| 43 | 완료(정적 검증) | local preview도 배포와 같은 격리·보안 헤더 조건을 사용하도록 설정했다. | `vite.config.ts` |
| 44 | 완료(정적 검증) | 브라우저 실패 artifact가 성공 경로에만 업로드되던 문제를 실패 시에도 수집하도록 정리했다. | Pages/main browser jobs |
| 45 | 완료(정적 검증) | production bundle size가 예산을 넘으면 배포가 중단되도록 budget gate를 배치했다. | `.github/workflows/ci.yml`, `pages.yml` |
| 46 | 완료(정적 검증) | standalone 산출물이 source와 어긋나면 CI에서 탐지하도록 동기화 검사를 추가했다. | CI/Pages standalone 검증 단계 |
| 47 | 완료(정적 검증) | WASM 산출물 누락·불일치를 배포 전에 탐지한다. | CI/Pages WASM sync 단계 |
| 48 | 완료(정적 검증) | 일반 `verify`가 sibling landing 저장소를 묵시적으로 수정하지 않게 했다. | `scripts/evidence-summary.ts` |
| 49 | 완료(정적 검증) | evidence 갱신 뒤 허용되지 않은 tracked 파일이 바뀌면 CI가 실패하도록 만들었다. | `scripts/evidence-summary.ts`, workflow restore/check |
| 50 | 완료(정적 검증) | module/legacy/mojibake 감사가 배포 전 품질선에서 빠지지 않게 했다. | `package.json`, CI/Pages workflows |
| 51 | 완료(전용 검증) | landing 동기화 write는 `PENDULUM_SYNC_LANDING=1`일 때만 실행한다. | `scripts/evidence-summary.ts`, evidence summary 실행 |
| 52 | 완료(전용 검증) | evidence check-only와 refresh를 분리하고 volatile field만 정규화했다. | `scripts/evidence-summary.ts`, `package.json` |
| 53 | 완료(정적 검증) | dispatch token이 없으면 명확히 실패·요약하고 landing은 pushed full SHA의 raw evidence를 받는다. | `.github/workflows/evidence-dispatch.yml` |
| 54 | 완료(정적 검증) | release에서 한 번 만든 npm tarball을 SHA-256과 함께 전달해 같은 bytes를 publish한다. | `.github/workflows/release.yml`, `publish-npm.yml` |
| 55 | 완료(정적 검증) | JSR publish의 `--allow-dirty`를 제거해 숨은 변경을 허용하지 않는다. | `.github/workflows/publish-jsr.yml` |
| 56 | 완료(정적 검증) | 생성 tarball을 깨끗한 consumer에서 설치·import하는 검증을 추가했다. | release workflow |
| 57 | 완료(정적 검증) | release 최상위 권한을 read-only로 낮추고 publish job만 필요한 권한을 가진다. | `.github/workflows/release.yml` |
| 58 | 완료(정적 검증) | release/publish에 concurrency와 timeout을 추가했다. | release/publish workflows |
| 59 | 완료(정적 검증) | landing cross-release job만 contents write를 가지며 Pages lane의 불필요한 write를 제거했다. | release/Pages workflows |
| 60 | 완료(정적 검증) | cross-release의 `git add -A`를 8개 생성 파일 allowlist와 unexpected-path 실패로 교체했다. | `.github/workflows/release.yml` |
| 61 | 완료(정적 검증) | landing provenance가 semver, full SHA, SHA-256과 simulator tag→commit 상관관계를 확인한다. | release workflow |
| 62 | 완료(전용 검증) | Python 의존성을 hash-pinned lock으로 고정했다. | `requirements.lock` |
| 63 | 완료(정적 검증) | pip 의존성도 Dependabot 갱신 범위에 포함했다. | `.github/dependabot.yml` |
| 64 | 완료(전용 검증) | Node base image를 digest로 pin하고 runtime user를 `node`로 고정했다. | `Dockerfile`, Docker PR 검증 |
| 65 | 완료(전용 검증) | VCS, report, secret, key, `.env*`가 Docker build context에 들어가지 않도록 했다. | `.dockerignore` |
| 66 | 완료(정적 검증) | WebGPU 검증이 충돌 포트의 다른 프로세스를 강제 종료하지 않고 실패하게 했다. | `.github/workflows/webgpu-*.yml` |
| 67 | 외부 조건 | NVIDIA/AMD 실장비 vendor evidence와 최종 Zenodo DOI는 물리 runner·인증 계정이 필요하다. | WebGPU workflows, `.github/DEPLOYMENT.md` |
| 68 | 완료(전용 검증) | 모든 GitHub Actions를 조회된 full SHA로 pin하고 Dependabot 갱신을 연결했다. | `.github/workflows/*.yml`, actionlint 0 findings |

## 2. JobClient 및 job protocol 69–78

| 번호 | 상태 | 확인한 문제와 조치 | 구현·검증 근거 |
|---:|---|---|---|
| 69 | 완료(전용 검증) | `poolSize`/`maxQueued`의 NaN, Infinity, 소수, 0, 과대값이 풀·backpressure 계약을 깨던 문제를 safe-integer 범위로 거부했다. | `src/runtime/JobClient.ts`, `tests/job-protocol.test.ts` |
| 70 | 완료(전용 검증) | worker `error`/`messageerror`가 pending Promise를 고아로 남기던 문제를 전송 실패 정리와 generation 기반 respawn으로 연결했다. | `chaosWorkerTransportFactory`, fatal/respawn 회귀 테스트 |
| 71 | 완료(전용 검증) | `postMessage`/control send의 동기 clone·전송 예외가 busy slot과 timer를 남기지 않게 했다. | `JobClient.failWorker`, postMessage throw 테스트 |
| 72 | 완료(전용 검증) | progress/checkpoint callback 예외가 job engine과 다음 queue를 중단하지 않도록 격리했다. | `JobClient.runCallback`, callback throw 테스트 |
| 73 | 완료(전용 검증) | protocol 문자열만 보던 이벤트 수신을 전체 envelope schema, checkpoint, phase, request id/kind, worker generation·ownership 검증으로 강화했다. | `isJobEventMessage`, `validateJobCheckpoint`, wrong-worker/mismatch 테스트 |
| 74 | 완료(전용 검증) | transport factory/`terminate()` 예외가 풀 구성과 전체 Promise 정리를 막지 못하게 했다. | `createWorker`, `safeTerminate`, factory/terminate throw 테스트 |
| 75 | 완료(전용 검증) | 중복 job id가 활성 job을 덮어쓰지 않게 하고 모든 terminal path에서 jobs/queue entry를 삭제해 id를 재사용할 수 있게 했다. | `JobEngine.submit/finish`, duplicate/reuse 테스트 |
| 76 | 완료(전용 검증) | 모든 request kind의 유한성, safe integer, integration/grid/RQA/CLV/Wada/0–1 work budget과 checkpoint prefix를 실행 전에 검증한다. | `validateChaosJobRequest`, malformed-work/checkpoint 테스트 |
| 77 | 완료(전용 검증) | pause loop에서도 deadline을 계속 확인하고 각 동기 phase 직후에도 timeout을 판정한다. | `JobEngine.hasTimedOut`, paused-timeout/phase-boundary 테스트 |
| 78 | 완료(전용 검증) | Worker가 없을 때 큰 단일 phase를 UI thread에서 실행하지 않고 100,000 work-unit 경계에서 거부하며 혼합 풀도 큰 job을 worker slot에만 배정한다. | `MAX_IN_PROCESS_WORK_UNITS`, no-worker large-grid 테스트 |

## 3. 상태·과학 UI·접근성·PWA 79–110

| 번호 | 상태 | 확인한 문제와 조치 | 구현·검증 근거 |
|---:|---|---|---|
| 79 | 완료(전용 검증) | Poincaré retention capacity의 NaN, Infinity, 소수·과대값을 safe integer 상한으로 거부했다. | `src/app/PoincareAccumulator.ts`, `tests/lab-runtime-budget.test.ts` |
| 80 | 완료(전용 검증) | 장기 실행에서 `shift()`가 만드는 O(N) 비용을 고정 용량 ring storage로 바꿨다. | `PoincareAccumulator`, lab analysis/runtime tests |
| 81 | 완료(전용 검증) | triple pendulum을 interleaved state로 오인하던 crossing 방향·ω₂ index를 angle-first layout으로 고쳤다. | `tests/lab-analysis.test.ts` triple fixture |
| 82 | 완료(전용 검증) | 회전 궤적의 `2πk` 동치 section crossing을 놓치지 않도록 section angle을 추적한다. | `PoincareAccumulator`, 2π crossing 테스트 |
| 83 | 완료(정적 검증) | 선형 보간만 쓰던 section을 같은 RHS/RK4 기반 crossing refinement로 확장했다. | `PoincareAccumulator.setRefiner/refineCrossing` |
| 84 | 완료(전용 검증) | 홀수·변경된 차원의 malformed state 뒤 stale bracket이 다음 점을 오염시키지 않게 초기화한다. | malformed-dimension 회귀 테스트 |
| 85 | 완료(정적 검증) | 한 EventBus listener의 예외가 다른 listener와 앱 흐름을 중단하지 않도록 handler별로 격리했다. | `src/runtime/EventBus.ts` |
| 86 | 완료(전용 검증) | StateStore/import가 hostile getter를 읽다 예외·부작용을 내지 않도록 descriptor 기반 plain-data 검증을 적용했다. | `src/state/StateStore.ts`, session/import tests |
| 87 | 완료(전용 검증) | Proxy·비표준 prototype object를 canonical state로 받아들이지 않게 했다. | `StateStore`, `src/validation/importSchema.ts` |
| 88 | 완료(전용 검증) | snapshot의 알 수 없는 key를 묵시적으로 보존하지 않고 명시적으로 거부한다. | session contract tests |
| 89 | 완료(전용 검증) | 일반 `JSON.parse`가 숨기던 duplicate key를 strict parser가 거부한다. | `src/validation/importSchema.ts`, `tests/json-import-validation.test.ts` |
| 90 | 완료(전용 검증) | JSON byte/depth/node 및 위험 key 제한을 parse 전후에 적용해 중첩·폭 입력을 차단한다. | `importSchema.ts`, JSON import tests |
| 91 | 완료(정적 검증) | saved-run import가 대략 맞는 객체가 아니라 정확한 허용 schema를 요구한다. | `src/browser/savedRunImport.ts` |
| 92 | 완료(전용 검증) | DOM/store/runtime 적용 중 하나라도 실패하면 이전 상태로 원자 rollback한다. | `savedRunImport.ts`, session contract tests |
| 93 | 완료(정적 검증) | import 성공·거부·rollback을 보안/진단 event로 노출해 조용한 부분 적용을 없앴다. | saved-run/import guard modules |
| 94 | 완료(전용 검증) | beginner/student가 URL, shortcut, palette로 숨겨진 research tab에 우회 진입하지 못하도록 중앙 권한 함수를 사용한다. | `audienceMode.canAccessAudienceTab`, audience E2E |
| 95 | 완료(정적 검증) | lazy tab panel이 아직 없을 때 실패하는 대신 `TAB_REQUESTED_EVENT`로 mount를 요청한다. | `src/app/Shell.ts`, `bootstrap.ts` |
| 96 | 완료(정적 검증) | tab에 `aria-controls/labelledby/selected`, panel에 `aria-hidden/inert`를 일관되게 동기화한다. | `Shell.ts`, axe/guided UI specs |
| 97 | 완료(정적 검증) | tablist에 roving tabindex와 방향키/Home/End 키보드 이동을 추가했다. | `Shell.ts` |
| 98 | 완료(정적 검증) | 숨겨진 panel에 focus가 남지 않게 선택 tab으로 이동하고 live status로 전환을 알린다. | `Shell.switchTo`, `tabChangeStatus` |
| 99 | 완료(전용 검증) | 손상된 저장 mode와 잘못된 URL mode를 quarantine하고 첫 방문 선택 상태를 복원한다. | `audienceMode.ts`, `e2e/audience-mode.spec.ts` |
| 100 | 완료(전용 검증) | audience chooser에 focus trap, Escape/backdrop close, 이전 focus 복귀, 현재 선택 focus를 구현했다. | `audienceMode.ts`, guided/audience E2E |
| 101 | 완료(전용 검증) | 모바일에서 숨겨졌던 command palette launcher를 safe-area 위의 44px 버튼으로 제공한다. | `css/00-base.css`, `e2e/guided-ui.spec.ts` |
| 102 | 완료(전용 검증) | palette open 시 search focus, 화살표 선택, Escape focus 복귀, 한국어 검색·레이블을 고정했다. | `src/app/parity/command-palette.ts`, guided UI E2E |
| 103 | 완료(전용 검증) | 저장된 mode가 있는 재방문마다 chooser가 강제로 뜨던 흐름을 없애고 미완료 onboarding만 이어간다. | `audienceMode.ts`, `onboardingTour.ts`, E2E/unit tests |
| 104 | 완료(정적 검증) | audience chooser와 안내 문구를 한국어 locale에 맞게 갱신하고 `ACTIVE/현재` 상태를 접근 가능하게 표현한다. | `audienceMode.ts`, `uiLocale.ts` |
| 105 | 완료(정적 검증) | 동적 canvas 접근성 보강을 한 번만 적용하고 MutationObserver가 characterData 전체를 재순회하지 않게 했다. | `src/ui/accessibility.ts` |
| 106 | 완료(정적 검증) | pseudo-content만으로 의미를 전달하던 tooltip/현재 상태를 실제 ARIA 이름·텍스트와 연결했다. | accessibility/audience/CSS 변경 |
| 107 | 완료(정적 검증) | 오래된 anchor/중복 takeover 경로를 정리하고 동적 UI가 한 번만 listener를 소유하게 했다. | `bootstrap.ts`, parity/shared, onboarding/locale modules |
| 108 | 완료(전용 검증) | service-worker cache 이름에 build revision을 주입하고 새 worker는 사용자 승인 `SKIP_WAITING` 전까지 대기한다. | `public/sw.js`, `src/main.ts`, PWA tests |
| 109 | 완료(전용 검증) | 직전·현재 두 cache generation을 보존하고 navigation key 정규화, same-origin 응답 제한, serialized trim으로 offline/cache race를 줄였다. | `public/sw.js`, `tests/service-worker-behavior.test.ts` |
| 110 | 완료(전용 검증) | manifest에 안정적 id/lang/dir, 전용 maskable SVG와 simulator/research shortcuts를 추가했다. | `public/manifest.webmanifest`, `tests/pwa-assets.test.ts` |

## 이번 작업에서 직접 확인한 검증

- `npm run typecheck` — 통과.
- `npx vitest run tests/job-protocol.test.ts` — **33/33 통과**.
- `npx eslint src/runtime/JobClient.ts src/workers/jobProtocol.ts tests/job-protocol.test.ts --max-warnings 0` — 통과.
- `npx prettier --check src/runtime/JobClient.ts src/workers/jobProtocol.ts tests/job-protocol.test.ts` — 통과.
- `git diff --check` — JobClient/jobProtocol/test 변경에서 whitespace 오류 없음.
- CI 담당 검증: workflow YAML parse, actionlint 1.7.12, production Playwright shard/list, evidence summary, Prettier 통과.

전체 `verify`, 전체 quick/slow, 모든 production E2E와 실제 Pages/Cloudflare smoke는 최종 커밋 직전 루트 작업에서 다시 실행해야 한다. 외부 조건 항목은 필요한 권한·실장비·공개 결정 없이는 완료로 바꾸지 않는다.
