const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function bootOverlay() {
  const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const handlers = {};
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/streammonsters/overlay',
    runScripts: 'outside-only'
  });
  dom.window.StreamMonstersOverlayViews = require('../plugins/streamalchemy/streammonsters-overlay-views');
  dom.window.io = () => ({ on: (event, handler) => { handlers[event] = handler; } });
  dom.window.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ config: { bottomOverlayDurationMs: 4_000 } })
  }));
  dom.window.eval(script);
  return { dom, handlers };
}

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
    expect(html).toContain('streammonsters:config_changed');
    expect(html).toContain('/plugins/streamalchemy/streammonsters-overlay-views.js');
    expect(html).toContain('const eventQueue');
    expect(html).toContain('drainQueue');
    expect(html).toContain('id="monster-collection"');
    expect(html).toContain('id="collection-grid"');
    expect(html).toContain('id="monster-profile"');
    expect(html).toContain('showCollection');
    expect(html).toContain('showMonsterProfile');
    expect(html).toContain('collectionDurationMs');
    expect(html).toContain('bottomOverlayDurationMs');
    expect(html).toContain('hat Elementvorteil');
    expect(html).toContain('Vorteil ${battleAdvantageName}');
    expect(html).toContain('@media (orientation: portrait)');
    expect(html).toContain('!hatch');
  });

  test('renders six collection cards and a lower-half stats profile from chat results', async () => {
    const { dom, handlers } = bootOverlay();
    const monsters = Array.from({ length: 7 }, (_, index) => ({
      monster_id: `monster-${index + 1}`,
      name: `Monster ${index + 1}`,
      element: 'Volt',
      level: index + 1,
      personality: 'Brave',
      stats: { vitality: 8, might: 7, guard: 6, agility: 7 }
    }));

    handlers['streammonsters:chat_result']({
      userId: 'viewer-a',
      bottomOverlayDurationMs: 4_000,
      result: { status: 'inventory', monsters, selected: monsters[0] }
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(dom.window.document.getElementById('monster-collection').classList).toContain('visible');
    expect(dom.window.document.querySelectorAll('#collection-grid .monster-tile')).toHaveLength(6);
    expect(dom.window.document.getElementById('collection-page').textContent).toBe('Seite 1/2');
    dom.window.close();

    const profile = bootOverlay();
    profile.handlers['streammonsters:chat_result']({
      userId: 'viewer-a',
      bottomOverlayDurationMs: 4_000,
      result: { status: 'monster', slot: 1, monster: monsters[0] }
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(profile.dom.window.document.getElementById('monster-profile').classList).toContain('visible');
    expect(profile.dom.window.document.getElementById('profile-title').textContent).toBe('Monster 1');
    expect(profile.dom.window.document.querySelectorAll('#profile-stats .profile-stat')).toHaveLength(4);
    profile.dom.window.close();
  });
});
