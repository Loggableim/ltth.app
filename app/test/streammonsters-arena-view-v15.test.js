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
      <div id="arena-feed"></div>
      <article id="arena-fighter-1" data-slot="1">
        <img id="arena-image-1"><div id="arena-name-1"></div>
        <div id="arena-level-1"></div><div id="arena-hp-text-1"></div>
        <div id="arena-hp-1"></div><div id="arena-shield-1"></div><div id="arena-charge-1"></div>
        <span id="arena-shield-label-1"></span><span id="arena-special-label-1"></span>
        ${skillDeck(1)}
      </article>
      <article id="arena-fighter-2" data-slot="2">
        <img id="arena-image-2"><div id="arena-name-2"></div>
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
    expect(document.querySelector('#arena-skill-prompt').textContent).toContain('C');
    expect(document.querySelector('#arena-skill-prompt').textContent).toContain('Attack');
    expect(document.querySelector('#arena-skill-prompt').textContent).toContain('Defense');
    expect(document.querySelector('#arena-skill-prompt').textContent).toContain('Special');

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
      vfxKey: 'ripple:special'
    }));
    expect(audio.play).toHaveBeenCalledWith('arena.hit', expect.objectContaining({
      eventId: expect.stringContaining('hit')
    }));
    expect(document.querySelector('#arena-hp-text-1').textContent).toBe('45 / 52');
    expect(document.querySelector('#arena-hp-text-2').textContent).toBe('52 / 52');
    expect(document.querySelector('#arena-feed').textContent).toContain('Tidal Renewal');
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
    expect(waited).toContain(4_000);
    expect(document.querySelector('#battle').classList.contains('visible')).toBe(false);
    view.cancel({ reason: 'roster_unavailable' });
    expect(document.querySelector('#battle').dataset.terminal).toBe('cancelled');
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
        skillEffectRippleCStage1: 'A fully charged wave.'
      }
    });
    const skills = template => ['A', 'B', 'C'].map(choice => ({
      choice,
      icon: choice === 'A' ? '⚔️' : choice === 'B' ? '🛡️' : '✨',
      name: `${template} fallback ${choice}`,
      nameKey: `skillName${template}${choice}Stage1`,
      shortText: `${template} fallback copy ${choice}`,
      shortTextKey: `skillEffect${template}${choice}Stage1`,
      available: choice !== 'C',
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

  test('shows a sealed lock without selecting a skill until both choices are revealed', () => {
    mountArena();
    const view = ArenaView.createArenaView({ document });
    view.openChoice({
      matchId: 'match-sealed-board',
      round: 1,
      fighters: [
        { slot: 1, skills: [] },
        { slot: 2, skills: [] }
      ]
    });

    view.lockChoice({ decision: { slot: 1, choice: 'A', locked: true } });
    expect(document.querySelector('#arena-fighter-1').dataset.choice).toBeUndefined();
    expect(document.querySelector('[data-slot="1"] [data-skill="A"]').classList)
      .not.toContain('selected');

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
    expect(html).toContain('--arena-gameplay-height:74%');
    expect(html).toMatch(/#battle\s*\{[^}]*inset:0 0 26%/s);
    expect(html).toMatch(
      /\.arena-sprite\s*\{[^}]*max-width:100%;[^}]*max-height:100%;[^}]*object-fit:contain/s
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
