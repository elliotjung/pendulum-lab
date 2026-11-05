# 과정 7 — 실제 공용 계산과 해석 범위

S27의 7.1~7.13은 기존 S15~S17 adapter와 보존된 native 물리 함수를 호출한다. 새 운동방정식이나 적분기는 만들지 않았다. `frontier-focus-*`는 제한 입력·초기 장·표본 요약·동반 계산을 연결한다. 콘텐츠는 한국어/영어의 전제, 유도, 단위, 관찰 과제, 두 확인 질문, 출처를 가진다.

| 단원 | 실제 계산 | 해석 한계 |
|---|---|---|
| 7.1 | 자기 RK4 궤적과 native semi-implicit Euler basin grid | 정착 여부 보존; 유한 시간 최근접 자석은 엄밀한 basin/Wada 인증이 아님 |
| 7.2 | 8-link 실제 비선형 고리와 native ring spectrum | 균일 최근접 고리의 선형 spectrum이며 큰 진폭 모드 추정과 구분 |
| 7.3 | Huygens 위상쌍의 양/음 결합과 native 양의 결합 잠금 예측 | 지지대 반동·진폭·탈진기 없는 축약 모델 |
| 7.4 | 동일 seed의 16-node 위상계와 실제 K 절단 scan | 유한 크기·시간의 R이며 무한집단 임계값 인증이 아님 |
| 7.5 | 32-node 비국소 고리의 국소 coherence·순간 분류 | 유한 시간 candidate이며 chimera 안정성 인증이 아님 |
| 7.6 | 독립 native Gaussian stream Euler–Maruyama 앙상블 | unwrapped 표본 통계, 기록 사이 탈출 누락과 seed/step 규약 명시 |
| 7.7 | 실제 비선형 앙상블 histogram과 시간 의존 선형화 Kramers Gaussian 해 | 정확한 비선형 PDE 격자 solver가 아니며 작은 각도 근사·유한 표본 비교 |
| 7.8 | N=8, β=0.5 FPUT native velocity-Verlet·mode energies | 짧은 시간 회귀 후보, 조화 에너지 합과 비선형 총 에너지 구분 |
| 7.9 | 16-link 실제 비선형 고리의 국소 packet·onsite 참여 수 | 유한 시간 국소화이며 주기 breather/Floquet 인증이 아님 |
| 7.10 | native kink/breather/kink–antikink 초기 장의 leapfrog 진화 | 유한 격자·fixed 경계·초기 중첩 오차, 연속체 정확해와 별도 비교 |
| 7.11 | native stationary kink·PN 차이, 고정 경계 비정합 FK chain의 정지 힘/수치 Hessian과 impulse depinning·수송 | 유한 고정 경계/시간/국소 최소의 impulse protocol이며 무한 Aubry·정상 force/velocity mobility 인증과 구분 |
| 7.12 | 실제 standard map 원통 반복 | p를 감싸지 않음; 단일 궤적으로 전역 KAM 붕괴나 확산계수 인증 불가 |
| 7.13 | 실제 N=8 QKR 진화·같은 격자 spectrum·별도 4×4 unitary 연산자 | 작은 격자 포화와 동역학적 국소화를 구분; 고전 단일 궤적은 ensemble 대조군 아님 |

## 7.7의 밀도 비교

실제 경로는 native `field.ts`의 비선형 진자와 Euler–Maruyama를 사용한다. 비교 곡선만 `sin(theta)≈theta`인 선형화 Kramers/Fokker–Planck 방정식의 해석적 Gaussian 주변분포다. 감쇠 0~1의 underdamped 범위에서 평균과 impulse-response 제곱 적분의 닫힌식을 평가한다. 새 궤적 solver나 PDE solver는 없다. t=0, 감쇠0, 짧은 시간 분산 극한 및 실제 seed 앙상블을 독립 fixture로 비교한다.

## 7.11의 유한 비정합·impulse protocol

교육과정 지도의 기판/비정합과 pinning·수송 질문을 유한 chain의 impulse protocol로 구현한다. 기준41-site 단일 kink의 native Newton/PN 차이와 별도로25-site chain의 고정 끝점 차를 `2πρ(N−1)`로 잡아 평균 기판/격자 비정합비ρ를 조절한다. 일정한 자연 간격을 가진 FK 탄성 에너지를 펼치면 native 제곱 차 에너지와의 차이는 끝점 항과 상수다. 고정 끝점에서는 내부 힘이 같으므로 새 운동방정식 없이 native `rhsPendulumNetwork`를 사용한다.

공용 `findPeriodicOrbit` Newton을 정지 힘 영점 찾기에 재사용하고 `mapJacobianFD`/`jacobiEigenSymmetric`으로 수치 Hessian의 최소 고유값을 확인한다. 실제 힘 잔차<1e-7, 최소 수치 고유값>1e-6을 만족한 정지 국소 최소에서 내부 링크에 동일한 초기 각속도 impulse를 준다. 동반 sine-Gordon 격자의 `dx=1/sqrt(K)`는 동일 FK 결합 K를 재현하며 보존된 native leapfrog만 실행한다.

ρ=1과 선택ρ(기본 약0.618)를 동일한 K와 impulse 표본에서 비교한다. 내부 평균 위상이 관찰 기간에 한 기판 주기 이상 이동했는지와 실제 이동/시간을 기록한다. 이는 **유한 시간 impulse depinning 기준과 transient 수송률**이다. 지속 외력의 정상 force/velocity mobility, 무한 무리수 chain의 Aubry 전이, 전역·영구 depinning 임계값을 인증하지 않는다. 정지 힘/최소 조건 실패 시 수송 판정을 생략한다. 단일-kink PN 차이를 비정합 다중-site chain의 장벽으로 바꾸어 표시하지 않는다.

## 저장·전달·단위

기준 run의 정확한 canonical 물성·초기조건·seed·경계·stepper를 전달한다. 동반 scan·선형화 밀도·모드 비교·PN/비정합 impulse chain·고전/별도 unitary 계산은 결과에 남고 단일 기준 run으로 위장하지 않는다. 7.11의 Lab 전달은41-site stationary FK baseline이며25-site 비정합/impulse 설정과 수송은 단원 fields와 결과 JSON에 남는다.

기계 네트워크는 SI 시간·각도·에너지를 사용하고 비틀림 결합의 canonical 단위는 J(각도가 무차원인 J/rad²)다. 자기·field·QKR 값은 각 adapter의 정규화 규약을 명시한다. field canonical 시간 슬롯 `s`는 기존 저장 호환용이고 `modelOptions.timeConvention=normalized`가 해석을 지정한다.

## 검증과 출처

- `tests/product/experiments/frontier-focus.test.ts`: native 13개 실행, 13개 canonical round trip, 경계/실패·seed·작은 진폭·Gauss 극한·전하·PN/비정합 impulse·norm 등의 테스트를 수행한다. 최종 전체 단계 검증은 S27 progress의 증거를 따른다.
- owned Prettier 및 ESLint 검사 통과. 사람/물리 전문가 검토와 실제 screen-reader 음성·실기기 인증을 수행하지 않았다.
- native 출처는 S26 status `9cfd9842570cdd3137e3ea866a1266de2585b941`에 고정한다.
- 외부 1차 자료의 공개 초록/저자본과 native 소스를 대조했다. [Uhlenbeck–Ornstein](https://doi.org/10.1103/PhysRev.36.823)은 조화 구속 Gaussian 분산과 밀도식 연결을, [Abrams–Strogatz](https://arxiv.org/abs/nlin/0407045)는 비국소 위상 고리의 정렬/drift 공존을 지원한다. [Fermi–Pasta–Ulam 원 보고서](https://digital.library.unt.edu/ark:/67531/metadc1018377/)는 비선형 모드 재분배의 연구 질문과 비교한다.
- [Ferreira–Piette–Zakrzewski 저자본](https://arxiv.org/abs/0708.1088)의 kink/breather·경계·산란 맥락, [Aubry 원 연구](https://digital.library.unt.edu/ark:/67531/metadc1056922/)의 비정합 구조/Peierls 힘과 현재 범위 차이를 구분한다. [Chirikov–Shepelyansky](https://www.scholarpedia.org/article/Chirikov_standard_map)는 원 연구자가 쓴 사상/원통 규약이며 [Casati 외](https://doi.org/10.1103/PhysRevLett.64.5)는 유한 torus의 양자 국소화 스케일링 맥락이다.
