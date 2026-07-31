const { randomUUID } = require('crypto');
const EggStageProjector = require('./egg-stage-projector');

const DEFAULT_GRACE_SECONDS = 600;
const DEFAULT_ACTIVITY_WINDOW_SECONDS = 300;
const MAXIMUM_SECONDS = 86_400;

function normalizeSeconds(value, fallback, minimum = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(MAXIMUM_SECONDS, Math.floor(numeric)));
}

function normalizeText(value, maximum = 256) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maximum) : null;
}

class UnhatchedEggStealService {
  constructor({
    store,
    progression = null,
    emit = () => {},
    now = () => Date.now(),
    logger = null,
    isViewerActive = () => false,
    config = {}
  } = {}) {
    if (!store?.db?.prepare) {
      throw new Error('STREAM_MONSTERS_STEAL_STORE_REQUIRED');
    }
    this.store = store;
    this.db = store.db;
    this.progression = progression;
    this.emit = emit;
    this.now = now;
    this.logger = logger;
    this.isViewerActive = isViewerActive;
    this.eggStageProjector = new EggStageProjector({ store, now });
    this.setConfig(config, this.now(), { initialize: true });
    this.initialize();
  }

  currentMs(value = this.now()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
  }

  setConfig(config = {}, atMs = this.now(), { initialize = false } = {}) {
    const next = {
      enabled: config.unhatchedEggStealEnabled !== false,
      graceSeconds: normalizeSeconds(
        config.unhatchedEggStealGraceSeconds,
        DEFAULT_GRACE_SECONDS
      ),
      activityWindowSeconds: normalizeSeconds(
        config.unhatchedEggStealActivityWindowSeconds,
        DEFAULT_ACTIVITY_WINDOW_SECONDS,
        30
      )
    };
    const previous = this.config || null;
    this.config = next;
    if (initialize || !this.db) return this.getConfig();
    const nowMs = this.currentMs(atMs);
    let removedPublicStages = [];
    this.store.runInImmediateTransaction(() => {
      if (!next.enabled || next.graceSeconds === 0) {
        removedPublicStages = this.getPublicRows(nowMs)
          .map(row => this.projectPublicRow(row, nowMs))
          .filter(Boolean);
        this.db.prepare(`
          UPDATE streammonsters_unhatched_egg_steals
          SET status = 'closed', closed_at_ms = ?, close_reason = 'disabled'
          WHERE status IN ('pending', 'public')
        `).run(nowMs);
        return;
      }
      if (!previous?.enabled || previous.graceSeconds === 0) {
        this.scheduleReadyEggs(nowMs);
      }
      this.db.prepare(`
        UPDATE streammonsters_unhatched_egg_steals
        SET eligible_at_ms = COALESCE((
          SELECT eggs.ready_at_ms
          FROM streammonsters_eggs eggs
          WHERE eggs.egg_id = streammonsters_unhatched_egg_steals.egg_id
        ), observed_at_ms) + ?
        WHERE status = 'pending'
      `).run(next.graceSeconds * 1_000);
    });
    removedPublicStages.forEach(eggStage => {
      this.store.afterCommit(() => this.emit('streammonsters:egg_stage_removed', {
        reason: 'steal_disabled',
        eggStage,
        ...this.eggStageProjector.eventIdentity(
          'streammonsters:egg_stage_removed',
          eggStage
        )
      }));
    });
    return this.getConfig();
  }

  getConfig() {
    return {
      unhatchedEggStealEnabled: this.config.enabled,
      unhatchedEggStealGraceSeconds: this.config.graceSeconds,
      unhatchedEggStealActivityWindowSeconds: this.config.activityWindowSeconds
    };
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS streammonsters_unhatched_egg_steals (
        steal_id TEXT PRIMARY KEY,
        egg_id TEXT NOT NULL UNIQUE,
        original_owner_id TEXT NOT NULL,
        observed_at_ms INTEGER NOT NULL,
        eligible_at_ms INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'public', 'claimed', 'closed')),
        published_at_ms INTEGER,
        claimed_by_user_id TEXT,
        claimed_at_ms INTEGER,
        claim_event_id TEXT UNIQUE,
        claimed_stream_key TEXT,
        closed_at_ms INTEGER,
        close_reason TEXT,
        FOREIGN KEY (egg_id) REFERENCES streammonsters_eggs(egg_id)
      );
      CREATE INDEX IF NOT EXISTS streammonsters_unhatched_steals_eligible
        ON streammonsters_unhatched_egg_steals(status, eligible_at_ms);
      CREATE TABLE IF NOT EXISTS streammonsters_unhatched_egg_steal_events (
        event_id TEXT PRIMARY KEY,
        stream_key TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
    `);
    if (!this.config.enabled || this.config.graceSeconds === 0) return;
    const nowMs = this.currentMs();
    this.store.runInImmediateTransaction(() => this.scheduleReadyEggs(nowMs));
  }

  scheduleReadyEggs(nowMs) {
    this.db.prepare(`
      SELECT eggs.*
      FROM streammonsters_eggs eggs
      LEFT JOIN streammonsters_unhatched_egg_steals steals
        ON steals.egg_id = eggs.egg_id
      WHERE steals.egg_id IS NULL
        AND eggs.state = 'ready'
        AND eggs.monster_id IS NULL
        AND eggs.expired_at_ms IS NULL
        AND eggs.expires_at_ms > ?
      ORDER BY eggs.ready_at_ms, eggs.egg_id
    `).all(nowMs).forEach(egg => this.insertSteal(egg, nowMs));
  }

  insertSteal(egg, observedAtMs) {
    const readyAtMs = Number.isFinite(Number(egg.ready_at_ms))
      ? this.currentMs(egg.ready_at_ms)
      : observedAtMs;
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_unhatched_egg_steals (
        steal_id, egg_id, original_owner_id, observed_at_ms, eligible_at_ms, status
      ) VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(
      randomUUID(),
      egg.egg_id,
      egg.user_id,
      observedAtMs,
      readyAtMs + (this.config.graceSeconds * 1_000)
    );
    return this.getStealForEgg(egg.egg_id);
  }

  getStealForEgg(eggId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_unhatched_egg_steals WHERE egg_id = ?
    `).get(eggId) || null;
  }

  observeReadyEgg(eggId, { observedAtMs = this.now() } = {}) {
    if (!this.config.enabled || this.config.graceSeconds === 0) return null;
    const nowMs = this.currentMs(observedAtMs);
    return this.store.runInImmediateTransaction(() => {
      const existing = this.getStealForEgg(eggId);
      if (existing) return existing;
      const egg = this.db.prepare(`
        SELECT * FROM streammonsters_eggs
        WHERE egg_id = ?
          AND state = 'ready'
          AND monster_id IS NULL
          AND expired_at_ms IS NULL
          AND expires_at_ms > ?
      `).get(eggId, nowMs);
      return egg ? this.insertSteal(egg, nowMs) : null;
    });
  }

  closeUnavailable(nowMs) {
    const rows = this.db.prepare(`
      SELECT steals.*, eggs.state AS egg_state, eggs.user_id AS egg_owner_id,
        eggs.monster_id, eggs.expired_at_ms, eggs.expires_at_ms
      FROM streammonsters_unhatched_egg_steals steals
      JOIN streammonsters_eggs eggs ON eggs.egg_id = steals.egg_id
      WHERE steals.status IN ('pending', 'public')
    `).all();
    const close = this.db.prepare(`
      UPDATE streammonsters_unhatched_egg_steals
      SET status = 'closed', closed_at_ms = ?, close_reason = ?
      WHERE steal_id = ? AND status IN ('pending', 'public')
    `);
    return rows.flatMap(row => {
      const reason = row.egg_state === 'hatched' || row.monster_id
        ? 'owner_hatched'
        : row.egg_state !== 'ready' || row.expired_at_ms != null ||
            Number(row.expires_at_ms) <= nowMs
          ? 'unavailable'
          : row.egg_owner_id !== row.original_owner_id
            ? 'owner_changed'
            : null;
      return reason && close.run(nowMs, reason, row.steal_id).changes
        ? [{ ...row, status: 'closed', close_reason: reason }]
        : [];
    });
  }

  publishEligible(nowMs, isViewerActive = this.isViewerActive) {
    const candidates = this.db.prepare(`
      SELECT steals.*
      FROM streammonsters_unhatched_egg_steals steals
      JOIN streammonsters_eggs eggs ON eggs.egg_id = steals.egg_id
      WHERE steals.status = 'pending'
        AND steals.eligible_at_ms <= ?
        AND eggs.user_id = steals.original_owner_id
        AND eggs.state = 'ready'
        AND eggs.monster_id IS NULL
        AND eggs.expired_at_ms IS NULL
        AND eggs.expires_at_ms > ?
      ORDER BY eggs.expires_at_ms, steals.eligible_at_ms, steals.steal_id
    `).all(nowMs, nowMs);
    const publish = this.db.prepare(`
      UPDATE streammonsters_unhatched_egg_steals
      SET status = 'public', published_at_ms = ?
      WHERE steal_id = ? AND status = 'pending'
    `);
    return candidates.flatMap(candidate => {
      if (isViewerActive?.(candidate.original_owner_id)) return [];
      return publish.run(nowMs, candidate.steal_id).changes
        ? [this.getSteal(candidate.steal_id)]
        : [];
    });
  }

  getSteal(stealId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_unhatched_egg_steals WHERE steal_id = ?
    `).get(stealId) || null;
  }

  projectPublicRow(row, nowMs) {
    const egg = this.db.prepare(`
      SELECT eggs.* FROM streammonsters_eggs eggs WHERE eggs.egg_id = ?
    `).get(row.egg_id);
    if (!egg) return null;
    const base = this.eggStageProjector.projectEgg(egg);
    const sourceOwnerDisplayName = EggStageProjector.publicViewerName(base.displayName) || 'Viewer';
    const remainingMs = Math.max(0, Number(egg.expires_at_ms) - nowMs);
    return {
      offerType: 'steal',
      visualId: base.visualId,
      provenance: base.provenance,
      state: 'public',
      displayName: sourceOwnerDisplayName,
      sourceOwnerDisplayName,
      element: base.element,
      variant: base.variant,
      imageUrl: base.imageUrl,
      timing: {
        ...base.timing,
        publicAtMs: Number(row.published_at_ms),
        expiresAtMs: Number(egg.expires_at_ms),
        remainingMs
      },
      expiresAtMs: Number(egg.expires_at_ms),
      remainingMs,
      adoptionStatus: 'public',
      adoptable: true
    };
  }

  getPublicRows(nowMs) {
    return this.db.prepare(`
      SELECT steals.*
      FROM streammonsters_unhatched_egg_steals steals
      JOIN streammonsters_eggs eggs ON eggs.egg_id = steals.egg_id
      WHERE steals.status = 'public'
        AND eggs.user_id = steals.original_owner_id
        AND eggs.state = 'ready'
        AND eggs.monster_id IS NULL
        AND eggs.expired_at_ms IS NULL
        AND eggs.expires_at_ms > ?
      ORDER BY eggs.expires_at_ms, steals.eligible_at_ms, steals.steal_id
    `).all(nowMs);
  }

  listPublic(atMs = this.now()) {
    if (!this.config.enabled || this.config.graceSeconds === 0) return [];
    const nowMs = this.currentMs(atMs);
    return this.getPublicRows(nowMs)
      .map(row => this.projectPublicRow(row, nowMs))
      .filter(Boolean);
  }

  emitPublished(rows, nowMs) {
    rows.forEach(row => {
      const eggStage = this.projectPublicRow(row, nowMs);
      if (!eggStage) return;
      this.store.afterCommit(() => this.emit('streammonsters:unhatched_egg_steal_public', {
        eggStage,
        ...this.eggStageProjector.eventIdentity(
          'streammonsters:unhatched_egg_steal_public',
          eggStage
        )
      }));
    });
  }

  sweep({ isViewerActive = this.isViewerActive, atMs = this.now() } = {}) {
    if (!this.config.enabled || this.config.graceSeconds === 0) {
      return { published: [], closed: [] };
    }
    const nowMs = this.currentMs(atMs);
    const result = this.store.runInImmediateTransaction(() => ({
      closed: this.closeUnavailable(nowMs),
      published: this.publishEligible(nowMs, isViewerActive)
    }));
    this.emitPublished(result.published, nowMs);
    return result;
  }

  claimedRowByEvent(eventId) {
    return this.db.prepare(`
      SELECT steals.*, eggs.*
      FROM streammonsters_unhatched_egg_steals steals
      JOIN streammonsters_eggs eggs ON eggs.egg_id = steals.egg_id
      WHERE steals.claim_event_id = ? AND steals.status = 'claimed'
    `).get(eventId) || null;
  }

  claimReceiptByEvent(eventId) {
    const row = this.db.prepare(`
      SELECT result_json FROM streammonsters_unhatched_egg_steal_events
      WHERE event_id = ?
    `).get(eventId);
    if (!row) return null;
    try {
      return JSON.parse(row.result_json);
    } catch (_) {
      return null;
    }
  }

  recordClaimReceipt({ eventId, streamKey, result, createdAtMs }) {
    this.db.prepare(`
      INSERT INTO streammonsters_unhatched_egg_steal_events (
        event_id, stream_key, result_json, created_at_ms
      ) VALUES (?, ?, ?, ?)
    `).run(eventId, streamKey, JSON.stringify(result), createdAtMs);
    return result;
  }

  projectClaim(row) {
    return {
      success: true,
      status: 'claimed',
      adoptionSource: 'steal',
      stealId: row.steal_id,
      eggStage: this.eggStageProjector.projectEgg(row)
    };
  }

  steal({
    userId,
    streamKey = null,
    eventId,
    displayName = null,
    avatarRef = null,
    nowMs = this.now()
  } = {}) {
    if (!this.config.enabled || this.config.graceSeconds === 0) {
      return { success: false, status: 'disabled' };
    }
    const normalizedUserId = normalizeText(userId, 192);
    const normalizedEventId = normalizeText(eventId, 256);
    if (!normalizedUserId || !normalizedEventId) {
      return { success: false, status: 'invalid_request' };
    }
    const claimedAtMs = this.currentMs(nowMs);
    const result = this.store.runInImmediateTransaction(() => {
      const receipt = this.claimReceiptByEvent(normalizedEventId);
      if (receipt) return receipt;
      const duplicate = this.claimedRowByEvent(normalizedEventId);
      if (duplicate) return this.projectClaim(duplicate);
      this.closeUnavailable(claimedAtMs);
      const candidate = this.db.prepare(`
        SELECT steals.*, eggs.*
        FROM streammonsters_unhatched_egg_steals steals
        JOIN streammonsters_eggs eggs ON eggs.egg_id = steals.egg_id
        WHERE steals.status = 'public'
          AND eggs.user_id = steals.original_owner_id
          AND eggs.user_id != ?
          AND eggs.state = 'ready'
          AND eggs.monster_id IS NULL
          AND eggs.expired_at_ms IS NULL
          AND eggs.expires_at_ms > ?
        ORDER BY eggs.expires_at_ms, steals.eligible_at_ms, steals.steal_id
        LIMIT 1
      `).get(normalizedUserId, claimedAtMs);
      if (!candidate) return { success: false, status: 'no_steal' };
      if (this.isViewerActive?.(candidate.original_owner_id)) {
        return { success: false, status: 'owner_active' };
      }
      const safeDisplayName = [displayName, this.store.getViewerDisplayName?.(normalizedUserId)]
        .map(EggStageProjector.publicViewerName)
        .find(Boolean) || null;
      const safeAvatarRef = EggStageProjector.safeAssetReference(avatarRef);
      const transferred = this.db.prepare(`
        UPDATE streammonsters_eggs
        SET user_id = ?, display_name = ?, avatar_ref = ?
        WHERE egg_id = ?
          AND user_id = ?
          AND state = 'ready'
          AND monster_id IS NULL
          AND expired_at_ms IS NULL
          AND expires_at_ms > ?
      `).run(
        normalizedUserId,
        safeDisplayName,
        safeAvatarRef,
        candidate.egg_id,
        candidate.original_owner_id,
        claimedAtMs
      );
      if (transferred.changes !== 1) {
        throw new Error('STREAM_MONSTERS_STEAL_TRANSFER_CONFLICT');
      }
      const claimed = this.db.prepare(`
        UPDATE streammonsters_unhatched_egg_steals
        SET status = 'claimed', claimed_by_user_id = ?, claimed_at_ms = ?,
            claim_event_id = ?, claimed_stream_key = ?
        WHERE steal_id = ? AND status = 'public'
      `).run(
        normalizedUserId,
        claimedAtMs,
        normalizedEventId,
        normalizeText(streamKey, 192),
        candidate.steal_id
      );
      if (claimed.changes !== 1) {
        throw new Error('STREAM_MONSTERS_STEAL_CLAIM_CONFLICT');
      }
      this.progression?.recordEggReceived(normalizedUserId, normalizeText(streamKey, 192), {
        source: 'steal',
        eventId: normalizedEventId
      });
      const row = this.claimedRowByEvent(normalizedEventId);
      const claim = this.projectClaim(row);
      this.recordClaimReceipt({
        eventId: normalizedEventId,
        streamKey: normalizeText(streamKey, 192) || 'offline',
        result: claim,
        createdAtMs: claimedAtMs
      });
      this.store.afterCommit(() => this.emit('streammonsters:unhatched_egg_steal_claimed', {
        stealId: claim.stealId,
        eggStage: claim.eggStage,
        ...this.eggStageProjector.eventIdentity(
          'streammonsters:unhatched_egg_steal_claimed',
          claim.eggStage
        )
      }));
      return claim;
    });
    return result;
  }
}

UnhatchedEggStealService.DEFAULT_GRACE_SECONDS = DEFAULT_GRACE_SECONDS;
UnhatchedEggStealService.DEFAULT_ACTIVITY_WINDOW_SECONDS = DEFAULT_ACTIVITY_WINDOW_SECONDS;
UnhatchedEggStealService.normalizeGraceSeconds = value => (
  normalizeSeconds(value, DEFAULT_GRACE_SECONDS)
);
UnhatchedEggStealService.normalizeActivityWindowSeconds = value => (
  normalizeSeconds(value, DEFAULT_ACTIVITY_WINDOW_SECONDS, 30)
);

module.exports = UnhatchedEggStealService;
