# S24 — 연구 프로젝트·run·artifact·내보내기

## 기준과 범위

- 기준 local/remote HEAD: `e6aa7094229e26527b02ceeeeb0cb7e6c01b38a3`, branch `codex/redesign`, upstream `origin/codex/redesign`.
- clean worktree, fetch와 정확한 HEAD 일치, redesign:check 및 redesign:preflight -- 24 통과. sandbox Git metadata 쓰기와 Git 하위 프로세스 EPERM은 동일 명령의 확장 권한 실행으로 해결했다.
- 선행 S23의 원격 status commit e6aa709, 구현 CP0/CP1-E/CP1-L/CP2/CP3, progress/verification/preservation 파일과 연속 완료 목록 1..23을 확인했다.
- 목표: 기존 계산·결과 파일을 project/session/run/artifact로 연결하고 narrative notebook, 출처가 있는 figure, report, versioned/checksummed ZIP과 offline reviewer를 제공한다. 기존 research ZIP은 호환 adapter로 원본을 보존한다.
- 범위 밖: S25 이후 교육 콘텐츠, S28 전체 migration/parity 인증, 기본 app 전환, master merge/tag/release.
- 보존: app.html; src/physics, chaos, research, runtime, workers, validation; 기존 physics adapters/공개 API/저장 및 공유 schema; 사용자 데이터; package/lockfile; 기존 test/fixture/PNG.
- UI 모델 선택값은 runtime에 노출되지 않는다. 사용자의 선택을 전제로 진행하며 모델 변경·검증을 주장하지 않는다.

## 내부 checkpoint

| ID | 내용 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 범위·보존·진행 기록 | plan/preflight24/typecheck | 완료·원격 확인 |
| CP1 / CP1-B | 엄격한 계층·ZIP·checksum·legacy 호환·Node byte 경계 | 정상/경계/손상/unsafe path/round trip, typecheck | 완료·원격 확인 |
| CP2 | lazy 연구 workspace·notebook·figure·report·offline reviewer | component/production desktop/mobile/keyboard/a11y/visual, build | 검증 완료·push 예정 |
| CP3 | 통합 회귀·보존·재현 패키지 및 review 증거 | 전체 Vitest/golden/품질 검사/보존 hash | 대기 |
| STATUS | 별도 완료 상태 commit | 구현 원격 확인 후 status push 및 정확한 remote HEAD | 대기 |

예정 경로: src/product/provenance/, src/product/lab/projects/, diagnostics 연결, src/reviewer/의 연구 package mode, 전용 CSS, tests/product/provenance/, e2e/redesign/research-project*, scripts/redesign/의 검증·샘플 생성, S24 문서/검증/재현 패키지. 명시적 경로만 stage한다.

## 위험과 검토

- ZIP은 원본과 checksum manifest를 모두 검증한다. 체크섬은 무결성 증거이며 출처 진위나 과학적 정확성을 인증하지 않는다.
- 파일/프로젝트는 크기·개수·깊이 상한, unsafe path, 중복 ID/path, prototype key, malformed schema와 누락 artifact를 검사한다. 외부 HTML/SVG/script를 실행하지 않는다.
- 현재 설정과 실제 기록 표본을 클릭 시점에 복사하고 결과 파일의 원본 lineage를 보존한다. 그림은 원 run/artifact·축·단위를 추적한다.
- 새 프로젝트 저장은 별도 versioned key/파일을 사용한다. 기존 저장/공유와 원본을 덮어쓰지 않는다.
- 사용자 승인 gate [7,9,17] 유지. S24 연구 워크플로 checklist를 종료 보고에 제공하며 다음 단계 요청 전에는 승인으로 표시하지 않는다. 사람의 과학 검토를 수행한 것으로 표시하지 않는다.
- 기존 S01 dependency/CodeQL 보안 부채는 해결 또는 수락으로 표시하지 않는다.

## 실행 증거

- CP0 사전 검사: redesign:check exit0, preflight24 exit0. 기준 두 HEAD가 일치한다.

- CP0: typecheck exit0, plan check exit0, diff check 통과. 완료 목록·nextStage는 유지하며 activeStage24/CP0만 갱신한다.

### CP0 원격 확인과 CP1 계약

- CP0 `b344aafdaab0a09014e45cf5aed6acd8b27c5168` push exit0, ls-remote가 같은 hash를 반환했다. GitHub 기본 브랜치 취약점 알림22개(12high/7moderate/3low)는 기존 부채의 별도 관측이며 새 dependency audit나 위험 수락이 아니다.
- CP1은5개 backend module과3개 전용 test/fixture만 포함한다. UI/renderer/reviewer는 다음 checkpoint에 남긴다. 엄격한 versioned 계층, 원본 bytes/SHA256, native parser 재사용, 완주/partial 구분, 단위·좌표 검사, ZIP 전체 coverage/checksum, unsafe path와 legacy bridge를 구현했다.
- CP1 표적: 신규53+기존 ZIP/SHA20=73/73,4files, 실패·pending0 (`tmp/s24-cp1-backend.json`).8개 파일 Prettier/ESLint exit0. 원본 native core·S22 observation·S23 model, malformed7schema, byte round trip, 명시적 누락 figure placeholder, legacy 원 ZIP+모든 멤버 보존과 fallback 우회 거부를 검증했다.
- 작성 도중의 초기 typecheck는 미작성 UI module과 신규 test의 상대 import 깊이, 예제 script tuple 타입 오류를 발견했다. 해당 코드를 수정했고 최종 typecheck 결과와 구분한다. 기존 test/golden/timeout/retry는 수정하지 않았다.
- CP1 이후 통합 typecheck exit0. backend73/73 재실행 로그를 독립 확보했고 신규8개 경로의 전용 lint/format도 통과했다. CP1을 먼저 원격에 보존한다.

### CP1 원격 및 바이트 경계 보강

- CP1 `8a4a1e8e4079bbced03cc7045a5b8f23008385a4` push exit0, ls-remote 정확한 hash 일치. 전체 typecheck 및 표적73/73 통과 후 원격에 보존했다.
- 초기 production build는 Vite의 sandbox 하위 process EPERM으로 실패했으며 같은 build를 확장 권한으로 실행해 exit0을 확인했다. production browser 초기20건은16pass/4fail: Node Buffer fixture checksum 두 건과 신규 PNG missing 생성 두 건이다. 이 결과를 완료 검증으로 사용하지 않는다 (`tmp/s24-browser-initial.json`).
- Node Buffer의 slice/backing-store 차이는 실제 새 Node import API에서도 영향을 줄 수 있어 S24 boundary에서 plain detached Uint8Array로 정규화했다. 기존 src/research/zipBundle.ts는 보존한다. fs.readFile Buffer와 offset Buffer/typedarray의 정확한 SHA256, prefix/suffix 제외, 호출자 변경 분리, legacy Buffer round trip 및 checksum 입력 중복/총량을 추가 검증했다.
- CP1-B는 backend3개 module과 package test만 보강한다. 신규5개를 포함해 backend+ZIP78/78 통과, 전용 lint/format exit0. 현재 UI/renderer/legacy 통합 표적126/126, 실패·pending0 (`tmp/s24-targeted-final.json`).
- 독립 UI 검토에서 내부 route 이동시 지역 프로젝트 소실 문제를 발견했다. CP2에서 document 메모리 state로 보강하고 이중→복합→이중 왕복 browser 검증을 추가한다. 같은 ZIP 재선택과 그림의 접근성 축·단위 설명도 CP2에서 보강한다.
- CP1-B 이후 통합 typecheck와 전체 format:check exit0. renderer 전용6/6 및 UI 경계13/13도 통과했다. 다음 checkpoint 전에 이 바이트 경계 보강을 원격에 보존한다.

### CP1-B 원격과 CP2 UI 후보

- CP1-B `4c9ac6f56224e691f3c57ad050bd6c7fee6bab88` push exit0, ls-remote 정확한 hash 일치. Node Buffer 경계 보강도 원격에 있다.
- CP2는 lazy project workspace, session/run/native artifact, narrative/citations, 출처·단위가 있는 figure/report/notebook, 검증 preview→adopt, 별도 local key, document별 내부 탐색 보존, 실제 terminate 취소가 있는 worker와 reviewer route를 연결한다. 기존 reviewer console은 기본 경로에 유지한다.
- 두 독립 code review에서 발견한 내부 탐색 유실과 같은 ZIP 재선택 문제를 수정했다. 그림의 alt/텍스트에는 축 이름·단위·표본 수·원 run/artifact를 포함한다. 상태좌표끼리는 산점도로 표시하고 시간선만 연결한다.
- 최신 UI 경계13/13, renderer6/6, 통합126/126 및 전체 typecheck/format:check/lint, module audit와 production build exit0을 확인했다. 실제 S18 artifact 첨부와 기존 legacy exporter bridge, 시스템 왕복, 새 환경 복원, offline file 검토는 최종 production browser에 포함한다.
- 새 S24 visual baseline4개만 갱신했다. 초기 PNG/실패 로그는 tmp에 별도 보존했다. visual refresh는 Chromium 통과, Pixel5는 같은 case의 마지막200%zoom axe 작업에서 원래30초를 넘었다. timeout/retry를 늘리지 않고 키보드·320px·시각 case와200%zoom case를 분리해 동일 검증을 유지했다 (`tmp/s24-browser-visual-refresh.json`). 최종 snapshot policy none 결과가 나오기 전에는 CP2를 publish하지 않는다.
- 새 light Chromium/dark Pixel5 PNG를 직접 확인했다. 축·단위·원본 설명의 줄바꿈과 다운로드 버튼에 잘림이 없다. 모든 기존 PNG는 최종 보존 검사에서 기준 S23 전체와 비교한다.

### CP2 시각 검증 원인 분리

- 첫 none26건은25pass/1visualfail이었다 (`tmp/s24-browser-pre-visual-stability.json`). 모든 기능 여정과200%zoom은 양쪽 프로젝트에서 통과했고 Pixel5 설명 한 줄만449pixels 달랐다. 임계치나 mask를 바꾸지 않았다.
- 계측으로 같은 테스트의1pass/1fail을 재현했다. 폰트 loaded·14px·lineHeight23.8px·DPR2.75는 같았다. 무작위 project UUID가 상단 summary를 정확히 한 줄23.796875px 바꾸고, figure의 소수 top이133.71875→133.921875px(0.203125px 차이)가 되어 한 줄이1px 위/아래로 rasterize됐다. 실제/기준 해당 영역을1px 이동하면 차이0이었다 (`tmp/s24-visual-geometry-comparison.json`).
- 시각 case의 원 엔진5표본은 유지하고 project/session/run ID와 manifest 시각을 고정한 valid ZIP을 미리보기·채택하여 같은 upstream layout을 사용한다. 실제 UI 캡처·원본·source·legacy·왕복 여정은 다른12개 case에서 그대로 검증한다. 새4PNG만 이 명시적 fixture 변경에 맞추며, snapshot none 반복 및 최종전체26건을 다시 실행한다.

### CP2 최종 통과

- 고정 metadata fixture는 같은 실제 엔진5표본으로 생성한 ZIP 두 개의 bytes가 동일함을 확인했다. Chromium/Pixel5·light/dark 각2회에서 figure.top134.125px·summary.height188.65625px 및 inline rect가 정확히 같았다 (`tmp/s24-visual-fixed-geometry.json`, passed=true). none 시각 반복4/4도 통과했다. threshold0.2/maxDiffPixels100/30초/retries0/mask없음을 유지했다.
- 최종 production S24 전체26/26, unexpected/skipped/flaky/runner errors0, 실제 snapshot policy none 통과 (`tmp/s24-browser-final-clean.json`). 신규4PNG는 fixed baseline 생성 후의 SHA256과 최종 비교 후 SHA256이 모두 같다 (`tmp/s24-visual-hashes-final.json`).
- Chromium/Pixel5 프로젝트의 주 context를 검증했다. fresh newContext의 ZIP import와 file:// offline 검토는 desktop defaults이며 실기기나 모든 context가 Pixel5라는 주장을 하지 않는다.
- 최종 E2E fixture helper를 포함한 전체 typecheck exit0, 세 전용 test/fixture TS의 ESLint/Prettier exit0. 제품 소스는 CP2 production build 뒤 바뀌지 않았다. 지금 CP2 구현·검증·review 문서를 push한 뒤 기존 대표20건 및 전체 Vitest/golden/품질/보존을 수행한다.
