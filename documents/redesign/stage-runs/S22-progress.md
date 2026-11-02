# S22 — 역문제·UQ·관측 데이터 가져오기

## 기준과 범위

- 기준 local/remote HEAD: `3a09c3f6bb0c9bb4ba01aa4e9a09763fbc17eb12` (`codex/redesign`).
- 깨끗한 worktree, fetch 성공, HEAD 일치, plan check와 preflight22 exit0을 확인했다. sandbox의 Git 쓰기/하위 프로세스 제한은 같은 명령의 확장 권한으로 해결했다.
- S01~S21 완료 목록·Git history와 S21 progress/verification/preservation 산출물을 확인했다. 필수 선행 S21 status commit은 원격에 있다.
- 목표: CSV·각도 센서·색상 마커 영상의 관측 자료를 preview→확정으로 가져오고, 보정·단위·시간·결측 처리와 원본을 연결한다. 기존 매개변수 추정·Sobol·PCE 모듈을 bounded worker에서 실행하고 원본과 결과 관계를 파일로 복원한다.
- 범위 밖: S23 데이터 학습/고유해석, S24 프로젝트 저장·ZIP/reviewer, S25 이후 교육 콘텐츠, S28 parity 인증, app cutover·master merge·release.
- 기존 `app.html`, physics/chaos/research/runtime/workers/validation, 기존 product physics adapters, 공개 API·저장 데이터·공유 schema·golden fixture·이전 테스트를 보존한다.
- UI 모델 선택값은 이 실행 환경에서 읽을 수 없다. 사용자 선택을 전제로 진행하며 selector 변경이나 검증을 주장하지 않는다.

## 내부 checkpoint

| ID | 내용 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 범위·보존·진행 기록 | plan/preflight22/typecheck | 진행 |
| CP1 | immutable 관측 계약·보정·원본 복원, 역문제/UQ adapter·worker | malicious/malformed, recovery, native/UQ benchmark, progress/cancel/memory, typecheck/lint | 대기 |
| CP2 | lazy 관측 wizard·추정/UQ UI·결과·복원 | production browser desktop/mobile, keyboard/a11y, visual, build | 대기 |
| CP3 | 보존·통합 검증·완료 후보 | 전체 Vitest, golden, 품질 검사, 보존 해시, 원격 구현 확인 | 대기 |
| STATUS | 별도 완료 상태 commit | 원격 HEAD 정확한 일치 | 대기 |

변경 예정 경로: `src/product/observations/`, `src/product/adapters/analysis/inverse/`, `src/product/lab/research/`, 공유 diagnostics 연결, 전용 CSS, 관련 `tests/product/`와 `e2e/redesign/`, S22 문서/검증 증거. 각 checkpoint에서 명시적 경로만 stage한다.

## 위험·검토 상태

- 영상은 두 색상 마커와 교정값을 요구한다. 범용 영상 추론이나 임의 센서 자동 인식을 주장하지 않는다.
- 기존 inverse fitter의 실제 지원 모델/적분/초기조건만 허용하고, 부적합 설정은 이유를 표시한다. UQ의 독립 uniform 가정·유한 표본·비식별성과 대리모델 외삽 한계를 표시한다.
- 불러온 수치 결과는 인증된 실험 결과가 아니다. schema/유한성/입출력 관계를 검사하고 원본을 보존한다.
- 기존 보안 부채는 S21 기록을 이어받으며 dependency 변경이나 위험 수용을 하지 않는다. 사람의 과학 검토는 수행한 것으로 표시하지 않는다.
- S22는 사용자 review gate가 아니다. 승인 목록 `[7,9,17]`을 유지하며 다음 review는 S24다.

## commit·push 증거

아직 checkpoint commit/push 없음. 구현 checkpoint를 검증·push하고 정확한 원격 hash를 확인한 뒤에만 다음 checkpoint로 진행한다. 최종 status push 전에는 완료가 아니다.
