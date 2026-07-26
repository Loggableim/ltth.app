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
    clock = {},
    choiceLabels = {},
    labels: arenaLabels = {}
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
    const stateBySlot = new Map();
    let activeMatchId = null;
    let activeDeadlineMs = 0;
    let lastEventSequence = 0;
    let countdownHandle = null;
    let surfaceVersion = 0;
    const acceptedEventIds = new Set();
    const choicesByKey = {
      A: 'Attack',
      B: 'Defense',
      C: 'Special',
      ...choiceLabels
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
      battleEnded: 'Kampf beendet',
      cancelledRoster: 'Kampf abgebrochen · Monsterwahl unvollständig',
      cancelled: 'Kampf abgebrochen',
      shield: 'Schild',
      special: 'Special',
      ...arenaLabels
    };

    const node = id => documentLike.getElementById(id);
    const fighterNode = slot => node(`arena-fighter-${slot}`);
    const formatLabel = (key, params = {}) => String(labels[key] || '').replace(
      /\{(\w+)\}/g,
      (match, name) => Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match
    );

    function setText(id, text) {
      const target = node(id);
      if (target) target.textContent = String(text ?? '');
    }

    function setMeter(id, value) {
      const target = node(id);
      if (!target) return;
      const percent = clampPercent(value);
      target.style.width = `${percent}%`;
      target.setAttribute('aria-valuenow', String(Math.round(percent)));
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
      setText(`arena-name-${slot}`, state.name || fallbackName);
      setText(`arena-level-${slot}`, formatLabel('level', {
        level: Math.max(1, numeric(state.level, 1))
      }));
      setText(`arena-hp-text-${slot}`, `${state.hp} / ${state.maxHp}`);
      setText(`arena-shield-label-${slot}`, labels.shield);
      setText(`arena-special-label-${slot}`, labels.special);
      setMeter(`arena-hp-${slot}`, (state.hp / state.maxHp) * 100);
      setMeter(`arena-shield-${slot}`, Math.min(100, state.shield * 10));
      setMeter(`arena-charge-${slot}`, state.charge);
      const image = node(`arena-image-${slot}`);
      if (image && state.imageUrl) {
        image.src = state.imageUrl;
        image.alt = state.name || fallbackName;
      }
      const fighter = fighterNode(slot);
      if (fighter) {
        fighter.dataset.element = String(state.element || '').toLowerCase();
        fighter.dataset.slot = String(slot);
      }
      return state;
    }

    function renderFighters(fighters = []) {
      const normalized = ArenaDirector.normalizeFighters(fighters);
      for (const fighter of normalized) renderState(fighter.slot, fighter);
      return normalized;
    }

    function resetFighters() {
      stateBySlot.clear();
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

    function applyMatch(match = {}) {
      activateMatch(match.matchId);
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
      setText('arena-round', match.roundNumber || match.round
        ? formatLabel('round', { round: numeric(match.roundNumber ?? match.round, 1) })
        : labels.roster);
      startCountdown(match.actionDeadlineMs || match.rosterDeadlineMs || 0);
      return match;
    }

    function openChoice(payload = {}) {
      activateMatch(payload.matchId);
      if (payload.fighters) renderFighters(payload.fighters);
      const round = Math.max(1, numeric(payload.round ?? payload.roundNumber, 1));
      const choices = Array.isArray(payload.choices) && payload.choices.length
        ? payload.choices
        : ['A', 'B', 'C'];
      setText('arena-round', formatLabel('round', { round }));
      setText(
        'arena-skill-prompt',
        choices.map(choice => `${choice} ${choicesByKey[choice] || ''}`.trim()).join('  ·  ')
      );
      startCountdown(payload.deadlineMs || payload.actionDeadlineMs || 0);
      if (arena) {
        arena.classList.add('visible');
        arena.dataset.phase = 'choice';
      }
      for (const slot of [1, 2]) {
        const fighter = fighterNode(slot);
        fighter?.classList.remove('choice-locked');
        if (fighter) delete fighter.dataset.choice;
      }
    }

    function lockChoice(payload = {}) {
      const decision = payload.decision || payload;
      const slot = numeric(decision.slot);
      if (![1, 2].includes(slot)) return false;
      const fighter = fighterNode(slot);
      if (!fighter) return false;
      fighter.dataset.choice = String(decision.choice || '');
      fighter.dataset.choiceSource = decision.timeout ? 'timeout' : 'viewer';
      fighter.classList.add('choice-locked');
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
      switch (beat.type) {
        case 'telegraph': {
          setText('arena-feed', action.skill?.name || labels.skill);
          setText('arena-round', formatLabel('round', { round: action.round || 1 }));
          setText(
            'arena-skill-prompt',
            [
              action.skill?.icon,
              action.choice ? `${action.choice} · ${action.skill?.name || ''}` : action.skill?.name,
              labels[action.skill?.shortTextKey] || action.skill?.shortText
            ].filter(Boolean).join(' — ')
          );
          actor?.classList.add('telegraphing');
          const scene = String(action.skill?.type || '').toLowerCase();
          if (scene && scene !== 'special') {
            fire(effects, scene === 'defense' ? 'defense' : 'attack', {
              eventId: action.eventId,
              element: action.skill?.element,
              vfxKey: action.skill?.vfxKey,
              actorSlot: action.actorSlot,
              targetSlot: action.targetSlot
            });
          }
          const cue = cueForSkill(action.skill);
          if (cue) fire(audio, cue, { eventId: `${action.eventId || action.eventSequence}:skill` });
          break;
        }
        case 'advance':
          actor?.classList.add('advancing');
          break;
        case 'special':
          node('arena-special')?.classList.add('visible');
          fire(effects, 'special', {
            eventId: action.eventId,
            element: beat.element,
            vfxKey: beat.vfxKey,
            actorSlot: action.actorSlot,
            targetSlot: action.targetSlot
          });
          fire(audio, 'arena.special', {
            eventId: `${action.eventId || action.eventSequence}:special`
          });
          break;
        case 'impact': {
          const hit = action.hits?.find(candidate => (
            numeric(candidate.index) === beat.hitIndex
          )) || action.hits?.[beat.hitIndex - 1] || {};
          target?.classList.remove('hit', 'evaded');
          target?.classList.add(beat.evaded ? 'evaded' : 'hit');
          setText(
            'arena-impact',
            beat.evaded
              ? labels.evaded
              : `-${Math.max(0, numeric(beat.hpDamage))}${beat.shieldAbsorbed ? ' 🛡' : ''}`
          );
          const impact = node('arena-impact');
          impact?.classList.add('visible');
          fire(audio, 'arena.hit', {
            eventId: `${action.eventId || action.eventSequence}:hit:${beat.hitIndex}`
          });
          break;
        }
        case 'hud': {
          const hitCount = timeline
            .slice(0, beatIndex)
            .filter(candidate => candidate.type === 'hud').length;
          const hit = action.hits?.[hitCount] || null;
          if (hit) applyHit(action, hit);
          node('arena-impact')?.classList.remove('visible');
          target?.classList.remove('hit', 'evaded');
          break;
        }
        case 'shield': {
          const current = stateBySlot.get(action.actorSlot) || {};
          renderState(action.actorSlot, {
            ...current,
            shield: numeric(current.shield) + numeric(beat.amount)
          });
          fire(audio, 'arena.shield', {
            eventId: `${action.eventId || action.eventSequence}:shield`
          });
          break;
        }
        case 'heal': {
          const current = stateBySlot.get(action.actorSlot) || {};
          renderState(action.actorSlot, {
            ...current,
            hp: Math.min(numeric(current.maxHp, 1), numeric(current.hp) + numeric(beat.amount))
          });
          fire(audio, 'arena.heal', {
            eventId: `${action.eventId || action.eventSequence}:heal`
          });
          break;
        }
        case 'knockout':
          target?.classList.add('knockout');
          if (arena) arena.dataset.phase = 'knockout';
          setText('arena-feed', labels.knockout);
          fire(audio, 'arena.ko', {
            eventId: `${action.eventId || action.eventSequence}:ko`
          });
          break;
        case 'recover':
          actor?.classList.remove('telegraphing', 'advancing');
          target?.classList.remove('hit', 'evaded');
          node('arena-special')?.classList.remove('visible');
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
      stopCountdown();
      setText('arena-countdown', '');
      if (arena) arena.dataset.phase = 'action';
      const timeline = ArenaDirector.buildActionTimeline(action);
      let cursor = 0;
      for (let index = 0; index < timeline.length; index += 1) {
        const beat = timeline[index];
        await wait(Math.max(0, beat.atMs - cursor));
        cursor = beat.atMs;
        playBeat(beat, action, index, timeline);
      }
      if (action.actorState) renderState(action.actorSlot, action.actorState);
      if (action.targetState) renderState(action.targetSlot, action.targetState);
      return true;
    }

    async function complete(payload = {}) {
      stopCountdown();
      const terminalVersion = surfaceVersion;
      const winnerSlot = numeric(payload.winnerSlot);
      for (const slot of [1, 2]) {
        const fighter = fighterNode(slot);
        fighter?.classList.toggle('winner', slot === winnerSlot);
        fighter?.classList.toggle('defeated', Boolean(winnerSlot) && slot !== winnerSlot);
      }
      if (arena) {
        arena.classList.add('visible');
        arena.dataset.phase = 'completed';
        arena.dataset.terminal = 'winner';
      }
      setText('arena-skill-prompt', '');
      setText('arena-countdown', '');
      setText('arena-feed', winnerSlot
        ? formatLabel('winner', {
            name: stateBySlot.get(winnerSlot)?.name || formatLabel('monster', { slot: winnerSlot })
          })
        : labels.battleEnded);
      fire(audio, 'arena.victory', {
        eventId: `${payload.eventId || activeMatchId || 'battle'}:victory`
      });
      await wait(4_000);
      if (terminalVersion === surfaceVersion) arena?.classList.remove('visible');
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
      setText('arena-feed', payload.reason === 'roster_unavailable'
        ? labels.cancelledRoster
        : labels.cancelled);
      await wait(3_000);
      if (terminalVersion === surfaceVersion) arena?.classList.remove('visible');
      return true;
    }

    function applySnapshot(snapshot = {}) {
      const battle = snapshot.battle || snapshot;
      const matches = Array.isArray(battle.matches) ? battle.matches : [];
      const match = matches.find(candidate => (
        ['roster', 'action', 'finalizing'].includes(candidate?.state)
      ));
      if (!match) return null;
      applyMatch(match);
      if (match.state === 'action') {
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
      openChoice,
      playAction,
      renderCountdown,
      destroy: stopCountdown,
      state: () => ({
        matchId: activeMatchId,
        deadlineMs: activeDeadlineMs,
        eventSequence: lastEventSequence
      })
    };
  }

  return {
    createArenaView,
    unwrapAction
  };
}));
