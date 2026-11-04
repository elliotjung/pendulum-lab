# S26 — 교육과정 4~5 제작

## 시작과 범위

- 기준 로컬/원격 HEAD: `04c770e3b1af185fda11748dbb1940adf328a9db`.
- Git으로 저장소 루트와 `codex/redesign`/`origin/codex/redesign`을 확인했다. 깨끗한 작업 폴더에서 fetch 후 HEAD가 일치했다.
- 권위 문서 6개와 AGENTS.md를 읽었다. plan check 통과. sandbox의 Git spawn EPERM 후 동일 preflight26을 확장 권한으로 실행해 통과했다.
- status의 S01~S25 연속 완료, 각 status Git 이력, S25 검증/보존 산출물, S13~14 및 S18~19 실제 adapter를 확인한다.
- 목표: 4.1~4.10, 5.1~5.13의 이론·유도·예측/관찰·Focus·checkpoint·출처·정확한 Lab 전달 23개 단원.
- 범위 밖: S27 이후 콘텐츠, 엔진 재작성, 전체 migration/parity, app.html 전환, master merge/tag/release, Landing 수정.
- 모델 선택 UI는 런타임에서 확인할 수 없다. 선택 변경이나 검증을 주장하지 않는다.

## 보존 계약

physics/chaos/research/runtime/workers/validation, 기존 product adapter, public API, app.html, package/lockfile, 저장/공유 형식, 기존 콘텐츠와 수치 golden을 보존한다. 새 실험은 실제 공용 engine/analysis를 호출한다. canonical에 지원하지 않는 진단 설정을 삽입하지 않고 별도 비교 설정은 보고서에 명시한다. 과학 사람 검토를 생성하지 않는다.

## 내부 checkpoint

1. CP0: 진행 기록과 active26/CP0. next26/완료1..25 유지. plan 검사, commit/push.
2. CP1: 공통 제한 입력·worker·결과·session·Lab 전달·접근성 화면. 정상/경계/악성/취소 검증 및 기존 Focus 회귀.
3. CP2: 과정4의 10개 단원과 실제 비선형/제어 실험. known-regime fixture, 전수 콘텐츠/route/transfer, typecheck/build 후 commit/push.
4. CP3: 과정5의 13개 단원과 실제 핵심/고급 카오스 실험. synthetic/known-regime·sampling/threshold 실패 fixture와 전수 여정 후 commit/push.
5. CP4: 고정 source 전체 Vitest/golden, typecheck/lint/format/build, plan/catalog/Learn/inventory, desktop/mobile/keyboard/axe/시각, 보존·전달본 해시. 검증 증거 commit/push.
6. 별도 status: 모든 구현 원격 확인 및 필수 검증 성공 후 lastCompleted26/next27, active null을 commit/push. 실제 원격 hash 확인 전 완료 아님.

## 변경 예정 경로

`content/learn/course-4/`, `content/learn/course-5/`, modules/curriculum metadata, 새 research/nonlinear/chaos Focus 및 authoring helper, Learn schema/validation/mount, 관련 tests/E2E/CSS, S26 문서/증거/status. 기존 테스트 metadata와 공개 과정 목록 시각 변화는 의도한 변경만 검토한다.

## 진행과 위험

- 현재 CP0. 이후 검증·commit·push 증거를 추가한다.
- 유한시간 지표를 엄밀한 카오스 판정이나 UPO 안정화 증명으로 표현하지 않는다. 좌표/시간/에너지 단위와 tangent·sampling·threshold 한계를 각각 표시한다.
- source-checked와 automated-verified는 실제 출처 대조 및 fixture 뒤에만 완료로 판단한다. human-reviewed는 미완료다.
- 기존 dependency/CodeQL 부채는 S30 판정 범위이며 이번 단계가 새 보안 감사나 위험 수락을 의미하지 않는다.
