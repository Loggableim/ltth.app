'use strict';

const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');
const { protectPublicSocket, createPublicOverlayMiddleware } = require('../modules/public-overlay-access');
const { isHttpAllowed } = require('../modules/public-overlay-registry');
const { createPublicOverlayAdapter, PUBLIC_QUICK_TUNNEL_ROOM } = require('../modules/public-overlay-socket-adapter');

// Actual producer envelopes: Talking-Heads main config route, WebGPU mapping
// route, Plinko getConfig and updateConfig. All values are synthetic canaries.
const events = [
  ['talkingheads:config:update', { config: { nameplateFontColor: '#ffffff', rolePermission: 'subscriber', minTeamLevel: 3, requireCustomVoice: true, defaultManualSetId: 'internal-set', cacheDuration: 1234, ownerApiKey: 'synthetic-private' } }],
  ['webgpu-emoji-rain:config-update', { config: { enabled: true, emoji_set: ['💧'], animal_commands_allow_team_members: true, animal_command_user_cooldown_ms: 60000, image_urls: ['https://example.invalid/private.png?token=synthetic-private'], unknownAdminSettings: { internal: true } }, enabled: true }],
  ['webgpu-emoji-rain:user-mappings-update', { mappings: { private_viewer_id: 'https://example.invalid/private.png?token=synthetic-private', otherViewer: { raw: 'synthetic-private' } } }],
  ['plinko:config', { id: 7, name: 'Private board', enabled: true, chatCommand: '!private', slots: [{ color: '#ffffff', multiplier: 2 }], physicsSettings: { gravity: 1, pegRows: 5 }, giftMappings: { 123: { multiplier: 3 } }, displayTexts: { title: 'Plinko' } }],
  ['plinko:config-updated', { boardId: 7, slots: [{ color: '#ffffff', multiplier: 2 }], physicsSettings: { gravity: 1 }, giftMappings: { 123: { multiplier: 3 } }, displayTexts: { title: 'Plinko' } }]
];

class RecordingAdapter {
  constructor() { this.calls = []; this.ackCalls = []; }
  broadcast(packet, options) { this.calls.push({ packet, options }); }
  broadcastWithAck(packet, options, count, ack) { this.ackCalls.push({ packet, options, count, ack }); }
}

function socket(host) {
  return { handshake: { headers: { host } }, data: {}, join: jest.fn(), use: jest.fn(), emit: jest.fn() };
}

describe('Only confirmed private configuration events fail closed publicly', () => {
  test.each(['GET', 'HEAD'])('%s denies only the two private WebGPU initial paths, with all query variants', method => {
    for (const pathname of ['/api/webgpu-emoji-rain/config', '/api/webgpu-emoji-rain/user-mappings']) {
      for (const suffix of ['', '?lang=fr', '?boardId=7', '?token=synthetic', '?']) {
        const url = pathname + suffix;
        expect(isHttpAllowed({ method, pathname: url })).toBe(false);
        const publicNext = jest.fn(); const localNext = jest.fn();
        const publicRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const localRes = { json: jest.fn() };
        const originalLocalJson = localRes.json;
        const middleware = createPublicOverlayMiddleware();
        middleware({ method, originalUrl: url, headers: { host: 'owned-pilot.trycloudflare.com' } }, publicRes, publicNext);
        expect(publicNext).not.toHaveBeenCalled();
        expect(publicRes.status).toHaveBeenCalledWith(404);
        expect(publicRes.json).toHaveBeenCalledWith({ error: 'Not found' });
        middleware({ method, originalUrl: url, headers: { host: '127.0.0.1:12345' } }, localRes, localNext);
        expect(localNext).toHaveBeenCalledTimes(1);
        expect(localRes.json).toBe(originalLocalJson);
        const localPayload = { config: { privateSetting: true }, mappings: { privateViewer: 'local-asset' } };
        localRes.json(localPayload);
        expect(originalLocalJson.mock.calls[0][0]).toBe(localPayload);
      }
    }
    expect(isHttpAllowed({ method, pathname: '/api/webgpu-emoji-rain/overlay/state' })).toBe(true);
    expect(isHttpAllowed({ method, pathname: '/webgpu-emoji-rain/overlay' })).toBe(true);
  });

  test.each(events)('%s direct public emit is withheld and local emit retains original object', (event, payload) => {
    expect(projectPublicOverlayPayload(event, payload)).toBeNull();
    const publicSocket = socket('owned-pilot.trycloudflare.com');
    const localSocket = socket('127.0.0.1:12345');
    const publicEmit = publicSocket.emit; const localEmit = localSocket.emit;
    protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });
    protectPublicSocket({ socket: localSocket, logger: { warn: jest.fn() } });
    expect(publicSocket.emit(event, payload)).toBe(false);
    expect(publicEmit).not.toHaveBeenCalled();
    localSocket.emit(event, payload);
    expect(localEmit).toHaveBeenCalledWith(event, payload);
    expect(localEmit.mock.calls[0][1]).toBe(payload);
  });

  test.each(events)('%s broadcasts and ack broadcasts exclude only public room', (event, payload) => {
    const Adapter = createPublicOverlayAdapter(RecordingAdapter);
    const adapter = new Adapter();
    const packet = { type: 2, data: [event, payload] };
    const options = { rooms: new Set(), except: new Set(['existing-exclusion']) };
    const count = jest.fn(); const ack = jest.fn();
    adapter.broadcast(packet, options);
    adapter.broadcastWithAck(packet, options, count, ack);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.ackCalls).toHaveLength(1);
    for (const call of [...adapter.calls, ...adapter.ackCalls]) {
      expect(call.packet).toBe(packet);
      expect(call.packet.data[1]).toBe(payload);
      expect(call.options.except).toEqual(new Set(['existing-exclusion', PUBLIC_QUICK_TUNNEL_ROOM]));
      expect(call.options.rooms.size).toBe(0);
    }
    expect(options.except).toEqual(new Set(['existing-exclusion']));
    expect(adapter.ackCalls[0].ack).toBe(ack);
    expect(adapter.ackCalls[0].count).toBe(count);
    adapter.broadcast(packet, { rooms: new Set([PUBLIC_QUICK_TUNNEL_ROOM]), except: new Set() });
    expect(adapter.calls[1].options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)).toBe(true);
  });

  test('existing Goals withholding and expressly public producer DTOs keep their contracts', () => {
    expect(projectPublicOverlayPayload('goals:subscribed', {})).toBeNull();
    expect(projectPublicOverlayPayload('multigoals:subscribed', {})).toBeNull();
    expect(projectPublicOverlayPayload('viewer-xp:public-profile', { displayName: 'Public viewer' })).toBeUndefined();
    expect(projectPublicOverlayPayload('sidekick:public-status', { displayName: 'Public viewer' })).toBeUndefined();
  });
});
