# S27 과정6 — 인력권·주기궤도·분기 구조

## 구현과 검증 범위

6.1–6.12의12개 독립 단원은 한국어·영어 이론, 선수 조건, 두 식의 유도·기호·SI/정규화 단위, 예측→실행→관찰→설명, 두 확인 질문, 출처와 Lab 전달을 제공한다. 콘텐츠에는 운동 계산이 없고 기존 native 엔진·분석을 호출하는 제한된 orchestration을 사용한다.

- 6.1: 실제 RHS의 `numericalJacobian`과 `eigenvalues2x2`, 공용 구동 진자 교란 실행. 아래 평형 고유값 실수부−0.25 s^-1, 위 평형의 양의 실수 고유값과 비선형 교란 성장 확인.
- 6.2: S20 native shooting·원시 주기 database·실제 반환 잔차 이력. 낮은 주기 중복과 미수렴을 성공으로 바꾸지 않는다.
- 6.3: 실제 주기해의 Floquet와 독립 Liouville identity. 기본 행렬식 `exp(-0.5*3*pi)`를 수치 허용치 안에서 확인한다.
- 6.4: 해석 Melnikov와 실제 separatrix quadrature 차이는 기본 설정에서약1.3e-14. 별도 Newton saddle, native 변분 monodromy/eigenvector, 기존 RHS/RK4의 정·역시간 반환 맵으로 stable/unstable 다양체를 표본화한다. saddle이 수렴하고 쌍곡 조건을 만족할 때만 표시한다.
- 6.5: 실제 S20 자연 매개변수 continuation과 수렴점 warm start·실패 보존.
- 6.6: S20의 독립 fold 정규형에서 실제 arclength. 다른 부호의 x 가지에 도달하고 모든 `x*x-lambda` 잔차를 검사한다.
- 6.7: S20의 독립 pitchfork 정규형에서 양·음 비영 가지와 원 가지 재수렴 거부. `x*x≈lambda`와 명시한 맵의 승수를 검사한다.
- 6.8: 실제 S20 continuation과 공용 native period-doubling switch, 동일128구동주기 과도구간 뒤16개 반환 표본, P^1/P^2/P^4 shooting. 기본 스캔은 서로 다른 반환값1→2→4를 관찰하며 A1.08의 P4는 잔차약3.6e-9, 최대승수약0.533, 최소 cycle 분리약0.097을 얻는다. 실제 반환의 theta와 omega를 함께 Newton seed로 사용한다.
- 6.9: S20 독립 delayed-logistic NS와 실제21점 collocation 불변 원. a2에서 승수 반경1 통과, 비영 진폭과 별도 off-grid 잔차를 검사한다.
- 6.10: S20 native sine-circle의 K0/K2분의1/K 절단면. K0에서 회전수가 입력 frequency와 일치한다.
- 6.11: S20 실제 구동 진자의2매개변수 유한시간 지도와 별도 출처가 있는 해석적 cusp fold 곡선. 두 그림의 대상과 증거 수준을 분리하고 독립 cusp의 G/Gx 잔차를 검사한다.
- 6.12: S19 공용 실제 반전 격자·2−D 경계 proxy·세 해상도 Wada 후보/데이터 부족 판정. 기본16×16 반전 표의256셀과 label 충분성을 확인한다.

## 전달과 보존

S20의 지원되는 기준 분석은 공통 `toStabilityAnalysis`로 정확한 kind/source·수치 설정·단위를 canonical에 보존한다.6.9는 NS와torus를 모두 보존한다.6.12는 지원되는 `analysis:basin`과 `analysis:wada`의 정확한 고급 설정을 보존하고 uncertainty companion은 결과 JSON에 명시한다. 기준 물리 run은 초기조건에서 다시 시작한다. 독립 정규형과 다양체·sweep의 source는 결과 표/JSON에 남으며 이를 물리 초기조건으로 바꾸지 않는다.

기존 physics/chaos/research 엔진·적분기·native product adapter·공개 API·기존 데이터 형식은 수정하지 않았다. 전용 필드는 안전한 일반 데이터만 허용하며 누락·알 수 없는 필드·고정값 변조·범위 초과·비유한수·accessor를 거부한다.

## 출처 대조와 검토 상태

2026-11-05에 보존된 native 소스와 저자 자료를 대조했다. 주요 외부 자료는 Kuznetsov의 *Elements of Applied Bifurcation Theory*, 저자 Scholarpedia의 Saddle-Node/Period doubling/Neimark–Sacker/Cusp, Holmes–Marsden의 Caltech 저자 저장소 논문, AUTO 공식 저장소, Boyland의 arXiv2506.02988v1 Introduction/2.1–2.2, Daza–Wagemakers–Sanjuán의2018 Wada merging 논문이다. 각 단원에 실제 locator를 기록한다. Circle_map이라는 존재하지 않는 추정 링크는 사용하지 않고 실제 열람한 Boyland 원문으로 교정했다.

12개 모두 schema/자동 과학 fixture/출처 대조 대상이며 자동 검사 통과 뒤 `automated-verified`와 `source-checked`로 공개한다. 사람·물리 전문가 검토는 **0/12**다. AI 검토를 사람 검토로 기록하지 않는다.

## 해석의 한계

- 다양체 선분의 교차는 finite seed/반환수/곡률/역시간 적분에 민감한 후보다. 안전 범위 밖 표본은 절단 수를 표시하며 교차0은 부재 증명이 아니다. Melnikov는 약섭동 근사다.
- 유한 cascade는 배가 후보를 인접 매개변수 사이에 한정한다. 원시 주기 분리·잔차·승수를 함께 읽으며 무한 cascade나 Feigenbaum 극한 비율을 인증하지 않는다.
- NS의 복소 단위원 통과는 강공명·비퇴화 검사를 대체하지 않는다. 불변 원은 비영 진폭과 off-grid 잔차가 필요하며 collocation15의 부족한 해상도를 성공으로 승인하지 않았다.
-6.11 물리 지도는 실제 분기곡선 continuation이나 물리 cusp 인증이 아니다. 독립 cusp의 두 fold 곡선/원점과 실제 물리 지도의 유한시간 경계를 혼동하지 않는다.
-6.12의 finite flip label은 장기 attractor가 아니다.2−D는 직접 측정한 uncertain-pair 지수가 아니고 세 해상도 Wada 후보는 엄밀한 위상 성질의 증명이 아니다.

초기 독립 검사에서 다양체 seed가 다른 안정 주기해로 수렴한 경우와15점 원의 off-grid 잔차 초과를 발견했다. 수치 assertion을 완화하지 않고 물리 saddle의 일차 조화 초기 추정·native 변분 monodromy와21점 collocation을 사용해 수정했다. 최종 검증 명령·source hash·원격 증거는 S27의 통합 검증 기록을 따른다.
