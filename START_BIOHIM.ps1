$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "BioHim 4.2"
Set-Location -LiteralPath $PSScriptRoot

Write-Host ""
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host "  BioHim 4.2 - AI Gateway" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed or is not in PATH." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$env:PORT = "8787"
$env:HOST = "127.0.0.1"
$url = "http://127.0.0.1:8787/"

Write-Host "Primary AI: Puter (no shared API key required)." -ForegroundColor Green
Write-Host "Optional fallback: your own Gemini or Groq key in AI settings."
Write-Host "The browser will open automatically. Keep this window open."
Write-Host ""

$probe = @"
`$url = '$url'
for (`$i = 0; `$i -lt 60; `$i++) {
    try {
        `$r = Invoke-WebRequest -Uri `$url -UseBasicParsing -TimeoutSec 1
        if (`$r.StatusCode -ge 200 -and `$r.StatusCode -lt 500) { Start-Process `$url; exit 0 }
    } catch {}
    Start-Sleep -Milliseconds 500
}
"@
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($probe))
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand',$encoded | Out-Null

try { & node "$PSScriptRoot\server.js"; $code=$LASTEXITCODE } catch { Write-Host ("ERROR: "+$_.Exception.Message) -ForegroundColor Red; $code=1 }
Write-Host ""
Write-Host "BioHim server stopped (exit code $code)." -ForegroundColor Yellow
Read-Host "Press Enter to close"
exit $code
