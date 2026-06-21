const DEFAULT_RANDOM_KEYWORDS = ['lofi hip hop', 'chill music', 'gaming music', 'study mix'];

class AutoDJ {
  constructor(config, musicResolver, db, api) {
    this.api = api;
    this.db = db;
    this.musicResolver = musicResolver;
    this.playlistIndex = 0;
    this.playedInSession = new Set();
    this.consecutiveCount = 0;
    this.updateConfig(config);
    this.isActive = this.config.enabled;
  }

  updateConfig(config) {
    this.config = {
      enabled: false,
      mode: 'history',
      historyMinPlays: 2,
      historyShuffled: true,
      maxConsecutiveAutoDJ: 10,
      announceAutoDJ: true,
      randomKeywords: DEFAULT_RANDOM_KEYWORDS,
      playlistUrls: [],
      ...(config || {})
    };
    if (!this.config.enabled) {
      this.isActive = false;
    }
  }

  activate() {
    this.isActive = true;
    this.consecutiveCount = 0;
  }

  deactivate() {
    this.isActive = false;
    this.consecutiveCount = 0;
  }

  onSongRequested() {
    this.deactivate();
    this.playedInSession.clear();
  }

  async onQueueEmpty() {
    if (!this.config.enabled) return null;
    this.isActive = true;
    return this.getNextSong();
  }

  async getNextSong(force = false) {
    if (!this.config.enabled) return null;
    if (!force && !this.isActive) return null;

    if (!force && this.consecutiveCount >= this.config.maxConsecutiveAutoDJ) {
      return null;
    }

    const track = await this._selectTrack();
    if (!track) return null;

    this.consecutiveCount += 1;
    this.isActive = true;
    if (track.youtubeId) {
      this.playedInSession.add(track.youtubeId);
    }

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
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      isActive: this.isActive,
      consecutiveCount: this.consecutiveCount,
      maxConsecutiveAutoDJ: this.config.maxConsecutiveAutoDJ,
      historyMinPlays: this.config.historyMinPlays,
      announceAutoDJ: this.config.announceAutoDJ
    };
  }

  async _selectTrack() {
    try {
      switch (this.config.mode) {
        case 'playlist':
          return this._pickFromPlaylist();
        case 'random':
          return this._pickRandom();
        case 'history':
        default:
          return this._pickFromHistory();
      }
    } catch (error) {
      this.api.log?.(`[music-bot] AutoDJ selection failed: ${error.message}`, 'error');
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
        const resolved = await this.musicResolver.resolve(item);
        if (resolved?.success) {
          return resolved.song;
        }
      } catch (error) {
        this.api.log?.(`[music-bot] AutoDJ playlist resolve failed: ${error.message}`, 'error');
      }
    }
    return null;
  }

  async _pickRandom() {
    const keywords =
      Array.isArray(this.config.randomKeywords) && this.config.randomKeywords.length
        ? this.config.randomKeywords
        : DEFAULT_RANDOM_KEYWORDS;
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];
    const resolved = await this.musicResolver.resolve(keyword);
    return resolved?.success ? resolved.song : null;
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
    if (!candidate) return this._pickRandom();

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
}

module.exports = AutoDJ;
