const { randomUUID } = require('crypto');
const {
  getEvolutionAssetPath,
  getTemplate,
  resolveStageSkill
} = require('./catalog');
const { maxHp } = require('./battle-rules-v5');
const { elementAdvantage } = require('./battle-rules-v3');
const { effectiveCombatPower } = require('./evolution-rules');
const { selectBattleWinner } = require('./battle-tie-break');
const {
  PASSIVE_CHARGE_PER_SECOND,
  MAX_PASSIVE_CHARGE_PER_ROUND,
  projectPassiveCharge
} = require('./battle-charge');
const {
  ARENA_COLLAPSE_ROUND,
  applyArenaCollapse: resolveArenaCollapse,
  isArenaCollapseDefenseLocked
} = require('./battle-rules-v8');
const {
  projectBattleFighter,
  projectBattleChoices
} = require('./public-event-projector');
const {
  buildCombatReport,
  sanitizeCombatReport
} = require('./battle-report');
const RULES_V8_PACING = require('../../streammonsters-rules-v8-pacing');
const ArenaDirector = require('../../streammonsters-arena-director');

const ROSTER_WINDOW_MS = 10_000;
const ACTION_WINDOW_MS = 6_000;
const STAT_WINDOW_MS = 15_000;
const RULES_V5_ROSTER_WINDOW_MS = 15_000;
const RULES_V5_ACTION_WINDOW_MS = 8_000;
const RULES_V5_STAT_WINDOW_MS = 30_000;
const RULES_V7_ACTION_WINDOW_MS = 8_000;
const REMATCH_AVOIDANCE_MS = 10 * 60 * 1000;
const MATCH_WIDEN_INTERVAL_MS = 30_000;
const DODGE_WINDOW_MS = 10 * 60 * 1000;
const DODGE_COOLDOWN_MS = 60_000;
const DODGE_THRESHOLD = 3;
const INITIAL_RATING_GAP = 150;
const RATING_GAP_STEP = 100;
const INITIAL_POWER_GAP = 10;
const POWER_GAP_STEP = 5;
const BATTLE_QUEUE_TTL_MS = 10 * 60 * 1000;
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
const CHOICE_REJECTION_MESSAGE_KEYS = Object.freeze({
  special_not_charged: 'arenaChoiceSpecialNotCharged',
  duplicate_event: 'arenaChoiceAlreadyLocked',
  already_locked: 'arenaChoiceAlreadyLocked',
  no_active_window: 'arenaChoiceWindowClosed',
  arena_collapse_defense_locked: 'arenaChoiceDefenseLocked'
});

function parseJson(value, fallback = null) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function projectSpecialAvailability({ charge, wasReady = false } = {}) {
  const available = Math.max(0, Math.min(100, Number(charge) || 0)) >= 100;
  return {
    available,
    unavailableReason: available ? null : 'special_requires_full_charge',
    readyTransition: available && !wasReady
  };
}

class BattleMatchService {
  constructor({
    store,
    battleService = null,
    progression = null,
    collection = null,
    assetRegistry = null,
    emit = () => {},
    now = () => Date.now(),
    getStreamKey = () => null,
    logger = null,
    seasonDurationDays = 28,
    rulesVersion = 5,
    localeCount = 1,
    secondsPerLocale = 6,
    gameplayPace = 'arcade-rally',
    portraitBattleMode = 'takeover-74',
    sweepIntervalMs = RULES_V8_PACING.SERVICE_SWEEP_MS,
    autoStart = true
  }) {
    this.store = store;
    this.db = store.db;
    this.battleService = battleService;
    this.progression = progression;
    this.collection = collection;
    this.assetRegistry = assetRegistry;
    this.emit = emit;
    this.now = now;
    this.getStreamKey = getStreamKey;
    this.logger = logger;
    this.seasonDurationDays = ARENA_DURATION_PRESETS.includes(Number(seasonDurationDays))
      ? Number(seasonDurationDays)
      : 28;
    this.rulesVersion = Number(rulesVersion) >= 8
      ? 8
      : Number(rulesVersion) >= 7
        ? 7
        : Number(rulesVersion) >= 6
          ? 6
          : 5;
    this.localeCount = Math.max(1, Math.min(2, Math.round(Number(localeCount) || 1)));
    this.secondsPerLocale = Math.max(
      4,
      Math.min(6, Number(secondsPerLocale) || 6)
    );
    this.gameplayPace = gameplayPace === 'arcade-rally'
      ? gameplayPace
      : 'arcade-rally';
    this.portraitBattleMode = portraitBattleMode === 'takeover-74'
      ? portraitBattleMode
      : 'takeover-74';
    this.rulesV8Pacing = RULES_V8_PACING;
    this.sweepIntervalMs = Math.max(
      RULES_V8_PACING.SERVICE_SWEEP_MS,
      Number(sweepIntervalMs) || RULES_V8_PACING.SERVICE_SWEEP_MS
    );
    this.sweepTimer = null;
    this.pauseActiveChargesForReconnect();
    if (autoStart) this.start();
  }

  start() {
    this.safeSweep();
    if (!this.sweepTimer) {
      this.sweepTimer = setInterval(() => this.safeSweep(), this.sweepIntervalMs);
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

  setLanguageTiming({ localeCount, secondsPerLocale } = {}) {
    this.localeCount = Math.max(
      1,
      Math.min(2, Math.round(Number(localeCount) || 1))
    );
    this.secondsPerLocale = Math.max(
      4,
      Math.min(6, Math.round(Number(secondsPerLocale) || 5))
    );
    return {
      localeCount: this.localeCount,
      secondsPerLocale: this.secondsPerLocale
    };
  }

  setPresentationConfig({ gameplayPace, portraitBattleMode } = {}) {
    this.gameplayPace = gameplayPace === 'arcade-rally'
      ? gameplayPace
      : 'arcade-rally';
    this.portraitBattleMode = portraitBattleMode === 'takeover-74'
      ? portraitBattleMode
      : 'takeover-74';
    return {
      gameplayPace: this.gameplayPace,
      portraitBattleMode: this.portraitBattleMode
    };
  }

  setSeasonDurationDays(value) {
    const normalized = Number(value);
    this.seasonDurationDays = ARENA_DURATION_PRESETS.includes(normalized)
      ? normalized
      : 28;
    return this.seasonDurationDays;
  }

  emitAfterCommit(event, payload) {
    this.store.afterCommit(() => this.emit(event, payload));
  }

  reportError(context, error) {
    const message = `[STREAM MONSTERS] ${context} failed: ${error.message}`;
    if (typeof this.logger === 'function') this.logger(message, error);
    else this.logger?.error?.(message, error);
  }

  safeSweep() {
    try {
      return this.sweep();
    } catch (error) {
      this.reportError('battle recovery sweep', error);
      return { rosterExpired: 0, actionsExpired: 0, statsExpired: 0, errors: 1 };
    }
  }

  currentStreamKey() {
    const streamKey = String(this.getStreamKey?.() || '').trim();
    return streamKey || null;
  }

  isRulesV6(match) {
    return Number(match?.rulesVersion ?? this.rulesVersion) >= 6;
  }

  isRulesV7(match) {
    return Number(match?.rulesVersion ?? this.rulesVersion) >= 7;
  }

  isRulesV8(match) {
    return Number(match?.rulesVersion ?? this.rulesVersion) >= 8;
  }

  isDefenseLocked(match) {
    return this.isRulesV8(match) &&
      isArenaCollapseDefenseLocked(match?.roundNumber);
  }

  actionPromptChoices(match) {
    return this.isDefenseLocked(match)
      ? ['A', 'C']
      : ['A', 'B', 'C'];
  }

  chargeWindow(match) {
    if (!this.isRulesV7(match)) return null;
    const pausedMs = Number(match.chargePausedMs) || 0;
    const pauseStartedAtMs = match.chargePauseStartedAtMs == null
      ? NaN
      : Number(match.chargePauseStartedAtMs);
    const pauseUntilMs = match.chargePauseUntilMs == null
      ? NaN
      : Number(match.chargePauseUntilMs);
    return {
      openedAtMs: Number(match.actionOpenedAtMs) || 0,
      deadlineMs: Number(match.actionDeadlineMs) || 0,
      passivePerSecond: PASSIVE_CHARGE_PER_SECOND,
      ...(this.isRulesV8(match) ? {
        maxGain: MAX_PASSIVE_CHARGE_PER_ROUND
      } : {}),
      ...(pausedMs > 0 ? { pausedMs } : {}),
      ...(Number.isFinite(pauseStartedAtMs) ? { pauseStartedAtMs } : {}),
      ...(Number.isFinite(pauseUntilMs) ? { pauseUntilMs } : {}),
      ...(match.chargePauseReason ? { pauseReason: match.chargePauseReason } : {})
    };
  }

  projectParticipantCharge(participant, match, asOfMs) {
    return projectPassiveCharge({
      baseCharge: participant?.combatState?.charge,
      openedAtMs: match?.actionOpenedAtMs,
      deadlineMs: match?.actionDeadlineMs,
      asOfMs,
      active: match?.state === 'action' &&
        Number(match?.actionDeadlineMs) > Number(match?.actionOpenedAtMs),
      pausedMs: match?.chargePausedMs,
      pauseStartedAtMs: match?.chargePauseStartedAtMs,
      pauseUntilMs: match?.chargePauseUntilMs,
      maxGain: this.isRulesV8(match) ? MAX_PASSIVE_CHARGE_PER_ROUND : 100
    });
  }

  logBattleDiagnostic(event, {
    matchId,
    round = null,
    slot = null,
    eventType = null,
    sequence = null
  } = {}) {
    const payload = {
      component: 'streammonsters',
      event,
      matchId: String(matchId || '').slice(0, 128)
    };
    if (Number.isFinite(Number(round))) payload.round = Number(round);
    if ([1, 2].includes(Number(slot))) payload.slot = Number(slot);
    if (eventType) payload.eventType = String(eventType).slice(0, 96);
    if (Number.isFinite(Number(sequence))) payload.sequence = Number(sequence);
    this.logger?.info?.(JSON.stringify(payload));
  }

  pauseChargeClock(matchId, reason = 'pause', atMs = this.now(), untilMs = null) {
    const match = this.getMatch(matchId);
    if (!this.isRulesV7(match) || match?.state !== 'action') return false;
    if (match.chargePauseStartedAtMs != null) return false;
    return this.db.prepare(`
      UPDATE streammonsters_matches
      SET charge_pause_started_at_ms = ?,
          charge_pause_until_ms = ?,
          charge_pause_reason = ?,
          updated_at_ms = ?
      WHERE match_id = ? AND state = 'action'
        AND charge_pause_started_at_ms IS NULL
    `).run(
      Math.max(Number(match.actionOpenedAtMs) || 0, Number(atMs) || 0),
      untilMs != null && Number.isFinite(Number(untilMs)) ? Number(untilMs) : null,
      String(reason || 'pause').slice(0, 32),
      Number(atMs) || this.now(),
      matchId
    ).changes > 0;
  }

  resumeChargeClock(matchId, atMs = this.now()) {
    const match = this.getMatch(matchId);
    if (!this.isRulesV7(match) || match?.chargePauseStartedAtMs == null) return false;
    const endedAtMs = Math.max(
      Number(match.chargePauseStartedAtMs) || 0,
      Number(atMs) || 0
    );
    return this.db.prepare(`
      UPDATE streammonsters_matches
      SET charge_paused_ms = charge_paused_ms + ?,
          action_deadline_ms = CASE
            WHEN action_deadline_ms IS NULL THEN NULL
            ELSE action_deadline_ms + ?
          END,
          charge_pause_started_at_ms = NULL,
          charge_pause_until_ms = NULL,
          charge_pause_reason = NULL,
          updated_at_ms = ?
      WHERE match_id = ? AND charge_pause_started_at_ms IS NOT NULL
    `).run(
      endedAtMs - Number(match.chargePauseStartedAtMs),
      endedAtMs - Number(match.chargePauseStartedAtMs),
      endedAtMs,
      matchId
    ).changes > 0;
  }

  pauseActiveChargesForReconnect() {
    if (!this.db?.prepare) return 0;
    return this.db.prepare(`
      SELECT match_id, updated_at_ms
      FROM streammonsters_matches
      WHERE state = 'action' AND rules_version >= 7
        AND charge_pause_started_at_ms IS NULL
    `).all().filter(row => this.pauseChargeClock(
      row.match_id,
      'reconnect',
      Math.min(this.now(), Number(row.updated_at_ms) || this.now())
    )).length;
  }

  materializePassiveCharge(match, asOfMs) {
    if (!this.isRulesV7(match)) return match;
    match.participants.forEach(participant => {
      const state = { ...(participant.combatState || {}) };
      const before = Math.max(0, Math.min(100, Number(state.charge) || 0));
      state.charge = this.projectParticipantCharge(participant, match, asOfMs);
      this.db.prepare(`
        UPDATE streammonsters_match_participants
        SET combat_state_json = ?
        WHERE match_id = ? AND participant_id = ?
      `).run(JSON.stringify(state), match.matchId, participant.participantId);
      if (this.isRulesV8(match) && state.charge > before) {
        this.appendEvent(
          match.matchId,
          'streammonsters:battle_charge_tick',
          {
            matchId: match.matchId,
            round: match.roundNumber,
            participantId: participant.participantId,
            viewerId: participant.viewerId,
            slot: participant.slot,
            before,
            after: state.charge,
            gained: state.charge - before
          },
          {
            matchId: match.matchId,
            round: match.roundNumber,
            slot: participant.slot,
            before,
            after: state.charge,
            gained: state.charge - before
          }
        );
      }
    });
    return this.getMatch(match.matchId);
  }

  emitSpecialReadyTransitions(match, asOfMs = this.now()) {
    if (!this.isRulesV7(match) || match?.state !== 'action') return 0;
    const existing = this.db.prepare(`
      SELECT public_payload_json
      FROM streammonsters_match_events
      WHERE match_id = ? AND event_type = 'streammonsters:battle_special_charged'
    `).all(match.matchId).map(row => parseJson(row.public_payload_json, {}));
    let emitted = 0;
    match.participants.forEach(participant => {
      const baseCharge = Math.max(
        0,
        Math.min(100, Number(participant.combatState?.charge) || 0)
      );
      if (baseCharge >= 100) return;
      const charge = this.projectParticipantCharge(participant, match, asOfMs);
      const wasReady = existing.some(event => (
        Number(event.round) === match.roundNumber &&
        Number(event.slot) === participant.slot
      ));
      const availability = projectSpecialAvailability({ charge, wasReady });
      if (!availability.readyTransition) return;
      this.appendEvent(
        match.matchId,
        'streammonsters:battle_special_charged',
        {
          matchId: match.matchId,
          round: match.roundNumber,
          slot: participant.slot,
          charge: 100,
          monsterId: participant.lockedMonsterId,
          monster: {
            monster_id: participant.lockedMonsterId,
            name: participant.roster?.name || 'Monster',
            element: participant.roster?.element || '',
            template_id: participant.roster?.template_id || '',
            evolution_stage: participant.roster?.evolution_stage || 1,
            image_url: participant.roster?.image_url || null
          }
        }
      );
      existing.push({ round: match.roundNumber, slot: participant.slot });
      emitted += 1;
    });
    return emitted;
  }

  rosterWindowMs(match = null) {
    if (this.isRulesV8(match)) return RULES_V8_PACING.ROSTER_MS;
    return this.isRulesV6(match) ? ROSTER_WINDOW_MS : RULES_V5_ROSTER_WINDOW_MS;
  }

  actionWindowMs(match = null) {
    if (this.isRulesV8(match)) return RULES_V8_PACING.SKILL_CHOICE_MS;
    if (this.isRulesV7(match)) return RULES_V7_ACTION_WINDOW_MS;
    return this.isRulesV6(match) ? ACTION_WINDOW_MS : RULES_V5_ACTION_WINDOW_MS;
  }

  statWindowMs(match = null) {
    if (this.isRulesV8(match)) return RULES_V8_PACING.STAT_CHOICE_MS;
    return this.isRulesV6(match) ? STAT_WINDOW_MS : RULES_V5_STAT_WINDOW_MS;
  }

  join({ userId, stance = 'adaptive' }) {
    if (!userId) return { status: 'invalid', error: 'viewer_required' };
    const existing = this.getActiveMatchForViewer(userId);
    if (existing) return { status: 'active', match: existing };
    const dodge = this.getQueueDodgeStatus(userId);
    if (dodge.cooldownUntilMs > this.now()) {
      return {
        status: 'cooldown',
        retryAfterMs: dodge.cooldownUntilMs - this.now(),
        cooldownUntilMs: dodge.cooldownUntilMs
      };
    }
    const monster = this.store.getSelectedMonster(userId);
    if (!monster) return { status: 'no_monster' };
    return this.store.runInImmediateTransaction(() => {
      const nowMs = this.now();
      const streamKey = this.currentStreamKey();
      this.store.purgeBattleQueue(nowMs - BATTLE_QUEUE_TTL_MS, streamKey);
      const active = this.getActiveMatchForViewer(userId);
      if (active) return { status: 'active', match: active };
      this.store.enqueueBattle({
        userId,
        monsterId: monster.monster_id,
        stance,
        streamKey,
        queuedPower: effectiveCombatPower(monster),
        queuedAtMs: nowMs
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
    const streamKey = own.stream_key || null;
    const season = this.getCurrentArenaSeason();
    const ownRating = this.getArenaRating(season.seasonId, userId).rating;
    const ownPower = Number.isInteger(own.queued_power)
      ? own.queued_power
      : effectiveCombatPower(ownMonster);
    const usePowerMatchmaking = this.rulesVersion >= 7;
    let candidates = this.store.getBattleQueue()
      .filter(candidate => (
        candidate.user_id !== userId &&
        (candidate.stream_key || null) === streamKey
      ))
      .map(candidate => {
        const monster = this.store.getMonster(candidate.monster_id);
        const waitedMs = Math.max(
          nowMs - own.queued_at_ms,
          nowMs - candidate.queued_at_ms
        );
        const allowedGap = 2 + Math.floor(waitedMs / MATCH_WIDEN_INTERVAL_MS);
        if (!monster || Math.abs(monster.level - ownMonster.level) > allowedGap) return null;
        const power = Number.isInteger(candidate.queued_power)
          ? candidate.queued_power
          : effectiveCombatPower(monster);
        const powerGap = Math.abs(power - ownPower);
        const allowedPowerGap = INITIAL_POWER_GAP +
          (Math.floor(waitedMs / MATCH_WIDEN_INTERVAL_MS) * POWER_GAP_STEP);
        if (usePowerMatchmaking && powerGap > allowedPowerGap) return null;
        const rating = this.getArenaRating(season.seasonId, candidate.user_id).rating;
        const ratingGap = Math.abs(rating - ownRating);
        const allowedRatingGap = INITIAL_RATING_GAP +
          (Math.floor(waitedMs / MATCH_WIDEN_INTERVAL_MS) * RATING_GAP_STEP);
        if (ratingGap > allowedRatingGap) return null;
        return {
          ...candidate,
          monster,
          allowedLevelGap: allowedGap,
          allowedPowerGap,
          power,
          powerGap,
          rating,
          ratingGap,
          recentRematch: this.hasRecentOpponent(userId, candidate.user_id, nowMs)
        };
      })
      .filter(Boolean);
    if (!candidates.length) return null;
    if (candidates.some(candidate => !candidate.recentRematch)) {
      candidates = candidates.filter(candidate => !candidate.recentRematch);
    }
    candidates.sort((left, right) => (
      (usePowerMatchmaking ? left.powerGap - right.powerGap : 0) ||
      left.ratingGap - right.ratingGap ||
      left.queued_at_ms - right.queued_at_ms ||
      String(left.user_id).localeCompare(String(right.user_id))
    ));
    return this.createReservation(
      { ...own, monster: ownMonster, power: ownPower },
      candidates[0],
      ownRating,
      season
    );
  }

  createReservation(own, opponent, ownRating, season) {
    const nowMs = this.now();
    const matchId = `match-${randomUUID()}`;
    const seed = `${matchId}:${nowMs}`;
    const opponentRating = this.getArenaRating(season.seasonId, opponent.user_id).rating;
    this.db.prepare(`
      INSERT INTO streammonsters_matches (
        match_id, state, phase_version, seed, rules_version, round_number,
        matchmaking_level_gap, matchmaking_power_gap, roster_deadline_ms,
        created_at_ms, updated_at_ms
      ) VALUES (?, 'roster', 1, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(
      matchId,
      seed,
      this.rulesVersion,
      Math.max(2, Number(opponent.allowedLevelGap) || 2),
      Math.max(INITIAL_POWER_GAP, Number(opponent.allowedPowerGap) || INITIAL_POWER_GAP),
      nowMs + this.rosterWindowMs(),
      nowMs,
      nowMs
    );
    [
      [1, own, ownRating],
      [2, opponent, opponentRating]
    ].forEach(([slot, entry, rating]) => {
      this.db.prepare(`
        INSERT INTO streammonsters_match_participants (
          match_id, participant_id, viewer_id, slot, queued_monster_id,
          queued_level, queued_power, rating_before, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        matchId,
        `${matchId}:p${slot}`,
        entry.user_id,
        slot,
        entry.monster_id,
        Math.max(1, Number(entry.monster?.level) || 1),
        Number.isInteger(entry.power)
          ? entry.power
          : effectiveCombatPower(entry.monster),
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
    this.autoLockSoleEligibleRosters(matchId);
    return this.getMatch(matchId);
  }

  eligibleRosterMonsters(match, participant) {
    if (!match || !participant?.viewerId) return [];
    return this.store.getViewerMonsters(participant.viewerId)
      .filter(monster => (
        monster?.user_id === participant.viewerId &&
        this.rosterEligibility(match, participant, monster).accepted
      ));
  }

  autoLockSoleEligibleRosters(matchId) {
    return this.store.runInImmediateTransaction(() => {
      const match = this.getMatch(matchId);
      if (!this.isRulesV8(match) || match?.state !== 'roster') return match;
      const soleCandidates = match.participants
        .filter(participant => !participant.lockedMonsterId)
        .map(participant => ({
          participant,
          candidates: this.eligibleRosterMonsters(match, participant)
        }))
        .filter(entry => entry.candidates.length === 1);
      for (const { participant, candidates } of soleCandidates) {
        this.lockRoster({
          userId: participant.viewerId,
          monsterId: candidates[0].monster_id,
          source: 'sole_eligible'
        });
      }
      return this.getMatch(matchId);
    });
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
      matchmakingLevelGap: Math.max(
        2,
        Number(row.matchmaking_level_gap) || 2
      ),
      matchmakingPowerGap: Math.max(
        INITIAL_POWER_GAP,
        Number(row.matchmaking_power_gap) || INITIAL_POWER_GAP
      ),
      roundNumber: row.round_number,
      rosterDeadlineMs: row.roster_deadline_ms,
      actionOpenedAtMs: row.action_opened_at_ms,
      actionDeadlineMs: row.action_deadline_ms,
      chargePausedMs: Number(row.charge_paused_ms) || 0,
      chargePauseStartedAtMs: row.charge_pause_started_at_ms,
      chargePauseUntilMs: row.charge_pause_until_ms,
      chargePauseReason: row.charge_pause_reason,
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
      queuedLevel: Number(row.queued_level) || null,
      queuedPower: Number.isInteger(row.queued_power) ? row.queued_power : null,
      lockedMonsterId: row.locked_monster_id,
      lockedPower: Number.isInteger(row.locked_power) ? row.locked_power : null,
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

  getRawResponseWindowKey({ userId, windowKind } = {}) {
    if (!userId) return null;
    const nowMs = this.now();
    if (windowKind === 'action') {
      const match = this.getActiveMatchForViewer(userId);
      if (
        match?.state !== 'action' ||
        !match.actionDeadlineMs ||
        match.actionDeadlineMs <= nowMs
      ) {
        return null;
      }
      return `${match.matchId}:action:${match.roundNumber}`;
    }
    if (windowKind !== 'stat') return null;
    const matchPrompt = this.db.prepare(`
      SELECT prompt_id
      FROM streammonsters_stat_prompts
      WHERE viewer_id = ? AND status = 'open' AND deadline_ms > ?
      ORDER BY created_at_ms, prompt_id
      LIMIT 1
    `).get(userId, nowMs);
    if (matchPrompt) return `${matchPrompt.prompt_id}:stat`;
    const allocation = this.db.prepare(`
      SELECT prompt_id
      FROM streammonsters_stat_allocations
      WHERE viewer_id = ? AND status = 'open' AND deadline_ms > ?
      ORDER BY created_at_ms, prompt_id
      LIMIT 1
    `).get(userId, nowMs);
    return allocation ? `${allocation.prompt_id}:stat` : null;
  }

  lockRoster({ userId, monsterId = null, source = 'viewer' }) {
    return this.store.runInImmediateTransaction(() => {
      const match = this.getActiveMatchForViewer(userId);
      if (!match || match.state !== 'roster' || match.rosterDeadlineMs <= this.now()) {
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
      const eligibility = this.rosterEligibility(match, participant, monster);
      if (!eligibility.accepted) return eligibility;
      const snapshot = this.snapshotMonster(monster, match.rulesVersion);
      const lockedPower = effectiveCombatPower(monster);
      const result = this.db.prepare(`
        UPDATE streammonsters_match_participants
        SET locked_monster_id = ?, locked_power = ?, roster_json = ?
        WHERE match_id = ? AND participant_id = ? AND locked_monster_id IS NULL
      `).run(
        monster.monster_id,
        lockedPower,
        JSON.stringify(snapshot),
        match.matchId,
        participant.participantId
      );
      if (!result.changes) return { accepted: false, reason: 'already_locked' };
      const selectionSource = source === 'sole_eligible'
        ? 'sole_eligible'
        : source === 'timeout'
          ? 'timeout'
          : 'viewer';
      const lockedMatch = this.getMatch(match.matchId);
      const fighter = this.projectPublicFighters(lockedMatch)
        .find(entry => entry.slot === participant.slot);
      const remaining = this.db.prepare(`
        SELECT COUNT(*) AS count FROM streammonsters_match_participants
        WHERE match_id = ? AND locked_monster_id IS NULL
      `).get(match.matchId).count;
      this.appendEvent(
        match.matchId,
        'streammonsters:battle_roster_locked',
        {
          matchId: match.matchId,
          participantId: participant.participantId,
          viewerId: participant.viewerId,
          monsterId: monster.monster_id,
          slot: participant.slot,
          selectionSource,
          waiting: Boolean(remaining)
        },
        {
          matchId: match.matchId,
          slot: participant.slot,
          selectionSource,
          waiting: Boolean(remaining),
          titleKey: selectionSource === 'sole_eligible'
            ? 'arenaRosterAutoTitle'
            : 'arenaRosterChoice',
          bodyKey: selectionSource === 'sole_eligible'
            ? 'arenaRosterAutoBody'
            : 'arenaRosterLockedBody',
          params: {
            name: fighter?.name || 'Monster'
          },
          fighter
        }
      );
      if (remaining) {
        return {
          accepted: true,
          source,
          selectionSource,
          waiting: true,
          match: this.getMatch(match.matchId)
        };
      }
      const started = this.startActionWindow(match.matchId, match.phaseVersion);
      return {
        accepted: true,
        source,
        selectionSource,
        waiting: false,
        match: started
      };
    });
  }

  rosterEligibility(match, participant, monster) {
    const allowedLevelGap = Math.max(
      2,
      Number(match?.matchmakingLevelGap) || 2
    );
    const ownQueued = this.store.getMonster(participant?.queuedMonsterId);
    const ownLevel = Math.max(
      1,
      Number(participant?.queuedLevel ?? ownQueued?.level) || 1
    );
    const opponent = match?.participants?.find(entry => (
      entry.participantId !== participant?.participantId
    ));
    const opponentQueued = opponent
      ? this.store.getMonster(opponent.queuedMonsterId)
      : null;
    const opponentLevel = Math.max(
      1,
      Number(
        opponent?.roster?.level ??
        opponent?.queuedLevel ??
        opponentQueued?.level
      ) || 1
    );
    const selectedLevel = Math.max(1, Number(monster?.level) || 1);
    if (
      Math.abs(selectedLevel - ownLevel) > allowedLevelGap ||
      Math.abs(selectedLevel - opponentLevel) > allowedLevelGap
    ) {
      return {
        accepted: false,
        reason: 'monster_out_of_match_range',
        allowedLevelGap
      };
    }
    if (Number(match?.rulesVersion) >= 7) {
      const allowedPowerGap = Math.max(
        INITIAL_POWER_GAP,
        Number(match?.matchmakingPowerGap) || INITIAL_POWER_GAP
      );
      const ownPower = Number.isInteger(participant?.queuedPower)
        ? participant.queuedPower
        : effectiveCombatPower(ownQueued);
      const opponentPower = Number.isInteger(opponent?.lockedPower)
        ? opponent.lockedPower
        : (
          Number.isInteger(opponent?.queuedPower)
            ? opponent.queuedPower
            : effectiveCombatPower(opponentQueued)
        );
      const selectedPower = effectiveCombatPower(monster);
      if (
        Math.abs(selectedPower - ownPower) > allowedPowerGap ||
        Math.abs(selectedPower - opponentPower) > allowedPowerGap
      ) {
        return {
          accepted: false,
          reason: 'monster_out_of_power_range',
          allowedPowerGap
        };
      }
      return { accepted: true, allowedLevelGap, allowedPowerGap };
    }
    return { accepted: true, allowedLevelGap };
  }

  snapshotMonster(monster, rulesVersion = this.rulesVersion) {
    const evolutionStage = Math.max(
      1,
      Math.min(3, Number(monster.evolution_stage) || 1)
    );
    const egg = monster.egg_id ? this.store.getEgg(monster.egg_id) : null;
    const snapshot = {
      monster_id: monster.monster_id,
      user_id: monster.user_id,
      name: monster.name,
      element: monster.element,
      template_id: monster.template_id,
      personality: monster.personality || 'Adaptive',
      level: monster.level,
      evolution_stage: evolutionStage,
      image_url: this.resolveFighterImage(
        monster.template_id,
        evolutionStage,
        monster.image_url,
        monster.visual_key,
        egg?.seed || monster.monster_id,
        monster.element
      ),
      visual_key: monster.visual_key || null,
      stats: { ...monster.stats }
    };
    if (Number(rulesVersion) >= 7) {
      snapshot.combat_power = effectiveCombatPower(monster);
      snapshot.skills = ['A', 'B', 'C'].map(choice => (
        resolveStageSkill(
          monster.template_id,
          choice,
          evolutionStage,
          rulesVersion
        )
      ));
    }
    return snapshot;
  }

  resolveFighterImage(
    templateId,
    stage,
    fallbackUrl = null,
    fallbackVisualKey = null,
    seed = null,
    element = null
  ) {
    if (this.assetRegistry) {
      return this.assetRegistry.resolveUrl(templateId, stage, {
        fallbackUrl,
        fallbackVisualKey,
        seed: seed || `${templateId}:stage-${stage}`,
        element: element || getTemplate(templateId)?.element || null
      });
    }
    return getEvolutionAssetPath(templateId, stage);
  }

  projectPublicSkillDeck(participant, match, {
    charge = participant?.combatState?.charge,
    chargeWindow = this.chargeWindow(match)
  } = {}) {
    const roster = participant?.roster;
    if (!this.isRulesV7(match) || !roster) return [];
    const opponentElement = match.participants.find(entry => (
      entry.participantId !== participant.participantId
    ))?.roster?.element;
    const elementRelation = elementAdvantage(roster.element, opponentElement)
      ? 'advantage'
      : elementAdvantage(opponentElement, roster.element)
        ? 'disadvantage'
        : 'neutral';
    const baseCharge = Math.max(0, Math.min(100, Number(charge) || 0));
    const defenseLocked = this.isDefenseLocked(match);
    return ['A', 'B', 'C'].map((choice, index) => {
      const skill = roster.skills?.find(entry => entry?.choice === choice) ||
        roster.skills?.[index] ||
        resolveStageSkill(
          roster.template_id,
          choice,
          roster.evolution_stage,
          match.rulesVersion
        );
      const chargeRequired = choice === 'C'
        ? Math.max(1, Number(skill.chargeRequired) || 100)
        : 0;
      const passivePerSecond = Number(chargeWindow?.passivePerSecond) || 0;
      const openedAtMs = Number(chargeWindow?.openedAtMs) || 0;
      const persistedPauseMs = Math.max(0, Number(chargeWindow?.pausedMs) || 0);
      let readyAtMs;
      if (choice === 'C' && baseCharge >= chargeRequired) {
        readyAtMs = openedAtMs;
      } else if (
        choice === 'C' &&
        passivePerSecond > 0 &&
        (
          !this.isRulesV8(match) ||
          chargeRequired - baseCharge <= MAX_PASSIVE_CHARGE_PER_ROUND
        )
      ) {
        readyAtMs = openedAtMs + persistedPauseMs +
          (Math.ceil((chargeRequired - baseCharge) / passivePerSecond) * 1_000);
        const pauseStartedAtMs = chargeWindow?.pauseStartedAtMs == null
          ? NaN
          : Number(chargeWindow.pauseStartedAtMs);
        if (Number.isFinite(pauseStartedAtMs) && pauseStartedAtMs < readyAtMs) {
          const pauseUntilMs = chargeWindow?.pauseUntilMs == null
            ? NaN
            : Number(chargeWindow.pauseUntilMs);
          readyAtMs = Number.isFinite(pauseUntilMs)
            ? readyAtMs + Math.max(0, pauseUntilMs - pauseStartedAtMs)
            : undefined;
        }
      }
      const specialAvailability = choice === 'C'
        ? projectSpecialAvailability({ charge: baseCharge })
        : null;
      const available = choice === 'B'
        ? !defenseLocked
        : choice !== 'C' || specialAvailability.available;
      return {
        choice,
        icon: skill.icon,
        name: skill.name,
        nameKey: skill.nameKey,
        shortText: skill.shortText,
        shortTextKey: skill.shortTextKey,
        elementRelation,
        available,
        ...(choice === 'B' && defenseLocked ? {
          unavailableReason: 'arena_collapse_defense_locked'
        } : {}),
        ...(choice === 'C' ? {
          chargeRequired,
          ...(Number.isFinite(readyAtMs) ? { readyAtMs } : {}),
          unavailableReason: specialAvailability.unavailableReason
        } : {})
      };
    });
  }

  publicViewerName(viewerId, fallback = null) {
    const candidate = String(
      this.store?.getViewerDisplayName?.(viewerId) || fallback || ''
    ).trim().replace(/^@+/, '');
    if (
      !candidate ||
      /^viewer$/i.test(candidate) ||
      /^\d+$/.test(candidate) ||
      /^tiktok:\d+$/i.test(candidate)
    ) {
      return 'Viewer';
    }
    return `@${candidate.slice(0, 64)}`;
  }

  projectPublicFighters(match) {
    const chargeWindow = this.chargeWindow(match);
    return match.participants.map(participant => {
      const roster = participant.roster;
      const charge = Math.max(
        0,
        Math.min(100, Number(participant.combatState?.charge) || 0)
      );
      const skills = this.projectPublicSkillDeck(participant, match, {
        charge,
        chargeWindow
      });
      return projectBattleFighter({
        slot: participant.slot,
        locked: Boolean(participant.lockedMonsterId),
        ...(roster ? {
          name: roster.name,
          viewerName: this.publicViewerName(participant.viewerId),
          element: roster.element,
          templateId: roster.template_id,
          evolutionStage: Math.max(
            1,
            Math.min(3, Number(roster.evolution_stage) || 1)
          ),
          imageUrl: this.resolveFighterImage(
            roster.template_id,
            roster.evolution_stage,
            roster.image_url,
            roster.visual_key
          ),
          level: roster.level,
          hp: participant.combatState?.hp ?? maxHp(roster),
          maxHp: participant.combatState?.maxHp ?? maxHp(roster),
          shield: participant.combatState?.shield ?? 0,
          charge,
          ...(skills.length ? { skills } : {})
        } : {})
      });
    });
  }

  sanitizeStoredPublicFighters(fighters, match, chargeWindow = null) {
    if (!Array.isArray(fighters) || fighters.length !== 2) {
      return this.projectPublicFighters(match);
    }
    return fighters.map(fighter => {
      const slot = Number(fighter?.slot) || 0;
      const participant = match.participants.find(entry => entry.slot === slot);
      const stage = Math.max(1, Math.min(3, Number(fighter?.evolutionStage) || 1));
      const templateId = String(fighter?.templateId || '');
      const imageUrl = this.resolveFighterImage(
        templateId,
        stage,
        fighter?.imageUrl,
        fighter?.visualKey
      );
      const publicFighter = {
        slot,
        locked: Boolean(fighter?.locked)
      };
      if (!imageUrl) return publicFighter;
      const skills = participant
        ? this.projectPublicSkillDeck(participant, match, {
            charge: fighter?.charge,
            chargeWindow
          })
        : [];
      return projectBattleFighter({
        ...fighter,
        name: String(fighter?.name || '').slice(0, 80),
        viewerName: this.publicViewerName(participant?.viewerId, fighter?.viewerName),
        element: String(fighter?.element || '').slice(0, 16),
        templateId,
        evolutionStage: stage,
        imageUrl,
        skills
      });
    });
  }

  projectPublicMonster(participant, monster) {
    const stage = Math.max(1, Math.min(3, Number(monster?.evolution_stage) || 1));
    const templateId = String(monster?.template_id || '');
    return {
      slot: Number(participant?.slot) || 0,
      viewerName: this.publicViewerName(participant?.viewerId),
      name: String(monster?.name || '').slice(0, 80),
      element: String(monster?.element || '').slice(0, 16),
      templateId,
      evolutionStage: stage,
      imageUrl: this.resolveFighterImage(
        templateId,
        stage,
        monster?.image_url,
        monster?.visual_key
      ),
      level: Math.max(1, Math.min(20, Number(monster?.level) || 1)),
      xp: Math.max(0, Number(monster?.xp) || 0),
      unspentStatPoints: Math.max(0, Number(monster?.unspent_stat_points) || 0)
    };
  }

  sanitizePublicMonster(monster) {
    const stage = Math.max(1, Math.min(3, Number(monster?.evolutionStage) || 1));
    const templateId = String(monster?.templateId || '');
    return {
      slot: Number(monster?.slot) || 0,
      viewerName: this.publicViewerName(null, monster?.viewerName),
      name: String(monster?.name || '').slice(0, 80),
      element: String(monster?.element || '').slice(0, 16),
      templateId,
      evolutionStage: stage,
      imageUrl: this.resolveFighterImage(
        templateId,
        stage,
        monster?.imageUrl,
        monster?.visualKey
      ),
      level: Math.max(1, Math.min(20, Number(monster?.level) || 1)),
      xp: Math.max(0, Number(monster?.xp) || 0),
      unspentStatPoints: Math.max(0, Number(monster?.unspentStatPoints) || 0)
    };
  }

  hasOpenStatWindow() {
    return Boolean(this.db.prepare(`
      SELECT 1
      FROM (
        SELECT prompt_id FROM streammonsters_stat_prompts WHERE status = 'open'
        UNION ALL
        SELECT prompt_id FROM streammonsters_stat_allocations WHERE status = 'open'
      )
      LIMIT 1
    `).get());
  }

  statChoiceContext({ userId, participant = null, monster }) {
    const projectedMonster = this.projectPublicMonster(participant, monster);
    return {
      playerName: this.publicViewerName(userId),
      monster: projectedMonster,
      level: projectedMonster.level,
      remainingUnspentPoints: projectedMonster.unspentStatPoints
    };
  }

  appendDecisionEvent(match, participant, {
    choice,
    source,
    providerEventId = null
  }) {
    const normalizedSource = source === 'timeout' ? 'timeout' : 'viewer';
    const event = this.appendEvent(
      match.matchId,
      'streammonsters:battle_choice_locked',
      {
        matchId: match.matchId,
        participantId: participant.participantId,
        viewerId: participant.viewerId,
        providerEventId,
        round: match.roundNumber,
        window: 'action',
        choice,
        source: normalizedSource,
        timeout: normalizedSource === 'timeout'
      },
      () => ({
        matchId: match.matchId,
        decision: {
          round: match.roundNumber,
          slot: participant.slot,
          locked: true,
          source: normalizedSource,
          deadlineMs: match.actionDeadlineMs
        }
      })
    );
    this.db.prepare(`
      UPDATE streammonsters_match_decisions
      SET event_sequence = ?
      WHERE match_id = ? AND participant_id = ?
        AND window_kind = 'action' AND window_sequence = ?
    `).run(
      event.sequence,
      match.matchId,
      participant.participantId,
      match.roundNumber
    );
    return event;
  }

  rejectParticipantChoice(match, participant, reason) {
    const messageKey = CHOICE_REJECTION_MESSAGE_KEYS[reason];
    if (!match || !participant || !messageKey) {
      return { handled: false, reason };
    }
    const feedback = {
      matchId: match.matchId,
      round: match.roundNumber,
      slot: participant.slot,
      reason,
      messageKey
    };
    this.appendEvent(
      match.matchId,
      'streammonsters:battle_choice_rejected',
      feedback,
      feedback
    );
    return {
      handled: true,
      accepted: false,
      reason,
      matchId: match.matchId,
      slot: participant.slot,
      feedback: { messageKey }
    };
  }

  projectPublicAction(action, match, eventSequence = null) {
    const actor = match.participants.find(participant => (
      participant.lockedMonsterId === action.actorId
    ));
    const target = match.participants.find(participant => (
      participant.lockedMonsterId === action.targetId
    ));
    const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const projectHit = hit => ({
      index: numeric(hit.index),
      requestedDamage: numeric(hit.requestedDamage),
      shieldPenetrated: numeric(hit.shieldPenetrated),
      shieldAbsorbed: numeric(hit.shieldAbsorbed),
      hpDamage: numeric(hit.hpDamage),
      evaded: Boolean(hit.evaded)
    });
    const projectOutcome = outcome => ({
      type: String(outcome.type || ''),
      ...(outcome.amount != null ? { amount: numeric(outcome.amount) } : {}),
      ...(outcome.requested != null ? { requested: numeric(outcome.requested) } : {}),
      ...(outcome.arenaCollapseReduction != null
        ? {
            arenaCollapseReduction: numeric(
              outcome.arenaCollapseReduction
            )
          }
        : {}),
      ...(outcome.hits != null ? { hits: numeric(outcome.hits) } : {}),
      ...(outcome.chance != null ? { chance: numeric(outcome.chance) } : {}),
      ...(outcome.pending != null ? { pending: numeric(outcome.pending) } : {})
    });
    const projectSkillEffect = effect => ({
      type: String(effect?.type || '').slice(0, 32),
      ...(effect?.power != null ? { power: numeric(effect.power) } : {}),
      ...(effect?.hits != null ? { hits: numeric(effect.hits) } : {}),
      ...(effect?.chance != null ? { chance: numeric(effect.chance) } : {}),
      ...(effect?.ratio != null ? { ratio: numeric(effect.ratio) } : {})
    });
    const projectState = state => ({
      hp: numeric(state?.hp),
      maxHp: numeric(state?.maxHp),
      shield: numeric(state?.shield),
      charge: numeric(state?.charge),
      burn: numeric(state?.burn),
      evade: numeric(state?.evade),
      thorns: numeric(state?.thorns),
      reflect: numeric(state?.reflect),
      weakened: numeric(state?.weakened)
    });
    const isRulesV6 = this.isRulesV6(match);
    const rawKnockouts = Array.isArray(action.knockouts)
      ? action.knockouts
      : (action.knockout ? [action.knockout] : []);
    const knockouts = rawKnockouts.map(knockout => {
      const participant = match.participants.find(entry => (
        entry.lockedMonsterId === knockout?.monsterId
      ));
      return {
        slot: numeric(knockout?.slot ?? participant?.slot),
        cause: String(knockout?.cause || 'skill').slice(0, 32)
      };
    });
    const projected = {
      rulesVersion: Number(match.rulesVersion) || 5,
      sequence: numeric(action.sequence),
      eventSequence: numeric(eventSequence ?? action.eventSequence),
      round: numeric(action.round),
      actorSlot: numeric(action.actorSlot ?? actor?.slot),
      targetSlot: numeric(action.targetSlot ?? target?.slot),
      requestedChoice: String(action.requestedChoice || ''),
      choice: String(action.choice || ''),
      choiceFallback: action.choiceFallback || null,
      decisionSequence: numeric(action.decisionSequence),
      skill: {
        id: String(action.skill?.id || ''),
        name: String(action.skill?.name || '').slice(0, 96),
        icon: String(action.skill?.icon || '').slice(0, 16),
        shortText: String(action.skill?.shortText || '').slice(0, 180),
        shortTextKey: String(action.skill?.shortTextKey || '').slice(0, 64),
        type: String(action.skill?.type || ''),
        element: String(action.skill?.element || ''),
        vfxKey: String(action.skill?.vfxKey || ''),
        ...(isRulesV6
          ? {
              role: String(action.skill?.role || '').slice(0, 16),
              effects: Array.isArray(action.skill?.effects)
                ? action.skill.effects.map(projectSkillEffect)
                : []
            }
          : {})
      },
      hits: Array.isArray(action.hits) ? action.hits.map(projectHit) : [],
      outcomes: Array.isArray(action.outcomes) ? action.outcomes.map(projectOutcome) : [],
      retaliations: Array.isArray(action.retaliations)
        ? action.retaliations.map(retaliation => ({
          type: String(retaliation.type || ''),
          ...projectHit(retaliation)
        }))
        : [],
      statusEffects: Array.isArray(action.statusEffects)
        ? action.statusEffects.map(effect => ({
          type: String(effect.type || ''),
          amount: numeric(effect.amount),
          hpDamage: numeric(effect.hpDamage),
          remaining: numeric(effect.remaining)
        }))
        : [],
      actorState: projectState(action.actorState || action.after?.actor),
      targetState: projectState(action.targetState || action.after?.target),
      terminal: Boolean(action.terminal),
      ...(action.skipped ? { skipped: String(action.skipped) } : {})
    };
    if (isRulesV6) {
      projected.rolls = Array.isArray(action.rolls)
        ? action.rolls.map(roll => ({
          purpose: String(roll?.purpose || '').slice(0, 32),
          hitIndex: numeric(roll?.hitIndex),
          chance: numeric(roll?.chance),
          value: numeric(roll?.value)
        }))
        : [];
      projected.knockouts = knockouts;
      projected.knockout = knockouts.length === 1 ? knockouts[0] : null;
    }
    return projected;
  }

  startActionWindow(matchId, expectedVersion = null) {
    const current = this.getMatch(matchId);
    if (!current) return null;
    const nowMs = this.now();
    const predicate = expectedVersion == null ? '' : 'AND phase_version = ?';
    const args = [
      nowMs,
      nowMs + this.actionWindowMs(current),
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
          action_opened_at_ms = ?,
          action_deadline_ms = ?,
          charge_paused_ms = 0,
          charge_pause_started_at_ms = NULL,
          charge_pause_until_ms = NULL,
          charge_pause_reason = NULL,
          updated_at_ms = ?
      WHERE match_id = ? AND state IN ('roster', 'action') ${predicate}
    `).run(...args);
    if (!changed.changes) return this.getMatch(matchId);
    const match = this.getMatch(matchId);
    const chargeWindow = this.chargeWindow(match);
    const choices = this.actionPromptChoices(match);
    this.appendEvent(matchId, 'streammonsters:battle_choice_opened', {
      matchId,
      round: match.roundNumber,
      deadlineMs: match.actionDeadlineMs,
      choices,
      ...(chargeWindow ? { chargeWindow } : {})
    }, {
      matchId,
      round: match.roundNumber,
      deadlineMs: match.actionDeadlineMs,
      choices,
      ...(chargeWindow ? { chargeWindow } : {}),
      fighters: this.projectPublicFighters(match)
    });
    return this.getMatch(matchId);
  }

  submitChoice({ userId, choice, eventId = null, source = 'viewer' }) {
    const normalizedEventId = eventId ? String(eventId) : null;
    return this.store.runInImmediateTransaction(() => {
      const match = this.getActiveMatchForViewer(userId);
      const participant = match?.participants.find(entry => entry.viewerId === userId);
      if (!match || !participant) {
        return { handled: false, reason: 'no_active_window' };
      }
      if (normalizedEventId && this.db.prepare(`
        SELECT 1 FROM streammonsters_match_decisions WHERE event_id = ?
      `).get(normalizedEventId)) {
        return this.rejectParticipantChoice(match, participant, 'duplicate_event');
      }
      const nowMs = this.now();
      if (match.state !== 'action' || match.actionDeadlineMs <= nowMs) {
        return this.rejectParticipantChoice(match, participant, 'no_active_window');
      }
      const normalized = String(choice || '').trim().toUpperCase();
      if (!['A', 'B', 'C'].includes(normalized)) {
        return { handled: false, reason: 'invalid_choice' };
      }
      if (normalized === 'B' && this.isDefenseLocked(match)) {
        return this.rejectParticipantChoice(
          match,
          participant,
          'arena_collapse_defense_locked'
        );
      }
      const chargeAtChoice = this.isRulesV7(match)
        ? this.projectParticipantCharge(participant, match, nowMs)
        : null;
      if (this.isRulesV7(match) && normalized === 'C' && chargeAtChoice < 100) {
        return this.rejectParticipantChoice(match, participant, 'special_not_charged');
      }
      const normalizedSource = source === 'timeout' ? 'timeout' : 'viewer';
      const inserted = this.db.prepare(`
        INSERT OR IGNORE INTO streammonsters_match_decisions (
          match_id, participant_id, window_kind, window_sequence, choice,
          requested_choice, source, event_id, charge_at_choice, created_at_ms
        ) VALUES (?, ?, 'action', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        match.matchId,
        participant.participantId,
        match.roundNumber,
        normalized,
        normalized,
        normalizedSource,
        normalizedEventId,
        chargeAtChoice,
        nowMs
      );
      if (!inserted.changes) {
        return this.rejectParticipantChoice(match, participant, 'already_locked');
      }
      this.appendDecisionEvent(match, participant, {
        choice: normalized,
        source: normalizedSource,
        providerEventId: normalizedEventId
      });
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
    let match = this.getMatch(matchId);
    if (!match || match.state !== 'action' || match.phaseVersion !== expectedVersion) return match;
    const decisions = this.db.prepare(`
      SELECT * FROM streammonsters_match_decisions
      WHERE match_id = ? AND window_kind = 'action' AND window_sequence = ?
    `).all(matchId, match.roundNumber);
    if (decisions.length !== 2) return match;
    if (this.isRulesV7(match)) {
      const materializedAtMs = Math.max(
        Number(match.actionOpenedAtMs) || 0,
        ...decisions.map(decision => Number(decision.created_at_ms) || 0)
      );
      match = this.materializePassiveCharge(match, materializedAtMs);
    }
    this.appendEvent(matchId, 'streammonsters:battle_choices_revealed', {
      matchId,
      round: match.roundNumber,
      choices: decisions.map(decision => {
        const participant = match.participants.find(entry => (
          entry.participantId === decision.participant_id
        ));
        return {
          slot: participant?.slot || 0,
          choice: decision.choice,
          source: decision.source === 'timeout' ? 'timeout' : 'viewer'
        };
      }).sort((left, right) => left.slot - right.slot)
    });
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
      state,
      rulesVersion: match.rulesVersion
    });
    const existingCount = this.db.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_actions WHERE match_id = ?
    `).get(matchId).count;
    outcome.actions.forEach((action, index) => {
      const participant = match.participants.find(entry => entry.lockedMonsterId === action.actorId);
      const decision = decisions.find(entry => entry.participant_id === participant.participantId);
      const sequence = existingCount + index + 1;
      const persistedAction = {
        ...action,
        sequence,
        decisionSequence: decision?.event_sequence || 0
      };
      const event = this.appendEvent(
        matchId,
        'streammonsters:battle_skill_used',
        {
          matchId,
          round: match.roundNumber,
          action: persistedAction
        },
        ({ sequence: eventSequence }) => ({
          matchId,
          round: match.roundNumber,
          action: this.projectPublicAction(persistedAction, match, eventSequence)
        })
      );
      persistedAction.eventSequence = event.sequence;
      this.db.prepare(`
        INSERT INTO streammonsters_match_actions (
          match_id, sequence, round_number, actor_participant_id,
          event_id, event_sequence, action_json, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        matchId,
        sequence,
        match.roundNumber,
        participant.participantId,
        `${matchId}:action:${sequence}`,
        event.sequence,
        JSON.stringify(persistedAction),
        this.now()
      );
    });
    if (this.isRulesV8(match) && match.roundNumber >= ARENA_COLLAPSE_ROUND) {
      outcome.state = this.applyArenaCollapse(
        match,
        outcome.state,
        outcome.actions
      );
    }
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
    if (outcome.terminal) {
      if (!outcome.winnerId) {
        return this.finalizeDraw(matchId, expectedVersion);
      }
      const winnerState = outcome.state[outcome.winnerId] || {};
      return this.finalize(matchId, expectedVersion, outcome.winnerId, {
        completion: 'battle',
        terminalReason: 'knockout',
        knockout: {
          round: Math.max(1, Number(match.roundNumber) || 1),
          remainingHp: Math.max(0, Number(winnerState.hp) || 0),
          maxHp: Math.max(1, Number(winnerState.maxHp) || 1)
        }
      });
    }
    const nowMs = this.now();
    const actionPauseMs = outcome.actions.reduce((total, action) => {
      if (this.isRulesV8(match)) {
        return total + ArenaDirector.buildArcadeTimeline(
          'battle_skill_used',
          {
            action: {
              ...action,
              rulesVersion: match.rulesVersion
            }
          }
        ).durationMs;
      }
      const timeline = ArenaDirector.buildJackpotActionTimeline({
        ...action,
        rulesVersion: match.rulesVersion
      });
      return total + timeline.reduce(
        (maximum, beat) => Math.max(maximum, beat.atMs + beat.durationMs),
        0
      );
    }, 0);
    const cinematicPauseMs = actionPauseMs + (
      this.isRulesV8(match)
        ? RULES_V8_PACING.JOINT_REVEAL_MS + (
            match.roundNumber >= ARENA_COLLAPSE_ROUND
              ? RULES_V8_PACING.COLLAPSE_MS
              : 0
          )
        : 0
    );
    const changed = this.db.prepare(`
      UPDATE streammonsters_matches
      SET phase_version = phase_version + 1,
          round_number = round_number + 1,
          action_opened_at_ms = NULL,
          action_deadline_ms = NULL,
          charge_paused_ms = 0,
          charge_pause_started_at_ms = ?,
          charge_pause_until_ms = ?,
          charge_pause_reason = 'cinematic',
          updated_at_ms = ?
      WHERE match_id = ? AND state = 'action' AND phase_version = ?
    `).run(
      nowMs,
      nowMs + cinematicPauseMs,
      nowMs,
      matchId,
      expectedVersion
    );
    return this.getMatch(matchId);
  }

  applyArenaCollapse(match, resolvedState, actions = []) {
    const collapse = resolveArenaCollapse({
      fighters: match.participants.map(participant => ({
        monsterId: participant.lockedMonsterId,
        slot: participant.slot
      })),
      state: resolvedState,
      round: match.roundNumber,
      actions
    });
    this.appendEvent(
      match.matchId,
      'streammonsters:battle_arena_collapse',
      {
        matchId: match.matchId,
        round: collapse.round,
        damage: collapse.damage,
        state: collapse.state
      },
      {
        matchId: match.matchId,
        round: collapse.round,
        damage: collapse.damage,
        fighters: collapse.fighters.map(({ monsterId: _monsterId, ...fighter }) => fighter)
      }
    );
    return collapse.state;
  }

  tieBreakWinner(match, state) {
    return selectBattleWinner(match.participants.map(participant => ({
      monsterId: participant.lockedMonsterId,
      agility: participant.roster?.stats?.agility
    })), state, match.seed);
  }

  finalizeDraw(matchId, expectedVersion) {
    return this.finalize(matchId, expectedVersion, null, {
      completion: 'battle',
      terminalReason: 'double_knockout',
      knockout: null
    });
  }

  finalize(matchId, expectedVersion, winnerMonsterId, options = {}) {
    return this.store.runInImmediateTransaction(() => {
      const nowMs = this.now();
      const match = this.getMatch(matchId);
      if (!match || match.state !== 'action' || match.phaseVersion !== expectedVersion) {
        return match;
      }
      const completion = options.completion === 'forfeit' ? 'forfeit' : 'battle';
      const terminalReason = options.terminalReason === 'knockout'
        ? 'knockout'
        : options.terminalReason === 'double_knockout'
          ? 'double_knockout'
          : 'forfeit';
      const isDraw = terminalReason === 'double_knockout';
      const resolvedWinnerMonsterId = isDraw ? null : winnerMonsterId;
      const knockout = terminalReason === 'knockout'
        ? {
            round: Math.max(1, Math.round(Number(options.knockout?.round) || 1)),
            remainingHp: Math.max(
              0,
              Math.round(Number(options.knockout?.remainingHp) || 0)
            ),
            maxHp: Math.max(1, Math.round(Number(options.knockout?.maxHp) || 1))
          }
        : null;
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
      `).run(
        resolvedWinnerMonsterId,
        nowMs,
        nowMs,
        nowMs,
        matchId,
        expectedVersion
      );
      if (!changed.changes) return this.getMatch(matchId);

      const rewardsEnabled = completion === 'battle';
      const season = this.getCurrentArenaSeason();
      const eligibility = Object.fromEntries(match.participants.map(participant => [
        participant.participantId,
        rewardsEnabled && !isDraw
          ? this.claimArenaDailyBattle(participant.viewerId)
          : false
      ]));
      const winnerParticipant = match.participants.find(
        participant => participant.lockedMonsterId === resolvedWinnerMonsterId
      );
      const loserParticipant = winnerParticipant
        ? match.participants.find(
            participant => participant.lockedMonsterId !== resolvedWinnerMonsterId
          )
        : null;
      const forfeitedParticipant = options.forfeitedParticipantId
        ? match.participants.find(participant => (
            participant.participantId === options.forfeitedParticipantId
          ))
        : null;
      const ratingChanges = !rewardsEnabled || isDraw
        ? {}
        : this.applyArenaElo({
            seasonId: season.seasonId,
            winner: winnerParticipant,
            loser: loserParticipant,
            eligibility
          });
      const participantResults = [];

      match.participants.forEach(participant => {
        const won = Boolean(
          winnerParticipant &&
          participant.lockedMonsterId === resolvedWinnerMonsterId
        );
        const before = this.store.getMonster(participant.lockedMonsterId);
        const xpAwarded = !rewardsEnabled || (Number(before?.level) || 1) >= 20
          ? 0
          : 10 + (won ? 5 : 0);
        let monster = before;
        if (rewardsEnabled) {
          const battleMonster = this.store.recordMonsterBattle(
            participant.lockedMonsterId,
            won
          );
          monster = this.store.awardMonsterXp(participant.lockedMonsterId, xpAwarded);
          this.progression?.recordBattleProgress?.(
            participant.viewerId,
            this.getStreamKey?.() || null,
            { monster: battleMonster, won }
          );
          monster = this.store.getMonster(participant.lockedMonsterId) || monster;
        }
        const rating = ratingChanges[participant.participantId] || {
          before: participant.ratingBefore,
          after: participant.ratingBefore,
          delta: 0
        };
        this.db.prepare(`
          UPDATE streammonsters_match_participants
          SET rating_after = ?, active = 0
          WHERE match_id = ? AND participant_id = ?
        `).run(rating.after, matchId, participant.participantId);
        if (rewardsEnabled) {
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
        }
        const pointsGained = Math.max(
          0,
          (Number(monster?.unspent_stat_points) || 0) -
            (Number(before?.unspent_stat_points) || 0)
        );
        const publicMonster = this.projectPublicMonster(participant, monster);
        if (rewardsEnabled) {
          this.appendEvent(matchId, 'streammonsters:monster_xp_awarded', {
            matchId,
            slot: participant.slot,
            amount: xpAwarded,
            won,
            monster: publicMonster
          });
        }
        const levelsGained = Math.max(
          0,
          (Number(monster?.level) || 1) - (Number(before?.level) || 1)
        );
        if (rewardsEnabled && levelsGained > 0) {
          this.appendEvent(matchId, 'streammonsters:monster_level_up', {
            matchId,
            slot: participant.slot,
            levelsGained,
            monster: publicMonster
          });
        }
        if (
          eligibility[participant.participantId] &&
          rating.before !== rating.after &&
          rating.delta !== 0
        ) {
          this.appendEvent(matchId, 'streammonsters:arena_rating_changed', {
            matchId,
            slot: participant.slot,
            arenaEligible: true,
            before: {
              rating: rating.before,
              tier: this.arenaTier(rating.before)
            },
            after: {
              rating: rating.after,
              tier: this.arenaTier(rating.after)
            },
            delta: rating.delta
          });
        }
        participantResults.push({
          participantId: participant.participantId,
          monsterId: participant.lockedMonsterId,
          slot: participant.slot,
          xpAwarded,
          arenaEligible: Boolean(eligibility[participant.participantId]),
          rating: {
            before: rating.before,
            after: rating.after,
            delta: rating.delta
          }
        });
        if (rewardsEnabled && pointsGained > 0) {
          this.createStatPrompt(matchId, participant, pointsGained);
        }
      });
      if (rewardsEnabled && winnerParticipant) {
        this.store.incrementViewer(winnerParticipant.viewerId, 'battles_won');
      }
      const streamKey = this.getStreamKey?.() || null;
      if (rewardsEnabled) {
        if (streamKey) this.store.incrementStreamMetric(streamKey, 'duels');
        this.collection?.recordBattleOutcome?.({
          streamKey,
          battleId: `battle-${matchId}`,
          fighters: match.participants.map(participant => ({
            monster: this.store.getMonster(participant.lockedMonsterId),
            won: Boolean(
              winnerParticipant &&
              participant.lockedMonsterId === resolvedWinnerMonsterId
            )
          }))
        });
      }

      const winnerMonster = winnerParticipant
        ? this.store.getMonster(winnerParticipant.lockedMonsterId)
        : null;
      const loserMonster = loserParticipant
        ? this.store.getMonster(loserParticipant.lockedMonsterId)
        : null;
      const winnerPublic = winnerParticipant
        ? this.projectPublicMonster(winnerParticipant, winnerMonster)
        : null;
      const loserPublic = loserParticipant
        ? this.projectPublicMonster(loserParticipant, loserMonster)
        : null;
      if (rewardsEnabled && winnerParticipant && loserParticipant) {
        const winnerStreak = this.store.getViewerBattleStats(
          winnerParticipant.viewerId
        ).win_streak;
        if (winnerStreak >= 2) {
        this.appendEvent(
          matchId,
          'streammonsters:win_streak',
          {
            matchId,
            viewerId: winnerParticipant.viewerId,
            slot: winnerParticipant.slot,
            count: winnerStreak,
            monster: winnerPublic
          },
          {
            matchId,
            slot: winnerParticipant.slot,
            count: winnerStreak,
            monster: winnerPublic
          }
        );
        }
        if (
          (Number(winnerParticipant.roster?.level) || 1) <
          (Number(loserParticipant.roster?.level) || 1)
        ) {
        this.appendEvent(
          matchId,
          'streammonsters:upset',
          {
            matchId,
            viewerId: winnerParticipant.viewerId,
            winnerSlot: winnerParticipant.slot,
            loserSlot: loserParticipant.slot,
            winner: winnerPublic,
            loser: loserPublic
          },
          {
            matchId,
            winnerSlot: winnerParticipant.slot,
            loserSlot: loserParticipant.slot,
            winner: winnerPublic,
            loser: loserPublic
          }
        );
        }
        const rivalryCount = this.store.countBattlesBetween(
          winnerParticipant.lockedMonsterId,
          loserParticipant.lockedMonsterId
        ) + 1;
        if (rivalryCount >= 2) {
        this.appendEvent(
          matchId,
          'streammonsters:rivalry',
          {
            matchId,
            leftParticipantId: match.participants[0].participantId,
            rightParticipantId: match.participants[1].participantId,
            left: this.projectPublicMonster(
              match.participants[0],
              this.store.getMonster(match.participants[0].lockedMonsterId)
            ),
            right: this.projectPublicMonster(
              match.participants[1],
              this.store.getMonster(match.participants[1].lockedMonsterId)
            ),
            count: rivalryCount
          },
          {
            matchId,
            leftSlot: match.participants[0].slot,
            rightSlot: match.participants[1].slot,
            left: this.projectPublicMonster(
              match.participants[0],
              this.store.getMonster(match.participants[0].lockedMonsterId)
            ),
            right: this.projectPublicMonster(
              match.participants[1],
              this.store.getMonster(match.participants[1].lockedMonsterId)
            ),
            count: rivalryCount
          }
        );
        }
      }

      const actions = this.getReplay(matchId).actions;
      const combatReport = buildCombatReport({
        actions,
        fighters: match.participants.map(participant => ({
          slot: participant.slot,
          monsterId: participant.lockedMonsterId,
          playerName: this.publicViewerName(participant.viewerId),
          monsterName: participant.roster?.name
        })),
        participantResults,
        roundNumber: match.roundNumber,
        createdAtMs: match.createdAtMs,
        completedAtMs: nowMs
      });
      const durableWinnerMonsterId = isDraw
        ? 'double_knockout'
        : resolvedWinnerMonsterId;
      const result = {
        matchId,
        rulesVersion: match.rulesVersion,
        seed: match.seed,
        winnerMonsterId: resolvedWinnerMonsterId,
        winner: winnerPublic,
        completion,
        terminalReason,
        knockout,
        forfeitedParticipantId: forfeitedParticipant?.participantId || null,
        forfeitedSlot: forfeitedParticipant?.slot || null,
        season,
        participants: participantResults,
        actions,
        combatReport
      };
      this.db.prepare(`
        UPDATE streammonsters_matches SET result_json = ? WHERE match_id = ?
      `).run(JSON.stringify(result), matchId);
      this.db.prepare(`
        INSERT OR IGNORE INTO streammonsters_battles (
          battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
          user_a_id, user_b_id, rounds_json, rules_version, skills_json,
          result_json, created_at_ms, match_id, replay_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `battle-${matchId}`,
        match.seed,
        match.participants[0].lockedMonsterId,
        match.participants[1].lockedMonsterId,
        durableWinnerMonsterId,
        match.participants[0].viewerId,
        match.participants[1].viewerId,
        JSON.stringify([]),
        match.rulesVersion,
        JSON.stringify({}),
        JSON.stringify(result),
        nowMs,
        matchId,
        match.rulesVersion
      );
      this.appendEvent(matchId, 'streammonsters:battle_completed', {
        matchId,
        winnerMonsterId: resolvedWinnerMonsterId,
        completion,
        terminalReason,
        knockout,
        forfeitedParticipantId: forfeitedParticipant?.participantId || null,
        combatReport
      }, {
        matchId,
        winnerSlot: winnerParticipant?.slot || 0,
        winner: winnerPublic,
        ratingChanges: participantResults.map(participant => ({
          slot: participant.slot,
          before: participant.rating.before,
          after: participant.rating.after,
          delta: participant.rating.delta
        })),
        completion,
        terminalReason,
        knockout,
        forfeitedSlot: forfeitedParticipant?.slot || null,
        combatReport
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
    const match = this.getMatch(matchId);
    if (!participant.lockedMonsterId) {
      participant = this.getMatch(matchId)?.participants.find(candidate => (
        candidate.participantId === participant.participantId
      )) || participant;
    }
    if (!participant.lockedMonsterId) return null;
    if (this.hasOpenStatWindow()) return null;
    const standaloneOpen = this.db.prepare(`
      SELECT 1 FROM streammonsters_stat_allocations
      WHERE monster_id = ? AND status = 'open'
      LIMIT 1
    `).get(participant.lockedMonsterId);
    if (standaloneOpen) return null;
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
      nowMs + this.statWindowMs(match),
      nowMs
    );
    const prompt = this.db.prepare(`
      SELECT * FROM streammonsters_stat_prompts WHERE prompt_id = ?
    `).get(promptId);
    if (prompt?.status === 'open') {
      const monster = this.store.getMonster(participant.lockedMonsterId);
      const publicPrompt = {
        matchId,
        slot: participant.slot,
        deadlineMs: prompt.deadline_ms,
        choices: ['1', '2', '3', '4'],
        ...this.statChoiceContext({
          userId: participant.viewerId,
          participant,
          monster
        })
      };
      const event = this.appendEvent(
        matchId,
        'streammonsters:monster_stat_prompt',
        publicPrompt
      );
      this.emitAfterCommit('streammonsters:stat_choice_opened', {
        ...publicPrompt,
        eventId: `${event.eventId}:legacy`,
        sequence: event.sequence,
        compatibilityAlias: true
      });
    }
    return prompt || null;
  }

  createStandaloneStatPrompt({
    userId,
    monsterId,
    sourceKey = 'progression'
  }) {
    const monster = this.store.getMonster(monsterId);
    if (
      !monster ||
      monster.user_id !== userId ||
      (Number(monster.unspent_stat_points) || 0) < 1
    ) {
      return null;
    }
    const matchPrompt = this.db.prepare(`
      SELECT 1 FROM streammonsters_stat_prompts
      WHERE monster_id = ? AND status = 'open'
      LIMIT 1
    `).get(monsterId);
    if (matchPrompt) return null;
    const existing = this.db.prepare(`
      SELECT * FROM streammonsters_stat_allocations
      WHERE monster_id = ? AND status = 'open'
      LIMIT 1
    `).get(monsterId);
    if (existing) return existing;
    if (this.hasOpenStatWindow()) return null;
    const nowMs = this.now();
    const promptId = `allocation-${randomUUID()}`;
    const uniqueSource = `${String(sourceKey || 'progression')}:${monsterId}:` +
      `${monster.level}:${monster.unspent_stat_points}`;
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_stat_allocations (
        prompt_id, viewer_id, monster_id, source_key, deadline_ms,
        status, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, 'open', ?)
    `).run(
      promptId,
      userId,
      monsterId,
      uniqueSource,
      nowMs + this.statWindowMs(),
      nowMs
    );
    const prompt = this.db.prepare(`
      SELECT * FROM streammonsters_stat_allocations
      WHERE monster_id = ? AND status = 'open'
      LIMIT 1
    `).get(monsterId);
    if (prompt?.prompt_id === promptId) {
      const publicPrompt = {
        promptId,
        deadlineMs: prompt.deadline_ms,
        choices: ['1', '2', '3', '4'],
        ...this.statChoiceContext({ userId, monster })
      };
      this.emitAfterCommit('streammonsters:monster_stat_prompt', publicPrompt);
      this.emitAfterCommit('streammonsters:stat_choice_opened', {
        ...publicPrompt,
        compatibilityAlias: true
      });
    }
    return prompt || null;
  }

  submitStatChoice({ userId, choice, eventId = null, source = 'viewer' }) {
    const stats = ['vitality', 'might', 'guard', 'agility'];
    const index = Number.parseInt(choice, 10) - 1;
    if (!stats[index]) return { handled: false, reason: 'invalid_choice' };
    return this.store.runInImmediateTransaction(() => {
      if (eventId && (
        this.db.prepare(`
          SELECT 1 FROM streammonsters_stat_prompts WHERE event_id = ?
        `).get(eventId) ||
        this.db.prepare(`
          SELECT 1 FROM streammonsters_stat_allocations WHERE event_id = ?
        `).get(eventId)
      )) {
        return { handled: false, reason: 'duplicate_event' };
      }
      const matchPrompt = this.db.prepare(`
        SELECT * FROM streammonsters_stat_prompts
        WHERE viewer_id = ? AND status = 'open' AND deadline_ms > ?
        ORDER BY created_at_ms, prompt_id
        LIMIT 1
      `).get(userId, this.now());
      const prompt = matchPrompt || this.db.prepare(`
        SELECT * FROM streammonsters_stat_allocations
        WHERE viewer_id = ? AND status = 'open' AND deadline_ms > ?
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
      const promptTable = matchPrompt
        ? 'streammonsters_stat_prompts'
        : 'streammonsters_stat_allocations';
      const claimed = this.db.prepare(`
        UPDATE ${promptTable}
        SET status = 'claimed', choice = ?, event_id = ?, claimed_at_ms = ?
        WHERE prompt_id = ? AND status = 'open'
      `).run(stats[index], eventId, this.now(), prompt.prompt_id);
      if (!claimed.changes) return { handled: false, reason: 'already_locked' };
      if (!matchPrompt) {
        this.emitAfterCommit('streammonsters:monster_stat_chosen', {
          promptId: prompt.prompt_id,
          stat: stats[index],
          source,
          ...this.statChoiceContext({ userId, monster: applied.monster })
        });
        if ((Number(applied.monster?.unspent_stat_points) || 0) > 0) {
          this.createStandaloneStatPrompt({
            userId,
            monsterId: prompt.monster_id,
            sourceKey: `${prompt.source_key}:next`
          });
        }
        this.ensurePendingStatAllocations();
        return {
          handled: true,
          source,
          stat: stats[index],
          monster: applied.monster,
          matchId: null,
          promptId: prompt.prompt_id
        };
      }
      const participant = this.getMatch(prompt.match_id)?.participants.find(entry => (
        entry.participantId === prompt.participant_id
      ));
      this.appendEvent(prompt.match_id, 'streammonsters:monster_stat_chosen', {
        matchId: prompt.match_id,
        slot: Number(participant?.slot) || 0,
        stat: stats[index],
        source,
        ...this.statChoiceContext({
          userId,
          participant,
          monster: applied.monster
        })
      });
      this.ensurePendingStatAllocations();
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
    const match = this.getMatch(matchId);
    const actions = this.db.prepare(`
      SELECT * FROM streammonsters_match_actions
      WHERE match_id = ? AND COALESCE(event_sequence, sequence) > ?
      ORDER BY COALESCE(event_sequence, sequence), sequence
    `).all(matchId, Math.max(0, Number(cursor) || 0)).map(row => ({
      ...parseJson(row.action_json, {}),
      eventId: row.event_id,
      sequence: row.sequence,
      eventSequence: row.event_sequence || row.sequence
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
      rulesVersion: match?.rulesVersion || 5,
      cursor: events.at(-1)?.sequence || Math.max(0, Number(cursor) || 0),
      actions,
      events
    };
  }

  getPrivateNormalizedReplay(battleOrMatchId, cursor = 0) {
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

  sanitizePublicEvent(eventType, storedPayload, match, sequence) {
    const payload = storedPayload && typeof storedPayload === 'object' ? storedPayload : {};
    if (eventType === 'streammonsters:battle_skill_used') {
      return {
        matchId: match.matchId,
        round: Number(payload.round) || Number(payload.action?.round) || 0,
        action: this.projectPublicAction(payload.action || {}, match, sequence)
      };
    }
    if (eventType === 'streammonsters:battle_choice_locked') {
      const decision = payload.decision || payload;
      return {
        matchId: match.matchId,
        decision: {
          round: Number(decision.round) || 0,
          slot: Number(decision.slot) || 0,
          locked: true,
          source: decision.source === 'timeout' ? 'timeout' : 'viewer',
          deadlineMs: Number(decision.deadlineMs) || match.actionDeadlineMs || 0
        }
      };
    }
    if (eventType === 'streammonsters:battle_choices_revealed') {
      return {
        matchId: match.matchId,
        round: Number(payload.round) || 0,
        choices: projectBattleChoices(payload.choices)
      };
    }
    if (eventType === 'streammonsters:battle_match_found') {
      return {
        matchId: match.matchId,
        deadlineMs: Number(payload.deadlineMs) || match.rosterDeadlineMs
      };
    }
    if (eventType === 'streammonsters:battle_roster_locked') {
      const selectionSource = payload.selectionSource === 'sole_eligible'
        ? 'sole_eligible'
        : payload.selectionSource === 'timeout'
          ? 'timeout'
          : 'viewer';
      return {
        matchId: match.matchId,
        slot: [1, 2].includes(Number(payload.slot)) ? Number(payload.slot) : 0,
        selectionSource,
        waiting: Boolean(payload.waiting),
        titleKey: selectionSource === 'sole_eligible'
          ? 'arenaRosterAutoTitle'
          : 'arenaRosterChoice',
        bodyKey: selectionSource === 'sole_eligible'
          ? 'arenaRosterAutoBody'
          : 'arenaRosterLockedBody',
        params: {
          name: String(payload.params?.name || payload.fighter?.name || 'Monster')
            .slice(0, 80)
        },
        fighter: projectBattleFighter(payload.fighter)
      };
    }
    if (eventType === 'streammonsters:battle_choice_opened') {
      const openedAtMs = Number(payload.chargeWindow?.openedAtMs);
      const deadlineMs = Number(payload.chargeWindow?.deadlineMs);
      const chargeWindow = this.isRulesV7(match) &&
        Number.isFinite(openedAtMs) &&
        Number.isFinite(deadlineMs) &&
        deadlineMs >= openedAtMs
        ? {
            openedAtMs,
            deadlineMs,
            passivePerSecond: PASSIVE_CHARGE_PER_SECOND,
            ...(this.isRulesV8(match) ? {
              maxGain: MAX_PASSIVE_CHARGE_PER_ROUND
            } : {})
          }
        : null;
      return {
        matchId: match.matchId,
        round: Number(payload.round) || 0,
        deadlineMs: Number(payload.deadlineMs) || 0,
        choices: this.actionPromptChoices(match),
        ...(chargeWindow ? { chargeWindow } : {}),
        fighters: this.sanitizeStoredPublicFighters(
          payload.fighters,
          match,
          chargeWindow
        )
      };
    }
    if (eventType === 'streammonsters:battle_completed') {
      const winner = match.participants.find(participant => (
        participant.lockedMonsterId === match.winnerMonsterId
      ));
      const terminalReason = [
        'knockout',
        'double_knockout',
        'forfeit'
      ].includes(payload.terminalReason)
        ? payload.terminalReason
        : null;
      const knockout = terminalReason === 'knockout'
        ? {
            round: Math.max(1, Math.round(Number(payload.knockout?.round) || 1)),
            remainingHp: Math.max(
              0,
              Math.round(Number(payload.knockout?.remainingHp) || 0)
            ),
            maxHp: Math.max(1, Math.round(Number(payload.knockout?.maxHp) || 1))
          }
        : null;
      const projected = {
        matchId: match.matchId,
        winnerSlot: Number(payload.winnerSlot) || winner?.slot || 0,
        winner: payload.winner ? this.sanitizePublicMonster(payload.winner) : null,
        ratingChanges: Array.isArray(payload.ratingChanges)
          ? payload.ratingChanges.map(change => ({
              slot: Number(change?.slot) || 0,
              before: Math.max(0, Math.round(Number(change?.before) || 0)),
              after: Math.max(0, Math.round(Number(change?.after) || 0)),
              delta: Math.round(Number(change?.delta) || 0)
            })).filter(change => change.slot > 0)
          : [],
        completion: payload.completion === 'forfeit' ? 'forfeit' : 'battle',
        forfeitedSlot: Number(payload.forfeitedSlot) || null
      };
      if (payload.combatReport && typeof payload.combatReport === 'object') {
        projected.combatReport = sanitizeCombatReport(payload.combatReport);
      }
      if (terminalReason) {
        projected.terminalReason = terminalReason;
        projected.knockout = knockout;
      }
      return projected;
    }
    if (eventType === 'streammonsters:battle_charge_tick') {
      return {
        matchId: match.matchId,
        round: Math.max(1, Number(payload.round) || 1),
        slot: Number(payload.slot) || 0,
        before: Math.max(0, Math.min(100, Number(payload.before) || 0)),
        after: Math.max(0, Math.min(100, Number(payload.after) || 0)),
        gained: Math.max(0, Math.min(
          MAX_PASSIVE_CHARGE_PER_ROUND,
          Number(payload.gained) || 0
        ))
      };
    }
    if (eventType === 'streammonsters:battle_arena_collapse') {
      return {
        matchId: match.matchId,
        round: Math.max(5, Number(payload.round) || 5),
        damage: Math.max(1, Number(payload.damage) || 1),
        fighters: Array.isArray(payload.fighters)
          ? payload.fighters.map(fighter => ({
              slot: Number(fighter?.slot) || 0,
              shieldReduced: Math.max(0, Number(fighter?.shieldReduced) || 0),
              hpDamage: Math.max(0, Number(fighter?.hpDamage) || 0),
              hp: Math.max(0, Number(fighter?.hp) || 0),
              shield: Math.max(0, Number(fighter?.shield) || 0)
            })).filter(fighter => [1, 2].includes(fighter.slot))
          : []
      };
    }
    if (
      eventType === 'streammonsters:stat_choice_opened' ||
      eventType === 'streammonsters:monster_stat_prompt'
    ) {
      return {
        matchId: match.matchId,
        slot: Number(payload.slot) || 0,
        deadlineMs: Number(payload.deadlineMs) || 0,
        choices: ['1', '2', '3', '4'],
        playerName: this.publicViewerName(null, payload.playerName),
        monster: this.sanitizePublicMonster(payload.monster),
        level: Math.max(1, Math.min(20, Number(payload.level) || 1)),
        remainingUnspentPoints: Math.max(
          0,
          Number(payload.remainingUnspentPoints) || 0
        )
      };
    }
    if (eventType === 'streammonsters:monster_xp_awarded') {
      return {
        matchId: match.matchId,
        slot: Number(payload.slot) || 0,
        amount: Math.max(0, Number(payload.amount) || 0),
        won: Boolean(payload.won),
        monster: this.sanitizePublicMonster(payload.monster)
      };
    }
    if (eventType === 'streammonsters:monster_level_up') {
      return {
        matchId: match.matchId,
        slot: Number(payload.slot) || 0,
        levelsGained: Math.max(0, Number(payload.levelsGained) || 0),
        monster: this.sanitizePublicMonster(payload.monster)
      };
    }
    if (eventType === 'streammonsters:arena_rating_changed') {
      const rating = value => Math.max(0, Math.round(Number(value) || 0));
      return {
        matchId: match.matchId,
        slot: Number(payload.slot) || 0,
        arenaEligible: Boolean(payload.arenaEligible),
        before: {
          rating: rating(payload.before?.rating),
          tier: this.arenaTier(rating(payload.before?.rating))
        },
        after: {
          rating: rating(payload.after?.rating),
          tier: this.arenaTier(rating(payload.after?.rating))
        },
        delta: Math.round(Number(payload.delta) || 0)
      };
    }
    if (eventType === 'streammonsters:win_streak') {
      return {
        matchId: match.matchId,
        slot: Number(payload.slot) || 0,
        count: Math.max(2, Math.round(Number(payload.count) || 2)),
        monster: this.sanitizePublicMonster(payload.monster)
      };
    }
    if (eventType === 'streammonsters:upset') {
      return {
        matchId: match.matchId,
        winnerSlot: Number(payload.winnerSlot) || 0,
        loserSlot: Number(payload.loserSlot) || 0,
        winner: this.sanitizePublicMonster(payload.winner),
        loser: this.sanitizePublicMonster(payload.loser)
      };
    }
    if (eventType === 'streammonsters:rivalry') {
      return {
        matchId: match.matchId,
        leftSlot: Number(payload.leftSlot) || 0,
        rightSlot: Number(payload.rightSlot) || 0,
        left: this.sanitizePublicMonster(payload.left),
        right: this.sanitizePublicMonster(payload.right),
        count: Math.max(2, Math.round(Number(payload.count) || 2))
      };
    }
    if (
      eventType === 'streammonsters:monster_stat_chosen' ||
      eventType === 'streammonsters:monster_stat_auto_assigned'
    ) {
      const stat = ['vitality', 'might', 'guard', 'agility'].includes(payload.stat)
        ? payload.stat
        : 'vitality';
      return {
        matchId: match.matchId,
        slot: Number(payload.slot) || 0,
        stat,
        source: eventType.endsWith('auto_assigned') ? 'timeout' : 'viewer',
        playerName: this.publicViewerName(null, payload.playerName),
        monster: this.sanitizePublicMonster(payload.monster),
        level: Math.max(1, Math.min(20, Number(payload.level) || 1)),
        remainingUnspentPoints: Math.max(
          0,
          Number(payload.remainingUnspentPoints) || 0
        )
      };
    }
    if (eventType === 'streammonsters:battle_cancelled') {
      return {
        matchId: match.matchId,
        reason: String(payload.reason || 'roster_unavailable')
      };
    }
    return { matchId: match.matchId };
  }

  synthesizeLegacyChoiceReveals(match, pageRows, cursor = 0) {
    if (Number(match?.rulesVersion) !== 5) return new Map();
    const normalizedCursor = Math.max(0, Number(cursor) || 0);
    const historicalRows = this.db.prepare(`
      SELECT sequence, event_id, event_type, payload_json, public_payload_json
      FROM streammonsters_match_events
      WHERE match_id = ?
        AND event_type IN (
          'streammonsters:battle_choice_locked',
          'streammonsters:battle_choices_revealed'
        )
      ORDER BY sequence
    `).all(match.matchId);
    const revealedRounds = new Set();
    historicalRows.forEach(row => {
      if (row.event_type !== 'streammonsters:battle_choices_revealed') return;
      const publicPayload = parseJson(row.public_payload_json, {});
      const privatePayload = parseJson(row.payload_json, {});
      revealedRounds.add(Number(publicPayload.round ?? privatePayload.round) || 0);
    });
    const locksByRound = new Map();
    historicalRows.forEach(row => {
      if (row.event_type !== 'streammonsters:battle_choice_locked') return;
      const publicPayload = parseJson(row.public_payload_json, {});
      const privatePayload = parseJson(row.payload_json, {});
      const publicDecision = publicPayload.decision || publicPayload;
      const privateDecision = privatePayload.decision || privatePayload;
      const participant = match.participants.find(entry => (
        entry.participantId === privateDecision.participantId
      ));
      const decision = {
        sequence: row.sequence,
        eventId: row.event_id,
        round: Number(publicDecision.round ?? privateDecision.round) || 0,
        slot: Number(
          publicDecision.slot ?? privateDecision.slot ?? participant?.slot
        ) || 0,
        choice: publicDecision.choice ?? privateDecision.choice,
        source: (
          publicDecision.source ?? privateDecision.source
        ) === 'timeout' ? 'timeout' : 'viewer'
      };
      if (
        ![1, 2].includes(decision.slot) ||
        !['A', 'B', 'C'].includes(decision.choice)
      ) {
        return;
      }
      const bySlot = locksByRound.get(decision.round) || new Map();
      if (!bySlot.has(decision.slot)) bySlot.set(decision.slot, decision);
      locksByRound.set(decision.round, bySlot);
    });
    const pageSequences = new Set(pageRows.map(row => row.sequence));
    const syntheticBySequence = new Map();
    locksByRound.forEach((bySlot, round) => {
      if (revealedRounds.has(round)) return;
      const choices = projectBattleChoices([bySlot.get(1), bySlot.get(2)]);
      if (!choices.length) return;
      const anchor = [...bySlot.values()].sort(
        (left, right) => left.sequence - right.sequence
      ).at(-1);
      const syntheticSequence = anchor.sequence + 0.5;
      const followsPageAnchor = pageSequences.has(anchor.sequence);
      const resumesInterruptedReveal = (
        anchor.sequence <= normalizedCursor &&
        syntheticSequence > normalizedCursor
      );
      if (!followsPageAnchor && !resumesInterruptedReveal) return;
      syntheticBySequence.set(anchor.sequence, {
        // Persisted sequences are integers; keep this after its lock and before the next row.
        sequence: syntheticSequence,
        eventId: `${anchor.eventId}:compat-reveal`,
        correlationId: match.matchId,
        type: 'streammonsters:battle_choices_revealed',
        payload: {
          matchId: match.matchId,
          round,
          choices
        }
      });
    });
    return syntheticBySequence;
  }

  getPublicMatchReplay(match, battleId, cursor = 0, limit = 50) {
    const normalizedCursor = Math.max(0, Number(cursor) || 0);
    const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 50));
    const rows = this.db.prepare(`
      SELECT sequence, event_id, event_type, public_payload_json
      FROM streammonsters_match_events
      WHERE match_id = ? AND sequence > ?
      ORDER BY sequence
      LIMIT ?
    `).all(match.matchId, normalizedCursor, normalizedLimit);
    const syntheticBySequence = this.synthesizeLegacyChoiceReveals(
      match,
      rows,
      normalizedCursor
    );
    const emittedSyntheticSequences = new Set();
    const events = rows.flatMap(row => {
      const storedEvent = {
        sequence: row.sequence,
        eventId: row.event_id,
        correlationId: match.matchId,
        type: row.event_type,
        payload: this.sanitizePublicEvent(
          row.event_type,
          parseJson(row.public_payload_json, {}),
          match,
          row.sequence
        )
      };
      const syntheticReveal = syntheticBySequence.get(row.sequence);
      if (syntheticReveal) emittedSyntheticSequences.add(row.sequence);
      return syntheticReveal ? [storedEvent, syntheticReveal] : [storedEvent];
    });
    syntheticBySequence.forEach((event, anchorSequence) => {
      if (!emittedSyntheticSequences.has(anchorSequence)) events.push(event);
    });
    events.sort((left, right) => left.sequence - right.sequence);
    const nextCursor = Math.max(
      normalizedCursor,
      ...events.map(event => Number(event.sequence) || 0)
    );
    const hasMore = Boolean(this.db.prepare(`
      SELECT 1 FROM streammonsters_match_events
      WHERE match_id = ? AND sequence > ?
      LIMIT 1
    `).get(match.matchId, nextCursor));
    const actions = events
      .filter(event => event.type === 'streammonsters:battle_skill_used')
      .map(event => event.payload.action);
    const result = this.sanitizePublicMatchResult(match);
    const replayVersion = this.normalizeReplayRulesVersion(
      match.rulesVersion,
      this.rulesVersion
    );
    return {
      battleId,
      matchId: match.matchId,
      rulesVersion: replayVersion,
      replayVersion,
      cursor: nextCursor,
      hasMore,
      result,
      season: result?.season || null,
      actions,
      statuses: actions.map(action => ({
        round: action.round,
        sequence: action.sequence,
        actorSlot: action.actorSlot,
        targetSlot: action.targetSlot,
        statusEffects: action.statusEffects,
        actorState: action.actorState,
        targetState: action.targetState
      })),
      decisions: events
        .filter(event => event.type === 'streammonsters:battle_choice_locked')
        .map(event => event.payload.decision),
      reveals: events
        .filter(event => event.type === 'streammonsters:battle_choices_revealed')
        .map(event => event.payload),
      progression: events.filter(event => [
        'streammonsters:monster_xp_awarded',
        'streammonsters:monster_level_up',
        'streammonsters:monster_stat_prompt',
        'streammonsters:monster_stat_chosen',
        'streammonsters:monster_stat_auto_assigned'
      ].includes(event.type)),
      ratingChanges: events
        .filter(event => event.type === 'streammonsters:arena_rating_changed')
        .map(event => event.payload),
      events
    };
  }

  sanitizePublicMatchResult(match) {
    if (!match?.result) return null;
    const season = match.result.season && typeof match.result.season === 'object'
      ? {
          seasonId: String(match.result.season.seasonId || '').slice(0, 80),
          startsAtMs: Math.max(0, Number(match.result.season.startsAtMs) || 0),
          endsAtMs: Math.max(0, Number(match.result.season.endsAtMs) || 0),
          durationDays: ARENA_DURATION_PRESETS.includes(
            Number(match.result.season.durationDays)
          )
            ? Number(match.result.season.durationDays)
            : this.seasonDurationDays
        }
      : null;
    const winner = match.participants.find(participant => (
      participant.lockedMonsterId === match.winnerMonsterId
    ));
    const persistedWinner = match.result.winner &&
      typeof match.result.winner === 'object'
      ? this.sanitizePublicMonster(match.result.winner)
      : null;
    const forfeited = match.result.forfeitedParticipantId
      ? match.participants.find(participant => (
          participant.participantId === match.result.forfeitedParticipantId
        ))
      : null;
    const terminalReason = [
      'knockout',
      'double_knockout',
      'forfeit'
    ].includes(match.result.terminalReason)
      ? match.result.terminalReason
      : null;
    const knockout = terminalReason === 'knockout'
      ? {
          round: Math.max(1, Math.round(Number(match.result.knockout?.round) || 1)),
          remainingHp: Math.max(
            0,
            Math.round(Number(match.result.knockout?.remainingHp) || 0)
          ),
          maxHp: Math.max(1, Math.round(Number(match.result.knockout?.maxHp) || 1))
        }
      : null;
    const combatReport = match.result.combatReport &&
      typeof match.result.combatReport === 'object'
      ? sanitizeCombatReport(match.result.combatReport)
      : null;
    return {
      winnerSlot: winner?.slot || 0,
      winner: persistedWinner || (winner
        ? this.projectPublicMonster(
            winner,
            this.store.getMonster(winner.lockedMonsterId)
          )
        : null),
      completion: match.result.completion === 'forfeit' ? 'forfeit' : 'battle',
      forfeitedSlot: forfeited?.slot || null,
      ...(terminalReason ? { terminalReason, knockout } : {}),
      ...(combatReport ? { combatReport } : {}),
      season,
      participants: Array.isArray(match.result.participants)
        ? match.result.participants.map(result => ({
            slot: Number(result?.slot) || 0,
            xpAwarded: Math.max(0, Number(result?.xpAwarded) || 0),
            arenaEligible: Boolean(result?.arenaEligible),
            rating: {
              before: Math.max(0, Math.round(Number(result?.rating?.before) || 0)),
              after: Math.max(0, Math.round(Number(result?.rating?.after) || 0)),
              delta: Math.round(Number(result?.rating?.delta) || 0)
            }
          }))
        : []
    };
  }

  getPublicLegacyReplay(battle) {
    let sequence = 0;
    const replayVersion = this.normalizeReplayRulesVersion(
      battle.rulesVersion,
      3
    );
    const participants = [
      { lockedMonsterId: battle.monster_a_id, slot: 1 },
      { lockedMonsterId: battle.monster_b_id, slot: 2 }
    ];
    const match = {
      matchId: null,
      rulesVersion: replayVersion,
      participants
    };
    const actions = (battle.rounds || []).flatMap(round => (
      Array.isArray(round.actions) ? round.actions.map(action => {
        sequence += 1;
        return this.projectPublicAction({
          ...action,
          round: action.round || round.round || null,
          sequence
        }, match, sequence);
      }) : []
    ));
    return {
      battleId: battle.battle_id,
      matchId: null,
      rulesVersion: replayVersion,
      replayVersion,
      winnerSlot: battle.winner_monster_id === battle.monster_a_id ? 1 : 2,
      cursor: actions.at(-1)?.eventSequence || 0,
      hasMore: false,
      actions,
      decisions: [],
      events: actions.map(action => ({
        sequence: action.eventSequence,
        eventId: `legacy:${battle.battle_id}:event:${action.eventSequence}`,
        correlationId: `legacy:${battle.battle_id}`,
        type: 'streammonsters:battle_skill_used',
        payload: { matchId: null, round: action.round, action }
      }))
    };
  }

  getPublicNormalizedReplay(battleOrMatchId, cursor = 0, limit = 50) {
    const directMatch = this.getMatch(battleOrMatchId);
    if (directMatch) {
      return this.getPublicMatchReplay(
        directMatch,
        `battle-${directMatch.matchId}`,
        cursor,
        limit
      );
    }
    const battle = this.store.getBattle(battleOrMatchId);
    if (!battle) return null;
    if (battle.match_id) {
      const match = this.getMatch(battle.match_id);
      return match
        ? this.getPublicMatchReplay(match, battle.battle_id, cursor, limit)
        : null;
    }
    return this.getPublicLegacyReplay(battle);
  }

  normalizeReplayRulesVersion(value, fallback = 3) {
    const version = Number(value);
    if (Number.isInteger(version) && version >= 3 && version <= this.rulesVersion) {
      return version;
    }
    const normalizedFallback = Number(fallback);
    return Number.isInteger(normalizedFallback) && normalizedFallback >= 3
      ? Math.min(normalizedFallback, this.rulesVersion)
      : 3;
  }

  getNormalizedReplay(battleOrMatchId, cursor = 0, limit = 50) {
    return this.getPublicNormalizedReplay(battleOrMatchId, cursor, limit);
  }

  projectSnapshotChoiceState(match) {
    if (!match?.matchId || match.state !== 'action') {
      return { choiceLocks: [] };
    }
    const choiceLocks = this.db.prepare(`
      SELECT decision.window_sequence AS round_number,
             participant.slot,
             decision.source
      FROM streammonsters_match_decisions decision
      JOIN streammonsters_match_participants participant
        ON participant.match_id = decision.match_id
       AND participant.participant_id = decision.participant_id
      WHERE decision.match_id = ?
        AND decision.window_kind = 'action'
        AND decision.window_sequence = ?
      ORDER BY participant.slot
    `).all(match.matchId, match.roundNumber).map(decision => ({
      round: Math.max(1, Number(decision.round_number) || match.roundNumber),
      slot: Number(decision.slot) || 0,
      locked: true,
      source: decision.source === 'timeout' ? 'timeout' : 'viewer',
      deadlineMs: Math.max(0, Number(match.actionDeadlineMs) || 0)
    })).filter(decision => [1, 2].includes(decision.slot));

    const state = { choiceLocks };
    if (match.actionDeadlineMs != null) return state;
    const reveal = this.db.prepare(`
      SELECT public_payload_json
      FROM streammonsters_match_events
      WHERE match_id = ?
        AND event_type = 'streammonsters:battle_choices_revealed'
      ORDER BY sequence DESC
      LIMIT 1
    `).get(match.matchId);
    const payload = parseJson(reveal?.public_payload_json, {});
    const choices = projectBattleChoices(payload.choices);
    const round = Math.max(0, Number(payload.round) || 0);
    if (
      choices.length === 2 &&
      round > 0 &&
      round >= Math.max(1, match.roundNumber - 1)
    ) {
      state.revealedChoices = { round, choices };
    }
    return state;
  }

  projectActiveStatPrompt() {
    const prompt = this.db.prepare(`
      SELECT 'match' AS prompt_kind,
             prompt_id,
             match_id,
             participant_id,
             viewer_id,
             monster_id,
             deadline_ms,
             created_at_ms
      FROM streammonsters_stat_prompts
      WHERE status = 'open' AND deadline_ms > ?
      UNION ALL
      SELECT 'standalone' AS prompt_kind,
             prompt_id,
             NULL AS match_id,
             NULL AS participant_id,
             viewer_id,
             monster_id,
             deadline_ms,
             created_at_ms
      FROM streammonsters_stat_allocations
      WHERE status = 'open' AND deadline_ms > ?
      ORDER BY created_at_ms, prompt_id
      LIMIT 1
    `).get(this.now(), this.now());
    if (!prompt) return null;
    const match = prompt.match_id ? this.getMatch(prompt.match_id) : null;
    const participant = match?.participants.find(candidate => (
      candidate.participantId === prompt.participant_id
    ));
    const monster = this.store.getMonster(prompt.monster_id);
    if (!monster) return null;
    const publicParticipant = {
      viewerId: prompt.viewer_id,
      slot: Number(participant?.slot) || 0
    };
    return {
      promptId: String(prompt.prompt_id),
      ...(prompt.match_id ? { matchId: String(prompt.match_id) } : {}),
      ...(publicParticipant.slot ? { slot: publicParticipant.slot } : {}),
      deadlineMs: Math.max(0, Number(prompt.deadline_ms) || 0),
      choices: ['1', '2', '3', '4'],
      ...this.statChoiceContext({
        userId: prompt.viewer_id,
        participant: publicParticipant,
        monster
      })
    };
  }

  getPublicSnapshot({ restoreReconnect = false } = {}) {
    const matchIds = this.db.prepare(`
      SELECT match_id FROM streammonsters_matches
      WHERE state IN ('roster', 'action', 'finalizing')
      ORDER BY created_at_ms, match_id
    `).all();
    if (restoreReconnect) {
      matchIds.forEach(({ match_id: matchId }) => {
        const match = this.getMatch(matchId);
        if (match?.chargePauseReason === 'reconnect') {
          this.resumeChargeClock(matchId, this.now());
        }
      });
    }
    const snapshot = {
      rulesVersion: this.rulesVersion,
      gameplayPace: this.gameplayPace,
      portraitBattleMode: this.portraitBattleMode,
      matches: matchIds.map(({ match_id: matchId }) => {
        const match = this.getMatch(matchId);
        const cursor = this.db.prepare(`
          SELECT COALESCE(MAX(sequence), 0) AS cursor
          FROM streammonsters_match_events WHERE match_id = ?
        `).get(matchId).cursor;
        const chargeWindow = this.chargeWindow(match);
        return {
          matchId,
          rulesVersion: match.rulesVersion,
          state: match.state,
          roundNumber: match.roundNumber,
          rosterDeadlineMs: match.rosterDeadlineMs,
          actionDeadlineMs: match.actionDeadlineMs,
          cursor,
          ...(chargeWindow ? { chargeWindow } : {}),
          ...this.projectSnapshotChoiceState(match),
          fighters: this.projectPublicFighters(match)
        };
      })
    };
    const statPrompt = this.projectActiveStatPrompt();
    if (statPrompt) snapshot.statPrompt = statPrompt;
    return snapshot;
  }

  appendEvent(matchId, eventType, payload, publicPayload = payload) {
    const sequence = this.db.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS next
      FROM streammonsters_match_events WHERE match_id = ?
    `).get(matchId).next;
    const eventId = `${matchId}:event:${sequence}`;
    const persistedPublicPayload = typeof publicPayload === 'function'
      ? publicPayload({ eventId, sequence })
      : publicPayload;
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
      JSON.stringify(persistedPublicPayload),
      this.now()
    );
    this.emitAfterCommit(eventType, {
      ...persistedPublicPayload,
      eventId,
      correlationId: matchId,
      sequence
    });
    const publicAction = persistedPublicPayload?.action;
    const diagnostic = {
      matchId,
      round: persistedPublicPayload?.round ?? publicAction?.round,
      slot: persistedPublicPayload?.decision?.slot ??
        persistedPublicPayload?.slot ??
        publicAction?.actorSlot,
      eventType,
      sequence
    };
    if (eventType === 'streammonsters:battle_choice_locked') {
      this.logBattleDiagnostic('choice_lock', diagnostic);
    } else if (eventType === 'streammonsters:battle_special_charged') {
      this.logBattleDiagnostic('charge_transition', diagnostic);
    } else if (eventType === 'streammonsters:battle_skill_used') {
      this.logBattleDiagnostic('action_start', diagnostic);
      this.logBattleDiagnostic('action_end', diagnostic);
    } else if ([
      'streammonsters:battle_match_found',
      'streammonsters:battle_choice_opened',
      'streammonsters:battle_completed'
    ].includes(eventType)) {
      this.logBattleDiagnostic('phase', diagnostic);
    }
    return { eventId, sequence };
  }

  deterministicTimeoutChoice(match, participant) {
    const charge = this.isRulesV7(match)
      ? this.projectParticipantCharge(participant, match, match.actionDeadlineMs)
      : participant.combatState?.charge;
    const state = { charge: Number(charge) || 0 };
    const choices = this.isDefenseLocked(match)
      ? (state.charge >= 100 ? ['A', 'C'] : ['A'])
      : (state.charge >= 100 ? ['A', 'B', 'C'] : ['A', 'B']);
    const personality = participant.roster?.personality || 'Adaptive';
    return choices[this.hashNumber(
      `${match.seed}:${match.roundNumber}:${participant.participantId}:${personality}`
    ) % choices.length];
  }

  cancelRosterMatch(match, reason = 'roster_unavailable') {
    const nowMs = this.now();
    const changed = this.db.prepare(`
      UPDATE streammonsters_matches
      SET state = 'cancelled',
          phase_version = phase_version + 1,
          roster_deadline_ms = NULL,
          action_deadline_ms = NULL,
          completed_at_ms = ?,
          updated_at_ms = ?
      WHERE match_id = ? AND state = 'roster' AND phase_version = ?
    `).run(nowMs, nowMs, match.matchId, match.phaseVersion);
    if (!changed.changes) return false;
    this.db.prepare(`
      UPDATE streammonsters_match_participants SET active = 0 WHERE match_id = ?
    `).run(match.matchId);
    this.appendEvent(
      match.matchId,
      'streammonsters:battle_cancelled',
      { matchId: match.matchId, reason },
      { matchId: match.matchId, reason }
    );
    return true;
  }

  getQueueDodgeStatus(userId, nowMs = this.now()) {
    const row = this.db.prepare(`
      SELECT * FROM streammonsters_queue_dodges WHERE viewer_id = ?
    `).get(userId);
    if (!row) {
      return {
        dodgeCount: 0,
        cooldownUntilMs: 0,
        windowStartedMs: nowMs
      };
    }
    if (
      nowMs - Number(row.window_started_ms) >= DODGE_WINDOW_MS &&
      Number(row.cooldown_until_ms) <= nowMs
    ) {
      this.db.prepare(`
        DELETE FROM streammonsters_queue_dodges WHERE viewer_id = ?
      `).run(userId);
      return {
        dodgeCount: 0,
        cooldownUntilMs: 0,
        windowStartedMs: nowMs
      };
    }
    return {
      dodgeCount: Math.max(0, Number(row.dodge_count) || 0),
      cooldownUntilMs: Math.max(0, Number(row.cooldown_until_ms) || 0),
      windowStartedMs: Number(row.window_started_ms) || nowMs
    };
  }

  recordQueueDodge(userId, nowMs = this.now(), { forceCooldown = false } = {}) {
    const current = this.getQueueDodgeStatus(userId, nowMs);
    const withinWindow = nowMs - current.windowStartedMs < DODGE_WINDOW_MS;
    const dodgeCount = withinWindow ? current.dodgeCount + 1 : 1;
    const windowStartedMs = withinWindow ? current.windowStartedMs : nowMs;
    const cooldownUntilMs = forceCooldown || dodgeCount >= DODGE_THRESHOLD
      ? Math.max(current.cooldownUntilMs, nowMs + DODGE_COOLDOWN_MS)
      : current.cooldownUntilMs;
    this.db.prepare(`
      INSERT INTO streammonsters_queue_dodges (
        viewer_id, window_started_ms, dodge_count, cooldown_until_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(viewer_id) DO UPDATE SET
        window_started_ms = excluded.window_started_ms,
        dodge_count = excluded.dodge_count,
        cooldown_until_ms = excluded.cooldown_until_ms,
        updated_at_ms = excluded.updated_at_ms
    `).run(
      userId,
      windowStartedMs,
      dodgeCount,
      cooldownUntilMs,
      nowMs
    );
    return { dodgeCount, cooldownUntilMs, windowStartedMs };
  }

  leave({ userId }) {
    if (!userId) return { status: 'invalid', error: 'viewer_required' };
    return this.store.runInImmediateTransaction(() => {
      const match = this.getActiveMatchForViewer(userId);
      if (match) {
        const participant = match.participants.find(entry => entry.viewerId === userId);
        if (
          match.state === 'roster' &&
          participant &&
          !participant.lockedMonsterId
        ) {
          const cancelled = this.cancelRosterMatch(
            match,
            'viewer_left_before_roster_lock'
          );
          if (!cancelled) return { status: 'active', match: this.getMatch(match.matchId) };
          const dodge = this.recordQueueDodge(userId);
          return {
            status: 'cancelled',
            matchId: match.matchId,
            rewarded: false,
            cooldownUntilMs: dodge.cooldownUntilMs
          };
        }
        if (
          participant?.lockedMonsterId &&
          ['roster', 'action'].includes(match.state)
        ) {
          const result = this.forfeitLockedMatch(match, participant);
          if (result.status !== 'forfeited') return result;
          const dodge = this.recordQueueDodge(
            userId,
            this.now(),
            { forceCooldown: true }
          );
          return {
            ...result,
            retryAfterMs: Math.max(0, dodge.cooldownUntilMs - this.now()),
            cooldownUntilMs: dodge.cooldownUntilMs
          };
        }
        return { status: 'active', match };
      }
      const removed = this.store.removeBattleQueueEntry(userId);
      if (!removed) return { status: 'not_queued' };
      const dodge = this.recordQueueDodge(userId);
      if (dodge.cooldownUntilMs > this.now()) {
        return {
          status: 'cooldown',
          retryAfterMs: dodge.cooldownUntilMs - this.now(),
          cooldownUntilMs: dodge.cooldownUntilMs
        };
      }
      return {
        status: 'left_queue',
        dodgeCount: dodge.dodgeCount
      };
    });
  }

  forfeitLockedMatch(match, forfeitedParticipant) {
    let current = this.getMatch(match.matchId);
    if (!current || !['roster', 'action'].includes(current.state)) {
      return { status: 'active', match: current };
    }
    if (current.state === 'roster') {
      for (const participant of current.participants.filter(entry => (
        !entry.lockedMonsterId
      ))) {
        const selected = this.store.getSelectedMonster(participant.viewerId);
        const queued = this.store.getMonster(participant.queuedMonsterId);
        const selectedEligible = selected?.user_id === participant.viewerId &&
          this.rosterEligibility(current, participant, selected).accepted;
        const monster = selectedEligible
          ? selected
          : queued?.user_id === participant.viewerId
            ? queued
            : null;
        if (!monster) {
          this.cancelRosterMatch(current, 'forfeit_opponent_missing');
          return {
            status: 'cancelled',
            matchId: current.matchId,
            rewarded: false
          };
        }
        this.db.prepare(`
          UPDATE streammonsters_match_participants
          SET locked_monster_id = ?, roster_json = ?
          WHERE match_id = ? AND participant_id = ? AND locked_monster_id IS NULL
        `).run(
          monster.monster_id,
          JSON.stringify(this.snapshotMonster(monster)),
          current.matchId,
          participant.participantId
        );
      }
      current = this.startActionWindow(current.matchId, current.phaseVersion);
    }
    const loser = current.participants.find(entry => (
      entry.participantId === forfeitedParticipant.participantId
    ));
    const winner = current.participants.find(entry => (
      entry.participantId !== forfeitedParticipant.participantId
    ));
    if (!loser?.lockedMonsterId || !winner?.lockedMonsterId) {
      return { status: 'active', match: current };
    }
    const completed = this.finalize(
      current.matchId,
      current.phaseVersion,
      winner.lockedMonsterId,
      {
        completion: 'forfeit',
        forfeitedParticipantId: loser.participantId
      }
    );
    return {
      status: 'forfeited',
      matchId: current.matchId,
      winnerSlot: winner.slot,
      match: completed
    };
  }

  cancelBeforeBattle(userId) {
    if (!userId) return { cancelled: false, reason: 'viewer_required' };
    return this.store.runInImmediateTransaction(() => {
      const match = this.getActiveMatchForViewer(userId);
      if (!match || match.state !== 'roster') {
        return { cancelled: false, reason: 'no_roster_match' };
      }
      const cancelled = this.cancelRosterMatch(match, 'viewer_left_before_start');
      return cancelled
        ? { cancelled: true, matchId: match.matchId }
        : { cancelled: false, reason: 'match_already_started' };
    });
  }

  getStaleMatchCandidates({
    nowMs = this.now(),
    graceMs = 60_000
  } = {}) {
    const cutoffMs = nowMs - Math.max(0, Number(graceMs) || 0);
    return this.db.prepare(`
      SELECT match_id, state, phase_version
      FROM streammonsters_matches
      WHERE (
        state = 'roster' AND roster_deadline_ms IS NOT NULL AND roster_deadline_ms <= ?
      ) OR (
        state = 'action' AND action_deadline_ms IS NOT NULL AND action_deadline_ms <= ?
      )
      ORDER BY updated_at_ms, match_id
    `).all(cutoffMs, cutoffMs);
  }

  repairStaleMatches({
    dryRun = true,
    graceMs = 60_000
  } = {}) {
    const candidates = this.getStaleMatchCandidates({ graceMs });
    if (dryRun || !candidates.length) {
      return { dryRun: Boolean(dryRun), candidates: candidates.length, cancelled: 0 };
    }
    let cancelled = 0;
    candidates.forEach(candidate => {
      const repaired = this.store.runInImmediateTransaction(() => {
        const nowMs = this.now();
        const changed = this.db.prepare(`
          UPDATE streammonsters_matches
          SET state = 'cancelled',
              phase_version = phase_version + 1,
              roster_deadline_ms = NULL,
              action_deadline_ms = NULL,
              completed_at_ms = ?,
              updated_at_ms = ?
          WHERE match_id = ? AND state = ? AND phase_version = ?
        `).run(
          nowMs,
          nowMs,
          candidate.match_id,
          candidate.state,
          candidate.phase_version
        );
        if (!changed.changes) return false;
        this.db.prepare(`
          UPDATE streammonsters_match_participants SET active = 0 WHERE match_id = ?
        `).run(candidate.match_id);
        this.appendEvent(
          candidate.match_id,
          'streammonsters:battle_cancelled',
          {
            matchId: candidate.match_id,
            reason: 'creator_repair_stale'
          },
          {
            matchId: candidate.match_id,
            reason: 'creator_repair_stale'
          }
        );
        return true;
      });
      if (repaired) cancelled += 1;
    });
    return { dryRun: false, candidates: candidates.length, cancelled };
  }

  recoverRosterMatch(matchId, nowMs = this.now()) {
    return this.store.runInImmediateTransaction(() => {
      const match = this.getMatch(matchId);
      if (!match || match.state !== 'roster' || match.rosterDeadlineMs > nowMs) return false;
      for (const participant of match.participants.filter(entry => !entry.lockedMonsterId)) {
        const selected = this.store.getSelectedMonster(participant.viewerId);
        const queued = this.store.getMonster(participant.queuedMonsterId);
        const selectedEligible = selected?.user_id === participant.viewerId &&
          this.rosterEligibility(match, participant, selected).accepted;
        const monster = selectedEligible
          ? selected
          : queued?.user_id === participant.viewerId
            ? queued
            : null;
        if (!monster) {
          this.cancelRosterMatch(match, 'roster_monster_missing');
          return true;
        }
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
      }
      this.startActionWindow(matchId, match.phaseVersion);
      return true;
    });
  }

  recoverActionMatch(matchId, nowMs = this.now()) {
    return this.store.runInImmediateTransaction(() => {
      const match = this.getMatch(matchId);
      if (
        !match ||
        match.state !== 'action' ||
        match.actionDeadlineMs > nowMs ||
        (
          match.chargePauseReason === 'reconnect' &&
          match.chargePauseStartedAtMs != null
        )
      ) {
        return false;
      }
      match.participants.forEach(participant => {
        const existing = this.db.prepare(`
          SELECT 1 FROM streammonsters_match_decisions
          WHERE match_id = ? AND participant_id = ?
            AND window_kind = 'action' AND window_sequence = ?
        `).get(matchId, participant.participantId, match.roundNumber);
        if (existing) return;
        const choice = this.deterministicTimeoutChoice(match, participant);
        const providerEventId = `${matchId}:timeout:${match.roundNumber}:${participant.participantId}`;
        this.db.prepare(`
          INSERT INTO streammonsters_match_decisions (
            match_id, participant_id, window_kind, window_sequence, choice,
            requested_choice, source, event_id, charge_at_choice, created_at_ms
          ) VALUES (?, ?, 'action', ?, ?, ?, 'timeout', ?, ?, ?)
        `).run(
          matchId,
          participant.participantId,
          match.roundNumber,
          choice,
          choice,
          providerEventId,
          this.isRulesV7(match)
            ? this.projectParticipantCharge(participant, match, match.actionDeadlineMs)
            : null,
          this.isRulesV7(match) ? match.actionDeadlineMs : nowMs
        );
        this.appendDecisionEvent(match, participant, {
          choice,
          source: 'timeout',
          providerEventId
        });
      });
      this.resolveRound(matchId, match.phaseVersion);
      return true;
    });
  }

  resumeCinematicChoiceWindow(matchId, nowMs = this.now()) {
    return this.store.runInImmediateTransaction(() => {
      const match = this.getMatch(matchId);
      if (
        !this.isRulesV7(match) ||
        match?.state !== 'action' ||
        match.actionDeadlineMs != null ||
        match.chargePauseReason !== 'cinematic' ||
        Number(match.chargePauseUntilMs) > nowMs
      ) {
        return false;
      }
      const deadlineMs = nowMs + this.actionWindowMs(match);
      const changed = this.db.prepare(`
        UPDATE streammonsters_matches
        SET action_opened_at_ms = ?,
            action_deadline_ms = ?,
            charge_paused_ms = 0,
            charge_pause_started_at_ms = NULL,
            charge_pause_until_ms = NULL,
            charge_pause_reason = NULL,
            updated_at_ms = ?
        WHERE match_id = ? AND state = 'action'
          AND action_deadline_ms IS NULL
          AND charge_pause_reason = 'cinematic'
      `).run(nowMs, deadlineMs, nowMs, matchId);
      if (!changed.changes) return false;
      const opened = this.getMatch(matchId);
      const chargeWindow = this.chargeWindow(opened);
      const payload = {
        matchId,
        round: opened.roundNumber,
        deadlineMs,
        choices: this.actionPromptChoices(opened),
        ...(chargeWindow ? { chargeWindow } : {})
      };
      this.appendEvent(
        matchId,
        'streammonsters:battle_choice_opened',
        payload,
        {
          ...payload,
          fighters: this.projectPublicFighters(opened)
        }
      );
      return true;
    });
  }

  recoverStatPrompt(promptId, nowMs = this.now()) {
    return this.store.runInImmediateTransaction(() => {
      const prompt = this.db.prepare(`
        SELECT * FROM streammonsters_stat_prompts
        WHERE prompt_id = ? AND status = 'open' AND deadline_ms <= ?
      `).get(promptId, nowMs);
      if (!prompt) return false;
      const stats = ['vitality', 'might', 'guard', 'agility'];
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
      if (applied.applied) {
        const participant = this.getMatch(prompt.match_id)?.participants.find(entry => (
          entry.participantId === prompt.participant_id
        ));
        this.appendEvent(
          prompt.match_id,
          'streammonsters:monster_stat_auto_assigned',
          {
            matchId: prompt.match_id,
            slot: Number(participant?.slot) || 0,
            stat,
            source: 'timeout',
            ...this.statChoiceContext({
              userId: prompt.viewer_id,
              participant,
              monster: applied.monster
            })
          }
        );
        this.ensurePendingStatAllocations();
      }
      return true;
    });
  }

  recoverStandaloneStatAllocation(promptId, nowMs = this.now()) {
    return this.store.runInImmediateTransaction(() => {
      const prompt = this.db.prepare(`
        SELECT * FROM streammonsters_stat_allocations
        WHERE prompt_id = ? AND status = 'open' AND deadline_ms <= ?
      `).get(promptId, nowMs);
      if (!prompt) return false;
      const stats = ['vitality', 'might', 'guard', 'agility'];
      const stat = stats[this.hashNumber(
        `${prompt.source_key}:${prompt.monster_id}:stat-timeout`
      ) % stats.length];
      const applied = this.store.applyMonsterStatPoint({
        userId: prompt.viewer_id,
        monsterId: prompt.monster_id,
        stat
      });
      const eventId = `${prompt.prompt_id}:timeout`;
      this.db.prepare(`
        UPDATE streammonsters_stat_allocations
        SET status = ?, choice = ?, event_id = ?, claimed_at_ms = ?
        WHERE prompt_id = ? AND status = 'open'
      `).run(
        applied.applied ? 'claimed' : 'expired',
        stat,
        eventId,
        nowMs,
        prompt.prompt_id
      );
      if (applied.applied) {
        this.emitAfterCommit('streammonsters:monster_stat_auto_assigned', {
          promptId: prompt.prompt_id,
          stat,
          source: 'timeout',
          ...this.statChoiceContext({
            userId: prompt.viewer_id,
            monster: applied.monster
          })
        });
        if ((Number(applied.monster?.unspent_stat_points) || 0) > 0) {
          this.createStandaloneStatPrompt({
            userId: prompt.viewer_id,
            monsterId: prompt.monster_id,
            sourceKey: `${prompt.source_key}:next`
          });
        }
        this.ensurePendingStatAllocations();
      }
      return true;
    });
  }

  ensurePendingStatAllocations() {
    if (this.hasOpenStatWindow()) return 0;
    const candidates = this.db.prepare(`
      SELECT monster_id, user_id
      FROM streammonsters_monsters monster
      WHERE unspent_stat_points > 0
        AND NOT EXISTS (
          SELECT 1 FROM streammonsters_stat_prompts prompt
          WHERE prompt.monster_id = monster.monster_id AND prompt.status = 'open'
        )
        AND NOT EXISTS (
          SELECT 1 FROM streammonsters_stat_allocations allocation
          WHERE allocation.monster_id = monster.monster_id AND allocation.status = 'open'
        )
      ORDER BY created_at_ms, monster_id
    `).all();
    let opened = 0;
    for (const candidate of candidates) {
      if (this.createStandaloneStatPrompt({
        userId: candidate.user_id,
        monsterId: candidate.monster_id,
        sourceKey: 'recovered-unspent'
      })) {
        opened += 1;
        break;
      }
    }
    return opened;
  }

  sweep() {
    const nowMs = this.now();
    const streamKey = this.currentStreamKey();
    const result = {
      matchesReserved: 0,
      rostersAutoLocked: 0,
      rosterExpired: 0,
      actionsExpired: 0,
      statsExpired: 0,
      allocationsExpired: 0,
      allocationsOpened: 0,
      cinematicsResumed: 0,
      specialReady: 0,
      errors: 0
    };
    result.queuePurged = this.store.purgeBattleQueue(
      nowMs - BATTLE_QUEUE_TTL_MS,
      streamKey
    );
    const recover = (kind, id, operation) => {
      try {
        if (operation()) result[kind] += 1;
      } catch (error) {
        result.errors += 1;
        this.reportError(`battle recovery ${id}`, error);
      }
    };
    this.db.prepare(`
      SELECT match_id FROM streammonsters_matches
      WHERE state = 'roster' AND rules_version >= 8
      ORDER BY created_at_ms, match_id
    `).all().forEach(({ match_id: matchId }) => {
      try {
        const before = this.getMatch(matchId)?.participants
          .filter(participant => participant.lockedMonsterId).length || 0;
        const recovered = this.autoLockSoleEligibleRosters(matchId);
        const after = recovered?.participants
          .filter(participant => participant.lockedMonsterId).length || 0;
        result.rostersAutoLocked += Math.max(0, after - before);
      } catch (error) {
        result.errors += 1;
        this.reportError(`battle sole-roster recovery ${matchId}`, error);
      }
    });
    this.db.prepare(`
      SELECT match_id FROM streammonsters_matches
      WHERE state = 'roster' AND roster_deadline_ms <= ?
      ORDER BY roster_deadline_ms, match_id
    `).all(nowMs).forEach(({ match_id: matchId }) => {
      recover('rosterExpired', matchId, () => this.recoverRosterMatch(matchId, nowMs));
    });
    this.db.prepare(`
      SELECT match_id FROM streammonsters_matches
      WHERE state = 'action'
        AND action_deadline_ms IS NULL
        AND charge_pause_reason = 'cinematic'
        AND charge_pause_until_ms <= ?
      ORDER BY charge_pause_until_ms, match_id
    `).all(nowMs).forEach(({ match_id: matchId }) => {
      recover(
        'cinematicsResumed',
        matchId,
        () => this.resumeCinematicChoiceWindow(matchId, nowMs)
      );
    });
    this.db.prepare(`
      SELECT match_id FROM streammonsters_matches
      WHERE state = 'action' AND action_deadline_ms <= ?
        AND NOT (
          charge_pause_reason = 'reconnect' AND charge_pause_started_at_ms IS NOT NULL
        )
      ORDER BY action_deadline_ms, match_id
    `).all(nowMs).forEach(({ match_id: matchId }) => {
      recover('actionsExpired', matchId, () => this.recoverActionMatch(matchId, nowMs));
    });
    this.db.prepare(`
      SELECT match_id FROM streammonsters_matches
      WHERE state = 'action' AND action_deadline_ms > ?
      ORDER BY action_deadline_ms, match_id
    `).all(nowMs).forEach(({ match_id: matchId }) => {
      try {
        result.specialReady += this.emitSpecialReadyTransitions(
          this.getMatch(matchId),
          nowMs
        );
      } catch (error) {
        result.errors += 1;
        this.reportError(`battle ready transition ${matchId}`, error);
      }
    });
    this.db.prepare(`
      SELECT prompt_id FROM streammonsters_stat_prompts
      WHERE status = 'open' AND deadline_ms <= ?
      ORDER BY deadline_ms, prompt_id
    `).all(nowMs).forEach(({ prompt_id: promptId }) => {
      recover('statsExpired', promptId, () => this.recoverStatPrompt(promptId, nowMs));
    });
    this.db.prepare(`
      SELECT prompt_id FROM streammonsters_stat_allocations
      WHERE status = 'open' AND deadline_ms <= ?
      ORDER BY deadline_ms, prompt_id
    `).all(nowMs).forEach(({ prompt_id: promptId }) => {
      recover(
        'allocationsExpired',
        promptId,
        () => this.recoverStandaloneStatAllocation(promptId, nowMs)
      );
    });
    result.allocationsOpened = this.ensurePendingStatAllocations();
    while (true) {
      const queue = this.store.getBattleQueue().filter(entry => (
        (String(entry.stream_key || '').trim() || null) === streamKey
      ));
      let reserved = null;
      for (const entry of queue) {
        reserved = this.store.runInImmediateTransaction(() => (
          this.reserveBestMatch(entry.user_id)
        ));
        if (reserved) break;
      }
      if (!reserved) break;
      result.matchesReserved += 1;
    }
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
module.exports.projectSpecialAvailability = projectSpecialAvailability;
module.exports.ROSTER_WINDOW_MS = ROSTER_WINDOW_MS;
module.exports.ACTION_WINDOW_MS = ACTION_WINDOW_MS;
module.exports.STAT_WINDOW_MS = STAT_WINDOW_MS;
module.exports.REMATCH_AVOIDANCE_MS = REMATCH_AVOIDANCE_MS;
module.exports.MATCH_WIDEN_INTERVAL_MS = MATCH_WIDEN_INTERVAL_MS;
module.exports.ARENA_K = ARENA_K;
module.exports.ARENA_START_RATING = ARENA_START_RATING;
module.exports.ARENA_DURATION_PRESETS = ARENA_DURATION_PRESETS;
module.exports.ARENA_TIERS = ARENA_TIERS;
