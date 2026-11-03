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
| CP2 | lazy 연구 workspace·notebook·figure·report·offline reviewer | component/production desktop/mobile/keyboard/a11y/visual, build | 완료·원격 확인 |
| CP2-I | frozen inventory exact projection | 기존7+신규14, inventory check/typecheck | 완료·원격 확인 |
| CP2-L | batch/model 중첩 계보·분류 연결 | backend94, 새 source4+시각2, build/typecheck | 완료·원격 확인 |
| CP3 | 통합 회귀·보존·재현 패키지 및 review 증거 | 전체 Vitest/golden/품질 검사/보존 hash | 완료·원격 확인 |
| STATUS | 별도 완료 상태 commit | 구현 원격 확인 후 status push 및 정확한 remote HEAD | 별도 commit 생성·push 확인은 종료 보고 |

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

### CP2 원격과 CP3 완료 후보

- CP2 `8dbadccdb3b811d8db4a366b8e22a5e1200c0bd2` push exit0 및 정확한 ls-remote hash를 확인했다. 모든 제품 구현이 원격에 있고 소스 변경은 없다. status는 next24/완료1..23을 유지한다.
- 후보 상태: candidate-complete. 기존 S18–S23 대표와 기존 reviewer console의 production20건, 전체 Vitest/golden,10개 품질 명령, 원본 보존 및 재현 패키지 검증을 수행한 뒤에만 별도 완료 status commit을 만든다.

### CP3 전체 회귀에서 발견한 inventory 연결

- 첫 전체 Vitest는5458/5459,349files 중 S01 inventory baseline 동일성1건만 실패했다 (`tmp/s24-full-vitest-before-inventory-projection.json`). 기존432test/fixture·220PNG·286보호 파일은 바이트 동일했고 실제 제품 여정26건과 기존 대표20건은 통과했다.
- 원인: 새 src/reviewer/project.ts/project.css 및 main.ts의 정확한 S24 route/nav 추가가 frozen legacy inventory에 포함됐다. baseline JSON/MD·기존 characterization test·golden을 수정하지 않는다. S04/S22의 엄격한 projection 방식처럼 S24의 정확한 추가분만 scanner에서 분리하고, 기존 콘솔의 다른 변경·변조 route/nav·알 수 없는 reviewer 파일은 계속 탐지하는 새 회귀 검증을 추가한다.
- 기존 대표20건의 최초 실행은19pass/1timeout이었다. Pixel5 advanced12의 모든 계산/복원 assertion 뒤 마지막 axe page 시작에서30초 제한에 도달했다. 기존 test·timeout·retry는 유지하고 별도 로그/trace로 보존했다. 깨끗한 동일 재실행20/20에서 해당 case20.5초, unexpected/skipped/flaky/runner errors0을 확인했다 (`tmp/s24-browser-regression.json`).
- harness 보강도 별도 검증·commit·push한 뒤 원격 구현 HEAD를 기준으로 예제/보존/전체 Vitest/품질/최종26여정을 다시 확정한다. 필수 실패를 완료로 표시하지 않는다.

### CP2-I — 고정 inventory에 대한 정확한 추가 UI projection

- scripts/redesign/inventory.ts에서 main.ts의 정확한 승인 nav3줄과 정확한 lazy wrapper만 기존 호출로 투영한다. 새 project.ts/project.css 두 파일만 additive 범위로 분리한다. 다른 reviewer 파일·변조·새 코드·바뀐 route/import/label/fetch는 그대로 fingerprint/AST에 남는다.
- 기존7+신규14=21/21 통과. 실제 S01 main SHA와23583bytes가 LF/CRLF에서 동일하고, 전체 frozen inventory JSON/MD도 원본 그대로 재현됐다. baseline 파일·기존432test/fixture·raw reviewer를 수정하지 않았다. 전용 lint/format 및 전체 typecheck exit0이다.
- inventory:check는 sandbox esbuild child EPERM을 동일 검사의 확장 권한 실행으로 해결했다. 최종 exit0:883files/6825facts/2548imports, errors/orphans/broken imports0. 새 헬퍼가 기존 변경 탐지를 약하게 만들지 않는 변조 검증을 포함한다.
- 이 검증 보강도 별도 원격 checkpoint로 먼저 보존한 뒤 candidate-complete 전체 검사를 다시 수행한다. 제품 runtime 소스와 기존 browser baseline은 CP2와 같다.

### CP2-I 원격 확인과 최종 재검증

- CP2-I `55f446324a542431e2ee9e7dc6ebe7ff82fb38cd` push exit0 및 정확한 ls-remote hash 확인. 제품 runtime은 CP2와 같으며 모든 구현·검사 adapter가 원격에 있다. 이후 source 수정 없이 candidate-complete 전체 검사를 다시 확정한다.
- 전체 Vitest는 두 legacy AST inventory 스캔의 메모리/CPU 경합을 줄이기 위해 --maxWorkers=1로 모든 파일을 실행한다. 기존 testTimeout30초·assertion·fixture·golden은 그대로 유지한다. 대상 축소나 retry 완화는 없다.

### CP3 추가 계보 경계 재현

- inventory 보강 후 전체 Vitest5473/5473,350files, 실패·pending0을 확인했다. 이 결과는 중첩 계보 보강 전 상태이며 `tmp/s24-full-vitest-before-nested-lineage.json`에 보존했다.
- 추가 독립 검토가 유효한 S21 batch.plan.source와 S23 learning request.input.data.provenance.experiment의 불일치가 선택한 run 비교에서 빠지는 경우를 재현했다 (`tmp/s24-nested-lineage-repro.json`). 파일 자체 검증과 원본 bytes는 정상이나 source 연결을 잘못 인정할 수 있어 수정한다.
- typed native parser의 검증된 반환값에서 schema별 원 실험과 native ID를 명시적으로 읽는다. batch의 plan/source ID, 학습 데이터의 선언된 canonical 실험을 비교하고, checksum을 재작성한 잘못된 wrapper도 거부하도록 검증한다. 일반 provenance metadata를 임의 canonical로 승격하지 않아 기존 파일을 보존한다.
- 원 실험을 비교할 수 없는 관측·외부 학습·연산자 첨부는 사용자 분류 연결이며 해당 run의 계산 결과를 인증하지 않는다는 설명을 명시한다. 새15case·양쪽 project 총30건의 UI 검증에 mismatched/matching batch·model을 추가하고 기존13case는 유지한다. 실제 source 수정 뒤 전체 필수 검증도 다시 실행한다.

### CP2-L — 중첩 source와 명시적 분류 연결

- 유효 native7종의 parser 반환 타입에서 각 원본/ID를 명시적으로 추출한다. S21 plan.source/id/sourceInputId와 S23 learning provenance의 선언된 canonical 원본도 selected run과 비교한다. 일반 provenance의 문자열/다른 namespace 객체는 원본 그대로 유지하고 분류 연결로 명시한다.
- 신규16건을 포함한 backend+ZIP94/94 통과. parameter/seed/runtime 불일치, metadata native ID 변조, config·모든 외부 checksum까지 재작성한 잘못된 wrapper를 거부한다. source가 없는 관측/외부 학습/eigen 또는 설정 없는 run의 연결은 계산 결과 인증으로 표시하지 않는다.
- 전용 lint/format·전체 typecheck·production build exit0. 실제 g9.81/g9.7 batch와1.59초160표본 DMD의 UI4/4가 양쪽 project에서 원30초/retries0/none으로 통과했다 (`tmp/s24-browser-nested.json`). g9.7은 거부·이전project보존, 일치하는 g9.81은 native ID와 원본 bytes를 유지했다.
- 이번 checkpoint는 새 source4건+영향받은시각2건 표적을 통과한 후 push한다. 전체30건은 원격 patch HEAD의 완료 후보 전체 검증에서 실행한다. 실제 help문구변경으로 신규4PNG만 명시 갱신하고 기존220PNG는 보존한다.

### CP2-L 표적 검증 통과

- backend/ZIP 표적94/94를 root에서도 재실행해 JSON 증거를 확보했다 (`tmp/s24-nested-targeted.json`). source7종의 typed 원본/ID 추출과 새16건을 포함하며 실패·pending0이다.
- 새 source4건+시각2건 총6/6 production 통과, actual snapshot none/원30초/retries0/skip·flaky·runner errors0 (`tmp/s24-browser-cp2-lineage.json`). 실제 help문구 변경 후 새4PNG의 refresh 직후와 none 종료 SHA256도 같다 (`tmp/s24-visual-hashes-nested-cp.json`).
- 전체 typecheck·production build, 변경 backend/test/E2E의 전용 lint/format 및 panel lint 모두 exit0. 기준선·기존432test/fixture·220PNG·순수엔진/API에 변경이 없다. 이 patch를 원격에 보존한 뒤 마지막 전체 Vitest/품질/30여정을 실행한다.

### CP2-L 원격 확인과 완료 후보 전체 검사

- CP2-L `3f1dcfb` push 성공 및 정확한 원격 HEAD 확인은 아래 최종 증거와 종료 보고에 포함한다. 모든 제품/검사 구현이 원격에 있고 이후 source/기존test/PNG는 고정한다.
- candidate-complete를 다시 확정한다. 최종 전체 Vitest는 --maxWorkers=2로 CPU 경합을 제한하며 원래30초·모든 assertion·fixture를 유지한다. 전 단계의 단일worker5473건 결과는 보강 전 증거로 구분한다. 최신 source의 전체 단위·golden·10개 품질 명령·30개 사용자 여정·보존 해시가 통과해야 완료 상태를 만든다.

## CP3 최종 통과 증거

- 최종 구현 commit `3f1dcfb067c70fc63ad982abcf3d17bac647265b`와 origin tracking/실제 remote hash를 확인했다. 이 뒤 제품·검사 source 및 PNG는 바뀌지 않았다.
- 최종 전체 Vitest5489/5489,350files, 실패·pending0, maxWorkers2와 원testTimeout30초 (`tmp/s24-full-vitest-final.json`). S23 대비 신규107건이다. Golden13/13, 원 checkpoint 표적126/126, 중첩 계보 표적94/94 및 inventory21/21이 통과했다. 신규14 inventory 검증과16 nested 검증은 최종 전체에도 포함된다.
- 최종 source의 typecheck, lint(policy+ESLint), format:check, plan/catalog/Learn/inventory check, module audit, known-pattern secrets, production build 총10개 명령이 모두 exit0 (`tmp/s24-quality-final.json`). 알려진 비밀 패턴0건이며 history/ignored/binary/외부 서비스/임의 password는 제외다. 최종 증거 JSON들을 stage하기 전 tracked text 범위이며 새 dependency audit/보안 부채 수락이 아니다.
- 최종 post-push production S24 30/30, unexpected/skipped/flaky/runner errors0, 실제 snapshot none, 원30초/retries0 (`tmp/s24-browser-final-clean.json`). batch/실제160표본 DMD의 불일치 거부와 일치 원본 채택, 실제 legacy exporter의 원 ZIP+모든 멤버 보존, 다중 시스템 내부 왕복, fresh-context round trip, file:// offline no-network/no-script, 오류·취소·키보드·320px·200%zoom을 포함한다.
- 기존 대표20/20은 CP2 build에서 통과했다. 이후 수정은 project 계보/설명과 inventory guard에 한정되며 기존 도구/콘솔 source는 그대로다. 최초19/20의 마지막 axe page-start timeout, 초기 UI/Buffer/missing baseline/시각 원인 진단은 각각 별도 이전 로그로 보존한다. 최종 통과로 덮어 설명하지 않는다.
- 최신 help문구 기준 새4PNG의 최종30 직전/직후 SHA256이 모두 같다 (`tmp/s24-visual-hashes-final.json`). 최신 표적6과 최종30의 두 독립 context에서 geometry/font/DPR도 같았다 (`tmp/s24-visual-fixed-geometry.json`, passed=true). 기존220PNG는 별도 보존 검사에서 모두 같으며 threshold/mask/timeout/retry를 완화하지 않았다.
- 바이트 보존: protected286/286, 역사 test/fixture432/432, 기존 PNG220/220, desktop 전달본 두 SHA256 일치, mismatches0 (`S24-preservation.json`). physics/chaos/research/runtime/workers/validation/physics adapters, 공개 API, 기존 app.html·저장/공유, package/lockfile·원 계획과 golden은 바꾸지 않았다.
- 제공 예제 `S24-example.zip`:115224bytes, 실제 기존 엔진2runs·6artifacts·2figures·notebook1, 원본 bytes 및 project round trip 동일. SHA256 `5fc04915b220840b92fcf4ef07c1dce2e5af12672329915d5d942682376f4606`; sourceHead는3f1dcfb이며 각 멤버의 독립 Node SHA256은 `S24-example-manifest.json`에 있다. 고정 예제 시각은 실행 시각과 구분했다.
- S24-verification.json에 모든45개 변경 경로와 source/원 로그 SHA256, 각 실제 실행 조건·실패 이력·보존·보안/검토 한계를 기록했다. 이것은 최종 status push의 증명이 아니며 원격 status commit이 완료의 권위다.
- 사용자 gate 승인 목록은 [7,9,17] 유지, S24 검토는 대기다. 사람의 과학 검토·실기기·Firefox/WebKit·screen-reader audio 인증은 하지 않았다. 기존 dependency/CodeQL 부채, legacy SHA helper의 직접 offset-Buffer 제약, 큰 파일 한도와 native 과학적 가정은 review 문서에 남긴다. 신규 package 경계는 Buffer를 정규화한다.
- 복구 기준은 S23 status e6aa709와 보존된 app.html이다. S25 이후 교육 콘텐츠, S28 full parity/migration, cutover, master merge/force push/tag/release는 실행하지 않았다.

## 별도 완료 상태 gate

- CP3 evidence `804c481b0d5088cccb282f55edd471cfe077b37f` push exit0 및 정확한 원격 HEAD를 확인했다. 모든 source/증거/재현 ZIP이 원격에 있는 clean tree에서 preflight24와 plan check가 exit0이다.
- 마지막 변경은 progress/status 두 파일이다. 검증된 결과를 바탕으로 lastCompleted24/next25/completed1..24, blocked/active/checkpoint null을 기록한다. 승인 gate[7,9,17]과 실행 프로필은 유지하며 S24 사용자·전문가 검토를 완료로 표시하지 않는다.
- 이 별도 status commit을 push하고 실제 origin/codex/redesign HEAD가 같은 commit임을 확인한 뒤에만 S24 완료를 보고한다. source 변경·master merge·force push·tag·release·S25 구현은 없다. 다음 유효 입력은 S24 review 확인 뒤 “25단계 실행해줘.”이며 그 요청이 workflow 승인 기록이다.
