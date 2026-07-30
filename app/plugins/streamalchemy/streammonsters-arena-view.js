(function attachStreamMonstersArenaView(root, factory) {
  const director = typeof module === 'object' && module.exports
    ? require('./streammonsters-arena-director')
    : root.StreamMonstersArenaDirector;
  const api = factory(director);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersArenaView = api;
}(typeof globalThis === 'object' ? globalThis : this, ArenaDirector => {
  'use strict';

  const SILENT_OUTPUT = Object.freeze({
    play: async () => false
  });

  function numeric(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, numeric(value)));
  }

  function boundedReportInteger(value, minimum = 0) {
    return Math.round(Math.max(
      minimum,
      Math.min(1_000_000, numeric(value))
    ));
  }

  function boundedReportText(value, maximum = 80) {
    return String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, maximum);
  }

  function normalizeCombatReport(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const seenSlots = new Set();
    const fighters = (Array.isArray(value.fighters) ? value.fighters : [])
      .map(fighter => {
        if (!fighter || typeof fighter !== 'object' || Array.isArray(fighter)) {
          return null;
        }
        const slot = boundedReportInteger(fighter.slot);
        if (![1, 2].includes(slot) || seenSlots.has(slot)) return null;
        seenSlots.add(slot);
        const rating = fighter.rating && typeof fighter.rating === 'object'
          ? fighter.rating
          : {};
        return {
          slot,
          playerName: boundedReportText(fighter.playerName),
          monsterName: boundedReportText(fighter.monsterName),
          damageDealt: boundedReportInteger(fighter.damageDealt),
          damageBlocked: boundedReportInteger(fighter.damageBlocked),
          healingDone: boundedReportInteger(fighter.healingDone),
          shieldGained: boundedReportInteger(fighter.shieldGained),
          specialsUsed: boundedReportInteger(fighter.specialsUsed),
          xpAwarded: boundedReportInteger(fighter.xpAwarded),
          rating: {
            after: boundedReportInteger(rating.after),
            delta: boundedReportInteger(rating.delta, -1_000_000)
          }
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.slot - right.slot);
    if (
      fighters.length !== 2 ||
      fighters[0].slot !== 1 ||
      fighters[1].slot !== 2
    ) {
      return null;
    }
    const skill = value.decisiveSkill;
    const ownerSlot = boundedReportInteger(skill?.ownerSlot);
    const choice = boundedReportText(skill?.choice, 1).toUpperCase();
    const skillName = boundedReportText(skill?.skillName);
    const decisiveSkill = (
      skill &&
      typeof skill === 'object' &&
      [1, 2].includes(ownerSlot) &&
      ['A', 'B', 'C'].includes(choice) &&
      skillName
    ) ? {
        round: Math.max(1, boundedReportInteger(skill.round)),
        ownerSlot,
        choice,
        skillName,
        skillIcon: boundedReportText(skill.skillIcon, 16)
      }
      : null;
    const normalizeHighlight = highlight => {
      const slot = boundedReportInteger(highlight?.slot);
      const amount = boundedReportInteger(highlight?.amount);
      return [1, 2].includes(slot) && amount > 0 ? { slot, amount } : null;
    };
    const highlights = {
      largestHit: normalizeHighlight(value.highlights?.largestHit),
      largestBlock: normalizeHighlight(value.highlights?.largestBlock),
      largestHeal: normalizeHighlight(value.highlights?.largestHeal)
    };
    return {
      decisiveSkill,
      fighters,
      ...(Object.values(highlights).some(Boolean) ? { highlights } : {})
    };
  }

  function unwrapAction(payload = {}) {
    const action = payload.action && typeof payload.action === 'object'
      ? payload.action
      : payload;
    return {
      ...action,
      matchId: action.matchId || payload.matchId || null,
      eventId: action.eventId || payload.eventId || null,
      eventSequence: numeric(
        action.eventSequence ?? action.sequence ?? payload.sequence
      ),
      round: numeric(action.round ?? payload.round, 1)
    };
  }

  function createArenaView({
    document: documentLike,
    audio = SILENT_OUTPUT,
    effects = SILENT_OUTPUT,
    presentationEffects = effects,
    clock = {},
    choiceLabels = {},
    choiceKeys = {},
    labels: arenaLabels = {},
    labelKeys = {},
    localize = null,
    onBattleStateChange = null
  } = {}) {
    if (!documentLike) throw new Error('STREAM_MONSTERS_ARENA_DOCUMENT_REQUIRED');
    const wait = typeof clock.wait === 'function'
      ? clock.wait
      : milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
    const now = typeof clock.now === 'function' ? clock.now : () => Date.now();
    const setRepeating = typeof clock.setInterval === 'function'
      ? clock.setInterval
      : (Object.keys(clock).length
          ? null
          : (callback, milliseconds) => setInterval(callback, milliseconds));
    const clearRepeating = typeof clock.clearInterval === 'function'
      ? clock.clearInterval
      : (Object.keys(clock).length ? null : handle => clearInterval(handle));
    const arena = documentLike.getElementById('battle');
    const surface = documentLike.getElementById('streammonsters-overlay') || arena;
    const choreography = documentLike.getElementById('arcade-choreography');
    const transientPresentationClasses = Object.freeze([
      'arcade-egg-impact',
      'arcade-silhouette',
      'arcade-monster-reveal',
      'arcade-new-discovery',
      'arcade-level-up',
      'arcade-rank-up'
    ]);
    const stateBySlot = new Map();
    let activeMatchId = null;
    let activeDeadlineMs = 0;
    let activeChargeWindow = null;
    let lastEventSequence = 0;
    let countdownHandle = null;
    let surfaceVersion = 0;
    let battleSurfaceActive = false;
    let activeLocale = null;
    let renderVisibleComposite = null;
    let lastRound = 1;
    const acceptedEventIds = new Set();
    const acceptedTimelineEventIds = new Set();
    const choicesByKey = {
      A: 'Attack',
      B: 'Defense',
      C: 'Special',
      ...choiceLabels
    };
    const choiceCatalogKeys = {
      A: 'skillAttack',
      B: 'skillDefense',
      C: 'skillSpecial',
      ...choiceKeys
    };
    const labels = {
      monster: 'Monster {slot}',
      level: 'Lv. {level}',
      round: 'Runde {round}',
      roster: 'Monsterwahl',
      skill: 'Skill',
      evaded: 'AUSGEWICHEN',
      knockout: 'K. O.',
      winner: '{name} gewinnt!',
      viewer: 'Viewer',
      battleEnded: 'Kampf beendet',
      cancelledRoster: 'Kampf abgebrochen · Monsterwahl unvollständig',
      cancelled: 'Kampf abgebrochen',
      shield: 'Schild',
      special: 'Special',
      specialMissing: '{amount} charge missing',
      specialReady: 'READY',
      choiceWindow: 'NEXT / {left} & {right}: A {attack} / B {defense} / C {special}',
      sealedWaiting: '{name} sealed - waiting for opponent',
      choicesSealed: 'Both choices sealed - reveal now',
      next: 'NEXT',
      lead: '{name} führt',
      tied: 'Gleichstand',
      knockoutResult: 'K.-O.',
      forfeitResult: 'Aufgabe',
      doubleKnockoutResult: 'Doppel-K.-O.',
      draw: 'Unentschieden',
      doubleKnockoutSummary: 'Runde {round} · Beide Monster sind K. O.',
      resultSummary: 'Runde {round} · {hp}/{maxHp} HP übrig',
      ratingChanged: '{name}: {before} → {after} ({delta})',
      ratingUnchanged: '{name}: ELO unchanged ({after})',
      combatReportDecisive: 'Entscheidender Skill: {icon}{skill} · {choice} · R{round}',
      combatReportDamage: 'Schaden {amount}',
      combatReportDefense: 'Block {blocked} · Schild +{shield}',
      combatReportHealing: 'Heilung {amount}',
      combatReportSpecials: 'Specials {count}',
      combatReportXp: 'XP +{amount}',
      combatReportElo: 'ELO {after} ({delta})',
      combatReportLargestHit: 'Largest hit {amount} - {name}',
      combatReportLargestBlock: 'Largest block {amount} - {name}',
      combatReportLargestHeal: 'Largest heal {amount} - {name}',
      damageMetric: 'Schaden {amount}',
      shieldAbsorbedMetric: 'Schildtreffer {amount}',
      shieldGainMetric: 'Schild +{amount}',
      healMetric: 'Heilung {amount}',
      evadeMetric: 'Ausweichen',
      statTitle: '{player}: {monster}',
      statMeta: 'Level {level} · {remaining} Punkte übrig',
      statChoices: '1 Vitalität +1 · 2 Stärke +1 · 3 Verteidigung +1 · 4 Agilität +1',
      statResult: '{stat} +1',
      collapse: 'ARENA COLLAPSE · Runde {round}',
      collapseDefenseLocked: 'Arena Collapse: defense locks from round 11',
      effectDamage: 'Damage power +{power}',
      effectShield: 'Shield +{power}',
      effectHeal: 'Heal +{power}',
      effectBurn: 'Burn {power}',
      effectThorns: 'Thorns {power}',
      effectWeaken: 'Weaken {power}',
      effectPierce: 'Shield pierce {power}',
      effectEvade: 'Evade {chance}%',
      effectReflect: 'Reflect {power}',
      effectLifesteal: 'Lifesteal {ratio}%',
      effectHits: '{hits} hits',
      relationAdvantage: 'Element advantage: +3 damage',
      relationDisadvantage: 'Element disadvantage: opponent gets +3 damage',
      relationNeutral: 'Neutral element matchup',
      rivalryEntrance: 'RIVALRY {tier} / meeting {count}',
      rivalryTierRematch: 'REMATCH',
      rivalryTierRivals: 'RIVALS',
      rivalryTierNemesis: 'NEMESIS',
      closeBattleHint: 'CLOSE! Start the next arena; matchmaking searches fairly.',
      streakThree: '3 WINS',
      streakFive: '5 WINS',
      streakUnstoppable: 'UNSTOPPABLE',
      hit: 'HIT',
      hitCombo: '{count} HIT COMBO',
      eggShelfAria: 'Living egg shelf',
      hpAria: '{monster}: HP',
      shieldAria: '{monster}: shield',
      specialAria: '{monster}: special charge',
      skillDeckAria: '{monster}: skills',
      ...arenaLabels
    };
    const catalogKeys = {
      monster: 'arenaMonsterLabel',
      level: 'arenaLevelLabel',
      round: 'arenaRoundLabel',
      roster: 'arenaRosterChoice',
      skill: 'arenaSkillFallback',
      evaded: 'arenaEvaded',
      knockout: 'arenaKnockout',
      winner: 'arenaWinnerLabel',
      viewer: 'arenaViewerLabel',
      battleEnded: 'arenaBattleEnded',
      cancelledRoster: 'arenaCancelledRoster',
      cancelled: 'arenaCancelled',
      shield: 'arenaShieldLabel',
      special: 'arenaSpecialLabel',
      specialMissing: 'arenaSpecialMissing',
      specialReady: 'arenaSpecialReady',
      choiceWindow: 'arenaChoiceWindow',
      sealedWaiting: 'arenaSealedWaiting',
      choicesSealed: 'arenaChoicesSealed',
      next: 'arenaNext',
      lead: 'arenaLeadLabel',
      tied: 'arenaTiedLabel',
      knockoutResult: 'arenaKnockoutResult',
      forfeitResult: 'arenaForfeitResult',
      doubleKnockoutResult: 'arenaDoubleKnockoutResult',
      draw: 'arenaDrawLabel',
      doubleKnockoutSummary: 'arenaDoubleKnockoutSummary',
      resultSummary: 'arenaResultSummary',
      ratingChanged: 'arenaRatingChanged',
      ratingUnchanged: 'arenaRatingUnchanged',
      combatReportDecisive: 'arenaCombatReportDecisive',
      combatReportDamage: 'arenaCombatReportDamage',
      combatReportDefense: 'arenaCombatReportDefense',
      combatReportHealing: 'arenaCombatReportHealing',
      combatReportSpecials: 'arenaCombatReportSpecials',
      combatReportXp: 'arenaCombatReportXp',
      combatReportElo: 'arenaCombatReportElo',
      combatReportLargestHit: 'arenaCombatReportLargestHit',
      combatReportLargestBlock: 'arenaCombatReportLargestBlock',
      combatReportLargestHeal: 'arenaCombatReportLargestHeal',
      damageMetric: 'arenaDamageMetric',
      shieldAbsorbedMetric: 'arenaShieldAbsorbedMetric',
      shieldGainMetric: 'arenaShieldGainMetric',
      healMetric: 'arenaHealMetric',
      evadeMetric: 'arenaEvadeMetric',
      statTitle: 'monsterStatTitle',
      statMeta: 'monsterStatMeta',
      statChoices: 'monsterStatChoices',
      statResult: 'monsterStatResult',
      collapse: 'arenaCollapseBanner',
      collapseDefenseLocked: 'arenaCollapseDefenseLocked',
      effectDamage: 'arenaEffectDamage',
      effectShield: 'arenaEffectShield',
      effectHeal: 'arenaEffectHeal',
      effectBurn: 'arenaEffectBurn',
      effectThorns: 'arenaEffectThorns',
      effectWeaken: 'arenaEffectWeaken',
      effectPierce: 'arenaEffectPierce',
      effectEvade: 'arenaEffectEvade',
      effectReflect: 'arenaEffectReflect',
      effectLifesteal: 'arenaEffectLifesteal',
      effectHits: 'arenaEffectHits',
      relationAdvantage: 'arenaRelationAdvantage',
      relationDisadvantage: 'arenaRelationDisadvantage',
      relationNeutral: 'arenaRelationNeutral',
      rivalryEntrance: 'arenaRivalryEntrance',
      rivalryTierRematch: 'arenaRivalryTierRematch',
      rivalryTierRivals: 'arenaRivalryTierRivals',
      rivalryTierNemesis: 'arenaRivalryTierNemesis',
      closeBattleHint: 'arenaCloseBattleHint',
      streakThree: 'arenaStreakThree',
      streakFive: 'arenaStreakFive',
      streakUnstoppable: 'arenaStreakUnstoppable',
      hit: 'arenaHit',
      hitCombo: 'arenaHitCombo',
      eggShelfAria: 'eggShelfAria',
      hpAria: 'arenaHpAria',
      shieldAria: 'arenaShieldAria',
      specialAria: 'arenaSpecialAria',
      skillDeckAria: 'arenaSkillDeckAria',
      ...labelKeys
    };

    const node = id => documentLike.getElementById(id);
    const fighterNode = slot => node(`arena-fighter-${slot}`);
    const skillDeckNode = slot => documentLike.querySelector(
      `[data-skill-deck="${slot}"]`
    );
    const interpolate = (template, params = {}) => String(template || '').replace(
      /\{(\w+)\}/g,
      (match, name) => Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match
    );
    const translate = (catalogKey, params = {}, fallback = '') => {
      const normalizedKey = String(catalogKey || '').trim();
      if (typeof localize === 'function' && normalizedKey) {
        try {
          const translated = String(localize(normalizedKey, params, activeLocale) || '');
          return translated || interpolate(fallback, params);
        } catch (_) {
          return interpolate(fallback, params);
        }
      }
      return interpolate(fallback, params);
    };
    const formatLabel = (key, params = {}) => translate(
      catalogKeys[key],
      params,
      labels[key]
    );
    const choiceLabel = choice => translate(
      choiceCatalogKeys[choice],
      {},
      choicesByKey[choice]
    );
    const localizedSkillText = (key, fallback = '') => {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey) {
        return String(fallback || '');
      }
      if (
        typeof localize !== 'function' &&
        Object.prototype.hasOwnProperty.call(labels, normalizedKey)
      ) {
        return String(labels[normalizedKey] || fallback || '');
      }
      return translate(normalizedKey, {}, fallback);
    };

    function setText(id, text) {
      const target = node(id);
      if (!target) return;
      delete target.dataset.arenaLabelKey;
      delete target.dataset.arenaLabelParams;
      target.textContent = String(text ?? '');
    }

    function setLabelText(id, key, params = {}) {
      const target = node(id);
      if (!target) return;
      target.dataset.arenaLabelKey = String(key || '');
      target.dataset.arenaLabelParams = JSON.stringify(params);
      target.textContent = formatLabel(key, params);
    }

    function safeDisplayName(value, fallback = '') {
      const normalized = String(value || '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 64);
      if (
        !normalized ||
        /^(?:unknown|unbekannt|viewer)$/i.test(normalized) ||
        /^@?\d{5,}$/.test(normalized)
      ) {
        return String(fallback || formatLabel('viewer')).trim();
      }
      return normalized;
    }

    function renderCombatReport(value) {
      const target = node('arena-result-report');
      if (!target) return null;
      target.replaceChildren();
      const report = normalizeCombatReport(value);
      if (!report) {
        target.hidden = true;
        return null;
      }
      const decisive = report.decisiveSkill;
      if (decisive) {
        const decisiveNode = documentLike.createElement('strong');
        decisiveNode.className = 'arena-result-decisive';
        decisiveNode.textContent = formatLabel('combatReportDecisive', {
          icon: decisive.skillIcon ? `${decisive.skillIcon} ` : '',
          skill: decisive.skillName,
          choice: decisive.choice,
          round: decisive.round
        });
        target.appendChild(decisiveNode);
      }
      if (report.highlights) {
        const highlightNode = documentLike.createElement('div');
        highlightNode.className = 'arena-result-highlights';
        highlightNode.dataset.reportHighlights = 'true';
        [
          ['largestHit', 'combatReportLargestHit'],
          ['largestBlock', 'combatReportLargestBlock'],
          ['largestHeal', 'combatReportLargestHeal']
        ].forEach(([field, label]) => {
          const highlight = report.highlights[field];
          if (!highlight) return;
          const fighterState = stateBySlot.get(highlight.slot) || {};
          const metric = documentLike.createElement('span');
          metric.dataset.reportHighlight = field;
          metric.textContent = formatLabel(label, {
            amount:highlight.amount,
            name:safeDisplayName(fighterState.viewerName, fighterState.name)
          });
          highlightNode.appendChild(metric);
        });
        target.appendChild(highlightNode);
      }
      report.fighters.forEach(fighter => {
        const fighterState = stateBySlot.get(fighter.slot) || {};
        const card = documentLike.createElement('article');
        card.className = 'arena-result-fighter';
        card.dataset.reportFighter = String(fighter.slot);
        if (decisive?.ownerSlot === fighter.slot) card.classList.add('is-decisive');

        const identity = documentLike.createElement('strong');
        identity.className = 'arena-result-fighter-name';
        const player = safeDisplayName(
          fighter.playerName,
          fighterState.viewerName || formatLabel('viewer')
        );
        const monster = safeDisplayName(
          fighter.monsterName,
          fighterState.name || formatLabel('monster', { slot:fighter.slot })
        );
        identity.textContent = `${player} · ${monster}`;
        card.appendChild(identity);

        const metrics = documentLike.createElement('div');
        metrics.className = 'arena-result-metrics';
        const delta = fighter.rating.delta > 0
          ? `+${fighter.rating.delta}`
          : String(fighter.rating.delta);
        [
          ['damage', 'combatReportDamage', { amount:fighter.damageDealt }],
          ['defense', 'combatReportDefense', {
            blocked:fighter.damageBlocked,
            shield:fighter.shieldGained
          }],
          ['healing', 'combatReportHealing', { amount:fighter.healingDone }],
          ['specials', 'combatReportSpecials', { count:fighter.specialsUsed }],
          ['xp', 'combatReportXp', { amount:fighter.xpAwarded }],
          ['elo', 'combatReportElo', { after:fighter.rating.after, delta }]
        ].forEach(([metric, label, params]) => {
          const metricNode = documentLike.createElement('span');
          metricNode.dataset.reportMetric = metric;
          metricNode.textContent = formatLabel(label, params);
          metrics.appendChild(metricNode);
        });
        card.appendChild(metrics);
        target.appendChild(card);
      });
      target.hidden = false;
      return report;
    }

    function setBattleSurface(active, reason = '') {
      const normalized = Boolean(active);
      if (surface?.dataset) {
        surface.dataset.battleActive = String(normalized);
        if (reason) surface.dataset.battleReason = String(reason);
        else delete surface.dataset.battleReason;
      }
      if (battleSurfaceActive === normalized) return normalized;
      battleSurfaceActive = normalized;
      if (typeof onBattleStateChange === 'function') {
        try {
          onBattleStateChange({
            active: normalized,
            reason: String(reason || ''),
            matchId: activeMatchId
          });
        } catch (_) {}
      }
      return normalized;
    }

    function renderLead() {
      const left = stateBySlot.get(1);
      const right = stateBySlot.get(2);
      if (!left || !right) {
        setText('arena-lead', '');
        return null;
      }
      const leftVisible = numeric(left.hp) + numeric(left.shield);
      const rightVisible = numeric(right.hp) + numeric(right.shield);
      if (leftVisible === rightVisible) {
        setLabelText('arena-lead', 'tied');
        return { slot: 0, value: leftVisible };
      }
      const slot = leftVisible > rightVisible ? 1 : 2;
      const fighter = stateBySlot.get(slot) || {};
      setLabelText('arena-lead', 'lead', {
        name: safeDisplayName(fighter.viewerName, fighter.name)
      });
      return { slot, value: Math.max(leftVisible, rightVisible) };
    }

    function actionMetrics(action = {}) {
      const hits = Array.isArray(action.hits) ? action.hits : [];
      const outcomes = Array.isArray(action.outcomes) ? action.outcomes : [];
      const damage = hits.reduce((sum, hit) => (
        sum + (hit?.evaded ? 0 : Math.max(0, numeric(hit?.hpDamage)))
      ), 0);
      const absorbed = hits.reduce((sum, hit) => (
        sum + (hit?.evaded ? 0 : Math.max(0, numeric(hit?.shieldAbsorbed)))
      ), 0);
      const shield = outcomes
        .filter(outcome => outcome?.type === 'shield')
        .reduce((sum, outcome) => sum + Math.max(0, numeric(outcome?.amount)), 0);
      const heal = outcomes
        .filter(outcome => ['heal', 'lifesteal'].includes(outcome?.type))
        .reduce((sum, outcome) => sum + Math.max(0, numeric(outcome?.amount)), 0);
      const metrics = [];
      if (damage > 0) metrics.push(formatLabel('damageMetric', { amount:damage }));
      if (absorbed > 0) metrics.push(formatLabel('shieldAbsorbedMetric', { amount:absorbed }));
      if (shield > 0) metrics.push(formatLabel('shieldGainMetric', { amount:shield }));
      if (heal > 0) metrics.push(formatLabel('healMetric', { amount:heal }));
      if (hits.some(hit => hit?.evaded)) metrics.push(formatLabel('evadeMetric'));
      return metrics;
    }

    function renderActionCard(action = {}) {
      const actor = stateBySlot.get(numeric(action.actorSlot)) || {};
      const skillName = action.skill?.nameKey
        ? localizedSkillText(action.skill.nameKey, action.skill?.name)
        : String(action.skill?.name || formatLabel('skill'));
      const skillCopy = action.skill?.shortTextKey
        ? localizedSkillText(action.skill.shortTextKey, action.skill?.shortText)
        : String(action.skill?.shortText || '');
      setText('arena-action-player', safeDisplayName(actor.viewerName, actor.name));
      setText('arena-action-key', String(action.choice || '').toUpperCase());
      setText('arena-action-skill', skillName);
      setText('arena-action-copy', skillCopy);
      setText('arena-action-metrics', actionMetrics(action).join(' · '));
      node('arena-action-card')?.classList.add('visible');
    }

    function showStatPrompt(payload = {}) {
      const player = safeDisplayName(payload.playerName || payload.displayName);
      const monster = safeDisplayName(payload.monster?.name, formatLabel('monster', { slot:1 }));
      const level = Math.max(1, numeric(payload.level ?? payload.monster?.level, 1));
      const remaining = Math.max(0, numeric(
        payload.remainingUnspentPoints ??
        payload.monster?.unspentStatPoints ??
        payload.monster?.unspent_stat_points
      ));
      setLabelText('arena-stat-title', 'statTitle', { player, monster });
      setLabelText('arena-stat-meta', 'statMeta', { level, remaining });
      setLabelText('arena-stat-choices', 'statChoices');
      node('arena-stat-card')?.classList.add('visible', 'prompt');
      return true;
    }

    function showStatResult(payload = {}) {
      showStatPrompt(payload);
      const stat = String(payload.stat || '').trim() || formatLabel('skill');
      setLabelText('arena-stat-meta', 'statResult', { stat });
      node('arena-stat-card')?.classList.remove('prompt');
      node('arena-stat-card')?.classList.add('result');
      return true;
    }

    function refreshLocalizedText() {
      documentLike.querySelectorAll('[data-arena-label-key]').forEach(target => {
        let params = {};
        try {
          params = JSON.parse(target.dataset.arenaLabelParams || '{}');
        } catch (_) {}
        target.textContent = formatLabel(target.dataset.arenaLabelKey, params);
      });
    }

    function refreshLocalizedAccessibility() {
      node('egg-shelf')?.setAttribute('aria-label', formatLabel('eggShelfAria'));
      for (const slot of [1, 2]) {
        const state = stateBySlot.get(slot) || {};
        const monster = safeDisplayName(
          state.name,
          formatLabel('monster', { slot })
        );
        node(`arena-hp-${slot}`)?.setAttribute(
          'aria-label',
          formatLabel('hpAria', { monster })
        );
        node(`arena-shield-${slot}`)?.setAttribute(
          'aria-label',
          formatLabel('shieldAria', { monster })
        );
        node(`arena-charge-${slot}`)?.setAttribute(
          'aria-label',
          formatLabel('specialAria', { monster })
        );
        node(`arena-charge-ring-${slot}`)?.setAttribute(
          'aria-label',
          formatLabel('specialAria', { monster })
        );
        skillDeckNode(slot)?.setAttribute(
          'aria-label',
          formatLabel('skillDeckAria', { monster })
        );
      }
    }

    function setMeter(id, value) {
      const target = node(id);
      if (!target) return;
      const percent = clampPercent(value);
      target.style.width = `${percent}%`;
      target.setAttribute('aria-valuenow', String(Math.round(percent)));
    }

    function normalizeChargeWindow(payload = {}) {
      const source = payload.chargeWindow || payload.charge_window || (
        payload.actionOpenedAtMs || payload.actionDeadlineMs
          ? {
              openedAtMs: payload.actionOpenedAtMs,
              deadlineMs: payload.actionDeadlineMs,
              passivePerSecond: payload.passivePerSecond
            }
          : null
      );
      if (!source || typeof source !== 'object') return null;
      const openedAtMs = numeric(source.openedAtMs, -1);
      const deadlineMs = numeric(source.deadlineMs, -1);
      const passivePerSecond = Math.max(0, numeric(source.passivePerSecond));
      const maxGain = numeric(source.maxGain, -1);
      if (openedAtMs < 0 || deadlineMs < openedAtMs) return null;
      return {
        openedAtMs,
        deadlineMs,
        passivePerSecond,
        ...(maxGain >= 0 ? { maxGain: Math.min(100, maxGain) } : {}),
        pausedMs: Math.max(0, numeric(source.pausedMs)),
        pauseStartedAtMs: numeric(source.pauseStartedAtMs, -1),
        pauseUntilMs: numeric(source.pauseUntilMs, -1)
      };
    }

    function formatMechanicalEffects(effects = []) {
      const copy = [];
      for (const effect of Array.isArray(effects) ? effects : []) {
        const type = String(effect?.type || '').toLowerCase();
        const power = numeric(effect?.power);
        if (type === 'damage') {
          copy.push(formatLabel('effectDamage', { power }));
        } else if (type === 'shield') {
          copy.push(formatLabel('effectShield', { power }));
        } else if (type === 'heal') {
          copy.push(formatLabel('effectHeal', { power }));
        } else if (type === 'burn') {
          copy.push(formatLabel('effectBurn', { power }));
        } else if (type === 'thorns') {
          copy.push(formatLabel('effectThorns', { power }));
        } else if (type === 'weaken') {
          copy.push(formatLabel('effectWeaken', { power }));
        } else if (type === 'pierce') {
          copy.push(formatLabel('effectPierce', { power }));
        } else if (type === 'evade') {
          copy.push(formatLabel('effectEvade', {
            chance:Math.round(Math.max(0, Math.min(100, numeric(effect.chance))))
          }));
        } else if (type === 'reflect') {
          copy.push(formatLabel('effectReflect', { power }));
        } else if (type === 'lifesteal') {
          copy.push(formatLabel('effectLifesteal', {
            ratio:Math.round(Math.max(0, Math.min(1, numeric(effect.ratio))) * 100)
          }));
        }
        const hits = Math.max(0, Math.round(numeric(effect?.hits)));
        if (hits > 1) copy.push(formatLabel('effectHits', { hits }));
      }
      return copy.filter(Boolean);
    }

    function renderChargeState(slot, charge, ready = charge >= 100) {
      const percent = clampPercent(charge);
      setMeter(`arena-charge-${slot}`, percent);
      const ring = node(`arena-charge-ring-${slot}`);
      if (ring) {
        const state = stateBySlot.get(slot) || {};
        const monster = safeDisplayName(
          state.name,
          formatLabel('monster', { slot })
        );
        ring.setAttribute('role', 'progressbar');
        ring.setAttribute('aria-valuemin', '0');
        ring.setAttribute('aria-valuemax', '100');
        ring.setAttribute('aria-valuenow', String(Math.round(percent)));
        ring.setAttribute('aria-label', formatLabel('specialAria', { monster }));
        ring.style.setProperty('--charge-percent', `${percent}%`);
        ring.classList.toggle('ready', Boolean(ready));
      }
      setText(
        `arena-charge-ready-${slot}`,
        ready ? formatLabel('specialReady') : ''
      );
    }

    function renderSkillDeck(slot) {
      const deck = skillDeckNode(slot);
      if (!deck) return;
      const fighter = stateBySlot.get(slot) || {};
      const skills = Array.isArray(fighter.skills) ? fighter.skills : [];
      for (const choice of ['A', 'B', 'C']) {
        const card = deck.querySelector(`[data-skill="${choice}"]`);
        if (!card) continue;
        const skill = skills.find(entry => entry?.choice === choice);
        card.hidden = !skill;
        card.classList.remove(
          'charging',
          'ready',
          'unavailable',
          'anticipation-75',
          'anticipation-90',
          'anticipation-100'
        );
        if (!skill) {
          for (const className of [
            'skill-icon',
            'skill-choice',
            'skill-name',
            'skill-copy',
            'skill-charge'
          ]) {
            const target = card.querySelector(`.${className}`);
            if (target) target.textContent = '';
          }
          continue;
        }
        const setSkillText = (className, text) => {
          const target = card.querySelector(`.${className}`);
          if (target) target.textContent = String(text ?? '');
        };
        setSkillText('skill-icon', skill.icon);
        setSkillText('skill-choice', choice);
        setSkillText(
          'skill-name',
          skill.nameKey
            ? localizedSkillText(skill.nameKey, skill.name)
            : (typeof localize === 'function'
                ? formatLabel('skill')
                : (skill.name || choiceLabel(choice) || labels.skill))
        );
        const relation = ['advantage', 'disadvantage', 'neutral'].includes(
          skill.elementRelation
        )
          ? formatLabel(
              skill.elementRelation === 'advantage'
                ? 'relationAdvantage'
                : skill.elementRelation === 'disadvantage'
                  ? 'relationDisadvantage'
                  : 'relationNeutral'
            )
          : '';
        const skillCopy = skill.unavailableReason === 'arena_collapse_defense_locked'
          ? [formatLabel('collapseDefenseLocked')]
          : [
              localizedSkillText(skill.shortTextKey, skill.shortText),
              ...formatMechanicalEffects(skill.effects),
              relation
            ];
        setSkillText('skill-copy', skillCopy.filter(Boolean).join(' · '));
        if (choice !== 'C') {
          setSkillText('skill-charge', '');
          card.classList.toggle('unavailable', skill.available === false);
          continue;
        }
        const required = Math.max(1, numeric(skill.chargeRequired, 100));
        const window = activeChargeWindow;
        const asOfMs = window
          ? Math.min(window.deadlineMs, Math.max(window.openedAtMs, now()))
          : now();
        const currentPauseMs = window && window.pauseStartedAtMs >= 0
          ? Math.max(
              0,
              Math.min(
                asOfMs,
                window.pauseUntilMs >= 0 ? window.pauseUntilMs : asOfMs
              ) - Math.max(window.openedAtMs, window.pauseStartedAtMs)
            )
          : 0;
        const baseCharge = numeric(fighter.charge);
        const passiveGain = window
          ? Math.max(0, (
              asOfMs -
              window.openedAtMs -
              window.pausedMs -
              currentPauseMs
            ) / 1_000) * window.passivePerSecond
          : 0;
        const projectedCharge = window
          ? baseCharge + Math.min(
              passiveGain,
              numeric(window.maxGain, Number.POSITIVE_INFINITY)
            )
          : baseCharge;
        const readyAtMs = numeric(skill.readyAtMs, Number.POSITIVE_INFINITY);
        const canReachRequired = !window ||
          numeric(window.maxGain, Number.POSITIVE_INFINITY) >= required - baseCharge;
        const ready = skill.available === true ||
          projectedCharge >= required ||
          (canReachRequired && asOfMs >= readyAtMs);
        const charge = ready ? required : Math.max(0, Math.min(required, projectedCharge));
        const rawChargePercent = (charge / required) * 100;
        const chargePercent = ready ? 100 : Math.floor(rawChargePercent);
        const missingCharge = Math.max(0, Math.ceil(required - charge));
        setSkillText(
          'skill-charge',
          ready
            ? `${chargePercent}% · ${formatLabel('specialReady')}`
            : `${chargePercent}% \u00b7 ${formatLabel('specialMissing', {
                amount:missingCharge
              })}`
        );
        renderChargeState(slot, chargePercent, ready);
        card.classList.toggle('charging', !ready);
        card.classList.toggle('ready', ready);
        card.classList.toggle(
          'anticipation-75',
          !ready && rawChargePercent >= 75 && rawChargePercent < 90
        );
        card.classList.toggle(
          'anticipation-90',
          !ready && rawChargePercent >= 90
        );
        card.classList.toggle('anticipation-100', ready);
      }
    }

    function renderSkillDecks() {
      for (const slot of [1, 2]) renderSkillDeck(slot);
    }

    function pulseClass(target, className) {
      if (!target) return;
      target.classList.remove(className);
      void target.offsetWidth;
      target.classList.add(className);
    }

    function resetChoreography() {
      if (!choreography) return;
      choreography.className = '';
      for (const key of ['phase', 'element', 'crack']) {
        delete choreography.dataset[key];
      }
      const roulette = node('arcade-roulette');
      if (roulette) roulette.textContent = '';
      const image = node('arcade-egg-image');
      if (image) {
        image.removeAttribute('src');
        image.alt = '';
      }
    }

    function showChoreography(payload, phase, element = null) {
      if (!choreography) return;
      choreography.classList.add('visible');
      choreography.dataset.phase = phase;
      choreography.dataset.element = String(
        element || payload?.egg?.element || payload?.monster?.element || ''
      ).toLowerCase();
      const image = node('arcade-egg-image');
      const imageUrl = payload?.egg?.imageUrl || payload?.egg?.image_url;
      if (image && imageUrl) {
        image.src = imageUrl;
        image.alt = String(payload?.egg?.element || 'Monster egg');
      }
    }

    function renderState(slot, incoming = {}) {
      const prior = stateBySlot.get(slot) || {};
      const maxHp = Math.max(1, numeric(incoming.maxHp, numeric(prior.maxHp, 1)));
      const hp = Math.max(0, Math.min(maxHp, numeric(incoming.hp, numeric(prior.hp, maxHp))));
      const state = {
        ...prior,
        ...incoming,
        hp,
        maxHp,
        shield: Math.max(0, numeric(incoming.shield, numeric(prior.shield))),
        charge: clampPercent(incoming.charge ?? prior.charge)
      };
      stateBySlot.set(slot, state);
      const fallbackName = formatLabel('monster', { slot });
      const publicMonsterName = safeDisplayName(state.name, fallbackName);
      const publicViewerName = safeDisplayName(
        state.viewerName,
        formatLabel('viewer')
      );
      setText(`arena-name-${slot}`, publicMonsterName);
      setText(`arena-owner-${slot}`, publicViewerName);
      setText(
        `arena-choice-owner-${slot}`,
        `${publicViewerName} · ${publicMonsterName}`
      );
      setLabelText(`arena-level-${slot}`, 'level', {
        level: Math.max(1, numeric(state.level, 1))
      });
      setText(`arena-hp-text-${slot}`, `${state.hp} / ${state.maxHp}`);
      setLabelText(`arena-shield-label-${slot}`, 'shield');
      setLabelText(`arena-special-label-${slot}`, 'special');
      setMeter(`arena-hp-${slot}`, (state.hp / state.maxHp) * 100);
      setMeter(`arena-shield-${slot}`, Math.min(100, state.shield * 10));
      renderChargeState(slot, state.charge, state.charge >= 100);
      const image = node(`arena-image-${slot}`);
      if (image && state.imageUrl) {
        image.src = state.imageUrl;
        image.alt = publicMonsterName;
      }
      const fighter = fighterNode(slot);
      if (fighter) {
        fighter.dataset.element = String(state.element || '').toLowerCase();
        fighter.dataset.slot = String(slot);
      }
      renderSkillDeck(slot);
      renderLead();
      refreshLocalizedAccessibility();
      return state;
    }

    function renderFighters(fighters = []) {
      const normalized = ArenaDirector.normalizeFighters(fighters);
      for (const fighter of normalized) renderState(fighter.slot, fighter);
      return normalized;
    }

    function resetFighters() {
      stateBySlot.clear();
      activeChargeWindow = null;
      renderVisibleComposite = null;
      acceptedEventIds.clear();
      lastEventSequence = 0;
      for (const slot of [1, 2]) {
        const fighter = fighterNode(slot);
        if (fighter) {
          fighter.className = 'arena-fighter';
          fighter.dataset.slot = String(slot);
          delete fighter.dataset.choice;
          delete fighter.dataset.choiceSource;
          delete fighter.dataset.element;
        }
        const image = node(`arena-image-${slot}`);
        if (image) {
          image.removeAttribute('src');
          image.alt = '';
        }
        renderState(slot, {
          name: formatLabel('monster', { slot }),
          level: 1,
          hp: 0,
          maxHp: 1,
          shield: 0,
          charge: 0
        });
        const deck = skillDeckNode(slot);
        deck?.querySelectorAll('[data-skill]').forEach(card => {
          card.classList.remove('selected', 'charging', 'ready', 'unavailable');
        });
      }
    }

    function activateMatch(matchId) {
      const nextId = matchId ? String(matchId) : activeMatchId;
      if (nextId && activeMatchId !== nextId) {
        resetFighters();
        surfaceVersion += 1;
      }
      activeMatchId = nextId || null;
    }

    function renderCountdown(deadlineMs = activeDeadlineMs) {
      activeDeadlineMs = Math.max(0, numeric(deadlineMs));
      const seconds = Math.max(0, Math.ceil((activeDeadlineMs - now()) / 1000));
      setText('arena-countdown', activeDeadlineMs ? `${seconds}s` : '');
      if (arena) arena.dataset.countdown = String(seconds);
      renderSkillDecks();
      return seconds;
    }

    function stopCountdown() {
      if (countdownHandle == null) return;
      clearRepeating?.(countdownHandle);
      countdownHandle = null;
    }

    function startCountdown(deadlineMs) {
      stopCountdown();
      const remaining = renderCountdown(deadlineMs);
      if (!remaining || !setRepeating) return;
      countdownHandle = setRepeating(() => {
        if (renderCountdown() > 0) return;
        stopCountdown();
      }, 250);
    }

    function fire(output, cue, payload) {
      try {
        Promise.resolve(output?.play?.(cue, payload)).catch(() => {});
      } catch (_) {}
    }

    function rememberTimelineEvent(eventId) {
      const normalized = String(eventId || '').trim();
      if (!normalized || acceptedTimelineEventIds.has(normalized)) return false;
      acceptedTimelineEventIds.add(normalized);
      while (acceptedTimelineEventIds.size > 512) {
        acceptedTimelineEventIds.delete(acceptedTimelineEventIds.values().next().value);
      }
      return true;
    }

    function syncRendererStatus() {
      let status = {};
      try {
        status = effects?.status?.() || {};
      } catch (_) {}
      const renderer = String(status.backend || status.renderer || 'css');
      const fallbackReason = status.fallbackReason == null
        ? null
        : String(status.fallbackReason);
      if (surface?.dataset) {
        surface.dataset.renderer = renderer;
        if (fallbackReason) surface.dataset.fallbackReason = fallbackReason;
        else delete surface.dataset.fallbackReason;
      }
      return { renderer, fallbackReason };
    }

    function fireTimelineOutputs(beat, payload = {}, effectOutput = effects) {
      if (beat.effect?.scene) {
        const hits = Array.isArray(beat.hits)
          ? beat.hits
          : (Array.isArray(payload.hits) ? payload.hits : []);
        const outcomes = Array.isArray(beat.outcomes)
          ? beat.outcomes
          : (Array.isArray(payload.outcomes) ? payload.outcomes : []);
        const statusEffects = Array.isArray(beat.statusEffects)
          ? beat.statusEffects
          : (Array.isArray(payload.statusEffects) ? payload.statusEffects : []);
        fire(effectOutput, beat.effect.scene, {
          ...beat.effect,
          eventId: beat.eventId,
          beatId: beat.beatId,
          correlationId: payload.correlationId || null,
          motion: beat.motion,
          actorSlot: numeric(beat.actorSlot ?? payload.actorSlot) || null,
          targetSlot: numeric(beat.targetSlot ?? payload.targetSlot) || null,
          hitIndex: numeric(beat.hitIndex ?? payload.hitIndex) || 1,
          hitCount: Math.max(
            1,
            numeric(beat.hitCount ?? payload.hitCount) || hits.length || 1
          ),
          hits,
          outcomes,
          statusEffects,
          hpDamage: numeric(beat.hpDamage ?? payload.hpDamage),
          shieldAbsorbed: numeric(beat.shieldAbsorbed ?? payload.shieldAbsorbed),
          shieldGain: numeric(beat.shieldGain ?? payload.shieldGain),
          healing: numeric(beat.healing ?? payload.healing),
          evaded: Boolean(beat.evaded ?? payload.evaded)
        });
      }
      if (beat.audioCue) {
        fire(audio, beat.audioCue, {
          eventId: beat.beatId,
          timelineEventId: beat.eventId,
          duck: beat.audioDucking || false
        });
      }
    }

    function clearArenaStamps() {
      for (const id of ['arena-rivalry-stamp', 'arena-streak-stamp']) {
        const stamp = node(id);
        if (!stamp) continue;
        stamp.classList.remove('visible');
        stamp.textContent = '';
        delete stamp.dataset.tier;
      }
      if (arena) {
        arena.classList.remove('rivalry-entrance');
        delete arena.dataset.rivalryTier;
      }
    }

    function applyMatch(match = {}) {
      activateMatch(match.matchId);
      clearArenaStamps();
      setBattleSurface(true, match.state || 'match');
      activeChargeWindow = normalizeChargeWindow(match);
      lastEventSequence = Math.max(
        lastEventSequence,
        numeric(match.cursor ?? match.eventSequence)
      );
      renderFighters(match.fighters);
      if (arena) {
        arena.classList.add('visible');
        arena.dataset.matchId = String(activeMatchId || '');
        arena.dataset.phase = String(match.state || 'roster');
        arena.removeAttribute('data-terminal');
      }
      if (match.roundNumber || match.round) {
        lastRound = Math.max(1, numeric(match.roundNumber ?? match.round, lastRound));
        setLabelText('arena-round', 'round', {
          round:lastRound
        });
      } else {
        setLabelText('arena-round', 'roster');
      }
      renderVisibleComposite = null;
      startCountdown(match.actionDeadlineMs || match.rosterDeadlineMs || 0);
      return match;
    }

    function lockRoster(payload = {}) {
      const slot = numeric(payload.slot ?? payload.fighter?.slot);
      if (![1, 2].includes(slot)) return false;
      activateMatch(payload.matchId);
      setBattleSurface(true, 'roster');
      if (payload.fighter) renderFighters([payload.fighter]);
      const fighter = fighterNode(slot);
      fighter?.classList.add('roster-locked');
      const params = {
        ...(payload.params && typeof payload.params === 'object'
          ? payload.params
          : {}),
        name: String(
          payload.params?.name ||
          payload.fighter?.name ||
          stateBySlot.get(slot)?.name ||
          formatLabel('monster', { slot })
        )
      };
      const title = translate(
        payload.titleKey,
        params,
        payload.selectionSource === 'sole_eligible'
          ? 'Fighter selected automatically'
          : formatLabel('roster')
      );
      const body = translate(
        payload.bodyKey,
        params,
        payload.selectionSource === 'sole_eligible'
          ? `${params.name} fights immediately`
          : `${params.name} is locked`
      );
      const renderRosterLock = () => setText(
        'arena-feed',
        [title, body].filter(Boolean).join(' · ')
      );
      renderVisibleComposite = renderRosterLock;
      renderRosterLock();
      return true;
    }

    function openChoice(payload = {}) {
      activateMatch(payload.matchId);
      clearArenaStamps();
      setBattleSurface(true, 'choice');
      activeChargeWindow = normalizeChargeWindow(payload);
      if (payload.fighters) renderFighters(payload.fighters);
      const round = Math.max(1, numeric(payload.round ?? payload.roundNumber, 1));
      lastRound = round;
      const choices = Array.isArray(payload.choices) && payload.choices.length
        ? payload.choices
        : ['A', 'B', 'C'];
      const nextChoices = choices
        .filter(choice => ['A', 'B', 'C'].includes(choice));
      const renderChoiceCopy = () => {
        setLabelText('arena-round', 'round', { round });
        const fighters = [1, 2].map(slot => stateBySlot.get(slot) || {});
        const actorNames = fighters.map((fighter, index) => safeDisplayName(
          fighter.viewerName,
          fighter.name || formatLabel('monster', { slot:index + 1 })
        ));
        if (
          nextChoices.length === 3 &&
          ['A', 'B', 'C'].every(choice => nextChoices.includes(choice))
        ) {
          setLabelText('arena-skill-prompt', 'choiceWindow', {
            left:actorNames[0],
            right:actorNames[1],
            attack:choiceLabel('A'),
            defense:choiceLabel('B'),
            special:choiceLabel('C')
          });
        } else {
          setText(
            'arena-skill-prompt',
            [
              formatLabel('next'),
              actorNames.filter(Boolean).join(' & '),
              ...nextChoices.map(choice => `${choice} ${choiceLabel(choice)}`.trim())
            ].filter(Boolean).join(' / ')
          );
        }
      };
      renderVisibleComposite = renderChoiceCopy;
      renderChoiceCopy();
      startCountdown(payload.deadlineMs || payload.actionDeadlineMs || 0);
      if (arena) {
        arena.classList.add('visible');
        arena.dataset.phase = 'choice';
      }
      node('arena-action-card')?.classList.remove('visible');
      for (const slot of [1, 2]) {
        const fighter = fighterNode(slot);
        fighter?.classList.remove('choice-locked');
        fighter?.classList.remove('choice-revealed');
        if (fighter) {
          delete fighter.dataset.choice;
          delete fighter.dataset.choiceSource;
        }
        const deck = skillDeckNode(slot);
        deck?.querySelectorAll('[data-skill]').forEach(card => {
          card.classList.remove('selected');
        });
      }
      renderSkillDecks();
    }

    function setLocale(locale) {
      activeLocale = String(locale || '').trim().toLowerCase() || activeLocale;
      refreshLocalizedText();
      renderSkillDecks();
      renderVisibleComposite?.();
      refreshLocalizedAccessibility();
      return activeLocale;
    }

    function lockChoice(payload = {}) {
      const decision = payload.decision || payload;
      const slot = numeric(decision.slot);
      if (![1, 2].includes(slot)) return false;
      const fighter = fighterNode(slot);
      if (!fighter) return false;
      delete fighter.dataset.choice;
      fighter.dataset.choiceSource = (
        decision.timeout || decision.source === 'timeout'
      ) ? 'timeout' : 'viewer';
      fighter.classList.add('choice-locked');
      const lockedSlots = [1, 2].filter(candidate => (
        fighterNode(candidate)?.classList.contains('choice-locked')
      ));
      const renderSealedFeedback = () => {
        if (lockedSlots.length === 2) {
          setLabelText('arena-skill-prompt', 'choicesSealed');
          return;
        }
        const state = stateBySlot.get(slot) || {};
        setLabelText('arena-skill-prompt', 'sealedWaiting', {
          name:safeDisplayName(state.viewerName, state.name)
        });
      };
      renderVisibleComposite = renderSealedFeedback;
      renderSealedFeedback();
      return true;
    }

    function revealChoices(payload = {}) {
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      if (choices.length !== 2) return false;
      const projected = choices.map(choice => ({
        slot: numeric(choice?.slot),
        choice: choice?.choice,
        source: choice?.source === 'timeout' ? 'timeout' : 'viewer'
      })).sort((left, right) => left.slot - right.slot);
      if (
        projected.some(choice => (
          ![1, 2].includes(choice.slot) ||
          !['A', 'B', 'C'].includes(choice.choice)
        )) ||
        projected[0].slot === projected[1].slot ||
        projected.some(choice => !fighterNode(choice.slot))
      ) {
        return false;
      }
      projected.forEach(choice => {
        const fighter = fighterNode(choice.slot);
        skillDeckNode(choice.slot)?.querySelectorAll('[data-skill]').forEach(card => {
          card.classList.toggle('selected', card.dataset.skill === choice.choice);
        });
        fighter.dataset.choice = choice.choice;
        fighter.dataset.choiceSource = choice.source;
        fighter.classList.add('choice-locked', 'choice-revealed');
      });
      return true;
    }

    function applyHit(action, hit) {
      const target = stateBySlot.get(action.targetSlot) || {};
      renderState(action.targetSlot, {
        ...target,
        hp: Math.max(0, numeric(target.hp) - Math.max(0, numeric(hit.hpDamage))),
        shield: Math.max(0, numeric(target.shield) - Math.max(0, numeric(hit.shieldAbsorbed)))
      });
    }

    function cueForSkill(skill = {}) {
      const element = String(skill.element || '').trim().toLowerCase();
      return element ? `element.${element}` : null;
    }

    function playBeat(beat, action, beatIndex, timeline) {
      const actor = fighterNode(action.actorSlot);
      const target = fighterNode(action.targetSlot);
      const compatibleType = {
        entrance: 'telegraph',
        movement: 'advance',
        projectile: 'element_trail',
        hit: 'impact',
        number_pop: 'damage_number',
        hud_update: 'hud',
        recoil: 'camera_impulse',
        recovery: 'recover'
      }[beat.type] || beat.type;
      switch (compatibleType) {
        case 'telegraph': {
          const renderTelegraphCopy = () => {
            const skillName = action.skill?.nameKey
              ? localizedSkillText(action.skill.nameKey, action.skill?.name)
              : (typeof localize === 'function'
                  ? formatLabel('skill')
                  : (action.skill?.name || labels.skill));
            const skillCopy = action.skill?.shortTextKey
              ? localizedSkillText(action.skill.shortTextKey, action.skill?.shortText)
              : (typeof localize === 'function' ? '' : (action.skill?.shortText || ''));
            setText('arena-feed', skillName);
            setLabelText('arena-round', 'round', { round:action.round || 1 });
            setText(
              'arena-skill-prompt',
              [
                action.skill?.icon,
                action.choice ? `${action.choice} · ${skillName}` : skillName,
                skillCopy
              ].filter(Boolean).join(' — ')
            );
          };
          renderVisibleComposite = renderTelegraphCopy;
          renderTelegraphCopy();
          actor?.classList.add('telegraphing');
          const elementLight = node('arena-element-light');
          if (elementLight) {
            elementLight.dataset.element = String(action.skill?.element || '').toLowerCase();
            elementLight.classList.add('visible');
          }
          if (arena) arena.dataset.element = String(action.skill?.element || '').toLowerCase();
          const cue = cueForSkill(action.skill);
          if (cue) fire(audio, cue, {
            eventId: beat.beatId || `${action.eventId || action.eventSequence}:skill`
          });
          break;
        }
        case 'advance':
          actor?.classList.add('advancing');
          break;
        case 'special':
          node('arena-special')?.classList.add('visible');
          fireTimelineOutputs(beat, action);
          break;
        case 'element_trail':
          fireTimelineOutputs(beat, action);
          break;
        case 'shield':
          target?.classList.add('shielding');
          fireTimelineOutputs(beat, action);
          break;
        case 'impact': {
          const hit = action.hits?.find(candidate => (
            numeric(candidate.index) === beat.hitIndex
          )) || action.hits?.[beat.hitIndex - 1] || {};
          target?.classList.remove('hit', 'evaded');
          target?.classList.add(beat.evaded ? 'evaded' : 'hit');
          if (beat.evaded) setLabelText('arena-impact', 'evaded');
          else setText(
            'arena-impact',
            `-${Math.max(0, numeric(beat.hpDamage))}${beat.shieldAbsorbed ? ' 🛡' : ''}`
          );
          const impact = node('arena-impact');
          impact?.classList.add('visible');
          const combo = node('arena-combo');
          if (combo) {
            const hitIndex = Math.max(1, numeric(beat.hitIndex, 1));
            combo.textContent = hitIndex > 1
              ? formatLabel('hitCombo', { count: hitIndex })
              : formatLabel('hit');
            combo.dataset.hits = String(hitIndex);
            combo.classList.add('visible');
          }
          fire(audio, 'arena.hit', {
            eventId: beat.beatId
              ? `${beat.beatId}:hit:${beat.hitIndex}`
              : `${action.eventId || action.eventSequence}:hit:${beat.hitIndex}`
          });
          break;
        }
        case 'status_damage':
          setText('arena-impact', `-${Math.max(0, numeric(beat.hpDamage))}`);
          node('arena-impact')?.classList.add('visible', 'damage-number');
          fighterNode(beat.targetSlot)?.classList.add('hit', 'status-hit');
          fireTimelineOutputs(beat, action);
          break;
        case 'status_hud': {
          const current = stateBySlot.get(beat.targetSlot) || {};
          renderState(beat.targetSlot, {
            ...current,
            hp: Math.max(0, numeric(current.hp) - numeric(beat.hpDamage))
          });
          fighterNode(beat.targetSlot)?.classList.remove('hit', 'status-hit');
          node('arena-impact')?.classList.remove('visible');
          break;
        }
        case 'retaliation':
          setText('arena-impact', `-${Math.max(0, numeric(beat.hpDamage))}`);
          node('arena-impact')?.classList.add('visible', 'damage-number', 'retaliation-number');
          fighterNode(beat.targetSlot)?.classList.add('hit', 'retaliation-hit');
          setText('arena-feed', String(beat.retaliationType || 'retaliation').toUpperCase());
          fireTimelineOutputs(beat, action);
          break;
        case 'retaliation_hud': {
          const current = stateBySlot.get(beat.targetSlot) || {};
          renderState(beat.targetSlot, {
            ...current,
            hp: Math.max(0, numeric(current.hp) - numeric(beat.hpDamage)),
            shield: Math.max(0, numeric(current.shield) - numeric(beat.shieldAbsorbed))
          });
          fighterNode(beat.targetSlot)?.classList.remove('hit', 'retaliation-hit');
          node('arena-impact')?.classList.remove('visible');
          break;
        }
        case 'hit_stop':
          if (arena) {
            arena.dataset.hitStop = String(beat.hitIndex || 1);
            arena.classList.add('hit-stop');
          }
          break;
        case 'camera_impulse':
          if (arena) {
            arena.style.setProperty('--arena-impulse', String(beat.intensity || 0.35));
            arena.classList.remove('camera-impulse');
            void arena.offsetWidth;
            arena.classList.add('camera-impulse');
          }
          break;
        case 'damage_number':
          setText('arena-impact', `-${Math.max(0, numeric(beat.amount))}`);
          node('arena-impact')?.classList.add('visible', 'damage-number');
          break;
        case 'hud': {
          const hitCount = timeline
            .slice(0, beatIndex)
            .filter(candidate => ['hud', 'hud_update'].includes(candidate.type)).length;
          const hit = action.hits?.[hitCount] || null;
          if (hit) applyHit(action, hit);
          node('arena-impact')?.classList.remove('visible');
          target?.classList.remove('hit', 'evaded');
          arena?.classList.remove('hit-stop', 'camera-impulse');
          if (arena?.dataset) delete arena.dataset.hitStop;
          break;
        }
        case 'shield_number': {
          const slot = [1, 2].includes(numeric(beat.actorSlot))
            ? numeric(beat.actorSlot)
            : numeric(beat.targetSlot);
          if (!beat.hitIndex && [1, 2].includes(slot)) {
            const current = stateBySlot.get(slot) || {};
            renderState(slot, {
              ...current,
              shield: numeric(current.shield) + numeric(beat.amount)
            });
          }
          setText('arena-impact', `+${Math.max(0, numeric(beat.amount))} 🛡`);
          node('arena-impact')?.classList.add('visible', 'shield-number');
          fire(audio, 'arena.shield', {
            eventId: beat.beatId || `${action.eventId || action.eventSequence}:shield`
          });
          break;
        }
        case 'heal_number': {
          const current = stateBySlot.get(action.actorSlot) || {};
          renderState(action.actorSlot, {
            ...current,
            hp: Math.min(numeric(current.maxHp, 1), numeric(current.hp) + numeric(beat.amount))
          });
          setText('arena-impact', `+${Math.max(0, numeric(beat.amount))} ♥`);
          node('arena-impact')?.classList.add('visible', 'heal-number');
          fire(audio, 'arena.heal', {
            eventId: beat.beatId || `${action.eventId || action.eventSequence}:heal`
          });
          break;
        }
        case 'knockout':
          fighterNode(
            [1, 2].includes(numeric(beat.slot))
              ? numeric(beat.slot)
              : numeric(beat.targetSlot)
          )?.classList.add('knockout');
          if (arena) arena.dataset.phase = 'knockout';
          setLabelText('arena-feed', 'knockout');
          renderVisibleComposite = () => setLabelText('arena-feed', 'knockout');
          fire(audio, 'arena.ko', {
            eventId: beat.beatId || `${action.eventId || action.eventSequence}:ko`,
            duck: beat.audioDucking || false
          });
          break;
        case 'recover':
          actor?.classList.remove('telegraphing', 'advancing');
          target?.classList.remove('hit', 'evaded', 'status-hit', 'retaliation-hit', 'shielding');
          arena?.classList.remove('hit-stop', 'camera-impulse');
          node('arena-special')?.classList.remove('visible');
          node('arena-combo')?.classList.remove('visible');
          node('arena-element-light')?.classList.remove('visible');
          break;
        case 'winner':
          actor?.classList.add('winner');
          if (arena) arena.dataset.phase = 'winner';
          break;
        default:
          break;
      }
    }

    function acceptAction(action) {
      if (action.matchId && activeMatchId && action.matchId !== activeMatchId) return false;
      const eventId = action.eventId && String(action.eventId);
      if (eventId && acceptedEventIds.has(eventId)) return false;
      if (
        action.eventSequence &&
        lastEventSequence &&
        action.eventSequence <= lastEventSequence
      ) return false;
      if (eventId) acceptedEventIds.add(eventId);
      if (action.eventSequence) lastEventSequence = action.eventSequence;
      return true;
    }

    async function playAction(payload = {}) {
      const action = unwrapAction(payload);
      if (!acceptAction(action)) return false;
      if (payload.round != null || payload.roundNumber != null || payload.action?.round != null) {
        lastRound = Math.max(
          1,
          numeric(payload.round ?? payload.roundNumber ?? payload.action?.round, lastRound)
        );
      }
      stopCountdown();
      setText('arena-countdown', '');
      if (arena) arena.dataset.phase = 'action';
      setBattleSurface(true, 'action');
      renderActionCard(action);
      const arcadeTimeline = ArenaDirector.buildArcadeTimeline('battle_skill_used', {
        ...payload,
        eventId: action.eventId,
        matchId: action.matchId,
        correlationId: payload.correlationId || action.matchId,
        action
      });
      const timeline = arcadeTimeline.beats;
      let cursor = 0;
      for (let index = 0; index < timeline.length; index += 1) {
        const beat = timeline[index];
        await wait(Math.max(0, beat.atMs - cursor));
        cursor = beat.atMs;
        playBeat(beat, action, index, timeline);
      }
      await wait(Math.max(0, arcadeTimeline.durationMs - cursor));
      if (action.actorState) renderState(action.actorSlot, action.actorState);
      if (action.targetState) renderState(action.targetSlot, action.targetState);
      return true;
    }

    function playPresentationBeat(beat, timeline, payload = {}) {
      const rootDataset = surface?.dataset;
      if (rootDataset) {
        rootDataset.arcadeScene = timeline.scene;
        rootDataset.arcadeBeat = beat.type;
        rootDataset.arcadeEventId = beat.eventId;
        rootDataset.arcadeBeatId = beat.beatId;
      }
      switch (beat.type) {
        case 'portal':
          showChoreography(payload, 'portal', beat.element);
          choreography?.classList.add('portal-open');
          break;
        case 'rivalry_entrance': {
          if (arena) {
            arena.dataset.rivalryTier = String(beat.tier || '');
            arena.classList.add('visible', 'rivalry-entrance');
          }
          const stamp = node('arena-rivalry-stamp');
          if (stamp) {
            const tierKey = beat.tier === 'nemesis'
              ? 'rivalryTierNemesis'
              : beat.tier === 'rivals'
                ? 'rivalryTierRivals'
                : 'rivalryTierRematch';
            stamp.textContent = formatLabel('rivalryEntrance', {
              tier:formatLabel(tierKey),
              count:beat.count
            });
            stamp.classList.add('visible');
          }
          break;
        }
        case 'special_ready':
          renderChargeState(beat.slot, beat.charge, true);
          fighterNode(beat.slot)?.classList.add('special-ready');
          break;
        case 'streak_stamp': {
          const stamp = node('arena-streak-stamp');
          if (stamp) {
            const key = beat.tier === 'unstoppable'
              ? 'streakUnstoppable'
              : beat.tier === 'five'
                ? 'streakFive'
                : 'streakThree';
            stamp.textContent = formatLabel(key);
            stamp.classList.add('visible');
            stamp.dataset.tier = String(beat.tier || '');
          }
          break;
        }
        case 'sealed_card':
          lockChoice({
            decision: {
              slot: beat.slot,
              locked: beat.locked,
              source: beat.source
            }
          });
          break;
        case 'simultaneous_reveal':
          revealChoices({ choices: beat.choices });
          break;
        case 'element_roulette':
          showChoreography(payload, 'roulette', beat.element);
          setText('arena-feed', beat.element);
          setText('arcade-roulette', beat.element);
          break;
        case 'roulette_lock':
          setText('arena-feed', beat.element);
          if (rootDataset) rootDataset.rouletteElement = beat.element;
          if (choreography) {
            choreography.dataset.phase = 'roulette-lock';
            choreography.classList.add('roulette-locked');
          }
          break;
        case 'egg_flight':
          showChoreography(payload, 'egg-flight', beat.element);
          choreography?.classList.add('egg-flight');
          break;
        case 'egg_impact':
          showChoreography(payload, 'egg-impact', beat.element);
          choreography?.classList.remove('egg-flight');
          choreography?.classList.add('egg-impact');
          pulseClass(surface, 'arcade-egg-impact');
          break;
        case 'reward_peak':
          if (choreography) choreography.dataset.phase = 'reward';
          break;
        case 'hatch_pulse':
          showChoreography(payload, 'hatch', beat.element);
          choreography?.classList.add('hatch-pulse');
          break;
        case 'hatch_crack':
          if (rootDataset) rootDataset.hatchCrack = String(beat.crackIndex);
          if (choreography) {
            choreography.dataset.phase = 'crack';
            choreography.dataset.crack = String(beat.crackIndex);
            choreography.classList.add(`crack-${beat.crackIndex}`);
          }
          break;
        case 'energy_build':
          if (choreography) {
            choreography.dataset.phase = 'energy';
            choreography.classList.add('energy-build');
          }
          break;
        case 'hatch_flash':
          if (choreography) {
            choreography.dataset.phase = 'flash';
            choreography.classList.add('hatch-flash');
          }
          break;
        case 'silhouette':
          if (surface) surface.classList.add('arcade-silhouette');
          break;
        case 'monster_reveal':
          if (surface) {
            surface.classList.remove('arcade-silhouette');
            pulseClass(surface, 'arcade-monster-reveal');
          }
          break;
        case 'fusion_copies_converge':
          showChoreography(payload, 'fusion-converge', beat.element);
          choreography?.classList.add('fusion-converge');
          break;
        case 'fusion_crystal':
          showChoreography(payload, 'fusion-crystal', beat.element);
          choreography?.classList.add('fusion-crystal');
          break;
        case 'fusion_evolved_asset':
          if (rootDataset) {
            rootDataset.evolutionStage = String(beat.evolutionStage || 1);
          }
          choreography?.classList.remove('fusion-converge');
          pulseClass(surface, 'arcade-monster-reveal');
          break;
        case 'evolution_stats':
          if (rootDataset) {
            rootDataset.evolutionStage = String(beat.evolutionStage || 1);
            rootDataset.evolutionStats = 'animated';
          }
          break;
        case 'evolution_skill':
          if (rootDataset) {
            rootDataset.evolutionSkill = String(beat.skill?.choice || '');
          }
          break;
        case 'fusion_settle':
          choreography?.classList.remove('fusion-crystal');
          choreography?.classList.add('fusion-settle');
          if (rootDataset) rootDataset.fusionState = 'settled';
          break;
        case 'fusion_prestige_settle':
          choreography?.classList.remove('fusion-crystal');
          choreography?.classList.add('fusion-prestige-settle');
          if (rootDataset) {
            rootDataset.fusionState = 'prestige-settled';
            rootDataset.prestigeLevel = String(beat.prestige?.level || 0);
            rootDataset.prestigeFrame = String(beat.prestige?.frame || '');
            rootDataset.prestigeAura = String(beat.prestige?.aura || '');
            rootDataset.prestigeTitle = String(beat.prestige?.title || '');
          }
          break;
        case 'new_discovery':
          setText('arena-feed', 'NEW');
          if (surface) surface.classList.add('arcade-new-discovery');
          break;
        case 'duplicate_reward':
          if (rootDataset) rootDataset.discovery = 'duplicate';
          break;
        case 'evolution_peak':
          if (rootDataset) rootDataset.evolutionStage = String(beat.evolutionStage);
          break;
        case 'collapse_banner':
          setLabelText('arena-feed', 'collapse', { round:beat.round });
          if (arena) {
            arena.dataset.phase = 'collapse';
            arena.classList.add('arena-collapse');
          }
          break;
        case 'collapse_shield':
          setText('arena-impact', `-${Math.max(0, numeric(beat.shieldReduced))} 🛡`);
          node('arena-impact')?.classList.add('visible', 'shield-number');
          fighterNode(beat.slot)?.classList.add('shielding');
          break;
        case 'collapse_damage':
          setText('arena-impact', `-${Math.max(0, numeric(beat.hpDamage))}`);
          node('arena-impact')?.classList.add('visible', 'damage-number');
          fighterNode(beat.slot)?.classList.add('hit');
          break;
        case 'collapse_hud':
          for (const fighter of Array.isArray(beat.fighters) ? beat.fighters : []) {
            const current = stateBySlot.get(fighter.slot) || {};
            renderState(fighter.slot, {
              ...current,
              hp: fighter.hp,
              shield: fighter.shield
            });
            fighterNode(fighter.slot)?.classList.remove('hit', 'shielding');
          }
          node('arena-impact')?.classList.remove(
            'visible',
            'damage-number',
            'shield-number'
          );
          arena?.classList.remove('arena-collapse');
          break;
        case 'winner_frame':
          if (beat.winnerSlot) {
            for (const slot of [1, 2]) {
              fighterNode(slot)?.classList.toggle('winner', slot === beat.winnerSlot);
              fighterNode(slot)?.classList.toggle('defeated', slot !== beat.winnerSlot);
            }
          }
          if (arena) arena.dataset.phase = 'winner';
          if (beat.winnerSlot) {
            setLabelText('arena-feed', 'winner', {
              name: stateBySlot.get(beat.winnerSlot)?.name ||
                formatLabel('monster', { slot: beat.winnerSlot })
            });
            renderVisibleComposite = () => setLabelText('arena-feed', 'winner', {
              name:stateBySlot.get(beat.winnerSlot)?.name ||
                formatLabel('monster', { slot:beat.winnerSlot })
            });
          }
          break;
        case 'xp_reward':
          if (rootDataset) rootDataset.xpReward = String(beat.amount || 0);
          break;
        case 'level_up':
          pulseClass(surface, 'arcade-level-up');
          break;
        case 'win_streak':
          if (rootDataset) rootDataset.winStreak = String(beat.count || 0);
          break;
        case 'rank_up':
          if (rootDataset) rootDataset.rank = String(beat.tier || '');
          pulseClass(surface, 'arcade-rank-up');
          break;
        case 'rating_update':
          if (rootDataset) {
            rootDataset.rating = String(beat.rating || 0);
            rootDataset.ratingDelta = String(beat.delta || 0);
          }
          break;
        default:
          break;
      }
      fireTimelineOutputs(
        beat,
        payload,
        timeline.scene === 'arena_collapse' ? effects : presentationEffects
      );
    }

    async function playEvent(eventType, payload = {}) {
      const normalized = String(eventType || '').replace(/^streammonsters:/, '');
      if (['battle_skill_used', 'battle_action', 'battle_knockout'].includes(normalized)) {
        return playAction(payload.action ? {
          ...payload.action,
          matchId: payload.matchId || payload.action.matchId,
          eventId: payload.eventId || payload.action.eventId,
          eventSequence: payload.action.eventSequence || payload.sequence,
          correlationId: payload.correlationId
        } : payload);
      }
      const timeline = ArenaDirector.buildArcadeTimeline(normalized, payload);
      if (!timeline.beats.length || !rememberTimelineEvent(timeline.eventId)) return false;
      if (normalized === 'battle_completed') return complete(payload);
      if (normalized === 'battle_arena_collapse') {
        setBattleSurface(true, 'collapse');
      }
      transientPresentationClasses.forEach(className => surface?.classList.remove(className));
      resetChoreography();
      syncRendererStatus();
      let cursor = 0;
      for (const beat of timeline.beats) {
        await wait(Math.max(0, beat.atMs - cursor));
        cursor = beat.atMs;
        playPresentationBeat(beat, timeline, payload);
      }
      await wait(Math.max(0, timeline.durationMs - cursor));
      resetChoreography();
      return true;
    }

    async function complete(payload = {}) {
      stopCountdown();
      clearArenaStamps();
      node('arena-action-card')?.classList.remove('visible');
      const terminalVersion = surfaceVersion;
      const winnerSlot = numeric(payload.winnerSlot);
      const terminalReason = String(payload.terminalReason || '').toLowerCase();
      const isDoubleKnockout = terminalReason === 'double_knockout';
      setBattleSurface(true, 'result');
      for (const slot of [1, 2]) {
        const fighter = fighterNode(slot);
        fighter?.classList.toggle('winner', slot === winnerSlot);
        fighter?.classList.toggle('defeated', Boolean(winnerSlot) && slot !== winnerSlot);
      }
      if (arena) {
        arena.classList.add('visible');
        arena.dataset.phase = 'completed';
        arena.dataset.terminal = isDoubleKnockout
          ? 'draw'
          : (winnerSlot ? 'winner' : 'ended');
      }
      setText('arena-skill-prompt', '');
      setText('arena-countdown', '');
      const winner = payload.winner && typeof payload.winner === 'object'
        ? payload.winner
        : {};
      const winnerName = winnerSlot
        ? safeDisplayName(
          payload.winnerViewerName || winner.viewerName ||
          stateBySlot.get(winnerSlot)?.viewerName ||
          stateBySlot.get(winnerSlot)?.name,
          formatLabel('viewer')
        )
        : '';
      const winnerMonster = winnerSlot
        ? safeDisplayName(
          winner.name || stateBySlot.get(winnerSlot)?.name,
          formatLabel('monster', { slot:winnerSlot })
        )
        : '';
      const ratingText = (Array.isArray(payload.ratingChanges) ? payload.ratingChanges : [])
        .map(change => {
          const slot = numeric(change?.slot);
          const name = stateBySlot.get(slot)?.viewerName || formatLabel('monster', { slot });
          const delta = Math.round(numeric(change?.delta));
          const sign = delta >= 0 ? '+' : '';
          return `${name} ${sign}${delta} ELO · ${Math.round(numeric(change?.after))}`;
        }).join('   ');
      const canonicalRatingText = (Array.isArray(payload.ratingChanges)
        ? payload.ratingChanges
        : []
      ).map(change => {
        const slot = numeric(change?.slot);
        const fighter = stateBySlot.get(slot) || {};
        const name = safeDisplayName(fighter.viewerName, fighter.name);
        const before = Math.max(0, Math.round(numeric(change?.before)));
        const after = Math.max(0, Math.round(numeric(change?.after)));
        const delta = Math.round(numeric(change?.delta));
        return before === after || delta === 0
          ? formatLabel('ratingUnchanged', { name, before, after, delta:0 })
          : formatLabel('ratingChanged', {
              name,
              before,
              after,
              delta:delta > 0 ? `+${delta}` : delta
            });
      }).join('   ') || ratingText;
      const knockout = payload.knockout && typeof payload.knockout === 'object'
        ? payload.knockout
        : null;
      const combatReport = normalizeCombatReport(payload.combatReport);
      const result = node('arena-result');
      if (result) result.classList.add('visible');
      setLabelText(
        'arena-result-ko',
        isDoubleKnockout
          ? 'doubleKnockoutResult'
          : (terminalReason === 'forfeit' ? 'forfeitResult' : 'knockoutResult')
      );
      if (winnerSlot) {
        setLabelText('arena-result-winner', 'winner', { name:winnerName });
      } else if (isDoubleKnockout) {
        setLabelText('arena-result-winner', 'draw');
      } else {
        setLabelText('arena-result-winner', 'battleEnded');
      }
      setText('arena-result-monster', winnerMonster);
      if (isDoubleKnockout) {
        setLabelText('arena-result-summary', 'doubleKnockoutSummary', {
          round:Math.max(
            1,
            numeric(
              knockout?.round ?? payload.round ?? payload.roundNumber,
              lastRound
            )
          )
        });
      } else if (knockout) {
        setLabelText('arena-result-summary', 'resultSummary', {
          round:Math.max(1, numeric(knockout.round, 1)),
          hp:Math.max(0, numeric(knockout.remainingHp)),
          maxHp:Math.max(1, numeric(knockout.maxHp, 1))
        });
      } else {
        setText('arena-result-summary', '');
      }
      renderCombatReport(combatReport);
      setText('arena-result-ratings', combatReport ? '' : canonicalRatingText);
      const showCloseHint = payload.nextArenaHint?.kind === 'close_result' &&
        payload.nextArenaHint?.avoidsImmediateRematch === true;
      setText(
        'arena-result-next',
        showCloseHint ? formatLabel('closeBattleHint') : ''
      );
      if (winnerSlot) setLabelText('arena-feed', 'winner', { name:winnerName });
      else if (isDoubleKnockout) setLabelText('arena-feed', 'draw');
      else setLabelText('arena-feed', 'battleEnded');
      renderVisibleComposite = () => {
        if (winnerSlot) {
          setLabelText('arena-result-winner', 'winner', { name:winnerName });
          setLabelText('arena-feed', 'winner', { name:winnerName });
        } else if (isDoubleKnockout) {
          setLabelText('arena-result-winner', 'draw');
          setLabelText('arena-feed', 'draw');
        } else {
          setLabelText('arena-result-winner', 'battleEnded');
          setLabelText('arena-feed', 'battleEnded');
        }
        renderCombatReport(combatReport);
        setText(
          'arena-result-next',
          showCloseHint ? formatLabel('closeBattleHint') : ''
        );
      };
      if (winnerSlot) {
        fire(audio, 'arena.victory', {
          eventId: `${payload.eventId || activeMatchId || 'battle'}:victory`
        });
      }
      await wait(ArenaDirector.RULES_V8_PACING.RESULT_BOARD_MS);
      if (terminalVersion === surfaceVersion) {
        result?.classList.remove('visible');
        arena?.classList.remove('visible');
        activeMatchId = null;
        setBattleSurface(false, 'result_complete');
      }
      return true;
    }

    async function cancel(payload = {}) {
      stopCountdown();
      clearArenaStamps();
      node('arena-action-card')?.classList.remove('visible');
      const terminalVersion = surfaceVersion;
      if (arena) {
        arena.classList.add('visible');
        arena.dataset.phase = 'cancelled';
        arena.dataset.terminal = 'cancelled';
      }
      setText('arena-skill-prompt', '');
      setText('arena-countdown', '');
      const cancellationLabel = payload.reason === 'roster_unavailable'
        ? 'cancelledRoster'
        : 'cancelled';
      setLabelText('arena-feed', cancellationLabel);
      renderVisibleComposite = () => setLabelText('arena-feed', cancellationLabel);
      await wait(ArenaDirector.RULES_V8_PACING.CANCELLATION_MS);
      if (terminalVersion === surfaceVersion) {
        arena?.classList.remove('visible');
        activeMatchId = null;
        setBattleSurface(false, 'cancelled');
      }
      return true;
    }

    function applySnapshot(snapshot = {}) {
      const battle = snapshot.battle || snapshot;
      const matches = Array.isArray(battle.matches) ? battle.matches : [];
      const match = matches.find(candidate => (
        ['roster', 'action', 'finalizing'].includes(candidate?.state)
      ));
      if (!match) {
        stopCountdown();
        surfaceVersion += 1;
        activeMatchId = null;
        activeDeadlineMs = 0;
        resetFighters();
        arena?.classList.remove('visible');
        node('arena-result')?.classList.remove('visible');
        node('arena-action-card')?.classList.remove('visible');
        setText('arena-countdown', '');
        setBattleSurface(false, 'snapshot_empty');
        return null;
      }
      applyMatch(match);
      if (
        match.state === 'action' &&
        Number.isFinite(Number(match.actionDeadlineMs)) &&
        Number(match.actionDeadlineMs) > 0
      ) {
        openChoice({
          ...match,
          round: match.roundNumber,
          deadlineMs: match.actionDeadlineMs,
          choices: ['A', 'B', 'C']
        });
      }
      (Array.isArray(match.choiceLocks) ? match.choiceLocks : []).forEach(decision => {
        lockChoice({ decision });
      });
      if (match.revealedChoices?.choices) {
        revealChoices(match.revealedChoices);
      }
      if (battle.statPrompt) {
        showStatPrompt(battle.statPrompt);
      }
      return match;
    }

    return {
      applyMatch,
      applySnapshot,
      cancel,
      complete,
      lockRoster,
      lockChoice,
      revealChoices,
      openChoice,
      playEvent,
      playAction,
      renderCountdown,
      showStatPrompt,
      showStatResult,
      setLocale,
      destroy: stopCountdown,
      state: () => ({
        matchId: activeMatchId,
        deadlineMs: activeDeadlineMs,
        eventSequence: lastEventSequence,
        battleActive: battleSurfaceActive
      })
    };
  }

  return {
    createArenaView,
    unwrapAction
  };
}));
