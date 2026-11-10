# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: redesign\core-pendulum.spec.ts >> S07 real planar pendulum laboratory >> compound-double: computes trajectory projections and genuine Poincare/Lyapunov worker results
- Location: e2e\redesign\core-pendulum.spec.ts:138:5

# Error details

```
Test timeout of 30000ms exceeded.
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
      - link "시스템 라이브러리" [ref=e17] [cursor=pointer]:
        - /url: "#/lab"
      - paragraph [ref=e18]: LAB · 고전 진자
      - heading "균일 막대 복합 이중 진자" [level=1] [ref=e19]
      - paragraph [ref=e20]: 막대의 분포 질량과 회전 관성을 포함한 이중 진자.
      - paragraph [ref=e21]: 기존 물리 엔진으로 계산합니다. θ는 아래 수직선 기준 절대각입니다. 저장한 설정은 초기조건에서 재실행하며, 화면을 이동하면 계산을 멈춥니다.
      - link "기존 앱 열기" [ref=e22] [cursor=pointer]:
        - /url: ./app.html
      - region "실행 제어" [ref=e23]:
        - heading "실행 제어" [level=2] [ref=e24]
        - generic [ref=e25]:
          - status [ref=e26]: 일시정지
          - generic [ref=e27]:
            - button "실행 계속" [ref=e28] [cursor=pointer]
            - button "일시정지" [disabled] [ref=e29]
            - button "한 단계" [ref=e30] [cursor=pointer]
            - button "처음으로" [ref=e31] [cursor=pointer]
            - button "실행 취소" [ref=e32] [cursor=pointer]
          - generic [ref=e33]: 재생 속도
          - combobox "재생 속도" [ref=e34]:
            - option "0.25×"
            - option "1×" [selected]
            - option "4×"
          - status "현재 물리 시간" [ref=e35]: t = 0.0020 s
          - generic [ref=e36]:
            - generic [ref=e37]: 실행 진행
            - progressbar "실행 진행" [ref=e38]
            - paragraph [ref=e39]: 2개 기록 표본 · 0.0%
          - group [ref=e40]:
            - generic "실행 시계 · 프레임 예산" [ref=e41] [cursor=pointer]
            - option "실제 시간에 맞추기" [selected]
            - option "프레임마다 정해진 단계 실행"
            - option "demo" [selected]
            - option "education"
            - option "research"
            - option "benchmark"
            - option "performance"
            - option "recovery"
      - generic [ref=e42]:
        - tablist "실험실 패널" [ref=e43]:
          - tab "작업 공간" [ref=e44] [cursor=pointer]
          - tab "조건" [ref=e45] [cursor=pointer]
          - tab "분석" [ref=e46] [cursor=pointer]
          - tab "보관함" [ref=e47] [cursor=pointer]
          - tab "내보내기" [selected] [ref=e48] [cursor=pointer]
        - tabpanel "내보내기" [ref=e49]:
          - region "내보내기와 복원" [ref=e50]:
            - heading "내보내기와 복원" [level=2] [ref=e51]
            - paragraph [ref=e52]: 상태 JSON은 SI 초기조건·적분기·분석 설정입니다. CSV는 기록된 표본, SVG는 상태/시간 그래프입니다. 저장된 결과에서 계산을 이어가는 파일은 아닙니다.
            - generic [ref=e53]:
              - generic [ref=e54]:
                - button "상태 JSON 다운로드" [active] [ref=e55] [cursor=pointer]
                - button "궤적 CSV 다운로드" [ref=e56] [cursor=pointer]
                - button "그림 SVG 다운로드" [ref=e57] [cursor=pointer]
              - generic [ref=e58]: 상태 JSON 가져오기
              - button "상태 JSON 가져오기" [ref=e59]
              - button "공유 링크 만들기" [ref=e60] [cursor=pointer]
              - status [ref=e61]: 파일을 만들었습니다. 다운로드 목록에서 확인하세요.
              - paragraph [ref=e62]: 그림은 선당 최대 약 600점으로 축약합니다. CSV 표본 간격은 시간 간격 × sampleEvery이며 마지막 상태를 포함합니다. 새 저장 키만 사용하고 기존 앱 자료는 변경하지 않습니다.
  - contentinfo [ref=e63]:
    - paragraph [ref=e64]: Pendulum Lab · 움직임을 이해하고, 질문을 실험으로.
    - link "컴포넌트 갤러리" [ref=e65] [cursor=pointer]:
      - /url: ./next.html?gallery=components
    - button "명령 검색 (Ctrl/⌘ K)" [ref=e67] [cursor=pointer]
    - generic [ref=e68]:
      - generic [ref=e69]: 표시 언어
      - combobox "표시 언어" [ref=e70]:
        - option "한국어" [selected]
        - option "English"
    - group [ref=e71]:
      - generic "브라우저 스크립트 API" [ref=e72] [cursor=pointer]
```