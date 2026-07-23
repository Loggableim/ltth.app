const fs = require('fs');
const path = require('path');

describe('Stream Monsters OBS overlay', () => {
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
    expect(html).toContain('const eventQueue');
    expect(html).toContain('drainQueue');
    expect(html).toContain('hat Elementvorteil');
    expect(html).toContain('Vorteil ${battleAdvantageName}');
    expect(html).toContain('@media (orientation: portrait)');
    expect(html).toContain('!hatch');
  });
});
