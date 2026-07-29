const { randomUUID } = require('crypto');
const EggStageProjector = require('./egg-stage-projector');

const DEFAULT_GRACE_SECONDS = 600;
const MAXIMUM_GRACE_SECONDS = 86_400;
const ACTIVE_STATUSES = Object.freeze(['pending', 'public']);

function normalizeGraceSeconds(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_GRACE_SECONDS;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_GRACE_SECONDS;
  return Math.max(0, Math.min(
    MAXIMUM_GRACE_SECONDS,
    Math.floor(numeric)
  ));
}

function normalizeText(value, maximum = 256) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maximum) : null;
}

class OwnedReadyEggRescueService {
  constructor({
    store,
    progression = null,
    emit = () => {},
    now = () => Date.now(),
    logger = null,
    config = {}
  } = {}) {
    if (!store?.db?.prepare) {
      throw new Error('STREAM_MONSTERS_RESCUE_STORE_REQUIRED');
    }
    this.store = store;
    this.db = store.db;
    this.progression = progression;
    this.emit = emit;
    this.now = now;
    this.logger = logger;
    this.graceSeconds = normalizeGraceSeconds(
      config.ownedReadyEggRescueGraceSeconds
    );
    this.eggStageProjector = new EggStageProjector({
      store,
      now
    });
    this.initialize();
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS streammonsters_owned_ready_egg_rescues (
        rescue_id TEXT PRIMARY KEY,
        egg_id TEXT NOT NULL UNIQUE,
        original_owner_id TEXT NOT NULL,
        observed_at_ms INTEGER NOT NULL,
        eligible_at_ms INTEGER NOT NULL,
        migration INTEGER NOT NULL DEFAULT 0 CHECK (migration IN (0, 1)),
        status TEXT NOT NULL CHECK (
          status IN ('pending', 'public', 'claimed', 'closed')
        ),
        published_at_ms INTEGER,
        claimed_by_user_id TEXT,
        claimed_at_ms INTEGER,
        claim_event_id TEXT UNIQUE,
        claimed_stream_key TEXT,
        closed_at_ms INTEGER,
        close_reason TEXT,
        FOREIGN KEY (egg_id) REFERENCES streammonsters_eggs(egg_id)
      );
      CREATE INDEX IF NOT EXISTS streammonsters_ready_rescues_status_eligible
        ON streammonsters_owned_ready_egg_rescues(status, eligible_at_ms);
    `);
    if (this.graceSeconds === 0) return;
    const migrationAtMs = this.currentMs();
    this.store.runInImmediateTransaction(() => {
      this.readyEggsWithoutRescue(migrationAtMs).forEach(egg => {
        this.insertRescue(egg, {
          observedAtMs: migrationAtMs,
          eligibleAtMs: migrationAtMs + this.graceMs(),
          migration: true
        });
      });
    });
  }

  currentMs(value = this.now()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
  }

  graceMs() {
    return this.graceSeconds * 1_000;
  }

  emitAfterCommit(event, payload) {
    this.store.afterCommit(() => this.emit(event, payload));
  }

  log(action, fields = {}, level = 'info') {
    if (typeof this.logger === 'function') {
      this.logger(action, fields, level);
      return;
    }
    this.logger?.[level]?.(action, fields);
  }

  logAfterCommit(action, fields = {}, level = 'info') {
    this.store.afterCommit(() => this.log(action, fields, level));
  }

  readyEggsWithoutRescue(nowMs) {
    return this.db.prepare(`
      SELECT eggs.*
      FROM streammonsters_eggs eggs
      LEFT JOIN streammonsters_owned_ready_egg_rescues rescue
        ON rescue.egg_id = eggs.egg_id
      WHERE rescue.egg_id IS NULL
        AND eggs.state = 'ready'
        AND eggs.monster_id IS NULL
        AND eggs.expired_at_ms IS NULL
        AND eggs.expires_at_ms IS NOT NULL
        AND eggs.expires_at_ms > ?
      ORDER BY eggs.ready_at_ms, eggs.created_at_ms, eggs.egg_id
    `).all(nowMs);
  }

  insertRescue(egg, {
    observedAtMs,
    eligibleAtMs,
    migration = false
  }) {
    const rescueId = randomUUID();
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_owned_ready_egg_rescues (
        rescue_id, egg_id, original_owner_id, observed_at_ms,
        eligible_at_ms, migration, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      rescueId,
      egg.egg_id,
      egg.user_id,
      observedAtMs,
      eligibleAtMs,
      migration ? 1 : 0
    );
    const rescue = result.changes
      ? this.getRescue(rescueId)
      : this.getRescueForEgg(egg.egg_id);
    if (result.changes) {
      this.logAfterCommit('owned_ready_egg_rescue_scheduled', {
        status: 'pending',
        migration: Boolean(migration),
        graceSeconds: this.graceSeconds
      }, 'debug');
    }
    return rescue;
  }

  getRescue(rescueId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_owned_ready_egg_rescues
      WHERE rescue_id = ?
    `).get(rescueId) || null;
  }

  getRescueForEgg(eggId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_owned_ready_egg_rescues
      WHERE egg_id = ?
    `).get(eggId) || null;
  }

  observeReadyEgg(eggId, { observedAtMs = this.now() } = {}) {
    if (this.graceSeconds === 0) return null;
    const atMs = this.currentMs(observedAtMs);
    return this.store.runInImmediateTransaction(() => {
      const existing = this.getRescueForEgg(eggId);
      if (existing) return existing;
      const egg = this.db.prepare(`
        SELECT * FROM streammonsters_eggs
        WHERE egg_id = ?
          AND state = 'ready'
          AND monster_id IS NULL
          AND expired_at_ms IS NULL
          AND expires_at_ms IS NOT NULL
          AND expires_at_ms > ?
      `).get(eggId, atMs);
      if (!egg) return null;
      const readyAtMs = Number.isFinite(Number(egg.ready_at_ms))
        ? this.currentMs(egg.ready_at_ms)
        : atMs;
      return this.insertRescue(egg, {
        observedAtMs: atMs,
        eligibleAtMs: readyAtMs + this.graceMs()
      });
    });
  }

  setConfig(config = {}, atMs = this.now()) {
    const nextGraceSeconds = normalizeGraceSeconds(
      config.ownedReadyEggRescueGraceSeconds
    );
    const previousGraceSeconds = this.graceSeconds;
    const changedAtMs = this.currentMs(atMs);
    let disabledStages = [];
    if (nextGraceSeconds === previousGraceSeconds) {
      return { ownedReadyEggRescueGraceSeconds: this.graceSeconds };
    }
    this.store.runInImmediateTransaction(() => {
      if (nextGraceSeconds === 0) {
        disabledStages = this.listPublic(changedAtMs);
        this.db.prepare(`
          UPDATE streammonsters_owned_ready_egg_rescues
          SET status = 'closed',
              closed_at_ms = ?,
              close_reason = 'disabled'
          WHERE status IN ('pending', 'public')
        `).run(changedAtMs);
        return;
      }
      if (previousGraceSeconds === 0) {
        const graceMs = nextGraceSeconds * 1_000;
        this.db.prepare(`
          UPDATE streammonsters_owned_ready_egg_rescues
          SET status = 'pending',
              observed_at_ms = ?,
              eligible_at_ms = ?,
              migration = 0,
              published_at_ms = NULL,
              closed_at_ms = NULL,
              close_reason = NULL
          WHERE status = 'closed'
            AND close_reason = 'disabled'
            AND EXISTS (
              SELECT 1
              FROM streammonsters_eggs eggs
              WHERE eggs.egg_id =
                streammonsters_owned_ready_egg_rescues.egg_id
                AND eggs.user_id =
                  streammonsters_owned_ready_egg_rescues.original_owner_id
                AND eggs.state = 'ready'
                AND eggs.monster_id IS NULL
                AND eggs.expired_at_ms IS NULL
                AND eggs.expires_at_ms IS NOT NULL
                AND eggs.expires_at_ms > ?
            )
        `).run(
          changedAtMs,
          changedAtMs + graceMs,
          changedAtMs
        );
        this.readyEggsWithoutRescue(changedAtMs).forEach(egg => {
          this.insertRescue(egg, {
            observedAtMs: changedAtMs,
            eligibleAtMs: changedAtMs + graceMs
          });
        });
        return;
      }
      const graceMs = nextGraceSeconds * 1_000;
      this.db.prepare(`
        UPDATE streammonsters_owned_ready_egg_rescues
        SET eligible_at_ms = (
          CASE
            WHEN migration = 1 THEN observed_at_ms
            ELSE COALESCE((
              SELECT eggs.ready_at_ms
              FROM streammonsters_eggs eggs
              WHERE eggs.egg_id =
                streammonsters_owned_ready_egg_rescues.egg_id
            ), observed_at_ms)
          END
        ) + ?
        WHERE status = 'pending'
      `).run(graceMs);
    });
    this.graceSeconds = nextGraceSeconds;
    disabledStages.forEach(stage => {
      this.emitAfterCommit('streammonsters:egg_stage_removed', {
        eggStage: stage,
        reason: 'rescue_disabled',
        ...this.eggStageProjector.eventIdentity(
          'streammonsters:egg_stage_removed',
          stage
        )
      });
      this.logAfterCommit('owned_ready_egg_rescue_closed', {
        status: 'closed',
        reason: 'disabled'
      }, 'debug');
    });
    return { ownedReadyEggRescueGraceSeconds: this.graceSeconds };
  }

  closeUnavailable(nowMs) {
    const rows = this.db.prepare(`
      SELECT rescue.*, eggs.state AS egg_state, eggs.user_id AS egg_owner_id,
        eggs.monster_id, eggs.expired_at_ms, eggs.expires_at_ms
      FROM streammonsters_owned_ready_egg_rescues rescue
      JOIN streammonsters_eggs eggs ON eggs.egg_id = rescue.egg_id
      WHERE rescue.status IN ('pending', 'public')
      ORDER BY rescue.eligible_at_ms, rescue.rescue_id
    `).all();
    const close = this.db.prepare(`
      UPDATE streammonsters_owned_ready_egg_rescues
      SET status = 'closed', closed_at_ms = ?, close_reason = ?
      WHERE rescue_id = ? AND status IN ('pending', 'public')
    `);
    const closed = [];
    rows.forEach(row => {
      let reason = null;
      if (row.egg_state === 'hatched' || row.monster_id) {
        reason = 'owner_hatched';
      } else if (
        row.egg_state === 'expired' ||
        row.expired_at_ms != null ||
        row.expires_at_ms == null ||
        Number(row.expires_at_ms) <= nowMs
      ) {
        reason = 'expired';
      } else if (row.egg_owner_id !== row.original_owner_id) {
        reason = 'owner_changed';
      } else if (row.egg_state !== 'ready') {
        reason = 'unavailable';
      }
      if (!reason) return;
      if (close.run(nowMs, reason, row.rescue_id).changes) {
        closed.push({
          ...row,
          status: 'closed',
          closed_at_ms: nowMs,
          close_reason: reason
        });
        this.logAfterCommit('owned_ready_egg_rescue_closed', {
          status: 'closed',
          reason
        }, 'debug');
      }
    });
    return closed;
  }

  publishEligible(nowMs) {
    return this.db.prepare(`
      UPDATE streammonsters_owned_ready_egg_rescues
      SET status = 'public', published_at_ms = COALESCE(published_at_ms, ?)
      WHERE status = 'pending'
        AND eligible_at_ms <= ?
        AND EXISTS (
          SELECT 1
          FROM streammonsters_eggs eggs
          WHERE eggs.egg_id =
            streammonsters_owned_ready_egg_rescues.egg_id
            AND eggs.user_id =
              streammonsters_owned_ready_egg_rescues.original_owner_id
            AND eggs.state = 'ready'
            AND eggs.monster_id IS NULL
            AND eggs.expired_at_ms IS NULL
            AND eggs.expires_at_ms IS NOT NULL
            AND eggs.expires_at_ms > ?
        )
      RETURNING *
    `).all(nowMs, nowMs, nowMs);
  }

  sweep(atMs = this.now()) {
    if (this.graceSeconds === 0) {
      return { published: [], closed: [] };
    }
    const nowMs = this.currentMs(atMs);
    const result = this.store.runInImmediateTransaction(() => ({
      closed: this.closeUnavailable(nowMs),
      published: this.publishEligible(nowMs)
    }));
    result.published.forEach(row => {
      const stage = this.projectPublicRescue(row.rescue_id, nowMs);
      if (stage) {
        this.emitAfterCommit('streammonsters:owned_ready_egg_public', {
          rescue: stage,
          eggStage: stage,
          ...this.eggStageProjector.eventIdentity(
            'streammonsters:owned_ready_egg_public',
            stage
          )
        });
        this.logAfterCommit('owned_ready_egg_rescue_public', {
          status: 'public',
          provenance: stage.provenance,
          remainingMs: stage.remainingMs
        });
      }
    });
    return result;
  }

  getPublicRows(nowMs) {
    return this.db.prepare(`
      SELECT rescue.*, eggs.*
      FROM streammonsters_owned_ready_egg_rescues rescue
      JOIN streammonsters_eggs eggs ON eggs.egg_id = rescue.egg_id
      WHERE rescue.status = 'public'
        AND eggs.user_id = rescue.original_owner_id
        AND eggs.state = 'ready'
        AND eggs.monster_id IS NULL
        AND eggs.expired_at_ms IS NULL
        AND eggs.expires_at_ms IS NOT NULL
        AND eggs.expires_at_ms > ?
      ORDER BY eggs.expires_at_ms, rescue.eligible_at_ms, rescue.rescue_id
    `).all(nowMs);
  }

  projectPublicRow(row, nowMs) {
    const base = this.eggStageProjector.projectEgg(row);
    const remainingMs = Math.max(0, Number(row.expires_at_ms) - nowMs);
    return {
      rescueId: row.rescue_id,
      visualId: base.visualId,
      provenance: base.provenance,
      state: 'public',
      displayName: base.displayName,
      owner: {
        displayName: base.displayName,
        avatarRef: base.avatarRef
      },
      element: base.element,
      variant: base.variant,
      imageUrl: base.imageUrl,
      timing: {
        ...base.timing,
        publicAtMs: Number(row.published_at_ms),
        expiresAtMs: Number(row.expires_at_ms),
        remainingMs
      },
      expiresAtMs: Number(row.expires_at_ms),
      remainingMs,
      adoptionStatus: 'public',
      adoptable: true,
      command: '!adopt'
    };
  }

  projectPublicRescue(rescueId, atMs = this.now()) {
    if (this.graceSeconds === 0) return null;
    const nowMs = this.currentMs(atMs);
    const row = this.getPublicRows(nowMs)
      .find(entry => entry.rescue_id === rescueId);
    return row ? this.projectPublicRow(row, nowMs) : null;
  }

  listPublic(atMs = this.now()) {
    if (this.graceSeconds === 0) return [];
    const nowMs = this.currentMs(atMs);
    return this.getPublicRows(nowMs)
      .map(row => this.projectPublicRow(row, nowMs));
  }

  claimedRowByEvent(eventId) {
    return this.db.prepare(`
      SELECT rescue.*, eggs.*
      FROM streammonsters_owned_ready_egg_rescues rescue
      JOIN streammonsters_eggs eggs ON eggs.egg_id = rescue.egg_id
      WHERE rescue.claim_event_id = ? AND rescue.status = 'claimed'
    `).get(eventId) || null;
  }

  projectClaim(row) {
    return {
      success: true,
      status: 'claimed',
      adoptionSource: 'rescue',
      rescueId: row.rescue_id,
      eggStage: this.eggStageProjector.projectEgg(row)
    };
  }

  adopt({
    userId,
    streamKey = null,
    eventId,
    displayName = null,
    avatarRef = null,
    nowMs = this.now()
  } = {}) {
    if (this.graceSeconds === 0) {
      return { success: false, status: 'disabled' };
    }
    const normalizedUserId = normalizeText(userId, 192);
    const normalizedEventId = normalizeText(eventId, 256);
    if (!normalizedUserId || !normalizedEventId) {
      return { success: false, status: 'invalid_request' };
    }
    const claimedAtMs = this.currentMs(nowMs);
    return this.store.runInImmediateTransaction(() => {
      const adoptionReceipt = this.store.getFreeEggEvent?.(normalizedEventId);
      if (adoptionReceipt) return adoptionReceipt;
      const duplicate = this.claimedRowByEvent(normalizedEventId);
      if (duplicate) return this.projectClaim(duplicate);
      this.closeUnavailable(claimedAtMs);
      this.publishEligible(claimedAtMs);
      const candidate = this.db.prepare(`
        SELECT rescue.*, eggs.*
        FROM streammonsters_owned_ready_egg_rescues rescue
        JOIN streammonsters_eggs eggs ON eggs.egg_id = rescue.egg_id
        WHERE rescue.status = 'public'
          AND eggs.user_id = rescue.original_owner_id
          AND eggs.user_id != ?
          AND eggs.state = 'ready'
          AND eggs.monster_id IS NULL
          AND eggs.expired_at_ms IS NULL
          AND eggs.expires_at_ms IS NOT NULL
          AND eggs.expires_at_ms > ?
        ORDER BY eggs.expires_at_ms, rescue.eligible_at_ms, rescue.rescue_id
        LIMIT 1
      `).get(normalizedUserId, claimedAtMs);
      if (!candidate) return { success: false, status: 'no_rescue' };
      const safeDisplayName = [
        displayName,
        this.store.getViewerDisplayName?.(normalizedUserId)
      ].map(EggStageProjector.publicViewerName).find(Boolean) || null;
      const safeAvatarRef = EggStageProjector.safeAssetReference(avatarRef);
      const transferred = this.db.prepare(`
        UPDATE streammonsters_eggs
        SET user_id = ?, display_name = ?, avatar_ref = ?
        WHERE egg_id = ?
          AND user_id = ?
          AND state = 'ready'
          AND monster_id IS NULL
          AND expired_at_ms IS NULL
          AND expires_at_ms IS NOT NULL
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
        throw new Error('STREAM_MONSTERS_RESCUE_TRANSFER_CONFLICT');
      }
      const claimed = this.db.prepare(`
        UPDATE streammonsters_owned_ready_egg_rescues
        SET status = 'claimed',
            claimed_by_user_id = ?,
            claimed_at_ms = ?,
            claim_event_id = ?,
            claimed_stream_key = ?
        WHERE rescue_id = ? AND status = 'public'
      `).run(
        normalizedUserId,
        claimedAtMs,
        normalizedEventId,
        normalizeText(streamKey, 192),
        candidate.rescue_id
      );
      if (claimed.changes !== 1) {
        throw new Error('STREAM_MONSTERS_RESCUE_CLAIM_CONFLICT');
      }
      this.progression?.recordEggReceived(
        normalizedUserId,
        normalizeText(streamKey, 192),
        {
          source: 'rescue',
          eventId: normalizedEventId
        }
      );
      const row = this.claimedRowByEvent(normalizedEventId);
      const result = this.projectClaim(row);
      this.store.recordFreeEggEvent?.({
        eventId: normalizedEventId,
        streamKey: normalizeText(streamKey, 192) || 'offline',
        eventType: 'adopt',
        result,
        createdAtMs: claimedAtMs
      });
      this.emitAfterCommit('streammonsters:owned_ready_egg_claimed', {
        rescueId: result.rescueId,
        eggStage: result.eggStage,
        ...this.eggStageProjector.eventIdentity(
          'streammonsters:owned_ready_egg_claimed',
          result.eggStage
        )
      });
      this.logAfterCommit('owned_ready_egg_rescue_claimed', {
        status: 'claimed',
        provenance: result.eggStage.provenance,
        state: result.eggStage.state
      });
      return result;
    });
  }
}

OwnedReadyEggRescueService.DEFAULT_GRACE_SECONDS = DEFAULT_GRACE_SECONDS;
OwnedReadyEggRescueService.MAXIMUM_GRACE_SECONDS = MAXIMUM_GRACE_SECONDS;
OwnedReadyEggRescueService.ACTIVE_STATUSES = ACTIVE_STATUSES;
OwnedReadyEggRescueService.normalizeGraceSeconds = normalizeGraceSeconds;

module.exports = OwnedReadyEggRescueService;
