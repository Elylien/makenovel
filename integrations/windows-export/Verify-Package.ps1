[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PackagePath,
    [int]$SecondsPerRun = 12
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Windows only' }
if ($SecondsPerRun -lt 5 -or $SecondsPerRun -gt 40) { throw 'SecondsPerRun must be 5..40' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$packageRoot = [IO.Path]::GetFullPath($PackagePath, $repoRoot)
$allowedRoot = Join-Path $repoRoot '.local/exports'
if (-not $packageRoot.StartsWith($allowedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Use a package under .local/exports for this smoke test.' }
$manifest = Get-Content -LiteralPath (Join-Path $packageRoot 'makenovel-export.json') -Raw | ConvertFrom-Json
$exe = Join-Path $packageRoot 'WebGAL.exe'
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne $manifest.exeSha256) { throw 'EXE differs from the export manifest' }
if ((Get-FileHash -LiteralPath (Join-Path $packageRoot 'resources/app.asar') -Algorithm SHA256).Hash -ne $manifest.asarSha256) { throw 'ASAR differs from the export manifest' }
if (Get-Process -Name WebGAL -ErrorAction SilentlyContinue | Where-Object Path -eq $exe) { throw 'This package already has a running instance; close it before testing.' }
if (Get-NetTCPConnection -State Listen -LocalPort 9 -ErrorAction SilentlyContinue) { throw 'The intentionally unreachable test proxy port 9 is in use.' }
$runId = [DateTime]::Now.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 6)
$evidenceRoot = Join-Path $repoRoot ('docs/evidence/local/round3/windows-export/player-' + $runId)
$profileRoot = Join-Path $repoRoot ('.local/exports/player-profile-' + $runId)
New-Item -ItemType Directory -Path $evidenceRoot,$profileRoot -Force | Out-Null
$windowsIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($windowsIdentity)
$isElevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$report = [ordered]@{
    packageRoot = $packageRoot; createdAt = [DateTime]::UtcNow.ToString('o');
    elevated = $isElevated; nodeOnPathRequired = $false;
    networkMode = 'Chromium fixed dead proxy 127.0.0.1:9 with implicit loopback bypass removed; OS network remains enabled';
    editorStopped = $false; gui = 'not-inspected'; runs = @()
}
foreach ($attempt in 1..2) {
    $netLog = Join-Path $evidenceRoot ('net-' + $attempt + '.json')
    $stdout = Join-Path $evidenceRoot ('stdout-' + $attempt + '.log')
    $stderr = Join-Path $evidenceRoot ('stderr-' + $attempt + '.log')
    $oldAppData = $env:APPDATA
    $oldLocalAppData = $env:LOCALAPPDATA
    $oldPath = $env:PATH
    $child = $null
    try {
        # Restrict only this child. The test does not change system/user settings,
        # the editor profile, another app's network, or another running process.
        $env:APPDATA = Join-Path $profileRoot 'Roaming'
        $env:LOCALAPPDATA = Join-Path $profileRoot 'Local'
        New-Item -ItemType Directory -Path $env:APPDATA,$env:LOCALAPPDATA -Force | Out-Null
        $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
        $launchArgs = @(
            ('--user-data-dir="' + (Join-Path $profileRoot 'chromium') + '"'),
            '--proxy-server=http://127.0.0.1:9',
            '--proxy-bypass-list="<-loopback>"',
            ('--log-net-log="' + $netLog + '"')
        )
        $child = Start-Process -FilePath $exe -ArgumentList $launchArgs -WorkingDirectory $packageRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    } finally {
        $env:APPDATA = $oldAppData
        $env:LOCALAPPDATA = $oldLocalAppData
        $env:PATH = $oldPath
    }
    try {
        Start-Sleep -Seconds $SecondsPerRun
        $child.Refresh()
        if ($child.HasExited) { throw "Player exited before inspection; see $stderr" }
        $members = @(Get-CimInstance Win32_Process | Where-Object ExecutablePath -eq $exe)
        $memberIds = @($members.ProcessId)
        $connections = @(Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object OwningProcess -in $memberIds | Select-Object State,LocalAddress,LocalPort,RemoteAddress,RemotePort,OwningProcess)
        $mainTitle = $child.MainWindowTitle
        $mainHandle = $child.MainWindowHandle.ToInt64()
        $renderLog = Get-Content -LiteralPath $stdout -Raw
        if ($renderLog -notmatch 'WebGAL v4\.6\.5' -or $renderLog -notmatch '解析场景' -or $renderLog -notmatch '获取到游戏信息') { throw 'Renderer startup evidence is incomplete; inspect the retained logs.' }
        if ($renderLog -notmatch '当前环境不支持启动编辑器同步 V1 WebSocket') { throw 'The player did not confirm its file-protocol editor-sync bypass.' }
        if (-not ($members | Where-Object CommandLine -match '--type=renderer')) { throw 'The packaged renderer process was not found.' }
        # Hidden windows intentionally do not expose .NET MainWindowHandle on
        # this host. Record controlled termination distinctly from a GUI close.
        $shutdown = 'normal-window-close'
        if (-not $child.CloseMainWindow()) {
            $shutdown = 'controlled-process-termination'
            $current = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $child.Id)
            if (-not $current -or $current.ExecutablePath -ne $exe) { throw 'Player identity changed before termination' }
            Stop-Process -Id $child.Id
        }
        if (-not $child.WaitForExit(10000)) { throw 'The player did not exit after the requested shutdown' }
        $netLogComplete = $false
        $networkEventCount = $null
        try {
            $parsedNetLog = Get-Content -LiteralPath $netLog -Raw | ConvertFrom-Json
            $networkEventCount = @($parsedNetLog.events).Count
            $netLogComplete = $true
        } catch {
            # A forced process stop may leave the native writer's tail unflushed.
        }
        $report.runs += [ordered]@{
            attempt = $attempt; pid = $child.Id; aliveAfterSeconds = $SecondsPerRun;
            mainWindowTitle = $mainTitle; mainWindowHandle = $mainHandle;
            processes = @($members | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine);
            connections = $connections; shutdown = $shutdown; exitCode = $child.ExitCode;
            rendererLoadedGame = $true; editorSyncBypassedForFileProtocol = $true;
            netLogComplete = $netLogComplete; networkEventCount = $networkEventCount;
            netLog = $netLog; stdout = $stdout; stderr = $stderr
        }
    } finally {
        if ($child -and -not $child.HasExited) {
            $current = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $child.Id)
            if ($current -and $current.ExecutablePath -eq $exe) { Stop-Process -Id $child.Id }
        }
    }
}
$report.profileCreated = @(Get-ChildItem -LiteralPath $profileRoot -Recurse -File).Count -gt 0
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'process-smoke.json') -Encoding utf8
Write-Host "Process smoke report: $evidenceRoot"
Write-Host 'Packaged renderer startup, local profile and process restart are checked. Hidden instances may need controlled termination; read the report and inspect the GUI before claiming normal close, offline gameplay or save restoration.'
