param([string]$Ffmpeg = $env:IMAGEIO_FFMPEG_EXE)

$ErrorActionPreference = 'Stop'
if (-not $Ffmpeg) {
  $command = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($command) { $Ffmpeg = $command.Source }
}
if (-not $Ffmpeg -or -not (Test-Path -LiteralPath $Ffmpeg)) {
  throw 'ffmpeg was not found. Pass -Ffmpeg <path> or set IMAGEIO_FFMPEG_EXE.'
}

Add-Type -AssemblyName System.Speech
$sentences = @(
  Get-Content -LiteralPath (Join-Path $PSScriptRoot 'demo-narration-ko.txt') -Encoding utf8 |
    Where-Object { $_.Trim() }
)

$reports = Join-Path $PSScriptRoot '..\reports'
$temp = Join-Path $env:TEMP ('pendulum-demo-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $reports -Force | Out-Null
New-Item -ItemType Directory -Path $temp -Force | Out-Null

function Get-WaveDuration([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $byteRate = [BitConverter]::ToInt32($bytes, 28)
  $offset = 12
  while ($offset + 8 -le $bytes.Length) {
    $id = [Text.Encoding]::ASCII.GetString($bytes, $offset, 4)
    $size = [BitConverter]::ToInt32($bytes, $offset + 4)
    if ($id -eq 'data') { return [double]$size / [double]$byteRate }
    $offset += 8 + $size + ($size % 2)
  }
  throw "WAV data chunk missing: $Path"
}

function Format-VttTime([double]$Seconds) {
  $span = [TimeSpan]::FromSeconds($Seconds)
  return ('{0:00}:{1:00}:{2:00}.{3:000}' -f [math]::Floor($span.TotalHours), $span.Minutes, $span.Seconds, $span.Milliseconds)
}

try {
  $voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $voice.SelectVoice('Microsoft Heami Desktop')
  # Keep the final walkthrough in the 1-2 minute portfolio window.
  $voice.Rate = 7
  $clips = @()
  $durations = @()
  for ($index = 0; $index -lt $sentences.Count; $index += 1) {
    $clip = Join-Path $temp ('clip-{0:00}.wav' -f $index)
    $voice.SetOutputToWaveFile($clip)
    $voice.Speak($sentences[$index])
    $voice.SetOutputToNull()
    $clips += $clip
    $durations += Get-WaveDuration $clip
  }
  $voice.Dispose()

  $concat = Join-Path $temp 'concat.txt'
  $clips | ForEach-Object { "file '$($_.Replace("'", "''"))'" } | Set-Content -LiteralPath $concat -Encoding ascii
  $audio = Join-Path $temp 'narration.wav'
  & $Ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i $concat -c:a pcm_s16le -y $audio
  if ($LASTEXITCODE -ne 0) { throw 'ffmpeg could not concatenate narration clips.' }

  $vtt = @('WEBVTT', '')
  $elapsed = 0.0
  for ($index = 0; $index -lt $sentences.Count; $index += 1) {
    $start = $elapsed
    $elapsed += [double]$durations[$index]
    $vtt += "$(Format-VttTime $start) --> $(Format-VttTime $elapsed)"
    $vtt += $sentences[$index]
    $vtt += ''
  }
  $vtt = $vtt[0..($vtt.Count - 2)]
  $vtt | Set-Content -LiteralPath (Join-Path $reports 'demo-narrated-ko.vtt') -Encoding utf8
  @(
    '# Pendulum Lab narrated demo transcript', '',
    "Duration: $([math]::Round($elapsed, 1)) seconds", '',
    'Language: Korean (`ko-KR`)', '',
    'This transcript is generated from the same sentence list as the committed WebVTT captions.', '',
    ($sentences -join "`n`n")
  ) | Set-Content -LiteralPath (Join-Path $reports 'demo-narrated-ko.md') -Encoding utf8

  $video = Join-Path $reports 'demo-narrated-ko.mp4'
  $gif = Join-Path $reports 'walkthrough-30s.gif'
  & $Ffmpeg -hide_banner -loglevel error -stream_loop -1 -i $gif -i $audio `
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x071018" `
    -t $elapsed -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -r 30 `
    -c:a aac -b:a 160k -shortest -movflags +faststart -y $video
  if ($LASTEXITCODE -ne 0) { throw 'ffmpeg could not render the narrated demo.' }
  Write-Host "Wrote reports/demo-narrated-ko.mp4 ($([math]::Round($elapsed, 1)) seconds) plus WebVTT and transcript."
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
