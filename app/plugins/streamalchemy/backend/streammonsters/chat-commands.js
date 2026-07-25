function formatRemainingDuration(remainingMs) {
  const totalSeconds = Math.max(1, Math.ceil(Math.max(0, Number(remainingMs) || 0) / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

class ChatCommands {
  constructor({ store, engine, battleService, battleMatchService = null, progression = null, emit = () => {}, now = () => Date.now(), queueTtlMs = 5 * 60 * 1000, globalCooldownMs = 250 }) {
    this.store = store;
    this.engine = engine;
    this.battleService = battleService;
    this.battleMatchService = battleMatchService;
    this.progression = progression;
    this.emit = emit;
    this.now = now;
    this.queueTtlMs = queueTtlMs;
    this.globalCooldownMs = globalCooldownMs;
    this.queue = [];
    this.userCooldowns = new Map();
    this.lastGlobalCommandAt = null;
  }

  handle(context = {}, rawMessage = '') {
    const userId = context.username || context.uniqueId || context.userId;
    const [command, ...args] = String(rawMessage || '').trim().toLowerCase().split(/\s+/);
    if (!userId || !command?.startsWith('!')) return { success: false, status: 'ignored' };
    if (![
      '!eggs', '!hatch', '!inventory', '!monsters', '!monster', '!choose',
      '!battle', '!leavebattle', '!rank', '!quests', '!monstershelp'
    ].includes(command)) {
      return { success: false, status: 'ignored' };
    }
    if (!context.skipCooldowns) {
      if (this.isCoolingDown(userId, command)) return { success: false, status: 'cooldown', message: 'Please wait before using that command again.' };
      if (command !== '!battle' && command !== '!hatch' && this.isGloballyCoolingDown()) {
        return { success: false, status: 'global_cooldown', message: 'The Stream Monsters chat is busy. Please try again in a moment.' };
      }
      this.recordCommandUsage(userId, command);
    }
    this.engine.markReadyEggs();
    this.progression?.recordCommand(userId, this.engine.streamKey);

    if (command === '!eggs') return this.eggs(userId);
    if (command === '!hatch') return this.hatch(userId, args[0]);
    if (command === '!inventory' || command === '!monsters') return this.inventory(userId);
    if (command === '!monster') return this.monster(userId, args[0]);
    if (command === '!choose') return this.choose(userId, args[0]);
    if (command === '!battle') return this.joinBattle(userId);
    if (command === '!leavebattle') return this.leaveBattle(userId);
    if (command === '!rank') return this.rank(userId);
    if (command === '!quests') return this.quests(userId);
    return {
      success: true,
      status: 'help',
      message: 'Commands: !eggs, !hatch <slot>, !monsters, !monster <slot>, !choose <slot>, !battle, !leavebattle, !monsterrank, !quests'
    };
  }

  eggs(userId) {
    const eggs = this.store.getViewerHatchableEggs(userId);
    const expiredEggs = this.store.getViewerEggs(userId, 'expired');
    const ready = eggs.filter(egg => egg.state === 'ready').length;
    return {
      success: true,
      status: 'eggs',
      message: `${eggs.length} egg${eggs.length === 1 ? '' : 's'} (${ready} ready)${expiredEggs.length ? ` · ${expiredEggs.length} expired` : ''}. Use !hatch <slot>.`,
      eggs,
      expiredEggs
    };
  }

  hatch(userId, slot) {
    const requestedSlot = Math.max(1, Number.parseInt(slot, 10) || 1);
    const egg = this.store.getViewerHatchableEggs(userId)[requestedSlot - 1];
    if (egg?.state === 'incubating') {
      const storedReadyAtMs = Number(egg.ready_at_ms);
      const fallbackReadyAtMs = Number(egg.created_at_ms) + Number(egg.hatch_duration_ms) - Number(egg.boost_ms || 0);
      const readyAtMs = Number.isFinite(storedReadyAtMs) ? storedReadyAtMs : fallbackReadyAtMs;
      const remainingMs = Math.max(0, readyAtMs - this.now());
      if (remainingMs > 0) {
        return {
          success: false,
          status: 'egg_not_ready',
          slot: requestedSlot,
          remainingMs,
          readyAtMs,
          message: `Egg ${requestedSlot} is still incubating. Try !hatch ${requestedSlot} again in ${formatRemainingDuration(remainingMs)}.`
        };
      }
    }
    try {
      const monster = this.engine.hatchEgg(userId, requestedSlot);
      return {
        success: true,
        status: 'hatched',
        message: `${monster.name} hatched! ${monster.personality} · ${monster.element}.`,
        monster
      };
    } catch (error) {
      if (error?.message !== 'STREAM_MONSTERS_EGG_NOT_READY') throw error;
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
    const battleChoice = this.battleMatchService?.chooseMonster(userId, slot);
    if (battleChoice) return battleChoice;
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
      slot: index + 1,
      monster
    };
  }

  joinBattle(userId) {
    if (this.battleMatchService) return this.battleMatchService.join(userId);
    this.purgeExpiredQueue();
    const selected = this.store.getSelectedMonster(userId);
    if (!selected) return { success: false, status: 'no_monster', message: 'Hatch an egg first, then choose a monster.' };
    const ownEntry = this.queue.find(entry => entry.userId === userId);
    const queuedAt = ownEntry?.queuedAt ?? this.now();
    this.queue = this.queue.filter(entry => entry.userId !== userId);
    const opponentIndex = this.queue.findIndex(entry => {
      if (entry.userId === userId) return false;
      const levelGap = Math.abs((entry.monster.level || 1) - (selected.level || 1));
      const waitedLongEnough = (
        this.now() - entry.queuedAt >= 30_000 ||
        this.now() - queuedAt >= 30_000
      );
      return levelGap <= 2 || waitedLongEnough;
    });
    if (opponentIndex < 0) {
      this.queue.push({ userId, monster: selected, queuedAt });
      return { success: true, status: 'queued', message: 'Battle queue joined. Waiting for an opponent.' };
    }
    const [opponent] = this.queue.splice(opponentIndex, 1);
    const seed = `queue:${[opponent.userId, userId].sort().join(':')}:${this.now()}`;
    const elementAdvantageMonsterId = this.battleService.elementAdvantageMonsterId(opponent.monster, selected);
    this.emit('streammonsters:battle_started', {
      challenger: opponent.monster,
      defender: selected,
      seed,
      elementAdvantageMonsterId
    });
    const battle = this.battleService.resolve(opponent.monster, selected, seed);
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
    if (this.battleMatchService) return this.battleMatchService.leave(userId);
    this.purgeExpiredQueue();
    const previousLength = this.queue.length;
    this.queue = this.queue.filter(entry => entry.userId !== userId);
    return {
      success: true,
      status: 'left',
      message: previousLength === this.queue.length ? 'You were not in the battle queue.' : 'You left the battle queue.'
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
    this.queue = this.queue.filter(entry => entry.queuedAt >= cutoff);
  }

  isCoolingDown(userId, command) {
    const key = `${userId}:${command}`;
    const cooldownMs = command === '!battle' ? 2_000 : 1_000;
    const previous = this.userCooldowns.get(key);
    return previous !== undefined && this.now() - previous < cooldownMs;
  }

  recordCommandUsage(userId, command) {
    this.userCooldowns.set(`${userId}:${command}`, this.now());
  }

  isGloballyCoolingDown() {
    const current = this.now();
    if (this.lastGlobalCommandAt !== null && current - this.lastGlobalCommandAt < this.globalCooldownMs) return true;
    this.lastGlobalCommandAt = current;
    return false;
  }
}

module.exports = ChatCommands;
