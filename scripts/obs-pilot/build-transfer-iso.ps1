[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PayloadRoot,

  [Parameter(Mandatory = $true)]
  [string]$ManifestPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,

  [string]$SevenZipPath,

  [ValidateRange(1024, 1048576)]
  [int]$ReadChunkBytes = 65536,

  [ValidateRange(1048576, 2147483648)]
  [long]$MaxIsoBytes = 2GB,

  [ValidateRange(1, 50000)]
  [int]$MaxFileCount = 10000,

  [switch]$ValidateManifestOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:AllowedRoots = @('obs', 'runtime', 'pilot', 'host-receipt', 'redist')
$script:SensitiveSegmentPattern = '(^|[._-])(private|credentials?|secrets?|tokens?|cookies?|password|passwd|stream[-_]?key|host[-_]?profiles?|profiles?|auth)([._-]|$)'
$script:TrustedPathExceptions = [System.Collections.Hashtable]::new([System.StringComparer]::Ordinal)
$script:TrustedPathExceptionPolicyPath = Join-Path $PSScriptRoot 'transfer-path-exceptions.json'
$script:TrustedPublicKeyExceptionPolicyPath = Join-Path $PSScriptRoot 'transfer-public-key-exception.obs32.1.0.json'
$script:TrustedPublicKeyExceptionPolicySha256 = '104189d06ecc8246bb774626181ba5eb7f9e9c2bbbcec6ac34c44273274fecb2'
$script:TrustedPublicKeySourceManifestSha256 = '41e4bed8eb2fe413dfafd032a2708c51c1a0a7488741bd4716511ccd2728f8fa'
$script:TrustedPublicKeySourceManifestPath = Join-Path $PSScriptRoot '..\..\docs\coordination\obs-portable-transfer-manifest.json'
$script:TrustedPublicKeySourcePath = 'data/obs-studio/OBSPublicRSAKey.pem'
$script:TrustedPublicKeyTargetPath = 'obs/data/obs-studio/OBSPublicRSAKey.pem'
$script:TrustedPublicKeyBytes = 814L
$script:TrustedPublicKeySha256 = '8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2'
$script:TrustedPublicKeyExceptions = [System.Collections.Hashtable]::new([System.StringComparer]::Ordinal)
$script:VerifiedPublicKeyTargets = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$script:TrustedCredentialRule1PolicyPath = Join-Path $PSScriptRoot 'transfer-rule1-exceptions.obs32.1.0.json'
$script:TrustedCredentialRule1PolicySha256 = '7ff07bf8eb90d6280f07c200a6fc68ce4f3a449435367c0c95101af0ea39d27e'
$script:TrustedCredentialRule1SourceManifestSha256 = '41e4bed8eb2fe413dfafd032a2708c51c1a0a7488741bd4716511ccd2728f8fa'
$script:TrustedCredentialRule1Exceptions = [System.Collections.Hashtable]::new([System.StringComparer]::Ordinal)
$script:ForbiddenExtensions = @('.env', '.key', '.pem', '.pfx', '.p12', '.kdbx', '.sqlite', '.sqlite3', '.db', '.log', '.lnk', '.url', '.reg', '.bak', '.old')
$script:TextExtensions = @('.txt', '.json', '.js', '.cjs', '.mjs', '.html', '.htm', '.css', '.md', '.xml', '.ini', '.yaml', '.yml', '.svg', '.ps1', '.cmd', '.bat', '.sh', '.conf', '.properties')
$script:CredentialContentPatterns = @(
  '(?i)\b(?:password|passwd|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|stream[_-]?key|authorization|cookie|sessionid|msToken)\b[ \t]*[:=][ \t]*["\x27][^\r\n"\x27]{6,}["\x27]',
  '(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{20,}',
  '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
  '\bAKIA[0-9A-Z]{16}\b',
  '\bAIza[0-9A-Za-z_-]{35}\b',
  '\bgh[pousr]_[A-Za-z0-9_]{20,}\b',
  '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b'
)

function Get-NormalizedFullPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw 'A path parameter is empty.'
  }

  return [System.IO.Path]::GetFullPath($Path)
}

function Test-PathWithin {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )

  $fullPath = Get-NormalizedFullPath -Path $Path
  $fullRoot = (Get-NormalizedFullPath -Path $Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $prefix = $fullRoot + [System.IO.Path]::DirectorySeparatorChar
  return $fullPath.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $fullPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparsePathChain {
  param([Parameter(Mandatory = $true)][string]$Path)

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Reparse points are not allowed in transfer paths: $($item.FullName)"
  }
  $current = if ($item.PSIsContainer) { [System.IO.DirectoryInfo]::new($item.FullName) } else { [System.IO.DirectoryInfo]::new($item.DirectoryName) }
  while ($null -ne $current) {
    if (($current.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Reparse points are not allowed in transfer paths: $($current.FullName)"
    }
    $current = $current.Parent
  }
}

function Assert-ExactJsonProperties {
  param(
    [Parameter(Mandatory = $true)][System.Text.Json.JsonElement]$Element,
    [Parameter(Mandatory = $true)][string[]]$Expected,
    [Parameter(Mandatory = $true)][string]$Context
  )

  if ($Element.ValueKind -ne [System.Text.Json.JsonValueKind]::Object) {
    throw "$Context must be a JSON object."
  }

  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($property in $Element.EnumerateObject()) {
    if (-not $seen.Add($property.Name)) {
      throw "$Context contains a duplicate property: $($property.Name)"
    }
    if ($Expected -cnotcontains $property.Name) {
      throw "$Context contains an unknown property: $($property.Name)"
    }
  }

  foreach ($name in $Expected) {
    if (-not $seen.Contains($name)) {
      throw "$Context is missing property: $name"
    }
  }
}

function Assert-SafeRelativePath {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [switch]$AllowPinnedSensitivePath,
    [switch]$DeferPinnedPublicKeyExtensionCheck,
    [switch]$AllowPinnedPublicKeyExtension
  )

  $isExactPinnedPublicKeyPath = $RelativePath -ceq $script:TrustedPublicKeyTargetPath
  if (($DeferPinnedPublicKeyExtensionCheck -or $AllowPinnedPublicKeyExtension) -and -not $isExactPinnedPublicKeyPath) {
    throw 'Public-key extension gate applies only to the exact pinned OBS public-key path.'
  }
  if ($AllowPinnedPublicKeyExtension -and -not $script:VerifiedPublicKeyTargets.Contains($RelativePath)) {
    throw 'Public-key extension exception was requested before source verification.'
  }

  if ([string]::IsNullOrWhiteSpace($RelativePath) -or
      $RelativePath.Length -gt 240 -or
      $RelativePath.Contains('\') -or
      $RelativePath.StartsWith('/') -or
      $RelativePath.Contains(':') -or
      $RelativePath.Contains([char]0) -or
      $RelativePath -ne $RelativePath.Normalize([System.Text.NormalizationForm]::FormC)) {
    throw 'Manifest paths must be NFC-normalized relative paths using forward slashes only.'
  }

  $segments = $RelativePath.Split('/')
  if ($segments.Count -lt 2 -or $script:AllowedRoots -cnotcontains $segments[0]) {
    throw "Manifest path is outside the approved payload roots: $RelativePath"
  }

  foreach ($segment in $segments) {
    if ([string]::IsNullOrWhiteSpace($segment) -or
        $segment -in @('.', '..') -or
        $segment.StartsWith('.') -or
        $segment.EndsWith('.') -or
        $segment.EndsWith(' ') -or
        $segment -match '[<>"|?*]' -or
        $segment -match '[\x00-\x1F]') {
      throw "Unsafe path segment in manifest: $RelativePath"
    }

    $stem = ($segment -split '\.', 2)[0]
    if ($stem -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$') {
      throw "Windows-reserved name in manifest: $RelativePath"
    }
    if ($segment -match $script:SensitiveSegmentPattern -and -not $AllowPinnedSensitivePath) {
      throw "Sensitive/private path name is not allowed: $RelativePath"
    }
  }

  $extension = [System.IO.Path]::GetExtension($segments[-1]).ToLowerInvariant()
  $deferExactPublicKey = $DeferPinnedPublicKeyExtensionCheck -and $isExactPinnedPublicKeyPath -and $extension -eq '.pem'
  $allowVerifiedPublicKey = $AllowPinnedPublicKeyExtension -and $isExactPinnedPublicKeyPath -and $extension -eq '.pem'
  if (($script:ForbiddenExtensions -contains $extension -and -not ($deferExactPublicKey -or $allowVerifiedPublicKey)) -or $segments[-1] -match '^\.env($|\.)') {
    throw "Sensitive or auxiliary file type is not allowed: $RelativePath"
  }

  return $RelativePath
}

function Get-TrustedPathExceptionPolicy {
  if (-not (Test-Path -LiteralPath $script:TrustedPathExceptionPolicyPath -PathType Leaf)) {
    throw 'Trusted path exception policy is missing.'
  }
  $policyText = [System.IO.File]::ReadAllText($script:TrustedPathExceptionPolicyPath, [System.Text.UTF8Encoding]::new($false, $true))
  $policyDocument = [System.Text.Json.JsonDocument]::Parse($policyText)
  try {
    Assert-ExactJsonProperties -Element $policyDocument.RootElement -Expected @('schemaVersion', 'exceptions') -Context 'Trusted path exception policy'
    $schemaVersion = $policyDocument.RootElement.GetProperty('schemaVersion')
    if ($schemaVersion.ValueKind -ne [System.Text.Json.JsonValueKind]::Number -or $schemaVersion.GetInt32() -ne 1) { throw 'Trusted path exception policy schemaVersion must be integer 1.' }
    if ($policyDocument.RootElement.GetProperty('exceptions').ValueKind -ne [System.Text.Json.JsonValueKind]::Array) { throw 'Trusted path exceptions must be an array.' }
    $policy = @{}
    foreach ($item in $policyDocument.RootElement.GetProperty('exceptions').EnumerateArray()) {
      Assert-ExactJsonProperties -Element $item -Expected @('path', 'bytes', 'sha256', 'reason') -Context 'Trusted path exception'
      $path = $item.GetProperty('path').GetString()
      $bytesElement = $item.GetProperty('bytes')
      $shaElement = $item.GetProperty('sha256')
      if ($bytesElement.ValueKind -ne [System.Text.Json.JsonValueKind]::Number -or $shaElement.ValueKind -ne [System.Text.Json.JsonValueKind]::String -or $item.GetProperty('reason').ValueKind -ne [System.Text.Json.JsonValueKind]::String) {
        throw 'Trusted path exception entry has invalid JSON types.'
      }
      $bytes = $bytesElement.GetInt64()
      $sha256 = $shaElement.GetString().ToLowerInvariant()
      if ([string]::IsNullOrWhiteSpace($path) -or $bytes -lt 0 -or $sha256 -cnotmatch '^[0-9a-f]{64}$' -or $policy.ContainsKey($path)) {
        throw 'Trusted path exception entry has invalid or duplicate metadata.'
      }
      $normalizedPolicyPath = Assert-SafeRelativePath -RelativePath $path -AllowPinnedSensitivePath
      $policy.Add($normalizedPolicyPath, [pscustomobject]@{ Bytes = $bytes; Sha256 = $sha256; Reason = $item.GetProperty('reason').GetString() })
    }
    if ($policy.Count -ne 7) { throw 'Trusted path exception policy must contain exactly seven entries.' }
    return $policy
  }
  finally {
    $policyDocument.Dispose()
  }
}

function Get-TrustedPublicKeyExceptionPolicy {
  if (-not (Test-Path -LiteralPath $script:TrustedPublicKeyExceptionPolicyPath -PathType Leaf)) {
    throw 'Trusted public-key exception policy is missing.'
  }
  Assert-NoReparsePathChain -Path $script:TrustedPublicKeyExceptionPolicyPath
  $policyItem = Get-Item -LiteralPath $script:TrustedPublicKeyExceptionPolicyPath -Force
  if (($policyItem.Attributes -band ([System.IO.FileAttributes]::Hidden -bor [System.IO.FileAttributes]::System)) -ne 0) {
    throw 'Trusted public-key exception policy may not be hidden or a system file.'
  }
  $actualPolicyHash = (Get-FileHash -LiteralPath $script:TrustedPublicKeyExceptionPolicyPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualPolicyHash -cne $script:TrustedPublicKeyExceptionPolicySha256) {
    throw 'Trusted public-key exception policy pin mismatch.'
  }
  if (-not (Test-Path -LiteralPath $script:TrustedPublicKeySourceManifestPath -PathType Leaf)) {
    throw 'Trusted public-key source manifest is missing.'
  }
  Assert-NoReparsePathChain -Path $script:TrustedPublicKeySourceManifestPath
  $sourceManifestItem = Get-Item -LiteralPath $script:TrustedPublicKeySourceManifestPath -Force
  if (($sourceManifestItem.Attributes -band ([System.IO.FileAttributes]::Hidden -bor [System.IO.FileAttributes]::System)) -ne 0 -or
      (Get-FileHash -LiteralPath $script:TrustedPublicKeySourceManifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $script:TrustedPublicKeySourceManifestSha256) {
    throw 'Trusted public-key source manifest pin mismatch.'
  }
  $sourceManifest = Get-Content -LiteralPath $script:TrustedPublicKeySourceManifestPath -Raw | ConvertFrom-Json
  $sourceEntries = @($sourceManifest.files | Where-Object { $_.path -ceq $script:TrustedPublicKeySourcePath })
  if ($sourceManifest.source.version -cne '32.1.0' -or
      $sourceManifest.source.mainExecutableSha256 -cne 'dda672742960c9e036b06675854e36ebced0f86656a6cfa5a50eea0df5c9c2e0' -or
      $sourceEntries.Count -ne 1 -or $sourceEntries[0].bytes -ne $script:TrustedPublicKeyBytes -or
      $sourceEntries[0].sha256 -cne $script:TrustedPublicKeySha256) {
    throw 'Trusted public-key OBS 32.1.0 source manifest contents do not match the pinned entry.'
  }
  $policyText = [System.IO.File]::ReadAllText($script:TrustedPublicKeyExceptionPolicyPath, [System.Text.UTF8Encoding]::new($false, $true))
  $policyDocument = [System.Text.Json.JsonDocument]::Parse($policyText)
  try {
    $root = $policyDocument.RootElement
    Assert-ExactJsonProperties -Element $root -Expected @('schemaVersion', 'policyVersion', 'sourceVersion', 'sourceManifestSha256', 'obsExecutableSha256', 'scope', 'entries') -Context 'Trusted public-key exception policy'
    if ($root.GetProperty('schemaVersion').ValueKind -ne [System.Text.Json.JsonValueKind]::Number -or $root.GetProperty('schemaVersion').GetInt32() -ne 1 -or
        $root.GetProperty('policyVersion').GetString() -cne 'obs-public-rsa-internal-test-v1' -or
        $root.GetProperty('sourceVersion').GetString() -cne '32.1.0' -or
        $root.GetProperty('sourceManifestSha256').GetString() -cne $script:TrustedPublicKeySourceManifestSha256 -or
        $root.GetProperty('obsExecutableSha256').GetString() -cne 'dda672742960c9e036b06675854e36ebced0f86656a6cfa5a50eea0df5c9c2e0' -or
        $root.GetProperty('scope').GetString() -cne 'internal-isolated-vm-test-only; no external redistribution or release' -or
        $root.GetProperty('entries').ValueKind -ne [System.Text.Json.JsonValueKind]::Array -or
        $root.GetProperty('entries').GetArrayLength() -ne 1) {
      throw 'Trusted public-key exception policy metadata is invalid.'
    }

    $entryElement = $root.GetProperty('entries')[0]
    Assert-ExactJsonProperties -Element $entryElement -Expected @('sourcePath', 'path', 'bytes', 'sha256', 'pemType', 'asymmetricKeyType', 'modulusLengthBits') -Context 'Trusted public-key exception entry'
    if ($entryElement.GetProperty('sourcePath').GetString() -cne $script:TrustedPublicKeySourcePath -or
        $entryElement.GetProperty('path').GetString() -cne $script:TrustedPublicKeyTargetPath -or
        $entryElement.GetProperty('bytes').GetInt64() -ne $script:TrustedPublicKeyBytes -or
        $entryElement.GetProperty('sha256').GetString() -cne $script:TrustedPublicKeySha256 -or
        $entryElement.GetProperty('pemType').GetString() -cne 'PUBLIC KEY' -or
        $entryElement.GetProperty('asymmetricKeyType').GetString() -cne 'rsa' -or
        $entryElement.GetProperty('modulusLengthBits').GetInt32() -ne 4096) {
      throw 'Trusted public-key exception entry pin is invalid.'
    }
    $script:TrustedPublicKeyExceptions.Add($script:TrustedPublicKeyTargetPath, [pscustomobject]@{
      SourcePath = $script:TrustedPublicKeySourcePath
      Bytes = $script:TrustedPublicKeyBytes
      Sha256 = $script:TrustedPublicKeySha256
      PemType = 'PUBLIC KEY'
      AsymmetricKeyType = 'rsa'
      ModulusLengthBits = 4096
    })
    return $script:TrustedPublicKeyExceptions
  }
  finally {
    $policyDocument.Dispose()
  }
}

function Get-TrustedCredentialRule1ExceptionPolicy {
  if (-not (Test-Path -LiteralPath $script:TrustedCredentialRule1PolicyPath -PathType Leaf)) {
    throw 'Trusted credential rule-1 exception policy is missing.'
  }
  Assert-NoReparsePathChain -Path $script:TrustedCredentialRule1PolicyPath
  $policyItem = Get-Item -LiteralPath $script:TrustedCredentialRule1PolicyPath -Force
  if (($policyItem.Attributes -band ([System.IO.FileAttributes]::Hidden -bor [System.IO.FileAttributes]::System)) -ne 0) {
    throw 'Trusted credential rule-1 exception policy may not be hidden or a system file.'
  }
  $policySha256 = (Get-FileHash -LiteralPath $script:TrustedCredentialRule1PolicyPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($policySha256 -cne $script:TrustedCredentialRule1PolicySha256) {
    throw 'Trusted credential rule-1 exception policy pin mismatch.'
  }
  $policyText = [System.IO.File]::ReadAllText($script:TrustedCredentialRule1PolicyPath, [System.Text.UTF8Encoding]::new($false, $true))
  $policyDocument = [System.Text.Json.JsonDocument]::Parse($policyText)
  try {
    Assert-ExactJsonProperties -Element $policyDocument.RootElement -Expected @('schemaVersion', 'policyVersion', 'sourceVersion', 'sourceManifestSha256', 'ruleScope', 'entries') -Context 'Trusted credential rule-1 exception policy'
    $root = $policyDocument.RootElement
    if ($root.GetProperty('schemaVersion').ValueKind -ne [System.Text.Json.JsonValueKind]::Number -or $root.GetProperty('schemaVersion').GetInt32() -ne 1 -or
        $root.GetProperty('policyVersion').GetString() -cne 'obs-locale-regex1-v1' -or
        $root.GetProperty('sourceVersion').GetString() -cne 'OBS 32.1.0 installed tree' -or
        $root.GetProperty('sourceManifestSha256').GetString() -cne $script:TrustedCredentialRule1SourceManifestSha256 -or
        $root.GetProperty('ruleScope').GetString() -cne 'credential-regex-1-only') {
      throw 'Trusted credential rule-1 exception policy metadata is invalid.'
    }
    $entriesElement = $root.GetProperty('entries')
    if ($entriesElement.ValueKind -ne [System.Text.Json.JsonValueKind]::Array -or $entriesElement.GetArrayLength() -ne 176) {
      throw 'Trusted credential rule-1 exception policy must contain exactly 176 entries.'
    }
    $policy = [System.Collections.Hashtable]::new([System.StringComparer]::Ordinal)
    foreach ($item in $entriesElement.EnumerateArray()) {
      Assert-ExactJsonProperties -Element $item -Expected @('path', 'bytes', 'sha256', 'classifiedKeys', 'category', 'hitLines') -Context 'Trusted credential rule-1 exception entry'
      $pathElement = $item.GetProperty('path')
      $bytesElement = $item.GetProperty('bytes')
      $shaElement = $item.GetProperty('sha256')
      $keysElement = $item.GetProperty('classifiedKeys')
      $categoryElement = $item.GetProperty('category')
      $linesElement = $item.GetProperty('hitLines')
      if ($pathElement.ValueKind -ne [System.Text.Json.JsonValueKind]::String -or
          $bytesElement.ValueKind -ne [System.Text.Json.JsonValueKind]::Number -or
          $shaElement.ValueKind -ne [System.Text.Json.JsonValueKind]::String -or
          $keysElement.ValueKind -ne [System.Text.Json.JsonValueKind]::String -or
          $categoryElement.ValueKind -ne [System.Text.Json.JsonValueKind]::String -or
          $linesElement.ValueKind -ne [System.Text.Json.JsonValueKind]::Array) {
        throw 'Trusted credential rule-1 exception entry has invalid JSON types.'
      }
      $path = $pathElement.GetString()
      $bytes = $bytesElement.GetInt64()
      $sha256 = $shaElement.GetString().ToLowerInvariant()
      $keys = $keysElement.GetString()
      $category = $categoryElement.GetString()
      if ($path -cnotmatch '^obs/data/(?:obs-studio|obs-plugins/[^/]+)/locale/[^/]+\.ini$' -or
          $bytes -lt 1 -or $sha256 -cnotmatch '^[0-9a-f]{64}$' -or
          [string]::IsNullOrWhiteSpace($keys) -or [string]::IsNullOrWhiteSpace($category) -or
          $policy.ContainsKey($path)) {
        throw 'Trusted credential rule-1 exception entry has invalid or duplicate pinned metadata.'
      }
      [void](Assert-SafeRelativePath -RelativePath $path)
      if ($linesElement.GetArrayLength() -lt 1) { throw 'Trusted credential rule-1 exception entry has no classified hit lines.' }
      $hitLines = [System.Collections.Generic.HashSet[int]]::new()
      foreach ($lineElement in $linesElement.EnumerateArray()) {
        if ($lineElement.ValueKind -ne [System.Text.Json.JsonValueKind]::Number -or $lineElement.GetInt32() -lt 1 -or -not $hitLines.Add($lineElement.GetInt32())) {
          throw 'Trusted credential rule-1 exception entry has invalid or duplicate hit lines.'
        }
      }
      $policy.Add($path, [pscustomobject]@{ Bytes = $bytes; Sha256 = $sha256; ClassifiedKeys = $keys; Category = $category; HitLines = $hitLines })
    }
    return $policy
  }
  finally {
    $policyDocument.Dispose()
  }
}

function Test-PinnedSensitivePathException {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][long]$Bytes,
    [Parameter(Mandatory = $true)][string]$Sha256
  )
  if (-not $script:TrustedPathExceptions.ContainsKey($RelativePath)) { return $false }
  $expected = $script:TrustedPathExceptions[$RelativePath]
  if ($Bytes -ne $expected.Bytes -or $Sha256.ToLowerInvariant() -cne $expected.Sha256) {
    throw "Trusted sensitive-path exception metadata mismatch: $RelativePath"
  }
  return $true
}

function Test-PinnedPublicKeyException {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$FullPath,
    [Parameter(Mandatory = $true)][long]$Bytes,
    [Parameter(Mandatory = $true)][string]$Sha256
  )
  if ($RelativePath -cne $script:TrustedPublicKeyTargetPath -or -not $script:TrustedPublicKeyExceptions.ContainsKey($RelativePath)) { return $false }
  $expected = $script:TrustedPublicKeyExceptions[$RelativePath]
  if ($Bytes -ne $expected.Bytes -or $Sha256.ToLowerInvariant() -cne $expected.Sha256) {
    throw "Trusted public-key exception metadata mismatch: $RelativePath"
  }

  $data = [System.IO.File]::ReadAllBytes($FullPath)
  if ($data.Length -ne $expected.Bytes) { throw "Trusted public-key file size mismatch: $RelativePath" }
  $actualHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($data)).ToLowerInvariant()
  if ($actualHash -cne $expected.Sha256) { throw "Trusted public-key file hash mismatch: $RelativePath" }

  $pemText = [System.Text.Encoding]::ASCII.GetString($data)
  if ($pemText -match '-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----') {
    throw "Private key material rejected: $RelativePath"
  }
  $fullPublicBlockPattern = '\A-----BEGIN PUBLIC KEY-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n)+-----END PUBLIC KEY-----\r?\n?\z'
  if (-not [System.Text.RegularExpressions.Regex]::IsMatch($pemText, $fullPublicBlockPattern, [System.Text.RegularExpressions.RegexOptions]::CultureInvariant)) {
    throw "Trusted public-key PEM structure or type mismatch: $RelativePath"
  }

  $rsa = [System.Security.Cryptography.RSA]::Create()
  try {
    try { [void]$rsa.ImportFromPem($pemText) }
    catch { throw "Trusted public-key PEM parser rejected file: $RelativePath" }
    if ($rsa.KeySize -ne $expected.ModulusLengthBits) { throw "Trusted public-key size mismatch: $RelativePath" }
  }
  finally {
    $rsa.Dispose()
  }
  [void]$script:VerifiedPublicKeyTargets.Add($RelativePath)
  return $true
}

function Assert-NoCredentialText {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [switch]$SkipPinnedRule1,
    [switch]$ScanPinnedPublicKey
  )

  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($script:TextExtensions -notcontains $extension -and -not ($ScanPinnedPublicKey -and $RelativePath -ceq $script:TrustedPublicKeyTargetPath)) { return }
  if ((Get-Item -LiteralPath $Path).Length -gt 33554432) {
    throw "Text file exceeds the 32 MiB credential-scan bound: $RelativePath"
  }

  $patterns = foreach ($pattern in $script:CredentialContentPatterns) {
    [System.Text.RegularExpressions.Regex]::new($pattern, [System.Text.RegularExpressions.RegexOptions]::CultureInvariant)
  }
  $encoding = [System.Text.UTF8Encoding]::new($false, $true)
  $reader = [System.IO.StreamReader]::new($Path, $encoding, $true, 65536)
  try {
    $buffer = [char[]]::new(65536)
    $tail = ''
    while (($read = $reader.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $chunk = $tail + [string]::new($buffer, 0, $read)
      for ($patternIndex = 0; $patternIndex -lt $patterns.Count; $patternIndex++) {
        if ($SkipPinnedRule1 -and $patternIndex -eq 0) { continue }
        if ($patterns[$patternIndex].IsMatch($chunk)) {
          throw "Credential-like literal detected in text payload; remove it before transfer: $RelativePath"
        }
      }
      $tailLength = [Math]::Min(4096, $chunk.Length)
      $tail = $chunk.Substring($chunk.Length - $tailLength, $tailLength)
    }
  }
  finally {
    $reader.Dispose()
  }
}

function Resolve-SevenZip {
  param([string]$RequestedPath)

  $candidates = [System.Collections.Generic.List[string]]::new()
  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    $candidates.Add($RequestedPath)
  }
  $command = Get-Command -Name '7z.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $command) {
    $candidates.Add($command.Source)
  }
  $candidates.Add('C:\Program Files\7-Zip\7z.exe')
  $candidates.Add('C:\Program Files (x86)\7-Zip\7z.exe')

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      continue
    }
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    Assert-NoReparsePathChain -Path $resolved
    return $resolved
  }

  throw '7z.exe was not found; ISO read-back verification is mandatory.'
}

function Invoke-7ZipListing {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string]$IsoPath
  )

  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $Executable
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $start.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
  foreach ($argument in @('l', '-slt', '-ba', '-sccUTF-8', $IsoPath)) {
    $start.ArgumentList.Add($argument)
  }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $start
  try {
    if (-not $process.Start()) {
      throw 'Unable to start 7-Zip listing process.'
    }
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $stdout = $process.StandardOutput.ReadToEnd()
    $process.WaitForExit()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
      throw "7-Zip could not list the generated ISO (exit $($process.ExitCode)): $($stderr.Trim())"
    }
    return $stdout
  }
  finally {
    $process.Dispose()
  }
}

$streamWriterSource = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Security.Cryptography;
using System.Threading.Tasks;

public sealed class LtthObsIsoOutputOwnership
{
    public bool Created { get; internal set; }
}

public static class LtthObsIsoSafeStream
{
    public static bool ShouldDeleteOutput(bool success, bool comReleased, bool tempCleaned, LtthObsIsoOutputOwnership ownership)
    {
        return ownership != null && ownership.Created && (!success || !comReleased || !tempCleaned);
    }

    private sealed class ShortReadStream : IStream
    {
        private readonly IStream inner;
        private readonly int maxReadBytes;
        public ShortReadStream(IStream source, int limit) { inner = source; maxReadBytes = limit; }
        public void Read(byte[] pv, int cb, IntPtr pcbRead) { inner.Read(pv, Math.Min(cb, maxReadBytes), pcbRead); }
        public void Write(byte[] pv, int cb, IntPtr pcbWritten) { inner.Write(pv, cb, pcbWritten); }
        public void Seek(long move, int origin, IntPtr newPosition) { inner.Seek(move, origin, newPosition); }
        public void SetSize(long size) { inner.SetSize(size); }
        public void CopyTo(IStream target, long count, IntPtr read, IntPtr written) { inner.CopyTo(target, count, read, written); }
        public void Commit(int flags) { inner.Commit(flags); }
        public void Revert() { inner.Revert(); }
        public void LockRegion(long offset, long count, int type) { inner.LockRegion(offset, count, type); }
        public void UnlockRegion(long offset, long count, int type) { inner.UnlockRegion(offset, count, type); }
        public void Stat(out STATSTG stat, int flags) { inner.Stat(out stat, flags); }
        public void Clone(out IStream clone) { inner.Clone(out clone); }
    }

    [DllImport("ole32.dll", PreserveSig = true)]
    private static extern int CreateStreamOnHGlobal(IntPtr global, [MarshalAs(UnmanagedType.Bool)] bool deleteOnRelease, out IStream stream);

    private static IStream AsIStream(object value)
    {
        if (value == null) throw new ArgumentNullException(nameof(value));
        if (value is IStream typed) return typed;
        IntPtr unknown = Marshal.GetIUnknownForObject(value);
        try { return (IStream)Marshal.GetTypedObjectForIUnknown(unknown, typeof(IStream)); }
        finally { Marshal.Release(unknown); }
    }

    public static IStream CreateMemoryStream(byte[] data)
    {
        if (data == null) throw new ArgumentNullException(nameof(data));
        IntPtr global = Marshal.AllocHGlobal(Math.Max(data.Length, 1));
        IStream stream = null;
        try
        {
            if (data.Length > 0) Marshal.Copy(data, 0, global, data.Length);
            int hr = CreateStreamOnHGlobal(global, true, out stream);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);
            global = IntPtr.Zero; // ownership transferred to the COM stream
            stream.Seek(0, 0, IntPtr.Zero);
            return stream;
        }
        catch
        {
            if (stream != null && Marshal.IsComObject(stream)) Marshal.FinalReleaseComObject(stream);
            if (global != IntPtr.Zero) Marshal.FreeHGlobal(global);
            throw;
        }
    }

    public static void Rewind(object rawStream)
    {
        IStream stream = AsIStream(rawStream);
        if (stream == null) throw new ArgumentNullException(nameof(stream));
        stream.Seek(0, 0, IntPtr.Zero);
    }

    public static long WriteComStreamNewFile(object rawSource, string path, long maxBytes, int readChunkBytes, LtthObsIsoOutputOwnership ownership)
    {
        if (ownership == null) throw new ArgumentNullException(nameof(ownership));
        IStream source = new ShortReadStream(AsIStream(rawSource), Math.Max(1, Math.Min(readChunkBytes - 1, 65536)));
        if (source == null) throw new ArgumentNullException(nameof(source));
        if (readChunkBytes < 1 || readChunkBytes > 1048576) throw new ArgumentOutOfRangeException(nameof(readChunkBytes));
        STATSTG stat;
        source.Stat(out stat, 1);
        if (stat.cbSize < 0 || stat.cbSize > maxBytes) throw new InvalidDataException("IMAPI image stream exceeds the configured size bound.");

        using (var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 131072, FileOptions.SequentialScan))
        {
            // FileMode.CreateNew succeeded, so cleanup may safely treat this path as ours.
            ownership.Created = true;
            byte[] buffer = new byte[readChunkBytes];
            IntPtr readCount = Marshal.AllocHGlobal(sizeof(int));
            long total = 0;
            try
            {
                while (true)
                {
                    Marshal.WriteInt32(readCount, 0);
                    source.Read(buffer, readChunkBytes, readCount);
                    int read = Marshal.ReadInt32(readCount);
                    if (read < 0 || read > readChunkBytes) throw new InvalidDataException("COM stream returned an invalid partial-read length.");
                    if (read == 0) break;
                    total = checked(total + read);
                    if (total > maxBytes) throw new InvalidDataException("IMAPI image stream exceeded the configured size bound.");
                    output.Write(buffer, 0, read);
                }
                output.Flush(true);
            }
            finally
            {
                Marshal.FreeHGlobal(readCount);
            }
            if (total != stat.cbSize) throw new InvalidDataException("IMAPI stream ended before or after its reported size.");
            return total;
        }
    }

    public static string HashProcessStdout(string executable, string[] arguments, long expectedBytes, out long byteCount)
    {
        var start = new ProcessStartInfo(executable);
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.RedirectStandardOutput = true;
        start.RedirectStandardError = true;
        foreach (var argument in arguments) start.ArgumentList.Add(argument);

        using (var process = new Process())
        {
            process.StartInfo = start;
            if (!process.Start()) throw new InvalidOperationException("Unable to start 7-Zip extraction process.");
            Task<string> errorTask = process.StandardError.ReadToEndAsync();
            using (var hash = SHA256.Create())
            {
                byte[] buffer = new byte[65536];
                long total = 0;
                int read;
                while ((read = process.StandardOutput.BaseStream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    total = checked(total + read);
                    if (total > expectedBytes)
                    {
                        process.Kill();
                        process.WaitForExit();
                        throw new InvalidDataException("7-Zip produced more bytes than the manifest entry permits.");
                    }
                    hash.TransformBlock(buffer, 0, read, buffer, 0);
                }
                hash.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
                process.WaitForExit();
                string stderr = errorTask.GetAwaiter().GetResult();
                if (process.ExitCode != 0) throw new InvalidDataException("7-Zip entry read failed: " + stderr.Trim());
                if (total != expectedBytes) throw new InvalidDataException("7-Zip entry size does not match its manifest value.");
                byteCount = total;
                return BitConverter.ToString(hash.Hash).Replace("-", "").ToLowerInvariant();
            }
        }
    }
}
'@

function Get-ArchiveFiles {
  param([Parameter(Mandatory = $true)][string]$Listing)

  $records = [System.Collections.Generic.List[object]]::new()
  $current = $null
  foreach ($line in ($Listing -split "`r?`n")) {
    if ($line -match '^Path = (.*)$') {
      if ($null -ne $current) { $records.Add($current) }
      $current = [ordered]@{ Path = $Matches[1]; Size = $null; Folder = $null }
      continue
    }
    if ($null -ne $current -and $line -match '^(Size|Folder) = (.*)$') {
      $current[$Matches[1]] = $Matches[2]
    }
  }
  if ($null -ne $current) { $records.Add($current) }

  $result = [System.Collections.Generic.List[object]]::new()
  foreach ($record in $records) {
    if ($record.Folder -eq '-') {
      if ($null -eq $record.Size -or $record.Size -notmatch '^\d+$') {
        throw "7-Zip returned a file without a valid size: $($record.Path)"
      }
      $normalizedPath = ([string]$record.Path).Replace('\', '/')
      $result.Add([pscustomobject]@{ Path = $normalizedPath; Bytes = [long]$record.Size })
    }
  }
  return $result
}

if (-not $IsWindows) {
  throw 'This helper requires Windows IMAPI2FS.'
}
if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw 'This helper requires PowerShell 7 or later.'
}

$payloadFull = Get-NormalizedFullPath -Path $PayloadRoot
$manifestFull = Get-NormalizedFullPath -Path $ManifestPath
$outputFull = Get-NormalizedFullPath -Path $OutputDirectory
if (-not (Test-Path -LiteralPath $payloadFull -PathType Container)) { throw 'PayloadRoot must be an existing directory.' }
if (-not (Test-Path -LiteralPath $manifestFull -PathType Leaf)) { throw 'ManifestPath must be an existing file.' }
if (-not (Test-Path -LiteralPath $outputFull -PathType Container)) { throw 'OutputDirectory must be an existing directory; it is never created implicitly.' }
Assert-NoReparsePathChain -Path $payloadFull
Assert-NoReparsePathChain -Path $manifestFull
Assert-NoReparsePathChain -Path $outputFull
foreach ($inputItem in @((Get-Item -LiteralPath $payloadFull -Force), (Get-Item -LiteralPath $manifestFull -Force), (Get-Item -LiteralPath $outputFull -Force))) {
  if (($inputItem.Attributes -band ([System.IO.FileAttributes]::Hidden -bor [System.IO.FileAttributes]::System)) -ne 0) {
    throw "Hidden or system input paths are not allowed: $($inputItem.FullName)"
  }
}
if (Test-PathWithin -Path $manifestFull -Root $payloadFull) { throw 'ManifestPath must be outside PayloadRoot.' }
if (Test-PathWithin -Path $outputFull -Root $payloadFull) { throw 'OutputDirectory must be outside PayloadRoot.' }
if (Test-PathWithin -Path $payloadFull -Root $manifestFull) { throw 'Invalid payload/manifest path relationship.' }

$protectedRoots = @($env:APPDATA)
if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
  foreach ($leaf in @('Desktop', 'Documents', 'Downloads')) {
    $protectedRoots += Join-Path $env:USERPROFILE $leaf
  }
}
foreach ($inputPath in @($payloadFull, $manifestFull, $outputFull)) {
  foreach ($protectedRoot in $protectedRoots) {
    if (-not [string]::IsNullOrWhiteSpace($protectedRoot) -and (Test-PathWithin -Path $inputPath -Root $protectedRoot)) {
      throw 'Payload, manifest, and output may not be inside roaming app-data, documents, desktop, or download directories.'
    }
  }
  if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA) -and
      (Test-PathWithin -Path $inputPath -Root $env:LOCALAPPDATA) -and
      -not [string]::IsNullOrWhiteSpace($env:TEMP) -and
      -not (Test-PathWithin -Path $inputPath -Root $env:TEMP)) {
    throw 'Only an isolated temp subtree is allowed under local app-data.'
  }
  if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE) -and
      (Test-PathWithin -Path $inputPath -Root $env:USERPROFILE) -and
      -not [string]::IsNullOrWhiteSpace($env:TEMP) -and
      -not (Test-PathWithin -Path $inputPath -Root $env:TEMP)) {
    throw 'Inputs and output under the user profile must use the dedicated temp subtree.'
  }
}

if ((Get-Item -LiteralPath $manifestFull -Force).Name -cne 'transfer-manifest.json') {
  throw 'ManifestPath must be named exactly transfer-manifest.json.'
}
if ([System.IO.Path]::GetExtension($manifestFull) -ine '.json') { throw 'Only a JSON transfer manifest is accepted.' }
$script:TrustedPathExceptions = Get-TrustedPathExceptionPolicy
$script:TrustedPublicKeyExceptions = Get-TrustedPublicKeyExceptionPolicy
$script:TrustedCredentialRule1Exceptions = Get-TrustedCredentialRule1ExceptionPolicy

$sevenZip = Resolve-SevenZip -RequestedPath $SevenZipPath
$manifestText = [System.IO.File]::ReadAllText($manifestFull, [System.Text.UTF8Encoding]::new($false, $true))
if ($manifestText.Length -gt 1048576) { throw 'Transfer manifest exceeds the 1 MiB size limit.' }
$jsonOptions = [System.Text.Json.JsonDocumentOptions]::new()
$jsonOptions.AllowTrailingCommas = $false
$jsonOptions.CommentHandling = [System.Text.Json.JsonCommentHandling]::Disallow
$jsonOptions.MaxDepth = 16
$document = [System.Text.Json.JsonDocument]::Parse($manifestText, $jsonOptions)

$expectedFiles = [System.Collections.Generic.List[object]]::new()
$expectedByPath = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)
$seenPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$manifestSha256 = (Get-FileHash -LiteralPath $manifestFull -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestBytes = [long](Get-Item -LiteralPath $manifestFull).Length
$totalBytes = $manifestBytes
$isoPath = $null
$workDirectory = $null
$image = $null
$rootItem = $null
$manifestComStream = $null
$manifestImageItem = $null
$resultImage = $null
$imageStream = $null
$outputOwnership = $null
$success = $false
$comReleased = $false
$tempCleaned = $false

try {
  $rootElement = $document.RootElement
  Assert-ExactJsonProperties -Element $rootElement -Expected @('schemaVersion', 'files') -Context 'Manifest'
  $schemaVersion = $rootElement.GetProperty('schemaVersion')
  if ($schemaVersion.ValueKind -ne [System.Text.Json.JsonValueKind]::Number -or $schemaVersion.GetInt32() -ne 1) {
    throw 'Manifest schemaVersion must be integer 1.'
  }
  $entries = $rootElement.GetProperty('files')
  if ($entries.ValueKind -ne [System.Text.Json.JsonValueKind]::Array) { throw 'Manifest files must be an array.' }
  if ($entries.GetArrayLength() -lt 1 -or $entries.GetArrayLength() -gt $MaxFileCount) {
    throw "Manifest file count must be between 1 and $MaxFileCount."
  }

  foreach ($entry in $entries.EnumerateArray()) {
    Assert-ExactJsonProperties -Element $entry -Expected @('path', 'bytes', 'sha256') -Context 'Manifest file entry'
    $pathElement = $entry.GetProperty('path')
    $bytesElement = $entry.GetProperty('bytes')
    $shaElement = $entry.GetProperty('sha256')
    if ($pathElement.ValueKind -ne [System.Text.Json.JsonValueKind]::String -or
        $bytesElement.ValueKind -ne [System.Text.Json.JsonValueKind]::Number -or
        $shaElement.ValueKind -ne [System.Text.Json.JsonValueKind]::String) {
      throw 'Manifest file path, bytes, and sha256 have invalid JSON types.'
    }

    $relative = $pathElement.GetString()
    $isPinnedPublicKeyCandidate = $script:TrustedPublicKeyExceptions.ContainsKey($relative)
    $isPinnedSensitivePath = Test-PinnedSensitivePathException -RelativePath $relative -Bytes $bytesElement.GetInt64() -Sha256 $shaElement.GetString()
    $relative = Assert-SafeRelativePath -RelativePath $relative -AllowPinnedSensitivePath:$isPinnedSensitivePath -DeferPinnedPublicKeyExtensionCheck:$isPinnedPublicKeyCandidate
    if ($relative -ieq 'transfer-manifest.json') { throw 'Payload may not replace the reserved transfer-manifest.json entry.' }
    if (-not $seenPaths.Add($relative)) { throw "Duplicate or case-colliding manifest path: $relative" }
    $expectedBytes = $bytesElement.GetInt64()
    if ($expectedBytes -lt 0 -or $expectedBytes -gt $MaxIsoBytes) { throw "Invalid file size in manifest: $relative" }
    $sha256 = $shaElement.GetString()
    if ($sha256 -cnotmatch '^[0-9a-fA-F]{64}$') { throw "Invalid SHA-256 in manifest: $relative" }

    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $payloadFull ($relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar))))
    if (-not (Test-PathWithin -Path $fullPath -Root $payloadFull) -or -not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      throw "Manifest file is missing or resolves outside PayloadRoot: $relative"
    }
    Assert-NoReparsePathChain -Path $fullPath
    $fileInfo = Get-Item -LiteralPath $fullPath -Force
    if (($fileInfo.Attributes -band ([System.IO.FileAttributes]::Hidden -bor [System.IO.FileAttributes]::System)) -ne 0) {
      throw "Hidden or system files are not allowed: $relative"
    }
    if ($fileInfo.Length -ne $expectedBytes) { throw "File size does not match manifest: $relative" }
    $actualHash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -cne $sha256.ToLowerInvariant()) { throw "File hash does not match manifest: $relative" }
    if ($isPinnedSensitivePath -and -not (Test-PinnedSensitivePathException -RelativePath $relative -Bytes $fileInfo.Length -Sha256 $actualHash)) {
      throw "Pinned sensitive-path exception was not retained after source verification: $relative"
    }
    $isVerifiedPublicKey = $false
    if ($isPinnedPublicKeyCandidate) {
      $isVerifiedPublicKey = Test-PinnedPublicKeyException -RelativePath $relative -FullPath $fullPath -Bytes $fileInfo.Length -Sha256 $actualHash
      if (-not $isVerifiedPublicKey) { throw "Pinned public-key exception was not retained after source verification: $relative" }
      $relative = Assert-SafeRelativePath -RelativePath $relative -AllowPinnedPublicKeyExtension
    }
    $skipPinnedRule1 = $false
    if ($script:TrustedCredentialRule1Exceptions.ContainsKey($relative)) {
      $trustedCredentialEntry = $script:TrustedCredentialRule1Exceptions[$relative]
      if ($fileInfo.Length -ne $trustedCredentialEntry.Bytes -or $actualHash -cne $trustedCredentialEntry.Sha256) {
        throw "Trusted credential rule-1 exception metadata mismatch: $relative"
      }
      $skipPinnedRule1 = $true
    }
    Assert-NoCredentialText -Path $fullPath -RelativePath $relative -SkipPinnedRule1:$skipPinnedRule1 -ScanPinnedPublicKey:$isVerifiedPublicKey

    if ($expectedBytes -gt ($MaxIsoBytes - $totalBytes)) { throw 'Total payload plus manifest exceeds MaxIsoBytes.' }
    $totalBytes += $expectedBytes
    $record = [pscustomobject]@{ Path = $relative; FullPath = $fullPath; Bytes = $expectedBytes; Sha256 = $actualHash }
    $expectedFiles.Add($record)
    $expectedByPath.Add($relative, $record)
  }

  if ($ValidateManifestOnly) {
    [pscustomobject]@{
      status = 'manifest-validation-only-passed'
      manifestSha256 = $manifestSha256
      manifestBytes = $manifestBytes
      payloadFileCount = $expectedFiles.Count
      payloadBytes = ($expectedFiles | Measure-Object -Property Bytes -Sum).Sum
      isoCreated = $false
    } | ConvertTo-Json -Depth 4
    $success = $true
    return
  }

  $payloadItems = @(Get-ChildItem -LiteralPath $payloadFull -Recurse -Force -ErrorAction Stop)
  $actualFiles = [System.Collections.Generic.List[object]]::new()
  $actualPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($actual in $payloadItems) {
    if (($actual.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point is not allowed in payload tree: $($actual.FullName)" }
    if (($actual.Attributes -band ([System.IO.FileAttributes]::Hidden -bor [System.IO.FileAttributes]::System)) -ne 0) { throw "Hidden or system files are not allowed: $($actual.FullName)" }
    if ($actual.PSIsContainer) { continue }
    $relative = $actual.FullName.Substring($payloadFull.TrimEnd('\').Length + 1).Replace('\', '/')
    [void](Assert-SafeRelativePath -RelativePath $relative)
    if (-not $actualPaths.Add($relative)) { throw "Payload contains case-colliding paths: $relative" }
    if (-not $expectedByPath.ContainsKey($relative)) { throw "Payload contains an unknown, unmanifested file: $relative" }
    $actualFiles.Add($actual)
  }
  if ($actualPaths.Count -ne $expectedFiles.Count) { throw 'Payload file set does not exactly match the manifest.' }
  if (($actualFiles.Count + 1) -gt $MaxFileCount) { throw "Payload plus manifest exceeds MaxFileCount ($MaxFileCount)." }

  $workParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $workLeaf = 'ltth-imapi-transfer-' + [guid]::NewGuid().ToString('N')
  $workDirectory = [System.IO.Path]::GetFullPath((Join-Path $workParent $workLeaf))
  if (-not (Test-PathWithin -Path $workDirectory -Root $workParent) -or
      (Split-Path -Leaf $workDirectory) -cnotmatch '^ltth-imapi-transfer-[0-9a-f]{32}$' -or
      (Test-Path -LiteralPath $workDirectory)) {
    throw 'Could not reserve a unique private IMAPI working directory.'
  }
  New-Item -ItemType Directory -Path $workDirectory | Out-Null
  Assert-NoReparsePathChain -Path $workDirectory

  $outputLeaf = $null
  for ($attempt = 0; $attempt -lt 5; $attempt++) {
    $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ', [Globalization.CultureInfo]::InvariantCulture)
    $suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $outputLeaf = "ltth-transfer-$stamp-$suffix.iso"
    $candidateOutput = Join-Path $outputFull $outputLeaf
    if (-not (Test-Path -LiteralPath $candidateOutput)) { break }
    $outputLeaf = $null
  }
  if ([string]::IsNullOrWhiteSpace($outputLeaf)) { throw 'Could not reserve a unique ISO output name.' }
  $isoPath = [System.IO.Path]::GetFullPath((Join-Path $outputFull $outputLeaf))
  if ((Test-PathWithin -Path $isoPath -Root $payloadFull) -or (Test-Path -LiteralPath $isoPath)) {
    throw 'ISO output path collides with input or existing media.'
  }

  Add-Type -TypeDefinition $streamWriterSource -Language CSharp -ErrorAction Stop
  $image = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
  $image.ChooseImageDefaultsForMediaType(6) # IMAPI_MEDIA_TYPE_DVDPLUSR, image only; no recorder is opened.
  $image.FileSystemsToCreate = 7 # ISO9660, Joliet, and UDF; readers can select Unicode Joliet/UDF names.
  $image.UDFRevision = 258 # UDF 1.02.
  $image.SessionStartBlock = 0
  $image.FreeMediaBlocks = [int][Math]::Ceiling($MaxIsoBytes / 2048.0)
  $image.VolumeName = 'LTTHTRANSFER'
  $image.UseRestrictedCharacterSet = $false
  $image.WorkingDirectory = $workDirectory
  $rootItem = $image.Root
  $rootItem.AddTree($payloadFull, $false)
  $manifestComStream = [LtthObsIsoSafeStream]::CreateMemoryStream([System.IO.File]::ReadAllBytes($manifestFull))
  $manifestImageItem = $image.CreateFileItem('transfer-manifest.json')
  [LtthObsIsoSafeStream]::Rewind($manifestComStream)
  $manifestImageItem.Data = $manifestComStream
  $rootItem.Add($manifestImageItem)
  $resultImage = $image.CreateResultImage()
  $imageStream = $resultImage.ImageStream
  [LtthObsIsoSafeStream]::Rewind($imageStream)
  $outputOwnership = [LtthObsIsoOutputOwnership]::new()
  $writtenBytes = [LtthObsIsoSafeStream]::WriteComStreamNewFile($imageStream, $isoPath, $MaxIsoBytes, $ReadChunkBytes, $outputOwnership)

  foreach ($record in $expectedFiles) {
    $afterHash = (Get-FileHash -LiteralPath $record.FullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($afterHash -cne $record.Sha256) { throw "Source file changed while ISO was being built: $($record.Path)" }
  }
  if ((Get-FileHash -LiteralPath $manifestFull -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifestSha256) {
    throw 'Transfer manifest changed while ISO was being built.'
  }
  if ((Get-Item -LiteralPath $isoPath).Length -ne $writtenBytes) { throw 'ISO file length differs from the IMAPI stream length.' }

  $listing = Invoke-7ZipListing -Executable $sevenZip -IsoPath $isoPath
  $archiveFiles = @(Get-ArchiveFiles -Listing $listing)
  $expectedArchive = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($record in $expectedFiles) { $expectedArchive.Add($record.Path, $record) }
  $expectedArchive.Add('transfer-manifest.json', [pscustomobject]@{ Path = 'transfer-manifest.json'; FullPath = $manifestFull; Bytes = $manifestBytes; Sha256 = $manifestSha256 })
  if ($archiveFiles.Count -ne $expectedArchive.Count) { throw '7-Zip ISO listing has a different number of files than the manifest expects.' }

  $verifiedFiles = [System.Collections.Generic.List[object]]::new()
  foreach ($archiveFile in $archiveFiles) {
    if (-not $expectedArchive.ContainsKey($archiveFile.Path)) { throw "ISO contains an unknown file: $($archiveFile.Path)" }
    $expected = $expectedArchive[$archiveFile.Path]
    if ($archiveFile.Bytes -ne $expected.Bytes) { throw "ISO file size mismatch: $($archiveFile.Path)" }
    $readBytes = 0L
    $entryHash = [LtthObsIsoSafeStream]::HashProcessStdout(
      $sevenZip,
      [string[]]@('e', '-so', '-sccUTF-8', $isoPath, $archiveFile.Path),
      $expected.Bytes,
      [ref]$readBytes
    )
    if ($entryHash -cne $expected.Sha256) { throw "ISO file content hash mismatch: $($archiveFile.Path)" }
    $verifiedFiles.Add([pscustomobject]@{ path = $archiveFile.Path; bytes = $readBytes; sha256 = $entryHash })
  }

  $isoHash = (Get-FileHash -LiteralPath $isoPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $success = $true
}
finally {
  $comReleased = $true
  foreach ($comObject in @($imageStream, $resultImage, $manifestImageItem, $manifestComStream, $rootItem, $image)) {
    if ($null -ne $comObject -and [System.Runtime.InteropServices.Marshal]::IsComObject($comObject)) {
      try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($comObject) } catch { $comReleased = $false }
    }
  }
  $document.Dispose()

  $tempCleanupError = $null
  if ($null -ne $workDirectory -and (Test-Path -LiteralPath $workDirectory)) {
    $workParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    $safeWorkTarget = [System.IO.Path]::GetFullPath($workDirectory)
    if (-not (Test-PathWithin -Path $safeWorkTarget -Root $workParent) -or
        (Split-Path -Leaf $safeWorkTarget) -cnotmatch '^ltth-imapi-transfer-[0-9a-f]{32}$') {
      $tempCleanupError = 'Refusing to remove an IMAPI temp directory outside the helper-owned temp namespace.'
    }
    else {
      try { Remove-Item -LiteralPath $safeWorkTarget -Recurse -Force }
      catch { $tempCleanupError = $_.Exception.Message }
    }
  }
  $tempCleaned = $null -eq $workDirectory -or -not (Test-Path -LiteralPath $workDirectory)
  if (-not [string]::IsNullOrWhiteSpace($tempCleanupError)) { $tempCleaned = $false }
  $shouldDeleteOutput = $null -ne $outputOwnership -and
    [LtthObsIsoSafeStream]::ShouldDeleteOutput($success, $comReleased, $tempCleaned, $outputOwnership)
  if ($shouldDeleteOutput -and $null -ne $isoPath -and (Test-Path -LiteralPath $isoPath)) {
    try { Remove-Item -LiteralPath $isoPath -Force } catch { $success = $false }
  }
}

if (-not $success -or -not $comReleased -or -not $tempCleaned) {
  throw 'ISO creation did not complete with COM cleanup and private temp cleanup verified.'
}

[pscustomobject]@{
  status = 'synthetic-or-approved-transfer-iso-created-and-readback-verified'
  isoName = [System.IO.Path]::GetFileName($isoPath)
  isoBytes = [long](Get-Item -LiteralPath $isoPath).Length
  isoSha256 = $isoHash
  manifestName = 'transfer-manifest.json'
  manifestBytes = $manifestBytes
  manifestSha256 = $manifestSha256
  payloadFileCount = $expectedFiles.Count
  isoFileCount = $verifiedFiles.Count
  filesVerifiedFrom7ZipStdout = @($verifiedFiles)
  comReleased = $comReleased
  privateTempCleaned = $tempCleaned
  readChunkBytes = $ReadChunkBytes
  vmAttached = $false
} | ConvertTo-Json -Depth 6
