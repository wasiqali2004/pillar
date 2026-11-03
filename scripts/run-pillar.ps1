# Keeps Pillar running 24/7. Registered as the "Pillar Dashboard" scheduled task
# (at logon, restarts on failure). Serves the production build on port 3001,
# restarts it if it dies. The server keeps every source current by itself (see
# lib/sync/scheduler.ts), so keeping it running is all this needs to do.

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "pillar.log"
function Log($m) { "$(Get-Date -Format s) $m" | Add-Content $log }

# Load .env.local for the refresh key.
$key = $null
Get-Content (Join-Path $root ".env.local") | ForEach-Object {
    if ($_ -match '^\s*PILLAR_CRON_SECRET\s*=\s*"?([^"#]*)"?') { $key = $Matches[1].Trim() }
}

$port = 3001
$server = $null
$lastRefresh = [datetime]::MinValue

while ($true) {
    if (-not $server -or $server.HasExited) {
        Log "starting server"
        $server = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "start" `
            -WorkingDirectory $root -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logDir "server.out.log") `
            -RedirectStandardError (Join-Path $logDir "server.err.log")
        Start-Sleep -Seconds 15
    }
    if (((Get-Date) - $lastRefresh).TotalMinutes -ge 10) {
        $lastRefresh = Get-Date
        try {
            $r = Invoke-RestMethod -Method Post -Uri "http://localhost:$port/api/refresh" `
                -Headers @{ "x-pillar-key" = $key } -TimeoutSec 120
            Log "refresh ok=$($r.ok) failed=$($r.failed) skipped=$($r.skipped)"
        } catch { Log "refresh failed: $($_.Exception.Message)" }
    }
    Start-Sleep -Seconds 30
}
