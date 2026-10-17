[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CandidatePath,

    [Parameter(Mandatory = $true)]
    [string]$CandidateManifestPath,

    [Parameter(Mandatory = $true)]
    [string]$SourceRunReceiptPath,

    [Parameter(Mandatory = $true)]
    [string]$SourceRoot,

    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$CertificateThumbprint,

    [Parameter(Mandatory = $true)]
    [string]$SignToolPath,

    [Parameter(Mandatory = $true)]
    [string]$GoExecutable,

    [string]$PythonExecutable = 'python',

    [string]$GitExecutable = 'git',

    [string]$TimestampUrl = 'https://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib/launcher-release-handoff.psm1') -Force

if (-not (Test-Path -LiteralPath $CandidatePath -PathType Leaf)) {
    throw 'Source candidate is missing.'
}
if (-not (Test-Path -LiteralPath $CandidateManifestPath -PathType Leaf)) {
    throw 'Source candidate manifest is missing.'
}
if (-not (Test-Path -LiteralPath $SourceRunReceiptPath -PathType Leaf)) {
    throw 'Validated source-run provenance receipt is missing.'
}
if (-not (Test-Path -LiteralPath $SignToolPath -PathType Leaf)) {
    throw 'Explicit Windows SDK signtool.exe path is missing.'
}

$candidate = Assert-LauncherCandidateManifest -Manifest (Get-Content -LiteralPath $CandidateManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json)
$candidateManifestHash = (Get-FileHash -LiteralPath $CandidateManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$sourceReceipt = Get-Content -LiteralPath $SourceRunReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
Assert-LauncherSourceRunReceipt -Receipt $sourceReceipt -Candidate $candidate | Out-Null
$sourceReceiptHash = (Get-FileHash -LiteralPath $SourceRunReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
$verifiedReceiptPath = Join-Path ([System.IO.Path]::GetTempPath()) ('.launcher-verified-run-' + [guid]::NewGuid().ToString('N') + '.json')
$sourceRunVerifierPath = Join-Path $PSScriptRoot 'verify_launcher_source_run.py'
try {
    & $PythonExecutable $sourceRunVerifierPath `
        --repository 'Loggableim/ltth.app' `
        --run-id ([string]$candidate.sourceRunId) `
        --commit-sha $candidate.commitSha `
        --receipt-output $verifiedReceiptPath *> $null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $verifiedReceiptPath -PathType Leaf)) {
        throw 'GitHub Actions source-run verification failed; signing was not started.'
    }
    $verifiedReceipt = Get-Content -LiteralPath $verifiedReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-LauncherSourceRunReceipt -Receipt $verifiedReceipt -Candidate $candidate | Out-Null
} finally {
    Remove-Item -LiteralPath $verifiedReceiptPath -Force -ErrorAction SilentlyContinue
}
$candidateInfo = Get-Item -LiteralPath $CandidatePath
$candidateHash = (Get-FileHash -LiteralPath $CandidatePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($candidateInfo.Length -ne $candidate.bytes -or $candidateHash -ne $candidate.sha256) {
    throw 'Source candidate does not match its CI manifest.'
}
$candidateSignature = Get-AuthenticodeSignature -LiteralPath $CandidatePath
if ($candidateSignature.Status -ne 'NotSigned') {
    throw 'Manual handoff expects the original unsigned CI candidate.'
}

$rebuildPath = Join-Path ([System.IO.Path]::GetTempPath()) ('.launcher-pre-sign-rebuild-' + [guid]::NewGuid().ToString('N') + '.exe')
try {
    Invoke-LauncherSourceRebuild -SourceRoot $SourceRoot -ExpectedCommitSha $candidate.commitSha `
        -ExpectedTag $candidate.tag -GoExecutable $GoExecutable -OutputPath $rebuildPath -GitExecutable $GitExecutable
    if ((Get-Item -LiteralPath $rebuildPath).Length -ne $candidate.bytes -or
        (Get-FileHash -LiteralPath $rebuildPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $candidate.sha256) {
        throw 'Pinned clean source rebuild does not match the CI candidate; signing was not started.'
    }
} catch {
    throw
} finally {
    Remove-Item -LiteralPath $rebuildPath -Force -ErrorAction SilentlyContinue
}

$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $outputRoot) {
    throw 'Output directory already exists; refusing to overwrite handoff files.'
}
$outputParent = Split-Path -Parent $outputRoot
if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) {
    throw 'Output parent directory must already exist.'
}
$temporaryRoot = Join-Path $outputParent ('.launcher-signed-handoff-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
$launcherPath = Join-Path $temporaryRoot 'launcher.exe'
$releaseManifestPath = Join-Path $temporaryRoot 'launcher-release.json'
$provenancePath = Join-Path $temporaryRoot 'launcher-build-provenance.json'
$candidateManifestOutputPath = Join-Path $temporaryRoot 'launcher-candidate.json'
$sourceReceiptOutputPath = Join-Path $temporaryRoot 'launcher-source-run-receipt.json'
$stagedPath = Join-Path $temporaryRoot '.launcher.staged.exe'
try {
    Copy-Item -LiteralPath $CandidateManifestPath -Destination $candidateManifestOutputPath
    Copy-Item -LiteralPath $SourceRunReceiptPath -Destination $sourceReceiptOutputPath
    if ((Get-FileHash -LiteralPath $candidateManifestOutputPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $candidateManifestHash -or
        (Get-FileHash -LiteralPath $sourceReceiptOutputPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sourceReceiptHash) {
        throw 'Candidate manifest or source-run receipt changed before signing.'
    }
    $stagedCandidateManifest = Get-Content -LiteralPath $candidateManifestOutputPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $stagedCandidate = Assert-LauncherCandidateManifest -Manifest $stagedCandidateManifest
    $stagedSourceReceipt = Get-Content -LiteralPath $sourceReceiptOutputPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-LauncherSourceRunReceipt -Receipt $stagedSourceReceipt -Candidate $stagedCandidate | Out-Null

    Copy-Item -LiteralPath $CandidatePath -Destination $stagedPath
    $stagedHash = (Get-FileHash -LiteralPath $stagedPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($stagedHash -ne $candidate.sha256) {
        throw 'Staged launcher bytes differ from the source candidate.'
    }

    & $SignToolPath sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $stagedPath *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'Windows SDK signing failed; no release artifacts were accepted.'
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $stagedPath
    $expectedSigner = $CertificateThumbprint.ToLowerInvariant()
    $timestampCertificate = $signature.TimeStamperCertificate
    $timestampThumbprint = if ($null -ne $timestampCertificate) { [string]$timestampCertificate.Thumbprint } else { '' }
    if ($signature.Status -ne 'Valid' -or
        $signature.SignerCertificate.Thumbprint -ine $expectedSigner -or
        $null -eq $timestampCertificate -or $timestampThumbprint -notmatch '^[0-9a-fA-F]{40}$') {
        throw 'Signed candidate failed Authenticode, signer identity or timestamp-certificate verification.'
    }
    & $SignToolPath verify /pa /all /tw $stagedPath *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'SignTool did not verify the signed candidate and required RFC3161 timestamp.'
    }

    $signedInfo = Get-Item -LiteralPath $stagedPath
    $signedHash = (Get-FileHash -LiteralPath $stagedPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $releaseManifest = [ordered]@{
        schema = 1
        component = 'launcher.exe'
        version = $candidate.version
        tag = $candidate.tag
        commitSha = $candidate.commitSha
        bytes = $signedInfo.Length
        sha256 = $signedHash
    }
    $provenance = [ordered]@{
        schema = 2
        component = 'launcher.exe'
        sourceRunId = $candidate.sourceRunId
        sourceWorkflow = $candidate.sourceWorkflow
        sourceEvent = $candidate.sourceEvent
        sourceRef = $candidate.sourceRef
        sourceCommitSha = $candidate.commitSha
        version = $candidate.version
        tag = $candidate.tag
        toolchain = $candidate.toolchain
        target = $candidate.target
        cgoEnabled = $candidate.cgoEnabled
        moduleMode = $candidate.moduleMode
        buildFlags = $candidate.buildFlags
        candidateBytes = $candidate.bytes
        candidateSha256 = $candidate.sha256
        candidateManifestSha256 = $candidateManifestHash
        signedBytes = $signedInfo.Length
        signedSha256 = $signedHash
        expectedSignerThumbprint = $expectedSigner
        signerThumbprint = $signature.SignerCertificate.Thumbprint.ToLowerInvariant()
        timestampSignerThumbprint = $timestampThumbprint.ToLowerInvariant()
    }

    Move-Item -LiteralPath $stagedPath -Destination $launcherPath
    [System.IO.File]::WriteAllText($releaseManifestPath, (($releaseManifest | ConvertTo-Json) + [Environment]::NewLine), (New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::WriteAllText($provenancePath, (($provenance | ConvertTo-Json -Depth 5) + [Environment]::NewLine), (New-Object System.Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporaryRoot -Destination $outputRoot
    Write-Output 'Signed launcher handoff created; candidate and signed hashes recorded.'
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $rebuildPath -Force -ErrorAction SilentlyContinue
}
