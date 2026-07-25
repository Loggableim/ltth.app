class BattleMatchService {
  constructor({
    store,
    engine,
    battleService,
    progression = null,
    emit = () => {},
    now = () => Date.now(),
    queueTtlMs = 5 * 60 * 1000,
    rosterTimeoutMs = 30_000,
    skillTimeoutMs = 12_000,
    statTimeoutMs = 30_000,
    entranceDelayMs = 3_000,
    actionDelayMs = 6_000,
    rematchCooldownMs = 10 * 60 * 1000,
    setTimer = setTimeout,
    clearTimer = clearTimeout
  }) {
    this.store = store;
    this.engine = engine;
    this.battleService = battleService;
    this.progression = progression;
    this.emit = emit;
    this.now = now;
    this.queueTtlMs = queueTtlMs;
    this.rosterTimeoutMs = rosterTimeoutMs;
    this.skillTimeoutMs = skillTimeoutMs;
    this.statTimeoutMs = statTimeoutMs;
    this.entranceDelayMs = entranceDelayMs;
    this.actionDelayMs = actionDelayMs;
    this.rematchCooldownMs = rematchCooldownMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.queue = [];
    this.activeMatch = null;
    this.pendingStatChoices = new Map();
    this.timers = new Map();
    this.rematchAt = new Map();
  }

  join(userId) {
    this.purgeExpiredQueue();
    if (!userId) return { success: false, status: 'no_user' };
    if (this.activeMatch?.participants[userId]) {
      return { success: true, status: 'match_active', match: this.publicMatch(this.activeMatch, userId) };
    }
    const selected = this.store.getSelectedMonster(userId);
    if (!selected) return { success: false, status: 'no_monster', message: 'Hatch an egg first, then choose a monster.' };
    const existing = this.queue.find(entry => entry.userId === userId);
    const queuedAt = existing?.queuedAt ?? this.now();
    this.queue = this.queue.filter(entry => entry.userId !== userId);
    this.queue.push({ userId, monster: selected, queuedAt });
    if (!this.activeMatch) this.tryMatch();
    if (this.activeMatch?.participants[userId]) {
      return { success: true, status: 'match_found', match: this.publicMatch(this.activeMatch, userId) };
    }
    return { success: true, status: 'queued', message: 'Battle queue joined. Waiting for an opponent.' };
  }

  leave(userId) {
    this.purgeExpiredQueue();
    const before = this.queue.length;
    this.queue = this.queue.filter(entry => entry.userId !== userId);
    if (before !== this.queue.length) {
      return { success: true, status: 'left', message: 'You left the battle queue.' };
    }
    if (this.activeMatch?.phase === 'roster_selection' && this.activeMatch.participants[userId]) {
      this.cancelActiveMatch(userId, 'left_before_start');
      return { success: true, status: 'match_cancelled', message: 'Battle reservation cancelled before it started.' };
    }
    return { success: true, status: 'left', message: 'You were not in the battle queue.' };
  }

  chooseMonster(userId, slot) {
    const match = this.activeMatch;
    if (!match || match.phase !== 'roster_selection' || !match.participants[userId]) return null;
    const index = Number.parseInt(slot, 10) - 1;
    const monsters = this.store.getViewerMonsters(userId);
    if (!Number.isInteger(index) || index < 0 || !monsters[index]) {
      return { success: false, status: 'invalid_slot', message: 'Choose a monster slot from !monsters.' };
    }
    const participant = match.participants[userId];
    if (participant.locked) {
      return { success: true, status: 'roster_already_locked', match: this.publicMatch(match, userId) };
    }
    participant.monsterId = monsters[index].monster_id;
    participant.locked = true;
    this.emit('streammonsters:battle_roster_locked', {
      matchId: match.matchId,
      userId,
      monster: monsters[index],
      locked: true,
      match: this.publicMatch(match)
    });
    if (Object.values(match.participants).every(entry => entry.locked)) this.startBattle(match);
    return { success: true, status: 'roster_locked', monster: monsters[index], match: this.publicMatch(match, userId) };
  }

  handleRawResponse(context = {}, rawMessage = '') {
    const userId = context.userId || context.uniqueId || context.username || context.rawData?.uniqueId || context.rawData?.userId;
    const input = String(rawMessage || '').trim().toUpperCase();
    if (!userId || !/^[ABC1-4]$/.test(input)) return { handled: false };
    if (['A', 'B', 'C'].includes(input)) return this.lockSkill(userId, input);
    return this.chooseStat(userId, input);
  }

  lockSkill(userId, choice) {
    const match = this.activeMatch;
    if (!match || match.phase !== 'skill_selection' || !match.participants[userId]) return { handled: false };
    const participant = match.participants[userId];
    const monsterId = participant.monsterId;
    if (match.skillWindow.lockedChoices[monsterId]) {
      return { handled: true, result: { success: false, status: 'skill_already_locked' } };
    }
    const skill = this.battleService.getAvailableSkills(match.battleState, monsterId)?.[choice];
    if (!skill?.available) {
      return { handled: true, result: { success: false, status: 'skill_unavailable' } };
    }
    match.skillWindow.lockedChoices[monsterId] = choice;
    this.emit('streammonsters:battle_skill_locked', {
      matchId: match.matchId,
      battleId: match.battleState.battleId,
      roundNumber: match.battleState.roundNumber + 1,
      userId,
      monsterId,
      choice,
      auto: false,
      lockedChoices: { ...match.skillWindow.lockedChoices }
    });
    if (Object.values(match.participants).every(entry => match.skillWindow.lockedChoices[entry.monsterId])) {
      this.resolveSkillWindow(match);
    }
    return { handled: true, result: { success: true, status: 'skill_locked', choice } };
  }

  chooseStat(userId, input) {
    const pending = this.pendingStatChoices.get(userId);
    if (!pending) return { handled: false };
    const stat = { 1: 'vitality', 2: 'might', 3: 'guard', 4: 'agility' }[input];
    if (!stat) return { handled: false };
    this.clearScheduled(`stat:${userId}`);
    const monster = this.store.applyMonsterStatPoint(userId, pending.monsterId, stat);
    this.pendingStatChoices.delete(userId);
    this.emit('streammonsters:monster_stat_chosen', {
      userId,
      monster,
      stat,
      auto: false
    });
    this.openNextStatPrompt(userId, pending.seed);
    return { handled: true, result: { success: true, status: 'stat_chosen', stat, monster } };
  }

  tryMatch() {
    if (this.activeMatch) return null;
    this.purgeExpiredQueue();
    for (let index = 0; index < this.queue.length; index += 1) {
      const challenger = this.queue[index];
      const opponents = this.queue
        .filter((entry, entryIndex) => entryIndex !== index && this.isEligible(challenger, entry));
      const opponent = opponents.find(entry => !this.isRecentRematch(challenger.userId, entry.userId)) || opponents[0];
      if (opponent) return this.reserveMatch(challenger, opponent);
    }
    return null;
  }

  isEligible(first, second) {
    if (first.userId === second.userId) return false;
    const gap = Math.abs((first.monster.level || 1) - (second.monster.level || 1));
    const waitedLongEnough = this.now() - first.queuedAt >= 30_000 || this.now() - second.queuedAt >= 30_000;
    return gap <= 2 || waitedLongEnough;
  }

  reserveMatch(challenger, defender) {
    this.queue = this.queue.filter(entry => entry.userId !== challenger.userId && entry.userId !== defender.userId);
    const seed = `match:${[challenger.userId, defender.userId].sort().join(':')}:${this.now()}`;
    const match = {
      matchId: `match-${this.hashNumber(seed).toString(16)}`,
      seed,
      phase: 'roster_selection',
      createdAtMs: this.now(),
      rosterDeadlineAtMs: this.now() + this.rosterTimeoutMs,
      participants: {
        [challenger.userId]: {
          userId: challenger.userId,
          defaultMonsterId: challenger.monster.monster_id,
          monsterId: null,
          locked: false,
          queuedAt: challenger.queuedAt
        },
        [defender.userId]: {
          userId: defender.userId,
          defaultMonsterId: defender.monster.monster_id,
          monsterId: null,
          locked: false,
          queuedAt: defender.queuedAt
        }
      },
      battleState: null,
      skillWindow: null
    };
    this.activeMatch = match;
    this.emit('streammonsters:battle_match_found', { match: this.publicMatch(match) });
    this.schedule('match', this.rosterTimeoutMs, () => this.startBattle(match));
    return match;
  }

  startBattle(match = this.activeMatch) {
    if (!match || this.activeMatch !== match || match.phase !== 'roster_selection') return;
    this.clearScheduled('match');
    const participants = Object.values(match.participants);
    for (const participant of participants) {
      if (!participant.monsterId) participant.monsterId = participant.defaultMonsterId;
      participant.locked = true;
    }
    const monsters = participants.map(participant => this.store.getMonster(participant.monsterId));
    if (monsters.some(monster => !monster)) {
      this.cancelActiveMatch(null, 'monster_missing');
      return;
    }
    match.battleState = this.battleService.createBattleState(monsters[0], monsters[1], match.seed);
    match.phase = 'entering';
    this.emit('streammonsters:battle_roster_locked', {
      matchId: match.matchId,
      autoLocked: true,
      participants: participants.map(participant => ({
        userId: participant.userId,
        monster: this.store.getMonster(participant.monsterId)
      })),
      match: this.publicMatch(match)
    });
    this.emit('streammonsters:battle_started', {
      challenger: monsters[0],
      defender: monsters[1],
      seed: match.seed,
      battleId: match.battleState.battleId,
      elementAdvantageMonsterId: match.battleState.elementAdvantageMonsterId
    });
    this.schedule('match', this.entranceDelayMs, () => this.openSkillWindow(match));
  }

  openSkillWindow(match = this.activeMatch) {
    if (!match || this.activeMatch !== match || match.phase === 'finished') return;
    this.clearScheduled('match');
    match.phase = 'skill_selection';
    const roundNumber = match.battleState.roundNumber + 1;
    match.skillWindow = {
      roundNumber,
      deadlineAtMs: this.now() + this.skillTimeoutMs,
      lockedChoices: {}
    };
    const skills = Object.fromEntries(Object.values(match.participants).map(participant => [
      participant.monsterId,
      this.battleService.getAvailableSkills(match.battleState, participant.monsterId)
    ]));
    this.emit('streammonsters:battle_skill_prompt', {
      matchId: match.matchId,
      battleId: match.battleState.battleId,
      roundNumber,
      deadlineAtMs: match.skillWindow.deadlineAtMs,
      skills,
      match: this.publicMatch(match)
    });
    this.schedule('match', this.skillTimeoutMs, () => this.resolveSkillWindow(match));
  }

  resolveSkillWindow(match = this.activeMatch) {
    if (!match || this.activeMatch !== match || match.phase !== 'skill_selection') return;
    this.clearScheduled('match');
    const requested = {};
    for (const participant of Object.values(match.participants)) {
      const monsterId = participant.monsterId;
      requested[monsterId] = match.skillWindow.lockedChoices[monsterId] || null;
    }
    const resolved = this.battleService.resolveRound(match.battleState, requested);
    match.battleState = resolved.state;
    for (const participant of Object.values(match.participants)) {
      const monsterId = participant.monsterId;
      if (match.skillWindow.lockedChoices[monsterId]) continue;
      this.emit('streammonsters:battle_skill_locked', {
        matchId: match.matchId,
        battleId: match.battleState.battleId,
        roundNumber: resolved.round.number,
        userId: participant.userId,
        monsterId,
        choice: resolved.round.selectedChoices[monsterId],
        auto: true,
        lockedChoices: { ...resolved.round.selectedChoices }
      });
    }
    resolved.round.actions.forEach(action => this.emit('streammonsters:battle_action', {
      matchId: match.matchId,
      battleId: match.battleState.battleId,
      roundNumber: resolved.round.number,
      action
    }));
    this.emit('streammonsters:battle_round', { battleId: match.battleState.battleId, round: resolved.round });
    if (resolved.state.knockout) {
      this.emit('streammonsters:battle_knockout', {
        matchId: match.matchId,
        battleId: match.battleState.battleId,
        knockout: resolved.state.knockout
      });
    }
    if (resolved.state.finished) {
      this.finishBattle(match);
      return;
    }
    match.phase = 'resolving';
    this.schedule('match', this.actionDelayMs, () => this.openSkillWindow(match));
  }

  finishBattle(match) {
    if (!match || this.activeMatch !== match || match.phase === 'finished') return;
    this.clearScheduled('match');
    match.phase = 'finished';
    let battle = this.battleService.finalize(match.battleState);
    const winner = this.store.getMonster(battle.winnerId);
    if (winner) this.store.incrementViewer(winner.user_id, 'battles_won');
    if (this.engine.streamKey) this.store.incrementStreamMetric(this.engine.streamKey, 'duels');
    const rewards = [];
    for (const participant of Object.values(match.participants)) {
      const monster = this.store.getMonster(participant.monsterId);
      const progress = this.progression?.recordBattle(participant.userId, this.engine.streamKey, {
        monster,
        won: battle.winnerId === participant.monsterId
      }) || { monster };
      const progressedMonster = progress.monster || this.store.getMonster(participant.monsterId);
      rewards.push({
        monsterId: participant.monsterId,
        xpAwarded: progress.xpAwarded || 0,
        levelUps: progress.levelUps || 0,
        unspentStatPoints: progressedMonster?.unspent_stat_points || 0
      });
      this.emit('streammonsters:monster_xp_awarded', {
        userId: participant.userId,
        monster: progressedMonster,
        xpAwarded: progress.xpAwarded || 0,
        winner: battle.winnerId === participant.monsterId
      });
      if (progress.levelUps > 0) {
        this.emit('streammonsters:monster_level_up', {
          userId: participant.userId,
          monster: progressedMonster,
          levels: progress.levelUps
        });
        this.openNextStatPrompt(participant.userId, match.seed);
      }
    }
    battle = this.battleService.persistRewards(battle, rewards);
    this.rematchAt.set(this.rematchKey(...Object.keys(match.participants)), this.now());
    this.emit('streammonsters:battle_completed', { battle, winner });
    this.activeMatch = null;
    this.tryMatch();
  }

  cancelActiveMatch(cancelledBy, reason) {
    const match = this.activeMatch;
    if (!match) return;
    this.clearScheduled('match');
    this.activeMatch = null;
    for (const participant of Object.values(match.participants)) {
      if (participant.userId === cancelledBy) continue;
      const monster = this.store.getSelectedMonster(participant.userId);
      if (monster) this.queue.push({ userId: participant.userId, monster, queuedAt: participant.queuedAt });
    }
    this.emit('streammonsters:battle_cancelled', {
      matchId: match.matchId,
      cancelledBy,
      reason
    });
  }

  openStatPrompt(userId, monsterId, seed) {
    const monster = this.store.getMonster(monsterId);
    if (!monster || monster.user_id !== userId || (Number(monster.unspent_stat_points) || 0) <= 0) return null;
    this.clearScheduled(`stat:${userId}`);
    const pending = {
      userId,
      monsterId,
      seed: String(seed || monsterId),
      deadlineAtMs: this.now() + this.statTimeoutMs
    };
    this.pendingStatChoices.set(userId, pending);
    this.emit('streammonsters:monster_stat_prompt', {
      ...pending,
      monster,
      choices: { 1: 'vitality', 2: 'might', 3: 'guard', 4: 'agility' }
    });
    this.schedule(`stat:${userId}`, this.statTimeoutMs, () => this.autoChooseStat(userId));
    return pending;
  }

  openNextStatPrompt(userId, seed) {
    if (this.pendingStatChoices.has(userId)) return;
    const monster = this.store.getViewerPendingStatChoice(userId);
    if (monster) this.openStatPrompt(userId, monster.monster_id, seed);
  }

  autoChooseStat(userId) {
    const pending = this.pendingStatChoices.get(userId);
    if (!pending) return;
    this.pendingStatChoices.delete(userId);
    this.clearScheduled(`stat:${userId}`);
    const names = ['vitality', 'might', 'guard', 'agility'];
    const stat = names[this.hashNumber(`${pending.seed}:${pending.monsterId}:stat`) % names.length];
    const monster = this.store.applyMonsterStatPoint(userId, pending.monsterId, stat);
    this.emit('streammonsters:monster_stat_auto_assigned', { userId, monster, stat, auto: true });
    this.openNextStatPrompt(userId, pending.seed);
  }

  getPublicSnapshot(userId = null) {
    return {
      match: this.publicMatch(this.activeMatch, userId),
      queueLength: this.queue.length,
      pendingStatChoice: userId ? this.publicStatPrompt(this.pendingStatChoices.get(userId)) : null
    };
  }

  publicMatch(match, viewerId = null) {
    if (!match) return null;
    const participants = Object.values(match.participants).map(participant => ({
      userId: participant.userId,
      monsterId: participant.monsterId,
      locked: participant.locked,
      isViewer: participant.userId === viewerId
    }));
    return {
      matchId: match.matchId,
      phase: match.phase,
      rosterDeadlineAtMs: match.rosterDeadlineAtMs || null,
      skillDeadlineAtMs: match.skillWindow?.deadlineAtMs || null,
      participants,
      battle: match.battleState ? {
        battleId: match.battleState.battleId,
        roundNumber: match.battleState.roundNumber,
        fighters: this.battleService.snapshotFighters(match.battleState),
        elementAdvantageMonsterId: match.battleState.elementAdvantageMonsterId
      } : null
    };
  }

  publicStatPrompt(pending) {
    if (!pending) return null;
    return {
      monsterId: pending.monsterId,
      deadlineAtMs: pending.deadlineAtMs,
      choices: { 1: 'vitality', 2: 'might', 3: 'guard', 4: 'agility' }
    };
  }

  purgeExpiredQueue() {
    const cutoff = this.now() - this.queueTtlMs;
    this.queue = this.queue.filter(entry => entry.queuedAt >= cutoff);
  }

  isRecentRematch(firstUserId, secondUserId) {
    const last = this.rematchAt.get(this.rematchKey(firstUserId, secondUserId));
    return last !== undefined && this.now() - last < this.rematchCooldownMs;
  }

  rematchKey(firstUserId, secondUserId) {
    return [firstUserId, secondUserId].sort().join(':');
  }

  schedule(key, delayMs, callback) {
    this.clearScheduled(key);
    const timer = this.setTimer(() => {
      this.timers.delete(key);
      callback();
    }, delayMs);
    timer?.unref?.();
    this.timers.set(key, timer);
  }

  clearScheduled(key) {
    const timer = this.timers.get(key);
    if (timer !== undefined) this.clearTimer(timer);
    this.timers.delete(key);
  }

  destroy() {
    for (const key of this.timers.keys()) this.clearScheduled(key);
    this.queue = [];
    this.pendingStatChoices.clear();
    this.activeMatch = null;
  }

  hashNumber(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}

module.exports = BattleMatchService;
