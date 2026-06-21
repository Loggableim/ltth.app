const { randomUUID } = require('crypto');

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

    const youtubeId = this._extractYouTubeId(song);

    const requesterKey = this._normalizeRequesterKey(song.requestedBy);
    const songEntry = {
      id: song.id || randomUUID(),
      title: song.title,
      artist: song.artist || '',
      duration: song.duration || null,
      thumbnail: song.thumbnail || null,
      url: song.url,
      youtubeId: youtubeId || null,
      source: song.source || 'youtube',
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

    const youtubeId = this._extractYouTubeId(song);

    for (let i = 0; i < this.queue.length; i += 1) {
      const entry = this.queue[i];
      if (mode === 'strict') {
        if (
          (youtubeId && entry.youtubeId && youtubeId === entry.youtubeId) ||
          entry.url === song.url
        ) {
          return { position: i + 1, entry, matchType: youtubeId ? 'youtubeId' : 'url' };
        }
      }

      if (
        mode === 'fuzzy' &&
        (this.isFuzzyMatch(entry.title, song.title) ||
          (youtubeId && entry.youtubeId && youtubeId === entry.youtubeId))
      ) {
        return { position: i + 1, entry, matchType: 'fuzzy' };
      }
    }
    return null;
  }

  _extractYouTubeId(song) {
    if (song.youtubeId) return song.youtubeId;
    const url = song.url || '';
    const match = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{6,})/
    );
    return match ? match[1] : null;
  }

  persistQueue() {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO plugin_music_bot_queue
          (id, position, title, artist, duration, thumbnail, url, youtubeId, source, requestedBy, requesterAvatar, isGiftRequest, addedAt)
          VALUES (@id, @position, @title, @artist, @duration, @thumbnail, @url, @youtubeId, @source, @requestedBy, @requesterAvatar, @isGiftRequest, @addedAt)`
      );
      const persist = this.db.transaction((songs) => {
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
            source: song.source || 'youtube',
            requestedBy: song.requestedBy || 'viewer',
            requesterAvatar: song.requesterAvatar || null,
            isGiftRequest: song.isGiftRequest ? 1 : 0,
            addedAt: song.addedAt || Date.now()
          });
        });
      });
      persist(this.queue);
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to persist queue: ${error.message}`, 'error');
    }
  }

  restoreQueue() {
    try {
      const rows = this.db
        .prepare('SELECT * FROM plugin_music_bot_queue ORDER BY position ASC')
        .all();
      this.queue = rows.map(row => ({
        id: row.id,
        title: row.title,
        artist: row.artist || '',
        duration: row.duration || null,
        thumbnail: row.thumbnail || null,
        url: row.url,
        youtubeId: row.youtubeId || null,
        source: row.source || 'youtube',
        requestedBy: row.requestedBy || 'viewer',
        requesterAvatar: row.requesterAvatar || null,
        requesterKey: this._normalizeRequesterKey(row.requestedBy || 'viewer'),
        isGiftRequest: Boolean(row.isGiftRequest),
        addedAt: row.addedAt || Date.now()
      }));
      this.api.log?.(`[music-bot] Restored ${this.queue.length} songs from persistent queue`, 'info');
      return this.queue.length;
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to restore queue: ${error.message}`, 'error');
      return 0;
    }
  }

  _persistHistory(track) {
    try {
      const stmt = this.db.prepare(
        `INSERT OR REPLACE INTO plugin_music_bot_history
          (id, youtubeId, title, artist, url, duration, requestedBy, source, thumbnail, finishedAt, skipped)
          VALUES (@id, @youtubeId, @title, @artist, @url, @duration, @requestedBy, @source, @thumbnail, @finishedAt, @skipped)`
      );
      stmt.run({
        id: track.id || randomUUID(),
        youtubeId: track.youtubeId || this._extractYouTubeId(track),
        title: track.title || '',
        artist: track.artist || '',
        url: track.url || '',
        duration: track.duration || null,
        requestedBy: track.requestedBy || 'viewer',
        source: track.source || 'youtube',
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

    try {
      this.db
        .prepare('ALTER TABLE plugin_music_bot_queue ADD COLUMN requesterAvatar TEXT')
        .run();
    } catch (error) {
      if (!/duplicate column name/i.test(error.message)) {
        this.api.log?.(`[music-bot] Failed to ensure requesterAvatar column: ${error.message}`, 'debug');
      }
    }
  }

  _normalizeRequesterKey(value) {
    return String(value || '').trim().toLowerCase();
  }
}

module.exports = QueueManager;
