[CmdletBinding()]
param(
    [ValidateSet('WebGAL', 'WebGAL_Terre')][string]$Target = 'WebGAL',
    [ValidateSet('Install', 'Build', 'Test', 'Preview')][string]$Action = 'Build',
    [string]$CacheFolder
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$lock = Get-Content -LiteralPath (Join-Path $projectRoot 'upstream.lock.json') -Raw | ConvertFrom-Json
$entry = $lock.upstreams | Where-Object name -EQ $Target
$checkout = Join-Path $projectRoot $entry.path
if (-not (Test-Path -LiteralPath (Join-Path $checkout 'package.json'))) {
    throw 'Missing upstream checkout. Run git submodule update --init --recursive first.'
}
function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE" }
}
$head = & git -C $checkout rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $head -ne $entry.commit) { throw 'Upstream commit does not match upstream.lock.json.' }
$lockHash = (Get-FileHash -LiteralPath (Join-Path $checkout 'yarn.lock') -Algorithm SHA256).Hash
if ($lockHash -ne $entry.lockSha256) { throw 'Upstream yarn.lock changed; investigate before continuing.' }
Push-Location -LiteralPath $checkout
try {
    switch ($Action) {
        Install {
            $installArgs = @('yarn', 'install', '--frozen-lockfile', '--non-interactive')
            if ($CacheFolder) { $installArgs += @('--cache-folder', $CacheFolder) }
            Invoke-Checked 'corepack.cmd' $installArgs
        }
        Build {
            if ($Target -eq 'WebGAL') {
                Invoke-Checked 'corepack.cmd' @('yarn', 'build')
            } else {
                Invoke-Checked 'corepack.cmd' @('yarn', 'workspace', 'webgal-origine-2', 'build')
                Invoke-Checked 'corepack.cmd' @('yarn', 'workspace', 'webgal-terre-2', 'build')
            }
        }
        Test {
            if ($Target -eq 'WebGAL') {
                Invoke-Checked 'corepack.cmd' @('yarn', 'workspace', 'webgal-parser', 'test', '--run')
            } else {
                Invoke-Checked 'corepack.cmd' @('yarn', 'workspace', 'webgal-terre-2', 'test', '--runInBand')
            }
        }
        Preview {
            if ($Target -ne 'WebGAL') { throw 'Terre requires its backend. See docs/TESTING.md for the verified startup path.' }
            Invoke-Checked 'corepack.cmd' @('yarn', 'workspace', 'webgal-engine', 'preview', '--host', '127.0.0.1', '--port', '3000', '--strictPort')
        }
    }
} finally { Pop-Location }
