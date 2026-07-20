'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const CASE_NAMES = Object.freeze([
  'atlas',
  'capacity',
  'recovery',
  'admission-envelope',
  'telemetry-adaptive',
  'boykisser'
]);
const ACCEPTED_CASES = new Set([...CASE_NAMES, 'all']);
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'webgpu-fireworks-chrome-harness.html');
const APP_ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(APP_ROOT, 'plugins', 'webgpu-fireworks');
const POLICY_SCRIPT_PATH = '/plugins/webgpu-fireworks/gpu/spawn-command-policy.js';
const SCRIPT_PATH = '/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js';

function requireCaseName(argv) {
  if (argv.length !== 3 || !ACCEPTED_CASES.has(argv[2])) {
    throw new Error(`usage: node ${path.basename(__filename)} <${[...ACCEPTED_CASES].join('|')}>`);
  }
  return argv[2];
}

function requireInstalledChrome() {
  const configuredPath = process.env.LTTH_CHROME_PATH;
  if (!configuredPath) throw new Error('LTTH_CHROME_PATH is required');
  const resolvedPath = path.resolve(configuredPath);
  let stat;
  try {
    stat = fs.statSync(resolvedPath);
  } catch (_) {
    throw new Error(`LTTH_CHROME_PATH does not exist: ${resolvedPath}`);
  }
  if (!stat.isFile()) throw new Error(`LTTH_CHROME_PATH is not a file: ${resolvedPath}`);
  return fs.realpathSync.native(resolvedPath);
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  if (pathname === '/' || pathname === '/webgpu-fireworks-chrome-harness.html') return FIXTURE_PATH;
  const prefix = '/plugins/webgpu-fireworks/';
  if (!pathname.startsWith(prefix)) return null;
  const relativePath = pathname.slice(prefix.length).split('/').filter(Boolean);
  if (relativePath.some(part => part === '..')) return null;
  const resolvedPath = path.resolve(PLUGIN_ROOT, ...relativePath);
  const relativeToRoot = path.relative(PLUGIN_ROOT, resolvedPath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null;
  return resolvedPath;
}

async function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    const filePath = resolveRequestPath(request.url || '/');
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentType(filePath)
    });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function chooseWebGpuFeatureStatus(featureStatus) {
  const entries = Object.entries(featureStatus || {});
  const selected = entries.find(([key]) => key.toLowerCase() === 'webgpu') ||
    entries.find(([key]) => key.toLowerCase().includes('webgpu'));
  if (!selected) throw new Error('CDP SystemInfo.getInfo contains no WebGPU feature status');
  const [key, status] = selected;
  const normalizedStatus = String(status).toLowerCase();
  if (/disabled|unavailable|software|blocked|fallback/.test(normalizedStatus)) {
    throw new Error(`CDP reports non-hardware WebGPU status: ${key}=${status}`);
  }
  if (!/enabled/.test(normalizedStatus)) {
    throw new Error(`CDP does not report enabled WebGPU: ${key}=${status}`);
  }
  return { key, status };
}

function choosePrimaryDevice(gpuInfo) {
  const devices = gpuInfo?.devices || [];
  const selected = devices.find(device => device.active === true) || devices[0];
  if (!selected) throw new Error('CDP SystemInfo.getInfo contains no GPU device');
  return JSON.parse(JSON.stringify(selected));
}

function resolveD3dBackend(gpuInfo, cdpDevice) {
  const auxAttributes = gpuInfo?.auxAttributes || {};
  const backendEntries = Object.entries(auxAttributes)
    .filter(([key]) => /renderer|backend|angle|version|device|driver/i.test(key));
  const evidence = JSON.stringify({ cdpDevice, auxAttributes: Object.fromEntries(backendEntries) });
  if (/swiftshader|llvmpipe|software|fallback/i.test(evidence)) {
    throw new Error(`CDP GPU evidence reports a software/fallback renderer: ${evidence}`);
  }
  if (/d3d12|direct3d\s*12/i.test(evidence)) return 'd3d12';
  if (/d3d11|direct3d\s*11/i.test(evidence)) return 'd3d11';
  throw new Error(`CDP GPU evidence contains no D3D11/D3D12 backend: ${evidence}`);
}

function assertAdapter(adapterInfo) {
  if (!adapterInfo || typeof adapterInfo !== 'object') {
    throw new Error('page returned no WebGPU adapter info');
  }
  const adapterText = Object.values(adapterInfo).filter(value => typeof value === 'string').join(' ');
  if (adapterInfo.isFallbackAdapter === true || /swiftshader|llvmpipe|software|fallback/i.test(adapterText)) {
    throw new Error(`GPUAdapter.info reports a software/fallback adapter: ${adapterText}`);
  }
}

function assertAtlasResult(result) {
  if (!result || result.skipped === true) throw new Error('atlas case is missing or skipped');
  if (result.uniqueUrls !== 1000) throw new Error(`atlas uniqueUrls must be 1000, got ${result.uniqueUrls}`);
  if (result.maxLiveSlots !== 63) throw new Error(`atlas maxLiveSlots must be 63, got ${result.maxLiveSlots}`);
  const expectedReusedSlots = result.uniqueUrls - result.maxLiveSlots;
  if (result.fallbackWhilePinned !== 1) {
    throw new Error(`atlas fallbackWhilePinned must be exactly 1, got ${result.fallbackWhilePinned}`);
  }
  if (result.reusedSlots !== expectedReusedSlots) {
    throw new Error(`atlas reusedSlots must be ${expectedReusedSlots}, got ${result.reusedSlots}`);
  }
  if (result.centerSamples !== result.reusedSlots) {
    throw new Error(`atlas centerSamples must equal reusedSlots, got ${result.centerSamples}`);
  }
  if (result.edgeSamples !== result.reusedSlots * 4) {
    throw new Error(`atlas edgeSamples must equal reusedSlots * 4, got ${result.edgeSamples}`);
  }
  const releasePasses = 1 + Math.ceil(result.reusedSlots / result.maxLiveSlots);
  const expectedReleasedPins = result.maxLiveSlots * releasePasses;
  if (result.releasedPins !== expectedReleasedPins) {
    throw new Error(`atlas releasedPins must be ${expectedReleasedPins}, got ${result.releasedPins}`);
  }
  if (result.neighborBleedPixels !== 0) {
    throw new Error(`atlas detected ${result.neighborBleedPixels} neighbor-contaminated samples`);
  }
  if (result.cleanupComplete !== true) throw new Error('atlas renderer cleanup did not complete');
}

function assertCapacityResult(result) {
  if (!result || result.skipped === true) throw new Error('capacity case is missing or skipped');
  const expectedCapacities = [512, 16_384];
  if (!Number.isInteger(result.particleStride) || result.particleStride <= 0) {
    throw new Error(`capacity result has no valid particle stride: ${result.particleStride}`);
  }
  const expectedBufferBytes = expectedCapacities.map(capacity => capacity * result.particleStride);
  if (JSON.stringify(result.capacities) !== JSON.stringify(expectedCapacities)) {
    throw new Error(`capacity requests mismatch: ${JSON.stringify(result.capacities)}`);
  }
  if (JSON.stringify(result.activeCapacities) !== JSON.stringify(expectedCapacities)) {
    throw new Error(`capacity active values mismatch: ${JSON.stringify(result.activeCapacities)}`);
  }
  if (JSON.stringify(result.bufferByteSizes) !== JSON.stringify(expectedBufferBytes)) {
    throw new Error(`capacity buffer byte sizes mismatch: ${JSON.stringify(result.bufferByteSizes)}`);
  }
  if (!Array.isArray(result.generations) || result.generations.length !== 2 ||
      result.generations[0] === result.generations[1] ||
      !(result.generations[1] > result.generations[0])) {
    throw new Error(`capacity generations are not distinct and increasing: ${JSON.stringify(result.generations)}`);
  }
  if (!Array.isArray(result.transitions) || result.transitions.length !== 2) {
    throw new Error('capacity transitions must contain two hardware observations');
  }
  for (const [index, transition] of result.transitions.entries()) {
    const expectedCapacity = expectedCapacities[index];
    if (transition.requestedCapacity !== expectedCapacity ||
        transition.acknowledgedCapacity !== expectedCapacity ||
        transition.activeCapacity !== expectedCapacity) {
      throw new Error(`capacity acknowledgement mismatch at transition ${index}: ${JSON.stringify(transition)}`);
    }
    if (!transition.counters || !Number.isInteger(transition.counters.activeParticles) ||
        !Number.isInteger(transition.counters.droppedParticles)) {
      throw new Error(`capacity transition ${index} contains no counter readback`);
    }
  }
  const expectedValidation = [511, 16_385];
  if (!Array.isArray(result.validationErrors) || result.validationErrors.length !== 2 ||
      result.validationErrors.some((entry, index) => (
        entry.capacity !== expectedValidation[index] || entry.code !== 'INVALID_PARTICLE_CAPACITY'
      ))) {
    throw new Error(`capacity validation evidence mismatch: ${JSON.stringify(result.validationErrors)}`);
  }
  if (result.validationPreserved !== true) throw new Error('invalid capacity changed the active renderer');
  if (result.deviceIdentityStable !== true) throw new Error('capacity case changed the WebGPU device');
  if (result.cleanupComplete !== true) throw new Error('capacity renderer cleanup did not complete');
}

function assertRecoveryResult(result) {
  if (!result || result.skipped === true) throw new Error('recovery case is missing or skipped');
  if (result.deviceCount !== 3 || result.distinctDeviceCount !== 3) {
    throw new Error(
      `recovery must observe three distinct devices, got ${result.deviceCount}/${result.distinctDeviceCount}`
    );
  }
  if (result.recoveries !== 2) {
    throw new Error(`recovery count must be 2, got ${result.recoveries}`);
  }
  if (!Array.isArray(result.deviceIdentities) || result.deviceIdentities.length !== 3 ||
      result.deviceIdentities.some(entry => !entry?.id || entry.distinctFromPrevious !== true)) {
    throw new Error(`recovery device identities are incomplete: ${JSON.stringify(result.deviceIdentities)}`);
  }
  if (!Array.isArray(result.generations) || result.generations.length !== 3 ||
      result.generations.some((generation, index) => (
        !Number.isInteger(generation) || (index > 0 && generation <= result.generations[index - 1])
      ))) {
    throw new Error(`recovery generations are not strictly increasing: ${JSON.stringify(result.generations)}`);
  }
  if (!Array.isArray(result.recoveredGenerations) ||
      JSON.stringify(result.recoveredGenerations) !== JSON.stringify(result.generations.slice(1))) {
    throw new Error(
      `recovered generation evidence mismatch: ${JSON.stringify(result.recoveredGenerations)}`
    );
  }
  if (result.staleReadbacksApplied !== 0) {
    throw new Error(`recovery applied ${result.staleReadbacksApplied} stale readbacks`);
  }
  if (result.staleCommandsUploaded !== 0) {
    throw new Error(`recovery uploaded ${result.staleCommandsUploaded} stale commands`);
  }
  if (result.staleCommandsDropped !== 2) {
    throw new Error(`recovery must drop exactly two stale commands, got ${result.staleCommandsDropped}`);
  }
  if (!Array.isArray(result.ownerInvalidations) || result.ownerInvalidations.length !== 2 ||
      new Set(result.ownerInvalidations.map(entry => entry.ownerToken)).size !== 2 ||
      result.ownerInvalidations.some(entry => entry.reason !== 'device-lost')) {
    throw new Error(`recovery owner invalidations mismatch: ${JSON.stringify(result.ownerInvalidations)}`);
  }
  if (!Array.isArray(result.pendingReadbacksAtLoss) ||
      JSON.stringify(result.pendingReadbacksAtLoss) !== JSON.stringify([true, true])) {
    throw new Error(
      `recovery did not observe a pending native readback at both losses: ${JSON.stringify(result.pendingReadbacksAtLoss)}`
    );
  }
  if (result.cleanupComplete !== true) throw new Error('recovery renderer cleanup did not complete');
}

async function collectCleanupFailure(failures, label, cleanup) {
  try {
    await cleanup();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    failures.push(new Error(`${label} failed: ${message}`, { cause: error }));
  }
}

async function main() {
  const caseName = requireCaseName(process.argv);
  const executablePath = requireInstalledChrome();

  const { chromium } = require('playwright');
  let browser;
  let context;
  let page;
  let server;
  let profilePath;
  let cdp;
  let runFailure;
  let terminalPassLine;
  let diagnostics;
  const consoleErrors = [];

  try {
    profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-webgpu-fireworks-'));
    server = await startServer();
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath,
      headless: true,
      args: [
        '--enable-unsafe-webgpu',
        '--disable-software-rasterizer',
        '--enable-features=WebGPU'
      ]
    });
    browser = context.browser();
    page = context.pages()[0] || await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));

    const address = server.address();
    const fixtureUrl = new URL(`http://127.0.0.1:${address.port}/webgpu-fireworks-chrome-harness.html`);
    fixtureUrl.searchParams.append('script', POLICY_SCRIPT_PATH);
    fixtureUrl.searchParams.append('script', SCRIPT_PATH);
    await page.goto(fixtureUrl.href, { waitUntil: 'load' });
    const pageEvidence = await page.evaluate(name => window.runWebGpuFireworksCase(name), caseName);

    cdp = await browser.newBrowserCDPSession();
    const systemInfo = await cdp.send('SystemInfo.getInfo');
    assertAdapter(pageEvidence.adapterInfo);
    const cdpDevice = choosePrimaryDevice(systemInfo.gpu);
    const webgpuFeatureStatus = chooseWebGpuFeatureStatus(systemInfo.gpu?.featureStatus);
    const backend = resolveD3dBackend(systemInfo.gpu, cdpDevice);
    const hardware = {
      executablePath,
      adapterInfo: pageEvidence.adapterInfo,
      cdpDevice,
      webgpuFeatureStatus,
      backend,
      fallback: false,
      verdict: 'hardware-d3d'
    };

    diagnostics = [
      `Chrome executable: ${executablePath}`,
      `GPUAdapter.info: ${JSON.stringify(pageEvidence.adapterInfo)}`,
      `CDP primary GPU device: ${JSON.stringify(cdpDevice)}`,
      `CDP WebGPU feature status: ${JSON.stringify(webgpuFeatureStatus)}`,
      `CDP D3D backend evidence: ${backend}`,
    ];

    let payload;
    if (caseName === 'all') {
      const cases = pageEvidence.cases;
      if (!cases || Object.keys(cases).length !== CASE_NAMES.length ||
          !CASE_NAMES.every(name => Object.prototype.hasOwnProperty.call(cases, name))) {
        throw new Error('all case did not return the exact case set');
      }
      const skippedCase = CASE_NAMES.find(name => cases[name]?.skipped === true);
      if (skippedCase) throw new Error(`all cannot pass while ${skippedCase} is skipped`);
      assertAtlasResult(cases.atlas);
      assertCapacityResult(cases.capacity);
      assertRecoveryResult(cases.recovery);
      payload = { hardware, cases };
    } else {
      if (caseName === 'atlas') assertAtlasResult(pageEvidence.result);
      if (caseName === 'capacity') assertCapacityResult(pageEvidence.result);
      if (caseName === 'recovery') assertRecoveryResult(pageEvidence.result);
      payload = { hardware, result: pageEvidence.result };
    }
    terminalPassLine = `PASS ${caseName} ${JSON.stringify(payload)}`;
  } catch (error) {
    runFailure = error;
  }

  const cleanupFailures = [];
  if (page && !page.isClosed()) {
    await collectCleanupFailure(cleanupFailures, 'page close', () => page.close());
  }
  if (cdp) {
    const session = cdp;
    cdp = undefined;
    await collectCleanupFailure(cleanupFailures, 'CDP detach', () => session.detach());
  }
  if (browser) {
    await collectCleanupFailure(cleanupFailures, 'browser close', () => browser.close());
  } else if (context) {
    await collectCleanupFailure(cleanupFailures, 'browser context close', () => context.close());
  }
  await collectCleanupFailure(cleanupFailures, 'server close', () => closeServer(server));
  if (profilePath) {
    await collectCleanupFailure(cleanupFailures, 'temporary profile removal', () => {
      fs.rmSync(profilePath, { recursive: true, force: true });
    });
  }
  await Promise.resolve();
  if (consoleErrors.length) {
    cleanupFailures.push(new Error(consoleErrors.join('\n')));
  }

  const failures = [runFailure, ...cleanupFailures].filter(Boolean);
  if (failures.length) {
    throw new AggregateError(failures, `WebGPU Fireworks ${caseName} failed before terminal acceptance`);
  }

  for (const diagnostic of diagnostics) console.log(diagnostic);
  console.log(terminalPassLine);
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  if (error instanceof AggregateError) {
    for (const inner of error.errors) console.error(inner && inner.stack ? inner.stack : inner);
  }
  process.exitCode = 1;
});
