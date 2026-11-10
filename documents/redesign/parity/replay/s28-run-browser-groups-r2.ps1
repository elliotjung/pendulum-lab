param(
  [string]$PlanPath = 'tmp/S28-final-browser-capture-plan-r2.json',
  [string]$ProgressPath = 'tmp/S28-final-browser-group-progress-r2.json',
  [string]$OnlyGroup = ''
)
$ErrorActionPreference = 'Stop'
$stage28RetryRoot = [IO.Path]::GetFullPath((Get-Location).Path)
function Resolve-S28RetryPath([string]$Relative) {
  if (-not $Relative -or [IO.Path]::IsPathRooted($Relative) -or $Relative.Contains('\') -or $Relative -match '(^|/)(\.|\.\.|)($|/)') {
    throw "Unsafe task path: $Relative"
  }
  $stage28Resolved = [IO.Path]::GetFullPath((Join-Path $stage28RetryRoot $Relative))
  if (-not $stage28Resolved.StartsWith($stage28RetryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Task path escapes repository: $Relative"
  }
  $stage28Ancestor = $stage28Resolved
  while ($stage28Ancestor -and $stage28Ancestor -ne $stage28RetryRoot) {
    if ((Test-Path -LiteralPath $stage28Ancestor) -and ((Get-Item -LiteralPath $stage28Ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "Task path traverses a reparse point: $Relative"
    }
    $stage28Ancestor = [IO.Path]::GetDirectoryName($stage28Ancestor)
  }
  return $stage28Resolved
}
function Get-S28RetrySha([string]$Relative) {
  return (Get-FileHash -LiteralPath (Resolve-S28RetryPath $Relative) -Algorithm SHA256).Hash.ToLowerInvariant()
}
$stage28Plan = Get-Content -LiteralPath (Resolve-S28RetryPath $PlanPath) -Raw | ConvertFrom-Json -Depth 80
if ($stage28Plan.schema -ne 'pendulum-s28-browser-capture-plan/v1' -or $stage28Plan.expectedTotalCases -ne 1120 -or $stage28Plan.groups.Count -ne 12) {
  throw 'The exact reviewed twelve-group 1120-case plan is required.'
}
[void](Resolve-S28RetryPath $ProgressPath)
if (-not $ProgressPath.StartsWith('tmp/') -or $ProgressPath -eq 'tmp/S28-final-browser-group-progress.json') {
  throw 'Retry progress must use a separate tmp path.'
}
$stage28Build = Get-Content -LiteralPath (Resolve-S28RetryPath $stage28Plan.buildCapturePath) -Raw | ConvertFrom-Json -Depth 80
$stage28BuildCaptureSha = Get-S28RetrySha $stage28Plan.buildCapturePath
if (-not $stage28Build.valid -or $stage28Build.exitCode -ne 0 -or $stage28Build.kind -ne 'build' -or $stage28Build.errors.Count -ne 0 -or $stage28Build.build.root -ne $stage28Plan.frozenBuildRoot) {
  throw 'A valid matching frozen production build is required.'
}
# Check all original frozen output bytes once before any retained execution is recorded.
foreach ($stage28Output in $stage28Build.build.files) {
  $stage28OutputPath = $stage28Plan.frozenBuildRoot + '/' + $stage28Output.path
  if ((Get-S28RetrySha $stage28OutputPath) -ne $stage28Output.sha256) { throw "Frozen build bytes changed: $stage28OutputPath" }
}
$stage28Node = (Get-Command node).Source
$stage28Records = [Collections.Generic.List[object]]::new()
if (Test-Path -LiteralPath $ProgressPath) {
  $stage28Prior = Get-Content -LiteralPath $ProgressPath -Raw | ConvertFrom-Json -Depth 12
  if ($stage28Prior.schema -ne 'pendulum-s28-browser-group-progress/v1' -or $stage28Prior.plan.path -ne $PlanPath -or $stage28Prior.plan.sha256 -ne (Get-S28RetrySha $PlanPath)) {
    throw 'Existing retry progress belongs to a different plan; it is preserved.'
  }
  foreach ($stage28Record in $stage28Prior.records) { $stage28Records.Add($stage28Record) }
}
function Save-S28RetryProgress {
  [pscustomobject]@{
    schema='pendulum-s28-browser-group-progress/v1'
    plan=[pscustomobject]@{path=$PlanPath;sha256=(Get-S28RetrySha $PlanPath)}
    expectedCases=1120
    records=$stage28Records.ToArray()
    certificationComplete=$false
  } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $ProgressPath -Encoding utf8NoBOM
}
function Read-S28SuccessfulExecution($Group) {
  $stage28Capture = Get-Content -LiteralPath (Resolve-S28RetryPath $Group.capturePath) -Raw | ConvertFrom-Json -Depth 80
  if (-not $stage28Capture.valid -or $stage28Capture.exitCode -ne 0 -or $stage28Capture.kind -ne 'playwright' -or $stage28Capture.errors.Count -ne 0 -or
      $stage28Capture.report.path -ne $Group.reportPath -or $stage28Capture.build.root -ne $stage28Plan.frozenBuildRoot -or
      $stage28Capture.build.fingerprint -ne $stage28Build.build.fingerprint -or $stage28Capture.buildCapture.path -ne $stage28Plan.buildCapturePath -or
      $stage28Capture.buildCapture.sha256 -ne $stage28BuildCaptureSha -or (Get-S28RetrySha $Group.reportPath) -ne $stage28Capture.report.sha256) {
    throw "Existing failed or changed evidence is preserved; assign a new attempt path: $($Group.id)"
  }
  $stage28Report = Get-Content -LiteralPath (Resolve-S28RetryPath $Group.reportPath) -Raw | ConvertFrom-Json -Depth 80
  if ($stage28Report.stats.expected -ne $Group.expectedCases -or $stage28Report.stats.skipped -ne 0 -or $stage28Report.stats.unexpected -ne 0 -or $stage28Report.stats.flaky -ne 0 -or $stage28Report.errors.Count -ne 0) {
    throw "Existing report is not a clean complete actual execution: $($Group.id)"
  }
  return [pscustomobject]@{capture=$stage28Capture;report=$stage28Report}
}
foreach ($stage28Group in $stage28Plan.groups) {
  if ($OnlyGroup -and $stage28Group.id -ne $OnlyGroup) { continue }
  [void](Resolve-S28RetryPath $stage28Group.capturePath)
  [void](Resolve-S28RetryPath $stage28Group.reportPath)
  $stage28Log = "tmp/$($stage28Group.runName).log"
  [void](Resolve-S28RetryPath $stage28Log)
  if ($stage28Group.runName -notmatch '^[A-Za-z0-9-]+$') { throw 'Unsafe runner namespace.' }
  if (Test-Path -LiteralPath $stage28Group.capturePath) {
    $stage28Actual = Read-S28SuccessfulExecution $stage28Group
    if (-not @($stage28Records | Where-Object { $_.id -eq $stage28Group.id -and $_.capturePath -eq $stage28Group.capturePath }).Count) {
      $stage28Records.Add([pscustomobject]@{
        id=$stage28Group.id;runName=$stage28Group.runName;project=$stage28Group.project
        executionDisposition='retained-existing-actual-execution'
        retainedAt=[DateTime]::UtcNow.ToString('o')
        startedAt=$stage28Actual.capture.startedAt;finishedAt=$stage28Actual.capture.finishedAt
        exitCode=$stage28Actual.capture.exitCode;captureValid=$stage28Actual.capture.valid
        passed=$stage28Actual.report.stats.expected;expectedCases=$stage28Group.expectedCases
        capturePath=$stage28Group.capturePath;captureSha256=(Get-S28RetrySha $stage28Group.capturePath)
        reportPath=$stage28Group.reportPath;reportSha256=$stage28Actual.capture.report.sha256
        log=$stage28Log;logSha256=$(if (Test-Path -LiteralPath $stage28Log) { Get-S28RetrySha $stage28Log } else { $null })
      })
      Save-S28RetryProgress
    }
    Write-Output "Retained actual successful capture $($stage28Group.id) ($($stage28Actual.report.stats.expected) cases); no new execution is asserted. Final strict case/source/snapshot validation remains required."
    continue
  }
  $stage28AttachmentDirectory = "documents/redesign/parity/evidence/$($stage28Group.runName)-browser-output"
  foreach ($stage28FreshPath in @($stage28Group.reportPath,$stage28Log,$stage28AttachmentDirectory)) {
    if (Test-Path -LiteralPath (Resolve-S28RetryPath $stage28FreshPath)) { throw "Existing output is preserved: $stage28FreshPath" }
  }
  $env:S28_BROWSER_SCOPE = 'production'
  $env:S28_RELEASE_RUN = $stage28Group.runName
  $env:S28_RELEASE_DIST = $stage28Plan.frozenBuildRoot
  $env:S28_RELEASE_PORT = '57531'
  $env:PLAYWRIGHT_PRODUCTION_GATE = '1'
  $env:PLAYWRIGHT_USE_PREVIEW = '1'
  $stage28Args = @('node_modules/tsx/dist/cli.mjs','scripts/redesign/parity-capture.ts','playwright','--capture',$stage28Group.capturePath,'--report',$stage28Group.reportPath,'--out-dir',$stage28Plan.frozenBuildRoot,'--build-capture',$stage28Plan.buildCapturePath,'--',"--config=$($stage28Plan.configPath)","--project=$($stage28Group.project)",'--max-failures=1') + @($stage28Group.files)
  Write-Output "Starting $($stage28Group.id): $($stage28Group.expectedCases) cases in $($stage28Group.files.Count) files"
  & $stage28Node @stage28Args *> $stage28Log
  $stage28Code = $LASTEXITCODE
  $stage28Capture = Get-Content -LiteralPath $stage28Group.capturePath -Raw | ConvertFrom-Json -Depth 80
  $stage28Passed = 0
  if (Test-Path -LiteralPath $stage28Group.reportPath) {
    $stage28Report = Get-Content -LiteralPath $stage28Group.reportPath -Raw | ConvertFrom-Json -Depth 80
    $stage28Passed = $stage28Report.stats.expected
  }
  $stage28Records.Add([pscustomobject]@{
    id=$stage28Group.id;runName=$stage28Group.runName;project=$stage28Group.project
    executionDisposition='new-actual-execution'
    startedAt=$stage28Capture.startedAt;finishedAt=$stage28Capture.finishedAt
    exitCode=$stage28Code;captureValid=$stage28Capture.valid
    passed=$stage28Passed;expectedCases=$stage28Group.expectedCases
    capturePath=$stage28Group.capturePath;captureSha256=(Get-S28RetrySha $stage28Group.capturePath)
    reportPath=$stage28Group.reportPath;reportSha256=$stage28Capture.report.sha256
    log=$stage28Log;logSha256=(Get-S28RetrySha $stage28Log)
  })
  Save-S28RetryProgress
  Write-Output "Finished $($stage28Group.id): exit=$stage28Code valid=$($stage28Capture.valid) passed=$stage28Passed/$($stage28Group.expectedCases)"
  if ($stage28Code -ne 0 -or -not $stage28Capture.valid -or $stage28Passed -ne $stage28Group.expectedCases) {
    Get-Content -LiteralPath $stage28Log -Tail 55
    throw "Required group $($stage28Group.id) failed; source and all actual evidence are retained."
  }
  [void](Read-S28SuccessfulExecution $stage28Group)
}
Write-Output 'All requested group processes completed; independent certificate validation and final status push are still required.'
