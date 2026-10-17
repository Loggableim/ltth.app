param([ValidateSet('preflight','verify')][string]$Action, [string]$Path, [string]$SignTool)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib/nsis-release-signature.psm1') -Force
try {
  Assert-NsisReleaseMode -Mode $env:LTTH_INSTALLER_MODE -SignEnabled $env:SIGN_ENABLED -ExpectedSigner $env:LAUNCHER_SIGNER_THUMBPRINT -SigningSigner $env:SIGN_CERT_SHA1
  if ($Action -eq 'verify') {
    if ($env:LTTH_INSTALLER_MODE -cne 'release') { throw 'Final release verifier requires release mode.' }
    Assert-NsisFinalSignature -Path $Path -ExpectedSigner $env:LAUNCHER_SIGNER_THUMBPRINT -SignTool $SignTool
  }
  exit 0
} catch { Write-Error $_; exit 1 }
