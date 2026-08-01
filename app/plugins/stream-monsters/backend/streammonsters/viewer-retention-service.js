'use strict';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const MAX_BATCHES = 4;
const BATCH_SIZE = 250;

class ViewerRetentionService {
  constructor({ store, now = () => Date.now(), config = {} } = {}) {
    this.store = store;
    this.now = now;
    this.timer = null;
    this.setConfig(config);
  }

  setConfig(config = {}) {
    const activeDays = Number(config.activeDays ?? config.retentionActiveDays ?? 30);
    const purgeDays = Number(config.purgeDays ?? config.retentionPurgeDays ?? 240);
    if (!Number.isInteger(activeDays) || activeDays < 1 || activeDays > 90) {
      throw new Error('STREAM_MONSTERS_RETENTION_ACTIVE_INVALID');
    }
    if (!Number.isInteger(purgeDays) || purgeDays < 30 || purgeDays > 730 || purgeDays <= activeDays) {
      throw new Error('STREAM_MONSTERS_RETENTION_PURGE_INVALID');
    }
    this.config = { activeDays, purgeDays };
    return { ...this.config };
  }

  run(nowMs = this.now()) {
    const now = Number(nowMs) || Date.now();
    const activeCutoff = now - this.config.activeDays * 86_400_000;
    const purgeCutoff = now - this.config.purgeDays * 86_400_000;
    let archived = 0;
    let purged = 0;
    this.store.runInImmediateTransaction(() => {
      this.store.db.prepare('DELETE FROM streammonsters_free_egg_cooldowns WHERE expires_at_ms <= ?').run(now);
      for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        const rows = this.store.db.prepare(`
          SELECT retention.user_id, retention.last_active_at_ms
          FROM streammonsters_viewer_retention retention
          WHERE retention.last_active_at_ms <= ?
            AND retention.archived_at_ms IS NULL
            AND NOT EXISTS (SELECT 1 FROM streammonsters_event_outbox outbox WHERE outbox.delivered_at_ms IS NULL AND outbox.payload_json LIKE '%' || retention.user_id || '%')
            AND NOT EXISTS (SELECT 1 FROM streammonsters_free_egg_offers offer WHERE offer.source_user_id = retention.user_id OR (offer.claimed_by_user_id = retention.user_id AND offer.status IN ('reserved', 'public')))
            AND NOT EXISTS (SELECT 1 FROM streammonsters_free_egg_cooldowns cooldown WHERE cooldown.user_id = retention.user_id AND cooldown.expires_at_ms > ?)
            AND NOT EXISTS (SELECT 1 FROM streammonsters_eggs egg JOIN streammonsters_monsters monster ON monster.egg_id = egg.egg_id WHERE egg.user_id = retention.user_id)
          ORDER BY retention.last_active_at_ms ASC, retention.user_id ASC LIMIT ?
        `).all(activeCutoff, now, BATCH_SIZE);
        if (!rows.length) break;
        rows.forEach(row => {
          this.store.db.prepare('INSERT OR IGNORE INTO streammonsters_viewer_archives (user_id, archived_at_ms) VALUES (?, ?)').run(row.user_id, now);
          this.store.db.prepare('UPDATE streammonsters_viewer_retention SET archived_at_ms = ? WHERE user_id = ?').run(now, row.user_id);
          archived += 1;
          if (row.last_active_at_ms <= purgeCutoff) {
            this.store.db.prepare('DELETE FROM streammonsters_viewer_progress WHERE user_id = ?').run(row.user_id);
            this.store.db.prepare('UPDATE streammonsters_viewer_archives SET purged_at_ms = ? WHERE user_id = ?').run(now, row.user_id);
            purged += 1;
          }
        });
      }
    });
    return { archived, purged, activeDays: this.config.activeDays, purgeDays: this.config.purgeDays };
  }

  start() {
    if (!this.timer) this.timer = setInterval(() => this.run(), SIX_HOURS_MS);
    this.timer.unref?.();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = ViewerRetentionService;
module.exports.SIX_HOURS_MS = SIX_HOURS_MS;
module.exports.MAX_BATCHES = MAX_BATCHES;
module.exports.BATCH_SIZE = BATCH_SIZE;
