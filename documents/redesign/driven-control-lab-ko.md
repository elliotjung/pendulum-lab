# S13 구동·제어 실험실

병렬 진입점 `next.html#/lab`에서 구동·결합·역진자·카트폴·매개변수 가진을 선택한다. 기존 `app.html`과 기존 엔진은 그대로 유지한다.

## 모델과 좌표

| 시스템 | 상태 | 외력·제어 의미 |
|---|---|---|
| driven | `[theta, omega, phase]`, rad·rad/s·rad | 단위 질량 진자의 각가속도 구동, rad/s² |
| coupled | `[theta1, theta2, omega1, omega2]`, rad·rad/s | 기존 각도 차이 선형 결합, 외력·제어기 없음 |
| inverted | `[theta, omega]`, rad·rad/s | 위쪽 theta=0, 별도 PD 각가속도 피드백, rad/s² |
| cartpole | `[x, theta, v, omega]`, m·rad·m/s·rad/s | 위쪽 theta=0, 상수 힘+주기 힘+상태 피드백, N |
| parametric | `[theta, omega, phase]`, rad·rad/s·rad | 중력 복원 계수의 무차원 변조 |

driven/coupled/parametric의 theta=0은 아래쪽이다. 화면은 y 위쪽이며 역진자와 카트폴을 위쪽 평형에 맞춰 그린다. parametric은 고정 길이에서 복원 계수를 변조한다. 기존 renderer의 시각적 길이 변조를 운동방정식의 길이 변화로 해석하지 않는다.

## 구동 파형과 재현

- plant 물성과 구동기 설정을 별도 영역에서 편집한다.
- 파형은 sine/square/triangle, 주파수는 각주파수 rad/s, 위상 offset은 rad이다. Hz와 혼동하지 않는다.
- sine의 기본 offset π/2는 기존 `cos(native phase)` 구동을 재현한다.
- driven/parametric의 native phase는 초기 상태이며 파형 offset과 별개로 저장한다. cartpole은 시간 원점을 포함해 주기 힘을 평가한다.
- square 파형의 불연속을 고정 step 적분이 정확한 사건 검출로 처리하지 않는다. 주파수·step을 세분화해 응답의 수렴을 확인한다.

## 제어와 실패 해석

제어기는 inverted/cartpole에서만 제공한다. 비활성화하면 기존 개방 루프 plant를 실행한다.

- inverted: `u = kp(reference − theta) − kd omega`. reference는 각도 rad이다.
- cartpole: `u = kp theta + kd omega + kx(x − reference) + kv v`. reference는 카트 위치 m이며 pole 목표는 위쪽이다. 힘의 부호는 기존 plant convention을 따른다.
- 계산한 제어 출력은 설정한 `maxOutput`으로 포화된다. 포화는 외부 상수·주기 힘과 구별한다.
- gain이 유한하고 유효 범위에 있어도 모든 초기 조건·plant에서 안정화를 보장하지 않는다. 이 제어는 국소 안정화이며 swing-up 제어기가 아니다.
- 활성 제어 중 각오차가 π/2를 넘거나 비유한·과대 상태가 발견되면 오류로 중지한다. inverted는 기준 각도와의 차이, cartpole은 수직 위와의 차이를 사용한다. 마지막 유효 결과를 보존하며 gain/초기 조건/step을 수정한 뒤 재시작할 수 있다.

## 에너지와 관찰값의 한계

기존 엔진의 에너지 함수를 진단으로 재사용한다. 구동·감쇠·피드백은 에너지를 교환하므로 drift를 보존 오차로 해석하지 않는다. coupled의 기존 결합 에너지 항은 단순화된 모델이며 임의 길이에서 엄밀한 물리 결합 에너지로 일반화하지 않는다.

특히 cartpole은 기존 가속도식에 rod 계수 4/3이 있고 기존 에너지 함수는 point-bob 운동에너지를 계산한다. 두 식의 모델 차이는 이번 단계에서 보존하며 에너지 보존 검증이나 제어 성능 보증에 사용하지 않는다. reference/error 및 출력 포화와 실제 상태 응답을 함께 확인한다.

## 저장·실행·공명 탐색

설정은 versioned canonical 상태를 통해 저장·공유·가져오기한다. 중간 적분기 내부 상태의 checkpoint 재개를 뜻하지 않으며 초기 조건과 시간 원점에서 다시 시작한다. 기존 저장 namespace를 덮어쓰지 않는다. 알 수 없는 버전·필드·손상 데이터는 명시적으로 거부하고 원본을 보존한다.

공명 탐색은 현재 forcing-compatible 모델의 유한한 주파수 목록을 같은 초기 조건에서 순서대로 실행하는 S13 진입 경로다. 후반부 각도 반폭 `(max − min)/2`는 유한 시간 관찰값이며 정상상태 전달함수나 공명 주파수의 확정 판정이 아니다. 일반 sweep/ensemble queue는 S21 범위다.

## 검증 상태

구현과 테스트 결과, 커밋·push 증거는 [S13 진행 기록](stage-runs/S13-progress.md)과 [검증 기록](stage-runs/S13-verification.json)에 기록한다. 사람의 과학 검토를 수행했다고 표시하지 않는다.

[수치 관찰 기록](stage-runs/S13-numerical-metrics.json)의 기본 0.2 s / dt=0.002 s fixture는 다섯 원 엔진과 상태·에너지 진단이 정확히 일치했다. 기본 피드백의 5 s 뒤 각도/초기 각도 비율은 inverted 약 4.13e-7, cartpole 약 0.0423이다. 이 수치는 선택한 초기조건의 유한 시간 관찰이며 전역 안정성이나 모든 상태 변수의 수렴을 인증하지 않는다. 재생성 명령은 `node --import tsx scripts/redesign/measure-driven-numerics.ts`이다.
