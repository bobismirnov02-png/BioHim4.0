$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "BioHim 4.0.2"
Set-Location -LiteralPath $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)) {
    Write-Host "GEMINI_API_KEY is not set." -ForegroundColor Red
    Write-Host "Use START_BIOHIM.bat to enter the key interactively."
    Read-Host "Press Enter to close"
    exit 1
}
$env:PORT = "8787"
$env:HOST = "127.0.0.1"
$url = "http://127.0.0.1:8787/"
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
& node "$PSScriptRoot\server.js"
$code = $LASTEXITCODE
Read-Host "Press Enter to close"
exit $code
