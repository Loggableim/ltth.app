const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');

function createAdapter() {
  return new EulerstreamAdapter(
    { emit: jest.fn() },
    { loadStreamStats: jest.fn(() => null) },
    {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }
  );
}

describe('Eulerstream team level extraction', () => {
  test('extracts the current TikTok avatar from avatarThumb.url_list', () => {
    const adapter = createAdapter();

    const userData = adapter.extractUserData({
      user: {
        uniqueId: 'avatarviewer',
        userId: '789',
        avatarThumb: {
          url_list: [
            'https://p16-sign-va.tiktokcdn.com/avatarviewer.webp'
          ]
        }
      }
    });

    expect(userData.profilePictureUrl).toBe('https://p16-sign-va.tiktokcdn.com/avatarviewer.webp');
  });

  test('extracts team level from SDK v2 fansClubInfo.fansLevel', () => {
    const adapter = createAdapter();

    const userData = adapter.extractUserData({
      user: {
        uniqueId: 'teamfan',
        userId: '123',
        fansClubInfo: {
          fansLevel: '7'
        }
      }
    });

    expect(userData.teamMemberLevel).toBe(7);
  });

  test('extracts team level from fan badge logExtra level', () => {
    const adapter = createAdapter();

    const userData = adapter.extractUserData({
      user: {
        uniqueId: 'badgefan',
        userId: '456',
        badges: [
          {
            badgeScene: 10,
            logExtra: {
              level: '4'
            }
          }
        ]
      }
    });

    expect(userData.teamMemberLevel).toBe(4);
  });
});
