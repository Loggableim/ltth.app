const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function bootOverlay({ reducedMotion = false, webgpu = false, fastTimers = false, audioManifest = [], audioFactory = null } = {}) {
  const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const handlers = {};
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/streammonsters/overlay',
    runScripts: 'outside-only'
  });
  dom.window.matchMedia = jest.fn(() => ({ matches: reducedMotion }));
  if (fastTimers) dom.window.setTimeout = callback => { callback(); return 0; };
  let webgpuState = null;
  if (webgpu) {
    const renderPass = {
      setPipeline: jest.fn(),
      setBindGroup: jest.fn(),
      draw: jest.fn(),
      end: jest.fn()
    };
    const commandEncoder = {
      beginRenderPass: jest.fn(() => renderPass),
      finish: jest.fn(() => ({ commandBuffer: true }))
    };
    const device = {
      lost: new Promise(() => {}),
      createShaderModule: jest.fn(options => options),
      createRenderPipeline: jest.fn(() => ({ getBindGroupLayout: jest.fn(() => ({})) })),
      createBuffer: jest.fn(() => ({})),
      createBindGroup: jest.fn(() => ({})),
      createCommandEncoder: jest.fn(() => commandEncoder),
      queue: { writeBuffer: jest.fn(), submit: jest.fn() }
    };
    const context = {
      configure: jest.fn(),
      getCurrentTexture: jest.fn(() => ({ createView: jest.fn(() => ({})) }))
    };
    Object.defineProperty(dom.window.navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: jest.fn(async () => ({ requestDevice: jest.fn(async () => device) })),
        getPreferredCanvasFormat: jest.fn(() => 'bgra8unorm')
      }
    });
    const originalGetContext = dom.window.HTMLCanvasElement.prototype.getContext;
    dom.window.HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (this.id === 'battle-effects' && type === 'webgpu') return context;
      return originalGetContext.call(this, type, ...args);
    };
    webgpuState = { device, context, renderPass };
  }
  dom.window.StreamMonstersOverlayViews = require('../plugins/streamalchemy/streammonsters-overlay-views');
  dom.window.io = () => ({ on: (event, handler) => { handlers[event] = handler; } });
  if (audioFactory) dom.window.Audio = audioFactory;
  dom.window.fetch = jest.fn(async url => ({
    ok: true,
    json: async () => url === '/plugins/streamalchemy/assets/streammonsters/audio/manifest.json'
      ? { sounds: audioManifest }
      : ({ config: { bottomOverlayDurationMs: 4_000 } })
  }));
  dom.window.eval(script);
  return { dom, handlers, webgpu: webgpuState };
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

  test('derives a deterministic cinematic cue from the persisted battle outcome payload', () => {
    const views = require('../plugins/streamalchemy/streammonsters-overlay-views');
    const cue = views.arenaAction({
      selectedChoice: 'C',
      skill: { vfxKey: 'volt-overclock-beam' },
      before: { element: 'Volt' },
      outcomes: [
        { type: 'damage', hpDamage: 5, shieldAbsorbed: 2 },
        { type: 'damage', hpDamage: 6, shieldAbsorbed: 1 },
        { type: 'shield', amount: 4 },
        { type: 'heal', amount: 2 }
      ]
    }, 'a');

    expect(cue).toEqual(expect.objectContaining({
      kind: 'special',
      sound: 'special',
      vfxKey: 'volt-overclock-beam',
      element: 'Volt',
      actorSide: 'a',
      targetSide: 'b',
      hitCount: 2,
      damage: 11,
      shieldDamage: 3,
      shieldGain: 4,
      healing: 2
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
    expect(html).toContain("advantage:'Elementvorteil: {name}'");
    expect(html).toContain('@media (orientation: portrait)');
    expect(html).toContain('!hatch');
    expect(html.match(/if \(type === 'battle_started'\)/g)).toHaveLength(1);
    expect(html.match(/if \(type === 'battle_round'\)/g)).toHaveLength(1);
    expect(html.match(/if \(type === 'battle_action'\)/g)).toHaveLength(1);
  });

  test('provides a cinematic two-monster arena with WebGPU and accessible fallbacks', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'), 'utf8');

    expect(html).toContain('id="battle-arena"');
    expect(html).toContain('id="battle-fighter-a"');
    expect(html).toContain('id="battle-fighter-b"');
    expect(html).toContain('id="battle-skill-options"');
    expect(html).toContain('id="battle-effects"');
    expect(html).toContain('navigator.gpu');
    expect(html).toContain("getContext('webgpu')");
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('streammonsters:battle_match_found');
    expect(html).toContain('streammonsters:battle_cancelled');
    expect(html).toContain('streammonsters:battle_skill_prompt');
    expect(html).toContain('streammonsters:battle_skill_locked');
    expect(html).toContain('streammonsters:battle_action');
    expect(html).toContain('streammonsters:battle_knockout');
    expect(html).toContain('streammonsters:monster_stat_prompt');
    expect(html).toContain('streammonsters:monster_stat_chosen');
    expect(html).toContain('streammonsters:monster_stat_auto_assigned');
    expect(html).toContain('MIN_BOTTOM_OVERLAY_DURATION_MS = 8_000');
    expect(html).toContain('DEFAULT_BOTTOM_OVERLAY_DURATION_MS = 12_000');
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

  test('establishes a visible two-monster arena from a standalone battle action', async () => {
    const { dom, handlers } = bootOverlay({ reducedMotion: true });
    handlers['streammonsters:battle_action']({
      battleId: 'battle-direct-action',
      roundNumber: 1,
      action: {
        monsterId: 'monster-a',
        targetMonsterId: 'monster-b',
        selectedChoice: 'C',
        skill: { name: 'Overclock Beam', vfxKey: 'volt-overclock-beam' },
        before: { monsterId: 'monster-a', name: 'Pulse', element: 'Volt', imageUrl: '/pulse.png', maxHp: 58, hp: 58, charge: 100 },
        after: { monsterId: 'monster-a', name: 'Pulse', element: 'Volt', imageUrl: '/pulse.png', maxHp: 58, hp: 58, charge: 0 },
        targetBefore: { monsterId: 'monster-b', name: 'Mosswhisker', element: 'Grove', imageUrl: '/moss.png', maxHp: 62, hp: 62, charge: 25 },
        targetAfter: { monsterId: 'monster-b', name: 'Mosswhisker', element: 'Grove', imageUrl: '/moss.png', maxHp: 62, hp: 43, charge: 50 },
        outcomes: [{ type: 'damage', hpDamage: 19, shieldAbsorbed: 0 }]
      }
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(dom.window.document.getElementById('battle').classList).toContain('visible');
    expect(dom.window.document.getElementById('battle-art-a').src).toContain('/pulse.png');
    expect(dom.window.document.getElementById('battle-art-b').src).toContain('/moss.png');
    expect(dom.window.document.getElementById('battle').classList).toContain('arena-special');
    expect(dom.window.document.getElementById('battle').dataset.vfxKey).toBe('volt-overclock-beam');
    expect(dom.window.document.getElementById('battle').dataset.sound).toBe('special');
    dom.window.close();
  });

  test('turns battle outcomes into shield, healing and damage feedback for the broadcast arena', async () => {
    const { dom, handlers } = bootOverlay({ reducedMotion: true });
    handlers['streammonsters:battle_action']({
      battleId: 'battle-effects',
      roundNumber: 2,
      action: {
        monsterId: 'monster-a',
        targetMonsterId: 'monster-b',
        selectedChoice: 'B',
        skill: { name: 'Charge Shell', vfxKey: 'volt-charge-shell' },
        before: { monsterId: 'monster-a', name: 'Pulse', element: 'Volt', imageUrl: '/pulse.png', maxHp: 58, hp: 41, shield: 0, charge: 50 },
        after: { monsterId: 'monster-a', name: 'Pulse', element: 'Volt', imageUrl: '/pulse.png', maxHp: 58, hp: 44, shield: 6, charge: 100 },
        targetBefore: { monsterId: 'monster-b', name: 'Mosswhisker', element: 'Grove', imageUrl: '/moss.png', maxHp: 62, hp: 62, shield: 0, charge: 25 },
        targetAfter: { monsterId: 'monster-b', name: 'Mosswhisker', element: 'Grove', imageUrl: '/moss.png', maxHp: 62, hp: 56, shield: 0, charge: 50 },
        outcomes: [
          { type: 'damage', hpDamage: 6, shieldAbsorbed: 0 },
          { type: 'shield', amount: 6 },
          { type: 'heal', amount: 3 }
        ]
      }
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(dom.window.document.getElementById('battle-shield-label-a').textContent).toBe('6');
    expect(dom.window.document.getElementById('battle-float-layer').textContent).toContain('-6');
    expect(dom.window.document.getElementById('battle-float-layer').textContent).toContain('+6');
    expect(dom.window.document.getElementById('battle-float-layer').textContent).toContain('+3');
    expect(dom.window.document.getElementById('battle').classList).toContain('arena-defense');
    dom.window.close();
  });

  test('adopts live audio and quality configuration without replaying an old event', async () => {
    const { dom, handlers } = bootOverlay({ reducedMotion: true });
    handlers['streammonsters:config_changed']({
      config: { bottomOverlayDurationMs: 12_000, arenaAudioEnabled: false, arenaAudioVolume: 0.35, arenaEffectsQuality: 'reduced' }
    });
    await Promise.resolve();

    const battle = dom.window.document.getElementById('battle');
    expect(battle.dataset.audioEnabled).toBe('false');
    expect(battle.dataset.audioVolume).toBe('0.35');
    expect(battle.dataset.quality).toBe('reduced');
    dom.window.close();
  });

  test('renders a real WebGPU cinematic pass when an OBS browser exposes WebGPU', async () => {
    const { dom, handlers, webgpu } = bootOverlay({ webgpu: true, fastTimers: true });
    handlers['streammonsters:battle_action']({
      battleId: 'battle-webgpu',
      roundNumber: 1,
      action: {
        monsterId: 'monster-a',
        targetMonsterId: 'monster-b',
        selectedChoice: 'C',
        skill: { name: 'Overclock Beam', vfxKey: 'volt-overclock-beam' },
        before: { monsterId: 'monster-a', name: 'Pulse', element: 'Volt', imageUrl: '/pulse.png', maxHp: 58, hp: 58, charge: 100 },
        after: { monsterId: 'monster-a', name: 'Pulse', element: 'Volt', imageUrl: '/pulse.png', maxHp: 58, hp: 58, charge: 0 },
        targetBefore: { monsterId: 'monster-b', name: 'Mosswhisker', element: 'Grove', imageUrl: '/moss.png', maxHp: 62, hp: 62, charge: 25 },
        targetAfter: { monsterId: 'monster-b', name: 'Mosswhisker', element: 'Grove', imageUrl: '/moss.png', maxHp: 62, hp: 43, charge: 50 },
        outcomes: [{ type: 'damage', hpDamage: 19, shieldAbsorbed: 0 }]
      }
    });
    for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(webgpu.device.createRenderPipeline).toHaveBeenCalled();
    expect(webgpu.renderPass.draw).toHaveBeenCalledWith(6);
    expect(webgpu.device.queue.submit).toHaveBeenCalled();
    dom.window.close();
  });

  test('plays a supplied arena sound at the creator-selected volume', async () => {
    const audio = { volume: 0, play: jest.fn(() => Promise.resolve()) };
    const audioFactory = jest.fn(() => audio);
    const { dom, handlers } = bootOverlay({
      reducedMotion: true,
      audioFactory,
      audioManifest: [{ id: 'special', file: 'special.ogg' }]
    });
    handlers['streammonsters:config_changed']({
      config: { arenaAudioEnabled: true, arenaAudioVolume: 0.35, arenaEffectsQuality: 'auto' }
    });
    handlers['streammonsters:battle_action']({
      battleId: 'battle-audio',
      roundNumber: 1,
      action: {
        monsterId: 'monster-a', targetMonsterId: 'monster-b', selectedChoice: 'C',
        skill: { name: 'Overclock Beam', vfxKey: 'volt-overclock-beam' },
        before: { monsterId: 'monster-a', name: 'Pulse', element: 'Volt', imageUrl: '/pulse.png', maxHp: 58, hp: 58, charge: 100 },
        after: { monsterId: 'monster-a', name: 'Pulse', element: 'Volt', imageUrl: '/pulse.png', maxHp: 58, hp: 58, charge: 0 },
        targetBefore: { monsterId: 'monster-b', name: 'Mosswhisker', element: 'Grove', imageUrl: '/moss.png', maxHp: 62, hp: 62, charge: 25 },
        targetAfter: { monsterId: 'monster-b', name: 'Mosswhisker', element: 'Grove', imageUrl: '/moss.png', maxHp: 62, hp: 43, charge: 50 },
        outcomes: [{ type: 'damage', hpDamage: 19, shieldAbsorbed: 0 }]
      }
    });
    for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();

    expect(audioFactory).toHaveBeenCalledWith('/plugins/streamalchemy/assets/streammonsters/audio/special.ogg');
    expect(audio.volume).toBeCloseTo(0.35);
    expect(audio.play).toHaveBeenCalled();
    dom.window.close();
  });
});
