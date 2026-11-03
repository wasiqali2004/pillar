# Puts Pillar online on Fly.io, or ships an update. Safe to run again: it only
# creates what's missing, and keeps the secrets it generated the first time.
param([string]$App = "")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$fly = (Get-Command fly -ErrorAction SilentlyContinue).Source
if (-not $fly) { $fly = Join-Path $HOME ".fly\bin\flyctl.exe" }
if (-not (Test-Path $fly)) {
  Write-Host "Installing Fly's command-line tool from fly.io..."
  Invoke-RestMethod https://fly.io/install.ps1 | Invoke-Expression
}

function Invoke-Fly {
  # Windows PowerShell turns any stderr from a tool into a stop under "Stop".
  $ErrorActionPreference = "Continue"
  & $fly @args
}

Invoke-Fly auth whoami 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Your browser will open. Sign in, or create a Fly.io account and add a card there."
  Invoke-Fly auth login
  if ($LASTEXITCODE -ne 0) { throw "Fly sign-in didn't finish." }
}

function Read-EnvFile($path) {
  $map = @{}
  if (Test-Path $path) {
    foreach ($line in Get-Content $path) {
      if ($line -match '^\s*([A-Z_0-9]+)=(.*)$') { $map[$Matches[1]] = $Matches[2].Trim().Trim('"') }
    }
  }
  return $map
}
function New-Secret($bytes) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return ([BitConverter]::ToString($b) -replace '-', '').ToLower()
}

$saved = Read-EnvFile ".env.fly"
$homeEnv = Read-EnvFile ".env.local"

if (-not $App) { $App = $saved["FLY_APP"] }
if (-not $App) { $App = "pillar-app" }

# Create the app, trying another address if this one is taken.
$apps = Invoke-Fly apps list --json 2>$null | Out-String | ConvertFrom-Json
if (-not ($apps | Where-Object { $_.Name -eq $App -or $_.ID -eq $App })) {
  $created = $false
  foreach ($name in @($App, "pillar-life", "pillar-daily", "pillar-$(New-Secret 2)")) {
    Invoke-Fly apps create $name 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $App = $name; $created = $true; break }
  }
  if (-not $created) { throw "Couldn't create a Fly app." }
}
$url = "https://$App.fly.dev"

if (-not $saved["PILLAR_OWNER_EMAIL"]) { $saved["PILLAR_OWNER_EMAIL"] = (Read-Host "Email you'll sign up with (this makes you the owner)").Trim() }
if (-not $saved["PILLAR_CONTACT_EMAIL"]) { $saved["PILLAR_CONTACT_EMAIL"] = (Read-Host "Email to show on the Privacy and Terms pages").Trim() }
if (-not $saved["PILLAR_SECRET"]) { $saved["PILLAR_SECRET"] = New-Secret 32 }
if (-not $saved["CRON_SECRET"]) { $saved["CRON_SECRET"] = New-Secret 32 }
if (-not $saved["PILLAR_INVITE_CODE"]) { $saved["PILLAR_INVITE_CODE"] = New-Secret 6 }
$saved["FLY_APP"] = $App
$saved.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" } | Set-Content .env.fly -Encoding ascii

$secrets = [ordered]@{
  PILLAR_URL = $url
  PILLAR_OWNER_EMAIL = $saved["PILLAR_OWNER_EMAIL"]
  PILLAR_CONTACT_EMAIL = $saved["PILLAR_CONTACT_EMAIL"]
  PILLAR_INVITE_CODE = $saved["PILLAR_INVITE_CODE"]
  PILLAR_SECRET = $saved["PILLAR_SECRET"]
  CRON_SECRET = $saved["CRON_SECRET"]
  GOOGLE_HEALTH_REDIRECT_URI = "$url/api/auth/google-health/callback"
}
# Whatever optional keys are filled in at home come along. .env.fly wins.
foreach ($k in "GOOGLE_HEALTH_CLIENT_ID", "GOOGLE_HEALTH_CLIENT_SECRET", "ANTHROPIC_API_KEY", "PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV", "RESEND_API_KEY", "MAIL_FROM") {
  $v = if ($saved[$k]) { $saved[$k] } else { $homeEnv[$k] }
  if ($v) { $secrets[$k] = $v }
}
# Through stdin, so no key appears on a command line or in the terminal.
($secrets.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n" | Invoke-Fly secrets import --stage -a $App | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Couldn't save the secrets on Fly." }

Invoke-Fly deploy -a $App --ha=false --remote-only
if ($LASTEXITCODE -ne 0) { throw "The deploy failed. Nothing about the running site changed." }

Write-Host ""
Write-Host "Checking it from the outside..."
node scripts/smoke.mjs $url

Write-Host ""
Write-Host "Pillar is live: $url"
Write-Host "Your sign-up link: $url/signup?invite=$($saved['PILLAR_INVITE_CODE'])"
Write-Host "Add this to your Google client's redirect URIs so Fitbit can connect:"
Write-Host "  $url/api/auth/google-health/callback"
