# S23 — 데이터 기반 모델·대규모 고유해석

## 기준과 범위

- 기준 local/remote HEAD: `89850497ce94a0bd68307ec43437c9c93f4c1168`, branch `codex/redesign`, upstream `origin/codex/redesign`.
- 작업 전 clean worktree, fetch, 정확한 HEAD 일치, redesign:check 및 redesign:preflight -- 23 통과. 최초 sandbox Git 쓰기/하위 프로세스 제한은 같은 검사의 확장 권한 실행으로 해결했다.
- 필수 선행 S22의 별도 status commit `8985049`와 CP0–CP3 history, progress/verification/preservation 산출물, 완료 목록 1..22 및 next23을 확인했다. 바탕화면 두 전달본 SHA256은 저장소 원본과 일치한다.
- 목표: 기존 SINDy, DMD, HAVOK, reservoir, Hamiltonian 학습과 Arnoldi/Lanczos/general eigensolver를 bounded worker와 Lab에 연결한다. 학습/검증 slice, train-only 전처리, seed/모델 버전, 원본→모델→평가 계보, 재학습/재평가 파일을 제공한다.
- 범위 밖: S24 project/notebook/report/ZIP/reviewer, 이후 교육 콘텐츠, S28 parity 인증, cutover, master merge/tag/release.
- 보존: app.html; physics/chaos/research/runtime/workers/validation; 기존 product physics adapters; 공개 API, 기존 저장·공유 schema, 사용자 데이터, package/lockfile, golden 및 기존 test/PNG.
- UI 모델 선택값은 노출되지 않는다. 사용자 선택을 전제로 진행하며 변경·검증을 주장하지 않는다.

## 내부 checkpoint

| ID | 내용 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 범위·보존·진행 기록 | plan/preflight23/typecheck | 진행 |
| CP1 | 학습·고유해석 계약/adapter, lineage 파일, worker | synthetic recovery/leakage/residual/replay/invalid/resource/progress/cancel, typecheck/lint | 대기 |
| CP2 | lazy Lab 설정·진단·rollout·복원 UI | build, production desktop/mobile, keyboard/a11y/visual | 대기 |
| CP3 | 보존·통합 검증 및 완료 후보 | 전체 Vitest/golden/품질 검사/보존 hash | 대기 |
| STATUS | 별도 완료 상태 commit | 구현 원격 확인 후 status push·정확한 원격 hash | 대기 |

예정 경로: src/product/adapters/analysis/data-driven/, src/product/lab/data-driven/, diagnostics 연결, 전용 CSS, tests/product/analysis/data-driven/, e2e/redesign/data-driven*, scripts/redesign/measure-data-driven.ts, S23 문서와 검증 증거. 명시적 경로만 stage한다.

## 위험과 검토

- 시간 순서 분리 및 train-only 전처리가 필요하다. 미분/다음 표본/Hankel window가 경계를 가로지르면 안 된다.
- HAVOK의 검증 forcing 사용은 조건부 재구성이며 자율 예측으로 표시하지 않는다.
- Hamiltonian 학습은 실제 canonical q,p만 허용한다. 각속도를 운동량으로 이름만 바꾸지 않는다.
- 고유해석은 native 추정 잔차와 실제 복소 잔차를 구분하고 요청 pair 수까지 확인한다.
- 과적합, rank deficiency, 유한 시간 rollout 발산 및 Krylov 미수렴을 명시한다. 외부 결과 ID는 인증이나 과학적 진실을 증명하지 않는다.
- 사용자 승인 gate는 [7,9,17] 유지. S23은 사용자 review gate가 아니며 다음 gate는 S24다. 사람의 과학 검토를 수행한 것으로 표시하지 않는다.
- 기존 보안 부채는 별도이며 의존성 변경이나 위험 수락을 하지 않는다.

## 실행 증거

- CP0: plan check exit0; preflight23 exit0 (확장 권한); local/remote 89850497ce94a0bd68307ec43437c9c93f4c1168.
