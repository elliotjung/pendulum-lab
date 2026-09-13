# S09 — 과정 1과 Focus Experiment 왕복

## 기준과 범위

- 시작/원격 HEAD: `d21bc5b0a3a6a9f47f720e125b5e0f6484b3e862` (`codex/redesign`). 깨끗한 작업 폴더, fetch 후 일치 확인.
- S08 status commit과 CP0–CP3 history 및 Learn schema/loader/views/progress/test 산출물 확인. S07 adapter와 수치 검증 산출물 존재.
- `redesign:check` 통과. `redesign:preflight -- 9`는 sandbox의 Git subprocess EPERM 뒤 허용된 실행에서 통과.
- 목표: 1.1–1.8 완성, 선언형 전용 실험, S07 공용 엔진 재사용, canonical 설정과 출처 단원의 Lab 전달/복귀 보존.
- 범위 밖: S10 이후 시스템/과정, app.html 전환, master merge/release, 기존 데이터 migration.
- 모델 선택 UI는 런타임에서 확인하지 못했으며 사용자의 지정 프로필을 전제로 진행한다.

## 보존 경계

기존 app.html, physics/chaos/research/runtime/workers/validation, 공개 API, 기존 저장/공유 계약과 사용자 데이터, S01 golden 및 인벤토리를 보존한다. 교육용 운동방정식을 중복 구현하지 않는다. 진도는 기능 권한과 분리한다. 과학 자동/출처/사람 검토를 구분하고 사람 검토를 주장하지 않는다.

## Checkpoint

| ID | 작업 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록과 activeStage | plan check, preflight | 원격 확인 완료 |
| CP1 | 8단원 계약/콘텐츠 + Focus 수치 모델/fixture | Learn schema, 관련 Vitest, typecheck, 출처 대조 | 원격 확인 완료 |
| CP2 | 접근 가능한 Focus UI와 Lab 왕복, 브라우저 여정 | 관련 unit/E2E, keyboard/mobile/axe/시각, build | 원격 확인 완료 |
| CP3 | 통합 검증·보존·검토 보고 | 전체 Vitest, required E+U, inventory/golden/secret, diff | candidate-complete·최종 검증 대기 |
| STATUS | 검증 후 완료 필드와 원격 확정 | 별도 status push/remote hash | 대기 |

예정 경로: content/learn/course-1, curriculum/modules; src/product/learn; src/product/experiments; 최소 product physics 진단 adapter; Lab 출처 연결; css/product; tests/product; e2e/redesign; documents/redesign/stage-runs 및 S09 검토 보고.

## 검증·위험·원격 증거

- 구현은 candidate-complete이며, 모든 구현·검토 문서 원격 확인 후 최종 필수 검증과 별도 status push가 남아 있다. 사용자·과학 전문가 검토 완료를 주장하지 않는다.
- 기존 보안 보고(S01 npm/CodeQL, S08 별도 Dependabot 집계)는 미해결 기준선이며 이번 단계는 의존성 변경을 포함하지 않는다.
- CP0 `2c933808c4d2fa823b4bfdee3800e6adb7805076` push 성공. `git ls-remote origin refs/heads/codex/redesign`가 같은 hash를 반환했다.
- 재개(2026-09-14): fetch 후 CP0 로컬/원격 일치. 모든 미커밋 파일은 이 S09 구현으로 확인했다.
- 일부 초기 테스트/빌드 실행이 sandbox EPERM 또는 자동 승인 검토 사용량 한도로 차단되었다. 이후 동일 승인 경로의 콘텐츠 테스트 성공을 확인하고 재시도했으며, 아래 검증은 실제 실행 성공 결과다. 차단을 우회하지 않았다.
- CP1: 1.1–1.8 콘텐츠 및 schema, S07 simulation 재사용, 20초/20,000단계/801표본 제한, atomic setFields, 결정론·취소·오류·원본 보존 구현. source-checked 8/8, human-reviewed 0/8. 출처·좌표·영점 대조는 `S09-source-review.md` 참조.
- `npm test -- tests/product/learn tests/product/experiments tests/product/adapters tests/characterization/numerical-golden.test.ts --reporter=json --outputFile=tmp/S09-CP1-vitest.json` 통과. 콘텐츠 품질 26, 기존 콘텐츠/loader 89, progress 82, Focus runtime 29, 과학 12 및 기존 adapter/worker/golden/transfer 검증 포함. 자세한 수치는 최종 verification에 기록한다.
- CP1 전체 typecheck, plan check, production build 및 public artifact audit 통과. CP2 UI/시각/browser 여정과 전체 회귀는 아직 진행 중이다.
- CP1 `abe233fc11180275cdf50036e04e9a1422e01898` commit/push 성공; ls-remote 동일 hash 확인. 관련 검증은 10파일 332/332, skipped/failed 0 (report SHA-256 `faf4901ab13877088813e7fd18d4f18202593c8261a8af0cb1b6146c0c1e9186`).
- 전체 Vitest 262파일 2,480/2,480 통과 (S08 2,403개에서 77개 추가). typecheck와 관련 ESLint 통과. inventory 883파일/깨진 import 0/orphan 0, catalog 134개, Learn 지도 8과정/86예약·과정1 8개 공개 확인.
- CP2: 단원별 그래프·수치·고정조건·관찰 설명, 늦은 chunk 취소, 실행/입력/저장 오류, 단원 provenance와 Lab 왕복 연결. 구성공간 점은 고정 주기 축, 유도 항 선택은 같은 탭 복귀 시 보존, 계산 중 live 수치 발표는 끔.
- 초기 production smoke 4/5 통과, 오류 주입 fixture 1개 실패. capture listener 사이 microtask 복원으로 실제 handler가 오류를 못 만났으며 다음 task로 복원을 이동했다. 실패 report/trace/video는 `tmp/S09-prod-smoke-*`에 보존했고, 수정된 오류·복구 테스트는 전체 production 실행에서 통과했다. assertion을 제거하지 않았다.
- 첫 production desktop/mobile Learn+Focus 실행은 84개 중 74통과, 10실패였다. 8개는 새 S09 PNG 기준 부재로 실제 화면을 기록한 경우이며, 2개는 S08의 선수 개념 제목을 찾던 테스트였다. 제목을 실제 S09 콘텐츠에 맞췄으며 키보드·접근성 assertion은 유지했다. 원본 report/trace/video는 `tmp/S09-prod-learn-*`에 보존했다.
- 새 Learn 12장과 Focus 12장을 직접 시각 검토했다. Focus 1.8 축 눈금 겹침을 지수 표기로 수정하고, 모바일에서 작아지는 제목·범례·축 범위를 본문 크기 HTML로 제공했다. 실선·파선·점선으로 구별하며 기존 Lab의 기본 plot과 이전 단계 PNG는 유지한다. 변경 전 S09 PNG는 `tmp/S09-visual-before`에 보존했다. 갱신 후 새 기준을 고정한 재검증을 진행한다.
- S08 보고와 비교: 기존 257파일 2,315개 이름은 동일하다. content test의 Date/전체 단원 인자와 출판 상태 변경을 정규화하면 기존 2,403개 모두 보존된다. 신규 runtime 29/science 12/transfer 9/품질 26/sourceChecked 거부 1, 합계 77개다. 파일·분야 삭제나 누락은 없다.
- CP2 최종 targeted 검증: 새 시각 기준/키보드 12/12, 기준을 변경하지 않는 frozen 시각 8/8 통과. 초기 실행과 회복을 합쳐 84개 고유 Learn/Focus 여정 모두 최종 통과이며, 단일 84개 clean run으로 표시하지 않는다. 수정된 Focus 8장과 Learn 1.1 4장을 다시 직접 읽어 두 시각 결함 해소를 확인했다. typecheck/scoped ESLint/production build/public artifact audit도 통과했다. 원격 구현 후 전체 필수 검증을 다시 수행한다.
- CP2 `a2e0af0cedc88844e77468bc69b42b9601e6e964` commit/push 성공. `git ls-remote origin refs/heads/codex/redesign`와 일치한다. 스캔은 추적된 CP2 파일까지 포함하며 자격증명 패턴 발견 0이다. 별도 GitHub 기본 브랜치 집계는 high 7/moderate 3이며 해결이나 위험 수용을 주장하지 않는다.
- CP3 산출물은 `course-one-focus-ko.md`의 사용자 review checklist와 `S09-verification.json`의 실제 report hash·실패/회복·수치/보존 증거다. S09 사용자 승인은 아직 없으며 `approvedReviewGates`는 [7]을 유지한다. 원격 CP3 후 전체 Vitest와 production Learn/Focus 및 기존 core/Lab/shell의 160개 여정을 고정된 소스로 최종 실행한다.
