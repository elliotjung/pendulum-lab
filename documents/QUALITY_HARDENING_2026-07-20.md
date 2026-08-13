# Pendulum Lab 비-UI 품질 강화 보고서 (2026-07-20)

범위: 물리·혼돈·연구·런타임 코어, 워커 경계, 수치 예산, PWA, 보안 헤더, 빌드·배포 워크플로. UI DOM 구현과 `tmp-trace-*` 로컬 산출물은 수정하지 않았다.

아래 항목은 모두 이번 변경에서 구현되고 자동 회귀 검증으로 고정된 완료 항목이다. 번호는 통합 프로젝트 보고서와 충돌하지 않도록 106부터 시작한다.

| 번호 | 문제 | 조치 | 근거·검증 |
|---:|---|---|---|
| 106 | Main Pages가 ignored JSON restore로 실패하거나 별도 Mainline 과학 gate와 무관하게 배포될 수 있었고, landing은 custom Pages의 smoke가 실패해도 legacy builder가 같은 SHA를 실제 배포 | main은 tracked-only drift와 성공한 `Mainline Full Validation`의 정확한 SHA·branch 직렬화로 고정하고, landing Pages source를 API에서 `workflow`로 전환해 legacy 우회 경로를 폐쇄 | main workflow 계약; landing custom run 29729678823의 deploy skipped와 legacy run 29729677975/deployment 5519188254의 우회 증거; Pages API `build_type=workflow` 재조회 |
| 107 | Mainline에도 같은 ignored-report restore 실패가 존재 | Mainline gate를 tracked drift 검사로 교체 | workflow 계약 테스트 |
| 108 | PR CI에도 같은 clean-checkout 실패가 존재 | CI gate를 tracked drift 검사로 교체 | workflow 계약 테스트 |
| 109 | Release 검증도 동일 pathspec에 의존 | Release gate를 tracked drift 검사로 교체 | workflow 계약 테스트 |
| 110 | npm publish 검증도 ignored 파일을 복원 | npm publish gate 수정 | workflow 계약 테스트 |
| 111 | JSR publish 검증도 ignored 파일을 복원 | JSR publish gate 수정 | workflow 계약 테스트 |
| 112 | Cloudflare 배포도 ignored 파일을 복원하고 header probe가 매달릴 수 있었으며, 보안 수정용 `sharp` override가 phantom transitive import와 Miniflare exact dependency에 기대 실제 Images 경로 호환성·설치 script 신뢰가 불명확 | tracked-only drift와 bounded probe를 적용하고 Miniflare 4.20260721.0/sharp 0.35.3을 direct exact devDependency로 승격했으며, reviewed esbuild/workerd만 `allowScripts`에 고정하고 Images transform E2E를 primary `verify`에 추가 | main/landing workflow 계약; sharp 0.35.3·libvips 8.18.3, 2×2→4×3·100-byte transform smoke; pending install scripts 0 |
| 113 | 같은 배포 버그가 다시 복사될 위험 | 7개 workflow를 순회해 restore/checkout을 금지하는 정적 회귀 테스트 추가 | 7개 매개변수 테스트 통과 |
| 114 | ignored 산출물과 tracked drift의 책임이 불명확 | Pages workflow에 `git diff`가 tracked 파일만 본다는 근거 주석 추가 | Prettier YAML 파싱 통과 |
| 115 | 정기 evidence payload와 tag-release payload의 `sourceCommit`을 sender에서 검증하지 않아 잘못된 provenance가 원격 gate까지 전달될 수 있음 | 두 dispatch 경로 모두 full 40자리 Git SHA를 fail-closed 검증하고 release 경로는 lowercase까지 강제 | scheduled/tag-release workflow 계약 테스트 |
| 116 | 양 저장소의 evidence dispatch·raw fetch·release run 탐색/상태 polling이 네트워크 응답 없이 장시간 매달릴 수 있음 | main dispatch/poll과 landing sync/release fetch 전부 retry-all-errors, connect 10초, 요청당 총 60초로 제한 | main workflow 계약, landing 정적 workflow 계약과 shell syntax 검사 |
| 117 | dispatch secret 누락 진단이 약화될 회귀 위험 | `LANDING_DISPATCH_TOKEN is required` fail-closed 문구를 계약 테스트로 고정 | workflow 계약 테스트 |
| 118 | mutation instrumentation에서 30초 Vitest 한도가 정상 확률 앵커를 오탐 | mutation 전용 90초 test timeout profile 분리 | 실제 Stryker dry-run 성공 |
| 119 | Stryker 관련 테스트 선택이 암묵적 기본값에 의존 | 두 config에 `related: true`를 명시 | config 계약 테스트 |
| 120 | 특정 사용자 로컬 폴더명이 mutation 설정에 고착될 수 있음 | 일반 정책 `/tmp-trace-*/**`로 제외 | config 계약 테스트; 실제 matcher dry-run |
| 121 | AssemblyScript decorator 소스를 JS mutation parser가 불필요하게 읽어 경고 | `/wasm/assembly/**`를 sandbox 복사에서 제외 | dry-run에 decorator parse warning 없음 |
| 122 | dist·standalone·paper·대형 아이콘과 실행 중 변하는 test/report 산출물을 mutation sandbox에 복사 | 생성·정적·동적 결과 경로 ignore 추가, Playwright `.last-run.json` 삭제 경합 제거 | Stryker ProjectReader가 대상 1/1603 파일만 mutate |
| 123 | 느린 mutant의 false timeout과 무한루프 구분 여유가 부족 | Stryker absolute deviation timeout을 20초→30초로 조정 | 두 config 계약 테스트 |
| 124 | mutation 설정이 실제 CI 러너 경로에서 작동하는지 불명확 | stochastic 전체 소스를 대상으로 `--dryRunOnly` 실행 | 110 tests, 2분 11초, 성공 |
| 125 | matrix SDE scratch 객체를 넘겨도 7개 내부 배열과 resolver 객체를 매 스텝 재할당 | 배열 영속 저장, exact-shape workspace fast path, ensemble prevalidated core를 분리하고 stepper 경계를 `stochasticSteppers.ts`로 추출 | scratch 참조·30초 성능 회귀 테스트; module-size audit |
| 126 | 잘못된 크기의 scratch 배열을 그대로 사용해 범위를 벗어날 수 있음 | 현재 차원과 정확히 일치하지 않는 배열만 안전 재할당 | scratch 경계 구현 및 typecheck |
| 127 | matrix-noise GBM 앵커가 반복 public 검증·할당으로 30초 초과 | direct API 검증은 유지하고 ensemble 내부 core와 1D exact formula fast path 적용 | 실패 앵커 12.681초 통과 |
| 128 | Langevin/Brownian/adaptive state dimension이 무제한 | 중앙 예산에 최대 512차원 추가 | hostile-input 테스트 |
| 129 | sparse/NaN 초기 상태와 callback 결과가 통계 전체를 오염 | initialState·drift·diffusion·prime·결과 유한성 검사, sparse noise callback은 매 평가 전 0 초기화 | hostile/sparse-equivalence 테스트 |
| 130 | 0·subnormal·비유한 dt/totalTime이 무한·무의미 적분을 유발 | ensemble·Brownian grid·adaptive에 공통 `assertUsableIntegrationStep` 및 시간 일관성 적용 | hostile-input suite |
| 131 | 실현 수가 소수·unsafe integer·과대여도 루프 진입 | [2, 1,000,000] safe-integer 경계 | hostile-input 테스트 |
| 132 | step 수가 소수·unsafe integer·과대여도 루프 진입 | [1, 10,000,000] safe-integer 경계 | hostile-input 테스트 |
| 133 | `recordEvery`가 steps보다 클 때 최종 샘플이 누락되거나 extraction 과정에서 기존 기록 계약이 바뀔 수 있음 | positive safe integer를 강제하고 initial·주기 샘플·정확한 final을 중복 없이 기록해 `recordEvery > steps`도 initial/final 두 점으로 정의 | `recordEvery=3, steps=2` 회귀 테스트 |
| 134 | NaN/unsafe seed가 재현성 계약을 훼손 | safe-integer seed 강제 | hostile-input 테스트 |
| 135 | JS 소비자가 알 수 없는 scheme 문자열을 전달 가능 | 네 가지 지원 scheme runtime whitelist | 경계 구현·typecheck |
| 136 | additive diffusion 길이 불일치가 누락 성분을 0으로 위장 | state dimension과 정확히 같은 길이 강제 | hostile-input 테스트 |
| 137 | sparse/NaN diffusion이 NaN 통계를 생성 | 모든 additive coefficient의 소유·유한성 검증 | hostile-input 테스트 |
| 138 | multiplicative/matrix callback이 함수가 아니거나 sparse/NaN 출력을 남길 수 있음 | 함수·finite 출력 검증, diagonal/matrix scratch zeroing, direct step shape·alias 계약 | callback hostile 테스트 |
| 139 | matrix noise dimension이 무제한 | safe integer [1, 512] 한도 | 중앙 예산 및 경계 구현 |
| 140 | ensemble/adaptive/fixed-grid CPU 일이 곱셈 overflow 또는 사실상 무한일 수 있음 | scheme 복잡도와 grid state-step product를 반영한 checked work ceilings | 과대 work 테스트 |
| 141 | mean/M2·Brownian cumulative grid·adaptive recorded states가 과대 할당될 수 있음 | statistic/Brownian/path-output cell ceiling을 할당 전 검사 | 68GB 격자·worst-path 테스트 |
| 142 | 확률 수치 한도가 여러 위치에 흩어지고 absolute tolerance 0인 상대오차 전용 adaptive step에서 상태 scale도 0이면 `0/0→NaN`으로 acceptance가 오염될 위험 | `langevinEnsemble`, `adaptiveLangevin`, `quarticEscape` 중앙 예산과 zero-scale error normalization(`0` 또는 `Infinity`)을 명시 | typecheck, hostile suite, relative-only zero-scale 회귀 테스트 |
| 143 | FFT real/imag 길이 불일치가 undefined→NaN으로 전파 | equal-length 선검증 | FFT hostile-input 테스트 |
| 144 | 빈 FFT를 성공 처리하고 0을 power-of-two처럼 취급 | positive non-empty power-of-two 계약 | FFT hostile-input 테스트 |
| 145 | power 검사와 stage loop의 32-bit bitwise coercion/overflow | `Math.log2` 정수 검사와 산술 doubling으로 교체 | 기존 QKR FFT 정확도 테스트 |
| 146 | FFT real/imag가 같은 배열이면 입력을 자기파괴 | 동일 객체 alias 거부 | FFT hostile-input 테스트 |
| 147 | 한 ArrayBuffer의 겹치는 view도 FFT를 자기파괴 | byte-range overlap 거부 | overlapping-view 테스트 |
| 148 | NaN/Infinity FFT 입력이 전체 spectrum을 조용히 오염 | 모든 complex sample 유한성 선검사 | FFT hostile-input 테스트 |
| 149 | IFFT가 검증 전에 imaginary sign을 바꾸면 실패도 입력을 변형 | validation을 conjugation보다 앞에 배치 | no-mutation-on-failure 테스트 |
| 150 | IFFT가 public FFT를 호출해 대형 버퍼를 두 번 스캔 | validated `fftUnchecked` core 분리 | 역변환 정확도 테스트 |
| 151 | event bracket 시간/값의 NaN, 역순 bracket을 허용 | finite 및 `lo <= hi` 검사 | event boundary 테스트 |
| 152 | sign change가 없는 직접 `refineCrossing` 호출이 가짜 root 반환 | endpoint sign-change 계약 강제 | non-bracket 테스트 |
| 153 | 0/NaN tolerance가 수렴 계약을 무력화 | positive finite tolerance 강제 | option 테스트 |
| 154 | 소수/과대 iteration cap이 예측 불가능 | safe integer [1, 10000] 강제 | option 테스트 |
| 155 | root callback의 중간 NaN이 bracket 비교를 오염 | 매 평가 결과 유한성 검사 | non-finite callback 테스트 |
| 156 | endpoint exact root도 불필요 반복; transition h/값 무검증 | 양 endpoint 즉시 반환, h와 g0/g1 검증 | exact-root/transition 테스트 |
| 157 | linear solver의 NaN/소수 n이 빈 loop 뒤 성공으로 보고 | positive safe matrix order 검증 | NaN order 테스트 |
| 158 | runtime의 잘못된 fallback policy가 구조화 결과에 스며듦 | 두 solver에서 policy whitelist | invalid-policy 테스트 |
| 159 | NaN/음수 pivot tolerance가 singular 검사를 우회 | finite non-negative tolerance 강제 | pivot option 테스트 |
| 160 | 유한 입력의 elimination overflow가 성공 결과로 보고 | non-finite intermediate/output failure reason 추가 | 1e308 overflow 테스트 |
| 161 | public Cholesky factor/solve가 잘못된 차원과 겹치는 ArrayBuffer view를 허용 | matrix/factor/rhs 차원 및 실제 byte-region pairwise overlap 거부 | alias/overlapping-view 직접 테스트 |
| 162 | Cholesky squared pivot 또는 lower factor overflow가 성공 처리 | factorization 중 유한성 검사 | factor 경계 구현 |
| 163 | positive diagonal이어도 NaN lower triangle/NaN rhs 직접 solve 가능 | 사용 lower triangle과 rhs 전체 선검사 | 두 직접 호출 회귀 테스트 |
| 164 | triangular forward/back overflow가 NaN과 부분 수정 RHS를 반환 | private solution에서 양 pass 완료 후 atomic copy, outer는 structured `non-finite-output` | direct/outer RHS 불변 테스트 |
| 165 | 연구 sampling의 unknown strategy·역/무한 range·NaN count·과대 seed 무검증 | runtime whitelist와 bounded finite 입력 계약 | sampling hostile-input 테스트 |
| 166 | seed 문자합 방식이 anagram에 같은 random stream 생성 | order-sensitive FNV-1a seed hash | `abc`/`cba` 비동일 테스트 |
| 167 | even symmetric sampling이 음의 방향에 한 점 더 치우침 | 짝수는 midpoint 없는 대칭 pair, 홀수는 midpoint+pairs | endpoint·쌍대칭 테스트 |
| 168 | referral이 비-http URL, invalid timestamp, 구조 위조 저장 JSON, storage 예외에 취약 | protocol/time/shape 검증과 get/set fault isolation | referral hostile-input 테스트 |
| 169 | ring dimension 곱 overflow·과대 메모리·descriptor mode/byte 불일치 | safe dimensions, 16,777,216-cell ceiling, exact descriptor 검사 | ring descriptor 테스트 |
| 170 | ring sample getter를 검증 후 다시 읽어 finite→NaN/throw로 slot을 부분 훼손; NaN snapshot count 허용 | getter를 scratch에 정확히 한 번 snapshot·검증 후 seqlock publish, safe maxSamples | stateful-getter/atomic 테스트 |
| 171 | Int32 monotonic count wrap이 capacity 10처럼 2^32의 약수가 아닐 때 chronology 손실 | metadata를 `next write slot` modulo capacity로 재정의 | capacity 3/10 wrap 테스트 |
| 172 | shared reader가 writer 중간 상태를 읽고 clear가 값을 찢을 수 있음 | odd/even seqlock, 안정 전후 version 재검사, clear도 write lock | shared/local ring suite |
| 173 | SW가 위험 응답을 캐시하거나 stale 세대를 우선하고, upgrade 중 구 controller가 받은 새 hash를 잃을 수 있음 | strict cache 정책, current-first + retained-previous fallback, navigation은 current exact→current index→previous 순서, trim recovery | service-worker 25 tests 및 정적 계약 |
| 174 | production mirror에 CSP/HSTS/frame/permission/cache 정책과 PWA launch fallback이 부족 | wasm-aware CSP, runtime style fallback 허용, DENY/HSTS/OAC/Permissions, sw/html cache rules, display override/orientation/launch handler | PWA/header 계약 테스트 |
| 175 | 위 경계들이 문서와 구현에서 다시 분리되거나 audience/governance/stochastic 단일 모듈이 ratchet을 넘어 다시 비대해질 위험 | 본 추적 문서·신규 hardening suite를 추가하고 preference/search/help/stepper 책임을 네 모듈로 추출한 뒤 stale ratchet을 새 하한으로 즉시 낮춤 | module audit 324 sources/13 ratchets; quick 179 files/1,266 tests, typecheck, lint, Stryker dry-run 통과 |
| 176 | Cholesky `fallbackPolicy: throw` 오류가 일반 solver 이름을 잘못 표시 | Cholesky 전용 failure context adapter 추가 | throw-context 회귀 테스트 |
| 177 | lower-triangle 전용 계약인데 무관한 upper NaN까지 거부 | Cholesky scale/finite 검사를 실제 소비 lower triangle로 한정 | upper=NaN solve 테스트 |
| 178 | Cholesky diagnostics가 upper workspace를 일반 행렬처럼 읽어 잔차 오계산 | lower triangle을 대칭 복원하는 residual 계산기 분리 | asymmetric-storage residual < 1e-14 테스트 |
| 179 | library build가 조건부 `node:` imports를 browser shim으로 바꾸며 경고 | Node built-ins를 Rollup native ESM external로 명시 | library build 계약 및 `build:lib` |
| 180 | PRNG API가 seed를 암묵적으로 uint32 절단해 `1`과 `2^32+1`이 같은 stream을 생성하고 resonance curve의 `seed + realization`이 uint32 경계를 넘을 수 있음 | Gaussian·Brownian grid·ensemble·resonance curve의 base seed를 uint32로 고정해 범위 밖 값을 거부하고, 유효한 derived realization seed만 명시적으로 uint32 wrap | seed-alias 및 `0xffffffff + realization` 회귀 테스트 |
| 181 | Kramers/Arrhenius가 finite 극단값에서도 `Infinity*0`으로 NaN을 만들고 loop 제어가 느슨 | log-domain rate 계산과 유한 입력, 실현 수·스텝·seed·상태 계약 | 극단 0/Infinity 허용·NaN 금지 테스트 |
| 182 | Kramers의 개별 cap만으로 최대 `10^13` 동기 반복을 요청 가능 | 중앙 `quarticEscape` 예산과 checked `realizations × maxSteps` 10억-step 결합 상한 추가 | oversized total-work 테스트 |
| 183 | 시작점이 이미 barrier 이상이어도 한 스텝 뒤 탈출로 기록 | first-passage 정의대로 t=0, MFPT=0, rate=Infinity로 즉시 반환 | initial-barrier 계약 테스트 |
| 184 | direct matrix-SDE step이 빈/과대 차원에서 거대한 matrix/Jacobian을 먼저 할당 | 공통 입력 validator와 state/noise/scratch/연산 중앙 예산을 할당 전에 적용 | 10^9 noise 및 512³ hostile 테스트 |
| 185 | direct matrix-SDE의 잘못된 out·subnormal dt·NaN state/callback/gaussian이 NaN을 전파 | exact out shape, 공통 dt, finite state/callback/result 검사; 최종 결과 확인 뒤 atomic copy | direct-step hostile 테스트 |
| 186 | Heun도 사용하지 않는 `dim²×noise` Jacobian scratch를 매번 할당하고 sparse matrix callback의 이전 값이 잔류 | Heun Jacobian은 0-cell로 분리하고 diffusion/Jacobian scratch를 callback 전 영점화 | scratch 길이 및 기존 commutativity 앵커 |
| 187 | shared ring reader의 32회 tight retry가 정상 wide write 중에도 즉시 소진 | 512회 bounded retry, 1ms Atomics wait 또는 지수형 bounded spin backoff 적용 | shared/local ring suite |
| 188 | seqlock 구현이 실제 병렬 writer에서 torn row를 막는지 검증 부재 | Node Worker가 2,000개 wide sample을 쓰는 동안 모든 snapshot cell coherence 검사 | 실제 Worker concurrency stress 통과 |

## 실행 검증

- `npx vitest run tests/stochastic.test.ts`: split stepper와 최신 scalar fast path를 포함해 **1 file / 20 tests 통과(13.18초)**.
- `npx vitest run tests/stochastic-resonance.test.ts`: uint32 경계 회귀를 포함해 **1 file / 5 tests 통과(4.51초)**.
- linear solve·Cholesky·Kramers·hostile core·shared ring·service worker·workflow/PWA·UI contract 묶음: **8 files / 108 tests 통과(2.73초)**.
- UI hardening + workflow/PWA + stochastic resonance contract subset: **3 files / 39 tests 통과(3.44초)**.
- `npm run test:quick`: **179 files / 1,266 tests 통과(70.44초)**.
- `npx tsc --noEmit`: **통과**.
- `npm run lint`: **609 source files, ESLint 0 warnings**.
- `npm run format:check`, `npm run build`, `npm run build:lib`, `npm run budget`: **모두 통과**.
- `npm run audit:modules`: **324 source files / 13 ratchets 통과**; `stochastic.ts`는 623 lines로 전용 large-module 예외를 제거했고 stepper 567 lines를 별도 경계로 유지한다.
- standalone manifest 재생성 후 standalone 5개 artifact sync와 wasm sync: **통과**.
- `npm audit`: exact direct Miniflare 4.20260721.0/sharp 0.35.3으로 고정한 뒤 **취약점 0건**. `npm run audit:legacy` weighted risk 0, `npm run audit:mojibake:strict` finding 0으로 통과.
- `npm approve-scripts --allow-scripts-pending`: pending 0. reviewed `esbuild@0.28.1`, `workerd@1.20260721.1`만 `allowScripts`로 고정했다.
- `npm run smoke:miniflare-images`: **통과**. sharp 0.35.3/libvips 8.18.3에서 2×2 PNG를 Miniflare Images binding으로 4×3·100 bytes로 변환하고 결과 metadata를 재검증했다.
- GitHub remote control: 두 저장소 vulnerability alerts 활성 상태를 API로 확인했고, landing Pages는 `build_type=workflow`, built, HTTPS enforced 상태를 재조회했다.
- `npx stryker run --dryRunOnly --mutate src/physics/stochastic.ts --logLevel info stryker.shard.config.json`: **110 tests, 2분 11초, 통과**, AssemblyScript decorator parse warning 없음.
