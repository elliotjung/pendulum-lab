# S27 — 교육과정 6~8 제작

## 시작과 범위

- 기준 로컬/원격 HEAD: `9cfd9842570cdd3137e3ea866a1266de2585b941` (S26 status).
- Git 루트·worktree·upstream 확인, 무관한 변경 없음, fetch 후 HEAD 일치(0/0).
- 권위 문서 6개와 AGENTS.md 전체 확인. redesign:check 통과. sandbox Git spawn EPERM 이후 동일 preflight27을 확장 권한으로 재실행해 통과.
- S01~S26 연속 완료, 원격 S26 status 및 progress/verification/preservation 산출물과 S15~S24 공용 adapter 이력을 확인한다.
- 목표: 과정6 12개, 과정7 13개, 과정8 12개 단원과 실제 Focus/전달, 전체86단원 색인·용어·참고문헌·추천 경로.
- 범위 밖: S28 migration/parity, S29 cutover, S30 release, master 변경/merge/tag/release 및 Landing 수정.
- 모델 선택 UI는 노출되지 않아 선택값 검증이나 변경을 주장하지 않는다.

## 보존 계약

기존 physics/chaos/research/runtime/workers/validation, native product adapters, public API, app.html, package/lockfile, 수치 golden, 기존 단원과 사용자 저장/공유 데이터를 보존한다. 새 Focus는 공용 계산을 호출하는 bounded adapter이며 별도 운동방정식을 구현하지 않는다. 정확히 지원되는 canonical baseline과 분석만 전달하고 동반 실행/학습 데이터는 결과에 명시한다. 사람 검토를 만들어내지 않는다.

## 내부 checkpoint

1. CP0: 진행 기록, active27/CP0, next27/완료1..26 유지. plan check, 명시적 stage/commit/push.
2. CP1: 공통 S27 authoring/worker/계약 확장, 과정6 12단원·분기/인력권 Focus 및 수치·실패·전달 검증, typecheck/build. commit/push.
3. CP2: 과정7 13단원·네트워크/장/양자 Focus 및 seed/단위/경계·전달 검증. commit/push.
4. CP3: 과정8 12단원·연구/데이터/재현 패키지 Focus 및 비동기/오류/계보·전달 검증. commit/push.
5. CP4: 전체86 ID/route/schema/실험/transfer, 색인/용어/출처/추천 경로, 전체Vitest·golden·typecheck·lint·build·desktop/mobile·keyboard/axe/시각, 보존/문서 hash 증거. commit/push.
6. 별도 status: 구현 원격 존재와 최종 검증 성공 후 lastCompleted27/next28, active null. commit/push 후 live remote hash 확인.

## 변경 예정 경로

`content/learn/course-{6,7,8}/`, curriculum/modules/index, `src/product/experiments/`의 S27 연결과 공통 dispatch, Learn schema/validation/mount/index UI, 관련 tests/E2E/CSS, S27 증거/status.

## 진행과 위험

- CP0 진행 중. checkpoint별 필수 targeted 검증 실패 시 push하지 않는다.
- 유한 branch/grid/표본 실험은 전역 분기/엄밀한 Wada/비국소화 증명이 아니다. 단위·정규화 시간·근사·표본 한계를 단원에 기록한다.
- source-checked는 공용 소스 및 1차 자료 대조로, automated-verified는 실제 fixture로 검증한다. human-reviewed는 미완료다.
- 기존 보안·dependency 부채의 릴리스 판정은 S30 범위이며 이번 단계 완료가 위험 수락을 뜻하지 않는다.

### CP0 원격 및 공통 연결 작업

- CP0 `f2b69c57ef237155aaabac27aac2f6cdaaffdb72` commit/push exit0, live ls-remote 일치. next27/완료1..26 유지.
- S01~S26 별도 status commit 이력과 S26 verification/preservation 존재 확인.
- 공통 연구 Focus 계약에 과정6 연결 중. 기존 S26 경계25/25 통과. 동시 작성 중이던 신규 cascade helper의 구문 오류로 초기 integration suite는 실행 전 transform 실패했으며 통과 증거로 사용하지 않는다 (`tmp/s27-shared-regression.json`). 수정 후 고정된 checkpoint에서 재검증한다.
- 과정별 adapter 조사에서 실제 지원 범위를 확인했다. native 계산과 독립 정규형·해석 근사의 차이, 유한 격자/기간/추정의 한계를 명시하며 엄밀한 인증으로 표현하지 않는다.

### CP1 독립 검증과 보존 어댑터

- 다른 과정 초안이 포함되지 않도록 명시적 CP1 색인을 `tmp/s27-cp1-check/`에 export했다. 기존 node_modules를 junction으로 연결해 실제 build-gate fixture도 검사한다.
- 초기 표적1201통과/5실패: 작성 중이던6.10 중복 block ID와6.2 실패 조건 서술 및 export의 node_modules 연결 문제였다. 이를 수정한 표적185/185가 통과했고 최종 native/content/SI 독립71/71도 통과했다. 초기 실패는 완료 증거로 사용하지 않는다.
- 최종 CP1 타입검사, production build/개인정보 검사, 전체 lint 통과. 포맷 검사에서 신규 E2E 한 chained-call의 재포맷이 필요해 공백만 정리했다.
- 기존 DrivenConfig는 별도 분석을 거부한다. 기존 native API/물리 adapter를 수정하지 않고 새 UI codec `driven-diagnostics.ts`가 검증된 stability-workflow-v1 설정을 보존하고 물리 worker에는 analyses[]만 전달한다. 새25개 전달·저장·worker 테스트가 통과했다.
- 독립 리뷰에서 imported parent artifact의 설정이 현재 실험에 저장되는 경로를 발견해 pendingParent 동안 저장하지 않도록 보완했고 별도 browser 검증을 추가했다. 열기만으로 기본 분석을 저장하지 않는다.
- 과정6 browser 최초 실행은 새 시각 기준 생성 중이다. 새 기준의 최초 missing 기록은 passing evidence와 구분하며 재비교 none 이후에만 checkpoint를 게시한다.

- CP1 browser: production Chromium/Pixel5 최초34기능여정 통과, 신규8 PNG missing 생성 기록8건. 새 그래프를 직접 시각 확인한 뒤 `--update-snapshots=none` 재비교8/8통과, runner오류/skip/flaky0. 원 테스트 timeout/expect/retry/video 설정을 유지했고8개 PNG만 추가했다. 모든42개 고유 case의 최종 성공 증거가 있으며 최종 S27 검증에서는 전체를 다시 실행한다.
- 과정6 12단원의 bilingual 이론·유도·예측/관찰·검사·출처와 shared native 계산이 준비됐다.1→2→4 실제 cascade와 원시P4 잔차/승수, 비영 collocation 불변 원을 검증했다. 사람 검토0/12.

### CP1 원격 / CP2 통합

- CP1 `fd091b4e8555d0e9ed553887327743704a50a52b` commit/push exit0, 실제 ls-remote hash 일치. 완료 목록1..26/next27 유지.
- CP2는 과정7 13단원과 실제 S15~S17 native 연결을 추가한다. 독립 native37/37, 좁은 lint/format 통과.7.11은 유한 평균 비정합·초기 impulse depinning/수송을 실제 native force/Newton/stepper로 비교하며 지속 외력 정상 이동도·무한 Aubry 인증은 주장하지 않는다.

- CP2 독립 표적788/788, 타입검사와 production build/개인정보 검사 통과. 실제 browser에서 network/field/discrete Lab에 출처 단원 복귀 notice가 빠진 UI 연결을 발견해 기존 검증된 Focus notice를 추가한다. 실패 여정은 수정 후 재실행하며 완료로 세지 않는다.

- CP2 수정 후 production Chromium/Pixel5 browser34/34 통과(13개 전수여정×2 + 새시각8), skip/flaky/runner오류0. 새PNG8개 직접 검토 후 none재비교8/8 통과. diagnostic video만 off인 보존된 task-local wrapper를 사용했으며 원본 테스트·30초/5초 한도·retry0·trace/실패스크린샷·threshold0.2/maxDiffPixels100은 유지했다. 이전 복귀 notice 누락 실행은 중단/실패 증거로만 보존한다.
- network/field/discrete workspace에 검증된 공통 출처 복귀 notice만 추가했으며 native physics API·worker와 기존 일반 Lab 시각 경로는 그대로다. 새/변경 연결의 표적 ESLint exit0. 과정7 사람 검토0/13.

### CP2 원격 / CP3 통합

- CP2 `02e344394e8487471cdd4596c04897f835a9d4e7` commit/push exit0, 실제 ls-remote hash 일치. 완료 목록/next27 유지.
- 과정8 12단원을 통합한다. 실제 batch/import/inverse/UQ/data-driven/Krylov/project/ZIP native46/46와 좁은 lint/format 통과. 독립 리뷰의 혼합 RMSE 단위와 DMD/HAVOK spectrum·관측 forcing 누락을 수정했다.
- 비동기 worker dispatch가 이전 동기 API를 유지하고 native Promise 완료/오류를 처리한다. 완료된8.11/8.12에서 실제 검증 ZIP 다운로드를 추가하며 단원 출처와 화면 artifact hash를 보존한다. 무효·변경 입력 또는 dispose 뒤의 저장은 차단한다.

- CP3 초기 표적906통과/3서술 품질 실패를 보존한다. 기존 한계 설명의 제목을 명확히 한37단원 품질112/112 재검증이 통과했다. worker Promise/void 정적 경계도 수정 후4/4 재검증과 표적 ESLint, 최종 타입검사/build/privacy가 통과했다. 수치 기준·허용오차를 완화하지 않았다.
- CP3 production Chromium/Pixel5 36/36 통과:12단원 전수왕복24 + 새시각8 + 실제ZIP/실패복구/offline reviewer4. 추가 stale ZIP(무효입력)2/2, none재비교8/8, 중복단위 표시 정리 후 DMD/HAVOK4/4 생성·none재비교4/4도 통과. skip/flaky/runner오류0, 원래 제한·assertion 유지 및 video만 off. 모든38개 고유 case의 성공 증거가 있다.
- 결과 보고서 artifact SHA와 실제 다운로드 ZIP의 원 run/단원 canonical 출처가 일치한다.8.12는 실제 notebook/figure/report/offline reviewer 파일을 포함한다. 사람 검토0/12.

### CP3 원격 / CP4 전체 교육과정 마감

- CP3 `43add2ac45424cfabaeacb71d7196d5e5bad632b` commit/push exit0, 실제 ls-remote hash 일치. next27/완료1..26 유지.
- 전체86단원 실제 실행·schema·route·canonical·share·Lab 전달을 하나의 독립 census로 검사하고,94개 용어·중복 URL을 합친 참고 문헌 색인·3개 추천 경로를 완성한다. 색인은 펼칠 때만 콘텐츠를 읽으며 progress/권한을 변경하지 않는다. 취소/실패 재읽기/dispose 뒤 toggle/빈 검색을 검증한다.
- 최종 전체 Vitest/golden/typecheck/lint/format/build 및 original Chromium/Pixel5 86개 실제왕복·전수route/접근성·기존분석/시각 회귀를 실행하고 Git blob 보존·기존PNG·전달본 rawSHA를 감사한다. 모델selector/사람검토/실기기나screen-reader음성 검증을 가장하지 않는다.

- CP4 전수 census88/88 통과(86개 실제 shared 실행 + publication/index 계약2). canonical의 엄격한 SI/JSON/서명0 계약과 정확한 share/transfer 비교를 유지했다. 신규 색인의 optional signal 인자 타입 오류1건은 수정 후 typecheck exit0.
- CP4 전체 format:check/lint exit0, production build/privacy exit0. 새 색인 browser 최초6통과/2실패는 보류한 route를 unroute로 정리하던 테스트 harness 경쟁이었다. pending handler를 wait하도록 수정 후8/8 통과, skip/flaky/runner오류0. 제품 계산이나 assertion/시간한도를 완화하지 않았다. 최초 JSON과 수정 후 JSON을 구분 보관한다.
- 학습 홈의86공개/추천경로 표시로 의도된 기존PNG4개만 갱신한다. 과정1/단원1 PNG와 나머지 기존 시각 기준은 변경하지 않는다. 새로운 보존 helper는 Git blob 동일성과 raw desktopSHA를 구분하며 기존 product 분석 adapter도 보호한다.

- CP4 홈PNG4개를 직접 검토했다. original Learn 시각4/4가 갱신 및 none재비교 모두 통과했고 과정1/단원1 PNG는 unchanged다. CP4 known-pattern tracked secret scan exit0. 구현 checkpoint 검증 완료, 전체 최종 검증과 별도 완료 status는 아직 남아 있다.

### CP4 원격 / candidate-complete 검증

- CP4 `3d34cde8980f7ca0c7f1b38e994eb323dc09d0f8` 일반 push exit0, ls-remote exact match, 게시 직후 clean tree를 확인했다. 완료1..26/next27을 유지했다.
- 상태: candidate-complete, 전체 필수 검증 대기. 제품/테스트/스크립트 소스는 위 commit으로 고정한다. 이후 evidence/status 문서만 바뀌는지 Git으로 다시 검사한다.
- 원본14개 spec의 지정 grep는 프로젝트당142개, Chromium/Pixel5 합284개를 선택한다. 실제86단원왕복×2=172개를 포함한다. full Learn17개와 S27전체/ZIP/색인, 기존11+12+11종 분석 실행·정확한handoff·network/field/discrete 시각 회귀를 포함한다. 이전 과정 전용 시각 전부를 재실행했다는 뜻은 아니다.

- 고정 CP4 소스의 최종 전체 Vitest는370개 파일6239/6239, pending/failed0으로 통과했다. explicit golden13/13도 통과했다. plan/catalog/learn/inventory/typecheck/lint/format/build8개 명령은 전부 exit0, build privacy22text/1binary-skip 통과다. source-pinned 카탈로그135개(35systems/51analyses/21integrators/28aux)와86개 공개 단원 계약이 통과했다.
- 검토 metadata 추출:86schema/86automated/86source-checked/0human,37신규단원도0human. 인용184건/고유URL131개, pinnedGitURL75개 object 존재,94용어/3추천경로. 이번 추출은56외부URL을 모두 재접속한 검사가 아니다. 새 자료 대조 근거는 과정별 보고서에 남긴다.
- 사전 보존 감사:404/404보호파일 동일, 기존tests/fixtures451/457동일(6개 publication/negative fixture 보강만 변경), PNG256/260동일(허용 홈4개만 변경), desktop두 전달본 rawSHA 일치. 최종 evidence stage 뒤 재감사한다.

### CP4-E 최종 증거 — 전체 필수 검증 통과

- 원본 production Chromium/Pixel5 단일 실행284/284 통과(각142), skip/flaky/failed/runner오류0. 실제86단원왕복×2=172개와 각17개 full Learn, S27전체/색인/실제ZIP, 기존11+12+11종 분석/정확한handoff/장·양자·네트워크 시각 회귀를 포함한다. 시작2026-11-05T01:15:25.040Z, duration2129020.422ms. final none 비교에서24새PNG와4의도된 홈PNG를 포함한64회 시각 assertion을 수행했다. 이전 모든 과정 전용시각 전체 재실행을 주장하지 않는다.
- 단일 원본 실행은1worker/retry0/max-failures1/snapshot none이다. wrapper는 진단 video만off이며 원본 테스트·30초기본/5초expect/기존60·90초 한도·trace/실패스크린샷·threshold0.2/maxDiffPixels100을 유지한다. Pixel5는 emulation이며 실기기/Firefox/WebKit/screen-reader음성 인증은 하지 않았다.
- 최종 전체6239/6239(370files), explicit golden13/13, quality8명령 모두 통과했다. 신규7testfiles346개는 native117(34+37+46), worker4, handoff25, 콘텐츠112, 전체census88로 구성되며 이 수를 전체6239에 다시 더하지 않는다. source는 remote3d34cde 그대로이며 이후 evidence/status만 수정한다.
- sourceChecked/automated86, human0/86이다. finite branch/grid/sample/time, 독립 정규형/선형화 밀도/finite impulse chain/N8QKR/관측 forcing/ZIP authenticity 한계는 각 단원과 과정 보고서에 유지한다. native engine/API/기존저장·공유/사용자 원본 데이터는 보존한다.
- 기존 default-branch push notice26건(high15/moderate8/low3)은 유지되며 package/lockfile 변경·새dependency audit·위험수락·릴리스 인증은 수행하지 않았다. S24 attachment authenticity/direct offset-Buffer SHA helper 한계도 그대로다.
- 복구 기준은 S26status `9cfd9842570cdd3137e3ea866a1266de2585b941`와 unchanged `app.html`이다. 기존 진입점을 계속 사용하거나 별도 worktree에서 이 기준을 검증해 복구할 수 있다. 현재 사용자 working tree를 reset/clean하지 않는다.
- 이 CP4-E는 evidence 저장 checkpoint이며 status의 완료1..26/next27을 아직 유지한다. 최종 보존·secret·source equality·clean preflight를 확인하고 별도 완료 status를 push해야 S27 완료다. 다음 유효 단계는 그 이후 S28이다. migration/parity/cutover/merge/tag/release/Landing 변경은 없다.

- 최종 보존 감사404/404와desktop rawSHA2/2가 통과했다. 기존test451/457·PNG256/260동일 및6개 metadata/fixture·4개홈PNG만 의도된 차이다. 검증JSON을 추가한 tracked known-pattern secret scan은1884text/0finding이며 최종 staged파일을 commit 전 다시 검사한다. 검증소스3d34cde 대비 non-control diff0을 확인했다.

### CP4-E 원격 / 별도 완료 status

- CP4-E `2f4c806bf8685f8a3d6a0d6c620082c07b568ec7` commit/push exit0, live ls-remote exact match. 당시 clean tree에서 `redesign:preflight -- 27` 및 plan check exit0을 확인했다.
- 고정 소스3d34cde 이후 변경은 S27progress/preservation/verification/status 네 control 문서뿐이다. required test 실패·남은 필수 구현은 없다. S27은 human review gate가 아니며 사람/전문가 검토0/86을 유지한다.
- 로컬 완료 status 후보는 lastCompleted27/next28/완료1..27/active null이다. 이 별도 status commit을 일반 push하고 live origin hash와 일치함을 확인하기 전까지 원격 완료로 주장하지 않는다. status와 최종진행 기록을 검사한 뒤 게시한다.
