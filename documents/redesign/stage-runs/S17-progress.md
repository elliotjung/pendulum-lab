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
| CP1 | native adapter·canonical·bounded worker | deterministic/native parity, norm/unitarity/known spectra, complex roundtrip, worker cancel/error/resource, typecheck | 완료 |
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
- CP0 `80d37a03cada643ed7b09f4de3e461666bd4ca65` commit/push 성공. `git ls-remote origin refs/heads/codex/redesign`의 정확한 hash 일치를 확인했다. baseline 전체 typecheck와 plan 검증도 exit0.

## CP1 설계 판단

- 기존 canonical schema 변경 없이 복소 vector와 iteration/evaluation을 사용한다. 카탈로그는 135개 정의·35시스템·134개 frozen baseline 참조를 유지한다.
- QKR 파동함수 N=2..512(2의 거듭제곱), dense spectrum/행렬 최대 N=8. 준에너지는 파동함수와 같은 N≤8에서만 계산하며 큰 N의 진화를 작은 스펙트럼으로 대체하지 않는다.
- native 근 계산은 수렴 flag가 없으므로 항상 해석 한계를 표시한다. projection=false이며 비유니터리 행렬도 결함을 숨기지 않고 진단한다.
- norm=Σ|ψ|²를 보존하며 자동 정규화하지 않는다. `normDrift`는 |norm−1|이고, 초기 norm 대비 보존 오차는 별도 fixture에서 계산한다.

## CP1 검증

- `tmp/S17-cp1-vitest.json`: backend/복소 계약/worker **36/36**, 3파일, 실패/pending0. `tmp/S17-integration-catalog-vitest.json`: catalog/coverage/source scopes **39/39**, 3파일.
- scoped ESLint와 metrics script ESLint exit0. live 전체 typecheck와 production build도 exit0. 개발 중 TypeScript unknown-array narrowing과 index signature 오류를 수정한 뒤 재검증했다. 최종 동결 뒤 typecheck를 한번 더 실행한다.
- native spectrum 반환의 QKR metadata 3개는 명시적으로 base spectrum 5개 필드와 분리하여 worker 계약에 맞췄다. default N=8 QKR의 실제 session↔client ready/progress 왕복을 검증한다.
- `S17-numerical-metrics.json` 고정 검증 8/8: map 1,000회와 QKR 64격자·2,048회 native 차이0, QKR 초기 norm 보존 편차 `1.7850165789923267e-12`, 알려진 대각 3모드 phase/준에너지 오차0. 비유니터리 fixture 결함 `0.38483762809787714`, raw 단위원 이탈0.3을 숨기지 않는다.
- 실제 native roots의 complex division failure, QKR 비유한 관측량, 부분 묶음 오류의 마지막 유효 상태, worker startup/postMessage/deserialize/runtime/timeout/dispose 경로와 중복/순서/과대 요청을 검사했다.
- map 초기 θ는 [0,2π)로 검증하며 p는 감지 않는다. 큰 p와 비1 norm 복소 상태도 재시작 계약에 보존하고 자동 보정하지 않는다.
- 동결 backend36개 test와 전체 live tree의 최종 typecheck `tmp/S17-cp1-typecheck-final.log` exit0. 구현 checkpoint는 다음 단계로 완료 표시하지 않고 먼저 원격 보존한다.
