# Pendulum Lab 종합 감사 및 개선 대장

- 감사일: 2026-07-14
- 대상: `pendulum_lab_modular` (`@elliotjung/pendulum-lab` 10.36.0)
- 연계 감사: [Pendulum Landing 종합 감사](https://github.com/elliotjung/pendulum-landing/blob/main/docs/COMPREHENSIVE_AUDIT_2026-07-14.md)

## 읽는 법

이 문서는 코드, 테스트, 생성 보고서, 배포·출판 계약을 함께 대조한 실행 대장이다. 기존 릴리스 증거는 `reports/worldclass-scorecard.md`와 랜딩 저장소의 `assets/evidence-summary.json`에 기록된 **1,090/1,090 테스트**, SciPy 교차 검증, 14개 에너지 프로파일을 기준으로 한다. 아래의 이번 작업 변경은 아직 커밋 전 작업 트리까지 포함하므로, 최종 릴리스 전에는 전체 `verify`, quick/slow, E2E, 패키징 검증을 다시 통과시켜야 한다.

상태 표기:

- **이번 작업 · 구현+전용 검증**: 실제 소스 변경과 해당 회귀 테스트/정적 계약이 함께 존재한다.
- **이번 작업 · 구현, 통합검증 대기**: 실제 변경은 존재하지만 최종 전체 매트릭스 확인이 남았다.
- **향후**: 이번 작업에서 수정하지 않았으며 후속 변경으로 추적해야 한다.
- **외부 조건**: 코드만으로 완료할 수 없고 계정, 물리 장비, 공개 레지스트리 같은 외부 상태가 필요하다.

심각도는 **P0**(무한 루프·잘못된 과학 결과·보안 경계), **P1**(신뢰성·데이터 손상·주요 UX), **P2**(성능·운영·완성도), **P3**(장기 확장) 순이다.

## A. 수치해석과 물리 정확성

| # | 심각도 | 위험·근거 | 권장 조치 | 상태 |
|---:|:---:|---|---|---|
| 001 | P0 | `renormEvery=0`이면 Lyapunov 재정규화 루프가 진행되지 않을 수 있었다. | 양의 정수이며 `steps` 이하인지 API 경계에서 거부한다. | **이번 작업 · 구현+전용 검증** — `src/chaos/lyapunov.ts`, `tests/chaos.test.ts` |
| 002 | P0 | Lyapunov `dt<=0` 또는 비유한 값은 역방향·무진행 계산을 만들 수 있었다. | 모든 Lyapunov 진입점에서 양의 유한 `dt`를 강제한다. | **이번 작업 · 구현+전용 검증** |
| 003 | P1 | 0, 음수, 소수·unsafe `steps`는 의미 없는 평균, 암묵적 반올림 또는 사실상 무한 작업을 만든다. | `steps`를 양의 safe integer와 5,000,000-step ceiling 안으로 제한한다. | **이번 작업 · 구현+전용 검증** — `tests/numerical-budget-guards.test.ts` |
| 004 | P1 | 음수·소수·과대 `transientSteps`는 워밍업 계약과 총 작업 예산을 흐린다. | 0 이상의 safe integer, transient/measurement/합산 ceiling을 함께 강제한다. | **이번 작업 · 구현+전용 검증** |
| 005 | P0 | NaN/Infinity 초기 상태는 지수 추정 전 구간을 오염시킨다. | 모든 초기 상태 성분을 유한성 검사한다. | **이번 작업 · 구현+전용 검증** |
| 006 | P1 | 스펙트럼 `count<=0`은 빈 QR 프레임과 오해 가능한 결과를 만든다. | 양의 정수만 받고 차원보다 큰 값은 명시적으로 차원에 제한한다. | **이번 작업 · 구현+전용 검증** |
| 007 | P0 | FTLE가 `round(T/dt)`를 사용해 `T<dt`에서도 전체 `dt`를 적분하여 지수 크기를 크게 왜곡했다. | `floor`개의 전 스텝 뒤 정확한 잔여 시간 스텝을 수행한다. | **이번 작업 · 구현+전용 검증** — `src/chaos/ftle.ts`, `tests/ftle.test.ts` |
| 008 | P1 | 음수·비유한 FTLE horizon은 물리적 의미가 없고 루프 계약을 깨뜨린다. | `totalTime`을 유한한 0 이상으로 제한한다. | **이번 작업 · 구현+전용 검증** |
| 009 | P0 | FTLE 초기 상태의 NaN/Infinity가 STM 전체로 전파될 수 있었다. | 비어 있지 않은 유한 상태 벡터만 허용한다. | **이번 작업 · 구현+전용 검증** |
| 010 | P0 | 최대 특이값의 고정 all-ones power seed가 우세 고유벡터에 직교하면 작은 특이값을 반환할 수 있었다. | 스케일된 `MᵀM`의 대칭 Jacobi 고유값 해법으로 바꾼다. | **이번 작업 · 구현+전용 검증** |
| 011 | P0 | 매우 큰/작은 STM에서 `MᵀM` 형성이 overflow/underflow를 일으킬 수 있었다. | 최대 절댓값으로 먼저 스케일하고 마지막에 복원한다. | **이번 작업 · 구현+전용 검증** |
| 012 | P1 | 잘린 행렬, NaN 행렬, 잘못된 차원·iteration 값이 조용히 0으로 보정될 수 있었다. | 행렬 길이·성분·차원·반복 횟수를 명시 검증한다. | **이번 작업 · 구현+전용 검증** |
| 013 | P0 | event detector의 `dt=0`은 시간이 진행되지 않는 무한 루프를 만들 수 있었다. | 양의 유한 `dt`만 허용한다. | **이번 작업 · 구현+전용 검증** — `src/physics/events.ts`, `tests/events.test.ts` |
| 014 | P1 | 음수·Infinity `maxTime`은 종료 시각 계약을 무너뜨린다. | 유한한 0 이상으로 제한한다. | **이번 작업 · 구현+전용 검증** |
| 015 | P1 | 0 이하 `rootTol`, Infinity, 음수·소수·과대 `maxEvents`는 refinement/종료와 메모리 계약을 깨뜨린다. | 양의 유한 tolerance와 0..1,000,000 safe-integer event cap만 허용하고 누락 시 cap을 기본값으로 쓴다. | **이번 작업 · 구현+전용 검증** — `tests/numerical-budget-guards.test.ts` |
| 016 | P0 | 한 스텝에서 여러 event가 교차하면 등록 순서가 시간 순서를 대신했다. | 모든 교차 시각을 정제한 뒤 시각·event index 순으로 정렬한다. | **이번 작업 · 구현+전용 검증** |
| 017 | P0 | `maxEvents` 도달 시 반환 상태·시간이 실제 교차점이 아닌 enclosing step 끝일 수 있었다. | 마지막 정제 교차점의 상태와 시간을 terminal result로 반환한다. | **이번 작업 · 구현+전용 검증** |
| 018 | P1 | basin grid `n=1`은 `(n-1)` 분모를 0으로 만들고 비정수 `n`은 배열 계약을 흐린다. | `2..512` 정수로 제한한다. | **이번 작업 · 구현+전용 검증** — `src/chaos/basin.ts`, `tests/basin.test.ts` |
| 019 | P0 | basin `dt<=0`은 무진행 또는 역방향 대량 계산을 만든다. | 양의 유한 `dt`만 허용한다. | **이번 작업 · 구현+전용 검증** |
| 020 | P1 | 동일·역전·비유한 angle range는 중복 셀 또는 NaN 초기조건을 만든다. | 유한하고 엄격히 증가하는 범위를 강제한다. | **이번 작업 · 구현+전용 검증** |
| 021 | P1 | 음수·비유한 basin horizon은 모호한 분류를 만든다. | `maxTime`을 유한한 0 이상으로 제한한다. | **이번 작업 · 구현+전용 검증** |
| 022 | P0 | 극단적으로 작은/subnormal `dt`가 셀당 수억 스텝 또는 안전하게 표현할 수 없는 ratio를 만들 수 있었다. | 공용 `integrationStepCount`로 float64-usable step과 셀당 최대 1,000,000 스텝을 강제한다. | **이번 작업 · 구현+전용 검증** — `tests/numerical-budget-guards.test.ts` |
| 023 | P0 | `n² × steps` 곱 자체가 safe integer를 넘거나 전체 작업량 상한을 우회할 수 있었다. | overflow-safe `checkedWorkProduct`와 총 150,000,000 trajectory-step ceiling을 적용한다. | **이번 작업 · 구현+전용 검증** |
| 024 | P0 | parameter fitting의 `dt=0`·subnormal step·과대 observation span은 forward model을 멈추거나 CPU를 고갈시킬 수 있었다. | usable `dt`와 평가당 최대 2,000,000 forward steps를 사전 계산한다. | **이번 작업 · 구현+전용 검증** — `src/research/parameterEstimation.ts`, `tests/parameter-estimation.test.ts`, `tests/numerical-budget-guards.test.ts` |
| 025 | P1 | NaN/Infinity 또는 음수 관측 시간이 interpolation/잔차를 오염시킨다. | 모든 관측 시간을 유한한 0 이상으로 제한한다. | **이번 작업 · 구현+전용 검증** |
| 026 | P1 | 중복·역전 관측 시각이 시간 진행 가정을 깨뜨린다. | 관측 시각을 엄격한 증가열로 요구한다. | **이번 작업 · 구현+전용 검증** |
| 027 | P1 | parameter bounds와 initial guess의 유한성·경계 포함 여부에 대한 property coverage가 제한적이다. | estimate별 임의 생성 테스트와 경계값 회귀를 추가한다. | **향후** |
| 028 | P1 | 관측 행렬 차원·시간 길이 불일치의 모든 조합이 독립적으로 고정되어 있지 않다. | 상태 차원별 shape contract를 타입·런타임 양쪽에서 고정한다. | **향후** |
| 029 | P2 | 극단 질량비·길이비에서 double/triple RHS의 조건수와 에너지 오차 한계가 명시적이지 않다. | log-spaced parameter sweep과 허용오차 표를 추가한다. | **향후** |
| 030 | P2 | chaos uncertainty가 짧은 시계열·강한 상관에서 과신하지 않는지 calibration 근거가 더 필요하다. | 합성 regular/chaotic benchmark로 CI coverage calibration을 기록한다. | **향후** |

## B. Chaos 진단 API

| # | 심각도 | 위험·근거 | 권장 조치 | 상태 |
|---:|:---:|---|---|---|
| 031 | P1 | 빈/극단적으로 짧은 0–1 test 입력이 `K≈0`인 정상 운동처럼 보일 수 있었다. | 최소 20 samples를 요구한다. | **이번 작업 · 구현+전용 검증** — `src/chaos/zeroOneTest.ts`, `tests/zero-one-test.test.ts` |
| 032 | P1 | 시계열 NaN/Infinity가 상관계수에 스며들 수 있었다. | 모든 sample의 유한성을 검사한다. | **이번 작업 · 구현+전용 검증** |
| 033 | P1 | 잘못된 `cSamples`·역전된 `cRange`가 빈 frequency ensemble을 만들 수 있었다. | 양의 safe integer와 유한한 증가 범위를 강제한다. | **이번 작업 · 구현+전용 검증** |
| 034 | P1 | 0/1 밖 `ncutFraction` 또는 1개 lag는 무의미한 correlation을 만든다. | `(0,1)`과 최소 2개 lag를 강제한다. | **이번 작업 · 구현+전용 검증** |
| 035 | P2 | 비유한 seed는 재현성 계약을 흐린다. | 유한 seed만 허용한다. | **이번 작업 · 구현+전용 검증** |
| 036 | P1 | 문서가 유한표본 correlation을 항상 `[0,1]`이라고 주장했지만 음수가 가능하다. | API·worker 주석을 `[-1,1]`로 교정한다. | **이번 작업 · 구현+전용 검증** |
| 037 | P1 | RQA dimension/delay/line length/Theiler가 암묵적으로 floor되어 사용자 실수를 숨겼다. | 안전 정수와 각 최소값을 명시 검증한다. | **이번 작업 · 구현+전용 검증** — `src/chaos/rqa.ts`, `tests/rqa.test.ts` |
| 038 | P1 | 음수 epsilon 또는 0/1 밖 target recurrence rate는 threshold 의미를 깨뜨린다. | epsilon은 0 이상, rate는 열린 구간 `(0,1)`로 제한한다. | **이번 작업 · 구현+전용 검증** |
| 039 | P1 | RQA 입력 NaN/Infinity가 거리행렬 전체를 오염시킬 수 있었다. | 시계열 전 성분 유한성을 검증한다. | **이번 작업 · 구현+전용 검증** |
| 040 | P1 | uncertainty block이 embedding보다 짧으면 빈 결과가 정상 통계처럼 평균될 수 있었다. | dimension/delay에 따른 최소 block 길이를 계산해 거부한다. | **이번 작업 · 구현+전용 검증** |
| 041 | P2 | block 분할의 나머지 samples가 버려져 uncertainty가 데이터 일부만 사용했다. | 앞 block부터 나머지를 균등 배분한다. | **이번 작업 · 구현+전용 검증** |
| 042 | P0 | RQA의 dense `O(N²)` 메모리와 `O(N²m)` distance scan에 공개 API 상한이 없어 큰 입력으로 고갈될 수 있었다. | embedded points, embedding cells, dense cells, component evaluations, uncertainty blocks를 allocation 전에 각각 제한한다. | **이번 작업 · 구현+전용 검증** — `src/chaos/rqa.ts`, `tests/numerical-budget-guards.test.ts` |
| 043 | P0 | spring pendulum은 각도가 state index 1인데 worker가 index 0을 사용해 잘못된 observable을 만들었다. | system별 angular index를 한 helper로 통일한다. | **이번 작업 · 구현+전용 검증** — `src/workers/chaosProtocol.ts`, `tests/chaos-protocol.test.ts` |
| 044 | P1 | study-point RQA가 세부 line/Theiler 옵션을 일반 RQA와 동일하게 전달하지 않았다. | 공용 `rqaOptionsFromSettings`로 두 경로를 통일한다. | **이번 작업 · 구현+전용 검증** |
| 045 | P2 | worker 0–1 job이 API의 frequency/seed 옵션 전부를 노출하지 않아 연구 재현 설정이 제한된다. | protocol settings를 `ZeroOneOptions`와 명시적으로 매핑한다. | **향후** |
| 046 | P2 | basin/Wada 분류 uncertainty가 grid resolution 변화와 함께 어떻게 수렴하는지 UI 기본 보고가 제한적이다. | 다중해상도 convergence summary와 confidence caveat를 기본 산출한다. | **향후** |

## C. 상태·입력·내보내기 보안 경계

| # | 심각도 | 위험·근거 | 권장 조치 | 상태 |
|---:|:---:|---|---|---|
| 047 | P0 | 미래 schema snapshot을 현재 코드가 받아 잘못 해석할 수 있었다. | `pendulum-session/vN-ts`를 파싱하고 `N>10`을 거부한다. | **이번 작업 · 구현+전용 검증** — `src/state/StateStore.ts`, `tests/json-import-validation.test.ts` |
| 048 | P1 | 임의 schema string이 통과해 migration 책임이 불명확했다. | 지원 schema grammar만 허용하고 누락은 현재 버전으로 해석한다. | **이번 작업 · 구현+전용 검증** |
| 049 | P0 | accessor/proxy 또는 비표준 prototype object가 sanitizer 내부에서 예외·부작용을 낼 수 있었다. | plain object와 null-prototype만 허용하고 introspection 예외를 차단한다. | **이번 작업 · 구현+전용 검증** |
| 050 | P0 | 0/음수뿐 아니라 극단 질량·길이도 overflow·ill-conditioning을 만들어 imported session을 폭주시킬 수 있었다. | `m1,m2,l1,l2`를 solver-safe `[1e-6,1e6]` 범위로 강제한다. | **이번 작업 · 구현+전용 검증** — `tests/session-contracts.test.ts` |
| 051 | P1 | 음수·과대 중력값이 의도하지 않은 모델 또는 즉시 overflow하는 session을 만들 수 있었다. | `g`를 유한한 `[0,1e6]`으로 제한한다. | **이번 작업 · 구현+전용 검증** |
| 052 | P0 | optional `m3,l3`가 음수·극단값이어도 일부 경로에서 남을 수 있었다. | 존재하면 동일 solver-safe 질량·길이 범위를 적용한다. | **이번 작업 · 구현+전용 검증** |
| 053 | P0 | triple session이 `m3,l3` 없이 double parameter로 실행될 수 있었다. | triple이면 두 값을 필수로 요구한다. | **이번 작업 · 구현+전용 검증** |
| 054 | P1 | session `dt`의 0·subnormal·과대값은 수치 불안정 또는 무진행을 만든다. | headless store는 `[1e-12,0.1]`, interactive Lab은 `[1e-4,0.05]`의 명시적 이중 계약을 적용한다. | **이번 작업 · 구현+전용 검증** — `tests/session-contracts.test.ts` |
| 055 | P1 | 0 이하·극단 tolerance가 adaptive solver 또는 UI range 계약을 깨뜨린다. | headless `[1e-15,1]`, Lab `[1e-12,1e-3]` 범위를 분리 검증한다. | **이번 작업 · 구현+전용 검증** |
| 056 | P1 | 소수/0/과대 `stepsPerFrame`이 UI workload와 range 표현을 흐린다. | headless는 1..10,000 safe integer, Lab은 1..60으로 제한한다. | **이번 작업 · 구현+전용 검증** |
| 057 | P1 | damping 범위를 벗어난 값이 UI와 solver 가정을 어길 수 있다. | 기존 `[0,10]` bound를 import와 constructor 모두에 적용한다. | **이번 작업 · 구현+전용 검증** |
| 058 | P1 | 음수·극단 simulation time이 replay chronology와 UI formatting을 깨뜨린다. | headless `[0,1e12]`, Lab `[0,1e9]` 범위를 요구한다. | **이번 작업 · 구현+전용 검증** |
| 059 | P1 | 음수·소수·과대 seed가 재현성 표현을 불안정하게 한다. | null 또는 0 이상 safe integer만 허용한다. | **이번 작업 · 구현+전용 검증** |
| 060 | P0 | `method in registry`는 prototype chain property를 integrator로 오인할 수 있다. | `Object.hasOwn`으로 registry 소유 항목만 인정한다. | **이번 작업 · 구현+전용 검증** |
| 061 | P0 | `StateStore(initial)`과 legacy-runtime sync가 검증을 우회해 내부에 불변식 위반 snapshot을 만들 수 있었다. | constructor와 legacy sync 모두 동일한 canonical `validate`를 통과시키고 실패 시 거부한다. | **이번 작업 · 구현+전용 검증** — `tests/session-contracts.test.ts` |
| 062 | P1 | 비유한·극단 상태값과 여러 회전만큼 벗어난 angle이 imported simulation·UI를 즉시 발산 또는 clamp시킬 수 있었다. | angle은 principal range로 canonicalize하고 angular velocity는 solver/Lab별 상한을 적용한다. | **이번 작업 · 구현+전용 검증** |
| 063 | P0 | 문자열 길이 5 MB 검사는 멀티바이트 UTF-8 실제 크기를 과소평가했다. | `TextEncoder` byte length도 검사한다. | **이번 작업 · 구현+전용 검증** — `src/validation/importSchema.ts` |
| 064 | P0 | 재귀적 위험키 탐색은 깊은 JSON에서 JS call stack을 소진할 수 있었다. | 명시적 stack 순회와 depth 100 제한을 사용한다. | **이번 작업 · 구현+전용 검증** |
| 065 | P0 | 매우 넓은 JSON graph가 parsing 뒤 CPU/메모리를 고갈시킬 수 있었다. | 최대 100,000 nodes를 강제하고 push 전에 예산을 확인한다. | **이번 작업 · 구현+전용 검증** |
| 066 | P0 | `__proto__`, `constructor`, `prototype` 키가 object graph에 들어올 수 있었다. | 모든 경로를 순회해 위험 키의 정확한 path와 함께 거부한다. | **이번 작업 · 구현+전용 검증** |
| 067 | P2 | 표준 `JSON.parse`는 중복 object key를 마지막 값으로 덮어써 provenance 검토에서 모호하다. | 연구 bundle용 strict duplicate-key parser 또는 canonical JSON을 도입한다. | **향후** |
| 068 | P2 | snapshot의 허용되지 않은 일반 추가 키 정책이 명문화되지 않아 schema drift 탐지가 늦을 수 있다. | 호환 metadata allowlist와 strict mode를 분리한다. | **향후** |
| 069 | P1 | fallback state hash가 FNV 계열 32-bit라 충돌 저항 provenance로는 부족하다. | 비동기 SHA-256 canonical snapshot hash를 기본으로 하고 legacy hash를 표시한다. | **향후** |
| 070 | P0 | 연구 ZIP은 zip-slip, 중복·대소문자 충돌 path, symlink, 암호화/deferred entry, metadata 불일치, 과대 entry/archive로 parser를 우회할 수 있었다. | build와 parse 양쪽에서 safe path·수량/byte budget·STORE-only·local/central 일치·CRC·overlap을 검증한다. | **이번 작업 · 구현+전용 검증** — `src/research/zipBundle.ts`, `tests/zip-bundle.test.ts` |
| 071 | P1 | 사용자 영향 문자열이 `=,+,-,@`로 시작하면 CSV를 스프레드시트에서 열 때 formula로 실행될 수 있었다. | 선행 공백/탭까지 탐지해 비숫자 cell에 literal apostrophe를 붙이고 RFC 4180 quoting을 유지한다. | **이번 작업 · 구현+전용 검증** — `src/research/researchExportUtils.ts`, `tests/research-export-utils.test.ts` |
| 072 | P0 | modern run export schema가 strict importer의 `RuntimeSnapshot`과 달라 export→import가 끊겼다. | top level을 실제 v10 snapshot으로 만들고 run metadata는 additive field로 둔다. | **이번 작업 · 구현+전용 검증** — `src/app/labExport.ts`, `tests/import-export-roundtrip.test.ts` |
| 073 | P1 | export에 실제 `stepsPerFrame`, seed, 현재 audience/run mode가 없어 replay 재현성이 약했다. | Lab runtime의 실제 SPF·seed와 adopted legacy/state store의 실제 run mode를 snapshot에 포함한다. | **이번 작업 · 구현+전용 검증** — `tests/lab-export.test.ts`, `tests/session-contracts.test.ts` |
| 074 | P1 | object URL을 같은 task에서 revoke하면 Safari/WebKit download가 취소될 수 있다. | download 소비 뒤 1초 지연 revoke한다. | **이번 작업 · 구현+전용 검증** — `tests/lab-export.test.ts` |
| 075 | P0 | saved-run JSON input이 strict store에는 들어가도 interactive control 범위를 벗어나 browser clamp와 runtime drift를 만들 수 있었다. | strict parse→solver-safe StateStore→narrow Lab contract→DOM representation plan→StateStore apply 순으로 연결한다. | **이번 작업 · 구현+전용 검증** — `src/browser/savedRunImport.ts`, `tests/saved-run-import.test.ts`, `tests/session-contracts.test.ts` |
| 076 | P1 | import가 각 control change마다 simulation을 rebuild하거나 store/UI/LabApp 중 일부만 변경할 수 있었다. | 모든 control을 원자적으로 쓰고 read-back 후 단일 snapshot commit으로 실제 `simTime`과 상태에서 재개한다. | **이번 작업 · 구현+전용 검증** |
| 077 | P1 | import 중 clamp·select 누락·재클릭·오류가 부분 상태를 남길 수 있었다. | 사전 계획, DOM rollback과 store rollback, 처리 중 disable, finally reset, 제한된 문제 toast를 적용한다. | **이번 작업 · 구현+전용 검증** |

## D. Worker·런타임·UI 수명주기

| # | 심각도 | 위험·근거 | 권장 조치 | 상태 |
|---:|:---:|---|---|---|
| 078 | P0 | `runChaosJob`이 null/primitive request에서 catch 이전 property 접근으로 worker를 죽일 수 있었다. | 입력을 `unknown`으로 받고 object/id/kind를 안전하게 검증한다. | **이번 작업 · 구현+전용 검증** — `tests/chaos-protocol.test.ts` |
| 079 | P0 | 악성 getter/proxy의 `id` 접근이 error response 생성 자체를 실패시킬 수 있었다. | 예외를 삼키는 `safeRequestId`와 `unknown` fallback을 사용한다. | **이번 작업 · 구현+전용 검증** |
| 080 | P1 | unknown job kind가 request 전체 JSON 직렬화에 의존해 순환 입력에서 실패할 수 있었다. | 검증된 kind 문자열만 error에 포함한다. | **이번 작업 · 구현+전용 검증** |
| 081 | P1 | 던져진 값의 `toString`도 실패하면 worker response가 사라질 수 있었다. | 예외 안전 error formatter와 고정 fallback을 둔다. | **이번 작업 · 구현+전용 검증** |
| 082 | P0 | 같은 `ArrayBuffer`의 여러 view를 transfer list에 중복 넣으면 `DataCloneError`가 날 수 있었다. | `Set<ArrayBuffer>`로 transferables를 중복 제거한다. | **이번 작업 · 구현+전용 검증** — `src/app/LabSidePlotProtocol.ts`, `tests/lab-runtime-budget.test.ts` |
| 083 | P0 | `ChaosClient` 요청에 deadline이 없으면 worker crash/누락 response 시 Promise가 영구 대기할 수 있었다. | 기본 10분과 요청별 override를 가진 validated timeout, typed timeout error, timeout 시 worker reset을 추가한다. | **이번 작업 · 구현+전용 검증** — `src/runtime/ChaosClient.ts`, `tests/chaos-client.test.ts` |
| 084 | P1 | 긴 chaos/basin job의 협력적 cancellation이 모든 inner loop에 전파되지 않는다. | AbortSignal 또는 cancel token polling을 solver chunk마다 수행한다. | **향후** |
| 085 | P1 | 중복 job id가 pending map을 덮어써 먼저 보낸 Promise를 잃을 수 있었다. | pending 등록 전에 collision을 typed error로 거부하고 기존 요청을 보존한다. | **이번 작업 · 구현+전용 검증** — `tests/chaos-client.test.ts` |
| 086 | P1 | worker terminate/error/timeout 때 pending resolver, timer, listener와 fallback task가 남을 수 있었다. | `takePending`/`rejectAllPending`/`detachWorkerSafely`로 모든 경로를 정리하고 `dispose()`가 전 요청을 typed error로 reject하게 한다. | **이번 작업 · 구현+전용 검증** |
| 087 | P2 | 장시간 연구 job이 reload 후 재개할 checkpoint protocol이 제한적이다. | versioned checkpoint와 deterministic resume hash를 설계한다. | **향후** |
| 088 | P1 | `OffscreenCanvas`/worker canvas 미지원·transfer 실패 시 side plot fallback 행태를 더 고정해야 한다. | main-thread renderer fallback과 context-loss E2E를 추가한다. | **향후** |
| 089 | P1 | research lazy import가 한 번 reject되면 rejected Promise가 영구 memoize되어 재시도 불가했다. | 성공은 cache하고 실패는 pending을 비우는 retryable lazy loader를 사용한다. | **이번 작업 · 구현+전용 검증** — `src/runtime/retryableLazy.ts`, `tests/retryable-lazy.test.ts` |
| 090 | P1 | audience/tab/rail/Ctrl+K의 fire-and-forget lazy load가 unhandled rejection을 낼 수 있었다. | 모든 호출에서 공용 실패 reporter를 catch하고 사용자에게 재시도를 안내한다. | **이번 작업 · 구현+전용 검증** |
| 091 | P0 | core boot reject가 콘솔 외에는 빈/부분 UI로 남을 수 있었다. | 접근 가능한 modal 오류와 reload retry를 제공한다. | **이번 작업 · 구현+통합 검증** — `src/main.ts`, typecheck/lint/browser boot smoke |
| 092 | P2 | boot failure 원인·release/build id를 지원 진단에 복사하는 기능이 없다. | 오류 dialog에 safe diagnostic copy와 issue link를 추가한다. | **향후** |

## E. 조작·접근성·성능·PWA

| # | 심각도 | 위험·근거 | 권장 조치 | 상태 |
|---:|:---:|---|---|---|
| 093 | P0 | 전역 숫자/문자 shortcut이 Ctrl/Cmd/Alt 브라우저·OS shortcut을 가로챌 수 있었다. | modifier/defaultPrevented 상태면 즉시 무시한다. | **이번 작업 · 구현+전용 검증** — `src/app/Shell.ts`, `tests/shell-shortcuts.test.ts` |
| 094 | P1 | button/link/summary 등에서 키를 누를 때 전역 shortcut이 widget 동작과 충돌할 수 있었다. | native interactive selector 전체를 guard한다. | **이번 작업 · 구현+전용 검증** |
| 095 | P1 | contenteditable 및 ARIA interactive role이 shortcut guard 밖에 있었다. | contenteditable과 button/slider/tab/textbox 등 role을 포함한다. | **이번 작업 · 구현+전용 검증** |
| 096 | P1 | IME composition 중 숫자 key가 tab 전환으로 해석될 수 있었다. | `isComposing`이면 shortcut을 무시한다. | **이번 작업 · 구현+전용 검증** |
| 097 | P1 | preset 적용이 control마다 `change`를 발생시켜 약 15회 simulation rebuild를 유발할 수 있었다. | input 표시는 갱신하되 마지막에 단일 `pendulum:lab-controls-committed`를 보낸다. | **이번 작업 · 구현+전용 검증** |
| 098 | P1 | URL deep link도 다수 control 변경마다 rebuild할 수 있었다. | override 목록을 모아 단일 commit으로 적용한다. | **이번 작업 · 구현+전용 검증** |
| 099 | P1 | saved-run import 역시 같은 batch 계약이 필요하다. | preset/deep-link/import가 공용 `controlCommit`을 사용한다. | **이번 작업 · 구현+전용 검증** |
| 100 | P1 | 전체 tab surface에서 `role=tab`, `aria-selected`, `aria-controls` 일관성을 자동 확인하는 계약이 부족하다. | 동적 연구 tab까지 포함한 axe/keyboard contract를 추가한다. | **향후** |
| 101 | P1 | tab 전환 뒤 focus가 숨겨진 panel 안에 남을 가능성을 체계적으로 검사하지 않는다. | focus relocation과 screen-reader announcement E2E를 추가한다. | **향후** |
| 102 | P2 | 앱 shortcut과 브라우저·assistive technology shortcut 충돌 목록이 사용자별로 조정되지 않는다. | remapping/disable 설정과 충돌 경고를 제공한다. | **향후** |
| 103 | P2 | non-US keyboard layout에서 physical key와 character key 계약이 명시적이지 않다. | `key`/`code` 선택 기준과 locale fixture를 문서화한다. | **향후** |
| 104 | P2 | export 성공·실패·파일명·크기를 일관된 accessible live region으로 알리지 않는다. | download lifecycle status component를 추가한다. | **향후** |
| 105 | P1 | service-worker runtime cache에 상한이 없어 장기 사용 시 저장소가 계속 자랄 수 있었다. | 96-entry cap과 oldest-insertion eviction을 적용하고 executable cache harness로 검증한다. | **이번 작업 · 구현+전용 검증** — `public/sw.js`, `tests/service-worker-behavior.test.ts` |
| 106 | P1 | cache put이 fetch event 수명 밖에서 중단되거나 Response body 소비 뒤 clone되어 실패할 수 있었다. | 원본 노출 전 clone continuation을 등록하고 `event.waitUntil(settle(...))`로 수명을 묶는다. | **이번 작업 · 구현+전용 검증** — asset/navigation 양 경로 테스트 |
| 107 | P1 | 실패/non-OK response, cache hit의 중복 write 또는 다른 앱의 cache 삭제가 runtime cache를 오염·파괴할 수 있었다. | OK same-origin GET만 저장하고 hit은 재기록하지 않으며 activate는 `pendulum-lab-v*` cache만 정리한다. | **이번 작업 · 구현+전용 검증** |
| 108 | P1 | cache `VERSION`이 package version 고정 문자열이라 동일 버전 재빌드 asset 변경을 구분하지 못한다. | build content hash 또는 manifest revision을 cache name에 포함한다. | **향후** |
| 109 | P2 | 새 service worker 대기/활성화와 실행 중 연구 session 사이의 업데이트 UX가 없다. | 저장 안내 후 새 버전 reload를 사용자가 선택하게 한다. | **향후** |
| 110 | P2 | 96개 cap은 entry 수 기준일 뿐 byte·age·실제 LRU를 반영하지 않는다. | 크기/시간 metadata를 둔 quota-aware LRU로 확장한다. | **향후** |
| 111 | P1 | Docker build context에 `.git`, `node_modules`, build/test reports와 screenshots가 들어가 느리고 불필요한 유출 면이 있었다. | 생성물·VCS·캐시를 제외하는 `.dockerignore`를 추가한다. | **이번 작업 · 구현+전용 검증** — `.dockerignore`, `tests/dockerignore.test.ts` |
| 112 | P1 | `.env*`, registry config, private key와 credentials/secrets directory가 build context에 들어갈 수 있었다. | `.env`, `.env.*`, `.npmrc`, key/certificate, credentials/secrets를 제외하고 `!.env.example`만 의도적으로 허용한다. | **이번 작업 · 구현+전용 검증** — `tests/dockerignore.test.ts` |

## F. 테스트·CI·외부 출시

| # | 심각도 | 위험·근거 | 권장 조치 | 상태 |
|---:|:---:|---|---|---|
| 113 | P2 | 브라우저 E2E는 자동화 브라우저와 제한된 device profile 중심이며 실제 저사양·touch·Safari 장비 증거가 부족하다. | 실제 장비 smoke matrix와 결과 artifact를 추가한다. | **향후** |
| 114 | P2 | import/worker protocol의 adversarial fuzz가 예시 기반 테스트보다 넓게 조합되지 않는다. | fast-check로 depth/width/proxy/shape property suite를 추가한다. | **향후** |
| 115 | P1 | mutation score 65.32%(covered 68.34%)는 65% floor는 넘지만 70% quality target 아래다. | 생존 mutant 2,006개를 과학 핵심 모듈부터 분류해 70% 이상으로 올린다. | **향후** |
| 116 | P1 | 실제 NVIDIA WebGPU runner 증거가 없어 3-vendor promotion matrix가 1/3이다. | 물리 NVIDIA self-hosted runner에서 동일 CPU-oracle ladder를 통과시킨다. | **외부 조건** — GPU 장비·runner 필요 |
| 117 | P1 | 실제 AMD WebGPU runner 증거도 누락되어 vendor portability 주장을 완료할 수 없다. | 물리 AMD self-hosted runner와 artifact 업로드를 구성한다. | **외부 조건** — GPU 장비·runner 필요 |
| 118 | P1 | `@elliotjung/pendulum-lab` 현재 정확한 버전이 npm registry에 공개되지 않았다. | trusted publisher/owner 권한으로 의도적 publish 후 registry·provenance를 검증한다. | **외부 조건** — npm 권한·공개 의사결정 필요 |
| 119 | P1 | 공개 Zenodo record와 DOI가 아직 없다. | 인증된 deposition publish 후 `doi:sync`로 문서·citation을 동기화한다. | **외부 조건** — Zenodo 인증·최종 공개 필요 |
| 120 | P1 | 최종 공개 tarball 기준의 attestation·SBOM 검증은 실제 릴리스 artifact가 있어야 닫힌다. | release 후 `release:verify-attestations`를 exact asset에 실행하고 결과를 보존한다. | **외부 조건** — 최종 GitHub release artifact 필요 |

## G. 최종 adversarial review

아래 항목은 1차 감사 뒤 입력을 단순히 “유한값”으로만 바꾸어 우회할 수 있는지 다시 공격적으로 검토한 결과다. 2026-07-14 최종 작업 트리에서 관련 11개 test file, 94개 test를 별도로 실행해 모두 통과함을 확인했다.

| # | 심각도 | 위험·근거 | 최종 방어 | 상태 |
|---:|:---:|---|---|---|
| 121 | P0 | 각 factor는 유한·정수여도 `n²×steps` 같은 곱이 `MAX_SAFE_INTEGER`를 넘어 작게 반올림되면 ceiling 비교를 우회할 수 있었다. | 나눗셈 기반 overflow preflight를 하는 공용 `checkedWorkProduct`를 event/RQA/FTLE/basin/sampling에 적용했다. | **이번 작업 · 구현+전용 검증** — `src/validation/numericalBudgets.ts`, `tests/numerical-budget-guards.test.ts` |
| 122 | P0 | `Number.MIN_VALUE` 같은 양의 subnormal `dt`는 `dt>0` 검사를 통과하지만 RK stage가 진행되지 않거나 ratio가 Infinity가 된다. | 최소 normal float64 step, 유한 span, safe-integer `ceil(span/dt)`를 공용 helper에서 검증한다. | **이번 작업 · 구현+전용 검증** |
| 123 | P0 | event solver의 기본 Infinity cap과 많은 event spec 조합은 integration-step cap만 지켜도 event-function work를 폭증시킬 수 있었다. | 기본 1,000,000-event cap, 최대 10,000,000 steps, 50,000,000 event-function evaluations를 함께 제한한다. | **이번 작업 · 구현+전용 검증** |
| 124 | P0 | `steps % renormEvery != 0`이면 Lyapunov 마지막 measurement steps가 버려져 요청 horizon보다 짧은 지수를 보고했다. | 마지막 partial renormalization block도 실제 block time으로 maximal/spectrum 양쪽에 포함한다. | **이번 작업 · 구현+전용 검증** |
| 125 | P0 | measurement, transient, renormalization 각각은 정수여도 개별·합산 ceiling 또는 `steps×dt` overflow를 우회할 수 있었다. | 세 종류 개별 ceiling, 8,000,000 total-step cap, 유한한 measurement/total horizon을 함께 검증한다. | **이번 작업 · 구현+전용 검증** |
| 126 | P0 | flip basin이 `round(maxTime/dt)`를 쓰면 `maxTime<dt`에서 full step을 실행하거나 잔여 horizon을 버려 분류가 바뀔 수 있었다. | full steps 뒤 정확한 shortened remainder step을 실행하며 remainder-only와 동등 horizon fixture를 고정했다. | **이번 작업 · 구현+전용 검증** |
| 127 | P0 | basin의 `n`, per-cell steps가 각각 cap 이하여도 512² grid의 aggregate work가 한도를 넘을 수 있었다. | resolution, per-cell, overflow-safe aggregate 150,000,000-step budget을 allocation 전에 모두 검사한다. | **이번 작업 · 구현+전용 검증** |
| 128 | P0 | `sampleEvery=0`, 소수·Infinity samples/transient 또는 큰 `samples×stride`가 빈 series를 정상 결과처럼 만들거나 loop를 고갈시킬 수 있었다. | 각 loop control을 safe integer로 검증하고 50,000,000 total sampled/transient steps를 넘으면 거부한다. | **이번 작업 · 구현+전용 검증** |
| 129 | P0 | sampling 초기 상태나 사용자 observable이 NaN/Infinity여도 downstream 0–1/RQA가 regular 또는 수치 결과처럼 응답할 수 있었다. | state와 매 observable sample의 유한성을 검사하고 worker는 정상 response 대신 typed error response를 돌려준다. | **이번 작업 · 구현+전용 검증** |
| 130 | P0 | RQA는 point cap만으로는 높은 embedding dimension의 `N²m` distance work와 block fan-out을 막지 못한다. | points 4,000, embedding/dense cells 16M, component evaluations 64M, blocks 1,024를 allocation 전에 독립 검증한다. | **이번 작업 · 구현+전용 검증** |
| 131 | P0 | 단일 FTLE trajectory도 큰 state dimension이 `n(n+1)` STM allocation과 Jacobi cost를 폭증시킬 수 있었다. | state dimension 128과 trajectory 2,000,000 steps ceiling을 STM 생성 전에 적용한다. | **이번 작업 · 구현+전용 검증** |
| 132 | P0 | FTLE field의 `n`·horizon이 각각 정상이어도 `n²×trajectorySteps`가 대규모 계산 DoS를 만들 수 있었다. | `n=2..512`, 유한 증가 range, per-trajectory·aggregate 150,000,000-step budget을 preflight한다. | **이번 작업 · 구현+전용 검증** |
| 133 | P0 | parameter estimation은 optimizer가 forward model을 반복하므로 한 평가의 과대 observation span만으로도 전체 fitting이 멈출 수 있었다. | 모든 time gap의 exact step count를 합산해 평가당 2,000,000 forward steps 이전에 거부한다. | **이번 작업 · 구현+전용 검증** |
| 134 | P0 | 극단적이지만 유한한 mass/length/gravity/velocity/time 값은 기존 finite 검사와 `1e8` 절댓값 guard를 비일관적으로 통과했다. | `SESSION_SAFETY_BOUNDS`를 단일 solver-safe source로 두고 constructor/import/legacy sync에 동일 적용한다. | **이번 작업 · 구현+전용 검증** — `src/validation/sessionConstraints.ts`, `tests/session-contracts.test.ts` |
| 135 | P1 | 여러 회전의 angle과 역사적 `verlet` alias는 물리적으로 유효해도 DOM range와 integrator select에서 silent clamp/빈 선택을 만들 수 있었다. | angle은 principal range로, `verlet`은 `leapfrog`로 canonicalize한 뒤 store·runtime·export가 같은 값을 사용한다. | **이번 작업 · 구현+전용 검증** |
| 136 | P0 | headless 연구 범위가 interactive range보다 넓으므로 StateStore 통과만으로 UI에 쓰면 browser가 값을 몰래 clamp할 수 있었다. | 별도 `validateLabSnapshot`, 선언형 `LAB_CONTROL_BOUNDS`, app markup parity test로 interactive representability를 강제한다. | **이번 작업 · 구현+전용 검증** |
| 137 | P0 | select option 누락이나 range clamp가 중간에 발견되면 먼저 쓴 control·StateStore·LabApp이 서로 다른 상태로 남을 수 있었다. | 모든 write를 먼저 계획하고 read-back하며 실패 시 DOM/store를 rollback한 뒤 단일 snapshot commit으로 복원한다. | **이번 작업 · 구현+전용 검증** |
| 138 | P1 | import/export가 canonical state를 쓰더라도 실제 run mode·simTime·seed·SPF를 adopted runtime과 동기화하지 않으면 replay가 다른 실행을 만든다. | StateStore patch가 adopted runtime 전 필드를 동기화하고 LabApp은 canonical snapshot에서 재개하며 export는 실제 run mode를 기록한다. | **이번 작업 · 구현+전용 검증** |
| 139 | P0 | `WorkerBridge` fallback은 invalid state, NaN `dt`, 소수/과대 steps, 지원되지 않는 method를 worker path와 다르게 받아 계산할 수 있었다. | worker 사용 여부를 결정하기 전에 state 1..4096, finite values, `dt∈(0,1]`, steps 1..100,000, method allowlist를 검증한다. | **이번 작업 · 구현+전용 검증** — `src/runtime/WorkerBridge.ts`, `tests/worker-fallback-notice.test.ts` |
| 140 | P1 | fallback의 `Math.max(1, steps)` 보정은 0·음수 요청을 한 스텝 실행해 잘못된 성공으로 바꿨다. | 보정을 제거하고 검증된 정확한 step count만 실행하며 worker 부재·큰 fallback 경고를 유지한다. | **이번 작업 · 구현+전용 검증** |
| 141 | P0 | `ChaosClient` worker가 response를 잃으면 요청 timer뿐 아니라 worker listener가 영구 유지될 수 있었다. | validated default/request deadline, typed timeout, pending 제거, timer clear, worker detach를 한 원자 경로로 처리한다. | **이번 작업 · 구현+전용 검증** — `tests/chaos-client.test.ts` |
| 142 | P0 | 한 worker timeout 뒤 같은 worker의 다른 pending 요청을 그대로 두면 이후에도 응답 불가능한 Promise가 남는다. | timed-out 요청은 `ChaosRequestTimeoutError`, 나머지는 `ChaosWorkerResetError`로 reject하고 모든 deadline을 지운다. | **이번 작업 · 구현+전용 검증** |
| 143 | P1 | 동일 id의 두 요청이 pending resolver를 덮어써 첫 호출을 고아 Promise로 만들 수 있었다. | collision을 `ChaosRequestIdCollisionError`로 거부하고 기존 pending entry는 변경하지 않는다. | **이번 작업 · 구현+전용 검증** |
| 144 | P0 | worker `error` 또는 동기 `postMessage`/clone 실패가 listener·timer를 남기고 이후 client를 영구 실패 상태로 만들 수 있었다. | 전 pending reject·listener 제거·terminate 후 `started=false`로 되돌려 다음 호출이 새 worker를 만들게 한다. | **이번 작업 · 구현+전용 검증** |
| 145 | P1 | worker가 없는 deferred main-thread fallback도 `dispose()` 뒤 timer가 실행되어 이미 종료한 computation을 시작할 수 있었다. | fallback timer를 pending record에 포함해 terminate/dispose에서 취소하고 typed disposed error 후 lazy restart를 허용한다. | **이번 작업 · 구현+전용 검증** |
| 146 | P0 | ZIP build/parse path가 `..`, absolute/drive path, 제어문자, 빈 segment 또는 대소문자 duplicate를 허용하면 추출·manifest 의미가 충돌한다. | UTF-8 path budget과 canonical slash 검증을 build/parse 양쪽에 적용하고 case-insensitive duplicate를 거부한다. | **이번 작업 · 구현+전용 검증** — `tests/zip-bundle.test.ts` |
| 147 | P0 | 조작된 EOCD/central length, 과대 count·entry·aggregate size, trailing bytes가 slice 전에 큰 allocation 또는 truncated parse를 유발할 수 있었다. | 1,024 entries, 128 MiB/entry, 256 MiB aggregate/archive, 1,024-byte path와 모든 range/central-end 일치를 검사한다. | **이번 작업 · 구현+전용 검증** |
| 148 | P0 | encrypted/deferred/symlink entry, local-central metadata 차이, data overlap과 CRC mismatch는 서로 다른 bytes/path를 신뢰하게 할 수 있었다. | STORE-only, flag/size/path/CRC 일치, symlink 거부, local-data-central non-overlap을 모두 검증한다. | **이번 작업 · 구현+전용 검증** |
| 149 | P1 | CSV formula prefix 앞의 공백·탭 또는 signed-looking string은 단순 첫 글자 검사로 spreadsheet 실행을 우회할 수 있었다. | 비숫자 값의 optional whitespace 뒤 `=,+,-,@`를 neutralize하고 실제 number는 보존하는 table-driven test를 추가했다. | **이번 작업 · 구현+전용 검증** — `tests/research-export-utils.test.ts` |
| 150 | P0 | service worker는 정적 문자열 검사만 통과해도 clone timing, `waitUntil`, offline fallback, foreign-cache 보존이 실제 실행에서 깨질 수 있었다. | VM 기반 CacheStorage harness로 install/activate/fetch를 실행해 clone-before-consume, scoped cleanup, 96-entry eviction, cache hit/non-OK/offline/non-GET/cross-origin을 검증한다. | **이번 작업 · 구현+전용 검증** — `tests/service-worker-behavior.test.ts` |

## 완료 기준

이번 작업의 코드 변경을 릴리스로 인정하려면 최소한 다음을 모두 통과해야 한다.

1. `npm run lint`, `npm run typecheck`, `npm run test:quick`, `npm run test:slow`, `npm run verify`
2. `npm run test:e2e:mainline`, PWA offline/update smoke, import/export round-trip
3. `npm run audit:modules`, `npm run audit:legacy`, `npm run audit:mojibake:strict`, `npm run budget`, `npm audit --audit-level=high`
4. 생성 보고서가 의도한 과학 결과 변경인지 단순 timestamp 재생성인지 검토하고, 후자라면 커밋 범위에서 제외
5. 랜딩 저장소의 evidence snapshot을 새 source commit에서 재생성하고 문구·OG provenance를 다시 동기화

외부 조건 5개(NVIDIA, AMD, npm, Zenodo, 최종 attestation)는 로컬 코드 품질과 별도로 남겨야 하며, 완료되지 않은 상태를 UI나 문서에서 “완료”로 표현하면 안 된다.
