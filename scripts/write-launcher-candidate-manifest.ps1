[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CandidatePath,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+$')][string]$Version,
    [Parameter(Mandatory = $true)][string]$Tag,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$CommitSha,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9]+$')][string]$SourceRunId,
    [Parameter(Mandatory = $true)][ValidateSet('.github/workflows/release.yml', '.github/workflows/build-launcher.yml')][string]$SourceWorkflow,
    [Parameter(Mandatory = $true)][ValidateSet('push', 'workflow_dispatch')][string]$SourceEvent,
    [Parameter(Mandatory = $true)][string]$SourceRef,
    [string]$GoExecutable = 'go'
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib/launcher-release-handoff.psm1') -Force

Assert-LauncherVersionTag -Version $Version -Tag $Tag
if (-not (Test-Path -LiteralPath $CandidatePath -PathType Leaf)) {
    throw 'Unsigned source candidate is missing.'
}
$goVersion = (& $GoExecutable version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $goVersion -cne 'go version go1.24.10 windows/amd64') {
    throw "Expected exact Go 1.24.10 windows/amd64 candidate toolchain; received: $goVersion"
}
$runId = [int64]0
if (-not [int64]::TryParse($SourceRunId, [ref]$runId) -or $runId -le 0) {
    throw 'Source run ID is invalid.'
}

$candidate = Get-Item -LiteralPath $CandidatePath
$manifest = [ordered]@{
    schema = 2
    component = 'launcher.exe'
    version = $Version
    tag = $Tag
    commitSha = $CommitSha.ToLowerInvariant()
    sourceRunId = $runId
    sourceWorkflow = $SourceWorkflow
    sourceEvent = $SourceEvent
    sourceRef = $SourceRef
    bytes = [int64]$candidate.Length
    sha256 = (Get-FileHash -LiteralPath $CandidatePath -Algorithm SHA256).Hash.ToLowerInvariant()
    toolchain = 'go1.24.10'
    target = 'windows/amd64'
    cgoEnabled = $false
    moduleMode = '-mod=readonly'
    buildFlags = @('-trimpath', '-buildvcs=false', '-ldflags', '-H windowsgui -s -w')
}
$validated = Assert-LauncherCandidateManifest -Manifest ([pscustomobject]$manifest)

$manifestParent = Split-Path -Parent ([System.IO.Path]::GetFullPath($ManifestPath))
if (-not (Test-Path -LiteralPath $manifestParent -PathType Container)) {
    throw 'Candidate manifest parent directory must already exist.'
}
if (Test-Path -LiteralPath $ManifestPath) {
    throw 'Candidate manifest output already exists.'
}
[System.IO.File]::WriteAllText(
    $ManifestPath,
    (($validated | ConvertTo-Json -Depth 5) + [Environment]::NewLine),
    (New-Object System.Text.UTF8Encoding($false))
)
Write-Output "Unsigned source candidate manifest written for $($validated.tag) at commit $($validated.commitSha)."
