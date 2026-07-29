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

  test('keeps every rules-v8 combat outcome in a readable sub-1.6-second action timeline', () => {
    const timeline = ArenaDirector.buildArcadeTimeline('battle_skill_used', {
      eventId: 'match-v8:event:17',
      matchId: 'match-v8',
      action: {
        rulesVersion: 8,
        eventId: 'match-v8:event:17',
        round: 6,
        actorSlot: 1,
        targetSlot: 2,
        choice: 'C',
        skill: {
          id: 'selene:C',
          name: 'Moonfall',
          shortText: 'Deals 8 damage, heals 4 and gains 3 shield.',
          type: 'special',
          element: 'Lunar',
          vfxKey: 'selene:special'
        },
        statusEffects: [{ type: 'burn', hpDamage: 2, remaining: 1 }],
        hits: [
          { index: 1, hpDamage: 0, shieldAbsorbed: 0, evaded: true },
          { index: 2, hpDamage: 8, shieldAbsorbed: 2, evaded: false }
        ],
        outcomes: [
          { type: 'heal', amount: 4 },
          { type: 'shield', amount: 3 }
        ],
        retaliations: [{
          index: 1,
          type: 'thorns',
          hpDamage: 2,
          shieldAbsorbed: 0,
          evaded: false
        }],
        knockouts: [],
        terminal: false
      }
    });

    expect(timeline.durationMs).toBeGreaterThanOrEqual(1_000);
    expect(timeline.durationMs).toBeLessThanOrEqual(1_600);
    const types = timeline.beats.map(beat => beat.type);
    expect(types).toEqual(expect.arrayContaining([
      'telegraph',
      'advance',
      'special',
      'status_damage',
      'status_hud',
      'impact',
      'hud',
      'heal_number',
      'shield_number',
      'retaliation',
      'retaliation_hud',
      'recover'
    ]));
    expect(timeline.beats.filter(beat => beat.type === 'impact')).toHaveLength(2);
    expect(timeline.beats.find(beat => (
      beat.type === 'impact' && beat.hitIndex === 1
    ))).toEqual(expect.objectContaining({ evaded: true }));
    expect(timeline.beats.filter(beat => beat.effect?.scene === 'special')).toHaveLength(1);
    expect(timeline.beats.filter(beat => beat.type === 'hud')).toHaveLength(2);
  });

  test.each([
    ['attack', 'A'],
    ['defense', 'B'],
    ['special', 'C']
  ])('emits one authoritative %s element scene for a rules-v8 action', (scene, choice) => {
    const timeline = ArenaDirector.buildArcadeTimeline('battle_skill_used', {
      eventId: `semantic-${scene}`,
      action: {
        rulesVersion: 8,
        eventId: `semantic-${scene}`,
        round: 1,
        actorSlot: 1,
        targetSlot: 2,
        choice,
        skill: {
          name: `${scene} skill`,
          type: scene,
          role: 'striker',
          element: 'Volt',
          vfxKey: `pulse:${scene}`,
          effects: [{ type: 'shock', amount: 2 }]
        },
        hits: []
      }
    });
    const semanticScenes = timeline.beats
      .filter(beat => beat.effect?.semanticAction === true)
      .map(beat => beat.effect.scene);

    expect(semanticScenes).toEqual([scene]);
    const semanticBeat = timeline.beats.find(beat => beat.effect?.semanticAction === true);
    expect(semanticBeat).toEqual(expect.objectContaining({
      actorSlot: 1,
      targetSlot: 2,
      durationMs: expect.any(Number),
      effect: expect.objectContaining({
        scene,
        semanticAction: true,
        element: 'Volt',
        vfxKey: `pulse:${scene}`,
        role: 'striker',
        skillEffects: [{ type: 'shock', amount: 2 }],
        durationMs: expect.any(Number)
      })
    }));
    expect(semanticBeat.effect.durationMs).toBeGreaterThanOrEqual(250);
    expect(semanticBeat.effect.durationMs).toBeLessThanOrEqual(2_200);
  });

  test('presents Arena Collapse as an ordered replayable HUD update', () => {
    const timeline = ArenaDirector.buildArcadeTimeline('battle_arena_collapse', {
      eventId: 'match-collapse:event:22',
      matchId: 'match-collapse',
      round: 4,
      damage: 2,
      fighters: [
        { slot: 1, shieldReduced: 3, hpDamage: 0, hp: 1, shield: 5 },
        { slot: 2, shieldReduced: 2, hpDamage: 1, hp: 7, shield: 2 }
      ]
    });

    expect(timeline.scene).toBe('arena_collapse');
    expect(timeline.beats.map(beat => beat.type)).toEqual([
      'collapse_banner',
      'collapse_shield',
      'collapse_shield',
      'collapse_damage',
      'collapse_hud'
    ]);
    expect(timeline.beats[0]).toEqual(expect.objectContaining({
      round: 4,
      damage: 2
    }));
    expect(timeline.beats[3]).toEqual(expect.objectContaining({
      slot: 2,
      hpDamage: 1,
      hp: 7
    }));
    expect(timeline.durationMs).toBeLessThanOrEqual(2_400);
  });
});
