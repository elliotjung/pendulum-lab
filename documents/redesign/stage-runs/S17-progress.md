# S17 이산 사상·양자 Floquet 실행 기록

## 기준과 범위

- 요청: 17단계 실행. 저장소의 authoritative 여섯 문서를 전체 읽고 계획의 S17로 해석했다.
- 기준 local/remote HEAD: `16ff3bb1a502c3d2923d5c0793dcf196fc15bb27`, branch `codex/redesign`, upstream `origin/codex/redesign`. fetch 후 정확히 일치하며 사용자 변경이 없었다.
- 의존 S16: 원격 status commit `16ff3bb`, CP0~CP4 이력, validated S16 verification 및 field adapter/UI/tests를 확인했다. S01~S16 연속 완료, 승인 gate [7,9].
- `redesign:check`, `redesign:preflight -- 17` 통과. FETCH_HEAD 쓰기와 Git 자식 프로세스는 sandbox 제한으로 동일 명령을 확장 권한 실행했다.
- 모델 selector는 런타임에 노출되지 않는다. 기록된 사용자 선택을 전제로 진행하며 실제 UI 선택을 검증하거나 변경했다고 주장하지 않는다.
- 목표: standard-map/QKR/unitary-Floquet native adapter, iteration runner, phase cylinder, 복소 파동함수·준에너지, norm/unitarity, 저장·공유·export 복원 및 전체 시스템 탐색 review.
- 제외: S18 이후 분석 통합, 새 Learn 콘텐츠, 일반 연구 queue, app cutover, master merge/release, 기존 엔진 재작성.

## 보존 계약

- 기존 `app.html`, physics/chaos/research/runtime/workers/validation/lib, public API, 사용자 저장·공유, package/lockfile, golden 및 기존 시각 baseline을 보존한다.
- product adapter가 기존 native 함수를 호출한다. 복소 vector와 iteration/evaluation canonical 계약을 재사용하고 전용 version·단위 규약을 엄격하게 검사한다.
- ODE 적분기와 비호환 연속계 분석을 노출하지 않는다. 각도 wrapping, FFT momentum 순서, 유한 격자, 투영하지 않은 고유값과 계산 한계를 명시한다.
- 전용 저장 namespace와 원본 손상 방지, 복소 state export/import round trip을 검증한다. 자동 정규화로 진단 오류를 숨기지 않는다.

## 내부 checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록·activeStage | plan/preflight/typecheck | 완료 |
| CP1 | native adapter·canonical·bounded worker | deterministic/native parity, norm/unitarity/known spectra, complex roundtrip, worker cancel/error/resource, typecheck | 대기 |
| CP2 | 전용 Lab·plots·files·route | model/storage tests, production build, desktop/mobile/keyboard/axe/visual | 대기 |
| CP3 | 전체 검증·보존·review 후보 | 전체 Vitest, browser, catalog/Learn/inventory/policy/secrets/typecheck/build | 대기 |
| STATUS | 별도 완료 상태 | 구현 원격 확인 뒤 status push/hash | 대기 |

## 변경 예정 경로

- `src/product/adapters/physics/discrete*`, `tests/product/adapters/physics/discrete*`, `tests/product/contracts/discrete*`
- `src/product/lab/views/discrete-*`, `src/product/app/views/discrete-lab.ts`, application route, library 안내, 필요 catalog helper
- `css/product/discrete.css`, `tests/product/lab/discrete-*`, `e2e/redesign/discrete-quantum*`
- `documents/redesign/discrete-quantum-lab-ko.md`, `stage-runs/S17-*`, `status.json`

## 위험·검토·원격 증거

- 유한 FFT 격자의 wrap/alias, dense spectrum 비용과 비수렴, norm/유니터리 오차, 복소 state 입력 크기를 검증하고 표시한다.
- checkpoint마다 targeted 검증 후 명시적 경로만 stage/commit/push하고 정확한 원격 hash 확인 뒤 다음 checkpoint로 진행한다. status 전 nextStage=17 유지.
- S17은 사용자 review gate이다. 완료 보고에서 전체 패밀리 탐색·조건 구조 checklist를 제공하며 승인이나 사람 과학 검토를 미리 기록하지 않는다.
- 기존 dependency/CodeQL 위험은 이 단계에서 해결·수용했다고 주장하지 않는다.
- desktop 전달 두 사본은 변경하지 않은 원본 계획의 SHA256과 일치한다: roadmap `1d46e04691d4119ced60dacb41945c75d9d1a20f66cbaed2b3664909f47f8995`, execution `803b191496edd95ebf2199a8983b920058109bb159d55f8bafeb0737fa735fc5`.
