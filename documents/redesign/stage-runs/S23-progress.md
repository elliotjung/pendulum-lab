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
| CP0 | 범위·보존·진행 기록 | plan/preflight23/typecheck | 완료·원격 확인 |
| CP1-E / CP1-L | 고유해석 후 학습·worker 계약의 두 bounded checkpoint | synthetic recovery/leakage/residual/replay/invalid/resource/progress/cancel, typecheck/lint | 완료·원격 확인 |
| CP2 | lazy Lab 설정·진단·rollout·복원 UI | build, production desktop/mobile, keyboard/a11y/visual | 완료·원격 확인 |
| CP3 | 보존·통합 검증 및 완료 후보 | 전체 Vitest/golden/품질 검사/보존 hash | candidate-complete 전체 검증 중 |
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


### CP0 원격 및 CP1-E

- CP0 commit `7e3c7cfe34f5bcb8d725f1f854b64be241d966f8`; push exit0, ls-remote 정확히 일치했다. 기본 branch의 취약점 알림 22개(12 high/7 moderate/3 low)는 기존 부채와 별도 관측이며 새 audit나 위험 수락이 아니다.
- CP1을 두 개로 나누어 먼저 독립된 고유해석 adapter를 보존한다. CP1-E는 eigen-contracts/validation/eigen과 전용 test만 포함한다. 나머지 학습/worker/UI 변경은 이 commit에 포함하지 않는다.
- CP1-E: product eigen 38 + 기존 Arnoldi/Lanczos 7 =45/45, 실패·pending0 (`tmp/s23-cp1-eigen.json`). 전체 typecheck, 해당 ESLint/Prettier exit0. 희소2048차, 복소 잔차, pair 독립성·부족한 pair, 비수렴, malformed/asymmetry/자원 거부, 저장 벡터 재평가와 실제 matvec progress를 검증했다.
- 독립 검토로 id 숫자 coercion, 저장 native 학습 진단 메타데이터, 작은 조밀 행렬의 숨김 설정, HAVOK 비적용 ridge와 짧아진 reconstruction 표시를 발견했다. CP1-L/CP2에 수정·회귀 검증을 포함한다. 초기 실패 시도는 최종 통과와 구분해 남긴다.

### CP1-E 원격 및 CP1-L

- CP1-E `600f1df7e5edfdcfb244d32cd6719f0b389cebc2` push exit0, ls-remote 정확히 일치. 고유해석 구현만 원격에 있다.
- CP1-L은 학습5종, 현재 Lab/S22 원본 source, SHA256 lineage·저장/재학습/고정 모델 재평가, 전용 worker/client와 표적 테스트를 포함한다. UI는 CP2다.
- 최신 통합 표적 `tmp/s23-cp1-combined-passed.json` exit0; 전체 typecheck exit0; 해당 ESLint/Prettier exit0. 수치 script는24/24 항목 통과: 5개 모델의 정확도·held-out 누수·재실행, Arnoldi/Lanczos의 실제 잔차·해석 Laplacian spectrum, 일반 solver의 trace 불변량·2±3i 및-0.5 spectrum. trace를 eigenpair residual로 표시하지 않는다.
- 미리보기→확정 원본 파일, native 모듈 재사용, 분할 뒤 차분/Hankel, training-only 전처리와 HAVOK basis, source/model/settings/version/seed를 검증한다. 재평가는 native fit/SVD를 호출하지 않는 spy 검증을 포함한다(일반 조밀 spectrum은 명시된 bounded solver replay).
- DMD/HAVOK spectrum, SINDy/Hamiltonian 잔차·R², reservoir NRMSE/radius와 HAVOK training SVD triplet 잔차도 저장 모델에서 다시 계산한다. 외부 계수·source 물리적 의미는 인증하지 않는다.
- 초기 실패: -0 fixture와 canonical0 비교, Hamiltonian feature descriptor 순서, 추가 Duffing test의 dt0.02 중앙차분 오차와 singular failure reason 가정. Native 순서에 맞춘 library 검증, dt0.01에서 원래 계수 허용오차 유지, 명시적 오류 거부 검증으로 수정했다. 초기 root/learning JSON은 최종 통과와 별도 보존한다. 기존 assertion/golden/timeout/retry는 수정하지 않았다.


### CP1-L 원격 및 CP2

- CP1-L `fe06238f3797e03b9469bff68e739cd6e894e58e` push exit0, ls-remote 정확히 일치. 통합 표적129/129, 수치24/24이며 별도 agent 재검토66/66도 통과했다. 이 검토는 사람의 과학 검토가 아니다.
- CP2: lazy Lab 데이터 모델 패널, 학습/연산자 입력, preview→채택, 재학습/저장 모델 재평가, 진단·rollout 표/그림, 경고·진행·오류·취소와 결과 다운로드를 연결한다. 기존 diagnostics 연결은6줄 diff이며 기존 패널 계약은 유지한다.
- 실제 production Chromium/Pixel5 여정26/26 (`tmp/s23-browser-final.json`), 실패·skip·flaky·runner error0. 원래30초 timeout/retries0 유지. 이 run의 실제 snapshot policy는 기본값 missing이며 준비된4개 기준 이미지가 존재했다. 이후 visual2/2를 명시적 --update-snapshots=none으로 비교했다 (`tmp/s23-visual-final.json`); 기준 이미지의 전후 hash도 별도 확인한다.
- 최신 production build (`tmp/s23-build-ui.log`), 전체 typecheck (`tmp/s23-cp2-typecheck.log`), 전용 ESLint/Prettier exit0. 320px·200% zoom·키보드 및 axe가 통과했다. 새 light/dark desktop/mobile PNG4개는 개별 시각 확인했다. 좁은 화면 metrics 줄바꿈과 짧은 ID 표시를 개선했고 full ID는 펼침 기록/파일에 보존했다.
- 작은2×2 일반 복소 고유값, 희소64차 Lanczos, eigen 채택 후 기존 학습 데이터의 보이는 요약, HAVOK 비적용 ridge 숨김, invalid split/file/asymmetry, 이전 결과 보존, 실제 Lab129표본 source와 live state 보존을 브라우저로 확인했다.
- 초기 browser24건은10통과/14실패였다. 10건은 JSON의 -0→0 fixture 비교,2건은 숨겨진 조건 탭을 열지 않은 설정,2건은 작은 fit이 취소 클릭 전에 끝난 test 준비 문제였다. fixture canonical0·조건 탭 활성화·명시된1500ms 제출 지연으로 pending worker 취소를 검증했다. Native 계산을 느리게 바꾸지 않았고 원래 timeout/retry/assertion은 약화하지 않았다. 최초 sandbox build/worker spawn EPERM은 동일 명령의 확장 권한으로 해결했다.


### CP2 원격 및 candidate-complete 검증

- CP2 `0ac2964ec154b1b033da5239d2d235ccfbc52098` push exit0, ls-remote 정확히 일치했다. 모든 구현 checkpoint가 원격에 있다. `nextStage=23`, 완료 목록1..22는 그대로 유지한다.
- 별도 시각 비교2/2의 실제 정책 none과 PNG4개 전후 SHA256 일치(`tmp/s23-visual-hashes.json`)를 확인했다. 전체26건의 실제 missing 정책과 구분한다.
- 지금부터 CP3에서 전체 Vitest/golden, 전체 typecheck/lint/format/build 및 계획·카탈로그·Learn·인벤토리·보안 패턴 검사, 기존 S18–S22 대표 production browser 회귀와 정확한 보존 해시를 확정한다. 어떤 필수 검증이 실패해도 완료 표시하지 않는다.

### CP3-I — 최종 입력 오류 안내 보강

- 첫 전체 Vitest5382/5382 및11개 품질 명령은 모두 exit0이었다. 마지막 입력 검토에서 형식이 잘못된 학습 JSON을 기본 설정으로 읽을 때 내부 TypeError가 노출될 수 있음을 확인했다. 정상 데이터와 계산은 바꾸지 않고 미지원 source schema와 필수 배열을 기본 설정 생성 전에 검사하도록 보강했다.
- 변경은 source.ts와 기존 신규 source.test.ts의 오류 안내 assertion뿐이다. 관련4/4, 전용 ESLint/Prettier, 전체 typecheck, production build exit0; production invalid split/file/asymmetry·이전 결과 보존2/2, 오류·skip·flaky0을 확인했다 (`tmp/s23-import-guidance.json`, `tmp/s23-import-guidance-browser.json`).
- 이 작은 구현 보강도 먼저 별도 checkpoint로 push한다. 이후 최종 전체 Vitest·품질 검사·S23 browser26건 및 기존 대표 browser를 새로 확정한다. 앞서 통과한 전체 결과는 `tmp/s23-full-vitest-pre-import-guidance.json`, S23 browser26건의 기본 missing 정책 결과는 `tmp/s23-browser-pre-import-guidance.json`으로 보존했다.
