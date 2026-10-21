# S19 고급 카오스·수송·인력권 진단

`next.html#/lab/{systemId}` → **분석** → **고급 카오스 · 수송 · 인력권 분석**에서 사용한다. 기능 등급이나 학습 진도 잠금은 없다. 기존 11개 S19 카탈로그 정의를 12개 실행 도구로 연결한다. basin과 uncertainty는 같은 native 경계 분석을 공유한다. 35개 시스템·135개 정의·134개 frozen baseline 참조는 유지한다.

## 입력과 결과의 의미

| 도구 | 실제 입력·계산 | 해석 범위 |
|---|---|---|
| RQA | 기록된 한 좌표, transient·stride·지연 embedding, native 재귀 정량화와 블록 변동 | 실제 epsilon과 RR를 보존. Theiler 창·최소 선 길이·관찰 길이에 민감. 블록 standard error는 독립 표본 CI가 아님 |
| recurrence network | 같은 재귀 행렬에서 자기 연결·Theiler 이웃을 제외 | 조밀 그래프의 차수·군집·경로 통계. threshold에 의존 |
| correlation dimension | 지연 점군의 native 상관합·C(r) 범위 적합 | D₂·R²·실제 fitRange와 쌍 수. slope plateau를 자동으로 인증하지 않음 |
| multifractal | 지연 점군의 상자 점유 확률, q·척도별 native generalized dimensions | Dq·tau·alpha·f·R². 음의 q와 빈 상자, 유한 표본에 민감 |
| topological entropy | 명시적으로 선택한 독립 tent/logistic 맵, 구간 [0,1] | 현재 진자나 standard map 결과가 아님. 두 partition과 Perron 반복 상태 보존 |
| transfer operator | 같은 독립 맵의 native Ulam 전이·고유값·불변 측도 | 유한 Markov 근사의 혼합 진단. 0인 부차 고유값의 무한 혼합률은 null과 이유로 표현 |
| CLV | 현재 native smooth RHS·초기조건을 별도 RK4 적분, 순방향 QR·역방향 재귀 | 짧은 기본 구간은 연결 확인용. 실제 벡터·지수·시간·Jacobian 신뢰 metadata 보존. expanding/contracting 쌍이 없으면 각도 판정 불가 |
| FTLE | 현재 native smooth RHS의 한 초기상태, 상태전이 행렬 | 유한시간·좌표 척도·dt 의존. 카오스 증명이 아님 |
| FTLE/LCS 능선 | 무감쇠 double의 θ₁–θ₂ 격자, 각 셀 정지 초기속도 | 현재 초기각·속도를 대체한 별도 스캔. 능선 후보이며 물질 수송 LCS 인증이 아님 |
| basin | 같은 무감쇠 double의 native 유한시간 반전 격자와 basin entropy | label 0/1은 먼저 반전한 봉, 2는 관찰 기간 내 반전 없음. 점근 attractor basin이 아님 |
| uncertainty | 반전 경계 mask와 native box-counting | α=2−D는 조건부 유한 격자 proxy. 교란 쌍에서 직접 측정한 점근 지수가 아님. 경계·척도가 부족하면 null과 이유 |
| Wada | 같은 물성의 세 반전 격자, n·ceil(1.5n)·2n | 고정 cell 반경의 이웃 후보 비율 비교. 충분한 label·경계가 없으면 판정 불가. Wada 증명이 아님 |

표본 도구는 실제 기록에서 transient·stride 적용 후 **처음 maxSamples개**를 선택한다. 원 기록과 선택한 시각·개수를 artifact에 보존한다. 원 기록이 짧거나 상수이거나 간격이 균일하지 않으면 설명하고 거부하며 자동 보간하지 않는다. 좌표와 단위는 S18 provider를 공유하고, SI 초·정규화 시간·iteration을 구분한다.

접선 도구는 S18의 검증된 smooth native RHS를 공유한다. hybrid·구속 투영·마찰 전환·지연·확률·이산·양자 모델에 부적절한 ODE 접선을 대신 적용하지 않는다. 격자 도구는 `system:double`과 gamma=0만 허용하여 감쇠를 무시하지 않는다. CLV 시간 설정은 **QR block 수**이며 실제 기간은 block 수×renormEvery×dt다.

## 자원·오류·산출물

- 원 관측 상한: 8,192표본·256좌표·1,000,000상태값. 조밀 표본 분석 최대512점, recurrence network 최대256점, embedding 최대8차원.
- 접선 상태 최대16차원, 최대2,000,000 step×차원². 기본 격자 최대32×32이며 Wada 세분 격자는 최대64×64다. 세 Wada 격자를 포함한 누적1,000,000 궤적 step과 물성별 무차원 step 안전 상한을 적용한다. 정확한 설정별 범위와 기본값은 공용 settings 계약에서 화면에 표시한다.
- 수치 계산은 별도 module worker에서 실행한다. 계산 시작/결과 준비 상태를 표시하고, 취소·화면 이탈 시 worker를 terminate한다. 30초 무응답은 종료하고 조건을 줄여 재실행하도록 안내한다. 동기 native 함수 내부에서는 세부 진행률을 꾸며내지 않는다.
- artifact schema는 `pendulum-advanced-diagnostic/v1`, 알고리즘은 `advanced-diagnostics-v1`이다. 원 실험·관측·선택 조건·별도 source/격자·결과·경고·run ID·생성 시각을 보존한다.
- 16MiB 파일·구조/깊이/표본 예산과 닫힌 계약을 검증한다. 위험 키, getter, 희소 배열, 비유한 수, 알 수 없는 schema/필드, 잘못된 좌표·단위·계산법을 거부한다. 파일 재로드는 현재 실험을 바꾸지 않고 저장된 결과를 표시한다. 구조 검증은 과학적 결과의 서명이나 제삼자 진위 인증을 뜻하지 않는다.
- 그래프·격자 그림과 단위가 있는 수치 표를 제공한다. 화면 표는 제한된 행만 표시하고 전체 원자료는 artifact에 보존한다. bounded JSON 가져오기/내보내기는 main thread에서 수행한다.

## 수치 근거와 검토 상태

`scripts/redesign/measure-advanced-diagnostics.ts`는 주기 신호의 RQA, 원의 차원, binomial cascade의 닫힌 Dq, tent map log2, 2상태 전이 고유값, logistic 불변밀도 CDF, 선형 대각계의 FTLE/CLV, 균일/혼합 basin entropy와 직선 경계를 검사한다. product/native parity와 모든 시스템의 호환성 검사는 별도 Vitest에 있다.

logistic Ulam 32상자의 CDF 오차는 약0.07946으로 0.06 기준에 미달한다. 64·128상자로 세분하면 같은 오차 기준을 통과하고 오차가 감소한다. 이 사실은 작은 격자에서 나온 추정값을 정확값처럼 해석할 수 없다는 근거로 보존한다. 선택된 벤치마크의 통과는 임의 시스템·기간의 수렴을 인증하지 않는다.

출처는 RQA의 [Marwan 외 원문](https://www.recurrence-plot.tk/marwan_PhysRep2007.pdf), CLV의 [Ginelli 외 원문](https://arxiv.org/abs/0706.0510), basin entropy의 [Daza 외 원문](https://arxiv.org/abs/1605.02342)을 대조했다. 이론의 근거와 제품 구현의 선택된 검증을 구분한다. 사람의 과학 검토 완료를 주장하지 않는다. 신규 교육 단원을 공개하지 않았으며 기존 공개 8개 단원의 검토 등급도 변경하지 않았다.

최종 테스트 수·commit·push·보존 증거는 `stage-runs/S19-progress.md`, `S19-verification.json`, `S19-numerical-metrics.json`에 기록한다. 기존 공급망/CodeQL 위험은 이 단계에서 해결하거나 수용하지 않는다. rollback은 S18 `a7f4081`과 운영 가능한 기존 `app.html`을 기준으로 한다.
