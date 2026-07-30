'use strict';

const Database = require('better-sqlite3');
const { JSDOM } = require('jsdom');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const BattleService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-service'
);
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);
const PublicEventProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/public-event-projector'
);
const ArenaDirector = require(
  '../plugins/streamalchemy/streammonsters-arena-director'
);
const ArenaView = require(
  '../plugins/streamalchemy/streammonsters-arena-view'
);
const OverlayRuntime = require(
  '../plugins/streamalchemy/streammonsters-overlay-runtime'
);
const localeCatalogs = Object.fromEntries(
  ['de', 'en', 'es', 'fr'].map(locale => [
    locale,
    require(`../plugins/streamalchemy/locales/${locale}.json`)
      .plugins.streamalchemy.ui.monsters
  ])
);

function createStore() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function insertMonster(sqlite, {
  id,
  userId,
  name,
  element,
  templateId
}) {
  sqlite.prepare(`
    INSERT INTO streammonsters_monsters (
      monster_id, user_id, egg_id, name, element, rarity, level, xp,
      stats_json, personality, template_id, evolution_stage, is_selected,
      created_at_ms
    ) VALUES (?, ?, ?, ?, ?, 'Common', 1, 0, ?, 'Adaptive', ?, 1, 1, 1)
  `).run(
    id,
    userId,
    `egg-${id}`,
    name,
    element,
    JSON.stringify({ vitality: 10, might: 10, guard: 10, agility: 10 }),
    templateId
  );
}

function createService({ store, now = () => 1_000, emit = jest.fn() }) {
  return new BattleMatchService({
    store,
    battleService: new BattleService({ store, now }),
    emit,
    now,
    rulesVersion: 8,
    autoStart: false
  });
}

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
  const { document } = dom.window;
  document.body.innerHTML = `
    <main id="streammonsters-overlay">
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
        <div id="arena-result">
          <span id="arena-result-ko"></span>
          <strong id="arena-result-winner"></strong>
          <span id="arena-result-monster"></span>
          <span id="arena-result-summary"></span>
          <div id="arena-result-ratings"></div>
          <div id="arena-result-report" hidden></div>
          <div id="arena-result-next"></div>
        </div>
        <div id="arena-rivalry-stamp"></div>
        <div id="arena-streak-stamp"></div>
        ${[1, 2].map(slot => `
          <article id="arena-fighter-${slot}" class="arena-fighter" data-slot="${slot}">
            <img id="arena-image-${slot}">
            <span id="arena-name-${slot}"></span>
            <span id="arena-owner-${slot}"></span>
            <span id="arena-level-${slot}"></span>
            <span id="arena-hp-text-${slot}"></span>
            <span id="arena-hp-${slot}"></span>
            <span id="arena-shield-${slot}"></span>
            <span id="arena-shield-label-${slot}"></span>
            <span id="arena-special-label-${slot}"></span>
            <div id="arena-charge-ring-${slot}" class="arena-charge-ring">
              <span id="arena-charge-${slot}"></span>
              <strong id="arena-charge-ready-${slot}"></strong>
            </div>
            <strong id="arena-choice-owner-${slot}"></strong>
            ${skillDeck(slot)}
          </article>
        `).join('')}
      </section>
    </main>
  `;
  return { dom, document };
}

function publicFighters() {
  const skills = [
    {
      choice: 'A',
      icon: 'A',
      name: 'Flamefang',
      shortText: 'A fierce strike.',
      effects: [
        { type: 'damage', power: 5 },
        { type: 'burn', power: 1 },
        { type: 'thorns', power: 2 },
        { type: 'weaken', power: 1 },
        { type: 'pierce', power: 3 },
        { type: 'evade', chance: 35 },
        { type: 'lifesteal', ratio: 0.5 }
      ],
      elementRelation: 'advantage',
      available: true
    },
    {
      choice: 'B',
      icon: 'B',
      name: 'Cinder Ward',
      shortText: 'A fiery ward.',
      effects: [
        { type: 'shield', power: 4 },
        { type: 'reflect', power: 2 }
      ],
      elementRelation: 'advantage',
      available: true
    },
    {
      choice: 'C',
      icon: 'C',
      name: 'Inferno Heart',
      shortText: 'A heavy blaze.',
      effects: [
        { type: 'damage', power: 9, hits: 2 },
        { type: 'heal', power: 2 }
      ],
      elementRelation: 'advantage',
      chargeRequired: 100,
      available: true
    }
  ];
  return [
    {
      slot: 1,
      name: 'Ashfang',
      viewerName: '@ember',
      element: 'Ember',
      hp: 30,
      maxHp: 30,
      charge: 100,
      skills
    },
    {
      slot: 2,
      name: 'Fernmask',
      viewerName: '@grove',
      element: 'Grove',
      hp: 30,
      maxHp: 30,
      charge: 100,
      skills: skills.map(skill => ({
        ...skill,
        elementRelation: 'disadvantage'
      }))
    }
  ];
}

describe('Stream Monsters objective gap presentation', () => {
  test('ships the complete arena guidance vocabulary in all four locales', () => {
    const keys = [
      'arenaSpecialReady',
      'arenaChoiceWindow',
      'arenaEffectDamage',
      'arenaEffectShield',
      'arenaEffectHeal',
      'arenaEffectBurn',
      'arenaEffectThorns',
      'arenaEffectWeaken',
      'arenaEffectPierce',
      'arenaEffectEvade',
      'arenaEffectReflect',
      'arenaEffectLifesteal',
      'arenaEffectHits',
      'arenaRelationAdvantage',
      'arenaRelationDisadvantage',
      'arenaRelationNeutral',
      'arenaRivalryEntrance',
      'arenaRivalryTierRematch',
      'arenaRivalryTierRivals',
      'arenaRivalryTierNemesis',
      'arenaCloseBattleHint',
      'arenaStreakThree',
      'arenaStreakFive',
      'arenaStreakUnstoppable'
    ];
    const tokens = value => [...String(value).matchAll(/\{(\w+)\}/g)]
      .map(match => match[1])
      .sort();
    for (const catalog of Object.values(localeCatalogs)) {
      for (const key of keys) {
        expect(catalog[key]).toEqual(expect.any(String));
        expect(catalog[key].trim()).not.toBe('');
        expect(tokens(catalog[key])).toEqual(tokens(localeCatalogs.en[key]));
      }
    }
  });

  test('projects only allowlisted mechanical effects with bounded public values', () => {
    expect(PublicEventProjector.projectBattleSkill({
      choice: 'C',
      icon: 'C',
      name: 'Public Special',
      nameKey: 'skillNamePublic',
      shortText: 'Public copy',
      shortTextKey: 'skillCopyPublic',
      elementRelation: 'advantage',
      available: true,
      effects: [
        { type: 'damage', power: 9, hits: 3, secretSeed: 'private' },
        { type: 'evade', chance: 35 },
        { type: 'lifesteal', ratio: 0.5 },
        { type: 'admin', power: 999 }
      ]
    })).toEqual(expect.objectContaining({
      elementRelation: 'advantage',
      effects: [
        { type: 'damage', power: 9, hits: 3 },
        { type: 'evade', chance: 35 },
        { type: 'lifesteal', ratio: 0.5 }
      ]
    }));
  });

  test('publishes the resolved stage mechanics in the pre-choice deck', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'mechanic-a',
      userId: 'viewer-a',
      name: 'Ashfang',
      element: 'Ember',
      templateId: 'ashfang'
    });
    insertMonster(sqlite, {
      id: 'mechanic-b',
      userId: 'viewer-b',
      name: 'Fernmask',
      element: 'Grove',
      templateId: 'fernmask'
    });
    const service = createService({ store });
    service.join({ userId: 'viewer-a' });
    service.join({ userId: 'viewer-b' });
    service.lockRoster({ userId: 'viewer-a' });
    service.lockRoster({ userId: 'viewer-b' });
    const match = service.getActiveMatchForViewer('viewer-a');
    const attacker = match.participants.find(participant => (
      participant.viewerId === 'viewer-a'
    ));

    expect(service.projectPublicSkillDeck(attacker, match)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          choice: 'A',
          elementRelation: 'advantage',
          effects: expect.arrayContaining([
            expect.objectContaining({ type: 'damage', power: expect.any(Number) }),
            expect.objectContaining({ type: 'burn', power: expect.any(Number) })
          ])
        })
      ])
    );
  });

  test('names both active fighters, shows all valid choices and renders concrete localized mechanics', () => {
    const { document } = mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { now: () => 1_000 },
      labels: {
        choiceWindow: 'NEXT / {left} & {right}: A {attack} / B {defense} / C {special}',
        effectDamage: 'Damage power {power}',
        effectShield: 'Shield {power}',
        effectHeal: 'Heal {power}',
        effectBurn: 'Burn {power}',
        effectThorns: 'Thorns {power}',
        effectWeaken: 'Weaken {power}',
        effectPierce: 'Pierce {power}',
        effectEvade: 'Evade {chance}%',
        effectReflect: 'Reflect {power}',
        effectLifesteal: 'Lifesteal {ratio}%',
        effectHits: '{hits} hits',
        relationAdvantage: 'Element advantage: +3 damage',
        relationDisadvantage: 'Element disadvantage: opponent gets +3 damage',
        specialReady: 'READY',
        specialMissing: '{amount} charge missing'
      }
    });

    const fighters = publicFighters();
    fighters[1].charge = 60;
    fighters[1].skills = fighters[1].skills.map(skill => (
      skill.choice === 'C'
        ? { ...skill, available: false, unavailableReason: 'special_requires_full_charge' }
        : skill
    ));
    view.openChoice({
      matchId: 'choice-guidance',
      round: 1,
      deadlineMs: 5_000,
      choices: ['A', 'B', 'C'],
      fighters
    });

    expect(document.getElementById('arena-skill-prompt').textContent)
      .toBe('NEXT / @ember & @grove: A Attack / B Defense / C Special');
    const attack = document.querySelector('[data-slot="1"] [data-skill="A"]');
    expect(attack.querySelector('.skill-copy').textContent).toContain('Damage power 5');
    expect(attack.querySelector('.skill-copy').textContent).toContain('Burn 1');
    expect(attack.querySelector('.skill-copy').textContent).toContain('Thorns 2');
    expect(attack.querySelector('.skill-copy').textContent).toContain('Weaken 1');
    expect(attack.querySelector('.skill-copy').textContent).toContain('Pierce 3');
    expect(attack.querySelector('.skill-copy').textContent).toContain('Evade 35%');
    expect(attack.querySelector('.skill-copy').textContent).toContain('Lifesteal 50%');
    expect(attack.querySelector('.skill-copy').textContent)
      .toContain('Element advantage: +3 damage');
    const special = document.querySelector('[data-slot="1"] [data-skill="C"]');
    expect(special.querySelector('.skill-copy').textContent).toContain('2 hits');
    expect(special.querySelector('.skill-charge').textContent).toContain('READY');
    expect(document.getElementById('arena-charge-ring-1').getAttribute('role'))
      .toBe('progressbar');
    expect(document.getElementById('arena-charge-ring-1').getAttribute('aria-valuenow'))
      .toBe('100');
    expect(document.getElementById('arena-charge-ready-1').textContent).toBe('READY');
    const lockedSpecial = document.querySelector('[data-slot="2"] [data-skill="C"]');
    expect(lockedSpecial.querySelector('.skill-charge').textContent)
      .toContain('40 charge missing');
  });

  test('keeps a sealed choice private while naming the waiting fighter', () => {
    const { document } = mountArena();
    const view = ArenaView.createArenaView({
      document,
      labels: {
        sealedWaiting: '{name} sealed - waiting for opponent'
      }
    });
    view.openChoice({
      matchId: 'sealed-guidance',
      fighters: publicFighters(),
      choices: ['A', 'B', 'C']
    });
    view.lockChoice({ decision: { slot: 1, choice: 'C', source: 'viewer' } });

    expect(document.getElementById('arena-skill-prompt').textContent)
      .toBe('@ember sealed - waiting for opponent');
    expect(document.getElementById('arena-skill-prompt').textContent).not.toContain('C');
  });

  test('gives a nonterminal Special a distinct fast cinematic duration', () => {
    const common = {
      rulesVersion: 8,
      eventId: 'action-duration',
      actorSlot: 1,
      targetSlot: 2,
      hits: [{ index: 1, hpDamage: 5, shieldAbsorbed: 0 }],
      outcomes: [],
      terminal: false
    };
    const normal = ArenaDirector.buildArcadeTimeline('battle_skill_used', {
      ...common,
      choice: 'A',
      skill: { type: 'attack', element: 'Ember' }
    });
    const special = ArenaDirector.buildArcadeTimeline('battle_skill_used', {
      ...common,
      choice: 'C',
      skill: { type: 'special', element: 'Ember' }
    });

    expect(normal.durationMs).toBe(ArenaDirector.RULES_V8_PACING.ACTION_MS);
    expect(special.durationMs).toBeGreaterThan(normal.durationMs);
    expect(special.durationMs).toBeLessThanOrEqual(2_800);
  });

  test('plays the READY glow and sound once for a deduplicated transition', async () => {
    const { document } = mountArena();
    const audio = { play: jest.fn(async () => true) };
    const effects = { play: jest.fn(async () => true) };
    const view = ArenaView.createArenaView({
      document,
      audio,
      effects,
      clock: { wait: async () => {} },
      labels: { specialReady: 'READY' }
    });
    const event = {
      eventId: 'special-ready-once',
      matchId: 'special-ready-match',
      slot: 1,
      charge: 100,
      element: 'Ember'
    };

    await expect(view.playEvent('battle_special_charged', event)).resolves.toBe(true);
    await expect(view.playEvent('battle_special_charged', event)).resolves.toBe(false);

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith(
      'arena.special',
      expect.objectContaining({ timelineEventId: 'special-ready-once' })
    );
    expect(document.getElementById('arena-charge-ring-1').classList)
      .toContain('ready');
    expect(document.getElementById('arena-charge-ready-1').textContent).toBe('READY');
  });

  test('uses a deterministic 25-percent close-result threshold in the backend', () => {
    expect(BattleMatchService.closeResultHint({
      terminalReason: 'knockout',
      knockout: { remainingHp: 6, maxHp: 30 }
    })).toEqual({
      kind: 'close_result',
      avoidsImmediateRematch: true
    });
    expect(BattleMatchService.closeResultHint({
      terminalReason: 'knockout',
      knockout: { remainingHp: 8, maxHp: 30 }
    })).toBeNull();
    expect(BattleMatchService.closeResultHint({
      terminalReason: 'forfeit',
      knockout: { remainingHp: 1, maxHp: 30 }
    })).toBeNull();
  });

  test('projects a privacy-safe pre-match rivalry tier and renders its entrance', async () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'rival-a',
      userId: 'viewer-a-secret',
      name: 'Ashfang',
      element: 'Ember',
      templateId: 'ashfang'
    });
    insertMonster(sqlite, {
      id: 'rival-b',
      userId: 'viewer-b-secret',
      name: 'Fernmask',
      element: 'Grove',
      templateId: 'fernmask'
    });
    sqlite.prepare(`
      INSERT INTO streammonsters_battles (
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
        user_a_id, user_b_id, result_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)
    `).run(
      'old-rivalry',
      'seed-old',
      'rival-a',
      'rival-b',
      'rival-a',
      'viewer-a-secret',
      'viewer-b-secret',
      1
    );
    const emit = jest.fn();
    const service = createService({ store, now: () => 700_001, emit });
    service.join({ userId: 'viewer-a-secret' });
    const reservation = service.join({ userId: 'viewer-b-secret' });
    const found = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:battle_match_found'
    ))?.[1];

    expect(reservation.status).toBe('reserved');
    expect(found).toEqual(expect.objectContaining({
      rivalry: {
        count: 1,
        tier: 'rematch'
      }
    }));
    expect(JSON.stringify(found)).not.toContain('viewer-a-secret');
    expect(JSON.stringify(found)).not.toContain('viewer-b-secret');

    const { document } = mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { wait: async () => {} },
      labels: {
        rivalryEntrance: 'RIVALRY {tier} / meeting {count}',
        rivalryTierRematch: 'REMATCH'
      }
    });
    await view.playEvent('battle_match_found', {
      eventId: 'rivalry-entrance',
      matchId: reservation.match.matchId,
      rivalry: found.rivalry
    });
    expect(document.getElementById('battle').dataset.rivalryTier).toBe('rematch');
    expect(document.getElementById('arena-rivalry-stamp').textContent)
      .toBe('RIVALRY REMATCH / meeting 1');
  });

  test('renders a deterministic close-result next-arena hint without promising the opponent', async () => {
    const { document } = mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { wait: async () => {} },
      labels: {
        closeBattleHint: 'CLOSE! Start the next arena; matchmaking searches fairly.'
      }
    });
    view.applyMatch({
      matchId: 'close-result',
      state: 'action',
      fighters: publicFighters()
    });
    await view.complete({
      matchId: 'close-result',
      winnerSlot: 1,
      winner: { viewerName: '@ember', name: 'Ashfang' },
      terminalReason: 'knockout',
      knockout: { round: 4, remainingHp: 6, maxHp: 30 },
      nextArenaHint: {
        kind: 'close_result',
        avoidsImmediateRematch: true
      }
    });

    const hint = document.getElementById('arena-result-next').textContent;
    expect(hint).toBe('CLOSE! Start the next arena; matchmaking searches fairly.');
    expect(hint.toLowerCase()).not.toContain('same opponent');
  });

  test.each([
    [3, '3 WINS'],
    [5, '5 WINS'],
    [10, 'UNSTOPPABLE']
  ])('renders the %i-win arcade tier as a visible arena stamp', async (count, stamp) => {
    const { document } = mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { wait: async () => {} },
      labels: {
        streakThree: '3 WINS',
        streakFive: '5 WINS',
        streakUnstoppable: 'UNSTOPPABLE'
      }
    });

    await view.playEvent('win_streak', {
      eventId: `streak-${count}`,
      matchId: 'streak-match',
      count
    });

    expect(document.getElementById('arena-streak-stamp').textContent).toBe(stamp);
    expect(document.getElementById('arena-streak-stamp').classList).toContain('visible');
  });

  test('drains the active-match streak stamp before the completion board', () => {
    const queue = OverlayRuntime.createPriorityQueue({
      criticalGroupHoldMs: 0
    });
    queue.setBattleActive(true, 'streak-match');
    queue.enqueue('win_streak', {
      eventId: 'streak-first',
      correlationId: 'streak-match',
      matchId: 'streak-match',
      count: 5
    }, 1);
    queue.enqueue('battle_completed', {
      eventId: 'completion-second',
      correlationId: 'streak-match',
      matchId: 'streak-match',
      winnerSlot: 1
    }, 2);

    expect(queue.shift(3)?.type).toBe('win_streak');
    expect(queue.shift(3)?.type).toBe('battle_completed');
  });
});
