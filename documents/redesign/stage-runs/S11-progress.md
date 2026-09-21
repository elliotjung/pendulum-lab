# S11 — 용수철·줄·이중 줄 진자

## 기준과 범위

- 기준 HEAD와 fetch 후 origin/codex/redesign: `73b7773c5ae9b00c00aecfb899937a53af1b8acf`. 작업 폴더는 깨끗했다.
- S01–S10 완료 상태, S10 구현/상태 Git history, progress·verification·triple-chain 보고서와 실제 adapter/worker/UI/test 산출물을 확인했다. S07/S09 승인 기록은 유지한다.
- `npm run redesign:check`, `npm run redesign:preflight -- 11` 통과. FETCH_HEAD 쓰기와 esbuild 하위 프로세스 권한 오류는 허용된 escalation 뒤 성공했다.
- 목표: spring/rope/double-string 공용 엔진 연결, 길이·장력·taut/slack 상태·사건 timeline, 구속 경고, 사건 초기화 preset, canonical 저장/공유와 데이터 export.
- 범위 밖: S12 이후 시스템/콘텐츠, legacy migration, 기본 앱 전환, master merge/release.
- 모델 선택 UI의 실제 값은 확인할 수 없으며 지정 실행 프로필을 전제로 진행한다.

## 보존 경계

기존 `app.html`, `src/physics`, `src/chaos`, `src/research`, `src/runtime`, `src/workers`, `src/validation`, 공개 API, legacy preset/import/export, lockfile, 사용자 저장 데이터, S03 계약과 S01 golden은 보존한다. 새 product adapter가 기존 엔진을 호출한다. 줄의 충돌 손실과 느슨한 구간을 강체 보존 오차로 오인하지 않도록 구분한다.

## Checkpoint

| ID | 작업 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 범위·보존·진행 기록 | plan, preflight, 선행 산출물/history | 원격 보존 `3adc45f` |
| CP1 | 공용 엔진 adapter·canonical·worker·모델·저장 | 수치 parity/golden, 사건 순서/유한성/에너지·구속, 왕복, 취소/오류, typecheck | 원격 보존 `f63fa06` |
| CP2 | 세 시스템 Lab UI·길이/장력/사건·export | unit, build, desktop/mobile, keyboard/axe/320px/zoom, 시각 | 54/54 통과, push 준비 |
| CP3 | 독립 검토·증거 문서·통합 검증 | 전체 Vitest, E+U, catalog/inventory, 보존 diff | 예정 |
| STATUS | 별도 완료 상태 commit/push | 모든 구현 원격 존재, 최종 필수 검사, 원격 hash | 예정 |

예정 변경 경로: `src/product/adapters/physics/constraint*`, `src/product/lab/views/constraint*`, product route/catalog, `css/product/`, `tests/product/`, `e2e/redesign/constraint*`, 본 진행 기록과 S11 보고서.

## 위험과 판단

- 기존 줄 엔진의 사건 검출·포획 모델 한계를 조사하고 공개한다. 운동방정식을 복제하거나 기존 golden을 재생성하지 않는다.
- 줄은 전용 hybrid stepper만 사용하며 강체 tangent 분석은 제공하지 않는다. 초기조건 저장과 실행 도중 hybrid 상태의 재개를 혼동하지 않는다.
- worker 계산·결과 표본·사건 기록은 제한한다. 취소/오류는 실제 worker를 종료하며 원본 설정을 보존한다.
- 기존 보안 기준선의 npm/CodeQL/GitHub 경고는 해결 또는 위험 수용으로 표시하지 않는다. 사람의 과학 검토를 주장하지 않는다.
- 진행 중이며 구현 push 전에는 완료 필드를 바꾸지 않는다.

## 2026-09-17 동일 단계 재개

- `git fetch origin codex/redesign` 후 로컬과 원격은 모두 `3adc45fc049ee4efc9a2f794718a5f77605a0f3a`다. CP0 원격 존재를 확인했다.
- 미커밋 18개 경로는 CP0가 명시한 constraint adapter/worker/model/storage/UI/E2E 및 해당 route·라이브러리 연결이다. 기존 엔진이나 사용자 자료에 무관한 변경은 없다. 이를 직전 미완료 S11 작업으로 확인해 그대로 이어간다. stash/reset/restore/삭제를 하지 않았다.
- 계획 검사는 재통과했다. 재개 시 preflight 재실행은 첫 시도에서 sandbox Git subprocess EPERM, 허용 실행에서는 보존 중인 S11 미커밋 파일 때문에 clean-worktree gate에서 실패했다. 새 단계 진입으로 처리하지 않으며, 위의 최초 clean preflight 통과 기록과 CP0/activeStage=11을 근거로 동일 단계 checkpoint를 복구한다. 검증한 변경을 commit/push한 뒤 clean preflight를 다시 실행한다.
- 최초 재개 typecheck는 사건 link의 union 추론과 누락된 `constraint-presets.ts` 때문에 실패했다. 해당 미완성 부분과 재개 중 발견한 UI 입력 범위·단위·빈 사건 export 테스트를 고친 뒤 다시 검증한다.
- 바탕화면 전달용 두 문서 SHA-256은 저장소 원본과 일치한다. 원본 로드맵/실행 계획을 수정하지 않았다.

## 2026-09-18 동일 단계 계속

- 사용자 `계속` 요청으로 S11을 이어갔다. 새 fetch 후에도 로컬/원격 CP0 `3adc45f` 일치를 확인했다. 전날 작업 파일은 그대로 보존했다.
- 누락된 preset 모듈과 사건 타입 오류 수정 후 타입 검사가 통과했다. 초기 worker/저장/기존 줄/이중 줄/S01 golden 검증은 5파일 62/62 통과했다 (`tmp/S11-initial-targeted.json`). 최종 전체 검증으로 간주하지 않는다.
- 초기 프리셋 출처에 필수 `parentExperimentIds`가 빠져 화면 초기화를 막는 문제를 발견해 수정했다. canonical 입력값과 Inspector 허용 범위, 이중 줄 감쇠 단위, 빈 사건 export 테스트를 함께 검증한다.
- 원래 이중 줄 엔진의 full-slack 재포획에서 에너지 증가와 길이 위반이 발생한다. 원 엔진과의 수치 비교로 기존 한계임을 확인하고, 해당 순간의 경고·fixture·사용자 문서에 기록한다.

## CP1 검증 — 2026-09-21

- fetch 후 CP0 원격 일치를 재확인했다. 9월 18일 사용량 한도로 자동 승인 검토가 완료되지 않아 소스 정책 명령이 실행되지 않았으며, 이번 재개에서 정상 실행했다. 제한을 우회하거나 모델을 바꾸지 않았다.
- `tmp/S11-numerical-targeted.json`: 5파일 96/96 통과 (adapter 50, worker/model 21, 기존 줄 8, 기존 이중 줄 4, S01 golden 13), skip/todo 0. 원 엔진 step별 parity, spring 해석 해, rope 실제 장력 0 교차/포획 에너지 수지, double 세 모드·사건 순서·유한성·반복 재현, canonical/share/provenance, malformed 입력, worker 취소/실패/표본 제한을 검증했다.
- `tmp/S11-storage-catalog.json`: 6파일 85/85 통과 (저장 20, 카탈로그 65), skip/todo 0. 기존 저장 보존, 범위 경계, 단위, 악성·손상·대형 입력과 CSV 검증을 포함한다.
- 타입 검사, 변경 TypeScript의 scoped ESLint, 소스 정책 검사 987파일, 계획 검사, production build와 공개 산출물 검사(22 text/1 binary skip)가 통과했다.
- 첫 새 수치 테스트 95/96에서 용수철 복원력 때문에 원점에 도달하지 않는 fixture가 실패했다. `k=0,g=0` 순수 방사 운동으로 목적에 맞게 고쳤고, typecheck의 tuple spread 오류도 수정했다. 기존 golden과 기존 테스트는 바꾸지 않았다.
- 이중 줄 full-slack 예제 `[2.5,2.5,0,0]`, dt=0.002s, 2s에서 최대 길이 위반 0.4352688973m, 바깥 줄 포획의 에너지 증가 5.3233191174J를 원 엔진과 대조해 고정했다. 엔진을 보정하지 않고 순간 경고와 상시 한계 설명을 제공한다.
- 독립 read-only 검토에서 invalid draft 복구, revision 기반 cache, session/storage 격리, worker 종료, CSV/SVG에 새 P0–P2 결함을 찾지 못했다. 자동 코드 검토이며 전문가 검토를 뜻하지 않는다.
- CP1 commit `f63fa0670406849b0796aea37c82ec047f0d92b5` push 성공, `git ls-remote origin refs/heads/codex/redesign`가 동일한 hash를 반환했다. 완료 목록/nextStage는 여전히 S10/11이다.
- push가 알린 기존 default branch 취약점은 high7/moderate3이다. 기존 npm/CodeQL 기준선과 별도 집계이며 이번 변경에서 해결 또는 위험 수용하지 않았다.

## CP2 화면 검증

- 세 새 라우트의 설정·실행·분석·저장·공유·가져오기·CSV/SVG·사건 프리셋을 연결했다. invalid draft를 JSON/보관함/초기화로 복구하고, 같은 step에서 초기조건을 바꿔도 plot/event revision을 갱신한다.
- 첫 production 검사 `tmp/S11-browser-baseline.json`은 기능 50개 통과, 새 시각 기준 이미지가 없던 4개 시각 사례 실패로 기록됐다. 기존 이미지 불일치는 없었다. `--update-snapshots=missing`과 CI 조합에서 새 이미지는 생성됐지만 해당 사례가 실패로 남은 것이며 성공으로 계산하지 않는다.
- sandbox Playwright 시작 EPERM은 허용된 실행으로 해결했다 (`tmp/S11-browser-launch-error.json`). 하위 검토 작업이 사용량 제한으로 중단된 뒤에도 이미 실행 중이던 테스트는 끝까지 완료됐으며 root가 결과와 화면을 직접 검토했다.
- 직접 검토에서 공용 flex 스타일이 `hidden`을 덮어써 빈 사건 타임라인에 페이지 버튼이 보이는 결함을 발견했다. constraint 화면 범위에 `hidden` 우선 규칙을 추가하고 빈 타임라인 확인을 세 시스템 여정에 넣었다. 사용자에게 의미가 없는 실행 구현명은 표본 안내에서 제외했다.
- 해당 화면 수정 뒤 **이번 S11 신규** constraint 이미지 8장만 다시 생성했다 (`tmp/S11-visual-update.json`, 2/2). 새 라이브러리 2장과 합계 10장을 root가 직접 확인했다. 기존 단계 이미지의 수정은 0이다.
- 새 최종 build, typecheck, scoped lint/format 검사를 통과했다. `tmp/S11-CP2-playwright.json`에서 54/54 통과, 실패/skip/flaky 0, retries 0, frozen 시각 비교도 통과했다. 실제 물리 특이점 실패 후 마지막 유효 t=0.05s 보존·CSV와 preset 복구를 포함한다.
