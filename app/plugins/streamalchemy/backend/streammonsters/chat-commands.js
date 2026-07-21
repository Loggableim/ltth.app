class ChatCommands {
  constructor({ store, engine, battleService, progression = null, emit = () => {}, now = () => Date.now(), queueTtlMs = 5 * 60 * 1000, globalCooldownMs = 250 }) {
    this.store = store;
    this.engine = engine;
    this.battleService = battleService;
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
    if (!['!inventory', '!monsters', '!choose', '!battle', '!leavebattle', '!monstershelp'].includes(command)) {
      return { success: false, status: 'ignored' };
    }
    if (this.isCoolingDown(userId, command)) return { success: false, status: 'cooldown', message: 'Please wait before using that command again.' };
    if (command !== '!battle' && this.isGloballyCoolingDown()) {
      return { success: false, status: 'global_cooldown', message: 'The Stream Monsters chat is busy. Please try again in a moment.' };
    }
    this.recordCommandUsage(userId, command);
    this.engine.hatchReadyEggs(userId);
    this.progression?.recordCommand(userId, this.engine.streamKey);

    if (command === '!inventory' || command === '!monsters') return this.inventory(userId);
    if (command === '!choose') return this.choose(userId, args[0]);
    if (command === '!battle') return this.joinBattle(userId);
    if (command === '!leavebattle') return this.leaveBattle(userId);
    return {
      success: true,
      status: 'help',
      message: 'Commands: !inventory, !monsters, !choose <slot>, !battle, !leavebattle'
    };
  }

  inventory(userId) {
    const monsters = this.store.getViewerMonsters(userId);
    const eggs = this.store.getViewerEggs(userId, 'incubating');
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

  joinBattle(userId) {
    this.purgeExpiredQueue();
    const selected = this.store.getSelectedMonster(userId);
    if (!selected) return { success: false, status: 'no_monster', message: 'Hatch an egg first, then choose a monster.' };
    if (this.queue.some(entry => entry.userId === userId)) {
      return { success: true, status: 'queued', message: 'You are already waiting for a battle.' };
    }
    const opponentIndex = this.queue.findIndex(entry => entry.userId !== userId);
    if (opponentIndex < 0) {
      this.queue.push({ userId, monster: selected, queuedAt: this.now() });
      return { success: true, status: 'queued', message: 'Battle queue joined. Waiting for an opponent.' };
    }
    const [opponent] = this.queue.splice(opponentIndex, 1);
    const seed = `queue:${[opponent.userId, userId].sort().join(':')}:${this.now()}`;
    this.emit('streammonsters:battle_started', { challenger: opponent.monster, defender: selected, seed });
    const battle = this.battleService.resolve(opponent.monster, selected, seed);
    const winner = this.store.getMonster(battle.winnerId);
    if (winner) this.store.incrementViewer(winner.user_id, 'battles_won');
    this.store.incrementStreamMetric(this.engine.streamKey, 'duels');
    this.progression?.recordBattle(opponent.userId, this.engine.streamKey);
    this.progression?.recordBattle(userId, this.engine.streamKey);
    this.emit('streammonsters:battle_completed', { battle, winner });
    return { success: true, status: 'started', message: `${opponent.monster.name} battles ${selected.name}!`, battle };
  }

  leaveBattle(userId) {
    this.purgeExpiredQueue();
    const previousLength = this.queue.length;
    this.queue = this.queue.filter(entry => entry.userId !== userId);
    return {
      success: true,
      status: 'left',
      message: previousLength === this.queue.length ? 'You were not in the battle queue.' : 'You left the battle queue.'
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
