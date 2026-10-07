[CmdletBinding()]
param(
    [switch]$Check,
    [switch]$Apply,
    [string]$RepositoryPath,
    [string]$ManifestPath
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required.' }
if ($Check -and $Apply) { throw 'Choose either -Check or -Apply.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$baseCommit = 'cf73dd58535d3ef15bddf0852adee153fa92d7da'
if (-not $RepositoryPath) { $RepositoryPath = Join-Path $projectRoot 'vendor/WebGAL_Terre' }
if (-not $ManifestPath) { $ManifestPath = Join-Path $projectRoot 'patches/terre/manifest.json' }
$RepositoryPath = [IO.Path]::GetFullPath($RepositoryPath)
$ManifestPath = [IO.Path]::GetFullPath($ManifestPath)

function Invoke-PatchGit {
    param([string[]]$Arguments, [string]$IndexPath, [switch]$AllowFailure)
    $info = [Diagnostics.ProcessStartInfo]::new('git')
    $info.WorkingDirectory = $RepositoryPath
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $info.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    # Never inherit an unrelated caller's alternative index.
    $null = $info.Environment.Remove('GIT_INDEX_FILE')
    if ($IndexPath) { $info.Environment['GIT_INDEX_FILE'] = $IndexPath }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    $null = $process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $result = [PSCustomObject]@{ ExitCode = $process.ExitCode; Stdout = $stdout.Result; Stderr = $stderr.Result }
    $process.Dispose()
    if ($result.ExitCode -ne 0 -and -not $AllowFailure) {
        throw "git $($Arguments -join ' ') failed ($($result.ExitCode)): $($result.Stderr.Trim())"
    }
    return $result
}

if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "Patch manifest missing: $ManifestPath. Export and review patches before applying."
}
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.baseCommit -ne $baseCommit) { throw 'Manifest baseCommit does not match the locked Terre commit.' }
$head = (Invoke-PatchGit -Arguments @('rev-parse', 'HEAD')).Stdout.Trim()
if ($head -ne $baseCommit) { throw "Terre HEAD differs from the locked commit: $head" }
$staged = Invoke-PatchGit -Arguments @('diff', '--cached', '--quiet', 'HEAD', '--') -AllowFailure
if ($staged.ExitCode -ne 0) { throw 'Vendor index has staged changes (or cannot be read); preserve and review them before applying patches.' }

$manifestDirectory = Split-Path -Parent $ManifestPath
$manifestPrefix = $manifestDirectory.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$patchPaths = [Collections.Generic.List[string]]::new()
foreach ($entry in @($manifest.patches)) {
    if (-not $entry.file -or [IO.Path]::IsPathRooted($entry.file) -or $entry.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
        throw 'Each patch needs a relative file path and a 64-digit SHA-256.'
    }
    $patchPath = [IO.Path]::GetFullPath((Join-Path $manifestDirectory $entry.file))
    if (-not $patchPath.StartsWith($manifestPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Patch path escapes its manifest directory.'
    }
    if ($patchPaths.Contains($patchPath)) { throw 'Duplicate patch file in manifest.' }
    if ((Get-FileHash -LiteralPath $patchPath -Algorithm SHA256).Hash -ne $entry.sha256) {
        throw "Patch SHA-256 mismatch: $($entry.file)"
    }
    $patchPaths.Add($patchPath)
}
if ($patchPaths.Count -eq 0) { throw 'Manifest contains no reviewed patches.' }

$temporaryParent = Join-Path $projectRoot '.local/patch-tools'
$temporaryDirectory = Join-Path $temporaryParent ([Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $temporaryDirectory -Force
$expectedIndex = Join-Path $temporaryDirectory 'expected.index'
$actualIndex = Join-Path $temporaryDirectory 'actual.index'
$reverseIndex = Join-Path $temporaryDirectory 'reverse.index'

function Get-ActualTree {
    $null = Invoke-PatchGit -Arguments @('read-tree', $baseCommit) -IndexPath $actualIndex
    # Include new files and deletions, but respect existing ignore rules.
    # Git writes objects and this temporary index, never the real vendor index.
    $null = Invoke-PatchGit -Arguments @('add', '--all', '--', '.') -IndexPath $actualIndex
    return (Invoke-PatchGit -Arguments @('write-tree') -IndexPath $actualIndex).Stdout.Trim()
}

try {
    $null = Invoke-PatchGit -Arguments @('read-tree', $baseCommit) -IndexPath $expectedIndex
    $prefixTrees = [Collections.Generic.List[string]]::new()
    $prefixTrees.Add((Invoke-PatchGit -Arguments @('write-tree') -IndexPath $expectedIndex).Stdout.Trim())
    foreach ($patchPath in $patchPaths) {
        $null = Invoke-PatchGit -Arguments @('apply', '--cached', '--check', '--binary', $patchPath) -IndexPath $expectedIndex
        $null = Invoke-PatchGit -Arguments @('apply', '--cached', '--binary', $patchPath) -IndexPath $expectedIndex
        $prefixTrees.Add((Invoke-PatchGit -Arguments @('write-tree') -IndexPath $expectedIndex).Stdout.Trim())
    }
    $actualTree = Get-ActualTree
    $appliedCount = $prefixTrees.IndexOf($actualTree)
    if ($appliedCount -lt 0) {
        throw 'Unknown vendor changes: working tree is neither the locked base nor an exact reviewed patch prefix. No files were changed.'
    }

    # Verify already-applied patches in reverse order using another temporary
    # index. This supports overlapping patches and patches that add new files.
    $null = Invoke-PatchGit -Arguments @('read-tree', $actualTree) -IndexPath $reverseIndex
    for ($index = $appliedCount - 1; $index -ge 0; $index--) {
        $null = Invoke-PatchGit -Arguments @('apply', '--cached', '--reverse', '--check', '--binary', $patchPaths[$index]) -IndexPath $reverseIndex
        $null = Invoke-PatchGit -Arguments @('apply', '--cached', '--reverse', '--binary', $patchPaths[$index]) -IndexPath $reverseIndex
    }
    $reverseTree = (Invoke-PatchGit -Arguments @('write-tree') -IndexPath $reverseIndex).Stdout.Trim()
    if ($reverseTree -ne $prefixTrees[0]) { throw 'Reverse verification did not restore the locked base tree.' }

    if ($appliedCount -eq $patchPaths.Count) {
        Write-Output "Already applied: $appliedCount/$($patchPaths.Count) reviewed patches; reverse checks passed."
        return
    }
    if ($Check) {
        Write-Output "Ready: $appliedCount/$($patchPaths.Count) patches applied; $($patchPaths.Count - $appliedCount) can be applied. Working tree unchanged."
        return
    }

    for ($index = $appliedCount; $index -lt $patchPaths.Count; $index++) {
        # Recheck before every mutation to avoid silently incorporating edits
        # made after the initial snapshot. Concurrent writers must be stopped.
        if ((Get-ActualTree) -ne $prefixTrees[$index]) {
            throw 'Vendor changed during patch application; stopping without reverting existing files.'
        }
        $null = Invoke-PatchGit -Arguments @('apply', '--check', '--binary', $patchPaths[$index])
        $null = Invoke-PatchGit -Arguments @('apply', '--binary', $patchPaths[$index])
        if ((Get-ActualTree) -ne $prefixTrees[$index + 1]) {
            throw 'Applied worktree differs from the reviewed patch tree; preserve it for inspection.'
        }
        Write-Output "Applied: $([IO.Path]::GetFileName($patchPaths[$index]))"
    }
    Write-Output "Verified: $($patchPaths.Count)/$($patchPaths.Count) reviewed patches applied."
} finally {
    # Only this invocation's shallow temporary files are removed. No recursive
    # delete, checkout/reset, or real index mutation is used.
    Get-ChildItem -LiteralPath $temporaryDirectory -File | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
    }
    Remove-Item -LiteralPath $temporaryDirectory
}
