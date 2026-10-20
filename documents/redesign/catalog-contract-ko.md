# S02 카탈로그 계약

## 범위와 단일 진입점

[`src/product/catalog/index.ts`](../../src/product/catalog/index.ts)의 `catalog`는 배우기와 실험실이 공통으로 조회할 선언형 목록이다. S02의 134개 정의는 S01의 의미 기능 118개와 기존 적분기 registry의 개별 방법 16개를 정확히 한 번씩 연결한다.

| 종류 | 수 | 의미 |
|---|---:|---|
| 시스템 | 35 | 기존 모델, 특수 solver, 제한된 탐색/진단 경로 |
| 분석 | 51 | 입력 데이터와 기존 계산 함수의 계약 |
| 적분기 | 21 | 기존 16개 ID와 적응 제어·정준 변환·SDE 5개 기능 |
| 보조 기능 | 28 | 제어 7, importer 5, exporter 5, 저장 4, route 3, runtime 4 |
| 합계 | 135 | S01 baseline 참조 134개, 중복 등록 없음 |

S16은 기존 `sineGordon.relaxFrenkelKontorovaKink`를 `system:frenkel-kontorova` 정적 진단 경로로 노출한다. 이 제품 확장 하나의 `baselineIds`는 빈 배열이며 S01의 고정된 134개 참조와 기존 ID를 바꾸지 않는다. 빈 참조는 정확히 이 ID·단계·진단 종류·native binding 조합에만 허용한다. 위 표는 S16까지의 현재 등록 수이며 원래 baseline 개수는 유지한다.

안정 ID는 `system:double`, `analysis:fft`, `integrator:rk4`처럼 종류를 포함한다. 기존 의미 ID는 유지한다. `verlet`과 `leapfrog`는 동일 함수에 연결되지만 저장된 기존 ID를 보존하므로 각각 등록한다. 이름은 한국어/영어를 포함하며 종류·언어별 공백, Unicode, 대소문자를 정규화해 중복을 검사한다.

## 선언과 실행의 경계

- [`catalog.ts`](../../src/product/contracts/catalog.ts)의 `SystemDefinition`, `AnalysisDefinition`, `IntegratorDefinition`은 현재 구현의 발견·연결 계약이다. 기존 엔진 호출을 변경하지 않는다.
- `legacyBindings`는 실제 repository-relative module/export를 가리킨다. 분석·적분기의 첫 binding은 호출 가능한 계산 API이고 나머지는 관련 API/registry 메타데이터다. 시스템의 `engineAdapters`와 내부 `stepping.binding`도 호출 가능한 기존 함수를 가리킨다.
- binding은 문자열로 선언하고 빌드에서 TypeScript export와 대조한다. 목록을 읽기 위해 물리·분석·DOM·worker 코드를 import하거나 실행하지 않는다.
- 현재 state/parameters는 `kind: legacy-api`, `version: unversioned`로 기존 타입 또는 함수 인수 계약을 가리킨다. S03 canonical 상태나 새 저장 schema를 미리 만들거나 지원한다고 표시하지 않는다.
- `integrationStage`는 기존 기능을 새 제품 경험에 연결할 예정 단계다. 카탈로그 등록 자체가 UI/실행 adapter 완성을 뜻하지 않는다.
- 모든 정의는 복사 후 깊이 freeze한다. 조회는 알 수 없는 ID에 `undefined`를 반환하며 기존 객체 또는 사용자 상태를 수정하지 않는다.

## 호환성 계약

[`predicates.ts`](../../src/product/catalog/predicates.ts)는 시스템 ID, evolution 종류, 필요한 입력을 모두 AND로 검사한다. 시스템 필터 생략은 제한 없음을 뜻하고, 명시적인 빈 ID 목록은 어떤 시스템에도 자동 제안하지 않음을 뜻한다. 별도 진단으로만 의미 있는 기능은 ID로 조회할 수 있고 제한 설명을 유지한다.

`supportsSystem`은 시스템과 모델 종류만 확인한다. `matchesCapability`와 `compatibleAnalyses`는 호출자가 실제 검증한 `availableInputs`까지 확인한다. 분석 등록만으로 trajectory, tangent model, matrix, 관측 데이터가 존재한다고 간주하지 않는다. 데이터 기반 분석은 해당 입력의 모양·단위·sampling 등을 기존 계산 함수에서 다시 검증해야 한다. S02 predicate는 값 검증이나 후속 adapter의 과학적 전제 검증을 대체하지 않는다.

`compatibleIntegrators`는 시스템이 명시적으로 선택 가능한 방법과 방법의 predicate를 모두 통과한 결과만 반환한다. 내부 solver는 일반 적분기 목록에 섞이지 않는다.

- Kuramoto/Huygens의 phase-only 상태와 위상 좌표를 추가한 driven/Duffing/Kapitza 계에는 q/v 분할 방법을 제안하지 않는다.
- rope/double-string의 사건, embedded 계의 projection, Pyragas의 delay history, field/map/quantum의 전용 step을 유지한다.
- theta/omega의 split 방법은 기존 근사 의미를 보존하며 일반적인 심플렉틱성 보장을 주장하지 않는다.
- fixed-step 오차 감시와 별도 adaptive accept/reject API를 구분한다. SDE 강수렴 차수와 가환성 조건도 구분한다.
- cart-pole의 열린루프 외력, Huygens phase reduction, lattice/FK 조화·정적 한계 등 기존 구현 범위를 ko/en 제한에 남긴다.

## 재실행과 빌드 게이트

```text
npm run redesign:catalog:check
npx vitest run tests/product/catalog tests/characterization
npm run typecheck
npm run redesign:inventory:check
```

`redesign:catalog:check`는 shape·번역·ID·참조·호환성을 검사하고, 고정된 S01 JSON과 양방향 coverage, 실제 source export 및 호출 가능성을 확인한다. export alias와 타입 참조를 해석하되 legacy 모듈은 실행하지 않는다. 경로 이탈, 삭제된 export/member, 타입만 존재하는 실행 연결은 실패한다.

기존 API의 적용 한계도 별도로 검사한다. 이중진자 추정·Wada, 구동진자 continuation/Melnikov/branch switching, 2×2 Floquet, SystemSpec 및 expansion 모델 집합은 실제 함수 범위보다 넓게 선언할 수 없다. 초기 상태·관측값·매개변수 등 필수 입력을 제거하거나 연속 벡터장 분석을 이산/양자계에 제안하면 검사에서 거부한다. 이는 코드로 확인한 API 경계의 검증이며 일반적인 과학적 정확성 인증은 아니다.

`npm run build`, `build:lib`, `build:standalone`은 각각 `prebuild` lifecycle에서 같은 검사를 먼저 실행한다. 기존 build 명령 본문은 유지한다. 직접 `vite build`를 호출하면 npm lifecycle을 우회하므로 저장소 표준 npm build 명령을 사용한다.

S01 inventory는 기존 제품의 고정된 비교점이다. 새 `src/product/`, `tests/product/`와 원래 제외된 redesign harness를 비교점에 섞지 않는다. 새 lifecycle 별칭 3개는 **정확히** `npm run redesign:catalog:check`일 때만 기존 manifest fingerprint에서 제외한다. 기존 build/API/dependency 변경이나 다른 hook 내용은 계속 탐지한다. baseline JSON 및 기존 수치 golden은 재생성하지 않는다.

카탈로그는 baseline JSON이나 S01 seed를 import해 자동 복제하지 않는다. 독립적으로 작성한 정의와 고정된 inventory를 대조하므로 한쪽 등록 삭제나 ID/소유자 변경을 탐지할 수 있다. 기존 공개 API 전체와 파일의 보존은 S01 inventory 재현 검사로 검증한다.

## 검토와 후속 범위

S02는 사용자 화면 review gate나 교육 콘텐츠 검증 단계가 아니다. 자동 계약 검사와 코드 대조를 수행하며 사람/전문가 검토로 표시하지 않는다. 기존 보안 위험은 [S01 보안 기준선](baseline/security.md)에 남아 있고 이번 단계는 패키지 변경이나 위험 수용을 수행하지 않는다.

실행 증거와 원격 checkpoint는 [S02 진행 기록](stage-runs/S02-progress.md)에 기록한다. S02의 최종 상태 commit이 원격에 확인된 뒤 다음 유효 요청은 S03이며, canonical 상태·공유·라우트 계약은 그 단계에서만 구현한다. 기존 `app.html`과 S01 원격 commit이 운영/복구 기준이다.
