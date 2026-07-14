const { randomUUID } = require('crypto');

class AutoDJ {
  constructor(config, musicResolver, db, api) {
    this.api = api;
    this.db = db;
    this.musicResolver = musicResolver;
    this.playlistIndex = 0;
    this.playlistTrackIndices = new Map();
    this.relatedTrackIndices = new Map();
    this.lastPlaylistTrack = null;
    this.playedInSession = new Set();
    this.consecutiveCount = 0;
    this.lastResult = { state: 'idle', message: 'Auto-DJ bereit.' };
    this.updateConfig(config);
    this.isActive = this.config.enabled;
  }

  updateConfig(config) {
    const wasEnabled = Boolean(this.config?.enabled);
    this.config = {
      enabled: false,
      mode: 'history',
      historyMinPlays: 2,
      historyShuffled: true,
      maxConsecutiveAutoDJ: 10,
      announceAutoDJ: true,
      playlistUrls: [],
      playlistFallbackToRandom: true,
      ...(config || {})
    };
    if (!this.config.enabled) {
      this.isActive = false;
      this._setResult('disabled', 'Auto-DJ ist deaktiviert.');
    } else if (!wasEnabled) {
      this.activate();
    }
  }

  activate() {
    this.isActive = true;
    this.consecutiveCount = 0;
    this._setResult('ready', 'Auto-DJ wartet auf den naechsten freien Queue-Slot.');
  }

  deactivate() {
    this.isActive = false;
    this.consecutiveCount = 0;
    this._setResult('idle', 'Auto-DJ pausiert fuer Zuschauer-Requests.');
  }

  onSongRequested() {
    this.deactivate();
    this.playedInSession.clear();
  }

  async onQueueEmpty() {
    if (!this.config.enabled) {
      this._setResult('disabled', 'Auto-DJ ist deaktiviert.');
      return null;
    }
    this.isActive = true;
    this._setResult('selecting', 'Auto-DJ sucht den naechsten Titel.');
    return this.getNextSong();
  }

  async getNextSong(force = false) {
    if (!this.config.enabled) {
      this._setResult('disabled', 'Auto-DJ ist deaktiviert.');
      return null;
    }
    if (!force && !this.isActive) {
      this._setResult('idle', 'Auto-DJ wartet auf einen freien Queue-Slot.');
      return null;
    }

    if (!force && this.consecutiveCount >= this.config.maxConsecutiveAutoDJ) {
      this._setResult('limit-reached', `Auto-DJ-Limit von ${this.config.maxConsecutiveAutoDJ} Titeln erreicht.`);
      return null;
    }

    const track = await this._selectTrack();
    if (!track) {
      if (this.lastResult.state !== 'error' && this.lastResult.state !== 'no-playlist-context') {
        this._setResult('no-track', 'Kein passender Auto-DJ-Titel gefunden. Pruefe Playlist oder History.');
      }
      return null;
    }

    this._setResult('selected', `Ausgewaehlt: ${track.title || 'Unbekannter Titel'}`);
    return {
      song: {
        ...track,
        requestedBy: 'AutoDJ'
      },
      announce: this.config.announceAutoDJ
    };
  }

  reset() {
    this.consecutiveCount = 0;
    this.playedInSession.clear();
    this.playlistTrackIndices.clear();
    this.relatedTrackIndices.clear();
    this.lastPlaylistTrack = null;
  }

  markTrackStarted(track) {
    this.consecutiveCount += 1;
    this.isActive = true;
    if (track?.youtubeId) {
      this.playedInSession.add(track.youtubeId);
    }
    this._setResult('playing', `Spielt: ${track?.title || 'Unbekannter Titel'}`);
  }

  setPlaybackSeed(track) {
    if (!track?.youtubeId) return false;
    this.lastPlaylistTrack = { ...track };
    return true;
  }

  markPlaybackFailed(error) {
    this._setResult('error', `Wiedergabe fehlgeschlagen: ${error?.message || error || 'Unbekannter Fehler'}`);
  }

  getSelectionBlocks(now = Date.now()) {
    const cooldownMs = this._getRepeatCooldownMs();
    const blocks = {
      youtubeIds: new Set(),
      titleKeys: new Set(),
      artistKeys: new Set()
    };

    const addTrack = (track) => {
      const youtubeId = String(track.youtubeId || '').trim();
      const titleKey = this._normalizeText(track.titleKey ?? track.title);
      const artistKey = this._normalizeText(track.artistKey ?? track.artist);
      if (youtubeId) blocks.youtubeIds.add(youtubeId);
      if (titleKey) blocks.titleKeys.add(titleKey);
      if (artistKey) blocks.artistKeys.add(artistKey);
    };

    try {
      const history = this.db.prepare(
        `SELECT youtubeId, title, artist
         FROM plugin_music_bot_history
         WHERE COALESCE(skipped, 0) = 0 AND finishedAt >= ?`
      ).all(now - cooldownMs);
      history.forEach(addTrack);

      const exclusions = this.db.prepare(
        `SELECT youtubeId, titleKey, artistKey
         FROM plugin_music_bot_autodj_exclusions
         WHERE expiresAt > ?`
      ).all(now);
      exclusions.forEach(addTrack);
    } catch (error) {
      this.api.log?.(`[music-bot] AutoDJ block lookup failed: ${error.message}`, 'warn');
    }

    return blocks;
  }

  isTrackBlocked(track, blocks) {
    const youtubeId = String(track?.youtubeId || '').trim();
    const titleKey = this._normalizeText(track?.title);
    const artistKey = this._normalizeText(track?.artist);
    return Boolean(
      (youtubeId && blocks.youtubeIds.has(youtubeId)) ||
      (titleKey && blocks.titleKeys.has(titleKey)) ||
      (artistKey && blocks.artistKeys.has(artistKey))
    );
  }

  recordFailedTrack(track, reason, now = Date.now()) {
    const createdAt = now;
    try {
      this.db.prepare(
        `INSERT INTO plugin_music_bot_autodj_exclusions
          (id, youtubeId, titleKey, artistKey, expiresAt, reason, createdAt)
          VALUES (@id, @youtubeId, @titleKey, @artistKey, @expiresAt, @reason, @createdAt)`
      ).run({
        id: randomUUID(),
        youtubeId: String(track?.youtubeId || '').trim(),
        titleKey: this._normalizeText(track?.title),
        artistKey: this._normalizeText(track?.artist),
        expiresAt: createdAt + this._getRepeatCooldownMs(),
        reason: String(reason || ''),
        createdAt
      });
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to persist AutoDJ exclusion: ${error.message}`, 'warn');
    }
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      isActive: this.isActive,
      consecutiveCount: this.consecutiveCount,
      maxConsecutiveAutoDJ: this.config.maxConsecutiveAutoDJ,
      historyMinPlays: this.config.historyMinPlays,
      announceAutoDJ: this.config.announceAutoDJ,
      playlistUrls: this.config.playlistUrls,
      playlistFallbackToRandom: this.config.playlistFallbackToRandom,
      lastPlaylistTrack: this.lastPlaylistTrack
        ? {
          title: this.lastPlaylistTrack.title,
          artist: this.lastPlaylistTrack.artist || '',
          channelName: this.lastPlaylistTrack.channelName || ''
        }
        : null,
      lastResult: this.lastResult
    };
  }

  async _selectTrack() {
    try {
      switch (this.config.mode) {
        case 'playlist':
          return this._pickFromPlaylist();
        case 'random':
          return this._pickRelatedToLastPlaylistTrack();
        case 'history':
        default:
          return this._pickFromHistory();
      }
    } catch (error) {
      this.api.log?.(`[music-bot] AutoDJ selection failed: ${error.message}`, 'error');
      this._setResult('error', `Auswahl fehlgeschlagen: ${error.message}`);
      return null;
    }
  }

  _nextPlaylistItem() {
    const playlist = this.config.playlist || this.config.playlistUrls;
    if (!Array.isArray(playlist) || playlist.length === 0) return null;
    const item = playlist[this.playlistIndex % playlist.length];
    this.playlistIndex = (this.playlistIndex + 1) % playlist.length;
    return item;
  }

  async _pickFromPlaylist() {
    const playlist = this.config.playlist || this.config.playlistUrls;
    const attempts = Array.isArray(playlist) ? playlist.length : 0;
    for (let i = 0; i < attempts; i += 1) {
      const item = this._nextPlaylistItem();
      if (!item) break;
      try {
        const playlistItem = this.playlistTrackIndices.get(item) || 1;
        const resolved = this.musicResolver.resolvePlaylistEntry
          ? await this.musicResolver.resolvePlaylistEntry(item, playlistItem)
          : await this.musicResolver.resolve(item);
        if (resolved?.success) {
          this.playlistTrackIndices.set(item, playlistItem + 1);
          this.lastPlaylistTrack = resolved.song;
          return resolved.song;
        }
      } catch (error) {
        this.api.log?.(`[music-bot] AutoDJ playlist resolve failed: ${error.message}`, 'error');
      }
    }

    if (this.config.playlistFallbackToRandom !== false) {
      this._setResult('playlist-finished', 'Playlist ist beendet oder nicht verfuegbar. Auto-DJ startet passende Titel aus dem Playlist-Radio.');
      return this._pickRelatedToLastPlaylistTrack();
    }
    return null;
  }

  async _pickRelatedToLastPlaylistTrack() {
    if (!this.lastPlaylistTrack?.youtubeId) {
      this._seedRandomModeFromHistory();
    }
    const seed = this.lastPlaylistTrack;
    if (!seed?.youtubeId || !this.musicResolver.resolvePlaylistEntry) {
      this._setResult('no-playlist-context', 'Es fehlt ein zuletzt gespielter Playlist-Titel als Stilvorlage.');
      return null;
    }

    const encodedId = encodeURIComponent(seed.youtubeId);
    const radioUrl = `https://www.youtube.com/watch?v=${encodedId}&list=RD${encodedId}`;
    let playlistItem = this.relatedTrackIndices.get(radioUrl) || 2;
    let fallback = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      let resolved;
      try {
        resolved = await this.musicResolver.resolvePlaylistEntry(radioUrl, playlistItem);
      } catch (error) {
        this.api.log?.(`[music-bot] AutoDJ playlist radio lookup failed: ${error.message}`, 'warn');
        playlistItem += 1;
        continue;
      }
      playlistItem += 1;
      if (!resolved?.success || !resolved.song) continue;

      if (resolved.song.youtubeId === seed.youtubeId) continue;
      if (!fallback) fallback = resolved.song;
      if (!resolved.song.youtubeId || !this.playedInSession.has(resolved.song.youtubeId)) {
        this.relatedTrackIndices.set(radioUrl, playlistItem);
        return resolved.song;
      }
    }

    this.relatedTrackIndices.set(radioUrl, playlistItem);
    return fallback;
  }

  _seedRandomModeFromHistory() {
    try {
      const seed = this.db.prepare(
        `SELECT youtubeId, title, artist, url, duration, source, thumbnail
         FROM plugin_music_bot_history
         WHERE youtubeId IS NOT NULL AND TRIM(youtubeId) != '' AND COALESCE(skipped, 0) = 0
         ORDER BY finishedAt DESC
         LIMIT 1`
      ).get();
      return this.setPlaybackSeed(seed);
    } catch (error) {
      this.api.log?.(`[music-bot] AutoDJ history seed lookup failed: ${error.message}`, 'warn');
      return false;
    }
  }

  async _pickFromHistory() {
    const minPlays = Math.max(Number(this.config.historyMinPlays) || 1, 1);
    const orderClause = this.config.historyShuffled ? 'ORDER BY RANDOM()' : 'ORDER BY finishedAt DESC';
    const rows = this.db
      .prepare(
        `SELECT youtubeId, title, artist, url, duration, source, thumbnail, COUNT(*) as plays
         FROM plugin_music_bot_history
         WHERE youtubeId IS NOT NULL
         GROUP BY youtubeId, title, artist, url, duration, source, thumbnail
         HAVING plays >= ?
         ${orderClause}
         LIMIT 20`
      )
      .all(minPlays);

    const candidate = rows.find((row) => !this.playedInSession.has(row.youtubeId)) || rows[0];
    if (!candidate) return this._pickRelatedToLastPlaylistTrack();

    return {
      title: candidate.title,
      artist: candidate.artist,
      url: candidate.url,
      duration: candidate.duration,
      source: candidate.source || 'youtube',
      thumbnail: candidate.thumbnail,
      youtubeId: candidate.youtubeId
    };
  }

  _setResult(state, message) {
    this.lastResult = {
      state,
      message,
      updatedAt: Date.now()
    };
  }

  _getRepeatCooldownMs() {
    return Math.max(Number(this.config.repeatCooldownHours) || 0, 0) * 60 * 60 * 1000;
  }

  _normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }
}

module.exports = AutoDJ;
