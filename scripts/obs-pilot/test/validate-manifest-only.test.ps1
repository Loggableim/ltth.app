$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$helperPath = Join-Path $repoRoot 'scripts\obs-pilot\build-transfer-iso.ps1'
$policyPath = Join-Path $repoRoot 'scripts\obs-pilot\transfer-path-exceptions.json'
$policy = Get-Content -LiteralPath $policyPath -Raw | ConvertFrom-Json
$testRoot = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) ('ltth-manifest-validator-test-' + [guid]::NewGuid().ToString('N'))))
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (-not $testRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to create manifest validator fixtures outside the OS temp directory.'
}

function Write-TestManifest {
  param(
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][object[]]$Entries
  )
  $json = [ordered]@{ schemaVersion = 1; files = @($Entries) } | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText($ManifestPath, $json, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-ValidatorCase {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$PayloadRoot,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [Parameter(Mandatory = $true)][bool]$ExpectSuccess,
    [string]$ExpectedDiagnostic,
    [int]$ExpectedFileCount = 7,
    [long]$ExpectedPayloadBytes = 29721
  )

  $outputText = @(& pwsh -NoLogo -NoProfile -File $helperPath `
    -PayloadRoot $PayloadRoot `
    -ManifestPath $ManifestPath `
    -OutputDirectory $OutputDirectory `
    -ValidateManifestOnly 2>&1 | ForEach-Object { $_.ToString() }) -join "`n"
  $exitCode = $LASTEXITCODE
  if ($ExpectSuccess) {
    if ($exitCode -ne 0) { throw "$Name expected exit 0, got $exitCode. Output: $outputText" }
    $resultLine = ($outputText -split "`n" | Where-Object { $_ -match '^\s*\{' } | Select-Object -First 1)
    if (-not $resultLine) { throw "$Name produced no JSON result. Output: $outputText" }
    $result = $outputText | ConvertFrom-Json
    if ($result.status -ne 'manifest-validation-only-passed' -or $result.isoCreated -ne $false -or $result.payloadFileCount -ne $ExpectedFileCount -or $result.payloadBytes -ne $ExpectedPayloadBytes) {
      throw "$Name returned unexpected validation result: $outputText"
    }
    if (@(Get-ChildItem -LiteralPath $OutputDirectory -Force).Count -ne 0) { throw "$Name unexpectedly wrote output files." }
  } else {
    if ($exitCode -eq 0) { throw "$Name unexpectedly passed. Output: $outputText" }
    if ($ExpectedDiagnostic -and $outputText -notmatch [regex]::Escape($ExpectedDiagnostic)) {
      throw "$Name failed for an unexpected reason; expected '$ExpectedDiagnostic'. Output: $outputText"
    }
    if (@(Get-ChildItem -LiteralPath $OutputDirectory -Force).Count -ne 0) { throw "$Name unexpectedly wrote output files." }
  }
  Write-Output "PASS $Name (exit $exitCode)"
}

New-Item -ItemType Directory -Path $testRoot | Out-Null
$caseRoots = @()
try {
  $positiveRoot = Join-Path $testRoot 'positive'
  $positivePayload = Join-Path $positiveRoot 'payload'
  $positiveOut = Join-Path $positiveRoot 'out'
  New-Item -ItemType Directory -Path $positivePayload, $positiveOut -Force | Out-Null
  $entries = @()
  foreach ($exception in $policy.exceptions) {
    $relative = $exception.path -replace '^pilot/', ''
    $source = Join-Path $repoRoot ($relative.Replace('/', '\'))
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Approved fixture source is missing: $relative" }
    $actualHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    $actualBytes = (Get-Item -LiteralPath $source).Length
    if ($actualBytes -ne $exception.bytes -or $actualHash -cne $exception.sha256) { throw "Approved fixture source drift: $relative" }
    $target = Join-Path $positivePayload ($exception.path.Replace('/', '\'))
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target
    $entries += [pscustomobject]@{ path = $exception.path; bytes = $exception.bytes; sha256 = $exception.sha256 }
  }
  $positiveManifest = Join-Path $positiveRoot 'transfer-manifest.json'
  Write-TestManifest -ManifestPath $positiveManifest -Entries $entries
  Invoke-ValidatorCase -Name 'positive-seven-pinned-library-files' -PayloadRoot $positivePayload -ManifestPath $positiveManifest -OutputDirectory $positiveOut -ExpectSuccess $true
  $caseRoots += $positiveRoot

  foreach ($case in @(
    @{ Name = 'reject-tampered-sha256'; Mutation = 'hash'; Expected = 'Trusted sensitive-path exception metadata mismatch' },
    @{ Name = 'reject-tampered-byte-count'; Mutation = 'bytes'; Expected = 'Trusted sensitive-path exception metadata mismatch' },
    @{ Name = 'reject-similar-cookie-session-path'; Mutation = 'lookalike'; Expected = 'Sensitive/private path name is not allowed' }
  )) {
    $caseRoot = Join-Path $testRoot $case.Name
    $payload = Join-Path $caseRoot 'payload'
    $out = Join-Path $caseRoot 'out'
    New-Item -ItemType Directory -Path $payload, $out -Force | Out-Null
    $caseEntries = @($entries | ForEach-Object { [pscustomobject]@{ path = $_.path; bytes = $_.bytes; sha256 = $_.sha256 } })
    if ($case.Mutation -eq 'hash') { $caseEntries[0].sha256 = '0' * 64 }
    if ($case.Mutation -eq 'bytes') { $caseEntries[0].bytes++ }
    if ($case.Mutation -eq 'lookalike') {
      $caseEntries = @([pscustomobject]@{ path = 'pilot/app/node_modules/my-cookie/session.json'; bytes = 10; sha256 = ('0' * 64) })
    }
    $manifest = Join-Path $caseRoot 'transfer-manifest.json'
    Write-TestManifest -ManifestPath $manifest -Entries $caseEntries
    Invoke-ValidatorCase -Name $case.Name -PayloadRoot $payload -ManifestPath $manifest -OutputDirectory $out -ExpectSuccess $false -ExpectedDiagnostic $case.Expected
    $caseRoots += $caseRoot
  }

  $crossLineRoot = Join-Path $testRoot 'credential-rule1-cross-line-benign-code'
  $crossLinePayload = Join-Path $crossLineRoot 'payload'
  $crossLineOut = Join-Path $crossLineRoot 'out'
  $crossLineTarget = Join-Path $crossLinePayload 'pilot\app\node_modules\ws\lib\websocket.js'
  New-Item -ItemType Directory -Path (Split-Path -Parent $crossLineTarget), $crossLineOut -Force | Out-Null
  $crossLineContent = "if (opts.auth && !options.headers.authorization) {`r`n`toptions.headers.authorization`t=`r`n`t`t'Basic ' + Buffer.from(opts.auth).toString('base64');`r`n}`r`n"
  $crossLineBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($crossLineContent)
  [System.IO.File]::WriteAllBytes($crossLineTarget, $crossLineBytes)
  $crossLineSha256 = (Get-FileHash -LiteralPath $crossLineTarget -Algorithm SHA256).Hash.ToLowerInvariant()
  $crossLineManifest = Join-Path $crossLineRoot 'transfer-manifest.json'
  Write-TestManifest -ManifestPath $crossLineManifest -Entries @([pscustomobject]@{
    path = 'pilot/app/node_modules/ws/lib/websocket.js'
    bytes = $crossLineBytes.Length
    sha256 = $crossLineSha256
  })
  Invoke-ValidatorCase -Name 'allow-benign-authorization-code-across-crlf-and-tabs' -PayloadRoot $crossLinePayload -ManifestPath $crossLineManifest -OutputDirectory $crossLineOut -ExpectSuccess $true -ExpectedFileCount 1 -ExpectedPayloadBytes $crossLineBytes.Length
  $caseRoots += $crossLineRoot

  $sameLineRoot = Join-Path $testRoot 'credential-rule1-same-line-secret-shaped'
  $sameLinePayload = Join-Path $sameLineRoot 'payload'
  $sameLineOut = Join-Path $sameLineRoot 'out'
  $sameLineTarget = Join-Path $sameLinePayload 'pilot\app\scanner-fixture.js'
  New-Item -ItemType Directory -Path (Split-Path -Parent $sameLineTarget), $sameLineOut -Force | Out-Null
  $sameLineBytes = [System.Text.UTF8Encoding]::new($false).GetBytes("const headers = { authorization:`t'example-secret-shaped-value' };`r`n")
  [System.IO.File]::WriteAllBytes($sameLineTarget, $sameLineBytes)
  $sameLineSha256 = (Get-FileHash -LiteralPath $sameLineTarget -Algorithm SHA256).Hash.ToLowerInvariant()
  $sameLineManifest = Join-Path $sameLineRoot 'transfer-manifest.json'
  Write-TestManifest -ManifestPath $sameLineManifest -Entries @([pscustomobject]@{
    path = 'pilot/app/scanner-fixture.js'
    bytes = $sameLineBytes.Length
    sha256 = $sameLineSha256
  })
  Invoke-ValidatorCase -Name 'still-block-same-line-credential-shaped-text' -PayloadRoot $sameLinePayload -ManifestPath $sameLineManifest -OutputDirectory $sameLineOut -ExpectSuccess $false -ExpectedDiagnostic 'Credential-like literal detected in text payload' -ExpectedFileCount 1 -ExpectedPayloadBytes $sameLineBytes.Length
  $caseRoots += $sameLineRoot
}
finally {
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}

if (Test-Path -LiteralPath $testRoot) { throw 'Temporary manifest validator test root was not removed.' }
Write-Output 'PASS temp-cleanup'
Write-Output '6/6 validator cases passed; no ISO or COM path was entered.'
