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
| CP3 | 수치·보존·완료 후보 | 전체 Vitest, 필수 browser, catalog/Learn/inventory/policy/secrets/typecheck/build | 대기 |
| STATUS | 별도 완료 상태 | 구현 원격 확인 뒤 최종 검증·status push/hash | 대기 |

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
- 정상 production `tmp/S16-cp2-playwright.json`: **74/74** (desktop37 + Pixel5 emulation37), 단일 연속 500.509초, 실패/skip/flaky/retry/runner 오류 0, snapshot update=none. 새 field 전체 50개와 기존 Lab 전체 24개를 포함한다.
- 새 PNG 16개를 직접 검토했다. 두 theme의 heatmap과 ensemble 평균/산포, FK의 정적 경계와 pinning, ring ω²/SI 독립 진단, library와 유지된 mock에 대해 줄바꿈·overflow·caption·모바일 축/단위 설명을 확인했다. 기존 PNG는 수정하지 않았다.
