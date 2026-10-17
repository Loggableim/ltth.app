[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:ExpectedObsManifestSha256 = '41e4bed8eb2fe413dfafd032a2708c51c1a0a7488741bd4716511ccd2728f8fa'
$script:ExpectedSidekickManifestSha256 = 'e3f475badac6b1ee51fd873654f310c79d3213b768612164dddf6ed9c633c0ed'
$script:ExpectedPublicKeyPolicySha256 = '104189d06ecc8246bb774626181ba5eb7f9e9c2bbbcec6ac34c44273274fecb2'
$script:ExpectedCookiePolicySha256 = '6e4106f878b1f0cf987fe6a0ad6ae306fe5ad6d46600066c01c257bffd211036'
$script:ExpectedLocalePolicySha256 = '7ff07bf8eb90d6280f07c200a6fc68ce4f3a449435367c0c95101af0ea39d27e'
$script:ExpectedNormalizedManifestSha256 = 'f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b'
$script:ExpectedFileCount = 2651
$script:ExpectedPayloadBytes = 490389602L
$script:MinFreeBytes = 2GB
$script:HostOnlySidekickPaths = @(
  'app/plugins/sidekick/test/pilot-public-overlay-harness.test.js',
  'scripts/obs-pilot/create-isolation-receipt.js',
  'scripts/obs-pilot/test/contract.test.js',
  'scripts/obs-pilot/test/stage-contract.test.js'
)

function Get-Sha256 {
  param([Parameter(Mandatory = $true)][string]$Path)
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-PathWithin {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $prefix = $fullRoot + [System.IO.Path]::DirectorySeparatorChar
  return $fullPath.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $fullPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparsePathChain {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $item = Get-Item -LiteralPath $fullPath -Force -ErrorAction Stop
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Reparse point is not allowed: $fullPath"
  }
  $directory = if ($item.PSIsContainer) { [System.IO.DirectoryInfo]::new($item.FullName) } else { $item.Directory }
  while ($null -ne $directory) {
    $directoryItem = Get-Item -LiteralPath $directory.FullName -Force -ErrorAction Stop
    if (($directoryItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Reparse point is not allowed: $($directory.FullName)"
    }
    $directory = $directory.Parent
  }
}

function Assert-OwnedTempRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Workspace,
    [Parameter(Mandatory = $true)][string]$TempRoot
  )
  $fullTemp = [System.IO.Path]::GetFullPath($TempRoot).TrimEnd('\')
  $fullWorkspace = [System.IO.Path]::GetFullPath($Workspace).TrimEnd('\')
  if (-not (Test-PathWithin -Path $fullWorkspace -Root $fullTemp) -or
      -not [System.IO.Path]::GetDirectoryName($fullWorkspace).Equals($fullTemp, [System.StringComparison]::OrdinalIgnoreCase) -or
      [System.IO.Path]::GetFileName($fullWorkspace) -notmatch '^ltth-obs-fullmanifest-[0-9a-f]{32}$') {
    throw 'Refusing cleanup: the resolved workspace is not the owned GUID child of the resolved temp root.'
  }
  if (Test-Path -LiteralPath $fullWorkspace) {
    Assert-NoReparsePathChain -Path $fullWorkspace
  }
  return $fullWorkspace
}

function Remove-OwnedTempRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Workspace,
    [Parameter(Mandatory = $true)][string]$TempRoot
  )
  $ownedPath = Assert-OwnedTempRoot -Workspace $Workspace -TempRoot $TempRoot
  if (Test-Path -LiteralPath $ownedPath) {
    Remove-Item -LiteralPath $ownedPath -Recurse -Force -ErrorAction Stop
  }
  if (Test-Path -LiteralPath $ownedPath) {
    throw 'Owned temp workspace remains after cleanup.'
  }
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$obsRoot = 'C:\Program Files\obs-studio'
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
$nodePath = Join-Path $repositoryRoot 'runtime\node\node.exe'
$normalizerPath = Join-Path $PSScriptRoot '..\normalize-transfer-manifests.js'
$helperPath = Join-Path $PSScriptRoot '..\build-transfer-iso.ps1'
$obsManifestPath = Join-Path $repositoryRoot 'docs\coordination\obs-portable-transfer-manifest.json'
$sidekickManifestPath = Join-Path $repositoryRoot 'docs\coordination\obs-sidekick-pilot-transfer-manifest.json'
$publicKeyPolicyPath = Join-Path $PSScriptRoot '..\transfer-public-key-exception.obs32.1.0.json'
$cookiePolicyPath = Join-Path $PSScriptRoot '..\transfer-path-exceptions.json'
$localePolicyPath = Join-Path $PSScriptRoot '..\transfer-rule1-exceptions.obs32.1.0.json'

$workspace = $null
$workspaceCreated = $false
$validationSummary = $null
$cleanupSummary = 'not-needed'

try {
  if (-not (Test-Path -LiteralPath $repositoryRoot -PathType Container) -or
      -not (Test-Path -LiteralPath $obsRoot -PathType Container) -or
      -not (Test-Path -LiteralPath $tempRoot -PathType Container)) {
    throw 'Repository, OBS source, or resolved temp root is missing.'
  }
  Assert-NoReparsePathChain -Path $repositoryRoot
  Assert-NoReparsePathChain -Path $obsRoot
  Assert-NoReparsePathChain -Path $tempRoot
  if (-not (Test-PathWithin -Path $tempRoot -Root ([System.IO.Path]::GetPathRoot($tempRoot)))) {
    throw 'Resolved temp root failed volume containment.'
  }

  $drive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($tempRoot))
  if ($drive.AvailableFreeSpace -le $script:MinFreeBytes) {
    throw "Temp volume must have more than 2 GiB free before source verification; available=$($drive.AvailableFreeSpace)."
  }

  $expectedPolicyPins = @(
    [pscustomobject]@{ Path = $obsManifestPath; Sha256 = $script:ExpectedObsManifestSha256 },
    [pscustomobject]@{ Path = $sidekickManifestPath; Sha256 = $script:ExpectedSidekickManifestSha256 },
    [pscustomobject]@{ Path = $publicKeyPolicyPath; Sha256 = $script:ExpectedPublicKeyPolicySha256 },
    [pscustomobject]@{ Path = $cookiePolicyPath; Sha256 = $script:ExpectedCookiePolicySha256 },
    [pscustomobject]@{ Path = $localePolicyPath; Sha256 = $script:ExpectedLocalePolicySha256 }
  )
  foreach ($pin in $expectedPolicyPins) {
    if (-not (Test-Path -LiteralPath $pin.Path -PathType Leaf)) { throw "Pinned manifest or policy is missing: $($pin.Path)" }
    Assert-NoReparsePathChain -Path $pin.Path
    if ((Get-Sha256 -Path $pin.Path) -cne $pin.Sha256) { throw "Pinned manifest or policy hash mismatch: $($pin.Path)" }
  }

  $runtime = (& $nodePath -p "JSON.stringify({version:process.version,abi:process.versions.modules})" | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or $runtime.version -ne 'v22.14.0' -or $runtime.abi -ne '127') {
    throw 'Bundled Node version/ABI does not match the Sidekick pilot pin.'
  }
  if ((Get-Sha256 -Path $nodePath) -cne '33b1bc1a8aca11fd5a4f2699e51019c63c0af30cf437701d07af69be7706771b') {
    throw 'Bundled Node executable SHA-256 does not match the Sidekick pilot pin.'
  }

  $nodeScript = @'
const fs = require('node:fs');
const path = require('node:path');
const { normalizeTransferManifests } = require(process.argv[1]);
const root = process.argv[2];
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const result = normalizeTransferManifests({
  obsManifest: readJson('docs/coordination/obs-portable-transfer-manifest.json'),
  obsRoot: 'C:/Program Files/obs-studio',
  sidekickManifest: readJson('docs/coordination/obs-sidekick-pilot-transfer-manifest.json'),
  repositoryRoot: root,
});
process.stdout.write(JSON.stringify({
  status: result.status,
  files: result.files,
  bytes: result.bytes,
  manifestSha256: result.manifestSha256,
  canonicalManifest: JSON.stringify(result.manifest),
}));
'@
  $normalizerOutput = & $nodePath -e $nodeScript $normalizerPath $repositoryRoot
  if ($LASTEXITCODE -ne 0) { throw 'Read-only normalizer failed before isolated payload creation.' }
  $normalizerText = [string]::Join([Environment]::NewLine, @($normalizerOutput))
  $normalized = $normalizerText | ConvertFrom-Json
  if ($normalized.status -ne 'dry-run-only-normalization-verified' -or
      [int]$normalized.files -ne $script:ExpectedFileCount -or
      [long]$normalized.bytes -ne $script:ExpectedPayloadBytes -or
      $normalized.manifestSha256 -cne $script:ExpectedNormalizedManifestSha256) {
    throw 'Fresh normalizer output did not match the pinned canonical manifest totals/hash.'
  }

  $obsManifest = Get-Content -LiteralPath $obsManifestPath -Raw | ConvertFrom-Json
  $sidekickManifest = Get-Content -LiteralPath $sidekickManifestPath -Raw | ConvertFrom-Json
  $sourceMap = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $obsManifest.files) {
    $target = 'obs/' + [string]$entry.path
    if (-not $sourceMap.TryAdd($target, [pscustomobject]@{ Source = Join-Path $obsRoot ([string]$entry.path.Replace('/', '\')); Root = $obsRoot })) {
      throw "Duplicate source mapping for normalized target: $target"
    }
  }
  $hostOnly = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($hostPath in $script:HostOnlySidekickPaths) { [void]$hostOnly.Add($hostPath) }
  $effectiveTargets = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $sidekickManifest.files) {
    $sourceRelative = [string]$entry.path
    if ($hostOnly.Contains($sourceRelative)) { continue }
    $target = if ($sourceRelative.StartsWith('runtime/', [System.StringComparison]::Ordinal)) { $sourceRelative } else { 'pilot/' + $sourceRelative }
    if (-not $effectiveTargets.TryAdd($target, $entry)) { throw "Duplicate Sidekick effective target: $target" }
    if (-not $sourceMap.TryAdd($target, [pscustomobject]@{ Source = Join-Path $repositoryRoot ($sourceRelative.Replace('/', '\')); Root = $repositoryRoot })) {
      throw "Duplicate source mapping for normalized target: $target"
    }
  }
  if ($sidekickManifest.effectiveTransfer.files.Count -ne $effectiveTargets.Count) {
    throw 'Sidekick source/effective-transfer record counts differ.'
  }
  foreach ($allow in $sidekickManifest.effectiveTransfer.files) {
    if (-not $effectiveTargets.ContainsKey([string]$allow.path)) { throw "Sidekick effective target has no source record: $($allow.path)" }
    $sourceEntry = $effectiveTargets[[string]$allow.path]
    if ([long]$sourceEntry.bytes -ne [long]$allow.bytes -or [string]$sourceEntry.sha256 -cne [string]$allow.sha256) {
      throw "Sidekick effective-transfer metadata mismatch: $($allow.path)"
    }
  }

  $normalizedManifest = $normalized.canonicalManifest | ConvertFrom-Json
  if ([int]$normalizedManifest.schemaVersion -ne 1 -or $normalizedManifest.files.Count -ne $script:ExpectedFileCount) {
    throw 'Normalized helper manifest structure/count is invalid.'
  }
  $targetSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $sourceBytesVerified = 0L
  foreach ($entry in $normalizedManifest.files) {
    $target = [string]$entry.path
    if (-not $targetSet.Add($target)) { throw "Case-insensitive duplicate normalized target: $target" }
    if (-not $sourceMap.ContainsKey($target)) { throw "Normalized target has no source mapping: $target" }
    $mapping = $sourceMap[$target]
    $source = [System.IO.Path]::GetFullPath([string]$mapping.Source)
    if (-not (Test-PathWithin -Path $source -Root ([string]$mapping.Root)) -or
        -not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Source escaped its pinned root or is missing: $target"
    }
    Assert-NoReparsePathChain -Path $source
    $sourceItem = Get-Item -LiteralPath $source -Force
    if ($sourceItem.Length -ne [long]$entry.bytes -or (Get-Sha256 -Path $source) -cne ([string]$entry.sha256).ToLowerInvariant()) {
      throw "Source byte count/hash differs from canonical manifest: $target"
    }
    $sourceBytesVerified += [long]$sourceItem.Length
  }
  if ($targetSet.Count -ne $sourceMap.Count -or $sourceMap.Count -ne $script:ExpectedFileCount -or $sourceBytesVerified -ne $script:ExpectedPayloadBytes) {
    throw 'Canonical target/source mapping is incomplete or has unexpected totals.'
  }

  $drive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($tempRoot))
  if ($drive.AvailableFreeSpace -le $script:MinFreeBytes) {
    throw "Temp volume must retain more than 2 GiB free before payload copy; available=$($drive.AvailableFreeSpace)."
  }

  $workspace = Join-Path $tempRoot ('ltth-obs-fullmanifest-' + [guid]::NewGuid().ToString('N'))
  if (Test-Path -LiteralPath $workspace) { throw 'Unique temp workspace unexpectedly already exists.' }
  $resolvedWorkspace = [System.IO.Path]::GetFullPath($workspace)
  if (-not (Test-PathWithin -Path $resolvedWorkspace -Root $tempRoot) -or
      -not [System.IO.Path]::GetDirectoryName($resolvedWorkspace).Equals($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to create workspace outside the resolved OS temp root.'
  }
  [void][System.IO.Directory]::CreateDirectory($resolvedWorkspace)
  $workspaceCreated = $true
  Assert-NoReparsePathChain -Path $resolvedWorkspace
  $payloadRoot = Join-Path $resolvedWorkspace 'payload'
  $outputDirectory = Join-Path $resolvedWorkspace 'output'
  [void][System.IO.Directory]::CreateDirectory($payloadRoot)
  [void][System.IO.Directory]::CreateDirectory($outputDirectory)
  Assert-OwnedTempRoot -Workspace $resolvedWorkspace -TempRoot $tempRoot | Out-Null

  $manifestPath = Join-Path $resolvedWorkspace 'transfer-manifest.json'
  $manifestBytes = [System.Text.UTF8Encoding]::new($false).GetBytes([string]$normalized.canonicalManifest)
  $manifestHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($manifestBytes)).ToLowerInvariant()
  if ($manifestHash -cne $script:ExpectedNormalizedManifestSha256) { throw 'Canonical manifest bytes hash mismatch before write.' }
  [System.IO.File]::WriteAllBytes($manifestPath, $manifestBytes)

  $copiedBytes = 0L
  foreach ($entry in $normalizedManifest.files) {
    $target = [string]$entry.path
    $mapping = $sourceMap[$target]
    $destination = [System.IO.Path]::GetFullPath((Join-Path $payloadRoot ($target.Replace('/', '\'))))
    if (-not (Test-PathWithin -Path $destination -Root $payloadRoot)) { throw "Destination escaped temp payload root: $target" }
    $destinationDirectory = [System.IO.Path]::GetDirectoryName($destination)
    [void][System.IO.Directory]::CreateDirectory($destinationDirectory)
    if (Test-Path -LiteralPath $destination) { throw "Destination collision before copy: $target" }
    [System.IO.File]::Copy([string]$mapping.Source, $destination, $false)
    Assert-NoReparsePathChain -Path $destination
    $destinationItem = Get-Item -LiteralPath $destination -Force
    if (($destinationItem.Attributes -band ([System.IO.FileAttributes]::Hidden -bor [System.IO.FileAttributes]::System)) -ne 0 -or
        $destinationItem.Length -ne [long]$entry.bytes -or
        (Get-Sha256 -Path $destination) -cne ([string]$entry.sha256).ToLowerInvariant()) {
      throw "Copied file differs from canonical manifest: $target"
    }
    $copiedBytes += [long]$destinationItem.Length
  }
  if ($copiedBytes -ne $script:ExpectedPayloadBytes) { throw 'Copied payload byte total differs from canonical manifest.' }

  $payloadFiles = @(Get-ChildItem -LiteralPath $payloadRoot -Recurse -File -Force -ErrorAction Stop)
  if ($payloadFiles.Count -ne $script:ExpectedFileCount) { throw 'Copied payload file count differs from canonical manifest.' }
  if ((@(Get-ChildItem -LiteralPath $outputDirectory -Force -ErrorAction Stop)).Count -ne 0) {
    throw 'Output directory must be empty before manifest-only validation.'
  }

  $helperOutput = & pwsh -NoProfile -File $helperPath -PayloadRoot $payloadRoot -ManifestPath $manifestPath -OutputDirectory $outputDirectory -ValidateManifestOnly 2>&1
  $helperExitCode = $LASTEXITCODE
  $helperText = [string]::Join([Environment]::NewLine, @($helperOutput | ForEach-Object { $_.ToString() }))
  if ($helperExitCode -ne 0) { throw "PowerShell helper validation failed (exit $helperExitCode): $helperText" }
  $validationSummary = $helperText | ConvertFrom-Json
  if ($validationSummary.status -ne 'manifest-validation-only-passed' -or
      $validationSummary.manifestSha256 -cne $script:ExpectedNormalizedManifestSha256 -or
      [long]$validationSummary.manifestBytes -ne $manifestBytes.Length -or
      [int]$validationSummary.payloadFileCount -ne $script:ExpectedFileCount -or
      [long]$validationSummary.payloadBytes -ne $script:ExpectedPayloadBytes -or
      [bool]$validationSummary.isoCreated) {
    throw 'PowerShell helper output did not match the pinned manifest-only result.'
  }
  if ((@(Get-ChildItem -LiteralPath $outputDirectory -Force -ErrorAction Stop)).Count -ne 0) {
    throw 'Manifest-only helper unexpectedly wrote to OutputDirectory.'
  }

  [pscustomobject]@{
    status = 'full-manifest-only-validation-passed'
    workspace = $resolvedWorkspace
    tempRoot = $tempRoot
    freeBytesBeforeCopy = $drive.AvailableFreeSpace
    normalizedManifestSha256 = $normalized.manifestSha256
    manifestFileSha256 = $manifestHash
    payloadFileCount = $payloadFiles.Count
    payloadBytes = $copiedBytes
    helperStatus = $validationSummary.status
    helperExitCode = $helperExitCode
    helperIsoCreated = [bool]$validationSummary.isoCreated
    outputDirectoryEmpty = $true
    sidekickRuntimeVersion = $runtime.version
    sidekickRuntimeAbi = $runtime.abi
    diskFullFailure = 'not induced; failure path is guarded by the same owned-temp-root finally cleanup'
  } | ConvertTo-Json -Depth 4
}
finally {
  if ($workspaceCreated -and $null -ne $workspace) {
    Remove-OwnedTempRoot -Workspace $workspace -TempRoot $tempRoot
    $cleanupSummary = 'owned GUID temp workspace removed; resolved under OS temp root before recursive cleanup'
  }
  Write-Output "cleanup=$cleanupSummary"
}
