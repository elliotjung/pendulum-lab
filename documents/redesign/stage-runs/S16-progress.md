# S16 확률·FPUT·격자·장 실행 기록

## 기준과 범위

- 요청: 16단계 실행. 저장소의 여섯 authoritative 문서를 전체 읽었다.
- 기준 local/remote HEAD: `64db09a7ec6b433b7f6d1b0cac1ee2f1d1590439`, `codex/redesign`, upstream 일치. fetch 후 ahead/behind 0/0, 사용자 변경 없음.
- 의존 S15: 원격 status commit `64db09a`, CP0~CP3와 validated S15 verification, network adapter/UI/tests 산출물을 확인했다. S01~S15 연속 완료, gate 승인 [7,9].
- `redesign:check`, `redesign:preflight -- 16` 통과. Git FETCH_HEAD 쓰기와 스크립트 Git 자식 실행은 sandbox에서 차단되었으나 동일 명령의 확장 권한 실행으로 성공했다.
- 모델 선택 UI는 런타임에 노출되지 않아 실제 선택값을 검증하거나 변경했다고 주장하지 않는다. 기록된 사용자 선택을 전제로 진행한다.
- 목표: native stochastic/FPUT/lattice/sine-Gordon/FK 연결, seed 관리, 공간 heatmap, ensemble 요약과 provenance, 경계·격자 설정, bounded downsampling/export.
- 제외: S17 이후, 일반 ensemble/sweep queue(S21), 새 Learn 단원, app cutover, master merge/release, 기존 엔진 재작성.

## 보존 계약

- `app.html`, `src/physics`, `src/chaos`, `src/research`, `src/runtime`, `src/workers`, `src/validation`, `src/lib`, 공개 API·데이터·기존 저장·공유 형식·golden·package/lockfile을 보존한다.
- 새 product adapter/worker만 추가하고 native 계산을 호출한다. 기존 canonical schema와 단위 allowlist를 보존하며 모델 전용 maps에 version과 normalized convention을 기록한다.
- 격자의 기존 조화 분산과 FK의 기존 정적 kink relaxation을 실제 native 경계 그대로 표시한다. 일반 FK depinning 시간 solver가 있다고 주장하지 않는다.
- 새 저장 namespace를 사용하고 손상·미래 버전 원본을 덮어쓰지 않는다. raw 적분 표본과 시간 downsample된 보관 표본을 명시적으로 구분한다.

## 내부 checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록·activeStage | plan/preflight/typecheck | 완료 |
| CP1 | native adapter·canonical·bounded worker | seed/native parity, continuum/lattice, boundaries, resource/cancel/error, typecheck | 완료 |
| CP2 | 전용 Lab·seed/grid·heatmap·ensemble·files | model/storage tests, production build, desktop/mobile/keyboard/axe/visual | 완료 |
| CP3 | 수치·보존·완료 후보 | 전체 Vitest, 필수 browser, catalog/Learn/inventory/policy/secrets/typecheck/build | 완료 |
| CP4 | 전체 검사에서 발견한 route fixture 개수 보강 | routes/contracts/catalog, typecheck/lint, 전체 재검증 | 완료 |
| STATUS | 별도 완료 상태 | 구현 원격 확인 뒤 최종 검증·status push/hash | 검증 성공·이 commit의 원격 확인 뒤 완료 |

## 변경 예정 경로

- `src/product/adapters/physics/field*`, `tests/product/adapters/physics/field*`, `tests/product/contracts/field*`
- `src/product/lab/views/field-*`, `src/product/app/views/field-lab.ts`, application route, extended catalog, library 안내, `css/product/field.css`
- `tests/product/lab/field-*`, `e2e/redesign/field-pendulum*`
- `scripts/redesign/measure-field-numerics.ts`, `documents/redesign/field-lab-ko.md`, `stage-runs/S16-*`, `status.json`

## 위험·검토·원격 증거

- 공간·시간 이산화, 유한 ensemble 표본, native FK Newton 비수렴 가능성과 격자의 조화 극한을 제품·문서에 명시한다.
- 메모리/격자/ensemble/steps/표본을 제한하고 worker 요청 사이 취소와 마지막 유효 상태 보존을 검증한다.
- S16 사용자 review gate는 없다. 사람 과학 검토를 수행했다고 표시하지 않는다. 기존 보안 감사 미해결 항목을 해결·수용했다고 주장하지 않는다.
- checkpoint마다 명시적 경로만 stage/commit/push하고 원격 hash 확인 후 다음 checkpoint로 간다. 최종 status 전 nextStage=16 유지.
- CP0 code baseline `64db09a`를 ignored `tmp/s16-cp0-baseline`에 Git archive로 추출하여 기존 typecheck를 통과했다. 병렬 작업 중인 미완성 신규 모듈 때문에 live tree 첫 typecheck는 missing-module 오류로 끝났으며, CP1/CP2 공개 전에 전체 live tree typecheck를 다시 요구한다. CP0에는 문서/status만 포함한다.
- 두 desktop 전달 사본은 원본 roadmap SHA256 `1d46e04691d4119ced60dacb41945c75d9d1a20f66cbaed2b3664909f47f8995`, execution `803b191496edd95ebf2199a8983b920058109bb159d55f8bafeb0737fa735fc5`와 일치한다. 두 원본 계획 파일은 수정하지 않는다.
- CP0 `ce4aad493f3d410894f66732e9c1edbfb44042d4` commit/push 성공, `git ls-remote` 정확한 원격 hash 일치.
- native 조사의 결과 격자는 `ringPhononDispersion`의 모드 ω², FK는 정적 Newton kink를 연결한다. S16 카탈로그의 diatomic dispersion, Peierls–Nabarro barrier, Arrhenius MTTF 진단도 별도 bounded 설정 패널로 연결한다. 일반 depinning solver나 동적 격자 수송으로 오인하지 않게 표시한다.

## CP1 검증

- `tmp/S16-cp1-vitest.json`: adapter/worker/전용 canonical 계약/catalog 전체 **127/127**, 8파일, 실패·pending 0. 기존 catalog baseline 134개 참조는 보존하며 새 FK 제품 경로만 별도 확장한다(현재 전체 135개 정의/35개 시스템).
- 전체 live tree typecheck `tmp/S16-cp1-typecheck.log`, CP1 TS 13개 scoped ESLint `tmp/S16-cp1-eslint.log` exit0. 개발 중 신규 파일의 타입 좁히기와 numerical script 배열 타입 오류는 공개 전에 수정했다.
- FPUT 상태·에너지·조화 모드, SG fixed/periodic 두 시간층·정확한 재시작, native 확률 drift/Gaussian member stream, zero-noise, ensemble 크기 변경 시 prefix 보존, ring ω²와 정적 FK·최종 gradient norm을 검증했다.
- worker는 64 member/128 grid 취소, 최대 1,001 기록, 64단계 요청·단계 사이 8ms soft budget, 오류/timeout/dispose/잘못된 snapshot과 마지막 유효 상태 보존을 검사했다. endpoint는 dt 정수배 실행 후 설정한 duration으로 정확히 표시하며 fractional native step을 만들지 않는다.
- 새 seed 매핑은 `fnv1a-mulberry32-boxmuller@1`이고 고정 출력 fixture가 있다. native runLangevinEnsemble의 seed 매핑과 다른 새 product 계약이다. 확률 중간 RNG cursor 복원을 주장하지 않으며 초기 설정으로 재실행한다.
- CP1에는 adapter 6개, adapter test 2개, canonical test 1개, 필요한 catalog 및 count/extension 검사와 문서만 포함한다. 화면·정적 진단 패널·browser는 CP2에서 검증·보존한다.
- CP1 `8acbcaa917bdd8b70fac9c6aa0987079d6fb4b63` push 성공, `git ls-remote` 정확한 원격 hash 일치.

## CP2 구현·개발 검증

- seed/ensemble, 격자·경계·초기조건, 공간·시간 heatmap, 개별 궤적/조화 모드, isolated 저장/공유/import, 기록 원본/축약 CSV와 계보 JSON/SVG를 연결했다. 세 독립 정적 진단은 주 실행에서 추정한 값이 아님을 표시하고 설정·단위·native 출처·결과를 별도 JSON으로 보존한다.
- 초기 production Chromium `tmp/S16-initial-playwright.json`: **23통과/1실패**, 24개 기능 여정, skip/flaky/retry 0. 실패는 generic quantity 오류의 role=alert를 잘못 기대한 test locator였다. 실제 aria-invalid를 확인하도록 고치고 별도 CFL 위반을 유효 입력 범위 안에서 검사한다. 실패를 통과로 계산하지 않는다.
- 독립 검토에서 CSV의 결정론적 variance shape, ring ω² 표기, 정적 progress, nominal stride/끝점 의미, 모바일 숨겨진 축의 보완 caption, sparse worker 배열 검사를 보강한다. 기존 engine/허용오차/golden/과거 PNG를 바꾸지 않는다.
- Langevin이 실제 계산으로 승격되어 기존 mock 전용 회귀 여정은 아직 미리보기인 QKR로 옮긴다. test 의도와 모든 assertion을 유지하며 새 시각 이름을 사용해 이전 PNG를 보존한다. S17 기능을 구현한 것이 아니다.
- `tmp/S16-cp2-vitest.json`: 화면 model/storage/edit/독립 진단과 sparse worker 보강 **94/94**, 5파일, 실패·pending 0. worker 희소/상속 index 관련 16개 새 회귀와 canonical/native 기존 검사를 유지한다.
- 전체 typecheck는 sparse 보강 후 재통과했고 CP2 변경 TS 18개 scoped ESLint `tmp/S16-cp2-eslint.log` exit0. Production build/public-artifact audit `tmp/S16-cp2-build.log` 통과.
- 새 PNG 준비는 `tmp/S16-visual-preparation-playwright.json`의 4개와 lead 문구를 정확한 가산 Itô 모델로 좁힌 뒤 `tmp/S16-lead-preparation-playwright.json`의 2개가 missing-snapshot 작성으로 실패했다. 기능 실패가 아니며 성공 검사로 계산하지 않는다. 이번 요청에서 만든 미공개 lead PNG 2개만 다시 준비했다.
- 정상 production `tmp/S16-cp2-playwright.json`: **74/74** (desktop37 + Pixel5 emulation37), 단일 연속 500.509초, 실패/skip/flaky/retry/runner 오류 0. snapshot 설정은 기본값 `missing`이며 이 실행에서 baseline 생성/갱신은 없었다. 최초 기록의 `none` 표기를 정정한다. 후속 명시적 `none` 시각 비교로 다시 확인한다. 새 field 전체 50개와 기존 Lab 전체 24개를 포함한다.
- 새 PNG 16개를 직접 검토했다. 두 theme의 heatmap과 ensemble 평균/산포, FK의 정적 경계와 pinning, ring ω²/SI 독립 진단, library와 유지된 mock에 대해 줄바꿈·overflow·caption·모바일 축/단위 설명을 확인했다. 기존 PNG는 수정하지 않았다.
- CP2 `d278674a0c77ffe5c87703d4b93fdbbfab44d620` push 성공, `git ls-remote` 정확한 원격 hash 일치.

## CP3 완료 후보

- `field-lab-ko.md`에 native 경계, 정규화/SI 진단 구분, seed 계약, SG 초기/경계 효과, 정적 FK, 자원/취소와 기록·축약 의미를 문서화했다.
- 원격 CP2에서 `measure-field-numerics.ts` 재실행: 고정 1e-12 tolerance에서 수치 check **9/9**. native 상태/에너지/통계 차이 0, same-seed 및 member prefix, FPUT dt와 SG mesh 세분화, 두 경계 및 8/32/64 member 취소를 재현했다. 한 기기의 선택 fixture이며 일반 정확성·열평형·연속체 극한 인증은 아니다.
- 수치 script scoped ESLint 통과. `S16-verification.json`은 candidate-complete로 작성하며 아직 status 완료를 표시하지 않는다.
- 필수 browser는 CP2의 정상 field/Lab 74개를 보존하고 공통 shell 34개를 별도로 검증한다. 합계 108개는 두 보고서의 결합이며 단일 108개 실행으로 표시하지 않는다. CP2 이후 제품 source의 의미 변경은 없다.
- 이 후보의 검증·원격 보존 뒤 전체 Vitest와 shell·보존 검사를 완료하고 별도 STATUS를 push한다. nextStage=16 유지.
- `tmp/S16-command-results.json`: 전체 typecheck, 변경 TS 30개 scoped ESLint, source policy, plan, catalog, Learn, inventory, secret pattern, 수치 재현, production build/public-artifact **10/10 exit0**. 최종 전체 Vitest와 shell 결과는 아직 대기 중이다.
- CP3 `fabdb33f910c289ba76255aa3b203b12ab9d63f4` push 성공, 정확한 원격 hash 일치. 깨끗한 동기화 CP3에서 preflight 재통과.

## CP4 전체 검사 회귀 보강

- 첫 전체 Vitest `tmp/S16-first-full-vitest.json`: **3346통과/1실패**, 총3347개·300파일·pending0. 유일한 실패는 공통 routes test가 시스템 수를 S02 당시 34개로 고정한 assertion이다. 새 FK 제품 route를 포함한 실제 수는35이며 모든 route 왕복 loop는 유지한다.
- routes test의 개수35와 명시적인 FK route 포함 검사를 추가한다. 제품 source와 허용오차·golden·기존 test 이름은 변경하지 않는다. 전체 검사는 다시 통과해야 하며 첫 실패 보고서를 보존한다.
- CP2 browser와 최종 production build의 field worker, field JS/CSS, catalog 파일 content hash가 각각 동일함을 확인했다. 따라서 정상 field/Lab74개의 runtime 증거는 그대로 유효하며 이 보강은 test fixture만 변경한다.
- `tmp/S16-cp4-vitest.json`: 전체 공통 contracts/catalog **371/371**, 17파일, 실패·pending0. 라우트 test scoped ESLint와 전체 typecheck `tmp/S16-cp4-typecheck.log` 통과. 이 보강을 먼저 원격에 보존하고 전체 검사를 다시 실행한다.
- CP4 `1aafaf2b4c3e02c31d841727b9b507e06487063d` push 성공, 정확한 원격 hash 일치. 깨끗하고 동기화된 CP4에서 preflight 재통과했다.

## 최종 필수 검증과 STATUS

- `tmp/S16-final-vitest.json`: **3347/3347**, 300파일, 실패/pending/todo0, maxWorkers2, 기존 timeout 유지. 첫 실패 보고서는 별도 보존했고 고친 fixture를 포함한 전체 실행으로 확인했다.
- `tmp/S16-final-playwright.json`: shell **34/34** (desktop17+mobile17), 171.020초, 실패/skip/flaky/retry/runner 오류0. 정상 field/Lab74와 합계 **108개**이며 두 보고서를 결합한 값이다.
- 일반 browser 두 실행의 설정은 기본 `missing`이다. baseline 생성/갱신은 없었고 CP2 원격 보존 이후 PNG 변경도0이다. 최초 progress의 `none` 표기를 바로잡았다. `tmp/S16-frozen-visual-playwright.json`: 명시적 `--update-snapshots=none`으로 중복 시각 case **4/4**, 39.885초, 오류/skip/flaky/retry0. 108에 이 중복4개를 더해 고유 case 수를 부풀리지 않는다.
- 최종 품질10개 모두 exit0. 변경 TS30개 ESLint와 추가 route test1개 ESLint/typecheck를 통과했다. 수치 check9/9, catalog135개 정의/35개 시스템, Learn8과정/86예약/8공개, legacy inventory883파일·broken import/orphan0.
- `tmp/S16-preservation.json`: 기존3220개 test 및 중복 수 모두 보존·127추가·누락0, 보호 engine/API/lockfile/golden 변경0, 과거 PNG160개 byte-identical, 새 PNG16개 직접 검토. 변경하지 않은 Date 거부 fixture의 표시 시각만 좁게 정규화하여 test 이름을 비교했다. 두 desktop 사본의 원본 SHA256 일치.
- known-pattern scan1626tracked/1438text·발견0. 이력/ignored/binary/외부서비스는 범위 밖이다. dependency/CodeQL 기존 위험을 해결·승인했다고 주장하지 않는다. 사람 과학 검토·실기기·다른 browser·screen-reader 음성은 수행하지 않았다.
- `S16-verification.json` phase=validated. CP0~CP4는 모두 origin에 보존했다. 이 문서/status/verification의 별도 STATUS commit을 push한 뒤 정확한 원격 hash를 확인해야 S16 완료다. 다음 유효 단계는 S17이며 이 요청에서 시작하지 않았다.
