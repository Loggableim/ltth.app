$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$helperPath = Join-Path $repoRoot 'scripts\obs-pilot\build-transfer-iso.ps1'
$activePolicyPath = Join-Path $repoRoot 'scripts\obs-pilot\transfer-rule1-exceptions.obs32.1.0.json'
$sourceManifestPath = Join-Path $repoRoot 'docs\coordination\obs-portable-transfer-manifest.json'
$obsRoot = 'C:\Program Files\obs-studio'
$policy = Get-Content -LiteralPath $activePolicyPath -Raw | ConvertFrom-Json
$sourceManifest = Get-Content -LiteralPath $sourceManifestPath -Raw | ConvertFrom-Json
$sourceManifestHash = (Get-FileHash -LiteralPath $sourceManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sourceManifestHash -cne $policy.sourceManifestSha256) { throw 'OBS source manifest hash differs from active locale policy.' }
if ($policy.entries.Count -ne 176) { throw 'Active locale policy does not contain exactly 176 entries.' }

function Assert-SourceNoReparse {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)][string]$RelativePath)
  $cursor = $Root
  foreach ($segment in $RelativePath.Split('/')) {
    $cursor = Join-Path $cursor $segment
    $item = Get-Item -LiteralPath $cursor -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Manifest source contains a reparse point: $RelativePath"
    }
  }
}

# Verify the entire pinned policy against the original installed source tree without staging or copying it.
$manifestByPath = @{}
foreach ($entry in $sourceManifest.files) { $manifestByPath['obs/' + $entry.path] = $entry }
$verifiedBytes = 0L
foreach ($entry in $policy.entries) {
  if (-not $manifestByPath.ContainsKey($entry.path)) { throw "Policy entry is absent from the OBS source manifest: $($entry.path)" }
  $sourceEntry = $manifestByPath[$entry.path]
  if ($sourceEntry.bytes -ne $entry.bytes -or $sourceEntry.sha256.ToLowerInvariant() -cne $entry.sha256) {
    throw "Policy entry differs from the OBS source manifest: $($entry.path)"
  }
  $relativeSource = $entry.path.Substring(4)
  Assert-SourceNoReparse -Root $obsRoot -RelativePath $relativeSource
  $sourcePath = Join-Path $obsRoot ($relativeSource.Replace('/', '\'))
  $sourceItem = Get-Item -LiteralPath $sourcePath -Force
  $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sourceItem.Length -ne $entry.bytes -or $sourceHash -cne $entry.sha256) {
    throw "Installed OBS source differs from the pinned locale policy: $($entry.path)"
  }
  $verifiedBytes += $sourceItem.Length
}
Write-Output "PASS policy-completeness (176 source files, $verifiedBytes bytes, manifest/hash/reparse verified)"

$representative = $policy.entries | Where-Object { $_.path -ceq 'obs/data/obs-plugins/obs-websocket/locale/af-ZA.ini' } | Select-Object -First 1
if (-not $representative) { throw 'Expected representative obs-websocket locale entry is missing.' }
$representativeSource = Join-Path $obsRoot (($representative.path.Substring(4)).Replace('/', '\'))
$representativeBytes = [System.IO.File]::ReadAllBytes($representativeSource)
$representativeHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($representativeBytes)).ToLowerInvariant()
if ($representativeBytes.Length -ne $representative.bytes -or $representativeHash -cne $representative.sha256) {
  throw 'Representative locale fixture source differs from the policy pin.'
}

$testRoot = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) ('ltth-locale-rule1-test-' + [guid]::NewGuid().ToString('N'))))
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (-not $testRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to create locale validator fixtures outside the OS temp directory.'
}

function Write-TestManifest {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][object[]]$Entries)
  $json = [ordered]@{ schemaVersion = 1; files = @($Entries) } | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($Path, $json, [System.Text.UTF8Encoding]::new($false))
}

function Get-TestEntry {
  param([Parameter(Mandatory = $true)][string]$TargetPath, [Parameter(Mandatory = $true)][string]$FullPath)
  $item = Get-Item -LiteralPath $FullPath -Force
  $hash = (Get-FileHash -LiteralPath $FullPath -Algorithm SHA256).Hash.ToLowerInvariant()
  return [pscustomobject]@{ path = $TargetPath; bytes = [long]$item.Length; sha256 = $hash }
}

function Invoke-ValidatorCase {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$PayloadRoot,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [Parameter(Mandatory = $true)][string]$ExpectedDiagnostic
  )
  $outputText = @(& pwsh -NoLogo -NoProfile -File $helperPath `
    -PayloadRoot $PayloadRoot `
    -ManifestPath $ManifestPath `
    -OutputDirectory $OutputDirectory `
    -ValidateManifestOnly 2>&1 | ForEach-Object { $_.ToString() }) -join "`n"
  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0) { throw "$Name unexpectedly passed." }
  if ($outputText -notmatch [regex]::Escape($ExpectedDiagnostic)) {
    throw "$Name failed for an unexpected reason; expected '$ExpectedDiagnostic'. Output: $outputText"
  }
  if (@(Get-ChildItem -LiteralPath $OutputDirectory -Force).Count -ne 0) { throw "$Name wrote into output directory." }
  Write-Output "PASS $Name (exit $exitCode)"
}

New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
  $positiveRoot = Join-Path $testRoot 'positive'
  $positivePayload = Join-Path $positiveRoot 'payload'
  $positiveOutput = Join-Path $positiveRoot 'out'
  $relativeTarget = $representative.path.Replace('/', '\')
  $positiveFile = Join-Path $positivePayload $relativeTarget
  New-Item -ItemType Directory -Path (Split-Path -Parent $positiveFile), $positiveOutput -Force | Out-Null
  [System.IO.File]::WriteAllBytes($positiveFile, $representativeBytes)
  $positiveManifest = Join-Path $positiveRoot 'transfer-manifest.json'
  Write-TestManifest -Path $positiveManifest -Entries @((Get-TestEntry -TargetPath $representative.path -FullPath $positiveFile))
  $positiveOutputText = @(& pwsh -NoLogo -NoProfile -File $helperPath `
    -PayloadRoot $positivePayload `
    -ManifestPath $positiveManifest `
    -OutputDirectory $positiveOutput `
    -ValidateManifestOnly 2>&1 | ForEach-Object { $_.ToString() }) -join "`n"
  $positiveExitCode = $LASTEXITCODE
  if ($positiveExitCode -ne 0) { throw "Representative OBS locale fixture failed with exit $positiveExitCode. Output: $positiveOutputText" }
  $positiveResult = $positiveOutputText | ConvertFrom-Json
  if ($positiveResult.status -ne 'manifest-validation-only-passed' -or $positiveResult.isoCreated -ne $false -or $positiveResult.payloadFileCount -ne 1 -or $positiveResult.payloadBytes -ne $representative.bytes) {
    throw "Representative OBS locale fixture returned an unexpected result: $positiveOutputText"
  }
  if (@(Get-ChildItem -LiteralPath $positiveOutput -Force).Count -ne 0) { throw 'Positive locale case wrote to output.' }
  Write-Output "PASS positive-representative-obs-locale (exit $positiveExitCode, isoCreated=false)"

  $tamperedRoot = Join-Path $testRoot 'tampered-content'
  $tamperedPayload = Join-Path $tamperedRoot 'payload'
  $tamperedOutput = Join-Path $tamperedRoot 'out'
  $tamperedFile = Join-Path $tamperedPayload $relativeTarget
  New-Item -ItemType Directory -Path (Split-Path -Parent $tamperedFile), $tamperedOutput -Force | Out-Null
  $tamperedBytes = [byte[]]::new($representativeBytes.Length + 1)
  [Array]::Copy($representativeBytes, $tamperedBytes, $representativeBytes.Length)
  $tamperedBytes[$tamperedBytes.Length - 1] = 10
  [System.IO.File]::WriteAllBytes($tamperedFile, $tamperedBytes)
  $tamperedManifest = Join-Path $tamperedRoot 'transfer-manifest.json'
  Write-TestManifest -Path $tamperedManifest -Entries @((Get-TestEntry -TargetPath $representative.path -FullPath $tamperedFile))
  Invoke-ValidatorCase -Name 'reject-changed-content-even-when-manifest-rehashed' -PayloadRoot $tamperedPayload -ManifestPath $tamperedManifest -OutputDirectory $tamperedOutput -ExpectedDiagnostic 'Trusted credential rule-1 exception metadata mismatch'

  $badShaRoot = Join-Path $testRoot 'bad-sha'
  $badShaPayload = Join-Path $badShaRoot 'payload'
  $badShaOutput = Join-Path $badShaRoot 'out'
  $badShaFile = Join-Path $badShaPayload $relativeTarget
  New-Item -ItemType Directory -Path (Split-Path -Parent $badShaFile), $badShaOutput -Force | Out-Null
  [System.IO.File]::WriteAllBytes($badShaFile, $representativeBytes)
  $badShaEntry = Get-TestEntry -TargetPath $representative.path -FullPath $badShaFile
  $badShaEntry.sha256 = '0' * 64
  $badShaManifest = Join-Path $badShaRoot 'transfer-manifest.json'
  Write-TestManifest -Path $badShaManifest -Entries @($badShaEntry)
  Invoke-ValidatorCase -Name 'reject-manifest-sha-tamper' -PayloadRoot $badShaPayload -ManifestPath $badShaManifest -OutputDirectory $badShaOutput -ExpectedDiagnostic 'File hash does not match manifest'

  $badBytesRoot = Join-Path $testRoot 'bad-bytes'
  $badBytesPayload = Join-Path $badBytesRoot 'payload'
  $badBytesOutput = Join-Path $badBytesRoot 'out'
  $badBytesFile = Join-Path $badBytesPayload $relativeTarget
  New-Item -ItemType Directory -Path (Split-Path -Parent $badBytesFile), $badBytesOutput -Force | Out-Null
  [System.IO.File]::WriteAllBytes($badBytesFile, $representativeBytes)
  $badBytesEntry = Get-TestEntry -TargetPath $representative.path -FullPath $badBytesFile
  $badBytesEntry.bytes++
  $badBytesManifest = Join-Path $badBytesRoot 'transfer-manifest.json'
  Write-TestManifest -Path $badBytesManifest -Entries @($badBytesEntry)
  Invoke-ValidatorCase -Name 'reject-manifest-byte-tamper' -PayloadRoot $badBytesPayload -ManifestPath $badBytesManifest -OutputDirectory $badBytesOutput -ExpectedDiagnostic 'File size does not match manifest'

  $lookalikeRoot = Join-Path $testRoot 'lookalike'
  $lookalikePayload = Join-Path $lookalikeRoot 'payload'
  $lookalikeOutput = Join-Path $lookalikeRoot 'out'
  $lookalikeTarget = 'obs/data/obs-plugins/untrusted/locale/en-US.ini'
  $lookalikeFile = Join-Path $lookalikePayload $lookalikeTarget.Replace('/', '\')
  New-Item -ItemType Directory -Path (Split-Path -Parent $lookalikeFile), $lookalikeOutput -Force | Out-Null
  [System.IO.File]::WriteAllText($lookalikeFile, 'Password="synthetic-placeholder-value"' + "`n", [System.Text.UTF8Encoding]::new($false))
  $lookalikeManifest = Join-Path $lookalikeRoot 'transfer-manifest.json'
  Write-TestManifest -Path $lookalikeManifest -Entries @((Get-TestEntry -TargetPath $lookalikeTarget -FullPath $lookalikeFile))
  Invoke-ValidatorCase -Name 'reject-untrusted-locale-lookalike-rule1' -PayloadRoot $lookalikePayload -ManifestPath $lookalikeManifest -OutputDirectory $lookalikeOutput -ExpectedDiagnostic 'Credential-like literal detected in text payload'

  $otherRuleSamples = @(
    @{ Name = 'rule2-bearer'; Value = ('Bearer ' + ('A' * 24)) },
    @{ Name = 'rule3-private-key-marker'; Value = '-----BEGIN PRIVATE KEY-----' },
    @{ Name = 'rule4-aws-token'; Value = ('AKIA' + ('A' * 16)) },
    @{ Name = 'rule5-google-api-token'; Value = ('AIza' + ('A' * 35)) },
    @{ Name = 'rule6-github-token'; Value = ('ghp_' + ('A' * 24)) },
    @{ Name = 'rule7-jwt-shape'; Value = ('eyJ' + ('A' * 12) + '.' + ('B' * 12) + '.' + ('C' * 12)) }
  )
  foreach ($sample in $otherRuleSamples) {
    $caseRoot = Join-Path $testRoot $sample.Name
    $casePayload = Join-Path $caseRoot 'payload'
    $caseOutput = Join-Path $caseRoot 'out'
    $caseTarget = 'obs/data/obs-plugins/untrusted/locale/en-US.ini'
    $caseFile = Join-Path $casePayload $caseTarget.Replace('/', '\')
    New-Item -ItemType Directory -Path (Split-Path -Parent $caseFile), $caseOutput -Force | Out-Null
    [System.IO.File]::WriteAllText($caseFile, $sample.Value + "`n", [System.Text.UTF8Encoding]::new($false))
    $caseManifest = Join-Path $caseRoot 'transfer-manifest.json'
    Write-TestManifest -Path $caseManifest -Entries @((Get-TestEntry -TargetPath $caseTarget -FullPath $caseFile))
    Invoke-ValidatorCase -Name ('reject-' + $sample.Name) -PayloadRoot $casePayload -ManifestPath $caseManifest -OutputDirectory $caseOutput -ExpectedDiagnostic 'Credential-like literal detected in text payload'
  }

  $trustedOtherRoot = Join-Path $testRoot 'trusted-other-rule'
  $trustedOtherPayload = Join-Path $trustedOtherRoot 'payload'
  $trustedOtherOutput = Join-Path $trustedOtherRoot 'out'
  $trustedOtherFile = Join-Path $trustedOtherPayload $relativeTarget
  New-Item -ItemType Directory -Path (Split-Path -Parent $trustedOtherFile), $trustedOtherOutput -Force | Out-Null
  $otherRuleBytes = [System.Text.Encoding]::UTF8.GetBytes(('Bearer ' + ('A' * 24) + "`n"))
  [System.IO.File]::WriteAllBytes($trustedOtherFile, $otherRuleBytes)
  $trustedOtherManifest = Join-Path $trustedOtherRoot 'transfer-manifest.json'
  Write-TestManifest -Path $trustedOtherManifest -Entries @((Get-TestEntry -TargetPath $representative.path -FullPath $trustedOtherFile))
  Invoke-ValidatorCase -Name 'reject-other-rule-in-trusted-path-after-rehash' -PayloadRoot $trustedOtherPayload -ManifestPath $trustedOtherManifest -OutputDirectory $trustedOtherOutput -ExpectedDiagnostic 'Trusted credential rule-1 exception metadata mismatch'
}
finally {
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}

if (Test-Path -LiteralPath $testRoot) { throw 'Temporary locale validator test root was not removed.' }
Write-Output 'PASS temp-cleanup'
Write-Output '12/12 validator cases passed; no ISO or COM path was entered.'
