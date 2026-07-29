'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const {
  CONFIG_ENUMS,
  CONFIG_LIMITS,
  normalizeConfig
} = require('../plugins/webgpu-fireworks/lib/config-schema');

describe('WebGPU Fireworks settings HTTP truth', () => {
  const pluginDir = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
  const html = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.html'), 'utf8');
  const showOptionsScript = fs.readFileSync(path.join(pluginDir, 'ui', 'show-style-options.js'), 'utf8');
  const settingsContractScript = fs.readFileSync(path.join(pluginDir, 'ui', 'settings-contract.js'), 'utf8');
  const settingsScript = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.js'), 'utf8');
  const readyStatus = {
    success: true,
    renderer: {
      state: 'ready',
      adapter: { description: 'Live GPU' },
      audioStatus: 'ready',
      audioBackend: 'webaudio',
      loadedSounds: 12,
      failedSounds: 0,
      lastPlayed: 'launch.mp3',
      crackleState: 'ready',
      lastAudioProfile: 'brocade',
      activeVoices: { launch: 1, bang: 2, crackle: 1, total: 4 },
      missedAudioEvents: 0,
      audioEvictions: 0,
      audioPeak: -3.2,
      timelineEvents: [{ type: 'bang', driftMs: 1 }],
      finaleActive: true,
      finalePhase: 'build',
      finaleQueueLength: 2,
      visualStyle: 'premium-realistic',
      gpuFrameMs: 4.2,
      activeParticles: 1200,
      droppedParticles: 0
    }
  };
  let dom;

  afterEach(() => {
    dom?.window.close();
    dom = null;
  });

  function response(body, { ok = true, status = ok ? 200 : 500, statusText = '' } = {}) {
    return {
      ok,
      status,
      statusText,
      json: jest.fn(async () => body)
    };
  }

  async function materialize(spec) {
    if (spec instanceof Error) throw spec;
    if (spec?.jsonError) {
      return {
        ok: spec.ok !== false,
        status: spec.status || 200,
        statusText: spec.statusText || '',
        json: jest.fn(async () => { throw spec.jsonError; })
      };
    }
    return response(spec?.body ?? spec ?? { success: true }, spec || {});
  }

  function configPayload(config = normalizeConfig({}), extra = {}) {
    return {
      success: true,
      config,
      limits: CONFIG_LIMITS,
      enums: CONFIG_ENUMS,
      ...extra
    };
  }

  async function waitFor(assertion) {
    const startedAt = Date.now();
    let lastError;
    while (Date.now() - startedAt < 5000) {
      try {
        assertion();
        return;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    throw lastError;
  }

  async function bootSettings({
    configResponse,
    onConfigRequest,
    openWindow = jest.fn(() => ({ closed: false, close: jest.fn() })),
    requestHandlers = {},
    requestResponses = {},
    runTimeouts = false,
    statusResponses = []
  } = {}) {
    dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'http://localhost:3000/webgpu-fireworks/ui'
    });
    const { window } = dom;
    const ready = new Promise(resolve => {
      window.document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
    window.console = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    window.i18n = {
      init: jest.fn(async () => {}),
      updateDOM: jest.fn(),
      onChange: jest.fn(),
      onLanguageChange: jest.fn(),
      t: jest.fn(key => key)
    };
    window.io = jest.fn(() => ({ on: jest.fn(), emit: jest.fn() }));
    window.setInterval = jest.fn(() => 1);
    window.clearInterval = jest.fn();
    window.setTimeout = jest.fn((callback, delay) => {
      if (runTimeouts === true || (typeof runTimeouts === 'function' && runTimeouts(delay))) {
        Promise.resolve().then(callback);
      }
      return 1;
    });
    window.clearTimeout = jest.fn();
    window.navigator.clipboard = { writeText: jest.fn(async () => {}) };
    window.URL.createObjectURL = jest.fn(() => 'blob:http-truth-avatar');
    window.URL.revokeObjectURL = jest.fn();
    window.open = openWindow;

    const socketHandlers = new Map();
    const socketMock = {
      on: jest.fn((event, handler) => socketHandlers.set(event, handler)),
      emit: jest.fn()
    };
    window.io = jest.fn(() => socketMock);

    const responseQueues = Object.fromEntries(Object.entries(requestResponses).map(([key, value]) => (
      [key, Array.isArray(value) ? [...value] : [value]]
    )));
    const statusQueue = [...statusResponses];
    const fetchMock = jest.fn(async (url, options = {}) => {
      const requestUrl = String(url);
      const method = options.method || 'GET';
      const key = `${method} ${requestUrl}`;
      if (requestHandlers[key]) {
        return materialize(await requestHandlers[key]({ options, requestUrl }));
      }
      if (responseQueues[key]?.length) return materialize(responseQueues[key].shift());
      if (requestUrl === '/api/webgpu-fireworks/config' && method === 'GET') {
        await onConfigRequest?.({ socketHandlers, window });
        return materialize(configResponse || {
          body: configPayload()
        });
      }
      if (requestUrl === '/api/webgpu-fireworks/status') {
        if (statusQueue.length) return materialize(statusQueue.shift());
        return response(readyStatus);
      }
      if (requestUrl === '/api/webgpu-fireworks/shows') {
        return response({ success: true, selectableStyles: [] });
      }
      if (requestUrl === '/api/webgpu-fireworks/config' && method === 'POST') {
        return response({
          ...configPayload(normalizeConfig(JSON.parse(options.body || '{}'))),
          accepted: true
        });
      }
      if (method === 'DELETE' && requestUrl.startsWith('/api/webgpu-fireworks/gift-mappings/')) {
        return response({ success: true, accepted: true });
      }
      if (method === 'POST' && requestUrl.startsWith('/api/webgpu-fireworks/')) {
        return response({ success: true, accepted: true });
      }
      throw new Error(`Unexpected request: ${key}`);
    });
    window.fetch = fetchMock;

    window.eval(showOptionsScript);
    window.eval(settingsContractScript);
    window.eval(settingsScript);
    await ready;
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/webgpu-fireworks/status')).toBe(true);
    });
    await new Promise(resolve => setImmediate(resolve));
    return { window, fetchMock, openWindow, socketHandlers };
  }

  function callsFor(fetchMock, method, url) {
    return fetchMock.mock.calls.filter(([requestUrl, options = {}]) => (
      String(requestUrl) === url && (options.method || 'GET') === method
    ));
  }

  test.each([
    [
      'an HTTP failure',
      { ok: false, status: 503, body: { success: true, config: normalizeConfig({}), error: 'config endpoint offline' } },
      'config endpoint offline'
    ],
    [
      'an unsuccessful payload',
      { ok: true, body: { success: false, reason: 'config load rejected' } },
      'config load rejected'
    ]
  ])('loadConfig rejects %s and surfaces its backend detail', async (_label, configResponse, detail) => {
    const { window } = await bootSettings({ configResponse });
    const toast = window.document.getElementById('toast');

    expect(toast.classList.contains('error')).toBe(true);
    expect(toast.textContent).toContain(detail);
  });

  test('save waits for explicit backend acceptance before showing success', async () => {
    const reason = 'configuration revision rejected';
    const { window } = await bootSettings({
      requestResponses: {
        'POST /api/webgpu-fireworks/config': {
          ok: true,
          body: { success: true, accepted: false, reason }
        }
      }
    });

    window.document.getElementById('save-btn').click();
    await waitFor(() => expect(window.document.getElementById('toast').textContent).toContain(reason));
    expect(window.document.getElementById('toast').classList.contains('error')).toBe(true);
  });

  test('keeps all contract controls disabled when a successful config response omits contracts', async () => {
    const { window } = await bootSettings({
      configResponse: { body: { success: true, config: normalizeConfig({}) } }
    });
    const controls = [...window.document.querySelectorAll('input[type="range"], select[id]')];
    expect(controls).toHaveLength(43);
    expect(controls.every(control => control.disabled)).toBe(true);
    expect(window.document.getElementById('toast').classList.contains('error')).toBe(true);
  });

  test('round-trips visible Superfan values through test and save requests', async () => {
    const { window, fetchMock } = await bootSettings({
      configResponse: {
        body: configPayload(normalizeConfig({
          maxTotalParticles: 10000,
          superfanFinaleCooldownHours: 72,
          superfanFinaleIntensity: 7.5,
          superfanFinaleStyle: 'thunder-finale',
          superfanFinaleLength: 'long',
          superfanEndCardDuration: 6500,
          superfanEndCardPosition: 'top-right',
          superfanEndCardSize: 'custom',
          superfanEndCardScale: 1.7
        }))
      }
    });

    expect(window.document.getElementById('max-particles-limit').value).toBe('10000');
    expect(window.document.getElementById('superfan-finale-intensity').value).toBe('7.5');
    expect(window.document.getElementById('superfan-end-card-duration').value).toBe('6.5');
    expect(window.document.getElementById('superfan-end-card-scale').value).toBe('1.7');

    window.document.getElementById('test-superfan-finale-btn').click();
    await waitFor(() => expect(callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/test-superfan')).toHaveLength(1));
    const testBody = JSON.parse(callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/test-superfan')[0][1].body);
    expect(testBody.settings).toMatchObject({
      superfanFinaleCooldownHours: 72,
      superfanFinaleIntensity: 7.5,
      superfanFinaleStyle: 'thunder-finale',
      superfanFinaleLength: 'long',
      superfanEndCardDuration: 6500,
      superfanEndCardPosition: 'top-right',
      superfanEndCardSize: 'custom',
      superfanEndCardScale: 1.7
    });

    window.document.getElementById('save-btn').click();
    await waitFor(() => expect(callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/config')).toHaveLength(1));
    expect(JSON.parse(callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/config')[0][1].body))
      .toMatchObject({ maxTotalParticles: 10000, superfanEndCardDuration: 6500 });
  });

  test('keeps the first socket config when it arrives before the initial GET', async () => {
    const socketConfig = normalizeConfig({
      superfanFinaleIntensity: 9,
      superfanEndCardDuration: 8500,
      maxTotalParticles: 16384
    });
    const staleGetConfig = normalizeConfig({
      superfanFinaleIntensity: 2,
      superfanEndCardDuration: 2000,
      maxTotalParticles: 512
    });
    const { window } = await bootSettings({
      configResponse: { body: configPayload(staleGetConfig) },
      onConfigRequest: async ({ socketHandlers }) => {
        socketHandlers.get('webgpu-fireworks:config-update')({
          config: socketConfig,
          limits: CONFIG_LIMITS,
          enums: CONFIG_ENUMS
        });
      }
    });
    expect(window.document.getElementById('superfan-finale-intensity').value).toBe('9');
    expect(window.document.getElementById('superfan-end-card-duration').value).toBe('8.5');
    expect(window.document.getElementById('max-particles-limit').value).toBe('16384');
  });

  test('reports a pending Superfan test as submitted instead of triggered', async () => {
    const { window } = await bootSettings({
      requestResponses: {
        'POST /api/webgpu-fireworks/test-superfan': {
          body: { success: true, accepted: true, pending: true, reason: 'renderer-confirmation-pending' }
        }
      }
    });
    window.document.getElementById('test-superfan-finale-btn').click();
    await waitFor(() => expect(window.document.getElementById('toast').textContent).toContain('pending'));
    expect(window.document.getElementById('toast').textContent.toLowerCase()).not.toContain('triggered');
  });

  test('a rejected preset save never overwrites the error with an applied toast', async () => {
    const reason = 'preset configuration rejected';
    const { window } = await bootSettings({
      requestResponses: {
        'POST /api/webgpu-fireworks/config': {
          ok: true,
          body: { success: true, accepted: false, reason }
        }
      }
    });

    window.document.querySelector('[data-preset="high"] button').click();
    await waitFor(() => expect(window.document.getElementById('toast').textContent).toContain(reason));
    await new Promise(resolve => setImmediate(resolve));

    expect(window.document.getElementById('toast').classList.contains('error')).toBe(true);
    expect(window.document.getElementById('toast').textContent).not.toContain('presets.applied');
  });

  test.each([
    ['trigger', 'test-btn', '/api/webgpu-fireworks/trigger', { ok: false, status: 503, body: { success: true, accepted: true, error: 'trigger renderer offline' } }],
    ['finale', 'test-finale-btn', '/api/webgpu-fireworks/finale', { ok: true, body: { success: true, accepted: false, reason: 'finale renderer busy' } }],
    ['Superfan', 'test-superfan-finale-btn', '/api/webgpu-fireworks/test-superfan', { ok: true, body: { accepted: true, reason: 'Superfan dispatch unconfirmed' } }],
    ['follower', 'test-follower-btn', '/api/webgpu-fireworks/test-follower', { ok: true, body: { success: false, accepted: true, reason: 'follower renderer unavailable' } }],
    ['shape', 'test-shape-burst-btn', '/api/webgpu-fireworks/trigger', { ok: true, body: { success: false, accepted: true, reason: 'shape rejected' } }],
    ['crackle', 'test-crackle-btn', '/api/webgpu-fireworks/trigger', { ok: true, body: { success: true, accepted: false, reason: 'crackle rejected' } }],
    ['tier', 'test-tier-small-btn', '/api/webgpu-fireworks/trigger', { ok: true, body: { success: false, accepted: true, reason: 'tier rejected' } }],
    ['random', 'test-shape-random-btn', '/api/webgpu-fireworks/random', { ok: true, body: { success: false, accepted: true, reason: 'random rejected' } }],
    ['avatar', 'test-avatar-btn', '/api/webgpu-fireworks/trigger', { ok: true, body: { success: false, accepted: true, reason: 'avatar rejected' } }]
  ])('%s test reports an unconfirmed request instead of a success toast', async (_label, buttonId, url, failure) => {
    const detail = failure.body.reason || failure.body.error;
    const { window } = await bootSettings({
      requestResponses: { [`POST ${url}`]: failure }
    });

    window.document.getElementById(buttonId).click();
    await waitFor(() => expect(window.document.getElementById('toast').textContent).toContain(detail));
    expect(window.document.getElementById('toast').classList.contains('error')).toBe(true);
  });

  test('gift mapping save requires explicit acceptance and exposes the reason', async () => {
    const reason = 'gift mapping conflicts with a newer revision';
    const { window } = await bootSettings({
      requestResponses: {
        'POST /api/webgpu-fireworks/gift-mappings': {
          ok: true,
          body: { success: true, accepted: false, reason }
        }
      }
    });
    window.document.getElementById('gift-style-id').value = '5655';

    window.document.getElementById('save-gift-style').click();
    await waitFor(() => expect(window.document.getElementById('toast').textContent).toContain(reason));
    expect(window.document.getElementById('toast').classList.contains('error')).toBe(true);
  });

  test('gift mapping removal keeps the mapping when backend acceptance is false', async () => {
    const reason = 'gift mapping removal rejected';
    const giftId = '5655';
    const { window } = await bootSettings({
      configResponse: {
        body: {
          success: true,
          ...configPayload(normalizeConfig({
            giftShapeMappings: { [giftId]: { shape: 'heart', intensity: 1 } }
          }))
        }
      },
      requestResponses: {
        [`DELETE /api/webgpu-fireworks/gift-mappings/${giftId}`]: {
          ok: true,
          body: { success: true, accepted: false, reason }
        }
      }
    });
    const list = window.document.getElementById('gift-style-list');
    expect(list.textContent).toContain(giftId);

    list.querySelector('button').click();
    await waitFor(() => expect(window.document.getElementById('toast').textContent).toContain(reason));
    expect(window.document.getElementById('toast').classList.contains('error')).toBe(true);
    expect(list.textContent).toContain(giftId);
  });

  test('low-end presets persist matching internal resolution ranges that never upscale', async () => {
    const { window, fetchMock } = await bootSettings();

    await window.applyPreset('toaster');
    let configCalls = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/config');
    let saved = JSON.parse(configCalls.at(-1)[1].body);
    expect(saved).toMatchObject({
      resolutionPreset: '540p',
      internalMinResolutionPreset: '360p',
      internalMaxResolutionPreset: '540p'
    });
    expect(window.document.getElementById('internal-min-resolution').value).toBe('360p');
    expect(window.document.getElementById('internal-max-resolution').value).toBe('540p');

    await window.applyPreset('potato');
    configCalls = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/config');
    saved = JSON.parse(configCalls.at(-1)[1].body);
    expect(saved).toMatchObject({
      resolutionPreset: '360p',
      internalMinResolutionPreset: '360p',
      internalMaxResolutionPreset: '360p'
    });
    expect(window.document.getElementById('internal-min-resolution').value).toBe('360p');
    expect(window.document.getElementById('internal-max-resolution').value).toBe('360p');
  });

  test('benchmark starts a server session before opening its unique overlay and binds every request to that session', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const overlayUrl = `http://localhost:3000/webgpu-fireworks/overlay?benchmark=true&benchmarkSessionId=${sessionId}`;
    const popup = {
      closed: false,
      name: '',
      location: { replace: jest.fn() },
      close: jest.fn(function close() { this.closed = true; })
    };
    const openWindow = jest.fn(() => popup);
    const presetFailure = 'benchmark preset explicitly rejected';
    const { window, fetchMock } = await bootSettings({
      openWindow,
      runTimeouts: true,
      requestResponses: {
        'POST /api/webgpu-fireworks/benchmark/start': {
          body: { success: true, sessionId, overlayUrl }
        },
        [`GET /api/webgpu-fireworks/benchmark/fps?sessionId=${sessionId}`]: [
          {
            ok: false,
            status: 503,
            body: { success: false, code: 'BENCHMARK_RENDERER_NOT_READY', error: 'renderer warming up' }
          },
          { body: { success: true, sessionId, fps: 0, sampleCount: 1 } }
        ],
        'POST /api/webgpu-fireworks/benchmark/set-preset': {
          body: { success: true, accepted: false, reason: presetFailure }
        },
        'POST /api/webgpu-fireworks/benchmark/restore': {
          body: { success: true, sessionId, restored: true }
        }
      }
    });

    await window.startBenchmark();

    const startCalls = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/start');
    expect(startCalls).toHaveLength(1);
    expect(fetchMock.mock.invocationCallOrder[fetchMock.mock.calls.indexOf(startCalls[0])])
      .toBeLessThan(openWindow.mock.invocationCallOrder[0]);
    expect(openWindow).toHaveBeenCalledWith(
      'about:blank',
      'FireworksBenchmark-Pending-1',
      'width=1920,height=1080'
    );
    expect(popup.location.replace).toHaveBeenCalledWith(overlayUrl);
    expect(popup.name).toBe(`FireworksBenchmark-${sessionId}`);

    const presetCall = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/set-preset')[0];
    expect(JSON.parse(presetCall[1].body)).toMatchObject({
      sessionId,
      preset: { particleSizeRange: [3, 10] }
    });
    const fpsCalls = callsFor(fetchMock, 'GET', `/api/webgpu-fireworks/benchmark/fps?sessionId=${sessionId}`);
    expect(fpsCalls).toHaveLength(2);
    expect(fetchMock.mock.invocationCallOrder[fetchMock.mock.calls.indexOf(fpsCalls[1])])
      .toBeLessThan(fetchMock.mock.invocationCallOrder[fetchMock.mock.calls.indexOf(presetCall)]);
    expect(callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/trigger')).toHaveLength(0);
    const restoreCalls = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/restore');
    expect(restoreCalls).toHaveLength(1);
    expect(JSON.parse(restoreCalls[0][1].body)).toEqual({ sessionId });
    expect(window.document.getElementById('toast').textContent).toContain(presetFailure);
    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  test('a blocked benchmark popup restores the just-created session without polling or running tests', async () => {
    const sessionId = '22222222-2222-4222-8222-222222222222';
    const overlayUrl = `http://localhost:3000/webgpu-fireworks/overlay?benchmark=true&benchmarkSessionId=${sessionId}`;
    const openWindow = jest.fn(() => null);
    const { window, fetchMock } = await bootSettings({
      openWindow,
      runTimeouts: true,
      requestResponses: {
        'POST /api/webgpu-fireworks/benchmark/start': {
          body: { success: true, sessionId, overlayUrl }
        },
        'POST /api/webgpu-fireworks/benchmark/restore': {
          body: { success: true, sessionId, restored: true }
        }
      }
    });

    await window.startBenchmark();

    expect(openWindow).toHaveBeenCalledWith(
      'about:blank',
      'FireworksBenchmark-Pending-1',
      'width=1920,height=1080'
    );
    expect(callsFor(fetchMock, 'GET', `/api/webgpu-fireworks/benchmark/fps?sessionId=${sessionId}`)).toHaveLength(0);
    const restoreCalls = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/restore');
    expect(restoreCalls).toHaveLength(1);
    expect(JSON.parse(restoreCalls[0][1].body)).toEqual({ sessionId });
  });

  test('pagehide silently stops the run, closes its popup, and shares one keepalive restore with finally', async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const overlayUrl = `http://localhost:3000/webgpu-fireworks/overlay?benchmark=true&benchmarkSessionId=${sessionId}`;
    let resolvePreset;
    const pendingPreset = new Promise(resolve => { resolvePreset = resolve; });
    const popup = { closed: false, close: jest.fn(function close() { this.closed = true; }) };
    const { window, fetchMock } = await bootSettings({
      openWindow: jest.fn(() => popup),
      runTimeouts: true,
      requestResponses: {
        'POST /api/webgpu-fireworks/benchmark/start': {
          body: { success: true, sessionId, overlayUrl }
        },
        [`GET /api/webgpu-fireworks/benchmark/fps?sessionId=${sessionId}`]: {
          body: { success: true, sessionId, fps: 60, sampleCount: 1 }
        },
        'POST /api/webgpu-fireworks/benchmark/set-preset': pendingPreset,
        'POST /api/webgpu-fireworks/benchmark/restore': {
          body: { success: true, sessionId, restored: true }
        }
      }
    });

    const benchmarkPromise = window.startBenchmark();
    await waitFor(() => {
      expect(callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/set-preset')).toHaveLength(1);
    });
    window.dispatchEvent(new window.Event('pagehide'));
    await waitFor(() => {
      expect(callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/restore')).toHaveLength(1);
    });
    expect(popup.close).toHaveBeenCalledTimes(1);
    resolvePreset({ success: true, accepted: false, reason: 'stopped benchmark' });
    await benchmarkPromise;

    const restoreCalls = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/restore');
    expect(restoreCalls).toHaveLength(1);
    expect(restoreCalls[0][1]).toMatchObject({ keepalive: true });
    expect(JSON.parse(restoreCalls[0][1].body)).toEqual({ sessionId });
    expect(popup.close).toHaveBeenCalledTimes(1);

    await window.restoreBenchmarkPreset(sessionId);
    expect(callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/restore')).toHaveLength(2);
  });

  test('pagehide keepalive can upgrade an in-flight normal restore request', async () => {
    const sessionId = '99999999-9999-4999-8999-999999999999';
    let resolveNormalRestore;
    const normalRestore = new Promise(resolve => { resolveNormalRestore = resolve; });
    const { window, fetchMock } = await bootSettings({
      requestHandlers: {
        'POST /api/webgpu-fireworks/benchmark/restore': async ({ options }) => {
          if (options.keepalive === true) {
            return { body: { success: true, sessionId, restored: false } };
          }
          return normalRestore;
        }
      }
    });

    const normalRequest = window.restoreBenchmarkPreset(sessionId);
    const keepaliveRequest = window.restoreBenchmarkPreset(sessionId, { keepalive: true });
    await keepaliveRequest;

    const restoreCalls = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/restore');
    expect(restoreCalls).toHaveLength(2);
    expect(restoreCalls[0][1].keepalive).toBe(false);
    expect(restoreCalls[1][1].keepalive).toBe(true);

    resolveNormalRestore({ body: { success: true, sessionId, restored: true } });
    await normalRequest;
  });

  test('a failed benchmark restore can be retried instead of caching a rejected promise', async () => {
    const sessionId = '88888888-8888-4888-8888-888888888888';
    const failure = 'temporary restore delivery failure';
    const { window, fetchMock } = await bootSettings({
      requestResponses: {
        'POST /api/webgpu-fireworks/benchmark/restore': [
          {
            ok: false,
            status: 503,
            body: { success: false, code: 'BENCHMARK_CONFIG_DELIVERY_FAILED', error: failure }
          },
          { body: { success: true, sessionId, restored: true } }
        ]
      }
    });

    await expect(window.restoreBenchmarkPreset(sessionId)).rejects.toThrow(failure);
    await expect(window.restoreBenchmarkPreset(sessionId)).resolves.toMatchObject({ restored: true });
    expect(callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/restore')).toHaveLength(2);
  });

  test('benchmark measurement uses the isolated trigger endpoint and propagates explicit rejection', async () => {
    const sessionId = '44444444-4444-4444-8444-444444444444';
    const rejection = 'benchmark trigger rejected';
    const { window, fetchMock } = await bootSettings({
      runTimeouts: true,
      requestResponses: {
        'POST /api/webgpu-fireworks/benchmark/trigger': {
          body: { success: true, accepted: false, reason: rejection }
        }
      }
    });

    await expect(window.measureFPS(sessionId)).rejects.toThrow(rejection);

    const triggerCalls = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/trigger');
    expect(triggerCalls).toHaveLength(1);
    expect(JSON.parse(triggerCalls[0][1].body)).toMatchObject({
      sessionId,
      shape: 'burst',
      playSound: false
    });
    expect(callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/trigger')).toHaveLength(0);
  });

  test('an old stopped run cannot resume against its session after a new run has started', async () => {
    const firstId = '55555555-5555-4555-8555-555555555555';
    const secondId = '66666666-6666-4666-8666-666666666666';
    let resolveSecondPreset;
    const secondPreset = new Promise(resolve => { resolveSecondPreset = resolve; });
    const popup = () => ({ closed: false, close: jest.fn(function close() { this.closed = true; }) });
    const { window, fetchMock } = await bootSettings({
      openWindow: jest.fn(popup),
      runTimeouts: delay => delay !== 10000,
      requestHandlers: {
        'POST /api/webgpu-fireworks/benchmark/set-preset': async ({ options }) => {
          const { sessionId } = JSON.parse(options.body);
          if (sessionId === firstId) return { body: { success: true, sessionId } };
          return secondPreset;
        }
      },
      requestResponses: {
        'POST /api/webgpu-fireworks/benchmark/start': [
          {
            body: {
              success: true,
              sessionId: firstId,
              overlayUrl: `http://localhost:3000/overlay?benchmark=true&benchmarkSessionId=${firstId}`
            }
          },
          {
            body: {
              success: true,
              sessionId: secondId,
              overlayUrl: `http://localhost:3000/overlay?benchmark=true&benchmarkSessionId=${secondId}`
            }
          }
        ],
        [`GET /api/webgpu-fireworks/benchmark/fps?sessionId=${firstId}`]: {
          body: { success: true, sessionId: firstId, fps: 60 }
        },
        [`GET /api/webgpu-fireworks/benchmark/fps?sessionId=${secondId}`]: {
          body: { success: true, sessionId: secondId, fps: 60 }
        }
      }
    });

    const firstRun = window.startBenchmark();
    await waitFor(() => {
      const triggers = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/trigger');
      expect(triggers.some(([, options]) => JSON.parse(options.body).sessionId === firstId)).toBe(true);
    });
    window.stopBenchmark();
    const secondRun = window.startBenchmark();
    await waitFor(() => {
      const presets = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/set-preset');
      expect(presets.some(([, options]) => JSON.parse(options.body).sessionId === secondId)).toBe(true);
    });
    await new Promise(resolve => setImmediate(resolve));

    const firstPresetCalls = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/set-preset')
      .filter(([, options]) => JSON.parse(options.body).sessionId === firstId);
    expect(firstPresetCalls).toHaveLength(1);

    window.stopBenchmark();
    resolveSecondPreset({ body: { success: true, accepted: false, reason: 'second run stopped' } });
    await Promise.all([firstRun, secondRun]);
  });

  test('a stopped run cannot arm measurement timers after its pending trigger resolves', async () => {
    const firstId = '77777777-7777-4777-8777-777777777777';
    const secondId = '88888888-8888-4888-8888-888888888888';
    let resolveFirstTrigger;
    let resolveSecondPreset;
    const firstTrigger = new Promise(resolve => { resolveFirstTrigger = resolve; });
    const secondPreset = new Promise(resolve => { resolveSecondPreset = resolve; });
    const { window, fetchMock } = await bootSettings({
      openWindow: jest.fn(() => ({ closed: false, close: jest.fn(function close() { this.closed = true; }) })),
      requestHandlers: {
        'POST /api/webgpu-fireworks/benchmark/set-preset': async ({ options }) => {
          const { sessionId } = JSON.parse(options.body);
          if (sessionId === firstId) return { body: { success: true, sessionId } };
          return secondPreset;
        },
        'POST /api/webgpu-fireworks/benchmark/trigger': async ({ options }) => {
          const { sessionId } = JSON.parse(options.body);
          if (sessionId === firstId) return firstTrigger;
          return { body: { success: true, accepted: true, sessionId } };
        }
      },
      requestResponses: {
        'POST /api/webgpu-fireworks/benchmark/start': [
          {
            body: {
              success: true,
              sessionId: firstId,
              overlayUrl: `http://localhost:3000/overlay?benchmark=true&benchmarkSessionId=${firstId}`
            }
          },
          {
            body: {
              success: true,
              sessionId: secondId,
              overlayUrl: `http://localhost:3000/overlay?benchmark=true&benchmarkSessionId=${secondId}`
            }
          }
        ],
        [`GET /api/webgpu-fireworks/benchmark/fps?sessionId=${firstId}`]: {
          body: { success: true, sessionId: firstId, fps: 60 }
        },
        [`GET /api/webgpu-fireworks/benchmark/fps?sessionId=${secondId}`]: {
          body: { success: true, sessionId: secondId, fps: 60 }
        }
      }
    });

    const firstRun = window.startBenchmark();
    await waitFor(() => {
      const triggers = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/trigger');
      expect(triggers.some(([, options]) => JSON.parse(options.body).sessionId === firstId)).toBe(true);
    });
    window.stopBenchmark();
    const secondRun = window.startBenchmark();
    await waitFor(() => {
      const presets = callsFor(fetchMock, 'POST', '/api/webgpu-fireworks/benchmark/set-preset');
      expect(presets.some(([, options]) => JSON.parse(options.body).sessionId === secondId)).toBe(true);
    });

    const intervalCountBeforeOldTrigger = window.setInterval.mock.calls.length;
    resolveFirstTrigger({ body: { success: true, accepted: true, sessionId: firstId } });
    await new Promise(resolve => setImmediate(resolve));
    expect(window.setInterval).toHaveBeenCalledTimes(intervalCountBeforeOldTrigger);

    window.stopBenchmark();
    resolveSecondPreset({ body: { success: true, accepted: false, reason: 'second run stopped' } });
    await Promise.all([firstRun, secondRun]);
  });

  test.each([
    [
      'HTTP',
      { ok: false, status: 503, body: { success: false, error: 'status endpoint unavailable' } },
      'status endpoint unavailable'
    ],
    [
      'JSON',
      { ok: true, jsonError: new SyntaxError('invalid status JSON') },
      'invalid status JSON'
    ],
    [
      'network',
      new Error('status network disconnected'),
      'status network disconnected'
    ]
  ])('loadRendererStatus neutralizes every live field after a %s failure', async (_label, failure, detail) => {
    const { window } = await bootSettings({ statusResponses: [{ body: readyStatus }, failure] });
    const document = window.document;
    expect(document.getElementById('webgpu-runtime-state').className).toContain('text-green');
    expect(document.getElementById('webgpu-adapter-state').textContent).toBe('Live GPU');

    await window.loadRendererStatus();

    const unavailableIds = [
      'webgpu-adapter-state', 'webgpu-audio-state', 'webgpu-audio-backend',
      'webgpu-audio-library', 'webgpu-audio-last-played', 'webgpu-crackle-state',
      'webgpu-audio-profile', 'webgpu-audio-voices', 'webgpu-audio-events',
      'webgpu-audio-peak', 'webgpu-timeline-sync', 'webgpu-finale-active',
      'webgpu-finale-phase', 'webgpu-finale-queue', 'webgpu-visual-style',
      'webgpu-frame-time', 'webgpu-particle-state'
    ];
    expect(document.getElementById('webgpu-runtime-state').textContent).toContain('OFFLINE');
    expect(document.getElementById('webgpu-runtime-state').className).toContain('text-red');
    for (const id of unavailableIds) {
      expect(document.getElementById(id).textContent).toBe('Unavailable');
    }
    expect(document.getElementById('webgpu-runtime-reason').hidden).toBe(false);
    expect(document.getElementById('webgpu-runtime-reason').textContent).toContain(detail);
  });
});
