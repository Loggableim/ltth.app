const fs = require('fs');
const path = require('path');

describe('Fireworks Dev lifecycle and connect guards', () => {
  let navigationJs;
  let pluginRoutesJs;
  let pluginEnableJs;
  let serverJs;
  let eulerAdapterJs;

  beforeAll(() => {
    navigationJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'navigation.js'), 'utf8');
    pluginRoutesJs = fs.readFileSync(path.join(__dirname, '..', 'routes', 'plugin-routes.js'), 'utf8');
    pluginEnableJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-enable.js'), 'utf8');
    serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    eulerAdapterJs = fs.readFileSync(path.join(__dirname, '..', 'modules', 'adapters', 'EulerstreamAdapter.js'), 'utf8');
  });

  test('keeps plugin shells visible and reloads the actual plugin view iframe', () => {
    expect(navigationJs).toContain("document.getElementById(`view-${pluginId}`)");
    expect(navigationJs).toContain("element.dataset.pluginState = isEnabled ? 'enabled' : 'disabled'");
    expect(navigationJs).toContain("element.classList.toggle('plugin-disabled', !isEnabled)");
    expect(navigationJs).toContain("element.setAttribute('aria-disabled', isEnabled ? 'false' : 'true')");
  });

  test('surfaces fireworks-dev conflict metadata in plugin listings and enable failures', () => {
    expect(pluginRoutesJs).toContain("devFireworks.conflictWith = stableFireworksEnabled ? 'fireworks' : null");
    expect(pluginRoutesJs).toContain("devFireworks.unavailableReason = stableFireworksEnabled && !devFireworks.enabled");
    expect(pluginRoutesJs).toContain("code: conflictWith ? 'PLUGIN_CONFLICT' : 'PLUGIN_ENABLE_FAILED'");
    expect(pluginRoutesJs).toContain('res.status(conflictWith ? 409 : 500).json');
    expect(pluginEnableJs).toContain("statusMsg.textContent = error && error.message ? error.message : errorText");
  });

  test('returns controlled restart responses instead of raw diagnostics failures', () => {
    expect(serverJs).toContain('function buildRestartingApiState(endpoint)');
    expect(serverJs).toContain("return res.status(503).json(buildRestartingApiState('diagnostics'))");
    expect(serverJs).toContain("return res.status(503).json(buildRestartingApiState('connection-health'))");
    expect(serverJs).toContain('restarting: serverRestartScheduled');
  });

  test('reports reconnect windows explicitly for transient Eulerstream disconnects', () => {
    expect(eulerAdapterJs).toContain("this.broadcastStatus('retrying', {");
    expect(eulerAdapterJs).toContain('Eulerstream returned 1011 INTERNAL_SERVER_ERROR. Retrying automatically.');
    expect(eulerAdapterJs).toContain("status = 'reconnecting'");
    expect(eulerAdapterJs).toContain('Retry ${this.autoReconnectCount}/${this.maxAutoReconnects} in progress');
  });
});
