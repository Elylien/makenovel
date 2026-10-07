[CmdletBinding()]
param(
    [string]$GamePath = '.local/editor-profile/games/makenovel-round2',
    [string]$OutputName = 'MakeNovel 离线样片',
    [switch]$RebuildShell
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'The first export target is Windows x64.' }
if ($OutputName.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0 -or $OutputName -in '.', '..' -or [string]::IsNullOrWhiteSpace($OutputName)) { throw 'OutputName must be a single nonempty directory name.' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRoot = [IO.Path]::GetFullPath($GamePath, $repoRoot)
$terreRoot = Join-Path $repoRoot 'vendor/WebGAL_Terre'
$shellSource = Join-Path $terreRoot 'packages/WebGAL-electron'
$lock = Get-Content -LiteralPath (Join-Path $repoRoot 'upstream.lock.json') -Raw | ConvertFrom-Json
$terreLock = $lock.upstreams | Where-Object name -eq 'WebGAL_Terre'
$head = & git -C $terreRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $head.Trim() -ne $terreLock.commit) { throw 'Terre HEAD does not match upstream.lock.json.' }
if ((Get-FileHash -LiteralPath (Join-Path $terreRoot 'yarn.lock') -Algorithm SHA256).Hash -ne $terreLock.lockSha256) { throw 'Terre yarn.lock differs from its version lock.' }
$shellChanges = @(& git -C $terreRoot status --porcelain --untracked-files=all -- 'packages/WebGAL-electron')
if ($LASTEXITCODE -ne 0 -or $shellChanges.Count -ne 0) { throw 'The locked Electron shell has local changes. Review a reproducible shell patch before exporting.' }
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'game/config.txt'))) { throw "Missing game/config.txt beneath $sourceRoot" }
if (-not (Test-Path -LiteralPath (Join-Path $terreRoot 'packages/terre2/dist/src/Modules/manage-game/manage-game.service.js'))) { throw 'Build the patched Terre backend before exporting.' }
$exporterBuild = Get-Content -LiteralPath (Join-Path $terreRoot 'packages/terre2/dist/src/Modules/manage-game/manage-game.service.js') -Raw
if ($exporterBuild -notmatch '\bunpackDir\s*:') { throw 'The built Terre exporter lacks the reviewed native-ASAR fix. Rebuild the patched backend before exporting.' }

$scratchRoot = Join-Path $repoRoot '.scratch/windows-export'
$shellWork = Join-Path $scratchRoot 'upstream-shell'
$exportsRoot = Join-Path $repoRoot '.local/exports'
$logsRoot = Join-Path $repoRoot 'docs/evidence/local/round3/windows-export'
foreach ($folder in @($scratchRoot, $shellWork, $exportsRoot, $logsRoot)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
$shellInputs = @('main.js', 'preload.js', 'package.json', 'yarn.lock', 'LICENSE', 'public/icon.ico', 'public/icon.png')
$sourceHashes = @{}
foreach ($name in $shellInputs) { $sourceHashes[$name] = (Get-FileHash -LiteralPath (Join-Path $shellSource $name) -Algorithm SHA256).Hash }
$stampPath = Join-Path $scratchRoot 'upstream-shell-build.json'
$builtShell = Join-Path $shellWork 'build/win-unpacked'
$reuse = $false
if (-not $RebuildShell -and (Test-Path -LiteralPath $stampPath) -and (Test-Path -LiteralPath (Join-Path $builtShell 'WebGAL.exe'))) {
    $stamp = Get-Content -LiteralPath $stampPath -Raw | ConvertFrom-Json -AsHashtable
    $reuse = $true
    foreach ($name in $shellInputs) { if ($stamp.sourceHashes[$name] -ne $sourceHashes[$name]) { $reuse = $false } }
}
if (-not $reuse) {
    foreach ($name in $shellInputs) {
        $destination = Join-Path $shellWork $name
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $shellSource $name) -Destination $destination -Force
    }
    $oldAutoPin = $env:COREPACK_ENABLE_AUTO_PIN
    $oldMirror = $env:ELECTRON_MIRROR
    $oldUseProxy = $env:ELECTRON_GET_USE_PROXY
    try {
        $env:COREPACK_ENABLE_AUTO_PIN = '0'
        $env:ELECTRON_MIRROR = 'https://github.com/electron/electron/releases/download/'
        if ($env:HTTPS_PROXY -or $env:HTTP_PROXY) { $env:ELECTRON_GET_USE_PROXY = 'true' }
        & corepack.cmd yarn --cwd $shellWork install --frozen-lockfile --non-interactive --cache-folder (Join-Path $scratchRoot 'yarn-cache') 2>&1 | Tee-Object -FilePath (Join-Path $logsRoot 'shell-install.log')
        if ($LASTEXITCODE -ne 0) { throw 'Frozen WebGAL-electron install failed; the log is retained.' }
        $electronDist = Join-Path $shellWork 'node_modules/electron/dist'
        if ((Get-Content -LiteralPath (Join-Path $electronDist 'version') -Raw).Trim() -ne '29.3.3') { throw 'Installed Electron version differs from the shell lockfile.' }
        # Reuse the distribution that @electron/get downloaded and checksum-verified.
        # This also avoids electron-builder applying its mirror-specific URL layout.
        & corepack.cmd yarn --cwd $shellWork build --win --x64 --publish never ('-c.electronDist=' + $electronDist) '-c.win.signAndEditExecutable=false' 2>&1 | Tee-Object -FilePath (Join-Path $logsRoot 'shell-build.log')
        if ($LASTEXITCODE -ne 0) { throw 'The upstream Electron shell build failed; the log is retained.' }
        if ((Get-FileHash -LiteralPath (Join-Path $shellWork 'yarn.lock') -Algorithm SHA256).Hash -ne $sourceHashes['yarn.lock']) { throw 'The shell lockfile changed during build.' }
        @{ sourceHashes = $sourceHashes; builtAt = [DateTime]::UtcNow.ToString('o'); electron = '29.3.3'; builder = '24.12.0' } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stampPath -Encoding utf8
    } finally {
        $env:COREPACK_ENABLE_AUTO_PIN = $oldAutoPin
        $env:ELECTRON_MIRROR = $oldMirror
        $env:ELECTRON_GET_USE_PROXY = $oldUseProxy
    }
}

$runId = [DateTime]::Now.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 6)
$workRoot = Join-Path $scratchRoot ('run-' + $runId)
$outputRoot = Join-Path $exportsRoot ($OutputName + ' ' + $runId)
& node (Join-Path $repoRoot 'integrations/windows-export/export-with-terre.cjs') $repoRoot $sourceRoot $builtShell $workRoot $outputRoot 2>&1 | Tee-Object -FilePath (Join-Path $logsRoot ('export-' + $runId + '.log'))
if ($LASTEXITCODE -ne 0) { throw 'Export did not pass the artifact checks. Partial files were retained for diagnosis.' }
Write-Host "Exported to: $outputRoot"
Write-Host 'The complete directory is the portable package. Run WebGAL.exe; exporting alone is not GUI or offline acceptance.'
Write-Host 'This development package retains the Electron executable metadata/icon and has no MakeNovel publisher signature.'
