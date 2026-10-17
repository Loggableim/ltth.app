$ErrorActionPreference = 'Stop'

$installerPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'install.ps1'
$policyPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'app/config/plugin-release-policy.json'
$canonicalPolicy = [System.IO.File]::ReadAllText($policyPath)
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($installerPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw ($parseErrors | ForEach-Object Message | Out-String) }
$wanted = @('Read-AppBundleZipJson', 'Assert-PublicAppBundleArchive')
$definitions = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $wanted -contains $node.Name }, $true)
foreach ($definition in $definitions) { Invoke-Expression $definition.Extent.Text }
if ($definitions.Count -ne $wanted.Count) { throw 'Required validator functions were not found.' }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('ltth-env-guard-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null

function Write-FixtureZip {
    param([string]$Path, [string]$ExtraName = '', [string]$ExtraValue = '')

    $archive = [System.IO.Compression.ZipFile]::Open($Path, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $members = [ordered]@{
            'ltth_9.8.7/app/config/distribution-mode.json' = '{"channel":"public"}'
            'ltth_9.8.7/app/config/plugin-release-policy.json' = $canonicalPolicy
            'ltth_9.8.7/app/package.json' = '{"version":"9.8.7"}'
            'ltth_9.8.7/app/launch.js' = '// synthetic harmless fixture'
            'ltth_9.8.7/app/config/readme.txt' = 'synthetic harmless config'
        }
        if ($ExtraName) { $members[$ExtraName] = $ExtraValue }
        foreach ($member in $members.GetEnumerator()) {
            $entry = $archive.CreateEntry($member.Key)
            $stream = $entry.Open()
            try {
                $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes([string]$member.Value)
                $stream.Write($bytes, 0, $bytes.Length)
            } finally {
                $stream.Dispose()
            }
        }
    } finally {
        $archive.Dispose()
    }
}

function Assert-Rejected {
    param([string]$MemberName, [string]$MemberValue = 'SYNTHETIC_ONLY=1', [string]$ExpectedError = 'nicht erlaubte .env-Datei')

    $zipPath = Join-Path $fixtureRoot ('deny-' + [guid]::NewGuid().ToString('N') + '.zip')
    Write-FixtureZip -Path $zipPath -ExtraName $MemberName -ExtraValue $MemberValue
    try {
        $null = Assert-PublicAppBundleArchive -ArchivePath $zipPath -ExpectedVersion '9.8.7'
        throw "Expected archive member to be rejected: $MemberName"
    } catch {
        if ($_.Exception.Message -like 'Expected archive member to be rejected:*' -or $_.Exception.Message -notlike "*$ExpectedError*") { throw }
    } finally {
        Remove-Item -LiteralPath $zipPath -Force
    }
}

try {
    $deniedMembers = @(
        'ltth_9.8.7/app/.env',
        'ltth_9.8.7/app/.ENV',
        'ltth_9.8.7/app/.env.local',
        'ltth_9.8.7/app/config/.env.production',
        'ltth_9.8.7/app/config/.env.example',
        'ltth_9.8.7/app/.env.',
        'ltth_9.8.7/app/.env '
    )
    foreach ($memberName in $deniedMembers) { Assert-Rejected -MemberName $memberName }

    $parsedPolicy = $canonicalPolicy | ConvertFrom-Json
    foreach ($id in @($parsedPolicy.closedBeta) + @($parsedPolicy.publicRuntimeExcluded) + @($parsedPolicy.aliases.PSObject.Properties.Name)) {
        Assert-Rejected -MemberName "ltth_9.8.7/app/plugins/$id/main.js" -ExpectedError 'geschlossenen Plugin-Ordner'
        Assert-Rejected -MemberName 'ltth_9.8.7/app/plugins/renamed/plugin.json' -MemberValue ('{"id":"' + $id + '"}') -ExpectedError 'geschlossenes Plugin-Manifest'
    }
    foreach ($asset in $parsedPolicy.publicAssetPathOwners.PSObject.Properties) {
        Assert-Rejected -MemberName ('ltth_9.8.7/app/public' + $asset.Name) -ExpectedError 'geschlossenes Public-Asset'
    }
    foreach ($schemaValue in @('"1"', '1.5', 'true', '2')) {
        $invalidPolicy = $canonicalPolicy -replace '"schemaVersion"\s*:\s*1', ('"schemaVersion":' + $schemaValue)
        Assert-Rejected -MemberName 'ltth_9.8.7/app/config/plugin-release-policy.json' -MemberValue $invalidPolicy -ExpectedError 'Plugin-Release-Policy ist ungueltig'
    }

    foreach ($retiredPath in @(
        'ltth_9.8.7/app/plugins/chatango/main.js',
        'ltth_9.8.7/app/plugins/CHATANGO/nested/main.js',
        'ltth_9.8.7/app/plugins/Ｃｈａｔａｎｇｏ/main.js',
        'ltth_9.8.7/app/plugins/%63hatango/main.js',
        'ltth_9.8.7/app/plugins/%2563hatango/main.js'
    )) {
        Assert-Rejected -MemberName $retiredPath -ExpectedError 'geschlossenen Plugin-Ordner'
    }
    Assert-Rejected -MemberName 'ltth_9.8.7/app/plugins/renamed/plugin.json' -MemberValue '{"id":"chatango"}' -ExpectedError 'geschlossenes Plugin-Manifest'
    Assert-Rejected -MemberName 'ltth_9.8.7/app/plugins/renamed/plugin.json' -MemberValue '{"id":"community-chat","replaces":["chatango"]}' -ExpectedError 'geschlossenes Plugin-Manifest'
    foreach ($adapterPath in @('ltth_9.8.7/app/public/js/chatango-theme-adapter.js', 'ltth_9.8.7/app/PUBLIC/JS/CHATANGO-THEME-ADAPTER.JS')) {
        Assert-Rejected -MemberName $adapterPath -ExpectedError 'entfernten Chatango-Theme-Adapter'
    }
    $harmlessPath = Join-Path $fixtureRoot 'allow-unrelated.zip'
    Write-FixtureZip -Path $harmlessPath -ExtraName 'ltth_9.8.7/app/plugins/community-chat/plugin.json' -ExtraValue '{"id":"community-chat"}'
    if (-not (Assert-PublicAppBundleArchive -ArchivePath $harmlessPath -ExpectedVersion '9.8.7')) { throw 'Unrelated plugin should remain allowed.' }
    $harmlessAssetPath = Join-Path $fixtureRoot 'allow-unrelated-asset.zip'
    Write-FixtureZip -Path $harmlessAssetPath -ExtraName 'ltth_9.8.7/app/public/js/chatango-theme-adapter-copy.js' -ExtraValue '// harmless synthetic different asset'
    if (-not (Assert-PublicAppBundleArchive -ArchivePath $harmlessAssetPath -ExpectedVersion '9.8.7')) { throw 'Different asset path should remain allowed.' }

    $allowPath = Join-Path $fixtureRoot 'allow-template.zip'
    Write-FixtureZip -Path $allowPath -ExtraName 'ltth_9.8.7/app/.env.example' -ExtraValue "API_KEY=__SYNTHETIC_PLACEHOLDER__`n"
    $beforeHash = (Get-FileHash -LiteralPath $allowPath -Algorithm SHA256).Hash
    if (-not (Assert-PublicAppBundleArchive -ArchivePath $allowPath -ExpectedVersion '9.8.7')) {
        throw 'Canonical versioned app/.env.example should be accepted.'
    }
    $afterHash = (Get-FileHash -LiteralPath $allowPath -Algorithm SHA256).Hash
    if ($beforeHash -ne $afterHash) { throw 'Validator unexpectedly modified the synthetic archive.' }

    $readArchive = [System.IO.Compression.ZipFile]::OpenRead($allowPath)
    try {
        $names = @($readArchive.Entries | ForEach-Object { $_.FullName })
        if ($names -notcontains 'ltth_9.8.7/app/config/readme.txt' -or
            $names -notcontains 'ltth_9.8.7/app/launch.js' -or
            $names -notcontains 'ltth_9.8.7/app/.env.example') {
            throw 'Harmless app entries or the canonical template were not preserved.'
        }
    } finally {
        $readArchive.Dispose()
    }

    Write-Output 'PASS: 9 Chatango path/manifest/adapter deny cases and 2 unrelated allows; full canonical policy; 26 direct/renamed blocked IDs, 4 blocked assets, 4 invalid schema values; 7 synthetic .env deny cases; canonical versioned app/.env.example allowed; harmless entries and archive bytes preserved.'
} finally {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
}
