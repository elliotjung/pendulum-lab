# S20 안정성·분기 워크플로 실행 기록

## 기준·범위·보존

- 기준 local/remote HEAD: 6589ef60beaa7cedb2cd96bb4ac6ea5513327429. clean tree, codex/redesign 및 upstream 일치, fetch와 redesign:check/preflight -- 20 통과.
- authoritative 여섯 문서 전체와 S19 status/history/검증 기록을 확인했다. S01–S19 연속 완료, 승인 review gates [7,9,17]. 모델 selector는 노출되지 않아 사용자 선택 기록을 전제로 진행한다.
- S20만 실행: fixed point, periodic shooting, Floquet, Melnikov, continuation, pseudo-arclength, branch switching, Neimark–Sacker, torus, Arnold tongue, codim-2의 기존 계산 연결·worker·workflow·저장/복원·run 계보.
- 보존: app.html, physics/chaos/research/runtime/workers/validation, 공개 API, 기존 저장/공유·사용자 데이터·수치 golden·기존 PNG·package/lockfile. 새 product adapter와 병렬 next.html의 Dock만 확장한다.
- 제외: S21 이후 queue/연구 기능/교육 콘텐츠/migration/cutover, master merge/force push/tag/release.

## checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 실행 기록·activeStage | plan/preflight/typecheck | 8e5b6589f4a1ea331657afa3c4798dc73993ff7e push·정확한 remote hash 확인 |
| CP1 | 기존 수치 모듈 adapter·안전 계약·worker·artifact | normal form/native parity, 경계/실패/restart/cancel, typecheck | 7c66151ca1bd9b41fd3bc98142075a856d03cd43 push·정확한 remote hash 확인; targeted607/607·25파일, typecheck·scoped ESLint 통과 |
| CP2 | lazy workflow·초기 추정·수렴 기록·branch graph·파일 왕복 | component, desktop/mobile keyboard/axe/visual, build | 검증 통과·commit/push 준비 |
| CP3 | 전체 회귀·수치/보존/검증 보고서 | 전체 Vitest, E/U, 품질·보존 검사 | 대기 |
| STATUS | 구현 원격 확인 후 완료 metadata | 별도 commit/push·정확한 remote hash | 대기 |

예정 경로: src/product/adapters/analysis/stability/, src/product/lab/views/stability*, css/product/stability*, catalog의 기존 안정성 정의, tests/product/, e2e/redesign/, scripts/redesign/, documents/redesign/.

## 발견한 수치 한계와 대응

- 기존 fixed-point classifier는 return-map multiplier용이다. ODE Jacobian 고유값을 직접 넣지 않는다.
- 구동 위상/시계 좌표가 증가하는 확장 ODE는 일반 평형점으로 풀지 않는다. 실제 driven strobe와 명시적으로 이름 붙인 독립 normal form을 구분한다.
- 기존 continuation step=0 무한 반복을 입력 검증으로 막고, 잘린 branch·비수렴·실패 격자를 성공/중립으로 표시하지 않는다.
- 양의 감쇠 driven 2D strobe에서 복소 multiplier의 modulus 제약을 무시한 NS를 만들지 않는다. benchmark와 현재 모델의 과학적 의미를 표시한다.
- native solver가 제공하지 않는 Newton 내부 진행률/잔차 이력을 꾸며내지 않는다. 실제 평가/해결 단계의 잔차와 종료 상태를 기록한다.
- Git 쓰기·esbuild 하위 프로세스의 sandbox 제한은 같은 명령의 확장 권한 실행으로 해결했다.

## commit·push 증거

각 checkpoint의 검증 후 명시적 경로만 stage하고 origin/codex/redesign으로 push한다. 정확한 원격 hash를 확인하기 전에는 완료로 표시하지 않는다.

## CP1 검증과 수치 연결

- 35 canonical 시스템 × 11 도구 = 385조합에서 실제 계산·artifact 왕복 또는 설명 가능한 거부를 검사했다. 기존 카탈로그 정의는 정확히 13개다.
- 기존 shooting/Floquet/linear Floquet/Melnikov/주기궤도 DB/분기 탐지/arclength/주기배가/NS/torus/circle map/codim 계산을 재사용한다. phase0 전용 continuation scanner 대신 동일 native shooting을 실제 위상에서 orchestration하고 phase0 결과를 scanner와 대조했다.
- native19·독립 회귀6은 실제 product sine flow의 네 가지 위상, 고정점·Floquet·continuation parity, 실제 위상 P2, codim grid, fold 방향, ±sqrt pitchfork, NS a=2, 전체 torus 곡선·offgrid 잔차, 선형 analytic modulus와 실패·예산·getter를 검증했다.
- 원래 입력 실험 snapshot ID와 부모 artifact를 재시작/해 전달에서 보존한다. 실제 저장된 관측 run ID를 만들었다고 주장하지 않는다. S24 연구 저장 계층은 범위 밖이다.
- 최초 targeted 431/434의 세 실패는 카탈로그 개수 기대값·설명·오류 작업 ID였다. 모두 수정했고 확장 targeted607/607로 재검증했다. 두 readonly test fixture 타입 오류와 미사용 import도 수정 후 typecheck/scoped ESLint가 통과했다.
- CP2 시각 준비는 Chromium 30초 timeout 1건이 있어 완료 근거에서 제외한다. 320px/theme/zoom의 세 접근성 감사를 한 test에 묶은 흐름을 분리해 원래 timeout/retry를 유지한다. 새 PNG 4개는 직접 검사했으며 최종 회귀는 별도로 실행한다.

## CP2 구현·검증 진행

- 공용 lazy Dock에 11도구, source·단위·범위·초기 추정, 실제 잔차·branch graph/표, 파일 왕복, 취소/실패 복구와 해 전달을 연결했다. 물리 주기1 해를 Floquet·shooting·진폭 continuation으로 전달할 때 원래 실험·부모 artifact·입력 snapshot ID를 보존한다.
- 저장된 물성·실제 위상 단면·계산법 metadata를 request와 대조하는 검사를 추가했다. Melnikov의 metadata는 analytic+Simpson으로 정확히 표시한다. 외부 파일의 수치값 자체를 재계산/인증한다고 주장하지 않는다. 관련4파일417/417 통과.
- 전체 Vitest 최초4833/4833·327파일, 마지막 출처 검증 보강 후4836/4836·327파일 통과. 실패/pending/todo0. typecheck의 신규 readonly corruption fixture는 immutable copy로 수정했고 typecheck·관련 artifact18/18을 통과했다.
- production 첫 전체 browser는33pass/5fail(데스크톱/모바일의 default chaotic guess 비수렴4건, 모바일 복구·비수렴·취소를 한 test에 묶은30초timeout1건)로 완료 근거에서 제외했다. 성공 경로는 공유 가능한 안정 물리 fixture로 명시하고, 세 복구 여정을 분리했다. solver 허용오차·test timeout·retry는 바꾸지 않았다. 실패 JSON/trace/video는 tmp/s20-browser-first-artifacts와 tmp/s20-browser-final.json에 보존했다.
- 두 번째 production은41/42 통과했으나 모바일 비수렴 화면의 다운로드가 실패했다. 실제 trace에서 이전91행 결과와 실패 결과를 함께 표시할 때 implicit grid min-content가393px 화면을788px로 확장해 td가 버튼의 pointer를 가리는 문제를 확인했다. 이를 숨기는 작은 fixture나 forced click을 쓰지 않았다.
- 11월2일 재개 후 fetch한 local/remote는 같은 CP1 7c66151이었다. scoped minmax(0,1fr) grid와 attempt/result/table의 min-width0으로 수정했다. production 동일91행+실패 상태에서 innerWidth/scrollWidth393, panel319, hit target BUTTON, 실제 다운로드 성공·pageerrors0을 확인했다. 새 E2E가 실제 viewport 폭과 다운로드를 검사한다. 기존 핵심/고급 Dock production 회귀8/8과 기존 PNG는 유지된다.
- production 수정 뒤 desktop/mobile 미수렴·키보드·320px·light/dark targeted4/4를 통과했다. PNG4개는 변경 없이 비교했다. CP2 구현 push 뒤 전체42개와 전체 Vitest·품질 검사를 최종 gate로 다시 실행한다. 앞선 실패 JSON/trace/geometry는 tmp/s20-browser-final2.json, tmp/s20-nonconvergence-trace, tmp/s20-mobile-css-before-production.json에 보존했다.
- 기존 science.test.ts의 Math.hypot 호출 줄바꿈 때문에 fullformat 경고가 있었다. 그 호출만 정규화했다. 기존599/600 test/E2E 파일은 raw-byte 동일이며 이1개는 TypeScript scanner4055토큰·AST·호출 인수의 완전 동일성을 확인했다. assertion·허용오차·수치 golden 변경은 없다. 보호270파일과 기존PNG204개는 raw-byte 동일하다.
- 수치 측정13/13, golden13/13, lint/format/module-size/plan/catalog/Learn/inventory 통과. 상세 수치·보존 증거는 S20-numerical-metrics.json과 S20-preservation.json에 있다. 마지막 최종 검증과 push 전에는 단계 완료가 아니다.
