[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$GamePath,
    [ValidateSet('Verify', 'Init', 'Update')][string]$Action = 'Verify',
    [string]$BackupRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRoot = [IO.Path]::GetFullPath($GamePath, $projectRoot)
$cli = Join-Path $projectRoot 'integrations/game-manifest/cli.mjs'
$arguments = @($cli, $(if ($Action -eq 'Verify') { 'verify' } else { 'seal' }), '--game', $sourceRoot)
if ($Action -eq 'Init') { $arguments += '--init' }
if ($Action -eq 'Update') { $arguments += '--update' }
if ($BackupRoot) {
    if ($Action -eq 'Verify') { throw 'Verify is read-only and does not accept BackupRoot.' }
    $arguments += @('--backup-root', [IO.Path]::GetFullPath($BackupRoot, $projectRoot))
}
& node @arguments
if ($LASTEXITCODE -ne 0) { throw 'Game manifest operation failed. Existing identity and author files were not automatically repaired.' }
