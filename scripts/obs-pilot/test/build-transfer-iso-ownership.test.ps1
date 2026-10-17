$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$helperPath = Join-Path $repoRoot 'scripts\obs-pilot\build-transfer-iso.ps1'
$tokens = $null
$parseErrors = $null
$helperAst = [System.Management.Automation.Language.Parser]::ParseFile($helperPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Helper parse failed: $($parseErrors[0])" }

$assignment = $helperAst.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and
    $node.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and
    $node.Left.VariablePath.UserPath -eq 'streamWriterSource'
}, $true) | Select-Object -First 1
if ($null -eq $assignment) { throw 'Could not locate the helper-owned COM stream writer source.' }
$writerLiteral = $assignment.Right.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.StringConstantExpressionAst] -and
    $node.StringConstantType -eq [System.Management.Automation.Language.StringConstantType]::SingleQuotedHereString
}, $true) | Select-Object -First 1
if ($null -eq $writerLiteral) { throw 'Could not extract the helper-owned COM stream writer source.' }
Add-Type -TypeDefinition $writerLiteral.Value -Language CSharp -ErrorAction Stop

$failingStreamSource = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public sealed class LtthObsFailingReadStream : IStream
{
    public void Read(byte[] buffer, int count, IntPtr read) { Marshal.WriteInt32(read, 0); throw new IOException("Synthetic read failure after output creation."); }
    public void Write(byte[] buffer, int count, IntPtr written) { throw new NotSupportedException(); }
    public void Seek(long move, int origin, IntPtr position) { throw new NotSupportedException(); }
    public void SetSize(long size) { throw new NotSupportedException(); }
    public void CopyTo(IStream target, long count, IntPtr read, IntPtr written) { throw new NotSupportedException(); }
    public void Commit(int flags) { throw new NotSupportedException(); }
    public void Revert() { throw new NotSupportedException(); }
    public void LockRegion(long offset, long count, int type) { throw new NotSupportedException(); }
    public void UnlockRegion(long offset, long count, int type) { throw new NotSupportedException(); }
    public void Stat(out STATSTG stat, int flags) { stat = new STATSTG(); stat.cbSize = 8; }
    public void Clone(out IStream clone) { clone = null; throw new NotSupportedException(); }
}
'@
Add-Type -TypeDefinition $failingStreamSource -Language CSharp -ErrorAction Stop

$tempRoot = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) ('ltth-iso-ownership-test-' + [guid]::NewGuid().ToString('N'))))
$canonicalTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (-not $tempRoot.StartsWith($canonicalTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to create test data outside the operating-system temp directory.'
}
New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
  $collisionPath = Join-Path $tempRoot 'collision.iso'
  $sentinelBytes = [System.Text.Encoding]::UTF8.GetBytes('SyntheticCollisionSentinelOnly')
  [System.IO.File]::WriteAllBytes($collisionPath, $sentinelBytes)
  $sentinelHash = (Get-FileHash -LiteralPath $collisionPath -Algorithm SHA256).Hash
  $collisionOwnership = [LtthObsIsoOutputOwnership]::new()
  $memoryStream = [LtthObsIsoSafeStream]::CreateMemoryStream([byte[]](1, 2, 3))
  try {
    $collisionThrown = $false
    try {
      [void][LtthObsIsoSafeStream]::WriteComStreamNewFile($memoryStream, $collisionPath, 1048576, 1024, $collisionOwnership)
    }
    catch [System.IO.IOException] { $collisionThrown = $true }
    if (-not $collisionThrown) { throw 'CreateNew unexpectedly accepted a synthetic pre-existing destination.' }
    $shouldDeleteCollision = [LtthObsIsoSafeStream]::ShouldDeleteOutput($false, $true, $true, $collisionOwnership)
    if ($collisionOwnership.Created -or $shouldDeleteCollision) { throw 'Collision was incorrectly recorded as an owned output.' }
    if ((Get-FileHash -LiteralPath $collisionPath -Algorithm SHA256).Hash -cne $sentinelHash) {
      throw 'CreateNew collision changed the synthetic sentinel bytes.'
    }
    'PASS collision: CreateNew failed; sentinel SHA-256 unchanged; cleanup denied for unowned path'
  }
  finally {
    if ([System.Runtime.InteropServices.Marshal]::IsComObject($memoryStream)) {
      [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($memoryStream)
    }
  }

  $partialPath = Join-Path $tempRoot 'owned-partial.iso'
  $partialOwnership = [LtthObsIsoOutputOwnership]::new()
  $partialThrown = $false
  try {
    [void][LtthObsIsoSafeStream]::WriteComStreamNewFile([LtthObsFailingReadStream]::new(), $partialPath, 1048576, 1024, $partialOwnership)
  }
  catch [System.IO.IOException] { $partialThrown = $true }
  if (-not $partialThrown -or -not $partialOwnership.Created) {
    throw 'Synthetic writer failure did not occur after exclusive file creation.'
  }
  $shouldDeletePartial = [LtthObsIsoSafeStream]::ShouldDeleteOutput($false, $true, $true, $partialOwnership)
  if (-not $shouldDeletePartial -or -not (Test-Path -LiteralPath $partialPath)) {
    throw 'Owned partial output was not marked for cleanup.'
  }
  if ($shouldDeletePartial) { Remove-Item -LiteralPath $partialPath -Force }
  if (Test-Path -LiteralPath $partialPath) { throw 'Owned partial output remained after cleanup.' }
  'PASS write failure: owned partial file was removed by the failure cleanup condition'
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedRoot = [System.IO.Path]::GetFullPath($tempRoot)
    if (-not $resolvedRoot.StartsWith($canonicalTemp, [System.StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $resolvedRoot) -cnotmatch '^ltth-iso-ownership-test-[0-9a-f]{32}$') {
      throw 'Refusing to remove a path outside this test-owned temp directory.'
    }
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
  }
}
if (Test-Path -LiteralPath $tempRoot) { throw 'Test-owned temp directory remains after cleanup.' }
'PASS temp cleanup: unique test root removed'
