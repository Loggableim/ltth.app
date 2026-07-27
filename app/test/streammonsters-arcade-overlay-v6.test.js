'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ArenaDirector = require('../plugins/streamalchemy/streammonsters-arena-director');
const ArenaView = require('../plugins/streamalchemy/streammonsters-arena-view');
const AudioEngine = require('../plugins/streamalchemy/streammonsters-audio-engine');
const OverlayRuntime = require('../plugins/streamalchemy/streammonsters-overlay-runtime');
const PublicEventProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/public-event-projector'
);

function mountArena() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <main id="streammonsters-overlay">
      <section id="arcade-choreography" aria-hidden="true">
        <div id="arcade-portal"></div>
        <div id="arcade-roulette"></div>
        <div id="arcade-energy"></div>
        <div id="arcade-egg-shell">
          <img id="arcade-egg-image">
          <i class="arcade-crack arcade-crack-1"></i>
          <i class="arcade-crack arcade-crack-2"></i>
          <i class="arcade-crack arcade-crack-3"></i>
        </div>
      </section>
      <section id="battle">
        <div id="arena-round"></div>
        <div id="arena-countdown"></div>
        <div id="arena-skill-prompt"></div>
        <div id="arena-special"></div>
        <div id="arena-impact"></div>
        <div id="arena-feed"></div>
        <article id="arena-fighter-1">
          <div class="arena-sprite-wrap"><img id="arena-image-1"></div>
          <div id="arena-name-1"></div><div id="arena-level-1"></div>
          <div id="arena-hp-text-1"></div><div id="arena-hp-1"></div>
          <div id="arena-shield-1"></div><div id="arena-charge-1"></div>
          <span id="arena-shield-label-1"></span><span id="arena-special-label-1"></span>
        </article>
        <article id="arena-fighter-2">
          <div class="arena-sprite-wrap"><img id="arena-image-2"></div>
          <div id="arena-name-2"></div><div id="arena-level-2"></div>
          <div id="arena-hp-text-2"></div><div id="arena-hp-2"></div>
          <div id="arena-shield-2"></div><div id="arena-charge-2"></div>
          <span id="arena-shield-label-2"></span><span id="arena-special-label-2"></span>
        </article>
      </section>
    </main>
  </body></html>`);
  return dom;
}

function beatTypes(timeline) {
  return timeline.beats.map(beat => beat.type);
}

describe('Stream Monsters Rules-v6 deterministic arcade timeline', () => {
  test('choreographs egg roulette, impact, hatch cracks and discovery reveal', () => {
    const spawn = ArenaDirector.buildArcadeTimeline('egg_spawned', {
      eventId: 'egg-event-1',
      correlationId: 'egg-flow-1',
      egg: { element: 'Volt', variant: 'charged' }
    });
    const repeat = ArenaDirector.buildArcadeTimeline('egg_spawned', {
      eventId: 'egg-event-1',
      correlationId: 'egg-flow-1',
      egg: { element: 'Volt', variant: 'charged' }
    });

    expect(repeat).toEqual(spawn);
    expect(spawn).toEqual(expect.objectContaining({
      eventId: 'egg-event-1',
      correlationId: 'egg-flow-1',
      groupKey: 'critical:egg-flow-1',
      scene: 'spawn'
    }));
    expect(beatTypes(spawn)).toEqual([
      'portal',
      'element_roulette',
      'element_roulette',
      'element_roulette',
      'element_roulette',
      'element_roulette',
      'element_roulette',
      'roulette_lock',
      'egg_flight',
      'egg_impact',
      'reward_peak'
    ]);
    expect(spawn.beats.filter(beat => beat.type === 'element_roulette')
      .map(beat => beat.element)).toEqual([
      'Ember', 'Tide', 'Grove', 'Gale', 'Lunar', 'Volt'
    ]);
    expect(spawn.beats.every(beat => (
      beat.eventId === spawn.eventId &&
      beat.beatId.startsWith(`${spawn.eventId}:beat:`)
    ))).toBe(true);

    const hatch = ArenaDirector.buildArcadeTimeline('hatch_started', {
      eventId: 'egg-event-2',
      correlationId: 'egg-flow-1',
      egg: { element: 'Volt' }
    });
    expect(beatTypes(hatch)).toEqual([
      'hatch_pulse',
      'hatch_crack',
      'hatch_crack',
      'hatch_crack',
      'energy_build',
      'hatch_flash'
    ]);
    expect(hatch.beats.filter(beat => beat.type === 'hatch_crack')
      .map(beat => beat.atMs)).toEqual([560, 960, 1360]);

    const reveal = ArenaDirector.buildArcadeTimeline('egg_hatched', {
      eventId: 'egg-event-3',
      correlationId: 'egg-flow-1',
      discovery: { isNew: true },
      monster: { name: 'Pulse', element: 'Volt', evolutionStage: 1 }
    });
    expect(beatTypes(reveal)).toEqual([
      'silhouette',
      'monster_reveal',
      'new_discovery',
      'winner_frame'
    ]);
    expect(reveal.beats.find(beat => beat.type === 'new_discovery'))
      .toEqual(expect.objectContaining({ peak: true, audioCue: 'progress.level' }));
  });

  test('describes Elemental Hour as an eight-second upper card with exact neutral effects', () => {
    const liveStreamStarted = {
      creatorName: 'Creator',
      event: {
        id: 'elemental-hour:4',
        element: 'Volt',
        boostMultiplier: 2
      }
    };
    const expected = {
      presentation: 'elemental-hour',
      placement: 'upper-gameplay',
      durationMs: 8_000,
      element: 'Volt',
      incubationReductionSeconds: 30,
      hypeBonus: 10,
      combatStatBonus: 0,
      hatchQualityBonus: 0
    };

    expect(ArenaDirector.buildElementalHourPresentation(liveStreamStarted)).toEqual(expected);
    expect(ArenaDirector.buildElementalHourEventPresentation(
      'stream_started',
      liveStreamStarted
    )).toEqual(expected);
    expect(ArenaDirector.buildElementalHourEventPresentation(
      'stream_started',
      { creatorName: 'Creator' }
    )).toBeNull();
    expect(ArenaDirector.buildElementalHourEventPresentation(
      'elemental_hour',
      { element: 'Ember' }
    )).toEqual(expect.objectContaining({
      element: 'Ember',
      durationMs: 8_000
    }));
    expect(ArenaDirector.buildArcadeTimeline('elemental_hour', {
      eventId: 'elemental-hour-1',
      event: { element: 'Volt' }
    })).toEqual(expect.objectContaining({
      groupKey: null,
      scene: 'elemental_hour'
    }));
  });

  test('stages four evolution stat bars after reveal, then reveals the upgraded skill', () => {
    const payload = {
      eventId: 'evolution-1',
      evolutionStage: 2,
      monster: { name: 'Ashfang', element: 'Ember', evolutionStage: 2 },
      statsBefore: { vitality: 7, might: 8, guard: 6, agility: 7 },
      statsAfter: { vitality: 7, might: 10, guard: 6, agility: 8 },
      unlockedSkill: {
        choice: 'A',
        icon: '⚔️',
        name: 'Blazing Fang II',
        nameKey: 'skillNameAshfangAStage2',
        shortText: 'A stronger ember strike.',
        shortTextKey: 'skillEffectAshfangAStage2',
        evolutionStage: 2
      }
    };

    const presentation = ArenaDirector.buildEvolutionPresentation(payload);
    expect(presentation).toEqual(expect.objectContaining({
      monster: 'Ashfang',
      stage: 2,
      statsRevealAtMs: 1_440,
      skillRevealAtMs: 2_700,
      stats: [
        { key: 'vitality', before: 7, after: 7, delta: 0, beforePercent: 70, afterPercent: 70 },
        { key: 'might', before: 8, after: 10, delta: 2, beforePercent: 80, afterPercent: 100 },
        { key: 'guard', before: 6, after: 6, delta: 0, beforePercent: 60, afterPercent: 60 },
        { key: 'agility', before: 7, after: 8, delta: 1, beforePercent: 70, afterPercent: 80 }
      ],
      skill: {
        choice: 'A',
        icon: '⚔️',
        name: 'Blazing Fang II',
        nameKey: 'skillNameAshfangAStage2',
        shortText: 'A stronger ember strike.',
        shortTextKey: 'skillEffectAshfangAStage2'
      }
    }));
    expect(beatTypes(ArenaDirector.buildArcadeTimeline('monster_evolved', payload)))
      .toEqual([
        'silhouette',
        'monster_reveal',
        'evolution_stats',
        'evolution_skill',
        'winner_frame'
      ]);

    expect(ArenaDirector.buildEvolutionPresentation(payload, {
      reducedMotion: true
    })).toEqual(expect.objectContaining({
      statsRevealAtMs: 0,
      skillRevealAtMs: 0,
      finalState: true
    }));
  });

  test('treats the real projected monster_discovered payload as a first discovery', () => {
    const timeline = ArenaDirector.buildArcadeTimeline('monster_discovered', {
      eventId: 'public-discovery-event',
      correlationId: 'public-discovery-correlation',
      displayName: 'Viewer',
      monster: {
        name: 'Ashfang',
        element: 'Ember',
        templateId: 'ashfang',
        imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png'
      },
      template: {
        templateId: 'ashfang',
        element: 'Ember',
        species: 'Wolf'
      }
    });

    expect(timeline.scene).toBe('reveal');
    expect(beatTypes(timeline)).toContain('new_discovery');
    expect(beatTypes(timeline)).not.toContain('duplicate_reward');
  });

  test('keeps sealed choices private and reveals both cards on the same beat', () => {
    const lock = ArenaDirector.buildArcadeTimeline('battle_choice_locked', {
      eventId: 'match-1:lock:1',
      correlationId: 'match-1',
      decision: { slot: 1, locked: true, choice: 'C', source: 'viewer' }
    });
    expect(lock.beats).toEqual([
      expect.objectContaining({
        type: 'sealed_card',
        slot: 1,
        locked: true
      })
    ]);
    expect(lock.beats[0]).not.toHaveProperty('choice');

    const reveal = ArenaDirector.buildArcadeTimeline('battle_choices_revealed', {
      eventId: 'match-1:reveal:1',
      correlationId: 'match-1',
      choices: [
        { slot: 2, choice: 'B', source: 'timeout' },
        { slot: 1, choice: 'A', source: 'viewer' }
      ]
    });
    expect(reveal.beats).toEqual([
      expect.objectContaining({
        type: 'simultaneous_reveal',
        choices: [
          { slot: 1, choice: 'A', source: 'viewer' },
          { slot: 2, choice: 'B', source: 'timeout' }
        ]
      })
    ]);
  });

  test('sequences multi-hit impacts, hit-stop and HUD changes before knockout', () => {
    const timeline = ArenaDirector.buildArcadeTimeline('battle_skill_used', {
      eventId: 'match-2:action:9',
      correlationId: 'match-2',
      matchId: 'match-2',
      action: {
        eventSequence: 9,
        actorSlot: 1,
        targetSlot: 2,
        choice: 'C',
        skill: {
          name: 'Neon Overdrive',
          type: 'special',
          element: 'Volt',
          vfxKey: 'pulse:special'
        },
        hits: [
          { index: 1, hpDamage: 4, shieldAbsorbed: 2, evaded: false },
          { index: 2, hpDamage: 5, shieldAbsorbed: 0, evaded: false },
          { index: 3, hpDamage: 3, shieldAbsorbed: 0, evaded: false }
        ],
        outcomes: [
          { type: 'shield', amount: 3 },
          { type: 'heal', amount: 2 }
        ],
        terminal: true
      }
    });
    const impacts = timeline.beats.filter(beat => beat.type === 'impact');
    const hud = timeline.beats.filter(beat => beat.type === 'hud');

    expect(beatTypes(timeline)).toEqual(expect.arrayContaining([
      'telegraph',
      'advance',
      'special',
      'element_trail',
      'impact',
      'hit_stop',
      'camera_impulse',
      'damage_number',
      'shield_number',
      'hud',
      'heal_number',
      'knockout',
      'recover'
    ]));
    expect(impacts.map(beat => beat.atMs)).toEqual([1300, 1740, 2180]);
    expect(hud).toHaveLength(3);
    hud.forEach((beat, index) => {
      expect(beat.atMs).toBeGreaterThan(impacts[index].atMs);
    });
    expect(timeline.beats.find(beat => beat.type === 'knockout').atMs)
      .toBeGreaterThan(hud.at(-1).atMs);
    expect(timeline.beats.find(beat => beat.type === 'special'))
      .toEqual(expect.objectContaining({
        peak: true,
        effect: expect.objectContaining({
          scene: 'special',
          element: 'Volt',
          vfxKey: 'pulse:special'
        })
      }));
  });

  test('renders a burn-at-turn-start knockout without an invalid advance or target KO', () => {
    const timeline = ArenaDirector.buildArcadeTimeline('battle_action', {
      eventId: 'match-burn:action:1',
      correlationId: 'match-burn',
      action: {
        eventSequence: 1,
        actorSlot: 1,
        targetSlot: 2,
        skipped: 'burn_ko',
        terminal: true,
        statusEffects: [
          { type: 'burn_tick', amount: 5, hpDamage: 5, remaining: 0 }
        ],
        actorState: { hp: 0, maxHp: 40, shield: 0, charge: 25 },
        targetState: { hp: 18, maxHp: 40, shield: 0, charge: 0 },
        knockouts: [{ slot: 1, cause: 'status' }]
      }
    });

    expect(beatTypes(timeline)).toEqual([
      'status_damage',
      'status_hud',
      'knockout',
      'recover'
    ]);
    expect(beatTypes(timeline)).not.toEqual(expect.arrayContaining(['telegraph', 'advance']));
    expect(timeline.beats.find(beat => beat.type === 'knockout'))
      .toEqual(expect.objectContaining({ slot: 1, cause: 'status' }));
  });

  test('shows retaliation damage and explicit simultaneous knockouts for both slots', () => {
    const timeline = ArenaDirector.buildArcadeTimeline('battle_action', {
      eventId: 'match-double-ko:action:1',
      correlationId: 'match-double-ko',
      action: {
        eventSequence: 1,
        actorSlot: 1,
        targetSlot: 2,
        skill: { name: 'Crystal Fang', type: 'attack', element: 'Ember' },
        hits: [{ index: 1, hpDamage: 8, shieldAbsorbed: 0, evaded: false }],
        retaliations: [
          { type: 'thorns', index: 1, hpDamage: 4, shieldAbsorbed: 0, evaded: false }
        ],
        actorState: { hp: 0, maxHp: 40, shield: 0, charge: 50 },
        targetState: { hp: 0, maxHp: 40, shield: 0, charge: 25 },
        terminal: true,
        knockouts: [
          { slot: 2, cause: 'skill' },
          { slot: 1, cause: 'thorns' }
        ]
      }
    });
    const retaliation = timeline.beats.find(beat => beat.type === 'retaliation');
    const knockouts = timeline.beats.filter(beat => beat.type === 'knockout');

    expect(retaliation).toEqual(expect.objectContaining({
      retaliationType: 'thorns',
      targetSlot: 1,
      hpDamage: 4
    }));
    expect(beatTypes(timeline)).toContain('retaliation_hud');
    expect(knockouts).toHaveLength(2);
    expect(knockouts.map(beat => beat.slot).sort()).toEqual([1, 2]);
    expect(new Set(knockouts.map(beat => beat.atMs)).size).toBe(1);
  });

  test('orders winner, XP and rank beats as one critical finale', () => {
    const timeline = ArenaDirector.buildArcadeTimeline('battle_completed', {
      eventId: 'match-3:completed',
      correlationId: 'match-3',
      winnerSlot: 2,
      xp: [{ slot: 1, amount: 10 }, { slot: 2, amount: 15 }],
      rating: { delta: 18, tierChanged: true, tier: 'Gold' },
      streak: 3
    });
    expect(beatTypes(timeline)).toEqual([
      'winner_frame',
      'xp_reward',
      'xp_reward',
      'win_streak',
      'rank_up'
    ]);
    const beats = timeline.beats;
    expect(beats[0]).toEqual(expect.objectContaining({
      winnerSlot: 2,
      audioCue: 'arena.victory'
    }));
    expect(beats[1].atMs).toBeGreaterThan(beats[0].atMs);
    expect(beats.at(-1)).toEqual(expect.objectContaining({
      type: 'rank_up',
      peak: true,
      audioCue: 'progress.rank'
    }));
  });

  test('uses a quiet rating update unless the arena tier actually changes', () => {
    const ordinary = ArenaDirector.buildArcadeTimeline('arena_rating_changed', {
      eventId: 'rating-ordinary',
      before: { rating: 910, tier: 'Bronze' },
      after: { rating: 926, tier: 'Bronze' },
      delta: 16
    });
    const promoted = ArenaDirector.buildArcadeTimeline('arena_rating_changed', {
      eventId: 'rating-promoted',
      before: { rating: 995, tier: 'Bronze' },
      after: { rating: 1005, tier: 'Silver' },
      delta: 10
    });

    expect(ordinary.beats).toEqual([
      expect.objectContaining({
        type: 'rating_update',
        peak: false,
        audioCue: 'ui.navigate'
      })
    ]);
    expect(promoted.beats).toEqual([
      expect.objectContaining({
        type: 'rank_up',
        peak: true,
        audioCue: 'progress.rank'
      })
    ]);
  });
});

describe('Stream Monsters Rules-v6 portrait arcade DOM and fallback behavior', () => {
  test('plays one event identity through effects and audio and deduplicates reconnect replay', async () => {
    const dom = mountArena();
    const waits = [];
    const effects = {
      play: jest.fn(async () => true),
      status: jest.fn(() => ({
        backend: 'canvas2d',
        fallbackReason: 'webgpu_device_lost'
      }))
    };
    const audio = {
      play: jest.fn(async () => true)
    };
    const view = ArenaView.createArenaView({
      document: dom.window.document,
      effects,
      audio,
      clock: { wait: async milliseconds => waits.push(milliseconds), now: () => 1_000 }
    });

    expect(await view.playEvent('egg_spawned', {
      eventId: 'egg-render-1',
      correlationId: 'egg-render-flow',
      egg: { element: 'Grove' }
    })).toBe(true);
    expect(await view.playEvent('egg_spawned', {
      eventId: 'egg-render-1',
      correlationId: 'egg-render-flow',
      egg: { element: 'Grove' }
    })).toBe(false);
    expect(effects.play).toHaveBeenCalledWith('spawn', expect.objectContaining({
      eventId: 'egg-render-1',
      beatId: expect.stringMatching(/^egg-render-1:beat:/),
      element: 'Grove'
    }));
    expect(audio.play).toHaveBeenCalledWith('egg.spawn', expect.objectContaining({
      eventId: expect.stringMatching(/^egg-render-1:beat:/)
    }));
    expect(dom.window.document.querySelector('#streammonsters-overlay').dataset.renderer)
      .toBe('canvas2d');
    expect(dom.window.document.querySelector('#streammonsters-overlay').dataset.fallbackReason)
      .toBe('webgpu_device_lost');
    expect(waits.length).toBeGreaterThan(3);
  });

  test('renders sealed cards before simultaneous reveal and updates HUD only after impact', async () => {
    const dom = mountArena();
    const observations = [];
    const view = ArenaView.createArenaView({
      document: dom.window.document,
      clock: {
        wait: async milliseconds => {
          observations.push({
            milliseconds,
            hp: dom.window.document.querySelector('#arena-hp-text-2').textContent
          });
        },
        now: () => 1_000
      }
    });
    view.applyMatch({
      matchId: 'match-dom',
      fighters: [
        {
          slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember',
          hp: 40, maxHp: 40, shield: 0, charge: 100
        },
        {
          slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide',
          hp: 40, maxHp: 40, shield: 2, charge: 0
        }
      ]
    });

    await view.playEvent('battle_choice_locked', {
      eventId: 'match-dom:lock',
      correlationId: 'match-dom',
      decision: { slot: 1, locked: true, choice: 'A' }
    });
    expect(dom.window.document.querySelector('#arena-fighter-1').dataset.choice)
      .toBeUndefined();
    await view.playEvent('battle_choices_revealed', {
      eventId: 'match-dom:reveal',
      correlationId: 'match-dom',
      choices: [{ slot: 1, choice: 'A' }, { slot: 2, choice: 'B' }]
    });
    expect(dom.window.document.querySelector('#arena-fighter-1').dataset.choice).toBe('A');
    expect(dom.window.document.querySelector('#arena-fighter-2').dataset.choice).toBe('B');

    await view.playEvent('battle_skill_used', {
      eventId: 'match-dom:action',
      correlationId: 'match-dom',
      matchId: 'match-dom',
      action: {
        eventSequence: 1,
        actorSlot: 1,
        targetSlot: 2,
        choice: 'A',
        skill: { name: 'Crystal Fang', type: 'attack', element: 'Ember' },
        hits: [{ index: 1, hpDamage: 5, shieldAbsorbed: 2, evaded: false }],
        actorState: { hp: 40, maxHp: 40, shield: 0, charge: 25 },
        targetState: { hp: 35, maxHp: 40, shield: 0, charge: 25 }
      }
    });
    expect(observations.some(entry => entry.hp === '40 / 40')).toBe(true);
    expect(dom.window.document.querySelector('#arena-hp-text-2').textContent).toBe('35 / 40');
  });

  test('applies Rules-v6 status, retaliation and simultaneous knockout state to the DOM', async () => {
    const dom = mountArena();
    const view = ArenaView.createArenaView({
      document: dom.window.document,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'match-v6-dom',
      fighters: [
        { slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember', hp: 4, maxHp: 40 },
        { slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide', hp: 8, maxHp: 40 }
      ]
    });

    await view.playEvent('battle_action', {
      eventId: 'match-v6-dom:action',
      correlationId: 'match-v6-dom',
      matchId: 'match-v6-dom',
      action: {
        eventSequence: 1,
        actorSlot: 1,
        targetSlot: 2,
        skill: { name: 'Crystal Fang', type: 'attack', element: 'Ember' },
        hits: [{ index: 1, hpDamage: 8, shieldAbsorbed: 0, evaded: false }],
        retaliations: [
          { type: 'reflect', index: 1, hpDamage: 4, shieldAbsorbed: 0, evaded: false }
        ],
        actorState: { hp: 0, maxHp: 40, shield: 0, charge: 50 },
        targetState: { hp: 0, maxHp: 40, shield: 0, charge: 25 },
        terminal: true,
        knockouts: [
          { slot: 2, cause: 'skill' },
          { slot: 1, cause: 'reflect' }
        ]
      }
    });

    expect(dom.window.document.querySelector('#arena-hp-text-1').textContent).toBe('0 / 40');
    expect(dom.window.document.querySelector('#arena-hp-text-2').textContent).toBe('0 / 40');
    expect(dom.window.document.querySelector('#arena-fighter-1').classList.contains('knockout'))
      .toBe(true);
    expect(dom.window.document.querySelector('#arena-fighter-2').classList.contains('knockout'))
      .toBe(true);
  });

  test('shows roulette, egg flight, hatch pulse, cracks and energy on a visible stage then cleans up', async () => {
    const dom = mountArena();
    const observed = [];
    const stage = dom.window.document.querySelector('#arcade-choreography');
    const view = ArenaView.createArenaView({
      document: dom.window.document,
      clock: {
        wait: async () => observed.push({
          phase: stage.dataset.phase,
          visible: stage.classList.contains('visible'),
          classes: [...stage.classList],
          crack: stage.dataset.crack || null,
          roulette: dom.window.document.querySelector('#arcade-roulette').textContent
        }),
        now: () => 1_000
      }
    });

    await view.playEvent('egg_spawned', {
      eventId: 'visible-spawn',
      correlationId: 'visible-egg',
      egg: {
        element: 'Volt',
        imageUrl: '/plugins/streamalchemy/assets/eggs/volt-standard.png'
      }
    });
    expect(observed.some(state => state.visible && state.phase === 'roulette' && state.roulette))
      .toBe(true);
    expect(observed.some(state => state.classes.includes('egg-flight'))).toBe(true);
    expect(stage.classList.contains('visible')).toBe(false);

    observed.length = 0;
    await view.playEvent('hatch_started', {
      eventId: 'visible-hatch',
      correlationId: 'visible-egg',
      egg: {
        element: 'Volt',
        imageUrl: '/plugins/streamalchemy/assets/eggs/volt-standard.png'
      }
    });
    expect(observed.some(state => state.visible && state.classes.includes('hatch-pulse')))
      .toBe(true);
    expect(observed.some(state => state.crack === '3')).toBe(true);
    expect(observed.some(state => state.classes.includes('energy-build'))).toBe(true);
    expect(stage.classList.contains('visible')).toBe(false);
    expect(stage.dataset.phase).toBeUndefined();
  });

  test('holds the complete timeline duration, clears transient peaks and closes the finale', async () => {
    const dom = mountArena();
    const waits = [];
    const view = ArenaView.createArenaView({
      document: dom.window.document,
      clock: { wait: async milliseconds => waits.push(milliseconds), now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'match-finale',
      fighters: [
        { slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember' },
        { slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide' }
      ]
    });
    await view.playEvent('egg_hatched', {
      eventId: 'hatch-new',
      correlationId: 'egg-flow',
      discovery: { isNew: true },
      monster: { name: 'Ashfang', element: 'Ember' }
    });
    expect(dom.window.document.querySelector('#streammonsters-overlay')
      .classList.contains('arcade-new-discovery')).toBe(true);

    await view.playEvent('egg_spawned', {
      eventId: 'next-egg',
      correlationId: 'next-egg-flow',
      egg: { element: 'Tide' }
    });
    expect(dom.window.document.querySelector('#streammonsters-overlay')
      .classList.contains('arcade-new-discovery')).toBe(false);

    waits.length = 0;
    await view.playEvent('battle_completed', {
      eventId: 'match-finale:completed',
      correlationId: 'match-finale',
      matchId: 'match-finale',
      winnerSlot: 1
    });
    expect(waits.reduce((sum, duration) => sum + duration, 0)).toBeGreaterThanOrEqual(4_000);
    expect(dom.window.document.querySelector('#battle').classList.contains('visible')).toBe(false);
    expect(dom.window.document.querySelector('#arena-fighter-1')
      .classList.contains('winner')).toBe(true);
  });

  test('keeps portrait gameplay in the upper 74 percent with full framing and readable text', () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(html);
    const rules = [...dom.window.document.styleSheets]
      .flatMap(sheet => [...sheet.cssRules]);
    const nestedRules = rules.flatMap(rule => (
      rule.cssRules?.length ? [...rule.cssRules] : [rule]
    ));
    const portraitRule = rules.find(rule => (
      String(rule.conditionText || '').includes('orientation: portrait')
    ));
    const portraitBattle = [...portraitRule.cssRules]
      .find(rule => rule.selectorText === '#battle');
    const battleRule = rules.find(rule => rule.selectorText === '#battle');
    const spriteRule = rules.find(rule => rule.selectorText === '.arena-sprite');
    const landscapeRule = rules.find(rule => (
      String(rule.conditionText || '').includes('orientation: landscape')
    ));
    const reducedMotionRule = rules.find(rule => (
      String(rule.conditionText || '').includes('prefers-reduced-motion')
    ));
    const portrait = ArenaDirector.createArenaGeometry('portrait');

    expect(portrait.gameplay.height / portrait.height).toBeCloseTo(0.74, 2);
    expect(portrait.chatSafeZone.height / portrait.height).toBeCloseTo(0.26, 2);
    expect(battleRule.style.inset).toBe('0 0 26%');
    expect(portraitBattle.style.inset).toBe('0 0 26%');
    expect(spriteRule.style.objectFit).toBe('contain');
    expect(dom.window.document.querySelectorAll('.arena-skill-deck')).toHaveLength(2);
    expect(dom.window.document.querySelectorAll('.arena-skill-card')).toHaveLength(6);
    expect([...landscapeRule.cssRules].some(rule => (
      rule.selectorText === '.arena-skill-deck' &&
      rule.style.gridTemplateColumns.includes('repeat(3')
    ))).toBe(true);
    expect([...reducedMotionRule.cssRules].some(rule => (
      rule.selectorText === '.arena-skill-card.ready' &&
      rule.style.animation.includes('none')
    ))).toBe(true);
    expect(html).toContain('font-size:clamp(17px,2.2vw,28px)');
    expect(html).toContain('font-size:clamp(16px,2vw,26px)');
    expect(rules.some(rule => (
      String(rule.conditionText || '').includes('prefers-reduced-motion')
    ))).toBe(true);
    const selectors = new Set(nestedRules
      .flatMap(rule => String(rule.selectorText || '').split(','))
      .map(selector => selector.trim())
      .filter(Boolean));
    for (const selector of [
      '#arcade-choreography.visible',
      '#arcade-choreography.egg-flight #arcade-egg-shell',
      '#arcade-choreography.hatch-pulse #arcade-egg-shell',
      '#arcade-choreography.energy-build #arcade-energy',
      '#streammonsters-overlay.arcade-egg-impact #card',
      '#streammonsters-overlay.arcade-monster-reveal #card',
      '#battle.camera-impulse',
      '#battle.hit-stop .arena-sprite',
      '.arena-fighter.choice-locked:not(.choice-revealed) .fighter-hud::after',
      '.arena-fighter.choice-revealed .fighter-hud::after'
    ]) {
      expect(selectors.has(selector)).toBe(true);
    }
    expect(dom.window.document.querySelector('#arcade-egg-image')).not.toBeNull();
    expect(dom.window.document.querySelectorAll('.arcade-crack')).toHaveLength(3);
  });

  test('keeps every critical correlation group intact under overload', () => {
    const queue = OverlayRuntime.createPriorityQueue({ maxSize: 2, maxCriticalOverflow: 0 });
    queue.enqueue('chat_result', { eventId: 'chat-1' }, 1);
    const types = [
      'egg_spawned',
      'hatch_started',
      'egg_hatched',
      'battle_choice_locked',
      'battle_choices_revealed',
      'battle_skill_used',
      'battle_completed'
    ];
    types.forEach((type, index) => queue.enqueue(type, {
      eventId: `critical-${index}`,
      correlationId: 'critical-flow-1'
    }, index + 2));

    const critical = queue.snapshot().filter(entry => entry.priority === 3);
    expect(critical).toHaveLength(types.length);
    expect(critical.map(entry => entry.type)).toEqual(types);
    expect(new Set(critical.map(entry => entry.groupKey)))
      .toEqual(new Set(['critical:critical-flow-1']));
  });

  test('holds a staggered critical group until its finale and releases it on timeout', () => {
    const grouped = OverlayRuntime.createPriorityQueue({
      maxSize: 20,
      criticalGroupHoldMs: 1_000
    });
    grouped.enqueue('hatch_started', {
      eventId: 'A1',
      correlationId: 'A'
    }, 0);
    expect(grouped.shift(0).data.eventId).toBe('A1');
    grouped.enqueue('battle_match_found', {
      eventId: 'B1',
      correlationId: 'B'
    }, 10);
    grouped.enqueue('egg_hatched', {
      eventId: 'A2',
      correlationId: 'A'
    }, 20);
    expect(grouped.shift(20).data.eventId).toBe('A2');
    expect(grouped.shift(20).data.eventId).toBe('B1');

    const timedOut = OverlayRuntime.createPriorityQueue({
      maxSize: 20,
      criticalGroupHoldMs: 1_000
    });
    timedOut.enqueue('hatch_started', {
      eventId: 'timeout-A1',
      correlationId: 'timeout-A'
    }, 0);
    expect(timedOut.shift(0).data.eventId).toBe('timeout-A1');
    timedOut.enqueue('battle_match_found', {
      eventId: 'timeout-B1',
      correlationId: 'timeout-B'
    }, 10);
    expect(timedOut.shift(999)).toBeNull();
    expect(timedOut.releaseDelay(999)).toBe(1);
    expect(timedOut.shift(1_000).data.eventId).toBe('timeout-B1');
    timedOut.beginSnapshot();
    expect(timedOut.releaseDelay(2_000)).toBeNull();
  });

  test('routes critical socket scenes through the shared timeline in the real overlay', async () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const socketHandlers = new Map();
    const timelineCalls = [];
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const dom = new JSDOM(html, {
      url: 'http://localhost:3000/plugins/streamalchemy/overlay.html',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.setTimeout = callback => {
          Promise.resolve().then(callback);
          return 1;
        };
        window.clearTimeout = () => {};
        window.setInterval = () => 1;
        window.clearInterval = () => {};
        window.i18n = {
          init: async () => {},
          updateDOM: () => {},
          t: key => key
        };
        window.io = () => ({
          on: (event, handler) => socketHandlers.set(event, handler)
        });
        window.fetch = jest.fn(async input => {
          if (String(input).includes('/assets/audio/manifest.json')) {
            return { ok: false, status: 404, json: async () => ({}) };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              hype: { points: 0 },
              config: { hatchDurationMs: 120_000 },
              gcce: { commandPrefix: '!', registeredCommands: [] },
              battle: { matches: [] }
            })
          };
        });
        window.StreamMonstersOverlayRuntime = OverlayRuntime;
        window.StreamMonstersEffectsRenderer = {
          createEffectsRenderer: () => ({
            init: () => {},
            resize: () => {},
            play: async () => true,
            status: () => ({ backend: 'canvas2d' })
          })
        };
        window.StreamMonstersAudioEngine = {
          normalizeChannelConfig: value => value
        };
        window.StreamMonstersArenaView = {
          createArenaView: () => ({
            applyMatch: () => {},
            applySnapshot: () => {},
            openChoice: () => {},
            lockChoice: () => {},
            revealChoices: () => {},
            playAction: async () => true,
            playEvent: async (type, payload) => {
              timelineCalls.push([type, payload.eventId]);
              return true;
            },
            complete: async () => {},
            cancel: async () => {},
            destroy: () => {}
          })
        };
        window.StreamMonstersChatView = {
          createChatView: () => ({ show: async () => {} }),
          displayName: () => 'Viewer'
        };
      }
    });
    try {
      for (let attempt = 0; attempt < 20 && !socketHandlers.has('connect'); attempt += 1) {
        await flush();
      }
      await socketHandlers.get('connect')();
      await flush();
      const projector = new PublicEventProjector();
      const events = [
        ['streammonsters:egg_spawned', 'egg_spawned'],
        ['streammonsters:hatch_started', 'hatch_started'],
        ['streammonsters:egg_hatched', 'egg_hatched'],
        ['streammonsters:monster_discovered', 'monster_discovered'],
        ['streammonsters:battle_choice_locked', 'battle_choice_locked'],
        ['streammonsters:battle_choices_revealed', 'battle_choices_revealed'],
        ['streammonsters:battle_skill_used', 'battle_skill_used'],
        ['streammonsters:battle_completed', 'battle_completed'],
        ['streammonsters:monster_xp_awarded', 'monster_xp_awarded'],
        ['streammonsters:arena_rating_changed', 'arena_rating_changed']
      ];
      const expectedTimelineCalls = [];
      for (const [socketEvent, type] of events) {
        let payload = {
          eventId: `event-${type}`,
          correlationId: 'arcade-flow',
          egg: { element: 'Ember' },
          monster: { name: 'Ashfang', element: 'Ember' }
        };
        if (type === 'monster_discovered') {
          const eventType = 'streammonsters:monster_discovered';
          const emitted = {
            userId: 'private-viewer',
            monster: {
              monster_id: 'private-monster',
              name: 'Ashfang',
              element: 'Ember',
              template_id: 'ashfang',
              image_url: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png'
            },
            template: {
              templateId: 'ashfang',
              element: 'Ember',
              species: 'Wolf'
            }
          };
          payload = {
            ...projector.project(eventType, emitted),
            ...projector.identifiers(eventType, emitted)
          };
          expect(payload).not.toHaveProperty('discovery');
          expect(payload.monster).toEqual(expect.objectContaining({
            name: 'Ashfang',
            templateId: 'ashfang'
          }));
        }
        if (type.startsWith('battle_')) payload.matchId = 'match-overlay';
        if (type === 'battle_choice_locked') {
          payload.decision = { slot: 1, locked: true };
        }
        if (type === 'battle_choices_revealed') {
          payload.choices = [{ slot: 1, choice: 'A' }, { slot: 2, choice: 'B' }];
        }
        if (type === 'battle_skill_used') {
          payload.action = {
            eventSequence: 1,
            actorSlot: 1,
            targetSlot: 2,
            skill: { type: 'attack', element: 'Ember' },
            hits: []
          };
        }
        expectedTimelineCalls.push([type, payload.eventId]);
        socketHandlers.get(socketEvent)(payload);
      }
      for (let attempt = 0; attempt < 60 && timelineCalls.length < events.length; attempt += 1) {
        await flush();
      }
      expect(timelineCalls).toHaveLength(events.length);
      expect(timelineCalls).toEqual(expect.arrayContaining(expectedTimelineCalls));
    } finally {
      dom.window.close();
    }
  });
});

describe('Stream Monsters Rules-v6 audio focus', () => {
  test('ducks non-focused buses for reward peaks and restores them deterministically', async () => {
    const automation = [];
    const gains = [];
    const context = {
      currentTime: 5,
      destination: {},
      createGain: jest.fn(() => {
        const gain = {
          value: 1,
          cancelScheduledValues: jest.fn(at => automation.push(['cancel', at])),
          setValueAtTime: jest.fn((value, at) => automation.push(['set', value, at])),
          linearRampToValueAtTime: jest.fn((value, at) => (
            automation.push(['ramp', value, at])
          ))
        };
        gains.push(gain);
        return { gain, connect: jest.fn() };
      }),
      createDynamicsCompressor: jest.fn(() => ({
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect: jest.fn()
      })),
      createBufferSource: jest.fn(() => ({
        connect: jest.fn(),
        start: jest.fn()
      })),
      decodeAudioData: jest.fn(async value => value)
    };
    const manifest = {
      cues: {
        'arena.victory': {
          channel: 'reward',
          gainDb: -5,
          variants: [{ assetPath: 'assets/audio/cues/win.wav' }]
        }
      }
    };
    const engine = AudioEngine.createAudioEngine({
      context,
      manifest,
      fetchAsset: async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1]).buffer
      })
    });

    expect(await engine.play('arena.victory', {
      eventId: 'match-a:victory',
      duck: { amount: 0.35, durationMs: 900 }
    })).toBe(true);
    expect(automation).toEqual(expect.arrayContaining([
      ['ramp', 0.27999999999999997, 5.03],
      ['ramp', 0.8, 5.9]
    ]));
    expect(engine.status()).toEqual(expect.objectContaining({
      limiter: true,
      ducking: true
    }));
  });
});
