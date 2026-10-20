# S16 확률·격자·장 Lab

S16은 `next.html#/lab`에서 확률 앙상블과 공간 분포를 기존 계산 경계에 연결한다. 기존 `app.html`, 물리 엔진, 공개 API와 저장 데이터는 보존한다. 이 문서는 구현의 적용 범위와 수치 해석상의 한계를 기록한다. 수치 fixture와 코드 대조는 사람의 과학 검토를 대신하지 않는다.

## 기존 계산 경계

| 모델 | 기존 공개 경계 | 계산 의미와 제한 |
|---|---|---|
| Langevin | `eulerMaruyamaStep`, `gaussianSampler`, `runLangevinEnsemble` | 명시한 drift에 가산 Itô 잡음을 더하는 유한 경로·앙상블. 강수렴/약수렴은 해석·잡음·적분법의 전제를 따른다. |
| FPUT | `createFputModeState`, `fputVelocityVerletStep`, `fputEnergy`, `fputModeEnergies` | 단위 질량 N개, 양쪽 고정 벽, N+1개 비조화 spring bond. `[q 전체,p 전체]` 상태를 전용 velocity-Verlet로 전진한다. |
| 조화 격자 | `ringPhononDispersion` | 주기 고리의 조화 극한에서 각 mode의 각진동수 제곱을 직접 평가한다. 비선형 장의 시간 적분과 구별한다. |
| sine-Gordon | `createSineGordonField`, `stepSineGordon`, `sineGordonFieldEnergy`, `topologicalCharge` | 정규화된 1차원 장. 균일 공간 중앙 차분과 leapfrog의 현재/이전 두 시간층을 보존한다. |
| 정적 FK | `relaxFrenkelKontorovaKink`, `frenkelKontorovaEnergy` | 양 끝을 0과 2π로 고정한 정적 Newton 정상점 탐색. 별도 native `peierlsNabarroBarrier`는 보존되며, 화면이 동적 탈고정·이동도·비정합 solver까지 제공한다고 주장하지 않는다. |

## 좌표·단위·경계

FPUT의 질량과 조화 spring 계수는 1로 정규화되어 있다. 변위·운동량·시간·에너지는 이 정규화의 값이며 실측 m·kg·s·J로 보정한 결과가 아니다. `fputModeEnergies`는 선형 정상모드에 투영한 **조화 부분**의 에너지다. α 또는 β가 0이 아니면 mode 에너지의 합과 전체 비선형 Hamiltonian을 같다고 해석하지 않는다. 유한 관찰에서 mode 에너지가 되돌아온 사실만으로 일반적인 재귀 시간이나 열평형 부재를 증명하지 않는다.

조화 고리의 wave number는 site마다의 위상차 `q_k=2πk/N`다. `ringPhononDispersion`의 반환값은 ω가 아니라 ω²이며, 실제 격자 간격을 지정하지 않은 축을 m⁻¹로 표시하지 않는다. 이원자 분산의 별도 native 도구와 같은 입력 형식으로 혼동하지 않는다. 고리 해석식은 고정 벽 FPUT의 sine mode와 경계·mode index가 다르다.

sine-Gordon의 파동 속도와 기판 기준 진동수는 1이다. 장 u는 rad, 공간·시간·에너지는 정규화 값이다. 주기 경계는 `dx=L/N`으로 마지막 점 다음을 첫 점에 연결하고, 고정 경계는 `dx=L/(N−1)`으로 양 끝을 포함한다. 고정 경계는 초기 profile의 양 끝값을 계속 유지하며 흡수 경계가 아니다. 벽 반사와 유한 영역의 영향이 관찰에 섞일 수 있다. 주기 경계의 profile에 단일 kink의 불연속 끝값을 그대로 넣으면 큰 이음매 gradient가 생긴다.

native 장 초기화는 `uPrev=u−dt·u_t+dt²·(Δ_xu−sin u)/2`의 Taylor back-step을 사용한다. 고정 경계의 `uPrev` 끝값은 초기화 단계에서 별도로 고정하지 않으므로 첫 에너지의 끝점 backward-rate가 초기 속도와 다를 수 있다. adapter가 native 경계를 보존하는 동안 이 시작 효과도 보존된다. 에너지는 `(u−uPrev)/dt`의 후방 시간 차분을 사용하는 이산 진단이며 연속장의 정확한 Hamiltonian과 같다고 주장하지 않는다. endpoint 차이로 계산한 위상전하는 유한 창의 profile 진단이고, 임의 주기 profile의 일반 winding 검출기가 아니다.

`dt<=dx`만으로 비선형 모든 상태의 정확성과 안정성을 보장하지 않는다. vacuum 주변의 선형화에서 최대 stencil 진동수는 `sqrt(1+4/dx²)`로 제한되므로 해당 leapfrog의 `dt·sqrt(1+4/dx²)<=2` 조건보다 여유 있게 설정하고, dx와 dt를 각각 세분화해 관찰을 확인해야 한다. 큰 진폭·급격한 profile과 긴 계산에는 별도 수렴 검사가 필요하다.

FK의 결합 K, 에너지, site 좌표도 정규화 값이다. native Newton은 최소 에너지 상태만 찾는 알고리즘이 아니며 seed가 속한 대칭 정상점이나 saddle에 수렴할 수 있다. `gradNorm`, 반복 수와 종료 조건을 함께 확인한다. 주 실행의 FK adapter는 최종 profile을 native 진자 network RHS에 넣어 interior 잔차를 다시 평가한다. 별도 pinning 비교 도구는 native의 보수적인 반환 잔차를 함께 표시한다. 반복 제한에 걸린 native 반환 `gradNorm`은 마지막 update 이전 평가일 수 있으므로 이를 최종 상태의 검증된 잔차로 과장하지 않는다. 두 정상점의 에너지 차이는 지정된 유한 사슬과 계산 허용오차에서 얻은 정적 비교이며 실제 탈고정 힘이나 동적 임계속도가 아니다.

## 독립적인 native 진단

Analysis 화면의 이원자 분산, FK 정적 pinning 비교, Arrhenius 탈출 시간은 각자 입력을 받는 독립 도구다. 위 실행에서 매개변수나 장벽을 자동 추정하지 않으며, 실험의 canonical JSON·공유 상태에 별도 도구의 입력이 포함된다고 주장하지 않는다. 각 도구의 **JSON 다운로드**는 `pendulum-field-diagnostic/v1`에 입력·단위·native 계산 경계·행/열·해석을 저장한다. 이 파일이 독립 진단의 재현 설정이다. 입력 오류 시 마지막 유효 결과와 그 결과의 다운로드를 유지한다.

- 이원자 분산은 질량 kg, spring 상수 N/m, 두 원자 cell 길이 m와 기판 진동수 제곱 s⁻²를 사용한다. 음향·광학 가지 rad/s, band gap, native 중앙 차분 group velocity m/s를 표시한다. 위 단원자 고리의 정규화 ω² profile과 다른 SI 설정이다. 표본은 2–128개다. pinning이 있으면 native의 unpinned sound-speed 공식을 적용하지 않는다.
- FK 비교는 홀수 5–127개 site, 최대 200회 Newton 반복으로 두 중심을 비교한다. 수렴 미확인 결과에는 에너지 차이를 확정 장벽으로 해석하지 말라는 안내를 표시한다.
- Arrhenius 도구는 `arrheniusMTTF`에 양의 시도율·열 에너지와 비음수 활성화 에너지를 전달한다. 에너지 두 값은 같은 정규화 단위다. 현재 확률 진자의 탈출 궤도나 최적 잡음을 계산하지 않는다. 지수식의 overflow는 화면에 수치 한계로 표시하고 JSON에 `positive-infinity`라는 명시 토큰을 남긴다. JSON `null`이나 유한값으로 바꾸지 않는다.

## seed·앙상블 재현

확률 경로는 seed 숫자만으로 정의되지 않는다. drift/잡음 모델 버전, 초기조건, dt, 경로 길이, 경로 수, 생성기와 정규분포 변환, 경로별 seed 유도 순서를 함께 보존한다. S16의 `fnv1a-mulberry32-boxmuller` version `1`은 seed 문자열과 stable `member-N` ID를 FNV-1a uint32로 바꾸고 native mulberry32·cached Box–Muller Gaussian을 호출한다. 경로 수를 바꾸어도 앞의 member ID에 대응하는 stream은 같다. 기존 `runLangevinEnsemble`의 SplitMix 경로 seed mapping과는 다른 명시적인 계약이며 같은 숫자 seed의 과거 ensemble과 bitwise 같다고 주장하지 않는다. 평균·분산은 경로 순서의 Welford 통계와 n−1 불편 표본 분산이다. 가산 잡음 계수가 0인 성분은 Gaussian 표본을 소비하지 않으므로 noise 성분의 순서·0 여부도 경로를 바꿀 수 있다.

같은 seed·같은 설정의 반복 일치는 해당 구현의 결정론 검사다. 경로 수가 작은 앙상블의 평균·분산은 통계적 불확실성이 있고, 하나의 경로가 평균을 따라가야 하는 것은 아니다. 같은 seed에서 dt를 바꾸어 얻는 경로가 같은 Brownian 실현이라는 보장은 없다. native의 별도 frozen Brownian grid API만 같은 세밀 경로의 증분을 공유하는 계약을 제공한다. S16의 가산 Itô 화면에서 일반 행렬 잡음·Milstein·Stratonovich 기능까지 검증했다고 주장하지 않는다.

Langevin 화면의 모델은 단위 질량·길이·중력을 사용하는 단일 진자의 각속도에 가산 잡음을 넣는다. 감쇠와 잡음은 독립 설정이며 fluctuation–dissipation 관계나 열평형 온도를 강제하지 않는다. 평균 θ는 unwrapped 각도의 산술 평균이다. summary의 분산은 θ의 n−1 표본 분산이며 원형 통계의 분산이 아니다. Gaussian stream cursor를 저장하지 않은 확률 중간 상태를 정확한 재시작으로 export하지 않는다. 저장한 초기조건과 seed에서 재실행한다.

## 데이터·검증·보존

공간 profile과 시간 표본은 계산 원본과 표시용 축약본을 구별해야 한다. raw export는 **보존된** 모든 표본·공간 cell을 뜻하며 계산한 모든 시간 단계를 뜻하지 않을 수 있다. CSV의 source stride는 보관 정책의 명목 간격이며 마지막·현재 표본은 그 간격 밖에서 포함될 수 있다. 축약본의 각 행에는 실제 solver step과 시간이 있으므로 이를 기준으로 간격을 판단한다. 실행 계보에는 보관 표본 수와 명목 stride를 기록한다. 축약된 heatmap의 peak나 좁은 kink 폭을 raw profile의 정량 측정으로 혼동하지 않는다.

adapter의 공통 예산은 격자 최대 128점, Langevin 2–64 member, 100,000시간 단계, 합계 2,000,000 member/grid update다. 주 실행의 시간 간격은 10⁻⁵–0.05이고 길이는 300 이하이며 dt의 정수 배수여야 한다. 시간·상태는 정규화 값이다. 시간 표본은 자동 stride로 최대 1,001개를 보존하고 마지막 표본을 포함한다. worker 요청 하나는 최대 64단계이며 단계 사이 8ms soft budget을 확인한다. 초기화나 한 native 단계 자체의 엄격한 8ms 마감 시간은 아니며 사용자 기기에 따라 달라진다. 큰 요청은 scale이나 기간을 줄이라는 오류로 거부한다. 공통 JSON의 크기·구조 제한도 적용된다.

선택 수치 fixture에서 기존 native와 비교한 FPUT 상태·에너지·mode, sine-Gordon 두 경계의 u/uPrev·에너지·charge, lattice ω², FK profile·에너지와 seeded Langevin 경로·평균·θ분산의 최대 차이는 0이었다. 허용오차는 10⁻¹²다. 조화 FPUT의 dt를 0.04에서 0.02로 줄일 때 정규화 시간 10 동안의 최대 상대 에너지 변화는 약 1.198×10⁻⁴에서 2.996×10⁻⁵로 감소했다. SG kink의 길이 30·t=1·dt=0.01 fixture에서 공간점 41→81 세분화의 profile 최대 오차는 약 0.0481→0.0122였다. 이는 해당 설정의 관찰이며 일반 수렴 보증이 아니다.

검증은 같은 native 경계에 대한 상태·통계·에너지의 허용오차 비교, 고정/주기 경계, harmonic/continuum fixture, seed 반복·공유 round trip과 메모리·취소 경로를 포함한다. 정확한 설정과 측정값은 [수치 측정](stage-runs/S16-numerical-metrics.json), [단계 진행](stage-runs/S16-progress.md)에 기록한다. 선택 fixture의 통과는 임의 매개변수의 안정성·정확성 증명이 아니다.

S16은 별도 사용자 승인 gate가 아니다. AI만 수행한 소스 감사와 자동 검증을 `human-reviewed`로 표시하지 않는다. 과정 7의 콘텐츠 출판, 공통 sweep/ensemble 설계기, 양자·사상 계와 기본 앱 전환은 각각 해당 후속 단계의 범위다. 기존 `app.html`과 S15 완료 commit `64db09a`가 복구 기준이다.
