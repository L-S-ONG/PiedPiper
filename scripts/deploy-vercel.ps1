# Deploy PiedPiper backend + frontend to Vercel (two projects).
# Prerequisites:
#   1) Node 18+ on PATH (e.g. C:\Program Files\nodejs first).
#   2) Auth: set VERCEL_TOKEN in environment, OR add VERCEL_TOKEN=... to backend\.env (gitignored).
#   3) backend\.env must contain DATABASE_URL for Neon/Postgres.
#
# Create a token: https://vercel.com/account/tokens

$ErrorActionPreference = 'Stop'
$env:Path = "C:\Program Files\nodejs;" + $env:Path

$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root 'backend\package.json'))) {
  throw "Run this script from the repo; expected backend\package.json under $root"
}
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

function Get-DotEnvValue([string]$path, [string]$key) {
  if (-not (Test-Path $path)) { return $null }
  foreach ($line in Get-Content $path) {
    $t = $line.Trim()
    if ($t -eq '' -or $t.StartsWith('#')) { continue }
    $prefix = "$key="
    if ($t.StartsWith($prefix)) {
      $v = $t.Substring($prefix.Length).Trim()
      if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) {
        $v = $v.Substring(1, $v.Length - 2)
      }
      return $v
    }
  }
  return $null
}

$token = $env:VERCEL_TOKEN
if (-not $token) { $token = Get-DotEnvValue (Join-Path $backend '.env') 'VERCEL_TOKEN' }
if (-not $token) {
  Write-Host "Set VERCEL_TOKEN (env) or add it to backend\.env — see https://vercel.com/account/tokens" -ForegroundColor Red
  exit 1
}

$dbUrl = Get-DotEnvValue (Join-Path $backend '.env') 'DATABASE_URL'
if (-not $dbUrl) {
  Write-Host "DATABASE_URL missing from backend\.env" -ForegroundColor Red
  exit 1
}

$vc = "npx", "vercel@latest"
$backendProject = "piedpiper-backend"
$frontendProject = "piedpiper-frontend"

Write-Host "Linking backend project..." -ForegroundColor Cyan
& $vc[0] $vc[1] link --yes --project $backendProject -t $token --cwd $backend | Out-Host

Write-Host "Setting DATABASE_URL on backend (production)..." -ForegroundColor Cyan
& $vc[0] $vc[1] env add DATABASE_URL production --value $dbUrl --yes --force -t $token --cwd $backend 2>&1 | Out-Host

Write-Host "Deploying backend (production)..." -ForegroundColor Cyan
$deployOut = & $vc[0] $vc[1] deploy $backend --prod --yes -t $token --format json 2>&1 | ForEach-Object { $_.ToString() }
$combined = $deployOut -join "`n"
$backendHost = $null
if ($combined -match '"url"\s*:\s*"([^"]+)"') { $backendHost = $Matches[1] }
if (-not $backendHost) {
  try {
    $d = ($deployOut | Where-Object { $_ -match '^\s*\{' }) | Select-Object -Last 1 | ConvertFrom-Json
    if ($d.url) { $backendHost = [string]$d.url }
  } catch { }
}
if (-not $backendHost) {
  Write-Host $combined
  throw "Backend deploy: could not parse deployment url."
}
if ($backendHost -notmatch '^https?://') { $backendHost = "https://$backendHost" }
Write-Host "Backend URL: $backendHost" -ForegroundColor Green

Write-Host "Linking frontend project..." -ForegroundColor Cyan
& $vc[0] $vc[1] link --yes --project $frontendProject -t $token --cwd $frontend | Out-Host

Write-Host "Setting VITE_API_URL on frontend (production)..." -ForegroundColor Cyan
& $vc[0] $vc[1] env add VITE_API_URL production --value $backendHost --yes --force -t $token --cwd $frontend 2>&1 | Out-Host

Write-Host "Deploying frontend (production)..." -ForegroundColor Cyan
$feOut = & $vc[0] $vc[1] deploy $frontend --prod --yes -t $token --format json 2>&1 | ForEach-Object { $_.ToString() }
$feCombined = $feOut -join "`n"
$feUrl = $null
if ($feCombined -match '"url"\s*:\s*"([^"]+)"') { $feUrl = $Matches[1] }
if ($feUrl) {
  if ($feUrl -notmatch '^https?://') { $feUrl = "https://$feUrl" }
  Write-Host "Frontend URL: $feUrl" -ForegroundColor Green
} else {
  Write-Host $feCombined
}
Write-Host "Done." -ForegroundColor Green
