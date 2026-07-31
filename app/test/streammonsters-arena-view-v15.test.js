const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ArenaView = require('../plugins/streamalchemy/streammonsters-arena-view');

function skillDeck(slot) {
  return `
    <div class="arena-skill-deck" data-skill-deck="${slot}">
      ${['A', 'B', 'C'].map(choice => `
        <div class="arena-skill-card" data-skill="${choice}">
          <span class="skill-icon"></span>
          <span class="skill-choice"></span>
          <span class="skill-name"></span>
          <span class="skill-copy"></span>
          <span class="skill-charge"></span>
        </div>
      `).join('')}
    </div>
  `;
}

function mountArena({ portrait = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const orientationListeners = new Set();
  const portraitMediaQuery = {
    matches: portrait,
    media: '(orientation: portrait)',
    addEventListener: jest.fn((type, listener) => {
      if (type === 'change') orientationListeners.add(listener);
    }),
    removeEventListener: jest.fn((type, listener) => {
      if (type === 'change') orientationListeners.delete(listener);
    })
  };
  dom.window.matchMedia = jest.fn(query => (
    query === portraitMediaQuery.media
      ? portraitMediaQuery
      : {
          matches: false,
          media: query,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn()
        }
  ));
  dom.portraitMediaQuery = portraitMediaQuery;
  dom.setPortrait = matches => {
    portraitMediaQuery.matches = Boolean(matches);
    for (const listener of orientationListeners) {
      listener({
        matches: portraitMediaQuery.matches,
        media: portraitMediaQuery.media
      });
    }
  };
  dom.orientationListenerCount = () => orientationListeners.size;
  global.document = dom.window.document;
  document.body.innerHTML = `
    <section id="battle">
      <div id="arena-round"></div>
      <div id="arena-countdown"></div>
      <div id="arena-skill-prompt"></div>
      <div id="arena-special"></div>
      <div id="arena-impact"></div>
      <div id="arena-combo"></div>
      <div id="arena-feed"></div>
      <div id="arena-lead"></div>
      <div id="arena-action-card">
        <span id="arena-action-player"></span>
        <span id="arena-action-key"></span>
        <strong id="arena-action-skill"></strong>
        <span id="arena-action-copy"></span>
        <span id="arena-action-metrics"></span>
        <span id="arena-action-compact-metric"></span>
      </div>
      <div id="arena-stat-card">
        <span id="arena-stat-kicker"></span>
        <strong id="arena-stat-title"></strong>
        <span id="arena-stat-meta"></span>
        <div id="arena-stat-choices"></div>
      </div>
      <div id="arena-result">
        <span id="arena-result-ko"></span>
        <strong id="arena-result-winner"></strong>
        <span id="arena-result-monster"></span>
        <span id="arena-result-summary"></span>
        <span id="arena-result-compact-summary"></span>
        <div id="arena-result-ratings"></div>
        <div id="arena-result-report" hidden></div>
        <div id="arena-result-next"></div>
        <span id="arena-result-rating"></span>
      </div>
      <article id="arena-fighter-1" data-slot="1">
        <img id="arena-image-1"><div id="arena-name-1"></div>
        <div id="arena-owner-1"></div>
        <div id="arena-level-1"></div><div id="arena-hp-text-1"></div>
        <div id="arena-hp-1"></div><div id="arena-shield-1"></div><div id="arena-charge-1"></div>
        <span id="arena-shield-label-1"></span><span id="arena-special-label-1"></span>
        ${skillDeck(1)}
      </article>
      <article id="arena-fighter-2" data-slot="2">
        <img id="arena-image-2"><div id="arena-name-2"></div>
        <div id="arena-owner-2"></div>
        <div id="arena-level-2"></div><div id="arena-hp-text-2"></div>
        <div id="arena-hp-2"></div><div id="arena-shield-2"></div><div id="arena-charge-2"></div>
        <span id="arena-shield-label-2"></span><span id="arena-special-label-2"></span>
        ${skillDeck(2)}
      </article>
    </section>
  `;
  return dom;
}

describe('Stream Monsters 1.5 cinematic arena DOM view', () => {
  test('renders a localized sole-roster lock inside the live arena', () => {
    mountArena();
    const localize = jest.fn((key, params) => ({
      arenaRosterAutoTitle: 'Fighter selected automatically',
      arenaRosterAutoBody: `${params.name} fights immediately`
    }[key] || key));
    const view = ArenaView.createArenaView({ document, localize });
    view.applyMatch({
      matchId: 'match-auto-roster',
      state: 'roster',
      rosterDeadlineMs: 7_000,
      fighters: []
    });

    expect(view.lockRoster({
      matchId: 'match-auto-roster',
      slot: 1,
      selectionSource: 'sole_eligible',
      titleKey: 'arenaRosterAutoTitle',
      bodyKey: 'arenaRosterAutoBody',
      params: { name: 'Ashfang' },
      fighter: {
        slot: 1,
        locked: true,
        name: 'Ashfang',
        viewerName: '@pupcid',
        imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
        hp: 40,
        maxHp: 40
      }
    })).toBe(true);
    expect(document.getElementById('arena-name-1').textContent).toBe('Ashfang');
    expect(document.getElementById('arena-feed').textContent)
      .toBe('Fighter selected automatically · Ashfang fights immediately');
  });

  test('rehydrates both full furry fighters and renders an action through one deterministic timeline', async () => {
    mountArena();
    const waited = [];
    const audio = { play: jest.fn(async () => true) };
    const effects = { play: jest.fn(async () => true) };
    const view = ArenaView.createArenaView({
      document,
      audio,
      effects,
      clock: { wait: async milliseconds => waited.push(milliseconds), now: () => 1_000 }
    });
    const match = {
      matchId: 'match-a',
      state: 'action',
      roundNumber: 1,
      actionDeadlineMs: 9_000,
      fighters: [
        {
          slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember',
          level: 5, hp: 52, maxHp: 52, shield: 0, charge: 50
        },
        {
          slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide',
          level: 5, hp: 48, maxHp: 52, shield: 4, charge: 100
        }
      ]
    };
    view.applyMatch(match);
    expect(document.querySelector('#battle').classList.contains('visible')).toBe(true);
    expect(document.querySelector('#arena-image-1').src).toContain('/furry/ashfang.webp');
    expect(document.querySelector('#arena-image-2').src).toContain('/furry/ripple.webp');
    expect(document.querySelector('#arena-name-1').textContent).toBe('Ashfang');
    expect(document.querySelector('#arena-hp-text-2').textContent).toBe('48 / 52');

    view.openChoice({ ...match, round: 2, deadlineMs: 9_000, choices: ['A', 'B', 'C'] });
    expect(document.querySelector('#arena-skill-prompt').textContent).toContain('A');
    expect(document.querySelector('#arena-skill-prompt').textContent).toContain('B');
    expect(document.querySelector('#arena-skill-prompt').textContent).toContain('Attack');
    expect(document.querySelector('#arena-skill-prompt').textContent).toContain('Defense');
    expect(document.querySelector('#arena-skill-prompt').textContent).toContain('NEXT');
    expect(document.querySelector('[data-slot="1"] [data-skill="C"]')).not.toBeNull();

    await view.playAction({
      matchId: 'match-a',
      eventId: 'match-a:event:9',
      eventSequence: 9,
      round: 2,
      actorSlot: 2,
      targetSlot: 1,
      choice: 'C',
      skill: { name: 'Tidal Renewal', type: 'special', element: 'Tide', vfxKey: 'ripple:special' },
      hits: [
        { index: 1, hpDamage: 4, shieldAbsorbed: 0, evaded: false },
        { index: 2, hpDamage: 3, shieldAbsorbed: 0, evaded: false }
      ],
      outcomes: [{ type: 'heal', amount: 5 }],
      actorState: { hp: 52, maxHp: 52, shield: 0, charge: 0 },
      targetState: { hp: 45, maxHp: 52, shield: 0, charge: 75 },
      terminal: false
    });

    expect(waited.length).toBeGreaterThan(4);
    expect(effects.play).toHaveBeenCalledWith('special', expect.objectContaining({
      element: 'Tide',
      vfxKey: 'ripple:special',
      actorSlot: 2,
      targetSlot: 1,
      hitCount: 2,
      hits: [
        { index: 1, hpDamage: 4, shieldAbsorbed: 0, evaded: false },
        { index: 2, hpDamage: 3, shieldAbsorbed: 0, evaded: false }
      ],
      outcomes: [{ type: 'heal', amount: 5 }]
    }));
    expect(audio.play).toHaveBeenCalledWith('arena.hit', expect.objectContaining({
      eventId: expect.stringContaining('hit')
    }));
    expect(document.querySelector('#arena-hp-text-1').textContent).toBe('45 / 52');
    expect(document.querySelector('#arena-hp-text-2').textContent).toBe('52 / 52');
    expect(document.querySelector('#arena-feed').textContent).toContain('Tidal Renewal');
  });

  test('keeps battle effects inside the takeover and presentation effects on the global layer', async () => {
    mountArena();
    const battleEffects = {
      play: jest.fn(async () => true),
      status: jest.fn(() => ({ backend: 'webgpu' }))
    };
    const presentationEffects = { play: jest.fn(async () => true) };
    const view = ArenaView.createArenaView({
      document,
      effects: battleEffects,
      presentationEffects,
      clock: { wait: async () => {}, now: () => 1_000 }
    });

    await view.playEvent('egg_spawned', {
      eventId: 'egg-spawn-1',
      egg: { element: 'Volt', variant: 'standard' }
    });
    expect(presentationEffects.play).toHaveBeenCalledWith(
      'portal',
      expect.objectContaining({ element: 'Volt' })
    );
    expect(battleEffects.play).not.toHaveBeenCalled();

    view.applyMatch({
      matchId: 'match-effects',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Pulse', element: 'Volt', hp: 40, maxHp: 40 },
        { slot: 2, name: 'Ripple', element: 'Tide', hp: 40, maxHp: 40 }
      ]
    });
    await view.playAction({
      matchId: 'match-effects',
      eventId: 'battle-effect-1',
      round: 1,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'A',
      skill: { name: 'Arc Flash', type: 'attack', element: 'Volt' },
      hits: [{ index: 1, hpDamage: 5 }]
    });
    expect(battleEffects.play).toHaveBeenCalled();
  });

  test('measures valid fighter image centers and omits invalid origins for renderer slot fallback', async () => {
    mountArena();
    const effects = { play: jest.fn(async () => true) };
    const view = ArenaView.createArenaView({
      document,
      effects,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    document.getElementById('battle').getBoundingClientRect = jest.fn(() => ({
      left: 100, top: 50, right: 500, bottom: 250, width: 400, height: 200
    }));
    document.getElementById('arena-image-1').getBoundingClientRect = jest.fn(() => ({
      left: 140, top: 70, right: 220, bottom: 170, width: 80, height: 100
    }));
    document.getElementById('arena-image-2').getBoundingClientRect = jest.fn(() => ({
      left: 380, top: 130, right: 460, bottom: 210, width: 80, height: 80
    }));

    await view.playAction({
      eventId: 'measured-origin:1',
      eventSequence: 1,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'C',
      skill: { name: 'Moonfall', type: 'special', element: 'Lunar' },
      hits: [{ hpDamage: 7, shieldAbsorbed: 0 }]
    });

    const measured = effects.play.mock.calls.find(([scene]) => scene === 'special')?.[1];
    expect(measured).toEqual(expect.objectContaining({
      actorSlot: 1,
      targetSlot: 2,
      origin: { x: 0.2, y: 0.35 },
      targetOrigin: { x: 0.8, y: 0.6 }
    }));

    mountArena();
    const fallbackEffects = { play: jest.fn(async () => true) };
    const fallbackView = ArenaView.createArenaView({
      document,
      effects: fallbackEffects,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    document.getElementById('battle').getBoundingClientRect = jest.fn(() => ({
      left: 100, top: 50, right: 500, bottom: 250, width: 400, height: 200
    }));
    for (const slot of [1, 2]) {
      document.getElementById(`arena-image-${slot}`).getBoundingClientRect = jest.fn(() => ({
        left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0
      }));
    }

    await fallbackView.playAction({
      eventId: 'slot-fallback:1',
      eventSequence: 1,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'C',
      skill: { name: 'Moonfall', type: 'special', element: 'Lunar' },
      hits: [{ hpDamage: 7, shieldAbsorbed: 0 }]
    });

    const fallback = fallbackEffects.play.mock.calls
      .find(([scene]) => scene === 'special')?.[1];
    expect(fallback).toEqual(expect.objectContaining({
      actorSlot: 1,
      targetSlot: 2
    }));
    expect(fallback).not.toHaveProperty('origin');
    expect(fallback).not.toHaveProperty('targetOrigin');
  });

  test.each([
    ['actor valid and target invalid', 1],
    ['actor invalid and target valid', 2]
  ])('omits both measured origins when %s', async (_label, validSlot) => {
    mountArena();
    const effects = { play: jest.fn(async () => true) };
    const view = ArenaView.createArenaView({
      document,
      effects,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    document.getElementById('battle').getBoundingClientRect = jest.fn(() => ({
      left: 100, top: 50, right: 500, bottom: 250, width: 400, height: 200
    }));
    for (const slot of [1, 2]) {
      document.getElementById(`arena-image-${slot}`).getBoundingClientRect = jest.fn(() => (
        slot === validSlot
          ? {
              left: slot === 1 ? 140 : 380,
              top: 70,
              right: slot === 1 ? 220 : 460,
              bottom: 170,
              width: 80,
              height: 100
            }
          : {
              left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0
            }
      ));
    }

    await view.playAction({
      eventId: `paired-slot-fallback:${validSlot}`,
      eventSequence: validSlot,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'C',
      skill: { name: 'Moonfall', type: 'special', element: 'Lunar' },
      hits: [{ hpDamage: 7, shieldAbsorbed: 0 }]
    });

    const payload = effects.play.mock.calls
      .find(([scene]) => scene === 'special')?.[1];
    expect(payload).toEqual(expect.objectContaining({
      actorSlot: 1,
      targetSlot: 2
    }));
    expect(payload).not.toHaveProperty('origin');
    expect(payload).not.toHaveProperty('targetOrigin');
  });

  test.each([
    ['attack', 'A'],
    ['defense', 'B'],
    ['special', 'C']
  ])('launches one uninterrupted semantic %s scene for the action', async (scene, choice) => {
    mountArena();
    const effects = { play: jest.fn(async () => true) };
    const view = ArenaView.createArenaView({
      document,
      effects,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: `single-scene-${scene}`,
      fighters: [
        { slot: 1, name: 'Pulse', element: 'Volt', hp: 40, maxHp: 40 },
        { slot: 2, name: 'Ripple', element: 'Tide', hp: 40, maxHp: 40 }
      ]
    });

    await view.playAction({
      matchId: `single-scene-${scene}`,
      eventId: `single-scene-${scene}:1`,
      eventSequence: 1,
      rulesVersion: 8,
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
      statusEffects: [{ type: 'burn', hpDamage: 1, remaining: 1 }],
      hits: [],
      retaliations: [{
        type: 'thorns',
        hpDamage: 1,
        shieldAbsorbed: 0,
        evaded: false
      }]
    });

    expect(effects.play).toHaveBeenCalledTimes(1);
    expect(effects.play).toHaveBeenCalledWith(scene, expect.objectContaining({
      eventId: `single-scene-${scene}:1`,
      element: 'Volt',
      vfxKey: `pulse:${scene}`,
      role: 'striker',
      skillEffects: [{ type: 'shock', amount: 2 }],
      durationMs: expect.any(Number),
      actorSlot: 1,
      targetSlot: 2
    }));
  });

  test('keeps each fighter owner readable beside the monster name', () => {
    mountArena();
    for (const slot of [1, 2]) {
      const owner = document.createElement('span');
      owner.id = `arena-owner-${slot}`;
      document.getElementById(`arena-fighter-${slot}`).appendChild(owner);
    }
    const view = ArenaView.createArenaView({ document });
    view.applyMatch({
      matchId: 'players-visible',
      state: 'roster',
      fighters: [
        { slot: 1, name: 'Ashfang', viewerName: '@pupcid', imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png', hp: 10, maxHp: 10 },
        { slot: 2, name: 'Selene', viewerName: '@mark_teufel01', imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/selene.png', hp: 10, maxHp: 10 }
      ]
    });
    expect(document.getElementById('arena-owner-1').textContent).toBe('@pupcid');
    expect(document.getElementById('arena-owner-2').textContent).toBe('@mark_teufel01');
  });

  test('sanitizes persistent HUD names and image alt text from legacy numeric ids', () => {
    mountArena();
    const view = ArenaView.createArenaView({ document });
    view.applyMatch({
      matchId: 'legacy-private-hud',
      fighters: [{
        slot: 1,
        name: '938475938475',
        viewerName: '123456789012345678',
        imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
        hp: 10,
        maxHp: 10
      }, {
        slot: 2,
        name: 'Selene',
        viewerName: '@mark_teufel01',
        hp: 10,
        maxHp: 10
      }]
    });

    expect(document.getElementById('arena-name-1').textContent).toBe('Monster 1');
    expect(document.getElementById('arena-owner-1').textContent).toBe('Viewer');
    expect(document.getElementById('arena-image-1').alt).toBe('Monster 1');
    expect(document.getElementById('arena-owner-2').textContent).toBe('@mark_teufel01');
  });

  test('keeps sealed choices inaccessible until one joint production reveal', () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { now: () => 1_000 }
    });
    const fighters = [1, 2].map(slot => ({
      slot,
      name: slot === 1 ? 'Ashfang' : 'Selene',
      viewerName: slot === 1 ? '@alpha' : '@beta',
      hp: 30,
      maxHp: 30,
      skills: [
        { choice: 'A', name: 'Bite', icon: 'A', available: true },
        { choice: 'B', name: 'Guard', icon: 'B', available: true },
        { choice: 'C', name: 'Nova', icon: 'C', available: true }
      ]
    }));
    const cards = () => [
      ...document.querySelectorAll('[data-skill-deck] [data-skill]')
    ];

    cards()[0].classList.add('selected');
    cards()[0].setAttribute('aria-selected', 'true');
    view.openChoice({
      matchId: 'accessible-sealed',
      round: 3,
      fighters,
      choices: ['A', 'B', 'C']
    });

    expect(cards().every(card => !card.classList.contains('selected'))).toBe(true);
    expect(cards().every(card => card.getAttribute('aria-selected') === 'false'))
      .toBe(true);

    view.lockChoice({
      matchId: 'accessible-sealed',
      decision: { slot: 1, choice: 'B', source: 'viewer' }
    });
    expect(document.getElementById('arena-fighter-1').dataset.choice)
      .toBeUndefined();
    expect(cards().every(card => !card.classList.contains('selected'))).toBe(true);
    expect(cards().every(card => card.getAttribute('aria-selected') === 'false'))
      .toBe(true);

    expect(view.revealChoices({
      choices: [
        { slot: 1, choice: 'B', source: 'viewer' },
        { slot: 2, choice: 'C', source: 'viewer' }
      ]
    })).toBe(true);
    for (const card of cards()) {
      const deck = card.closest('[data-skill-deck]').dataset.skillDeck;
      const selected = (
        (deck === '1' && card.dataset.skill === 'B') ||
        (deck === '2' && card.dataset.skill === 'C')
      );
      expect(card.classList.contains('selected')).toBe(selected);
      expect(card.getAttribute('aria-selected')).toBe(String(selected));
    }

    view.openChoice({
      matchId: 'accessible-sealed',
      round: 4,
      choices: ['A', 'B', 'C']
    });
    expect(cards().every(card => !card.classList.contains('selected'))).toBe(true);
    expect(cards().every(card => card.getAttribute('aria-selected') === 'false'))
      .toBe(true);
  });

  test('marks locks, cancellation and winner without leaking the lower chat safe zone', async () => {
    mountArena();
    const waited = [];
    const view = ArenaView.createArenaView({
      document,
      clock: { wait: async milliseconds => waited.push(milliseconds), now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'match-a',
      state: 'roster',
      fighters: [{ slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember' }]
    });
    view.lockChoice({ decision: { slot: 1, choice: 'A', timeout: false } });
    expect(document.querySelector('#arena-fighter-1').dataset.choice).toBeUndefined();
    await view.complete({ winnerSlot: 1 });
    expect(document.querySelector('#arena-fighter-1').classList.contains('winner')).toBe(true);
    expect(document.querySelector('#battle').dataset.terminal).toBe('winner');
    expect(waited).toContain(8_000);
    expect(document.querySelector('#battle').classList.contains('visible')).toBe(false);
    view.cancel({ reason: 'roster_unavailable' });
    expect(document.querySelector('#battle').dataset.terminal).toBe('cancelled');
  });

  test('shows the winning viewer and both applied Arena Rating changes in the finale', async () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'result-a',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Ashfang', viewerName: '@pupcid', hp: 20, maxHp: 20 },
        { slot: 2, name: 'Ripple', viewerName: '@mark_teufel01', hp: 0, maxHp: 20 }
      ]
    });

    const playback = view.playEvent('battle_completed', {
      eventId: 'result-a:event:completed',
      matchId: 'result-a',
      winnerSlot: 1,
      terminalReason: 'knockout',
      knockout: { round: 7, remainingHp: 9, maxHp: 20 },
      winner: { name: 'Ashfang', viewerName: '@pupcid' },
      ratingChanges: [
        { slot: 1, before: 900, after: 916, delta: 16 },
        { slot: 2, before: 900, after: 900, delta: 0 }
      ]
    });

    expect(document.getElementById('arena-result').classList).toContain('visible');
    expect(document.getElementById('arena-result-ko').textContent).toContain('K');
    expect(document.getElementById('arena-result-winner').textContent).toContain('@pupcid');
    expect(document.getElementById('arena-result-monster').textContent).toContain('Ashfang');
    expect(document.getElementById('arena-result-summary').textContent).toContain('7');
    expect(document.getElementById('arena-result-summary').textContent).toContain('9');
    expect(document.getElementById('arena-result-ratings').textContent).toContain('900');
    expect(document.getElementById('arena-result-ratings').textContent).toContain('916');
    expect(document.getElementById('arena-result-ratings').textContent).toMatch(/unchanged|unverändert/i);
    expect(document.getElementById('arena-result-report').hidden).toBe(true);
    expect(document.getElementById('arena-result-report').textContent).toBe('');
    await playback;
  });

  test('shows a compact two-fighter combat report and highlights the decisive skill for eight seconds', async () => {
    mountArena();
    const waited = [];
    let finishResult;
    const view = ArenaView.createArenaView({
      document,
      clock: {
        wait: milliseconds => {
          waited.push(milliseconds);
          return new Promise(resolve => { finishResult = resolve; });
        },
        now: () => 1_000
      }
    });
    view.applyMatch({
      matchId: 'combat-report',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Ashfang', viewerName: '@alpha', hp: 18, maxHp: 30 },
        { slot: 2, name: 'Ripple', viewerName: '@beta', hp: 0, maxHp: 30 }
      ]
    });

    const completion = view.complete({
      eventId: 'combat-report:completed',
      matchId: 'combat-report',
      winnerSlot: 1,
      terminalReason: 'knockout',
      winner: { name: 'Ashfang', viewerName: '@alpha' },
      knockout: { round: 6, remainingHp: 18, maxHp: 30 },
      ratingChanges: [
        { slot: 1, before: 1000, after: 1016, delta: 16 },
        { slot: 2, before: 1000, after: 984, delta: -16 }
      ],
      combatReport: {
        roundCount: 6,
        durationMs: 42_000,
        decisiveSkill: {
          round: 6,
          ownerSlot: 1,
          choice: 'C',
          skillName: 'Inferno Crown',
          skillIcon: '🔥'
        },
        highlights: {
          largestHit: { slot: 1, amount: 11 },
          largestBlock: { slot: 1, amount: 5 },
          largestHeal: { slot: 2, amount: 6 }
        },
        fighters: [{
          slot: 1,
          playerName: '@alpha',
          monsterName: 'Ashfang',
          damageDealt: 29,
          damageBlocked: 7,
          healingDone: 4,
          shieldGained: 6,
          specialsUsed: 2,
          xpAwarded: 35,
          rating: { before: 1000, after: 1016, delta: 16, eligible: true }
        }, {
          slot: 2,
          playerName: '@beta',
          monsterName: 'Ripple',
          damageDealt: 12,
          damageBlocked: 3,
          healingDone: 8,
          shieldGained: 10,
          specialsUsed: 1,
          xpAwarded: 18,
          rating: { before: 1000, after: 984, delta: -16, eligible: true }
        }]
      }
    });

    const report = document.getElementById('arena-result-report');
    expect(report.hidden).toBe(false);
    expect(report.querySelectorAll('[data-report-fighter]')).toHaveLength(2);
    expect(report.querySelector('[data-report-fighter="1"]').classList)
      .toContain('is-decisive');
    expect(report.querySelector('.arena-result-decisive').textContent)
      .toContain('🔥 Inferno Crown');
    expect(report.querySelector('.arena-result-decisive').textContent)
      .toContain('C');
    expect(report.querySelector('[data-report-highlights]').textContent)
      .toMatch(/11.*5.*6/);
    expect(report.querySelector('[data-report-fighter="1"]').textContent)
      .toContain('@alpha');
    expect(report.querySelector('[data-report-fighter="1"]').textContent)
      .toContain('Ashfang');
    for (const metric of ['damage', 'defense', 'healing', 'specials', 'xp', 'elo']) {
      expect(report.querySelectorAll(`[data-report-metric="${metric}"]`))
        .toHaveLength(2);
    }
    for (const value of ['29', '7', '6', '35', '1016']) {
      expect(report.querySelector('[data-report-fighter="1"]').textContent)
        .toContain(value);
    }
    expect(document.getElementById('arena-result-ratings').textContent).toBe('');
    expect(waited).toEqual([8_000]);

    finishResult();
    await completion;
  });

  test('preserves a held portrait result across same-match reconnect snapshots', async () => {
    const dom = mountArena({ portrait: true });
    const waited = [];
    let finishResult;
    const view = ArenaView.createArenaView({
      document,
      clock: {
        wait: milliseconds => {
          waited.push(milliseconds);
          return milliseconds === 8_000
            ? new Promise(resolve => { finishResult = resolve; })
            : Promise.resolve();
        },
        now: () => 1_000
      }
    });
    view.applyMatch({
      matchId: 'held-portrait-result',
      state: 'action',
      roundNumber: 5,
      fighters: [
        { slot: 1, name: 'Selene', viewerName: '@winner', hp: 14, maxHp: 30 },
        { slot: 2, name: 'Ripple', viewerName: '@runner-up', hp: 0, maxHp: 30 }
      ]
    });
    const completion = view.complete({
      eventId: 'held-portrait-result:completed',
      matchId: 'held-portrait-result',
      winnerSlot: 1,
      terminalReason: 'knockout',
      winner: { name: 'Selene', viewerName: '@winner' },
      knockout: { round: 5, remainingHp: 14, maxHp: 30 },
      ratingChanges: [
        { slot: 1, before: 1000, after: 1016, delta: 16 },
        { slot: 2, before: 1000, after: 984, delta: -16 }
      ]
    });

    const battle = document.getElementById('battle');
    const result = document.getElementById('arena-result');
    const compact = document.getElementById('arena-result-compact-summary');
    const detailed = document.getElementById('arena-result-ratings');
    const winner = document.getElementById('arena-result-winner');
    const heldPresentation = {
      compact: compact.textContent,
      detailed: detailed.textContent,
      winner: winner.textContent
    };
    const expectHeldPortraitPresentation = () => {
      expect(dom.portraitMediaQuery.matches).toBe(true);
      expect(battle.dataset.phase).toBe('completed');
      expect(battle.dataset.terminal).toBe('winner');
      expect(result.classList).toContain('visible');
      expect(compact.textContent).toBe(heldPresentation.compact);
      expect(detailed.textContent).toBe(heldPresentation.detailed);
      expect(winner.textContent).toBe(heldPresentation.winner);
      expect(document.querySelector(
        '#battle[data-phase="completed"] #arena-result-compact-summary'
      )).toBe(compact);
      expect(document.querySelector(
        '#battle[data-phase="completed"] #arena-result-ratings'
      )).toBe(detailed);
    };

    expect(heldPresentation.compact).toMatch(/5.*14/);
    expect(heldPresentation.detailed).not.toBe('');
    expect(heldPresentation.winner).toContain('@winner');
    expectHeldPortraitPresentation();

    for (const [state, cursor] of [
      ['finalizing', 41],
      ['action', 42]
    ]) {
      view.applySnapshot({
        battle: {
          matches: [{
            matchId: 'held-portrait-result',
            state,
            cursor,
            roundNumber: 6,
            ...(state === 'action' ? { actionDeadlineMs: 9_000 } : {}),
            fighters: [
              {
                slot: 1,
                name: 'Reconnect Replacement',
                viewerName: '@reconnect',
                hp: 30,
                maxHp: 30
              },
              {
                slot: 2,
                name: 'Reconnect Opponent',
                viewerName: '@other',
                hp: 30,
                maxHp: 30
              }
            ]
          }]
        }
      });

      expect(view.state().eventSequence).toBe(cursor);
      expectHeldPortraitPresentation();
    }

    expect(waited).toEqual([8_000]);
    finishResult();
    await completion;

    expect(result.classList).not.toContain('visible');
    expect(battle.classList).not.toContain('visible');
    expect(view.state().matchId).toBeNull();

    view.applySnapshot({
      battle: {
        matches: [{
          matchId: 'held-portrait-result',
          state: 'action',
          cursor: 43,
          roundNumber: 6,
          fighters: [
            {
              slot: 1,
              name: 'Reconnect Replacement',
              viewerName: '@reconnect',
              hp: 30,
              maxHp: 30
            },
            {
              slot: 2,
              name: 'Reconnect Opponent',
              viewerName: '@other',
              hp: 30,
              maxHp: 30
            }
          ]
        }]
      }
    });

    expect(battle.dataset.phase).toBe('action');
    expect(battle.dataset.terminal).toBeUndefined();
    expect(result.classList).not.toContain('visible');
    expect(document.getElementById('arena-name-1').textContent)
      .toBe('Reconnect Replacement');
    expect(view.state().eventSequence).toBe(43);
  });

  test('clears a held result when a different match owns the arena without letting the old timer clear it', async () => {
    mountArena();
    const resultResolvers = [];
    const view = ArenaView.createArenaView({
      document,
      clock: {
        wait: milliseconds => (
          milliseconds === 8_000
            ? new Promise(resolve => resultResolvers.push(resolve))
            : Promise.resolve()
        ),
        now: () => 1_000
      }
    });
    const oldFighters = [
      { slot: 1, name: 'Ashfang', viewerName: '@old-winner', hp: 11, maxHp: 30 },
      { slot: 2, name: 'Ripple', viewerName: '@old-loser', hp: 0, maxHp: 30 }
    ];
    view.applyMatch({
      matchId: 'held-old-result',
      state: 'action',
      roundNumber: 9,
      fighters: oldFighters
    });

    const oldCompletion = view.complete({
      eventId: 'held-old-result:completed',
      matchId: 'held-old-result',
      winnerSlot: 1,
      terminalReason: 'knockout',
      winner: { name: 'Ashfang', viewerName: '@old-winner' },
      knockout: { round: 9, remainingHp: 11, maxHp: 30 },
      nextArenaHint: {
        kind: 'close_result',
        avoidsImmediateRematch: true
      },
      combatReport: {
        decisiveSkill: {
          round: 9,
          ownerSlot: 1,
          choice: 'C',
          skillName: 'Old Inferno'
        },
        fighters: [{
          slot: 1,
          playerName: '@old-winner',
          monsterName: 'Ashfang',
          damageDealt: 29,
          rating: { after: 1016, delta: 16 }
        }, {
          slot: 2,
          playerName: '@old-loser',
          monsterName: 'Ripple',
          damageDealt: 12,
          rating: { after: 984, delta: -16 }
        }]
      }
    });

    const result = document.getElementById('arena-result');
    const report = document.getElementById('arena-result-report');
    expect(result.classList).toContain('visible');
    expect(document.getElementById('arena-result-winner').textContent)
      .toContain('@old-winner');
    expect(document.getElementById('arena-result-compact-summary').textContent)
      .toMatch(/9.*11/);
    expect(document.getElementById('arena-result-next').textContent).not.toBe('');
    expect(document.getElementById('arena-feed').textContent).not.toBe('');
    expect(report.hidden).toBe(false);
    expect(report.textContent).toContain('Old Inferno');

    view.applyMatch({
      matchId: 'held-old-result',
      state: 'finalizing',
      roundNumber: 9,
      fighters: oldFighters
    });
    expect(result.classList).toContain('visible');
    expect(document.getElementById('arena-result-winner').textContent)
      .toContain('@old-winner');

    view.applyMatch({
      matchId: 'fresh-result-owner',
      state: 'roster',
      fighters: [
        { slot: 1, name: 'Oakheart', viewerName: '@new-left', hp: 17, maxHp: 30 },
        { slot: 2, name: 'Voltkit', viewerName: '@new-right', hp: 30, maxHp: 30 }
      ]
    });

    expect(result.classList).not.toContain('visible');
    for (const id of [
      'arena-result-ko',
      'arena-result-winner',
      'arena-result-monster',
      'arena-result-summary',
      'arena-result-compact-summary',
      'arena-result-ratings',
      'arena-result-next',
      'arena-feed'
    ]) {
      expect(document.getElementById(id).textContent).toBe('');
    }
    expect(report.hidden).toBe(true);
    expect(report.childElementCount).toBe(0);
    expect(document.getElementById('battle').dataset.phase).toBe('roster');
    expect(document.getElementById('arena-name-1').textContent).toBe('Oakheart');

    resultResolvers.shift()();
    await oldCompletion;

    expect(document.getElementById('battle').classList).toContain('visible');
    expect(document.getElementById('battle').dataset.phase).toBe('roster');
    expect(result.classList).not.toContain('visible');
    expect(document.getElementById('arena-name-1').textContent).toBe('Oakheart');

    const newCompletion = view.complete({
      eventId: 'fresh-result-owner:completed',
      matchId: 'fresh-result-owner',
      winnerSlot: 1,
      terminalReason: 'forfeit',
      winner: { name: 'Oakheart', viewerName: '@new-left' }
    });
    const compactSummary = document.getElementById(
      'arena-result-compact-summary'
    ).textContent;
    expect(compactSummary).toMatch(/1.*17/);
    expect(compactSummary).not.toContain('9');
    expect(document.getElementById('battle').dataset.phase).toBe('completed');

    resultResolvers.shift()();
    await newCompletion;
  });

  test('clears the whole held result surface when an empty snapshot takes ownership', async () => {
    mountArena();
    let finishResult;
    const view = ArenaView.createArenaView({
      document,
      clock: {
        wait: milliseconds => (
          milliseconds === 8_000
            ? new Promise(resolve => { finishResult = resolve; })
            : Promise.resolve()
        ),
        now: () => 1_000
      }
    });
    view.applyMatch({
      matchId: 'empty-reset-result',
      state: 'action',
      roundNumber: 7,
      fighters: [
        { slot: 1, name: 'Selene', viewerName: '@reset-left', hp: 13, maxHp: 30 },
        { slot: 2, name: 'Ripple', viewerName: '@reset-right', hp: 0, maxHp: 30 }
      ]
    });
    const completion = view.complete({
      eventId: 'empty-reset-result:completed',
      matchId: 'empty-reset-result',
      winnerSlot: 1,
      terminalReason: 'knockout',
      winner: { name: 'Selene', viewerName: '@reset-left' },
      knockout: { round: 7, remainingHp: 13, maxHp: 30 },
      ratingChanges: [
        { slot: 1, before: 1000, after: 1016, delta: 16 },
        { slot: 2, before: 1000, after: 984, delta: -16 }
      ],
      nextArenaHint: {
        kind: 'close_result',
        avoidsImmediateRematch: true
      }
    });

    expect(document.getElementById('arena-result').classList).toContain('visible');
    expect(document.getElementById('arena-result-ratings').textContent).not.toBe('');
    expect(document.getElementById('arena-result-next').textContent).not.toBe('');
    expect(document.getElementById('arena-feed').textContent).not.toBe('');

    expect(view.applySnapshot({ battle: { matches: [] } })).toBeNull();

    expect(document.getElementById('arena-result').classList)
      .not.toContain('visible');
    for (const id of [
      'arena-result-ko',
      'arena-result-winner',
      'arena-result-monster',
      'arena-result-summary',
      'arena-result-compact-summary',
      'arena-result-ratings',
      'arena-result-next',
      'arena-feed'
    ]) {
      expect(document.getElementById(id).textContent).toBe('');
    }
    const report = document.getElementById('arena-result-report');
    expect(report.hidden).toBe(true);
    expect(report.childElementCount).toBe(0);
    expect(document.getElementById('battle').dataset.terminal).toBeUndefined();
    expect(document.getElementById('battle').classList).not.toContain('visible');

    finishResult();
    await completion;

    expect(document.getElementById('arena-result').classList)
      .not.toContain('visible');
    expect(document.getElementById('arena-result-winner').textContent).toBe('');
    expect(document.getElementById('arena-feed').textContent).toBe('');
  });

  test('renders a backend double knockout as a draw with one Elo block', async () => {
    mountArena();
    const audio = { play: jest.fn(async () => true) };
    const view = ArenaView.createArenaView({
      document,
      audio,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'double-ko',
      roundNumber: 8,
      fighters: [
        {
          slot: 1,
          name: 'Ashfang',
          viewerName: '@left',
          hp: 0,
          maxHp: 40
        },
        {
          slot: 2,
          name: 'Ripple',
          viewerName: '@right',
          hp: 0,
          maxHp: 40
        }
      ]
    });

    await view.complete({
      eventId: 'double-ko:done',
      winnerSlot: 0,
      winner: null,
      terminalReason: 'double_knockout',
      knockout: null,
      ratingChanges: [
        { slot: 1, before: 1040, after: 1040, delta: 0 },
        { slot: 2, before: 1010, after: 1010, delta: 0 }
      ]
    });

    expect(document.getElementById('battle').dataset.terminal).toBe('draw');
    for (const slot of [1, 2]) {
      expect(document.getElementById(`arena-fighter-${slot}`).classList)
        .not.toContain('winner');
      expect(document.getElementById(`arena-fighter-${slot}`).classList)
        .not.toContain('defeated');
    }
    expect(document.getElementById('arena-result-ko').textContent)
      .toBe('Doppel-K.-O.');
    expect(document.getElementById('arena-result-winner').textContent)
      .toBe('Unentschieden');
    expect(document.getElementById('arena-result-monster').textContent).toBe('');
    expect(document.getElementById('arena-result-summary').textContent)
      .toContain('8');
    expect(document.getElementById('arena-result-ratings').textContent)
      .toContain('@left: ELO unchanged (1040)');
    expect(document.getElementById('arena-result-rating').textContent).toBe('');
    expect(audio.play).not.toHaveBeenCalledWith(
      'arena.victory',
      expect.any(Object)
    );
  });

  test.each([
    {
      label: 'knockout',
      matchRound: 6,
      fighters: [
        { slot: 1, name: 'Ashfang', viewerName: '@pupcid', hp: 9, maxHp: 20 },
        { slot: 2, name: 'Ripple', viewerName: '@tide', hp: 0, maxHp: 20 }
      ],
      completion: {
        winnerSlot: 1,
        winner: { name: 'Ashfang', viewerName: '@pupcid' },
        terminalReason: 'knockout',
        knockout: { round: 7, remainingHp: 4, maxHp: 20 }
      },
      expectedWinner: '@pupcid',
      expectedCompact: 'Runde 7 \u00b7 9 HP \u00fcbrig',
      expectedDetailed: 'Runde 7 \u00b7 4/20 HP \u00fcbrig'
    },
    {
      label: 'forfeit',
      matchRound: 4,
      fighters: [
        { slot: 1, name: 'Selene', viewerName: '@luna', hp: 17, maxHp: 30 },
        { slot: 2, name: 'Ripple', viewerName: '@tide', hp: 22, maxHp: 30 }
      ],
      completion: {
        round: 5,
        winnerSlot: 1,
        winner: { name: 'Selene', viewerName: '@luna' },
        terminalReason: 'forfeit',
        knockout: null
      },
      expectedWinner: '@luna',
      expectedCompact: 'Runde 5 \u00b7 17 HP \u00fcbrig',
      expectedDetailed: ''
    },
    {
      label: 'double knockout',
      matchRound: 8,
      fighters: [
        { slot: 1, name: 'Ashfang', viewerName: '@left', hp: 0, maxHp: 40 },
        { slot: 2, name: 'Ripple', viewerName: '@right', hp: 0, maxHp: 40 }
      ],
      completion: {
        winnerSlot: 0,
        winner: null,
        terminalReason: 'double_knockout',
        knockout: null
      },
      expectedWinner: 'Unentschieden',
      expectedCompact: 'Runde 8 \u00b7 0 HP \u00fcbrig',
      expectedDetailed: 'Runde 8 \u00b7 Beide Monster sind K. O.'
    }
  ])(
    'exposes one compact round and remaining-HP summary for portrait $label completion',
    async ({
      label,
      matchRound,
      fighters,
      completion,
      expectedWinner,
      expectedCompact,
      expectedDetailed
    }) => {
      mountArena({ portrait: true });
      let finishResult;
      const view = ArenaView.createArenaView({
        document,
        clock: {
          wait: milliseconds => (
            milliseconds === 8_000
              ? new Promise(resolve => { finishResult = resolve; })
              : Promise.resolve()
          ),
          now: () => 1_000
        }
      });
      view.applyMatch({
        matchId: `compact-result:${label}`,
        state: 'action',
        roundNumber: matchRound,
        fighters
      });

      const playback = view.playEvent('battle_completed', {
        eventId: `compact-result:${label}:completed`,
        matchId: `compact-result:${label}`,
        ...completion
      });

      expect(document.getElementById('battle').dataset.phase).toBe('completed');
      expect(document.getElementById('arena-result-winner').textContent)
        .toContain(expectedWinner);
      expect(document.getElementById('arena-result-compact-summary').textContent)
        .toBe(expectedCompact);
      expect(document.getElementById('arena-result-compact-summary').textContent
        .match(/\b\d+ HP\b/g)).toHaveLength(1);
      expect(document.getElementById('arena-result-summary').textContent)
        .toBe(expectedDetailed);

      finishResult();
      await playback;
    }
  );

  test('shows the full readable action contract from public combat state', async () => {
    mountArena({ portrait: true });
    const view = ArenaView.createArenaView({
      document,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'clarity',
      state: 'action',
      fighters: [
        {
          slot: 1,
          name: 'Selene',
          viewerName: '@luna',
          hp: 24,
          maxHp: 30,
          shield: 4,
          charge: 100
        },
        {
          slot: 2,
          name: 'Ripple',
          viewerName: '@tide',
          hp: 20,
          maxHp: 30,
          shield: 1,
          charge: 50
        }
      ]
    });
    expect(document.getElementById('arena-lead').textContent).toContain('@luna');

    await view.playAction({
      rulesVersion: 8,
      matchId: 'clarity',
      eventId: 'clarity:event:1',
      eventSequence: 1,
      round: 4,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'C',
      skill: {
        name: 'Moonfall',
        shortText: 'Deals damage, restores health and raises a shield.',
        type: 'special',
        element: 'Lunar',
        vfxKey: 'selene:special'
      },
      hits: [
        { index: 1, hpDamage: 0, shieldAbsorbed: 0, evaded: true },
        { index: 2, hpDamage: 7, shieldAbsorbed: 1, evaded: false }
      ],
      outcomes: [
        { type: 'heal', amount: 4 },
        { type: 'shield', amount: 3 }
      ],
      actorState: { hp: 28, maxHp: 30, shield: 7, charge: 0 },
      targetState: { hp: 13, maxHp: 30, shield: 0, charge: 75 }
    });

    expect(document.getElementById('arena-action-player').textContent).toBe('@luna');
    expect(document.getElementById('arena-action-key').textContent).toBe('C');
    expect(document.getElementById('arena-action-skill').textContent).toBe('Moonfall');
    expect(document.getElementById('arena-action-copy').textContent)
      .toContain('restores health');
    const metrics = [...document.querySelectorAll('#arena-action-metrics [data-action-metric]')]
      .map(metric => metric.textContent);
    expect(metrics).toEqual([
      'Schaden 7',
      'Schildtreffer 1',
      'Schild +3',
      'Heilung 4',
      'Ausweichen'
    ]);
    expect(document.querySelector('#arena-action-metrics').textContent)
      .toContain('Schaden 7');
    expect(document.getElementById('arena-action-compact-metric').textContent)
      .toBe('\u22127 HP');
    expect(document.getElementById('arena-action-compact-metric').dataset.actionMetric)
      .toBe('compact');
    expect(document.getElementById('arena-action-card').getAttribute('aria-label'))
      .toBe('C \u00b7 Moonfall \u00b7 \u22127 HP');
    expect(document.getElementById('arena-feed').textContent)
      .not.toContain('\u22127 HP');
    expect(document.getElementById('arena-action-card').classList)
      .toContain('visible');
  });

  test('synchronizes the compact action label across portrait and landscape changes', async () => {
    const dom = mountArena({ portrait: true });
    const view = ArenaView.createArenaView({
      document,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'orientation-action',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Selene', viewerName: '@luna', hp: 24, maxHp: 30 },
        { slot: 2, name: 'Ripple', viewerName: '@tide', hp: 20, maxHp: 30 }
      ]
    });
    await view.playAction({
      matchId: 'orientation-action',
      eventId: 'orientation-action:1',
      eventSequence: 1,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'C',
      skill: {
        name: 'Moonfall',
        shortText: 'Full localized action detail.',
        type: 'special',
        element: 'Lunar'
      },
      hits: [{ hpDamage: 7, shieldAbsorbed: 0 }]
    });

    const actionCard = document.getElementById('arena-action-card');
    expect(actionCard.getAttribute('aria-label'))
      .toBe('C \u00b7 Moonfall \u00b7 \u22127 HP');
    expect(dom.orientationListenerCount()).toBe(1);

    dom.setPortrait(false);
    expect(actionCard.getAttribute('aria-label')).toBeNull();
    expect(document.getElementById('arena-action-player').textContent).toBe('@luna');
    expect(document.getElementById('arena-action-copy').textContent)
      .toBe('Full localized action detail.');
    expect(document.getElementById('arena-action-metrics').textContent)
      .toContain('Schaden 7');

    dom.setPortrait(true);
    expect(actionCard.getAttribute('aria-label'))
      .toBe('C \u00b7 Moonfall \u00b7 \u22127 HP');
  });

  test('removes compact action ARIA on completion cancellation and destroy', async () => {
    const dom = mountArena({ portrait: true });
    const view = ArenaView.createArenaView({
      document,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    const play = async (matchId, eventSequence) => {
      view.applyMatch({
        matchId,
        state: 'action',
        fighters: [
          { slot: 1, name: 'Selene', viewerName: '@luna', hp: 24, maxHp: 30 },
          { slot: 2, name: 'Ripple', viewerName: '@tide', hp: 20, maxHp: 30 }
        ]
      });
      await view.playAction({
        matchId,
        eventId: `${matchId}:action`,
        eventSequence,
        actorSlot: 1,
        targetSlot: 2,
        choice: 'A',
        skill: { name: 'Moon Strike', type: 'attack', element: 'Lunar' },
        hits: [{ hpDamage: 5, shieldAbsorbed: 0 }]
      });
    };
    const actionCard = document.getElementById('arena-action-card');

    await play('aria-complete', 1);
    expect(actionCard.getAttribute('aria-label'))
      .toBe('A \u00b7 Moon Strike \u00b7 \u22125 HP');
    await view.complete({
      matchId: 'aria-complete',
      winnerSlot: 1,
      terminalReason: 'forfeit'
    });
    expect(actionCard.getAttribute('aria-label')).toBeNull();
    dom.setPortrait(false);
    dom.setPortrait(true);
    expect(actionCard.getAttribute('aria-label')).toBeNull();

    await play('aria-cancel', 2);
    expect(actionCard.hasAttribute('aria-label')).toBe(true);
    await view.cancel({ matchId: 'aria-cancel', reason: 'forfeit' });
    expect(actionCard.getAttribute('aria-label')).toBeNull();

    await play('aria-destroy', 3);
    expect(actionCard.hasAttribute('aria-label')).toBe(true);
    view.destroy();
    expect(actionCard.getAttribute('aria-label')).toBeNull();
    expect(dom.portraitMediaQuery.removeEventListener)
      .toHaveBeenCalledWith('change', expect.any(Function));
    expect(dom.orientationListenerCount()).toBe(0);
  });

  test('chooses exactly one decisive compact metric in the approved priority order', async () => {
    mountArena({ portrait: true });
    const view = ArenaView.createArenaView({
      document,
      localize: key => ({
        arenaEvadeMetric: 'DODGED',
        arenaStatusMetric: 'STATUS'
      }[key] || key),
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    const cases = [
      {
        hits: [{ hpDamage: 9, shieldAbsorbed: 4 }],
        outcomes: [{ type: 'shield', amount: 7 }, { type: 'heal', amount: 5 }],
        expected: '\u22129 HP'
      },
      {
        statusEffects: [{
          type: 'burn_tick',
          amount: 6,
          hpDamage: 6,
          remaining: 0
        }],
        outcomes: [
          { type: 'shield', amount: 7 },
          { type: 'heal', amount: 5 },
          { type: 'reflect', amount: 2 }
        ],
        expected: '\u22126 HP'
      },
      {
        hits: [{ hpDamage: 0, shieldAbsorbed: 4 }],
        outcomes: [{ type: 'shield', amount: 7 }, { type: 'heal', amount: 5 }],
        expected: '+7 SHIELD'
      },
      {
        outcomes: [{ type: 'heal', amount: 5 }, { type: 'lifesteal', amount: 2 }],
        expected: '+7 HP'
      },
      {
        hits: [{ hpDamage: 0, shieldAbsorbed: 4 }],
        expected: '4 BLOCK'
      },
      {
        hits: [{ hpDamage: 0, shieldAbsorbed: 0, evaded: true }],
        expected: 'DODGED'
      },
      {
        statusEffects: [{ type: 'shock' }],
        expected: 'STATUS'
      },
      {
        outcomes: [{ type: 'reflect', amount: 2 }],
        expected: 'STATUS'
      },
      {
        expected: '0 HP'
      }
    ];

    for (const [index, metricCase] of cases.entries()) {
      await view.playAction({
        eventId: `decisive-metric:${index + 1}`,
        eventSequence: index + 1,
        actorSlot: 1,
        targetSlot: 2,
        choice: 'A',
        skill: { name: 'Pulse', type: 'attack', element: 'Volt' },
        hits: metricCase.hits || [],
        outcomes: metricCase.outcomes || [],
        statusEffects: metricCase.statusEffects || []
      });
      expect(document.getElementById('arena-action-compact-metric').textContent)
        .toBe(metricCase.expected);
      expect(document.querySelectorAll('#arena-action-compact-metric[data-action-metric]'))
        .toHaveLength(1);
    }
  });

  test('renders every localized action metric as an individually addressable value', async () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      localize: (key, params) => ({
        arenaDamageMetric: `${params.amount} DMG`,
        arenaShieldAbsorbedMetric: `${params.amount} Schild absorbiert`,
        arenaShieldGainMetric: `${params.amount} Schild`,
        arenaHealMetric: `${params.amount} Heilung`
      }[key] || key),
      clock: { wait: async () => {}, now: () => 1_000 }
    });

    await view.playAction({
      matchId: 'metric-spans',
      eventId: 'metric-spans:action:1',
      eventSequence: 1,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'C',
      skill: {
        name: 'Moonfall',
        shortText: 'Landscape detail remains readable.',
        type: 'special'
      },
      hits: [{ hpDamage: 42, shieldAbsorbed: 12 }],
      outcomes: [
        { type: 'shield', amount: 8 },
        { type: 'heal', amount: 5 }
      ]
    });

    const metrics = [...document.querySelectorAll('#arena-action-metrics [data-action-metric]')]
      .map(metric => metric.textContent);
    expect(metrics).toEqual([
      '42 DMG',
      '12 Schild absorbiert',
      '8 Schild',
      '5 Heilung'
    ]);
    expect(document.querySelector('#arena-action-metrics').textContent)
      .toContain('42 DMG');
    expect(document.getElementById('arena-action-skill').textContent).toBe('Moonfall');
    expect(document.getElementById('arena-action-copy').textContent)
      .toBe('Landscape detail remains readable.');
    expect(document.getElementById('arena-action-card').getAttribute('aria-label'))
      .toBeNull();
  });

  test('clears the last action card before the result and keeps the next roster clean', async () => {
    mountArena({ portrait: true });
    let finishResult;
    const view = ArenaView.createArenaView({
      document,
      clock: {
        wait: milliseconds => (
          milliseconds === 8_000
            ? new Promise(resolve => { finishResult = resolve; })
            : Promise.resolve()
        ),
        now: () => 1_000
      }
    });
    view.applyMatch({
      matchId: 'terminal-action',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Selene', viewerName: '@luna', hp: 20, maxHp: 30 },
        { slot: 2, name: 'Ripple', viewerName: '@tide', hp: 0, maxHp: 30 }
      ]
    });
    await view.playAction({
      rulesVersion: 8,
      matchId: 'terminal-action',
      eventId: 'terminal-action:event:1',
      eventSequence: 1,
      round: 4,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'A',
      skill: { name: 'Moon Strike', shortText: 'Deals 8 damage.', type: 'attack' },
      hits: [{ index: 1, hpDamage: 8, shieldAbsorbed: 0, evaded: false }],
      terminal: true
    });
    expect(document.getElementById('arena-action-card').classList).toContain('visible');
    expect(document.getElementById('arena-action-compact-metric').textContent)
      .toBe('\u22128 HP');

    const completion = view.complete({
      eventId: 'terminal-action:event:completed',
      matchId: 'terminal-action',
      winnerSlot: 1,
      winner: { viewerName: '@luna', name: 'Selene' },
      terminalReason: 'knockout',
      knockout: { round: 4, remainingHp: 20, maxHp: 30 }
    });

    expect(document.getElementById('arena-result').classList).toContain('visible');
    expect(document.getElementById('arena-action-card').classList).not.toContain('visible');
    expect(document.getElementById('battle').dataset.phase).toBe('completed');
    expect(document.getElementById('arena-result-winner').textContent).toContain('@luna');
    expect(document.getElementById('arena-result-summary').textContent).toContain('4');
    finishResult();
    await completion;

    view.applyMatch({
      matchId: 'next-roster',
      state: 'roster',
      fighters: [
        { slot: 1, name: 'Ashfang', viewerName: '@ember', hp: 30, maxHp: 30 },
        { slot: 2, name: 'Oakheart', viewerName: '@grove', hp: 30, maxHp: 30 }
      ]
    });
    expect(document.getElementById('arena-action-card').classList).not.toContain('visible');
  });

  test('resets a defeated slot when the completed result already cleared the active match', async () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'completed-old-match',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Ashfang', viewerName: '@ember', hp: 18, maxHp: 30 },
        { slot: 2, name: 'Ripple', viewerName: '@tide', hp: 0, maxHp: 30 }
      ]
    });
    await view.playAction({
      rulesVersion: 8,
      matchId: 'completed-old-match',
      eventId: 'completed-old-match:event:1',
      eventSequence: 1,
      round: 4,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'A',
      skill: { name: 'Moon Strike', shortText: 'Deals 8 damage.', type: 'attack' },
      hits: [{ index: 1, hpDamage: 8, shieldAbsorbed: 0, evaded: false }],
      terminal: true
    });
    await view.complete({
      eventId: 'completed-old-match:event:completed',
      matchId: 'completed-old-match',
      winnerSlot: 1,
      winner: { viewerName: '@ember', name: 'Ashfang' },
      terminalReason: 'knockout',
      knockout: { round: 4, remainingHp: 18, maxHp: 30 }
    });

    const reusedSlot = document.getElementById('arena-fighter-2');
    expect(reusedSlot.classList.contains('defeated')).toBe(true);
    expect(reusedSlot.classList.contains('knockout')).toBe(true);

    view.applyMatch({
      matchId: 'fresh-new-match',
      state: 'roster',
      fighters: [
        { slot: 1, name: 'Oakheart', viewerName: '@grove', hp: 30, maxHp: 30 },
        { slot: 2, name: 'Voltkit', viewerName: '@volt', hp: 30, maxHp: 30 }
      ]
    });

    expect([...reusedSlot.classList]).toEqual(['arena-fighter']);
    expect(reusedSlot.dataset.choice).toBeUndefined();
    expect(reusedSlot.dataset.choiceSource).toBeUndefined();
    expect(document.getElementById('arena-name-2').textContent).toBe('Voltkit');
  });

  test('clears the last action card immediately when a battle is cancelled', async () => {
    mountArena();
    let finishCancellation;
    const view = ArenaView.createArenaView({
      document,
      clock: {
        wait: milliseconds => (
          milliseconds === 1_500
            ? new Promise(resolve => { finishCancellation = resolve; })
            : Promise.resolve()
        ),
        now: () => 1_000
      }
    });
    view.applyMatch({
      matchId: 'cancel-action',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Selene', viewerName: '@luna', hp: 20, maxHp: 30 },
        { slot: 2, name: 'Ripple', viewerName: '@tide', hp: 20, maxHp: 30 }
      ]
    });
    await view.playAction({
      rulesVersion: 8,
      matchId: 'cancel-action',
      eventId: 'cancel-action:event:1',
      eventSequence: 1,
      round: 2,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'B',
      skill: { name: 'Moon Guard', shortText: 'Raises a shield.', type: 'defense' },
      outcomes: [{ type: 'shield', amount: 5 }]
    });
    expect(document.getElementById('arena-action-card').classList).toContain('visible');

    const cancellation = view.cancel({ matchId: 'cancel-action', reason: 'forfeit' });

    expect(document.getElementById('arena-action-card').classList).not.toContain('visible');
    finishCancellation();
    await cancellation;
  });

  test('holds terminal surfaces for the shared result and cancellation durations', async () => {
    mountArena();
    const wait = jest.fn(async () => {});
    const view = ArenaView.createArenaView({
      document,
      clock: { wait, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'paced-terminal',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Ashfang', viewerName: '@ember', hp: 20, maxHp: 30 },
        { slot: 2, name: 'Ripple', viewerName: '@tide', hp: 0, maxHp: 30 }
      ]
    });

    await view.complete({
      eventId: 'paced-terminal:completed',
      matchId: 'paced-terminal',
      winnerSlot: 1,
      terminalReason: 'knockout'
    });
    view.applyMatch({
      matchId: 'paced-cancellation',
      state: 'roster',
      fighters: []
    });
    await view.cancel({ matchId: 'paced-cancellation', reason: 'roster_unavailable' });

    expect(wait.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
      8_000,
      1_500
    ]);
  });

  test('renders one explicit stat allocation card for the sanitized player and monster', () => {
    mountArena();
    const view = ArenaView.createArenaView({ document });

    expect(view.showStatPrompt({
      playerName: '@luna',
      monster: { name: 'Selene', level: 7 },
      level: 7,
      remainingUnspentPoints: 2
    })).toBe(true);
    expect(document.getElementById('arena-stat-title').textContent).toContain('@luna');
    expect(document.getElementById('arena-stat-title').textContent).toContain('Selene');
    expect(document.getElementById('arena-stat-meta').textContent).toContain('7');
    expect(document.getElementById('arena-stat-meta').textContent).toContain('2');
    expect(document.getElementById('arena-stat-choices').textContent)
      .toMatch(/1.*\+1.*2.*\+1.*3.*\+1.*4.*\+1/s);

    expect(view.showStatResult({
      playerName: '@luna',
      monster: { name: 'Selene', level: 7 },
      stat: 'might',
      remainingUnspentPoints: 1
    })).toBe(true);
    expect(document.getElementById('arena-stat-title').textContent).toContain('@luna');
    expect(document.getElementById('arena-stat-title').textContent).toContain('Selene');
  });

  test('clears stale reconnect arena and reports the full battle-active lifecycle', async () => {
    mountArena();
    const battleStates = [];
    const view = ArenaView.createArenaView({
      document,
      onBattleStateChange: state => battleStates.push(state),
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applySnapshot({
      battle: {
        matches: [{
          matchId: 'reconnect-active',
          state: 'action',
          roundNumber: 3,
          actionDeadlineMs: 8_000,
          fighters: [
            { slot: 1, name: 'Selene', hp: 20, maxHp: 30 },
            { slot: 2, name: 'Ripple', hp: 18, maxHp: 30 }
          ]
        }]
      }
    });
    expect(document.getElementById('battle').classList).toContain('visible');
    expect(document.getElementById('streammonsters-overlay')?.dataset.battleActive)
      .not.toBe('false');

    expect(view.applySnapshot({ battle: { matches: [] } })).toBeNull();
    expect(document.getElementById('battle').classList).not.toContain('visible');
    expect(view.state().matchId).toBeNull();
    expect(battleStates.at(-1)).toEqual(expect.objectContaining({ active: false }));

    view.applyMatch({
      matchId: 'terminal',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Selene', hp: 20, maxHp: 30 },
        { slot: 2, name: 'Ripple', hp: 0, maxHp: 30 }
      ]
    });
    await view.playEvent('battle_completed', {
      eventId: 'terminal:event:done',
      winnerSlot: 1,
      winner: { viewerName: '@luna', name: 'Selene' },
      terminalReason: 'knockout',
      knockout: { round: 4, remainingHp: 20, maxHp: 30 }
    });
    expect(battleStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ active: true }),
      expect.objectContaining({ active: false })
    ]));
  });

  test('restores sealed choice facts and the active stat owner from a cold snapshot', () => {
    mountArena();
    const view = ArenaView.createArenaView({ document });

    view.applySnapshot({
      battle: {
        statPrompt: {
          promptId: 'cold-stat',
          deadlineMs: 12_000,
          playerName: '@luna',
          monster: { name: 'Selene', level: 7 },
          level: 7,
          remainingUnspentPoints: 2,
          choices: ['1', '2', '3', '4']
        },
        matches: [{
          matchId: 'cold-lock',
          state: 'action',
          roundNumber: 2,
          actionDeadlineMs: 12_000,
          choiceLocks: [{
            round: 2,
            slot: 1,
            locked: true,
            source: 'viewer',
            deadlineMs: 12_000
          }],
          fighters: [
            { slot: 1, name: 'Ashfang', viewerName: '@ash', hp: 20, maxHp: 30 },
            { slot: 2, name: 'Selene', viewerName: '@luna', hp: 22, maxHp: 30 }
          ]
        }]
      }
    });

    const sealed = document.querySelector('#arena-fighter-1');
    expect(sealed.classList).toContain('choice-locked');
    expect(sealed.dataset.choice).toBeUndefined();
    expect(document.getElementById('arena-stat-title').textContent).toContain('@luna');
    expect(document.getElementById('arena-stat-title').textContent).toContain('Selene');
  });

  test('restores jointly revealed choices from a cinematic reconnect snapshot', () => {
    mountArena();
    const view = ArenaView.createArenaView({ document });

    view.applySnapshot({
      battle: {
        matches: [{
          matchId: 'cold-reveal',
          state: 'action',
          roundNumber: 2,
          actionDeadlineMs: null,
          revealedChoices: {
            round: 1,
            choices: [
              { slot: 1, choice: 'A', source: 'viewer' },
              { slot: 2, choice: 'B', source: 'timeout' }
            ]
          },
          fighters: [
            { slot: 1, name: 'Ashfang', hp: 20, maxHp: 30 },
            { slot: 2, name: 'Selene', hp: 22, maxHp: 30 }
          ]
        }]
      }
    });

    expect(document.querySelector('#arena-fighter-1').dataset.choice).toBe('A');
    expect(document.querySelector('#arena-fighter-2').dataset.choice).toBe('B');
  });

  test('keeps sealed locks choice-free until the ordered reveal event arrives', () => {
    mountArena();
    const view = ArenaView.createArenaView({ document });
    view.applyMatch({
      matchId: 'match-sealed',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember' },
        { slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide' }
      ]
    });

    view.lockChoice({ decision: { slot: 1, locked: true, source: 'viewer' } });
    expect(document.querySelector('#arena-fighter-1').dataset.choice).toBeUndefined();
    expect(view.revealChoices({
      choices: [
        { slot: 1, choice: 'A', source: 'viewer' },
        { slot: 2, choice: 'C', source: 'timeout' }
      ]
    })).toBe(true);
    expect(document.querySelector('#arena-fighter-1').dataset.choice).toBe('A');
    expect(document.querySelector('#arena-fighter-2').dataset.choice).toBe('C');
  });

  test('does not open A/B/C from a reconnect snapshot while cinematic has no deadline', () => {
    mountArena();
    const view = ArenaView.createArenaView({ document });
    view.applySnapshot({
      battle: {
        matches: [{
          matchId: 'match-cinematic',
          state: 'action',
          roundNumber: 2,
          actionDeadlineMs: null,
          chargeWindow: {
            openedAtMs: 0,
            deadlineMs: 0,
            passivePerSecond: 5,
            pauseReason: 'cinematic'
          },
          fighters: [
            { slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember' },
            { slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide' }
          ]
        }]
      }
    });

    expect(document.querySelector('#arena-skill-prompt').textContent).toBe('');
    expect(view.state().deadlineMs).toBe(0);
  });

  test.each([
    ['one choice', [{ slot: 1, choice: 'A', source: 'viewer' }]],
    ['duplicate slots', [
      { slot: 1, choice: 'A', source: 'viewer' },
      { slot: 1, choice: 'B', source: 'timeout' }
    ]],
    ['invalid choice', [
      { slot: 1, choice: 'A', source: 'viewer' },
      { slot: 2, choice: 'Z', source: 'timeout' }
    ]]
  ])('does not partially reveal a payload with %s', (_label, choices) => {
    mountArena();
    const view = ArenaView.createArenaView({ document });
    view.applyMatch({
      matchId: 'match-malformed',
      state: 'action',
      fighters: [
        { slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember' },
        { slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide' }
      ]
    });
    view.lockChoice({ decision: { slot: 1, locked: true, source: 'viewer' } });
    view.lockChoice({ decision: { slot: 2, locked: true, source: 'timeout' } });

    expect(view.revealChoices({ choices })).toBe(false);
    for (const slot of [1, 2]) {
      const fighter = document.querySelector(`#arena-fighter-${slot}`);
      expect(fighter.dataset.choice).toBeUndefined();
      expect(fighter.classList.contains('choice-revealed')).toBe(false);
      expect(document.querySelectorAll(
        `[data-skill-deck="${slot}"] [data-skill].selected`
      )).toHaveLength(0);
    }
  });

  test('renders localized fighter skill decks and advances special charge from server time', () => {
    mountArena();
    let currentTime = 1_000;
    const clock = {
      now: () => currentTime,
      advance: milliseconds => {
        currentTime += milliseconds;
      }
    };
    const view = ArenaView.createArenaView({
      document,
      clock,
      labels: {
        skillNameAshfangAStage1: 'Ashfang Flame Fang',
        skillEffectAshfangAStage1: 'A fast ember strike.',
        skillNameAshfangBStage1: 'Ashfang Cinder Guard',
        skillEffectAshfangBStage1: 'A bright ember shield.',
        skillNameAshfangCStage1: 'Ashfang Inferno',
        skillEffectAshfangCStage1: 'A fully charged blaze.',
        skillNameRippleAStage1: 'Ripple Tide Cut',
        skillEffectRippleAStage1: 'A flowing tide strike.',
        skillNameRippleBStage1: 'Ripple Mist Guard',
        skillEffectRippleBStage1: 'A cooling mist shield.',
        skillNameRippleCStage1: 'Ripple Renewal',
        skillEffectRippleCStage1: 'A fully charged wave.',
        collapseDefenseLocked: 'Defense locks from round 11.'
      }
    });
    const skills = template => ['A', 'B', 'C'].map(choice => ({
      choice,
      icon: choice === 'A' ? '⚔️' : choice === 'B' ? '🛡️' : '✨',
      name: `${template} fallback ${choice}`,
      nameKey: `skillName${template}${choice}Stage1`,
      shortText: `${template} fallback copy ${choice}`,
      shortTextKey: `skillEffect${template}${choice}Stage1`,
      available: choice === 'A',
      ...(choice === 'B' ? {
        unavailableReason: 'arena_collapse_defense_locked'
      } : {}),
      ...(choice === 'C' ? { chargeRequired: 100, readyAtMs: 2_000 } : {})
    }));

    view.openChoice({
      matchId: 'match-skills',
      round: 1,
      deadlineMs: 7_000,
      chargeWindow: {
        openedAtMs: 1_000,
        deadlineMs: 7_000,
        passivePerSecond: 5
      },
      fighters: [
        { slot: 1, name: 'Ashfang', charge: 95, skills: skills('Ashfang') },
        { slot: 2, name: 'Ripple', charge: 95, skills: skills('Ripple') }
      ]
    });

    expect(document.querySelector('[data-slot="1"] [data-skill="A"] .skill-name').textContent)
      .toContain('Ashfang');
    expect(document.querySelector('[data-slot="1"] [data-skill="A"] .skill-copy').textContent)
      .toBe('A fast ember strike.');
    expect(document.querySelector('[data-slot="1"] [data-skill="B"] .skill-copy').textContent)
      .toBe('Defense locks from round 11.');
    expect(document.querySelector('[data-slot="1"] [data-skill="B"]').classList)
      .toContain('unavailable');
    expect(document.querySelector('[data-slot="1"] [data-skill="C"]').classList)
      .toContain('charging');
    expect(document.querySelector('[data-slot="1"] [data-skill="C"] .skill-charge').textContent)
      .toContain('95%');

    clock.advance(1_000);
    view.renderCountdown();
    expect(document.querySelector('[data-slot="1"] [data-skill="C"] .skill-charge').textContent)
      .toContain('100%');
    expect(document.querySelector('[data-slot="1"] [data-skill="C"]').classList)
      .toContain('ready');
  });

  test('keeps projected Special charge capped during a longer bilingual choice window', () => {
    mountArena();
    let currentTime = 8_000;
    const view = ArenaView.createArenaView({
      document,
      clock: { now: () => currentTime }
    });
    const special = {
      choice: 'C',
      name: 'Inferno',
      chargeRequired: 100,
      available: false
    };

    view.openChoice({
      matchId: 'match-bilingual-charge-cap',
      round: 1,
      deadlineMs: 11_000,
      chargeWindow: {
        openedAtMs: 1_000,
        deadlineMs: 11_000,
        passivePerSecond: 5,
        maxGain: 30
      },
      fighters: [
        { slot: 1, name: 'Ashfang', charge: 60, skills: [special] },
        { slot: 2, name: 'Ripple', charge: 60, skills: [special] }
      ]
    });

    for (const elapsedSeconds of [7, 8, 9, 10]) {
      currentTime = 1_000 + (elapsedSeconds * 1_000);
      view.renderCountdown();
      const specialCard = document.querySelector('[data-slot="1"] [data-skill="C"]');
      expect(specialCard.querySelector('.skill-charge').textContent)
        .toMatch(/^90%.*10 charge missing$/);
      expect(specialCard.classList).toContain('charging');
      expect(specialCard.classList).not.toContain('ready');
    }
  });

  test('shows exact missing Special charge at the 75 90 and 100 anticipation milestones', () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { now: () => 1_000 },
      labels: { specialMissing: '{amount} charge missing' }
    });
    const special = {
      choice: 'C',
      name: 'Inferno',
      chargeRequired: 100,
      available: false
    };
    const openAt = charge => view.openChoice({
      matchId: 'match-special-milestones',
      round: 1,
      deadlineMs: 7_000,
      chargeWindow: {
        openedAtMs: 1_000,
        deadlineMs: 7_000,
        passivePerSecond: 0
      },
      fighters: [
        { slot: 1, name: 'Ashfang', charge, skills: [special] },
        { slot: 2, name: 'Ripple', charge: 0, skills: [special] }
      ]
    });
    const specialCard = document.querySelector('[data-slot="1"] [data-skill="C"]');

    openAt(74.5);
    expect(specialCard.classList).not.toContain('anticipation-75');
    expect(specialCard.querySelector('.skill-charge').textContent)
      .toMatch(/^74%.*26 charge missing$/);

    openAt(75);
    expect(specialCard.classList).toContain('anticipation-75');
    expect(specialCard.querySelector('.skill-charge').textContent)
      .toMatch(/^75%.*25 charge missing$/);

    openAt(89.5);
    expect(specialCard.classList).toContain('anticipation-75');
    expect(specialCard.classList).not.toContain('anticipation-90');
    expect(specialCard.querySelector('.skill-charge').textContent)
      .toMatch(/^89%.*11 charge missing$/);

    openAt(90);
    expect(specialCard.classList).not.toContain('anticipation-75');
    expect(specialCard.classList).toContain('anticipation-90');
    expect(specialCard.querySelector('.skill-charge').textContent)
      .toMatch(/^90%.*10 charge missing$/);

    openAt(99.5);
    expect(specialCard.classList).toContain('anticipation-90');
    expect(specialCard.classList).not.toContain('anticipation-100');
    expect(specialCard.classList).not.toContain('ready');
    expect(specialCard.querySelector('.skill-charge').textContent)
      .toMatch(/^99%.*1 charge missing$/);

    openAt(100);
    expect(specialCard.classList).not.toContain('anticipation-90');
    expect(specialCard.classList).toContain('anticipation-100');
    expect(specialCard.classList).toContain('ready');
    expect(specialCard.querySelector('.skill-charge').textContent)
      .toMatch(/^100%.*READY$/);
  });

  test('shows a sealed lock without selecting a skill until both choices are revealed', () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      labels: {
        sealedWaiting: '{name} sealed - waiting for opponent',
        choicesSealed: 'Both choices sealed - reveal now'
      }
    });
    view.openChoice({
      matchId: 'match-sealed-board',
      round: 1,
      fighters: [
        {
          slot: 1,
          name: 'Ashfang',
          viewerName: '@ember',
          skills: [
            { choice: 'A', name: 'SECRET_SLASH' },
            { choice: 'B', name: 'SECRET_GUARD' },
            { choice: 'C', name: 'SECRET_BURST' }
          ]
        },
        {
          slot: 2,
          name: 'Ripple',
          viewerName: '@tide',
          skills: [
            { choice: 'A', name: 'TIDE_SLASH' },
            { choice: 'B', name: 'TIDE_GUARD' },
            { choice: 'C', name: 'TIDE_BURST' }
          ]
        }
      ]
    });

    const firstDeck = document.querySelector('[data-skill-deck="1"]');
    const deckTextBeforeLock = firstDeck.textContent;
    view.lockChoice({ decision: { slot: 1, choice: 'B', locked: true } });
    const firstFighter = document.querySelector('#arena-fighter-1');
    expect(firstFighter.dataset.choice).toBeUndefined();
    expect(document.querySelector('[data-slot="1"] [data-skill="B"]').classList)
      .not.toContain('selected');
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .toMatch(/@ember.*sealed.*waiting/i);
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .not.toContain('SECRET_GUARD');
    expect(firstDeck.textContent).toBe(deckTextBeforeLock);
    const choiceSpecificSideChannels = [
      ...[...firstFighter.attributes].map(attribute => (
        `${attribute.name}=${attribute.value}`
      )),
      ...[...document.querySelector('#arena-skill-prompt').attributes].map(attribute => (
        `${attribute.name}=${attribute.value}`
      )),
      document.querySelector('#arena-skill-prompt').textContent
    ].join(' | ');
    expect(choiceSpecificSideChannels).not.toContain('SECRET_GUARD');
    expect(choiceSpecificSideChannels).not.toMatch(/(?:^|[=\s])B(?:$|[\s|])/);
    expect(document.querySelector('[data-choice="B"]')).toBeNull();
    expect([...document.querySelectorAll('[aria-label]')]
      .map(element => element.getAttribute('aria-label')).join(' | '))
      .not.toContain('SECRET_GUARD');

    view.lockChoice({ decision: { slot: 2, choice: 'C', locked: true } });
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .toMatch(/both choices sealed.*reveal now/i);

    view.revealChoices({
      choices: [
        { slot: 1, choice: 'B', source: 'viewer' },
        { slot: 2, choice: 'C', source: 'timeout' }
      ]
    });
    expect([
      document.querySelector('#arena-fighter-1').dataset.choice,
      document.querySelector('#arena-fighter-2').dataset.choice
    ]).toEqual(['B', 'C']);
    expect(document.querySelector('[data-slot="1"] [data-skill="B"]').classList)
      .toContain('selected');
    expect(document.querySelector('[data-slot="2"] [data-skill="C"]').classList)
      .toContain('selected');
  });

  test('shows NEXT with every contracted action while availability stays per fighter', () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      labels: { next: 'NEXT' }
    });
    const skills = specialAvailable => [
      { choice: 'A', name: 'Strike', available: true },
      { choice: 'B', name: 'Guard', available: true },
      { choice: 'C', name: 'Inferno', available: specialAvailable }
    ];

    view.openChoice({
      matchId: 'match-next-actions',
      round: 1,
      choices: ['A', 'B', 'C'],
      fighters: [
        { slot: 1, name: 'Ashfang', skills: skills(false) },
        { slot: 2, name: 'Ripple', skills: skills(false) }
      ]
    });
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .toMatch(/^NEXT.*\bA\b.*\bB\b/);
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .toMatch(/\bC\b/);

    view.openChoice({
      matchId: 'match-next-actions',
      round: 2,
      choices: ['A', 'C'],
      fighters: [
        { slot: 1, name: 'Ashfang', skills: skills(true) },
        { slot: 2, name: 'Ripple', skills: skills(true) }
      ]
    });
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .toMatch(/^NEXT.*\bA\b.*\bC\b/);
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .not.toMatch(/\bB\b/);

    view.openChoice({
      matchId: 'match-next-actions',
      round: 3,
      choices: ['A', 'C'],
      fighters: [
        { slot: 1, name: 'Ashfang', skills: skills(true) },
        { slot: 2, name: 'Ripple', skills: skills(false) }
      ]
    });
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .toMatch(/^NEXT.*\bA\b.*\bC\b/);
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .not.toMatch(/\bB\b/);
  });

  test('updates the deadline countdown from the durable timestamp and clears it at terminal state', async () => {
    mountArena();
    let currentTime = 1_000;
    const scheduled = [];
    const cleared = [];
    const view = ArenaView.createArenaView({
      document,
      clock: {
        wait: async () => {},
        now: () => currentTime,
        setInterval: callback => {
          scheduled.push(callback);
          return scheduled.length;
        },
        clearInterval: handle => cleared.push(handle)
      }
    });
    view.openChoice({
      matchId: 'match-countdown',
      round: 1,
      deadlineMs: 9_000,
      choices: ['A', 'B', 'C']
    });
    expect(document.querySelector('#arena-countdown').textContent).toBe('8s');
    expect(scheduled).toHaveLength(1);

    currentTime = 5_001;
    scheduled[0]();
    expect(document.querySelector('#arena-countdown').textContent).toBe('4s');
    await view.complete({ winnerSlot: 1 });
    expect(document.querySelector('#arena-countdown').textContent).toBe('');
    expect(cleared).toContain(1);
  });

  test('localizes every director-owned arena label instead of leaking German into other locales', async () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      labels: {
        monster: 'Créature {slot}',
        round: 'Manche {round}',
        roster: 'Choix du monstre',
        evaded: 'ESQUIVÉ',
        knockout: 'K.-O.',
        winner: '{name} gagne !',
        battleEnded: 'Combat terminé',
        cancelledRoster: 'Combat annulé · sélection incomplète',
        cancelled: 'Combat annulé',
        shield: 'Bouclier',
        special: 'Spécial',
        skillCopyLunarAttack: 'Une frappe lunaire rend un peu de santé.'
      },
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'localized',
      state: 'roster',
      fighters: [
        { slot: 1, name: 'Selene', templateId: 'selene', element: 'Lunar', hp: 40, maxHp: 40 },
        { slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide', hp: 40, maxHp: 40 }
      ]
    });
    expect(document.querySelector('#arena-round').textContent).toBe('Choix du monstre');
    expect(document.querySelector('#arena-shield-label-1').textContent).toBe('Bouclier');
    expect(document.querySelector('#arena-special-label-2').textContent).toBe('Spécial');

    view.openChoice({ matchId: 'localized', round: 2, choices: ['A', 'B'] });
    expect(document.querySelector('#arena-round').textContent).toBe('Manche 2');
    await view.playAction({
      matchId: 'localized',
      eventId: 'localized-action',
      eventSequence: 1,
      round: 2,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'A',
      skill: {
        name: 'Lueur lunaire',
        type: 'attack',
        element: 'Lunar',
        shortText: 'English fallback must not be shown.',
        shortTextKey: 'skillCopyLunarAttack'
      },
      hits: [{ index: 1, hpDamage: 0, evaded: true }]
    });
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .toContain('Une frappe lunaire rend un peu de santé.');
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .not.toContain('English fallback');
    expect(document.querySelector('#arena-impact').textContent).toBe('ESQUIVÉ');
    await view.complete({ winnerSlot: 1 });
    expect(document.querySelector('#arena-feed').textContent).toBe('Selene gagne !');
  });

  test('does not let a slow renderer or decoder stretch the director timeline', async () => {
    mountArena();
    const never = new Promise(() => {});
    const view = ArenaView.createArenaView({
      document,
      effects: { play: jest.fn(() => never) },
      audio: { play: jest.fn(() => never) },
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'match-nonblocking',
      fighters: [
        { slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember', hp: 40, maxHp: 40 },
        { slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide', hp: 40, maxHp: 40 }
      ]
    });
    const playback = view.playAction({
      matchId: 'match-nonblocking',
      eventId: 'match-nonblocking:event:1',
      eventSequence: 1,
      round: 1,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'A',
      skill: { name: 'Crystal Fang', type: 'attack', element: 'Ember', vfxKey: 'ashfang:attack' },
      hits: [{ index: 1, hpDamage: 4, shieldAbsorbed: 0, evaded: false }],
      actorState: { hp: 40, maxHp: 40, shield: 0, charge: 25 },
      targetState: { hp: 36, maxHp: 40, shield: 0, charge: 25 }
    });
    const outcome = await Promise.race([
      playback.then(() => 'completed'),
      new Promise(resolve => setImmediate(() => resolve('blocked')))
    ]);
    expect(outcome).toBe('completed');
  });

  test('never carries fighters or action dedupe state into the next durable match', async () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { wait: async () => {}, now: () => 1_000 }
    });
    view.applyMatch({
      matchId: 'match-old',
      fighters: [
        { slot: 1, name: 'Ashfang', templateId: 'ashfang', element: 'Ember', hp: 40, maxHp: 40 },
        { slot: 2, name: 'Ripple', templateId: 'ripple', element: 'Tide', hp: 40, maxHp: 40 }
      ]
    });
    expect(document.querySelector('#arena-name-1').textContent).toBe('Ashfang');
    await view.playAction({
      matchId: 'match-old',
      eventId: 'shared-event',
      eventSequence: 1,
      round: 1,
      actorSlot: 1,
      targetSlot: 2,
      skill: { name: 'Old attack', type: 'attack' },
      hits: []
    });

    view.applyMatch({ matchId: 'match-new', state: 'roster', fighters: [] });
    expect(document.querySelector('#arena-name-1').textContent).toBe('Monster 1');
    expect(document.querySelector('#arena-name-2').textContent).toBe('Monster 2');
    expect(document.querySelector('#arena-image-1').getAttribute('src')).toBeNull();
    expect(await view.playAction({
      matchId: 'match-new',
      eventId: 'shared-event',
      eventSequence: 1,
      round: 1,
      actorSlot: 1,
      targetSlot: 2,
      skill: { name: 'New attack', type: 'attack' },
      hits: []
    })).toBe(true);
  });

  test.each([
    [477, 829],
    [1080, 1920]
  ])('keeps chat detail above the complete egg shelf lane at %sx%s', (_width, height) => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(html);
    const rules = [];
    const collect = ruleList => {
      for (const rule of [...ruleList]) {
        if (rule.cssRules?.length) collect(rule.cssRules);
        else rules.push(rule);
      }
    };
    for (const sheet of [...dom.window.document.styleSheets]) collect(sheet.cssRules);
    const detailBottoms = rules
      .filter(rule => rule.selectorText === '#chat-detail')
      .map(rule => rule.style.getPropertyValue('bottom'))
      .filter(Boolean);

    expect(detailBottoms).not.toContain('28%');
    expect(detailBottoms).toContain(
      'calc(26% + var(--egg-shelf-lane-height))'
    );
    const shelfTop = (height * 0.74) - 112;
    const detailBottomEdge = (height * 0.74) - 124;
    expect(detailBottomEdge).toBeLessThanOrEqual(shelfTop);
  });

  test('uses one shared portrait choice surface with readable paired A B C skills', () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(html);
    const choiceSurface = dom.window.document.getElementById(
      'arena-choice-surface'
    );

    expect(choiceSurface).not.toBeNull();
    expect(choiceSurface.querySelectorAll('[data-skill-deck]')).toHaveLength(2);
    expect(choiceSurface.querySelectorAll('[data-skill="A"]')).toHaveLength(2);
    expect(choiceSurface.querySelectorAll('[data-skill="B"]')).toHaveLength(2);
    expect(choiceSurface.querySelectorAll('[data-skill="C"]')).toHaveLength(2);
    expect(choiceSurface.querySelectorAll('[data-choice-owner]')).toHaveLength(2);
    expect(html).toMatch(
      /@media \(orientation: portrait\)[\s\S]*#arena-choice-surface[\s\S]*font-size:clamp\(16px/
    );
    expect(html).toMatch(
      /@media \(orientation: portrait\)[\s\S]*#arena-choice-surface[\s\S]*font-size:clamp\(14px/
    );
    expect(html).not.toMatch(
      /@media \(orientation: portrait\)[\s\S]*\.skill-copy\s*\{[^}]*clamp\(10px/
    );
  });

  test('ships a short portrait battle layout with non-overlapping HUD action deck and feed bands', () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(html);
    const rules = [];
    const collect = ruleList => {
      for (const rule of [...ruleList]) {
        if (rule.cssRules?.length) collect(rule.cssRules);
        else rules.push(rule);
      }
    };
    for (const sheet of [...dom.window.document.styleSheets]) collect(sheet.cssRules);
    const compactMedia = rules.find(rule => (
      rule.parentRule?.conditionText?.includes('max-height: 900px') &&
      rule.selectorText === '#arena-action-card'
    ))?.parentRule;
    const portraitChoiceFeed = rules.find(rule => (
      rule.parentRule?.conditionText === '(orientation: portrait)' &&
      rule.selectorText === '#battle[data-phase="choice"] #arena-feed'
    ));

    expect(compactMedia).toBeDefined();
    expect(portraitChoiceFeed?.style.getPropertyValue('display')).toBe('none');
    const styles = new Map([...compactMedia.cssRules]
      .filter(rule => rule.selectorText)
      .map(rule => [rule.selectorText, rule.style]));
    expect(styles.get('#arena-action-card').getPropertyValue('top')).toBe('20%');
    expect(styles.get('#arena-action-card').getPropertyValue('min-height')).toBe('0px');
    expect(styles.get('#arena-action-card').getPropertyValue('max-height')).toBe('');
    expect(styles.get('#battle[data-phase="action"] #arena-lead').getPropertyValue('top'))
      .toBe('12.5%');
    expect(styles.get('#battle[data-phase="action"] #arena-action-card').getPropertyValue('top'))
      .toBe('14.5%');
    expect(styles.get('#battle[data-phase="action"] #arena-action-card').getPropertyValue('min-height'))
      .toBe('108px');
    expect(styles.get('#battle[data-phase="action"] .arena-fighter').getPropertyValue('top'))
      .toBe('42%');
    expect(styles.get('#battle[data-phase="action"] .arena-fighter').getPropertyValue('height'))
      .toBe('56%');
    expect(styles.get('#battle[data-phase="action"] .arena-fighter').getPropertyValue('bottom'))
      .toBe('auto');
    expect(styles.get('#battle[data-phase="choice"] #arena-feed').getPropertyValue('display'))
      .toBe('none');
    expect(styles.get('#arena-choice-surface').getPropertyValue('bottom')).toBe('1%');
    expect(styles.get('#battle-effects-canvas').getPropertyValue('z-index')).toBe('3');
    expect(styles.get('.arena-skill-card .skill-copy').getPropertyValue('text-overflow'))
      .not.toBe('ellipsis');
  });

  test('keeps portrait battle phases focused on the next viewer decision', () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(html);
    const rules = [];
    const collect = ruleList => {
      for (const rule of [...ruleList]) {
        if (rule.cssRules?.length) collect(rule.cssRules);
        else rules.push(rule);
      }
    };
    for (const sheet of [...dom.window.document.styleSheets]) collect(sheet.cssRules);
    const portrait = new Map(rules
      .filter(rule => rule.parentRule?.conditionText === '(orientation: portrait)')
      .filter(rule => rule.selectorText)
      .map(rule => [rule.selectorText, rule.style]));

    expect(portrait.get('#battle[data-phase="choice"] #arena-skill-prompt:not([data-choice-feedback="true"])')
      .getPropertyValue('display')).toBe('none');
    expect(portrait.get('#battle[data-phase="choice"] #arena-feed')
      .getPropertyValue('display')).toBe('none');
    expect(portrait.get('#battle[data-phase="action"] #arena-feed')
      .getPropertyValue('display')).toBe('none');
    expect(portrait.get('#battle[data-phase="completed"] #arena-feed')
      .getPropertyValue('display')).toBe('none');
    expect(portrait.get('#arena-choice-surface .arena-skill-card .skill-copy')
      .getPropertyValue('display')).toBe('none');
    expect(portrait.get('#battle[data-phase="action"] #arena-action-copy')
      .getPropertyValue('display')).toBe('none');
    const actionCard = rules.find(rule => (
      rule.parentRule?.conditionText === '(orientation: portrait)' &&
      rule.selectorText === '#battle[data-phase="action"] #arena-action-card' &&
      rule.style.cssText.includes('grid-template-areas')
    ))?.style;
    expect(actionCard).toBeDefined();
    expect(actionCard.cssText).toContain(
      'grid-template-areas: "player key skill metrics"'
    );
    expect(actionCard.cssText).toContain('grid-template-rows: minmax(0,1fr)');
    const boundedActionFields = rules.find(rule => (
      rule.parentRule?.conditionText === '(orientation: portrait)' &&
      rule.selectorText?.includes('#battle[data-phase="action"] #arena-action-player') &&
      rule.selectorText?.includes('#battle[data-phase="action"] #arena-action-skill') &&
      rule.selectorText?.includes('#battle[data-phase="action"] #arena-action-metrics')
    ))?.style;
    expect(boundedActionFields).toBeDefined();
    expect(boundedActionFields.getPropertyValue('overflow')).toBe('hidden');
    expect(boundedActionFields.getPropertyValue('text-overflow')).toBe('ellipsis');
    expect(boundedActionFields.getPropertyValue('white-space')).toBe('nowrap');
    expect(portrait.get('#battle[data-phase="action"] #arena-action-metrics [data-action-metric]:nth-child(n+2)')
      .getPropertyValue('display')).toBe('none');
    expect(portrait.get('#battle[data-phase="completed"] #arena-result-report')
      .getPropertyValue('display')).toBe('none');
  });

  test('assigns both portrait arena variants to the approved bounded phase bands', () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(html);
    const rules = [];
    const collect = ruleList => {
      for (const rule of [...ruleList]) {
        if (rule.cssRules?.length) collect(rule.cssRules);
        else rules.push(rule);
      }
    };
    for (const sheet of [...dom.window.document.styleSheets]) collect(sheet.cssRules);
    const variantRule = variant => rules.find(rule => (
      rule.parentRule?.conditionText === '(orientation: portrait)' &&
      rule.selectorText?.includes(
        `#portrait-arena[data-arena-variant="${variant}"]`
      ) &&
      rule.style.getPropertyValue('--arena-status-top')
    ));
    const fighterRule = variant => rules.find(rule => (
      rule.parentRule?.conditionText === '(orientation: portrait)' &&
      rule.selectorText?.includes(
        `#portrait-arena[data-arena-variant="${variant}"] .arena-fighter`
      ) &&
      rule.style.getPropertyValue('grid-template-rows')
    ));

    for (const variant of ['split-arena', 'classic']) {
      const root = variantRule(variant)?.style;
      expect(root?.getPropertyValue('--arena-status-top')).toBe('4%');
      expect(root?.getPropertyValue('--arena-status-bottom')).toBe('13%');
      expect(root?.getPropertyValue('--arena-hud-top')).toBe('15%');
      expect(root?.getPropertyValue('--arena-hud-bottom')).toBe('28%');
      expect(root?.getPropertyValue('--arena-fighter-top')).toBe('27%');
      expect(root?.getPropertyValue('--arena-fighter-bottom')).toBe('78%');
      expect(root?.getPropertyValue('--arena-rail-top')).toBe('79%');
      expect(root?.getPropertyValue('--arena-rail-bottom')).toBe('97%');
      expect(fighterRule(variant)?.style.getPropertyValue('grid-template-rows'))
        .toContain('[fighter-start]');
    }
  });

  test('limits portrait choices action and completed results while preserving landscape data', () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(html);
    const rules = [];
    const collect = ruleList => {
      for (const rule of [...ruleList]) {
        if (rule.cssRules?.length) collect(rule.cssRules);
        else rules.push(rule);
      }
    };
    for (const sheet of [...dom.window.document.styleSheets]) collect(sheet.cssRules);
    const portraitRule = selectorFragment => rules.find(rule => (
      rule.parentRule?.conditionText === '(orientation: portrait)' &&
      rule.selectorText?.includes(selectorFragment)
    ));
    const splitDeck = portraitRule(
      '#portrait-arena[data-arena-variant="split-arena"] .arena-skill-deck'
    );
    const hiddenChoiceCopy = portraitRule(
      '#portrait-arena[data-arena-variant="split-arena"] .arena-choice-owner'
    );
    const compactMetric = portraitRule('#arena-action-compact-metric');
    const fullMetrics = portraitRule(
      '#portrait-arena #battle[data-phase="action"] #arena-action-metrics'
    );
    const hiddenActionCopy = portraitRule(
      '#portrait-arena #battle[data-phase="action"] #arena-action-player'
    );
    const compactRow = portraitRule(
      '#portrait-arena[data-arena-variant="split-arena"] ' +
      '#battle[data-phase="action"] #arena-action-card'
    );
    const hiddenResult = portraitRule(
      '#battle[data-phase="completed"] .arena-fighter'
    );
    const compactResult = portraitRule(
      '#portrait-arena #battle[data-phase="completed"] #arena-result-compact-summary'
    );
    const hiddenEmptyCountdown = portraitRule(
      '#portrait-arena[data-arena-variant="split-arena"] ' +
      '#battle[data-phase="action"] #arena-countdown:empty'
    );
    const baseCompactResult = rules.find(rule => (
      rule.selectorText === '#arena-result-compact-summary' &&
      !rule.parentRule
    ));

    expect(dom.window.document.getElementById('arena-action-compact-metric'))
      .not.toBeNull();
    expect(dom.window.document.getElementById('arena-result-compact-summary'))
      .not.toBeNull();
    expect(splitDeck?.style.getPropertyValue('grid-template-columns'))
      .toBe('repeat(3,minmax(0,1fr))');
    expect(splitDeck?.style.getPropertyValue('grid-template-rows'))
      .toBe('minmax(0,1fr)');
    expect(hiddenChoiceCopy?.style.getPropertyValue('display')).toBe('none');
    expect(compactMetric?.style.getPropertyValue('display')).toBe('block');
    expect(compactMetric?.style.getPropertyValue('white-space')).toBe('nowrap');
    expect(fullMetrics?.style.getPropertyValue('display')).toBe('none');
    expect(hiddenActionCopy?.style.getPropertyValue('display')).toBe('none');
    expect(compactRow?.style.getPropertyValue('grid-template-areas'))
      .toBe('"key skill compact"');
    expect(compactRow?.style.getPropertyValue('white-space')).toBe('nowrap');
    expect(hiddenResult?.style.getPropertyValue('display')).toBe('none');
    expect(baseCompactResult?.style.getPropertyValue('display')).toBe('none');
    expect(compactResult?.style.getPropertyValue('display')).toBe('block');
    expect(hiddenEmptyCountdown?.style.getPropertyValue('display')).toBe('none');
    expect(hiddenEmptyCountdown?.selectorText).toContain(
      '#portrait-arena[data-arena-variant="classic"] ' +
      '#battle[data-phase="completed"] #arena-countdown:empty'
    );
    for (const selector of [
      '#battle[data-phase="completed"] #arena-topline',
      '#battle[data-phase="completed"] #arena-action-card',
      '#battle[data-phase="completed"] #arena-choice-surface',
      '#battle[data-phase="completed"] #arena-feed',
      '#battle[data-phase="completed"] #arena-result-ko',
      '#battle[data-phase="completed"] #arena-result-monster',
      '#battle[data-phase="completed"] #arena-result-summary',
      '#battle[data-phase="completed"] #arena-result-ratings',
      '#battle[data-phase="completed"] #arena-result-report',
      '#battle[data-phase="completed"] #arena-result-next'
    ]) {
      expect(portraitRule(`#portrait-arena ${selector}`)?.style.getPropertyValue('display'))
        .toBe('none');
    }
    expect(html).toMatch(
      /#arena-action-metrics\s*\{[^}]*grid-area:metrics;[^}]*font-size:/s
    );
    expect(html).toMatch(
      /#arena-action-copy\s*\{[^}]*grid-area:copy;[^}]*white-space:normal/s
    );
  });

  test('uses the approved bounded motion timings and removes disorienting reduced motion', () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(html);
    const rules = [];
    const collect = ruleList => {
      for (const rule of [...ruleList]) {
        if (rule.cssRules?.length) collect(rule.cssRules);
        else rules.push(rule);
      }
    };
    for (const sheet of [...dom.window.document.styleSheets]) collect(sheet.cssRules);
    const timingRule = rules.find(rule => (
      rule.parentRule?.conditionText === '(orientation: portrait)' &&
      rule.selectorText?.includes(
        '#portrait-arena[data-arena-variant="split-arena"]'
      ) &&
      rule.style.getPropertyValue('--arena-entry-ms')
    ));
    expect(timingRule?.style.getPropertyValue('--arena-entry-ms')).toBe('380ms');
    expect(timingRule?.style.getPropertyValue('--arena-lock-ms')).toBe('180ms');
    expect(timingRule?.style.getPropertyValue('--arena-anticipation-ms')).toBe('120ms');
    expect(timingRule?.style.getPropertyValue('--arena-dash-ms')).toBe('170ms');
    expect(timingRule?.style.getPropertyValue('--arena-hit-stop-ms')).toBe('70ms');
    expect(timingRule?.style.getPropertyValue('--arena-recoil-ms')).toBe('280ms');
    expect(timingRule?.style.getPropertyValue('--arena-result-ms')).toBe('420ms');
    expect(timingRule?.style.getPropertyValue('--arena-result-particles-ms'))
      .toBe('720ms');
    const variantBattle = rules.find(rule => (
      rule.parentRule?.conditionText === '(orientation: portrait)' &&
      rule.selectorText?.includes(
        '#portrait-arena[data-arena-variant="split-arena"] #battle'
      ) &&
      rule.style.getPropertyValue('grid-template-rows')
    ));
    expect(variantBattle?.style.getPropertyValue('transform')).toBe('none');
    const evadeMotion = rules.find(rule => (
      rule.parentRule?.conditionText === '(orientation: portrait)' &&
      rule.selectorText?.includes('.arena-fighter.evaded .arena-sprite-wrap')
    ));
    expect(evadeMotion?.style.getPropertyValue('animation'))
      .toContain('arena-evade var(--arena-recoil-ms)');
    const portraitCamera = rules.find(rule => (
      rule.parentRule?.conditionText === '(orientation: portrait)' &&
      rule.selectorText === '#portrait-arena #battle.camera-impulse'
    ));
    expect(portraitCamera?.style.getPropertyValue('animation')).toBe('none');
    const reduced = rules.filter(rule => (
      rule.parentRule?.conditionText ===
        '(orientation: portrait) and (prefers-reduced-motion: reduce)'
    ));
    expect(reduced.some(rule => (
      rule.selectorText?.includes('.advancing .arena-sprite-wrap') &&
      rule.style.getPropertyValue('transform') === 'none'
    ))).toBe(true);
    expect(reduced.some(rule => (
      rule.selectorText?.includes('#battle.hit-stop .arena-sprite') &&
      rule.style.getPropertyValue('animation-play-state') === 'running'
    ))).toBe(true);
    expect(reduced.some(rule => (
      rule.selectorText?.includes('.choice-locked:not(.choice-revealed)') &&
      rule.style.getPropertyValue('animation') === 'none'
    ))).toBe(true);
    expect(reduced.some(rule => (
      rule.selectorText?.includes('#arena-result.visible::before') &&
      rule.style.getPropertyValue('animation') === 'none'
    ))).toBe(true);
  });

  test('composes visible action-phase lead, action copy, and fighter HUD safe bands in every orientation', () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(html);
    const rules = [];
    const collect = ruleList => {
      for (const rule of [...ruleList]) {
        if (rule.cssRules?.length) collect(rule.cssRules);
        else rules.push(rule);
      }
    };
    for (const sheet of [...dom.window.document.styleSheets]) collect(sheet.cssRules);
    const actionLeadRules = rules.filter(rule => (
      rule.selectorText?.includes('#battle[data-phase="action"] #arena-lead')
    ));
    const mediaStyles = condition => {
      const media = rules.find(rule => rule.parentRule?.conditionText === condition)?.parentRule;
      return new Map([...(media?.cssRules || [])]
        .filter(rule => rule.selectorText)
        .map(rule => [rule.selectorText, rule.style]));
    };
    const expectSafeActionBands = (styles, {
      leadTop,
      fighterTop,
      fighterHeight,
      cardMinHeight,
      battleHeight,
      contentRows,
      rowGap,
      paddingY,
      borderY,
      minimumGap
    }) => {
      const lead = styles.get('#battle[data-phase="action"] #arena-lead');
      const card = styles.get('#battle[data-phase="action"] #arena-action-card');
      const fighters = styles.get('#battle[data-phase="action"] .arena-fighter');

      expect(lead?.getPropertyValue('top')).toBe(leadTop);
      expect(card?.getPropertyValue('top')).toBe('14.5%');
      expect(card?.getPropertyValue('min-height')).toBe(`${cardMinHeight}px`);
      expect(card?.getPropertyValue('max-height')).toBe('');
      expect(card?.getPropertyValue('overflow')).toBe('');
      expect(fighters?.getPropertyValue('top')).toBe(fighterTop);
      expect(fighters?.getPropertyValue('height')).toBe(fighterHeight);
      expect(fighters?.getPropertyValue('bottom')).toBe('auto');

      const intrinsicOuterHeight = contentRows.reduce((total, height) => (
        total + height
      ), 0) +
        (rowGap * (contentRows.length - 1)) +
        (paddingY * 2) +
        (borderY * 2);
      const cardOuterHeight = Math.max(cardMinHeight, intrinsicOuterHeight);
      const cardBottomPx = (battleHeight * 0.145) + cardOuterHeight;
      const fighterHudTopPx = battleHeight * (Number.parseFloat(fighterTop) / 100);
      expect(fighterHudTopPx - cardBottomPx).toBeGreaterThanOrEqual(minimumGap);
    };

    expect(rules.find(rule => rule.selectorText === '*')?.style.getPropertyValue('box-sizing'))
      .toBe('border-box');

    expect(actionLeadRules.some(rule => rule.style.getPropertyValue('opacity') === '0'))
      .toBe(false);
    expect(actionLeadRules.some(rule => (
      rule.style.getPropertyValue('opacity') === '1' &&
      rule.style.getPropertyValue('visibility') === 'visible'
    ))).toBe(true);
    expectSafeActionBands(mediaStyles('(orientation: landscape)'), {
      leadTop: '8.5%',
      fighterTop: '40%',
      fighterHeight: '57%',
      cardMinHeight: 118,
      battleHeight: 1080 * 0.74,
      contentRows: [42, 30, 35],
      rowGap: 5,
      paddingY: 14,
      borderY: 2,
      minimumGap: 50
    });
    expectSafeActionBands(mediaStyles('(orientation: portrait)'), {
      leadTop: '14.5%',
      fighterTop: '31%',
      fighterHeight: '66%',
      cardMinHeight: 130,
      battleHeight: 1920 * 0.74,
      contentRows: [42, 52, 60],
      rowGap: 5,
      paddingY: 14,
      borderY: 2,
      minimumGap: 35
    });
    expectSafeActionBands(mediaStyles('(orientation: portrait) and (max-height: 900px)'), {
      leadTop: '12.5%',
      fighterTop: '42%',
      fighterHeight: '56%',
      cardMinHeight: 108,
      battleHeight: 829 * 0.74,
      contentRows: [28, 60, 32],
      rowGap: 2,
      paddingY: 7,
      borderY: 2,
      minimumGap: 25
    });
  });

  test('updates shelf, meter, and skill-deck accessibility labels with the presentation locale', () => {
    mountArena();
    const shelf = document.createElement('section');
    shelf.id = 'egg-shelf';
    document.body.prepend(shelf);
    const translations = {
      de: {
        eggShelfAria: 'Lebende Eierablage',
        arenaHpAria: '{monster}: Lebenspunkte',
        arenaShieldAria: '{monster}: Schild',
        arenaSpecialAria: '{monster}: Spezialladung',
        arenaSkillDeckAria: '{monster}: Fähigkeiten'
      },
      fr: {
        eggShelfAria: 'Étagère des œufs',
        arenaHpAria: '{monster} : points de vie',
        arenaShieldAria: '{monster} : bouclier',
        arenaSpecialAria: '{monster} : charge spéciale',
        arenaSkillDeckAria: '{monster} : compétences'
      }
    };
    const localize = (key, params, locale) => (
      translations[locale]?.[key] || ''
    ).replace(/\{(\w+)\}/g, (_match, name) => params[name] || '');
    const view = ArenaView.createArenaView({ document, localize });

    view.setLocale('de');
    view.applyMatch({
      matchId: 'aria-match',
      fighters: [
        { slot: 1, name: 'Ashfang', hp: 40, maxHp: 40, skills: [] },
        { slot: 2, name: 'Ripple', hp: 40, maxHp: 40, skills: [] }
      ]
    });
    expect(shelf.getAttribute('aria-label')).toBe('Lebende Eierablage');
    expect(document.getElementById('arena-hp-1').getAttribute('aria-label'))
      .toBe('Ashfang: Lebenspunkte');
    expect(document.querySelector('[data-skill-deck="2"]').getAttribute('aria-label'))
      .toBe('Ripple: Fähigkeiten');

    view.setLocale('fr');
    expect(shelf.getAttribute('aria-label')).toBe('Étagère des œufs');
    expect(document.getElementById('arena-charge-2').getAttribute('aria-label'))
      .toBe('Ripple : charge spéciale');
    expect(document.querySelector('[data-skill-deck="1"]').getAttribute('aria-label'))
      .toBe('Ashfang : compétences');
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'ships complete combat report labels in %s',
    locale => {
      const catalog = JSON.parse(fs.readFileSync(path.join(
        process.cwd(),
        'plugins',
        'streamalchemy',
        'locales',
        `${locale}.json`
      ), 'utf8')).plugins.streamalchemy.ui.monsters;
      for (const key of [
        'arenaCombatReportDecisive',
        'arenaCombatReportDamage',
        'arenaCombatReportDefense',
        'arenaCombatReportHealing',
        'arenaCombatReportSpecials',
        'arenaCombatReportXp',
        'arenaCombatReportElo'
      ]) {
        expect(catalog[key]).toEqual(expect.any(String));
        expect(catalog[key].trim()).not.toBe('');
      }
    }
  );

  test.each([
    ['de', 'STATUS'],
    ['en', 'STATUS'],
    ['es', 'ESTADO'],
    ['fr', 'STATUT']
  ])('localizes the compact status metric in %s', (locale, expected) => {
    const catalog = JSON.parse(fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'locales',
      `${locale}.json`
    ), 'utf8')).plugins.streamalchemy.ui.monsters;
    expect(catalog.arenaStatusMetric).toBe(expected);
  });

  test.each([
    ['de', 'Runde {round} \u00b7 {hp} HP \u00fcbrig'],
    ['en', 'Round {round} \u00b7 {hp} HP left'],
    ['es', 'Ronda {round} \u00b7 {hp} HP restantes'],
    ['fr', 'Manche {round} \u00b7 {hp} HP restants']
  ])('localizes the compact terminal summary in %s', (locale, expected) => {
    const catalog = JSON.parse(fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'locales',
      `${locale}.json`
    ), 'utf8')).plugins.streamalchemy.ui.monsters;

    expect(catalog.arenaCompactResultSummary).toBe(expected);
  });

  test('ships one portrait-first arena surface wired to durable events and persisted audio', () => {
    const html = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(html);
    const scripts = [...dom.window.document.querySelectorAll('script[src]')]
      .map(script => script.getAttribute('src'));

    expect(dom.window.document.querySelectorAll('#battle')).toHaveLength(1);
    expect(dom.window.document.querySelectorAll('[id^="arena-fighter-"]')).toHaveLength(2);
    expect(dom.window.document.querySelectorAll('.arena-skill-deck')).toHaveLength(2);
    expect(dom.window.document.querySelectorAll('.arena-skill-card')).toHaveLength(6);
    expect(dom.window.document.querySelector('#arena-chat-safe-zone')).not.toBeNull();
    expect(dom.window.document.querySelector('#battle-effects-canvas')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-lead')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-action-card')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-action-copy')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-action-metrics')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-action-compact-metric')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-stat-card')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-result-ko')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-result-monster')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-result-summary')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-result-compact-summary')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-result-ratings')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-result-report')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-result-rating')).toBeNull();
    expect(html).toContain('--arena-gameplay-height:74%');
    expect(html).toMatch(/#battle\s*\{[^}]*inset:0 0 26%;[^}]*z-index:50/s);
    expect(html).toMatch(
      /#streammonsters-overlay\[data-battle-active="true"\][\s\S]*#egg-shelf[\s\S]*visibility:hidden/
    );
    expect(html).toMatch(/#battle-effects-canvas\s*\{[^}]*z-index:3/s);
    expect(html).toContain('effectsRenderer.setQuality(rendererQuality)');
    expect(html).toContain('battleEffectsRenderer.setQuality(rendererQuality)');
    expect(html).toMatch(
      /\.arena-sprite\s*\{[^}]*max-width:100%;[^}]*max-height:100%;[^}]*object-fit:contain/s
    );
    expect(html).toMatch(
      /\.arena-skill-card \.skill-copy\s*\{[^}]*overflow:visible;[^}]*white-space:normal/s
    );
    expect(html).toMatch(/#arena-result\s*\{[^}]*min-height:/s);
    expect(html).toMatch(
      /#arena-result-report\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s
    );
    expect(html).toMatch(
      /@media \(orientation: portrait\)[\s\S]*#arena-result\s*\{[^}]*max-height:[^}]*overflow:hidden/s
    );
    expect(html).toMatch(
      /if \(type === 'egg_hatched'\)[\s\S]*?presentation:'hatch',[\s\S]*?duration:12_000/
    );
    expect(html).toMatch(/@media \(orientation: landscape\)\s*\{[^}]*height:65%/s);
    expect(html).toMatch(/@media \(orientation: landscape\)[\s\S]*#arena-feed\s*\{[^}]*top:18%/);
    expect(html).toMatch(
      /@media \(orientation: landscape\)[\s\S]*\.arena-skill-deck\s*\{[^}]*grid-template-columns/s
    );
    expect(html).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.arena-skill-card\.ready/s
    );
    expect(html).toContain('#arena-fighter-1.advancing .arena-sprite-wrap');
    expect(html).toContain('#arena-fighter-2.advancing .arena-sprite-wrap');
    expect(scripts).toEqual(expect.arrayContaining([
      '/plugins/streamalchemy/streammonsters-arena-director.js',
      '/plugins/streamalchemy/streammonsters-audio-engine.js',
      '/plugins/streamalchemy/streammonsters-arena-view.js'
    ]));
    expect(html).toContain('/plugins/streamalchemy/assets/audio/manifest.json');
    expect(html).not.toContain('streammonsters-cues.js');
    expect(html).not.toContain('localStorage');
    for (const event of [
      'streammonsters:battle_match_found',
      'streammonsters:battle_roster_locked',
      'streammonsters:battle_choice_opened',
      'streammonsters:battle_skill_prompt',
      'streammonsters:battle_choice_locked',
      'streammonsters:battle_skill_locked',
      'streammonsters:battle_skill_used',
      'streammonsters:battle_action',
      'streammonsters:battle_knockout',
      'streammonsters:battle_completed',
      'streammonsters:battle_cancelled',
      'streammonsters:monster_evolved',
      'streammonsters:monster_xp_awarded',
      'streammonsters:monster_level_up',
      'streammonsters:stat_choice_opened',
      'streammonsters:monster_stat_prompt',
      'streammonsters:monster_stat_chosen',
      'streammonsters:monster_stat_auto_assigned',
      'streammonsters:arena_rating_changed'
    ]) {
      expect(html).toContain(event);
    }
    expect(html).toContain('compatibilityAlias');
    expect(html).toContain('item?.imageUrl || item?.image_url');
    expect(html).toContain('item?.templateId || item?.template_id');
    expect(html).toContain('item?.unspentStatPoints ?? item?.unspent_stat_points');
    for (const cue of [
      'egg.crack',
      'progress.xp',
      'progress.level',
      'progress.evolution',
      'progress.rank'
    ]) {
      expect(html).toContain(cue);
    }
    expect(html).not.toMatch(/AI art replaces|KI-Kunst ersetzt|arte de IA reemplaza|art IA remplace/i);
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(path.join(
        process.cwd(),
        'plugins',
        'streamalchemy',
        'locales',
        `${locale}.json`
      ), 'utf8')).plugins.streamalchemy.ui.monsters;
      for (const key of [
        'arenaRoundLabel',
        'arenaRosterChoice',
        'arenaEvaded',
        'battleWinner',
        'arenaBattleEnded',
        'arenaCancelledRoster',
        'arenaCancelled',
        'arenaShieldLabel',
        'arenaSpecialLabel',
        'arenaLeadLabel',
        'arenaTiedLabel',
        'arenaKnockoutResult',
        'arenaForfeitResult',
        'arenaResultSummary',
        'arenaRatingChanged',
        'arenaRatingUnchanged',
        'arenaDamageMetric',
        'arenaShieldAbsorbedMetric',
        'arenaShieldGainMetric',
        'arenaHealMetric',
        'arenaEvadeMetric',
        'monsterStatMeta',
        'monsterStatChoices',
        'monsterStatResult',
        'arenaCollapseBanner',
        'skillCopyEmberAttack',
        'skillCopyEmberDefense',
        'skillCopyEmberSpecial',
        'skillCopyTideAttack',
        'skillCopyTideDefense',
        'skillCopyTideSpecial',
        'skillCopyGroveAttack',
        'skillCopyGroveDefense',
        'skillCopyGroveSpecial',
        'skillCopyGaleAttack',
        'skillCopyGaleDefense',
        'skillCopyGaleSpecial',
        'skillCopyVoltAttack',
        'skillCopyVoltDefense',
        'skillCopyVoltSpecial',
        'skillCopyLunarAttack',
        'skillCopyLunarDefense',
        'skillCopyLunarSpecial'
      ]) {
        expect(translations[key]).toEqual(expect.any(String));
      }
    }
  });
});
