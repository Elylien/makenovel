[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$sourceRepository = Join-Path $projectRoot 'vendor/WebGAL_Terre'
$scratchRoot = Join-Path $projectRoot '.scratch'
$testRoot = Join-Path $scratchRoot ('patch-replay-' + [Guid]::NewGuid().ToString('N'))
$evidenceDirectory = Join-Path $projectRoot 'docs/evidence/local/round2'
$null = New-Item -ItemType Directory -Path $evidenceDirectory -Force
$checkout = Join-Path $testRoot 'checkout'
$patchDirectory = Join-Path $testRoot 'patches'
$null = New-Item -ItemType Directory -Path $patchDirectory -Force
$baseCommit = 'cf73dd58535d3ef15bddf0852adee153fa92d7da'
$utf8 = [Text.UTF8Encoding]::new($false)
$testResults = [Collections.Generic.List[object]]::new()

function Invoke-TestGit([string[]]$Arguments, [string]$Directory = $checkout) {
    $info = [Diagnostics.ProcessStartInfo]::new('git')
    $info.WorkingDirectory = $Directory
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = $utf8
    $info.StandardErrorEncoding = $utf8
    $null = $info.Environment.Remove('GIT_INDEX_FILE')
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
    if ($code -ne 0) { throw "git $($Arguments -join ' '): $errorText" }
    return $text.TrimEnd("`r", "`n")
}

function Assert-Test([bool]$Condition, [string]$Name) {
    if (-not $Condition) { throw "FAILED: $Name" }
    $testResults.Add([PSCustomObject]@{ name = $Name; status = 'passed' })
    Write-Output "PASS $Name"
}

function Invoke-Apply([switch]$Check, [string]$Manifest = (Join-Path $patchDirectory 'manifest.json')) {
    return & (Join-Path $projectRoot 'scripts/Apply-Patches.ps1') -RepositoryPath $checkout -ManifestPath $Manifest -Check:$Check
}

try {
    $null = Invoke-TestGit -Directory $testRoot -Arguments @('clone', '--shared', '--no-checkout', $sourceRepository, $checkout)
    $null = Invoke-TestGit -Arguments @('checkout', '--detach', $baseCommit)
    $readme = Join-Path $checkout 'README.md'
    $textFile = Join-Path $checkout 'makenovel-replay-fixture.txt'
    $binaryFile = Join-Path $checkout 'makenovel-replay-fixture.bin'
    $originalReadme = [IO.File]::ReadAllText($readme, $utf8)
    [IO.File]::WriteAllText($readme, $originalReadme + "`nMakeNovel fixture 1.`n", $utf8)
    [IO.File]::WriteAllText($textFile, "New UTF-8 file: 中文。`n", $utf8)
    [IO.File]::WriteAllBytes($binaryFile, [byte[]](0, 1, 2, 3, 0, 255, 128))
    $null = Invoke-TestGit -Arguments @('add', '--', 'README.md', 'makenovel-replay-fixture.txt', 'makenovel-replay-fixture.bin')
    $patch1 = Join-Path $patchDirectory '01-fixture.patch'
    [IO.File]::WriteAllText($patch1, (Invoke-TestGit -Arguments @('diff', '--cached', '--binary', '--no-ext-diff', 'HEAD', '--')) + "`n", $utf8)
    $firstTree = Invoke-TestGit -Arguments @('write-tree')
    [IO.File]::WriteAllText($readme, $originalReadme + "`nMakeNovel fixture 2.`n", $utf8)
    [IO.File]::AppendAllText($textFile, "Second patch edits the new file.`n", $utf8)
    $null = Invoke-TestGit -Arguments @('add', '--', 'README.md', 'makenovel-replay-fixture.txt')
    $patch2 = Join-Path $patchDirectory '02-fixture.patch'
    [IO.File]::WriteAllText($patch2, (Invoke-TestGit -Arguments @('diff', '--cached', '--binary', '--no-ext-diff', $firstTree, '--')) + "`n", $utf8)
    $expectedReadmeHash = (Get-FileHash -LiteralPath $readme).Hash
    $expectedTextHash = (Get-FileHash -LiteralPath $textFile).Hash
    $expectedBinaryHash = (Get-FileHash -LiteralPath $binaryFile).Hash
    $entries = @($patch1, $patch2) | ForEach-Object { @{ file = [IO.Path]::GetFileName($_); sha256 = (Get-FileHash -LiteralPath $_).Hash } }
    @{ baseCommit = $baseCommit; patches = $entries } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $patchDirectory 'manifest.json') -Encoding utf8
    @{ baseCommit = $baseCommit; patches = @($entries[0]) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $patchDirectory 'first-only.json') -Encoding utf8
    # This clone contains only this test's fixtures. Restore both index and
    # working files to the unchanged upstream tree; the source repo is untouched.
    $null = Invoke-TestGit -Arguments @('restore', '--source=HEAD', '--staged', '--worktree', '--', '.')

    $checkResult = Invoke-Apply -Check
    Assert-Test (($checkResult -join ' ') -match 'Ready: 0/2' -and (Invoke-TestGit -Arguments @('status', '--porcelain')) -eq '') 'check validates clean base without applying'
    $firstResult = Invoke-Apply -Manifest (Join-Path $patchDirectory 'first-only.json')
    Assert-Test (($firstResult -join ' ') -match 'Verified: 1/1') 'first patch creates text and binary files'
    $prefixResult = Invoke-Apply -Check
    Assert-Test (($prefixResult -join ' ') -match 'Ready: 1/2') 'known applied prefix is recognized'
    $applyResult = Invoke-Apply
    Assert-Test (($applyResult -join ' ') -match 'Verified: 2/2') 'second overlapping patch applies'
    Assert-Test (((Get-FileHash -LiteralPath $readme).Hash -eq $expectedReadmeHash) -and ((Get-FileHash -LiteralPath $textFile).Hash -eq $expectedTextHash) -and ((Get-FileHash -LiteralPath $binaryFile).Hash -eq $expectedBinaryHash)) 'result bytes match reviewed files'
    $secondResult = Invoke-Apply
    Assert-Test (($secondResult -join ' ') -match 'Already applied: 2/2') 'second full apply is idempotent and reverse-checks both patches'
    $null = Invoke-TestGit -Arguments @('diff', '--cached', '--exit-code', 'HEAD', '--')
    Assert-Test $true 'real index remains unchanged'
    $null = Invoke-TestGit -Arguments @('apply', '--reverse', '--check', '--binary', $patch2)
    $null = Invoke-TestGit -Arguments @('apply', '--reverse', '--binary', $patch2)
    $null = Invoke-TestGit -Arguments @('apply', '--reverse', '--check', '--binary', $patch1)
    $null = Invoke-TestGit -Arguments @('apply', '--reverse', '--binary', $patch1)
    Assert-Test ((Invoke-TestGit -Arguments @('status', '--porcelain')) -eq '') 'reverse restores clean upstream including added files'

    $dirtyPath = Join-Path $checkout 'unrelated-user-file.txt'
    [IO.File]::WriteAllText($dirtyPath, "Preserve user text.`n", $utf8)
    $dirtyHash = (Get-FileHash -LiteralPath $dirtyPath).Hash
    $rejected = $false
    try { $null = Invoke-Apply } catch { $rejected = $_.Exception.Message -match 'Unknown vendor changes' }
    Assert-Test ($rejected -and (Get-FileHash -LiteralPath $dirtyPath).Hash -eq $dirtyHash -and [IO.File]::ReadAllText($readme, $utf8) -eq $originalReadme) 'untracked unknown change is rejected and preserved'
    Remove-Item -LiteralPath $dirtyPath
    [IO.File]::AppendAllText($readme, "Unrelated user edit.`n", $utf8)
    $dirtyHash = (Get-FileHash -LiteralPath $readme).Hash
    $rejected = $false
    try { $null = Invoke-Apply } catch { $rejected = $_.Exception.Message -match 'Unknown vendor changes' }
    Assert-Test ($rejected -and (Get-FileHash -LiteralPath $readme).Hash -eq $dirtyHash) 'tracked unknown change is rejected and preserved'
    $null = Invoke-TestGit -Arguments @('add', '--', 'README.md')
    $rejected = $false
    try { $null = Invoke-Apply } catch { $rejected = $_.Exception.Message -match 'staged changes' }
    Assert-Test ($rejected -and (Get-FileHash -LiteralPath $readme).Hash -eq $dirtyHash) 'staged user edit is rejected and preserved'
    $report = [PSCustomObject]@{ status = 'passed'; tests = $testResults.Count; checkout = $checkout; baseCommit = $baseCommit; results = $testResults }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'patch-replay-result.json') -Encoding utf8
    Write-Output "Fixture retained: $checkout"
} catch {
    Write-Output "Fixture retained after failure: $checkout"
    throw
}
