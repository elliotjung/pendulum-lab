param([Parameter(Mandatory = $true)][string]$CommandFile)
$ErrorActionPreference = 'Stop'
$stage28Command = Get-Content -LiteralPath $CommandFile -Raw | ConvertFrom-Json
if (-not $stage28Command.file -or $null -eq $stage28Command.args) { throw 'A task executable and argument array are required.' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace S28Task {
  public static class PowerLease {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint flags);
  }
}
'@
# A thread-scoped idle-sleep request only; display, lock and explicit sleep remain user controlled.
$stage28PreviousExecutionState = [S28Task.PowerLease]::SetThreadExecutionState([uint32]2147483649)
if ($stage28PreviousExecutionState -eq 0) { throw 'The temporary task power request was not accepted.' }
$stage28ExitCode = 1
try {
  $stage28NativeArguments = [string[]]$stage28Command.args
  & ([string]$stage28Command.file) @stage28NativeArguments
  $stage28ExitCode = $LASTEXITCODE
} finally {
  [void][S28Task.PowerLease]::SetThreadExecutionState($stage28PreviousExecutionState)
}
exit $stage28ExitCode
