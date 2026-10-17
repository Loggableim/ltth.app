'use strict';

// No-network bridge fixture: controlled NetworkManager children -> exact
// GET /api/network/config callback extracted from server.js -> original
// network-settings.js DOM -> clipboard. No Express app or listener is built.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const Module = require('node:module');
const { parse } = require(path.join(__dirname, '../../app/node_modules/acorn'));
const { JSDOM } = require(path.join(__dirname, '../../app/node_modules/jsdom'));
const appRoot = path.resolve(__dirname, '../../app');
const serverPath = path.join(appRoot, 'server.js');
const networkManagerPath = path.join(appRoot, 'modules/network-manager.js');
const settingsPath = path.join(appRoot, 'public/js/network-settings.js');
const tunnelUiPath = path.join(appRoot, 'public/js/network-overlay-tunnel.js');
const logger = { info() {}, warn() {}, error() {} };

function findNetworkConfigGetHandler(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  let handlerNode = null;
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' &&
        node.callee.object?.type === 'Identifier' && node.callee.object.name === 'app' &&
        node.callee.property?.type === 'Identifier' && node.callee.property.name === 'get' &&
        node.arguments[0]?.type === 'Literal' && node.arguments[0].value === '/api/network/config') {
      handlerNode = node.arguments.at(-1);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'start' && key !== 'end') visit(value);
    }
  };
  visit(ast);
  assert(handlerNode && ['ArrowFunctionExpression', 'FunctionExpression'].includes(handlerNode.type),
    'exact GET /api/network/config inline handler must exist in server.js');
  return source.slice(handlerNode.start, handlerNode.end);
}

function createControlledChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => true;
  return child;
}

async function startSyntheticTunnel(manager, child, hostname) {
  const starting = manager.ensureOverlayQuickTunnel(3000);
  await new Promise(resolve => setImmediate(resolve));
  child.stderr.write(`https://${hostname}.trycloudflare.com\n`);
  const result = await starting;
  assert.equal(result.tunnelURL, `https://${hostname}.trycloudflare.com`);
  return result;
}

function createRouteResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function createUi({ manager, handler, clipboardWrite }) {
  const dom = new JSDOM(`
    <div class="settings-card">
      <select id="network-bind-mode"><option value="local">Local</option></select>
      <div id="network-overlay-tunnel-status"></div>
      <div id="network-overlay-tunnel-url"><span id="network-overlay-tunnel-url-text"></span></div>
      <button id="network-overlay-tunnel-copy"></button>
      <button id="network-overlay-tunnel-stop"></button>
      <div id="network-overlay-tunnel-error"></div>
    </div>
  `, { url: 'http://127.0.0.1:3000/dashboard.html#settings', runScripts: 'outside-only' });
  const { window } = dom;
  const requests = [];
  window.setInterval = () => 1;
  window.clearInterval = () => {};
  Object.defineProperty(window.document, 'visibilityState', { configurable: true, value: 'visible' });
  window.document.querySelector('.settings-card').getClientRects = () => [{}];
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWrite }
  });
  window.showToast = () => {};
  window.console = { log() {}, info() {}, warn() {}, error() {} };
  window.fetch = async (url, options) => {
    assert.equal(url, '/api/network/config', 'renderer should read only the existing config endpoint');
    requests.push([url, options]);
    const response = createRouteResponse();
    // Execute the exact currently-shipped app.get callback extracted above.
    handler({ method: 'GET', path: '/api/network/config' }, response);
    return { ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, json: async () => response.body };
  };

  const tunnelUI = require(tunnelUiPath);
  window.LTTHNetworkOverlayTunnel = {
    render: (config, { translate }) => tunnelUI.render(config, {
      getElementById: id => window.document.getElementById(id), translate
    }),
    copyTunnelURL: url => tunnelUI.copyTunnelURL(url, { navigatorRef: window.navigator })
  };
  window.eval(fs.readFileSync(settingsPath, 'utf8'));
  return { dom, window, requests, manager };
}

async function settleUi() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

async function runFixture() {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === networkManagerPath && request === './logger') return logger;
    return originalLoad.call(this, request, parent, isMain);
  };

  let NetworkManager;
  try {
    NetworkManager = require(networkManagerPath);
  } finally {
    Module._load = originalLoad;
  }
  assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined, 'logger.js must stay unloaded');

  const firstChild = createControlledChild();
  const recoveryChild = createControlledChild();
  const children = [firstChild, recoveryChild];
  const manager = new NetworkManager({ getSetting: () => null, setSetting() {} }, {
    spawnImpl: () => children.shift(),
    overlayTunnelTimeoutMs: 1000,
    cloudflaredBinaryManager: {
      ensureInstalled: async () => 'synthetic-cloudflared-path',
      getQuickTunnelConfigPath: () => 'synthetic-config-path'
    }
  });
  manager.init();

  const serverSource = fs.readFileSync(serverPath, 'utf8');
  const handlerSource = findNetworkConfigGetHandler(serverSource);
  assert.match(handlerSource, /networkManager\.getConfig\(PORT\s*\|\|\s*3000\)/);
  const handlerFactory = new Function('networkManager', 'PORT', 'logger', `return (${handlerSource});`);
  const getNetworkConfigHandler = handlerFactory(manager, 3000, logger);

  const clipboardValues = [];
  let ui;

  try {
    const initial = await startSyntheticTunnel(manager, firstChild, 'bridge-first');
    ui = createUi({
      manager,
      handler: getNetworkConfigHandler,
      clipboardWrite: async value => { clipboardValues.push(value); }
    });
    await settleUi();
    assert.deepEqual(ui.requests[0], ['/api/network/config', undefined]);
    assert.equal(ui.window.document.getElementById('network-overlay-tunnel-url-text').textContent, initial.tunnelURL);
    assert.equal(ui.window.document.getElementById('network-overlay-tunnel-copy').disabled, false);

    firstChild.exitCode = 1;
    firstChild.emit('exit', 1);
    ui.window.dispatchEvent(new ui.window.Event('focus'));
    await settleUi();
    assert.equal(ui.window.document.getElementById('network-overlay-tunnel-url').style.display, 'none');
    assert.equal(ui.window.document.getElementById('network-overlay-tunnel-url-text').textContent, '');
    assert.equal(ui.window.document.getElementById('network-overlay-tunnel-copy').disabled, true);
    assert.equal(ui.window.document.getElementById('network-overlay-tunnel-error').textContent, 'Quick Tunnel process exited');

    const recovered = await startSyntheticTunnel(manager, recoveryChild, 'bridge-recovered');
    ui.window.dispatchEvent(new ui.window.Event('focus'));
    await settleUi();
    assert.equal(ui.window.document.getElementById('network-overlay-tunnel-url-text').textContent, recovered.tunnelURL);
    assert.equal(ui.window.document.getElementById('network-overlay-tunnel-copy').disabled, false);

    ui.window.document.getElementById('network-overlay-tunnel-copy').click();
    await settleUi();
    assert.deepEqual(clipboardValues, [recovered.tunnelURL], 'copy click must use recovered URL returned by the exact route handler');
    assert(ui.requests.some(([, options]) => options?.cache === 'no-store'), 'copy handler must refresh status before clipboard write');
    assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined);
    console.log('PASS: synthetic NetworkManager exit/restart -> exact server.js GET handler -> original network-settings.js DOM -> clipboard copies recovered URL; no HTTP app/server/listener/network');
  } finally {
    recoveryChild.exitCode = 0;
    recoveryChild.emit('exit', 0);
    if (ui) {
      ui.window.dispatchEvent(new ui.window.PageTransitionEvent('pagehide', { persisted: false }));
      ui.dom.window.close();
    }
  }
}

runFixture().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
