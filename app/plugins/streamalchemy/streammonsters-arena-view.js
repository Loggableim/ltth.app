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
    let lastEventSequence = 0;
    let countdownHandle = null;
    let surfaceVersion = 0;
    const acceptedEventIds = new Set();
    const acceptedTimelineEventIds = new Set();
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

    function fireTimelineOutputs(beat, payload = {}) {
      if (beat.effect?.scene) {
        fire(effects, beat.effect.scene, {
          ...beat.effect,
          eventId: beat.eventId,
          beatId: beat.beatId,
          correlationId: payload.correlationId || null,
          motion: beat.motion
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
        fighter?.classList.remove('choice-revealed');
        if (fighter) delete fighter.dataset.choice;
      }
    }

    function lockChoice(payload = {}) {
      const decision = payload.decision || payload;
      const slot = numeric(decision.slot);
      if (![1, 2].includes(slot)) return false;
      const fighter = fighterNode(slot);
      if (!fighter) return false;
      if (decision.choice) fighter.dataset.choice = String(decision.choice);
      else delete fighter.dataset.choice;
      fighter.dataset.choiceSource = (
        decision.timeout || decision.source === 'timeout'
      ) ? 'timeout' : 'viewer';
      fighter.classList.add('choice-locked');
      return true;
    }

    function revealChoices(payload = {}) {
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      let revealed = false;
      choices.slice().sort((left, right) => numeric(left?.slot) - numeric(right?.slot))
        .forEach(choice => {
          const slot = numeric(choice?.slot);
          const fighter = fighterNode(slot);
          if (!fighter || !['A', 'B', 'C'].includes(choice?.choice)) return;
          fighter.dataset.choice = choice.choice;
          fighter.dataset.choiceSource = choice?.source === 'timeout' ? 'timeout' : 'viewer';
          fighter.classList.add('choice-locked', 'choice-revealed');
          revealed = true;
        });
      return revealed;
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
            .filter(candidate => candidate.type === 'hud').length;
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
          setText('arena-feed', labels.knockout);
          fire(audio, 'arena.ko', {
            eventId: beat.beatId || `${action.eventId || action.eventSequence}:ko`,
            duck: beat.audioDucking || false
          });
          break;
        case 'recover':
          actor?.classList.remove('telegraphing', 'advancing');
          target?.classList.remove('hit', 'evaded', 'status-hit', 'retaliation-hit');
          arena?.classList.remove('hit-stop', 'camera-impulse');
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
        case 'winner_frame':
          if (beat.winnerSlot) {
            for (const slot of [1, 2]) {
              fighterNode(slot)?.classList.toggle('winner', slot === beat.winnerSlot);
              fighterNode(slot)?.classList.toggle('defeated', slot !== beat.winnerSlot);
            }
          }
          if (arena) arena.dataset.phase = 'winner';
          if (beat.winnerSlot) {
            setText('arena-feed', formatLabel('winner', {
              name: stateBySlot.get(beat.winnerSlot)?.name ||
                formatLabel('monster', { slot: beat.winnerSlot })
            }));
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
      fireTimelineOutputs(beat, payload);
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
      if (timeline.type === 'battle_completed') {
        arena?.classList.remove('visible');
      }
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
      revealChoices,
      openChoice,
      playEvent,
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
