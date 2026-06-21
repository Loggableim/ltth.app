const { getRarityFrame, RARITY_FRAMES } = require('../plugins/streamalchemy/backend/rarity-frames');

describe('StreamAlchemy rarity frames', () => {
  test('maps every rarity tier to a distinct frame class', () => {
    expect(getRarityFrame('Common')).toEqual(expect.objectContaining({
      id: 'common',
      className: 'frame-common'
    }));
    expect(getRarityFrame('Rare')).toEqual(expect.objectContaining({
      id: 'rare',
      className: 'frame-rare'
    }));
    expect(getRarityFrame('Legendary')).toEqual(expect.objectContaining({
      id: 'legendary',
      className: 'frame-legendary'
    }));
    expect(getRarityFrame('Mythic')).toEqual(expect.objectContaining({
      id: 'mythic',
      className: 'frame-mythic'
    }));

    const frameClasses = new Set(Object.values(RARITY_FRAMES).map(frame => frame.className));
    expect(frameClasses.size).toBe(4);
  });

  test('falls back to the common frame for unknown rarity values', () => {
    expect(getRarityFrame('unknown')).toEqual(getRarityFrame('Common'));
    expect(getRarityFrame(null)).toEqual(getRarityFrame('Common'));
  });
});
