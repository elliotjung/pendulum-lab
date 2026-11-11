# S28 실행 증거 재현 입력

이 폴더는 실제 실행에 사용한 임시 생산 도구와 검토된 입력 계획의 원본 바이트를 보존한다. `manifest.json`은 각 파일의 SHA-256과 크기를 기록한다. 계획의 `executionStatus: unexecuted`는 수집 당시 상태이며 실행 성공 기록이 아니다. 최종 실행 결과와 판정은 이 폴더 밖의 실제 capture/report와 독립 인증 검사에서 확인한다.

최신 binder 기본 입력은 `S28-final-browser-capture-plan-r3.json`이다. 원래 계획·r2 계획·실행기와 실패 증거는 역사적 입력으로 그대로 보존한다. r2 계획은 Chromium g04의 capture/report/runName 세 필드를 새 시도 경로로 바꾸고, 향후 실행용 `configPath`를 별도 no-video config로 지정했다. r3는 r2에서 g04의 capture/report/runName 세 필드만 다시 새 경로로 바꾸며 config와 모든1,120개 identity는 같다. 원래 실패 capture/report를 수정하거나 성공으로 바꾸지 않는다.

기존 `s28-run-browser-groups-r2.ps1`를 재사용하되 `-PlanPath tmp/S28-final-browser-capture-plan-r3.json -ProgressPath tmp/S28-final-browser-group-progress-r3.json`을 명시한다. 실행기 자체의 기본 PlanPath는 여전히 역사적 r2이므로 r3를 생략해서 실행하지 않는다. 기존 성공 실행은 원래 capture의 시작·종료 시각과 결과를 `retained-existing-actual-execution`으로 기록하며 재사용을 새 실행으로 세지 않는다.

`s28-release-no-video-playwright.config.ts`는 원래 release config의 정확한 사본에 `use.video: 'off'` 한 줄만 추가한다. 원래 config SHA `05ea4ef1d46ac868aad6889f21f99326cda022d1742f1193f9b74acaa0048be2`는 보존한다. 먼저 통과한 3개 Chromium 그룹은 원래 `retain-on-failure` 영상 설정과 실제 원래 command를 유지하며, 나머지 9개 그룹은 새 config로 진단 영상만 끈다. assertion·timeout·axe·trace·실패 screenshot·PNG 비교 한도·worker 1·retry 0·선택된 case 목록은 바꾸지 않는다. 과거 성공 12건도 영상이 켜진 원래 설정이므로 no-video 성공으로 다시 기록하지 않는다. 별도 config는 초기화 지연의 원인을 확정했다는 주장도 아니다.

현재 패키지는 Chromium 560건과 Pixel 5 에뮬레이션 560건, 프로젝트별 44개 파일을 12개의 겹치지 않는 묶음으로 나눈다. 단위 증거 입력은 32개 파일의 724건 계획이다. 전체 416개 파일의 7,308건 실행은 별도 `final-unit-r4` 증거이며, 이후 E2E helper·PNG 변경 뒤 수행한 724건과 혼동하지 않는다. 이 수와 파일 목록은 재현 범위이며 완료·사람 검토 선언이 아니다.

## 원본 입력 복원

저장소 루트에서 다음 명령을 실행한다. 저장소 레이아웃과 모든 입력 해시를 검사한 뒤 같은 이름의 `tmp` 파일이 없을 때만 복사한다. 이미 다른 파일이 있으면 보존하고 중단한다.

```powershell
pwsh -NoProfile -File documents/redesign/parity/replay/restore-inputs.ps1
```

도구의 import와 config의 상대 경로가 `tmp` 위치를 기준으로 작성되어 있으므로 이 문서 폴더에서 TypeScript/config를 직접 실행하지 않는다. `S28-final-parity-unit-command.json`의 절대 Node 경로는 당시 환경 기록이다. 다른 컴퓨터에서는 아래와 같이 현재 `node` 실행 파일과 별도 인수 배열을 사용한다.

`documents/redesign/parity/**`는 Git `-text` 규칙으로 원시 보고서·capture·첨부·생산 입력의 바이트를 보존한다. 원시 report를 줄바꿈 변환하거나 경로를 고쳐 저장하면 기존 SHA 연결이 깨진다. 소스 SHA의 LF 정규화와 runner/export의 정확한 바이트 SHA는 다른 계약이다.

Windows에서 원시 Playwright 첨부 경로가 기본 Git 경로 길이를 넘을 수 있다. 이 경우 보고서나 첨부 이름을 바꾸지 말고 해당 Git 명령에 `-c core.longpaths=true`를 사용한다. 이번 실행에서는 실제 add 실패를 확인한 뒤 일반 Git/preflight도 동작하도록 이 저장소의 로컬 `core.longpaths=true`를 설정했다. fresh clone은 필요하면 `git -c core.longpaths=true clone ...`을 사용하고 해당 저장소에만 같은 로컬 설정을 적용한다. 원본 바이트의 CRLF를 보존한 진단 JSON에 대한 whitespace 확인은 해당 명령에서 `core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol`을 사용했다. 전역 설정은 바꾸지 않았다.

## 기존 실행의 검증과 새 실행의 구분

보관된 capture만 복사해서 새 실행으로 인증할 수 없다. 브라우저 증거 검증에는 capture에 명시된 348개 원본 build 파일과 각각의 정확한 SHA가 필요하다. validator는 원래 capture의 Node·runner 절대 경로도 현재 실행 환경과 비교하므로, 다른 저장소 경로나 Node 위치의 clone에서는 원본 build가 있어도 새 실행이 필요하다. `tmp/S28-final-production-dist-20261110-r1`은 Git 추적 대상이 아니므로 fresh clone에는 없다. 재빌드 결과를 원본 build라고 가정하거나 새 build의 capture로 기존 report를 소급 연결하지 않는다. 원본 build가 없으면 아래 새 실행 절차로 build·단위·브라우저 증거를 함께 다시 만든다.

원본 build와 첨부가 그대로 존재하고 저장소·Node·runner 실행 경로도 원래 환경과 같을 때만 검증용 출력 폴더를 따로 지정한다. validator는 capture의 실제 절대 실행 경로도 검사하므로 다른 위치의 fresh clone은 원본 build를 복사했더라도 새 capture가 필요하다. 원시 report의 절대 경로를 편집하여 이 검사를 우회하지 않는다.

```powershell
$env:S28_CERTIFICATE_OUTPUT = 'tmp/S28-certificate-replay-review'
$env:S28_BROWSER_CAPTURE_PLAN = 'tmp/S28-final-browser-capture-plan-r3.json'
node node_modules/tsx/dist/cli.mjs tmp/s28-bind-final-certificates.ts
```

새 출력 경로가 비어 있는지 먼저 확인한다. binder는 실제 report 해시·정확한 case identity·현재 source closure·공통 frozen build와 16개 필수 보존 검사를 검증한다. 각 browser 파일의 실제 `${file}-snapshots` 폴더 전체를 재귀적으로 검증하고, 해당 파일의 모든 프로젝트 snapshot 경로를 각 case의 `sourcePaths`에도 추가한다. 따라서 생성 뒤 독립 `--certify`에서도 관련 golden 변경을 탐지하며, 다른 그룹의 무관한 snapshot을 blanket 의존성으로 추가하지 않는다. 원본 certificate와 보존 ledger에 쓰지 않으려면 `S28_CERTIFICATE_OUTPUT`을 반드시 유지한다. 이 환경 변수 없이 실행하면 기본 산출물에 기록하므로 단순 열람에는 사용하지 않는다.

browser capture마다 command의 실제 `--config` 경로, 변경하지 않은 raw report의 `config.configFile`, capture의 config SHA와 현재 LF 정규화 SHA를 binder가 별도로 대조한다. 그 결과를 retained-export index의 `browserConfigurations` 영수증으로 기록한다. 이 검사는 생산기의 추가 precheck이며 기존 core certificate validator가 현재 tmp config를 다시 검사한다고 주장하지 않는다. tmp config를 case의 runtime `sourcePaths`나 동결 build의 source 목록으로 사후 추가하지 않는다.

## 격리된 새 실행

다음은 저장소 루트의 PowerShell 예시다. `S28-replay-YYYYMMDD-attempt1`을 이번 실행만의 고유 이름으로 바꾸고, 모든 산출 경로가 아직 없는지 먼저 검사한다. 저수준 `parity-capture.ts`는 경로 안전성·전후 source/build 및 실제 runner 결과를 검사하지만 기존 capture/report의 덮어쓰기를 자동 거부하는 API는 아니다. 따라서 새 경로 사전 확인은 필수다. 기존 실패 기록도 수정하거나 덮어쓰지 않는다.

```powershell
$stage28ReplayId = 'S28-replay-YYYYMMDD-attempt1'
$stage28Evidence = 'documents/redesign/parity/evidence/' + $stage28ReplayId
$stage28BuildRoot = 'tmp/' + $stage28ReplayId + '-dist'
$stage28BuildCapture = $stage28Evidence + '-build.capture.json'
$stage28UnitCapture = $stage28Evidence + '-unit.capture.json'
$stage28UnitReport = $stage28Evidence + '-unit.report.json'
foreach ($stage28Output in @($stage28BuildRoot, $stage28BuildCapture, $stage28UnitCapture, $stage28UnitReport)) {
  if (Test-Path -LiteralPath $stage28Output) { throw ('Existing output is preserved: ' + $stage28Output) }
}
node node_modules/tsx/dist/cli.mjs scripts/redesign/parity-capture.ts build --capture $stage28BuildCapture --out-dir $stage28BuildRoot --package-legacy yes
if ($LASTEXITCODE -ne 0) { throw 'Fresh build failed.' }
$stage28UnitFiles = (Get-Content -LiteralPath tmp/S28-parity-unit-file-union.json -Raw | ConvertFrom-Json).files
$stage28UnitArguments = @('node_modules/tsx/dist/cli.mjs', 'scripts/redesign/parity-capture.ts', 'vitest', '--capture', $stage28UnitCapture, '--report', $stage28UnitReport, '--', '--maxWorkers=1') + @($stage28UnitFiles)
& node @stage28UnitArguments
if ($LASTEXITCODE -ne 0) { throw 'Fresh unit execution failed.' }
```

build 명령의 `--package-legacy yes`는 원래 copier·공개 보고서 privacy 경계까지 포함한다. build와 모든 browser 실행 동안 캡처되는 소스·테스트·config·build 바이트를 고정한다. 실패하면 원인을 고치고 새로운 attempt 경로로 다시 실행한다. timeout·assertion·skip·retry·수치 golden을 성공 표시를 위해 바꾸지 않는다.

복원된 browser 계획들은 기존 증거 경로를 가리킨다. `S28-final-browser-capture-plan-r3.json`을 기준으로 새 실행용 별도 JSON 사본에서 다음 필드만 새 namespace로 바꾸고 원본 계획은 보존한다.

- `frozenBuildRoot`, `buildCapturePath`: 방금 만든 새 build와 capture.
- 각 group의 `capturePath`, `reportPath`, `runName`: 겹치지 않는 새 경로와 이름. `id`, `project`, `files`, `expectedCases`, `expectedCaseIdentities` 및 전체 수는 그대로 둔다.
- `configPath`: 사용할 `tmp` config 경로. config의 위치를 바꾸면 상대 import/testDir/webServer cwd/outputDir가 달라지므로 새 source capture에서 정확한 경로를 사용한다.

각 group은 현재 코드를 통해 다음과 같이 실행된다. `$stage28Group`은 새 계획의 group 한 개다. `S28_RELEASE_RUN`은 config가 portable 첨부 폴더를 결정하는 이름이다.

```powershell
$env:S28_BROWSER_SCOPE = 'production'
$env:S28_RELEASE_RUN = $stage28Group.runName
$env:S28_RELEASE_DIST = $stage28BuildRoot
$env:S28_RELEASE_PORT = '57531'
$env:PLAYWRIGHT_PRODUCTION_GATE = '1'
$env:PLAYWRIGHT_USE_PREVIEW = '1'
$stage28BrowserArguments = @('node_modules/tsx/dist/cli.mjs', 'scripts/redesign/parity-capture.ts', 'playwright', '--capture', $stage28Group.capturePath, '--report', $stage28Group.reportPath, '--out-dir', $stage28BuildRoot, '--build-capture', $stage28BuildCapture, '--', '--config=tmp/s28-release-no-video-playwright.config.ts', ('--project=' + $stage28Group.project), '--max-failures=1') + @($stage28Group.files)
& node @stage28BrowserArguments
if ($LASTEXITCODE -ne 0) { throw 'Fresh browser group failed; retain its capture/report/attachments.' }
```

각 group의 capture/report/log 및 `${runName}-browser-output` 폴더도 실행 전에 부재를 확인한다. 12개 group을 차례로 실행하며 한 번에 Playwright runner 하나만 사용한다. config는 worker 1·retry 0이고 기존 assertion/timeout을 사용한다. `s28-run-browser-groups.ps1`는 원래 task 계획·progress 경로가 고정된 역사적 실행기다. 최신 `s28-run-browser-groups-r2.ps1`는 `-PlanPath`와 `-ProgressPath`를 받으므로 새 계획과 새 progress 경로를 명시한다. 기존 실패 capture/report/log/첨부 경로를 거부하고 같은 build와 report SHA의 정상 capture만 유지하지만 최종 source/case/snapshot 검증은 binder가 다시 수행한다.

```powershell
pwsh -NoProfile -File tmp/s28-run-browser-groups-r2.ps1 -PlanPath tmp/S28-replay-browser-plan.json -ProgressPath tmp/S28-replay-browser-progress.json
```

모든 새 group의 실제 결과가 성공한 뒤 새 계획과 단위 capture를 지정하여 binder를 실행한다.

```powershell
$env:S28_BROWSER_CAPTURE_PLAN = 'tmp/S28-replay-browser-plan.json'
$env:S28_UNIT_CAPTURE = $stage28UnitCapture
$env:S28_CERTIFICATE_OUTPUT = 'tmp/S28-certificate-replay-review'
node node_modules/tsx/dist/cli.mjs tmp/s28-bind-final-certificates.ts
```

새 계획은 1,120개 정확한 case identity와 44개 파일/프로젝트를 모두 포함해야 한다. binder는 누락·중복·skip·failure·오래된 source/helper·다른 frozen build를 거부한다. 원본 case plan/policy의 현재 소스 계약이 달라졌다면 단순히 성공 수만 맞추지 말고 새 계약을 별도 검토한다. 새 report를 기존 certificate로 가장하지 않는다.

`s28-run-with-awake.ps1`는 Windows 실행 thread에 한정된 idle-sleep lease를 만들고 `finally`에서 이전 상태를 복구한다. 선택적인 장시간 task 실행 wrapper이며 디스플레이·잠금·사용자의 명시 sleep과 영구 전원 설정은 바꾸지 않는다. 필수 검증 범위나 사람의 승인을 대체하지 않는다.
