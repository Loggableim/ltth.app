(function attachStreamMonstersArenaDirector(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersArenaDirector = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const QUALITY_MODES = new Set(['auto', 'high', 'medium', 'low']);
  const ELEMENTS = Object.freeze(['Ember', 'Tide', 'Grove', 'Gale', 'Lunar', 'Volt']);
  const EVOLUTION_STATS = Object.freeze(['vitality', 'might', 'guard', 'agility']);
  const CRITICAL_EVENT_TYPES = new Set([
    'egg_spawned',
    'hatch_started',
    'egg_hatched',
    'monster_discovered',
    'monster_evolved',
    'monster_visual_evolved',
    'battle_choice_locked',
    'battle_choices_revealed',
    'battle_skill_used',
    'battle_completed',
    'monster_xp_awarded',
    'monster_level_up',
    'arena_rating_changed',
    'season_rank_changed',
    'rank_card'
  ]);

  function createArenaGeometry(layout = 'portrait') {
    if (layout === 'landscape') {
      return Object.freeze({
        layout: 'landscape',
        width: 1920,
        height: 1080,
        gameplay: Object.freeze({ x: 0, y: 0, width: 1920, height: 1080 }),
        chatSafeZone: null,
        hud: Object.freeze({ x: 260, y: 70, width: 1400, height: 190 }),
        fighters: Object.freeze([
          Object.freeze({ slot: 1, x: 490, feetY: 960, scale: 0.96, facing: 'right' }),
          Object.freeze({ slot: 2, x: 1430, feetY: 960, scale: 0.96, facing: 'left' })
        ])
      });
    }
    return Object.freeze({
      layout: 'portrait',
      width: 1080,
      height: 1920,
      gameplay: Object.freeze({ x: 0, y: 0, width: 1080, height: 1421 }),
      chatSafeZone: Object.freeze({ x: 0, y: 1421, width: 1080, height: 499 }),
      hud: Object.freeze({ x: 58, y: 62, width: 964, height: 248 }),
      fighters: Object.freeze([
        Object.freeze({ slot: 1, x: 330, feetY: 1000, scale: 0.88, facing: 'right' }),
        Object.freeze({ slot: 2, x: 742, feetY: 1372, scale: 1.08, facing: 'left' })
      ])
    });
  }

  function canonicalImageUrl(fighter) {
    if (typeof fighter?.imageUrl === 'string' && fighter.imageUrl.startsWith('/plugins/streamalchemy/')) {
      return fighter.imageUrl;
    }
    const templateId = String(fighter?.templateId || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const element = String(fighter?.element || '').toLowerCase().replace(/[^a-z]/g, '');
    const stage = Math.max(1, Math.min(3, Number(fighter?.evolutionStage) || 1));
    if (!templateId) return '/plugins/streamalchemy/assets/branding/stream-monsters-icon.png';
    if (stage === 1) {
      return `/plugins/streamalchemy/assets/streammonsters/furry/${templateId}.png`;
    }
    return `/plugins/streamalchemy/assets/streammonsters/furry/evolution/${element}/${templateId}-stage${stage}.png`;
  }

  function normalizeFighters(fighters = []) {
    return [...fighters]
      .filter(fighter => Number(fighter?.slot) === 1 || Number(fighter?.slot) === 2)
      .sort((left, right) => Number(left.slot) - Number(right.slot))
      .map(fighter => Object.freeze({
        ...fighter,
        slot: Number(fighter.slot),
        side: Number(fighter.slot) === 1 ? 'left' : 'right',
        evolutionStage: Math.max(1, Math.min(3, Number(fighter.evolutionStage) || 1)),
        imageUrl: canonicalImageUrl(fighter)
      }));
  }

  function numeric(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value || '')) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function safeIdentity(value) {
    return String(value || '').trim().replace(/[^a-zA-Z0-9:_-]/g, '-').slice(0, 160);
  }

  function normalizedEventType(eventType) {
    const value = String(eventType || '')
      .replace(/^streammonsters:/, '')
      .trim()
      .toLowerCase();
    return {
      battle_action: 'battle_skill_used',
      battle_knockout: 'battle_skill_used',
      battle_skill_locked: 'battle_choice_locked',
      monster_visual_evolved: 'monster_evolved',
      rank_card: 'season_rank_changed'
    }[value] || value;
  }

  function timelineIdentity(eventType, payload = {}) {
    const type = normalizedEventType(eventType);
    const action = payload.action && typeof payload.action === 'object'
      ? payload.action
      : {};
    const explicit = safeIdentity(payload.eventId || payload.event_id || action.eventId);
    if (explicit) return explicit;
    const correlation = safeIdentity(
      payload.correlationId ||
      payload.matchId ||
      payload.battleId ||
      payload.egg?.publicId ||
      payload.monster?.publicId
    );
    const sequence = numeric(
      payload.sequence ??
      payload.eventSequence ??
      action.eventSequence ??
      action.sequence
    );
    const fingerprint = stableHash(JSON.stringify({
      type,
      correlation,
      sequence,
      round: payload.round ?? action.round,
      slot: payload.decision?.slot ?? action.actorSlot,
      element: payload.egg?.element ?? payload.monster?.element
    })).toString(36);
    return `${correlation || 'streammonsters'}:${type}:${sequence || fingerprint}`;
  }

  function elementValue(payload = {}) {
    return String(
      payload.element ||
      payload.event?.element ||
      payload.egg?.element ||
      payload.monster?.element ||
      payload.action?.skill?.element ||
      'Lunar'
    );
  }

  function buildElementalHourPresentation(payload = {}) {
    return Object.freeze({
      presentation: 'elemental-hour',
      placement: 'upper-gameplay',
      durationMs: 8_000,
      element: elementValue(payload),
      incubationReductionSeconds: 30,
      hypeBonus: 10,
      combatStatBonus: 0,
      hatchQualityBonus: 0
    });
  }

  function buildElementalHourEventPresentation(eventType, payload = {}) {
    const type = normalizedEventType(eventType);
    if (type === 'elemental_hour') {
      return buildElementalHourPresentation(payload);
    }
    if (
      type === 'stream_started' &&
      String(payload?.event?.element || '').trim()
    ) {
      return buildElementalHourPresentation(payload);
    }
    return null;
  }

  function buildEvolutionPresentation(payload = {}, { reducedMotion = false } = {}) {
    const before = payload.statsBefore || {};
    const after = payload.statsAfter || {};
    const maximum = Math.max(
      1,
      ...EVOLUTION_STATS.flatMap(key => [numeric(before[key]), numeric(after[key])])
    );
    const percent = value => Math.round((Math.max(0, numeric(value)) / maximum) * 100);
    const sourceSkill = payload.unlockedSkill && typeof payload.unlockedSkill === 'object'
      ? payload.unlockedSkill
      : null;
    const skill = sourceSkill
      ? Object.freeze({
          choice: ['A', 'B', 'C'].includes(sourceSkill.choice) ? sourceSkill.choice : 'A',
          icon: String(sourceSkill.icon || '').slice(0, 16),
          name: String(sourceSkill.name || 'Skill').slice(0, 96),
          nameKey: String(sourceSkill.nameKey || '').slice(0, 96),
          shortText: String(sourceSkill.shortText || '').slice(0, 240),
          shortTextKey: String(sourceSkill.shortTextKey || '').slice(0, 96)
        })
      : null;
    return Object.freeze({
      monster: String(payload.monster?.name || 'Monster').slice(0, 80),
      stage: Math.max(
        1,
        Math.min(3, numeric(
          payload.evolutionStage ??
          payload.monster?.evolutionStage ??
          payload.monster?.evolution_stage
        ) || 1)
      ),
      statsRevealAtMs: reducedMotion ? 0 : 1_440,
      skillRevealAtMs: reducedMotion ? 0 : 2_700,
      finalState: Boolean(reducedMotion),
      stats: Object.freeze(EVOLUTION_STATS.map(key => Object.freeze({
        key,
        before: Math.max(0, numeric(before[key])),
        after: Math.max(0, numeric(after[key])),
        delta: Math.max(0, numeric(after[key]) - numeric(before[key])),
        beforePercent: percent(before[key]),
        afterPercent: percent(after[key])
      }))),
      skill
    });
  }

  function decorateTimeline({
    type,
    payload,
    scene,
    beats,
    reducedMotion = false
  }) {
    const eventId = timelineIdentity(type, payload);
    const correlationId = safeIdentity(
      payload.correlationId ||
      payload.matchId ||
      payload.battleId ||
      payload.egg?.correlationId ||
      payload.monster?.correlationId ||
      eventId
    );
    const decorated = beats
      .slice()
      .sort((left, right) => (
        numeric(left.atMs) - numeric(right.atMs) ||
        numeric(left.order) - numeric(right.order)
      ))
      .map((beat, index) => Object.freeze({
        ...beat,
        eventId,
        beatId: `${eventId}:beat:${index + 1}:${safeIdentity(beat.type)}`,
        atMs: Math.max(0, numeric(beat.atMs)),
        durationMs: Math.max(0, numeric(beat.durationMs)),
        motion: reducedMotion ? 'reduced' : 'full'
      }));
    const durationMs = decorated.reduce(
      (maximum, beat) => Math.max(maximum, beat.atMs + beat.durationMs),
      0
    );
    return Object.freeze({
      eventId,
      correlationId,
      groupKey: CRITICAL_EVENT_TYPES.has(normalizedEventType(type))
        ? `critical:${correlationId}`
        : null,
      type: normalizedEventType(type),
      scene,
      durationMs,
      beats: Object.freeze(decorated)
    });
  }

  function buildActionTimeline(action = {}) {
    const beats = [];
    let offset = 0;
    for (const effect of Array.isArray(action.statusEffects) ? action.statusEffects : []) {
      const hpDamage = Math.max(0, numeric(effect?.hpDamage ?? effect?.amount));
      if (hpDamage < 1) continue;
      beats.push({
        type: 'status_damage',
        atMs: offset,
        durationMs: 340,
        effectType: String(effect?.type || 'status'),
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.actorSlot),
        hpDamage,
        remaining: numeric(effect?.remaining)
      }, {
        type: 'status_hud',
        atMs: offset + 160,
        durationMs: 200,
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.actorSlot),
        hpDamage
      });
      offset += 440;
    }

    const explicitKnockouts = Array.isArray(action.knockouts)
      ? action.knockouts
        .map(knockout => ({
          slot: numeric(knockout?.slot),
          cause: String(knockout?.cause || 'skill')
        }))
        .filter(knockout => [1, 2].includes(knockout.slot))
      : null;
    if (action.skipped === 'burn_ko') {
      const knockouts = explicitKnockouts || [{
        slot: numeric(action.actorSlot),
        cause: 'status'
      }];
      const knockoutAtMs = offset + 120;
      knockouts.forEach(knockout => beats.push({
        type: 'knockout',
        atMs: knockoutAtMs,
        durationMs: 900,
        slot: knockout.slot,
        targetSlot: knockout.slot,
        cause: knockout.cause
      }));
      beats.push({
        type: 'recover',
        atMs: knockoutAtMs + 900,
        durationMs: 1200,
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.targetSlot)
      });
      return beats;
    }

    beats.push(
      {
        type: 'telegraph',
        atMs: offset,
        durationMs: 700,
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.targetSlot),
        skill: action.skill || null
      },
      {
        type: 'advance',
        atMs: offset + 700,
        durationMs: 350,
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.targetSlot)
      }
    );
    if (String(action.choice || action.skill?.type || '').toLowerCase() === 'c' ||
        String(action.skill?.type || '').toLowerCase() === 'special') {
      beats.push({
        type: 'special',
        atMs: offset + 1050,
        durationMs: 250,
        element: action.skill?.element || null,
        vfxKey: action.skill?.vfxKey || null
      });
    }

    const hits = Array.isArray(action.hits) ? action.hits : [];
    const impactStart = offset + 1300;
    hits.forEach((hit, index) => {
      const atMs = impactStart + (index * 440);
      beats.push({
        type: 'impact',
        atMs,
        durationMs: 260,
        hitIndex: numeric(hit.index) || index + 1,
        hpDamage: numeric(hit.hpDamage),
        shieldAbsorbed: numeric(hit.shieldAbsorbed),
        evaded: Boolean(hit.evaded),
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.targetSlot)
      });
      beats.push({
        type: 'hud',
        atMs: atMs + 160,
        durationMs: 200,
        actorSlot: numeric(action.actorSlot),
        targetSlot: numeric(action.targetSlot),
        state: action.stateAfter || null
      });
    });

    let cursor = hits.length
      ? impactStart + ((hits.length - 1) * 440) + 340
      : impactStart;
    for (const outcome of Array.isArray(action.outcomes) ? action.outcomes : []) {
      if (!['shield', 'heal', 'lifesteal'].includes(outcome?.type)) continue;
      cursor += 180;
      beats.push({
        type: outcome.type === 'lifesteal' ? 'heal' : outcome.type,
        atMs: cursor,
        durationMs: 360,
        actorSlot: numeric(action.actorSlot),
        amount: numeric(outcome.amount)
      });
    }

    for (const retaliation of Array.isArray(action.retaliations) ? action.retaliations : []) {
      cursor += 260;
      beats.push({
        type: 'retaliation',
        atMs: cursor,
        durationMs: 320,
        retaliationType: String(retaliation?.type || 'retaliation'),
        actorSlot: numeric(action.targetSlot),
        targetSlot: numeric(action.actorSlot),
        hpDamage: Math.max(0, numeric(retaliation?.hpDamage)),
        shieldAbsorbed: Math.max(0, numeric(retaliation?.shieldAbsorbed)),
        evaded: Boolean(retaliation?.evaded),
        hitIndex: numeric(retaliation?.index)
      }, {
        type: 'retaliation_hud',
        atMs: cursor + 160,
        durationMs: 200,
        actorSlot: numeric(action.targetSlot),
        targetSlot: numeric(action.actorSlot),
        hpDamage: Math.max(0, numeric(retaliation?.hpDamage)),
        shieldAbsorbed: Math.max(0, numeric(retaliation?.shieldAbsorbed))
      });
      cursor += 220;
    }

    const knockouts = explicitKnockouts || (
      action.terminal
        ? [{ slot: numeric(action.targetSlot), cause: 'skill' }]
        : []
    );
    if (knockouts.length) {
      cursor += 480;
      const knockoutAtMs = cursor;
      knockouts.forEach(knockout => beats.push({
        type: 'knockout',
        atMs: knockoutAtMs,
        durationMs: 900,
        slot: knockout.slot,
        targetSlot: knockout.slot,
        cause: knockout.cause
      }));
      cursor += 900;
    } else {
      cursor += 480;
    }
    beats.push({
      type: 'recover',
      atMs: cursor,
      durationMs: knockouts.length ? 1200 : 550,
      actorSlot: numeric(action.actorSlot),
      targetSlot: numeric(action.targetSlot)
    });
    return beats;
  }

  function buildJackpotActionTimeline(action = {}) {
    const actorSlot = numeric(action.actorSlot);
    const targetSlot = numeric(action.targetSlot);
    const hits = Array.isArray(action.hits) ? action.hits : [];
    const beats = [
      { type: 'entrance', atMs: 0, durationMs: 320, actorSlot, targetSlot },
      {
        type: 'telegraph',
        atMs: 320,
        durationMs: 480,
        actorSlot,
        targetSlot,
        skill: action.skill || null
      },
      { type: 'anticipation', atMs: 800, durationMs: 260, actorSlot, targetSlot },
      { type: 'movement', atMs: 1060, durationMs: 300, actorSlot, targetSlot }
    ];
    let cursor = 1360;
    if (action.skill?.projectile === true || action.skill?.type === 'attack') {
      beats.push({
        type: 'projectile',
        atMs: cursor,
        durationMs: 280,
        actorSlot,
        targetSlot,
        element: action.skill?.element || null
      });
      cursor += 280;
    }
    if (hits.some(hit => numeric(hit?.shieldAbsorbed) > 0)) {
      beats.push({
        type: 'shield',
        atMs: cursor,
        durationMs: 180,
        targetSlot
      });
      cursor += 180;
    }
    hits.forEach((hit, index) => {
      const hitIndex = numeric(hit?.index) || index + 1;
      beats.push(
        {
          type: 'hit',
          atMs: cursor,
          durationMs: 120,
          actorSlot,
          targetSlot,
          hitIndex,
          hpDamage: numeric(hit?.hpDamage),
          shieldAbsorbed: numeric(hit?.shieldAbsorbed)
        },
        {
          type: 'number_pop',
          atMs: cursor + 40,
          durationMs: 220,
          targetSlot,
          hitIndex,
          amount: numeric(hit?.hpDamage)
        },
        {
          type: 'hud_update',
          atMs: cursor + 120,
          durationMs: 140,
          targetSlot,
          hitIndex
        },
        {
          type: 'recoil',
          atMs: cursor + 260,
          durationMs: 160,
          targetSlot,
          hitIndex
        }
      );
      cursor += 420;
    });
    beats.push({
      type: 'recovery',
      atMs: cursor,
      durationMs: 300,
      actorSlot,
      targetSlot
    });
    cursor += 300;
    if (action.terminal) {
      beats.push(
        { type: 'knockout', atMs: cursor, durationMs: 700, targetSlot },
        {
          type: 'winner',
          atMs: cursor + 700,
          durationMs: 1200,
          winnerSlot: actorSlot
        }
      );
    }
    return beats;
  }

  function buildArcadeActionBeats(action = {}) {
    const base = buildActionTimeline(action);
    const expanded = [];
    for (const beat of base) {
      if (beat.type === 'status_damage') {
        expanded.push({
          ...beat,
          peak: true,
          audioCue: 'arena.hit',
          effect: {
            scene: 'attack',
            element: action.skill?.element || null,
            vfxKey: beat.effectType
          }
        });
        continue;
      }
      if (beat.type === 'retaliation') {
        expanded.push({
          ...beat,
          peak: true,
          audioCue: 'arena.hit',
          effect: {
            scene: 'attack',
            element: action.skill?.element || null,
            vfxKey: beat.retaliationType
          }
        }, {
          type: 'camera_impulse',
          atMs: beat.atMs + 18,
          durationMs: 220,
          hitIndex: beat.hitIndex,
          intensity: Math.max(
            0.35,
            Math.min(1, (beat.hpDamage + beat.shieldAbsorbed) / 10)
          )
        }, {
          type: 'damage_number',
          atMs: beat.atMs + 34,
          durationMs: 390,
          targetSlot: beat.targetSlot,
          amount: beat.hpDamage,
          retaliationType: beat.retaliationType
        });
        continue;
      }
      if (beat.type === 'retaliation_hud' || beat.type === 'status_hud') {
        expanded.push(beat);
        continue;
      }
      if (beat.type === 'telegraph') {
        expanded.push({
          ...beat,
          peak: false,
          audioCue: `element.${String(action.skill?.element || '').toLowerCase()}`,
          audioDucking: false
        });
        continue;
      }
      if (beat.type === 'advance') {
        expanded.push(beat, {
          type: 'element_trail',
          atMs: beat.atMs + 60,
          durationMs: beat.durationMs,
          actorSlot: beat.actorSlot,
          targetSlot: beat.targetSlot,
          effect: {
            scene: 'attack',
            element: action.skill?.element || null,
            vfxKey: action.skill?.vfxKey || null
          }
        });
        continue;
      }
      if (beat.type === 'special') {
        expanded.push({
          ...beat,
          peak: true,
          audioCue: 'arena.special',
          audioDucking: { amount: 0.32, durationMs: 1100 },
          effect: {
            scene: 'special',
            element: beat.element,
            vfxKey: beat.vfxKey
          }
        });
        continue;
      }
      if (beat.type === 'impact') {
        expanded.push({
          ...beat,
          peak: true,
          audioCue: 'arena.hit'
        }, {
          type: 'hit_stop',
          atMs: beat.atMs,
          durationMs: 76,
          hitIndex: beat.hitIndex,
          actorSlot: beat.actorSlot,
          targetSlot: beat.targetSlot
        }, {
          type: 'camera_impulse',
          atMs: beat.atMs + 18,
          durationMs: 220,
          hitIndex: beat.hitIndex,
          intensity: Math.max(0.35, Math.min(1, (beat.hpDamage + beat.shieldAbsorbed) / 10))
        });
        if (!beat.evaded) {
          expanded.push({
            type: 'damage_number',
            atMs: beat.atMs + 34,
            durationMs: 390,
            targetSlot: beat.targetSlot,
            amount: beat.hpDamage,
            hitIndex: beat.hitIndex
          });
          if (beat.shieldAbsorbed > 0) {
            expanded.push({
              type: 'shield_number',
              atMs: beat.atMs + 54,
              durationMs: 390,
              targetSlot: beat.targetSlot,
              amount: beat.shieldAbsorbed,
              hitIndex: beat.hitIndex
            });
          }
        }
        continue;
      }
      if (beat.type === 'shield') {
        expanded.push({
          ...beat,
          type: 'shield_number',
          audioCue: 'arena.shield'
        });
        continue;
      }
      if (beat.type === 'heal') {
        expanded.push({
          ...beat,
          type: 'heal_number',
          audioCue: 'arena.heal'
        });
        continue;
      }
      if (beat.type === 'knockout') {
        expanded.push({
          ...beat,
          peak: true,
          audioCue: 'arena.ko',
          audioDucking: { amount: 0.3, durationMs: 1000 }
        });
        continue;
      }
      expanded.push(beat);
    }
    return expanded;
  }

  function buildArcadeTimeline(eventType, payload = {}, options = {}) {
    const type = normalizedEventType(eventType);
    const element = elementValue(payload);
    let scene = 'card';
    let beats = [];
    if (type === 'elemental_hour') {
      const presentation = buildElementalHourPresentation(payload);
      scene = 'elemental_hour';
      beats = [{
        type: 'elemental_hour_card',
        atMs: 0,
        durationMs: presentation.durationMs,
        element: presentation.element,
        incubationReductionSeconds: presentation.incubationReductionSeconds,
        hypeBonus: presentation.hypeBonus,
        combatStatBonus: presentation.combatStatBonus,
        hatchQualityBonus: presentation.hatchQualityBonus
      }];
    } else if (type === 'egg_spawned') {
      scene = 'spawn';
      const roulette = ELEMENTS.filter(candidate => candidate !== element).concat(element);
      beats = [
        {
          type: 'portal',
          atMs: 0,
          durationMs: 650,
          element,
          effect: { scene: 'spawn', element, vfxKey: `${element}:egg-portal` },
          audioCue: 'egg.spawn'
        },
        ...roulette.map((candidate, index) => ({
          type: 'element_roulette',
          atMs: 180 + (index * 150),
          durationMs: 180,
          order: index,
          element: candidate
        })),
        {
          type: 'roulette_lock',
          atMs: 1120,
          durationMs: 360,
          element,
          peak: true,
          audioCue: 'ui.navigate'
        },
        {
          type: 'egg_flight',
          atMs: 1420,
          durationMs: 620,
          element
        },
        {
          type: 'egg_impact',
          atMs: 2040,
          durationMs: 420,
          element,
          peak: true,
          audioCue: 'arena.hit',
          effect: { scene: 'spawn', element, vfxKey: `${element}:egg-impact` }
        },
        {
          type: 'reward_peak',
          atMs: 2380,
          durationMs: 520,
          element,
          charged: payload.egg?.variant === 'charged'
        }
      ];
    } else if (type === 'hatch_started') {
      scene = 'hatch';
      beats = [
        {
          type: 'hatch_pulse',
          atMs: 0,
          durationMs: 560,
          element,
          effect: { scene: 'hatch', element, vfxKey: `${element}:hatch-pulse` }
        },
        ...[560, 960, 1360].map((atMs, index) => ({
          type: 'hatch_crack',
          atMs,
          durationMs: 280,
          crackIndex: index + 1,
          element,
          audioCue: 'egg.crack'
        })),
        {
          type: 'energy_build',
          atMs: 1640,
          durationMs: 720,
          element,
          effect: { scene: 'hatch', element, vfxKey: `${element}:hatch-energy` }
        },
        {
          type: 'hatch_flash',
          atMs: 2320,
          durationMs: 480,
          element,
          peak: true,
          audioCue: 'egg.hatch',
          audioDucking: { amount: 0.4, durationMs: 700 }
        }
      ];
    } else if (type === 'egg_hatched' || type === 'monster_discovered' ||
               type === 'monster_evolved') {
      scene = type === 'monster_evolved' ? 'evolution' : 'reveal';
      const evolutionStage = Math.max(1, numeric(
        payload.evolutionStage ?? payload.monster?.evolutionStage
      ) || 1);
      const isNew = type === 'monster_discovered' ||
        payload.discovery?.isNew === true ||
        payload.isNew === true;
      beats = [
        {
          type: 'silhouette',
          atMs: 0,
          durationMs: 560,
          element
        },
        {
          type: 'monster_reveal',
          atMs: 520,
          durationMs: 900,
          element,
          peak: true,
          effect: { scene: 'hatch', element, vfxKey: `${element}:monster-reveal` },
          audioCue: type === 'monster_evolved' ? 'progress.evolution' : 'egg.hatch',
          audioDucking: { amount: 0.38, durationMs: 950 }
        }
      ];
      if (type === 'monster_evolved' && payload.statsBefore && payload.statsAfter) {
        const presentation = buildEvolutionPresentation(payload, {
          reducedMotion: Boolean(options.reducedMotion)
        });
        beats.push({
          type: 'evolution_stats',
          atMs: presentation.statsRevealAtMs,
          durationMs: options.reducedMotion ? 0 : 1_200,
          evolutionStage,
          stats: presentation.stats,
          peak: true,
          audioCue: 'progress.evolution'
        });
        if (presentation.skill) {
          beats.push({
            type: 'evolution_skill',
            atMs: presentation.skillRevealAtMs,
            durationMs: options.reducedMotion ? 0 : 1_000,
            evolutionStage,
            skill: presentation.skill,
            peak: true,
            audioCue: 'ui.navigate'
          });
        }
      } else if (type === 'monster_evolved' || evolutionStage > 1) {
        beats.push({
          type: 'evolution_peak',
          atMs: 1240,
          durationMs: 900,
          evolutionStage,
          peak: true,
          audioCue: 'progress.evolution'
        });
      } else {
        beats.push({
          type: isNew ? 'new_discovery' : 'duplicate_reward',
          atMs: 1240,
          durationMs: 760,
          peak: isNew,
          audioCue: isNew ? 'progress.level' : 'progress.xp'
        });
      }
      beats.push({
        type: 'winner_frame',
        atMs: type === 'monster_evolved' && payload.statsBefore && payload.statsAfter
          ? (options.reducedMotion ? 0 : 3_800)
          : 1960,
        durationMs: 1100,
        element
      });
    } else if (type === 'battle_choice_locked') {
      scene = 'sealed_choice';
      beats = [{
        type: 'sealed_card',
        atMs: 0,
        durationMs: 420,
        slot: numeric(payload.decision?.slot ?? payload.slot),
        locked: payload.decision?.locked !== false,
        source: payload.decision?.source || payload.source || 'viewer',
        audioCue: 'ui.navigate'
      }];
    } else if (type === 'battle_choices_revealed') {
      scene = 'choice_reveal';
      beats = [{
        type: 'simultaneous_reveal',
        atMs: 0,
        durationMs: 680,
        choices: (Array.isArray(payload.choices) ? payload.choices : [])
          .map(choice => ({
            slot: numeric(choice?.slot),
            choice: String(choice?.choice || ''),
            source: choice?.source === 'timeout' ? 'timeout' : 'viewer'
          }))
          .filter(choice => [1, 2].includes(choice.slot) && ['A', 'B', 'C'].includes(choice.choice))
          .sort((left, right) => left.slot - right.slot),
        peak: true,
        audioCue: 'ui.navigate'
      }];
    } else if (type === 'battle_skill_used') {
      scene = 'battle_action';
      const action = payload.action && typeof payload.action === 'object'
        ? { ...payload.action, eventId: payload.eventId || payload.action.eventId }
        : payload;
      beats = numeric(action.rulesVersion ?? payload.rulesVersion) >= 7
        ? buildJackpotActionTimeline(action)
        : buildArcadeActionBeats(action);
    } else if (type === 'battle_completed') {
      scene = 'battle_finale';
      beats = [{
        type: 'winner_frame',
        atMs: 0,
        durationMs: 4000,
        winnerSlot: numeric(payload.winnerSlot),
        peak: true,
        audioCue: 'arena.victory',
        audioDucking: { amount: 0.3, durationMs: 1300 }
      }];
      (Array.isArray(payload.xp) ? payload.xp : []).forEach((reward, index) => {
        beats.push({
          type: 'xp_reward',
          atMs: 1600 + (index * 420),
          durationMs: 520,
          slot: numeric(reward?.slot),
          amount: numeric(reward?.amount),
          audioCue: 'progress.xp'
        });
      });
      if (numeric(payload.streak) > 1) {
        beats.push({
          type: 'win_streak',
          atMs: 2500,
          durationMs: 720,
          count: numeric(payload.streak),
          peak: numeric(payload.streak) >= 5,
          audioCue: 'progress.level'
        });
      }
      if (payload.rating?.tierChanged || payload.rankChanged) {
        beats.push({
          type: 'rank_up',
          atMs: 3300,
          durationMs: 1100,
          tier: payload.rating?.tier || payload.tier || null,
          peak: true,
          audioCue: 'progress.rank',
          audioDucking: { amount: 0.35, durationMs: 900 }
        });
      }
    } else if (type === 'monster_xp_awarded' || type === 'monster_level_up') {
      scene = 'progression';
      beats = [{
        type: type === 'monster_level_up' ? 'level_up' : 'xp_reward',
        atMs: 0,
        durationMs: type === 'monster_level_up' ? 1100 : 720,
        amount: numeric(payload.amount),
        peak: type === 'monster_level_up',
        audioCue: type === 'monster_level_up' ? 'progress.level' : 'progress.xp'
      }];
    } else if (type === 'arena_rating_changed' || type === 'season_rank_changed') {
      scene = 'rank';
      const tierChanged = type === 'season_rank_changed' ||
        payload.tierChanged === true ||
        payload.rankChanged === true ||
        (
          payload.before?.tier != null &&
          payload.after?.tier != null &&
          String(payload.before.tier) !== String(payload.after.tier)
        );
      beats = [{
        type: tierChanged ? 'rank_up' : 'rating_update',
        atMs: 0,
        durationMs: tierChanged ? 1100 : 720,
        tier: payload.after?.tier || payload.rank || null,
        rating: numeric(payload.after?.rating ?? payload.rating),
        delta: numeric(payload.delta),
        peak: tierChanged,
        audioCue: tierChanged ? 'progress.rank' : 'ui.navigate',
        ...(tierChanged
          ? { audioDucking: { amount: 0.35, durationMs: 900 } }
          : {})
      }];
    }
    return decorateTimeline({
      type,
      payload,
      scene,
      beats,
      reducedMotion: Boolean(options.reducedMotion)
    });
  }

  function resolveQuality({ requested = 'auto', fps = 60 } = {}) {
    const normalized = QUALITY_MODES.has(requested) ? requested : 'auto';
    if (normalized !== 'auto') return normalized;
    const measured = Number(fps);
    if (!Number.isFinite(measured) || measured >= 50) return 'high';
    if (measured >= 30) return 'medium';
    return 'low';
  }

  function resolveRenderer({
    webgpuAvailable = false,
    requestedQuality = 'auto',
    fps = 60,
    reducedMotion = false,
    deviceLost = false
  } = {}) {
    const quality = resolveQuality({ requested: requestedQuality, fps });
    if (reducedMotion) {
      return { renderer: 'css', quality: 'low', fallbackReason: 'reduced_motion' };
    }
    if (webgpuAvailable && !deviceLost) {
      return { renderer: 'webgpu', quality, fallbackReason: null };
    }
    return {
      renderer: 'canvas2d',
      quality: quality === 'high' ? 'medium' : quality,
      fallbackReason: deviceLost ? 'webgpu_device_lost' : 'webgpu_unavailable'
    };
  }

  function createDirectorModel() {
    let activeMatch = null;
    let cursor = 0;
    const accepted = new Set();
    return {
      applySnapshot(snapshot = {}) {
        const candidate = Array.isArray(snapshot.matches)
          ? snapshot.matches.find(match => ['roster', 'action', 'finalizing'].includes(match?.state))
          : null;
        activeMatch = candidate ? {
          ...candidate,
          fighters: normalizeFighters(candidate.fighters),
          cursor: Math.max(0, numeric(candidate.cursor))
        } : null;
        cursor = activeMatch?.cursor || 0;
        accepted.clear();
        return { activeMatch };
      },
      acceptAction(matchId, action = {}) {
        const sequence = Math.max(0, numeric(action.eventSequence ?? action.sequence));
        if (!activeMatch || activeMatch.matchId !== matchId || sequence <= cursor) return false;
        const fingerprint = `${matchId}:${sequence}`;
        if (accepted.has(fingerprint)) return false;
        accepted.add(fingerprint);
        cursor = sequence;
        activeMatch.cursor = sequence;
        return true;
      },
      activeMatch: () => activeMatch,
      cursor: () => cursor
    };
  }

  return {
    ELEMENTS,
    createArenaGeometry,
    canonicalImageUrl,
    normalizeFighters,
    buildElementalHourPresentation,
    buildElementalHourEventPresentation,
    buildEvolutionPresentation,
    buildActionTimeline,
    buildJackpotActionTimeline,
    buildArcadeTimeline,
    resolveQuality,
    resolveRenderer,
    createDirectorModel
  };
}));
