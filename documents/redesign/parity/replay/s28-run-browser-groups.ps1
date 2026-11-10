param([string]$OnlyGroup = '')
$ErrorActionPreference = 'Stop'
$stage28Plan = Get-Content -LiteralPath tmp/S28-final-browser-capture-plan.json -Raw | ConvertFrom-Json
$stage28Build = Get-Content -LiteralPath $stage28Plan.buildCapturePath -Raw | ConvertFrom-Json
if (-not $stage28Build.valid -or $stage28Build.exitCode -ne 0) { throw 'A valid frozen production build is required.' }
$stage28Node = (Get-Command node).Source
$stage28ProgressPath = 'tmp/S28-final-browser-group-progress.json'
$stage28Records = [Collections.Generic.List[object]]::new()
if (Test-Path -LiteralPath $stage28ProgressPath) {
  $stage28Prior = Get-Content -LiteralPath $stage28ProgressPath -Raw | ConvertFrom-Json
  foreach ($stage28Record in $stage28Prior.records) { $stage28Records.Add($stage28Record) }
}
foreach ($stage28Group in $stage28Plan.groups) {
  if ($OnlyGroup -and $stage28Group.id -ne $OnlyGroup) { continue }
  if (Test-Path -LiteralPath $stage28Group.capturePath) {
    $stage28Existing = Get-Content -LiteralPath $stage28Group.capturePath -Raw | ConvertFrom-Json
    if ($stage28Existing.valid -and $stage28Existing.exitCode -eq 0 -and $stage28Existing.build.fingerprint -eq $stage28Build.build.fingerprint -and (Test-Path -LiteralPath $stage28Existing.report.path) -and (Get-FileHash -LiteralPath $stage28Existing.report.path -Algorithm SHA256).Hash.ToLowerInvariant() -eq $stage28Existing.report.sha256) {
      Write-Output "Retained completed actual capture $($stage28Group.id); final strict source/identity validation remains required."
      continue
    }
    throw "Existing failed or changed evidence for $($stage28Group.id) must be preserved and given an explicit new attempt path."
  }
  $env:S28_BROWSER_SCOPE = 'production'
  $env:S28_RELEASE_RUN = $stage28Group.runName
  $env:S28_RELEASE_DIST = $stage28Plan.frozenBuildRoot
  $env:S28_RELEASE_PORT = '57531'
  $env:PLAYWRIGHT_PRODUCTION_GATE = '1'
  $env:PLAYWRIGHT_USE_PREVIEW = '1'
  $stage28Log = "tmp/$($stage28Group.runName).log"
  if (Test-Path -LiteralPath $stage28Log) { throw "Existing log is not overwritten: $stage28Log" }
  $stage28Args = @('node_modules/tsx/dist/cli.mjs','scripts/redesign/parity-capture.ts','playwright','--capture',$stage28Group.capturePath,'--report',$stage28Group.reportPath,'--out-dir',$stage28Plan.frozenBuildRoot,'--build-capture',$stage28Plan.buildCapturePath,'--',"--config=$($stage28Plan.configPath)","--project=$($stage28Group.project)",'--max-failures=1') + @($stage28Group.files)
  $stage28Start = [DateTime]::UtcNow.ToString('o')
  Write-Output "Starting $($stage28Group.id): $($stage28Group.expectedCases) cases in $($stage28Group.files.Count) files"
  & $stage28Node @stage28Args *> $stage28Log
  $stage28Code = $LASTEXITCODE
  $stage28Capture = Get-Content -LiteralPath $stage28Group.capturePath -Raw | ConvertFrom-Json
  $stage28Passed = 0
  if (Test-Path -LiteralPath $stage28Group.reportPath) {
    $stage28Report = Get-Content -LiteralPath $stage28Group.reportPath -Raw | ConvertFrom-Json
    $stage28Passed = $stage28Report.stats.expected
  }
  $stage28Records.Add([pscustomobject]@{id=$stage28Group.id;runName=$stage28Group.runName;project=$stage28Group.project;startedAt=$stage28Start;finishedAt=[DateTime]::UtcNow.ToString('o');exitCode=$stage28Code;captureValid=$stage28Capture.valid;passed=$stage28Passed;expectedCases=$stage28Group.expectedCases;capturePath=$stage28Group.capturePath;reportPath=$stage28Group.reportPath;log=$stage28Log;logSha256=(Get-FileHash -LiteralPath $stage28Log -Algorithm SHA256).Hash.ToLowerInvariant()})
  [pscustomobject]@{schema='pendulum-s28-browser-group-progress/v1';expectedCases=1120;records=$stage28Records.ToArray();certificationComplete=$false} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $stage28ProgressPath
  Write-Output "Finished $($stage28Group.id): exit=$stage28Code valid=$($stage28Capture.valid) passed=$stage28Passed/$($stage28Group.expectedCases)"
  if ($stage28Code -ne 0 -or -not $stage28Capture.valid -or $stage28Passed -ne $stage28Group.expectedCases) {
    Get-Content -LiteralPath $stage28Log -Tail 55
    throw "Required group $($stage28Group.id) failed; source and all actual evidence are retained."
  }
}
Write-Output 'All requested group processes completed; independent certificate validation and final status push are still required.'
