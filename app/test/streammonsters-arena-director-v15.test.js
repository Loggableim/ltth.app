const ArenaDirector = require('../plugins/streamalchemy/streammonsters-arena-director');

describe('Stream Monsters 1.5 portrait-first Arena Director', () => {
  test('reserves the lower 26 percent in portrait and keeps fighters inside the gameplay field', () => {
    const portrait = ArenaDirector.createArenaGeometry('portrait');
    expect(portrait).toEqual(expect.objectContaining({
      width: 1080,
      height: 1920,
      gameplay: { x: 0, y: 0, width: 1080, height: 1421 },
      chatSafeZone: { x: 0, y: 1421, width: 1080, height: 499 }
    }));
    expect(portrait.fighters[0].feetY).toBeLessThanOrEqual(portrait.gameplay.height);
    expect(portrait.fighters[1].feetY).toBeLessThanOrEqual(portrait.gameplay.height);
    expect(portrait.hud.y + portrait.hud.height).toBeLessThanOrEqual(portrait.gameplay.height);

    const landscape = ArenaDirector.createArenaGeometry('landscape');
    expect(landscape).toEqual(expect.objectContaining({ width: 1920, height: 1080 }));
    expect(landscape.fighters[0].x).toBeLessThan(landscape.fighters[1].x);
  });

  test('locks fighter sides by durable slot and derives canonical staged artwork', () => {
    const fighters = ArenaDirector.normalizeFighters([
      { slot: 2, templateId: 'ripple', element: 'Tide', evolutionStage: 3, name: 'Ripple' },
      { slot: 1, templateId: 'ashfang', element: 'Ember', evolutionStage: 2, name: 'Ashfang' }
    ]);
    expect(fighters.map(fighter => fighter.slot)).toEqual([1, 2]);
    expect(fighters[0]).toEqual(expect.objectContaining({
      side: 'left',
      imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/evolution/ember/ashfang-stage2.png'
    }));
    expect(fighters[1]).toEqual(expect.objectContaining({
      side: 'right',
      imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/evolution/tide/ripple-stage3.png'
    }));
  });

  test('creates deterministic cinematic beats with visible sequential hits and HUD after impact', () => {
    const action = {
      eventSequence: 12,
      round: 2,
      actorSlot: 2,
      targetSlot: 1,
      choice: 'C',
      skill: { id: 'ripple:C', name: 'Tidal Renewal', type: 'special', element: 'Tide', vfxKey: 'ripple:special' },
      hits: [
        { index: 1, hpDamage: 4, shieldAbsorbed: 1, evaded: false },
        { index: 2, hpDamage: 3, shieldAbsorbed: 0, evaded: false },
        { index: 3, hpDamage: 2, shieldAbsorbed: 0, evaded: false }
      ],
      outcomes: [{ type: 'heal', amount: 5 }],
      terminal: true
    };
    const first = ArenaDirector.buildActionTimeline(action);
    const second = ArenaDirector.buildActionTimeline(action);
    expect(second).toEqual(first);
    expect(first.map(beat => beat.type)).toEqual([
      'telegraph',
      'advance',
      'special',
      'impact',
      'hud',
      'impact',
      'hud',
      'impact',
      'hud',
      'heal',
      'knockout',
      'recover'
    ]);
    const impacts = first.filter(beat => beat.type === 'impact');
    expect(impacts.map(beat => beat.atMs)).toEqual([1300, 1740, 2180]);
    first.filter(beat => beat.type === 'hud').forEach((hud, index) => {
      expect(hud.atMs).toBeGreaterThan(impacts[index].atMs);
    });
    expect(first.at(-1).atMs).toBeGreaterThan(first.at(-2).atMs);
  });

  test('adapts reconnect snapshots and deduplicates actions by global event sequence', () => {
    const director = ArenaDirector.createDirectorModel();
    const snapshot = director.applySnapshot({
      rulesVersion: 5,
      matches: [{
        matchId: 'match-a',
        state: 'action',
        roundNumber: 2,
        actionDeadlineMs: 8_000,
        cursor: 10,
        fighters: [
          { slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember', hp: 20, shield: 2, charge: 75 },
          { slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide', hp: 18, shield: 0, charge: 100 }
        ]
      }]
    });
    expect(snapshot.activeMatch).toEqual(expect.objectContaining({
      matchId: 'match-a',
      cursor: 10,
      fighters: expect.any(Array)
    }));
    const action = {
      eventSequence: 11,
      actorSlot: 1,
      targetSlot: 2,
      skill: { type: 'attack' },
      hits: [{ index: 1, hpDamage: 3 }]
    };
    expect(director.acceptAction('match-a', action)).toBe(true);
    expect(director.acceptAction('match-a', action)).toBe(false);
    expect(director.acceptAction('other-match', { ...action, eventSequence: 12 })).toBe(false);
  });

  test('chooses controlled quality and exposes renderer fallback diagnostics', () => {
    expect(ArenaDirector.resolveQuality({ requested: 'auto', fps: 57 })).toBe('high');
    expect(ArenaDirector.resolveQuality({ requested: 'auto', fps: 39 })).toBe('medium');
    expect(ArenaDirector.resolveQuality({ requested: 'auto', fps: 20 })).toBe('low');
    expect(ArenaDirector.resolveRenderer({
      webgpuAvailable: true,
      requestedQuality: 'high',
      reducedMotion: false
    })).toEqual(expect.objectContaining({ renderer: 'webgpu', quality: 'high' }));
    expect(ArenaDirector.resolveRenderer({
      webgpuAvailable: false,
      requestedQuality: 'auto',
      reducedMotion: false
    })).toEqual(expect.objectContaining({ renderer: 'canvas2d', fallbackReason: 'webgpu_unavailable' }));
    expect(ArenaDirector.resolveRenderer({
      webgpuAvailable: true,
      requestedQuality: 'high',
      reducedMotion: true
    })).toEqual(expect.objectContaining({ renderer: 'css', fallbackReason: 'reduced_motion' }));
  });
});
