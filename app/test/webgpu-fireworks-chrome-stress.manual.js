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

async function main() {
  const caseName = requireCaseName(process.argv);
  const executablePath = requireInstalledChrome();

  const { chromium } = require('playwright');
  let browser;
  let context;
  let page;
  let server;
  let profilePath;
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
    fixtureUrl.searchParams.append('script', SCRIPT_PATH);
    await page.goto(fixtureUrl.href, { waitUntil: 'load' });
    const pageEvidence = await page.evaluate(name => window.runWebGpuFireworksCase(name), caseName);
    if (consoleErrors.length) throw new Error(consoleErrors.join('\n'));

    const cdp = await browser.newBrowserCDPSession();
    const systemInfo = await cdp.send('SystemInfo.getInfo');
    await cdp.detach();
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

    console.log(`Chrome executable: ${executablePath}`);
    console.log(`GPUAdapter.info: ${JSON.stringify(pageEvidence.adapterInfo)}`);
    console.log(`CDP primary GPU device: ${JSON.stringify(cdpDevice)}`);
    console.log(`CDP WebGPU feature status: ${JSON.stringify(webgpuFeatureStatus)}`);
    console.log(`CDP D3D backend evidence: ${backend}`);

    let payload;
    if (caseName === 'all') {
      const cases = pageEvidence.cases;
      if (!cases || Object.keys(cases).length !== CASE_NAMES.length ||
          !CASE_NAMES.every(name => Object.prototype.hasOwnProperty.call(cases, name))) {
        throw new Error('all case did not return the exact case set');
      }
      const skippedCase = CASE_NAMES.find(name => cases[name]?.skipped === true);
      if (skippedCase) throw new Error(`all cannot pass while ${skippedCase} is skipped`);
      payload = { hardware, cases };
    } else {
      payload = { hardware, result: pageEvidence.result };
    }
    console.log(`PASS ${caseName} ${JSON.stringify(payload)}`);
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    else if (context) await context.close().catch(() => {});
    await closeServer(server).catch(() => {});
    if (profilePath) fs.rmSync(profilePath, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
