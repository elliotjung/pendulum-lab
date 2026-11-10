# S28 저장·URL 호환 계약과 복구 절차

이 문서는 S27 완료 커밋 `b78cdae4ea8e707e70ecd5a454173507f60aca2a`의 기존 계약과 S28에서 추가한 명시적 이전 경로를 기록한다. 최종 브라우저 실행과 인증은 진행 중이며, 현재 상태는 `../stage-runs/S28-progress.md`와 실제 capture/report에서 확인한다. 문서 작성만으로 parity 100%, 원격 완료, 사용자 승인 또는 S29 전환을 인증하지 않는다.

## 기존 simulator 진입점과 Landing 계약

README에 기록된 공개 simulator 주소는 `https://elliotjung.github.io/pendulum-lab/app.html`이다. 이번 로컬 검증에서 외부 배포나 별도 Landing 저장소를 조회·수정하지 않았다.

| 입력 | 기존 동작과 소유 코드 |
|---|---|
| `/app.html` | 기존 앱 진입점. S28 동안 유지한다. |
| `/`, `/index.html` | 개발 서버의 `serve-app-shell-at-root`는 `app.html`로 연결한다. production 기본 출력에서는 legacy copier가 `app.html`을 `index.html`로 복제한다. S28의 분리 build 출력 옵션은 이 기본 계약을 보존한다. |
| `?goal=explore` | 명시적인 유효 `tab`이 없으면 `lab`. |
| `?goal=classroom` | 명시적인 유효 `tab`이 없으면 `lyap`. |
| `?goal=reproduce` | 명시적인 유효 `tab`이 없으면 `research`. |
| `?tab=...` | 활성화 가능한 tab이 goal보다 우선한다. 알 수 없는 tab은 유효 goal 또는 기본 `lab`로 복구한다. |
| `?audience=beginner\|student\|research` | 기존 표시 모드 계약. 새 Learn/Lab의 기능 권한이나 교육 진도와 연결하지 않는다. |
| `?lang=en\|ko` | 기존 앱의 표시 언어다. |
| `?w1=...&w2=...` | 초기 각속도 alias. 기존 앱은 `iw1`/`iw2`가 함께 있으면 canonical 이름을 우선하고 수용된 alias를 `replaceState`로 정규화한다. |

`src/app/tabRouting.ts`와 `deepLinkControls.ts`가 기존 정책을 소유한다. 직접 숫자 query는 `th1..3`, `iw1..3`, `m1..3`, `l1..3`, `g`, `gamma`, `dt`, `speed`, `spf`를 포함하며 대상 control의 완전한 decimal/scientific token·유한성·물리 범위 검사를 받는다. slider step으로 정밀 값을 반올림하지 않는다.

대표 기존 검사는 `tests/deep-link-controls.test.ts`, `e2e/deep-link-contract.spec.ts`다. 이후 전환에서도 기존 URL의 설정을 조용히 버리는 redirect를 만들면 안 된다. S28은 기본 앱 전환이나 Landing CTA 변경을 수행하지 않는다.

## 기존 공유 hash의 우선순위와 엄격한 이전

기존 공유는 `#experiment=<base64url JSON>`이며 기존 codec/runtime이 v1/v2/v3를 현재 v4로 읽는다. v1/v2는 질점 모델이며 compound-double은 v3 및 `pendulum-session/v11-ts`부터 정의된다.

1. 기존 bootstrap은 query를 적용한 뒤 유효 공유 hash를 복원한다. 겹치는 물리·실행·workflow 값은 hash가 우선한다.
2. 과거 payload의 누락 실행 값은 `null`일 수 있다. 기존 restore는 해당 control을 유지하므로 모든 과거 링크가 query나 현재 control과 독립적인 완전한 설정인 것은 아니다.
3. 기존 writer는 hash가 대체하는 물리·실행·goal/tab·preset query를 제거하고 `audience`, `lang`을 명시한다. 모든 임의 query를 삭제하는 계약은 아니다.
4. 기존 decoder가 경고·repair/sanitization을 허용하는 경우에도 S28 strict adapter는 손실 보정을 무경고의 정확한 변환으로 처리하지 않는다. 원문·decoded/resolved 값·진단·기본값의 출처를 보존하고 적용할 수 없는 값은 명시한다.
5. v4는 섭동 epsilon·변수·pattern·seed, 각도 표시 단위와 workflow 위치를 포함하지만 결과 궤적을 포함하지 않는다. FNV fingerprint는 외부 진위·과학적 타당성·사람 검토를 증명하는 서명이 아니다.

기존 hash/전체 URL의 8,192자 제한과 2,048자 초과 portability 경고는 기존 계약이다. S28은 원문 및 전체 설정을 `pendulum-legacy-link-compatibility/v1` envelope로 보존한다. 이 envelope는 canonical 물리 restart와 별도이며 `fieldMappings`, `declaredDefaults`, `inheritedFromBase`, `transferRequirements`를 포함한다. 호환 작업공간은 실제 재생·표시·섭동·workflow·이동 목적 consumer를 통해 이를 적용한다. canonical JSON만 내보내는 것을 전체 링크 의미의 이전으로 표시하지 않는다.

단순 physical preview는 `ready`, 별도 consumer가 필요한 설정은 `needs-transfer`, 정확한 실행을 표현할 수 없는 입력은 `recovery-required`로 구분한다. 발행한 immutable preview만 확인할 수 있고, 편집·취소·새 파일 선택·화면 해제 후의 오래된 비동기 결과는 적용하지 않는다. 저장한 link 전달도 매번 원문으로 strict 변환하여 canonical 설정과 일치하는지 재검증한다. 같은 ID의 다른 원문은 덮어쓰지 않는다.

## 불완전한 query와 기존 tab의 새 목적지

부분 query에는 사용자가 확인한 명시적 base experiment가 필요하다. 화면에서 이중·복합·삼중진자의 새 기본 조건을 선택하거나, 보관한 `pendulum-experiment/v1` JSON 파일을 읽기 전용 base로 제공한다. 원본에 없는 물성·초기조건·적분기·허용오차 등은 이 base에서만 상속하며 최종 값을 preview에서 확인한다. 파일 선택이나 읽기 완료만으로 preview·채택·저장·실행을 승인하지 않는다.

query의 중복 키, prototype 관련 키, 충돌하는 alias, 모르는 방법, 다른 시스템의 base, private preset과 base의 불일치 등은 조용히 결정·clamp하지 않는다. 기존 앱이 canonical alias를 우선하는 상황도 strict 이전에서는 서로 다른 두 값을 임의 선택하지 않고 진단한다. 알 수 없는 query는 envelope에 보존하되 물리 설정·코드·네트워크 동작으로 실행하지 않는다. 원본에 없던 workflow나 섭동 기본값은 출처를 표시한다.

기존 tab은 저장하지 않은 내부 control 전체가 아니라 이동 목적을 전달한다. 새 목적지는 `src/product/lab/views/legacy-navigation.ts`가 소유하며 다음을 구분한다.

| 기존 tab | 새 목적지 |
|---|---|
| `lab`, `compare` | 작업 공간, 기준·근접 궤적 조건 목록 |
| `lyap`, `zeroone` | Lyapunov, 0–1 chaos 진단 |
| `sweep`, `matrix`, `bifurc` | grid 조건·결과, 분기·연속추적 |
| `phase3d`, `density` | 실제 기록 기반 3D 위상, 방문 누적 |
| `clv`, `basin`, `rqa`, `ftle` | 해당 고급 분석 consumer |
| `architecture`, `canonical` | 실행 backend, 정준 좌표·에너지 구조 진단 |
| `research`, `expansion` | 연구 프로젝트, 전체 native 확장 suite |
| `validate`, `golden`, `aplus` | 명시적으로 실행하는 native 검증 결과·export |
| `lab3d`, `docs`, `theory` | 3D 구속 Lab, Learn |

목적지 패널을 열었다는 사실과 실제 분석/수치 결과 검증을 구분한다. `e2e/redesign/legacy-tabs.spec.ts`는 실제 목적지·원문 envelope·native 결과를 검사하며 최종 실행 통과는 원시 capture에서 확인한다.

## 새 physical 링크와 전체 설정 링크

기존 새 제품의 `pe1.` canonical 링크 creator/형식은 유지된다. `pe1.`은 물리 experiment를 전달하며 `/next.html#/lab/{system}?state=pe1...`에 들어간다. 전체 제어를 전달하는 S28 추가 형식은 `pendulum-product-setup/v1` JSON 및 `ps1.` token이다. route와 token의 시스템 ID가 달라지면 거부한다.

전체 설정은 이중·복합·삼중진자의 canonical experiment와 각도 표시 단위, playback, trail/phase/quality/glow/interpolation, 근접 궤적 count·정확한 perturbation spec, goal/step/trajectoryStage를 명시적으로 검증한다. raw legacy 원문·메모·결과·저장 key·오디오 활성화·장치 동의·solver continuation buffer는 공개 setup에 복사하지 않는다. 기본값으로 보정하거나 workflow를 조용히 정규화하지 않는다. native adapter는 Lab을 명시적으로 읽은 뒤 모델 버전·단위·실행 한도를 추가 검증한다.

두 token은 canonical JSON과 CRC를 검사하지만 CRC도 진위 서명이 아니다. URL 한도를 넘는 전체 설정은 설정 JSON export를 안내한다. parser는 legacy query 또는 `#experiment`를 새 route로 암묵 해석하지 않으며 별도의 preview/확인 경로를 사용한다. 설정 파일 preview·취소·수정·stale read 경계는 현재 실험을 보호한다.

## Session·modern run의 재시작과 전체 실행 설정

`previewLegacyMigration`은 `pendulum-session/v10-ts` 또는 v11의 완전한 runtime snapshot, 그리고 그 snapshot과 외부 값이 정확히 일치하는 modern Lab run v2를 읽는다. double/compound-double/triple 및 등록된 native ODE 16개를 지원하고 원본 tolerance·각도 winding·물성·감쇠·시간 간격·현재 simTime·seed를 보존한다. v10 compound-double은 역사적으로 정의되지 않아 거부한다. 모르는 적분기를 RK4로 바꾸지 않는다.

실제 snapshot 필드는 `schemaVersion`, `systemType`, `method`, `mode`, `dt`, `tolerance`, `stepsPerFrame`, `damping`, `parameters`, `state`, `simTime`, `seed`, `hash`다. 현재 상태·시각을 HTML 초기 각도로 대신하지 않는다. double/compound의 native 실행 물성은 `m1,m2,l1,l2,g`이며 dormant m3/l3가 있으면 원문에 보존하고 사용하지 않았음을 알린다. triple은 m3/l3가 필수다.

원본 session에는 미래 관찰 시간이 없으므로 사용자가 새 관찰 시간을 명시한다. canonical restart는 현재 상태에서 새 run을 만들며 solver history·buffer·과거 실행 이력·난수 stream의 연속 재개가 아니다. canonical JSON에는 물리 조건이 들어가며, 원본 mode/SPF는 원문 백업에도 남는다. 화면의 **확인하고 새 실험실에서 열기**는 별도 전체 setup consumer로 원본 mode와 SPF를 전달한다. 현재 SPF 1–60을 벗어나면 clamp하지 않고 거부한다. session에 없는 표시·시계·속도는 화면에 명시한 rad·balanced·wall-clock·1배 등 새 기본값을 사용하며 실행 전에 편집할 수 있다. 기존 hash를 새 결과의 검증값으로 사용하지 않는다.

`confirmLegacyMigration`은 실제 발행한 preview와 ID를 확인하고 detached copy를 반환한다. API 자체는 legacy localStorage/IndexedDB를 읽거나 쓰지 않는다. 일반 text/file 입력은 최대 256 KiB와 유효 UTF-8을 검사하며, 입력 원문을 textarea 표시 정규화와 분리해 BOM·CRLF·공백을 그대로 백업한다. 임의 문자 인코딩을 지원한다고 주장하지 않는다. 알 수 없는 버전·추가/중복/위험 key·범위 초과·불완전 snapshot은 원문 복구 경로를 유지한다.

## 일곱 native 확장 suite

`#expansion=`은 전용 호환 consumer에서 `driven`, `coupled`, `inverted`, `cartpole`, `parametric`, `spherical`, `chain` 전체 native 모델과 명시한 방법 목록을 실행한다. 원본 config와 선언된 native 기본값·실효 단계 범위를 preview하며 방법 목록을 첫 방법 하나로 축소하지 않는다. canonical physical 후보가 존재하더라도 이것은 원본 suite의 점수·bestMethod·ghost·heatmap·bifurcation·report 전체를 대신하지 않는다.

전용 suite는 실제 native 구현을 호출하고 모든 방법의 설정·상태·결과를 versioned JSON으로 export/preview/채택한다. 결과의 IEEE 비유한 값은 명시적 태그로 보존하며 조용히 null/0으로 대체하지 않는다. 단계 수가 원래 suite의 10–80,000 clamp를 유발하는 설정, 중복/미지원 방법, 미정의 물성, 예산 초과는 명시적으로 거부한다. optional Lyapunov 계산과 실제 실행 범위는 결과에 구분한다. 실행 취소나 stale worker 결과가 원문·현재 확정 결과를 덮어쓰지 않는다.

## Workspace·연구 DB와 원본 저장 영역

| 기존 데이터 | 원본 계약 및 S28 경계 |
|---|---|
| snapshot | `pendulum-snapshot/v2`. runtime 필드가 없는 snapshot을 완전한 session으로 추정하지 않는다. |
| research localStorage | key `pendulum-lab/research-workbench/v1`, payload `pendulum-research-workbench/v4`. key 버전과 payload 버전은 별도다. |
| workspace JSON | `pendulum-workspace/v1`, 최대 8 MiB. 원래 importer의 구조·자원 검사를 재사용한다. |
| design study / captions | `pendulum-lab/design-study/v1`, `pendulum-lab/figure-captions/v1` 등 기존 key를 덮어쓰지 않는다. |
| IndexedDB archive | DB `pendulum-lab-research` version 1, `pendulum-research-db/v1`, 최대 64 MiB. localStorage와 별도 원본 export가 필요하다. |
| legacy research ZIP | 원본 ZIP·멤버 bytes를 보존한다. 표본 없는 과거 결과는 partial이며 실행 완료나 figure 계보를 만들어내지 않는다. |

일반 session text preview와 별도로 **기존 작업공간·연구 DB 가져오기** 패널의 `previewLegacyWorkspace`가 exported JSON bytes를 읽는다. 기존 browser DB를 자동 열거하거나 읽지 않는다. 원본 전체 bytes/SHA-256, 모든 typed record·원래 ID·관계·설정·image/ZIP assets를 보존하고 검증된 project part로 분할한다. record를 임의 slice하거나 숫자·표본을 채워 넣지 않는다. 큰 typed record가 part의 file 제한을 넘는 경우 전체 source archive 및 전용 record export에 보존한 경계를 표시한다. 외부 참조는 missing으로 보존하고 해당 경로나 URL을 자동 읽지 않는다. PNG/JPEG/WebP를 검증하며 SVG/HTML을 실행하지 않는다.

실제 session을 표현할 수 있는 record만 canonical restart 후보로 제공한다. 계획·표본 없는 metrics·이미지 등은 원본 typed record와 partial 의미를 유지한다. unresolved record는 그 이유를 표시하고 전체 완료 결과로 가장하지 않는다. 원본 다운로드·record 다운로드·asset 다운로드·각 part ZIP이 별도로 제공된다.

채택은 checksum을 다시 검증한 issued preview에서만 수행한다. 전체 원본과 options는 별도 product DB `pendulum-lab-product-legacy-migrations-v1`의 archive/source transaction으로 저장하고, 성공 뒤 선택한 part를 새 제품 프로젝트로 채택한다. 취소·저장 실패·IDB 구조 불일치·32개 archive 상한에서는 기존 저장을 자동 삭제·재구축·덮어쓰기하지 않는다. 재로딩 때 원본 bytes로 preview를 재구성해 ID·SHA·크기와 index가 일치하는지 다시 확인한다. 별도 DB 보관 성공 전에는 현재 프로젝트를 교체하지 않으며, 채택 뒤에는 이전 bundle 참조를 document 내 session의 previous로 보존한다. 이 session은 새 legacy 저장 쓰기가 아닌 메모리 상태다.

새 Lab은 `pendulum-product/{planar,chain,constraint,spatial,driven,nonlinear,network,field,discrete}/v1/` 계열, 새 연구 프로젝트는 `pendulum-lab/product/research-project/v1`을 사용한다. 기존 링크 전달은 별도 `pendulum-product/legacy-link/v1/`에만 보관한다. 새 공간에 저장했다고 기존 데이터 전체를 이동하거나 삭제했다는 뜻은 아니다.

## 안전한 rollback과 rehearsal

S28은 기본 앱을 교체하지 않는다. 기존 `app.html`과 기존 저장·링크·importer를 계속 이용할 수 있다. preview 취소, 같은 원본의 기존 앱 복원, 배포 rollback은 각각 별도의 사실이다.

전환 전에는 원래 URL/파일과 원문 backup을 그대로 보관하고, workspace export와 Long-Term Storage DB archive를 따로 내려받는다. IndexedDB는 localStorage 백업에 포함되지 않는다. 새 JSON/ZIP도 따로 보관하며 이전 build가 새 schema를 읽는다고 가정하지 않는다. origin이 달라지면 이전 origin 저장을 자동 읽을 수 없으므로 file export/import를 사용한다.

rehearsal의 관찰 가능한 동작은 다음과 같다.

1. 테스트 전용 context에 원본 session·query·share·workspace fixture와 기존 key를 준비하고 bytes/값을 기록한다.
2. 새 앱에서 preview·취소·오류·재시도를 수행한다. 확인 전에는 현재 실험과 기존 key를 바꾸지 않는다. 지원 후보만 명시 채택하고 새 파일/share와 원문 backup을 따로 round trip한다.
3. 같은 context의 기존 `/app.html`에서 원본을 복원하고 정확한 기존 key·원래 상태·유한한 실행·export를 비교한다.
4. unsupported/failed 입력도 원본을 보존하며 현재 작업이 유지되는지 확인한다. workspace/DB는 모든 record·asset·part와 별도 product 저장 transaction을 검증한다.

주요 자동 경로는 `e2e/redesign/{migration,migration-base,legacy-tabs,legacy-workspace,legacy-expansion}.spec.ts`, `e2e/{workspace-import-atomic,research-storage,research-bundle-zip}.spec.ts` 및 관련 native/unit 검사다. 최종 report는 이번 실행 capture와 이전 checkpoint 증거를 구분한다.

Git 복구 기준은 `b78cdae4ea8e707e70ecd5a454173507f60aca2a`다. 필요한 경우 해당 소스를 별도 폴더로 export하고 같은 dependency lockfile로 build/smoke한다. 현재 사용자 폴더에 reset/clean/강제 checkout을 수행하거나 과거 build 파일을 덮어쓰지 않는다. 실제 기본 앱 cutover·rollback flag/build와 standalone manifest 갱신은 사용자 S28 검토 후 요청하는 S29 범위다.

## 사용자 review와 과학 검토 상태

실제 loader metadata 확인 결과는 8과정·86단원 모두 automated-verified/source-checked, human-reviewed 0/86이다. 이는 모든 외부 참고문헌을 이번 단계에 새로 접속했다는 뜻이 아니다. 사람·물리 전문가 검토가 남았다는 제품 표시를 유지한다.

미리보기는 `/next.html#/lab`의 기존 데이터 가져오기·workspace/DB 패널 및 각 Lab의 전체 설정/호환 context에서 확인한다.

- [ ] 원본의 시스템·정밀 값·단위·16 ODE·전체 설정과 상속/backup-only/partial 설명이 정확한가.
- [ ] 취소·손상·범위 초과 입력이 현재 작업과 원본 저장을 유지하며 백업·복구 경로를 주는가.
- [ ] 134행 matrix에 실제 새 경로·결과 비교·round trip·test·export가 연결되고 최종 누락/실패가 0인가.
- [ ] 기존 앱의 원본 복원 증거, 별도 workspace/DB 백업 및 0/86 사람 검토 상태를 확인했는가.

parity 100%·필수 migration fixture 100%·원본 손상 0·필수 검사·원격 완료 status와 사용자 review를 모두 충족해야 S29를 시작할 수 있다. 복구 안내만으로 미구현 기능을 통과시키지 않는다. 최종 S28 보고를 받은 사용자가 **29단계 실행**을 요청해야 기본 앱 전환 checkpoint 승인으로 기록한다. 구현만으로 승인·실제 cutover를 주장하지 않는다.
