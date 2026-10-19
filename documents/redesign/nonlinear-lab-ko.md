# S14 비선형·비매끈·지연 실험실

`next.html#/lab/{duffing,van-der-pol,kapitza,mathieu,friction,pyragas}`에서 기존 계산 경계를 연결한다. 새 제품 adapter는 기존 물리 모듈을 옮기거나 교체하지 않는다. 배우기 공개 단원 수는 이 단계에서 늘리지 않는다.

## 모델과 해석

| 모델 | 기존 계산 경계 | 관찰과 해석 |
|---|---|---|
| Duffing | `physics/duffing.ts` RHS·에너지·퍼텐셜 | 정규화 `x″+δx′+αx+βx³=γ cos φ`, `φ′=Ω`. 이중 우물과 외력 응답을 비교한다. |
| Van der Pol | `physics/vanDerPol.ts` RHS·에너지 | 정규화 `x″−μ(1−x²)x′+x=0`. 위상궤적과 진폭의 유한시간 한계주기 접근을 관찰한다. |
| Kapitza | `physics/kapitza.ts` RHS·유효 퍼텐셜 | θ=0은 아래쪽. 직접 가진 궤적과 빠른 가진을 평균한 `Φeff`를 구분한다. |
| Mathieu | `chaos/mathieuStability.ts` coefficient·Floquet | `x″+(δ+ε cos t)x=0`, 정규화 가진 주기 2π. 기존 진단 API를 유지하고 같은 선형 계수의 응답을 표시한다. |
| 마찰 | `physics/friction.ts` complementarity | 기존 scalar 접촉 도구를 사용하는 질량·용수철·주기 외력 블록 예제. 정지·미끄럼 상태와 마찰력을 표시한다. |
| Pyragas | `physics/pyragasDde.ts` RHS·피드백 | 과거 각도와 현재 각도의 차이에 비례하는 피드백. 초기 이력과 승인된 지연 tape가 궤적의 일부다. |

정규화 모델의 수치와 시간은 SI m·s나 J로 표시하지 않는다. Kapitza의 내부 bob 에너지는 단위 질량당 기계적 진단이며 가진에서 보존되지 않는다. 평균화 가속도 퍼텐셜 `Φeff=−(g/l)cosθ+(a²Ω²/4l²)sin²θ`의 단위는 s⁻²다. 에너지 진단의 변화량을 일괄적으로 수치 적분 오차로 해석하면 안 된다.

## 전제와 실패 조건

- Duffing의 α<0, β>0은 이중 우물이다. β<0의 비구속 softening에서는 궤적이 발산할 수 있다. 비유한 상태와 자원 한계에서 마지막 유효 표본을 보존해 중지한다.
- Van der Pol의 μ=0은 조화진동 극한이다. 큰 μ는 강성을 높여 작은 시간 간격을 요구한다. 유한시간의 폐곡선 유사 모양은 한계주기 존재나 전역 끌림의 증명이 아니다.
- Kapitza의 `a²Ω²>2gl`은 고주파·작은 가진 진폭 평균화의 국소 곡률 조건이다. 직접 적분의 임의 주파수·장시간 안정성을 보장하지 않는다.
- Mathieu의 승수 반경이 허용오차 안에 있다는 결과는 유계성 증명이 아니다. 중복 승수의 Jordan 성장(예: δ=ε=0), 경계 부근 분해능과 장시간 오차를 별도로 검사해야 한다.
- 마찰 예제는 기존의 완전한 진자 엔진이라고 부르지 않는다. 외력·용수철 힘을 한 격자 단계에서 평가하고 native 접촉 단계를 적용한다. 정지·미끄럼 전환은 격자에서 관찰한 상태 변화이며 정확한 연속 사건 시각은 아니다. 시간 간격을 줄여 수렴을 비교한다. Stribeck·정칙화 속도는 비교용 마찰력 곡선만 바꾸며 실제 궤적은 Coulomb complementarity와 이전 속도에서 평가한 점성 항을 사용한다.
- Pyragas는 `delay≥dt`가 필요하며, 고정 간격 method-of-steps RK4와 선형 과거 이력 보간을 사용한다. 이력과 dt를 함께 세분화해야 한다. 특정 gain·delay의 안정화 관찰은 모든 불안정 주기궤도에 대한 제어 보장이 아니다.

## 저장과 복원

설정·단위·원본 출처는 canonical `pendulum-experiment/v1` 계약으로 교환한다. 모델별 정확한 필드와 단위, 버전, 실행 방법, 자원 한계를 adapter가 검증한다. 알 수 없는 필드·미지원 분석·잘못된 버전은 조용히 삭제하지 않고 거부한다.

Pyragas 초기 이력은 실행 가능한 함수 대신 상수/선형 종류와 각도·각속도 scalar 계수로 직렬화한다. 이어가기의 승인된 tape는 시간·각도·각속도 벡터와 선택적인 analytic 이력 경계 시각으로 저장한다. 현재 상태만 저장해서 지연 궤적의 재개를 주장하지 않는다. 이어가기 설정은 원래 관찰 길이를 현재 시각부터 다시 관찰하는 초기조건이다. 재개 저장은 현재 시각과 새 관찰 구간 및 보간에 필요한 승인된 과거 tape를 함께 보존해야 한다. 궤적 표시용 downsampling과 지연 계산용 tape는 분리한다.

제품 저장은 전용 `pendulum-product/nonlinear/v1/` namespace를 사용한다. 손상되거나 미래 버전인 원본 레코드를 자동 덮어쓰지 않는다. 공유 URL의 크기 한계에 걸리는 큰 이력은 JSON 파일 경로로 안내한다. 기존 앱 저장 namespace와 기존 공유 링크는 변경하지 않는다.

## 계산과 입력 한도

| 항목 | 한도 |
|---|---|
| 실행 | 최대 100,000단계, 관찰 길이 최대 300, 시간 간격 10⁻⁶–0.05(정규화 또는 s) |
| 추가 해상도 조건 | Kapitza `dt·Ω≤0.2`, Van der Pol `dt·μ≤0.1`, Pyragas `τ≥dt`와 이력 예산 |
| 계산 요청 | 최대 64단계와 단계 사이 8ms 협력 예산, worker 응답 timeout 15s |
| 궤적 기록 | 최대 2,001표본, 마지막 수신 상태 포함; 기록 간격을 명시 |
| 표시 곡선·지연 이력 | 각각 최대 65점; 계산 tape와 분리 |
| 계산 지연 tape | 최대 2,048점, 필요한 보간 bracket 보존 |
| JSON 가져오기 | UTF-8 256KiB 및 공통 구조·노드 예산, 엄격한 버전·필드·단위 검사 |

이 한도는 정확도의 보증이 아니다. 큰 절대 시간의 삼각함수와 부동소수점 위상 해상도에도 한계가 있다. continuation 원점이 주어진 step을 표현하지 못하면 거부한다. 공유가 크기 한계를 넘으면 자료를 버리지 않고 JSON 파일을 사용한다.

## 검증·검토의 범위

최종 통과 개수·커밋·원격 검증·실패 이력은 `stage-runs/S14-progress.md`와 `S14-verification.json`에 기록한다. 수치 fixture는 특정 초기 이력·설정·시간 구간의 증거이며 일반적인 안정성 또는 정확도 인증이 아니다. 사람의 과학 검토는 수행했다고 표시하지 않는다.

기존 소스와 테스트가 구현식의 직접 비교 기준이다. 외부 문헌은 평균화 및 지연 피드백의 해석을 보조한다. 신규 교육 단원에 `source-checked` 또는 `human-reviewed`를 부여하는 작업은 이 단계 범위가 아니다.

- [Pyragas, Continuous control of chaos by self-controlling feedback, Physics Letters A 170 (1992), 421–428](https://doi.org/10.1016/0375-9601(92)90745-8): 지연 피드백의 원 연구. [저자 소속기관의 실험 후속 논문](https://privat.ftmc.lt/pyragas/pdffiles/1993/pla93b.pdf)은 작은 시간 연속 지연 피드백의 실험을 기술한다.
- [Grundy, The Kapitza equation for the inverted pendulum (2019)](https://research-portal.st-andrews.ac.uk/en/publications/the-kapitza-equation-for-the-inverted-pendulum/): 평균화 방정식의 시간에 따른 유효 범위 한계를 다룬다. 직접 가진과 평균화 예측의 차이를 숨기지 않는 근거다.

## 보존과 복구

기존 `app.html`과 physics/chaos/research/runtime/workers/validation, 공개 API, 사용자 데이터, package/lockfile, golden fixture와 이전 시각 기준을 보존한다. S13 기준 `f52cbe4150e702cb1a2f754aa10b9db8ee07547f`가 변경 비교 기준이다. 기존 앱 경로로 계속 실험할 수 있다. master merge·release·cutover는 수행하지 않는다.
