$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$modulePath = Join-Path $PSScriptRoot 'lib/launcher-release-handoff.psm1'
$manifestWriter = Join-Path $PSScriptRoot 'write-launcher-candidate-manifest.ps1'
$signScript = Join-Path $PSScriptRoot 'sign-launcher-candidate.ps1'
Import-Module $modulePath -Force

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Assert-Throws {
    param([scriptblock]$Action, [string]$Message)
    $threw = $false
    try { & $Action } catch { $threw = $true }
    if (-not $threw) { throw $Message }
}

function Assert-HandoffRejected {
    param([string]$Description)
    $outputPath = Join-Path $root ('rejected-' + [guid]::NewGuid().ToString('N'))
    Assert-Throws {
        Test-LauncherReleaseHandoff -SourceRoot $sourceRoot -CandidateDirectory $candidateDirectory `
            -SignedDirectory $signedDirectory -ExpectedCommitSha $commitSha -ExpectedTag 'v1.2.3' `
            -ExpectedSourceRunId '456' -ExpectedSignerThumbprint $global:LauncherFixtureThumbprint `
            -GoExecutable $goFixture -OutputDirectory $outputPath `
            -SignatureProvider { param($path) Get-AuthenticodeSignature -LiteralPath $path }
    } "$Description was accepted."
    Assert-True (-not (Test-Path -LiteralPath $outputPath)) "$Description created accepted handoff output."
}

$root = Join-Path $repoRoot ('.launcher-handoff-synthetic-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$global:LauncherFixtureThumbprint = '0123456789abcdef0123456789abcdef01234567'
function global:Get-AuthenticodeSignature {
    param([string]$LiteralPath)
    $text = [System.IO.File]::ReadAllText($LiteralPath)
    if ($text.Contains('SYNTHETIC-AUTHENTICODE-SIGNATURE')) {
        return [pscustomobject]@{
            Status = 'Valid'
            StatusMessage = 'synthetic signature fixture'
            SignerCertificate = [pscustomobject]@{ Thumbprint = if ($env:LAUNCHER_FAKE_WRONG_SIGNER) { 'f' * 40 } else { $global:LauncherFixtureThumbprint } }
            TimeStamperCertificate = if ($env:LAUNCHER_FAKE_MISSING_TIMESTAMP) { $null } else { [pscustomobject]@{ Thumbprint = ('a' * 40) } }
        }
    }
    return [pscustomobject]@{ Status = 'NotSigned'; StatusMessage = 'fixture unsigned'; SignerCertificate = $null }
}

try {
    $sourceRoot = Join-Path $root 'source'
    $buildRoot = Join-Path $sourceRoot 'build-src'
    New-Item -ItemType Directory -Path $buildRoot | Out-Null
    Set-Content -LiteralPath (Join-Path $buildRoot 'go.mod') -Value "module synthetic.launcher`n`ngo 1.24`n" -NoNewline
    & git -C $sourceRoot init --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic git init failed.' }
    & git -C $sourceRoot config user.name 'Synthetic Handoff Test'
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic git name config failed.' }
    & git -C $sourceRoot config user.email 'synthetic@example.invalid'
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic git email config failed.' }
    & git -C $sourceRoot add -- build-src/go.mod
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic git add failed.' }
    & git -C $sourceRoot commit --quiet -m 'synthetic launcher source'
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic git commit failed.' }
    $commitSha = (& git -C $sourceRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic source commit lookup failed.' }
    & git -C $sourceRoot tag v1.2.3
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic source tag failed.' }

    $buildBytesPath = Join-Path $root 'synthetic-build-bytes.bin'
    [System.IO.File]::WriteAllText($buildBytesPath, 'SYNTHETIC-GO-BUILD-BYTES')
    $candidateBytes = [System.IO.File]::ReadAllBytes($buildBytesPath)
    $goFixture = Join-Path $root 'fake-go.ps1'
    @'
if ($args.Count -eq 1 -and $args[0] -eq 'version') {
    $global:LASTEXITCODE = 0
    if ($env:LAUNCHER_FAKE_GO_VERSION) { Write-Output $env:LAUNCHER_FAKE_GO_VERSION } else { Write-Output 'go version go1.24.10 windows/amd64' }
    return
}
if ($args.Count -gt 0 -and $args[0] -eq 'build') {
    if ($env:LAUNCHER_FAKE_BUILD_MARKER) { [System.IO.File]::WriteAllText($env:LAUNCHER_FAKE_BUILD_MARKER, 'build-called') }
    $outputIndex = [Array]::IndexOf($args, '-o')
    if ($outputIndex -lt 0 -or $outputIndex + 1 -ge $args.Count) { $global:LASTEXITCODE = 2; return }
    [System.IO.File]::WriteAllBytes($args[$outputIndex + 1], [System.IO.File]::ReadAllBytes($env:LAUNCHER_FAKE_BUILD_BYTES))
    $global:LASTEXITCODE = 0
    return
}
$global:LASTEXITCODE = 2
'@ | Set-Content -LiteralPath $goFixture -Encoding UTF8
    $env:LAUNCHER_FAKE_BUILD_BYTES = $buildBytesPath

    $candidateDirectory = Join-Path $root 'candidate'
    New-Item -ItemType Directory -Path $candidateDirectory | Out-Null
    $candidatePath = Join-Path $candidateDirectory 'launcher.exe'
    $candidateManifestPath = Join-Path $candidateDirectory 'launcher-candidate.json'
    [System.IO.File]::WriteAllBytes($candidatePath, $candidateBytes)
    & $manifestWriter `
        -CandidatePath $candidatePath `
        -ManifestPath $candidateManifestPath `
        -Version '1.2.3' `
        -Tag 'v1.2.3' `
        -CommitSha $commitSha `
        -SourceRunId '456' `
        -SourceWorkflow '.github/workflows/release.yml' `
        -SourceEvent 'push' `
        -SourceRef 'refs/tags/v1.2.3' `
        -GoExecutable $goFixture | Out-Null
    $candidateManifest = Get-Content -LiteralPath $candidateManifestPath -Raw | ConvertFrom-Json
    Assert-True ($candidateManifest.toolchain -eq 'go1.24.10' -and $candidateManifest.target -eq 'windows/amd64') 'Valid exact Windows/amd64 Go toolchain did not produce its manifest.'

    foreach ($invalidWriterToolchain in @('go version go1.24.100 windows/amd64', 'go version go1.24.10rc1 windows/amd64', 'go version go1.24.10 linux/amd64', 'go version go1.24.10 windows/arm64')) {
        $env:LAUNCHER_FAKE_GO_VERSION = $invalidWriterToolchain
        $invalidWriterManifestPath = Join-Path $root ('rejected-writer-manifest-' + [guid]::NewGuid().ToString('N') + '.json')
        Assert-Throws {
            & $manifestWriter `
                -CandidatePath $candidatePath `
                -ManifestPath $invalidWriterManifestPath `
                -Version '1.2.3' `
                -Tag 'v1.2.3' `
                -CommitSha $commitSha `
                -SourceRunId '456' `
                -SourceWorkflow '.github/workflows/release.yml' `
                -SourceEvent 'push' `
                -SourceRef 'refs/tags/v1.2.3' `
                -GoExecutable $goFixture | Out-Null
        } "Manifest writer accepted invalid Go toolchain: $invalidWriterToolchain"
        Assert-True (-not (Test-Path -LiteralPath $invalidWriterManifestPath)) "Rejected toolchain wrote a manifest: $invalidWriterToolchain"
    }
    $env:LAUNCHER_FAKE_GO_VERSION = 'go version go1.24.10 windows/amd64'

    $sourceReceiptPath = Join-Path $root 'source-run-receipt.json'
    [ordered]@{
        schema = 1
        repository = 'Loggableim/ltth.app'
        runId = 456
        workflow = '.github/workflows/release.yml'
        event = 'push'
        ref = 'refs/tags/v1.2.3'
        commitSha = $commitSha
    } | ConvertTo-Json | Set-Content -LiteralPath $sourceReceiptPath -Encoding UTF8

    $signMarker = Join-Path $root 'signtool-sign-called'
    $verifyMarker = Join-Path $root 'signtool-verify-called'
    $env:LAUNCHER_FAKE_SIGN_MARKER = $signMarker
    $env:LAUNCHER_FAKE_VERIFY_MARKER = $verifyMarker
    $env:LAUNCHER_FAKE_BUILD_MARKER = Join-Path $root 'pre-sign-build-called'

    $fakeSignTool = Join-Path $root 'fake-signtool.ps1'
    @'
$target = $args[$args.Count - 1]
if ($args[0] -eq 'verify') {
    if ($env:LAUNCHER_FAKE_VERIFY_MARKER) { [System.IO.File]::WriteAllText($env:LAUNCHER_FAKE_VERIFY_MARKER, ($args -join ' ')) }
    $global:LASTEXITCODE = if ($env:LAUNCHER_FAKE_VERIFY_FAILURE) { 1 } else { 0 }
    return
}
if ($env:LAUNCHER_FAKE_SIGN_MARKER) { [System.IO.File]::WriteAllText($env:LAUNCHER_FAKE_SIGN_MARKER, 'sign-called') }
$stream = [System.IO.File]::Open($target, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
try {
    $marker = [System.Text.Encoding]::UTF8.GetBytes("`nSYNTHETIC-AUTHENTICODE-SIGNATURE:$($args[2])")
    $stream.Write($marker, 0, $marker.Length)
} finally { $stream.Dispose() }
$global:LASTEXITCODE = 0
'@ | Set-Content -LiteralPath $fakeSignTool -Encoding UTF8

    $fakePython = Join-Path $root 'fake-python.ps1'
    @'
$outputIndex = [Array]::IndexOf($args, '--receipt-output')
if ($outputIndex -lt 0 -or $outputIndex + 1 -ge $args.Count) { $global:LASTEXITCODE = 2; return }
if ($env:LAUNCHER_FAKE_VERIFY_RUN_MARKER) { [System.IO.File]::WriteAllText($env:LAUNCHER_FAKE_VERIFY_RUN_MARKER, 'verified-run') }
if ($env:LAUNCHER_FAKE_VERIFY_RUN_FAILURE) { $global:LASTEXITCODE = 1; return }
Copy-Item -LiteralPath $env:LAUNCHER_FAKE_VERIFIED_RECEIPT_PATH -Destination $args[$outputIndex + 1]
$global:LASTEXITCODE = 0
'@ | Set-Content -LiteralPath $fakePython -Encoding UTF8
    $env:LAUNCHER_FAKE_VERIFIED_RECEIPT_PATH = $sourceReceiptPath
    $env:LAUNCHER_FAKE_VERIFY_RUN_MARKER = Join-Path $root 'source-run-api-verified'

    foreach ($receiptCase in @('missing', 'wrong-run', 'wrong-commit', 'wrong-workflow')) {
        $receiptForCase = $sourceReceiptPath
        if ($receiptCase -eq 'missing') { $receiptForCase = Join-Path $root 'missing-source-run-receipt.json' }
        if ($receiptCase -ne 'missing') {
            $badReceiptPath = Join-Path $root ("$receiptCase-source-run-receipt.json")
            $badReceipt = Get-Content -LiteralPath $sourceReceiptPath -Raw | ConvertFrom-Json
            if ($receiptCase -eq 'wrong-run') { $badReceipt.runId = 457 }
            if ($receiptCase -eq 'wrong-commit') { $badReceipt.commitSha = 'f' * 40 }
            if ($receiptCase -eq 'wrong-workflow') { $badReceipt.workflow = '.github/workflows/build-launcher.yml' }
            $badReceipt | ConvertTo-Json | Set-Content -LiteralPath $badReceiptPath -Encoding UTF8
            $receiptForCase = $badReceiptPath
        }
        $rejectedSigningOutput = Join-Path $root "reject-signing-$receiptCase"
        Assert-Throws {
            & $signScript -CandidatePath $candidatePath -CandidateManifestPath $candidateManifestPath `
                -SourceRunReceiptPath $receiptForCase -SourceRoot $sourceRoot `
                -OutputDirectory $rejectedSigningOutput -CertificateThumbprint $global:LauncherFixtureThumbprint `
                -SignToolPath $fakeSignTool -GoExecutable $goFixture -PythonExecutable $fakePython
        } "Invalid source-run receipt ($receiptCase) reached signing."
        Assert-True (-not (Test-Path -LiteralPath $signMarker)) "Invalid source-run receipt ($receiptCase) invoked SignTool."
        Assert-True (-not (Test-Path -LiteralPath $rejectedSigningOutput)) "Invalid source-run receipt ($receiptCase) created a signed output."
    }

    $mismatchedVerifiedReceiptPath = Join-Path $root 'mismatched-api-receipt.json'
    $mismatchedVerifiedReceipt = Get-Content -LiteralPath $sourceReceiptPath -Raw | ConvertFrom-Json
    $mismatchedVerifiedReceipt.commitSha = 'e' * 40
    $mismatchedVerifiedReceipt | ConvertTo-Json | Set-Content -LiteralPath $mismatchedVerifiedReceiptPath -Encoding UTF8
    $env:LAUNCHER_FAKE_VERIFIED_RECEIPT_PATH = $mismatchedVerifiedReceiptPath
    $apiMismatchOutput = Join-Path $root 'reject-signing-api-receipt-mismatch'
    Assert-Throws {
        & $signScript -CandidatePath $candidatePath -CandidateManifestPath $candidateManifestPath `
            -SourceRunReceiptPath $sourceReceiptPath -SourceRoot $sourceRoot `
            -OutputDirectory $apiMismatchOutput -CertificateThumbprint $global:LauncherFixtureThumbprint `
            -SignToolPath $fakeSignTool -GoExecutable $goFixture -PythonExecutable $fakePython
    } 'Freshly verified Actions API receipt mismatch was accepted.'
    Assert-True (-not (Test-Path -LiteralPath $signMarker)) 'Fresh Actions API receipt mismatch invoked SignTool.'
    Assert-True (-not (Test-Path -LiteralPath $apiMismatchOutput)) 'Fresh Actions API receipt mismatch created signed output.'
    $env:LAUNCHER_FAKE_VERIFIED_RECEIPT_PATH = $sourceReceiptPath

    $env:LAUNCHER_FAKE_VERIFY_RUN_FAILURE = '1'
    $apiFailureOutput = Join-Path $root 'reject-signing-api-verification-failure'
    Assert-Throws {
        & $signScript -CandidatePath $candidatePath -CandidateManifestPath $candidateManifestPath `
            -SourceRunReceiptPath $sourceReceiptPath -SourceRoot $sourceRoot `
            -OutputDirectory $apiFailureOutput -CertificateThumbprint $global:LauncherFixtureThumbprint `
            -SignToolPath $fakeSignTool -GoExecutable $goFixture -PythonExecutable $fakePython
    } 'Failed Actions API source-run verification was accepted.'
    Assert-True (-not (Test-Path -LiteralPath $signMarker)) 'Failed Actions API source-run verification invoked SignTool.'
    Assert-True (-not (Test-Path -LiteralPath $apiFailureOutput)) 'Failed Actions API source-run verification created signed output.'
    Remove-Item Env:LAUNCHER_FAKE_VERIFY_RUN_FAILURE

    $sourceGoModPath = Join-Path $sourceRoot 'build-src/go.mod'
    $cleanSourceGoMod = [System.IO.File]::ReadAllBytes($sourceGoModPath)
    [System.IO.File]::AppendAllText($sourceGoModPath, "`n// dirty-source-fixture")
    $env:LAUNCHER_FAKE_BUILD_MARKER = Join-Path $root 'dirty-source-build-called'
    $dirtySourceOutput = Join-Path $root 'reject-signing-dirty-source'
    Assert-Throws {
        & $signScript -CandidatePath $candidatePath -CandidateManifestPath $candidateManifestPath `
            -SourceRunReceiptPath $sourceReceiptPath -SourceRoot $sourceRoot `
            -OutputDirectory $dirtySourceOutput -CertificateThumbprint $global:LauncherFixtureThumbprint `
            -SignToolPath $fakeSignTool -GoExecutable $goFixture -PythonExecutable $fakePython
    } 'Dirty source checkout was accepted before signing.'
    Assert-True (-not (Test-Path -LiteralPath $signMarker)) 'Dirty source checkout invoked fake SignTool.'
    Assert-True (-not (Test-Path -LiteralPath $env:LAUNCHER_FAKE_BUILD_MARKER)) 'Dirty source checkout reached fake Go build.'
    Assert-True (-not (Test-Path -LiteralPath $dirtySourceOutput)) 'Dirty source checkout created signed output.'
    [System.IO.File]::WriteAllBytes($sourceGoModPath, $cleanSourceGoMod)
    Remove-Item Env:LAUNCHER_FAKE_BUILD_MARKER

    $retargetedCommit = (& git -C $sourceRoot commit-tree 'HEAD^{tree}' -p HEAD -m 'synthetic pre-sign retarget').Trim()
    if ($LASTEXITCODE -ne 0 -or $retargetedCommit -notmatch '^[0-9a-f]{40}$') { throw 'Synthetic pre-sign tag target could not be created.' }
    & git -C $sourceRoot tag --force v1.2.3 $retargetedCommit | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic pre-sign tag retarget failed.' }
    $retargetedTagOutput = Join-Path $root 'reject-signing-retargeted-tag'
    Assert-Throws {
        & $signScript -CandidatePath $candidatePath -CandidateManifestPath $candidateManifestPath `
            -SourceRunReceiptPath $sourceReceiptPath -SourceRoot $sourceRoot `
            -OutputDirectory $retargetedTagOutput -CertificateThumbprint $global:LauncherFixtureThumbprint `
            -SignToolPath $fakeSignTool -GoExecutable $goFixture -PythonExecutable $fakePython
    } 'Retargeted source tag was accepted before signing.'
    Assert-True (-not (Test-Path -LiteralPath $signMarker)) 'Retargeted source tag invoked fake SignTool.'
    Assert-True (-not (Test-Path -LiteralPath $retargetedTagOutput)) 'Retargeted source tag created signed output.'
    & git -C $sourceRoot tag --force v1.2.3 $commitSha | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic source tag could not be restored after pre-sign test.' }

    $differentBuildBytes = Join-Path $root 'different-pre-sign-build.bin'
    [System.IO.File]::WriteAllText($differentBuildBytes, 'DIFFERENT-SYNTHETIC-PRE-SIGN-BUILD')
    $env:LAUNCHER_FAKE_BUILD_BYTES = $differentBuildBytes
    $mismatchedRebuildOutput = Join-Path $root 'reject-signing-rebuild-mismatch'
    Assert-Throws {
        & $signScript -CandidatePath $candidatePath -CandidateManifestPath $candidateManifestPath `
            -SourceRunReceiptPath $sourceReceiptPath -SourceRoot $sourceRoot `
            -OutputDirectory $mismatchedRebuildOutput -CertificateThumbprint $global:LauncherFixtureThumbprint `
            -SignToolPath $fakeSignTool -GoExecutable $goFixture -PythonExecutable $fakePython
    } 'Mismatched pre-sign rebuild was accepted.'
    Assert-True (-not (Test-Path -LiteralPath $signMarker)) 'Mismatched pre-sign rebuild invoked SignTool.'
    Assert-True (-not (Test-Path -LiteralPath $mismatchedRebuildOutput)) 'Mismatched pre-sign rebuild created signed output.'
    $env:LAUNCHER_FAKE_BUILD_BYTES = $buildBytesPath

    $signedDirectory = Join-Path $root 'signed'
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    & $signScript `
        -CandidatePath $candidatePath `
        -CandidateManifestPath $candidateManifestPath `
        -SourceRunReceiptPath $sourceReceiptPath `
        -SourceRoot $sourceRoot `
        -OutputDirectory $signedDirectory `
        -CertificateThumbprint $global:LauncherFixtureThumbprint `
        -SignToolPath $fakeSignTool `
        -GoExecutable $goFixture -PythonExecutable $fakePython | Out-Null
    Assert-True (Test-Path -LiteralPath $signMarker) 'Valid receipt and pinned rebuild did not reach fake SignTool.'
    Assert-True (Test-Path -LiteralPath $env:LAUNCHER_FAKE_VERIFY_RUN_MARKER) 'Local helper did not refresh source-run provenance from its verifier.'
    Assert-True (Test-Path -LiteralPath $verifyMarker) 'Post-sign RFC3161 timestamp verification did not run.'
    $verifyArguments = Get-Content -LiteralPath $verifyMarker -Raw
    foreach ($requiredVerifyFlag in @('/pa', '/all', '/tw')) {
        Assert-True ($verifyArguments.Contains($requiredVerifyFlag)) "Post-sign verification omitted $requiredVerifyFlag."
    }

    Remove-Item -LiteralPath $signMarker, $verifyMarker -ErrorAction SilentlyContinue
    $env:LAUNCHER_FAKE_WRONG_SIGNER = '1'
    $rejectedSignerOutput = Join-Path $root 'reject-signing-wrong-signer'
    Assert-Throws {
        & $signScript -CandidatePath $candidatePath -CandidateManifestPath $candidateManifestPath `
            -SourceRunReceiptPath $sourceReceiptPath -SourceRoot $sourceRoot `
            -OutputDirectory $rejectedSignerOutput -CertificateThumbprint $global:LauncherFixtureThumbprint `
            -SignToolPath $fakeSignTool -GoExecutable $goFixture -PythonExecutable $fakePython
    } 'Wrong post-sign signer was accepted by the local helper.'
    Assert-True (Test-Path -LiteralPath $signMarker) 'Wrong-signer negative control did not reach fake signing.'
    Assert-True (-not (Test-Path -LiteralPath $verifyMarker)) 'Wrong-signer negative control reached timestamp verification before signer identity passed.'
    Assert-True (-not (Test-Path -LiteralPath $rejectedSignerOutput)) 'Wrong post-sign signer created accepted output.'
    Remove-Item Env:LAUNCHER_FAKE_WRONG_SIGNER

    Remove-Item -LiteralPath $signMarker, $verifyMarker -ErrorAction SilentlyContinue
    $env:LAUNCHER_FAKE_MISSING_TIMESTAMP = '1'
    $rejectedMissingTimestampOutput = Join-Path $root 'reject-signing-missing-timestamp'
    Assert-Throws {
        & $signScript -CandidatePath $candidatePath -CandidateManifestPath $candidateManifestPath `
            -SourceRunReceiptPath $sourceReceiptPath -SourceRoot $sourceRoot `
            -OutputDirectory $rejectedMissingTimestampOutput -CertificateThumbprint $global:LauncherFixtureThumbprint `
            -SignToolPath $fakeSignTool -GoExecutable $goFixture -PythonExecutable $fakePython
    } 'Missing timestamp certificate was accepted by the local helper.'
    Assert-True (Test-Path -LiteralPath $signMarker) 'Missing-timestamp negative control did not reach fake signing.'
    Assert-True (-not (Test-Path -LiteralPath $verifyMarker)) 'Missing-timestamp negative control reached SignTool verification.'
    Assert-True (-not (Test-Path -LiteralPath $rejectedMissingTimestampOutput)) 'Missing timestamp certificate created accepted output.'
    Remove-Item Env:LAUNCHER_FAKE_MISSING_TIMESTAMP

    Remove-Item -LiteralPath $signMarker, $verifyMarker -ErrorAction SilentlyContinue
    $env:LAUNCHER_FAKE_VERIFY_FAILURE = '1'
    $rejectedTimestampOutput = Join-Path $root 'reject-signing-timestamp'
    Assert-Throws {
        & $signScript -CandidatePath $candidatePath -CandidateManifestPath $candidateManifestPath `
            -SourceRunReceiptPath $sourceReceiptPath -SourceRoot $sourceRoot `
            -OutputDirectory $rejectedTimestampOutput -CertificateThumbprint $global:LauncherFixtureThumbprint `
            -SignToolPath $fakeSignTool -GoExecutable $goFixture -PythonExecutable $fakePython
    } 'Missing RFC3161 verification was accepted.'
    Assert-True (Test-Path -LiteralPath $signMarker) 'Timestamp negative control did not reach the fake signing step.'
    Assert-True (Test-Path -LiteralPath $verifyMarker) 'Timestamp negative control did not invoke fake SignTool verification.'
    Assert-True (-not (Test-Path -LiteralPath $rejectedTimestampOutput)) 'Timestamp verification failure created accepted output.'
    Remove-Item Env:LAUNCHER_FAKE_VERIFY_FAILURE

    # Exercise exact filename-set checks without relying on PowerShell Sort-Object collation.
    $unexpectedCandidateFile = Join-Path $candidateDirectory 'unexpected.txt'
    [System.IO.File]::WriteAllText($unexpectedCandidateFile, 'synthetic extra file')
    Assert-HandoffRejected 'Candidate directory with an extra file'
    Remove-Item -LiteralPath $unexpectedCandidateFile

    $candidateManifestBackup = Join-Path $root 'launcher-candidate.backup.json'
    Move-Item -LiteralPath $candidateManifestPath -Destination $candidateManifestBackup
    Assert-HandoffRejected 'Candidate directory missing its manifest'
    Move-Item -LiteralPath $candidateManifestBackup -Destination $candidateManifestPath

    $candidateNestedDirectory = Join-Path $candidateDirectory 'nested'
    New-Item -ItemType Directory -Path $candidateNestedDirectory | Out-Null
    Assert-HandoffRejected 'Candidate directory containing a subdirectory'
    Remove-Item -LiteralPath $candidateNestedDirectory

    $unexpectedSignedFile = Join-Path $signedDirectory 'unexpected.txt'
    [System.IO.File]::WriteAllText($unexpectedSignedFile, 'synthetic extra file')
    Assert-HandoffRejected 'Signed directory with an extra file'
    Remove-Item -LiteralPath $unexpectedSignedFile

    $signedNestedDirectory = Join-Path $signedDirectory 'nested'
    New-Item -ItemType Directory -Path $signedNestedDirectory | Out-Null
    Assert-HandoffRejected 'Signed directory containing a subdirectory'
    Remove-Item -LiteralPath $signedNestedDirectory

    $signedPath = Join-Path $signedDirectory 'launcher.exe'
    $signedManifestPath = Join-Path $signedDirectory 'launcher-release.json'
    $provenancePath = Join-Path $signedDirectory 'launcher-build-provenance.json'
    $releaseManifest = Get-Content -LiteralPath $signedManifestPath -Raw | ConvertFrom-Json
    $provenance = Get-Content -LiteralPath $provenancePath -Raw | ConvertFrom-Json
    Assert-True ($releaseManifest.sha256 -eq (Get-FileHash -LiteralPath $signedPath -Algorithm SHA256).Hash.ToLowerInvariant()) 'Final manifest does not hash the synthetic signed candidate.'
    Assert-True ($provenance.candidateSha256 -eq (Get-FileHash -LiteralPath $candidatePath -Algorithm SHA256).Hash.ToLowerInvariant()) 'Provenance does not bind the unsigned CI candidate.'
    Assert-True ($provenance.expectedSignerThumbprint -eq $global:LauncherFixtureThumbprint) 'Provenance does not record the explicit expected signer.'
    Assert-True ($provenance.sourceWorkflow -eq '.github/workflows/release.yml') 'Provenance does not bind the source workflow.'
    Assert-True ($provenance.timestampSignerThumbprint -eq ('a' * 40)) 'Provenance does not record the RFC3161 timestamp signer.'
    Assert-True (Test-Path -LiteralPath (Join-Path $signedDirectory 'launcher-source-run-receipt.json')) 'Signed handoff did not preserve the validated source-run receipt.'

    $stageDirectory = Join-Path $root 'launcher-release-handoff/v1.2.3'
    New-Item -ItemType Directory -Path (Split-Path -Parent $stageDirectory) -Force | Out-Null
    $validation = Test-LauncherReleaseHandoff `
        -SourceRoot $sourceRoot `
        -CandidateDirectory $candidateDirectory `
        -SignedDirectory $signedDirectory `
        -ExpectedCommitSha $commitSha `
        -ExpectedTag 'v1.2.3' `
        -ExpectedSourceRunId '456' `
        -ExpectedSignerThumbprint $global:LauncherFixtureThumbprint `
        -GoExecutable $goFixture `
        -OutputDirectory $stageDirectory `
        -SignatureProvider { param($path) Get-AuthenticodeSignature -LiteralPath $path }
    Assert-True (Test-Path -LiteralPath (Join-Path $stageDirectory 'launcher-handoff.json') -PathType Leaf) 'Commit-bound handoff receipt was not written.'
    Assert-True ((Get-LauncherFileSha256 (Join-Path $stageDirectory 'launcher.exe')) -eq $releaseManifest.sha256) 'Staged launcher bytes changed after validation.'

    $workflowAssets = Join-Path $root 'workflow-assets'
    $secondValidation = Test-LauncherReleaseHandoff `
        -SourceRoot $sourceRoot `
        -CandidateDirectory $candidateDirectory `
        -SignedDirectory $stageDirectory `
        -ExpectedCommitSha $commitSha `
        -ExpectedTag 'v1.2.3' `
        -ExpectedSourceRunId '456' `
        -ExpectedSignerThumbprint $global:LauncherFixtureThumbprint `
        -GoExecutable $goFixture `
        -OutputDirectory $workflowAssets `
        -SignatureProvider { param($path) Get-AuthenticodeSignature -LiteralPath $path }
    Assert-True ((Get-LauncherFileSha256 (Join-Path $workflowAssets 'launcher.exe')) -eq $releaseManifest.sha256) 'Workflow validation output differs from the signed handoff.'

    $env:LAUNCHER_FAKE_BUILD_MARKER = Join-Path $root 'toolchain-build-called'
    foreach ($invalidGoVersion in @('go version go1.24.100 windows/amd64', 'go version go1.24.10rc1 windows/amd64', 'go version go1.24.10 linux/amd64', 'go version go1.24.10 windows/arm64')) {
        $env:LAUNCHER_FAKE_GO_VERSION = $invalidGoVersion
        $invalidToolchainOutput = Join-Path $root ('invalid-toolchain-' + [guid]::NewGuid().ToString('N'))
        Assert-Throws {
            Test-LauncherReleaseHandoff -SourceRoot $sourceRoot -CandidateDirectory $candidateDirectory `
                -SignedDirectory $signedDirectory -ExpectedCommitSha $commitSha -ExpectedTag 'v1.2.3' `
                -ExpectedSourceRunId '456' -ExpectedSignerThumbprint $global:LauncherFixtureThumbprint -GoExecutable $goFixture `
                -OutputDirectory $invalidToolchainOutput -SignatureProvider { param($path) Get-AuthenticodeSignature -LiteralPath $path }
        } "Invalid source-rebuild toolchain was accepted: $invalidGoVersion"
        Assert-True (-not (Test-Path -LiteralPath $invalidToolchainOutput)) 'Rejected toolchain created output.'
        Assert-True (-not (Test-Path -LiteralPath $env:LAUNCHER_FAKE_BUILD_MARKER)) 'Rejected toolchain invoked the fake build.'
    }
    $env:LAUNCHER_FAKE_GO_VERSION = 'go version go1.24.10 windows/amd64'
    $validToolchainOutput = Join-Path $root 'valid-exact-toolchain'
    Test-LauncherReleaseHandoff -SourceRoot $sourceRoot -CandidateDirectory $candidateDirectory `
        -SignedDirectory $signedDirectory -ExpectedCommitSha $commitSha -ExpectedTag 'v1.2.3' `
        -ExpectedSourceRunId '456' -ExpectedSignerThumbprint $global:LauncherFixtureThumbprint -GoExecutable $goFixture `
        -OutputDirectory $validToolchainOutput -SignatureProvider { param($path) Get-AuthenticodeSignature -LiteralPath $path } | Out-Null
    Assert-True (Test-Path -LiteralPath $env:LAUNCHER_FAKE_BUILD_MARKER) 'Exact valid toolchain did not reach fake build.'
    Remove-Item -LiteralPath $env:LAUNCHER_FAKE_BUILD_MARKER
    Remove-Item Env:LAUNCHER_FAKE_BUILD_MARKER
    Remove-Item Env:LAUNCHER_FAKE_SIGN_MARKER -ErrorAction SilentlyContinue
    Remove-Item Env:LAUNCHER_FAKE_VERIFY_MARKER -ErrorAction SilentlyContinue
    Remove-Item Env:LAUNCHER_FAKE_VERIFY_FAILURE -ErrorAction SilentlyContinue
    Remove-Item Env:LAUNCHER_FAKE_WRONG_SIGNER -ErrorAction SilentlyContinue
    Remove-Item Env:LAUNCHER_FAKE_MISSING_TIMESTAMP -ErrorAction SilentlyContinue
    Remove-Item Env:LAUNCHER_FAKE_VERIFIED_RECEIPT_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:LAUNCHER_FAKE_VERIFY_RUN_MARKER -ErrorAction SilentlyContinue
    Remove-Item Env:LAUNCHER_FAKE_VERIFY_RUN_FAILURE -ErrorAction SilentlyContinue
    Remove-Item Env:LAUNCHER_FAKE_GO_VERSION

    # Contract-only signature objects; no actual timestamp token/chain verification.
    foreach ($signatureCase in @('missing-property', 'null-timestamp', 'untrusted', 'invalid', 'wrong-signer')) {
        $signatureObject = [pscustomobject]@{
            Status = 'Valid'
            SignerCertificate = [pscustomobject]@{ Thumbprint = $global:LauncherFixtureThumbprint }
            TimeStamperCertificate = [pscustomobject]@{ Thumbprint = ('a' * 40) }
        }
        if ($signatureCase -eq 'missing-property') { $signatureObject.PSObject.Properties.Remove('TimeStamperCertificate') }
        if ($signatureCase -eq 'null-timestamp') { $signatureObject.TimeStamperCertificate = $null }
        if ($signatureCase -eq 'untrusted') { $signatureObject.Status = 'NotTrusted' }
        if ($signatureCase -eq 'invalid') { $signatureObject.Status = 'HashMismatch' }
        if ($signatureCase -eq 'wrong-signer') { $signatureObject.SignerCertificate.Thumbprint = ('f' * 40) }
        $rejectedSignatureOutput = Join-Path $root ('signature-gate-' + $signatureCase)
        Assert-Throws {
            Test-LauncherReleaseHandoff -SourceRoot $sourceRoot -CandidateDirectory $candidateDirectory `
                -SignedDirectory $signedDirectory -ExpectedCommitSha $commitSha -ExpectedTag 'v1.2.3' `
                -ExpectedSourceRunId '456' -ExpectedSignerThumbprint $global:LauncherFixtureThumbprint -GoExecutable $goFixture `
                -OutputDirectory $rejectedSignatureOutput -SignatureProvider { param($path) $signatureObject }
        } "Invalid signature/timestamp contract was accepted: $signatureCase"
        Assert-True (-not (Test-Path -LiteralPath $rejectedSignatureOutput)) 'Rejected signature created accepted handoff output.'
    }

    $wrongSignerOutput = Join-Path $root 'wrong-signer-output'
    Assert-Throws {
        Test-LauncherReleaseHandoff -SourceRoot $sourceRoot -CandidateDirectory $candidateDirectory `
            -SignedDirectory $signedDirectory -ExpectedCommitSha $commitSha -ExpectedTag 'v1.2.3' `
            -ExpectedSourceRunId '456' -ExpectedSignerThumbprint ('f' * 40) -GoExecutable $goFixture `
            -OutputDirectory $wrongSignerOutput -SignatureProvider { param($path) Get-AuthenticodeSignature -LiteralPath $path }
    } 'Wrong signer thumbprint was accepted.'
    Assert-True (-not (Test-Path -LiteralPath $wrongSignerOutput)) 'Rejected handoff created an output directory.'

    $tamperedDirectory = Join-Path $root 'tampered'
    Copy-Item -LiteralPath $signedDirectory -Destination $tamperedDirectory -Recurse
    [System.IO.File]::AppendAllText((Join-Path $tamperedDirectory 'launcher.exe'), 'TAMPERED')
    Assert-Throws {
        Test-LauncherReleaseHandoff -SourceRoot $sourceRoot -CandidateDirectory $candidateDirectory `
            -SignedDirectory $tamperedDirectory -ExpectedCommitSha $commitSha -ExpectedTag 'v1.2.3' `
            -ExpectedSourceRunId '456' -ExpectedSignerThumbprint $global:LauncherFixtureThumbprint `
            -GoExecutable $goFixture -OutputDirectory (Join-Path $root 'tampered-output') `
            -SignatureProvider { param($path) Get-AuthenticodeSignature -LiteralPath $path }
    } 'Tampered signed candidate was accepted.'

    $env:LAUNCHER_FAKE_BUILD_BYTES = Join-Path $root 'different-build-bytes.bin'
    [System.IO.File]::WriteAllText($env:LAUNCHER_FAKE_BUILD_BYTES, 'DIFFERENT-SYNTHETIC-BUILD')
    Assert-Throws {
        Test-LauncherReleaseHandoff -SourceRoot $sourceRoot -CandidateDirectory $candidateDirectory `
            -SignedDirectory $signedDirectory -ExpectedCommitSha $commitSha -ExpectedTag 'v1.2.3' `
            -ExpectedSourceRunId '456' -ExpectedSignerThumbprint $global:LauncherFixtureThumbprint `
            -GoExecutable $goFixture -OutputDirectory (Join-Path $root 'wrong-rebuild-output') `
            -SignatureProvider { param($path) Get-AuthenticodeSignature -LiteralPath $path }
    } 'Source rebuild drift was accepted.'

    $alternateTagCommit = (& git -C $sourceRoot commit-tree 'HEAD^{tree}' -p HEAD -m 'synthetic alternate tag target').Trim()
    if ($LASTEXITCODE -ne 0 -or $alternateTagCommit -notmatch '^[0-9a-f]{40}$') { throw 'Synthetic alternate tag target could not be created.' }
    & git -C $sourceRoot tag --force v1.2.3 $alternateTagCommit | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic release tag retarget failed.' }
    Assert-Throws {
        Test-LauncherReleaseHandoff -SourceRoot $sourceRoot -CandidateDirectory $candidateDirectory `
            -SignedDirectory $signedDirectory -ExpectedCommitSha $commitSha -ExpectedTag 'v1.2.3' `
            -ExpectedSourceRunId '456' -ExpectedSignerThumbprint $global:LauncherFixtureThumbprint `
            -GoExecutable $goFixture -OutputDirectory (Join-Path $root 'retargeted-tag-output') `
            -SignatureProvider { param($path) Get-AuthenticodeSignature -LiteralPath $path }
    } 'Release tag pointing at a different commit was accepted.'

    Write-Output 'PASS: ordinal candidate/signed filename sets; receipt-bound pre-sign source/run/workflow/tag/commit gates; dirty-source, wrong-source-run and tag-retarget rejection with Fake-SignTool=0; clean pinned rebuild; post-sign signer and /tw verification; exact manifests/staged bytes; tamper/drift rejection; exact Go 1.24.10 toolchain checks.'
} finally {
    Remove-Item Env:LAUNCHER_FAKE_BUILD_BYTES -ErrorAction SilentlyContinue
    Remove-Item Env:LAUNCHER_FAKE_BUILD_MARKER -ErrorAction SilentlyContinue
    Remove-Item Env:LAUNCHER_FAKE_GO_VERSION -ErrorAction SilentlyContinue
    Remove-Item Function:\Get-AuthenticodeSignature -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
