# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: redesign\legacy-workspace.spec.ts >> source-preserving workspace migration and adoption >> imports all native research DB stores, reads exact backup and typed assets, then restores adoption after reload
- Location: e2e\redesign\legacy-workspace.spec.ts:68:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('#legacy-workspace-saved option')
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('#legacy-workspace-saved option')
    14 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "본문으로 건너뛰기" [ref=e3] [cursor=pointer]:
    - /url: "#product-main"
  - banner [ref=e4]:
    - generic [ref=e5]:
      - link "Pendulum Lab" [ref=e6] [cursor=pointer]:
        - /url: "#/learn"
      - generic [ref=e7]: 새 공간 미리보기
    - navigation "주요 공간" [ref=e8]:
      - link "배우기" [ref=e9] [cursor=pointer]:
        - /url: "#/learn"
      - link "실험실" [ref=e10] [cursor=pointer]:
        - /url: "#/lab"
    - generic [ref=e11]:
      - generic [ref=e12]: 화면 테마
      - combobox "화면 테마" [ref=e13]:
        - option "밝게" [selected]
        - option "어둡게"
        - option "기기 설정"
    - link "기존 앱 열기" [ref=e14] [cursor=pointer]:
      - /url: ./app.html
  - main [ref=e15]:
    - generic [ref=e16]:
      - paragraph [ref=e17]: LAB · 실험실
      - heading "질문을 직접 시험하는 실험실" [level=1] [ref=e18]
      - paragraph [ref=e19]: 시스템을 고르고, 조건을 정하고, 실험을 조립하세요. 모든 시스템을 학습 진도와 관계없이 탐색할 수 있습니다.
      - paragraph [ref=e20]: 8개 패밀리의 모든 35개 시스템에서 조건 설정·실제 계산·그래프·내보내기를 사용할 수 있습니다. 진자·구동·비선형·네트워크 계는 각 모델의 동역학을, Langevin 앙상블·FPUT·sine-Gordon은 정규화 동역학을 계산합니다. 조화 격자·FK kink는 정적 진단입니다. 표준 사상과 양자 킥 회전자는 반복 횟수로 전진하며, 유니터리 Floquet는 복소 연산자의 스펙트럼을 평가합니다. 독립 이원자·pinning·Arrhenius 진단과 모든 그래프의 표시 단위·모델 범위를 확인하세요.
      - generic [ref=e21]:
        - link "기존 앱에서 실험하기" [ref=e22] [cursor=pointer]:
          - /url: ./app.html
        - link "배우기 알아보기" [ref=e23] [cursor=pointer]:
          - /url: "#/learn"
      - region "시스템 찾기" [ref=e24]:
        - generic [ref=e25]:
          - generic [ref=e26]: 시스템 검색
          - searchbox "시스템 검색" [ref=e27]
          - paragraph [ref=e28]: 한국어·영어 이름과 키워드로 검색합니다.
        - generic [ref=e29]:
          - text: 시스템 패밀리
          - combobox "시스템 패밀리" [ref=e30]:
            - option "모든 패밀리" [selected]
            - option "고전 진자"
            - option "용수철과 줄"
            - option "공간 진자"
            - option "구동과 제어"
            - option "비선형 진동"
            - option "네트워크"
            - option "확률과 장"
            - option "이산계와 양자계"
        - generic [ref=e31]:
          - text: 목록 보기
          - combobox "목록 보기" [ref=e32]:
            - option "전체 시스템" [selected]
            - option "최근 선택"
            - option "즐겨찾기"
      - paragraph [ref=e33]: 최근 선택과 즐겨찾기는 현재 페이지에서 유지됩니다. 새로고침하면 초기화됩니다.
      - status [ref=e34]: 35개 시스템 · 전체 35개
      - generic [ref=e35]:
        - article "점질량 이중 진자" [ref=e36]:
          - heading "점질량 이중 진자" [level=2] [ref=e37]
          - paragraph [ref=e38]: 두 질점과 질량 없는 두 막대의 평면 운동.
          - generic [ref=e39]:
            - paragraph [ref=e40]: 고전 진자 · 2 자유도
            - generic [ref=e41]:
              - link "점질량 이중 진자 선택하고 설정하기" [ref=e42] [cursor=pointer]:
                - /url: "#/lab/double"
                - text: 선택하고 설정하기
              - button "점질량 이중 진자 즐겨찾기" [ref=e43] [cursor=pointer]: 즐겨찾기
        - article "균일 막대 복합 이중 진자" [ref=e44]:
          - heading "균일 막대 복합 이중 진자" [level=2] [ref=e45]
          - paragraph [ref=e46]: 막대의 분포 질량과 회전 관성을 포함한 이중 진자.
          - generic [ref=e47]:
            - paragraph [ref=e48]: 고전 진자 · 2 자유도
            - generic [ref=e49]:
              - link "균일 막대 복합 이중 진자 선택하고 설정하기" [ref=e50] [cursor=pointer]:
                - /url: "#/lab/compound-double"
                - text: 선택하고 설정하기
              - button "균일 막대 복합 이중 진자 즐겨찾기" [ref=e51] [cursor=pointer]: 즐겨찾기
        - article "삼중 진자" [ref=e52]:
          - heading "삼중 진자" [level=2] [ref=e53]
          - paragraph [ref=e54]: 세 링크 평면 진자의 결합 운동.
          - generic [ref=e55]:
            - paragraph [ref=e56]: 고전 진자 · 3 자유도
            - generic [ref=e57]:
              - link "삼중 진자 선택하고 설정하기" [ref=e58] [cursor=pointer]:
                - /url: "#/lab/triple"
                - text: 선택하고 설정하기
              - button "삼중 진자 즐겨찾기" [ref=e59] [cursor=pointer]: 즐겨찾기
        - article "N중 평면 진자" [ref=e60]:
          - heading "N중 평면 진자" [level=2] [ref=e61]
          - paragraph [ref=e62]: 질량·길이 배열로 정의하는 가변 링크 진자.
          - generic [ref=e63]:
            - paragraph [ref=e64]: 고전 진자 · 가변 자유도
            - generic [ref=e65]:
              - link "N중 평면 진자 선택하고 설정하기" [ref=e66] [cursor=pointer]:
                - /url: "#/lab/chain"
                - text: 선택하고 설정하기
              - button "N중 평면 진자 즐겨찾기" [ref=e67] [cursor=pointer]: 즐겨찾기
        - article "용수철 진자" [ref=e68]:
          - heading "용수철 진자" [level=2] [ref=e69]
          - paragraph [ref=e70]: 반지름 변형과 각운동이 결합된 Hooke 용수철 진자.
          - generic [ref=e71]:
            - paragraph [ref=e72]: 용수철과 줄 · 2 자유도
            - generic [ref=e73]:
              - link "용수철 진자 선택하고 설정하기" [ref=e74] [cursor=pointer]:
                - /url: "#/lab/spring"
                - text: 선택하고 설정하기
              - button "용수철 진자 즐겨찾기" [ref=e75] [cursor=pointer]: 즐겨찾기
        - article "편측 줄 진자" [ref=e76]:
          - heading "편측 줄 진자" [level=2] [ref=e77]
          - paragraph [ref=e78]: 줄의 팽팽함·느슨함과 재포획 충격을 추적한다.
          - generic [ref=e79]:
            - paragraph [ref=e80]: 용수철과 줄 · 가변 자유도
            - generic [ref=e81]:
              - link "편측 줄 진자 선택하고 설정하기" [ref=e82] [cursor=pointer]:
                - /url: "#/lab/rope"
                - text: 선택하고 설정하기
              - button "편측 줄 진자 즐겨찾기" [ref=e83] [cursor=pointer]: 즐겨찾기
        - article "편측 이중 줄 진자" [ref=e84]:
          - heading "편측 이중 줄 진자" [level=2] [ref=e85]
          - paragraph [ref=e86]: 두 줄의 장력·이완·재포획을 포함한 평면 운동.
          - generic [ref=e87]:
            - paragraph [ref=e88]: 용수철과 줄 · 가변 자유도
            - generic [ref=e89]:
              - link "편측 이중 줄 진자 선택하고 설정하기" [ref=e90] [cursor=pointer]:
                - /url: "#/lab/double-string"
                - text: 선택하고 설정하기
              - button "편측 이중 줄 진자 즐겨찾기" [ref=e91] [cursor=pointer]: 즐겨찾기
        - article "구면 진자" [ref=e92]:
          - heading "구면 진자" [level=2] [ref=e93]
          - paragraph [ref=e94]: 극각과 방위각으로 표현한 공간 진자.
          - generic [ref=e95]:
            - paragraph [ref=e96]: 공간 진자 · 2 자유도
            - generic [ref=e97]:
              - link "구면 진자 선택하고 설정하기" [ref=e98] [cursor=pointer]:
                - /url: "#/lab/spherical"
                - text: 선택하고 설정하기
              - button "구면 진자 즐겨찾기" [ref=e99] [cursor=pointer]: 즐겨찾기
        - article "구면 진자 사슬" [ref=e100]:
          - heading "구면 진자 사슬" [level=2] [ref=e101]
          - paragraph [ref=e102]: 공간 N중 진자의 각 좌표 질량 행렬을 푼다.
          - generic [ref=e103]:
            - paragraph [ref=e104]: 공간 진자 · 가변 자유도
            - generic [ref=e105]:
              - link "구면 진자 사슬 선택하고 설정하기" [ref=e106] [cursor=pointer]:
                - /url: "#/lab/spherical-chain"
                - text: 선택하고 설정하기
              - button "구면 진자 사슬 즐겨찾기" [ref=e107] [cursor=pointer]: 즐겨찾기
        - article "매입 좌표 구면 진자" [ref=e108]:
          - heading "매입 좌표 구면 진자" [level=2] [ref=e109]
          - paragraph [ref=e110]: 단위 방향 벡터와 접선 속도로 극점 특이점을 피한다.
          - generic [ref=e111]:
            - paragraph [ref=e112]: 공간 진자 · 2 자유도
            - generic [ref=e113]:
              - link "매입 좌표 구면 진자 선택하고 설정하기" [ref=e114] [cursor=pointer]:
                - /url: "#/lab/spherical-embedded"
                - text: 선택하고 설정하기
              - button "매입 좌표 구면 진자 즐겨찾기" [ref=e115] [cursor=pointer]: 즐겨찾기
        - article "매입 좌표 구면 사슬" [ref=e116]:
          - heading "매입 좌표 구면 사슬" [level=2] [ref=e117]
          - paragraph [ref=e118]: 단위 벡터 구속과 승수 방정식으로 공간 사슬을 적분한다.
          - generic [ref=e119]:
            - paragraph [ref=e120]: 공간 진자 · 가변 자유도
            - generic [ref=e121]:
              - link "매입 좌표 구면 사슬 선택하고 설정하기" [ref=e122] [cursor=pointer]:
                - /url: "#/lab/spherical-embedded-chain"
                - text: 선택하고 설정하기
              - button "매입 좌표 구면 사슬 즐겨찾기" [ref=e123] [cursor=pointer]: 즐겨찾기
        - article "감쇠 구동 진자" [ref=e124]:
          - heading "감쇠 구동 진자" [level=2] [ref=e125]
          - paragraph [ref=e126]: 주기적 외력과 선형 감쇠가 작용하는 진자.
          - generic [ref=e127]:
            - paragraph [ref=e128]: 구동과 제어 · 1 자유도
            - generic [ref=e129]:
              - link "감쇠 구동 진자 선택하고 설정하기" [ref=e130] [cursor=pointer]:
                - /url: "#/lab/driven"
                - text: 선택하고 설정하기
              - button "감쇠 구동 진자 즐겨찾기" [ref=e131] [cursor=pointer]: 즐겨찾기
        - article "결합 진자" [ref=e132]:
          - heading "결합 진자" [level=2] [ref=e133]
          - paragraph [ref=e134]: 각도 차이에 비례하는 결합을 가진 두 진자.
          - generic [ref=e135]:
            - paragraph [ref=e136]: 구동과 제어 · 2 자유도
            - generic [ref=e137]:
              - link "결합 진자 선택하고 설정하기" [ref=e138] [cursor=pointer]:
                - /url: "#/lab/coupled"
                - text: 선택하고 설정하기
              - button "결합 진자 즐겨찾기" [ref=e139] [cursor=pointer]: 즐겨찾기
        - article "역진자" [ref=e140]:
          - heading "역진자" [level=2] [ref=e141]
          - paragraph [ref=e142]: 위쪽 평형을 기준으로 개방 루프 또는 포화된 PD 피드백을 비교한다.
          - generic [ref=e143]:
            - paragraph [ref=e144]: 구동과 제어 · 1 자유도
            - generic [ref=e145]:
              - link "역진자 선택하고 설정하기" [ref=e146] [cursor=pointer]:
                - /url: "#/lab/inverted"
                - text: 선택하고 설정하기
              - button "역진자 즐겨찾기" [ref=e147] [cursor=pointer]: 즐겨찾기
        - article "카트폴" [ref=e148]:
          - heading "카트폴" [level=2] [ref=e149]
          - paragraph [ref=e150]: 카트와 위쪽 진자의 결합 운동에 외력·파형·상태 피드백을 적용한다.
          - generic [ref=e151]:
            - paragraph [ref=e152]: 구동과 제어 · 2 자유도
            - generic [ref=e153]:
              - link "카트폴 선택하고 설정하기" [ref=e154] [cursor=pointer]:
                - /url: "#/lab/cartpole"
                - text: 선택하고 설정하기
              - button "카트폴 즐겨찾기" [ref=e155] [cursor=pointer]: 즐겨찾기
        - article "매개변수 가진 진자" [ref=e156]:
          - heading "매개변수 가진 진자" [level=2] [ref=e157]
          - paragraph [ref=e158]: 복원 계수를 주기적으로 변조하는 진자.
          - generic [ref=e159]:
            - paragraph [ref=e160]: 구동과 제어 · 1 자유도
            - generic [ref=e161]:
              - link "매개변수 가진 진자 선택하고 설정하기" [ref=e162] [cursor=pointer]:
                - /url: "#/lab/parametric"
                - text: 선택하고 설정하기
              - button "매개변수 가진 진자 즐겨찾기" [ref=e163] [cursor=pointer]: 즐겨찾기
        - article "더핑 발진기" [ref=e164]:
          - heading "더핑 발진기" [level=2] [ref=e165]
          - paragraph [ref=e166]: 3차 복원력과 외력을 가진 비선형 발진기.
          - generic [ref=e167]:
            - paragraph [ref=e168]: 비선형 진동 · 1 자유도
            - generic [ref=e169]:
              - link "더핑 발진기 선택하고 설정하기" [ref=e170] [cursor=pointer]:
                - /url: "#/lab/duffing"
                - text: 선택하고 설정하기
              - button "더핑 발진기 즐겨찾기" [ref=e171] [cursor=pointer]: 즐겨찾기
        - article "반데르폴 발진기" [ref=e172]:
          - heading "반데르폴 발진기" [level=2] [ref=e173]
          - paragraph [ref=e174]: 상태 의존 감쇠로 한계 주기를 만드는 발진기.
          - generic [ref=e175]:
            - paragraph [ref=e176]: 비선형 진동 · 1 자유도
            - generic [ref=e177]:
              - link "반데르폴 발진기 선택하고 설정하기" [ref=e178] [cursor=pointer]:
                - /url: "#/lab/van-der-pol"
                - text: 선택하고 설정하기
              - button "반데르폴 발진기 즐겨찾기" [ref=e179] [cursor=pointer]: 즐겨찾기
        - article "카피차 진자" [ref=e180]:
          - heading "카피차 진자" [level=2] [ref=e181]
          - paragraph [ref=e182]: 지지점의 빠른 수직 가진을 그대로 적분한다.
          - generic [ref=e183]:
            - paragraph [ref=e184]: 비선형 진동 · 1 자유도
            - generic [ref=e185]:
              - link "카피차 진자 선택하고 설정하기" [ref=e186] [cursor=pointer]:
                - /url: "#/lab/kapitza"
                - text: 선택하고 설정하기
              - button "카피차 진자 즐겨찾기" [ref=e187] [cursor=pointer]: 즐겨찾기
        - article "마티외 안정성 지도" [ref=e188]:
          - heading "마티외 안정성 지도" [level=2] [ref=e189]
          - paragraph [ref=e190]: 선형 주기계의 monodromy와 Floquet 승수로 안정성을 조사한다.
          - generic [ref=e191]:
            - paragraph [ref=e192]: 비선형 진동 · 1 자유도
            - generic [ref=e193]:
              - link "마티외 안정성 지도 선택하고 설정하기" [ref=e194] [cursor=pointer]:
                - /url: "#/lab/mathieu"
                - text: 선택하고 설정하기
              - button "마티외 안정성 지도 즐겨찾기" [ref=e195] [cursor=pointer]: 즐겨찾기
        - article "쿨롱·스트리벡 마찰 도구" [ref=e196]:
          - heading "쿨롱·스트리벡 마찰 도구" [level=2] [ref=e197]
          - paragraph [ref=e198]: 정칙화 마찰력과 정지 마찰 complementarity 단계를 제공한다.
          - generic [ref=e199]:
            - paragraph [ref=e200]: 비선형 진동 · 가변 자유도
            - generic [ref=e201]:
              - link "쿨롱·스트리벡 마찰 도구 선택하고 설정하기" [ref=e202] [cursor=pointer]:
                - /url: "#/lab/friction"
                - text: 선택하고 설정하기
              - button "쿨롱·스트리벡 마찰 도구 즐겨찾기" [ref=e203] [cursor=pointer]: 즐겨찾기
        - article "피라가스 지연 피드백" [ref=e204]:
          - heading "피라가스 지연 피드백" [level=2] [ref=e205]
          - paragraph [ref=e206]: 과거 각도와 현재 각도의 차이로 지연 피드백을 적용한다.
          - generic [ref=e207]:
            - paragraph [ref=e208]: 비선형 진동 · 가변 자유도
            - generic [ref=e209]:
              - link "피라가스 지연 피드백 선택하고 설정하기" [ref=e210] [cursor=pointer]:
                - /url: "#/lab/pyragas"
                - text: 선택하고 설정하기
              - button "피라가스 지연 피드백 즐겨찾기" [ref=e211] [cursor=pointer]: 즐겨찾기
        - article "다중 자석 진자" [ref=e212]:
          - heading "다중 자석 진자" [level=2] [ref=e213]
          - paragraph [ref=e214]: 여러 자석의 인력과 감쇠를 받는 평면 질점 운동.
          - generic [ref=e215]:
            - paragraph [ref=e216]: 네트워크 · 2 자유도
            - generic [ref=e217]:
              - link "다중 자석 진자 선택하고 설정하기" [ref=e218] [cursor=pointer]:
                - /url: "#/lab/magnetic"
                - text: 선택하고 설정하기
              - button "다중 자석 진자 즐겨찾기" [ref=e219] [cursor=pointer]: 즐겨찾기
        - article "진자 결합 그래프" [ref=e220]:
          - heading "진자 결합 그래프" [level=2] [ref=e221]
          - paragraph [ref=e222]: 결합 행렬로 연결된 평면 진자 네트워크.
          - generic [ref=e223]:
            - paragraph [ref=e224]: 네트워크 · 가변 자유도
            - generic [ref=e225]:
              - link "진자 결합 그래프 선택하고 설정하기" [ref=e226] [cursor=pointer]:
                - /url: "#/lab/pendulum-network"
                - text: 선택하고 설정하기
              - button "진자 결합 그래프 즐겨찾기" [ref=e227] [cursor=pointer]: 즐겨찾기
        - article "쿠라모토 위상 네트워크" [ref=e228]:
          - heading "쿠라모토 위상 네트워크" [level=2] [ref=e229]
          - paragraph [ref=e230]: 고유 진동수와 사인 위상 결합으로 동기화를 모델링한다.
          - generic [ref=e231]:
            - paragraph [ref=e232]: 네트워크 · 가변 자유도
            - generic [ref=e233]:
              - link "쿠라모토 위상 네트워크 선택하고 설정하기" [ref=e234] [cursor=pointer]:
                - /url: "#/lab/kuramoto"
                - text: 선택하고 설정하기
              - button "쿠라모토 위상 네트워크 즐겨찾기" [ref=e235] [cursor=pointer]: 즐겨찾기
        - article "하위헌스 두 시계 위상 축약" [ref=e236]:
          - heading "하위헌스 두 시계 위상 축약" [level=2] [ref=e237]
          - paragraph [ref=e238]: 두 발진자의 위상 잠금과 진동수 불일치를 조사한다.
          - generic [ref=e239]:
            - paragraph [ref=e240]: 네트워크 · 2 자유도
            - generic [ref=e241]:
              - link "하위헌스 두 시계 위상 축약 선택하고 설정하기" [ref=e242] [cursor=pointer]:
                - /url: "#/lab/huygens-phase-pair"
                - text: 선택하고 설정하기
              - button "하위헌스 두 시계 위상 축약 즐겨찾기" [ref=e243] [cursor=pointer]: 즐겨찾기
        - article "키메라 초기조건 동기화 탐색" [ref=e244]:
          - heading "키메라 초기조건 동기화 탐색" [level=2] [ref=e245]
          - paragraph [ref=e246]: 비국소 쿠라모토 사슬의 유한 네트워크 위상 일관성을 탐색한다.
          - generic [ref=e247]:
            - paragraph [ref=e248]: 네트워크 · 가변 자유도
            - generic [ref=e249]:
              - link "키메라 초기조건 동기화 탐색 선택하고 설정하기" [ref=e250] [cursor=pointer]:
                - /url: "#/lab/chimera-exploration"
                - text: 선택하고 설정하기
              - button "키메라 초기조건 동기화 탐색 즐겨찾기" [ref=e251] [cursor=pointer]: 즐겨찾기
        - article "시드 기반 랑주뱅 앙상블" [ref=e252]:
          - heading "시드 기반 랑주뱅 앙상블" [level=2] [ref=e253]
          - paragraph [ref=e254]: 가산·곱셈·행렬 잡음의 경로와 통계량을 계산한다.
          - generic [ref=e255]:
            - paragraph [ref=e256]: 확률과 장 · 가변 자유도
            - generic [ref=e257]:
              - link "시드 기반 랑주뱅 앙상블 선택하고 설정하기" [ref=e258] [cursor=pointer]:
                - /url: "#/lab/langevin"
                - text: 선택하고 설정하기
              - button "시드 기반 랑주뱅 앙상블 즐겨찾기" [ref=e259] [cursor=pointer]: 즐겨찾기
        - article "FPUT 비선형 사슬" [ref=e260]:
          - heading "FPUT 비선형 사슬" [level=2] [ref=e261]
          - paragraph [ref=e262]: 비조화 인접 결합의 에너지 재귀를 계산한다.
          - generic [ref=e263]:
            - paragraph [ref=e264]: 확률과 장 · 가변 자유도
            - generic [ref=e265]:
              - link "FPUT 비선형 사슬 선택하고 설정하기" [ref=e266] [cursor=pointer]:
                - /url: "#/lab/fput"
                - text: 선택하고 설정하기
              - button "FPUT 비선형 사슬 즐겨찾기" [ref=e267] [cursor=pointer]: 즐겨찾기
        - article "진자 격자·FK 조화 극한" [ref=e268]:
          - heading "진자 격자·FK 조화 극한" [level=2] [ref=e269]
          - paragraph [ref=e270]: 인접 결합 진자 격자의 조화 분산 관계를 계산한다.
          - generic [ref=e271]:
            - paragraph [ref=e272]: 확률과 장 · 가변 자유도
            - generic [ref=e273]:
              - link "진자 격자·FK 조화 극한 선택하고 설정하기" [ref=e274] [cursor=pointer]:
                - /url: "#/lab/lattice-fk-limit"
                - text: 선택하고 설정하기
              - button "진자 격자·FK 조화 극한 즐겨찾기" [ref=e275] [cursor=pointer]: 즐겨찾기
        - article "사인–고든 장" [ref=e276]:
          - heading "사인–고든 장" [level=2] [ref=e277]
          - paragraph [ref=e278]: 공간 격자에서 kink와 breather 및 장의 전파를 적분한다.
          - generic [ref=e279]:
            - paragraph [ref=e280]: 확률과 장 · 가변 자유도
            - generic [ref=e281]:
              - link "사인–고든 장 선택하고 설정하기" [ref=e282] [cursor=pointer]:
                - /url: "#/lab/sine-gordon"
                - text: 선택하고 설정하기
              - button "사인–고든 장 즐겨찾기" [ref=e283] [cursor=pointer]: 즐겨찾기
        - article "Frenkel–Kontorova 정적 kink" [ref=e284]:
          - heading "Frenkel–Kontorova 정적 kink" [level=2] [ref=e285]
          - paragraph [ref=e286]: 고정 경계의 이산 FK kink를 Newton 완화하고 수렴 잔차를 확인한다.
          - generic [ref=e287]:
            - paragraph [ref=e288]: 확률과 장 · 가변 자유도
            - generic [ref=e289]:
              - link "Frenkel–Kontorova 정적 kink 선택하고 설정하기" [ref=e290] [cursor=pointer]:
                - /url: "#/lab/frenkel-kontorova"
                - text: 선택하고 설정하기
              - button "Frenkel–Kontorova 정적 kink 즐겨찾기" [ref=e291] [cursor=pointer]: 즐겨찾기
        - article "표준 사상" [ref=e292]:
          - heading "표준 사상" [level=2] [ref=e293]
          - paragraph [ref=e294]: 킥 강도 K의 면적 보존 이산 사상을 반복한다.
          - generic [ref=e295]:
            - paragraph [ref=e296]: 이산계와 양자계 · 1 자유도
            - generic [ref=e297]:
              - link "표준 사상 선택하고 설정하기" [ref=e298] [cursor=pointer]:
                - /url: "#/lab/standard-map"
                - text: 선택하고 설정하기
              - button "표준 사상 즐겨찾기" [ref=e299] [cursor=pointer]: 즐겨찾기
        - article "양자 킥 회전자" [ref=e300]:
          - heading "양자 킥 회전자" [level=2] [ref=e301]
          - paragraph [ref=e302]: FFT로 위치 킥과 운동량 자유 전파를 번갈아 적용한다.
          - generic [ref=e303]:
            - paragraph [ref=e304]: 이산계와 양자계 · 가변 자유도
            - generic [ref=e305]:
              - link "양자 킥 회전자 선택하고 설정하기" [ref=e306] [cursor=pointer]:
                - /url: "#/lab/quantum-kicked-rotor"
                - text: 선택하고 설정하기
              - button "양자 킥 회전자 즐겨찾기" [ref=e307] [cursor=pointer]: 즐겨찾기
        - article "유니터리 Floquet 스펙트럼" [ref=e308]:
          - heading "유니터리 Floquet 스펙트럼" [level=2] [ref=e309]
          - paragraph [ref=e310]: 복소 주기 연산자의 고유위상과 준에너지를 계산한다.
          - generic [ref=e311]:
            - paragraph [ref=e312]: 이산계와 양자계 · 가변 자유도
            - generic [ref=e313]:
              - link "유니터리 Floquet 스펙트럼 선택하고 설정하기" [ref=e314] [cursor=pointer]:
                - /url: "#/lab/unitary-floquet"
                - text: 선택하고 설정하기
              - button "유니터리 Floquet 스펙트럼 즐겨찾기" [ref=e315] [cursor=pointer]: 즐겨찾기
      - group [ref=e316]:
        - generic "기존 데이터 가져오기" [ref=e317]
      - group [ref=e318]:
        - generic "기존 작업공간·연구 DB 가져오기" [ref=e319]
        - generic [ref=e320]:
          - paragraph [ref=e321]: 기존 JSON 내보내기 파일을 확인한 뒤 새 프로젝트로 채택하세요. 원본 저장소와 현재 프로젝트는 미리보기 동안 변경하지 않습니다. 가져온 전체 원본과 모든 project part는 별도 product 보관함에 저장합니다.
          - generic [ref=e322]: 작업공간 또는 연구 DB JSON 파일
          - button "작업공간 또는 연구 DB JSON 파일" [ref=e323]
          - generic [ref=e324]: 기존 파일 종류
          - combobox "기존 파일 종류" [ref=e325]:
            - option "전체 작업공간 · 최대8MiB" [selected]
            - option "연구 DB archive · 최대64MiB"
          - generic [ref=e326]:
            - generic [ref=e327]: snapshot에서 새로 관찰할 시간(s)
            - spinbutton "snapshot에서 새로 관찰할 시간(s)" [ref=e328]: "5"
            - paragraph [ref=e329]: 이전 궤적을 만들어내지 않습니다. 실제 snapshot과 적분기를 새 run으로 다시 관찰할 기간입니다.
          - button "작업공간 미리보기" [ref=e330] [cursor=pointer]
          - button "작업공간 미리보기 취소" [ref=e331] [cursor=pointer]
          - button "전체 자료 보관 후 선택 프로젝트 채택" [disabled] [ref=e332]
          - button "전체 원본 archive 백업" [disabled] [ref=e333]
          - button "선택 project part ZIP 다운로드" [disabled] [ref=e334]
          - status [ref=e335]: 별도 product 보관함0개. 원본 legacy DB는 읽지 않았습니다.
          - button "채택한 자료 목록 읽기" [active] [ref=e336] [cursor=pointer]
          - combobox "명시적으로 채택한 archive 목록" [ref=e337]
          - button "선택 보관 자료 다시 미리보기" [ref=e338] [cursor=pointer]
  - contentinfo [ref=e339]:
    - paragraph [ref=e340]: Pendulum Lab · 움직임을 이해하고, 질문을 실험으로.
    - link "컴포넌트 갤러리" [ref=e341] [cursor=pointer]:
      - /url: ./next.html?gallery=components
    - button "명령 검색 (Ctrl/⌘ K)" [ref=e343] [cursor=pointer]
    - generic [ref=e344]:
      - generic [ref=e345]: 표시 언어
      - combobox "표시 언어" [ref=e346]:
        - option "한국어" [selected]
        - option "English"
    - group [ref=e347]:
      - generic "브라우저 스크립트 API" [ref=e348] [cursor=pointer]
```

# Test source

```ts
  19  |   }, info) => {
  20  |     await open(page);
  21  |     await page.evaluate(() => localStorage.setItem('pendulum-lab/research-workbench/v1', 'legacy-sentinel'));
  22  |     const source = nativeWorkspace(100);
  23  |     await choose(page, 'workspace.json', source);
  24  |     await expect(page.locator('#legacy-workspace-parts option')).toHaveCount(3);
  25  |     const partOptions = await page
  26  |       .locator('#legacy-workspace-parts option')
  27  |       .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  28  |     await page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' }).click();
  29  |     await expect(page.getByRole('status').filter({ hasText: '별도 product DB에 보관' })).toBeVisible();
  30  |     await page.locator('#legacy-workspace-parts').selectOption(partOptions[1]!);
  31  |     await expect(page.locator('#legacy-workspace-records option')).not.toHaveCount(0);
  32  |     const experiment = await page
  33  |       .locator('#legacy-workspace-records option')
  34  |       .evaluateAll((options) =>
  35  |         options.find((option) => option.textContent?.startsWith('experiment'))?.getAttribute('value')
  36  |       );
  37  |     await page.locator('#legacy-workspace-records').selectOption(experiment!);
  38  |     await expect(page.getByRole('button', { name: '이 snapshot을 실험실에서 다시 관찰' })).toBeEnabled();
  39  |     const download = page.waitForEvent('download');
  40  |     await page.getByRole('button', { name: '전체 원본 archive 백업' }).click();
  41  |     const backup = await download;
  42  |     expect(backup.suggestedFilename()).toBe('legacy-source-original.json');
  43  |     const bytes = await readFile((await backup.path())!);
  44  |     expect(bytes).toEqual(Buffer.from(JSON.stringify(source)));
  45  |     await info.attach('original-workspace-backup', { body: bytes, contentType: 'application/json' });
  46  |     await page.reload();
  47  |     await page.locator('#legacy-workspace-import > summary').click();
  48  |     await page.getByRole('button', { name: '채택한 자료 목록 읽기' }).click();
  49  |     await expect(page.locator('#legacy-workspace-saved option')).toHaveCount(1);
  50  |     await page.getByRole('button', { name: '선택 보관 자료 다시 미리보기' }).click();
  51  |     await expect(page.locator('#legacy-workspace-parts option')).toHaveCount(3);
  52  |     await page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' }).click();
  53  |     await expect(page.getByRole('status').filter({ hasText: '별도 product DB에 보관' })).toBeVisible();
  54  |     const firstExperiment = await page
  55  |       .locator('#legacy-workspace-records option')
  56  |       .evaluateAll((options) =>
  57  |         options.find((option) => option.textContent?.startsWith('experiment'))?.getAttribute('value')
  58  |       );
  59  |     await page.locator('#legacy-workspace-records').selectOption(firstExperiment!);
  60  |     await page.getByRole('button', { name: '이 snapshot을 실험실에서 다시 관찰' }).click();
  61  |     await expect(page).toHaveURL(/#\/lab\/double\?state=/);
  62  |     await expect(page.locator('#lab-field-theta1')).toHaveValue(String(7 * Math.PI));
  63  |     expect(await page.evaluate(() => localStorage.getItem('pendulum-lab/research-workbench/v1'))).toBe(
  64  |       'legacy-sentinel'
  65  |     );
  66  |   });
  67  | 
  68  |   test('imports all native research DB stores, reads exact backup and typed assets, then restores adoption after reload', async ({
  69  |     page
  70  |   }, info) => {
  71  |     const source = nativeArchive(),
  72  |       original = Buffer.from(JSON.stringify(source));
  73  |     await open(page);
  74  |     await page.locator('#legacy-workspace-kind').selectOption('research-db');
  75  |     await page
  76  |       .locator('#legacy-workspace-file')
  77  |       .setInputFiles({ name: 'native-research-db.json', mimeType: 'application/json', buffer: original });
  78  |     await page.getByRole('button', { name: '작업공간 미리보기', exact: true }).click();
  79  |     const labels = await page.locator('#legacy-workspace-records option').allTextContents();
  80  |     for (const kind of [
  81  |       'project',
  82  |       'session',
  83  |       'experiment',
  84  |       'plan',
  85  |       'point',
  86  |       'run-log',
  87  |       'metrics',
  88  |       'image',
  89  |       'archive',
  90  |       'settings'
  91  |     ])
  92  |       expect(labels.some((text) => text.startsWith(`${kind} ·`))).toBe(true);
  93  |     const download = page.waitForEvent('download');
  94  |     await page.getByRole('button', { name: '전체 원본 archive 백업', exact: true }).click();
  95  |     const raw = await readFile((await (await download).path())!);
  96  |     expect(raw).toEqual(original);
  97  |     await info.attach('original-research-db-backup', { body: raw, contentType: 'application/json' });
  98  |     const imageId = await page
  99  |       .locator('#legacy-workspace-records option')
  100 |       .evaluateAll((options) =>
  101 |         options.find((option) => option.textContent?.startsWith('image ·'))?.getAttribute('value')
  102 |       );
  103 |     await page.locator('#legacy-workspace-records').selectOption(imageId!);
  104 |     const imageDownload = page.waitForEvent('download');
  105 |     await page.getByRole('button', { name: '원본 이미지 다운로드', exact: true }).click();
  106 |     expect(await readFile((await (await imageDownload).path())!)).toEqual(Buffer.from(tinyPng, 'base64'));
  107 |     const typedDownload = page.waitForEvent('download');
  108 |     await page.getByRole('button', { name: 'typed record JSON 다운로드', exact: true }).click();
  109 |     const typedBytes = await readFile((await (await typedDownload).path())!);
  110 |     const typed = JSON.parse(typedBytes.toString('utf8'));
  111 |     expect(typed.schema).toBe('pendulum-legacy-workspace-record/v1');
  112 |     expect(typed.record.payload).toEqual(source.stores.figures[0]!.payload);
  113 |     expect(typed.record.sourceMetadata.updatedAt).toBe(source.stores.figures[0]!.updatedAt);
  114 |     await info.attach('research-db-typed-image-record', { body: typedBytes, contentType: 'application/json' });
  115 |     await page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택', exact: true }).click();
  116 |     await page.reload();
  117 |     await page.locator('#legacy-workspace-import > summary').click();
  118 |     await page.getByRole('button', { name: '채택한 자료 목록 읽기', exact: true }).click();
> 119 |     await expect(page.locator('#legacy-workspace-saved option')).toHaveCount(1);
      |                                                                  ^ Error: expect(locator).toHaveCount(expected) failed
  120 |     await page.getByRole('button', { name: '선택 보관 자료 다시 미리보기', exact: true }).click();
  121 |     const roundtrip = page.waitForEvent('download');
  122 |     await page.getByRole('button', { name: '전체 원본 archive 백업', exact: true }).click();
  123 |     expect(await readFile((await (await roundtrip).path())!)).toEqual(original);
  124 |     await expect(page.locator('#legacy-workspace-import [role=alert]')).toBeHidden();
  125 |   });
  126 | 
  127 |   test('discards stale file reads and cancelled previews', async ({ page }) => {
  128 |     await page.addInitScript(() => {
  129 |       const original = File.prototype.arrayBuffer;
  130 |       File.prototype.arrayBuffer = async function (this: File) {
  131 |         if (this.name.startsWith('slow')) await new Promise((resolve) => setTimeout(resolve, 500));
  132 |         return original.call(this);
  133 |       };
  134 |     });
  135 |     await open(page);
  136 |     await choose(page, 'slow-old.json');
  137 |     const source = nativeWorkspace();
  138 |     source.research.experiments[0]!.name = 'newest-explicit-source';
  139 |     await page
  140 |       .locator('#legacy-workspace-file')
  141 |       .setInputFiles({ name: 'new.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  142 |     await page.getByRole('button', { name: '작업공간 미리보기', exact: true }).click();
  143 |     await expect(
  144 |       page.locator('#legacy-workspace-records option').filter({ hasText: 'newest-explicit-source' })
  145 |     ).toHaveCount(1);
  146 |     await page.getByRole('button', { name: '작업공간 미리보기 취소', exact: true }).click();
  147 |     await expect(page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' })).toBeDisabled();
  148 |     await expect(page.locator('#legacy-workspace-parts')).toBeHidden();
  149 |     await expect(page.locator('.legacy-workspace-record-view')).toBeEmpty();
  150 |   });
  151 | 
  152 |   test('quota failure leaves the product archive index empty and canonical reopen disabled', async ({ page }) => {
  153 |     await page.addInitScript(() => {
  154 |       const original = IDBObjectStore.prototype.put;
  155 |       IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
  156 |         if (this.name === 'sources') throw new DOMException('deliberate migration quota failure', 'QuotaExceededError');
  157 |         return original.call(this, value, key);
  158 |       };
  159 |     });
  160 |     await open(page);
  161 |     await choose(page);
  162 |     await expect(page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' })).toBeEnabled();
  163 |     await page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' }).click();
  164 |     await expect(page.getByRole('alert').filter({ hasText: 'quota' })).toBeVisible();
  165 |     await page.getByRole('button', { name: '채택한 자료 목록 읽기' }).click();
  166 |     await expect(page.locator('#legacy-workspace-saved option')).toHaveCount(0);
  167 |     const experiment = await page
  168 |       .locator('#legacy-workspace-records option')
  169 |       .evaluateAll((options) =>
  170 |         options.find((option) => option.textContent?.startsWith('experiment'))?.getAttribute('value')
  171 |       );
  172 |     await page.locator('#legacy-workspace-records').selectOption(experiment!);
  173 |     await expect(page.getByRole('button', { name: '이 snapshot을 실험실에서 다시 관찰' })).toBeDisabled();
  174 |   });
  175 | 
  176 |   test('runs the saved parameter-study snapshot in a native worker and imports its exact completed part', async ({
  177 |     page
  178 |   }) => {
  179 |     await open(page);
  180 |     await page.locator('#legacy-workspace-duration').fill('0.02');
  181 |     await choose(page);
  182 |     const planId = await page
  183 |       .locator('#legacy-workspace-records option')
  184 |       .evaluateAll((options) =>
  185 |         options.find((option) => option.textContent?.startsWith('plan'))?.getAttribute('value')
  186 |       );
  187 |     await page.locator('#legacy-workspace-records').selectOption(planId!);
  188 |     await expect(page.getByRole('button', { name: '이 계획의 원본 조건 실행 목록 준비' })).toBeDisabled();
  189 |     await page.getByRole('button', { name: '전체 자료 보관 후 선택 프로젝트 채택' }).click();
  190 |     await expect(page.getByRole('button', { name: '이 계획의 원본 조건 실행 목록 준비' })).toBeEnabled();
  191 |     await page.getByRole('button', { name: '이 계획의 원본 조건 실행 목록 준비' }).click();
  192 |     const queue = page.locator('.legacy-run-list');
  193 |     await expect(queue.getByRole('combobox', { name: '기존 조건 원본 run 선택' }).locator('option')).toHaveCount(1);
  194 |     await queue.getByRole('button', { name: '선택 part 실행·재개' }).click();
  195 |     await expect(queue).toHaveAttribute('data-queue-status', 'completed');
  196 |     await expect(queue.locator('tbody tr')).toHaveCount(4);
  197 |     await expect(queue).toContainText('point-a');
  198 |     await expect(queue).toContainText('seed: -42');
  199 |     await expect(queue).toContainText('10단계');
  200 |     const downloading = page.waitForEvent('download');
  201 |     await queue.getByRole('button', { name: '선택 part 입력·결과·재개 JSON 저장' }).click();
  202 |     const download = await downloading;
  203 |     const path = await download.path();
  204 |     await queue.locator('input[type="file"]').setInputFiles(path!);
  205 |     await expect(queue).toHaveAttribute('data-queue-status', 'completed');
  206 |     await expect(queue.locator('tbody tr')).toHaveCount(4);
  207 |     await expect(queue.getByRole('alert')).toBeHidden();
  208 |   });
  209 | });
  210 | 
```