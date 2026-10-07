[CmdletBinding()]
param([ValidateSet('Build', 'Check', 'Sync')][string]$Action = 'Sync')

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$lock = Get-Content -LiteralPath (Join-Path $projectRoot 'upstream.lock.json') -Raw | ConvertFrom-Json
$runtimeLock = @($lock.upstreams | Where-Object name -EQ 'WebGAL')
$terreLock = @($lock.upstreams | Where-Object name -EQ 'WebGAL_Terre')
if ($runtimeLock.Count -ne 1 -or $terreLock.Count -ne 1) { throw 'The upstream lock must contain one runtime and one editor.' }
$runtimeLock = $runtimeLock[0]
$terreLock = $terreLock[0]
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot $runtimeLock.path))
$terreRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot $terreLock.path))
$distRoot = Join-Path $runtimeRoot 'packages/webgal/dist'
$templateRoot = Join-Path $terreRoot 'packages/terre2/assets/templates/WebGAL_Template'
$stateRoot = Join-Path $projectRoot '.local/runtime-sync'
$receiptPath = Join-Path $stateRoot 'runtime-build.json'
$utf8 = [Text.UTF8Encoding]::new($false)

function Assert-WorkspacePath([string]$Path, [Collections.Generic.HashSet[string]]$CheckedPaths) {
    $full = [IO.Path]::GetFullPath($Path)
    $prefix = $projectRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path is outside the workspace: $Path" }
    $current = $full
    while ($current -ne $projectRoot) {
        if ($null -ne $CheckedPaths -and $CheckedPaths.Contains($current)) { break }
        if (Test-Path -LiteralPath $current) {
            if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Linked paths are not supported: $current"
            }
        }
        if ($null -ne $CheckedPaths) { $null = $CheckedPaths.Add($current) }
        $current = Split-Path -Parent $current
    }
}

function Get-PlainTreeFiles([string]$Root) {
    Assert-WorkspacePath $Root
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { throw "Required directory missing: $Root" }
    $items = @(Get-ChildItem -LiteralPath $Root -Recurse -Force)
    foreach ($item in $items) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked tree entry is not supported: $($item.FullName)" }
    }
    return @($items | Where-Object { -not $_.PSIsContainer })
}

function Get-TreeHashes([string]$Root, [switch]$ExcludeGame, [string[]]$TopLevel) {
    $hashes = [ordered]@{}
    foreach ($file in @(Get-PlainTreeFiles $Root) | Sort-Object FullName) {
        $relative = [IO.Path]::GetRelativePath($Root, $file.FullName).Replace('\', '/')
        $top = ($relative -split '/', 2)[0]
        if ($ExcludeGame -and $top -eq 'game') { continue }
        if ($TopLevel -and $top -notin $TopLevel) { continue }
        $hashes[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    return $hashes
}

function ConvertTo-CanonicalValue($Value) {
    if ($Value -is [Collections.IDictionary]) {
        $keys = [string[]]@($Value.Keys)
        [Array]::Sort($keys, [StringComparer]::Ordinal)
        $canonical = [ordered]@{}
        foreach ($key in $keys) { $canonical[$key] = ConvertTo-CanonicalValue $Value[$key] }
        return $canonical
    }
    if ($Value -is [Array]) {
        $items = @($Value | ForEach-Object { ConvertTo-CanonicalValue $_ })
        return ,$items
    }
    return $Value
}

function Get-Signature($Value) {
    # JSON property order and machine locale must not change a receipt hash.
    $json = ConvertTo-Json -InputObject (ConvertTo-CanonicalValue $Value) -Depth 16 -Compress
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($utf8.GetBytes($json))).ToLowerInvariant()
}

function Assert-LockedCheckout([string]$Root, $Entry) {
    Assert-WorkspacePath $Root
    $head = & git -C $Root rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $head -ne $Entry.commit) { throw "$($Entry.name) HEAD does not match upstream.lock.json." }
    if ((Get-FileHash -LiteralPath (Join-Path $Root 'yarn.lock') -Algorithm SHA256).Hash -ne $Entry.lockSha256) {
        throw "$($Entry.name) yarn.lock does not match upstream.lock.json."
    }
}

function Get-VerifiedSource {
    Assert-LockedCheckout $runtimeRoot $runtimeLock
    $review = @(& (Join-Path $PSScriptRoot 'Apply-Patches.ps1') -Target WebGAL -Check)
    if (($review -join ' ') -notmatch '^Already applied:') { throw 'Apply all reviewed runtime patches before building or syncing.' }
    $paths = @(& git -C $runtimeRoot -c core.quotepath=false ls-files)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate the runtime source.' }
    $generatedInput = 'packages/webgal/src/Core/util/pixiPerformManager/initRegister.ts'
    if (Test-Path -LiteralPath (Join-Path $runtimeRoot $generatedInput)) { $paths += $generatedInput }
    $hashes = [ordered]@{}
    # Recheck parents on every source snapshot, but only once within that scan.
    $checkedPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($relative in $paths | Sort-Object) {
        $path = Join-Path $runtimeRoot $relative
        Assert-WorkspacePath $path $checkedPaths
        if ($relative -eq 'packages/webgal/public/webgal-engine.json') {
            # Upstream's build rewrites this JSON (including line endings).
            # Its parsed content must remain identical across that rewrite.
            $hashes[$relative] = Get-Signature (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json -AsHashtable)
        } else {
            $hashes[$relative] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    return [ordered]@{
        commit = $runtimeLock.commit
        patchManifestSha256 = (Get-FileHash -LiteralPath (Join-Path $projectRoot 'patches/webgal/manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
        sourceFiles = $hashes.Count
        sourceSha256 = Get-Signature $hashes
    }
}

function Get-EngineHashes {
    foreach ($required in @('index.html', 'webgal-engine.json', 'webgal-serviceworker.js', 'manifest.json', 'assets', 'icons')) {
        if (-not (Test-Path -LiteralPath (Join-Path $distRoot $required))) { throw "Runtime build missing $required. Run the root baseline:build command." }
    }
    return Get-TreeHashes $distRoot -ExcludeGame
}

Assert-WorkspacePath $stateRoot
$source = Get-VerifiedSource
if ($Action -eq 'Build') {
    Assert-WorkspacePath $distRoot
    $null = New-Item -ItemType Directory -Path $stateRoot -Force
    # A failed build must not leave an earlier receipt authorizing partial output.
    if (Test-Path -LiteralPath $receiptPath) { Remove-Item -LiteralPath $receiptPath }
    Push-Location -LiteralPath $runtimeRoot
    try {
        & corepack.cmd yarn build
        if ($LASTEXITCODE -ne 0) { throw "Runtime build failed with exit code $LASTEXITCODE. No receipt was written." }
    } finally { Pop-Location }
    $sourceAfter = Get-VerifiedSource
    if ((Get-Signature $source) -ne (Get-Signature $sourceAfter)) { throw 'Runtime sources changed during build. Rebuild from a stable reviewed tree.' }
    $engineHashes = Get-EngineHashes
    $receipt = [ordered]@{
        schemaVersion = 1
        builtAtUtc = [DateTime]::UtcNow.ToString('o')
        source = $sourceAfter
        engineFiles = $engineHashes
        engineSha256 = Get-Signature $engineHashes
    }
    $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding utf8
    Write-Output "Runtime build recorded: $($engineHashes.Count) engine files, $($receipt.engineSha256)."
    return
}

if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { throw 'Runtime build receipt missing. Run npm.cmd run baseline:build before editor:build or Sync-Runtime.' }
$receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json -AsHashtable
if ($receipt.schemaVersion -ne 1 -or (Get-Signature $receipt.source) -ne (Get-Signature $source)) {
    throw 'Runtime build receipt does not match the reviewed source. Run npm.cmd run baseline:build.'
}
$engineHashes = Get-EngineHashes
if ((Get-Signature $engineHashes) -ne $receipt.engineSha256 -or (Get-Signature $receipt.engineFiles) -ne $receipt.engineSha256) {
    throw 'Runtime build files differ from their receipt. Run npm.cmd run baseline:build.'
}
if ($Action -eq 'Check') {
    Write-Output "Verified runtime build: $($engineHashes.Count) engine files match the reviewed source receipt."
    return
}

Assert-LockedCheckout $terreRoot $terreLock
Assert-WorkspacePath $templateRoot
$beforeHashes = Get-TreeHashes $templateRoot
$gameRoot = Join-Path $templateRoot 'game'
$gameHashes = Get-TreeHashes $gameRoot
$managedEntries = @(Get-ChildItem -LiteralPath $distRoot -Force | Where-Object Name -NE 'game')
$managedNames = @($managedEntries | ForEach-Object Name)
$runId = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N')
$runRoot = Join-Path $stateRoot $runId
$stagingRoot = Join-Path $runRoot 'staged-template'
$backupRoot = Join-Path $runRoot 'previous-template'
Assert-WorkspacePath $runRoot
$null = New-Item -ItemType Directory -Path $stagingRoot
# Construct a complete candidate before switching. Preserve game and any unrelated
# template files; replace managed engine directories as whole units in the candidate.
foreach ($item in Get-ChildItem -LiteralPath $templateRoot -Force) {
    if ($item.Name -notin $managedNames) { Copy-Item -LiteralPath $item.FullName -Destination $stagingRoot -Recurse }
}
foreach ($item in $managedEntries) { Copy-Item -LiteralPath $item.FullName -Destination $stagingRoot -Recurse }
if ((Get-Signature (Get-TreeHashes $stagingRoot -TopLevel $managedNames)) -ne $receipt.engineSha256) { throw 'Staged runtime copy differs from the build receipt; active template unchanged.' }
if ((Get-Signature (Get-TreeHashes (Join-Path $stagingRoot 'game'))) -ne (Get-Signature $gameHashes)) { throw 'Staged game differs from the original template; active template unchanged.' }
if ((Get-Signature (Get-TreeHashes $templateRoot)) -ne (Get-Signature $beforeHashes)) { throw 'Template changed during staging; active template unchanged.' }
if ((Get-Signature (Get-VerifiedSource)) -ne (Get-Signature $source) -or (Get-Signature (Get-EngineHashes)) -ne $receipt.engineSha256) { throw 'Runtime changed during staging; active template unchanged.' }

# Both paths have been checked within this workspace, without links. Moves stay
# on the same volume; retain the previous directory instead of deleting it.
Assert-WorkspacePath $backupRoot
Assert-WorkspacePath $stagingRoot
Move-Item -LiteralPath $templateRoot -Destination $backupRoot
try {
    Move-Item -LiteralPath $stagingRoot -Destination $templateRoot
} catch {
    $switchError = $_
    if (-not (Test-Path -LiteralPath $templateRoot)) { Move-Item -LiteralPath $backupRoot -Destination $templateRoot }
    throw $switchError
}
$report = [ordered]@{
    schemaVersion = 1
    syncedAtUtc = [DateTime]::UtcNow.ToString('o')
    source = $source
    engineSha256 = $receipt.engineSha256
    engineFileCount = $engineHashes.Count
    templateGameSha256 = Get-Signature $gameHashes
    template = [IO.Path]::GetRelativePath($projectRoot, $templateRoot).Replace('\', '/')
    backup = [IO.Path]::GetRelativePath($projectRoot, $backupRoot).Replace('\', '/')
    authorProjectsModified = $false
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runRoot 'sync-result.json') -Encoding utf8
Write-Output "Synced $($engineHashes.Count) runtime files; template game preserved. Previous template: $($report.backup)"
