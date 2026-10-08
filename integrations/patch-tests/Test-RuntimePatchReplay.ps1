[CmdletBinding()]
param(
    [ValidateSet('WebGAL', 'WebGAL_Terre')][string]$Target = 'WebGAL',
    [string]$ManifestPath,
    [string]$EvidencePath,
    [ValidateRange(0, 10000)][int]$ExpectedPatchCount = 0
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$targetSlug = if ($Target -eq 'WebGAL') { 'runtime' } else { 'terre' }
$patchFolder = if ($Target -eq 'WebGAL') { 'webgal' } else { 'terre' }
$scratchRoot = Join-Path $projectRoot '.scratch'
$testRoot = Join-Path $scratchRoot ($targetSlug + '-independent-replay-' + [Guid]::NewGuid().ToString('N'))
$checkout = Join-Path $testRoot 'checkout'
if (-not $ManifestPath) { $ManifestPath = Join-Path $projectRoot "patches/$patchFolder/manifest.json" }
if (-not $EvidencePath) { $EvidencePath = Join-Path $projectRoot "docs/evidence/local/patch-replay/$targetSlug-independent-replay.json" }
$ManifestPath = [IO.Path]::GetFullPath($ManifestPath)
$EvidencePath = [IO.Path]::GetFullPath($EvidencePath)
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$manifestHashBefore = (Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$lock = Get-Content -LiteralPath (Join-Path $projectRoot 'upstream.lock.json') -Raw | ConvertFrom-Json
$upstream = @($lock.upstreams | Where-Object name -EQ $Target)
if ($upstream.Count -ne 1 -or $upstream[0].commit -notmatch '^[a-fA-F0-9]{40}$') { throw "Expected one locked $Target commit." }
$baseCommit = $upstream[0].commit
$sourceRepository = Join-Path $projectRoot $upstream[0].path
$patchCount = @($manifest.patches).Count
$utf8 = [Text.UTF8Encoding]::new($false)
$testResults = [Collections.Generic.List[object]]::new()
$null = New-Item -ItemType Directory -Path $testRoot -Force
$null = New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force
$cloneIndexBefore = $null; $cloneIndexAfter = $null
$sourceIndexBefore = $null; $sourceIndexAfter = $null

function Invoke-ReplayProcess {
    param([string]$Executable, [string[]]$Arguments, [string]$Directory, [string]$IndexPath)
    $info = [Diagnostics.ProcessStartInfo]::new($Executable)
    $info.WorkingDirectory = $Directory
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = $utf8
    $info.StandardErrorEncoding = $utf8
    foreach ($name in @('GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR')) {
        $null = $info.Environment.Remove($name)
    }
    # Apply-Patches also inherits this, so optional index refreshes stay disabled.
    $info.Environment['GIT_OPTIONAL_LOCKS'] = '0'
    if ($IndexPath) { $info.Environment['GIT_INDEX_FILE'] = $IndexPath }
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    $null = $process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $code = $process.ExitCode
    $text = $stdout.Result
    $errorText = $stderr.Result
    $process.Dispose()
    if ($code -ne 0) { throw "$Executable $($Arguments -join ' ') failed ($code): $errorText $text" }
    return $text.TrimEnd("`r", "`n")
}

function Invoke-ReplayGit {
    param([string[]]$Arguments, [string]$Directory = $checkout, [string]$IndexPath)
    return Invoke-ReplayProcess -Executable 'git' -Arguments $Arguments -Directory $Directory -IndexPath $IndexPath
}

function Invoke-ReplayPatch {
    param([string]$Repository, [ValidateSet('Check', 'Apply')][string]$Mode)
    $arguments = @('-NoLogo', '-NoProfile', '-File', (Join-Path $projectRoot 'scripts/Apply-Patches.ps1'),
        '-Target', $Target, '-RepositoryPath', $Repository, '-ManifestPath', $ManifestPath, "-$Mode")
    return Invoke-ReplayProcess -Executable (Join-Path $PSHOME 'pwsh.exe') -Arguments $arguments -Directory $projectRoot
}

function Assert-Replay([bool]$Condition, [string]$Name, [string]$Details = '') {
    if (-not $Condition) { throw "FAILED: $Name $Details" }
    $testResults.Add([PSCustomObject]@{ name = $Name; status = 'passed'; details = $Details })
    Write-Output "PASS $Name $Details"
}

function Get-ReplayTree([string]$Repository, [string]$IndexPath) {
    $null = Invoke-ReplayGit -Directory $Repository -Arguments @('read-tree', $baseCommit) -IndexPath $IndexPath
    $null = Invoke-ReplayGit -Directory $Repository -Arguments @('add', '--all', '--', '.') -IndexPath $IndexPath
    return Invoke-ReplayGit -Directory $Repository -Arguments @('write-tree') -IndexPath $IndexPath
}

function Get-RealIndexHash([string]$Repository) {
    $indexPath = Invoke-ReplayGit -Directory $Repository -Arguments @('rev-parse', '--path-format=absolute', '--git-path', 'index')
    return (Get-FileHash -LiteralPath $indexPath -Algorithm SHA256).Hash.ToLowerInvariant()
}

try {
    Assert-Replay ($manifest.baseCommit -eq $baseCommit) 'manifest uses locked upstream commit' $baseCommit
    Assert-Replay ($patchCount -gt 0 -and ($ExpectedPatchCount -eq 0 -or $patchCount -eq $ExpectedPatchCount)) 'manifest contains the expected reviewed product patch set' "$patchCount patches; requested count $ExpectedPatchCount (0 means current manifest)"
    $manifestDirectory = Split-Path -Parent $ManifestPath
    $manifestPrefix = $manifestDirectory.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $seenPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $patchEvidence = @($manifest.patches) | ForEach-Object {
        if (-not $_.file -or [IO.Path]::IsPathRooted($_.file) -or $_.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid patch manifest entry.' }
        $patchPath = [IO.Path]::GetFullPath((Join-Path $manifestDirectory $_.file))
        if (-not $patchPath.StartsWith($manifestPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not $seenPaths.Add($patchPath)) { throw 'Duplicate or escaping patch path.' }
        $hash = (Get-FileHash -LiteralPath $patchPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -ne $_.sha256) { throw "Reviewed product patch hash mismatch: $($_.file)" }
        [PSCustomObject]@{ file = $_.file; sha256 = $hash }
    }
    Assert-Replay $true 'patch bytes match manifest SHA-256'
    $sourceIndexBefore = Get-RealIndexHash $sourceRepository
    $developmentTreeBefore = Get-ReplayTree $sourceRepository (Join-Path $testRoot 'development-before.index')
    $developmentCheck = Invoke-ReplayPatch -Repository $sourceRepository -Mode Check
    Assert-Replay ($developmentCheck.Contains("Already applied: $patchCount/$patchCount")) 'development tree matches the reviewed product patches' $developmentCheck
    $null = Invoke-ReplayGit -Directory $testRoot -Arguments @('clone', '--no-hardlinks', '--no-checkout', $sourceRepository, $checkout)
    $null = Invoke-ReplayGit -Arguments @('checkout', '--detach', $baseCommit)
    Assert-Replay ((Invoke-ReplayGit -Arguments @('status', '--porcelain')) -eq '') 'independent checkout starts clean'
    Assert-Replay (-not (Test-Path -LiteralPath (Join-Path $checkout '.git/objects/info/alternates'))) 'clone has no object alternates'
    $null = Invoke-ReplayGit -Arguments @('fsck', '--no-reflogs', '--connectivity-only')
    Assert-Replay $true 'independent object database passes connectivity check'
    $cloneIndexBefore = Get-RealIndexHash $checkout
    $check = Invoke-ReplayPatch -Repository $checkout -Mode Check
    Assert-Replay ($check.Contains("Ready: 0/$patchCount") -and (Invoke-ReplayGit -Arguments @('status', '--porcelain')) -eq '') "Check reports Ready 0/$patchCount and leaves checkout clean" $check
    $apply = Invoke-ReplayPatch -Repository $checkout -Mode Apply
    Assert-Replay ($apply.Contains("Verified: $patchCount/$patchCount")) 'reviewed product patches apply' $apply
    $firstTree = Get-ReplayTree $checkout (Join-Path $testRoot 'first-apply.index')
    $second = Invoke-ReplayPatch -Repository $checkout -Mode Apply
    Assert-Replay ($second.Contains("Already applied: $patchCount/$patchCount")) 'repeated Apply is idempotent' $second
    $afterCheck = Invoke-ReplayPatch -Repository $checkout -Mode Check
    Assert-Replay ($afterCheck.Contains("Already applied: $patchCount/$patchCount")) 'post-apply Check verifies final tree and reverse checks' $afterCheck
    $replayedTree = Get-ReplayTree $checkout (Join-Path $testRoot 'replayed.index')
    Assert-Replay ($firstTree -eq $replayedTree) 'idempotence preserves the entire applied working tree' $replayedTree
    Assert-Replay ($replayedTree -eq $developmentTreeBefore) 'independent replay equals the reviewed development tree' $replayedTree
    $reverseIndex = Join-Path $testRoot 'reverse.index'
    $null = Invoke-ReplayGit -Arguments @('read-tree', $replayedTree) -IndexPath $reverseIndex
    $entries = @($manifest.patches)
    for ($index = $entries.Count - 1; $index -ge 0; $index--) {
        $patchPath = Join-Path $manifestDirectory $entries[$index].file
        $null = Invoke-ReplayGit -Arguments @('apply', '--cached', '--reverse', '--check', '--binary', $patchPath) -IndexPath $reverseIndex
        $null = Invoke-ReplayGit -Arguments @('apply', '--cached', '--reverse', '--binary', $patchPath) -IndexPath $reverseIndex
    }
    $reverseTree = Invoke-ReplayGit -Arguments @('write-tree') -IndexPath $reverseIndex
    $baseTree = Invoke-ReplayGit -Arguments @('rev-parse', "$($baseCommit)^{tree}")
    Assert-Replay ($reverseTree -eq $baseTree) 'reverse-order patch removal in temporary index restores base tree' $reverseTree
    $afterReverseTree = Get-ReplayTree $checkout (Join-Path $testRoot 'after-reverse.index')
    Assert-Replay ($afterReverseTree -eq $replayedTree) 'reverse verification leaves applied working tree unchanged' $afterReverseTree
    $developmentTreeAfter = Get-ReplayTree $sourceRepository (Join-Path $testRoot 'development-after.index')
    Assert-Replay ($developmentTreeBefore -eq $developmentTreeAfter) 'development working tree remains unchanged' $developmentTreeAfter
    $null = Invoke-ReplayGit -Arguments @('diff', '--cached', '--exit-code', 'HEAD', '--')
    $null = Invoke-ReplayGit -Directory $sourceRepository -Arguments @('diff', '--cached', '--exit-code', 'HEAD', '--')
    Assert-Replay $true 'both real indexes retain the original staged state'
    $cloneIndexAfter = Get-RealIndexHash $checkout
    $sourceIndexAfter = Get-RealIndexHash $sourceRepository
    Assert-Replay ($cloneIndexBefore -eq $cloneIndexAfter -and $sourceIndexBefore -eq $sourceIndexAfter) 'both real index files remain byte-identical' "clone $cloneIndexBefore -> $cloneIndexAfter; development $sourceIndexBefore -> $sourceIndexAfter"
    if ($testResults.Count -ne 18) { throw "Expected 18 core replay checks, recorded $($testResults.Count)." }
    if ((Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifestHashBefore) { throw 'Manifest changed during replay; do not treat this evidence as final.' }
    foreach ($entry in $patchEvidence) {
        if ((Get-FileHash -LiteralPath (Join-Path $manifestDirectory $entry.file) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Patch changed during replay: $($entry.file)" }
    }
    $report = [ordered]@{
        status = 'passed'; tests = $testResults.Count; target = $Target; baseCommit = $baseCommit
        checkout = $checkout; independentObjectStorage = $true
        cloneArguments = @('--no-hardlinks', '--no-checkout'); alternatesPresent = $false
        manifest = $ManifestPath; manifestSha256 = $manifestHashBefore; patchCount = $patchCount
        patches = @($patchEvidence); replayedTree = $replayedTree
        developmentTreeBefore = $developmentTreeBefore; developmentTreeAfter = $developmentTreeAfter
        baseTree = $baseTree; reversedTree = $reverseTree; reverseUsedTemporaryIndex = $true
        indexes = [ordered]@{ cloneBefore = $cloneIndexBefore; cloneAfter = $cloneIndexAfter; developmentBefore = $sourceIndexBefore; developmentAfter = $sourceIndexAfter }
        results = $testResults; dependenciesRequired = $false; productBuildRun = $false; templateModified = $false
        recordedAt = [DateTimeOffset]::Now.ToString('o')
    }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
    Write-Output "Evidence: $EvidencePath"
    Write-Output "Applied clone retained: $checkout"
} catch {
    [ordered]@{ status = 'failed'; checkout = $checkout; results = $testResults; error = $_.Exception.Message; indexes = [ordered]@{ cloneBefore = $cloneIndexBefore; cloneAfter = $cloneIndexAfter; developmentBefore = $sourceIndexBefore; developmentAfter = $sourceIndexAfter } } |
        ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
    throw
}
