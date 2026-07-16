const { randomUUID } = require('crypto');
const {
  deriveTrackIdentity,
  extractYouTubeId,
  normalizeUrl,
  providerFromTrack
} = require('./track-identity');

const DEFAULT_MAX_SONG_DURATION_SECONDS = 360;
const MIN_ALLOWED_MAX_SONG_DURATION_SECONDS = 30;

class QueueManager {
  constructor(config, api) {
    this.config = config || {};
    this.queueConfig = config.queue || {};
    this.api = api;
    this.db = api.getDatabase();
    this.queue = [];
    this.history = [];
    this.current = null;
    this.userLastRequest = new Map();
    this.voteSkipVoters = new Set();
    this.skipImmuneUsers = new Set();
    this._persistenceGuard = {
      blocked: false,
      reason: null,
      blockedAt: null,
      lastError: null
    };
    this._ensureTables();
  }

  getQueue() {
    return this.queue;
  }

  getHistory() {
    return this.history.slice(-50);
  }

  getCurrent() {
    return this.current;
  }

  getPersistenceStatus() {
    return {
      ...this._persistenceGuard,
      pendingCount: this.queue.length
    };
  }

  addSkipImmunity(username) {
    if (!username) return;
    this.skipImmuneUsers.add(username.toLowerCase());
  }

  removeSkipImmunity(username) {
    if (!username) return;
    this.skipImmuneUsers.delete(username.toLowerCase());
  }

  clearSkipImmunity() {
    this.skipImmuneUsers.clear();
  }

  isSkipImmune(username) {
    if (!username) return false;
    return this.skipImmuneUsers.has(username.toLowerCase());
  }

  addVoteSkip(username, viewerCount) {
    const required = this._computeRequiredVotes(viewerCount);
    if (!this.current) {
      return { skipped: false, votes: this.voteSkipVoters.size, required };
    }
    if (this.isSkipImmune(this.current?.requestedBy)) {
      return {
        skipped: false,
        votes: this.voteSkipVoters.size,
        required,
        immuneInfo: { requestedBy: this.current?.requestedBy }
      };
    }

    const voterKey = (username || '').toLowerCase();
    if (!voterKey) {
      return { skipped: false, votes: this.voteSkipVoters.size, required };
    }

    if (this.voteSkipVoters.has(voterKey)) {
      return {
        skipped: false,
        votes: this.voteSkipVoters.size,
        required,
        duplicateVote: true
      };
    }

    this.voteSkipVoters.add(voterKey);
    const skipped = this.voteSkipVoters.size >= required;
    return { skipped, votes: this.voteSkipVoters.size, required };
  }

  resetVoteSkips() {
    this.voteSkipVoters.clear();
  }

  getVoteVoters() {
    return Array.from(this.voteSkipVoters);
  }

  addSong(song) {
    const validation = this._validateSong(song);
    if (!validation.success) {
      return validation;
    }

    const identity = this._identityForSong(song);

    const requesterKey = this._normalizeRequesterKey(song.requestedBy);
    const songEntry = {
      id: song.id || randomUUID(),
      title: song.title,
      artist: song.artist || '',
      duration: song.duration || null,
      thumbnail: song.thumbnail || null,
      url: song.url,
      streamUrl: song.streamUrl || null,
      streamHeaders: song.streamHeaders || null,
      localPath: song.localPath || null,
      youtubeId: identity.youtubeId || null,
      provider: identity.provider,
      providerId: identity.providerId,
      trackKey: identity.trackKey,
      channelId: song.channelId || null,
      channelName: song.channelName || null,
      source: song.source || identity.provider,
      requestedBy: song.requestedBy || 'viewer',
      requesterAvatar: song.requesterAvatar || null,
      requesterKey: requesterKey || 'viewer',
      isGiftRequest: Boolean(song.isGiftRequest),
      addedAt: Date.now()
    };

    this.queue.push(songEntry);
    if (songEntry.requesterKey) {
      this.userLastRequest.set(songEntry.requesterKey, Date.now());
    }

    this.persistQueue();

    return {
      success: true,
      song: songEntry,
      position: this.queue.length
    };
  }

  shiftNext() {
    this.current = this.queue.shift() || null;
    this.persistQueue();
    return this.current;
  }

  returnToFront(song) {
    if (!song) return;
    if (song.id && this.queue.some((entry) => entry.id === song.id)) {
      this.current = null;
      return;
    }
    this.queue.unshift(song);
    this.current = null;
    this.persistQueue();
  }

  clear() {
    this.queue = [];
    this.current = null;
    this.userLastRequest.clear();
    this.resetVoteSkips();
    this.clearSkipImmunity();
    this.persistQueue();
  }

  removeSong(index) {
    if (index < 0 || index >= this.queue.length) {
      return { success: false, error: 'Invalid queue position' };
    }
    const [removed] = this.queue.splice(index, 1);
    this.persistQueue();
    return { success: true, song: removed };
  }

  reorderSong(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.queue.length) {
      return { success: false, error: 'Invalid source position' };
    }
    if (toIndex < 0 || toIndex >= this.queue.length) {
      return { success: false, error: 'Invalid target position' };
    }
    const [song] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, song);
    this.persistQueue();
    return { success: true, queue: this.queue };
  }

  markPlaying(track) {
    this.current = track;
  }

  setSongLocalPath(songId, localPath) {
    if (!songId || !localPath) return false;
    let updated = false;
    this.queue = this.queue.map((entry) => {
      if (entry.id !== songId) return entry;
      updated = true;
      return { ...entry, localPath };
    });
    if (this.current?.id === songId) {
      this.current = { ...this.current, localPath };
      updated = true;
    }
    return updated;
  }

  setTrackLocalPath(trackKey, localPath) {
    if (!trackKey || !localPath) return false;
    let updated = false;
    this.queue = this.queue.map((entry) => {
      if (entry.trackKey !== trackKey) return entry;
      updated = true;
      return { ...entry, localPath };
    });
    if (this.current?.trackKey === trackKey) {
      this.current = { ...this.current, localPath };
      updated = true;
    }
    return updated;
  }

  addToHistory(track, skipped = false) {
    if (track) {
      const historyEntry = {
        ...track,
        finishedAt: Date.now(),
        skipped
      };
      this.history.push(historyEntry);
      if (this.history.length > 50) {
        this.history = this.history.slice(-50);
      }
      this._persistHistory(historyEntry);
    }
  }

  normalizeSongTitle(title = '') {
    return title
      .toLowerCase()
      .replace(/\(official\s*(music\s*)?video\)/gi, '')
      .replace(/\(lyrics?\)/gi, '')
      .replace(/\(audio\)/gi, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?remix.*?\)/gi, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  isFuzzyMatch(titleA, titleB, threshold = 0.85) {
    const normA = this.normalizeSongTitle(titleA);
    const normB = this.normalizeSongTitle(titleB);
    if (!normA || !normB) return false;
    if (normA.includes(normB) || normB.includes(normA)) {
      return true;
    }
    const bigramsA = this._bigrams(normA);
    const bigramsB = this._bigrams(normB);
    if (!bigramsA.length || !bigramsB.length) return false;
    const matches = this._bigramMatches(bigramsA, bigramsB);
    const dice = (2 * matches) / (bigramsA.length + bigramsB.length);
    return dice >= threshold;
  }

  _bigrams(text) {
    const grams = [];
    for (let i = 0; i < text.length - 1; i += 1) {
      grams.push(text.slice(i, i + 2));
    }
    return grams;
  }

  _bigramMatches(a, b) {
    const map = new Map();
    a.forEach((gram) => map.set(gram, (map.get(gram) || 0) + 1));
    let matches = 0;
    b.forEach((gram) => {
      if (map.has(gram) && map.get(gram) > 0) {
        matches += 1;
        map.set(gram, map.get(gram) - 1);
      }
    });
    return matches;
  }

  _computeRequiredVotes(viewerCount) {
    const minVotes = Math.max(Number(this.config.voteSkip?.minVotes) || 0, 1);
    const thresholdPercent = Math.max(Number(this.config.voteSkip?.thresholdPercent) || 0, 0);
    const base = (typeof viewerCount === 'number' && viewerCount > 0) ? viewerCount : minVotes;
    const thresholdCount = Math.ceil((thresholdPercent / 100) * base);
    return Math.max(minVotes, thresholdCount);
  }

  _validateSong(song) {
    if (!song || !song.title || !song.url) {
      return { success: false, error: 'Invalid song data' };
    }

    if (this.queue.length >= this.queueConfig.maxLength) {
      return { success: false, error: 'Queue is full' };
    }

    const configuredMaxSongDuration = Number(this.queueConfig.maxSongDurationSeconds);
    const normalizedMaxSongDuration = Number.isFinite(configuredMaxSongDuration)
      ? configuredMaxSongDuration
      : DEFAULT_MAX_SONG_DURATION_SECONDS;
    const maxSongDurationSeconds = Math.max(
      normalizedMaxSongDuration,
      MIN_ALLOWED_MAX_SONG_DURATION_SECONDS
    );
    const hasDuration = song.duration !== undefined;
    const duration = Number(song.duration);
    if (hasDuration && (!Number.isFinite(duration) || duration <= 0)) {
      return {
        success: false,
        error: 'Songdauer konnte nicht ermittelt werden. Bitte einen anderen Song wählen.'
      };
    }
    if (hasDuration && duration > maxSongDurationSeconds) {
      return {
        success: false,
        error: `Song ist zu lang (${Math.ceil(duration)}s). Maximum: ${maxSongDurationSeconds}s.`
      };
    }

    const duplicatesDisabled =
      this.queueConfig.duplicateDetection === 'off' || this.queueConfig.allowDuplicates;
    if (!duplicatesDisabled) {
      const duplicate = this._findDuplicate(song);
      if (duplicate) {
        return {
          success: false,
          error: `Song bereits in der Queue (#${duplicate.position} – ${duplicate.entry.title})`,
          duplicate
        };
      }
    }

    const requesterKey = this._normalizeRequesterKey(song.requestedBy);
    if (requesterKey) {
      const count = this.queue.filter((s) => {
        const existing = this._normalizeRequesterKey(s.requesterKey || s.requestedBy);
        return existing === requesterKey;
      }).length;
      if (count >= this.queueConfig.maxPerUser) {
        return {
          success: false,
          error: `Maximal ${this.queueConfig.maxPerUser} aktive Requests pro User erlaubt.`
        };
      }

      const lastRequest = this.userLastRequest.get(requesterKey);
      const cooldownSeconds = Number(this.queueConfig.cooldownPerUserSeconds) || 0;
      if (lastRequest) {
        const diffSeconds = (Date.now() - lastRequest) / 1000;
        if (
          diffSeconds < cooldownSeconds &&
          !(song.isGiftRequest && this.queueConfig.cooldownBypassForGifts)
        ) {
          const remaining = Math.ceil(cooldownSeconds - diffSeconds);
          return {
            success: false,
            error: `@${song.requestedBy}, du kannst in ${remaining} Sekunden wieder requesten.`
          };
        }
      }
    }

    return { success: true };
  }

  _findDuplicate(song) {
    const mode = this.queueConfig.duplicateDetection || 'strict';
    if (mode === 'off') return null;

    const identity = this._identityForSong(song);
    const youtubeId = identity.youtubeId;
    const normalizedUrl = normalizeUrl(song.url || '');

    for (let i = 0; i < this.queue.length; i += 1) {
      const entry = this.queue[i];
      const entryIdentity = this._identityForSong(entry);
      const canonicalMatch = Boolean(
        identity.trackKey && entryIdentity.trackKey && identity.trackKey === entryIdentity.trackKey
      );
      const youtubeMatch = Boolean(
        youtubeId && entryIdentity.youtubeId && youtubeId === entryIdentity.youtubeId
      );
      const urlMatch = Boolean(
        normalizedUrl && entry.url && normalizedUrl === normalizeUrl(entry.url)
      );
      if (mode === 'strict') {
        if (canonicalMatch || youtubeMatch || urlMatch) {
          return {
            position: i + 1,
            entry,
            matchType: canonicalMatch ? 'trackKey' : (youtubeMatch ? 'youtubeId' : 'url')
          };
        }
      }

      if (
        mode === 'fuzzy' &&
        (this.isFuzzyMatch(entry.title, song.title) ||
          canonicalMatch || youtubeMatch)
      ) {
        return { position: i + 1, entry, matchType: 'fuzzy' };
      }
    }
    return null;
  }

  _extractYouTubeId(song) {
    if (song.youtubeId) return song.youtubeId;
    return extractYouTubeId(song.url || '');
  }

  _identityForSong(song = {}) {
    if (song.trackKey) {
      const separator = String(song.trackKey).indexOf(':');
      if (separator > 0) {
        const provider = String(song.trackKey).slice(0, separator);
        const providerId = String(song.trackKey).slice(separator + 1);
        if (providerId) {
          return {
            provider,
            providerId,
            trackKey: `${provider}:${providerId}`,
            youtubeId: provider === 'youtube' ? providerId : null
          };
        }
      }
    }

    const explicitProvider = String(song.provider || song.source || '').trim().toLowerCase();
    const youtubeId = !explicitProvider || explicitProvider === 'youtube'
      ? this._extractYouTubeId(song)
      : null;
    const provider = youtubeId ? 'youtube' : providerFromTrack({
      provider: song.provider || song.source,
      url: song.url
    });
    const providerId = song.providerId || (provider === 'youtube' ? youtubeId : null);
    return deriveTrackIdentity({
      provider,
      providerId,
      url: song.url
    }, song.url || '');
  }

  persistQueue() {
    if (this._persistenceGuard.blocked) {
      return {
        success: false,
        blocked: true,
        reason: this._persistenceGuard.reason
      };
    }

    try {
      const stmt = this.db.prepare(
        `INSERT INTO plugin_music_bot_queue
          (id, position, title, artist, duration, thumbnail, url, youtubeId, provider, providerId,
           trackKey, channelId, channelName, source, requestedBy, requesterAvatar, isGiftRequest, addedAt)
          VALUES (@id, @position, @title, @artist, @duration, @thumbnail, @url, @youtubeId, @provider,
           @providerId, @trackKey, @channelId, @channelName, @source, @requestedBy, @requesterAvatar,
           @isGiftRequest, @addedAt)`
      );
      const writeSongs = (songs) => {
        this.db.prepare('DELETE FROM plugin_music_bot_queue').run();
        songs.forEach((song, idx) => {
          stmt.run({
            id: song.id,
            position: idx,
            title: song.title || '',
            artist: song.artist || '',
            duration: song.duration || null,
            thumbnail: song.thumbnail || null,
            url: song.url || '',
            youtubeId: song.youtubeId || null,
            provider: song.provider || null,
            providerId: song.providerId || null,
            trackKey: song.trackKey || null,
            channelId: song.channelId || null,
            channelName: song.channelName || null,
            source: song.source || 'youtube',
            requestedBy: song.requestedBy || 'viewer',
            requesterAvatar: song.requesterAvatar || null,
            isGiftRequest: song.isGiftRequest ? 1 : 0,
            addedAt: song.addedAt || Date.now()
          });
        });
      };
      const transaction = typeof this.db.transaction === 'function'
        ? this.db.transaction.bind(this.db)
        : this.db.db?.transaction?.bind(this.db.db);
      if (transaction) {
        transaction(writeSongs)(this.queue);
      } else {
        writeSongs(this.queue);
      }
      return { success: true, blocked: false, count: this.queue.length };
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to persist queue: ${error.message}`, 'error');
      return { success: false, blocked: false, error: error.message };
    }
  }

  restoreQueue(options = {}) {
    const wasPersistenceBlocked = this._persistenceGuard.blocked;
    const pendingEntries = wasPersistenceBlocked ? [...this.queue] : [];
    let restorePhase = 'read';
    try {
      const rows = this.db
        .prepare('SELECT * FROM plugin_music_bot_queue ORDER BY position ASC')
        .all();
      restorePhase = 'decode';
      const persistedEntries = rows.map((row) => this._entryFromPersistedRow(row));
      const duplicatesDisabled =
        this.queueConfig.duplicateDetection === 'off' || this.queueConfig.allowDuplicates;
      const seen = new Set();
      const restored = [];
      let deduped = 0;
      let banned = 0;

      let banCheckError = null;
      for (const entry of persistedEntries) {
        if (typeof options.isAllowed === 'function') {
          try {
            const decision = options.isAllowed(entry);
            const allowed = decision !== false && decision?.allowed !== false && decision?.banned !== true;
            if (!allowed) {
              banned += 1;
              continue;
            }
          } catch (error) {
            banCheckError = error;
            break;
          }
        }

        if (!duplicatesDisabled && seen.has(entry.trackKey)) {
          deduped += 1;
          continue;
        }
        seen.add(entry.trackKey);
        restored.push(entry);
      }

      if (banCheckError) {
        this.queue = wasPersistenceBlocked
          ? this._mergeQueueEntries(persistedEntries, pendingEntries)
          : this._mergeQueueEntries(this.queue, persistedEntries);
        this._rebuildRequesterState();
        this._clearPersistenceGuard();
        this.api.log?.(
          `[music-bot] Queue restore aborted because ban check failed: ${banCheckError.message}`,
          'error'
        );
        return {
          restored: rows.length,
          deduped: 0,
          banned: 0,
          error: 'ban-check-failed'
        };
      }

      this.queue = wasPersistenceBlocked
        ? this._mergeQueueEntries(restored, pendingEntries)
        : restored;
      this._rebuildRequesterState();
      this._clearPersistenceGuard();
      this.persistQueue();
      this.api.log?.(`[music-bot] Restored ${this.queue.length} songs from persistent queue`, 'info');
      return { restored: this.queue.length, deduped, banned };
    } catch (error) {
      const reason = restorePhase === 'read'
        ? 'restore-read-failed'
        : 'restore-decode-failed';
      this._engagePersistenceGuard(reason, error);
      this.api.log?.(`[music-bot] Failed to restore queue: ${error.message}`, 'error');
      return {
        restored: 0,
        deduped: 0,
        banned: 0,
        error: reason,
        persistenceBlocked: true
      };
    }
  }

  _persistHistory(track) {
    try {
      const identity = this._identityForSong(track);
      const stmt = this.db.prepare(
        `INSERT OR REPLACE INTO plugin_music_bot_history
          (id, youtubeId, provider, providerId, trackKey, channelId, channelName, title, artist,
           url, duration, requestedBy, source, thumbnail, finishedAt, skipped)
          VALUES (@id, @youtubeId, @provider, @providerId, @trackKey, @channelId, @channelName,
           @title, @artist, @url, @duration, @requestedBy, @source, @thumbnail, @finishedAt, @skipped)`
      );
      stmt.run({
        id: track.id || randomUUID(),
        youtubeId: identity.youtubeId || null,
        provider: identity.provider,
        providerId: identity.providerId,
        trackKey: identity.trackKey,
        channelId: track.channelId || null,
        channelName: track.channelName || null,
        title: track.title || '',
        artist: track.artist || '',
        url: track.url || '',
        duration: track.duration || null,
        requestedBy: track.requestedBy || 'viewer',
        source: track.source || identity.provider,
        thumbnail: track.thumbnail || null,
        finishedAt: track.finishedAt || Date.now(),
        skipped: track.skipped ? 1 : 0
      });
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to persist history: ${error.message}`, 'error');
    }
  }

  _ensureTables() {
    try {
      this.db
        .prepare(
          `CREATE TABLE IF NOT EXISTS plugin_music_bot_history (
            id TEXT PRIMARY KEY,
            youtubeId TEXT,
            title TEXT,
            artist TEXT,
            url TEXT,
            provider TEXT,
            providerId TEXT,
            trackKey TEXT,
            channelId TEXT,
            channelName TEXT,
            duration INTEGER,
            requestedBy TEXT,
            source TEXT,
            thumbnail TEXT,
            finishedAt INTEGER,
            skipped INTEGER DEFAULT 0
          )`
        )
        .run();
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to ensure history table: ${error.message}`, 'error');
    }

    this._ensureHistoryColumn('provider', 'TEXT');
    this._ensureHistoryColumn('providerId', 'TEXT');
    this._ensureHistoryColumn('trackKey', 'TEXT');
    this._ensureHistoryColumn('channelId', 'TEXT');
    this._ensureHistoryColumn('channelName', 'TEXT');

    try {
      this.db.prepare(
        'CREATE TABLE IF NOT EXISTS plugin_music_bot_autodj_exclusions (' +
        'id TEXT PRIMARY KEY, youtubeId TEXT, titleKey TEXT, artistKey TEXT, ' +
        'expiresAt INTEGER NOT NULL, reason TEXT NOT NULL, createdAt INTEGER NOT NULL)'
      ).run();
      this.db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_music_bot_autodj_exclusions_expiry ' +
        'ON plugin_music_bot_autodj_exclusions(expiresAt)'
      ).run();
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to ensure Auto-DJ exclusion table: ${error.message}`, 'error');
    }

    try {
      this.db
        .prepare(
          `CREATE TABLE IF NOT EXISTS plugin_music_bot_queue (
            id TEXT PRIMARY KEY,
            position INTEGER NOT NULL,
            title TEXT,
            artist TEXT,
            duration INTEGER,
            thumbnail TEXT,
            url TEXT,
            youtubeId TEXT,
            provider TEXT,
            providerId TEXT,
            trackKey TEXT,
            channelId TEXT,
            channelName TEXT,
            source TEXT,
            requestedBy TEXT,
            requesterAvatar TEXT,
            isGiftRequest INTEGER DEFAULT 0,
            addedAt INTEGER
          )`
        )
        .run();
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to ensure queue table: ${error.message}`, 'error');
    }

    this._ensureQueueColumn('requesterAvatar', 'TEXT');
    this._ensureQueueColumn('provider', 'TEXT');
    this._ensureQueueColumn('providerId', 'TEXT');
    this._ensureQueueColumn('trackKey', 'TEXT');
    this._ensureQueueColumn('channelId', 'TEXT');
    this._ensureQueueColumn('channelName', 'TEXT');
  }

  _entryFromPersistedRow(row) {
    const identity = this._identityForSong(row);
    return {
      id: row.id,
      title: row.title,
      artist: row.artist || '',
      duration: row.duration || null,
      thumbnail: row.thumbnail || null,
      url: row.url,
      youtubeId: identity.youtubeId || null,
      provider: identity.provider,
      providerId: identity.providerId,
      trackKey: identity.trackKey,
      channelId: row.channelId || null,
      channelName: row.channelName || null,
      source: row.source || identity.provider,
      requestedBy: row.requestedBy || 'viewer',
      requesterAvatar: row.requesterAvatar || null,
      requesterKey: this._normalizeRequesterKey(row.requestedBy || 'viewer'),
      isGiftRequest: Boolean(row.isGiftRequest),
      addedAt: row.addedAt || Date.now()
    };
  }

  _rebuildRequesterState() {
    this.userLastRequest.clear();
    this.queue.forEach((entry) => {
      if (entry.requesterKey) {
        this.userLastRequest.set(entry.requesterKey, entry.addedAt);
      }
    });
  }

  _mergeQueueEntries(primary, secondary) {
    const merged = [...primary];
    const ids = new Set(merged.map((entry) => entry.id).filter(Boolean));
    secondary.forEach((entry) => {
      if (entry.id && ids.has(entry.id)) return;
      merged.push(entry);
      if (entry.id) ids.add(entry.id);
    });
    return merged;
  }

  _engagePersistenceGuard(reason, error) {
    this._persistenceGuard = {
      blocked: true,
      reason,
      blockedAt: this._persistenceGuard.blockedAt || Date.now(),
      lastError: error?.message || String(error || reason)
    };
  }

  _clearPersistenceGuard() {
    this._persistenceGuard = {
      blocked: false,
      reason: null,
      blockedAt: null,
      lastError: null
    };
  }

  _ensureQueueColumn(name, definition) {
    try {
      this.db.prepare(`ALTER TABLE plugin_music_bot_queue ADD COLUMN ${name} ${definition}`).run();
    } catch (error) {
      if (!/duplicate column name/i.test(error.message)) {
        this.api.log?.(`[music-bot] Failed to ensure ${name} column: ${error.message}`, 'debug');
      }
    }
  }

  _ensureHistoryColumn(name, definition) {
    try {
      this.db.prepare(`ALTER TABLE plugin_music_bot_history ADD COLUMN ${name} ${definition}`).run();
    } catch (error) {
      if (!/duplicate column name/i.test(error.message)) {
        this.api.log?.(`[music-bot] Failed to ensure history ${name} column: ${error.message}`, 'debug');
      }
    }
  }

  _normalizeRequesterKey(value) {
    return String(value || '').trim().toLowerCase();
  }
}

module.exports = QueueManager;
