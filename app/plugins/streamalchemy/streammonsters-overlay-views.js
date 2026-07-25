(function attachStreamMonstersOverlayViews(root, factory) {
  const views = factory();
  if (typeof module === 'object' && module.exports) module.exports = views;
  if (root) root.StreamMonstersOverlayViews = views;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  const statValue = (stats, key) => {
    const value = Number(stats?.[key]);
    return Number.isFinite(value) ? value : 0;
  };

  const paginate = (monsters, pageSize = 6) => {
    const source = Array.isArray(monsters) ? monsters : [];
    const size = Math.max(1, Number.parseInt(pageSize, 10) || 6);
    const pages = [];
    for (let index = 0; index < source.length; index += size) {
      pages.push(source.slice(index, index + size));
    }
    return pages;
  };

  const collectionDurationMs = (bottomOverlayDurationMs, pageCount) => (
    Math.max(Number(bottomOverlayDurationMs) || 8_000, Math.max(1, Number(pageCount) || 0) * 5_000)
  );

  const profile = (monster = {}, slot = null) => ({
    ...monster,
    slot: Number.isInteger(Number(slot)) && Number(slot) > 0 ? Number(slot) : null,
    stats: {
      vitality: statValue(monster.stats, 'vitality'),
      might: statValue(monster.stats, 'might'),
      guard: statValue(monster.stats, 'guard'),
      agility: statValue(monster.stats, 'agility')
    }
  });

  return { paginate, collectionDurationMs, profile };
}));
