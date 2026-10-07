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

function createActualOverlayContext() {
  const html = fs.readFileSync(path.join(__dirname, '../overlay/openshock_overlay.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/openshock' });
  const handlers = new Map();
  const socket = {
    on: jest.fn((event, handler) => {
      handlers.set(event, handler);
      return socket;
    }),
    off: jest.fn((event, handler) => {
      if (handlers.get(event) === handler) handlers.delete(event);
      return socket;
    }),
    disconnect: jest.fn(),
    connect: jest.fn(),
    connected: true
  };
  let nextTimerId = 0;
  const timeouts = new Map();
  const intervals = new Map();
  const context = {
    window: dom.window,
    document: dom.window.document,
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    fetch: jest.fn(),
    io: jest.fn(() => socket),
    setTimeout: jest.fn((callback, delay) => {
      const id = ++nextTimerId;
      timeouts.set(id, { callback, delay });
      return id;
    }),
    clearTimeout: jest.fn(id => timeouts.delete(id)),
    setInterval: jest.fn((callback, delay) => {
      const id = ++nextTimerId;
      intervals.set(id, { callback, delay });
      return id;
    }),
    clearInterval: jest.fn(id => intervals.delete(id)),
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
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../overlay/openshock_overlay.js'), 'utf8'), context);
  return { dom, context, socket, handlers, timeouts, intervals };
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
        pattern: { id: 'pattern-1', steps: [{ intensity: 35, duration: 500 }] }
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
        pattern: { steps: [{ intensity: 35, duration: 500 }] }
      }),
      type: 'vibrate',
      intensity: 55,
      duration: 900,
      deviceName: 'Collar',
      username: 'alice',
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

  test('original overlay renders safe display fields into actual HTML and never falls back to raw IDs', () => {
    const { dom, context } = createActualOverlayContext();
    try {
      const normalized = context.normalizeCommandPayload({
        command: {
          type: 'vibrate', intensity: 42, duration: 1200,
          pattern: { id: 'private-pattern-id', steps: [{ intensity: 40, duration: 300, token: 'private-step-token' }] }
        },
        deviceName: '<img id="device-xss" src=x>',
        deviceId: 'private-device-id',
        username: '<svg id="user-xss">',
        userId: 'private-user-id',
        source: '<script id="source-xss">',
        apiKey: 'private-api-key',
        sessionId: 'private-session-id'
      });

      expect(normalized).not.toHaveProperty('deviceId');
      expect(normalized).not.toHaveProperty('userId');
      expect(JSON.stringify(normalized)).not.toContain('private-pattern-id');
      expect(JSON.stringify(normalized)).not.toContain('private-step-token');
      expect(JSON.stringify(normalized)).not.toContain('private-api-key');
      expect(JSON.stringify(normalized)).not.toContain('private-session-id');
      expect(normalized.deviceName).toBe('<img id="device-xss" src=x>');
      expect(normalized.pattern).toEqual({ steps: [{ intensity: 40, duration: 300 }] });

      context.showEvent(normalized);
      const document = dom.window.document;
      expect(document.getElementById('event-type').textContent).toBe('VIBRATE');
      expect(document.getElementById('event-type').classList.contains('vibrate')).toBe(true);
      expect(document.getElementById('event-device').textContent).toBe('<img id="device-xss" src=x>');
      expect(document.getElementById('event-user').textContent).toBe('<svg id="user-xss">');
      expect(document.getElementById('event-source').textContent).toBe('<script id="source-xss">');
      expect(document.querySelector('#device-xss, #user-xss, #source-xss')).toBeNull();

      const idOnly = context.normalizeCommandPayload({ deviceId: 'private-device-id', userId: 'private-user-id' });
      expect(idOnly.deviceName).toBe('Unknown Device');
      expect(JSON.stringify(idOnly)).not.toContain('private-device-id');
      expect(JSON.stringify(idOnly)).not.toContain('private-user-id');
    } finally {
      dom.window.close();
    }
  });

  test('overlay normalization rejects invalid types and out-of-range display values', () => {
    const { dom, context } = createActualOverlayContext();
    try {
      for (const payload of [
        { type: 'shock<script>' },
        { type: { value: 'shock' } },
        { intensity: -1 },
        { intensity: 101 },
        { intensity: '50' },
        { intensity: Number.POSITIVE_INFINITY },
        { duration: -1 },
        { duration: Number.NaN },
        { duration: '1000' }
      ]) {
        expect(context.normalizeCommandPayload(payload)).toBeNull();
      }
      expect(context.normalizeCommandPayload({ type: 'shock', intensity: 100, duration: 0 })).toMatchObject({
        type: 'shock', intensity: 100, duration: 0
      });
    } finally {
      dom.window.close();
    }
  });

  test('pagehide cleanup is idempotent, clears timers and ignores saved socket callbacks', () => {
    const { dom, context, socket, handlers, timeouts, intervals } = createActualOverlayContext();
    try {
      context.initializeSocket();
      const commandHandler = handlers.get('openshock:command-sent');
      context.handleCommandSent({ type: 'vibrate', intensity: 40, duration: 1000, username: 'Fixture Viewer' });
      expect(timeouts.size).toBeGreaterThan(0);
      expect(intervals.size).toBe(1);

      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      dom.window.dispatchEvent(new dom.window.Event('beforeunload'));

      expect(socket.disconnect).toHaveBeenCalledTimes(1);
      expect(socket.off).toHaveBeenCalled();
      expect(handlers.size).toBe(0);
      expect(timeouts.size).toBe(0);
      expect(intervals.size).toBe(0);
      const visibleUser = dom.window.document.getElementById('event-user').textContent;
      commandHandler({ type: 'sound', intensity: 10, duration: 100, username: 'Late Fixture Event' });
      expect(dom.window.document.getElementById('event-user').textContent).toBe(visibleUser);
      expect(socket.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      dom.window.close();
    }
  });

  test('beforeunload and persisted pagehide preserve live renderer state until BFCache restore', () => {
    const { dom, context, socket, handlers, timeouts, intervals } = createActualOverlayContext();
    try {
      context.initializeSocket();
      context.handleCommandSent({ type: 'vibrate', intensity: 40, duration: 1000, username: 'Fixture Viewer' });
      const commandHandler = handlers.get('openshock:command-sent');
      const timerIds = [...timeouts.keys()];
      const intervalIds = [...intervals.keys()];

      dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
      const persistedHide = new dom.window.Event('pagehide');
      Object.defineProperty(persistedHide, 'persisted', { value: true });
      dom.window.dispatchEvent(persistedHide);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(handlers.get('openshock:command-sent')).toBe(commandHandler);
      expect([...timeouts.keys()]).toEqual(timerIds);
      expect([...intervals.keys()]).toEqual(intervalIds);
      expect(vm.runInContext('disposed', context)).toBe(false);

      socket.connected = false;
      const persistedShow = new dom.window.Event('pageshow');
      Object.defineProperty(persistedShow, 'persisted', { value: true });
      dom.window.dispatchEvent(persistedShow);
      expect(socket.connect).toHaveBeenCalledTimes(1);
      expect(socket.disconnect).not.toHaveBeenCalled();

      commandHandler({ type: 'sound', intensity: 10, duration: 100, username: 'Restored Fixture Event' });
      expect(vm.runInContext('eventQueue.length', context)).toBe(1);
      expect(vm.runInContext('eventQueue[0].username', context)).toBe('Restored Fixture Event');

      const finalHide = new dom.window.Event('pagehide');
      dom.window.dispatchEvent(finalHide);
      dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
      dom.window.dispatchEvent(finalHide);
      expect(socket.disconnect).toHaveBeenCalledTimes(1);
      expect(handlers.size).toBe(0);
      expect(timeouts.size).toBe(0);
      expect(intervals.size).toBe(0);
      expect(vm.runInContext('disposed', context)).toBe(true);
      commandHandler({ type: 'shock', intensity: 10, duration: 100, username: 'Late Fixture Event' });
      expect(vm.runInContext('eventQueue.length', context)).toBe(0);
    } finally {
      dom.window.close();
    }
  });
});
