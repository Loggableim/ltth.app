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
        card.classList.remove('charging', 'ready', 'unavailable');
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
        setSkillText(
          'skill-copy',
          localizedSkillText(skill.shortTextKey, skill.shortText)
        );
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
        setSkillText('skill-charge', `${Math.round((charge / required) * 100)}%`);
        card.classList.toggle('charging', !ready);
        card.classList.toggle('ready', ready);
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
      setMeter(`arena-charge-${slot}`, state.charge);
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
      if (activeMatchId && nextId && activeMatchId !== nextId) {
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

    function applyMatch(match = {}) {
      activateMatch(match.matchId);
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

    function openChoice(payload = {}) {
      activateMatch(payload.matchId);
      setBattleSurface(true, 'choice');
      activeChargeWindow = normalizeChargeWindow(payload);
      if (payload.fighters) renderFighters(payload.fighters);
      const round = Math.max(1, numeric(payload.round ?? payload.roundNumber, 1));
      lastRound = round;
      const choices = Array.isArray(payload.choices) && payload.choices.length
        ? payload.choices
        : ['A', 'B', 'C'];
      const renderChoiceCopy = () => {
        setLabelText('arena-round', 'round', { round });
        setText(
          'arena-skill-prompt',
          choices.map(choice => `${choice} ${choiceLabel(choice)}`.trim()).join('  ·  ')
        );
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
            combo.textContent = hitIndex > 1 ? `${hitIndex} HIT COMBO` : 'HIT';
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
      setText('arena-result-ratings', canonicalRatingText);
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
      };
      if (winnerSlot) {
        fire(audio, 'arena.victory', {
          eventId: `${payload.eventId || activeMatchId || 'battle'}:victory`
        });
      }
      await wait(8_000);
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
      await wait(3_000);
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
      return match;
    }

    return {
      applyMatch,
      applySnapshot,
      cancel,
      complete,
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
