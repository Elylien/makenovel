[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$Port = 3001,
    [switch]$Background,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion -lt [version]'7.4') { throw 'PowerShell 7.4 or newer is required.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'vendor/WebGAL_Terre/packages/terre2'
$entryPath = Join-Path $backendRoot 'dist/src/main.js'
$editorDist = Join-Path $projectRoot 'vendor/WebGAL_Terre/packages/origine2/dist'
$profileRoot = Join-Path $projectRoot '.local/editor-profile'
$runtimeRoot = Join-Path $projectRoot '.local/editor-runtime'
$statePath = Join-Path $runtimeRoot 'process.json'

function Get-ManagedProcess($State) {
    if (-not $State -or $State.entryPath -ne $entryPath) { return $null }
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$State.pid)"
    if (-not $candidate) { return $null }
    if ($candidate.Name -ne 'node.exe' -or -not $candidate.CommandLine.Contains($entryPath)) { return $null }
    $process = Get-Process -Id $State.pid -ErrorAction SilentlyContinue
    if (-not $process -or $process.StartTime.ToUniversalTime() -ne ([datetime]$State.startedAt).ToUniversalTime()) { return $null }
    return $process
}

$previousState = if (Test-Path -LiteralPath $statePath) {
    Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
} else { $null }
$previousProcess = Get-ManagedProcess $previousState
if ($Stop) {
    if ($previousProcess) {
        Stop-Process -Id $previousProcess.Id
        Wait-Process -Id $previousProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
        Write-Host "Stopped the verified Terre process $($previousProcess.Id)."
    } else {
        if ($previousState -and (Get-Process -Id $previousState.pid -ErrorAction SilentlyContinue)) {
            throw 'The recorded PID is alive but its identity does not match. No process was stopped; the state file was retained.'
        }
        Write-Host 'No matching managed Terre process is running; no process was stopped.'
    }
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
    return
}
if ($previousProcess) {
    Write-Host "Terre is already running at $($previousState.url) (PID $($previousProcess.Id))."
    return
}

foreach ($requiredPath in @($entryPath, (Join-Path $editorDist 'index.html'), (Join-Path $backendRoot 'assets/templates/WebGAL_Template/index.html'))) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Missing built file: $requiredPath. Build both locked Terre workspaces first."
    }
}
# Refuse an old upstream build which would use the author's global profile.
$builtMain = Get-Content -LiteralPath $entryPath -Raw
$builtProfile = Get-Content -LiteralPath (Join-Path $backendRoot 'dist/src/Modules/user-data/user-data.service.js') -Raw
if (-not $builtMain.Contains('WEBGAL_EDITOR_DIST') -or -not $builtMain.Contains('LocalWsAdapter') -or -not $builtProfile.Contains('WEBGAL_USER_DATA_ROOT')) {
    throw 'The backend does not contain the local-launcher patch. Apply the project patches and rebuild it first.'
}
$occupied = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($occupied) { throw "Port $Port is already in use. Choose -Port with a free port; no process was stopped." }

$null = New-Item -ItemType Directory -Path $runtimeRoot -Force
$null = New-Item -ItemType Directory -Path $profileRoot -Force
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$url = "http://127.0.0.1:$Port"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$stdoutPath = Join-Path $runtimeRoot "stdout-$stamp.log"
$stderrPath = Join-Path $runtimeRoot "stderr-$stamp.log"
$childEnvironment = @{
    WEBGAL_PORT = [string]($Port - 1)
    WEBGAL_USER_DATA_ROOT = $profileRoot
    WEBGAL_EDITOR_DIST = $editorDist
    WEBGAL_OPEN_BROWSER = '0'
    NODE_ENV = 'production'
}
$process = Start-Process -FilePath $nodePath -ArgumentList @('"' + $entryPath + '"') -WorkingDirectory $backendRoot -WindowStyle Hidden -Environment $childEnvironment -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
$state = [ordered]@{
    pid = $process.Id
    startedAt = $process.StartTime.ToUniversalTime().ToString('O')
    entryPath = $entryPath
    profileRoot = $profileRoot
    url = $url
    stdout = $stdoutPath
    stderr = $stderrPath
}
$state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        $process.Refresh()
        if ($process.HasExited) { throw "Terre exited with code $($process.ExitCode). See $stderrPath" }
        try {
            $status = Invoke-RestMethod -Uri "$url/api/userData/status" -Headers @{ Origin = $url } -TimeoutSec 1 -NoProxy
            if ($status.activeUserDataRoot -eq $profileRoot -and $status.configRoot -eq $profileRoot) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw "Terre did not report the expected isolated profile. See $stderrPath" }
    $listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $process.Id -ErrorAction Stop)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1' -or $listeners[0].LocalPort -ne $Port) {
        throw 'Terre opened an unexpected listener; stopping this process.'
    }
    Write-Host "Terre is ready: $url"
    Write-Host "Profile: $profileRoot"
    Write-Host "PID: $($process.Id); stop with: pwsh -NoLogo -NoProfile -File scripts/Start-Editor.ps1 -Stop"
    if (-not $Background) { Wait-Process -Id $process.Id }
} catch {
    $managedProcess = Get-ManagedProcess ([pscustomobject]$state)
    if ($managedProcess) { Stop-Process -Id $managedProcess.Id }
    throw
} finally {
    if (-not $Background) {
        $managedProcess = Get-ManagedProcess ([pscustomobject]$state)
        if ($managedProcess) { Stop-Process -Id $managedProcess.Id }
    }
}
