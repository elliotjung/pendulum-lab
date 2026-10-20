# S18 핵심 카오스 진단 실행 기록

## 기준과 범위

- 기준 local/remote HEAD: `21bd6692ba2a3228035d95cb355eacbcfda96a01`, branch `codex/redesign`, upstream `origin/codex/redesign`. fetch 후 일치, 작업 폴더 clean.
- authoritative 여섯 문서를 전체 읽었다. 의존 S17 status commit 및 CP0~CP3 이력, native adapters/UI/tests, `S17-verification.json`의 validated 결과를 확인했다. S01~S17 연속 완료.
- `redesign:check`, `redesign:preflight -- 18` 통과. sandbox의 FETCH_HEAD/Git 자식 프로세스 제한은 동일 명령의 확장 권한 실행으로 해결했다.
- S17 보고 뒤 S18 요청을 사용자 checkpoint 승인으로 기록한다. 사람 과학 검토를 의미하지 않는다.
- 모델 selector는 런타임에 노출되지 않는다. 기록된 사용자 선택을 전제로 진행하며 UI 선택 검증·변경을 주장하지 않는다.
- 목표: state/time, energy, phase, FFT, NAFF, Poincaré, Lyapunov spectrum, SALI, FLI, 0–1, shadowing의 공용 adapter/worker/호환성/화면 및 versioned artifact 재로드.
- 제외: S19 이후 고급 분석, 새 교육 콘텐츠, 연구 queue, migration/cutover, master merge/release.

## 보존 계약

- 기존 app.html, physics/chaos/research/runtime/workers/validation/lib, public API, 사용자 데이터, package/lockfile, golden과 과거 시각 baseline을 보존한다.
- 공용 product adapter는 기존 계산 함수를 호출한다. hybrid/delay/stochastic/quantum 모델에 없는 연속 접선 모델을 꾸며내지 않으며 이유를 표시한다.
- 기록된 데이터의 단위·sampling·과도구간과 원래 초기조건에서 별도로 수행하는 분석을 구분한다. 유한시간 지표를 수학적 카오스 증명으로 표시하지 않는다.

## 내부 checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록·activeStage·S17 승인 | plan/preflight/typecheck | 검증 통과 |
| CP1 | 공용 계약·native 분석·호환성·worker·artifact | synthetic/native parity, invalid/resource/cancel, typecheck | 대기 |
| CP2 | 모든 패밀리 공용 Dock·설정·plots·재로드 | component/unit, build, desktop/mobile/keyboard/axe/visual | 대기 |
| CP3 | 전체 검증·수치·보존 기록 | 전체 Vitest, quality checks, E2E, preservation | 대기 |
| STATUS | 별도 완료 상태 | 구현 원격 확인 뒤 status push/hash | 대기 |

## 변경 예정 경로

- `src/product/adapters/analysis/core/`, `tests/product/adapters/analysis/core/`
- `src/product/lab/views/diagnostics*`, 기존 패밀리 workspace의 공용 mount 경계, 관련 catalog metadata
- `tests/product/lab/diagnostics*`, `e2e/redesign/core-diagnostics*`
- `documents/redesign/core-diagnostics-ko.md`, `stage-runs/S18-*`, `status.json`, 필요한 검증 script

## 위험과 증거

- 데이터 길이·차원·계산량을 제한하고 별도 worker를 terminate하여 취소한다. 계산 중인 오래된 결과는 폐기한다.
- checkpoint targeted 검증 성공 후 명시적 경로만 commit/push하고 remote hash를 확인한다. status 전 nextStage=18 유지.
- 기존 dependency/CodeQL 위험은 본 단계에서 해결·수용했다고 주장하지 않는다.
- CP0: plan/preflight/전체 typecheck exit0. 명시적 두 경로만 commit/push한 뒤 구현을 시작한다.
