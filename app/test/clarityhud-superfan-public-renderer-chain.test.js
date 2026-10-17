'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { JSDOM, VirtualConsole } = require('jsdom');
const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');
const ClarityHUDPlugin = require('../plugins/clarityhud/main');
const ClarityHUDBackend = require('../plugins/clarityhud/backend/api');
const { createPublicOverlayAdapter, PUBLIC_QUICK_TUNNEL_ROOM } = require('../modules/public-overlay-socket-adapter');
const { isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');
const { createPublicReleaseEventGuard } = require('../modules/public-overlay-release-event-policy');
const schema = require('../node_modules/@eulerstream/euler-websocket-sdk/dist/webcast/schemas/tiktok-schema-v2');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT, 'plugins', 'clarityhud');
const RENDERER_LIBS = [
  'animations.js', 'i18n-runtime.js', 'layout-engine.js', 'accessibility.js',
  'emoji-parser.js', 'badge-renderer.js', 'message-parser.js', 'virtual-scroller.js'
];
const INTERNAL = 'SUPERFAN_INTERNAL_ID_CANARY';
const RAW = 'SUPERFAN_RAW_PAYLOAD_CANARY';
const CHAT = 'SUPERFAN_CHAT_TEXT_CANARY';
const SETTINGS = 'SUPERFAN_SETTINGS_CANARY';
const KEY = 'SUPERFAN_SECRET_KEY_CANARY';

function decodeBarrageFixture({ nickname = 'Synthetic SuperFan' } = {}) {
  const user = {
    ...schema.UserDecoder.decode(new Uint8Array()),
    id: INTERNAL,
    nickname
  };
  const content = {
    ...schema.TextDecoder.decode(new Uint8Array()),
    displayType: 'ttlive_superfan_commentnotif_superfanjoined',
    piecesList: [{
      ...schema.Text_TextPieceDecoder.decode(new Uint8Array()),
      type: 11,
      userValue: { user, withColon: false }
    }]
  };
  const message = {
    ...schema.WebcastBarrageMessageDecoder.decode(new Uint8Array()),
    content
  };
  const decoded = schema.WebcastBarrageMessageDecoder.decode(schema.WebcastBarrageMessageDecoder.encode(message).finish());
  decoded.rawPayload = RAW;
  decoded.settings = SETTINGS;
  decoded.apiKey = KEY;
  decoded.content.chatText = CHAT;
  return decoded;
}

function createRenderer() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  virtualConsole.on('error', message => errors.push(String(message)));
  const html = fs.readFileSync(path.join(PLUGIN_DIR, 'overlays', 'full.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://127.0.0.1/overlay/clarity/full',
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  const handlers = new Map();
  const socket = {
    connected: true,
    on(name, handler) { const list = handlers.get(name) || []; list.push(handler); handlers.set(name, list); },
    off() {},
    emit() {},
    disconnect() {},
    deliver(name, payload) { for (const handler of handlers.get(name) || []) handler(payload); }
  };
  const requests = [];
  window.io = () => socket;
  window.ClarityHUDI18n = { text: (_key, fallback = '') => fallback };
  window.fetch = input => {
    const url = new URL(String(input), 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/i18n/translations/')) return Promise.resolve({ ok: true, json: async () => ({}) });
    return new Promise(resolve => requests.push({ path: url.pathname, resolve: payload => resolve({ ok: true, json: async () => payload }) }));
  };
  for (const lib of RENDERER_LIBS) window.eval(fs.readFileSync(path.join(PLUGIN_DIR, 'lib', lib), 'utf8'));
  window.eval(fs.readFileSync(path.join(PLUGIN_DIR, 'overlays', 'full.js'), 'utf8'));
  return { dom, window, socket, requests, errors };
}

async function waitFor(predicate) {
  for (let i = 0; i < 40; i += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('ClarityHUD full renderer did not reach expected fixture state');
}

class RecordingAdapter {
  constructor() { this.calls = []; }
  broadcast(packet, options) { this.calls.push({ packet, options }); }
  broadcastWithAck(packet, options, count, ack) { this.calls.push({ packet, options, count, ack }); }
}

describe('ClarityHUD SuperFan synthetic public renderer chain', () => {
  test('projects an SDK-decoded event through plugin, queue, public socket policy, and original Full HUD; rejects canaries and expired history', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-08T12:00:00.000Z').getTime());
    const emitted = [];
    const backendApi = {
      emit: (event, payload) => emitted.push({ event, payload }),
      log: jest.fn(),
      registerRoute: jest.fn()
    };
    const backend = new ClarityHUDBackend(backendApi);
    backend.registerRoutes();
    backend.settings.full.showSuperFans = true;
    const handlers = new Map();
    const plugin = new ClarityHUDPlugin({
      log: jest.fn(),
      registerTikTokEvent: (name, handler) => handlers.set(name, handler)
    });
    plugin.backend = backend;
    plugin.registerEventListeners();

    const source = Object.create(EulerstreamAdapter.prototype);
    EventEmitter.call(source);
    source.logger = { warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    let projectedInput;
    source.on('superfan-display', event => { projectedInput = event; });
    // Only a synthetic SDK-decoded fixture is dispatched; no network or credentials are used.
    source._dispatchEulerstreamMessage({ type: 'WebcastBarrageMessage', data: decodeBarrageFixture() });
    expect(projectedInput).toEqual({ eventType: 'superfan-join', displayName: 'Synthetic SuperFan' });
    expect(projectedInput).not.toHaveProperty('userId');
    expect(JSON.stringify(projectedInput)).not.toContain(INTERNAL);
    expect(JSON.stringify(projectedInput)).not.toContain(RAW);
    expect(JSON.stringify(projectedInput)).not.toContain(CHAT);
    expect(JSON.stringify(projectedInput)).not.toContain(SETTINGS);
    expect(JSON.stringify(projectedInput)).not.toContain(KEY);

    await handlers.get('superfan-display')(projectedInput);
    expect(backend.eventQueues['superfan-display']).toHaveLength(1);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe('clarityhud.update.superfan-display');

    const pluginReleasePolicy = {
      getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true, policyInvalid: false }),
      isClosedBetaId: () => false
    };
    const guard = createPublicReleaseEventGuard(pluginReleasePolicy);
    const Adapter = createPublicOverlayAdapter(RecordingAdapter, {
      pluginReleasePolicy
    });
    const adapter = new Adapter();
    const options = { rooms: new Set(), except: new Set() };
    adapter.broadcast({ data: [emitted[0].event, emitted[0].payload] }, options);
    expect(adapter.calls).toHaveLength(2);
    const publicCall = adapter.calls[1];
    expect([...publicCall.options.rooms]).toEqual([PUBLIC_QUICK_TUNNEL_ROOM]);
    expect(guard('outgoing', publicCall.packet.data[0])).toBe(true);
    const publicPayload = publicCall.packet.data[1];
    expect(publicPayload).toEqual({ eventType: 'superfan-join', displayName: 'Synthetic SuperFan' });

    const fixture = createRenderer();
    try {
      fixture.window.document.dispatchEvent(new fixture.window.Event('DOMContentLoaded'));
      await waitFor(() => fixture.requests.some(request => request.path === '/api/clarityhud/settings/full'));
      fixture.requests.find(request => request.path === '/api/clarityhud/settings/full').resolve({ success: true, settings: { showChat: true, showSuperFans: true, layoutMode: 'singleStream', maxLines: 20 } });
      await waitFor(() => fixture.requests.some(request => request.path === '/api/clarityhud/state/full'));
      fixture.requests.find(request => request.path === '/api/clarityhud/state/full').resolve({ success: true, events: { 'superfan-display': backend.eventQueues['superfan-display'] } });
      await waitFor(() => fixture.window.document.querySelector('.event-item .event-username')?.textContent === 'Synthetic SuperFan');
      fixture.socket.deliver(emitted[0].event, publicPayload);
      expect(fixture.window.document.body.textContent).toContain('Synthetic SuperFan');
      expect(fixture.window.document.body.textContent).not.toContain(CHAT);
      expect(fixture.window.document.body.textContent).not.toContain(INTERNAL);
      expect(fixture.window.document.body.textContent).not.toContain(RAW);
      expect(fixture.window.document.body.textContent).not.toContain(KEY);

      const beforeBadInput = backend.eventQueues['superfan-display'].length;
      await handlers.get('superfan-display')({ eventType: 'follow', displayName: 'Wrong event', [INTERNAL]: INTERNAL, raw: RAW, settings: SETTINGS, apiKey: KEY });
      await handlers.get('superfan-display')({ eventType: 'superfan', displayName: 'Untrusted avatar', profilePictureUrl: 'https://evil.example/avatar.png' });
      expect(backend.eventQueues['superfan-display']).toHaveLength(beforeBadInput + 1);
      expect(backend.eventQueues['superfan-display'].at(-1)).not.toHaveProperty('profilePictureUrl');
      expect(emitted).toHaveLength(2);
      expect(JSON.stringify(emitted[1].payload)).not.toContain('evil.example');

      const stateRoute = backendApi.registerRoute.mock.calls.find(call => call[1] === '/api/clarityhud/state/:dock')[2];
      const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      const now = Date.now();
      backend.eventQueues['superfan-display'] = [
        { type: 'superfan-display', timestamp: now - 10 * 60 * 1000, eventType: 'superfan', displayName: 'Boundary retained' },
        { type: 'superfan-display', timestamp: now - 10 * 60 * 1000 - 1, eventType: 'superfan', displayName: 'Expired removed' }
      ];
      stateRoute({ params: { dock: 'full' } }, response);
      expect(response.body.events['superfan-display'].map(event => event.displayName)).toEqual(['Boundary retained']);
      expect(JSON.stringify(response.body)).not.toContain(INTERNAL);
      expect(JSON.stringify(response.body)).not.toContain(RAW);
      expect(JSON.stringify(response.body)).not.toContain(CHAT);
      expect(JSON.stringify(response.body)).not.toContain(SETTINGS);
      expect(JSON.stringify(response.body)).not.toContain(KEY);

      adapter.broadcast({ data: ['clarityhud.update.chat', { comment: CHAT }] }, options);
      expect(adapter.calls).toHaveLength(3);
      expect(adapter.calls[2].packet.data[1].comment).toBe(CHAT);
      expect([...adapter.calls[2].options.except]).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
      expect(adapter.calls[2].options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)).toBe(false);
      expect(isOutgoingSocketEventAllowed('clarityhud.update.superfan-display')).toBe(true);
      expect(isOutgoingSocketEventAllowed('clarityhud.update.superfan-display:raw')).toBe(false);
      expect(fixture.errors).toEqual([]);
    } finally {
      fixture.dom.window.close();
      jest.restoreAllMocks();
    }
  });
});
