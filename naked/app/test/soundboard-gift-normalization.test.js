const SoundboardPlugin = require('../plugins/soundboard/main');

function createDbStub() {
  return {
    db: {
      prepare: jest.fn(() => ({
        get: jest.fn((giftId) => {
          if (Number(giftId) !== 5655) return null;
          return {
            id: 1,
            gift_id: 5655,
            label: 'Rose Sound',
            mp3_url: 'https://example.com/rose.mp3',
            volume: 0.5,
            animation_url: null,
            animation_type: 'none',
            animation_volume: 1
          };
        })
      }))
    },
    getSetting: jest.fn((key) => {
      if (key === 'soundboard_audio_target') return 'dashboard';
      if (key === 'soundboard_default_gift_sound') return '';
      if (key === 'soundboard_gift_volume') return '1';
      return null;
    })
  };
}

describe('Soundboard gift event normalization', () => {
  let manager;
  let io;

  beforeEach(() => {
    io = {
      emit: jest.fn(),
      sockets: { sockets: new Map() }
    };

    manager = new SoundboardPlugin.SoundboardManager(createDbStub(), io, {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    });
  });

  test('plays mapped gift sounds when the gift id is nested under gift.id', async () => {
    await manager.playGiftSound({
      gift: {
        id: '5655',
        name: 'Rose'
      },
      uniqueId: 'viewer_1',
      repeat_count: '3'
    });

    expect(io.emit).toHaveBeenCalledWith('soundboard:play', expect.objectContaining({
      url: 'https://example.com/rose.mp3',
      label: 'Rose Sound',
      giftId: 5655,
      eventType: 'gift',
      repeatCount: 3,
      audioTarget: 'dashboard'
    }));
  });
});
