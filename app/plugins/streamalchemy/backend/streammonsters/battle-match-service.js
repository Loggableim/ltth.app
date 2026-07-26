const { randomUUID } = require('crypto');

const ROSTER_WINDOW_MS = 15_000;
const ACTION_WINDOW_MS = 8_000;
const STAT_WINDOW_MS = 30_000;
const REMATCH_AVOIDANCE_MS = 10 * 60 * 1000;
const MATCH_WIDEN_INTERVAL_MS = 30_000;
const ARENA_K = 32;
const ARENA_START_RATING = 900;
const ARENA_DURATION_PRESETS = Object.freeze([7, 14, 28, 60, 90]);
const ARENA_TIERS = Object.freeze([
  Object.freeze({ name: 'Monster Master', minimum: 1500 }),
  Object.freeze({ name: 'Crystal', minimum: 1300 }),
  Object.freeze({ name: 'Gold', minimum: 1150 }),
  Object.freeze({ name: 'Silver', minimum: 1000 }),
  Object.freeze({ name: 'Bronze', minimum: 0 })
]);

function parseJson(value, fallback = null) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

class BattleMatchService {
  constructor({
    store,
    battleService = null,
    progression = null,
    collection = null,
    emit = () => {},
    now = () => Date.now(),
    getStreamKey = () => null,
    seasonDurationDays = 28,
    sweepIntervalMs = 1_000,
    autoStart = true
  }) {
    this.store = store;
    this.db = store.db;
    this.battleService = battleService;
    this.progression = progression;
    this.collection = collection;
    this.emit = emit;
    this.now = now;
    this.getStreamKey = getStreamKey;
    this.seasonDurationDays = ARENA_DURATION_PRESETS.includes(Number(seasonDurationDays))
      ? Number(seasonDurationDays)
      : 28;
    this.sweepIntervalMs = Math.max(250, Number(sweepIntervalMs) || 1_000);
    this.sweepTimer = null;
    if (autoStart) this.start();
  }

  start() {
    this.sweep();
    if (!this.sweepTimer) {
      this.sweepTimer = setInterval(() => this.sweep(), this.sweepIntervalMs);
      this.sweepTimer.unref?.();
    }
    return this;
  }

  destroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  emitAfterCommit(event, payload) {
    this.store.afterCommit(() => this.emit(event, payload));
  }

  join({ userId, stance = 'adaptive' }) {
    if (!userId) return { status: 'invalid', error: 'viewer_required' };
    const existing = this.getActiveMatchForViewer(userId);
    if (existing) return { status: 'active', match: existing };
    const monster = this.store.getSelectedMonster(userId);
    if (!monster) return { status: 'no_monster' };
    return this.store.runInImmediateTransaction(() => {
      const active = this.getActiveMatchForViewer(userId);
      if (active) return { status: 'active', match: active };
      this.store.enqueueBattle({
        userId,
        monsterId: monster.monster_id,
        stance,
        queuedAtMs: this.now()
      });
      const match = this.reserveBestMatch(userId);
      if (!match) return { status: 'queued', queue: this.store.getBattleQueueEntry(userId) };
      return { status: 'reserved', match };
    });
  }

  reserveBestMatch(userId) {
    const own = this.store.getBattleQueueEntry(userId);
    if (!own) return null;
    const ownMonster = this.store.getMonster(own.monster_id);
    if (!ownMonster) {
      this.store.removeBattleQueueEntry(userId);
      return null;
    }
    const nowMs = this.now();
    const season = this.getCurrentArenaSeason();
    const ownRating = this.getArenaRating(season.seasonId, userId).rating;
    let candidates = this.store.getBattleQueue()
      .filter(candidate => candidate.user_id !== userId)
      .map(candidate => {
        const monster = this.store.getMonster(candidate.monster_id);
        const waitedMs = Math.max(
          nowMs - own.queued_at_ms,
          nowMs - candidate.queued_at_ms
        );
        const allowedGap = 2 + Math.floor(waitedMs / MATCH_WIDEN_INTERVAL_MS);
        if (!monster || Math.abs(monster.level - ownMonster.level) > allowedGap) return null;
        const rating = this.getArenaRating(season.seasonId, candidate.user_id).rating;
        return {
          ...candidate,
          monster,
          rating,
          ratingGap: Math.abs(rating - ownRating),
          recentRematch: this.hasRecentOpponent(userId, candidate.user_id, nowMs)
        };
      })
      .filter(Boolean);
    if (!candidates.length) return null;
    if (candidates.some(candidate => !candidate.recentRematch)) {
      candidates = candidates.filter(candidate => !candidate.recentRematch);
    }
    candidates.sort((left, right) => (
      left.ratingGap - right.ratingGap ||
      left.queued_at_ms - right.queued_at_ms ||
      String(left.user_id).localeCompare(String(right.user_id))
    ));
    return this.createReservation(own, candidates[0], ownRating, season);
  }

  createReservation(own, opponent, ownRating, season) {
    const nowMs = this.now();
    const matchId = `match-${randomUUID()}`;
    const seed = `${matchId}:${nowMs}`;
    const opponentRating = this.getArenaRating(season.seasonId, opponent.user_id).rating;
    this.db.prepare(`
      INSERT INTO streammonsters_matches (
        match_id, state, phase_version, seed, rules_version, round_number,
        roster_deadline_ms, created_at_ms, updated_at_ms
      ) VALUES (?, 'roster', 1, ?, 5, 0, ?, ?, ?)
    `).run(matchId, seed, nowMs + ROSTER_WINDOW_MS, nowMs, nowMs);
    [
      [1, own, ownRating],
      [2, opponent, opponentRating]
    ].forEach(([slot, entry, rating]) => {
      this.db.prepare(`
        INSERT INTO streammonsters_match_participants (
          match_id, participant_id, viewer_id, slot, queued_monster_id,
          rating_before, active
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(
        matchId,
        `${matchId}:p${slot}`,
        entry.user_id,
        slot,
        entry.monster_id,
        rating
      );
    });
    this.store.removeBattleQueueEntry(own.user_id);
    this.store.removeBattleQueueEntry(opponent.user_id);
    const match = this.getMatch(matchId);
    this.appendEvent(matchId, 'streammonsters:battle_match_found', {
      matchId,
      deadlineMs: match.rosterDeadlineMs
    });
    return match;
  }

  hasRecentOpponent(userAId, userBId, nowMs = this.now()) {
    if (this.store.hasRecentOpponentPair(
      userAId,
      userBId,
      nowMs - REMATCH_AVOIDANCE_MS
    )) return true;
    return Boolean(this.db.prepare(`
      SELECT 1
      FROM streammonsters_matches match
      JOIN streammonsters_match_participants a ON a.match_id = match.match_id
      JOIN streammonsters_match_participants b ON b.match_id = match.match_id
      WHERE match.completed_at_ms >= ?
        AND a.viewer_id = ?
        AND b.viewer_id = ?
        AND a.participant_id != b.participant_id
      LIMIT 1
    `).get(nowMs - REMATCH_AVOIDANCE_MS, userAId, userBId));
  }

  getMatch(matchId) {
    const row = this.db.prepare(`
      SELECT * FROM streammonsters_matches WHERE match_id = ?
    `).get(matchId);
    if (!row) return null;
    const participants = this.db.prepare(`
      SELECT * FROM streammonsters_match_participants
      WHERE match_id = ? ORDER BY slot
    `).all(matchId).map(participant => this.mapParticipant(participant));
    return {
      matchId: row.match_id,
      state: row.state,
      phaseVersion: row.phase_version,
      seed: row.seed,
      rulesVersion: row.rules_version,
      roundNumber: row.round_number,
      rosterDeadlineMs: row.roster_deadline_ms,
      actionDeadlineMs: row.action_deadline_ms,
      winnerMonsterId: row.winner_monster_id,
      result: parseJson(row.result_json),
      finalizedAtMs: row.finalized_at_ms,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
      completedAtMs: row.completed_at_ms,
      participants
    };
  }

  mapParticipant(row) {
    return {
      matchId: row.match_id,
      participantId: row.participant_id,
      viewerId: row.viewer_id,
      slot: row.slot,
      queuedMonsterId: row.queued_monster_id,
      lockedMonsterId: row.locked_monster_id,
      roster: parseJson(row.roster_json),
      combatState: parseJson(row.combat_state_json),
      ratingBefore: row.rating_before,
      ratingAfter: row.rating_after,
      active: Boolean(row.active)
    };
  }

  getActiveMatchForViewer(userId) {
    const row = this.db.prepare(`
      SELECT match_id FROM streammonsters_match_participants
      WHERE viewer_id = ? AND active = 1
      LIMIT 1
    `).get(userId);
    return row ? this.getMatch(row.match_id) : null;
  }

  lockRoster({ userId, monsterId = null, source = 'viewer' }) {
    return this.store.runInImmediateTransaction(() => {
      const match = this.getActiveMatchForViewer(userId);
      if (!match || match.state !== 'roster' || match.rosterDeadlineMs < this.now()) {
        return { accepted: false, reason: 'no_roster_window' };
      }
      const participant = match.participants.find(entry => entry.viewerId === userId);
      if (participant.lockedMonsterId) return { accepted: false, reason: 'already_locked' };
      const selected = monsterId
        ? this.store.getMonster(monsterId)
        : this.store.getSelectedMonster(userId);
      const monster = selected?.user_id === userId
        ? selected
        : this.store.getMonster(participant.queuedMonsterId);
      if (!monster || monster.user_id !== userId) {
        return { accepted: false, reason: 'monster_not_owned' };
      }
      const snapshot = this.snapshotMonster(monster);
      const result = this.db.prepare(`
        UPDATE streammonsters_match_participants
        SET locked_monster_id = ?, roster_json = ?
        WHERE match_id = ? AND participant_id = ? AND locked_monster_id IS NULL
      `).run(
        monster.monster_id,
        JSON.stringify(snapshot),
        match.matchId,
        participant.participantId
      );
      if (!result.changes) return { accepted: false, reason: 'already_locked' };
      const remaining = this.db.prepare(`
        SELECT COUNT(*) AS count FROM streammonsters_match_participants
        WHERE match_id = ? AND locked_monster_id IS NULL
      `).get(match.matchId).count;
      if (remaining) return { accepted: true, source, waiting: true, match: this.getMatch(match.matchId) };
      const started = this.startActionWindow(match.matchId, match.phaseVersion);
      return { accepted: true, source, waiting: false, match: started };
    });
  }

  snapshotMonster(monster) {
    return {
      monster_id: monster.monster_id,
      user_id: monster.user_id,
      name: monster.name,
      element: monster.element,
      template_id: monster.template_id,
      personality: monster.personality || 'Adaptive',
      level: monster.level,
      stats: { ...monster.stats }
    };
  }

  startActionWindow(matchId, expectedVersion = null) {
    const nowMs = this.now();
    const predicate = expectedVersion == null ? '' : 'AND phase_version = ?';
    const args = [
      nowMs + ACTION_WINDOW_MS,
      nowMs,
      matchId,
      ...(expectedVersion == null ? [] : [expectedVersion])
    ];
    const changed = this.db.prepare(`
      UPDATE streammonsters_matches
      SET state = 'action',
          phase_version = phase_version + 1,
          round_number = CASE WHEN round_number < 1 THEN 1 ELSE round_number END,
          roster_deadline_ms = NULL,
          action_deadline_ms = ?,
          updated_at_ms = ?
      WHERE match_id = ? AND state IN ('roster', 'action') ${predicate}
    `).run(...args);
    if (!changed.changes) return this.getMatch(matchId);
    const match = this.getMatch(matchId);
    this.appendEvent(matchId, 'streammonsters:battle_choice_opened', {
      matchId,
      round: match.roundNumber,
      deadlineMs: match.actionDeadlineMs,
      choices: ['A', 'B', 'C']
    });
    return this.getMatch(matchId);
  }

  submitChoice({ userId, choice, eventId = null, source = 'viewer' }) {
    const normalizedEventId = eventId ? String(eventId) : null;
    if (normalizedEventId && this.db.prepare(`
      SELECT 1 FROM streammonsters_match_decisions WHERE event_id = ?
    `).get(normalizedEventId)) {
      return { handled: false, reason: 'duplicate_event' };
    }
    return this.store.runInImmediateTransaction(() => {
      const match = this.getActiveMatchForViewer(userId);
      if (!match || match.state !== 'action' || match.actionDeadlineMs < this.now()) {
        return { handled: false, reason: 'no_active_window' };
      }
      const participant = match.participants.find(entry => entry.viewerId === userId);
      const normalized = String(choice || '').trim().toUpperCase();
      if (!['A', 'B', 'C'].includes(normalized)) {
        return { handled: false, reason: 'invalid_choice' };
      }
      const inserted = this.db.prepare(`
        INSERT OR IGNORE INTO streammonsters_match_decisions (
          match_id, participant_id, window_kind, window_sequence, choice,
          requested_choice, source, event_id, created_at_ms
        ) VALUES (?, ?, 'action', ?, ?, ?, ?, ?, ?)
      `).run(
        match.matchId,
        participant.participantId,
        match.roundNumber,
        normalized,
        normalized,
        source,
        normalizedEventId,
        this.now()
      );
      if (!inserted.changes) return { handled: false, reason: 'already_locked' };
      const decisionCount = this.db.prepare(`
        SELECT COUNT(*) AS count FROM streammonsters_match_decisions
        WHERE match_id = ? AND window_kind = 'action' AND window_sequence = ?
      `).get(match.matchId, match.roundNumber).count;
      if (decisionCount < 2) {
        return { handled: true, waiting: true, match: this.getMatch(match.matchId) };
      }
      const resolved = this.resolveRound(match.matchId, match.phaseVersion);
      return { handled: true, waiting: false, match: resolved };
    });
  }

  resolveRound(matchId, expectedVersion) {
    const match = this.getMatch(matchId);
    if (!match || match.state !== 'action' || match.phaseVersion !== expectedVersion) return match;
    const decisions = this.db.prepare(`
      SELECT * FROM streammonsters_match_decisions
      WHERE match_id = ? AND window_kind = 'action' AND window_sequence = ?
    `).all(matchId, match.roundNumber);
    if (decisions.length !== 2) return match;
    const fighters = match.participants.map(participant => participant.roster);
    const choices = Object.fromEntries(decisions.map(decision => {
      const participant = match.participants.find(entry => entry.participantId === decision.participant_id);
      return [participant.lockedMonsterId, decision.choice];
    }));
    const state = Object.fromEntries(match.participants
      .filter(participant => participant.combatState)
      .map(participant => [participant.lockedMonsterId, participant.combatState]));
    const outcome = this.battleService.resolveInteractiveRound({
      fighters,
      choices,
      seed: match.seed,
      round: match.roundNumber,
      state
    });
    const existingCount = this.db.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_actions WHERE match_id = ?
    `).get(matchId).count;
    outcome.actions.forEach((action, index) => {
      const participant = match.participants.find(entry => entry.lockedMonsterId === action.actorId);
      const sequence = existingCount + index + 1;
      this.db.prepare(`
        INSERT INTO streammonsters_match_actions (
          match_id, sequence, round_number, actor_participant_id,
          event_id, action_json, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        matchId,
        sequence,
        match.roundNumber,
        participant.participantId,
        `${matchId}:action:${sequence}`,
        JSON.stringify({ ...action, sequence }),
        this.now()
      );
      this.appendEvent(matchId, 'streammonsters:battle_skill_used', {
        matchId,
        round: match.roundNumber,
        action: { ...action, sequence }
      });
    });
    match.participants.forEach(participant => {
      this.db.prepare(`
        UPDATE streammonsters_match_participants
        SET combat_state_json = ?
        WHERE match_id = ? AND participant_id = ?
      `).run(
        JSON.stringify(outcome.state[participant.lockedMonsterId]),
        matchId,
        participant.participantId
      );
    });
    if (outcome.terminal || match.roundNumber >= 3) {
      const winnerId = outcome.winnerId || this.tieBreakWinner(match, outcome.state);
      return this.finalize(matchId, expectedVersion, winnerId);
    }
    const nowMs = this.now();
    const changed = this.db.prepare(`
      UPDATE streammonsters_matches
      SET phase_version = phase_version + 1,
          round_number = round_number + 1,
          action_deadline_ms = ?,
          updated_at_ms = ?
      WHERE match_id = ? AND state = 'action' AND phase_version = ?
    `).run(nowMs + ACTION_WINDOW_MS, nowMs, matchId, expectedVersion);
    if (changed.changes) {
      const next = this.getMatch(matchId);
      this.appendEvent(matchId, 'streammonsters:battle_choice_opened', {
        matchId,
        round: next.roundNumber,
        deadlineMs: next.actionDeadlineMs,
        choices: ['A', 'B', 'C']
      });
    }
    return this.getMatch(matchId);
  }

  tieBreakWinner(match, state) {
    return [...match.participants].sort((left, right) => {
      const hp = (state[right.lockedMonsterId]?.hp || 0) - (state[left.lockedMonsterId]?.hp || 0);
      if (hp) return hp;
      const agility = (right.roster?.stats?.agility || 0) - (left.roster?.stats?.agility || 0);
      if (agility) return agility;
      return this.hashNumber(`${match.seed}:winner:${left.lockedMonsterId}`) -
        this.hashNumber(`${match.seed}:winner:${right.lockedMonsterId}`);
    })[0].lockedMonsterId;
  }

  finalize(matchId, expectedVersion, winnerMonsterId) {
    return this.store.runInImmediateTransaction(() => {
      const nowMs = this.now();
      const match = this.getMatch(matchId);
      if (!match || match.state !== 'action' || match.phaseVersion !== expectedVersion) {
        return match;
      }
      const changed = this.db.prepare(`
        UPDATE streammonsters_matches
        SET state = 'completed',
            phase_version = phase_version + 1,
            winner_monster_id = ?,
            action_deadline_ms = NULL,
            finalized_at_ms = ?,
            completed_at_ms = ?,
            updated_at_ms = ?
        WHERE match_id = ? AND state = 'action' AND phase_version = ?
      `).run(winnerMonsterId, nowMs, nowMs, nowMs, matchId, expectedVersion);
      if (!changed.changes) return this.getMatch(matchId);

      const season = this.getCurrentArenaSeason();
      const eligibility = Object.fromEntries(match.participants.map(participant => [
        participant.participantId,
        this.claimArenaDailyBattle(participant.viewerId)
      ]));
      const winnerParticipant = match.participants.find(
        participant => participant.lockedMonsterId === winnerMonsterId
      );
      const loserParticipant = match.participants.find(
        participant => participant.lockedMonsterId !== winnerMonsterId
      );
      const ratingChanges = this.applyArenaElo({
        seasonId: season.seasonId,
        winner: winnerParticipant,
        loser: loserParticipant,
        eligibility
      });

      match.participants.forEach(participant => {
        const won = participant.lockedMonsterId === winnerMonsterId;
        const xpAwarded = 10 + (won ? 5 : 0);
        const before = this.store.getMonster(participant.lockedMonsterId);
        this.store.recordMonsterBattle(participant.lockedMonsterId, won);
        const monster = this.store.awardMonsterXp(participant.lockedMonsterId, xpAwarded);
        const rating = ratingChanges[participant.participantId] || {
          after: participant.ratingBefore,
          delta: 0
        };
        this.db.prepare(`
          UPDATE streammonsters_match_participants
          SET rating_after = ?, active = 0
          WHERE match_id = ? AND participant_id = ?
        `).run(rating.after, matchId, participant.participantId);
        this.db.prepare(`
          INSERT INTO streammonsters_match_rewards (
            match_id, participant_id, xp_awarded, arena_eligible,
            rating_delta, claimed_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          matchId,
          participant.participantId,
          xpAwarded,
          eligibility[participant.participantId] ? 1 : 0,
          rating.delta,
          nowMs
        );
        const pointsGained = Math.max(
          0,
          (Number(monster?.unspent_stat_points) || 0) -
            (Number(before?.unspent_stat_points) || 0)
        );
        if (pointsGained > 0) this.createStatPrompt(matchId, participant, pointsGained);
      });
      this.store.incrementViewer(winnerParticipant.viewerId, 'battles_won');
      const streamKey = this.getStreamKey?.() || null;
      if (streamKey) this.store.incrementStreamMetric(streamKey, 'duels');
      this.collection?.recordBattleOutcome?.({
        streamKey,
        battleId: `battle-${matchId}`,
        fighters: match.participants.map(participant => ({
          monster: this.store.getMonster(participant.lockedMonsterId),
          won: participant.lockedMonsterId === winnerMonsterId
        }))
      });

      const actions = this.getReplay(matchId).actions;
      const result = {
        matchId,
        rulesVersion: 5,
        seed: match.seed,
        winnerMonsterId,
        participants: match.participants.map(participant => ({
          participantId: participant.participantId,
          monsterId: participant.lockedMonsterId,
          slot: participant.slot
        })),
        actions
      };
      this.db.prepare(`
        UPDATE streammonsters_matches SET result_json = ? WHERE match_id = ?
      `).run(JSON.stringify(result), matchId);
      this.db.prepare(`
        INSERT OR IGNORE INTO streammonsters_battles (
          battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
          user_a_id, user_b_id, rounds_json, rules_version, skills_json,
          result_json, created_at_ms, match_id, replay_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, ?, ?, ?, ?, 5)
      `).run(
        `battle-${matchId}`,
        match.seed,
        match.participants[0].lockedMonsterId,
        match.participants[1].lockedMonsterId,
        winnerMonsterId,
        match.participants[0].viewerId,
        match.participants[1].viewerId,
        JSON.stringify([]),
        JSON.stringify({}),
        JSON.stringify(result),
        nowMs,
        matchId
      );
      this.appendEvent(matchId, 'streammonsters:battle_completed', {
        matchId,
        winnerMonsterId
      });
      return this.getMatch(matchId);
    });
  }

  claimArenaDailyBattle(userId) {
    const dayKey = new Date(this.now()).toISOString().slice(0, 10);
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_arena_daily_ledger (
        viewer_id, day_key, rated_battles
      ) VALUES (?, ?, 0)
    `).run(userId, dayKey);
    const row = this.db.prepare(`
      SELECT rated_battles FROM streammonsters_arena_daily_ledger
      WHERE viewer_id = ? AND day_key = ?
    `).get(userId, dayKey);
    if ((Number(row?.rated_battles) || 0) >= 10) return false;
    return this.db.prepare(`
      UPDATE streammonsters_arena_daily_ledger
      SET rated_battles = rated_battles + 1
      WHERE viewer_id = ? AND day_key = ? AND rated_battles < 10
    `).run(userId, dayKey).changes > 0;
  }

  applyArenaElo({ seasonId, winner, loser, eligibility }) {
    const changes = {};
    if (!winner || !loser) return changes;
    const winnerBefore = this.getArenaRating(seasonId, winner.viewerId).rating;
    const loserBefore = this.getArenaRating(seasonId, loser.viewerId).rating;
    const expectedWinner = 1 / (1 + (10 ** ((loserBefore - winnerBefore) / 400)));
    const winnerDelta = Math.round(ARENA_K * (1 - expectedWinner));
    const loserDelta = -winnerDelta;
    [
      [winner, winnerBefore, winnerDelta],
      [loser, loserBefore, loserDelta]
    ].forEach(([participant, before, delta]) => {
      const eligible = eligibility[participant.participantId];
      const appliedDelta = eligible ? delta : 0;
      const after = Math.max(0, before + appliedDelta);
      if (eligible) {
        this.db.prepare(`
          UPDATE streammonsters_arena_ratings
          SET rating = ?, battles_rated = battles_rated + 1, updated_at_ms = ?
          WHERE season_id = ? AND viewer_id = ?
        `).run(after, this.now(), seasonId, participant.viewerId);
      }
      changes[participant.participantId] = { before, after, delta: appliedDelta };
    });
    return changes;
  }

  createStatPrompt(matchId, participant, pointsGained = 1) {
    if (!participant || pointsGained < 1) return null;
    if (!participant.lockedMonsterId) {
      participant = this.getMatch(matchId)?.participants.find(candidate => (
        candidate.participantId === participant.participantId
      )) || participant;
    }
    if (!participant.lockedMonsterId) return null;
    const nowMs = this.now();
    const promptId = `${matchId}:stat:${participant.participantId}`;
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_stat_prompts (
        prompt_id, match_id, participant_id, viewer_id, monster_id,
        deadline_ms, status, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(
      promptId,
      matchId,
      participant.participantId,
      participant.viewerId,
      participant.lockedMonsterId,
      nowMs + STAT_WINDOW_MS,
      nowMs
    );
    const prompt = this.db.prepare(`
      SELECT * FROM streammonsters_stat_prompts WHERE prompt_id = ?
    `).get(promptId);
    if (prompt?.status === 'open') {
      this.appendEvent(matchId, 'streammonsters:stat_choice_opened', {
        matchId,
        monsterId: participant.lockedMonsterId,
        deadlineMs: prompt.deadline_ms,
        choices: ['1', '2', '3', '4']
      }, {
        matchId,
        deadlineMs: prompt.deadline_ms,
        choices: ['1', '2', '3', '4']
      });
    }
    return prompt || null;
  }

  submitStatChoice({ userId, choice, eventId = null, source = 'viewer' }) {
    const stats = ['vitality', 'might', 'guard', 'agility'];
    const index = Number.parseInt(choice, 10) - 1;
    if (!stats[index]) return { handled: false, reason: 'invalid_choice' };
    return this.store.runInImmediateTransaction(() => {
      if (eventId && this.db.prepare(`
        SELECT 1 FROM streammonsters_stat_prompts WHERE event_id = ?
      `).get(eventId)) {
        return { handled: false, reason: 'duplicate_event' };
      }
      const prompt = this.db.prepare(`
        SELECT * FROM streammonsters_stat_prompts
        WHERE viewer_id = ? AND status = 'open' AND deadline_ms >= ?
        ORDER BY created_at_ms, prompt_id
        LIMIT 1
      `).get(userId, this.now());
      if (!prompt) return { handled: false, reason: 'no_stat_window' };
      const applied = this.store.applyMonsterStatPoint({
        userId,
        monsterId: prompt.monster_id,
        stat: stats[index]
      });
      if (!applied.applied) return { handled: false, reason: applied.reason };
      const claimed = this.db.prepare(`
        UPDATE streammonsters_stat_prompts
        SET status = 'claimed', choice = ?, event_id = ?, claimed_at_ms = ?
        WHERE prompt_id = ? AND status = 'open'
      `).run(stats[index], eventId, this.now(), prompt.prompt_id);
      if (!claimed.changes) return { handled: false, reason: 'already_locked' };
      return {
        handled: true,
        source,
        stat: stats[index],
        monster: applied.monster,
        matchId: prompt.match_id
      };
    });
  }

  getReplay(matchId, cursor = 0) {
    const actions = this.db.prepare(`
      SELECT * FROM streammonsters_match_actions
      WHERE match_id = ? AND sequence > ?
      ORDER BY sequence
    `).all(matchId, Math.max(0, Number(cursor) || 0)).map(row => ({
      ...parseJson(row.action_json, {}),
      eventId: row.event_id,
      sequence: row.sequence
    }));
    const events = this.db.prepare(`
      SELECT * FROM streammonsters_match_events
      WHERE match_id = ? AND sequence > ?
      ORDER BY sequence
    `).all(matchId, Math.max(0, Number(cursor) || 0)).map(row => ({
      eventId: row.event_id,
      sequence: row.sequence,
      type: row.event_type,
      payload: parseJson(row.payload_json, {})
    }));
    return {
      matchId,
      rulesVersion: 5,
      cursor: events.at(-1)?.sequence || Math.max(0, Number(cursor) || 0),
      actions,
      events
    };
  }

  getNormalizedReplay(battleOrMatchId, cursor = 0) {
    const match = this.getMatch(battleOrMatchId);
    if (match) {
      return {
        battleId: `battle-${match.matchId}`,
        replayVersion: 5,
        ...this.getReplay(match.matchId, cursor)
      };
    }
    const battle = this.store.getBattle(battleOrMatchId);
    if (!battle) return null;
    if (battle.match_id) {
      return {
        battleId: battle.battle_id,
        replayVersion: battle.replay_version || 5,
        ...this.getReplay(battle.match_id, cursor)
      };
    }
    let sequence = 0;
    const actions = (battle.rounds || []).flatMap(round => (
      Array.isArray(round.actions) ? round.actions.map(action => ({
        ...action,
        round: action.round || round.round || null,
        sequence: ++sequence,
        eventId: `${battle.battle_id}:legacy-action:${sequence}`
      })) : []
    ));
    return {
      battleId: battle.battle_id,
      matchId: null,
      rulesVersion: battle.rulesVersion,
      replayVersion: battle.rulesVersion || 3,
      seed: battle.seed,
      winnerMonsterId: battle.winner_monster_id,
      cursor: actions.at(-1)?.sequence || 0,
      actions,
      events: actions.map(action => ({
        eventId: action.eventId,
        sequence: action.sequence,
        type: 'streammonsters:battle_skill_used',
        payload: { action }
      }))
    };
  }

  getPublicSnapshot() {
    const matchIds = this.db.prepare(`
      SELECT match_id FROM streammonsters_matches
      WHERE state IN ('roster', 'action', 'finalizing')
      ORDER BY created_at_ms, match_id
    `).all();
    return {
      rulesVersion: 5,
      matches: matchIds.map(({ match_id: matchId }) => {
        const match = this.getMatch(matchId);
        const cursor = this.db.prepare(`
          SELECT COALESCE(MAX(sequence), 0) AS cursor
          FROM streammonsters_match_events WHERE match_id = ?
        `).get(matchId).cursor;
        return {
          matchId,
          state: match.state,
          roundNumber: match.roundNumber,
          rosterDeadlineMs: match.rosterDeadlineMs,
          actionDeadlineMs: match.actionDeadlineMs,
          cursor,
          fighters: match.participants.map(participant => ({
            slot: participant.slot,
            locked: Boolean(participant.lockedMonsterId),
            ...(participant.roster ? {
              name: participant.roster.name,
              element: participant.roster.element,
              templateId: participant.roster.template_id,
              level: participant.roster.level,
              hp: participant.combatState?.hp ?? null,
              shield: participant.combatState?.shield ?? 0,
              charge: participant.combatState?.charge ?? 0
            } : {})
          }))
        };
      })
    };
  }

  appendEvent(matchId, eventType, payload, publicPayload = payload) {
    const sequence = this.db.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS next
      FROM streammonsters_match_events WHERE match_id = ?
    `).get(matchId).next;
    const eventId = `${matchId}:event:${sequence}`;
    this.db.prepare(`
      INSERT INTO streammonsters_match_events (
        match_id, sequence, event_id, event_type, payload_json,
        public_payload_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      matchId,
      sequence,
      eventId,
      eventType,
      JSON.stringify(payload),
      JSON.stringify(publicPayload),
      this.now()
    );
    this.emitAfterCommit(eventType, { ...publicPayload, eventId, sequence });
    return { eventId, sequence };
  }

  deterministicTimeoutChoice(match, participant) {
    const state = participant.combatState || { charge: 0 };
    const choices = state.charge >= 100 ? ['A', 'B', 'C'] : ['A', 'B'];
    const personality = participant.roster?.personality || 'Adaptive';
    return choices[this.hashNumber(
      `${match.seed}:${match.roundNumber}:${participant.participantId}:${personality}`
    ) % choices.length];
  }

  sweep() {
    const nowMs = this.now();
    const result = { rosterExpired: 0, actionsExpired: 0, statsExpired: 0 };
    this.store.runInImmediateTransaction(() => {
      const rosterMatches = this.db.prepare(`
        SELECT match_id FROM streammonsters_matches
        WHERE state = 'roster' AND roster_deadline_ms <= ?
        ORDER BY roster_deadline_ms, match_id
      `).all(nowMs);
      rosterMatches.forEach(({ match_id: matchId }) => {
        const match = this.getMatch(matchId);
        match.participants.filter(participant => !participant.lockedMonsterId)
          .forEach(participant => {
            const monster = this.store.getSelectedMonster(participant.viewerId) ||
              this.store.getMonster(participant.queuedMonsterId);
            const snapshot = this.snapshotMonster(monster);
            this.db.prepare(`
              UPDATE streammonsters_match_participants
              SET locked_monster_id = ?, roster_json = ?
              WHERE match_id = ? AND participant_id = ? AND locked_monster_id IS NULL
            `).run(
              monster.monster_id,
              JSON.stringify(snapshot),
              matchId,
              participant.participantId
            );
          });
        this.startActionWindow(matchId, match.phaseVersion);
        result.rosterExpired += 1;
      });

      const actionMatches = this.db.prepare(`
        SELECT match_id FROM streammonsters_matches
        WHERE state = 'action' AND action_deadline_ms <= ?
        ORDER BY action_deadline_ms, match_id
      `).all(nowMs);
      actionMatches.forEach(({ match_id: matchId }) => {
        const match = this.getMatch(matchId);
        match.participants.forEach(participant => {
          const existing = this.db.prepare(`
            SELECT 1 FROM streammonsters_match_decisions
            WHERE match_id = ? AND participant_id = ?
              AND window_kind = 'action' AND window_sequence = ?
          `).get(matchId, participant.participantId, match.roundNumber);
          if (existing) return;
          const choice = this.deterministicTimeoutChoice(match, participant);
          this.db.prepare(`
            INSERT INTO streammonsters_match_decisions (
              match_id, participant_id, window_kind, window_sequence, choice,
              requested_choice, source, event_id, created_at_ms
            ) VALUES (?, ?, 'action', ?, ?, ?, 'timeout', ?, ?)
          `).run(
            matchId,
            participant.participantId,
            match.roundNumber,
            choice,
            choice,
            `${matchId}:timeout:${match.roundNumber}:${participant.participantId}`,
            nowMs
          );
        });
        this.resolveRound(matchId, match.phaseVersion);
        result.actionsExpired += 1;
      });

      const statPrompts = this.db.prepare(`
        SELECT * FROM streammonsters_stat_prompts
        WHERE status = 'open' AND deadline_ms <= ?
        ORDER BY deadline_ms, prompt_id
      `).all(nowMs);
      const stats = ['vitality', 'might', 'guard', 'agility'];
      statPrompts.forEach(prompt => {
        const stat = stats[this.hashNumber(
          `${prompt.match_id}:${prompt.monster_id}:stat-timeout`
        ) % stats.length];
        const applied = this.store.applyMonsterStatPoint({
          userId: prompt.viewer_id,
          monsterId: prompt.monster_id,
          stat
        });
        const eventId = `${prompt.match_id}:stat-timeout:${prompt.participant_id}`;
        this.db.prepare(`
          UPDATE streammonsters_stat_prompts
          SET status = ?, choice = ?, event_id = ?, claimed_at_ms = ?
          WHERE prompt_id = ? AND status = 'open'
        `).run(
          applied.applied ? 'claimed' : 'expired',
          stat,
          eventId,
          nowMs,
          prompt.prompt_id
        );
        result.statsExpired += 1;
      });
    });
    return result;
  }

  getCurrentArenaSeason() {
    const durationMs = this.seasonDurationDays * 24 * 60 * 60 * 1000;
    const bucket = Math.floor(this.now() / durationMs);
    const startsAtMs = bucket * durationMs;
    const seasonId = `arena-${this.seasonDurationDays}-${bucket}`;
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_arena_seasons (
        season_id, starts_at_ms, ends_at_ms, duration_days
      ) VALUES (?, ?, ?, ?)
    `).run(seasonId, startsAtMs, startsAtMs + durationMs, this.seasonDurationDays);
    return { seasonId, startsAtMs, endsAtMs: startsAtMs + durationMs, durationDays: this.seasonDurationDays };
  }

  getArenaRating(seasonId, userId) {
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_arena_ratings (
        season_id, viewer_id, rating, battles_rated, updated_at_ms
      ) VALUES (?, ?, ?, 0, ?)
    `).run(seasonId, userId, ARENA_START_RATING, this.now());
    const row = this.db.prepare(`
      SELECT * FROM streammonsters_arena_ratings
      WHERE season_id = ? AND viewer_id = ?
    `).get(seasonId, userId);
    return {
      seasonId,
      viewerId: userId,
      rating: row.rating,
      battlesRated: row.battles_rated,
      tier: this.arenaTier(row.rating)
    };
  }

  setArenaRating(seasonId, userId, rating) {
    this.db.prepare(`
      INSERT INTO streammonsters_arena_ratings (
        season_id, viewer_id, rating, battles_rated, updated_at_ms
      ) VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(season_id, viewer_id) DO UPDATE SET
        rating = excluded.rating,
        updated_at_ms = excluded.updated_at_ms
    `).run(seasonId, userId, Math.round(Number(rating) || ARENA_START_RATING), this.now());
    return this.getArenaRating(seasonId, userId);
  }

  arenaTier(rating) {
    return ARENA_TIERS.find(tier => Number(rating) >= tier.minimum).name;
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
module.exports.ROSTER_WINDOW_MS = ROSTER_WINDOW_MS;
module.exports.ACTION_WINDOW_MS = ACTION_WINDOW_MS;
module.exports.STAT_WINDOW_MS = STAT_WINDOW_MS;
module.exports.REMATCH_AVOIDANCE_MS = REMATCH_AVOIDANCE_MS;
module.exports.MATCH_WIDEN_INTERVAL_MS = MATCH_WIDEN_INTERVAL_MS;
module.exports.ARENA_K = ARENA_K;
module.exports.ARENA_START_RATING = ARENA_START_RATING;
module.exports.ARENA_DURATION_PRESETS = ARENA_DURATION_PRESETS;
module.exports.ARENA_TIERS = ARENA_TIERS;
