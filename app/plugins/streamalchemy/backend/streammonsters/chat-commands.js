const { normalizeIngressEventId } = require('./ingress-event-id');

class ChatCommands {
  constructor({
    store,
    engine,
    battleService,
    battleMatchService = null,
    progression = null,
    collection = null,
    freeEggDropService = null,
    emit = () => {},
    now = () => Date.now(),
    queueTtlMs = 5 * 60 * 1000,
    getCommandReference = command => command === 'eggs' ? '!eier' : `!${command}`
  }) {
    this.store = store;
    this.engine = engine;
    this.battleService = battleService;
    this.battleMatchService = battleMatchService;
    this.progression = progression;
    this.collection = collection;
    this.freeEggDropService = freeEggDropService;
    this.emit = emit;
    this.now = now;
    this.queueTtlMs = queueTtlMs;
    this.getCommandReference = getCommandReference;
    this.queue = [];
    this.syncQueue();
  }

  commandReference(command) {
    const reference = this.getCommandReference?.(command);
    return typeof reference === 'string' ? reference.trim() : '';
  }

  emitAfterCommit(event, payload) {
    this.store.afterCommit(() => this.emit(event, payload));
  }

  execute(context = {}, commandName = '', args = []) {
    const userId = context.userId || context.uniqueId || context.username;
    const command = String(commandName || '').trim().toLowerCase();
    const commandArgs = Array.isArray(args) ? args : [];
    if (!userId) return { success: false, status: 'ignored' };
    if (![
      'eggs', 'hatch', 'inventory', 'monsters', 'monster', 'choose',
      'evolve', 'battle', 'leavebattle', 'rank', 'quests', 'adopt', 'monstershelp'
    ].includes(command)) {
      return { success: false, status: 'ignored' };
    }
    this.engine.markReadyEggs();
    if (command === 'battle') return this.executeBattle(userId, commandArgs[0]);
    this.progression?.recordCommand(userId, this.engine.streamKey);

    if (command === 'eggs') return this.eggs(userId);
    if (command === 'hatch') return this.hatch(userId, commandArgs[0]);
    if (command === 'inventory' || command === 'monsters') return this.inventory(userId, commandArgs[0]);
    if (command === 'monster') return this.monster(userId, commandArgs[0]);
    if (command === 'choose') return this.choose(userId, commandArgs[0]);
    if (command === 'evolve') return this.evolve(userId, commandArgs[0]);
    if (command === 'adopt') return this.adopt(userId, context);
    if (command === 'leavebattle') return this.leaveBattle(userId);
    if (command === 'rank') return this.rank(userId);
    if (command === 'quests') return this.quests(userId);
    const commandReferences = [
      ['eggs', ''],
      ['hatch', ' <slot>'],
      ['monsters', ' [page]'],
      ['monster', ' <slot>'],
      ['choose', ' <slot>'],
      ['evolve', ' <slot>'],
      ['battle', ''],
      ['leavebattle', ''],
      ['rank', ''],
      ['quests', '']
    ].map(([name, suffix]) => {
      const reference = this.commandReference(name);
      return reference ? `${reference}${suffix}` : '';
    }).filter(Boolean);
    return {
      success: true,
      status: 'help',
      message: `${commandReferences.length
        ? `Commands: ${commandReferences.join(', ')}. `
        : 'No commands are currently available. '}` +
        'After pairing, choose a monster and answer each round with A/B/C.'
    };
  }

  eggs(userId) {
    const positions = new Map(
      this.store.getQueuedEggs(userId).map(egg => [egg.egg_id, egg.queue_position])
    );
    const eggs = this.store.getViewerEggs(userId)
      .filter(egg => ['incubating', 'queued', 'ready'].includes(egg.state))
      .map(egg => positions.has(egg.egg_id)
        ? { ...egg, queue_position: positions.get(egg.egg_id) }
        : egg);
    const ready = eggs.filter(egg => egg.state === 'ready').length;
    const queued = eggs.filter(egg => egg.state === 'queued').length;
    const hatchReference = this.commandReference('hatch');
    const hatchGuidance = hatchReference
      ? ` Use ${hatchReference} <slot>.`
      : '';
    return {
      success: true,
      status: 'eggs',
      message: `${eggs.length} egg${eggs.length === 1 ? '' : 's'} (${ready} ready${queued ? `, ${queued} queued` : ''}).${hatchGuidance}`,
      eggs
    };
  }

  adopt(userId, context = {}) {
    if (!this.freeEggDropService) {
      return {
        success: false,
        status: 'ignored'
      };
    }
    const rawData = context.rawData || {};
    const streamKey = this.engine.streamKey || 'offline';
    const eventId = normalizeIngressEventId({
      namespace: 'adopt',
      context,
      rawData,
      nowMs: this.now(),
      fingerprint: {
        streamKey,
        userId,
        message: rawData.comment || rawData.message || rawData.text || 'adopt'
      }
    });
    const result = this.freeEggDropService.adopt({
      userId,
      streamKey,
      eventId,
      nowMs: this.now()
    });
    if (result.success) {
      return {
        ...result,
        message: 'You adopted a free egg. Check your eggs to follow incubation.'
      };
    }
    const messages = {
      cooldown: 'You already adopted a free egg recently.',
      no_offer: 'There is no free egg available right now.',
      disabled: 'Free egg drops are currently unavailable.'
    };
    return { ...result, message: messages[result.status] || 'Free egg adoption is unavailable.' };
  }

  hatch(userId, slot) {
    try {
      const monster = this.engine.hatchEgg(userId, slot);
      return {
        success: true,
        status: 'hatched',
        message: `${monster.name} hatched! ${monster.personality} · ${monster.element}.`,
        monster
      };
    } catch (error) {
      const eggsReference = this.commandReference('eggs');
      const eggsGuidance = eggsReference ? ` Check ${eggsReference}.` : '';
      if (error.code === 'STREAM_MONSTERS_EGG_NOT_FOUND') {
        return {
          success: false,
          status: 'egg_not_found',
          message: `That egg slot does not exist.${eggsGuidance}`,
          ...(eggsReference ? { hint: eggsReference } : {})
        };
      }
      if (error.code !== 'STREAM_MONSTERS_EGG_NOT_READY') throw error;
      const wait = error.wait || null;
      return {
        success: false,
        status: 'egg_not_ready',
        message: `That egg is not ready yet.${eggsGuidance}`,
        ...(eggsReference ? { hint: eggsReference } : {}),
        ...(wait ? {
          wait,
          card: {
            type: 'egg_wait',
            size: 'compact',
            placement: 'upper-third',
            ...wait
          }
        } : {})
      };
    }
  }

  inventory(userId, requestedPage = 1) {
    const monsters = this.store.getViewerMonsters(userId);
    const eggs = this.store.getViewerEggs(userId).filter(egg => egg.state !== 'hatched');
    const selected = this.store.getSelectedMonster(userId);
    const selectedLabel = selected ? ` Active: ${selected.name}.` : '';
    const page = this.collection?.getCatalogPage?.(userId, {
      page: requestedPage,
      pageSize: 6
    }) || null;
    const rotation = this.collection?.getCatalogRotation?.(userId, {
      cursor: page ? (page.page - 1) * page.pageSize : 0
    }) || null;
    return {
      success: true,
      status: 'inventory',
      message: `${monsters.length} monster${monsters.length === 1 ? '' : 's'} and ${eggs.length} egg${eggs.length === 1 ? '' : 's'}.${selectedLabel}`,
      monsters,
      eggs,
      selected,
      ...(page ? { page, rotation } : {})
    };
  }

  choose(userId, slot) {
    const index = Number.parseInt(slot, 10) - 1;
    const monsters = this.store.getViewerMonsters(userId);
    if (!Number.isInteger(index) || index < 0 || !monsters[index]) {
      const monstersReference = this.commandReference('monsters');
      return {
        success: false,
        status: 'invalid_slot',
        message: monstersReference
          ? `Choose a monster slot from ${monstersReference}.`
          : 'Choose a valid monster slot.'
      };
    }
    const selected = this.store.selectMonster(userId, monsters[index].monster_id);
    const rosterLock = this.battleMatchService?.lockRoster?.({
      userId,
      monsterId: selected.monster_id
    }) || null;
    return {
      success: true,
      status: rosterLock?.accepted ? 'roster_locked' : 'selected',
      message: `${selected.name} is ready to battle.`,
      selected,
      ...(rosterLock ? { rosterLock } : {})
    };
  }

  monster(userId, slot) {
    const index = Number.parseInt(slot, 10) - 1;
    const monsters = this.store.getViewerMonsters(userId);
    if (!Number.isInteger(index) || index < 0 || !monsters[index]) {
      const monstersReference = this.commandReference('monsters');
      return {
        success: false,
        status: 'invalid_slot',
        message: monstersReference
          ? `Choose a monster slot from ${monstersReference}.`
          : 'Choose a valid monster slot.'
      };
    }
    const monster = monsters[index];
    return {
      success: true,
      status: 'monster',
      message: `${monster.name} · ${monster.element} · Lv.${monster.level} · ${monster.personality}.`,
      monster,
      ...(this.collection?.getMonsterCard
        ? { card: this.collection.getMonsterCard(userId, monster.monster_id) }
        : {})
    };
  }

  evolve(userId, slot) {
    const index = Number.parseInt(slot, 10) - 1;
    const monsters = this.store.getViewerMonsters(userId);
    if (!Number.isInteger(index) || index < 0 || !monsters[index]) {
      const monstersReference = this.commandReference('monsters');
      return {
        success: false,
        status: 'invalid_slot',
        message: monstersReference
          ? `Choose a monster slot from ${monstersReference}.`
          : 'Choose a valid monster slot.'
      };
    }
    try {
      const evolution = this.collection.evolveMonster(userId, monsters[index].monster_id);
      return {
        success: true,
        status: 'evolved',
        message: `${evolution.monster.name} reached Evolution ${evolution.evolutionStage}.`,
        evolution,
        card: this.collection.getMonsterCard(userId, monsters[index].monster_id)
      };
    } catch (error) {
      return {
        success: false,
        status: 'evolution_locked',
        message: error.message,
        errorCode: error.message
      };
    }
  }

  joinBattle(userId, requestedStance = null) {
    try {
      return this.store.runInTransaction(() => this.joinBattleLifecycle(userId, requestedStance));
    } catch (error) {
      this.syncQueue();
      throw error;
    }
  }

  executeBattle(userId, requestedStance = null) {
    if (this.battleMatchService) {
      this.progression?.recordCommand(userId, this.engine.streamKey);
      const result = this.battleMatchService.join({
        userId,
        stance: requestedStance || 'adaptive'
      });
      this.syncQueue();
      const chooseReference = this.commandReference('choose');
      const messages = {
        queued: 'Battle queue joined. Waiting for an opponent.',
        reserved: chooseReference
          ? `Match found. Use ${chooseReference} <slot> within 15 seconds.`
          : 'Match found. Your active monster locks in after 15 seconds.',
        active: 'Your current match is still active.',
        no_monster: 'Hatch an egg first, then choose a monster.',
        cooldown: `Battle queue cooldown. Try again in ${Math.ceil(
          Math.max(0, Number(result.retryAfterMs) || 0) / 1000
        )} seconds.`
      };
      return {
        success: !['invalid', 'no_monster', 'cooldown'].includes(result.status),
        ...result,
        message: messages[result.status] || result.error || result.status
      };
    }
    try {
      return this.store.runInTransaction(() => {
        this.progression?.recordCommand(userId, this.engine.streamKey);
        return this.joinBattleLifecycle(userId, requestedStance);
      });
    } catch (error) {
      this.syncQueue();
      throw error;
    }
  }

  joinBattleLifecycle(userId, requestedStance = null) {
    this.purgeExpiredQueue();
    const normalizedRequestedStance = String(requestedStance || '').trim().toLowerCase();
    if (requestedStance && !['power', 'guard', 'speed'].includes(normalizedRequestedStance)) {
      return {
        success: false,
        status: 'invalid_stance',
        message: 'Choose power, guard or speed.'
      };
    }
    const selected = this.store.getSelectedMonster(userId);
    if (!selected) return { success: false, status: 'no_monster', message: 'Hatch an egg first, then choose a monster.' };
    const stance = normalizedRequestedStance || this.battleService.stanceForMonster(selected);
    const ownEntry = this.store.getBattleQueueEntry(userId);
    const queuedAt = ownEntry?.queued_at_ms ?? this.now();
    this.store.removeBattleQueueEntry(userId);
    this.syncQueue();
    const candidates = this.queue.filter(entry => entry.userId !== userId);
    const eligible = candidates.filter(entry => {
      const levelGap = Math.abs((entry.monster.level || 1) - (selected.level || 1));
      const waitedLongEnough = (
        this.now() - entry.queuedAt >= 30_000 ||
        this.now() - queuedAt >= 30_000
      );
      return levelGap <= 2 || waitedLongEnough;
    });
    const fresh = eligible.filter(entry => !this.store.hasRecentOpponentPair(
      entry.userId,
      userId,
      this.now() - (10 * 60 * 1000)
    ));
    const waitingFreshOpponent = candidates.some(entry => (
      !eligible.includes(entry) &&
      !this.store.hasRecentOpponentPair(
        entry.userId,
        userId,
        this.now() - (10 * 60 * 1000)
      )
    ));
    const opponent = fresh[0] || (!waitingFreshOpponent ? eligible[0] : null) || null;
    if (!opponent) {
      this.store.enqueueBattle({
        userId,
        monsterId: selected.monster_id,
        stance,
        queuedAtMs: queuedAt
      });
      this.syncQueue();
      return { success: true, status: 'queued', message: 'Battle queue joined. Waiting for an opponent.' };
    }
    this.store.removeBattleQueueEntry(opponent.userId);
    this.syncQueue();
    const seed = `queue:${[opponent.userId, userId].sort().join(':')}:${this.now()}`;
    const battle = this.battleService.resolve(
      opponent.monster,
      selected,
      seed,
      opponent.stance,
      stance
    );
    this.emitAfterCommit('streammonsters:stance_revealed', {
      userId: opponent.userId,
      monster: opponent.monster,
      stance: battle.stanceA,
      battleId: battle.battleId
    });
    this.emitAfterCommit('streammonsters:stance_revealed', {
      userId,
      monster: selected,
      stance: battle.stanceB,
      battleId: battle.battleId
    });
    this.emitAfterCommit('streammonsters:battle_started', {
      battleId: battle.battleId,
      challenger: opponent.monster,
      defender: selected,
      seed,
      stanceA: battle.stanceA,
      stanceB: battle.stanceB,
      elementAdvantageMonsterId: battle.elementAdvantageMonsterId,
      stanceAdvantageMonsterId: battle.stanceAdvantageMonsterId
    });
    const winner = this.store.getMonster(battle.winnerId);
    if (winner) this.store.incrementViewer(winner.user_id, 'battles_won');
    this.store.incrementStreamMetric(this.engine.streamKey, 'duels');
    this.progression?.recordBattle(opponent.userId, this.engine.streamKey, {
      monster: opponent.monster,
      won: battle.winnerId === opponent.monster.monster_id
    });
    this.progression?.recordBattle(userId, this.engine.streamKey, {
      monster: selected,
      won: battle.winnerId === selected.monster_id
    });
    this.collection?.recordBattleOutcome({
      streamKey: this.engine.streamKey,
      battleId: battle.battleId,
      fighters: [
        { monster: opponent.monster, won: battle.winnerId === opponent.monster.monster_id },
        { monster: selected, won: battle.winnerId === selected.monster_id }
      ]
    });
    battle.rounds.forEach(round => {
      battle.events
        .filter(event => event.payload?.round === round.number)
        .forEach(event => {
          this.emitAfterCommit(event.type, { battleId: battle.battleId, ...event.payload });
        });
      this.emitAfterCommit('streammonsters:battle_round', { battleId: battle.battleId, round });
    });
    this.emitAfterCommit('streammonsters:battle_completed', {
      battleId: battle.battleId,
      battle,
      winner
    });
    if (winner) {
      const loser = winner.monster_id === opponent.monster.monster_id ? selected : opponent.monster;
      const streak = this.store.getViewerBattleStats?.(winner.user_id)?.win_streak || 0;
      if (streak >= 2) {
        this.emitAfterCommit('streammonsters:win_streak', {
          userId: winner.user_id,
          monster: winner,
          count: streak,
          battleId: battle.battleId
        });
      }
      if ((Number(winner.level) || 1) < (Number(loser.level) || 1)) {
        this.emitAfterCommit('streammonsters:upset', {
          userId: winner.user_id,
          winner,
          loser,
          battleId: battle.battleId
        });
      }
      const rivalryCount = this.store.countBattlesBetween?.(
        opponent.monster.monster_id,
        selected.monster_id
      ) || 0;
      if (rivalryCount >= 2) {
        this.emitAfterCommit('streammonsters:rivalry', {
          left: opponent.monster,
          right: selected,
          count: rivalryCount,
          battleId: battle.battleId
        });
      }
    }
    return { success: true, status: 'started', message: `${opponent.monster.name} battles ${selected.name}!`, battle };
  }

  leaveBattle(userId) {
    if (this.battleMatchService?.leave) {
      const result = this.battleMatchService.leave({ userId });
      if (result.status === 'cancelled') {
        return {
          success: true,
          ...result,
          status: 'match_cancelled',
          message: 'The reserved battle was cancelled before it started.'
        };
      }
      if (result.status === 'forfeited') {
        return {
          success: true,
          ...result,
          status: 'match_forfeited',
          message: 'The locked battle was forfeited and recorded as a loss.'
        };
      }
      if (result.status === 'cooldown') {
        return {
          success: true,
          ...result,
          status: 'dodge_cooldown',
          message: `You left the queue. Rejoin in ${Math.ceil(
            Math.max(0, Number(result.retryAfterMs) || 0) / 1000
          )} seconds.`
        };
      }
      return {
        success: result.status !== 'invalid',
        ...result,
        status: result.status === 'left_queue' ? 'left' : result.status,
        message: result.status === 'left_queue'
          ? 'You left the battle queue.'
          : 'You were not in the battle queue.'
      };
    }
    const activeMatch = this.battleMatchService?.getActiveMatchForViewer?.(userId);
    if (activeMatch?.state === 'roster') {
      const cancelled = this.battleMatchService.cancelBeforeBattle?.(userId);
      if (cancelled?.cancelled) {
        return {
          success: true,
          status: 'match_cancelled',
          message: 'The reserved battle was cancelled before it started.'
        };
      }
    }
    if (activeMatch) {
      return {
        success: false,
        status: 'match_locked',
        message: 'A battle in progress cannot be left.'
      };
    }
    this.purgeExpiredQueue();
    const removed = this.store.removeBattleQueueEntry(userId);
    this.syncQueue();
    return {
      success: true,
      status: 'left',
      message: removed ? 'You left the battle queue.' : 'You were not in the battle queue.'
    };
  }

  rank(userId) {
    const collector = this.progression?.getViewerSeason?.(userId) || {
      points: 0,
      rank: 'Bronze'
    };
    const arenaSeason = this.battleMatchService?.getCurrentArenaSeason?.();
    const arena = arenaSeason?.seasonId
      ? this.battleMatchService.getArenaRating(arenaSeason.seasonId, userId)
      : {
          seasonId: null,
          viewerId: userId,
          rating: 900,
          battlesRated: 0,
          tier: 'Bronze'
        };
    return {
      success: true,
      status: 'rank',
      message: `Arena Rating: ${arena.tier} · ${arena.rating}. ` +
        `Collector Score: ${collector.rank} · ${collector.points}.`,
      arena,
      collector,
      score: collector
    };
  }

  quests(userId) {
    this.progression?.ensureViewerQuests?.(userId);
    const daily = this.progression
      ? this.store.getViewerQuests(userId, this.progression.dateKey())
      : [];
    const weekly = this.progression
      ? this.store.getViewerQuests(userId, this.progression.weekKey())
      : [];
    const withTitleKey = quest => ({
      ...quest,
      titleKey: this.progression?.questTitleKey?.(quest.quest_key) || 'questUnknown'
    });
    return {
      success: true,
      status: 'quests',
      message: `${daily.filter(quest => quest.completed).length}/${daily.length} daily · ${weekly.filter(quest => quest.completed).length}/${weekly.length} weekly.`,
      daily: daily.map(withTitleKey),
      weekly: weekly.map(withTitleKey)
    };
  }

  purgeExpiredQueue() {
    const cutoff = this.now() - this.queueTtlMs;
    this.store.purgeBattleQueue(cutoff);
    this.syncQueue();
  }

  syncQueue() {
    if (!this.store?.getBattleQueue) return this.queue;
    this.queue = this.store.getBattleQueue()
      .map(entry => ({
        userId: entry.user_id,
        monster: this.store.getMonster(entry.monster_id),
        stance: entry.stance,
        queuedAt: entry.queued_at_ms
      }))
      .filter(entry => entry.monster);
    return this.queue;
  }
}

module.exports = ChatCommands;
