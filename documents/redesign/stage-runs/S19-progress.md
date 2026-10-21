# S19 고급 카오스·수송·인력권 분석 실행 기록

## 기준과 범위

- 기준 local/remote HEAD: `a7f4081a98adf4469efe69acc246e93598aa5b9d`, branch `codex/redesign`, upstream `origin/codex/redesign`. fetch 후 일치, 작업 폴더 clean.
- authoritative 여섯 문서를 전체 읽었다. S01–S18 연속 완료, S18 status/CP0–CP3 이력과 검증 산출물을 확인했다.
- `redesign:check`, `redesign:preflight -- 19` 통과. sandbox의 Git 쓰기/자식 프로세스 제한은 동일 명령의 확장 권한 실행으로 해결했다.
- 모델 selector는 노출되지 않는다. 기록된 사용자 선택을 전제로 진행하며 selector 검증·변경을 주장하지 않는다.
- 목표: RQA, recurrence network, correlation dimension, multifractal, topological entropy, transfer operator, CLV, FTLE/LCS, basin/uncertainty/Wada의 실제 native 계산, 공용 Dock, worker, provenance/export.
- 제외: S20 이후 안정성·분기·연구 queue·새 교육 콘텐츠·migration/cutover, master merge/release.

## 보존 계약과 과학적 한계

- 기존 app.html, pure physics/chaos/research/runtime/workers/validation/lib, public API, 사용자 데이터, package/lockfile, golden과 과거 PNG를 보존한다.
- S18의 원 실험/관측 provider와 smooth native RHS를 재사용한다. hybrid/delay/stochastic/quantum 모델의 부적절한 접선 진단은 이유를 표시한다.
- 1D scalar map 전용 entropy/Ulam 도구는 명명된 독립 benchmark source를 명시하고 원래 진자 결과로 오인시키지 않는다. 임의 함수 실행은 제공하지 않는다.
- 반전 basin은 보존계 double의 from-rest 각도 격자에 대한 유한시간 분류다. Wada 후보와 FTLE ridge 후보는 엄밀한 증명이나 LCS 인증이 아니다.
- 표본·해상도·threshold·척도·비용과 유한시간/유한표본 불확실성을 UI와 artifact에 보존한다.

## 내부 checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록·activeStage | plan/preflight/typecheck | 완료 |
| CP1 | native 고급 분석·계약·검증·worker·artifact | synthetic/native parity, resource/invalid/cancel, typecheck | 대기 |
| CP2 | lazy Dock·registry·설정·결과·export | component/build, desktop/mobile/keyboard/axe/visual | 대기 |
| CP3 | 전체 수치·회귀·보존 증거 | 전체 Vitest, quality, production E2E | 대기 |
| STATUS | 별도 완료 상태 | 구현 원격 확인 뒤 status push/hash | 대기 |

## 변경 예정 경로

- `src/product/adapters/analysis/advanced/`, `tests/product/adapters/analysis/advanced/`
- `src/product/lab/views/advanced*`, 공용 diagnostics facade, catalog metadata
- `e2e/redesign/advanced-diagnostics*`, 관련 component/registry tests
- `scripts/redesign/measure-advanced-diagnostics.ts`, `documents/redesign/advanced-diagnostics-ko.md`, `stage-runs/S19-*`, `status.json`

## 진행·위험·원격 증거

- 완료 목록과 nextStage=19를 유지한다. 검증된 checkpoint만 명시적 경로로 commit/push하고 정확한 원격 hash를 확인한다.
- 기존 dependency/CodeQL 위험은 본 단계에서 해결·수용했다고 주장하지 않는다. 사람 과학 검토를 꾸며내지 않는다.

