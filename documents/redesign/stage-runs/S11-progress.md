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
| CP0 | 범위·보존·진행 기록 | plan, preflight, 선행 산출물/history | 준비 완료 |
| CP1 | 공용 엔진 adapter·canonical·worker·모델·저장 | 수치 parity/golden, 사건 순서/유한성/에너지·구속, 왕복, 취소/오류, typecheck | 예정 |
| CP2 | 세 시스템 Lab UI·길이/장력/사건·export | unit, build, desktop/mobile, keyboard/axe/320px/zoom, 시각 | 예정 |
| CP3 | 독립 검토·증거 문서·통합 검증 | 전체 Vitest, E+U, catalog/inventory, 보존 diff | 예정 |
| STATUS | 별도 완료 상태 commit/push | 모든 구현 원격 존재, 최종 필수 검사, 원격 hash | 예정 |

예정 변경 경로: `src/product/adapters/physics/constraint*`, `src/product/lab/views/constraint*`, product route/catalog, `css/product/`, `tests/product/`, `e2e/redesign/constraint*`, 본 진행 기록과 S11 보고서.

## 위험과 판단

- 기존 줄 엔진의 사건 검출·포획 모델 한계를 조사하고 공개한다. 운동방정식을 복제하거나 기존 golden을 재생성하지 않는다.
- 줄은 전용 hybrid stepper만 사용하며 강체 tangent 분석은 제공하지 않는다. 초기조건 저장과 실행 도중 hybrid 상태의 재개를 혼동하지 않는다.
- worker 계산·결과 표본·사건 기록은 제한한다. 취소/오류는 실제 worker를 종료하며 원본 설정을 보존한다.
- 기존 보안 기준선의 npm/CodeQL/GitHub 경고는 해결 또는 위험 수용으로 표시하지 않는다. 사람의 과학 검토를 주장하지 않는다.
- 진행 중이며 구현 push 전에는 완료 필드를 바꾸지 않는다.
