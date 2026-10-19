# S13 — 구동·결합·역진자·cart-pole·매개변수 계

## 시작 상태

- 기준 로컬/원격 HEAD: `cf97e8a615a6dde4afa99b64946fc15a6655f28f` (`codex/redesign`).
- 작업 폴더 깨끗함, origin fetch 성공, `redesign:check`와 `redesign:preflight -- 13` 통과.
- 선행 S01–S12 완료 목록과 S12 원격 완료 기록 및 공간 계 adapter/UI/test 산출물을 확인했다.
- 요청 범위는 실행 계획 S13 하나다. S14 이후 모델·일반 sweep queue(S21)·교육 콘텐츠·앱 전환은 범위 밖이다.
- 실행 UI의 모델 선택값은 이 런타임에서 읽을 수 없어 검증하거나 변경했다고 주장하지 않는다.

## 목표와 보존

- driven/coupled/inverted/cartpole/parametric의 기존 plant를 제품 adapter로 연결한다.
- 구동 파형·진폭·주파수·위상, 호환 제어기의 활성화·gain·포화, reference/state error와 제한된 공명 탐색 진입을 제공한다.
- plant와 controller 설정을 분리하고 잘못된 gain·비유한 상태·제어 실패를 안전하게 중지한다.
- canonical 설정 저장/공유/복원과 CSV/SVG 출력에 구동·제어 의미를 보존한다.
- `app.html`, physics/chaos/research/runtime/workers/validation, 공개 API, 기존 저장·공유 계약, 사용자 데이터, lockfile, golden 및 기존 시각 기준을 보존한다.

## 내부 checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록과 activeStage | plan/preflight, diff | 원격 확인 완료 |
| CP1 | adapter/schema/worker, 원 엔진 연결·구동·제어 | passive/zero-force, 원 엔진 비교, closed-loop, saturation/invalid, worker cancel/error, typecheck | 원격 확인 완료 |
| CP2 | Lab UI/저장/공유/내보내기, 카탈로그·라우트 | model/storage, desktop/mobile/keyboard/axe/320px/zoom, 시각 검증, build | 원격 확인 완료 |
| CP3 | 과학적 한계·검증·보존 문서와 완료 후보 | 문서/JSON/링크·plan/typecheck, push 뒤 전체 stage 검증 | candidate-complete |
| STATUS | 완료 상태의 별도 commit/push | 구현 원격 존재, status 원격 hash 확인 | 대기 |

## 변경 예정 경로

- `src/product/adapters/physics/driven*`, `src/product/lab/views/driven-*`, `src/product/app/views/driven-lab.ts`
- `src/product/catalog/`, 제품 route/library 연결과 필요한 `css/product/` 스타일
- `tests/product/adapters/physics/driven*`, `tests/product/lab/driven*`, 관련 catalog/app 테스트
- `e2e/redesign/driven-pendulum.spec.ts`와 새 시각 기준
- `documents/redesign/driven-control-lab-ko.md`, 본 진행 기록·검증 JSON·`status.json`

## 검증과 원격 증거

- 시작 plan check: 30 stages / 86 unique units / next S13.
- 시작 preflight: S13 at `cf97e8a615a6`, origin과 정확히 일치.
- CP0 `f5ac8357006cc8b94ee5f537ad5f226e0700d1ab` push 성공, `ls-remote` 정확한 hash 일치. 완료 목록은 S12, nextStage=13을 유지한다.
- CP0 push가 알린 기본 branch dependency 경고는 high 8 / moderate 3이다. 신규 audit나 보안 해결 결과가 아니다.
- 구현 조사에서 cartpole의 rod RHS와 point-bob 에너지 진단 차이를 확인했다. 보존량으로 쓰지 않으며 기존 물리 코드를 바꾸지 않는다.
- gain의 물리 단위를 잃지 않도록 canonical allowlist에 `N/rad`, `N*s/rad` 두 단위를 추가했다. 기존 단위·serializer·schema 식별자는 보존한다. 단위 직렬화 관련 19/19 테스트 통과(샌드박스의 하위 프로세스 EPERM 뒤 승인된 동일 명령으로 재실행).
- desktop transport 두 사본의 SHA256은 저장소 원본과 각각 일치한다(roadmap `1D46E04691D4119CED60DACB41945C75D9D1A20F66CBAED2B3664909F47F8995`, execution `803B191496EDD95EBF2199A8983B920058109BB159D55F8BAFEB0737FA735FC5`). 원본 두 계획 파일은 변경하지 않았다.

## 검토·위험

- 승인된 사용자 검토 게이트는 [7,9]이며 S13에는 별도 사용자 승인 게이트가 없다.
- 기존 보안 및 사람 과학 검토 미완료 상태는 해결됐다고 주장하지 않는다.
- 파형 불연속·유한 step·선형 제어기의 국소 유효 범위와 plant 각도 convention을 원 코드 및 fixture로 확인한다.
- desktop transport 사본은 종료 시 원본과 hash를 대조하고 차이를 기록한다.

## CP1 검증

- `tmp/S13-cp1-vitest.json`: adapter/worker 72개와 quantities 19개, **91/91 통과**, 3파일, skip/todo/실패 0.
- `npm run typecheck` 통과. adapter 5개·test 2개와 root 연결 파일의 scoped ESLint 통과. `git diff --check` 통과.
- 기본 cosine/제어 off 상태는 다섯 기존 factory 엔진과 비교한다(상태 11자리, 에너지 10자리 검사). 별도 상수 힘도 원 엔진과 일치한다.
- zero-drive passive 극한·대칭 결합 모드, sine/square/triangle·주파수·native phase/offset round trip과 거부 입력을 검증한다.
- inverted/cartpole 기본 피드백의 5 s fixture는 최종 각도 편차가 초기의 15% 미만이다. gain의 일반 안정성을 보장하지 않는다. 포화·gain 오류·π/2 안전 범위 이탈 뒤 마지막 유효 상태 보존을 검증한다.
- cartpole의 RK4 중간 시각 구동을 analytic impulse와 대조했다. step 0.05→0.025 s의 오차 비율 12–20, 작은 step 오차 <1e-7. 시작 시각 1e9 s와 step 1e-5 s에서도 elapsed clock fixture의 impulse 오차 <1e-8.
- worker는 요청당 최대 64단계/8 ms 협력 예산, 최대 2,001표본, 응답 timeout 15 s, 순서·진단 유효성·취소/에러/종료를 검증한다.
- CP1에는 adapter·관련 테스트·정확한 gain 단위·계약 문서만 stage한다. UI 및 route 변경은 CP2에 보존한다.
- CP1 `6eb48abb1e1bae5a2223660990faa69a0729200c` push 성공, `ls-remote` 정확한 hash 일치.

## CP2 진행

- UI model/storage/edit/sweep 45/45 targeted tests 통과. 최종 집계와 production browser 검증은 아직 남았다.
- 개발 서버의 첫 브라우저 시도는 기존 Vite inline style/CSP console 오류로 afterEach 검사를 실패했다. 동작 assertion과 별개인 실패이며 통과로 세지 않는다. console 검사를 유지한 채 production build/preview에서 다시 검증한다.
- production 준비 실행 `tmp/S13-cp2-playwright.json`은 기능 54통과 / 최초 시각 기준 생성 4실패이다. 이를 58/58 통과로 표시하지 않는다. 이후 회전 경계를 추가하고 실제 0.2 s 제어 결과를 새 시각 기준에 담았다.
- 마지막 source에서 `tmp/S13-cp2-vitest.json`: UI **48/48**, 4파일, 실패/pending/todo 0. typecheck 및 UI·route·catalog·E2E 변경 범위 ESLint 통과.
- 원점 y=160으로 전체 회전을 화면 안에 표시한다. 조건 적용·기본 예제·JSON·보관함 복원 뒤 이전 sweep 결과·오류를 지우고 worker 세대를 종료한다. stale 응답과 동기 취소 경로를 unit/browser로 검증했다.
- `tmp/S13-cp2-latest-playwright.json`: 회전 경계와 수정된 sweep 4/4 통과. `tmp/S13-visual-preparation.json`: 새 그림 기준 2/2 통과. 기존 시각 기준 122개는 byte-identical이며 신규 기준은 8개다. 신규 8개를 직접 시각 검토했다.
- 최종 production build/public-artifact privacy 검사 통과. 전체 stage 검증은 CP3 원격 보존 뒤 단일 전체 Vitest와 88개 production browser로 다시 수행한다.
- `tmp/S13-cp2-library-playwright.json`: 새 library와 기존 mock 시각 비교 **2/2** 통과, snapshot update 없음. CP2의 60개 고유 필수 사례는 모두 최신 실행에서 통과했다. 이는 단일 60/60 실행 결과가 아니며 초기 실패·기준 생성·수정 후 최신 결과를 구분한다. timeout/retries/assertion 완화와 skip은 없다.
- CP2 `e7336e13416bc54bc02daea07a80eaf84ec5c3eb` push 성공, `ls-remote` 정확한 hash 일치.

## CP3 완료 후보

- `driven-control-lab-ko.md`에 좌표·단위·제어 부호·포화·에너지 한계·재시작·공명 관찰의 한계를 기록했다.
- 재생성 가능한 `scripts/redesign/measure-driven-numerics.ts`와 exact config를 포함한 `S13-numerical-metrics.json`, 검증·실패·보존 기록 `S13-verification.json`을 추가했다.
- 전체 필수 검증과 별도 STATUS push는 아직 남았다. 완료 목록과 nextStage는 S12/S13을 유지한다.
