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

  const arenaAction = (action = {}, actorSide = 'a') => {
    const outcomes = Array.isArray(action.outcomes) ? action.outcomes : [];
    const damageOutcomes = outcomes.filter(outcome => outcome?.type === 'damage');
    const sum = (items, key) => items.reduce((total, item) => total + Math.max(0, Number(item?.[key]) || 0), 0);
    const selectedChoice = String(action.selectedChoice || 'A').toUpperCase();
    const kind = selectedChoice === 'C' ? 'special' : (selectedChoice === 'B' ? 'defense' : 'attack');
    const hitCount = damageOutcomes.length;
    return {
      kind,
      sound: kind === 'special' ? 'special' : (kind === 'defense' ? 'shield' : 'hit'),
      vfxKey: String(action.skill?.vfxKey || `${action.before?.element || 'neutral'}-${kind}`),
      element: action.after?.element || action.before?.element || 'Neutral',
      actorSide: actorSide === 'b' ? 'b' : 'a',
      targetSide: actorSide === 'b' ? 'a' : 'b',
      hitCount,
      multiHit: hitCount > 1,
      damage: sum(damageOutcomes, 'hpDamage'),
      shieldDamage: sum(damageOutcomes, 'shieldAbsorbed'),
      shieldGain: sum(outcomes.filter(outcome => outcome?.type === 'shield'), 'amount'),
      healing: sum(outcomes.filter(outcome => outcome?.type === 'heal'), 'amount'),
      evaded: damageOutcomes.some(outcome => outcome?.evaded),
      durationMs: kind === 'special' ? 3_400 : (hitCount > 1 ? 2_900 : 2_400)
    };
  };

  return { paginate, collectionDurationMs, profile, arenaAction };
}));
