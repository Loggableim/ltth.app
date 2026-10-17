# One isolated regression: rejected stale source/receipt must never reach build or publisher.
# All EXE bytes and signature results are synthetic; no signer or publisher is executed.
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib/launcher-release-handoff.psm1') -Force
$root = Join-Path ([IO.Path]::GetTempPath()) ('ltth-stale-handoff-' + [guid]::NewGuid().ToString('N'))
$oldMarker = $env:LTTH_STALE_BUILD_MARKER
$oldBytes = $env:LTTH_STALE_BUILD_BYTES
function Write-Json($Path, $Value) {
  [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
}
function Assert-True($Value, $Message) { if (-not $Value) { throw $Message } }
try {
  $source = Join-Path $root 'source'
  $build = Join-Path $source 'build-src'
  $candidate = Join-Path $root 'candidate'
  $signed = Join-Path $root 'signed'
  New-Item -ItemType Directory -Path $build, $candidate, $signed | Out-Null
  [IO.File]::WriteAllText((Join-Path $build 'go.mod'), "module synthetic.invalid/launcher`n`ngo 1.24.10`n")
  $goSource = Join-Path $build 'main.go'
  $originalSource = "package main`nfunc main() {}`n"
  [IO.File]::WriteAllText($goSource, $originalSource)
  foreach ($arguments in @(
    @('init', '--quiet'), @('config', 'user.name', 'Synthetic Fixture'),
    @('config', 'user.email', 'fixture@example.invalid'), @('add', '--', 'build-src'),
    @('commit', '--quiet', '-m', 'synthetic source'), @('tag', 'v1.2.3')
  )) {
    & git -C $source @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Temporary fixture Git setup failed.' }
  }
  $commit = (& git -C $source rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Temporary fixture commit lookup failed.' }
  $fakeGo = Join-Path $root 'fake-go.ps1'
  @'
if ($args[0] -eq 'version') { $global:LASTEXITCODE = 0; 'go version go1.24.10 windows/amd64'; return }
if ($args[0] -eq 'build') {
  [IO.File]::WriteAllText($env:LTTH_STALE_BUILD_MARKER, 'fake-build-called')
  $index = [Array]::IndexOf($args, '-o')
  [IO.File]::WriteAllBytes($args[$index + 1], [IO.File]::ReadAllBytes($env:LTTH_STALE_BUILD_BYTES))
  $global:LASTEXITCODE = 0; return
}
$global:LASTEXITCODE = 2
'@ | Set-Content -LiteralPath $fakeGo -Encoding UTF8
  $env:LTTH_STALE_BUILD_MARKER = Join-Path $root 'build-called'
  $env:LTTH_STALE_BUILD_BYTES = Join-Path $candidate 'launcher.exe'
  [IO.File]::WriteAllText($env:LTTH_STALE_BUILD_BYTES, 'SYNTHETIC-UNSIGNED-BYTES')
  $candidateManifest = Join-Path $candidate 'launcher-candidate.json'
  & (Join-Path $PSScriptRoot 'write-launcher-candidate-manifest.ps1') -CandidatePath $env:LTTH_STALE_BUILD_BYTES `
    -ManifestPath $candidateManifest -Version '1.2.3' -Tag 'v1.2.3' -CommitSha $commit -SourceRunId '456' `
    -SourceWorkflow '.github/workflows/release.yml' -SourceEvent 'push' -SourceRef 'refs/tags/v1.2.3' -GoExecutable $fakeGo | Out-Null
  $c = Get-Content -LiteralPath $candidateManifest -Raw | ConvertFrom-Json
  Copy-Item -LiteralPath $candidateManifest -Destination $signed
  Write-Json (Join-Path $signed 'launcher-source-run-receipt.json') ([ordered]@{
    schema=1; repository='Loggableim/ltth.app'; runId=456; workflow='.github/workflows/release.yml'
    event='push'; ref='refs/tags/v1.2.3'; commitSha=$commit
  })
  $signedExe = Join-Path $signed 'launcher.exe'
  [IO.File]::WriteAllText($signedExe, 'SYNTHETIC-SIGNED-BYTES-NOT-A-PE')
  $signedHash = (Get-FileHash -LiteralPath $signedExe).Hash.ToLowerInvariant()
  $thumbprint = '0123456789abcdef0123456789abcdef01234567'
  Write-Json (Join-Path $signed 'launcher-release.json') ([ordered]@{
    schema=1; component='launcher.exe'; version=$c.version; tag=$c.tag; commitSha=$commit
    bytes=(Get-Item -LiteralPath $signedExe).Length; sha256=$signedHash
  })
  Write-Json (Join-Path $signed 'launcher-build-provenance.json') ([ordered]@{
    schema=2; component='launcher.exe'; sourceRunId=$c.sourceRunId; sourceWorkflow=$c.sourceWorkflow
    sourceEvent=$c.sourceEvent; sourceRef=$c.sourceRef; sourceCommitSha=$commit
    version=$c.version; tag=$c.tag; toolchain=$c.toolchain; target=$c.target; cgoEnabled=$c.cgoEnabled
    moduleMode=$c.moduleMode; buildFlags=$c.buildFlags; candidateBytes=$c.bytes; candidateSha256=$c.sha256
    candidateManifestSha256=(Get-FileHash -LiteralPath $candidateManifest).Hash.ToLowerInvariant()
    signedBytes=(Get-Item -LiteralPath $signedExe).Length; signedSha256=$signedHash
    expectedSignerThumbprint=$thumbprint; signerThumbprint=$thumbprint; timestampSignerThumbprint=('a' * 40)
  })
  $params = @{
    SourceRoot=$source; CandidateDirectory=$candidate; SignedDirectory=$signed
    ExpectedCommitSha=$commit; ExpectedTag='v1.2.3'; ExpectedSourceRunId='456'
    ExpectedSignerThumbprint=$thumbprint; GoExecutable=$fakeGo
    SignatureProvider={ param($path) [pscustomobject]@{
      Status='Valid'; SignerCertificate=[pscustomobject]@{Thumbprint='0123456789abcdef0123456789abcdef01234567'}
      TimeStamperCertificate=[pscustomobject]@{Thumbprint=('a' * 40)}
    }}
  }
  # Positive control proves the fixture can reach the fake build and accepted output.
  $accepted = Join-Path $root 'accepted'
  Test-LauncherReleaseHandoff @params -OutputDirectory $accepted | Out-Null
  Assert-True (Test-Path -LiteralPath $env:LTTH_STALE_BUILD_MARKER) 'Positive control did not run fake build.'
  $receiptPath = Join-Path $signed 'launcher-handoff.json'
  Copy-Item -LiteralPath (Join-Path $accepted 'launcher-handoff.json') -Destination $receiptPath
  $receiptBytes = [IO.File]::ReadAllBytes($receiptPath)
  Remove-Item -LiteralPath $env:LTTH_STALE_BUILD_MARKER
  $publisherMarker = Join-Path $root 'publisher-called'
  $sourceReceiptPath = Join-Path $signed 'launcher-source-run-receipt.json'
  $sourceReceiptBytes = [IO.File]::ReadAllBytes($sourceReceiptPath)
  foreach ($case in @('changed-go-source', 'wrong-run-receipt', 'wrong-commit-receipt', 'wrong-source-workflow-receipt')) {
    [IO.File]::WriteAllText($goSource, $originalSource)
    [IO.File]::WriteAllBytes($receiptPath, $receiptBytes)
    [IO.File]::WriteAllBytes($sourceReceiptPath, $sourceReceiptBytes)
    if ($case -eq 'changed-go-source') {
      [IO.File]::AppendAllText($goSource, "// changed after candidate build`n")
      $expectedError = 'Source checkout must be clean'
    } else {
      $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
      if ($case -eq 'wrong-run-receipt') { $receipt.sourceRunId = 457 }
      elseif ($case -eq 'wrong-commit-receipt') { $receipt.sourceCommitSha = 'f' * 40 }
      elseif ($case -eq 'wrong-source-workflow-receipt') {
        $sourceReceipt = Get-Content -LiteralPath $sourceReceiptPath -Raw | ConvertFrom-Json
        $sourceReceipt.workflow = '.github/workflows/build-launcher.yml'
        Write-Json $sourceReceiptPath $sourceReceipt
      } else { $receipt.sourceWorkflow = '.github/workflows/build-launcher.yml' }
      if ($case -ne 'wrong-source-workflow-receipt') { Write-Json $receiptPath $receipt }
      $expectedError = if ($case -eq 'wrong-source-workflow-receipt') { 'Source-run provenance receipt does not match' } else { 'Launcher handoff receipt does not match' }
    }
    $output = Join-Path $root $case
    $failure = $null
    try {
      Test-LauncherReleaseHandoff @params -OutputDirectory $output | Out-Null
      [IO.File]::WriteAllText($publisherMarker, 'fake-publisher-called')
    } catch { $failure = $_.Exception.Message }
    Assert-True ($null -ne $failure -and $failure.Contains($expectedError)) "$case did not fail at its expected gate: $failure"
    Assert-True (-not (Test-Path -LiteralPath $env:LTTH_STALE_BUILD_MARKER)) "$case reached fake build."
    Assert-True (-not (Test-Path -LiteralPath $publisherMarker)) "$case reached fake publisher."
    Assert-True (-not (Test-Path -LiteralPath $output)) "$case emitted accepted output."
  }
  Write-Output 'PASS: one stale-source/receipt regression; positive control + 4 fail-closed cases; no rejected build/publisher'
} finally {
  $env:LTTH_STALE_BUILD_MARKER = $oldMarker
  $env:LTTH_STALE_BUILD_BYTES = $oldBytes
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
