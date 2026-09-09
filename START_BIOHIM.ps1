$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "BioHim 4.0.2"
Set-Location -LiteralPath $PSScriptRoot

Write-Host ""
Write-Host "===============================================" -ForegroundColor DarkGreen
Write-Host "  BioHim 4.0.2 - Local Gemini Server" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor DarkGreen
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed or is not in PATH." -ForegroundColor Red
    Write-Host "Install Node.js, then run START_BIOHIM.bat again."
    Read-Host "Press Enter to close"
    exit 1
}

$key = Read-Host "Enter Gemini API key"
if ([string]::IsNullOrWhiteSpace($key)) {
    Write-Host ""
    Write-Host "ERROR: No API key was entered." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$env:GEMINI_API_KEY = $key.Trim()
$env:PORT = "8787"
$env:HOST = "127.0.0.1"
$url = "http://127.0.0.1:8787/"

Write-Host ""
Write-Host "Starting BioHim..." -ForegroundColor Green
Write-Host "The browser will open automatically when the server is ready."
Write-Host "Keep this window open while using BioHim."
Write-Host ""

# Separate hidden process waits for the local server to become reachable.
$probe = @"
`$url = '$url'
for (`$i = 0; `$i -lt 60; `$i++) {
    try {
        `$r = Invoke-WebRequest -Uri `$url -UseBasicParsing -TimeoutSec 1
        if (`$r.StatusCode -ge 200 -and `$r.StatusCode -lt 500) {
            Start-Process `$url
            exit 0
        }
    } catch {}
    Start-Sleep -Milliseconds 500
}
"@
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($probe))
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand',$encoded | Out-Null

try {
    & node "$PSScriptRoot\server.js"
    $code = $LASTEXITCODE
} catch {
    Write-Host ""
    Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
    $code = 1
}

Write-Host ""
Write-Host "BioHim server stopped (exit code $code)." -ForegroundColor Yellow
Read-Host "Press Enter to close"
exit $code
