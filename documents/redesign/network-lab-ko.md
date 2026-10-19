# S15 자기·네트워크·동기화 Lab

병렬 진입점 `next.html#/lab`의 network 패밀리는 다섯 모델을 실제 계산한다. 기존 `app.html`은 계속 사용할 수 있다. 학습 진도에 따른 잠금은 없다.

| 경로 | 기존 계산 경계 | 좌표와 해석 |
|---|---|---|
| `#/lab/magnetic` | `rhsMagneticPendulum`, `magneticPendulumEnergy`, native 정착 알고리즘 | 정규화 `[x,y,vx,vy]`, 고정 자석의 평면 위치·강도 |
| `#/lab/pendulum-network` | `rhsPendulumNetwork`, `buildCouplingMatrix`, `pendulumNetworkEnergy` | `[θ 전체,ω 전체]`, rad·rad/s, 질량 kg·길이 m·비틀림 결합 J/rad² |
| `#/lab/huygens-phase-pair` | `rhsHuygensPhasePair` | 두 위상 rad, 진동수 rad/s, 결합 s⁻¹ |
| `#/lab/kuramoto` | `rhsKuramoto`, global/local order parameter | N개 위상 rad, 행별 이웃 가중치 정규화 |
| `#/lab/chimera-exploration` | 같은 Kuramoto RHS·`chimeraDiagnostics`·기존 exploration의 midpoint/wrapping | N개 위상, 물리적 ringOrder, 비국소 고리 반경 |

## 편집·재현

조건 패널에서 모델과 호환되는 계수, 노드 수와 고리 반경, seed, 노드·간선·초기조건 JSON, 시간 간격과 관찰 길이를 편집한다. 고정 두 노드인 Huygens의 노드 수와 Huygens·magnetic의 불필요한 반경은 숨긴다. 편집 시작 시 실행을 취소하고 적용 전까지 실행을 막는다. 전체 조건이 유효할 때만 함께 적용하며, 오류는 원본과 마지막 유효 설정을 보존한다. 노드·간선 JSON 파일 가져오기는 편집기에 불러온 뒤 조건 적용으로 확정한다.

노드 ID와 간선 ID는 고유 ASCII 식별자다. 간선은 무방향이며 self edge, 같은 노드 쌍의 parallel edge, 없는 endpoint, 음수·유한하지 않은 가중치를 거부한다. 고립 노드는 허용하며 local coherence=0으로 표시한다. Huygens는 두 노드·단위 간선 하나, magnetic은 고정 자석·간선 없음, chimera는 모든 노드가 한 번씩 등장하는 ringOrder와 반경에 맞는 단위 가중치 고리를 요구한다. 임의 node/edge 속성을 조용히 버리지 않는다.

공통 schema의 `topology`는 선택 필드지만 S15 `network-model-v1` adapter는 이를 필수로 요구한다. stable ID·edge endpoint·ringOrder를 이 versioned metadata에 저장하고, 수치는 기존 단위가 있는 quantity 벡터로 저장한다. 다른 모델 버전은 topology를 해석하지 않는다. 공통 schema와 기존 단위 allowlist는 유지한다. 자세한 구조는 [상태 계약](state-contract-ko.md)을 따른다.

seed는 `fnv1a-mulberry32` / version `1`로 새 초기조건을 만들 때만 사용한다. 노드별 stream은 stable ID에 대응하므로 배열 순서를 바꿔도 같은 ID에 같은 초기값이 대응한다. 저장·공유를 복원할 때는 명시한 초기조건을 그대로 사용한다. seed를 바꾸어 저장된 위상을 자동으로 다시 만들지 않는다.

## 실행·관측·내보내기

외부 노드·간선 파일은 `pendulum-network-graph-file/v1`이며 `{systemId, graph, initialState}`를 포함한다. canonical 내부 `pendulum-network-topology/v1`의 ID metadata와 서로 다른 문서 schema를 사용한다. 두 형식 모두 중복 JSON 키와 위험한 객체를 거부한다.

궤적 계산은 dedicated worker에서 실행하고 진행·일시정지·한 단계·취소·초기화를 제공한다. magnetic, 진자 graph, Huygens, Kuramoto는 기존 RK4를 사용한다. Chimera는 기존 exploration과 같은 midpoint RK2와 매 단계 위상 wrapping을 사용한다. 일반 q/v 분할 적분기를 위상 모델에 적용하지 않는다.

작업 공간은 aggregate와 개별 노드 상태를 전환한다. 시간 응답·상태·위상·global order R·local coherence·에너지는 호환 모델에서만 제공한다. 위상 모델에는 기계 에너지가 없다. 진자 graph의 θ 원형 정렬은 진동 위상을 추정하는 분석이 아니며, 순간 R이 크다는 사실만으로 동기화된 진동을 증명하지 않는다.

자기 seed grid는 같은 좌표 격자에서 정지 상태를 시작하여 native 도구와 같은 velocity-first semi-implicit Euler를 사용한다. Native 주석 일부가 velocity-Verlet라고 부르지만 실제 승인된 update 순서를 재사용하며 궤적 RK4와 구분한다. 셀 안에서도 계산을 나누어 취소한다. 최근접 자석 ID, 수행 단계, 속도 수렴 mask를 함께 내보낸다. 유한 관찰 길이의 최근접 분류와 속도 허용오차는 실제 정착·인력권·Wada 경계의 인증이 아니다. native의 final-speed 수렴 정의를 보존하므로 마지막 단계에서만 속도가 작아도 mask가 참일 수 있다. dt·예산·해상도를 바꾸어 재검증해야 한다. 감쇠 0은 정착 basin으로 해석하지 않는다.

저장 공간은 `pendulum-product/network/v1/`로 분리한다. 저장된 값이 손상되었거나 미래 버전이면 기존 값을 덮어쓰지 않는다. canonical JSON, 공유 링크, 노드·간선 JSON, 단위가 있는 궤적·격자 CSV와 SVG 그림을 제공한다. 공유 route 한도를 넘는 큰 그래프는 JSON 파일로 전달한다. 설정 저장은 현재 solver 객체의 dump가 아니라 명시한 초기조건에서 다시 시작하는 계약이다.

## 과학·자원 한계

- 자기 모델은 정칙화된 현상론적 평면 모형이며 실제 자석 형상·접촉·실측 단위의 보정이 없다. canonical runtime의 s carrier는 `timeConvention=normalized`로 구분하며 UI와 CSV는 정규화 시간으로 표시한다.
- 진자 graph의 결합은 대칭 비틀림 spring이다. 감쇠가 있으면 에너지가 소산되며 실제 접촉 네트워크를 뜻하지 않는다.
- Kuramoto graph는 self edge 없이 이웃 가중치 합으로 정규화한다. self 항을 포함한 기존 all-to-all K/N은 phase lag가 있을 때 별도 수치 의미를 가진다. 두 식을 같은 설정으로 혼동하지 않는다.
- Huygens는 위상 축약이다. 진폭, 지지대 반동, 탈진기, 충돌, 기어 마찰은 포함하지 않는다. α=0의 위상 잠금 한계를 일반 α에 확장하지 않는다.
- `chimera-candidate`는 순간 유한 크기 진단이다. 장시간 지속성, N과 반경 세분화, 초기조건 교란이 추가로 필요하다. 물리적 고리 순서와 벡터 저장 순서를 분리한다.
- Chimera의 분류 threshold는 기존 exploration과 같은 coherent ≥0.9, incoherent ≤0.3이다. 이 값은 새로운 보편적 임계값을 주장하지 않는다.
- 최대 128노드(자석 16개), 4,096간선, 100,000시간 단계다. 큰 dense RHS와 국소 지표는 O(N²)이며 한 요청은 최대 64단계, 단계 사이 8ms 예산을 사용한다. 한 단계 자체의 실행 시간은 기기와 네트워크 규모에 좌우되므로 8ms가 엄격한 응답 마감 시간은 아니다.
- 격자는 최대 16×16셀·셀당 10,000단계다. 표본·worker 응답·그림은 제한된 개수를 사용한다. JSON의 256KiB·깊이·방문 노드 공통 안전 예산에 따라 최대 간선 수보다 먼저 거부될 수 있다.
- 궤적은 최대 2,001표본을 자동 stride로 기록하고 그림은 series당 약 600점을 사용한다. scene은 간선 512개만 그리며 계산·JSON은 전체 그래프를 보존한다. worker 응답 timeout은 15초다. 격자 CSV는 완료한 셀만 담고, JSON 저장은 부분 계산 상태가 아닌 설정과 초기조건을 담는다.

## 검증·검토·복구

기존 native 결과 대비 characterization, node permutation, graph validation, seed 반복, worker 취소·오류, 저장/공유 round trip과 desktop/mobile 여정을 검사한다. 정확한 fixture와 결과는 [수치 측정](stage-runs/S15-numerical-metrics.json), [검증 기록](stage-runs/S15-verification.json), [진행 기록](stage-runs/S15-progress.md)에 기록한다. 수치 fixture의 일치는 임의 설정의 안정성 보장이 아니다.

S15는 별도 사용자 승인 gate가 아니다. 사람 과학 검토를 수행했다고 표시하지 않는다. 기존 dependency/CodeQL 미해결 위험은 보존하며 새 dependency를 도입하지 않는다. 기존 `app.html`과 S14 완료 커밋 `b2c2a31455fb1a10ef2c804590e3ea68a60c91f3`가 복구 기준이다. S16 이후와 기본 앱 전환은 이 단계에서 실행하지 않는다.
