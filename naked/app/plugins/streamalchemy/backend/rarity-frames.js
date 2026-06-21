const RARITY_FRAMES = {
  Common: {
    id: 'common',
    className: 'frame-common',
    label: 'Bronze frame'
  },
  Rare: {
    id: 'rare',
    className: 'frame-rare',
    label: 'Silver frame'
  },
  Legendary: {
    id: 'legendary',
    className: 'frame-legendary',
    label: 'Gold frame'
  },
  Mythic: {
    id: 'mythic',
    className: 'frame-mythic',
    label: 'Arcane frame'
  }
};

const FRAME_BY_RARITY = Object.fromEntries(
  Object.entries(RARITY_FRAMES).map(([rarity, frame]) => [rarity.toLowerCase(), frame])
);

function getRarityFrame(rarity) {
  const key = typeof rarity === 'string' ? rarity.trim().toLowerCase() : '';
  return FRAME_BY_RARITY[key] || RARITY_FRAMES.Common;
}

module.exports = {
  RARITY_FRAMES,
  getRarityFrame
};
