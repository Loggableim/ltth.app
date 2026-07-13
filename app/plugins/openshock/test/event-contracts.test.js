const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const OpenShockPlugin = require('../main');
const pluginManifest = require('../plugin.json');

function createBackendHarness() {
  const emit = jest.fn();
  const plugin = new OpenShockPlugin({
    log: jest.fn(),
    registerRoute: jest.fn(),
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({
        get: jest.fn(),
        all: jest.fn(),
        run: jest.fn()
      })),
      exec: jest.fn()
    })),
    getSocketIO: jest.fn(() => ({ emit: jest.fn(), on: jest.fn() })),
    emit
  });

  plugin.queueManager = {
    getQueueStatus: jest.fn(() => ({ queueSize: 3, pending: 2, processing: 1 })),
    getQueueItems: jest.fn(() => [{ id: 'queue-1' }]),
    currentlyProcessingItem: { id: 'queue-1' }
  };
  plugin.patternExecutor = {
    getActiveExecutions: jest.fn(() => [{ id: 'execution-1' }]),
    getStats: jest.fn(() => ({ active: 1 }))
  };
  plugin.mappingEngine = { getAllMappings: jest.fn(() => []), mappings: new Map() };
  plugin.patternEngine = { getAllPatterns: jest.fn(() => []) };
  plugin.devices = [{ id: 'device-1', name: 'Collar' }];
  plugin.stats.startTime = Date.now() - 60000;

  return { plugin, emit };
}

function createScriptContext(relativeScriptPath, html) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/openshock'
  });

  const consoleMock = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  const socket = {
    on: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn()
  };

  const context = {
    window: dom.window,
    document: dom.window.document,
    console: consoleMock,
    fetch: jest.fn(),
    io: jest.fn(() => socket),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    Number,
    String,
    Array,
    Object,
    Promise
  };

  context.global = context;
  context.globalThis = context;
  dom.window.document.addEventListener = jest.fn();
  dom.window.addEventListener = jest.fn();

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', relativeScriptPath), 'utf8');
  vm.runInContext(source, context, { filename: relativeScriptPath });

  return { dom, context, socket };
}

describe('Hybridshock event contracts', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('publishes Hybridshock as the plugin name', () => {
    expect(pluginManifest.name).toBe('Hybridshock');
  });

  test('broadcasts canonical command payloads with flat aliases for the UI and overlay', () => {
    const { plugin, emit } = createBackendHarness();

    plugin._broadcastCommandSent({
      deviceId: 'device-1',
      deviceName: 'Collar',
      type: 'vibrate',
      intensity: 42,
      duration: 750,
      username: 'alice',
      userId: 'user-7',
      source: 'gift'
    });

    expect(emit).toHaveBeenCalledWith('openshock:command-sent', expect.objectContaining({
      command: expect.objectContaining({
        type: 'vibrate',
        intensity: 42,
        duration: 750,
        pattern: null
      }),
      deviceId: 'device-1',
      deviceName: 'Collar',
      device: 'Collar',
      username: 'alice',
      userId: 'user-7',
      user: 'alice',
      source: 'gift',
      type: 'vibrate',
      intensity: 42,
      duration: 750
    }));
  });

  test('broadcasts queue updates on the new event name and keeps the legacy alias', async () => {
    jest.useFakeTimers();
    const { plugin, emit } = createBackendHarness();

    plugin._broadcastQueueUpdate();
    await jest.advanceTimersByTimeAsync(60);

    const eventNames = emit.mock.calls.map(call => call[0]);
    expect(eventNames).toEqual(expect.arrayContaining([
      'openshock:queue-update',
      'openshock:queue:update'
    ]));

    const canonicalPayload = emit.mock.calls.find(call => call[0] === 'openshock:queue-update')[1];
    const legacyPayload = emit.mock.calls.find(call => call[0] === 'openshock:queue:update')[1];

    expect(canonicalPayload).toMatchObject({
      queueLength: 3,
      queueSize: 3,
      pending: 2,
      processing: 1,
      queueItems: [{ id: 'queue-1' }],
      currentItem: { id: 'queue-1' }
    });
    expect(legacyPayload).toEqual(canonicalPayload);
  });

  test('derives totalCommands and successRate from live queue outcomes', () => {
    const { plugin, emit } = createBackendHarness();

    plugin._recordCommandOutcome(true);
    plugin._recordCommandOutcome(true);
    plugin._recordCommandOutcome(false);
    plugin._broadcastStatsUpdate();

    expect(emit).toHaveBeenCalledWith('openshock:stats-update', expect.objectContaining({
      totalCommands: 3,
      successfulCommands: 2,
      failedCommands: 1,
      successRate: 67,
      queueLength: 3,
      queueSize: 3,
      queuePending: 2,
      queueProcessing: 1,
      activePatternExecutions: 1,
      sessionDuration: expect.any(Number)
    }));
  });

  test('ui script replaces the full device list and renders canonical command payloads', () => {
    const { dom, context } = createScriptContext('ui.js', `
      <!doctype html>
      <html>
        <body>
          <div id="commandLog"></div>
          <div id="devicesList"></div>
          <div id="totalCommands"></div>
          <div id="successRate"></div>
          <div id="uptime"></div>
          <div id="queueLength"></div>
          <div id="queueProcessing"></div>
          <div id="providerStatusText"></div>
        </body>
      </html>
    `);

    context.__renderDeviceListMock = jest.fn();
    context.__updateApiStatusMock = jest.fn();
    context.__updateTestShockDeviceListMock = jest.fn();
    context.__updateMappingDeviceListMock = jest.fn();
    vm.runInContext(`
      renderDeviceList = globalThis.__renderDeviceListMock;
      updateApiStatus = globalThis.__updateApiStatusMock;
      updateTestShockDeviceList = globalThis.__updateTestShockDeviceListMock;
      updateMappingDeviceList = globalThis.__updateMappingDeviceListMock;
      devices = [{ id: 'legacy', name: 'Legacy Device' }];
    `, context);

    context.handleDeviceUpdate({
      devices: [
        { id: 'device-1', name: 'Collar' },
        { id: 'device-2', name: 'Harness' }
      ]
    });

    expect(vm.runInContext('devices', context)).toEqual([
      { id: 'device-1', name: 'Collar' },
      { id: 'device-2', name: 'Harness' }
    ]);
    expect(context.__renderDeviceListMock).toHaveBeenCalled();
    expect(context.__updateApiStatusMock).toHaveBeenCalledWith(true, 2);

    context.renderCommandLog([
      {
        command: { type: 'shock', intensity: 42, duration: 1200 },
        deviceName: 'Collar',
        deviceId: 'device-1',
        timestamp: '2026-07-07T10:00:00.000Z'
      }
    ]);

    const markup = dom.window.document.getElementById('commandLog').innerHTML;
    expect(markup).toContain('shock');
    expect(markup).toContain('Collar');
    expect(markup).toContain('42%');
    expect(markup).toContain('1200ms');
  });

  test('ui stats rendering prefers the backend success rate and uptime snapshot', () => {
    const { dom, context } = createScriptContext('ui.js', `
      <!doctype html>
      <html>
        <body>
          <div id="totalCommands"></div>
          <div id="successRate"></div>
          <div id="uptime"></div>
        </body>
      </html>
    `);

    vm.runInContext(`
      stats = {
        totalCommands: 3,
        successfulCommands: 2,
        failedCommands: 1,
        successRate: 67,
        uptime: 61000
      };
    `, context);
    context.renderStats();

    expect(dom.window.document.getElementById('totalCommands').textContent).toBe('3');
    expect(dom.window.document.getElementById('successRate').textContent).toBe('67%');
    expect(dom.window.document.getElementById('uptime').textContent).toBe('1.0m');
  });

  test('overlay normalizes nested command payloads and queue stats', () => {
    const { dom, context } = createScriptContext('overlay/openshock_overlay.js', `
      <!doctype html>
      <html>
        <body>
          <div id="stats-corner"></div>
          <div id="queue-length"></div>
          <div id="total-commands"></div>
          <div id="active-users"></div>
          <div id="session-duration"></div>
          <div id="event-card" class="hidden">
            <span id="type-icon"></span>
            <span id="type-text"></span>
            <span id="device-name"></span>
            <span id="intensity-value"></span>
            <div id="intensity-fill"></div>
            <span id="duration-value"></span>
            <div id="duration-fill"></div>
            <span id="username"></span>
            <span id="source-badge"></span>
            <div id="pattern-preview" class="hidden">
              <div id="pattern-timeline"></div>
            </div>
            <div id="safety-warning" class="hidden">
              <span id="warning-message"></span>
            </div>
          </div>
        </body>
      </html>
    `);

    context.__processEventMock = jest.fn();
    vm.runInContext(`
      processEvent = globalThis.__processEventMock;
      isProcessingEvent = false;
    `, context);

    context.handleCommandSent({
      command: {
        type: 'vibrate',
        intensity: 55,
        duration: 900,
        pattern: { id: 'pattern-1' }
      },
      deviceName: 'Collar',
      deviceId: 'device-1',
      username: 'alice',
      userId: 'user-1',
      source: 'gift'
    });

    expect(context.__processEventMock).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({
        type: 'vibrate',
        intensity: 55,
        duration: 900,
        pattern: { id: 'pattern-1' }
      }),
      type: 'vibrate',
      intensity: 55,
      duration: 900,
      deviceName: 'Collar',
      deviceId: 'device-1',
      username: 'alice',
      userId: 'user-1',
      source: 'gift'
    }));

    context.updateStatsCorner({
      queueSize: 4,
      totalCommands: 9,
      activeUsers: 3,
      sessionDuration: 125000
    });

    expect(dom.window.document.getElementById('queue-length').textContent).toBe('4');
    expect(dom.window.document.getElementById('total-commands').textContent).toBe('9');
    expect(dom.window.document.getElementById('active-users').textContent).toBe('3');
    expect(dom.window.document.getElementById('session-duration').textContent).toBe('2m 5s');
  });
});
