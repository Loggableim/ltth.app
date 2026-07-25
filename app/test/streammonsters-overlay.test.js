const fs = require('fs');
const path = require('path');

describe('Stream Monsters OBS overlay', () => {
  test('pages collections in stable groups of six and preserves readable duration and stats', () => {
    const views = require('../plugins/streamalchemy/streammonsters-overlay-views');
    const monsters = Array.from({ length: 7 }, (_, index) => ({
      monster_id: `monster-${index + 1}`,
      name: `Monster ${index + 1}`,
      stats: index === 0 ? { vitality: 9, might: 8 } : {}
    }));

    const pages = views.paginate(monsters);
    expect(pages).toHaveLength(2);
    expect(pages[0].map(monster => monster.monster_id)).toEqual([
      'monster-1', 'monster-2', 'monster-3', 'monster-4', 'monster-5', 'monster-6'
    ]);
    expect(pages[1].map(monster => monster.monster_id)).toEqual(['monster-7']);
    expect(views.collectionDurationMs(8_000, pages.length)).toBe(10_000);
    expect(views.profile(monsters[0], 1)).toEqual(expect.objectContaining({
      slot: 1,
      stats: { vitality: 9, might: 8, guard: 0, agility: 0 }
    }));
  });

  test('serializes the complete Collector Arena event set for landscape and portrait', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'), 'utf8');

    expect(html).toContain('streammonsters:egg_spawned');
    expect(html).toContain('streammonsters:egg_boosted');
    expect(html).toContain('streammonsters:gift_combo');
    expect(html).toContain('streammonsters:hype_changed');
    expect(html).toContain('streammonsters:egg_ready');
    expect(html).toContain('streammonsters:hatch_started');
    expect(html).toContain('streammonsters:egg_hatched');
    expect(html).toContain('streammonsters:monster_visual_evolved');
    expect(html).toContain('streammonsters:stream_started');
    expect(html).toContain('streammonsters:battle_started');
    expect(html).toContain('streammonsters:battle_round');
    expect(html).toContain('streammonsters:battle_completed');
    expect(html).toContain('streammonsters:achievement_unlocked');
    expect(html).toContain('streammonsters:season_rank_changed');
    expect(html).toContain('streammonsters:chat_result');
    expect(html).toContain('/plugins/streamalchemy/streammonsters-overlay-views.js');
    expect(html).toContain('const eventQueue');
    expect(html).toContain('drainQueue');
    expect(html).toContain('hat Elementvorteil');
    expect(html).toContain('Vorteil ${battleAdvantageName}');
    expect(html).toContain('@media (orientation: portrait)');
    expect(html).toContain('!hatch');
  });
});
