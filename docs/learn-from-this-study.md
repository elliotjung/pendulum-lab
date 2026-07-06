# LEARN FROM THIS!!! — 24개 소스 프로젝트 분석 및 통합 보고서

> 분석 대상: `C:\Users\junge\Desktop\LEARN FROM THIS!!!`의 zip 아카이브 24개.
> 목적: 각 프로젝트의 핵심 아이디어·장점을 정리하고, Pendulum Lab에 **실제로
> 가치를 더하는 것만** 선별하여 기존 아키텍처에 맞게 재설계·통합한다.
> 통합 결과 요약은 마지막 절, 제어 모듈의 상세 설계 근거는
> [`docs/control-module.md`](control-module.md) 참조.

## 선별 원칙

1. **중복 배제** — 이미 이 프로젝트가 더 잘하는 것은 가져오지 않는다
   (예: 카오스 진단, 재현성 파이프라인, 수렴 차수 검증은 이 저장소가
   소스 프로젝트들보다 훨씬 깊다).
2. **아이디어를 이식하되 코드는 이식하지 않는다** — 모든 채택 기능은
   이 저장소의 타입 시스템(`Derivative`/`StateVector`/레지스트리 계약),
   테스트 관습(계약 테스트 + 수치 보정값 고정), 의존성 원칙(런타임
   의존성 0)에 맞춰 처음부터 다시 설계했다.
3. **브라우저/TS 환경에 맞는 것만** — 대형 C++ 멀티바디 엔진의 접촉
   해석기나 GPU 파이프라인 전체를 옮기는 것은 목적에 맞지 않는다.
   그들의 *설계 패턴*과 *알고리즘*을 가져온다.

---

## A군: 직접 채택 — 구현으로 이어진 프로젝트

### 1. `double_pendulum-main.zip` — DFKI-RIC Double Pendulum Benchmark ★ 최대 기여

- **정체**: 실물 하드웨어(acrobot/pendubot)까지 이어지는 이중진자
  스윙업·밸런싱 컨트롤러 벤치마크. LQR, TVLQR, iLQR(MPC), 에너지 셰이핑
  (Xin & Kaneda), RL(SAC/DQN), region-of-attraction(RoA) 추정까지 포함.
- **핵심 아이디어**: 이중진자를 "관측 대상"이 아니라 **"제어 대상"**으로
  본다. 완전구동(full)/미구동 관절(acrobot: 팔꿈치만, pendubot: 어깨만)
  세 가지 구동 모드를 하나의 플랜트 위에서 비교한다.
- **장점**: 컨트롤러 추상화가 플랜트와 분리돼 있고, LQR의 RoA를 2차형식
  `x'Px < c`로 게이팅하는 실전적 하이브리드 설계.
- **이 저장소에 없던 것**: 제어 자체. 기존에는 OGY 카오스 제어(맵 레벨)만
  있었고 토크 입력 동역학이 없었다.
- **채택** → `src/control/` 신설:
  - `actuated.ts` — `rhsDouble`을 항별로 미러링한 토크 입력 동역학
    (τ=0이면 `rhsDouble`과 비트 단위 일치, 테스트로 고정). 관절토크 →
    일반화력 매핑(가상일: Q₁=τ₁−τ₂, Q₂=τ₂)과 세 가지 구동 모드.
  - `lqr.ts` — dfki `lqr.py`는 `scipy.solve_continuous_are` 호출 한 줄이다.
    여기서는 의존성 없이: 해석적 선형화(`jacobianDouble` + 폐형식 B) →
    Van Loan 블록 행렬지수 ZOH 이산화 → DARE 값 반복(안정화 초기 게인
    불필요) → 폐루프 고유값(`eigenvaluesGeneral` 재사용)으로 "안정화"를
    검증된 주장으로 만든다.
  - `swingup.ts` — 에너지 셰이핑 스윙업(dE/dt = k_e(E_up−E)‖ω‖² ≥ 0의
    리아푸노프 논증) + dfki RoA식 2차형식 캡처 게이트로 LQR에 인계.
  - dfki의 RL 컨트롤러(SAC/DQN)는 **불채택**: 학습 가중치 재현성이 이
    저장소의 "모든 수치에 증거 배지" 원칙과 충돌하고, 이미
    `reservoir.ts`/`hamiltonianLearning.ts`가 학습 계열을 담당한다.

### 2. `crocoddyl-devel.zip` (+ `ocs2-main.zip`, `drake-master.zip`의 해당 부분) — DDP/iLQR 최적제어

- **정체**: Crocoddyl은 LAAS/pinocchio 진영의 DDP 계열 최적제어
  라이브러리(FDDP/BoxDDP), OCS2는 ETH의 SLQ/iLQR MPC 툴킷, Drake는 MIT의
  종합 로보틱스 시뮬레이션·최적화 플랫폼.
- **핵심 아이디어**: 스윙업 같은 대역 문제는 피드백 법칙 하나로 못 푼다 —
  **궤적 최적화(백워드 리카티 + 라인서치)**로 푼다. 세 프로젝트 공통 구조:
  롤아웃 → 코스트/동역학 2차 전개 → 정칙화된 백워드 패스 → 피드백을 유지한
  포워드 라인서치.
- **채택** → `src/control/ilqr.ts` facade와 `box-qp.ts` / `rk4-derivatives.ts` /
  `solver-core.ts` / `double-problems.ts` / `async-runner.ts`: 임의의 이산
  스텝맵 위 iLQR. Levenberg 정칙화(Quu+μI, 콜레스키 실패 시 μ 증가
  재시도), 백트래킹 라인서치(실제 감소만 수용 → 코스트 이력이 **구성상
  단조**, 테스트로 고정), 해석적 RK4 chain-rule 미분, torqueLimit용 exact
  box QP backward pass. 완전구동 스윙업(매달림→도립, 3 s), acrobot 회복,
  포화 토크 KKT 사례가 테스트로 고정됨.
- **추가 반영됨**: BoxDDP의 박스 제약 백워드 패스는 더 이상 불채택이 아니다.
  최신 `docs/control-module.md` 기준으로 각 knot에서 box QP를 정확히 풀고,
  포화 입력의 feedback row를 0으로 둬 rollout clamp와 라인서치가 싸우지
  않게 했다.
- **아직 불채택**: MPC 리시딩 호라이즌은 UI/worker JSON OCP spec과 warm-start
  재현성 계층이 먼저 필요하므로 별도 확장 과제로 남긴다.

### 3. `DifferentialEquations.jl-master.zip` — SciML 적분기 생태계

- **정체**: Julia SciML의 우산 패키지. 알고리즘 자체보다 **"문제-알고리즘-
  솔루션" 분리, 알고리즘 추천 시스템, 방대한 embedded pair 카탈로그**가
  본체.
- **핵심 아이디어**: 비강성 기본값은 RK45(Fehlberg/Dormand-Prince)가
  아니라 **Tsitouras 5(4) (`Tsit5`)** — 동일한 7-스테이지 FSAL 구조에서
  자유 계수를 재최적화해 선행 절단오차 계수가 더 작다.
- **채택** → `src/physics/adaptive.ts`의 `tsitouras54Step` + 레지스트리
  id `tsit5`. 기존 `dopri5`와 같은 비용에서 더 정확함을 테스트로 직접
  비교 고정(조화진동자 동일 dt 오차 비교). 계수 전사 오류는 수렴 차수
  붕괴로 즉시 드러나도록 기준 검증 사다리(`validate:reference`)에 자동
  편입(레지스트리 순회 방식이라 추가 코드 불필요).
- **불채택**: 강성 자동 전환(이미 TR-BDF2 보유), Vern7+ 고차쌍(이 문제
  스케일에서 GBS가 이미 고정확도 레퍼런스 역할).

### 4. `DynamicalSystems.jl-main.zip` — 카오스 진단 툴박스

- **정체**: JuliaDynamics의 우산 패키지(ChaosTools 등). 문서화 수준과
  지표 카탈로그의 폭이 강점.
- **핵심 아이디어**: 정렬 지표 가족 — SALI를 k개 편차벡터의 **평행체
  부피**로 일반화한 **GALI_k** (Skokos-Bountis-Antonopoulos 2007).
  GALI_k는 SALI가 못 보는 것을 본다: N차원 토러스 위 정규 운동은 k≤N에서만
  0에서 떨어져 유지되고(토러스 차원 판별), 하이퍼카오스는 각 양의 갭
  λ₁−λᵢ만큼 감쇠가 가팔라진다.
- **채택** → `src/chaos/gali.ts`: 기존 `variational.ts` 접선공간 기계
  (`makeVariationalRhs`/`seedTangentFrame`/`gramSchmidt`)를 그대로 재사용.
  부피는 단위벡터들의 수정 그람-슈미트 노름 곱(= thin QR의 R 대각 곱 =
  √det Gram)으로 계산 — SVD 의존성 없이 O(k²n). 테스트는 GALI₂와 SALI의
  대수적 브래킷(GALI₂ ≤ SALI ≤ √2·GALI₂)을 동일 접선류에서 고정하고,
  정규 이중진자에서 토러스 차원 분리(GALI₂ 생존 vs GALI₄ 감쇠)를 보정된
  진폭으로 고정.
- **불채택**: 어트랙터 재구성 유틸(이미 `delayEmbed`/`havok` 보유),
  `basins_of_attraction`(이미 basin 모듈이 더 특화됨).

---

## B군: 검토 후 불채택 — 이유와 함께

### 5. `pinocchio-devel.zip` / 6. `rbdl-master.zip` — 강체동역학 알고리즘 라이브러리

- **핵심**: Featherstone 공간대수 기반 O(N) ABA/RNEA/CRBA. 로봇 URDF 모델의
  사실상 표준. pinocchio는 해석적 미분(∂ABA)까지 제공.
- **불채택 이유**: 이 저장소의 N-체인은 폐형식 질량행렬(suffix-mass) +
  콜레스키로 이미 해석적이고, N≤8 규모에서 O(N)와 O(N³)의 차이는 무의미.
  ABA 도입은 검증 부담(새 EOM 경로 전체의 SymPy 대조 재구축) 대비 이득이
  없다. *채택된 영향*: pinocchio의 "해석적 미분 우선" 철학은 제어 모듈이
  B 행렬을 폐형식으로 쓰고 중심차분과 대조하는 테스트 패턴으로 반영됨.

### 7. `drake-master.zip` — (제어 외 부분)

- **핵심**: 다물체 시뮬레이션 + 시스템 프레임워크 + 최적화. LQR/트래젝토리
  최적화 사상은 A군 2번으로 흡수. 접촉/기하/URDF 스택은 범위 밖.

### 8. `chrono-main.zip` / 9. `raisimLib-master.zip` / 10. `dart-main.zip` — 대형 멀티바디/접촉 엔진

- **핵심**: 접촉·마찰(LCP/NCP), 차량/입자(FSI), 학습용 고속 물리.
- **불채택 이유**: 진자 실험실에 접촉 해석기는 물리적 범위 밖(이미
  `rope`/`double-string`의 단방향 장력 게이트로 필요한 하이브리드 전환을
  보유). 바이너리 의존성 원칙과도 충돌.

### 11. `simbody-master.zip` — SimTK 멀티바디

- **핵심**: 이벤트 처리와 제약 안정화(Baumgarte)가 교과서적.
- **불채택 이유**: 이벤트 위치 탐지는 이미 이 저장소가 dense-output 보간 +
  시컨트 루트파인딩으로 동급 이상을 구현(`eventLocator.ts`, claims #9).

### 12. `casadi-main.zip` — 알고리즘 미분 + NLP

- **핵심**: 표현식 그래프 AD, IPOPT 연동. dfki iLQR도 내부에서 사용.
- **불채택 이유**: 이 저장소의 dual-number 순전파 AD(`autodiff.ts`)가 이미
  N-체인 야코비안을 기계정밀도로 조립한다. 그래프 AD로의 전환은 전면
  재작성 대비 이득 없음. iLQR에는 중심차분으로 충분함을 문서화.

### 13. `tiny-differentiable-simulator-master.zip` — 미분가능 물리

- **핵심**: 템플릿 스칼라 타입으로 시뮬레이션 전체를 미분/듀얼 타입으로
  인스턴스화하는 설계.
- **불채택 이유**: 동일 아이디어가 이미 `DualArena` 기반으로 구현되어 있음
  (`jacobians.ts`). 흥미로운 확인: 우리의 접근이 업계 관행과 일치.

### 14. `ompl-main.zip` / 15. `fcl-master.zip` — 모션 플래닝/충돌

- **불채택 이유**: 샘플링 기반 플래닝(RRT*)과 충돌 검출은 진자 동역학
  연구실의 문제 도메인이 아님. 스윙업 "플래닝"은 iLQR(A군 2)로 해결.

### 16. `meshcat-master.zip` / 17. `vispy-main.zip` / 18. `VTK-master.zip` / 19. `Open3D-main.zip` — 시각화 스택

- **핵심**: meshcat(three.js 원격 씬 그래프), vispy(GPU 과학 시각화),
  VTK/Open3D(대규모 3D 데이터).
- **불채택 이유**: 이 저장소는 프레임워크 무의존 캔버스/자체 3D 렌더러가
  이미 있고 WebGPU 경로는 시각화가 아니라 **계산**에 사용(설계 선택).
  외부 씬그래프 도입은 CSP/의존성 원칙과 충돌.

### 20. `Double-Pendulum-NN-main.zip` — 신경망 궤적 예측

- **핵심**: 수천 개 궤적 CSV 데이터셋 + NN 학습.
- **불채택 이유**: 데이터 기반 동역학 학습은 이미 SINDy, HAVOK, DMD,
  reservoir(ESN), Hamiltonian learning으로 훨씬 넓게 커버됨. NN 가중치
  재현성 문제는 1번 항목과 동일.

### 21. `double-pendulum-master.zip` (Qt/C++) / 22. `double-pendulum-master (1).zip` (MATLAB) / 23. `Double-Pendulum-simulation-main.zip` (Simulink)

- **핵심**: 각각 데스크톱 앱(Qt), Newmark-Newton-Raphson·Verlet 비교(MATLAB,
  프랑스어), Simulink 모델. 교육용 단품 시뮬레이터들.
- **불채택 이유**: 세 프로젝트가 하는 모든 것(적분기 비교, 분기 다이어그램,
  에너지 추적, 선형성 한계)은 이 저장소가 불확실도·검증까지 붙여 상회.
  MATLAB판의 Newmark법은 구조동역학용이며 이 문제군에서는 TR-BDF2가 대체.

### 24. `ocs2-main.zip` — (2번에 부분 흡수)

- SLQ/MPC 사상은 iLQR 채택에 반영. 나머지(스위칭 시스템, 제약 MPC)는
  하드웨어 제어 도메인.

---

## 통합 결과 요약

| 채택 기능 | 소스 아이디어 | 이 저장소에서의 재설계 | 검증 |
|---|---|---|---|
| `tsit5` 적분기 | DifferentialEquations.jl의 비강성 기본값 | 레지스트리 계약(메타데이터·fail-closed 디스패치)에 편입, FSAL 7-스테이지, btilde 오차추정 | 수렴 차수 5 측정, dopri5 대비 동비용 정확도 우위, dt⁵ 오차 스케일링, 기준 검증 사다리 자동 편입 |
| `galiIndicator` | DynamicalSystems.jl(ChaosTools)의 GALI_k | 기존 변분 RHS·그람-슈미트 재사용, √det(Gram) 부피, SVD 무의존 | SALI 브래킷 항등식, 카오스 지수 붕괴, 토러스 차원 분리(보정 고정) |
| `src/control/actuated` | dfki 플랜트 + 구동 모드 | `rhsDouble` 항별 미러 + 가상일 토크 매핑, 폐형식 B | τ=0 비트 일치, B vs 중심차분, 주입 파워 항등식 |
| `src/control/lqr` | dfki `lqr.py` (scipy CARE) | Van Loan ZOH 이산화 + DARE 값 반복 + 폐루프 고유값 리포트(기존 `eigenvaluesGeneral` 재사용) | 행렬지수·이산화 폐형식 대조, DARE 고정점 잔차, 3개 구동 모드 Schur 안정, 비선형 밸런싱 시뮬레이션 |
| `src/control/swingup` | Åström-Furuta 에너지 제어, Xin-Kaneda(dfki), dfki RoA 게이트 | 리아푸노프 단조 에너지 펌프 + 2차형식 캡처 래치(히스테리시스), 보정된 기본 게인 | 에너지 단조 수렴, 행잉→도립 스윙업 전 구간, 위상 래치/리셋 |
| `src/control/ilqr` | Crocoddyl/Drake/OCS2/dfki의 DDP 계열 | facade + box QP / RK4 미분 / solver core / 문제 정의 / async runner 분리, Levenberg 정칙화, 단조 라인서치, exact box QP backward pass | 코스트 단조성(엄밀), 완전구동 스윙업, acrobot 회복, box QP KKT, 포화 토크 제한 준수, 롤아웃 재현 일치 |

**API 배치**: 제어 모듈은 저장소의 SemVer 정책에 따라 `experimental`
네임스페이스로 공개(공개 API 스냅샷 테스트 갱신), GALI는 `analysis`,
tsit5는 core 레지스트리. 모든 신규 수치 임계값은 보정 실험으로 측정 후
여유를 두고 고정했다(추측 금지 원칙).

**왜 이 조합이 "소스들을 넘어서는가"**: 소스 프로젝트 어느 것도
(1) 제어 성능 주장을 폐루프 고유값·리카티 잔차·비선형 시뮬레이션으로
동시에 검증하고, (2) 스윙업 전 과정을 단위 테스트로 결정론적으로
고정하며, (3) 적분기·카오스 지표·컨트롤러를 하나의 재현성 파이프라인
(레지스트리 계약, 공개 API 스냅샷, 수렴 사다리) 아래 두지 않는다.
이 저장소는 이제 dfki의 제어 벤치마크 아이디어를 "증거 배지" 문화 안으로
가져온 유일한 구현이다.
