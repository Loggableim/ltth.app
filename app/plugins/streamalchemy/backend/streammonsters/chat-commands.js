class ChatCommands {
  constructor({ store, engine, battleService, progression = null, emit = () => {}, now = () => Date.now(), queueTtlMs = 5 * 60 * 1000 }) {
    this.store = store;
    this.engine = engine;
    this.battleService = battleService;
    this.progression = progression;
    this.emit = emit;
    this.now = now;
    this.queueTtlMs = queueTtlMs;
    this.queue = [];
    this.syncQueue();
  }

  execute(context = {}, commandName = '', args = []) {
    const userId = context.userId || context.uniqueId || context.username;
    const command = String(commandName || '').trim().toLowerCase();
    const commandArgs = Array.isArray(args) ? args : [];
    if (!userId) return { success: false, status: 'ignored' };
    if (![
      'adopt', 'eggs', 'hatch', 'inventory', 'monsters', 'monster', 'choose',
      'battle', 'leavebattle', 'rank', 'quests', 'monstershelp'
    ].includes(command)) {
      return { success: false, status: 'ignored' };
    }
    this.engine.markReadyEggs();
    if (command === 'adopt') return this.adopt(userId);
    this.progression?.recordCommand(userId, this.engine.streamKey);

    if (command === 'eggs') return this.eggs(userId);
    if (command === 'hatch') return this.hatch(userId, commandArgs[0]);
    if (command === 'inventory' || command === 'monsters') return this.inventory(userId);
    if (command === 'monster') return this.monster(userId, commandArgs[0]);
    if (command === 'choose') return this.choose(userId, commandArgs[0]);
    if (command === 'battle') return this.joinBattle(userId, commandArgs[0]);
    if (command === 'leavebattle') return this.leaveBattle(userId);
    if (command === 'rank') return this.rank(userId);
    if (command === 'quests') return this.quests(userId);
    return {
      success: true,
      status: 'help',
      message: 'Commands: !adopt, !eggs, !hatch <slot>, !monsters, !monster <slot>, !choose <slot>, !battle [power|guard|speed], !leavebattle, !rank, !quests'
    };
  }

  adopt(userId) {
    const result = this.engine.adoptStarter(userId);
    if (!result.claimed) {
      return {
        success: false,
        status: 'starter_already_claimed',
        message: 'You already claimed your starter egg.',
        egg: result.egg
      };
    }
    return {
      success: true,
      status: 'starter_claimed',
      message: `Your ${result.egg.element} starter egg is incubating for 60 seconds.`,
      egg: result.egg
    };
  }

  eggs(userId) {
    const eggs = this.store.getViewerEggs(userId).filter(egg => egg.state !== 'hatched');
    const ready = eggs.filter(egg => egg.state === 'ready').length;
    return {
      success: true,
      status: 'eggs',
      message: `${eggs.length} egg${eggs.length === 1 ? '' : 's'} (${ready} ready). Use !hatch <slot>.`,
      eggs
    };
  }

  hatch(userId, slot) {
    try {
      const monster = this.engine.hatchEgg(userId, slot || 1);
      return {
        success: true,
        status: 'hatched',
        message: `${monster.name} hatched! ${monster.personality} · ${monster.element}.`,
        monster
      };
    } catch (error) {
      return {
        success: false,
        status: 'egg_not_ready',
        message: 'That egg is not ready yet. Check !eggs.'
      };
    }
  }

  inventory(userId) {
    const monsters = this.store.getViewerMonsters(userId);
    const eggs = this.store.getViewerEggs(userId).filter(egg => egg.state !== 'hatched');
    const selected = this.store.getSelectedMonster(userId);
    const selectedLabel = selected ? ` Active: ${selected.name}.` : '';
    return {
      success: true,
      status: 'inventory',
      message: `${monsters.length} monster${monsters.length === 1 ? '' : 's'} and ${eggs.length} egg${eggs.length === 1 ? '' : 's'}.${selectedLabel}`,
      monsters,
      eggs,
      selected
    };
  }

  choose(userId, slot) {
    const index = Number.parseInt(slot, 10) - 1;
    const monsters = this.store.getViewerMonsters(userId);
    if (!Number.isInteger(index) || index < 0 || !monsters[index]) {
      return { success: false, status: 'invalid_slot', message: 'Choose a monster slot from !monsters.' };
    }
    const selected = this.store.selectMonster(userId, monsters[index].monster_id);
    return { success: true, status: 'selected', message: `${selected.name} is ready to battle.`, selected };
  }

  monster(userId, slot) {
    const index = Number.parseInt(slot, 10) - 1;
    const monsters = this.store.getViewerMonsters(userId);
    if (!Number.isInteger(index) || index < 0 || !monsters[index]) {
      return { success: false, status: 'invalid_slot', message: 'Choose a monster slot from !monsters.' };
    }
    const monster = monsters[index];
    return {
      success: true,
      status: 'monster',
      message: `${monster.name} · ${monster.element} · Lv.${monster.level} · ${monster.personality}.`,
      monster
    };
  }

  joinBattle(userId, requestedStance = null) {
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
    const eligible = this.queue.filter(entry => {
      if (entry.userId === userId) return false;
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
    const opponent = (fresh.length ? fresh : eligible)[0] || null;
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
    this.emit('streammonsters:battle_started', {
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
    battle.rounds.forEach(round => {
      this.emit('streammonsters:battle_round', { battleId: battle.battleId, round });
    });
    this.emit('streammonsters:battle_completed', { battle, winner });
    return { success: true, status: 'started', message: `${opponent.monster.name} battles ${selected.name}!`, battle };
  }

  leaveBattle(userId) {
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
    const score = this.progression?.getViewerSeason?.(userId) || { points: 0, rank: 'Bronze' };
    return {
      success: true,
      status: 'rank',
      message: `${score.rank} · ${score.points} season points.`,
      score
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
    return {
      success: true,
      status: 'quests',
      message: `${daily.filter(quest => quest.completed).length}/${daily.length} daily · ${weekly.filter(quest => quest.completed).length}/${weekly.length} weekly.`,
      daily,
      weekly
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
