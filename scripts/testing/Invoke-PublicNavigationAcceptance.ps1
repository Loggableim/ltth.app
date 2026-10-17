param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$CandidateCommit,

    [string]$PreparedCandidatePath,

    [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$gitCommand = Get-Command git -ErrorAction Stop
$candidate = $CandidateCommit.ToLowerInvariant()
$browserExecutable = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $browserExecutable) { throw 'A preinstalled Microsoft Edge or Google Chrome executable is required; no browser download will be attempted.' }
$taskRoot = Join-Path $tempBase ("ltth-public-nav-" + [Guid]::NewGuid().ToString('N'))
$bundledNode = Join-Path $repoRoot 'runtime/node/node.exe'
$nodeCommand = if (Test-Path -LiteralPath $bundledNode -PathType Leaf) {
    [pscustomobject]@{ Source = $bundledNode }
} else {
    Get-Command node -ErrorAction Stop
}
$checkout = Join-Path $taskRoot 'candidate'
$appRoot = Join-Path $checkout 'app'
$profileRoot = Join-Path $taskRoot 'profile'
$pluginFixture = Join-Path $profileRoot 'plugins'
$archivePath = Join-Path $taskRoot 'candidate.zip'
$browserScript = $null
$serverProcess = $null

function Assert-WithinTemp([string]$Path) {
    $resolved = [IO.Path]::GetFullPath($Path)
    $base = $tempBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing a path outside the OS temp directory: $resolved"
    }
}

function Invoke-Git([string[]]$GitArgs) {
    & $gitCommand.Source -C $repoRoot @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE" }
}

function Get-FreeTestPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse('127.0.0.1'), 0)
    $listener.Start()
    try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}

function New-NoOpPluginFixtures([string[]]$Ids) {
    New-Item -ItemType Directory -Path $pluginFixture -Force | Out-Null
    foreach ($id in $Ids) {
        $pluginDir = Join-Path $pluginFixture $id
        New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null
        $manifest = @{
            id = $id
            name = "Isolation fixture $id"
            version = '0.0.0-test'
            entry = 'main.js'
            enabled = $true
            description = 'No-op fixture for navigation and inventory checks.'
        } | ConvertTo-Json -Depth 4
        Set-Content -LiteralPath (Join-Path $pluginDir 'plugin.json') -Value $manifest -Encoding utf8
        Set-Content -LiteralPath (Join-Path $pluginDir 'main.js') -Value @'
'use strict';
module.exports = class IsolatedNoOpPlugin {
  constructor() {}
  async init() {}
};
'@ -Encoding utf8
    }
}

function Write-DistributionMode([string]$Mode) {
    $configDir = Join-Path $appRoot 'config'
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    @{ channel = $Mode } | ConvertTo-Json -Compress |
        Set-Content -LiteralPath (Join-Path $configDir 'distribution-mode.json') -Encoding utf8
}

function Write-IsolatedServerBootstrap {
    $bootstrapPath = Join-Path $appRoot '.isolated-server-bootstrap.cjs'
    Set-Content -LiteralPath $bootstrapPath -Encoding utf8 -Value @'
'use strict';
const os = require('os');
const path = require('path');
const isolatedProfile = path.resolve(process.env.LOCALAPPDATA || '');
const isolatedTemp = path.resolve(os.tmpdir());
const relativeProfile = path.relative(isolatedTemp, isolatedProfile);
if (!isolatedProfile || isolatedProfile === isolatedTemp || relativeProfile === '..'
    || relativeProfile.startsWith(`..${path.sep}`) || path.isAbsolute(relativeProfile)) {
  throw new Error('Isolated profile is outside the configured temporary root');
}
os.homedir = () => isolatedProfile;
require('./server.js');
'@
}

function Start-IsolatedServer([string]$Mode) {
    Write-DistributionMode $Mode
    $port = Get-FreeTestPort
    $logPath = Join-Path $taskRoot "server-$Mode.log"
    if (-not ('LTTHPublicOverlayProcessLogPump' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;

public static class LTTHPublicOverlayProcessLogPump {
    private static readonly ConcurrentDictionary<int, StreamWriter> Writers = new ConcurrentDictionary<int, StreamWriter>();

    public static void Attach(Process process, string path) {
        var writer = new StreamWriter(new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete)) { AutoFlush = true };
        Writers[process.Id] = writer;
        DataReceivedEventHandler handler = (sender, args) => {
            if (args.Data == null) return;
            try { lock (writer) writer.WriteLine(args.Data); }
            catch (ObjectDisposedException) { }
        };
        process.OutputDataReceived += handler;
        process.ErrorDataReceived += handler;
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
    }

    public static void Close(int processId) {
        if (Writers.TryRemove(processId, out var writer)) writer.Dispose();
    }
}
'@
    }
    $envMap = @{
        SystemRoot = $env:SystemRoot
        WINDIR = $env:WINDIR
        HOMEDRIVE = ''
        HOMEPATH = ''
        LOGONSERVER = ''
        PATH = ''
        SYSTEMDRIVE = ''
        USERDOMAIN = ''
        USERNAME = ''
        USERPROFILE = ''
        TEMP = $tempBase.TrimEnd('\')
        TMP = $tempBase.TrimEnd('\')
        LOCALAPPDATA = $profileRoot
        LTTH_LOG_DIR = Join-Path $profileRoot 'logs'
        LTTH_PORT = [string]$port
        LTTH_DOCS_CAPTURE = 'true'
        LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS = ($script:closedBetaIds -join ',')
        LTTH_DOCS_CAPTURE_PLUGIN_DIR = $pluginFixture
        LTTH_DISABLE_TIKTOK_AUTO_RECONNECT = 'true'
        LTTH_NO_BROWSER = 'true'
        DISABLE_SWAGGER = 'true'
        LTTH_BIND_ADDRESS = '127.0.0.1'
    }
    $script:isolatedEnvMap = $envMap

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $serverScript = Join-Path $appRoot '.isolated-server-bootstrap.cjs'
    $startInfo.FileName = $nodeCommand.Source
    $startInfo.Arguments = '"' + $serverScript + '"'
    $startInfo.WorkingDirectory = $appRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.Environment.Clear()
    foreach ($entry in $envMap.GetEnumerator()) { $startInfo.Environment[$entry.Key] = [string]$entry.Value }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw "Could not start the isolated $Mode server" }
    [LTTHPublicOverlayProcessLogPump]::Attach($process, $logPath)
    $script:serverProcess = $process
    $serverRecord = "SERVER_STARTED mode=$Mode pid=$($process.Id) handles=$($process.HandleCount) log=$logPath"
    Add-Content -LiteralPath (Join-Path $taskRoot 'process-events.log') -Value $serverRecord
    Write-Host $serverRecord
    return @{ Mode = $Mode; Port = $port; Process = $process; BaseUrl = $null }
}

function Invoke-IsolatedBrowserCheck([string[]]$Arguments) {
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $nodeCommand.Source
    $startInfo.Arguments = (($Arguments | ForEach-Object { '"' + ([string]$_).Replace('"', '\"') + '"' }) -join ' ')
    $startInfo.WorkingDirectory = $appRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.Environment.Clear()
    foreach ($entry in $script:isolatedEnvMap.GetEnumerator()) { $startInfo.Environment[$entry.Key] = [string]$entry.Value }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw 'Could not start isolated browser check.' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $progressPath = [string]$Arguments[-1]
    $lastProgressCount = 0
    $startedAt = [DateTime]::UtcNow
    $processLog = Join-Path $taskRoot 'process-events.log'
    Add-Content -LiteralPath $processLog -Value "BROWSER_STARTED pid=$($process.Id) handles=$($process.HandleCount) progress=$progressPath"
    Write-Output "BROWSER_STARTED pid=$($process.Id) handles=$($process.HandleCount) progress=$progressPath"
    [Console]::Out.Flush()
    while (-not $process.WaitForExit(5000)) {
        if (Test-Path -LiteralPath $progressPath) {
            $progressLines = @(Get-Content -LiteralPath $progressPath)
            while ($lastProgressCount -lt $progressLines.Count) {
                Write-Output "BROWSER_STAGE $($progressLines[$lastProgressCount])"
                Add-Content -LiteralPath $processLog -Value "BROWSER_STAGE $($progressLines[$lastProgressCount])"
                $lastProgressCount++
            }
        }
        Add-Content -LiteralPath $processLog -Value "BROWSER_ALIVE pid=$($process.Id) handles=$($process.HandleCount) elapsedSeconds=$([int]([DateTime]::UtcNow - $startedAt).TotalSeconds)"
        Write-Output "BROWSER_ALIVE pid=$($process.Id) handles=$($process.HandleCount) elapsedSeconds=$([int]([DateTime]::UtcNow - $startedAt).TotalSeconds)"
        [Console]::Out.Flush()
    }
    $process.WaitForExit()
    if (Test-Path -LiteralPath $progressPath) {
        $progressLines = @(Get-Content -LiteralPath $progressPath)
        while ($lastProgressCount -lt $progressLines.Count) {
            Write-Output "BROWSER_STAGE $($progressLines[$lastProgressCount])"
            Add-Content -LiteralPath $processLog -Value "BROWSER_STAGE $($progressLines[$lastProgressCount])"
            $lastProgressCount++
        }
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    Add-Content -LiteralPath $processLog -Value "BROWSER_EXIT pid=$($process.Id) handles=$($process.HandleCount) exitCode=$($process.ExitCode)"
    Write-Output "BROWSER_EXIT pid=$($process.Id) handles=$($process.HandleCount) exitCode=$($process.ExitCode)"
    if ($stdout) { Write-Output $stdout.TrimEnd() }
    if ($process.ExitCode -ne 0) { throw "Browser acceptance failed: $stderr" }
}

function Stop-IsolatedServer {
    if ($script:serverProcess -and -not $script:serverProcess.HasExited) {
        $serverId = $script:serverProcess.Id
        $serverHandles = $script:serverProcess.HandleCount
        $script:serverProcess.Kill($true)
        $script:serverProcess.WaitForExit(10000) | Out-Null
        Add-Content -LiteralPath (Join-Path $taskRoot 'process-events.log') -Value "SERVER_STOPPED pid=$serverId handles=$serverHandles exitCode=$($script:serverProcess.ExitCode)"
    }
    if ($script:serverProcess) { [LTTHPublicOverlayProcessLogPump]::Close($script:serverProcess.Id) }
    $script:serverProcess = $null
}

function Wait-ForInventory([hashtable]$Server) {
    $deadline = [DateTime]::UtcNow.AddSeconds(40)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Server.Process.HasExited) {
            throw "Isolated server exited with code $($Server.Process.ExitCode); see its temporary log."
        }
        $logPath = Join-Path $taskRoot "server-$($Server.Mode).log"
        if (Test-Path -LiteralPath $logPath) {
            $listeningLine = Select-String -LiteralPath $logPath -Pattern 'Dashboard:\s+http://(?:127\.0\.0\.1|localhost):(\d+)/dashboard\.html' | Select-Object -Last 1
            if ($listeningLine -and $listeningLine.Matches[0].Groups[1].Success) {
                $Server.Port = [int]$listeningLine.Matches[0].Groups[1].Value
                $Server.BaseUrl = "http://127.0.0.1:$($Server.Port)"
            }
        }
        if (-not $Server.BaseUrl) { Start-Sleep -Milliseconds 300; continue }
        try {
            $response = Invoke-RestMethod -Uri ($Server.BaseUrl + '/api/plugins') -TimeoutSec 2
            if ($response.success -eq $true) { return $response }
        } catch { Start-Sleep -Milliseconds 300 }
    }
    throw "Timed out waiting for the isolated server's logged loopback address and /api/plugins."
}

try {
    Assert-WithinTemp $taskRoot
    New-Item -ItemType Directory -Path $taskRoot -Force | Out-Null

    Invoke-Git @('cat-file', '-e', "$candidate^{commit}")
    $catalogSource = (& $gitCommand.Source -C $repoRoot show "${candidate}:scripts/lib/published-plugin-catalog.js") -join "`n"
    if ($LASTEXITCODE -ne 0 -or $catalogSource -notmatch "publicAssetPathOwners") {
        throw 'BLOCKED_SCHEMA_PARSER: candidate commit does not yet accept publicAssetPathOwners in the published catalog parser.'
    }
    $policySource = (& $gitCommand.Source -C $repoRoot show "${candidate}:app/config/plugin-release-policy.json") -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'Candidate commit has no release policy.' }
    $policy = $policySource | ConvertFrom-Json
    if (-not $policy.publicAssetPathOwners -or $policy.closedBeta.Count -ne 11) {
        throw 'Candidate commit must contain all eleven closed-beta IDs and the central public-asset ownership map.'
    }
    $requiredAssets = @('/js/osc-bridge-ui.js', '/js/webgpu-emoji-rain-ui.js', '/osc-bridge-icon.png', '/osc-bridge-logo.png')
    foreach ($asset in $requiredAssets) {
        if ($asset -notin @($policy.publicAssetPathOwners.PSObject.Properties.Name)) {
            throw "Candidate policy is missing public asset ownership for $asset"
        }
    }
    $expectedOwners = @{
        '/js/osc-bridge-ui.js' = 'osc-bridge'
        '/js/webgpu-emoji-rain-ui.js' = 'webgpu-emoji-rain'
        '/osc-bridge-icon.png' = 'osc-bridge'
        '/osc-bridge-logo.png' = 'osc-bridge'
    }
    foreach ($asset in $requiredAssets) {
        if ($policy.publicAssetPathOwners.$asset -ne $expectedOwners[$asset]) {
            throw "Candidate policy has an unexpected owner for $asset"
        }
    }
    $script:closedBetaIds = @($policy.closedBeta)

    if ($PreparedCandidatePath) {
        $checkout = [IO.Path]::GetFullPath($PreparedCandidatePath)
        Assert-WithinTemp $checkout
        if (-not (Test-Path -LiteralPath (Join-Path $checkout 'app/server.js')) -or
            -not (Test-Path -LiteralPath (Join-Path $checkout 'scripts/lib/published-plugin-catalog.js'))) {
            throw 'Prepared candidate path is missing required source files.'
        }
    } else {
        & $gitCommand.Source -C $repoRoot archive --format=zip --output=$archivePath $candidate
        if ($LASTEXITCODE -ne 0) { throw "Could not archive candidate $candidate" }
        Expand-Archive -LiteralPath $archivePath -DestinationPath $checkout -Force
    }
    $appRoot = Join-Path $checkout 'app'
    $browserScript = Join-Path $appRoot '.isolated-browser-check.cjs'
    Write-IsolatedServerBootstrap
    $dependencyRoot = Join-Path $repoRoot 'app/node_modules'
    if (-not (Test-Path -LiteralPath $dependencyRoot -PathType Container)) {
        throw 'Repository app/node_modules is required; install dependencies before running the isolated acceptance.'
    }
    $nodeModulesPath = Join-Path $appRoot 'node_modules'
    if (Test-Path -LiteralPath $nodeModulesPath) {
        $existingLink = Get-Item -LiteralPath $nodeModulesPath -Force
        if ((($existingLink.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) -or
            [IO.Path]::GetFullPath([string](@($existingLink.Target)[0])) -ne [IO.Path]::GetFullPath($dependencyRoot)) {
            throw 'Candidate node_modules does not resolve to the expected workspace dependency directory.'
        }
    } else {
        New-Item -ItemType Junction -Path $nodeModulesPath -Target $dependencyRoot | Out-Null
    }
    New-NoOpPluginFixtures $script:closedBetaIds

    $browserCode = @'
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [baseUrl, mode, idsJson, evidencePath, browserProfile, screenshotDir, browserExecutable, progressPath] = process.argv.slice(2);
  const ids = JSON.parse(idsJson);
  const evidence = { mode, checks: [], failures: [] };
  evidence.sidekickUiRouteHits = 0;
  const progress = stage => fs.appendFileSync(progressPath, `${new Date().toISOString()} ${stage}\n`);
  progress('launching-browser');
  const browser = await chromium.launchPersistentContext(browserProfile, {
    headless: true,
    executablePath: browserExecutable,
    timeout: 20000,
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check']
  });
  progress('browser-launched');
  try {
    browser.setDefaultTimeout(10000);
    browser.setDefaultNavigationTimeout(20000);
    await browser.route('**/*', route => {
      const url = new URL(route.request().url());
      const local = url.hostname === '127.0.0.1' && url.port === new URL(baseUrl).port;
      if (local && url.pathname === '/sidekick/ui') {
        evidence.sidekickUiRouteHits += 1;
        if (mode === 'local' && route.request().method() === 'GET') {
          evidence.sidekickFixtureHttpStatus = 200;
          return route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: '<!doctype html><html><head><title>Isolated Sidekick UI fixture</title></head><body><p>Isolated Sidekick UI route fixture</p></body></html>'
          });
        }
        return route.abort('blockedbyclient');
      }
      const safeSocketPoll = local && url.pathname === '/socket.io/' && ['GET', 'POST'].includes(route.request().method());
      if (local && (['GET', 'HEAD'].includes(route.request().method()) || safeSocketPoll)) return route.continue();
      return route.abort('blockedbyclient');
    });
    const page = await browser.newPage();
    const settledRender = async () => {
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.waitForTimeout(350);
    };
    const activeOverlays = async () => page.evaluate(() => [...document.querySelectorAll(
      '.modal-overlay, .modal-backdrop, [role="dialog"], [aria-modal="true"]'
    )].filter(node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
    }).map(node => ({ id: node.id, role: node.getAttribute('role'), className: String(node.className) })));
    progress('dashboard-navigation-start');
    const response = await page.goto(baseUrl + '/dashboard.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
    progress(`dashboard-navigation-done-${response?.status()}`);
    if (!response || response.status() !== 200) throw new Error(`Dashboard HTTP ${response?.status()}`);
    await page.waitForFunction(() => window.NavigationManager && document.documentElement.dataset.theme, null, { timeout: 20000 });
    progress('navigation-and-theme-ready');

    const inventory = await page.evaluate(async () => (await (await fetch('/api/plugins')).json()));
    if (!inventory.success || inventory.distributionMode !== mode) throw new Error(`Unexpected inventory mode: ${JSON.stringify(inventory)}`);
    await page.evaluate(async () => {
      if (window.NavigationManager?.refreshPluginVisibility) {
        await window.NavigationManager.refreshPluginVisibility();
      }
    });
    await page.waitForFunction(() => {
      const sidekick = document.querySelector('#view-sidekick');
      return !sidekick || sidekick.dataset.pluginState !== 'pending';
    }, null, { timeout: 10000 });
    const inventoryIds = new Set(inventory.plugins.map(plugin => plugin.id));
    if (mode === 'public') {
      for (const id of ids) {
        if (inventoryIds.has(id)) throw new Error(`Public inventory exposed ${id}`);
        const items = await page.locator(`[data-plugin="${id}"]`).evaluateAll(nodes => nodes.map(node => ({
          display: getComputedStyle(node).display,
          state: node.dataset.pluginState,
          disabled: node.getAttribute('aria-disabled')
        })));
        if (items.some(item => item.display !== 'none' && item.state !== 'blocked')) throw new Error(`Public nav exposed ${id}: ${JSON.stringify(items)}`);
        if (id === 'sidekick') {
          const sidekick = await page.locator('#view-sidekick').evaluate(view => ({
            state: view.dataset.pluginState,
            frameSrc: view.querySelector('iframe')?.getAttribute('src') || ''
          }));
          if (sidekick.state !== 'blocked' || sidekick.frameSrc) throw new Error(`Public Sidekick view was not blocked/lazy: ${JSON.stringify(sidekick)}`);
          evidence.sidekickPublicGate = { navItems: items, view: sidekick };
        }
        const blocked = await page.request.get(`${baseUrl}/plugins/${id}/main.js`);
        if (blocked.status() !== 404) throw new Error(`Public plugin asset ${id} returned ${blocked.status()}`);
      }
      if (evidence.sidekickUiRouteHits !== 0) throw new Error(`Public mode requested the Sidekick UI route: ${evidence.sidekickUiRouteHits}`);
      evidence.sidekickPublicGate.iframeRouteHits = evidence.sidekickUiRouteHits;
    } else {
      const missingLocalNav = [];
      for (const id of ids) {
        if (!inventoryIds.has(id)) throw new Error(`Local inventory omitted ${id}`);
        const navItems = await page.locator(`.sidebar-item[data-plugin="${id}"]`).evaluateAll(nodes => nodes.map(node => ({
          display: getComputedStyle(node).display,
          state: node.dataset.pluginState,
          disabled: node.getAttribute('aria-disabled')
        })));
        if (navItems.length === 0) {
          missingLocalNav.push(id);
        } else if (navItems.every(item => item.display === 'none' || item.state === 'blocked' || item.disabled === 'true')) {
          throw new Error(`Local navigation did not expose ${id}: ${JSON.stringify(navItems)}`);
        }
        if (id === 'sidekick') {
          const sidekick = await page.locator('#view-sidekick').evaluate(view => ({
            state: view.dataset.pluginState,
            frameDataSrc: view.querySelector('iframe')?.getAttribute('data-src') || '',
            frameSrc: view.querySelector('iframe')?.getAttribute('src') || ''
          }));
          if (navItems.length !== 1 || !sidekick.frameDataSrc.endsWith('/sidekick/ui') || sidekick.frameSrc) {
            throw new Error(`Local Sidekick entry/view contract mismatch: ${JSON.stringify({ navItems, sidekick })}`);
          }
          evidence.sidekickLocalEntry = { navItems, view: sidekick };
          await page.locator('.sidebar-item[data-view="sidekick"]').click();
          await page.waitForFunction(() => {
            const frame = document.querySelector('#view-sidekick iframe');
            return frame?.getAttribute('src') === '/sidekick/ui';
          }, null, { timeout: 5000 });
          await page.waitForFunction(() => {
            const frame = document.querySelector('#view-sidekick iframe');
            return frame?.contentDocument?.body?.textContent.includes('Isolated Sidekick UI route fixture');
          }, null, { timeout: 10000 });
          if (evidence.sidekickFixtureHttpStatus !== 200 || evidence.sidekickUiRouteHits !== 1) {
            throw new Error(`Local Sidekick UI fixture did not return exactly one loopback 200: ${JSON.stringify(evidence)}`);
          }
          evidence.sidekickLocalFixtureNavigation = {
            clicked: true,
            httpStatus: evidence.sidekickFixtureHttpStatus,
            routeHits: evidence.sidekickUiRouteHits,
            iframeSrc: await page.locator('#view-sidekick iframe').getAttribute('src'),
            title: await page.locator('#view-sidekick iframe').evaluate(frame => frame.contentDocument.title),
            syntheticFixture: true
          };
          await settledRender();
          await page.screenshot({ path: path.join(screenshotDir, 'local-sidekick-entry.png'), fullPage: false });
        }
        const asset = await page.request.get(`${baseUrl}/plugins/${id}/main.js`);
        if (asset.status() !== 200 || !(await asset.text()).includes('IsolatedNoOpPlugin')) throw new Error(`Local fixture asset for ${id} unavailable`);
      }
      evidence.localNavMissingMappings = missingLocalNav;
    }
    evidence.checks.push('inventory-and-navigation');
    progress('inventory-and-navigation-done');

    for (const asset of ['/js/osc-bridge-ui.js', '/js/webgpu-emoji-rain-ui.js', '/osc-bridge-icon.png', '/osc-bridge-logo.png']) {
      const assetResponse = await page.request.get(baseUrl + asset);
      const expected = mode === 'public' ? 404 : 200;
      if (assetResponse.status() !== expected) throw new Error(`${mode} asset ${asset}: expected ${expected}, got ${assetResponse.status()}`);
    }
    evidence.checks.push('four-policy-owned-assets');
    progress('asset-guards-done');

    const localeResults = await page.evaluate(async () => {
      const result = {};
      const initialDocument = { href: location.href, timeOrigin: performance.timeOrigin };
      for (const locale of ['de', 'en', 'es', 'fr']) {
        const applied = await window.i18n?.changeLanguage(locale);
        if (applied !== true) throw new Error(`Locale ${locale} could not be loaded`);
        const options = [...document.querySelectorAll('.theme-option')].map(option => {
          const key = option.dataset.themeOption;
          return {
            key,
            name: option.querySelector('.theme-option-name-text')?.textContent?.trim(),
            expectedName: window.i18n.t(`theme.selector.options.${key}.name`),
            description: option.querySelector('.theme-option-description')?.textContent?.trim(),
            expectedDescription: window.i18n.t(`theme.selector.options.${key}.description`),
            badge: option.querySelector('.theme-option-badge')?.textContent?.trim() || null,
            expectedBadge: window.i18n.t(`theme.selector.options.${key}.badge`)
          };
        });
        if (window.i18n.currentLocale !== locale || options.length !== 5) {
          throw new Error(`Locale ${locale} did not render exactly five options`);
        }
        for (const option of options) {
          if (!option.name || option.name !== option.expectedName
            || !option.description || option.description !== option.expectedDescription) {
            throw new Error(`Theme option translation mismatch for ${locale}/${option.key}: ${JSON.stringify(option)}`);
          }
          if (option.badge !== null && option.badge !== option.expectedBadge) {
            throw new Error(`Theme badge translation mismatch for ${locale}/${option.key}: ${JSON.stringify(option)}`);
          }
          if (/^theme\.selector\./.test(option.name) || /^theme\.selector\./.test(option.description)) {
            throw new Error(`Untranslated theme selector key in ${locale}/${option.key}`);
          }
        }
        result[locale] = { options, title: document.getElementById('theme-toggle-btn')?.title };
      }
      result.sameDocument = location.href === initialDocument.href
        && performance.timeOrigin === initialDocument.timeOrigin;
      if (!result.sameDocument) throw new Error('Locale switching navigated or reloaded the dashboard');
      return result;
    });
    if (!localeResults.sameDocument) throw new Error('Locale verification left the original dashboard document');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const applied = await page.evaluate(async nextLocale => window.i18n.changeLanguage(nextLocale), locale);
      if (applied !== true) throw new Error(`Could not select ${locale} for the theme panel screenshot`);
      await page.locator('#theme-toggle-btn').click();
      await page.waitForFunction(() => document.querySelector('#theme-dropdown')?.classList.contains('show'), null, { timeout: 5000 });
      await settledRender();
      await page.screenshot({ path: path.join(screenshotDir, `${mode}-theme-panel-locale-${locale}.png`), fullPage: false });
      await page.locator('#theme-toggle-btn').click();
      await page.waitForFunction(() => {
        const dropdown = document.querySelector('#theme-dropdown');
        return !dropdown || getComputedStyle(dropdown).visibility === 'hidden';
      }, null, { timeout: 5000 });
    }
    evidence.themeLocaleResults = localeResults;
    evidence.checks.push('theme-locales-de-en-es-fr-same-tab');
    progress('theme-locale-four-languages-done');

    const themeResults = await page.evaluate(async () => {
      const button = document.getElementById('theme-toggle-btn');
      if (!button) throw new Error('Theme toggle is missing');
      const results = {};
      for (const theme of ['cid', 'day', 'night']) {
        button.click();
        const option = document.querySelector(`.theme-option[data-theme-option="${theme}"]`);
        if (!option) throw new Error(`Theme option ${theme} missing`);
        option.click();
        results[theme] = {
          selected: document.documentElement.getAttribute('data-theme'),
          primary: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim(),
          text: getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary').trim()
        };
        if (results[theme].selected !== theme) throw new Error(`Theme ${theme} did not apply`);
      }
      const cidSwatches = [...document.querySelectorAll('.theme-option[data-theme-option="cid"] .theme-option-preview span')]
        .map(node => getComputedStyle(node).backgroundColor.toLowerCase());
      return { results, cidSwatches };
    });
    if (JSON.stringify(themeResults.cidSwatches) !== JSON.stringify(['rgb(22, 101, 52)', 'rgb(255, 255, 255)', 'rgb(124, 58, 237)'])) throw new Error('Green/white/violet brand swatches mismatch');
    evidence.themeResults = themeResults;
    progress('theme-state-values-done');
    const themePanelStates = {};
    const contrastRatio = (foreground, background) => {
      const luminance = color => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
          const normalized = value / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return Number(((light + 0.05) / (dark + 0.05)).toFixed(2));
    };
    for (const theme of ['cid', 'day', 'night']) {
      const selected = await page.locator('html').getAttribute('data-theme');
      if (selected !== theme) {
        await page.locator('#theme-toggle-btn').click();
        await page.locator(`.theme-option[data-theme-option="${theme}"]`).click();
      }
      await page.locator('#theme-toggle-btn').click();
      await page.waitForFunction(() => document.querySelector('#theme-dropdown')?.classList.contains('show'), null, { timeout: 5000 });
      await settledRender();
      const themePanelState = await page.locator('#theme-dropdown').evaluate(node => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const options = [...node.querySelectorAll('.theme-option')].map(option => ({
          theme: option.dataset.themeOption,
          opacity: getComputedStyle(option).opacity,
          background: getComputedStyle(option).backgroundColor,
          nameColor: getComputedStyle(option.querySelector('.theme-option-name')).color,
          descriptionColor: getComputedStyle(option.querySelector('.theme-option-description')).color
        }));
        return { open: node.classList.contains('show'), visibility: style.visibility, opacity: style.opacity, width: rect.width, height: rect.height, background: style.backgroundColor, options };
      });
      if (!themePanelState.open || themePanelState.visibility !== 'visible' || Number(themePanelState.opacity) < 0.98) {
        throw new Error(`Theme panel did not settle into a visible state for ${theme}: ${JSON.stringify(themePanelState)}`);
      }
      for (const option of themePanelState.options) {
        option.nameContrast = contrastRatio(option.nameColor, themePanelState.background);
        option.descriptionContrast = contrastRatio(option.descriptionColor, themePanelState.background);
        if (option.nameContrast < 4.5 || option.descriptionContrast < 4.5) {
          throw new Error(`Theme panel text contrast failed in ${theme}: ${JSON.stringify(option)}`);
        }
      }
      themePanelStates[theme] = themePanelState;
      await page.screenshot({ path: path.join(screenshotDir, `${mode}-theme-panel-${theme}.png`), fullPage: false });
      await page.locator('#theme-toggle-btn').click();
      await page.waitForFunction(() => {
        const dropdown = document.querySelector('#theme-dropdown');
        return !dropdown || getComputedStyle(dropdown).visibility === 'hidden';
      }, null, { timeout: 5000 });
      await settledRender();
    }
    evidence.themePanelStates = themePanelStates;
    progress('theme-panel-three-themes-screenshots-done');
    for (const theme of ['day', 'night']) {
      await page.locator('#theme-toggle-btn').click();
      await page.waitForFunction(() => document.querySelector('#theme-dropdown')?.classList.contains('show'), null, { timeout: 5000 });
      await page.locator(`.theme-option[data-theme-option="${theme}"]`).click();
      await page.waitForFunction(() => {
        const dropdown = document.querySelector('#theme-dropdown');
        return !dropdown || getComputedStyle(dropdown).visibility === 'hidden';
      }, null, { timeout: 5000 });
      await settledRender();
      const selected = await page.locator('html').getAttribute('data-theme');
      if (selected !== theme) throw new Error(`Theme ${theme} did not apply before screenshot`);
      const overlays = await activeOverlays();
      if (overlays.length) throw new Error(`Unexpected visible overlay before ${theme} screenshot: ${JSON.stringify(overlays)}`);
      await page.screenshot({ path: path.join(screenshotDir, `${mode}-${theme}.png`), fullPage: false });
      progress(`theme-${theme}-screenshot-done`);
    }
    evidence.checks.push('cid-day-night-themes');

    const flowLink = page.locator('[data-view="flows"]').first();
    if (await flowLink.count()) await flowLink.click();
    await settledRender();
    const addFlow = page.locator('#add-flow-btn');
    if (await addFlow.count()) {
      await addFlow.click();
      if (!(await page.locator('#flow-modal').evaluate(node => node.classList.contains('active')))) throw new Error('Flow modal did not open');
      await settledRender();
      const modalVisible = await page.locator('#flow-modal').evaluate(node => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return { display: style.display, visibility: style.visibility, opacity: style.opacity, width: rect.width, height: rect.height };
      });
      if (modalVisible.visibility === 'hidden' || Number(modalVisible.opacity) < 0.98 || modalVisible.width === 0 || modalVisible.height === 0) {
        throw new Error(`Flow modal did not settle into a visible state: ${JSON.stringify(modalVisible)}`);
      }
      await page.screenshot({ path: path.join(screenshotDir, `${mode}-flow-modal-open.png`), fullPage: false });
      progress('flow-modal-open-screenshot-done');
      await page.locator('#flow-modal-cancel-btn').click();
      if (await page.locator('#flow-modal').evaluate(node => node.classList.contains('active'))) throw new Error('Flow modal did not close');
      evidence.checks.push('flow-modal-open-close');
    progress('flow-modal-open-close-done');
    } else {
      throw new Error('Flow modal opener is missing');
    }
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    progress('evidence-written');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
'@
    Set-Content -LiteralPath $browserScript -Value $browserCode -Encoding utf8

    foreach ($mode in @('public', 'local')) {
        $server = Start-IsolatedServer $mode
        try {
            $inventory = Wait-ForInventory $server
            $expectedMode = if ($mode -eq 'public') { 'public' } else { 'local' }
            if ($inventory.distributionMode -ne $expectedMode) { throw "$mode server returned inventory mode $($inventory.distributionMode)" }
            $browserProfile = Join-Path $taskRoot "browser-$mode"
            $evidencePath = Join-Path $taskRoot "evidence-$mode.json"
            $screenshotDir = Join-Path $taskRoot "screenshots-$mode"
            $progressPath = Join-Path $taskRoot "browser-$mode.progress.log"
            New-Item -ItemType Directory -Path $browserProfile -Force | Out-Null
            New-Item -ItemType Directory -Path $screenshotDir -Force | Out-Null
            Invoke-IsolatedBrowserCheck @(
                $browserScript,
                $server.BaseUrl,
                $mode,
                (ConvertTo-Json -Compress -InputObject $script:closedBetaIds),
                $evidencePath,
                $browserProfile,
                $screenshotDir,
                $browserExecutable,
                $progressPath
            )
        } finally {
            Stop-IsolatedServer
        }
    }

    Write-Output "ACCEPTANCE=PASS"
    Write-Output "CANDIDATE=$candidate"
    Write-Output "EVIDENCE=$evidencePath"
    Write-Output 'SCOPE=isolated source checkout, temporary profile, no-op plugin fixtures, localhost only; not OBS/live acceptance.'
} catch {
    Write-Error $_
    exit 1
} finally {
    Stop-IsolatedServer
    if (-not $KeepArtifacts -and (Test-Path -LiteralPath $taskRoot)) {
        Assert-WithinTemp $taskRoot
        $nodeModulesLink = Join-Path $appRoot 'node_modules'
        if (-not $PreparedCandidatePath -and (Test-Path -LiteralPath $nodeModulesLink)) {
            $linkItem = Get-Item -LiteralPath $nodeModulesLink -Force
            $linkTarget = [string](@($linkItem.Target)[0])
            $isNotReparsePoint = (($linkItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0)
            $targetIsUnexpected = [IO.Path]::GetFullPath($linkTarget) -ne [IO.Path]::GetFullPath((Join-Path $repoRoot 'app/node_modules'))
            if ($isNotReparsePoint -or $targetIsUnexpected) {
                throw 'Refusing to remove unexpected node_modules link during cleanup.'
            }
            Remove-Item -LiteralPath $nodeModulesLink -Force
        }
        Remove-Item -LiteralPath $taskRoot -Recurse -Force
    } elseif (Test-Path -LiteralPath $taskRoot) {
        Write-Output "ARTIFACTS=$taskRoot"
    }
}
