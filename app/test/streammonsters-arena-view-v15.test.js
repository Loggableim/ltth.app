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

function mountArena() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
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
        <div id="arena-result-ratings"></div>
        <div id="arena-result-report" hidden></div>
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
    expect(document.querySelector('#arena-image-1').src).toContain('/furry/ashfang.png');
    expect(document.querySelector('#arena-image-2').src).toContain('/furry/ripple.png');
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

  test('shows the full readable action contract from public combat state', async () => {
    mountArena();
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
    const metrics = document.getElementById('arena-action-metrics').textContent;
    expect(metrics).toBe(
      'Schaden 7 · Schildtreffer 1 · Schild +3 · Heilung 4 · Ausweichen'
    );
    expect(document.getElementById('arena-action-card').classList)
      .toContain('visible');
  });

  test('clears the last action card before the result and keeps the next roster clean', async () => {
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
    expect(specialCard.querySelector('.skill-charge').textContent).toBe('100%');
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
        { slot: 1, name: 'Ashfang', viewerName: '@ember', skills: [] },
        { slot: 2, name: 'Ripple', viewerName: '@tide', skills: [] }
      ]
    });

    view.lockChoice({ decision: { slot: 1, choice: 'A', locked: true } });
    expect(document.querySelector('#arena-fighter-1').dataset.choice).toBeUndefined();
    expect(document.querySelector('[data-slot="1"] [data-skill="A"]').classList)
      .not.toContain('selected');
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .toMatch(/@ember.*sealed.*waiting/i);

    view.lockChoice({ decision: { slot: 2, choice: 'C', locked: true } });
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .toMatch(/both choices sealed.*reveal now/i);

    view.revealChoices({
      choices: [
        { slot: 1, choice: 'A', source: 'viewer' },
        { slot: 2, choice: 'C', source: 'timeout' }
      ]
    });
    expect(document.querySelector('[data-slot="1"] [data-skill="A"]').classList)
      .toContain('selected');
    expect(document.querySelector('[data-slot="2"] [data-skill="C"]').classList)
      .toContain('selected');
  });

  test('shows NEXT with at most two currently valid actions during a choice window', () => {
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
      .not.toMatch(/\bC\b/);

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
      .toMatch(/^NEXT.*\bA\b/);
    expect(document.querySelector('#arena-skill-prompt').textContent)
      .not.toMatch(/\bC\b/);
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
    expect(styles.get('#battle[data-phase="action"] .arena-fighter').getPropertyValue('top'))
      .toBe('43%');
    expect(styles.get('#battle[data-phase="action"] .arena-fighter').getPropertyValue('height'))
      .toBe('55%');
    expect(styles.get('#battle[data-phase="choice"] #arena-feed').getPropertyValue('display'))
      .toBe('none');
    expect(styles.get('#arena-choice-surface').getPropertyValue('bottom')).toBe('1%');
    expect(styles.get('#battle-effects-canvas').getPropertyValue('z-index')).toBe('3');
    expect(styles.get('.arena-skill-card .skill-copy').getPropertyValue('text-overflow'))
      .not.toBe('ellipsis');
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
    expect(dom.window.document.querySelector('#arena-stat-card')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-result-ko')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-result-monster')).not.toBeNull();
    expect(dom.window.document.querySelector('#arena-result-summary')).not.toBeNull();
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
