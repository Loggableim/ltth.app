const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const archiver = require('archiver');

const installerPath = path.join(__dirname, '..', '..', 'install', 'install.ps1');
const repoRoot = path.join(__dirname, '..', '..');

function windowsPowerShellEnvironment() {
  // These fixtures explicitly invoke Windows PowerShell 5.1. A parent pwsh 7
  // may supply its incompatible Utility module first in PSModulePath, hiding
  // the real built-in Get-FileHash. Isolate only the child module search path;
  // do not replace hash verification or mutate the test process environment.
  return {
    ...process.env,
    PSModulePath: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules')
  };
}

function hasWindowsPowerShell() {
  if (process.platform !== 'win32') return false;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], {
    encoding: 'utf8',
    env: windowsPowerShellEnvironment()
  });
  if (result.error) {
    throw new Error(`Could not probe Windows PowerShell (${result.error.code}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Windows PowerShell probe failed (status ${result.status}, signal ${result.signal || 'none'}): ${(result.stderr || result.stdout || '').slice(0, 4000)}`);
  }
  return result.status === 0;
}

function invokeInstallerFunctions(functionNames, body, { allowNonzero = false } = {}) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$tokens = $null',
    '$errors = $null',
    `$ast = [System.Management.Automation.Language.Parser]::ParseFile('${installerPath.replace(/'/g, "''")}', [ref]$tokens, [ref]$errors)`,
    'if ($errors.Count -gt 0) { throw ($errors | ForEach-Object Message | Out-String) }',
    `$wanted = @(${functionNames.map(name => `"${name}"`).join(', ')})`,
    '$definitions = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $wanted -contains $node.Name }, $true)',
    'foreach ($definition in $definitions) { Invoke-Expression $definition.Extent.Text }',
    body
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: windowsPowerShellEnvironment()
  });
  if (result.error) {
    throw new Error(`Windows PowerShell child could not start (${result.error.code}): ${result.error.message}`);
  }
  if (result.status !== 0 && !allowNonzero) {
    const stdout = (result.stdout || '').slice(0, 4000);
    const stderr = (result.stderr || '').slice(0, 4000);
    throw new Error(`Windows PowerShell child failed (status ${result.status}, signal ${result.signal || 'none'}).\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  return result;
}

function encodedJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function writeZip(filename, entries) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filename);
    const archive = archiver('zip', { zlib: { level: 0 } });
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
    archive.pipe(output);
    for (const [name, contents] of Object.entries(entries)) {
      archive.append(contents, { name });
    }
    archive.finalize().catch(reject);
  });
}

function appBundleFunctions() {
  return [
    'Use-OfficialWindowsZipBootstrap',
    'Get-AppBundleManifestUrl',
    'Get-AppBundleZipUrl',
    'Assert-ReleaseArtifactManifest',
    'Assert-AppBundleReleaseManifest',
    'Assert-ReleaseArtifactFile',
    'Read-AppBundleZipJson',
    'Assert-PublicAppBundleArchive',
    'Test-AppRootDirectory',
    'Test-AppDirectoryContainsPersistentData',
    'Assert-AppDirectorySafeForReplacement',
    'Find-AppRootDirectory',
    'Copy-DirectoryContents',
    'Install-AppBundleFromZip'
  ];
}

function downloadSourceFunctions() {
  return [
    'Use-OfficialWindowsZipBootstrap',
    'Test-AppRootDirectory',
    'Test-AppDirectoryContainsPersistentData',
    'Assert-AppDirectorySafeForReplacement',
    'Find-AppRootDirectory',
    'Copy-DirectoryContents',
    'Install-AppBundleFromZip',
    'Download-Source'
  ];
}

async function createAppBundleZip(filename, {
  version = '1.5.0',
  policy = JSON.parse(fs.readFileSync(path.join(repoRoot, 'app', 'config', 'plugin-release-policy.json'), 'utf8')),
  marker = { channel: 'public' },
  omitPolicy = false,
  omitMarker = false,
  pluginPath = 'plugins/goals/plugin.json',
  pluginManifest = { id: 'goals' }
} = {}) {
  const prefix = `ltth_${version}/app/`;
  const entries = {
    [`${prefix}package.json`]: JSON.stringify({ name: 'ltth-app', version }),
    [`${prefix}launch.js`]: "console.log('fixture');\n"
  };
  if (!omitMarker) entries[`${prefix}config/distribution-mode.json`] = JSON.stringify(marker);
  if (!omitPolicy) entries[`${prefix}config/plugin-release-policy.json`] = JSON.stringify(policy);
  if (pluginPath) entries[`${prefix}${pluginPath}`] = JSON.stringify(pluginManifest);
  await writeZip(filename, entries);
  return fs.readFileSync(filename);
}

function runInstallAppBundle({
  tempDir,
  zipPath,
  remoteManifest,
  remoteManifestRaw,
  manifestUnavailable = false,
  expectedVersion = '1.5.0'
}) {
  const escapedTempDir = tempDir.replace(/'/g, "''");
  const escapedZipPath = zipPath.replace(/'/g, "''");
  const body = [
    `$LTTHDir = '${escapedTempDir}'`,
    "$LTTHRepoOwner = 'Loggableim'",
    "$LTTHRepoName = 'ltth.app'",
    "$LTTHRepoBranch = 'main'",
    "$script:LTTHInstallMode = 'latest'",
    `$script:LTTHVersion = '${expectedVersion}'`,
    `$script:ManifestBase64 = '${Buffer.from(remoteManifestRaw === undefined ? JSON.stringify(remoteManifest || {}) : remoteManifestRaw, 'utf8').toString('base64')}'`,
    `$script:ManifestUnavailable = $${manifestUnavailable ? 'true' : 'false'}`,
    '$script:ManifestUrl = $null',
    '$script:ZipUrl = $null',
    '$script:DownloadCalled = $false',
    '$script:ExpandCalled = $false',
    'function Log { param($Message) }',
    'function Ok { param($Message) }',
    'function Warn { param($Message) }',
    'function Invoke-RestMethod { [CmdletBinding()] param([string]$Uri, [int]$TimeoutSec); $script:ManifestUrl = $Uri; if ($script:ManifestUnavailable) { throw "sidecar unavailable" }; $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($script:ManifestBase64)); return (ConvertFrom-Json -InputObject $json -ErrorAction Stop) }',
    `function Invoke-DownloadFileWithProgress { [CmdletBinding()] param([string]$Uri, [string]$OutFile, [string]$Activity); $script:DownloadCalled = $true; $script:ZipUrl = $Uri; Copy-Item -LiteralPath '${escapedZipPath}' -Destination $OutFile -Force }`,
    'function Expand-Archive { [CmdletBinding()] param([string]$LiteralPath, [string]$DestinationPath, [switch]$Force); $script:ExpandCalled = $true; New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null; [System.IO.Compression.ZipFile]::ExtractToDirectory($LiteralPath, $DestinationPath) }',
    '$success = $false',
    '$errorText = $null',
    'try { $null = Install-AppBundleFromZip; $success = $true } catch { $errorText = $_.Exception.Message }',
    '$appDir = Join-Path $LTTHDir "app"',
    '$packagePath = Join-Path $appDir "package.json"',
    '[pscustomobject]@{ success = $success; error = $errorText; manifestUrl = $script:ManifestUrl; zipUrl = $script:ZipUrl; downloadCalled = $script:DownloadCalled; expandCalled = $script:ExpandCalled; installed = Test-Path -LiteralPath $packagePath; packageVersion = if (Test-Path -LiteralPath $packagePath) { (Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).version } else { $null } } | ConvertTo-Json -Compress'
  ].join('; ');
  return invokeInstallerFunctions(appBundleFunctions(), body);
}

function runDownloadSource({ tempDir, markerPaths, deferProtection = false }) {
  const escapedTempDir = tempDir.replace(/'/g, "''");
  const markerPathsBase64 = encodedJson(markerPaths);
  const body = [
    `$LTTHDir = '${escapedTempDir}'`,
    '$script:LTTHDir = $LTTHDir',
    "$LTTHRepoOwner = 'Loggableim'",
    "$LTTHRepoName = 'ltth.app'",
    "$LTTHRepoBranch = 'main'",
    "$script:LTTHInstallMode = 'latest'",
    "$script:LTTHVersion = 'latest'",
    `$script:MarkerPathsBase64 = '${markerPathsBase64}'`,
    '$script:manifestCalls = 0',
    '$script:downloadCalls = 0',
    '$script:expandCalls = 0',
    '$script:gitFallbackCalls = 0',
    '$script:gitReplacementCalls = 0',
    '$script:guardCheckCount = 0',
    'function Log { param($Message) }',
    'function Ok { param($Message) }',
    'function Warn { param($Message) }',
    'function Invoke-RestMethod { $script:manifestCalls++; throw "fixture network blocked" }',
    'function Invoke-DownloadFileWithProgress { $script:downloadCalls++; throw "fixture download blocked" }',
    'function Expand-Archive { $script:expandCalls++; throw "fixture extraction blocked" }',
    'function Ensure-Git { $script:gitFallbackCalls++; throw "fixture fallback blocked" }',
    'function Resolve-Version { $script:gitFallbackCalls++; throw "fixture fallback blocked" }',
    'function Invoke-GitClone { $script:gitReplacementCalls++; throw "fixture Git replacement blocked" }',
    'function Invoke-Git { $script:gitReplacementCalls++; throw "fixture Git replacement blocked" }',
    'function Repair-LauncherFile { }',
    'function Restore-RepositoryFromFreshClone { $script:gitReplacementCalls++; throw "fixture Git replacement blocked" }',
    ...(deferProtection ? ['function Test-AppDirectoryContainsPersistentData { $script:guardCheckCount++; return ($script:guardCheckCount -ge 2) }'] : []),
    '$appDir = Join-Path $LTTHDir "app"',
    '$markerPaths = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($script:MarkerPathsBase64)) | ConvertFrom-Json',
    '$before = @{}; foreach ($relativePath in $markerPaths) { $markerPath = Join-Path $appDir $relativePath; $before[$relativePath] = (Get-FileHash -LiteralPath $markerPath -Algorithm SHA256).Hash }',
    '$errorText = $null; try { Download-Source } catch { $errorText = $_.Exception.Message }',
    '$after = @{}; foreach ($relativePath in $markerPaths) { $markerPath = Join-Path $appDir $relativePath; $after[$relativePath] = if (Test-Path -LiteralPath $markerPath -PathType Leaf) { (Get-FileHash -LiteralPath $markerPath -Algorithm SHA256).Hash } else { $null } }',
    '[pscustomobject]@{ error = $errorText; guardCheckCount = $script:guardCheckCount; manifestCalls = $script:manifestCalls; downloadCalls = $script:downloadCalls; expandCalls = $script:expandCalls; gitFallbackCalls = $script:gitFallbackCalls; gitReplacementCalls = $script:gitReplacementCalls; markersUnchanged = ((ConvertTo-Json -Compress $before) -ceq (ConvertTo-Json -Compress $after)); appRootValid = (Test-AppRootDirectory -Path $appDir); backupCount = @(Get-ChildItem -LiteralPath $LTTHDir -Directory -Filter "app.bak-*" -ErrorAction SilentlyContinue).Count } | ConvertTo-Json -Compress'
  ].join('; ');
  return invokeInstallerFunctions(downloadSourceFunctions(), body);
}

function invokeManifestValidation(manifest, { allowNonzero = false } = {}) {
  return invokeInstallerFunctions(
    ['Assert-ReleaseArtifactManifest', 'Assert-LauncherReleaseManifest'],
    [
      `$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedJson(manifest)}'))`,
      '$manifest = $json | ConvertFrom-Json',
      'Assert-LauncherReleaseManifest -Manifest $manifest | ConvertTo-Json -Compress'
    ].join('; '),
    { allowNonzero }
  );
}

function releaseFunctions() {
  return [
    'Assert-ReleaseArtifactManifest',
    'Assert-ReleaseArtifactFile',
    'Use-OfficialLauncherRelease',
    'Get-LauncherReleaseManifestUrl',
    'Get-LauncherDownloadUrl',
    'Assert-LauncherReleaseManifest',
    'Assert-LauncherFile',
    'Test-VerifiedInstalledLauncher',
    'Move-FileAtomically',
    'Save-LauncherReleaseManifest',
    'Install-Launcher'
  ];
}

function runInstallLauncher({
  tempDir,
  remoteManifest,
  downloadSource,
  manifestFails = false,
  downloadFails = false
}) {
  const manifestScript = manifestFails
    ? 'function Invoke-RestMethod { throw "network unavailable" }'
    : [
      `'${
        encodedJson(remoteManifest)
      }'`,
      'function Invoke-RestMethod {',
      '  $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($args[0]))',
      '  return ($json | ConvertFrom-Json)',
      '}'
    ].join(' ');
  const escapedTempDir = tempDir.replace(/'/g, "''");
  const escapedSource = downloadSource.replace(/'/g, "''");
  const body = [
    `$LTTHDir = '${escapedTempDir}'`,
    "$LTTHRepoOwner = 'Loggableim'",
    "$LTTHRepoName = 'ltth.app'",
    "$LTTHRepoBranch = 'main'",
    "$script:LTTHInstallMode = 'latest'",
    "$script:LTTHVersion = 'latest'",
    "$LTTHQuiet = '1'",
    'function Log { param($msg) }',
    'function Ok { param($msg) }',
    'function Warn { param($msg) }',
    manifestFails
      ? manifestScript
      : `$script:RemoteManifestBase64 = '${encodedJson(remoteManifest)}'; function Invoke-RestMethod { $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($script:RemoteManifestBase64)); return ($json | ConvertFrom-Json) }`,
    downloadFails
      ? 'function Invoke-DownloadFileWithProgress { throw "launcher download unavailable" }'
      : `function Invoke-DownloadFileWithProgress { param($Uri, $OutFile, $Activity) Copy-Item -LiteralPath '${escapedSource}' -Destination $OutFile -Force }`,
    '$result = Install-Launcher',
    '[pscustomobject]@{ result = $result; installed = if (Test-Path (Join-Path $LTTHDir "launcher.exe")) { [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $LTTHDir "launcher.exe"))) } else { $null }; manifestExists = Test-Path (Join-Path $LTTHDir "launcher-release.json") } | ConvertTo-Json -Compress'
  ].join('; ');
  return invokeInstallerFunctions(releaseFunctions(), body);
}

describe('Windows installer launcher-only architecture', () => {
  test('ships the maintained signed launcher path that updates from immutable GitHub releases', () => {
    const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const maintainedSource = fs.readFileSync(
      path.join(repoRoot, 'build-src', 'launcher-gui.go'),
      'utf8'
    );
    const legacySource = fs.readFileSync(path.join(repoRoot, 'launcher', 'main.go'), 'utf8');
    const launcherBinary = fs.readFileSync(path.join(repoRoot, 'launcher.exe')).toString('latin1');

    expect(rootPackage.scripts['build:launcher:win']).toContain('cd build-src');
    expect(maintainedSource).toContain('func fetchReleases()');
    expect(maintainedSource).toContain('release.ZipballURL');
    expect(maintainedSource).toContain('func (l *Launcher) downloadAndApplyUpdate');
    expect(maintainedSource).not.toContain('AppZIPBaseURL');
    expect(legacySource).toContain('AppZIPBaseURL');
    expect(launcherBinary).toContain('https://api.github.com');
    expect(launcherBinary).toContain('Loggableim');
    expect(launcherBinary).not.toContain('https://ltth.app/app/ltth_latest.zip');
  });

  test('Main delegates app installation, dependencies and updates only to launcher.exe', () => {
    if (!hasWindowsPowerShell()) return;

    const result = invokeInstallerFunctions(
      ['Main'],
      '(Get-Command Main).Definition'
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Install-Launcher');
    expect(result.stdout).toContain('Start-Launcher');
    expect(result.stdout).not.toContain('Download-Source');
    expect(result.stdout).not.toContain('Install-AppBundleFromZip');
    expect(result.stdout).not.toContain('Expand-Archive');
  });
});

describe('Official launcher release contract', () => {
  const validManifest = {
    schema: 1,
    component: 'launcher.exe',
    tag: 'v1.4.1',
    version: '1.4.1',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    bytes: 123,
    sha256: 'a'.repeat(64)
  };

  test('uses the manifest from latest and pins launcher.exe to its exact tag', () => {
    if (!hasWindowsPowerShell()) return;

    const result = invokeInstallerFunctions(
      [
        'Use-OfficialLauncherRelease',
        'Get-LauncherReleaseManifestUrl',
        'Get-LauncherDownloadUrl'
      ],
      [
        "$LTTHRepoOwner = 'Loggableim'",
        "$LTTHRepoName = 'ltth.app'",
        "$LTTHRepoBranch = 'main'",
        "$script:LTTHInstallMode = 'latest'",
        "$script:LTTHVersion = 'latest'",
        '[pscustomobject]@{ manifest = Get-LauncherReleaseManifestUrl; launcher = Get-LauncherDownloadUrl -ReleaseTag "v1.4.1" } | ConvertTo-Json -Compress'
      ].join('; ')
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      manifest: 'https://github.com/Loggableim/ltth.app/releases/latest/download/launcher-release.json',
      launcher: 'https://github.com/Loggableim/ltth.app/releases/download/v1.4.1/launcher.exe'
    });
  });

  test('keeps branch overrides on the explicit raw compatibility path', () => {
    if (!hasWindowsPowerShell()) return;

    const result = invokeInstallerFunctions(
      [
        'Use-OfficialLauncherRelease',
        'Get-LauncherReleaseManifestUrl',
        'Get-LauncherDownloadUrl'
      ],
      [
        "$LTTHRepoOwner = 'Loggableim'",
        "$LTTHRepoName = 'ltth.app'",
        "$LTTHRepoBranch = 'codex/release-audit'",
        "$script:LTTHInstallMode = 'latest'",
        '$manifest = Get-LauncherReleaseManifestUrl',
        '[pscustomobject]@{ manifest = if ($null -eq $manifest) { "__NONE__" } else { $manifest }; launcher = Get-LauncherDownloadUrl } | ConvertTo-Json -Compress'
      ].join('; ')
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      manifest: '__NONE__',
      launcher: 'https://raw.githubusercontent.com/Loggableim/ltth.app/codex/release-audit/downloads/launcher.exe'
    });
  });

  test('accepts only the documented immutable launcher manifest schema', () => {
    if (!hasWindowsPowerShell()) return;

    const accepted = invokeManifestValidation(validManifest);
    expect(accepted.status).toBe(0);
    expect(JSON.parse(accepted.stdout)).toEqual(validManifest);

    const invalidCases = [
      [{ ...validManifest, schema: 2 }, 'schema'],
      [{ ...validManifest, component: 'ltth_latest.zip' }, 'component'],
      [{ ...validManifest, tag: 'release-1.4.1' }, 'tag'],
      [{ ...validManifest, version: '1.4' }, 'version'],
      [{ ...validManifest, tag: 'v1.4.2' }, 'tag'],
      [{ ...validManifest, commitSha: 'abc' }, 'commitSha'],
      [{ ...validManifest, bytes: 0 }, 'bytes'],
      [{ ...validManifest, sha256: 'xyz' }, 'sha256']
    ];

    for (const [manifest, expectedField] of invalidCases) {
      const rejected = invokeManifestValidation(manifest, { allowNonzero: true });
      expect(rejected.status).not.toBe(0);
      expect(`${rejected.stderr}\n${rejected.stdout}`).toContain(expectedField);
    }
  });
});

describe('Verified launcher installation', () => {
  let tempDir;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  test('verifies the exact release bytes before atomically replacing launcher.exe', () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-install-'));
    const oldLauncher = Buffer.from('old-launcher');
    const newLauncher = Buffer.from('new-verified-launcher');
    const sourcePath = path.join(tempDir, 'release-launcher.exe');
    fs.writeFileSync(path.join(tempDir, 'launcher.exe'), oldLauncher);
    fs.writeFileSync(sourcePath, newLauncher);
    const manifest = {
      schema: 1,
      component: 'launcher.exe',
      tag: 'v1.4.1',
      version: '1.4.1',
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      bytes: newLauncher.length,
      sha256: sha256Buffer(newLauncher)
    };

    const result = runInstallLauncher({
      tempDir,
      remoteManifest: manifest,
      downloadSource: sourcePath
    });

    expect(result.status).toBe(0);
    const installed = JSON.parse(result.stdout);
    expect(Buffer.from(installed.installed, 'base64')).toEqual(newLauncher);
    expect(installed.result).toBe(path.join(tempDir, 'launcher.exe'));
    expect(installed.manifestExists).toBe(true);
  });

  test('never replaces an existing launcher with bytes that fail the release hash', () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-reject-'));
    const oldLauncher = Buffer.from('old-unverified-launcher');
    const downloaded = Buffer.from('tampered-download');
    const sourcePath = path.join(tempDir, 'release-launcher.exe');
    fs.writeFileSync(path.join(tempDir, 'launcher.exe'), oldLauncher);
    fs.writeFileSync(sourcePath, downloaded);
    const manifest = {
      schema: 1,
      component: 'launcher.exe',
      tag: 'v1.4.1',
      version: '1.4.1',
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      bytes: downloaded.length,
      sha256: '0'.repeat(64)
    };

    const result = runInstallLauncher({
      tempDir,
      remoteManifest: manifest,
      downloadSource: sourcePath
    });

    expect(result.status).toBe(0);
    const installed = JSON.parse(result.stdout);
    expect(installed.result).toBeNull();
    expect(Buffer.from(installed.installed, 'base64')).toEqual(oldLauncher);
    expect(installed.manifestExists).toBe(false);
  });

  test('retains an existing launcher on network failure only with a valid local manifest', () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-offline-'));
    const launcher = Buffer.from('previously-verified-launcher');
    const sourcePath = path.join(tempDir, 'unused-source.exe');
    fs.writeFileSync(path.join(tempDir, 'launcher.exe'), launcher);
    fs.writeFileSync(sourcePath, Buffer.from('unused'));
    const localManifest = {
      schema: 1,
      component: 'launcher.exe',
      tag: 'v1.4.0',
      version: '1.4.0',
      commitSha: 'fedcba9876543210fedcba9876543210fedcba98',
      bytes: launcher.length,
      sha256: sha256Buffer(launcher)
    };
    fs.writeFileSync(
      path.join(tempDir, 'launcher-release.json'),
      JSON.stringify(localManifest)
    );

    const retained = runInstallLauncher({
      tempDir,
      remoteManifest: localManifest,
      downloadSource: sourcePath,
      manifestFails: true
    });
    expect(retained.status).toBe(0);
    expect(JSON.parse(retained.stdout).result).toBe(path.join(tempDir, 'launcher.exe'));

    const retainedAfterBinaryFailure = runInstallLauncher({
      tempDir,
      remoteManifest: localManifest,
      downloadSource: sourcePath,
      downloadFails: true
    });
    expect(retainedAfterBinaryFailure.status).toBe(0);
    expect(JSON.parse(retainedAfterBinaryFailure.stdout).result).toBe(
      path.join(tempDir, 'launcher.exe')
    );

    fs.writeFileSync(
      path.join(tempDir, 'launcher-release.json'),
      JSON.stringify({ ...localManifest, sha256: '0'.repeat(64) })
    );
    const rejected = runInstallLauncher({
      tempDir,
      remoteManifest: localManifest,
      downloadSource: sourcePath,
      manifestFails: true
    });
    expect(rejected.status).toBe(0);
    expect(JSON.parse(rejected.stdout).result).toBeNull();
  });
});

describe('Verified Windows app ZIP bootstrap', () => {
  let tempDir;
  const expectedVersion = '1.5.0';

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function makeSidecar(zipBytes, overrides = {}) {
    return {
      schema: 1,
      component: 'ltth_latest.zip',
      version: expectedVersion,
      tag: `v${expectedVersion}`,
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      bytes: zipBytes.length,
      sha256: sha256Buffer(zipBytes),
      ...overrides
    };
  }

  async function writeFixtureZip(options = {}) {
    const zipPath = path.join(tempDir, 'ltth_latest.zip');
    const zipBytes = await createAppBundleZip(zipPath, options);
    return { zipPath, zipBytes };
  }

  test('validates sidecar, exact versioned bytes, and public policy before extracting', async () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-app-bundle-valid-'));
    const { zipPath, zipBytes } = await writeFixtureZip();
    const result = runInstallAppBundle({
      tempDir: path.join(tempDir, 'install'),
      zipPath,
      remoteManifest: makeSidecar(zipBytes)
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.success).toBe(true);
    expect(state.manifestUrl).toBe('https://github.com/Loggableim/ltth.app/releases/latest/download/ltth_latest.json');
    expect(state.zipUrl).toBe(`https://github.com/Loggableim/ltth.app/releases/download/v${expectedVersion}/ltth_latest.zip`);
    expect(state.downloadCalled).toBe(true);
    expect(state.expandCalled).toBe(true);
    expect(state.installed).toBe(true);
    expect(state.packageVersion).toBe(expectedVersion);
  });

  test('does not download or extract when the sidecar is missing', async () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-app-bundle-no-sidecar-'));
    const { zipPath, zipBytes } = await writeFixtureZip();
    const result = runInstallAppBundle({
      tempDir: path.join(tempDir, 'install'),
      zipPath,
      remoteManifest: makeSidecar(zipBytes),
      manifestUnavailable: true
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.success).toBe(false);
    expect(state.error).toContain('Manifest');
    expect(state.downloadCalled).toBe(false);
    expect(state.expandCalled).toBe(false);
    expect(state.installed).toBe(false);
  });

  const protectedDataMarkers = [
    '.config_path',
    'user_configs/default.db',
    'user_data/viewer-fixture.json',
    'uploads/animation-fixture.gif',
    'plugins/music-bot/data/settings.json'
  ];

  test.each(protectedDataMarkers)('blocks legacy ZIP repair with protected %s and never enters Git fallback', marker => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-installer-protected-app-data-'));
    const installDir = path.join(tempDir, 'install');
    const appDir = path.join(installDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'legacy-fixture', version: '1.4.4' }));
    const markerPath = path.join(appDir, marker);
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `synthetic-preserve:${marker}`);

    const result = runDownloadSource({ tempDir: installDir, markerPaths: [marker] });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.error).toContain('LTTH.AppDirectoryContainsPersistentData');
    expect(state.manifestCalls).toBe(0);
    expect(state.downloadCalls).toBe(0);
    expect(state.expandCalls).toBe(0);
    expect(state.gitFallbackCalls).toBe(0);
    expect(state.gitReplacementCalls).toBe(0);
    expect(state.markersUnchanged).toBe(true);
    expect(state.appRootValid).toBe(false);
    expect(state.backupCount).toBe(0);
    expect(fs.readFileSync(markerPath, 'utf8')).toBe(`synthetic-preserve:${marker}`);
    expect(fs.existsSync(path.join(appDir, 'launch.js'))).toBe(false);
  });

  test('rethrows a typed data guard raised at the ZIP boundary without Git fallback', () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-installer-racing-data-guard-'));
    const installDir = path.join(tempDir, 'install');
    const appDir = path.join(installDir, 'app');
    fs.mkdirSync(path.join(appDir, 'user_data'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'legacy-fixture', version: '1.4.4' }));
    const markerPath = path.join(appDir, 'user_data', 'viewer-fixture.json');
    fs.writeFileSync(markerPath, 'synthetic-race-guard');

    const result = runDownloadSource({
      tempDir: installDir,
      markerPaths: ['user_data/viewer-fixture.json'],
      deferProtection: true
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.error).toContain('LTTH.AppDirectoryContainsPersistentData');
    expect(state.guardCheckCount).toBe(2);
    expect(state.manifestCalls).toBe(0);
    expect(state.downloadCalls).toBe(0);
    expect(state.expandCalls).toBe(0);
    expect(state.gitFallbackCalls).toBe(0);
    expect(state.gitReplacementCalls).toBe(0);
    expect(state.markersUnchanged).toBe(true);
    expect(state.backupCount).toBe(0);
    expect(fs.readFileSync(markerPath, 'utf8')).toBe('synthetic-race-guard');
  });

  test('blocks direct ZIP repair before the sidecar when app-local state exists', () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-installer-direct-protected-data-'));
    const installDir = path.join(tempDir, 'install');
    const appDir = path.join(installDir, 'app');
    fs.mkdirSync(path.join(appDir, 'user_configs'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'legacy-fixture', version: '1.4.4' }));
    const profilePath = path.join(appDir, 'user_configs', 'default.db');
    fs.writeFileSync(profilePath, 'synthetic-profile');

    const result = runInstallAppBundle({
      tempDir: installDir,
      zipPath: path.join(tempDir, 'unused.zip'),
      remoteManifest: {}
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.success).toBe(false);
    expect(state.error).toContain('LTTH.AppDirectoryContainsPersistentData');
    expect(state.manifestUrl).toBeNull();
    expect(state.downloadCalled).toBe(false);
    expect(state.expandCalled).toBe(false);
    expect(state.packageVersion).toBe('1.4.4');
    expect(fs.readFileSync(profilePath, 'utf8')).toBe('synthetic-profile');
  });

  test('keeps a valid existing app with app-local markers on the normal skip path', () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-installer-valid-app-data-'));
    const installDir = path.join(tempDir, 'install');
    const appDir = path.join(installDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'valid-fixture', version: '1.4.5' }));
    fs.writeFileSync(path.join(appDir, 'launch.js'), '// synthetic app');
    const markerPaths = protectedDataMarkers;
    for (const marker of markerPaths) {
      const markerPath = path.join(appDir, marker);
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      fs.writeFileSync(markerPath, `synthetic-preserve:${marker}`);
    }

    const result = runDownloadSource({ tempDir: installDir, markerPaths });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.error).toBeNull();
    expect(state.manifestCalls).toBe(0);
    expect(state.downloadCalls).toBe(0);
    expect(state.expandCalls).toBe(0);
    expect(state.gitFallbackCalls).toBe(0);
    expect(state.gitReplacementCalls).toBe(0);
    expect(state.markersUnchanged).toBe(true);
    expect(state.appRootValid).toBe(true);
    expect(state.backupCount).toBe(0);
    for (const marker of markerPaths) {
      expect(fs.readFileSync(path.join(appDir, marker), 'utf8')).toBe(`synthetic-preserve:${marker}`);
    }
  });

  test.each([
    ['unknown fields', { futureField: 'not-in-schema' }, 'dokumentierten'],
    ['negative byte count', { bytes: -1 }, 'bytes']
  ])('rejects sidecar with %s before downloading the ZIP', async (_caseName, overrides, expectedError) => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-app-bundle-invalid-sidecar-'));
    const { zipPath, zipBytes } = await writeFixtureZip();
    const result = runInstallAppBundle({
      tempDir: path.join(tempDir, 'install'),
      zipPath,
      remoteManifest: makeSidecar(zipBytes, overrides)
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.success).toBe(false);
    expect(state.error).toContain(expectedError);
    expect(state.downloadCalled).toBe(false);
    expect(state.expandCalled).toBe(false);
    expect(state.installed).toBe(false);
  });

  test('rejects trailing JSON in the sidecar before downloading the ZIP', async () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-app-bundle-trailing-sidecar-'));
    const { zipPath, zipBytes } = await writeFixtureZip();
    const validSidecar = JSON.stringify(makeSidecar(zipBytes));
    const result = runInstallAppBundle({
      tempDir: path.join(tempDir, 'install'),
      zipPath,
      remoteManifestRaw: `${validSidecar} {"schema":1}`
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.success).toBe(false);
    expect(state.error).toContain('Manifest');
    expect(state.downloadCalled).toBe(false);
    expect(state.expandCalled).toBe(false);
    expect(state.installed).toBe(false);
  });

  test('rejects a mismatched resolved version before downloading the ZIP', async () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-app-bundle-wrong-version-'));
    const { zipPath, zipBytes } = await writeFixtureZip();
    const result = runInstallAppBundle({
      tempDir: path.join(tempDir, 'install'),
      zipPath,
      remoteManifest: makeSidecar(zipBytes, { version: '1.4.4', tag: 'v1.4.4' })
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.success).toBe(false);
    expect(state.error).toContain('erwarteten Version');
    expect(state.downloadCalled).toBe(false);
    expect(state.expandCalled).toBe(false);
  });

  test.each([
    ['byte-count mismatch', zipBytes => ({ bytes: zipBytes.length + 1 }), 'bytes'],
    ['SHA-256 mismatch', () => ({ sha256: '0'.repeat(64) }), 'sha256']
  ])('rejects ZIP %s before extraction', async (_caseName, makeOverrides, expectedError) => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-app-bundle-bad-hash-'));
    const { zipPath, zipBytes } = await writeFixtureZip();
    const result = runInstallAppBundle({
      tempDir: path.join(tempDir, 'install'),
      zipPath,
      remoteManifest: makeSidecar(zipBytes, makeOverrides(zipBytes))
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.success).toBe(false);
    expect(state.error).toContain(expectedError);
    expect(state.downloadCalled).toBe(true);
    expect(state.expandCalled).toBe(false);
    expect(state.installed).toBe(false);
  });

  test.each([
    ['missing public marker', { omitMarker: true }],
    ['missing release policy', { omitPolicy: true }],
    ['malformed release policy', { policy: { schemaVersion: 2, closedBeta: [] } }],
    ['invalid release policy alias', {
      policy: { schemaVersion: 1, closedBeta: ['music-bot'], aliases: { streamalchemy: 'unknown-plugin' } }
    }],
    ['non-public marker', { marker: { channel: 'local' } }],
    ['renamed closed-beta manifest ID', {
      pluginPath: 'plugins/renamed/plugin.json',
      pluginManifest: { id: 'music-bot' }
    }],
    ['renamed closed-beta alias', {
      pluginPath: 'plugins/renamed/plugin.json',
      pluginManifest: { id: 'public-wrapper', aliases: ['streamalchemy'] }
    }],
    ['renamed closed-beta replacement', {
      pluginPath: 'plugins/renamed/plugin.json',
      pluginManifest: { id: 'public-wrapper', replaces: ['streamalchemy'] }
    }],
    ['closed-beta directory name', {
      pluginPath: 'plugins/music-bot/plugin.json',
      pluginManifest: { id: 'public-wrapper' }
    }],
    ['nested closed-beta directory name under a public vendor', {
      pluginPath: 'plugins/public/vendor/music-bot/plugin.json',
      pluginManifest: { id: 'public-wrapper' }
    }],
    ['case-variant plugin paths and manifest IDs', {
      pluginPath: 'Plugins/renamed/Plugin.json',
      pluginManifest: { id: 'MUSIC-BOT' }
    }],
    ['invalid publicRuntimeExcluded ID', {
      policy: { schemaVersion: 1, closedBeta: ['music-bot'], publicRuntimeExcluded: ['Bad ID'] }
    }],
    ['publicRuntimeExcluded duplicate of closed-beta ID', {
      policy: { schemaVersion: 1, closedBeta: ['music-bot'], publicRuntimeExcluded: ['music-bot'] }
    }],
    ['publicAssetPathOwners owner not in blocked IDs', {
      policy: { schemaVersion: 1, closedBeta: ['music-bot'], publicAssetPathOwners: { '/js/x.js': 'unknown-owner' } }
    }],
  ])('rejects app contents with %s before extraction', async (_caseName, zipOptions) => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-app-bundle-policy-'));
    const { zipPath, zipBytes } = await writeFixtureZip(zipOptions);
    const result = runInstallAppBundle({
      tempDir: path.join(tempDir, 'install'),
      zipPath,
      remoteManifest: makeSidecar(zipBytes)
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.success).toBe(false);
    expect(state.downloadCalled).toBe(true);
    expect(state.expandCalled).toBe(false);
    expect(state.installed).toBe(false);
  });

  test('accepts an asset owner that is blocked only through publicRuntimeExcluded', async () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-app-bundle-runtime-excluded-'));
    const { zipPath, zipBytes } = await writeFixtureZip({
      policy: {
        schemaVersion: 1,
        closedBeta: ['music-bot'],
        publicRuntimeExcluded: ['sidekick'],
        publicAssetPathOwners: { '/js/sidekick-ui.js': 'sidekick' }
      }
    });
    const result = runInstallAppBundle({
      tempDir: path.join(tempDir, 'install'),
      zipPath,
      remoteManifest: makeSidecar(zipBytes)
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.success).toBe(true);
    expect(state.installed).toBe(true);
  });

  test('keeps unrelated nested public vendor plugin directories valid', async () => {
    if (!hasWindowsPowerShell()) return;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-app-bundle-public-vendor-'));
    const { zipPath, zipBytes } = await writeFixtureZip({
      pluginPath: 'plugins/public/vendor/unrelated/plugin.json',
      pluginManifest: { id: 'public-vendor' }
    });
    const result = runInstallAppBundle({
      tempDir: path.join(tempDir, 'install'),
      zipPath,
      remoteManifest: makeSidecar(zipBytes)
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.success).toBe(true);
    expect(state.downloadCalled).toBe(true);
    expect(state.expandCalled).toBe(true);
    expect(state.installed).toBe(true);
    expect(state.packageVersion).toBe(expectedVersion);
  });
});
