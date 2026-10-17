$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$helperPath = Join-Path $repoRoot 'scripts\obs-pilot\build-transfer-iso.ps1'
$sourceManifestPath = Join-Path $repoRoot 'docs\coordination\obs-portable-transfer-manifest.json'
$sourceManifest = Get-Content -LiteralPath $sourceManifestPath -Raw | ConvertFrom-Json
$sourceRoot = $sourceManifest.source.root
$sourceRelative = 'data/obs-studio/OBSPublicRSAKey.pem'
$targetPath = 'obs/data/obs-studio/OBSPublicRSAKey.pem'
$sourcePath = Join-Path $sourceRoot ($sourceRelative.Replace('/', '\'))
$manifestEntry = $sourceManifest.files | Where-Object { $_.path -ceq $sourceRelative } | Select-Object -First 1
if (-not $manifestEntry -or $manifestEntry.bytes -ne 814 -or $manifestEntry.sha256 -cne '8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2') {
  throw 'Installed public-key source does not match the approved OBS manifest pin.'
}
$sourceBytes = [System.IO.File]::ReadAllBytes($sourcePath)
$sourceHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($sourceBytes)).ToLowerInvariant()
if ($sourceBytes.Length -ne $manifestEntry.bytes -or $sourceHash -cne $manifestEntry.sha256) {
  throw 'Installed public-key source drifted from the approved OBS manifest.'
}

$testRoot = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) ('ltth-public-key-validator-test-' + [guid]::NewGuid().ToString('N'))))
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (-not $testRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to create public-key fixtures outside the OS temp directory.'
}

function Get-TestSha256 {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)
  return [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
}

function New-TestCase {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][byte[]]$PayloadBytes,
    [string]$RelativePath = $targetPath,
    [long]$DeclaredBytes = $PayloadBytes.Length,
    [string]$DeclaredSha256 = ''
  )
  $caseRoot = Join-Path $testRoot $Name
  $payload = Join-Path $caseRoot 'payload'
  $output = Join-Path $caseRoot 'out'
  $fixturePath = Join-Path $payload ($RelativePath.Replace('/', '\'))
  New-Item -ItemType Directory -Path (Split-Path -Parent $fixturePath), $output -Force | Out-Null
  [System.IO.File]::WriteAllBytes($fixturePath, $PayloadBytes)
  if ([string]::IsNullOrWhiteSpace($DeclaredSha256)) { $DeclaredSha256 = Get-TestSha256 -Bytes $PayloadBytes }
  $manifestPath = Join-Path $caseRoot 'transfer-manifest.json'
  $manifest = [ordered]@{ schemaVersion = 1; files = @([ordered]@{ path = $RelativePath; bytes = $DeclaredBytes; sha256 = $DeclaredSha256 }) }
  [System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
  return [pscustomobject]@{ Name = $Name; Root = $caseRoot; Payload = $payload; Output = $output; Manifest = $manifestPath; File = $fixturePath }
}

function Invoke-TestCase {
  param(
    [Parameter(Mandatory = $true)][pscustomobject]$Case,
    [Parameter(Mandatory = $true)][bool]$ExpectSuccess,
    [string]$ExpectedDiagnostic
  )
  $outputText = @(& pwsh -NoLogo -NoProfile -File $helperPath `
    -PayloadRoot $Case.Payload `
    -ManifestPath $Case.Manifest `
    -OutputDirectory $Case.Output `
    -ValidateManifestOnly 2>&1 | ForEach-Object { $_.ToString() }) -join "`n"
  $exitCode = $LASTEXITCODE
  if ($ExpectSuccess) {
    if ($exitCode -ne 0) { throw "$($Case.Name) expected exit 0, got $exitCode. Output: $outputText" }
    $result = $outputText | ConvertFrom-Json
    if ($result.status -ne 'manifest-validation-only-passed' -or $result.isoCreated -ne $false -or $result.payloadFileCount -ne 1 -or $result.payloadBytes -ne 814) {
      throw "$($Case.Name) returned unexpected result: $outputText"
    }
    if (@(Get-ChildItem -LiteralPath $Case.Output -Force).Count -ne 0) { throw "$($Case.Name) unexpectedly wrote output files." }
  } else {
    if ($exitCode -eq 0) { throw "$($Case.Name) unexpectedly passed. Output: $outputText" }
    if ($ExpectedDiagnostic -and $outputText -notmatch [regex]::Escape($ExpectedDiagnostic)) {
      throw "$($Case.Name) failed for an unexpected reason. Expected '$ExpectedDiagnostic'. Output: $outputText"
    }
    if (@(Get-ChildItem -LiteralPath $Case.Output -Force).Count -ne 0) { throw "$($Case.Name) unexpectedly wrote output files." }
  }
  Write-Output "PASS $($Case.Name) (exit $exitCode)"
}

New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
  $positive = New-TestCase -Name 'positive-exact-public-rsa4096' -PayloadBytes $sourceBytes -DeclaredBytes $manifestEntry.bytes -DeclaredSha256 $manifestEntry.sha256
  Invoke-TestCase -Case $positive -ExpectSuccess $true

  $hashTamper = New-TestCase -Name 'reject-changed-manifest-hash' -PayloadBytes $sourceBytes -DeclaredBytes $manifestEntry.bytes -DeclaredSha256 ('0' * 64)
  Invoke-TestCase -Case $hashTamper -ExpectSuccess $false -ExpectedDiagnostic 'File hash does not match manifest'

  $byteTamper = New-TestCase -Name 'reject-changed-manifest-bytes' -PayloadBytes $sourceBytes -DeclaredBytes ($manifestEntry.bytes + 1) -DeclaredSha256 $manifestEntry.sha256
  Invoke-TestCase -Case $byteTamper -ExpectSuccess $false -ExpectedDiagnostic 'File size does not match manifest'

  $lookalike = New-TestCase -Name 'reject-lookalike-pem-target' -PayloadBytes $sourceBytes -RelativePath 'obs/data/obs-studio/OBSPublicRSAKey-copy.pem'
  Invoke-TestCase -Case $lookalike -ExpectSuccess $false -ExpectedDiagnostic 'Sensitive or auxiliary file type is not allowed'

  $caseVariant = New-TestCase -Name 'reject-case-changed-target' -PayloadBytes $sourceBytes -RelativePath 'obs/data/obs-studio/obspublicrsakey.pem'
  Invoke-TestCase -Case $caseVariant -ExpectSuccess $false -ExpectedDiagnostic 'Sensitive or auxiliary file type is not allowed'

  $hidden = New-TestCase -Name 'reject-hidden-system-public-key' -PayloadBytes $sourceBytes -DeclaredBytes $manifestEntry.bytes -DeclaredSha256 $manifestEntry.sha256
  [System.IO.File]::SetAttributes($hidden.File, [System.IO.FileAttributes]::Hidden -bor [System.IO.FileAttributes]::System)
  Invoke-TestCase -Case $hidden -ExpectSuccess $false -ExpectedDiagnostic 'Hidden or system files are not allowed'

  $reparse = New-TestCase -Name 'reparse-target-placeholder' -PayloadBytes $sourceBytes -DeclaredBytes $manifestEntry.bytes -DeclaredSha256 $manifestEntry.sha256
  Remove-Item -LiteralPath $reparse.File -Force
  try {
    New-Item -ItemType SymbolicLink -Path $reparse.File -Target $sourcePath | Out-Null
  }
  catch {
    throw "Unable to create the required synthetic reparse fixture: $($_.Exception.GetType().Name)"
  }
  Invoke-TestCase -Case $reparse -ExpectSuccess $false -ExpectedDiagnostic 'Reparse points are not allowed'

  $privateRsa = [System.Security.Cryptography.RSA]::Create(1024)
  try { $privatePem = [System.Text.Encoding]::ASCII.GetBytes($privateRsa.ExportPkcs8PrivateKeyPem()) }
  finally { $privateRsa.Dispose() }
  $private = New-TestCase -Name 'reject-synthetic-private-pem' -PayloadBytes $privatePem
  Invoke-TestCase -Case $private -ExpectSuccess $false -ExpectedDiagnostic 'Trusted public-key exception metadata mismatch'

  $extraBlocks = [System.Text.Encoding]::ASCII.GetBytes(([System.Text.Encoding]::ASCII.GetString($sourceBytes) + "`n" + [System.Text.Encoding]::ASCII.GetString($sourceBytes)))
  $extra = New-TestCase -Name 'reject-extra-pem-block' -PayloadBytes $extraBlocks
  Invoke-TestCase -Case $extra -ExpectSuccess $false -ExpectedDiagnostic 'Trusted public-key exception metadata mismatch'

  $weakRsa = [System.Security.Cryptography.RSA]::Create(2048)
  try { $weakPem = [System.Text.Encoding]::ASCII.GetBytes($weakRsa.ExportSubjectPublicKeyInfoPem()) }
  finally { $weakRsa.Dispose() }
  $weak = New-TestCase -Name 'reject-weak-rsa-public-key' -PayloadBytes $weakPem
  Invoke-TestCase -Case $weak -ExpectSuccess $false -ExpectedDiagnostic 'Trusted public-key exception metadata mismatch'

  $ecCurve = [System.Security.Cryptography.ECCurve]::CreateFromFriendlyName('nistP256')
  $ec = [System.Security.Cryptography.ECDsa]::Create($ecCurve)
  try { $nonRsaPem = [System.Text.Encoding]::ASCII.GetBytes($ec.ExportSubjectPublicKeyInfoPem()) }
  finally { $ec.Dispose() }
  $nonRsa = New-TestCase -Name 'reject-non-rsa-public-key' -PayloadBytes $nonRsaPem
  Invoke-TestCase -Case $nonRsa -ExpectSuccess $false -ExpectedDiagnostic 'Trusted public-key exception metadata mismatch'

  Write-Output '11/11 public-key validator cases passed; each payload fixture contained at most one target file; no ISO or COM path was entered.'
}
finally {
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
if (Test-Path -LiteralPath $testRoot) { throw 'Temporary public-key fixture root was not removed.' }
