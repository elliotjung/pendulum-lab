# S28 저장·URL 호환 계약과 복구 절차

이 문서는 저장소에서 확인한 기존 계약과 S28의 복구 경계를 기록한다.
기준은 S27 완료 커밋 `b78cdae4ea8e707e70ecd5a454173507f60aca2a`다.
S28 구현·검증 결과와 기능별 통과 판정은 이 폴더의 parity matrix 및
`../stage-runs/S28-progress.md`를 함께 확인한다. 문서의 존재만으로 migration,
parity 100%, 사용자 승인 또는 S29 전환을 인증하지 않는다.

## 기존 simulator 진입점과 Landing 계약

README가 안내하는 공개 simulator 주소는
`https://elliotjung.github.io/pendulum-lab/app.html`이다. 이는 저장소에 기록된
주소이며, 이번 로컬 감사에서 외부 배포나 별도 Landing 저장소를 조회하지 않았다.

| 입력 | 기존 동작과 소유 코드 |
|---|---|
| `/app.html` | 기존 앱 진입점. S28 동안 유지한다. |
| `/`, `/index.html` | 개발 서버에서는 `vite.config.ts`의 `serve-app-shell-at-root`가 `app.html`로 연결한다. Production build는 `scripts/copy-legacy-assets.mjs`가 `dist/app.html`을 `dist/index.html`로 복제한다. |
| `?goal=explore` | 명시적인 유효 `tab`이 없으면 `lab`. |
| `?goal=classroom` | 명시적인 유효 `tab`이 없으면 `lyap`. |
| `?goal=reproduce` | 명시적인 유효 `tab`이 없으면 `research`. |
| `?tab=...` | 활성화 가능한 tab이 goal보다 우선한다. 알 수 없는 tab은 유효 goal 또는 기본 `lab`로 복구한다. |
| `?audience=beginner\|student\|research` | 기존 앱의 표시 모드 계약이다. 새 Learn/Lab의 기능 권한이나 교육 진도와 연결하지 않는다. |
| `?lang=en\|ko` | 기존 앱의 표시 언어다. |
| `?w1=...&w2=...` | 초기 각속도 alias. `iw1`/`iw2`가 함께 있으면 canonical 이름이 우선한다. 수용된 alias는 `replaceState`로 정규화한다. |

goal/tab 정책은 `src/app/tabRouting.ts`, 숫자와 alias 정책은
`src/app/deepLinkControls.ts`가 소유한다. 숫자 입력은 완전한 decimal/scientific
token, 유한성, 물리 범위를 검사한다. slider의 표시 step으로 값을 반올림하지
않는다. 직접 숫자 query는 `th1..3`, `iw1..3`, `m1..3`, `l1..3`, `g`,
`gamma`, `dt`, `speed`, `spf`를 포함한다. 실제 지원 여부는 대상 control과
validation에 따른다.

대표 기존 계약 검증은 `tests/deep-link-controls.test.ts` 및
`e2e/deep-link-contract.spec.ts`다. Landing 저장소나 CTA를 S28에서 변경하지
않으며, 이후 전환에서도 이 입력을 조용히 버리는 redirect를 만들면 안 된다.

## 기존 공유 hash와 query의 우선순위

기존 설정 링크는 `#experiment=<base64url JSON>`이며
`src/app/experimentShareCodec.ts` / `experimentShareRuntime.ts`가 소유한다.
decoder는 v1/v2/v3를 현재 v4로 읽는다. v1/v2는 point-mass 의미를 가지며,
compound-double은 v3와 `pendulum-session/v11-ts`부터 정의되었다.

1. 기존 bootstrap은 shell의 query 설정을 적용한 뒤 공유 hash를 복원한다.
   유효한 hash의 물리·실행·workflow 값이 겹치는 query 값을 덮어쓴다.
2. v1 등 과거 payload에서 누락된 실행 값은 `null`일 수 있다. 기존 restore는
   null을 강제로 추론하지 않고 해당 control의 값을 유지한다. 따라서 모든
   과거 링크가 query와 독립적인 완전한 실험이라는 뜻은 아니다.
3. 현재 writer `experimentShareUrl`은 hash가 대체하는 물리·실행·goal/tab·preset
   query를 제거하고 `audience`, `lang`을 명시한다. 기존에 있던 모든 임의 query를
   삭제하는 함수는 아니다.
4. 기존 decoder는 범위 밖 값, 모르는 필드, 손상된 fingerprint에 대해 경고와
   repair/sanitization을 수행할 수 있다. S28 canonical migration은 이 결과를
   무경고의 정확한 변환으로 취급하면 안 된다. 원문과 진단을 보존해야 한다.
5. v4는 정확한 perturbation epsilon·변수·패턴·seed, 표시 각도 단위와 workflow
   위치를 포함하지만 결과 궤적은 포함하지 않는다. FNV fingerprint는 서명이
   아니며 외부 진위나 사람 검토를 증명하지 않는다.

기존 hash와 전체 URL은 8,192자 제한이며 URL이 2,048자를 넘으면 portability
경고가 있다. `e2e/experiment-share.spec.ts`는 stale query가 있는 실제 v4
링크를 새 context에서 복원하고, 정확한 epsilon 및 단 한 번의 semantic commit을
검사한다. 이 기존 계약은 보존하며 S28 새 링크 계약과 혼용하지 않는다.

새 공유는 `src/product/persistence/share.ts`의 `pe1.` envelope이며
`/next.html#/lab/{system}?state=pe1...`에 들어간다. canonical JSON과 CRC32를
검사하며 CRC32도 진위 서명이 아니다. route와 state의 system이 일치해야 한다.
새 parser는 legacy query나 `#experiment`를 새 route로 암묵 해석하지 않는다.

## 저장 형식과 원본 경계

| 기존 데이터 | 보존·검증 경계 |
|---|---|
| live session | `pendulum-session/v11-ts`; `StateStore`가 v10 point-mass를 명시적으로 읽는다. v10 compound-double은 역사적으로 정의되지 않아 거부한다. |
| snapshot export | `pendulum-snapshot/v2`; 실제 restart에 필요한 runtime 필드가 없는 snapshot을 완전한 session으로 추정하지 않는다. |
| research localStorage | key `pendulum-lab/research-workbench/v1`, 현재 payload `pendulum-research-workbench/v4`. key의 v1과 payload의 v4는 서로 다른 계약이다. |
| workspace JSON | `pendulum-workspace/v1`. research·design study·figure caption·snapshot을 묶을 수 있다. 기존 importer에는 preview와 실패 시 원자적 rollback이 있다. |
| design study / captions | `pendulum-lab/design-study/v1`, `pendulum-lab/figure-captions/v1` 등 기존 key를 덮어쓰지 않는다. |
| IndexedDB archive | DB `pendulum-lab-research`, DB version 1, archive `pendulum-research-db/v1`. localStorage와 별도 백업이 필요하다. |
| legacy research ZIP | S24 compatibility adapter는 원 ZIP 및 멤버를 byte 단위 artifact로 보존한다. canonical run 재구성을 하지 못한 기록은 `partial`이며 이를 실행 가능한 migration으로 세지 않는다. |
| expansion hash / 기타 도구별 export | 각 기존 reader와 원본을 유지한다. 형식 인식만으로 canonical 실험 복원이 성공한 것은 아니다. |

새 Lab의 저장 key는 `pendulum-product/{planar,chain,constraint,spatial,driven,
nonlinear,network,field,discrete}/v1/` 계열이며, 새 연구 프로젝트는
`pendulum-lab/product/research-project/v1`을 사용한다. 이 새 저장 영역에 값을
기록해도 기존 데이터 전체를 이동하거나 삭제했다는 뜻은 아니다. 사용자가
새 공간에서 저장을 선택하기 전에는 원본 저장소를 자동 변환하지 않는다.

S28 `previewLegacyMigration(sourceText, { durationSeconds })`는 입력 원문을
보존한 preview를 만든다. 현재 후보 범위는 v10/v11의 완전한
double/compound-double/triple runtime session 및 실제 runtimeSnapshot을
담은 `pendulum-lab-modern-lab` run v2다. v10 compound-double은 거부하며
적분기는 기존·새 실행이 일치하는 Euler/RK2/RK4로 제한한다. 다른 적분기를
조용히 RK4로 바꾸지 않는다. 원본이 적법해도 현재 adapter의 범위·step budget을
넘으면 복구 필요 상태가 된다. `confirmLegacyMigration`
은 preview 식별자를 다시 확인하고, `exportLegacyMigrationBackup`은 입력 원문을
반환한다. 이 API 자체는 localStorage/IndexedDB를 읽거나 쓰지 않는다.
정확한 입력 범위와 거부 이유는 구현·fixture 검증을 기준으로 한다. solver의
숨은 history/buffer를 이어받는 연속 재개를 보증하지 않는다. 백업은 전달된
텍스트를 보존하며 원본 파일의 임의 문자 인코딩을 보증하지 않는다. 파일 입력은
크기 제한 안의 유효 UTF-8만 읽으며, CRLF/BOM을 textarea의 표시 정규화와
분리하여 백업한다.

기존 `__modernLab.runtimeSnapshot()`의 실제 필드는 `schemaVersion`,
`systemType`, `method`, `mode`, `dt`, `tolerance`, `stepsPerFrame`, `damping`,
`parameters`, `state`, `simTime`, `seed`, `hash`다. 현재 상태·시각·hash는
실행 중 값이므로 HTML의 초기 각도를 대신 넣지 않는다. `seed`는 현재 control의
safe integer 또는 null이다. `readLabConfig`가 m3/l3 control을 읽더라도
`LabSimulation.validatedConfig`는 double/compound의 실행 parameters를
`m1,m2,l1,l2,g` 다섯 개로 만든다. triple에서는 m3/l3를 포함한 일곱 개다.
과거 session에 double/compound의 dormant m3/l3가 있으면 실행에서 사용하지
않으며 원문 백업에만 남겼다는 경고를 보여 준다. triple의 m3/l3는 필수 물성이다.

화면 표시 모드, render speed/steps-per-frame, legacy hash, fixed-step에서 쓰지
않는 tolerance처럼 restart와 분리한 값은 backup-only로 명시한다. 공유 링크,
query, workspace, research archive가 정확히 표현되지 않으면 원문 다운로드와
기존 앱에서 열기 등 복구 경로를 보여 준다. 이를 성공한 canonical 변환이나
전체 parity 통과로 표시하지 않는다. 알 수 없는 버전, 중복/위험 key, 범위 밖
값, 손상 입력에도 입력 원문과 현재 작업은 유지되어야 한다.

## 안전한 rollback과 rehearsal

S28은 기본 앱을 교체하지 않는다. 제품 동작을 되돌려 확인하려면 우선 기존
`app.html`을 열어 기존 저장/링크/importer를 사용한다. 새 앱의 preview를 취소한
것과 배포 rollback을 수행한 것은 별도의 사실이다.

전환 전 사용자가 보관할 백업:

1. 원래 링크 또는 가져온 파일을 그대로 보관한다. migration 원문 백업도
   별도 파일로 내려받는다. 새 canonical 파일로 원본 파일을 덮어쓰지 않는다.
2. 기존 Research의 workspace export와 Long-Term Storage의 DB archive를 모두
   보관한다. IndexedDB는 localStorage 백업에 포함되지 않는다.
3. 새 공간에서 만든 JSON/ZIP도 따로 보관한다. 이전 build가 새 schema를 읽을 수
   있다고 가정하지 않는다. 브라우저 origin이 바뀌면 원래 origin의 저장소를
   자동으로 읽을 수 없으므로 파일 export/import 경로를 사용한다.

S28 rehearsal이 확인해야 할 관찰 가능한 동작:

1. 테스트 전용 context에 원본 legacy session·query·share·workspace fixture와
   기존 저장 key를 준비하고 원문/값을 기록한다.
2. 새 앱에서 preview, 취소, 오류, 재시도를 수행한다. 채택 전에는 기존 key와
   현재 실험을 바꾸지 않는다. 지원 후보만 명시적으로 채택한다.
3. 같은 context의 별도 탭에서 `/app.html`을 다시 열고 원래 link나 export를
   복원한다. 기존 key의 byte 동일성, 원래 상태와 유한한 실행·export를 검사한다.
4. 새 JSON/share round trip 및 원본 backup round trip을 별도로 비교한다.
   unsupported/failed 입력도 원본을 다시 다운로드할 수 있어야 한다.

기존 자동 검증의 재사용 지점은 `e2e/workspace-import-atomic.spec.ts`,
`e2e/research-storage.spec.ts`, `e2e/research-bundle-zip.spec.ts`,
`e2e/redesign/research-project.spec.ts`, `e2e/redesign/shell.spec.ts`다.
S28 결과 보고에는 이번에 재실행한 범위와 이전 단계의 역사적 증거를 구분한다.

Git 복구 기준은 `b78cdae4ea8e707e70ecd5a454173507f60aca2a`다. 필요하면
이 commit의 소스를 별도 폴더로 export하고 같은 dependency lockfile로
build/smoke한다. 사용자의 현재 폴더에 `reset`, `clean`, 강제 checkout 또는
과거 build의 파일 덮어쓰기를 하지 않는다. 배포 전환·rollback flag/build는
사용자가 S28 보고를 확인하고 S29를 요청한 뒤 S29 범위에서 검증한다.

## 검토 상태와 S29 금지 조건

현재 8과정·86단원을 실제 `loadLearnUnit`로 읽은 metadata 감사 결과는
86/86 ready, 86/86 automated-verified, 86/86 source-checked,
0/86 human-reviewed다. 이는 기존 출처 대조 기록의 상태 확인이며 모든 외부
참고문헌을 이번 단계에 새로 접속했다는 뜻은 아니다. 제품의 각 단원과 색인은
사람·물리 전문가 검토가 남았음을 공개한다. 과학적 fixture와 UI workflow
승인을 사람의 과학 검토로 바꾸어 기록하지 않는다.

사용자 S28 review에서는 다음을 직접 확인한다.

- 원래 저장·링크를 열었을 때 preview에 시스템·값·단위와 backup-only 항목이
  정확히 보이는가.
- 미지원/손상 입력이 현재 작업을 바꾸지 않고 원문 백업과 복구 방법을 주는가.
- parity matrix의 각 기존 기능에 실제 새 접근 경로, 결과 비교, 테스트,
  export 증거가 있고 누락/실패 항목이 0인가.
- 기존 `app.html`과 백업을 사용한 복구 증거 및 0/86 사람 검토 상태를 확인했는가.

parity 100%, 필수 migration fixture 100%, 원본 손상 0, 필수 테스트 통과,
원격 완료 status와 사용자 review가 모두 충족되기 전에는 S29를 시작하지 않는다.
복구 안내가 있다는 이유만으로 미구현 기능의 parity를 통과시키지 않는다.
S28 보고를 받은 뒤 사용자가 다음 단계 실행을 요청해야 기본 앱 전환 승인으로
기록한다. S28 구현만으로 그 승인이나 실제 cutover를 주장하지 않는다.
