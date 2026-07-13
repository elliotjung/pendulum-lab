# 고등학생의 카오스 연구를 "검증 가능한 결과"로 만드는 법

연구 프로젝트를 소개할 때 기능 수나 코드 줄 수를 앞세우기 쉽습니다. 하지만
검토자가 가장 먼저 묻는 질문은 다릅니다. "그 숫자를 왜 믿어야 하는가?"입니다.

Pendulum Lab의 Melnikov-vs-period-doubling 결과는 거대한 시뮬레이터를 만든 뒤
우연히 얻은 예쁜 그림이 아닙니다. 하나의 좁은 질문을 정의하고, 그 질문의 각
단계를 독립적으로 반박할 수 있게 만든 작은 검증 사슬입니다.

## 1. 주장을 한 문장으로 줄인다

처음 질문은 "감쇠 구동 진자에서 카오스는 언제 시작되는가?"였습니다. 이것만으로는
측정할 수 없습니다. `카오스의 시작`이 homoclinic tangle인지, transient chaos인지,
period-doubling인지, 양의 Lyapunov exponent인지 정해지지 않았기 때문입니다.

최종 질문은 다음처럼 바뀌었습니다.

> `ω=2/3`인 감쇠 구동 진자에서 해석적인 Melnikov 임계 `A_c(γ)`와 primary
> period-1 attractor의 Floquet 주기배가 온셋 `A_PD(γ)` 사이의 비율은 감쇠에 따라
> 어떻게 변하는가?

이 문장은 입력(`γ`, 고정 `ω`), 두 측정 대상, branch, 판정 기준을 모두 포함합니다.
결과가 틀렸을 때 어느 단계가 틀렸는지도 추적할 수 있습니다.

## 2. 해석값도 테스트한다

닫힌 식이라고 자동으로 oracle이 되는 것은 아닙니다. 부호, 무차원화, 매개변수
정의가 코드와 다르면 정확한 식을 정확히 잘못 사용할 수 있습니다. 그래서 Melnikov
적분의 닫힌 식을 separatrix 수치 quadrature와 비교하는 단위 테스트를 둡니다.
운동방정식은 SymPy의 독립 Euler-Lagrange 유도와 비교하고, 시간 궤적은 SciPy
DOP853과 비교합니다.

"같은 TypeScript 함수를 두 번 호출해 같은 답이 나왔다"는 교차 검증이 아닙니다.
언어, 알고리즘, 구현 경로가 다른 계산이 같은 물리량에 도달하도록 설계해야
공통 구현 버그의 가능성을 줄일 수 있습니다.

## 3. attractor branch를 보존한다

비선형계는 같은 매개변수에서도 여러 attractor를 가질 수 있습니다. 각 `A`에서
항상 `[θ, θ̇]=[0.1,0]`으로 다시 시작하면 basin 경계를 건너며 서로 다른 branch를
섞을 수 있습니다. 이 연구는 `A`를 증가시킬 때 직전 attractor의 마지막 상태를
다음 계산의 시작점으로 넘깁니다.

period-1 경계를 좁힌 뒤에도 Newton solver에 임의의 초기 추정을 주지 않습니다.
실제로 strobe된 attractor 점을 seed로 사용합니다. 이 선택이 중요한 이유는 대칭
period-1 orbit과 물리적으로 따라가는 symmetry-broken orbit이 다를 수 있기
때문입니다. 안정성 계산이 정밀해도 branch를 잘못 골랐다면 질문에 대한 답은
틀립니다.

## 4. "점이 둘로 보임"을 수치 계약으로 바꾼다

주기배가는 Floquet multiplier `ρ`가 `-1`을 통과하는 사건으로 정의합니다. 온셋
아래에서 `ρ>-1`, 위에서 `ρ<-1`인 bracket을 만들고, crossing을 보간합니다.
분기도의 픽셀이나 사람이 고른 임계가 아니라 기계가 재검증할 수 있는 조건입니다.

`γ=0.5`에서 얻은 `A_PD=1.066372862...`는 Baker-Gollub의 문헌값 `1.0663`과
일치합니다. 그러나 한 점의 일치만으로 전체 sweep을 인증하지 않습니다. 각 행은
`A_c`, `A_PD`, ratio, onset localization, crossing 전후 `ρ`, 0-1 test와 caveat를
함께 저장합니다.

## 5. 독립 재계산은 원자료를 의심하도록 만든다

`npm run flagship:external`은 Node/TypeScript 연구 코드를 그대로 불러오지 않는
Python 경로입니다. 내보낸 `A_PD` 후보를 독립적으로 probe하고, 해석 `A_c`를 다시
계산하며, ratio=1 교차를 재구성합니다.

독립 스크립트가 최종 JSON을 그대로 복사해 "pass"라고 쓰면 의미가 없습니다.
검증하려는 값에 도달하는 계산 경로가 원 구현과 분리되어야 합니다. 그 결과는
`reports/flagship-external-check.json`에 오차와 통과 여부까지 남습니다.

## 6. 오차와 실패를 결과의 일부로 둔다

시간 간격을 절반으로 줄인 `dt` 민감도, attractor bisection 폭, Floquet crossing
양쪽의 multiplier가 onset localization을 이룹니다. 이 오차막대를 Bayesian
불확도처럼 과장하지 않습니다.

또한 주기배가 직후의 sample이 항상 chaotic일 것이라고 가정하지 않습니다.
Feigenbaum cascade가 아직 축적점에 도달하지 않았거나 periodic window가 끼면
`1.08 A_PD`에서도 0-1 test `K`가 작을 수 있습니다. 이런 행은 실패를 지우는 대신
caveat로 분류합니다. 보강 진단과 정의 진단을 구분해야 예상 밖 결과가 연구를
왜곡하지 않습니다.

## 7. 실행 명령과 산출물 계보를 같이 제출한다

검토자는 개발자의 노트북 환경을 추측해서는 안 됩니다. 이 프로젝트의 최소
검토 경로는 다음처럼 명령으로 고정됩니다.

```bash
npm ci
npm run paper:study
npm run flagship:certify
npm run flagship:external
npm run paper:build
npm run reviewer:kit
```

`reports/reviewer-kit-manifest.json`은 어떤 파일이 필수인지, 어떤 명령이 만들었는지,
현재 존재하는지를 기계가 읽을 수 있게 기록합니다. Figure 1은 SVG hash를 가지고,
release package는 종이 한 장짜리 요약과 공개 reviewer console을 함께 만듭니다.
"저를 믿으세요"가 아니라 "이 명령과 이 hash를 확인하세요"가 제출 메시지가 됩니다.

## 8. 검증은 더 큰 주장보다 정확한 경계를 만든다

이 연구가 주장하지 않는 것도 분명합니다.

- Melnikov 이론이 chaotic attractor의 시작을 예측한다고 주장하지 않습니다.
- 모든 초기조건/공존 basin에서 첫 사건이 같다고 주장하지 않습니다.
- 0-1 test 한 번으로 무한시간 카오스를 증명한다고 주장하지 않습니다.
- GitHub-hosted 소프트웨어 GPU로 NVIDIA/AMD 실기기 검증을 대체하지 않습니다.

대신 고정된 주파수와 정의된 primary branch에서 두 임계의 간격을 측정하고,
그 비율이 `γ≈0.692973`에서 역전된다는 제한된 주장을 강하게 지지합니다.

## 프로젝트에서 연구로 넘어가는 체크리스트

새 기능을 연구 결과로 승격할 때 다음 질문을 사용할 수 있습니다.

1. 주장을 입력, 출력, branch/대상, 판정 기준까지 한 문장으로 쓸 수 있는가?
2. 해석값과 참조값도 단위·부호·무차원화를 포함해 테스트했는가?
3. 다른 언어/알고리즘/라이브러리의 독립 경로가 있는가?
4. 해상도나 사람의 눈 대신 수치 계약으로 사건을 판정하는가?
5. step size, transient, 초기조건, basin, 유한시간에 민감한가?
6. 실패한 행과 애매한 결과를 삭제하지 않고 caveat로 내보내는가?
7. 깨끗한 clone에서 실행할 명령과 생성 파일을 한 페이지에 적었는가?
8. 공개 글, 논문, UI의 숫자가 모두 같은 source artifact를 가리키는가?

고등학생 연구의 약점은 나이가 아닙니다. 결과와 검증 사이의 거리를 검토자가
알 수 없을 때 약해집니다. 질문을 좁히고, 계산 경로를 분리하고, 실패 조건을
명시하고, 재현 명령을 공개하면 그 거리는 짧아집니다. Pendulum Lab의 가장 중요한
산출물은 애니메이션이 아니라 바로 그 거리의 기록입니다.
