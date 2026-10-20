# S17 이산 사상과 양자 Floquet 실험실

## 접근 경로와 표현

- `next.html#/lab/standard-map`: 표준 사상. θ는 rad, [0, 2π)로 감으며 p는 정규화 운동량으로 감지 않는다. 한 단계는 사상 한 번이다.
- `next.html#/lab/quantum-kicked-rotor`: 양자 킥 회전자. 한 단계는 kick 뒤 자유 전파의 한 Floquet 주기다. 복소 운동량 파동함수와 유한 FFT 격자를 사용한다.
- `next.html#/lab/unitary-floquet`: 사용자가 입력한 복소 정방 행렬의 고유위상·준에너지 평가다. 시간 궤적이나 반복 실행과 구분한다.

세 시스템은 기존 native `standardMapStep`, `createQkrPlan/qkrStep`, `qkrFloquetMatrix`, `complexUnitaryFloquetSpectrum`을 product adapter에서 호출한다. 기존 엔진·공개 API는 변경하지 않는다. 연속 시간 dt 또는 ODE 적분기를 선택하지 않는다. 새 분석 통합은 S18 이후 범위다.

## 단위와 진단의 의미

- 고전 map과 양자 QKR 모두 정규화 모델이다. QKR m은 정수 운동량 모드, p=ℏm이다. native ⟨m²⟩는 에너지 자체가 아니다. 정규화 ⟨p²⟩=ℏ²⟨m²⟩이며 단위 관성 모델의 운동에너지는 ⟨p²⟩/2다.
- FFT 저장 순서는 `j < N/2 ? j : j-N`이다. 계수의 실수부·허수부와 |ψ|²를 구분한다. 표시를 위한 모드 정렬이 저장 계수의 순서를 바꾸지 않는다.
- norm은 Σ|ψ|²다. `normDrift`는 |norm−1|로, 초기 norm 대비 보존 오차와 구별한다. 자동 재정규화로 norm 오류를 숨기지 않는다. norm 보존만으로 유한 격자의 alias나 해상도 오차가 없다고 판단할 수 없다.
- 고유위상은 arg(λ)의 principal branch이며 준에너지 E=−ℏ arg(λ)/T다. 유니터리 연산자의 준에너지는 2πℏ/T를 주기로 동치다. 정규화 period는 SI 초로 주장하지 않는다.
- 스펙트럼은 단위원에 투영하지 않은 고유값을 사용한다. `unitarityDefect`는 native ||U†U−I||F/√N, `maxUnitCircleDrift`는 max||λ|−1|이다. 비유니터리 입력은 경고와 함께 원래 결함을 노출한다.
- native dense 해법은 characteristic polynomial과 Durand–Kerner roots다. 수렴 flag나 고유벡터 잔차 인증이 없으며, 중복·근접 고유값은 민감하다. 작은 유한 행렬의 진단 결과로 해석한다. 큰 격자에서 작은 별도 행렬의 스펙트럼을 같은 결과로 대신 표시하지 않는다.

## 상태와 데이터 보존

- canonical `pendulum-experiment/v1`의 iteration/evaluation runtime과 complex-vector를 재사용한다. 모델·stepper 버전과 FFT/행렬 순서 규약을 검증한다.
- QKR는 복소 계수 두 배열을 보존한다. Floquet 행렬은 row-major 복소 vector와 차원을 함께 저장한다. native typed array를 plain 배열로 복사하며 JSON에서 표현이 구별되지 않는 −0은 0으로 직렬화한다.
- 새 product 전용 저장 키를 사용한다. 읽을 수 없는 기존 값은 덮어쓰지 않는다. 잘못된 import, 다른 시스템, 미지원 버전·분석·옵션은 원본과 현재 설정을 유지하며 거부한다.
- 상태 JSON은 초기조건과 실행 설정의 재현 자료다. 기록 CSV와 그림은 결과 자료다. 보관 표본과 모든 미기록 반복을 구분하고 정확한 iteration을 내보낸다.
- 복소 상태 JSON에는 현재 계수·iteration에서 이어갈 별도 재시작 설정도 포함한다. 가져오기는 닫힌 versioned envelope의 배열·모델·iteration 일관성을 검사한다. 임의로 편집한 출력 artifact의 암호학적 진위를 인증하지는 않는다.
- 공유 token의 크기 한계를 넘으면 상태 JSON을 사용한다. 새 설정·출력 형식은 legacy 저장 형식을 대체하지 않는다.

## 자동 검증과 남은 한계

반복은 최대 100,000회, QKR 격자×반복은 2,000,000 이하, 보관은 최대 1,001표본이다. worker는 요청당 최대 64회이며 반복 사이 8ms의 soft budget을 확인한다. 단일 native 연산의 강제 시간 제한을 뜻하지 않는다. 응답 timeout은 15초다. dense 행렬은 2–8차원, QKR 격자는 2–512의 2의 거듭제곱이다.

CSV는 보관 표본으로 브라우저에서 동기 생성한다. 큰 격자의 기록 원본은 큰 파일이 될 수 있으므로 축약 CSV(최대 121시각)를 함께 제공한다. 일반 streaming export나 기기별 최악 메모리·지연 보장은 이 단계에서 인증하지 않는다.

수치 근거는 `stage-runs/S17-numerical-metrics.json`, 단계·검증·원격 근거는 `stage-runs/S17-progress.md`와 `S17-verification.json`에 기록한다. native parity, 알려진 대각 스펙트럼, norm 보존, 복소 상태 왕복, worker 취소·오류, 사용자 여정을 각각 구분한다. 특정 fixture의 통과를 모든 행렬의 수렴이나 무한 격자의 정확성으로 일반화하지 않는다.

이 단계는 Learn 콘텐츠를 추가하거나 사람의 과학 검토를 수행하지 않는다. 기존 공급망·CodeQL 미해결 위험의 해결 또는 위험 수용도 주장하지 않는다.

## S17 사용자 review checklist

기존 앱 `app.html`과 병렬인 `next.html#/lab`에서 확인한다.

- [ ] 8개 패밀리 필터와 검색으로 전체 35개 시스템을 찾을 수 있고 각 시스템에서 조건과 실행 경로가 열린다.
- [ ] 고전 다중·비강체·공간·구동/제어·비선형·네트워크·확률/장·이산/양자의 조건이 목적에 맞게 구분된다.
- [ ] 표준 사상은 반복 횟수와 θ/p를, QKR는 복소 파동함수·ℏ·격자를, Floquet는 복소 행렬·정규화 period를 편집할 수 있다.
- [ ] 이산·양자 화면에 연속 시간 dt/ODE 적분기 또는 비호환 연속계 분석이 섞이지 않는다.
- [ ] 실행·일시정지·한 단계·취소와 오류 안내가 명확하고, 수치·단위·표본·유한 격자·스펙트럼 한계를 읽을 수 있다.
- [ ] 상태 JSON 저장·가져오기·공유 뒤 복소 계수와 행렬이 유지되고 같은 설정을 다시 실행할 수 있다.
- [ ] 좁은 화면과 키보드로 실행·조건·분석·내보내기에 접근할 수 있다.

이 보고를 확인한 뒤 `18단계 실행해줘.`라고 요청하면 시스템 확장 방향에 대한 S17 checkpoint 승인으로 기록한다. 체크하지 않은 사용자 review나 과학 전문가 검토를 완료로 표시하지 않는다.
