[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$CandidateDirectory,
    [Parameter(Mandatory = $true)][string]$SignedDirectory,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommitSha,
    [Parameter(Mandatory = $true)][string]$ExpectedTag,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9]+$')][string]$ExpectedSourceRunId,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedSignerThumbprint,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$GoExecutable = 'go',
    [string]$GitExecutable = 'git'
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib/launcher-release-handoff.psm1') -Force

$result = Test-LauncherReleaseHandoff `
    -SourceRoot $SourceRoot `
    -CandidateDirectory $CandidateDirectory `
    -SignedDirectory $SignedDirectory `
    -ExpectedCommitSha $ExpectedCommitSha `
    -ExpectedTag $ExpectedTag `
    -ExpectedSourceRunId $ExpectedSourceRunId `
    -ExpectedSignerThumbprint $ExpectedSignerThumbprint `
    -GoExecutable $GoExecutable `
    -GitExecutable $GitExecutable `
    -OutputDirectory $OutputDirectory

Write-Output (($result | ConvertTo-Json -Depth 5 -Compress))
