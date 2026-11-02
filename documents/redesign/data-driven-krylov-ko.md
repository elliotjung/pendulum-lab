# S23 — 데이터 기반 모델과 고유해석

S23은 기존 연구 계산 모듈을 새 Lab의 분석 패널에 연결한다. `next.html#/lab/double` 등의 **분석 → 데이터 기반 모델 · 대규모 고유해석**에서 접근한다. 기능 잠금은 없다. 기존 앱과 계산 엔진은 유지하며 S24 프로젝트·ZIP·reviewer 작업은 포함하지 않는다.

## 데이터와 실행

1. Lab을 실행해 기록 표본을 만든 뒤 연속 구간을 미리 본다. 기본은 처음 최대 512표본이고 시작/끝 인덱스를 지정할 수 있다. 또는 S22 관측 JSON이나 학습 데이터 JSON을 읽는다.
2. 축·단위·출처·변환 이력을 확인하고 채택한다. 가져오기 전 미리보기는 이전 데이터와 결과를 대체하지 않는다.
3. 변수, 시간 순서 slice와 분리 위치, 전처리와 library를 정한다. 모델은 앞 훈련 구간에만 적합한다. 검증 구간에서 전처리·basis·계수를 다시 맞추지 않는다.
4. worker에서 계산하고 훈련/검증/rollout 지표와 실제 관측·예측 표, 경고를 확인한다. 결과 파일에는 원 데이터와 단위, 전체 설정, seed, 버전, 전처리 계수와 모델을 저장한다.
5. 파일을 다시 읽어 미리보기 후 채택한다. **저장 입력으로 재학습**은 같은 입력을 다시 적합하고, **저장 모델 재평가**는 저장 계수·basis·벡터를 고정해 진단을 다시 계산한다. 일반 조밀 고유값 결과에는 고유벡터가 없으므로 제한된 동일 solver 재실행으로 spectrum을 확인한다.

학습 데이터는 `times`, `values`(표본×변수), `labels`, `units`, `axisUnit`, `provenance`를 가진다. 선택적으로 `{schema:"pendulum-learning-data/v1",data:{...}}` envelope을 쓸 수 있다. 24–512개 균일한 증가 축 표본, 1–4개 변수만 허용한다. 자동 보간·각도 펼침·shuffle은 하지 않는다. S22 파일을 읽으면 불변 원본·SHA256·변환 이력을 결과 안에 유지한다. 실제 단위는 source에 저장하며 학습 결과 표에도 표시한다.

## 모델별 해석

| 도구 | 기존 계산 경계 | 진단과 한계 |
|---|---|---|
| SINDy | `identifyDynamics`, `finiteDifferenceDerivatives` | 1–3차 다항식과 선택적 삼각 library, threshold/ridge. 각 분할 안에서만 중앙차분하고 경계 도함수를 제외한다. 미분 잡음·library 선택·희소성이 결과에 영향을 준다. |
| DMD | `dynamicModeDecomposition` | 선택된 최대 4차 공간의 전체 선형 operator. 한 단계 검증과 자유 rollout을 구분한다. 비선형계의 전역 지배방정식으로 해석하지 않는다. |
| HAVOK | `havokAnalysis`, `thinSvd`, `hankelMatrix` | 훈련 Hankel basis/특잇값을 저장하고 검증 window를 여기에 투영한다. 검증 forcing을 쓰는 latent core 조건부 재구성이며 자율·실시간 예측이 아니다. window의 시작 시각 뒤 관측도 사용한다. |
| Reservoir | `trainEsn`, `predictEsnOneStep`, `predictEsnFree` | seed가 고정된 4–32 node reservoir와 ridge readout. 훈련 tail warmup, 검증 teacher forcing의 한 단계 오차와 자율 rollout 오차를 분리한다. spectral radius 0.8, input scaling 0.5, leak 1, connectivity 1, bias 0을 명시적으로 고정한다. |
| Hamiltonian | `learnHamiltonian`, `hamiltonianVectorField` | 1–2자유도 실제 정준 `q...,p...`만 허용하고 별도 표준화는 금지한다. 최대 4차 potential을 지원한다. native 무감쇠·무구동·단위질량 Duffing의 `x,v`는 검증한 무차원 `q,p`로 연결한다. 일반 진자 각속도는 운동량으로 바꾸지 않는다. 외부 canonical 선언은 출처의 주장이다. |

RMSE는 전처리된 좌표의 지표이며 관측·예측 표는 원 단위다. 서로 다른 단위를 섞은 통합 RMSE에는 경고한다. SINDy/Hamiltonian의 적합 오차는 도함수 오차이고 DMD/reservoir는 한 단계 예측 오차다. 자유 rollout은 검증 첫 상태에서 시작하며 뒤의 정답을 주입하지 않는다. Hamiltonian의 대수적 구조와 유한 간격 수치 적분의 에너지 drift는 별도로 표시한다. 단일 에너지 궤적에서 고차 Hamiltonian 계수는 식별하기 어려울 수 있다.

## Krylov와 일반 고유값

행렬은 `{kind:"dense",matrix:number[][]}` 또는 `{kind:"sparse",dimension,entries:[{row,column,value}]}`다. 직렬화된 실행 코드나 callback은 받지 않는다. 희소 항의 중복 좌표는 거부한다. Lanczos는 정확히 대칭인 실수 행렬만 받는다. 설정은 k, Krylov 차수, 재시작 상한, 허용오차, seed와 Lanczos의 LA/SA/LM이다.

- Arnoldi는 최대 절댓값의 복소 고유쌍을 반환한다. native 추정 잔차와 원본 행렬에서 독립적으로 구한 `‖Ax−λx‖`를 함께 보인다.
- Lanczos는 대칭 실수 고유쌍을 반환한다. 고유벡터 정규화·독립성, 요청 개수와 독립 재계산 잔차를 모두 확인한다. 부족한 부분공간이나 중복 벡터를 성공으로 표시하지 않는다.
- 일반 조밀 solver는 복소 고유값만 반환한다. 고유벡터 잔차나 Krylov 수렴을 주장하지 않는다.
- 저장 trace는 실제 행렬·벡터 곱의 순서다. native API가 노출하지 않는 cycle별 잔차를 만들어 내지 않는다. native cycle 수의 상한 소진 시 `maxRestarts+1` 보고와 제품의 잔차 판정을 구분한다.

## 자원·입력 경계와 실패

학습은 최대 512×4표본, HAVOK delay 4–32/rank 2–6, reservoir 4–32, rollout 1–64로 제한한다. 조밀 행렬은 64차, 희소 행렬은 2,048차·32,768항, k≤16, Krylov≤64, 재시작≤40, 추정 연산≤1억이다. 행렬 계수는 0 또는 절댓값 `1e-12..1e6`, 허용오차는 `1e-12..1e-2`다. 계산량은 실행 전에 검사한다.

파일은 최대 16 MiB이며 plain JSON, 유한 수치, 닫힌 schema와 dimension 검사를 요구한다. getter·prototype 키·희소 배열·함수·순환 객체·알 수 없는 버전을 거부한다. 전용 worker는 실제 진행, 오류, 즉시 종료에 의한 취소, 30초 무응답 제한과 이동 시 정리를 제공한다. 과적합·persistence보다 나쁜 rollout·rank deficiency·비유한 결과·미수렴은 경고 또는 명시적 오류다. 실패·취소는 이전 결과를 지우지 않는다.

입력과 결과의 canonical SHA256 및 저장 모델의 재평가로 파일 내부 일관성을 검사한다. 외부 원본의 진위나 물리적 정확성을 인증하는 기능은 아니다. 재평가 결과는 부모 결과 ID를 기록한다. source/모델/결과의 버전은 각각 데이터 선언, `data-driven-learning-v1`/native Krylov, `data-driven-krylov-v1`에 남는다.

## 검증과 보존

자동 검증은 harmonic dynamics/spectrum/Hamiltonian, seeded reservoir, 훈련 고정 HAVOK, held-out 값 변경 시 동일 모델, analytic Laplacian과 복소 Arnoldi 잔차, 불변 source·파일 복원·재학습·재평가, 위조/잘못된 입력, worker 종료를 포함한다. `npx tsx scripts/redesign/measure-data-driven.ts`가 8개 도구의 수치 지표를 재생성한다. 정확한 실행 결과와 보존 해시는 S23 stage-run 보고서가 소유한다.

기존 연구 모듈·물리 엔진·공개 API·old 저장/공유 형식·기존 test와 golden을 수정하지 않는다. 이 단계는 S28 전체 parity 인증이나 사람의 과학 검토가 아니다. 기존 dependency/CodeQL 부채는 해결 또는 승인된 것으로 표시하지 않는다.
