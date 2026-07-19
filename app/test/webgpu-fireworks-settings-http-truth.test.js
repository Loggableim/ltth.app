'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');

describe('WebGPU Fireworks settings HTTP truth', () => {
  const pluginDir = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
  const html = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.html'), 'utf8');
  const showOptionsScript = fs.readFileSync(path.join(pluginDir, 'ui', 'show-style-options.js'), 'utf8');
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

  async function waitFor(assertion) {
    const startedAt = Date.now();
    let lastError;
    while (Date.now() - startedAt < 1000) {
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
    requestResponses = {},
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
    window.setTimeout = jest.fn(() => 1);
    window.clearTimeout = jest.fn();
    window.navigator.clipboard = { writeText: jest.fn(async () => {}) };
    window.URL.createObjectURL = jest.fn(() => 'blob:http-truth-avatar');
    window.URL.revokeObjectURL = jest.fn();

    const responseQueues = Object.fromEntries(Object.entries(requestResponses).map(([key, value]) => (
      [key, Array.isArray(value) ? [...value] : [value]]
    )));
    const statusQueue = [...statusResponses];
    const fetchMock = jest.fn(async (url, options = {}) => {
      const requestUrl = String(url);
      const method = options.method || 'GET';
      const key = `${method} ${requestUrl}`;
      if (responseQueues[key]?.length) return materialize(responseQueues[key].shift());
      if (requestUrl === '/api/webgpu-fireworks/config' && method === 'GET') {
        return materialize(configResponse || {
          body: { success: true, config: normalizeConfig({}) }
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
          success: true,
          accepted: true,
          config: normalizeConfig(JSON.parse(options.body || '{}'))
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
    window.eval(settingsScript);
    await ready;
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/webgpu-fireworks/status')).toBe(true);
    });
    await new Promise(resolve => setImmediate(resolve));
    return { window, fetchMock };
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
          config: normalizeConfig({
            giftShapeMappings: { [giftId]: { shape: 'heart', intensity: 1 } }
          })
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
