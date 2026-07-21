const crypto = require('crypto');

const STORE_SESSION_MAX_AGE_MS = 28 * 24 * 60 * 60 * 1000;
const STORE_SESSION_REVALIDATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function cleanText(value) {
  return String(value || '').trim();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

class StoreSessionStore {
  constructor(database, options = {}) {
    this.db = database?.db || database;
    this.now = typeof options.now === 'function' ? options.now : () => new Date();

    if (!this.db || typeof this.db.prepare !== 'function' || typeof this.db.exec !== 'function') {
      throw new TypeError('StoreSessionStore requires a better-sqlite3-compatible database.');
    }

    this.initialize();
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS store_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        clerk_session_id TEXT,
        license_json TEXT NOT NULL,
        access_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        last_verified_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_store_sessions_expires_at ON store_sessions(expires_at);
    `);
  }

  issue(account = {}) {
    const userId = cleanText(account.userId);
    if (!userId) {
      throw new TypeError('Store sessions require an authenticated user ID.');
    }

    const nowMs = this.getNowMs();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = nowMs + STORE_SESSION_MAX_AGE_MS;

    this.db.prepare(`
      INSERT INTO store_sessions (
        token_hash, user_id, clerk_session_id, license_json, access_json,
        created_at, last_used_at, last_verified_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.hashToken(token),
      userId,
      cleanText(account.sessionId) || null,
      JSON.stringify(account.license || {}),
      JSON.stringify(account.access || {}),
      nowMs,
      nowMs,
      nowMs,
      expiresAt
    );

    return { token, expiresAt };
  }

  read(token) {
    const tokenHash = this.hashToken(token);
    if (!tokenHash) {
      return { status: 'missing' };
    }

    const row = this.db.prepare('SELECT * FROM store_sessions WHERE token_hash = ?').get(tokenHash);
    if (!row) {
      return { status: 'missing' };
    }

    const nowMs = this.getNowMs();
    const account = this.rowToAccount(row);
    if (row.expires_at <= nowMs) {
      this.db.prepare('DELETE FROM store_sessions WHERE token_hash = ?').run(tokenHash);
      return { status: 'expired' };
    }

    if (nowMs - row.last_verified_at >= STORE_SESSION_REVALIDATION_INTERVAL_MS) {
      return {
        status: 'revalidation_required',
        account,
        expiresAt: row.expires_at
      };
    }

    const expiresAt = nowMs + STORE_SESSION_MAX_AGE_MS;
    this.db.prepare(`
      UPDATE store_sessions
      SET last_used_at = ?, expires_at = ?
      WHERE token_hash = ?
    `).run(nowMs, expiresAt, tokenHash);

    return {
      status: 'active',
      account,
      expiresAt
    };
  }

  revoke(token) {
    const tokenHash = this.hashToken(token);
    if (!tokenHash) {
      return false;
    }

    return this.db.prepare('DELETE FROM store_sessions WHERE token_hash = ?').run(tokenHash).changes > 0;
  }

  getNowMs() {
    const value = this.now();
    const nowMs = value instanceof Date ? value.getTime() : Number(value);
    if (!Number.isFinite(nowMs)) {
      throw new TypeError('Store session clock must return a valid Date or timestamp.');
    }
    return nowMs;
  }

  hashToken(token) {
    const value = cleanText(token);
    if (!value) {
      return '';
    }
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  rowToAccount(row) {
    return {
      userId: row.user_id,
      sessionId: row.clerk_session_id || null,
      license: parseJson(row.license_json, {}),
      access: parseJson(row.access_json, {})
    };
  }
}

StoreSessionStore.STORE_SESSION_MAX_AGE_MS = STORE_SESSION_MAX_AGE_MS;
StoreSessionStore.STORE_SESSION_REVALIDATION_INTERVAL_MS = STORE_SESSION_REVALIDATION_INTERVAL_MS;

module.exports = StoreSessionStore;
