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
| CP0 | 실행 기록·activeStage | plan/preflight/typecheck | 진행 |
| CP1 | 기존 수치 모듈 adapter·안전 계약·worker·artifact | normal form/native parity, 경계/실패/restart/cancel, typecheck | 대기 |
| CP2 | lazy workflow·초기 추정·수렴 기록·branch graph·파일 왕복 | component, desktop/mobile keyboard/axe/visual, build | 대기 |
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
