const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');
const TikTokConnector = require('../modules/tiktok');

function createAdapter() {
  return new EulerstreamAdapter(
    { emit: jest.fn() },
    { loadStreamStats: jest.fn(() => null) },
    { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
  );
}

function extract(data) {
  return createAdapter().extractUserData({
    user: { uniqueId: 'offline-fixture', ...data.user },
    ...data
  });
}

describe('SuperFan and role boundaries (isolated HEAD fixture)', () => {
  test.each([
    ['subscriber', { userIdentity: { isSubscriberOfAnchor: true } }, { isSubscriber: true, isModerator: false }],
    ['moderator', { userIdentity: { isModeratorOfAnchor: true } }, { isSubscriber: false, isModerator: true }]
  ])('%s identity stays separate from fans-club level and SuperFan', (_name, eventFields, expectedRoles) => {
    const user = extract({ user: {}, ...eventFields });
    expect(user).toMatchObject(expectedRoles);
    expect(user.teamMemberLevel).toBe(0);
    expect(user).not.toHaveProperty('isSuperFan');
    expect(user).not.toHaveProperty('superFan');
  });

  test('an explicit fans-club level stays a level and does not imply subscriber or SuperFan', () => {
    const user = extract({ user: { fansClubInfo: { fansLevel: '7' } } });
    expect(user.teamMemberLevel).toBe(7);
    expect(user.isSubscriber).toBe(false);
    expect(user.isModerator).toBe(false);
    expect(user).not.toHaveProperty('isSuperFan');
    expect(user).not.toHaveProperty('superFan');
  });

  test('gift history is not a normalized SuperFan role', () => {
    const user = extract({ user: { gifts_sent: 100, totalCoins: 50000 } });
    expect(user.teamMemberLevel).toBe(0);
    expect(user).not.toHaveProperty('isSuperFan');
    expect(user).not.toHaveProperty('superFan');
  });

  test('an unclassified WebcastBarrageMessage is not promoted to a SuperFan event', () => {
    const adapter = createAdapter();
    expect(adapter._mapEulerStreamEventType('WebcastBarrageMessage')).toBeNull();
  });

  test('the connector does not expose the unprojected EulerStream SuperFan envelope', () => {
    const connector = Object.create(TikTokConnector.prototype);
    connector.emit = jest.fn();
    const handlers = new Map();
    const adapter = {
      on: jest.fn((event, handler) => handlers.set(event, handler))
    };
    connector._bindAdapterEvents(adapter);

    expect(handlers.has('superfan')).toBe(false);
    expect(connector.emit).not.toHaveBeenCalledWith('superfan', expect.anything());
  });
});
