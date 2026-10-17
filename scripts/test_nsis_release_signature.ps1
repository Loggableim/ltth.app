$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib/nsis-release-signature.psm1') -Force
function Reject([scriptblock]$Run) { $denied = $false; try { & $Run } catch { $denied = $true }; if (-not $denied) { throw 'Expected denial' } }
$signer = 'a' * 40
Assert-NsisReleaseMode release 1 $signer $signer
Assert-NsisReleaseMode developer 0 '' ''
Reject { Assert-NsisReleaseMode '' 0 '' '' }
Reject { Assert-NsisReleaseMode release 0 $signer $signer }
Reject { Assert-NsisReleaseMode release 1 ('a' * 39) $signer }
Reject { Assert-NsisReleaseMode release 1 $signer ('b' * 40) }
Reject { Assert-NsisReleaseMode developer 1 $signer $signer }
$temp = Join-Path ([IO.Path]::GetTempPath()) ('nsis-signature-' + [guid]::NewGuid() + '.fixture')
[IO.File]::WriteAllText($temp, 'synthetic-not-an-exe')
try {
  $global:NsisFixtureSignature = [pscustomobject]@{ Status='Valid'; SignerCertificate=[pscustomobject]@{Thumbprint=$signer}; TimeStamperCertificate=[pscustomobject]@{Thumbprint='fake-ts'} }
  $global:NsisToolCalls = 0
  $provider = { param($path) $global:NsisFixtureSignature }
  $runner = { param($tool, $arguments) $global:NsisToolCalls++; if ($tool -cne 'fake-tool' -or ($arguments -join '|') -cne ('verify|/pa|/all|/tw|' + $temp)) { throw 'Wrong tool contract' }; return 0 }
  Assert-NsisFinalSignature $temp $signer 'fake-tool' $provider $runner
  if ($global:NsisToolCalls -ne 1) { throw 'Missing verifier call' }
  foreach ($case in @('timestamp','signer','status')) {
    $global:NsisFixtureSignature = [pscustomobject]@{ Status='Valid'; SignerCertificate=[pscustomobject]@{Thumbprint=$signer}; TimeStamperCertificate=[pscustomobject]@{Thumbprint='fake-ts'} }
    if ($case -eq 'timestamp') { $global:NsisFixtureSignature.TimeStamperCertificate = $null }
    if ($case -eq 'signer') { $global:NsisFixtureSignature.SignerCertificate.Thumbprint = 'b' * 40 }
    if ($case -eq 'status') { $global:NsisFixtureSignature.Status = 'NotTrusted' }
    Reject { Assert-NsisFinalSignature $temp $signer 'fake-tool' $provider $runner }
  }
  $global:NsisFixtureSignature = [pscustomobject]@{ Status='Valid'; SignerCertificate=[pscustomobject]@{Thumbprint=$signer}; TimeStamperCertificate=[pscustomobject]@{} }
  Reject { Assert-NsisFinalSignature $temp $signer 'fake-tool' $provider { return 1 } }
  Reject { Assert-NsisFinalSignature $temp $signer 'fake-tool' $provider { return 2 } }
  $repo = Split-Path $PSScriptRoot -Parent
  $batch = Get-Content (Join-Path $repo 'build-src/installer/build-installer.bat') -Raw
  if ($batch.IndexOf('-Action preflight') -ge $batch.IndexOf('python -B')) { throw 'Preflight must precede Stage' }
  if (-not $batch.Contains('NOT FOR DISTRIBUTION') -or -not $batch.Contains('if errorlevel 1 exit /b 1')) { throw 'Missing failure/dev binding' }
  Write-Host 'PASS synthetic NSIS mode/signature contracts (no signing/NSIS)'
} finally { Remove-Item -LiteralPath $temp -Force; Remove-Variable NsisFixtureSignature,NsisToolCalls -Scope Global }
