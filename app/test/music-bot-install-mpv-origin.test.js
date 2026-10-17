jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn()
}));

const EventEmitter = require('events');
const { spawn } = require('child_process');
const MusicBotPlugin = require('../plugins/music-bot/main');
const NetworkManager = require('../modules/network-manager');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: jest.fn()
  });
}

function createInstallRoute() {
  const routes = new Map();
  const networkManager = new NetworkManager({ getSetting: () => undefined });
  const isNetworkOriginAllowed = jest.fn((origin, port) => networkManager.isOriginAllowed(origin, port));
  const plugin = new MusicBotPlugin({
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    registerRoute: (method, routePath, handler) => routes.set(`${method}:${routePath}`, handler),
    log: jest.fn()
  });
  plugin._ensureMpv = jest.fn(async () => {});
  plugin._startMpvInstall = jest.fn(async () => ({
    state: 'installing',
    messageKey: 'mpvInstallStarted',
    command: 'fixture package manager'
  }));
  plugin._installMpv = jest.fn(async () => ({
    state: 'installing',
    messageKey: 'mpvInstallStarted',
    command: 'fixture package manager'
  }));
  plugin._registerRoutes();
  return {
    plugin,
    isNetworkOriginAllowed,
    handler: routes.get('post:/api/plugins/music-bot/install/mpv')
  };
}

async function invoke(handler, headers = {}, protocol = 'http', host = 'localhost:3000', isNetworkOriginAllowed) {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  const req = {
    protocol,
    headers: { host, ...headers },
    socket: { localPort: 3000 },
    app: { locals: { isNetworkOriginAllowed } },
    get(name) { return this.headers[String(name).toLowerCase()]; }
  };
  await handler(req, response);
  return response;
}

describe('Music Bot MPV installer same-origin guard', () => {
  afterEach(() => spawn.mockReset());

  test('accepts a normalized same-origin request and delegates to the injected installer stub', async () => {
    const { plugin, isNetworkOriginAllowed, handler } = createInstallRoute();
    const response = await invoke(handler, {
      origin: 'HTTP://LOCALHOST:3000',
      'sec-fetch-site': 'same-origin'
    }, 'http', 'localhost:3000', isNetworkOriginAllowed);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual(expect.objectContaining({ success: true, pending: true }));
    expect(plugin._installMpv).toHaveBeenCalledTimes(1);
    expect(isNetworkOriginAllowed).toHaveBeenCalledWith('http://localhost:3000', 3000);
    expect(plugin._ensureMpv).not.toHaveBeenCalled();
    expect(plugin._startMpvInstall).not.toHaveBeenCalled();
  });

  test('fails closed when the app-scoped network-origin capability is unavailable', async () => {
    const { plugin, handler } = createInstallRoute();

    const response = await invoke(handler, { origin: 'http://localhost:3000' });

    expect(response.statusCode).toBe(403);
    expect(plugin._installMpv).not.toHaveBeenCalled();
    expect(plugin._ensureMpv).not.toHaveBeenCalled();
    expect(plugin._startMpvInstall).not.toHaveBeenCalled();
  });

  test.each([
    ['foreign scheme', { origin: 'https://localhost:3000' }],
    ['foreign host', { origin: 'http://127.0.0.1:3000' }],
    ['foreign port', { origin: 'http://localhost:3001' }],
    ['foreign origin', { origin: 'https://attacker.example' }],
    ['same-origin DNS-rebinding host', { origin: 'http://attacker.example:3000' }, 'attacker.example:3000'],
    ['null origin', { origin: 'null' }],
    ['missing origin', {}],
    ['cross-site fetch metadata', { origin: 'http://localhost:3000', 'sec-fetch-site': 'cross-site' }]
  ])('rejects %s before invoking installer code', async (_label, headers, host = 'localhost:3000') => {
    const { plugin, isNetworkOriginAllowed, handler } = createInstallRoute();

    const response = await invoke(handler, headers, 'http', host, isNetworkOriginAllowed);

    expect(response.statusCode).toBe(403);
    expect(response.payload).toEqual({ success: false, error: 'Same-origin request required' });
    expect(plugin._installMpv).not.toHaveBeenCalled();
    expect(plugin._ensureMpv).not.toHaveBeenCalled();
    expect(plugin._startMpvInstall).not.toHaveBeenCalled();
    if (_label === 'same-origin DNS-rebinding host') {
      expect(isNetworkOriginAllowed).toHaveBeenCalledWith('http://attacker.example:3000', 3000);
    }
  });

  test('shares one in-flight authorized install across concurrent same-origin POSTs and releases after completion', async () => {
    const { plugin, isNetworkOriginAllowed, handler } = createInstallRoute();
    const ensureGate = deferred();
    const commandGate = deferred();
    const child = fakeChild();
    plugin._ensureMpv = jest.fn()
      .mockImplementationOnce(async () => {
        await ensureGate.promise;
        plugin._mpvAvailable = false;
      })
      .mockImplementationOnce(async () => {
        plugin._mpvAvailable = false;
      })
      .mockImplementation(async () => {
        plugin._mpvAvailable = true;
      });
    plugin._getMpvInstallCommand = jest.fn(() => commandGate.promise);
    plugin._startMpvInstall = MusicBotPlugin.prototype._startMpvInstall.bind(plugin);
    plugin._installMpv = MusicBotPlugin.prototype._installMpv.bind(plugin);
    plugin._mpvAvailable = false;
    plugin.io = { emit: jest.fn() };
    spawn.mockReturnValue(child);

    const headers = {
      origin: 'http://localhost:3000',
      'sec-fetch-site': 'same-origin'
    };
    const firstRequest = invoke(handler, headers, 'http', 'localhost:3000', isNetworkOriginAllowed);
    const secondRequest = invoke(handler, headers, 'http', 'localhost:3000', isNetworkOriginAllowed);
    await Promise.resolve();

    expect(plugin._ensureMpv).toHaveBeenCalledTimes(1);
    ensureGate.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(plugin._getMpvInstallCommand).toHaveBeenCalledTimes(1);

    commandGate.resolve({
      executable: 'fixture-package-manager',
      args: ['install', 'mpv'],
      label: 'fixture install mpv'
    });
    const [firstResponse, secondResponse] = await Promise.all([firstRequest, secondRequest]);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(firstResponse.payload).toEqual(expect.objectContaining({ success: true, pending: true }));
    expect(secondResponse.payload).toEqual(expect.objectContaining({ success: true, pending: true }));
    expect(secondResponse.payload.installStatus).toEqual(firstResponse.payload.installStatus);

    const whileInstalling = await invoke(handler, headers, 'http', 'localhost:3000', isNetworkOriginAllowed);
    expect(whileInstalling.payload).toEqual(expect.objectContaining({ success: true, pending: true }));
    expect(whileInstalling.payload.installStatus).toEqual(firstResponse.payload.installStatus);
    expect(spawn).toHaveBeenCalledTimes(1);

    child.emit('close', 0);
    await new Promise((resolve) => setImmediate(resolve));
    expect(plugin._mpvInstallStatus.state).toBe('installed');

    const afterCompletion = await invoke(handler, headers, 'http', 'localhost:3000', isNetworkOriginAllowed);
    expect(afterCompletion.payload).toEqual(expect.objectContaining({ success: true, installed: true }));
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  test('releases the shared installer flight after unavailable and rejected manager lookup', async () => {
    const { plugin, isNetworkOriginAllowed, handler } = createInstallRoute();
    plugin._ensureMpv = jest.fn(async () => { plugin._mpvAvailable = false; });
    plugin._getMpvInstallCommand = jest.fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('fixture manager lookup failed'))
      .mockResolvedValueOnce(null);
    plugin._startMpvInstall = MusicBotPlugin.prototype._startMpvInstall.bind(plugin);
    plugin._installMpv = MusicBotPlugin.prototype._installMpv.bind(plugin);
    plugin._mpvAvailable = false;
    plugin.io = { emit: jest.fn() };
    const headers = {
      origin: 'http://localhost:3000',
      'sec-fetch-site': 'same-origin'
    };

    const unavailable = await invoke(handler, headers, 'http', 'localhost:3000', isNetworkOriginAllowed);
    const failed = await invoke(handler, headers, 'http', 'localhost:3000', isNetworkOriginAllowed);
    const unavailableAgain = await invoke(handler, headers, 'http', 'localhost:3000', isNetworkOriginAllowed);

    expect(unavailable.payload.installStatus).toEqual(expect.objectContaining({ state: 'unavailable' }));
    expect(failed.statusCode).toBe(500);
    expect(unavailableAgain.payload.installStatus).toEqual(expect.objectContaining({ state: 'unavailable' }));
    expect(plugin._ensureMpv).toHaveBeenCalledTimes(3);
    expect(plugin._getMpvInstallCommand).toHaveBeenCalledTimes(3);
    expect(spawn).not.toHaveBeenCalled();
  });
});
