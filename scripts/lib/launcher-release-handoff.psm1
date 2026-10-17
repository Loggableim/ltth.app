Set-StrictMode -Version Latest

$script:LauncherCandidateFields = @(
    'schema', 'component', 'version', 'tag', 'commitSha', 'sourceRunId', 'sourceWorkflow', 'sourceEvent', 'sourceRef',
    'bytes', 'sha256', 'toolchain', 'target', 'cgoEnabled', 'moduleMode', 'buildFlags'
)
$script:LauncherBuildFlags = @('-trimpath', '-buildvcs=false', '-ldflags', '-H windowsgui -s -w')
$script:LauncherReleaseFields = @('schema', 'component', 'version', 'tag', 'commitSha', 'bytes', 'sha256')
$script:LauncherProvenanceFields = @(
    'schema', 'component', 'sourceRunId', 'sourceWorkflow', 'sourceEvent', 'sourceRef', 'sourceCommitSha', 'version', 'tag', 'toolchain',
    'target', 'cgoEnabled', 'moduleMode', 'buildFlags', 'candidateBytes',
    'candidateSha256', 'candidateManifestSha256', 'signedBytes', 'signedSha256',
    'expectedSignerThumbprint', 'signerThumbprint', 'timestampSignerThumbprint'
)
$script:LauncherReceiptFields = @('schema', 'repository', 'runId', 'workflow', 'event', 'ref', 'commitSha')
$script:LauncherHandoffReceiptFields = @(
    'schema', 'sourceRunId', 'sourceWorkflow', 'sourceEvent', 'sourceRef', 'sourceCommitSha',
    'version', 'tag', 'candidateSha256', 'signedSha256', 'expectedSignerThumbprint', 'timestampSignerThumbprint'
)

function Assert-LauncherExactFields {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string[]]$Expected,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if ($null -eq $Object -or $Object -isnot [System.Management.Automation.PSCustomObject]) {
        throw "$Description must be a JSON object."
    }
    $actual = @($Object.PSObject.Properties | ForEach-Object { $_.Name })
    if ($actual.Count -ne $Expected.Count -or
        @($actual | Where-Object { $_ -cnotin $Expected }).Count -gt 0 -or
        @($Expected | Where-Object { $_ -cnotin $actual }).Count -gt 0) {
        throw "$Description has an unexpected field set."
    }
}

function Assert-LauncherBuildFlags {
    param([Parameter(Mandatory = $true)]$Flags)

    $actual = @($Flags | ForEach-Object { [string]$_ })
    if ($actual.Count -ne $script:LauncherBuildFlags.Count) {
        throw 'Launcher build flags do not match the pinned build contract.'
    }
    for ($index = 0; $index -lt $actual.Count; $index++) {
        if ($actual[$index] -cne $script:LauncherBuildFlags[$index]) {
            throw 'Launcher build flags do not match the pinned build contract.'
        }
    }
    return ,$actual
}

function Assert-LauncherVersionTag {
    param(
        [Parameter(Mandatory = $true)][string]$Version,
        [Parameter(Mandatory = $true)][string]$Tag
    )

    if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
        throw 'Launcher version must be X.Y.Z.'
    }
    $allowed = @("v$Version", "launcher-v$Version", "launcher-beta-v$Version")
    if ($Tag -cnotin $allowed) {
        throw 'Launcher tag does not match its version.'
    }
}

function Assert-LauncherCandidateManifest {
    param([Parameter(Mandatory = $true)]$Manifest)

    Assert-LauncherExactFields -Object $Manifest -Expected $script:LauncherCandidateFields -Description 'Candidate manifest'
    if ($Manifest.schema -isnot [ValueType] -or $Manifest.schema -is [bool] -or $Manifest.schema -ne 2 -or $Manifest.component -cne 'launcher.exe') {
        throw 'Candidate manifest schema or component is invalid.'
    }
    $version = [string]$Manifest.version
    $tag = [string]$Manifest.tag
    Assert-LauncherVersionTag -Version $version -Tag $tag

    $commitSha = ([string]$Manifest.commitSha).ToLowerInvariant()
    if ($commitSha -notmatch '^[0-9a-f]{40}$') { throw 'Candidate commit SHA is invalid.' }
    $sourceRunId = [int64]0
    if (-not [int64]::TryParse([string]$Manifest.sourceRunId, [ref]$sourceRunId) -or $sourceRunId -le 0) {
        throw 'Candidate source run ID is invalid.'
    }
    $sourceWorkflow = [string]$Manifest.sourceWorkflow
    if ($sourceWorkflow -cnotin @('.github/workflows/release.yml', '.github/workflows/build-launcher.yml')) {
        throw 'Candidate source workflow is not allowed.'
    }
    $sourceEvent = [string]$Manifest.sourceEvent
    $sourceRef = [string]$Manifest.sourceRef
    if ($sourceWorkflow -ceq '.github/workflows/release.yml') {
        if ($sourceEvent -cne 'push' -or $sourceRef -cne "refs/tags/$tag") {
            throw 'Release candidate event or ref does not match its workflow and tag.'
        }
    } elseif (($sourceEvent -ceq 'push' -and $sourceRef -cne "refs/tags/$tag") -or
              ($sourceEvent -ceq 'workflow_dispatch' -and $sourceRef -cne 'refs/heads/main') -or
              $sourceEvent -cnotin @('push', 'workflow_dispatch')) {
        throw 'Launcher candidate event or ref does not match its workflow and tag.'
    }
    $bytes = [int64]0
    if (-not [int64]::TryParse([string]$Manifest.bytes, [ref]$bytes) -or $bytes -le 0) {
        throw 'Candidate byte count is invalid.'
    }
    $sha256 = ([string]$Manifest.sha256).ToLowerInvariant()
    if ($sha256 -notmatch '^[0-9a-f]{64}$') { throw 'Candidate SHA-256 is invalid.' }

    $flags = Assert-LauncherBuildFlags -Flags $Manifest.buildFlags
    if ([string]$Manifest.toolchain -cne 'go1.24.10' -or
        [string]$Manifest.target -cne 'windows/amd64' -or
        $Manifest.cgoEnabled -ne $false -or
        [string]$Manifest.moduleMode -cne '-mod=readonly') {
        throw 'Candidate build provenance does not match the pinned toolchain contract.'
    }

    return [pscustomobject][ordered]@{
        schema = 2
        component = 'launcher.exe'
        version = $version
        tag = $tag
        commitSha = $commitSha
        sourceRunId = $sourceRunId
        sourceWorkflow = $sourceWorkflow
        sourceEvent = $sourceEvent
        sourceRef = $sourceRef
        bytes = $bytes
        sha256 = $sha256
        toolchain = 'go1.24.10'
        target = 'windows/amd64'
        cgoEnabled = $false
        moduleMode = '-mod=readonly'
        buildFlags = $flags
    }
}

function Assert-LauncherSourceRunReceipt {
    param(
        [Parameter(Mandatory = $true)]$Receipt,
        [Parameter(Mandatory = $true)]$Candidate
    )

    Assert-LauncherExactFields -Object $Receipt -Expected $script:LauncherReceiptFields -Description 'Source-run provenance receipt'
    $runId = [int64]0
    if ($Receipt.schema -isnot [ValueType] -or $Receipt.schema -is [bool] -or $Receipt.schema -ne 1 -or
        [string]$Receipt.repository -cne 'Loggableim/ltth.app' -or
        -not [int64]::TryParse([string]$Receipt.runId, [ref]$runId) -or $runId -le 0 -or
        $runId -ne $Candidate.sourceRunId -or
        [string]$Receipt.workflow -cne $Candidate.sourceWorkflow -or
        [string]$Receipt.event -cne $Candidate.sourceEvent -or
        [string]$Receipt.ref -cne $Candidate.sourceRef -or
        ([string]$Receipt.commitSha).ToLowerInvariant() -cne $Candidate.commitSha) {
        throw 'Source-run provenance receipt does not match the launcher candidate.'
    }
    return $Receipt
}

function Assert-LauncherReleaseManifest {
    param([Parameter(Mandatory = $true)]$Manifest)

    Assert-LauncherExactFields -Object $Manifest -Expected $script:LauncherReleaseFields -Description 'Launcher release manifest'
    if ($Manifest.schema -isnot [ValueType] -or $Manifest.schema -is [bool] -or $Manifest.schema -ne 1 -or $Manifest.component -cne 'launcher.exe') {
        throw 'Launcher release manifest schema or component is invalid.'
    }
    $version = [string]$Manifest.version
    $tag = [string]$Manifest.tag
    Assert-LauncherVersionTag -Version $version -Tag $tag
    $commitSha = ([string]$Manifest.commitSha).ToLowerInvariant()
    if ($commitSha -notmatch '^[0-9a-f]{40}$') { throw 'Launcher release commit SHA is invalid.' }
    $bytes = [int64]0
    if (-not [int64]::TryParse([string]$Manifest.bytes, [ref]$bytes) -or $bytes -le 0) {
        throw 'Launcher release byte count is invalid.'
    }
    $sha256 = ([string]$Manifest.sha256).ToLowerInvariant()
    if ($sha256 -notmatch '^[0-9a-f]{64}$') { throw 'Launcher release SHA-256 is invalid.' }
    return [pscustomobject][ordered]@{
        schema = 1
        component = 'launcher.exe'
        version = $version
        tag = $tag
        commitSha = $commitSha
        bytes = $bytes
        sha256 = $sha256
    }
}

function Get-LauncherFileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required handoff file is missing: $Path" }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-LauncherOrdinalNameSetEqual {
    param(
        [Parameter(Mandatory = $true)][string[]]$Actual,
        [Parameter(Mandatory = $true)][string[]]$Expected
    )

    if ($Actual.Count -ne $Expected.Count) { return $false }
    foreach ($expectedName in $Expected) {
        $found = $false
        foreach ($actualName in $Actual) {
            if ([string]::Equals($actualName, $expectedName, [System.StringComparison]::Ordinal)) {
                $found = $true
                break
            }
        }
        if (-not $found) { return $false }
    }
    return $true
}

function Invoke-LauncherSourceRebuild {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$ExpectedCommitSha,
        [Parameter(Mandatory = $true)][string]$ExpectedTag,
        [Parameter(Mandatory = $true)][string]$GoExecutable,
        [Parameter(Mandatory = $true)][string]$OutputPath,
        [string]$GitExecutable = 'git'
    )

    $sourceRoot = (Resolve-Path -LiteralPath $SourceRoot).Path
    $buildRoot = Join-Path $sourceRoot 'build-src'
    if (-not (Test-Path -LiteralPath (Join-Path $buildRoot 'go.mod') -PathType Leaf)) {
        throw 'Source checkout does not contain build-src/go.mod.'
    }

    $head = (& $GitExecutable -C $sourceRoot rev-parse HEAD 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $head -cne $ExpectedCommitSha) {
        throw 'Source checkout HEAD does not match candidate commit.'
    }
    $tagCommit = (& $GitExecutable -C $sourceRoot rev-parse "refs/tags/$ExpectedTag^{commit}" 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $tagCommit -cne $ExpectedCommitSha) {
        throw 'Release tag does not point to the candidate source commit.'
    }
    $dirtySource = & $GitExecutable -C $sourceRoot status --porcelain --untracked-files=all 2>&1
    if ($LASTEXITCODE -ne 0 -or @($dirtySource).Count -gt 0) {
        throw 'Source checkout must be clean for the release rebuild.'
    }

    $goVersion = (& $GoExecutable version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $goVersion -cne 'go version go1.24.10 windows/amd64') {
        throw "Expected exact Go 1.24.10 windows/amd64 for source rebuild; received: $goVersion"
    }

    $oldGoos = $env:GOOS
    $oldGoarch = $env:GOARCH
    $oldCgo = $env:CGO_ENABLED
    $oldGoFlags = $env:GOFLAGS
    try {
        $env:GOOS = 'windows'
        $env:GOARCH = 'amd64'
        $env:CGO_ENABLED = '0'
        $env:GOFLAGS = '-mod=readonly'
        Push-Location $buildRoot
        try {
            $arguments = @('build') + $script:LauncherBuildFlags + @('-o', $OutputPath, '.')
            $buildOutput = & $GoExecutable @arguments 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "Source rebuild failed: $($buildOutput | Out-String)"
            }
        } finally {
            Pop-Location
        }
    } finally {
        $env:GOOS = $oldGoos
        $env:GOARCH = $oldGoarch
        $env:CGO_ENABLED = $oldCgo
        $env:GOFLAGS = $oldGoFlags
    }
    if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) {
        throw 'Source rebuild did not produce the expected launcher file.'
    }
}

function Test-LauncherReleaseHandoff {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$CandidateDirectory,
        [Parameter(Mandatory = $true)][string]$SignedDirectory,
        [Parameter(Mandatory = $true)][string]$ExpectedCommitSha,
        [Parameter(Mandatory = $true)][string]$ExpectedTag,
        [Parameter(Mandatory = $true)][string]$ExpectedSourceRunId,
        [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedSignerThumbprint,
        [Parameter(Mandatory = $true)][string]$GoExecutable,
        [Parameter(Mandatory = $true)][string]$OutputDirectory,
        [string]$GitExecutable = 'git',
        [scriptblock]$SignatureProvider
    )

    $expectedCommitSha = $ExpectedCommitSha.ToLowerInvariant()
    if ($expectedCommitSha -notmatch '^[0-9a-f]{40}$') { throw 'Expected source commit SHA is invalid.' }
    $expectedSigner = $ExpectedSignerThumbprint.ToLowerInvariant()
    $expectedRunId = [int64]0
    if (-not [int64]::TryParse($ExpectedSourceRunId, [ref]$expectedRunId) -or $expectedRunId -le 0) {
        throw 'Expected source workflow run ID is invalid.'
    }

    foreach ($directory in @($CandidateDirectory, $SignedDirectory)) {
        if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw "Handoff directory is missing: $directory" }
    }
    $candidateFiles = @(Get-ChildItem -LiteralPath $CandidateDirectory -File | ForEach-Object { $_.Name })
    $expectedCandidateFiles = @('launcher-candidate.json', 'launcher.exe')
    if (-not (Test-LauncherOrdinalNameSetEqual -Actual $candidateFiles -Expected $expectedCandidateFiles)) {
        throw 'CI candidate artifact must contain exactly launcher.exe and launcher-candidate.json.'
    }
    $signedFiles = @(Get-ChildItem -LiteralPath $SignedDirectory -File | ForEach-Object { $_.Name })
    $baseSignedFiles = @('launcher-build-provenance.json', 'launcher-candidate.json', 'launcher-release.json', 'launcher-source-run-receipt.json', 'launcher.exe')
    $stagedHandoffFiles = @($baseSignedFiles + 'launcher-handoff.json')
    $matchesBaseSignedFiles = Test-LauncherOrdinalNameSetEqual -Actual $signedFiles -Expected $baseSignedFiles
    $matchesStagedHandoffFiles = Test-LauncherOrdinalNameSetEqual -Actual $signedFiles -Expected $stagedHandoffFiles
    if (-not $matchesBaseSignedFiles -and -not $matchesStagedHandoffFiles) {
        throw 'Signed handoff must contain exactly its declared files and optional handoff receipt.'
    }
    if (@(Get-ChildItem -LiteralPath $CandidateDirectory -Directory).Count -gt 0 -or
        @(Get-ChildItem -LiteralPath $SignedDirectory -Directory).Count -gt 0) {
        throw 'Nested handoff directories are not allowed.'
    }

    $candidateManifestPath = Join-Path $CandidateDirectory 'launcher-candidate.json'
    $candidate = Assert-LauncherCandidateManifest -Manifest (Get-Content -LiteralPath $candidateManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json)
    if ($candidate.commitSha -cne $expectedCommitSha -or $candidate.tag -cne $ExpectedTag -or
        $candidate.sourceRunId -ne $expectedRunId) {
        throw 'CI candidate commit, tag or source run does not match the requested handoff.'
    }
    $sourceReceiptPath = Join-Path $SignedDirectory 'launcher-source-run-receipt.json'
    $sourceReceipt = Get-Content -LiteralPath $sourceReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-LauncherSourceRunReceipt -Receipt $sourceReceipt -Candidate $candidate | Out-Null
    $signedCandidateManifestPath = Join-Path $SignedDirectory 'launcher-candidate.json'
    if ((Get-LauncherFileSha256 $candidateManifestPath) -cne (Get-LauncherFileSha256 $signedCandidateManifestPath)) {
        throw 'Signed handoff candidate manifest differs from the CI candidate manifest.'
    }
    $candidatePath = Join-Path $CandidateDirectory 'launcher.exe'
    if ((Get-Item -LiteralPath $candidatePath).Length -ne $candidate.bytes -or
        (Get-LauncherFileSha256 $candidatePath) -cne $candidate.sha256) {
        throw 'CI candidate bytes do not match the candidate manifest.'
    }

    $signedPath = Join-Path $SignedDirectory 'launcher.exe'
    $releaseManifestPath = Join-Path $SignedDirectory 'launcher-release.json'
    $provenancePath = Join-Path $SignedDirectory 'launcher-build-provenance.json'
    $release = Assert-LauncherReleaseManifest -Manifest (Get-Content -LiteralPath $releaseManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json)
    $provenance = Get-Content -LiteralPath $provenancePath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-LauncherExactFields -Object $provenance -Expected $script:LauncherProvenanceFields -Description 'Launcher build provenance'
    $provenanceFlags = Assert-LauncherBuildFlags -Flags $provenance.buildFlags

    $signedInfo = Get-Item -LiteralPath $signedPath
    $signedHash = Get-LauncherFileSha256 $signedPath
    $candidateManifestHash = Get-LauncherFileSha256 $candidateManifestPath
    $releaseValuesMatch = $release.version -ceq $candidate.version -and
        $release.tag -ceq $candidate.tag -and
        $release.commitSha -ceq $candidate.commitSha -and
        $release.bytes -eq $signedInfo.Length -and $release.sha256 -ceq $signedHash
    $provenanceValuesMatch = $provenance.schema -is [ValueType] -and $provenance.schema -isnot [bool] -and $provenance.schema -eq 2 -and
        $provenance.component -ceq 'launcher.exe' -and
        [int64]$provenance.sourceRunId -eq $candidate.sourceRunId -and
        [string]$provenance.sourceWorkflow -ceq $candidate.sourceWorkflow -and
        [string]$provenance.sourceEvent -ceq $candidate.sourceEvent -and
        [string]$provenance.sourceRef -ceq $candidate.sourceRef -and
        ([string]$provenance.sourceCommitSha).ToLowerInvariant() -ceq $candidate.commitSha -and
        [string]$provenance.version -ceq $candidate.version -and
        [string]$provenance.tag -ceq $candidate.tag -and
        [string]$provenance.toolchain -ceq $candidate.toolchain -and
        [string]$provenance.target -ceq $candidate.target -and
        $provenance.cgoEnabled -eq $candidate.cgoEnabled -and
        [string]$provenance.moduleMode -ceq $candidate.moduleMode -and
        (($provenanceFlags -join [char]0) -ceq ($candidate.buildFlags -join [char]0)) -and
        [int64]$provenance.candidateBytes -eq $candidate.bytes -and
        ([string]$provenance.candidateSha256).ToLowerInvariant() -ceq $candidate.sha256 -and
        ([string]$provenance.candidateManifestSha256).ToLowerInvariant() -ceq $candidateManifestHash -and
        [int64]$provenance.signedBytes -eq $signedInfo.Length -and
        ([string]$provenance.signedSha256).ToLowerInvariant() -ceq $signedHash -and
        ([string]$provenance.expectedSignerThumbprint).ToLowerInvariant() -ceq $expectedSigner -and
        ([string]$provenance.signerThumbprint).ToLowerInvariant() -ceq $expectedSigner
    if (-not $releaseValuesMatch -or -not $provenanceValuesMatch) {
        throw 'Signed manifest or provenance does not match the CI candidate and signed bytes.'
    }
    $receiptPath = Join-Path $SignedDirectory 'launcher-handoff.json'
    if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
        $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
        Assert-LauncherExactFields -Object $receipt -Expected $script:LauncherHandoffReceiptFields -Description 'Launcher handoff receipt'
        if ($receipt.schema -isnot [ValueType] -or $receipt.schema -is [bool] -or $receipt.schema -ne 2 -or
            [int64]$receipt.sourceRunId -ne $candidate.sourceRunId -or
            [string]$receipt.sourceWorkflow -cne $candidate.sourceWorkflow -or
            [string]$receipt.sourceEvent -cne $candidate.sourceEvent -or
            [string]$receipt.sourceRef -cne $candidate.sourceRef -or
            ([string]$receipt.sourceCommitSha).ToLowerInvariant() -cne $candidate.commitSha -or
            [string]$receipt.version -cne $candidate.version -or
            [string]$receipt.tag -cne $candidate.tag -or
            ([string]$receipt.candidateSha256).ToLowerInvariant() -cne $candidate.sha256 -or
            ([string]$receipt.signedSha256).ToLowerInvariant() -cne $signedHash -or
            ([string]$receipt.expectedSignerThumbprint).ToLowerInvariant() -cne $expectedSigner -or
            ([string]$receipt.timestampSignerThumbprint).ToLowerInvariant() -cne ([string]$provenance.timestampSignerThumbprint).ToLowerInvariant()) {
            throw 'Launcher handoff receipt does not match the candidate and signed release.'
        }
    }

    $signature = if ($SignatureProvider) {
        & $SignatureProvider $signedPath
    } else {
        Get-AuthenticodeSignature -LiteralPath $signedPath
    }
    $timestampProperty = $signature.PSObject.Properties['TimeStamperCertificate']
    if ($signature.Status -ne 'Valid' -or
        ([string]$signature.SignerCertificate.Thumbprint).ToLowerInvariant() -cne $expectedSigner -or
        $null -eq $timestampProperty -or $null -eq $timestampProperty.Value -or
        ([string]$timestampProperty.Value.Thumbprint).ToLowerInvariant() -cne ([string]$provenance.timestampSignerThumbprint).ToLowerInvariant()) {
        throw 'Signed launcher requires valid Authenticode, expected signer and a timestamp certificate.'
    }

    $rebuiltPath = Join-Path ([System.IO.Path]::GetTempPath()) ('.launcher-rebuild-' + [guid]::NewGuid().ToString('N') + '.exe')
    try {
        Invoke-LauncherSourceRebuild -SourceRoot $SourceRoot -ExpectedCommitSha $candidate.commitSha `
            -ExpectedTag $candidate.tag -GoExecutable $GoExecutable -OutputPath $rebuiltPath -GitExecutable $GitExecutable
        $rebuiltHash = Get-LauncherFileSha256 $rebuiltPath
        if ((Get-Item -LiteralPath $rebuiltPath).Length -ne $candidate.bytes -or $rebuiltHash -cne $candidate.sha256) {
            throw 'Source rebuild does not match the CI candidate hash and size.'
        }

        $outputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
        if (Test-Path -LiteralPath $outputDirectory) { throw 'Handoff output directory already exists.' }
        $outputParent = Split-Path -Parent $outputDirectory
        if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) {
            throw 'Handoff output parent directory must already exist.'
        }
        $temporaryDirectory = Join-Path $outputParent ('.launcher-handoff-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
        try {
            Copy-Item -LiteralPath $signedPath -Destination (Join-Path $temporaryDirectory 'launcher.exe')
            Copy-Item -LiteralPath $releaseManifestPath -Destination (Join-Path $temporaryDirectory 'launcher-release.json')
            Copy-Item -LiteralPath $provenancePath -Destination (Join-Path $temporaryDirectory 'launcher-build-provenance.json')
            Copy-Item -LiteralPath $signedCandidateManifestPath -Destination (Join-Path $temporaryDirectory 'launcher-candidate.json')
            Copy-Item -LiteralPath $sourceReceiptPath -Destination (Join-Path $temporaryDirectory 'launcher-source-run-receipt.json')
            if ((Get-LauncherFileSha256 (Join-Path $temporaryDirectory 'launcher.exe')) -cne $signedHash -or
                (Get-Item -LiteralPath (Join-Path $temporaryDirectory 'launcher.exe')).Length -ne $signedInfo.Length) {
                throw 'Staged launcher copy differs from the validated signed candidate.'
            }
            $handoffReceipt = [ordered]@{
                schema = 2
                sourceRunId = $candidate.sourceRunId
                sourceWorkflow = $candidate.sourceWorkflow
                sourceEvent = $candidate.sourceEvent
                sourceRef = $candidate.sourceRef
                sourceCommitSha = $candidate.commitSha
                version = $candidate.version
                tag = $candidate.tag
                candidateSha256 = $candidate.sha256
                signedSha256 = $signedHash
                expectedSignerThumbprint = $expectedSigner
                timestampSignerThumbprint = ([string]$timestampProperty.Value.Thumbprint).ToLowerInvariant()
            }
            [System.IO.File]::WriteAllText(
                (Join-Path $temporaryDirectory 'launcher-handoff.json'),
                (($handoffReceipt | ConvertTo-Json) + [Environment]::NewLine),
                (New-Object System.Text.UTF8Encoding($false))
            )
            Move-Item -LiteralPath $temporaryDirectory -Destination $outputDirectory
        } finally {
            if (Test-Path -LiteralPath $temporaryDirectory) {
                Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
            }
        }
    } finally {
        Remove-Item -LiteralPath $rebuiltPath -Force -ErrorAction SilentlyContinue
    }

    return [pscustomobject]@{
        sourceRunId = $candidate.sourceRunId
        sourceWorkflow = $candidate.sourceWorkflow
        sourceEvent = $candidate.sourceEvent
        sourceRef = $candidate.sourceRef
        sourceCommitSha = $candidate.commitSha
        tag = $candidate.tag
        candidateSha256 = $candidate.sha256
        signedSha256 = $signedHash
        signerThumbprint = $expectedSigner
        outputDirectory = $outputDirectory
    }
}

Export-ModuleMember -Function Assert-LauncherCandidateManifest, Assert-LauncherReleaseManifest, Assert-LauncherSourceRunReceipt, Assert-LauncherVersionTag, Get-LauncherFileSha256, Invoke-LauncherSourceRebuild, Test-LauncherReleaseHandoff
