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
| CP0 | 진행 기록·activeStage | plan check, preflight, typecheck | 완료 |
| CP1 | native adapter·schema·canonical·bounded worker | native parity, permutation, graph/seed, cancel/error, 계약, typecheck | 검증 완료·push 대기 |
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
- CP0 `e8d8d80da614651bf4aa0817d68a9781352f4b85` commit/push 성공, `ls-remote` 정확한 hash 일치, 깨끗한 CP0에서 preflight 재통과.
- 기존 native engine 기준 `tmp/S15-native-vitest.json`: 23/23, 3파일, 실패 0. 공통 topology 계약+기존 상태 계약 `tmp/S15-contract-vitest.json`: 50/50, 2파일, 실패 0.
- 공통 `ExperimentStateV1.topology`는 정확한 network-model-v1에서만 허용하는 닫힌 metadata 확장이다. 단위 allowlist와 공통 schema ID는 유지한다.

## CP1 검증

- engine adapter/worker/전용 계약 62개, 공통 topology 18개와 기존 상태 계약 32개: `tmp/S15-cp1-vitest.json` **112/112**, 5파일, 실패·pending 0.
- 전체 typecheck, engine 6파일·전용 테스트 3파일과 공통 계약 변경 범위의 scoped ESLint 통과. 초기 typecheck의 테스트 배열 인덱스 타입 오류 4개는 수정 뒤 통과했으며 테스트 조건을 완화하지 않았다.
- native RK4 네 모델의 모든 fixture 단계 상태 일치, 기존 chimera midpoint/wrapping·실제 threshold 일치, 다섯 모델의 노드 순열 오차 <1e-12, stable ID 기반 seed/canonical 왕복, Huygens 양/음 결합 잠금, 고립 노드, 2/128노드 경계와 명시적 고리 반경을 검증했다.
- 자기 grid는 native semi-implicit Euler 각 셀의 최근접 ID·속도 수렴 mask·수행 단계와 일치한다. 10,000단계짜리 첫 셀 안의 취소와 128노드 worker 취소·8ms 예산·64단계·최대 2,001표본을 검증했다.
- worker는 초기 상태·node ID·phase/state 대응·같은 시각의 기록/현재 상태·요청 순서·오류 payload를 검증한다. null/primitive 오류 snapshot, timeout, dispose, 전달 실패, 시작 실패와 수치 불안정의 마지막 유효 상태 보존을 검사했다.
- 검토 중 고리 생성이 R을 무시하는 문제, invalid plain object의 Number/String 강제 변환, null worker 오류 snapshot, 서로 모순되는 worker 표본을 발견하여 이 checkpoint 안에서 수정했다. 네이티브 방정식·허용오차·기존 fixture는 바꾸지 않았다.
