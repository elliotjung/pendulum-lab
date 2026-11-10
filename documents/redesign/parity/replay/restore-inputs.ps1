param()
$ErrorActionPreference = 'Stop'
$stage28Repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$stage28ActualRoot = (& git -C $stage28Repository rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($stage28ActualRoot) -ne $stage28Repository) {
  throw 'Run this package from the Pendulum Lab repository root layout.'
}
$stage28Manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
if ($stage28Manifest.schema -ne 'pendulum-s28-replay-inputs/v1') { throw 'Unknown replay manifest.' }
$stage28TemporaryRoot = Join-Path $stage28Repository 'tmp'
[void](New-Item -ItemType Directory -Path $stage28TemporaryRoot -Force)
# Preflight every input before making any copy. Existing different files are user work.
foreach ($stage28Input in $stage28Manifest.files) {
  if ($stage28Input.name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or $stage28Input.source -ne ('tmp/' + $stage28Input.name)) {
    throw 'Unsafe replay input path.'
  }
  $stage28Source = Join-Path $PSScriptRoot $stage28Input.name
  $stage28Destination = Join-Path $stage28TemporaryRoot $stage28Input.name
  if ((Get-FileHash -LiteralPath $stage28Source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $stage28Input.sha256) {
    throw "Archived input hash mismatch: $($stage28Input.name)"
  }
  if ((Test-Path -LiteralPath $stage28Destination) -and
      (Get-FileHash -LiteralPath $stage28Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $stage28Input.sha256) {
    throw "Existing different tmp input is preserved: $($stage28Input.name)"
  }
}
foreach ($stage28Input in $stage28Manifest.files) {
  $stage28Destination = Join-Path $stage28TemporaryRoot $stage28Input.name
  if (-not (Test-Path -LiteralPath $stage28Destination)) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $stage28Input.name) -Destination $stage28Destination
  }
  if ((Get-FileHash -LiteralPath $stage28Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $stage28Input.sha256) {
    throw "Restored input hash mismatch: $($stage28Input.name)"
  }
}
Write-Output 'Exact replay inputs are available in tmp; no build, tests, evidence binding or Git changes were run.'
