Set-StrictMode -Version Latest
function Assert-NsisReleaseMode {
  param([string]$Mode, [string]$SignEnabled, [string]$ExpectedSigner, [string]$SigningSigner)
  if ($Mode -ceq 'developer') {
    if ($SignEnabled -cne '0') { throw 'Developer mode requires SIGN_ENABLED=0.' }
    return
  }
  if ($Mode -cne 'release' -or $SignEnabled -cne '1' -or
      $ExpectedSigner -cnotmatch '^[0-9a-fA-F]{40}$' -or
      $SigningSigner -cnotmatch '^[0-9a-fA-F]{40}$' -or
      $ExpectedSigner.ToUpperInvariant() -cne $SigningSigner.ToUpperInvariant()) {
    throw 'Release requires explicit mode, SIGN_ENABLED=1 and matching trusted LAUNCHER_SIGNER_THUMBPRINT / SIGN_CERT_SHA1.'
  }
}
function Assert-NsisFinalSignature {
  param([string]$Path, [string]$ExpectedSigner, [string]$SignTool,
        [scriptblock]$SignatureProvider, [scriptblock]$ToolRunner)
  if ($ExpectedSigner -cnotmatch '^[0-9a-fA-F]{40}$' -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Invalid final Setup or expected signer.' }
  $before = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  $signature = if ($SignatureProvider) { & $SignatureProvider $Path } else { Get-AuthenticodeSignature -LiteralPath $Path }
  $timestamp = $signature.PSObject.Properties['TimeStamperCertificate']
  if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or
      ([string]$signature.SignerCertificate.Thumbprint).ToUpperInvariant() -cne $ExpectedSigner.ToUpperInvariant() -or
      $null -eq $timestamp -or $null -eq $timestamp.Value) { throw 'Final Setup requires valid Authenticode, exact trusted signer and timestamp certificate.' }
  if ($ToolRunner) { $code = & $ToolRunner $SignTool @('verify', '/pa', '/all', '/tw', $Path) }
  else {
    if (-not (Test-Path -LiteralPath $SignTool -PathType Leaf)) { throw 'SignTool path must be explicit.' }
    & $SignTool verify /pa /all /tw $Path | Out-Host
    $code = $LASTEXITCODE
  }
  if ($code -ne 0) { throw 'SignTool final verification failed or warned.' }
  if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -cne $before) { throw 'Setup bytes changed during verification.' }
}
Export-ModuleMember -Function Assert-NsisReleaseMode, Assert-NsisFinalSignature
