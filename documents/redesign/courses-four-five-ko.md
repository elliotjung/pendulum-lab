# 과정 4~5: 비선형 진동·제어와 카오스 측정

S26은 과정 4의 10개와 과정 5의 13개 단원만 추가한다. 총 8개 과정·86개 예약 중 공개 단원은 49개이며, S27의 37개는 준비 중이다. 미완료 진도는 접근 권한이나 실험실 기능을 제한하지 않는다.

## 열기와 재현

`npm run build` 후 `npm run preview -- --port 5173`으로 연다.

- `/next.html#/learn/course-4`: 감쇠·구동·비선형 진동과 제어
- `/next.html#/learn/course-5`: 카오스를 측정하는 방법
- 각 단원: `/next.html#/learn/course-4/4.1` 또는 `/next.html#/learn/course-5/5.10`처럼 ID로 직접 연다.

예측 → 노출 변수 편집 → 실험 실행 → 그래프·진단·실제 설정 표 확인 → 예상 관찰과 대조 → 실험실에서 계속의 순서다. 실행 중 취소하면 해당 worker를 종료한다. 잘못된 입력은 마지막 유효 설정과 저장 원본을 바꾸지 않는다. 손상된 세션은 원본을 보존하고 그 탭에서 쓰기를 중지한다.

결과 JSON에는 단원 ID, 전체 고정/노출 설정, canonical 기준 실험, 지표, 표, 그래프, 한계를 남긴다. 뒤로가기는 같은 문서의 완료 결과를 유지하고 새로고침은 버전과 계보를 확인한 재시작 설정을 복원한다. 기준 실험의 canonical 상태는 Lab의 상태 JSON과 동일해야 한다. 별도 sweep·grid·비교 계산은 보고서에 표시하며 기준 run인 것처럼 전달하지 않는다.

## 실제 엔진 연결

| 단원 | 실제 공용 계산과 관찰 |
|---|---|
| 4.1 | 감쇠 이중진자, 에너지 수지, 질량행렬을 이용한 정준 미소 부피 수축 |
| 4.2 | 같은 초기조건의 7개 구동 주파수, 후반부 조화 fitting 진폭·지연 |
| 4.3 | native Mathieu Floquet 5×5 격자, 직접 응답, substep 비교 |
| 4.4 | native Kapitza 직접 가진/무가진 비교와 평균화 퍼텐셜 |
| 4.5 | 실제 역진자·cart-pole 각각 개방/폐루프, 실제 힘 포화 |
| 4.6 | 결합 진자의 beat와 대칭/반대칭 모드 |
| 4.7 | Duffing 상향/하향 주파수 연속 실행과 다른 초기조건 |
| 4.8 | Van der Pol 안쪽/바깥쪽 초기조건의 한계주기 접근 |
| 4.9 | 실제 stick/slip 사건과 마찰 일, 전환이 없는 조건 |
| 4.10 | 실제 Pyragas gain-delay 3×3 후보, 주기성 결함·피드백과 과거 이력 |
| 5.1 | 동일 궤적의 구성·위상 투영 및 native 지연 embedding |
| 5.2 | 동일 균일 기록에서 FFT 창과 sampling 조건 비교 |
| 5.3 | 동일 물리 기록의 NAFF·FFT, Hz/rad·s⁻¹ 구분, 합성 tone 검증 |
| 5.4 | 실제 상향/하향 Poincare 교차와 return map, 빈 단면 |
| 5.5 | native 변분/QR 첫 지수, 기간·재규격화 간격 비교 |
| 5.6 | 전체 4개 지수와 동일 좌표의 native Jacobian 평균 trace |
| 5.7 | 같은 9개 초기조건과 기간의 SALI·FLI 비교 |
| 5.8 | 같은 기록에서 관측량·sampling별 실제 0–1 통계 |
| 5.9 | native 후보/고정밀 참조 비교와 거리 문턱별 유한 신뢰 구간 |
| 5.10 | 실제 recurrence matrix와 RQA, 목표 재귀율 비교 |
| 5.11 | 실제 recurrence graph와 degree·clustering·transitivity |
| 5.12 | native correlation sum과 log-log fit, embedding·표본·구간 변화 |
| 5.13 | native 상자 점유·q 격자·Legendre spectrum과 표본 편향 |

운동방정식과 적분기는 기존 S07/S13/S14 구현을 호출한다. 핵심/고급 진단은 S18/S19 adapter를 호출한다. 교육 전용으로 물리 엔진을 복제하지 않는다. 유한 데이터의 표시·수지 적분·조화 fitting 등 관찰 후처리는 명시한다.

## 단위와 Lab 전달

Mathieu·Duffing·Van der Pol의 시간·변위는 모델의 정규화 규약이며 SI 초·미터로 표시하지 않는다. 나머지 시스템의 각도 기준, 감쇠·힘·각가속도 단위는 각각의 native 계약을 따른다. 각도·각속도 투영의 면적과 정준 q,p 부피는 다르다. FFT Hz와 NAFF rad/s는 2π 변환 뒤 같은 성분끼리 비교한다.

과정 4는 기준 native config의 intrinsic 진단을 사용하며 지원하지 않는 canonical 분석 job을 만들지 않는다. 과정 5는 선택한 core/advanced 분석의 수치 quantity·문자 option·알고리즘 버전을 canonical로 전달한다. Lab panel은 이를 읽고 편집·저장·내보내기에도 보존한다. 과거 S07 분석과 미래의 알 수 없는 버전은 구분하며 잘못된 단위나 필드는 조용히 기본값으로 바꾸지 않는다.

## 해석과 검토의 한계

- 유한시간 양의 지수, 작은 SALI, 큰 FLI, 0–1 K 한 개만으로 점근적 카오스를 확정하지 않는다. 기간·재규격화·sampling·관측량·구간 수렴을 확인한다.
- 위상 부피는 좌표와 측도에 의존한다. 4.1은 정준 미소 부피, 5.6은 각도·각속도 좌표의 전체 접선 부피와 발산을 각각 비교한다.
- 짧은 공명·Duffing sweep에는 transient와 방향 이력이 남는다. 유한 구간의 응답 차이는 인증된 분기 branch가 아니다. Mathieu 승수 반경≈1은 Jordan 성장과 수치 경계 오차를 배제하지 않는다.
- Kapitza 평균화는 고주파·작은 지지대 진폭의 국소 근사다. 직접 응답·빠른 주기 해상도와 함께 해석한다. 국소 선형 피드백은 전역 안정성을 보증하지 않는다.
- 4.10은 지연 피드백의 비침습 조건과 실제 후보 grid를 제공한다. 기본값은 주기성 결함이 0이 아니며, shooting/Floquet로 검증된 UPO 안정화 인증을 주장하지 않는다.
- shadowing은 수치 참조에 대한 유한 구간 거리 검사다. 참 궤적 존재 정리나 무한 신뢰 시간의 인증이 아니다.
- 재귀율은 epsilon 선택과 Theiler 제외에 의존한다. 지연 점군의 그래프·차원·multifractal 결과는 짧은 궤적의 표본 특성이며 점근 attractor의 인증이 아니다. 행렬 그림은 전체 연결에서 첫/마지막을 포함한 균일 간격으로 최대2500개를 표시하며 원 계산과 구분한다.
- worker 경계 검사는 구조·유한성·자원 한도와 입력 계보를 확인한다. 임의로 조작한 유한 지표 값의 과학적 진실을 암호학적으로 인증하지 않는다. 실제 관찰의 정확성은 별도 native/synthetic fixture로 검사한다.
- 각 단원의 참고문헌 locator와 보존된 원 소스 대조를 기록한다. 접근하지 못한 논문 전체를 읽었다고 주장하지 않는다. `automated-verified`, `source-checked`, `human-reviewed`는 구별하며 사람·물리 전문가 검토는 미완료다.
- 브라우저 자동 접근성·키보드·모바일 에뮬레이션은 실기기나 screen reader 음성 인증이 아니다. 기존 dependency/CodeQL 부채는 S30에서 판정한다.

정확한 실행 환경·통과/실패·보존 증거는 `stage-runs/S26-verification.json`과 `S26-preservation.json`, 진행·원격 commit은 `S26-progress.md`에 남긴다. 원격 status commit이 완료의 권위다. 기존 `app.html`은 계속 사용할 수 있으며 S29 전환을 수행하지 않는다.
