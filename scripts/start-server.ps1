# Launched at login by the "Pillar Dashboard" scheduled task (see AGENTS.md /
# project memory for how it was registered). Runs the dev server hidden, with
# output captured to logs/ so a crash on boot is diagnosable after the fact
# instead of vanishing with the console window nobody saw.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$out = Join-Path $logDir "dev-$stamp.out.log"
$err = Join-Path $logDir "dev-$stamp.err.log"

# Keep only the 10 most recent log pairs so this doesn't grow forever.
Get-ChildItem $logDir -Filter "dev-*.log" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 20 |
    Remove-Item -Force -ErrorAction SilentlyContinue

Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" `
    -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err
