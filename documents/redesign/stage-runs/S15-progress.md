# S15 자기·네트워크·동기화 실행 기록

## 기준과 범위

- 요청: 15단계 실행. source of truth의 여섯 문서를 전체 읽고 Git root를 확인했다.
- 기준 local/remote HEAD: `b2c2a31455fb1a10ef2c804590e3ea68a60c91f3` (`codex/redesign`). 깨끗한 worktree, upstream 일치, fetch 후 ahead/behind 0/0.
- 의존 S14: 원격 status의 lastCompletedStage=14, nextStage=15, 원격 status commit과 S14 adapter/UI/tests/validated verification 산출물을 확인했다.
- `redesign:check`, `redesign:preflight -- 15` 통과. 샌드박스 Git 쓰기/자식 실행 제한은 동일 명령의 확장 권한 실행으로 해결했다.
- 실행 모델 선택 UI는 이 런타임에서 읽을 수 없다. 사용자 선택을 전제로 진행하며 모델을 변경·검증했다고 주장하지 않는다.
- 목표: magnetic / pendulum-network / huygens-phase-pair / kuramoto / chimera-exploration의 실제 adapter, topology 편집, order/local coherence, basin seed grid, node/edge import/export, aggregate/개별 상태 전환.
- 제외: S16 이후, 일반 sweep/ensemble queue, 새 Learn 단원, app 전환, master merge/release, 엔진 재작성.

## 보존 계약

- `app.html`, `src/physics`, `src/chaos`, `src/research`, `src/runtime`, `src/workers`, `src/validation`, 공개 API와 기존 데이터·공유 형식·golden·package/lockfile을 보존한다.
- 새 adapter는 native RHS/적분기/동기화 진단을 호출한다. topology와 seed는 versioned canonical 상태로 왕복하며 잘못된 그래프는 적용 전에 거부한다.
- 별도 product network 저장 namespace를 사용하고 손상·미래 버전 원본은 덮어쓰지 않는다.

## 내부 checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록·activeStage | plan check, preflight, typecheck | 통과·push 대기 |
| CP1 | native adapter·schema·canonical·bounded worker | native parity, permutation, graph/seed, cancel/error, 계약, typecheck | 대기 |
| CP2 | 전용 Lab·topology·metrics·basin·files·저장 | model/edit/storage tests, desktop/mobile/keyboard/axe/visual, build | 대기 |
| CP3 | 수치·보존·검증 보고서 | 전체 Vitest, 관련 browser, catalog/Learn/inventory/policy/secrets/typecheck/build | 대기 |
| STATUS | 별도 완료 상태 | 구현 원격 확인 후 최종 검증, status push/remote hash | 대기 |

## 변경 예정 경로

- `src/product/adapters/physics/network*`, `tests/product/adapters/physics/network*`, 필요 최소 공통 계약과 회귀 테스트
- `src/product/lab/views/network-*`, `src/product/app/views/network-lab.ts`, application route, catalog network 설명, Lab library 안내
- `css/product/network.css`, `tests/product/lab/network-*`, `e2e/redesign/network-pendulum*`
- `scripts/redesign/measure-network-numerics.ts`, `documents/redesign/network-lab-ko.md`, `stage-runs/S15-*`, `status.json`

## 위험·검토·원격 기록

- Huygens는 기존 두 위상 축약이며 지지대/탈진기 역학이 아니다. Chimera는 유한 네트워크 탐색이며 존재 증명이 아니다. 자기 force는 정칙화한 현상론적 모형이다.
- 큰 network는 RHS O(N²), 출력·그래프·seed grid·worker chunk/time을 제한한다. 큰 payload의 URL 공유 한계는 JSON 경로로 설명한다.
- 승인 gate [7,9] 유지. S15는 사용자 gate가 아니며 사람 과학 검토를 수행했다고 표시하지 않는다.
- 기존 S01 dependency/CodeQL 문제는 이번 단계에서 해결·수용했다고 주장하지 않는다.
- desktop 두 transport 사본은 원본 SHA256과 일치한다. roadmap `1d46e04691d4119ced60dacb41945c75d9d1a20f66cbaed2b3664909f47f8995`, execution `803b191496edd95ebf2199a8983b920058109bb159d55f8bafeb0737fa735fc5`.
- checkpoint 검증 후 명시적 경로만 commit/push하고 정확한 원격 hash를 확인한다. 최종 STATUS까지 nextStage=15를 유지한다.
