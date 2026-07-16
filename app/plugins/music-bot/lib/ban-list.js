const VALID_TYPES = ['url', 'keyword', 'channel', 'user', 'artist'];
const MAX_VALUE_LENGTH = 500;
const MAX_ARTIST_LENGTH = 200;

class BanList {
  constructor(api) {
    this.api = api;
    this.db = api.getDatabase();
    this._ensureTable();
  }

  _ensureTable() {
    try {
      this.db
        .prepare(
          `CREATE TABLE IF NOT EXISTS plugin_music_bot_bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            value TEXT NOT NULL,
            reason TEXT,
            banned_by TEXT,
            created_at INTEGER NOT NULL
          )`
        )
        .run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_music_bot_bans_type ON plugin_music_bot_bans (type)').run();
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to ensure ban table: ${error.message}`, 'error');
    }
  }

  _mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      value: row.value,
      reason: row.reason || null,
      bannedBy: row.banned_by || null,
      createdAt: row.created_at
    };
  }

  _validateType(type) {
    if (!VALID_TYPES.includes(type)) {
      throw new Error('Invalid ban type');
    }
  }

  _normalizeValue(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  }

  _normalizeExact(value) {
    return this._normalizeValue(value).toLowerCase();
  }

  _validateValue(value, type) {
    if (!value || !String(value).trim()) {
      throw new Error('Value is required');
    }
    const maxLength = type === 'artist' ? MAX_ARTIST_LENGTH : MAX_VALUE_LENGTH;
    if (this._normalizeValue(value).length > maxLength) {
      throw new Error(`Ban value is too long (maximum ${maxLength} characters)`);
    }
  }

  addBan(type, value, reason, bannedBy) {
    this._validateType(type);
    this._validateValue(value, type);
    const sanitizedValue = this._normalizeValue(value);
    const normalizedValue = this._normalizeExact(sanitizedValue);
    const existing = this.getBansByType(type).find(
      (ban) => this._normalizeExact(ban.value) === normalizedValue
    );
    if (existing) return existing;
    const createdAt = Date.now();
    const stmt = this.db.prepare(
      'INSERT INTO plugin_music_bot_bans (type, value, reason, banned_by, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(type, sanitizedValue, reason || null, bannedBy || null, createdAt);
    return {
      id: info.lastInsertRowid,
      type,
      value: sanitizedValue,
      reason: reason || null,
      bannedBy: bannedBy || null,
      createdAt
    };
  }

  removeBan(id) {
    const info = this.db.prepare('DELETE FROM plugin_music_bot_bans WHERE id = ?').run(id);
    return { success: info.changes > 0 };
  }

  getAllBans() {
    const rows = this.db
      .prepare('SELECT id, type, value, reason, banned_by, created_at FROM plugin_music_bot_bans ORDER BY created_at DESC')
      .all();
    return rows.map((row) => this._mapRow(row));
  }

  getBansByType(type) {
    this._validateType(type);
    const rows = this.db
      .prepare(
        'SELECT id, type, value, reason, banned_by, created_at FROM plugin_music_bot_bans WHERE type = ? ORDER BY created_at DESC'
      )
      .all(type);
    return rows.map((row) => this._mapRow(row));
  }

  isUrlBanned(url, youtubeId) {
    if (!url && !youtubeId) return { banned: false, ban: null };
    const bans = this.getBansByType('url');
    const lowerUrl = String(url || '').toLowerCase();
    for (const ban of bans) {
      const banValue = (ban.value || '').toLowerCase();
      if (!banValue) continue;
      if (lowerUrl && lowerUrl.includes(banValue)) {
        return { banned: true, ban };
      }
      if (youtubeId && youtubeId.toLowerCase() === banValue) {
        return { banned: true, ban };
      }
    }
    return { banned: false, ban: null };
  }

  isKeywordBanned(title) {
    if (!title) return { banned: false, ban: null, keyword: null };
    const bans = this.getBansByType('keyword');
    const lower = String(title).toLowerCase();
    for (const ban of bans) {
      const keyword = (ban.value || '').toLowerCase();
      if (keyword && lower.includes(keyword)) {
        return { banned: true, ban, keyword: ban.value };
      }
    }
    return { banned: false, ban: null, keyword: null };
  }

  isChannelBanned(channelId, channelName) {
    const bans = this.getBansByType('channel');
    const lowerName = channelName ? String(channelName).toLowerCase() : null;
    for (const ban of bans) {
      const value = String(ban.value || '');
      const lower = value.toLowerCase();
      if ((channelId && channelId === value) || (lowerName && lowerName === lower)) {
        return { banned: true, ban };
      }
    }
    return { banned: false, ban: null };
  }

  isUserBanned(username) {
    if (!username) return { banned: false, ban: null };
    const bans = this.getBansByType('user');
    const lowerUser = String(username).toLowerCase();
    for (const ban of bans) {
      const value = (ban.value || '').toLowerCase();
      if (value && value === lowerUser) {
        return { banned: true, ban };
      }
    }
    return { banned: false, ban: null };
  }

  isArtistBanned(artist) {
    if (!artist) return { banned: false, ban: null };
    const normalizedArtist = this._normalizeExact(artist);
    const ban = this.getBansByType('artist').find(
      (entry) => this._normalizeExact(entry.value) === normalizedArtist
    );
    return ban ? { banned: true, ban } : { banned: false, ban: null };
  }
}

module.exports = BanList;
