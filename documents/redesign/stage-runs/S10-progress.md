# S10 — 삼중진자·N중 사슬

## 기준과 범위

- 기준 HEAD / fetch 후 원격 HEAD: `4ba54ed9f52966f87f9de06e7f9a1e3bcad09ca6`, `codex/redesign`. 작업 폴더는 깨끗했다.
- S09 완료 status commit, CP0–CP3 Git history, 과정 1/Focus/Lab 및 검증·review 산출물을 확인했다. S01–S09 완료 상태와 S10 의존성을 확인했다.
- `redesign:check` 통과. fetch의 FETCH_HEAD 쓰기와 preflight의 Git subprocess는 sandbox 권한 오류 후 허용된 escalation으로 성공했다. `redesign:preflight -- 10` 통과.
- 사용자의 S10 실행 요청에 따라 S09 학습 경험 구조 승인을 기록한다. 과학 전문가 검토 완료를 의미하지 않는다.
- 목표: triple/N-chain 공용 엔진 adapter, 링크별·일괄 편집, 가변 자유도 animation/plot, worker 진행/취소/오류, 성능 안내, 저장·공유·import/export 왕복.
- 범위 밖: S11 이후 시스템/콘텐츠, 기존 앱 전환, 기존 데이터 migration, master merge/release.
- 모델 선택 UI의 실제 값은 확인할 수 없으며 지정된 실행 프로필을 전제로 진행한다.

## 보존 경계

기존 `app.html`, `src/physics`, `chaos`, `research`, `runtime`, `workers`, `validation`, 공개 API, legacy preset/import/export, 사용자 데이터, S03 canonical 계약, S07/S09 경로, S01 golden을 보존한다. 새 product adapter/worker가 기존 엔진을 호출하며 운동방정식을 복제하지 않는다.

## Checkpoint

| ID | 작업 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록·S09 구조 승인 | plan, preflight, dependency/history | 원격 확인 완료 |
| CP1 | triple/N-chain 계약·수치 adapter·편집·worker | N 경계, parity/golden, round trip, 취소/오류, typecheck | 원격 확인 완료 |
| CP2 | Lab 연결·링크 도구·가변 표시·파일·사용자 여정 | unit, production build, desktop/mobile, keyboard/axe/320px/zoom, 시각 | 검증 완료·push 준비 |
| CP3 | 통합 검증·보존·성능·결과 기록 | 전체 Vitest, 관련 E+U, catalog/inventory, diff | 대기 |
| STATUS | 별도 완료 상태 commit/push | 구현 원격 존재와 최종 검사·원격 hash | 대기 |

예정 경로: `src/product/adapters/physics/chain*`, product worker/model, `src/product/lab/views/chain*`, product app route/catalog, `css/product`, `tests/product`, `e2e/redesign`, `documents/redesign/stage-runs/S10*`와 S10 보고.

## 위험·검증·원격 증거

- 기존 보안 기준선의 미해결 npm/CodeQL/GitHub 경고는 이번 단계에서 해결 또는 위험 수용을 주장하지 않는다. 의존성 변경은 예정하지 않는다.
- N-chain 기존 dense solver의 지원 범위는 1–128이다. 큰 N의 비용·메모리를 제한하고 worker로 실행하며, resize 시 각도/각속도 배열의 대응을 따로 보존해야 한다.
- 진행 중. 구현 push 전에 완료 필드를 바꾸지 않는다.
- CP0 `67c7b410852deb0e73019d88d1f31cfe28c2d705` commit/push 성공. ls-remote 동일 hash 확인. GitHub 기본 브랜치 취약점 집계 high7/moderate3가 출력됐으며 해결을 주장하지 않는다.
- 병렬 agent 3개가 계정 사용량 한도로 중단되었다. 생성 파일을 확인하고 주 실행 세션에서 구현·검증을 이어갔다. 모델을 변경하지 않았다.
- CP1: 기존 `rhsTriple`/`energyTriple`, `rhsChain`/`energyChain`을 실행별 workspace로 호출. N=1–128 전수 validation/한 단계/왕복, 3종 적분기 parity, N=1 해석식, triple와 chain N=3 동등성, legacy cascade preset 보존, 추가/중간삭제/bulk/resize 대응을 검사했다.
- 새 canonical 모델/적분기 버전과 masses/lengths/theta/omega SI 벡터는 S03 계약을 그대로 사용한다. 새 저장 prefix는 `pendulum-product/chain/v1/`; 손상·미래 데이터는 읽기와 쓰기 모두 원본 보존한다.
- worker는 요청당 최대64단계/8ms 경계, 한 요청만 전송 중, 타임아웃15초, 최대2001개 기록 표본, 초기·현재/최종 표본을 보존한다. 취소/실패/reset/dispose는 worker를 종료하며 pause는 같은 worker 상태를 유지한다. 한 물리 단계 자체는 분할 불가하나 terminate로 취소 가능하다.
- 초기 physics 테스트는 존재하지 않는 matcher와 legacy 필드 이름을 사용한 test 작성 오류로 실패했다. 이를 수정한 뒤 신규193/193 통과; 기존 product/adapters/lab 및 n-pendulum/chain-hardening/S01 golden 포함 CP1 회귀355/355 통과(실패·skip0). 초기 보고서 `tmp/S10-physics-first.json` 보존. TypeScript 메시지 fixture 캐스팅 오류도 수정 후 전체 typecheck와 scoped ESLint 통과했다.
- CP1 production build/public artifact audit와 catalog134개 검사 통과. CP2 UI는 작성 중이며 사용자 여정과 시각 검증은 아직 완료되지 않았다. CP1 보고서 `tmp/S10-CP1-regression.json`.
- CP1 `79538237e7e4ce90699b06b6353b8d7d2da55df3` commit/push 성공, ls-remote 동일 hash 확인.
- CP2: triple/chain lazy route, 선택 링크·중간 추가/삭제·N 변경·일괄 편집, 전체 링크 animation/수치 표, 선택 링크 시간/위상과 전체 에너지 그래프, 독립 저장·JSON/CSV/SVG·공유 왕복을 연결했다. 화면 이탈은 worker를 종료하고 설정만 보존한다.
- CP2 targeted358/358, 전체 Vitest2676/2676(265파일), production 새 경로/기존 Lab 40/40 통과. 실패·skip·flaky0. 기존2480개 단위 사례는 Date 표시 문자열만 정규화한 다중집합 비교로 모두 보존됐다. 신규196개 추가.
- 12개 새 S10 desktop/mobile 이미지를 직접 검사했다. 기본각 숫자 노이즈를 정리하고 실제 dark theme로 캡처했으며 좁은 화면에도 HTML 범례·단위·범위를 표시했다. 수정 전 이미지는 `tmp/S10-visual-before`에 보존했다. 기존 단계 이미지는 수정하지 않았다. 시각 갱신6/6 후 기준 고정40/40 통과.
- typecheck, scoped ESLint, production build와 공개 산출물 검사(텍스트22·binary1), plan/catalog134/Learn8과정86경로8공개/inventory883·broken0·orphan0 통과. 기존 엔진·계약·저장·lockfile·S01 golden 경로의 기준 S09 대비 diff는 비어 있다.
- N128 성능은 이 기기 Node 측정에서 RK4 50단계 중앙값1.65ms/최대2.64ms였으며 브라우저 FPS나 다른 기기 성능 보장이 아니다. 브라우저 첫 표본·취소 시간은 E2E 첨부로 보존했다.
- 2026-09-16 재개 시 fetch 후 로컬/원격 모두 CP1 hash임을 확인했다. 미커밋 파일은 중단 전 S10 구현과 일치하고 무관한 사용자 변경은 없다. 최종 검증은 모든 구현·문서 checkpoint push 뒤 별도로 실행한다.
