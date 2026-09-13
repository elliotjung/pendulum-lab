# S09 과정 1 과학 콘텐츠 출처 대조 기록

- 대조일: 2026-09-14 (Asia/Seoul)
- 범위: 과정 1의 1.1–1.8, 질점 이중진자, 두 절대각, 고정 지지점·강체 무질량 막대·양의 질량·일정 중력·감쇠와 외력 없음
- 검토 방법: AI가 1차 자료의 관련 절·식·주석과 보존된 로컬 adapter를 대조하고, 별도 자동 fixture를 실행했다.
- `source-checked`: 8/8. `human-reviewed`: 0/8. 사람 또는 물리 전공자의 검토를 대신하거나 완료했다고 표시하지 않는다.
- 이 기록은 S09 단계 완료나 사용자 review 승인 증거가 아니다. 단계의 전체 검증·commit·원격 push는 S09 progress/verification 기록이 소유한다.

## 읽은 원문과 대응 범위

| 원문 | 확인한 위치 | 콘텐츠와의 대응 |
|---|---|---|
| [David Tong, Classical Dynamics: The Lagrangian Formalism](https://www.damtp.cam.ac.uk/user/tong/dynamics/two.pdf) | §2.1–2.3, §2.5.2 (PDF pp.18–19; 인쇄 pp.28–29), §2.6.1 (PDF pp.31–32; 인쇄 pp.41–42) | 1.1 구성공간·구속, 1.2 위치·속도, 1.3 에너지, 1.4 라그랑주 미분, 1.5 속도항, 1.6 정상모드, 1.7 에너지/모드 해석 |
| [Russ Tedrake, Underactuated Robotics: Multi-Body Dynamics](https://underactuated.mit.edu/multibody.html) | Simple Double Pendulum; Manipulator Equation form; The Manipulator Equations | 두 질점의 위치·속도와 운동에너지, 일반화 운동량, 관성·속도·중력 분해. MIT의 둘째 상대 관절각을 이 과정의 두 절대각으로 변환 |
| [Shinbrot, Grebogi, Wisdom, Yorke, Chaos in a double pendulum (1992)](https://materias.df.uba.ar/mcaa2017c2/files/2017/08/AJPDoublePendulum2.pdf) | American Journal of Physics 60, 491–499; DOI 10.1119/1.16860; I–V절, Appendix B, notes 8, 12, 26 | 1.8 가까운 두 궤적, 국소/장기 성장의 구분, 거리 선택, 에너지 차이·유한시간 추정의 한계. Appendix B의 질점 에너지식도 대조 |
| [보존된 S07 planarPositions](https://github.com/elliotjung/pendulum-lab/blob/acd7f869db182376b726e337606335eeabe0d541/src/product/adapters/physics/planar.ts#L202-L214) | 로컬 Git에서 위 commit의 해당 함수를 직접 읽음 | 1.1의 두 절대각, 위쪽 양의 물리 y, 아래 평형 위치 (0,−1), (0,−2) m |

1992 논문의 저자 UMD 호스팅 URL은 이번 웹 열기에서 timeout이었다. 대학 강의 자료에 보관된 동일 제목·저자·학술지·페이지·부록의 원문 PDF를 직접 열어 확인했고, 공개 콘텐츠에는 실제 읽은 그 URL을 기록했다. 검색 결과 요약만으로 출처 확인을 완료하지 않았다. 외부 링크의 장래 가용성은 보장하지 않는다.

## 좌표·에너지·진단의 대조 판단

1. Tong §2.5.2는 y가 아래쪽으로 증가한다. 이 과정과 S07 adapter는 위쪽 양의 y를 쓰므로 위치의 y 부호를 변환했다. 각도는 양쪽 모두 아래 수직 기준의 절대각이다. MIT 자료는 둘째 각도가 상대각이므로 `phi2 = theta2 - theta1`로 변환했다.
2. 1.3–1.5의 유도는 일반적인 양의 질량·길이로 전개한다. 1.6의 명시적인 모드비 ±√2와 주파수는 동일 질량·동일 길이에 한정하며 전용 실험에서는 네 값을 1로 고정한다. 선형 근사는 작은 각도뿐 아니라 작은 진동 속도를 전제로 한다.
3. 1.3의 식과 S07 원래 총에너지는 지지점 높이 영점을 쓴다. Focus 색별 에너지와 1.7은 아래 평형 영점을 쓴다. `Eshift = E - Emin`을 명시하고 분해 합을 shifted total과 비교한다. 이 상수 이동은 가속도나 에너지 드리프트를 바꾸지 않는다. 링크에 배분한 에너지는 개별 질점의 독립 보존 에너지라고 부르지 않는다.
4. 1.4–1.5의 항 선택은 같은 순간 상태의 해석 기여를 표시한다. 이를 물리적 힘을 제거한 독립 run 또는 여러 비선형 궤적의 합으로 설명하지 않는다.
5. 1.8은 theta1에 1e−6 rad를 더한 쌍의 wrapped-angle/1 s-scaled-velocity 거리를 쓴다. 재규격화하지 않은 20초 성장률을 장기 Lyapunov 지수로 부르지 않는다. 첫 각도만 바꾸면 에너지도 조금 바뀐다는 점, 같은 에너지면 비교와 시간 간격 수렴이 필요한 점을 명시했다. 논문의 별도 장치에서 측정한 성장률 수치는 이 run의 기대값으로 옮기지 않았다.

## 자동 검증과 한계

2026-09-14에 다음 실제 실행이 통과했다.

```text
npx vitest run tests/product/learn/content.test.ts tests/product/learn/course-one-quality.test.ts tests/product/experiments/science.test.ts tests/product/experiments/runtime.test.ts
4 files / 156 tests passed
```

- 콘텐츠·로더 89건: 등록/원본 지도/기호·단위·인용/손상 콘텐츠 build 거부/기존 1.1 checkpoint·version 보존.
- 8단원 품질 26건: 8/8 공개 범위, 한국어·영어 탐구/예상값/용어/정리, 데이터 전용 AST, 식의 SI 차원, 노출/고정 변수와 실행 예산, 검토 등급.
- 과학 12건: 8개 관찰 과제의 위치·길이·질량행렬·라그랑주 잔차·항 합·정상모드·에너지 교환·초기조건 거리, S01 golden/속도/선형 Jacobian/성장률 한계.
- 런타임 29건: 실제 공유 엔진 연결, 상태 변경·고정값·결정론·스케줄링·취소·실패·샘플 예산.

SI 차원 검사는 문법과 단위의 일치를 확인하고, 수치 fixture는 명시한 설정과 허용 오차를 확인한다. 이 둘이 모든 문장의 의미나 모든 매개변수에서의 동역학을 증명하지는 않는다. 화면/키보드/mobile/E2E 및 단계 전체 회귀 결과는 별도 검증 기록을 확인해야 한다. 사람 검토와 S09 사용자 학습 경험 review는 여전히 미완료다.
