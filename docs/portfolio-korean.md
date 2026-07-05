# Pendulum Lab — 연구급 카오스 시뮬레이션 플랫폼 (포트폴리오 요약)

브라우저에서 동작하는 **비선형 진자 동역학 연구 플랫폼**입니다. 단순한 물리
시뮬레이션 데모가 아니라, 수치해석 · 검증 · 재현성 · 소프트웨어 아키텍처를
연구 수준으로 끌어올리는 것을 목표로 직접 설계하고 구현했습니다.

## 핵심 요약

- **물리 엔진**: 이중/삼중/일반화 N-진자, 구동·감쇠 진자, 탄성 진자,
  줄(현) 진자(단방향 구속 — 장력 게이트와 하이브리드 슬랙/재포획),
  **구면 N-체인**(3차원 볼조인트, 매니퓰레이터 형식의 정확한 폐형식 유도).
- **수치해석**: 12종 적분기(Euler → RK4, 적응 RKF45/Dormand–Prince,
  심플렉틱 Yoshida-4 / Gauss–Legendre, L-안정 TR-BDF2, GBS) — 전부 이론
  수렴 차수를 **측정으로 입증**.
- **카오스 진단**: 최대/전체 Lyapunov 스펙트럼(블록 표준오차 포함),
  Kaplan–Yorke 차원, RQA, 0–1 테스트, FTLE/LCS, 공변 Lyapunov 벡터,
  basin entropy와 fractal 차원, Floquet/continuation, Melnikov 해석 임계.
- **검증 체계** (가장 공들인 부분):
  - 해석해 한계(타원적분 주기, 정규모드)와 문헌 anchor 값 대조
  - 독립 구현(SciPy DOP853, SymPy 기호 유도, Julia Vern9)과 교차 검증
  - dt-반감 수렴 차수 측정, 시간가역성, 결정론적 재현 해시
  - N≥4 질량행렬 대칭성·양정치성, 극점 차트 한계의 명시적 계약 테스트
  - 단위 테스트 1056개, Playwright E2E(Chromium/Firefox/WebKit/모바일)
- **재현성**: 모든 산출물에 schemaVersion + 재현 해시, ZIP 번들에 파일별
  **SHA-256 체크섬**, 산출물 계보(provenance DAG), 실행 가능한 노트북 내보내기.
- **결과 신뢰도 배지**: 모든 수치 출력에 5단계 배지
  (visual-only → finite-time estimate → validated → publication-ready, caveat)
  — "이 숫자를 어디까지 믿어도 되는가"를 UI가 직접 말해줍니다.
- **미니 논문**: 감쇠 구동 진자에서 Melnikov 임계와 주기배가 온셋의 비율이
  γ ≈ 0.69에서 역전됨을 측정 — Floquet 검증 + 0–1 테스트 보강, 원클릭 재현
  (`npm run paper:study && npm run paper:build`).

## 왜 이 프로젝트인가 (반도체 진로 연결)

반도체 소자/공정 시뮬레이션(TCAD)의 본질은 이 프로젝트와 같은 구조입니다 —
**비선형 연립 미분방정식을 수치적으로 풀고, 그 결과를 어디까지 믿을 수 있는지
증명하는 일**:

- 질량행렬 조립과 선형계 해법 → 디바이스 시뮬레이션의 유한요소/유한차분 행렬과
  Newton 솔버
- dt-반감 수렴, 적응 스텝, 강성(stiff) 시스템용 암시적 적분기 → 공정/소자
  시뮬레이션의 시간 적분 안정성
- 차트 특이점(구면 극점)의 명시적 한계 표시 → 모델 유효 범위의 정직한 문서화
- 독립 참조 구현과의 교차 검증, 재현 해시 → 시뮬레이션 결과의 신뢰성 평가
  (`docs/device-simulation-mapping.md`에 항목별 대응 정리)

## 기술 스택과 아키텍처

- TypeScript strict 모드(`noUncheckedIndexedAccess` 포함), 프레임워크 없는
  순수 Canvas 렌더링, 런타임 의존성 0개
- 계층 구조: headless core 라이브러리(`pendulum-lab-core`, Node/브라우저 겸용)
  → Web Worker 잡 프로토콜(우선순위 큐, 체크포인트, 취소/재개)
  → UI 계층(TabController/DomBinder로 DOM 결합 분리)
- 부트 파이프라인 5단계, 전역 API public/debug 분리, 6개 모듈로 분해된
  연구 워크벤치, IndexedDB 장기 저장소(마이그레이션·복구 포함)
- 보안: CSP에서 `unsafe-inline` 제거(동적 스타일은 adoptedStyleSheets),
  innerHTML 금지 lint, JSON 입력 새니타이저

## 직접 해보기

```bash
npm install && npm run dev    # 개발 서버
npm test                      # 단위 테스트
npm run paper:study && npm run paper:build   # 논문 결과 재현
```

서버 없이도 루트의 `index.html`을 더블클릭하면 전체 앱이 실행됩니다
(단일 파일 빌드). 초심자/학생/연구자 모드는 좌측 레일 하단에서 전환합니다.

## 문서 지도

| 문서 | 내용 |
|---|---|
| `docs/derivations.md` | 모든 운동방정식의 수학적 유도 |
| `docs/tutorial-reproduce-paper.md` | 논문 결과 재현 튜토리얼 |
| `docs/schema-migrations.md` | 스키마 정책 + 아카이브 호환성 매트릭스 |
| `docs/device-simulation-mapping.md` | 반도체 TCAD 개념 대응표 |
| `docs/numerics.md`, `docs/known-limitations.md` | 수치해석 상세, 한계 명시 |
