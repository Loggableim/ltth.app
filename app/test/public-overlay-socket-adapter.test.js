'use strict';

const {
  PUBLIC_QUICK_TUNNEL_ROOM,
  createPublicOverlayAdapter
} = require('../modules/public-overlay-socket-adapter');

class RecordingAdapter {
  constructor(namespace) {
    this.namespace = namespace;
    this.broadcastCalls = [];
    this.broadcastWithAckCalls = [];
  }

  broadcast(packet, options) {
    this.broadcastCalls.push({ packet, options });
  }

  broadcastWithAck(packet, options, clientCountCallback, ack) {
    this.broadcastWithAckCalls.push({
      packet,
      options,
      clientCountCallback,
      ack
    });
  }
}

describe('PublicOverlayAdapter', () => {
  const Adapter = createPublicOverlayAdapter(RecordingAdapter);

  test('splits projected outgoing broadcasts into unchanged local and public-only calls', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set(['local-exclusion']) };
    const payload = { action: 'rain', intensity: 1, duration: 1000, permanent: false, options: {} };

    adapter.broadcast({ data: ['webgpu-weather:trigger', payload] }, options);

    expect(adapter.broadcastCalls).toHaveLength(2);
    const localCall = adapter.broadcastCalls[0];
    const publicCall = adapter.broadcastCalls[1];
    expect(localCall.packet.data[1]).toBe(payload);
    expect([...localCall.options.except]).toEqual(['local-exclusion', PUBLIC_QUICK_TUNNEL_ROOM]);
    expect([...localCall.options.rooms]).toEqual([]);
    expect(publicCall.packet.data).toEqual(['webgpu-weather:trigger', payload]);
    expect([...publicCall.options.rooms]).toEqual([PUBLIC_QUICK_TUNNEL_ROOM]);
    expect([...publicCall.options.except]).toEqual(['local-exclusion']);
    expect([...options.rooms]).toEqual([]);
    expect([...options.except]).toEqual(['local-exclusion']);
  });

  test('projects Arena state and config only for the public room while preserving local gameplay payloads', () => {
    const adapter = new Adapter({ name: '/' });
    const state = {
      gameType: 'arena', timestamp: 123,
      config: { arenaWidth: 1080, giftWeaponMappings: { privateGiftId: { weaponType: 'mine' } }, bombRange: 420 },
      fever: { active: false, endsAt: 456 }, players: [], food: [], weaponPickups: [],
      mines: [], bombs: [], leaderboard: [], internalState: 'private'
    };
    const configUpdate = {
      gameType: 'arena', config: { arenaWidth: 1280, arenaHeight: 720, giftWeaponMappings: { privateGiftId: { weaponType: 'chainsaw' } }, bombRange: 420 }
    };
    const options = { rooms: new Set(), except: new Set() };

    adapter.broadcast({ data: ['arena:state', state] }, options);
    adapter.broadcast({ data: ['game-engine:config-updated', configUpdate] }, options);

    expect(adapter.broadcastCalls).toHaveLength(4);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(state);
    expect(adapter.broadcastCalls[2].packet.data[1]).toBe(configUpdate);
    expect(adapter.broadcastCalls[1].packet.data).toEqual(['arena:state', {
      gameType: 'arena', config: { giftWeaponMappings: {}, arenaWidth: 1080 },
      fever: { active: false }, players: [], food: [], weaponPickups: [], mines: [], bombs: [], leaderboard: []
    }]);
    expect(adapter.broadcastCalls[3].packet.data).toEqual(['game-engine:config-updated', {
      gameType: 'arena', config: { giftWeaponMappings: {}, arenaWidth: 1280, arenaHeight: 720 }
    }]);
    expect([...adapter.broadcastCalls[1].options.rooms]).toEqual([PUBLIC_QUICK_TUNNEL_ROOM]);
    expect([...adapter.broadcastCalls[0].options.except]).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
  });

  test('projects Chess and Connect4 config updates while preserving local config and withholding unused game types', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set() };
    const chess = {
      gameType: 'chess',
      config: { boardTheme: 'wood', backgroundColor: '#123456', streamerRole: 'black', autoplay: { enabled: true }, privateCanary: 'local' }
    };
    const connect4 = {
      gameType: 'connect4',
      config: { boardColor: '#123456', chatCommand: 'private-command', timeoutLockoutMinutes: 30, privateCanary: 'local' }
    };
    const interactive = { gameType: 'interactive', config: { privateCanary: 'local' } };

    adapter.broadcast({ data: ['game-engine:config-updated', chess] }, options);
    adapter.broadcast({ data: ['game-engine:config-updated', connect4] }, options);
    adapter.broadcast({ data: ['game-engine:config-updated', interactive] }, options);

    expect(adapter.broadcastCalls).toHaveLength(5);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(chess);
    expect(adapter.broadcastCalls[2].packet.data[1]).toBe(connect4);
    expect(adapter.broadcastCalls[4].packet.data[1]).toBe(interactive);
    expect(adapter.broadcastCalls[1].packet.data).toEqual(['game-engine:config-updated', {
      gameType: 'chess', config: { boardTheme: 'wood', backgroundColor: '#123456' }
    }]);
    expect(adapter.broadcastCalls[3].packet.data).toEqual(['game-engine:config-updated', {
      gameType: 'connect4', config: { boardColor: '#123456' }
    }]);
    expect(adapter.broadcastCalls[4].options.rooms).toEqual(new Set());
  });

  test('projects only ZappieHell public payloads while preserving the full local packet', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set(['local-exclusion']) };
    const payload = {
      goals: [{
        id: 'internal-goal-id',
        name: 'Goal',
        targetCoins: 100,
        currentCoins: 20,
        type: 'stream',
        active: true,
        chainId: 'internal-chain-id',
        privateSetting: 'local-only'
      }],
      coinsAdded: 5,
      internalMetadata: 'local-only'
    };

    adapter.broadcast({ data: ['zappiehell:goals:update', payload] }, options);

    expect(adapter.broadcastCalls).toHaveLength(2);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(payload);
    expect([...adapter.broadcastCalls[0].options.except]).toEqual([
      'local-exclusion',
      PUBLIC_QUICK_TUNNEL_ROOM
    ]);
    const publicPayload = adapter.broadcastCalls[1].packet.data[1];
    expect(adapter.broadcastCalls[1].packet.data[0]).toBe('zappiehell:goals:update');
    expect(publicPayload.goals[0]).toMatchObject({
      name: 'Goal', targetCoins: 100, currentCoins: 20, type: 'stream', active: true
    });
    expect(publicPayload.goals[0].displayToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(publicPayload.goals[0]).not.toHaveProperty('id');
    expect(JSON.stringify(publicPayload)).not.toContain('internal-goal-id');
    expect([...adapter.broadcastCalls[1].options.rooms]).toEqual([PUBLIC_QUICK_TUNNEL_ROOM]);
    expect([...adapter.broadcastCalls[1].options.except]).toEqual(['local-exclusion']);
    expect([...options.except]).toEqual(['local-exclusion']);
  });

  test('projects TopTier producer updates only for the public room and preserves local session ids', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set() };
    const payload = {
      board: 'likes',
      entries: [{ username: 'fixture-viewer', nickname: 'Fixture Viewer', profile_picture_url: '', score: 12, rank: 1 }],
      sessionId: 'fixture-internal-session',
      active: true
    };

    adapter.broadcast({ data: ['toptier:update', payload] }, options);

    expect(adapter.broadcastCalls).toHaveLength(2);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(payload);
    expect(adapter.broadcastCalls[0].packet.data[1].sessionId).toBe('fixture-internal-session');
    expect([...adapter.broadcastCalls[0].options.except]).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
    expect(adapter.broadcastCalls[1].packet.data).toEqual(['toptier:update', {
      board: 'likes',
      entries: [{ username: 'fixture-viewer', nickname: 'Fixture Viewer', profile_picture_url: '', score: 12, rank: 1 }]
    }]);
    expect([...adapter.broadcastCalls[1].options.rooms]).toEqual([PUBLIC_QUICK_TUNNEL_ROOM]);
  });

  test('projects Schnorrbecher add and sync payloads for public clients while preserving local payloads', () => {
    const adapter = new Adapter({ name: '/' });
    const addOptions = { rooms: new Set(), except: new Set() };
    const addPayload = {
      generation: 2, totalValue: 5, visualCoins: 2, totalCoinValue: 17, visualCoinCount: 8,
      eventId: 'fixture-event-id', comboId: 'fixture-combo-id', senderId: 'fixture-platform-id',
      senderName: 'Fixture Nickname', giftId: 'fixture-gift-id', giftName: 'Rose', giftImage: '', timestamp: 99
    };
    adapter.broadcast({ data: ['coinJar.add', addPayload] }, addOptions);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(addPayload);
    expect(adapter.broadcastCalls[1].packet.data[1]).toEqual({
      generation: 2, totalValue: 5, visualCoins: 2, totalCoinValue: 17,
      giftName: 'Rose', giftImage: '', senderName: 'Viewer'
    });

    adapter.broadcastCalls.length = 0;
    const syncOptions = { rooms: new Set(), except: new Set() };
    const syncPayload = {
      sessionId: 'fixture-room-id', generation: 2, totalCoinValue: 17, visualCoinCount: 2,
      recentGifts: [{ giftId: 'fixture-gift-id', giftName: 'Rose', giftImage: '' }],
      updatedAt: 123, livestreamStatus: 'active', config: { enabled: true, maxPhysicalIcons: 300, privateSetting: 'fixture-secret' }
    };
    adapter.broadcast({ data: ['coinJar.sync', syncPayload] }, syncOptions);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(syncPayload);
    const publicSync = adapter.broadcastCalls[1].packet.data[1];
    expect(publicSync).toEqual({
      generation: 2, totalCoinValue: 17, visualCoinCount: 2,
      recentGifts: [{ giftName: 'Rose', giftImage: '' }],
      config: { enabled: true, maxPhysicalIcons: 300 }
    });
    expect(JSON.stringify(publicSync)).not.toMatch(/fixture-(?:room-id|gift-id|secret)/);
  });

  test('removes audioId from the public audio payload but keeps rendered text and voice', () => {
    const adapter = new Adapter({ name: '/' });
    const payload = { audioId: 'internal-audio-id', text: 'Hello', voice: 'Fixture Voice', apiKey: 'local-only' };

    adapter.broadcast({ data: ['zappiehell:audio:play', payload] }, { rooms: new Set(), except: new Set() });

    expect(adapter.broadcastCalls).toHaveLength(2);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(payload);
    expect(adapter.broadcastCalls[1].packet.data).toEqual([
      'zappiehell:audio:play',
      { text: 'Hello', voice: 'Fixture Voice' }
    ]);
  });

  test('uses one opaque goal token across state, updates, completion, and adapter instances', () => {
    const adapter = new Adapter({ name: '/' });
    const goal = {
      id: 'adapter-shared-goal-fixture', name: 'Goal', targetCoins: 100,
      currentCoins: 100, type: 'stream', active: true
    };
    for (const [eventName, payload] of [
      ['zappiehell:goals:state', { goals: [goal] }],
      ['zappiehell:goals:update', { goals: [goal] }],
      ['zappiehell:goals:completed', { goal }]
    ]) {
      adapter.broadcast({ data: [eventName, payload] }, { rooms: new Set(), except: new Set() });
    }

    const state = adapter.broadcastCalls[1].packet.data[1].goals[0].displayToken;
    const update = adapter.broadcastCalls[3].packet.data[1].goals[0].displayToken;
    const completion = adapter.broadcastCalls[5].packet.data[1].goal.displayToken;
    expect(update).toBe(state);
    expect(completion).toBe(state);
    for (const index of [1, 3, 5]) {
      expect(JSON.stringify(adapter.broadcastCalls[index].packet.data)).not.toContain(goal.id);
    }
  });

  test('withholds malformed projected payloads from public sockets only', () => {
    const adapter = new Adapter({ name: '/' });
    const payload = { goals: [{ id: 'goal-1', chainId: 'private' }] };

    adapter.broadcast({ data: ['zappiehell:goals:state', payload] }, { rooms: new Set(), except: new Set() });

    expect(adapter.broadcastCalls).toHaveLength(1);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(payload);
    expect([...adapter.broadcastCalls[0].options.except]).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
  });

  test('adds the public room to exclusions for an unregistered broadcast', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set(['local-exclusion']) };

    adapter.broadcast({ data: ['admin:settings-updated', { secret: true }] }, options);

    const forwarded = adapter.broadcastCalls[0].options;
    expect(forwarded).not.toBe(options);
    expect([...forwarded.except]).toEqual([
      'local-exclusion',
      PUBLIC_QUICK_TUNNEL_ROOM
    ]);
    expect([...options.except]).toEqual(['local-exclusion']);
  });

  test('applies the same exclusion to acknowledgement broadcasts', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set() };
    const clientCountCallback = jest.fn();
    const ack = jest.fn();

    adapter.broadcastWithAck(
      { data: ['admin:settings-updated'] },
      options,
      clientCountCallback,
      ack
    );

    expect([
      ...adapter.broadcastWithAckCalls[0].options.except
    ]).toEqual([PUBLIC_QUICK_TUNNEL_ROOM]);
    expect(adapter.broadcastWithAckCalls[0].clientCountCallback).toBe(clientCountCallback);
    expect(adapter.broadcastWithAckCalls[0].ack).toBe(ack);
  });

  test('withholds projected events from public sockets for ack broadcasts until split ack is defined', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set() };
    const clientCountCallback = jest.fn();
    const ack = jest.fn();

    adapter.broadcastWithAck(
      { data: ['zappiehell:audio:play', { audioId: 'private', text: 'Hello' }] },
      options,
      clientCountCallback,
      ack
    );

    expect(adapter.broadcastWithAckCalls).toHaveLength(1);
    expect([...adapter.broadcastWithAckCalls[0].options.except]).toEqual([PUBLIC_QUICK_TUNNEL_ROOM]);
    expect(adapter.broadcastWithAckCalls[0].packet.data[1].audioId).toBe('private');
  });

  test('preserves protocol packets that do not contain an application event', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set() };

    adapter.broadcast({ type: 3, data: undefined }, options);

    expect(adapter.broadcastCalls[0].options).toBe(options);
  });
});
