# S25 과정 2·3 사용 및 과학 검증 안내

과정 2의 수치해석 9개 단원과 과정 3의 다중·비강체·공간 진자 9개 단원을 공개한다. 기존 과정 1의 8개를 포함해 **공개 단원은 26개**, 과정 4–8의 **계획 단원은 60개**다. 전체 지도는 8과정·86단원을 유지한다. 선수 단원과 진도는 추천 경로이며 단원 접근이나 실험실 기능을 잠그지 않는다.

이 문서는 구현과 사용 범위를 설명한다. 단계 완료 여부, 최종 전체 테스트·브라우저 결과와 원격 commit/push 증거는 [S25 진행 기록](stage-runs/S25-progress.md)이 소유한다. 아래 설명만으로 전체 회귀·시각 검증·사람 검토가 끝났다고 해석하지 않는다.

## 미리보기와 18개 실제 실험

개발 또는 production preview 서버 주소 뒤에 아래 경로를 붙인다. 과정 개요는 `/next.html#/learn/course-2`, `/next.html#/learn/course-3`이며 자유 실험실은 `/next.html#/lab`이다. S25는 기본 진입점 `app.html`을 전환하는 단계가 아니다.

### 과정 2 — 수치적으로 운동을 푸는 방법

| 단원 | 미리보기 경로 | 실제 실행과 관찰 |
|---|---|---|
| 2.1 2차 운동방정식의 1차 상태공간 변환 | `/next.html#/learn/course-2/2.1` | 이중진자 상태와 기존 도함수를 나란히 표시한다. `theta1,theta2,omega1,omega2` 순서와 `qDot=omega`를 확인한다. |
| 2.2 명시적 Euler와 국소 절단오차 | `/next.html#/learn/course-2/2.2` | 동일한 도함수로 Euler의 `h`, `h/2`와 정밀 RK4를 계산한다. 한 단계 결함, 같은 최종 시각의 상태 차이와 에너지 변화를 비교한다. |
| 2.3 Runge–Kutta 계열과 적응형 시간 간격 | `/next.html#/learn/course-2/2.3` | 고정 RK4와 native Dormand–Prince 5(4)를 비교한다. 실제 수락 간격·정규화 오차·거절 수·도함수 호출 수와 수락 단계 재생 차이를 읽는다. |
| 2.4 symplectic 적분과 위상공간 보존 | `/next.html#/learn/course-2/2.4` | 실제 이중진자를 canonical 운동량으로 바꾸고 기존 implicit midpoint와 canonical RK4를 실행한다. 4차원 symplectic 2-form 잔차, 에너지 변화와 반복 수렴을 비교한다. |
| 2.5 implicit 적분과 강성 문제 | `/next.html#/learn/course-2/2.5` | `g=0`의 순수 방사 용수철 한계에서 Euler·native TR-BDF2와 cosine 정확해를 비교한다. 강성·시간 간격, Newton 잔차와 수치 감쇠를 구별한다. |
| 2.6 사건 검출과 Poincaré 교차의 보간 | `/next.html#/learn/course-2/2.6` | `theta1=0`의 음→양 교차에서 다음 표본·선형 보간·기존 root 검출의 시각을 비교한다. 교차 없음도 빈 결과로 표시한다. |
| 2.7 허용오차·step size·계산비용의 균형 | `/next.html#/learn/course-2/2.7` | Euler·RK2·RK4의 두 해상도와 adaptive 허용오차별 끝점 차이·실측 도함수 호출 수를 비교한다. 기준 계산의 비용과 오차를 구분한다. |
| 2.8 에너지·구속·시간역전 검증 | `/next.html#/learn/course-2/2.8` | 같은 이중진자 run의 에너지·막대 길이 잔차와 최종 속도 반전 후 귀환 오차를 검사한다. 간격 축소에 따른 수렴을 관찰한다. |
| 2.9 적분기 비교 실험의 재현성 | `/next.html#/learn/course-2/2.9` | 실제 S21 builder·queue·executor로 RK4·RK2·Euler 비교를 만든다. 같은 source·설정의 계획 ID·run 입력·결과와 실패 상태를 확인한다. |

### 과정 3 — 삼중·다중·비강체·공간 진자

| 단원 | 미리보기 경로 | 실제 실행과 관찰 |
|---|---|---|
| 3.1 삼중진자의 질량행렬과 재귀 구조 | `/next.html#/learn/course-3/3.1` | 기존 삼중·일반 사슬 adapter를 실행하고 2링크·3링크 질량행렬을 비교한다. 하류 질량합과 같은 3링크 표현의 한 단계 일치를 확인한다. |
| 3.2 N중 사슬의 일반화와 계산 복잡도 | `/next.html#/learn/course-3/3.2` | 링크 수 2–8을 바꾸어 실제 상태·기하·행렬 크기를 변경한다. 자유도·상태 차원·행렬 원소 수와 환경 의존 계산 시간을 읽는다. |
| 3.3 복합진자의 관성모멘트와 물리진자 | `/next.html#/learn/course-3/3.3` | 같은 질량·길이·초기조건의 균일 막대와 끝점 질점 모형을 실행한다. 관성행렬·각도 시계열과 동방향 단면 교차 간격을 비교한다. |
| 3.4 용수철 진자의 길이-각도 결합 | `/next.html#/learn/course-3/3.4` | 실제 spring adapter의 반지름·각도, 방사·접선 운동에너지와 탄성 에너지를 읽는다. 중력 평형과 모드 사이 에너지 전달을 구분한다. |
| 3.5 줄 진자의 장력과 비매끈 사건 | `/next.html#/learn/course-3/3.5` | 기존 rope hybrid 엔진의 장력·taut/slack 상태와 이완·재포획 순서를 기록한다. 초기 장력 판정과 적분 중 사건, 포획 손실을 구분한다. |
| 3.6 이중 줄 진자의 구속 전환 | `/next.html#/learn/course-3/3.6` | double-string 엔진의 두 장력, 바깥 줄 이완·전체 이완, 재포획과 구속 잔차를 확인한다. |
| 3.7 구면진자의 3차원 운동과 세차 | `/next.html#/learn/course-3/3.7` | 실제 공간 궤적의 수평 투영과 수직 각운동량을 읽는다. 방위 속도 변화, 평면 운동 한계와 극점 근접을 비교한다. |
| 3.8 구면 사슬의 다체 3차원 역학 | `/next.html#/learn/course-3/3.8` | 링크 수 1–4와 상대 방위를 바꾸어 실제 다체 공간 운동을 계산한다. 최소좌표 관성행렬·자유도·상태 차원과 집단 세차를 연결한다. |
| 3.9 임베디드 좌표·구속식·좌표 특이점 | `/next.html#/learn/course-3/3.9` | 같은 물리 초기조건의 구면·매입 표현을 비교한다. Cartesian 위치, 단위 방향·접선 잔차와 극점 근처 최소좌표 비교의 종료 상태를 읽는다. |

각 단원에는 한국어·영어 질문과 이론, 가정·유도·변수 정의·SI 단위·접근성 수식 설명, 예측→실행→관찰→설명 과제, 확인 질문과 피드백, 용어·출처·다음 탐구가 있다. 모든 단원을 직접 열 수 있다.

## 공용 엔진과 구현 경계

단원 모듈은 계산식을 실행하지 않는다. [실험 선언](../../src/product/experiments/extended-definitions.ts)이 시스템·노출 변수·고정값·범위를 정하고 [설정 연결](../../src/product/experiments/extended-config.ts)이 기존 adapter의 입력으로 바꾼다. 저장된 데이터나 콘텐츠 선언에서도 고정 조건·시스템·단위·integrator·관찰 종류가 일치해야 한다.

- S07의 planar adapter: 이중·복합진자의 기존 도함수·에너지·기하와 RK 적분.
- S10의 chain adapter: 삼중진자와 가변 링크 사슬의 기존 질량행렬·적분.
- S11의 constraint adapter: 용수철 및 rope/double-string의 기존 사건·장력·포획 규칙.
- S12의 spatial adapter: 구면·구면 사슬·매입 좌표의 기존 공간 운동·잔차·각운동량.
- S21의 builder·queue·executor: 2.9의 통제된 적분기 비교, 동시 실행 두 개와 취소·실패 처리.
- 기존 `physics/adaptive.ts`, `physics/canonical.ts`, `physics/stiff.ts`, `chaos/poincare.ts`: adaptive·canonical midpoint·TR-BDF2·교차 검출 비교 계산.

교육용 운동방정식을 별도로 만들지 않는다. 물리·카오스·연구·기존 runtime/worker·validation·공개 API와 사용자 저장 형식은 보존 경계다. 이후 과정 제작이나 전체 migration·parity·기본 앱 전환은 S25 범위에 포함하지 않는다.

공간 단원은 adapter 자체가 계산한 에너지·구속·각운동량을 보여 준다. 전달되는 공간 canonical 설정의 `analyses`는 **빈 배열 `[]`**이다. 콘텐츠의 `analysis:energy` 관찰 선언을 공간 adapter에서 실행하지 않는 일반 분석 작업으로 직렬화하지 않는다.

## 계산 결과 JSON과 재시작 저장의 차이

`실험 결과 JSON 내보내기`는 `learn-{unitId}-diagnostics.json`을 만든다. schema는 `pendulum-learn-diagnostics/v1`, 알고리즘 버전은 `learn-extended-v1`이다.

| 필드 | 의미 |
|---|---|
| `unitId`, `fields` | 단원과 검증된 전체 재실행 입력. 노출하지 않는 고정값과 별도 tolerance도 포함한다. |
| `canonical` | 전체 실험실로 보낼 지원 기준 run의 `pendulum-experiment/v1` 상태. |
| `metrics`, `tables`, `trace` | 단위 있는 진단값, 실제 계산 표와 제한된 표시 궤적. |
| `warnings` | 모형 전제, 비교 기준과 수치 해석의 한계. |
| `companions` | adaptive·canonical·implicit 등 별도 비교 계산의 설정과 설명. |
| `batch` | 2.9에서 실제 S21 실행으로 얻은 검증된 계획·run·aggregate. 다른 단원에는 없다. |

각 단원은 최대 20,000개의 기준 적분 단계·801개 표시 표본으로 제한한다. 관찰 기간과 링크 수는 단원별 고정·노출 범위를 따른다. 최대 에너지·공간 잔차·각운동량 편차는 모든 기준 적분 단계에서 집계하며, 표와 그래프는 제한된 표본을 표시한다. 연속시간 전체의 엄밀한 오차 상한을 인증하는 것은 아니다. 긴 자유 실험은 Lab에서 확장한다.

계산은 전용 worker에서 실행한다. 취소는 worker와 실행 중인 S21 run worker를 종료하며 늦은 응답을 채택하지 않는다. 30초 무응답, 계산 실패, 잘못된 진행률이나 결과의 입력 계보·단위·차원·크기 불일치는 명시적 오류로 처리한다. 숫자 그래프에 문자열·비유한 값이 들어가거나 원본과 다른 S21 batch가 붙은 결과도 거부한다.

재시작 설정은 이 탭의 `sessionStorage`에 따로 저장한다.

```text
key: pendulum-product/extended-focus/v1/{courseId}/{unitId}
schema: pendulum-extended-focus-session/v1
members: schema, contentVersion, fields, experiment
```

새로고침은 **초기조건부터 다시 실행할 설정**을 복원한다. 완료된 궤적·worker 중간 버퍼·adaptive 수락 이력은 이 세션 저장에 넣지 않는다. 같은 Document 안의 단원→Lab→복귀는 단원별 메모리 결과를 유지한다. 실행 중 이탈은 계산을 취소한다. 탭 종료 뒤 영구 보관이나 다른 탭·기기와의 동기화를 약속하지 않는다.

손상 JSON·중복 키·미래 버전·다른 단원 출처·고정값 불일치·크기 초과 데이터는 덮어쓰지 않는다. 읽기 실패 시 원본을 유지하고 저장하지 않는 기본 설정 연습을 안내한다. 설정 저장은 학습 진도용 `localStorage` 및 기존 앱 데이터와 분리한다.

## Lab 전달 범위

`실험실에서 계속`은 현재 설정의 **지원되는 기준 run 초기조건**을 보낸다. 물성·단위·좌표 표현·초기값·적분기 또는 내부 stepper·기간·간격과 지원 분석 설정을 기존 share token·route 계약으로 직렬화한다. 출처는 `learn:course-2:2.N:v1` 또는 `learn:course-3:3.N:v1`이며 Lab에서 원 단원 링크로 이어진다. 계산 끝점에서 이어 적분하는 기능은 아니다.

2.2의 기준 run은 Euler다. 2.3·2.4·2.5·2.7은 Lab이 지원하는 고정 간격 RK4 기준을 전달한다. 해당 단원의 Dormand–Prince controller·canonical midpoint·TR-BDF2 비교 설정은 단원 재시작 설정과 진단 JSON에 구분해 보존하며, Lab이 그 별도 solver나 완료된 비교 궤적까지 복원했다고 표시하지 않는다. 줄 계는 canonical에 선언한 초기 각도에서 다시 시작하며 중간 taut/slack solver 버퍼를 이식하지 않는다.

## 수치·모형 해석의 한계와 복구

- Euler의 나누지 않은 한 단계 결함은 매끄러운 해에서 `h²`, 고정 유한 기간의 전역 오차는 보통 `h`에 비례한다. 정밀 RK4도 수치 기준이며 참해 인증값이 아니다.
- Adaptive의 성분별 수락 오차는 `absTol+relTol*scale`에 대한 국소 추정이다. 더 작은 tolerance가 전체 궤적의 정확도·모델 정확도나 불확실성을 보장하지 않는다. 비용에는 거절된 시도의 도함수 평가도 포함한다.
- 이중진자의 운동량은 자세 의존 `M(q)*omega`다. `theta,omega` 투영의 면적을 canonical 면적으로 부르지 않는다. 4차원 유한차분 2-form 잔차와 implicit 반복 수렴을 함께 검사하며 symplectic성이 매 step 원 에너지의 정확 보존을 뜻하지 않는다.
- 2.5의 cosine 정확해는 `g=0`, 각운동과 초기 방사 속도가 0인 설정에 한정한다. TR-BDF2의 수치 감쇠와 물리 감쇠, Newton 잔차와 절단오차는 다르다. 허용 입력 범위에서도 지나치게 큰 간격은 실제 엔진의 원점 특이점·수렴 오류를 낼 수 있다. 실패를 완료 결과로 채택하지 않고 간격을 줄여 다시 실행한다.
- Poincaré 표의 최종 root bracket 폭은 원래 표본 간격과 다르다. 접선·한 간격 안의 다중 교차·부정확한 적분 궤적은 root tolerance만으로 해결되지 않는다.
- 3.3 adapter는 균일 막대 모형이다. 질량·길이 편집은 임의 질량중심 이동이 아니며 질점과의 비교에서 관성과 중력 퍼텐셜이 함께 변한다. 동방향 단면 간격은 유한 시간 재귀 관측량이며, 혼합 모드 이중진자의 유일한 주기로 인증하지 않는다. 교차 두 개 미만이면 평균 간격을 만들지 않는다.
- 줄의 `source=initial-condition` 사건은 시작 장력 유효성 판정이며 적분 중 영점 검출과 다르다. 재포획은 비탄성 에너지 손실을 포함한다. 감쇠 없는 강체계의 보존·시간역전 기대를 충돌 구간에 그대로 적용하지 않는다.
- 공간 좌표는 오른손계에서 `+y`가 위쪽, 중력이 `-y`다. 극각은 아래 수직 기준이고 방위각은 `+x→+z`로 증가하므로 물리적인 `+y` 각운동량은 해당 방위각 conjugate 운동량의 음수다. 전체 각운동량 벡터 보존과 수직 성분 보존은 다르다.
- 극점 근처에서는 방위각이 유일하지 않다. 매입 표현의 단위 방향·접선 잔차와 Cartesian 궤적을 비교한다. 최소좌표 companion이 중지되면 이유를 표시하고 유효한 매입 기준 결과를 유지한다. 매입 표현도 시간 적분 오차를 없애지 않는다.
- S21의 첫 run은 비교 기준이며 참해가 아니다. 결정론적 진자의 design seed는 임의 외력을 추가하지 않는다. 동일 계획·입력·결과의 재현성과 실행 시간의 일치는 다른 조건이다.

## 출처와 과학 검토 상태

아래 자료의 확인일은 모두 **2026-11-04**다. 단원별 정확한 locator와 모형·표기 변환은 각 콘텐츠의 `references`에 기록한다. 보존된 엔진 자료는 S24 기준 commit `831e7afeda1c5d94439a2bf52276b2ff5996587d`의 로컬 원문과 대조했으며 아래 링크는 그 고정 원본을 가리킨다.

### 수치해석

- Driscoll·Braun의 [1차 연립계](https://fncbook.com/systems/), [Euler와 국소 절단오차](https://fncbook.com/euler/), [Runge–Kutta](https://fncbook.com/rk/), [adaptive RK](https://fncbook.com/adaptive-rk/), [절대 안정성](https://fncbook.com/absstab-diffusion/), [강성](https://fncbook.com/stiffness/). 책의 `h`로 나눈 절단오차와 이 과정의 나누지 않은 결함, RK23 예제와 제품의 DP5(4)를 구분한다.
- Hairer의 [Geometric Numerical Integration, Lecture 2](https://www.unige.ch/~hairer/poly_geoint/week2.pdf): canonical implicit midpoint, 비분리형 Hamiltonian, symplectic성과 시간 대칭.
- Hosea·Shampine의 [Analysis and implementation of TR-BDF2](https://pages.mtu.edu/~struther/Courses/OLD/Other/LessOld/5628_11/TRBDF2_Hosea_AppNumMath_20_pp21-37_1996.pdf): 두 implicit stage와 L-stability. 논문의 절단오차 추정기와 화면의 Newton 잔차를 구분한다.
- SciPy의 공식 [solve_ivp 문서](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html): 방향 있는 사건, 한 step 안의 다중 교차 한계, 출력 표본과 내부 step, 성분 tolerance.
- 보존된 [S21 batch builder](https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/src/product/lab/experiments/builders.ts): 통제 변수·실행 가능 적분기·결정론적 계획과 비교 기준 경고.

### 다중·비강체·공간 진자

- Tedrake의 [Multibody Dynamics](https://underactuated.mit.edu/multibody.html): 다물체 관성·구속과 일반화좌표. 자료의 상대각과 제품의 절대각을 구분한다.
- OpenStax의 [15.4 Pendulums](https://openstax.org/books/university-physics-volume-1/pages/15-4-pendulums): 물리진자 관성과 작은 진동. 두 링크 전체 운동은 보존된 coupled 엔진과 대조한다.
- 보존된 [N-link 사슬](https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/src/physics/nPendulum.ts), [균일 막대](https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/src/physics/compoundDouble.ts), [용수철](https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/src/physics/spring.ts), [줄](https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/src/physics/rope.ts), [이중 줄](https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/src/physics/doubleString.ts), [구면](https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/src/physics/spherical.ts), [구면 사슬](https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/src/physics/sphericalChain.ts), [매입 좌표](https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/src/physics/sphericalEmbedded.ts): 해당 단원의 실제 식·에너지·사건 규칙·좌표 변환의 근거.

새 18개 단원은 `automated-verified`와 `source-checked`로 구분해 기록하며 **`human-reviewed`는 0/18**이다. UI 구조에 대한 사용자 승인이나 AI 검토가 물리 전문가 검토를 대신하지 않는다. 제품에서도 미완료 사람 검토 상태를 표시한다.

## 검증 경로와 재실행

과학·공개 계약의 검증은 다음 파일을 기준으로 한다. 검사 수는 추가 경계 사례에 따라 달라질 수 있으므로 최종 실행 결과와 숫자는 단계 증거에서 확인한다.

- [실제 18개 엔진·수치 예제](../../tests/product/experiments/extended-science.test.ts): Euler 차수, DP 수락·재생, canonical 잔차, 방사 정확해와 실패·복구, 사건·보존량·실제 S21.
- [worker·세션·공유 경계](../../tests/product/experiments/extended-boundaries.test.ts): 18개 정상 결과와 저장·전달, 잘못된 계보·차원·시간·숫자·batch 거부, 취소·늦은 응답·무응답·원본 보존.
- [공간·구속계 독립 예제](../../tests/product/experiments/extended-systems.test.ts): 정렬 행렬, 평형, 초기 이완·포획, 전체 이완, 각운동량 부호, 실제 링크 변경·극점 통과.
- [균일 막대·질점 비교](../../tests/product/experiments/extended-compound.test.ts): 공통 조건의 실제 시계열·교차 간격, 빈 교차와 의미 보존.
- [runtime·S21 수명주기](../../tests/product/experiments/extended-runtime.test.ts): 취소·stale 응답·동기 완료·호출자 변조 격리·동시성·부분 실패.
- [콘텐츠 품질·선언 결합](../../tests/product/learn/courses-two-three-quality.test.ts): 18개 schema·ID·영어/한국어·출처·SI 차원과 시스템·노출 변수·고정 조건·관찰 종류·전달 참조의 변조 거부.
- [브라우저 여정 정의](../../e2e/redesign/curriculum-two-three.spec.ts): 전 단원 실행·JSON·Lab 전달·복귀·새로고침, 오류·취소·빈 결과·키보드·좁은 화면·시각 비교. 실제 통과 환경과 결과는 S25 진행 기록에서 별도로 확인한다.

```text
npx vitest run tests/product/experiments/extended-science.test.ts tests/product/experiments/extended-boundaries.test.ts tests/product/experiments/extended-systems.test.ts tests/product/experiments/extended-compound.test.ts tests/product/experiments/extended-runtime.test.ts tests/product/learn/courses-two-three-quality.test.ts --maxWorkers=1
npm run redesign:learn:check
npm run typecheck
```

Chromium의 mobile emulation이나 자동 접근성 검사는 실제 기기·다른 브라우저·스크린리더 음성 검증의 대체가 아니다. 이 안내에는 그 범위의 인증, 전체 릴리스 심사 또는 새 보안 부채 수락을 포함하지 않는다.
