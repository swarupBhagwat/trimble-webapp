Set-Location $PSScriptRoot
$port = (Select-String -Path .env -Pattern '^PORT=(\d+)' | ForEach-Object { $_.Matches[0].Groups[1].Value }) | Select-Object -First 1
if (-not $port) { $port = 3000 }
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) { $cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe" }

$log = Join-Path $env:TEMP "bd-tunnel-$PID.log"
$tunnel = Start-Process $cf -ArgumentList "tunnel", "--url", "http://localhost:$port" -RedirectStandardError $log -NoNewWindow -PassThru

try {
  $url = $null
  for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep -Milliseconds 500
    $hit = Select-String -Path $log -Pattern 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { $url = $hit.Matches[0].Value }
  }
  if (-not $url) { throw "No tunnel URL after 30s, see $log" }

  Write-Host "`n  App:   $url" -ForegroundColor Green
  Write-Host "  BIMx:  $url/bd-4d.bimxx`n" -ForegroundColor Green

  $env:PUBLIC_URL = $url
  while ($true) {
    node --env-file=.env server.js
    Write-Host "Server stopped (exit $LASTEXITCODE), restarting in 3s - same link. Ctrl+C to quit." -ForegroundColor Yellow
    Start-Sleep 3
  }
} finally {
  Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
}
