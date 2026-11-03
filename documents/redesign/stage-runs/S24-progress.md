# S24 — 연구 프로젝트·run·artifact·내보내기

## 기준과 범위

- 기준 local/remote HEAD: `e6aa7094229e26527b02ceeeeb0cb7e6c01b38a3`, branch `codex/redesign`, upstream `origin/codex/redesign`.
- clean worktree, fetch와 정확한 HEAD 일치, redesign:check 및 redesign:preflight -- 24 통과. sandbox Git metadata 쓰기와 Git 하위 프로세스 EPERM은 동일 명령의 확장 권한 실행으로 해결했다.
- 선행 S23의 원격 status commit e6aa709, 구현 CP0/CP1-E/CP1-L/CP2/CP3, progress/verification/preservation 파일과 연속 완료 목록 1..23을 확인했다.
- 목표: 기존 계산·결과 파일을 project/session/run/artifact로 연결하고 narrative notebook, 출처가 있는 figure, report, versioned/checksummed ZIP과 offline reviewer를 제공한다. 기존 research ZIP은 호환 adapter로 원본을 보존한다.
- 범위 밖: S25 이후 교육 콘텐츠, S28 전체 migration/parity 인증, 기본 app 전환, master merge/tag/release.
- 보존: app.html; src/physics, chaos, research, runtime, workers, validation; 기존 physics adapters/공개 API/저장 및 공유 schema; 사용자 데이터; package/lockfile; 기존 test/fixture/PNG.
- UI 모델 선택값은 runtime에 노출되지 않는다. 사용자의 선택을 전제로 진행하며 모델 변경·검증을 주장하지 않는다.

## 내부 checkpoint

| ID | 내용 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 범위·보존·진행 기록 | plan/preflight24/typecheck | 진행 |
| CP1 | 엄격한 계층·ZIP·checksum·legacy 호환 계약 | 정상/경계/손상/unsafe path/round trip, typecheck | 대기 |
| CP2 | lazy 연구 workspace·notebook·figure·report·offline reviewer | component/production desktop/mobile/keyboard/a11y/visual, build | 대기 |
| CP3 | 통합 회귀·보존·재현 패키지 및 review 증거 | 전체 Vitest/golden/품질 검사/보존 hash | 대기 |
| STATUS | 별도 완료 상태 commit | 구현 원격 확인 후 status push 및 정확한 remote HEAD | 대기 |

예정 경로: src/product/provenance/, src/product/lab/projects/, diagnostics 연결, src/reviewer/의 연구 package mode, 전용 CSS, tests/product/provenance/, e2e/redesign/research-project*, scripts/redesign/의 검증·샘플 생성, S24 문서/검증/재현 패키지. 명시적 경로만 stage한다.

## 위험과 검토

- ZIP은 원본과 checksum manifest를 모두 검증한다. 체크섬은 무결성 증거이며 출처 진위나 과학적 정확성을 인증하지 않는다.
- 파일/프로젝트는 크기·개수·깊이 상한, unsafe path, 중복 ID/path, prototype key, malformed schema와 누락 artifact를 검사한다. 외부 HTML/SVG/script를 실행하지 않는다.
- 현재 설정과 실제 기록 표본을 클릭 시점에 복사하고 결과 파일의 원본 lineage를 보존한다. 그림은 원 run/artifact·축·단위를 추적한다.
- 새 프로젝트 저장은 별도 versioned key/파일을 사용한다. 기존 저장/공유와 원본을 덮어쓰지 않는다.
- 사용자 승인 gate [7,9,17] 유지. S24 연구 워크플로 checklist를 종료 보고에 제공하며 다음 단계 요청 전에는 승인으로 표시하지 않는다. 사람의 과학 검토를 수행한 것으로 표시하지 않는다.
- 기존 S01 dependency/CodeQL 보안 부채는 해결 또는 수락으로 표시하지 않는다.

## 실행 증거

- CP0 사전 검사: redesign:check exit0, preflight24 exit0. 기준 두 HEAD가 일치한다.

- CP0: typecheck exit0, plan check exit0, diff check 통과. 완료 목록·nextStage는 유지하며 activeStage24/CP0만 갱신한다.
