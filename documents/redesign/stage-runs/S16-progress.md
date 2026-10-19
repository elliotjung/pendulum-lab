# S16 확률·FPUT·격자·장 실행 기록

## 기준과 범위

- 요청: 16단계 실행. 저장소의 여섯 authoritative 문서를 전체 읽었다.
- 기준 local/remote HEAD: `64db09a7ec6b433b7f6d1b0cac1ee2f1d1590439`, `codex/redesign`, upstream 일치. fetch 후 ahead/behind 0/0, 사용자 변경 없음.
- 의존 S15: 원격 status commit `64db09a`, CP0~CP3와 validated S15 verification, network adapter/UI/tests 산출물을 확인했다. S01~S15 연속 완료, gate 승인 [7,9].
- `redesign:check`, `redesign:preflight -- 16` 통과. Git FETCH_HEAD 쓰기와 스크립트 Git 자식 실행은 sandbox에서 차단되었으나 동일 명령의 확장 권한 실행으로 성공했다.
- 모델 선택 UI는 런타임에 노출되지 않아 실제 선택값을 검증하거나 변경했다고 주장하지 않는다. 기록된 사용자 선택을 전제로 진행한다.
- 목표: native stochastic/FPUT/lattice/sine-Gordon/FK 연결, seed 관리, 공간 heatmap, ensemble 요약과 provenance, 경계·격자 설정, bounded downsampling/export.
- 제외: S17 이후, 일반 ensemble/sweep queue(S21), 새 Learn 단원, app cutover, master merge/release, 기존 엔진 재작성.

## 보존 계약

- `app.html`, `src/physics`, `src/chaos`, `src/research`, `src/runtime`, `src/workers`, `src/validation`, `src/lib`, 공개 API·데이터·기존 저장·공유 형식·golden·package/lockfile을 보존한다.
- 새 product adapter/worker만 추가하고 native 계산을 호출한다. 기존 canonical schema와 단위 allowlist를 보존하며 모델 전용 maps에 version과 normalized convention을 기록한다.
- 격자의 기존 조화 분산과 FK의 기존 정적 kink relaxation을 실제 native 경계 그대로 표시한다. 일반 FK depinning 시간 solver가 있다고 주장하지 않는다.
- 새 저장 namespace를 사용하고 손상·미래 버전 원본을 덮어쓰지 않는다. raw 적분 표본과 시간 downsample된 보관 표본을 명시적으로 구분한다.

## 내부 checkpoint

| ID | 범위 | 필수 검증 | 상태 |
|---|---|---|---|
| CP0 | 진행 기록·activeStage | plan/preflight/typecheck | 완료 |
| CP1 | native adapter·canonical·bounded worker | seed/native parity, continuum/lattice, boundaries, resource/cancel/error, typecheck | 대기 |
| CP2 | 전용 Lab·seed/grid·heatmap·ensemble·files | model/storage tests, production build, desktop/mobile/keyboard/axe/visual | 대기 |
| CP3 | 수치·보존·완료 후보 | 전체 Vitest, 필수 browser, catalog/Learn/inventory/policy/secrets/typecheck/build | 대기 |
| STATUS | 별도 완료 상태 | 구현 원격 확인 뒤 최종 검증·status push/hash | 대기 |

## 변경 예정 경로

- `src/product/adapters/physics/field*`, `tests/product/adapters/physics/field*`, `tests/product/contracts/field*`
- `src/product/lab/views/field-*`, `src/product/app/views/field-lab.ts`, application route, extended catalog, library 안내, `css/product/field.css`
- `tests/product/lab/field-*`, `e2e/redesign/field-pendulum*`
- `scripts/redesign/measure-field-numerics.ts`, `documents/redesign/field-lab-ko.md`, `stage-runs/S16-*`, `status.json`

## 위험·검토·원격 증거

- 공간·시간 이산화, 유한 ensemble 표본, native FK Newton 비수렴 가능성과 격자의 조화 극한을 제품·문서에 명시한다.
- 메모리/격자/ensemble/steps/표본을 제한하고 worker 요청 사이 취소와 마지막 유효 상태 보존을 검증한다.
- S16 사용자 review gate는 없다. 사람 과학 검토를 수행했다고 표시하지 않는다. 기존 보안 감사 미해결 항목을 해결·수용했다고 주장하지 않는다.
- checkpoint마다 명시적 경로만 stage/commit/push하고 원격 hash 확인 후 다음 checkpoint로 간다. 최종 status 전 nextStage=16 유지.
- CP0 code baseline `64db09a`를 ignored `tmp/s16-cp0-baseline`에 Git archive로 추출하여 기존 typecheck를 통과했다. 병렬 작업 중인 미완성 신규 모듈 때문에 live tree 첫 typecheck는 missing-module 오류로 끝났으며, CP1/CP2 공개 전에 전체 live tree typecheck를 다시 요구한다. CP0에는 문서/status만 포함한다.
- 두 desktop 전달 사본은 원본 roadmap SHA256 `1d46e04691d4119ced60dacb41945c75d9d1a20f66cbaed2b3664909f47f8995`, execution `803b191496edd95ebf2199a8983b920058109bb159d55f8bafeb0737fa735fc5`와 일치한다. 두 원본 계획 파일은 수정하지 않는다.
