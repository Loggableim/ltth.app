'use strict';

const EventEmitter = require('events');
const schema = require('../node_modules/@eulerstream/euler-websocket-sdk/dist/webcast/schemas/tiktok-schema-v2');
const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');
const ClarityHUDBackend = require('../plugins/clarityhud/backend/api');
const {
  classifySuperFanBarrage,
  projectSuperFanDisplayMessage
} = require('../plugins/clarityhud/lib/superfan-classifier');
const {
  projectPublicOverlayPayload,
  projectClarityStateResponse,
  projectViewerXpAvatarUrl
} = require('../modules/public-overlay-payload-projection');
const { isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');
const { protectPublicSocket } = require('../modules/public-overlay-access');

function makeUser(overrides = {}) {
  return {
    ...schema.UserDecoder.decode(new Uint8Array()),
    nickname: 'Synthetic Viewer',
    ...overrides
  };
}

function makeText(displayType, users = [], overrides = {}) {
  return {
    ...schema.TextDecoder.decode(new Uint8Array()),
    displayType,
    piecesList: users.map(user => ({
      ...schema.Text_TextPieceDecoder.decode(new Uint8Array()),
      type: 11,
      userValue: { user, withColon: false }
    })),
    ...overrides
  };
}

function makeBarrage({ marker = 'ttlive_superfan', field = 'content', users = null, user = null, other = {} } = {}) {
  const actors = users || [user || makeUser()];
  const message = {
    ...schema.WebcastBarrageMessageDecoder.decode(new Uint8Array()),
    ...other,
    [field]: makeText(marker, actors, other[field] || {})
  };
  if (field === 'content' && other.commonBarrageContent) {
    message.commonBarrageContent = other.commonBarrageContent;
  }
  return schema.WebcastBarrageMessageDecoder.decode(
    schema.WebcastBarrageMessageDecoder.encode(message).finish()
  );
}

describe('EulerStream v2 SuperFan display-only path', () => {
  test.each(['content', 'commonBarrageContent'])('projects a decoded v2 shape from %s only', field => {
    const actor = makeUser({ nickname: 'Fixture viewer' });
    const message = makeBarrage({ field, user: actor });
    expect(projectSuperFanDisplayMessage(message, projectViewerXpAvatarUrl)).toEqual({
      eventType: 'superfan', displayName: 'Fixture viewer'
    });
  });

  test('prioritizes SuperFan join over the generic marker', () => {
    const message = makeBarrage({
      marker: 'ttlive_superfan',
      users: [],
      other: { commonBarrageContent: makeText('ttlive_superfan_commentnotif_superfanjoined', [makeUser()]) }
    });
    expect(classifySuperFanBarrage(message)).toBe('superfan-join');
  });

  test.each([
    ['unknown marker', 'ttlive_unknown_interaction', null],
    ['superfan box marker', 'ttlive_superfanbox', null],
    ['wrapped generic marker', 'prefix_ttlive_superfan_suffix', 'superfan'],
    ['generic prefix near-match', 'ttlive_superfanish', 'superfan'],
    ['incomplete join near-match', 'ttlive_superfan_joined', 'superfan']
  ])('characterizes the provisional displayType heuristic for %s', (_label, marker, expected) => {
    expect(classifySuperFanBarrage(makeBarrage({ marker }))).toBe(expected);
  });

  test.each([
    { label: 'missing actor', users: [] },
    { label: 'multiple actors', users: [makeUser(), makeUser({ nickname: 'Second actor' })] }
  ])('fails closed for $label', ({ users }) => {
    expect(projectSuperFanDisplayMessage(makeBarrage({ users }), projectViewerXpAvatarUrl)).toBeNull();
  });

  test('fails closed for an invalid userValue actor', () => {
    const message = {
      ...schema.WebcastBarrageMessageDecoder.decode(new Uint8Array()),
      content: makeText('ttlive_superfan', [], {
        piecesList: [{ ...schema.Text_TextPieceDecoder.decode(new Uint8Array()), userValue: { user: undefined } }]
      })
    };
    expect(projectSuperFanDisplayMessage(message, projectViewerXpAvatarUrl)).toBeNull();
  });

  test('fails closed when actor pieces repeat across content fields, even for the same actor', () => {
    const actor = makeUser({ nickname: 'Repeated actor' });
    const message = makeBarrage({
      user: actor,
      other: { commonBarrageContent: makeText('ttlive_superfan', [actor]) }
    });
    expect(projectSuperFanDisplayMessage(message, projectViewerXpAvatarUrl)).toBeNull();
  });

  test('caps and validates the display name while preserving literal markup as text data', () => {
    const markup = '<img src=x onerror=alert(1)>';
    expect(projectSuperFanDisplayMessage(makeBarrage({ user: makeUser({ nickname: markup }) }), projectViewerXpAvatarUrl)
      .displayName).toBe(markup);
    expect(projectSuperFanDisplayMessage(makeBarrage({ user: makeUser({ nickname: 'n'.repeat(81) }) }), projectViewerXpAvatarUrl))
      .toBeNull();
    expect(projectSuperFanDisplayMessage(makeBarrage({ user: makeUser({ nickname: 'bad\nname' }) }), projectViewerXpAvatarUrl))
      .toBeNull();
  });

  test('includes one validated level path and drops ambiguous, invalid, or conflicting levels', () => {
    const fansClubInfo = { ...schema.User_FansClubInfoDecoder.decode(new Uint8Array()), fansLevel: '7' };
    const fromFansClubInfo = projectSuperFanDisplayMessage(
      makeBarrage({ user: makeUser({ fansClubInfo }) }), projectViewerXpAvatarUrl);
    expect(fromFansClubInfo.level).toBe(7);

    const fansClub = { ...schema.FansClubMemberDecoder.decode(new Uint8Array()), data: { ...schema.FansClubDataDecoder.decode(new Uint8Array()), level: 4 } };
    const fromFansClubData = projectSuperFanDisplayMessage(
      makeBarrage({ user: makeUser({ fansClub }) }), projectViewerXpAvatarUrl);
    expect(fromFansClubData.level).toBe(4);

    const ambiguous = projectSuperFanDisplayMessage(
      makeBarrage({ user: makeUser({ fansClubInfo, fansClub }) }), projectViewerXpAvatarUrl);
    expect(ambiguous).not.toHaveProperty('level');
    const invalidMessage = makeBarrage();
    invalidMessage.content.piecesList[0].userValue.user.fansClubInfo = {
      ...fansClubInfo,
      fansLevel: 'level 7'
    };
    const invalid = projectSuperFanDisplayMessage(invalidMessage, projectViewerXpAvatarUrl);
    expect(invalid).not.toHaveProperty('level');
  });

  test('keeps only a TikTok-CDN HTTPS avatar and drops disallowed avatar candidates', () => {
    const validImage = { ...schema.ImageDecoder.decode(new Uint8Array()), url: ['https://p16-sign.tiktokcdn.com/fixture.jpg'] };
    const valid = projectSuperFanDisplayMessage(
      makeBarrage({ user: makeUser({ profilePicture: validImage }) }), projectViewerXpAvatarUrl);
    expect(valid.profilePictureUrl).toBe('https://p16-sign.tiktokcdn.com/fixture.jpg');

    const invalidImage = { ...schema.ImageDecoder.decode(new Uint8Array()), url: ['https://evil.example/avatar.jpg'] };
    const invalid = projectSuperFanDisplayMessage(
      makeBarrage({ user: makeUser({ profilePicture: invalidImage }) }), projectViewerXpAvatarUrl);
    expect(invalid).not.toHaveProperty('profilePictureUrl');
  });

  test('adapter emits one safe display DTO and never dispatches the raw barrage', () => {
    const adapter = Object.create(EulerstreamAdapter.prototype);
    EventEmitter.call(adapter);
    adapter.eventEmitter = new EventEmitter();
    adapter.logger = { debug: jest.fn(), warn: jest.fn(), info: jest.fn() };
    adapter.handleEvent = jest.fn();
    adapter._emitGlobal = jest.fn();
    const emitted = [];
    adapter.on('superfan-display', data => emitted.push(data));
    adapter.on('superfan', data => emitted.push({ rawSuperFan: data }));
    const actor = makeUser({ nickname: 'Adapter fixture', userId: '99' });

    adapter._dispatchEulerstreamMessage({ type: 'WebcastBarrageMessage', data: makeBarrage({ user: actor }) });

    expect(emitted).toEqual([{ eventType: 'superfan', displayName: 'Adapter fixture' }]);
    expect(adapter.handleEvent).not.toHaveBeenCalled();
    expect(adapter._emitGlobal).not.toHaveBeenCalled();
  });

  test('ClarityHUD writes an allowlisted queue/live DTO without subscribe side effects', async () => {
    const api = { emit: jest.fn(), log: jest.fn() };
    const backend = new ClarityHUDBackend(api);
    const input = {
      eventType: 'superfan-join', displayName: 'Safe name', level: 3,
      profilePictureUrl: 'https://p16-sign.tiktokcdn.com/fixture.jpg',
      userId: 'must-drop', raw: { secret: 'must-drop' }
    };

    await backend.handleSuperFanDisplayEvent(input);

    expect(api.emit).toHaveBeenCalledTimes(1);
    expect(api.emit).toHaveBeenCalledWith('clarityhud.update.superfan-display', {
      eventType: 'superfan-join', displayName: 'Safe name', level: 3,
      profilePictureUrl: 'https://p16-sign.tiktokcdn.com/fixture.jpg'
    });
    expect(api.emit).not.toHaveBeenCalledWith('clarityhud.update.subscribe', expect.anything());
    expect(backend.eventQueues.subscribe).toEqual([]);
    expect(backend.eventQueues['superfan-display'][0]).not.toHaveProperty('raw');
    expect(backend.eventQueues['superfan-display'][0]).not.toHaveProperty('userId');

    const live = projectPublicOverlayPayload('clarityhud.update.superfan-display', api.emit.mock.calls[0][1]);
    const state = projectClarityStateResponse('full', {
      success: true, dock: 'full', settings: backend.settings.full, events: backend.eventQueues
    });
    expect(live).not.toBeNull();
    expect(state.events['superfan-display'][0]).toEqual(live);
    expect(state.events['superfan-display'][0]).not.toHaveProperty('type');
    expect(state.events['superfan-display'][0]).not.toHaveProperty('timestamp');
    expect(isOutgoingSocketEventAllowed('clarityhud.update.superfan-display')).toBe(true);

    const socket = {
      handshake: { headers: { host: 'quiet-river.trycloudflare.com' } },
      data: {},
      join: jest.fn(),
      use: jest.fn(),
      emit: jest.fn(() => true)
    };
    const originalEmit = socket.emit;
    protectPublicSocket({
      socket,
      logger: { warn: jest.fn() },
      pluginReleasePolicy: {
        getPublicSurfaceSnapshot: () => ({ publicSurface: true, publicMode: true, policyInvalid: false }),
        isClosedBetaId: () => false
      }
    });
    socket.emit('clarityhud.update.superfan-display', live);
    expect(originalEmit).toHaveBeenCalledWith('clarityhud.update.superfan-display', {
      eventType: 'superfan-join', displayName: 'Safe name', level: 3,
      profilePictureUrl: 'https://p16-sign.tiktokcdn.com/fixture.jpg'
    });
  });

  test('public projection rejects unknown fields and withholds bad avatar URLs only', () => {
    expect(projectPublicOverlayPayload('clarityhud.update.superfan-display', {
      eventType: 'superfan', displayName: 'Viewer', userId: 'blocked'
    })).toBeNull();
    expect(projectPublicOverlayPayload('clarityhud.update.superfan-display', {
      eventType: 'superfan', displayName: 'Viewer', profilePictureUrl: 'http://evil.example/avatar'
    })).toEqual({ eventType: 'superfan', displayName: 'Viewer' });
  });
});
