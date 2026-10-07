'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Adapter } = require('socket.io-adapter');
const { Encoder } = require('socket.io-parser');
const owners = require('../modules/public-overlay-release-event-owners.json');
const registry = require('../modules/public-overlay-registry');
const { createPluginReleasePolicy } = require('../modules/plugin-release-policy');
const { createPublicReleaseEventGuard } = require('../modules/public-overlay-release-event-policy');
const { protectPublicSocket, attachPublicSocketPolicy } = require('../modules/public-overlay-access');
const { createPublicOverlayAdapter, PUBLIC_QUICK_TUNNEL_ROOM } = require('../modules/public-overlay-socket-adapter');
const { PluginAPI } = require('../modules/plugin-loader');

const logger = { warn() {} };
const payload = { nickname: 'Controlled display', userId: 'private-id', settings: { token: 'private-token' } };
let temp;
let policy;
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-owner-guard-'));
  fs.mkdirSync(path.join(temp, 'config'));
  fs.copyFileSync(path.join(__dirname, '../config/plugin-release-policy.json'), path.join(temp, 'config/plugin-release-policy.json'));
  fs.writeFileSync(path.join(temp, 'config/distribution-mode.json'), JSON.stringify({ channel: 'public' }));
  policy = createPluginReleasePolicy({ appRoot: temp });
});
afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

function socket(host = 'review.trycloudflare.com', releasePolicy = policy) {
  const delivered = [];
  let middleware;
  const client = {
    handshake: { headers: { host } }, data: {},
    join() {}, use(fn) { middleware = fn; },
    emit(...args) { delivered.push(args); return true; }
  };
  protectPublicSocket({ socket: client, logger, pluginReleasePolicy: releasePolicy });
  return { client, delivered, incoming(event) {
    if (!middleware) return undefined;
    let result;
    middleware([event, payload], error => { result = error; });
    return result;
  } };
}

function adapter(releasePolicy = policy) {
  const clients = new Map();
  for (const id of ['local', 'public']) {
    clients.set(id, { id, acks: new Map(), packets: [],
      client: { writeToEngine() {} },
      notifyOutgoingListeners(packet) { this.packets.push({ ...packet, data: [...packet.data] }); }
    });
  }
  const namespace = { name: '/', _ids: 0, sockets: clients, server: { encoder: new Encoder(), opts: {} } };
  const ProtectedAdapter = createPublicOverlayAdapter(Adapter, { pluginReleasePolicy: releasePolicy });
  const instance = new ProtectedAdapter(namespace);
  instance.addAll('local', new Set(['local', 'mixed']));
  instance.addAll('public', new Set(['public', 'mixed', PUBLIC_QUICK_TUNNEL_ROOM]));
  return { instance, clients };
}
const options = () => ({ rooms: new Set(['mixed']), except: new Set(), flags: {} });

test('map is exactly 121 static and seven reserved, all registry pairs already admitted', () => {
  const rows = Object.entries(owners.events).flatMap(([direction, entries]) => Object.entries(entries).map(([name, entry]) => ({ direction, name, ...entry })));
  expect(rows).toHaveLength(128);
  expect(rows.filter(row => row.ownership === 'proven-static')).toHaveLength(121);
  expect(rows.filter(row => row.ownership === 'reserved-exclusive-namespace')).toHaveLength(7);
  expect(Object.keys(owners.events.outgoing)).toHaveLength(119);
  expect(Object.keys(owners.events.incoming)).toHaveLength(9);
  for (const row of rows) expect(registry[row.direction === 'outgoing' ? 'OUTGOING_SOCKET_EVENTS' : 'INCOMING_SOCKET_EVENTS'].has(row.name)).toBe(true);
});

test.each(Object.keys(owners.events.outgoing))('actual PluginAPI/Adapter/direct/ACK public deny and local retain: %s', event => {
  const publicSocket = socket();
  expect(publicSocket.client.emit(event, payload)).toBe(false);
  expect(publicSocket.delivered).toEqual([]);
  const localSocket = socket('localhost:43219');
  const callback = jest.fn();
  localSocket.client.emit(event, payload, callback);
  expect(localSocket.delivered[0]).toEqual([event, payload, callback]);
  const { instance, clients } = adapter();
  const bus = jest.fn();
  const context = { pluginLoader: { emit: bus }, io: { emit(name, data) { instance.broadcast({ type: 2, data: [name, data] }, options()); } }, log() {} };
  expect(PluginAPI.prototype.emit.call(context, event, payload)).toBe(true);
  expect(bus).toHaveBeenCalledWith(event, payload);
  expect(clients.get('public').packets).toEqual([]);
  expect(clients.get('local').packets[0].data[1]).toBe(payload);
  const count = jest.fn();
  const ack = jest.fn();
  instance.broadcastWithAck({ type: 2, data: [event, payload] }, options(), count, ack);
  expect(count).toHaveBeenCalledWith(1);
  expect(clients.get('public').acks.size).toBe(0);
  const localAck = [...clients.get('local').acks.values()][0];
  localAck('local-result');
  expect(ack).toHaveBeenCalledWith('local-result');
});

test.each(Object.keys(owners.events.incoming))('public ingress rejected before handler, local ACK preserved: %s', event => {
  const publicSocket = socket();
  const error = publicSocket.incoming(event);
  const handler = jest.fn((data, ack) => ack('local-result'));
  const ack = jest.fn();
  if (!error) handler(payload, ack);
  expect(error.data.code).toBe('PUBLIC_SOCKET_EVENT_NOT_ALLOWED');
  expect(handler).not.toHaveBeenCalled();
  expect(ack).not.toHaveBeenCalled();
  const localSocket = socket('localhost');
  if (!localSocket.incoming(event)) handler(payload, ack);
  expect(handler).toHaveBeenCalledWith(payload, ack);
  expect(ack).toHaveBeenCalledWith('local-result');
});

test.each(['absent', 'local'])('developer/local distribution preserves original admission: %s', mode => {
  const marker = path.join(temp, 'config/distribution-mode.json');
  if (mode === 'absent') fs.unlinkSync(marker);
  else fs.writeFileSync(marker, JSON.stringify({ channel: 'local' }));
  const guard = createPublicReleaseEventGuard(policy);
  for (const [direction, entries] of Object.entries(owners.events)) {
    for (const event of Object.keys(entries)) expect(guard(direction, event)).toBe(true);
  }
  const { instance, clients } = adapter();
  instance.broadcast({ type: 2, data: ['story:chapter-ready', payload] }, options());
  expect(clients.get('public').packets[0].data[1]).toBe(payload);
  expect(socket().incoming('sidekick:public-status:request')).toBeUndefined();
});

test('shared and unknown event names retain prior registry/projector behavior, no prefix guesses', () => {
  const guard = createPublicReleaseEventGuard(policy);
  for (const event of ['weather:config-update', 'tts:playback:ended', 'join', 'subscribe', 'clarityhud:settings', 'spotlight:settings', 'stream:state', 'toString', 'musicbot:unknown']) {
    expect(guard('outgoing', event)).toBe(true);
    expect(guard('incoming', event)).toBe(true);
  }
  const { instance, clients } = adapter();
  instance.broadcast({ type: 2, data: ['weather:clear', payload] }, options());
  expect(clients.get('public').packets).toHaveLength(registry.isOutgoingSocketEventAllowed('weather:clear') ? 1 : 0);
  const before = clients.get('public').packets.length;
  instance.broadcast({ type: 2, data: ['musicbot:unknown', payload] }, options());
  expect(clients.get('public').packets).toHaveLength(before);
});

test('invalid public policy and pre-initialization exceptions fail closed only mapped names', () => {
  fs.writeFileSync(path.join(temp, 'config/plugin-release-policy.json'), '{}');
  const guard = createPublicReleaseEventGuard(policy);
  expect(guard('outgoing', 'story:chapter-ready')).toBe(false);
  expect(guard('outgoing', 'weather:clear')).toBe(true);
  const broken = { getSnapshot() { throw new ReferenceError('not initialized'); } };
  expect(socket(undefined, broken).client.emit('sidekick:public-status', payload)).toBe(false);
  const { instance, clients } = adapter(broken);
  instance.broadcastWithAck({ type: 2, data: ['sidekick:public-status', payload] }, options(), count => expect(count).toBe(1), () => {});
  expect(clients.get('public').packets).toEqual([]);
});

test('all admitted shared Weather/TTS/Join/Subscribe/Clarity/Spotlight events match original adapter behavior', () => {
  const original = require('./fixtures/public-overlay-original-sources').loadOriginalAdapter();
  const shared = [...registry.OUTGOING_SOCKET_EVENTS].filter(event =>
    /^(weather:|tts:|clarityhud[.:]|spotlight[.:])/.test(event) || /join|subscribe/i.test(event));
  expect(shared.length).toBeGreaterThan(10);
  class Recorder {
    constructor() { this.rows = []; }
    broadcast(packet, opts) { this.rows.push({ packet, opts }); }
    broadcastWithAck(packet, opts, count, ack) { this.rows.push({ packet, opts, count, ack }); }
  }
  const Old = original.createPublicOverlayAdapter(Recorder);
  const New = createPublicOverlayAdapter(Recorder, { pluginReleasePolicy: policy });
  for (const event of shared) {
    expect(owners.events.outgoing[event]).toBeUndefined();
    for (const method of ['broadcast', 'broadcastWithAck']) {
      const old = new Old();
      const next = new New();
      const count = jest.fn();
      const ack = jest.fn();
      const invoke = instance => {
        try {
          instance[method]({ type: 2, data: [event, payload] }, options(), count, ack);
          return null;
        } catch (error) {
          return { name: error.name, message: error.message };
        }
      };
      // Invalid controlled shapes can already throw in an original projector.
      // Compare that outcome too; this is preservation, not shared-renderer acceptance.
      expect(invoke(next)).toEqual(invoke(old));
      expect(next.rows).toEqual(old.rows);
    }
  }
});

test('attach injects same policy, and server initializes it before adapter and HTTP guard', () => {
  let handshake;
  attachPublicSocketPolicy({ io: { use(fn) { handshake = fn; } }, logger, pluginReleasePolicy: policy });
  const raw = { handshake: { headers: { host: 'review.trycloudflare.com' } }, join() {}, use() {}, emit: jest.fn() };
  const next = jest.fn();
  handshake(raw, next);
  expect(next).toHaveBeenCalledWith();
  expect(raw.emit('story:chapter-ready', payload)).toBe(false);
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const init = source.indexOf('const pluginReleasePolicy = createPluginReleasePolicy');
  expect(init).toBeGreaterThan(-1);
  expect(source.indexOf('const pluginReleasePolicy', init + 1)).toBe(-1);
  expect(init).toBeLessThan(source.indexOf('io.adapter(createPublicOverlayAdapter'));
  expect(init).toBeLessThan(source.indexOf('app.use(pluginReleasePolicy.createRequestGuard'));
});
