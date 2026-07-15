# 카오스는 언제 시작되는가: Melnikov 임계와 주기배가는 같은 질문이 아니다

진자를 일정한 리듬으로 밀면 처음에는 같은 움직임이 반복됩니다. 힘을 더 키우면
두 번에 한 번 같은 상태로 돌아오는 주기 2 운동이 나타나고, 다시 주기 4, 8로
갈라지다가 불규칙한 운동으로 이어질 수 있습니다. 여기서 자연스러운 질문은
"카오스는 어느 힘에서 시작되는가?"입니다.

문제는 이 문장에 서로 다른 두 질문이 숨어 있다는 데 있습니다.

## 두 개의 시작점

Pendulum Lab의 대표 실험은 무차원 감쇠 구동 진자

\[
\ddot\theta = -\sin\theta - \gamma\dot\theta + A\cos(\omega t),
\qquad \omega=2/3
\]

를 다룹니다. `A`는 구동 진폭, `γ`는 감쇠입니다.

첫 번째 시작점 `A_c`는 Melnikov 이론이 계산하는 임계입니다. 구동과 감쇠가
작은 섭동이라고 보고, 진자 꼭대기 근처의 안정/불안정 다양체가 횡단하는 때를
해석식으로 예측합니다. 이 교차는 위상공간 안에 homoclinic tangle, 즉 말굽형
카오스 구조가 생겼다는 뜻입니다. 그러나 그 구조가 있다고 해서 장시간 관찰되는
궤도가 곧바로 카오스 attractor가 되는 것은 아닙니다. 규칙적인 attractor로
수렴하기 전 transient에서만 민감성이 나타나거나, basin 경계만 프랙탈일 수도
있습니다.

두 번째 시작점 `A_PD`는 실제 period-1 attractor가 안정성을 잃어 period-2로
갈라지는 진폭입니다. 이것은 닫힌 해석식 하나로 얻는 값이 아니라, 어떤 attractor
branch를 따라갔는지까지 포함하는 수치 측정값입니다. 이후 period 4, 8의 cascade가
축적되며 지속적인 chaotic attractor로 이어집니다.

따라서 `A_c`와 `A_PD`는 경쟁하는 두 계산법이 아닙니다. 하나는 위상공간의 전역
기하가 복잡해지는 지점이고, 다른 하나는 특정한 장기 운동이 국소 안정성을 잃는
지점입니다.

## `A_PD`를 화면 모양이 아니라 안정성으로 측정하기

분기도에서 점이 둘로 갈라져 보이는 순간을 눈으로 고르면 해상도와 transient
길이에 따라 답이 달라집니다. 이 프로젝트는 다음 순서로 측정합니다.

1. 구동 주기마다 `(θ, θ̇)`를 strobe하여 Poincaré map을 만듭니다.
2. `A`를 조금씩 올리되 직전 계산의 마지막 상태를 다음 초기조건으로 사용합니다.
   이렇게 해야 실제로 따라가던 attractor branch를 놓치지 않습니다.
3. period-1이 사라지는 구간을 찾고 이분법으로 좁힙니다.
4. 그 attractor의 점으로 Newton periodic orbit 계산을 시작합니다. 임의의 대칭
   orbit을 고르면 물리적으로 따라가던 branch와 다른 답을 낼 수 있습니다.
5. 한 주기 뒤 미소 섭동의 변화를 나타내는 monodromy 행렬에서 Floquet multiplier를
   구합니다. 가장 음의 실수 multiplier `ρ`가 `-1`을 통과할 때만 진짜 주기배가로
   판정합니다.

0-1 chaos test도 온셋 아래와 위에서 수행하지만, 이것은 보강 증거입니다. 주기배가
직후가 아직 cascade의 초반이거나 periodic window에 걸리면 `K`가 1에 가깝지 않을
수 있습니다. 그래서 0-1 test로 `A_PD`를 정의하지 않고 Floquet의 `ρ=-1`을 정의로
사용합니다.

## 감쇠를 바꾸면 두 임계의 순서가 뒤집힌다

감쇠 `γ=0.10`에서 측정된 비율은
`A_PD/A_c = 2.3753`입니다. 다양체의 tangle이 만들어진 뒤에도 primary attractor는
훨씬 더 큰 구동까지 period-1로 남습니다. `γ=0.50`에서는
`A_c=1.018774`, `A_PD=1.066373`, 비율 `1.0467`입니다. 이 `A_PD`는 문헌 anchor
`1.0663`과 일치합니다.

감쇠를 계속 올리면 차이가 줄어들고, 인증된 보간 결과는
`γ=0.692973` 부근에서 비율 1을 통과합니다. `γ=0.70`에서는
`A_c=1.426284`, `A_PD=1.424635`로 주기배가가 1차 Melnikov 예측보다 먼저 옵니다.

이 역전은 Melnikov 이론의 모순이 아닙니다. Melnikov 식은 구동과 감쇠가 작은
섭동일 때의 1차 근사입니다. 강한 감쇠에서는 근사식이 정확한 경계일 뿐 아니라
사건 순서를 보장하는 상한/하한도 아닙니다. 이 프로젝트의 결과는 "Melnikov가
period-doubling을 예측한다"가 아니라, 서로 다른 두 임계 사이의 간격이 감쇠에
따라 닫히고 1차 근사의 순서가 뒤집히는 위치를 측정했다는 것입니다.

## 숫자보다 caveat가 먼저인 이유

`A_PD`는 primary oscillating branch에 대한 측정입니다. 다른 초기조건이 고르는
공존 attractor는 다른 사건을 보일 수 있습니다. 일부 `γ`에서
`1.08 A_PD`의 0-1 sample이 깨끗한 카오스로 판정되지 않은 것도 숨기지 않고
`reports/flagship-certification.json`의 caveat map에 남깁니다. error bar는 onset
bracket과 `dt` 민감도에 대한 localization contract이며 완전한 확률 posterior가
아닙니다.

이 구분은 과학 커뮤니케이션에서 중요합니다. "카오스가 시작됐다"는 멋진 문장
하나보다, 어떤 객체가 어떤 기준으로 변했는지 설명하는 문장이 훨씬 강한 주장입니다.

## 직접 재현하기

```bash
npm ci
npm run paper:study
npm run flagship:certify
npm run flagship:external
npm run paper:build
```

핵심 데이터는 `reports/paper-study.json`, 교차점/불확도/caveat는
`reports/flagship-certification.json`, 의존성 없는 Python 재계산은
`reports/flagship-external-check.json`, 사람이 읽는 논문은 `paper/paper.pdf`에
생성됩니다. 같은 주장을 데이터, 그림, 독립 계산, caveat 네 방향에서 확인할 수
있게 만든 것이 이 결과의 핵심입니다.
