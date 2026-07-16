const { EventEmitter } = require('events');
const https = require('https');
const YtDlpRunner = require('./yt-dlp-runner');
const {
  deriveTrackIdentity,
  extractYouTubeId,
  normalizeRequestKey,
  normalizeText
} = require('./track-identity');

let YOUTUBE_DL_PATH = 'yt-dlp';
try {
  const youtubeDlExec = require('youtube-dl-exec');
  if (youtubeDlExec?.constants?.YOUTUBE_DL_PATH) {
    YOUTUBE_DL_PATH = youtubeDlExec.constants.YOUTUBE_DL_PATH;
  }
} catch (_error) {
  // youtube-dl-exec is optional; a configured system binary remains supported.
}

const TOTAL_BUDGET_MS = 45000;
const YOUTUBE_BUDGET_MS = 30000;
const SOUNDCLOUD_RESERVE_MS = 15000;
const DEFAULT_CACHE_TTL_DAYS = 30;
const DEFAULT_CACHE_SIZE_MB = 2048;
const DEFAULT_MODERATION = {
  rejectExplicit: false,
  rejectAgeRestricted: true,
  blockedKeywords: []
};

function abortError(message = 'Resolver operation aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

class MusicResolver extends EventEmitter {
  constructor(config, api, options = {}) {
    super();
    this.api = api || { log() {} };
    this.cache = new Map();
    this.cacheSizeBytes = 0;
    this.inFlight = new Map();
    this.nextSubscriberId = 1;
    this.destroyed = false;
    this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    this.runner = options.runner || new YtDlpRunner({
      maxConcurrent: 2,
      maxQueue: 100,
      logger: this.api
    });
    this.updateConfig(config);
  }

  static resolveYtDlpPath(configured) {
    return (!configured || configured === 'yt-dlp') ? YOUTUBE_DL_PATH : configured;
  }

  updateConfig(config = {}) {
    const cacheTTLDays = Number(config?.cacheTTLDays);
    const maxCacheSizeMB = Number(config?.maxCacheSizeMB);
    this.config = {
      ...config,
      ytdlpPath: MusicResolver.resolveYtDlpPath(config?.ytdlpPath),
      searchTimeout: TOTAL_BUDGET_MS,
      cacheTTLDays: Number.isFinite(cacheTTLDays) && cacheTTLDays > 0
        ? cacheTTLDays
        : DEFAULT_CACHE_TTL_DAYS,
      maxCacheSizeMB: Number.isFinite(maxCacheSizeMB) && maxCacheSizeMB > 0
        ? maxCacheSizeMB
        : DEFAULT_CACHE_SIZE_MB,
      moderation: {
        ...DEFAULT_MODERATION,
        ...(config?.moderation || {})
      }
    };
  }

  resolve(query, { signal } = {}) {
    if (!query || !String(query).trim()) return Promise.reject(new Error('Missing query'));
    if (this.destroyed) return Promise.reject(abortError('Resolver is destroyed'));
    const trimmed = String(query).trim();
    const cacheKey = normalizeRequestKey(trimmed);
    const cacheHit = this._fromCache(cacheKey);
    if (cacheHit) return Promise.resolve(this._revalidateCached(cacheHit));
    const deadline = Date.now() + TOTAL_BUDGET_MS;

    return this._subscribe(cacheKey, signal, async (operationSignal) => {
      return this._resolveUncached(trimmed, operationSignal, deadline);
    });
  }

  resolvePlaylistEntry(url, playlistItem = 1, { signal } = {}) {
    if (!this._isYouTubePlaylistUrl(url)) {
      return Promise.reject(new Error('Only YouTube playlist URLs are supported for playlist playback.'));
    }
    if (this.destroyed) return Promise.reject(abortError('Resolver is destroyed'));
    const index = Math.max(1, Math.floor(Number(playlistItem) || 1));
    const cacheKey = normalizeRequestKey(`playlist:${url}:${index}`);
    const cacheHit = this._fromCache(cacheKey);
    if (cacheHit) return Promise.resolve(this._revalidateCached(cacheHit));

    return this._subscribe(cacheKey, signal, async (operationSignal) => {
      return this._resolvePlaylistUncached(url, index, operationSignal);
    });
  }

  cancelAll() {
    const entries = [...this.inFlight.values()];
    this.inFlight.clear();
    for (const entry of entries) {
      entry.invalidated = true;
      entry.controller.abort();
      for (const subscriber of entry.subscribers.values()) {
        this._settleSubscriber(subscriber, abortError());
      }
      entry.subscribers.clear();
    }
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelAll();
    await this.runner.destroy?.();
    this.cache.clear();
    this.cacheSizeBytes = 0;
    this.removeAllListeners();
  }

  getResolverStatus() {
    return {
      inFlight: this.inFlight.size,
      cacheEntries: this.cache.size,
      cacheSizeBytes: this.cacheSizeBytes,
      destroyed: this.destroyed,
      runner: this.runner.getStatus?.() || { active: 0, queued: 0 }
    };
  }

  _subscribe(key, signal, executor) {
    if (signal?.aborted) return Promise.reject(abortError());
    let entry = this.inFlight.get(key);
    if (!entry) {
      entry = {
        key,
        controller: new AbortController(),
        subscribers: new Map(),
        invalidated: false
      };
      this.inFlight.set(key, entry);
      this._progress('queued', key);
      entry.operation = Promise.resolve()
        .then(() => executor(entry.controller.signal))
        .then(
          (value) => this._finishEntry(entry, null, value),
          (error) => this._finishEntry(entry, error)
        );
    }

    return new Promise((resolve, reject) => {
      const subscriber = {
        id: this.nextSubscriberId++,
        signal: signal || null,
        resolve,
        reject,
        settled: false
      };
      subscriber.onAbort = () => {
        entry.subscribers.delete(subscriber.id);
        this._settleSubscriber(subscriber, abortError());
        if (entry.subscribers.size === 0) {
          entry.invalidated = true;
          if (this.inFlight.get(entry.key) === entry) this.inFlight.delete(entry.key);
          entry.controller.abort();
        }
      };
      signal?.addEventListener('abort', subscriber.onAbort, { once: true });
      entry.subscribers.set(subscriber.id, subscriber);
    });
  }

  _finishEntry(entry, error, value) {
    const isCurrent = !entry.invalidated && this.inFlight.get(entry.key) === entry;
    if (!isCurrent) return;
    this.inFlight.delete(entry.key);
    if (!error) this._addToCache(entry.key, value);
    if (error) this._progress('failed', entry.key, { error: error.message });
    else this._progress(value?.success === false ? 'failed' : 'ready', entry.key);
    for (const subscriber of entry.subscribers.values()) {
      this._settleSubscriber(subscriber, error, value);
    }
    entry.subscribers.clear();
  }

  _settleSubscriber(subscriber, error, value) {
    if (subscriber.settled) return;
    subscriber.settled = true;
    subscriber.signal?.removeEventListener('abort', subscriber.onAbort);
    if (error) subscriber.reject(error);
    else subscriber.resolve(value);
  }

  async _resolveUncached(trimmed, signal, deadline) {
    const isUrl = /^https?:\/\//i.test(trimmed);
    if (isUrl && !this._isSupportedSourceUrl(trimmed)) {
      throw new Error('Only YouTube and SoundCloud URLs are supported for direct song requests.');
    }
    if (isUrl && this._isYouTubePlaylistUrl(trimmed)) {
      return this._resolvePlaylistUncached(trimmed, 1, signal);
    }
    if (isUrl) return this._resolveDirect(trimmed, signal, deadline);
    return this._resolveText(trimmed, signal, deadline);
  }

  async _resolveText(query, signal, overallDeadline = Date.now() + TOTAL_BUDGET_MS) {
    const startedAt = overallDeadline - TOTAL_BUDGET_MS;
    const youtubeDeadline = Math.min(
      overallDeadline - SOUNDCLOUD_RESERVE_MS,
      startedAt + YOUTUBE_BUDGET_MS
    );
    const normalizedQuery = normalizeRequestKey(query);

    this._progress('searching-youtube', normalizedQuery);
    let youtubeCandidates = [];
    try {
      youtubeCandidates = await this._searchProvider(`ytsearch5:${normalizedQuery}`, youtubeDeadline, signal);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      this.api.log?.(`[music-bot] YouTube search failed: ${error.message}`, 'warn');
    }
    this._progress('validating', normalizedQuery, { provider: 'youtube' });
    const youtube = this._selectCandidate(youtubeCandidates, normalizedQuery);
    if (youtube) return { success: true, song: youtube };

    if (Date.now() >= overallDeadline) {
      const error = new Error('yt-dlp timed out');
      error.code = 'ETIMEDOUT';
      throw error;
    }

    this._progress('searching-soundcloud', normalizedQuery);
    let soundCloudCandidates = [];
    try {
      soundCloudCandidates = await this._searchProvider(`scsearch5:${normalizedQuery}`, overallDeadline, signal);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      this.api.log?.(`[music-bot] SoundCloud search failed: ${error.message}`, 'warn');
      throw error;
    }
    this._progress('validating', normalizedQuery, { provider: 'soundcloud' });
    const soundCloud = this._selectCandidate(soundCloudCandidates, normalizedQuery);
    if (soundCloud) return { success: true, song: soundCloud };

    return {
      success: false,
      reason: 'not_found',
      message: 'No playable YouTube or SoundCloud result found'
    };
  }

  async _resolveDirect(url, signal, deadline = Date.now() + TOTAL_BUDGET_MS) {
    const args = this._directArgs(url);
    let output;
    try {
      output = await this._runYtDlp(args, { deadline, signal });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (error.ytdlpNotFound && this._extractYouTubeId(url)) {
        this.api.log?.('[music-bot] yt-dlp not found; using YouTube oEmbed fallback', 'warn');
        return this._resolveViaOEmbed(url, signal);
      }
      if (error.ytdlpNotFound && this._isSoundCloudUrl(url)) {
        this.api.log?.('[music-bot] yt-dlp not found; using SoundCloud oEmbed fallback', 'warn');
        return this._resolveSoundCloudOEmbed(url, signal);
      }
      throw error;
    }
    return this._createSongResponse(output, url, true);
  }

  async _resolvePlaylistUncached(url, index, signal) {
    const args = [
      '--no-warnings', '--ignore-errors', '--skip-download',
      '--playlist-items', String(index), '--format', 'bestaudio/best',
      '--print', '%(age_limit)s', '--print', '%(channel_id)s',
      '--print', '%(channel)s', '--print', '%(categories)s',
      '--dump-json', url
    ];
    const output = await this._runYtDlp(args, { deadline: Date.now() + TOTAL_BUDGET_MS, signal });
    return this._createSongResponse(output, url, true);
  }

  _directArgs(target) {
    return [
      '--no-warnings', '--ignore-errors', '--skip-download', '--no-playlist',
      '--format', 'bestaudio/best', '--print', '%(age_limit)s',
      '--print', '%(channel_id)s', '--print', '%(channel)s',
      '--print', '%(categories)s', '--dump-json', target
    ];
  }

  async _searchProvider(target, deadline, signal) {
    const args = [
      '--no-warnings', '--ignore-errors', '--skip-download', '--no-playlist',
      '--format', 'bestaudio/best', '--dump-single-json', target
    ];
    const output = await this._runYtDlp(args, { deadline, signal });
    return this._parseCandidateOutput(output).slice(0, 5);
  }

  async _runYtDlp(args, options = {}) {
    const deadline = Number.isFinite(options.deadline) ? options.deadline : Date.now() + TOTAL_BUDGET_MS;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (options.signal?.aborted) throw abortError();
      if (Date.now() >= deadline) {
        const error = new Error('yt-dlp timed out');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      try {
        const output = await this._runYtDlpOnce(args, { ...options, deadline });
        if (String(output || '').trim()) return output;
        const empty = new Error('Empty yt-dlp response');
        empty.code = 'EEMPTY';
        throw empty;
      } catch (error) {
        lastError = error;
        if (attempt >= 2 || !this._isTransient(error) || Date.now() >= deadline) throw error;
        this.api.log?.(`[music-bot] yt-dlp attempt ${attempt}/2 failed: ${error.message}`, 'warn');
      }
    }
    throw lastError || new Error('Empty yt-dlp response');
  }

  _runYtDlpOnce(args, options = {}) {
    return this.runner.run(this.config.ytdlpPath, args, {
      signal: options.signal,
      deadline: options.deadline,
      priority: options.priority || 0
    });
  }

  _isTransient(error) {
    if (!error || error.name === 'AbortError' || error.ytdlpNotFound) return false;
    if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'EEMPTY'].includes(error.code)) return true;
    return /timed out|temporar|network|connection reset|http error 5\d\d/i.test(error.message || '');
  }

  _parseCandidateOutput(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      if (Array.isArray(parsed.entries)) return parsed.entries.filter(Boolean);
      return parsed ? [parsed] : [];
    } catch (_error) {
      return text.split(/\r?\n/).map((line) => {
        try { return JSON.parse(line); } catch (_parseError) { return null; }
      }).filter(Boolean);
    }
  }

  _selectCandidate(candidates, query) {
    const ranked = [];
    for (const data of candidates.slice(0, 5)) {
      const song = this._songFromData(data, data.webpage_url || data.original_url || '');
      const duration = Number(song.duration);
      const maxDuration = Number(this.config.maxDurationSeconds || this.config.maxSongDuration || Infinity);
      if (!Number.isFinite(duration) || duration <= 0) continue;
      if (Number.isFinite(maxDuration) && maxDuration > 0 && duration > maxDuration) continue;
      if (!this._hasPlayableLocator(song)) continue;
      if (this._applyModeration(song)) continue;
      const score = this._candidateScore(query, song);
      if (score <= 0) continue;
      ranked.push({ song, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked[0]?.song || null;
  }

  _hasPlayableLocator(song) {
    if (String(song.localPath || '').trim()) return true;
    if (/^https?:\/\//i.test(String(song.streamUrl || ''))) return true;
    return /^https?:\/\//i.test(String(song.url || ''));
  }

  _candidateScore(query, song) {
    const tokens = normalizeText(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (!tokens.length) return 0;
    const title = normalizeText(song.title);
    const artist = normalizeText(`${song.artist || ''} ${song.channelName || ''}`);
    const combined = `${title} ${artist}`;
    const matches = tokens.filter((token) => combined.includes(token)).length;
    const coverage = matches / tokens.length;
    if (coverage < 0.5) return 0;
    let score = coverage * 100;
    score += tokens.filter((token) => title.includes(token)).length * 5;
    const unwanted = ['karaoke', 'nightcore', 'slowed', 'remix', 'live', 'cover', 'instrumental', 'lyrics'];
    for (const word of unwanted) {
      if (title.includes(word) && !tokens.includes(word)) score -= 20;
    }
    return score;
  }

  _createSongResponse(output, fallbackUrl, isUrl) {
    const { data, meta } = this._parseYtDlpOutput(output);
    const song = this._songFromData(data, fallbackUrl, meta, isUrl);
    const moderationResult = this._applyModeration(song);
    return moderationResult || { success: true, song };
  }

  _songFromData(data = {}, fallbackUrl = '', meta = {}, isUrl = false) {
    const ageLimit = Number.isFinite(meta.ageLimit) ? meta.ageLimit : Number(data.age_limit ?? NaN);
    const channelName = data.channel || data.uploader || meta.channelName || '';
    let canonicalUrl = data.webpage_url || data.original_url || fallbackUrl || data.url || '';
    const identity = deriveTrackIdentity(data, canonicalUrl);
    if (
      identity.provider === 'youtube'
      && !/^https?:\/\//i.test(String(canonicalUrl))
      && /^[A-Za-z0-9_-]{11}$/.test(identity.providerId)
    ) {
      canonicalUrl = `https://www.youtube.com/watch?v=${identity.providerId}`;
    }
    return {
      title: data.title || fallbackUrl,
      artist: data.artist || data.creator || data.uploader || '',
      duration: data.duration == null ? null : Number(data.duration),
      thumbnail: Array.isArray(data.thumbnails) ? data.thumbnails.at(-1)?.url : data.thumbnail,
      url: canonicalUrl,
      streamUrl: /^https?:\/\//i.test(String(data.url || '')) ? data.url : null,
      streamHeaders: data.http_headers && typeof data.http_headers === 'object' ? data.http_headers : null,
      localPath: null,
      source: identity.provider === 'url' ? (data.extractor || (isUrl ? 'url' : 'youtube')) : identity.provider,
      provider: identity.provider,
      providerId: identity.providerId,
      trackKey: identity.trackKey,
      youtubeId: identity.youtubeId,
      channelId: data.channel_id || meta.channelId || null,
      channelName,
      ageLimit: Number.isFinite(ageLimit) ? ageLimit : null,
      categories: Array.isArray(data.categories) && data.categories.length ? data.categories : (meta.categories || [])
    };
  }

  _parseYtDlpOutput(raw) {
    const lines = String(raw || '').trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) throw new Error('Empty yt-dlp response');
    let data;
    try {
      data = JSON.parse(lines.pop());
    } catch (_error) {
      throw new Error('Invalid yt-dlp JSON response');
    }
    const metaLines = lines.slice(-4);
    return {
      data,
      meta: {
        ageLimit: Number.parseInt(metaLines[0], 10),
        channelId: metaLines[1] || null,
        channelName: metaLines[2] || null,
        categories: this._parseCategories(metaLines[3])
      }
    };
  }

  _parseCategories(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(String(raw).replace(/'/g, '"'));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return String(raw).split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  _applyModeration(song) {
    const moderation = this.config.moderation || {};
    if (Number.isFinite(song.ageLimit) && song.ageLimit >= 18 && moderation.rejectAgeRestricted) {
      return { success: false, reason: 'age_restricted', message: 'This video is age-restricted and cannot be played' };
    }
    const title = normalizeText(song.title);
    const channelName = normalizeText(song.channelName);
    for (const keyword of Array.isArray(moderation.blockedKeywords) ? moderation.blockedKeywords : []) {
      const needle = normalizeText(keyword);
      if (needle && (title.includes(needle) || channelName.includes(needle))) {
        return { success: false, reason: 'blocked_keyword', keyword, message: `This song is blocked (keyword: "${keyword}")` };
      }
    }
    if (moderation.rejectExplicit) {
      const categories = Array.isArray(song.categories) ? song.categories.map(normalizeText) : [];
      const explicitWords = ['explicit', 'nsfw', 'adult', 'porn', 'sexual', '18+', 'age-restricted'];
      if (categories.some((category) => explicitWords.some((word) => category.includes(word)))) {
        return { success: false, reason: 'explicit', message: 'This song was rejected due to explicit metadata' };
      }
    }
    return null;
  }

  _revalidateCached(value) {
    if (value?.success && value.song) return this._applyModeration(value.song) || value;
    return value;
  }

  _extractYouTubeId(url) {
    return extractYouTubeId(url);
  }

  _isSoundCloudUrl(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      return host === 'soundcloud.com' || host === 'on.soundcloud.com';
    } catch (_error) {
      return false;
    }
  }

  _isSupportedSourceUrl(url) {
    return Boolean(this._extractYouTubeId(url)) || this._isYouTubePlaylistUrl(url) || this._isSoundCloudUrl(url);
  }

  _isYouTubePlaylistUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      if (!['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) return false;
      return Boolean(parsed.searchParams.get('list')) && ['/playlist', '/watch'].includes(parsed.pathname);
    } catch (_error) {
      return false;
    }
  }

  async _resolveViaOEmbed(url, signal) {
    const json = await this._getJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, signal, 'oEmbed');
    const data = {
      id: this._extractYouTubeId(url),
      title: json.title || url,
      uploader: json.author_name || '',
      thumbnail: json.thumbnail_url || null,
      webpage_url: url,
      extractor: 'youtube'
    };
    const song = this._songFromData(data, url, {}, true);
    return this._applyModeration(song) || { success: true, song };
  }

  async _resolveSoundCloudOEmbed(url, signal) {
    const json = await this._getJson(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`, signal, 'SoundCloud oEmbed');
    const data = {
      title: json.title || url,
      uploader: json.author_name || '',
      thumbnail: json.thumbnail_url || null,
      webpage_url: url,
      extractor: 'soundcloud'
    };
    const song = this._songFromData(data, url, {}, true);
    return this._applyModeration(song) || { success: true, song };
  }

  _getJson(url, signal, label) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve(value);
      };
      const request = https.get(url, (response) => {
        let raw = '';
        response.on('data', (chunk) => { raw += chunk; });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            finish(new Error(`${label} HTTP ${response.statusCode}`));
            return;
          }
          try { finish(null, JSON.parse(raw)); } catch (error) { finish(new Error(`${label} parse error: ${error.message}`)); }
        });
      });
      const onAbort = () => {
        request.destroy();
        finish(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      request.on('error', (error) => finish(new Error(`${label} request failed: ${error.message}`)));
      request.setTimeout(8000, () => {
        request.destroy();
        finish(new Error(`${label} request timed out`));
      });
    });
  }

  _fromCache(key) {
    const normalized = normalizeRequestKey(key);
    const entry = this.cache.get(normalized);
    if (!entry) return null;
    const ttlMs = this.config.cacheTTLDays * 24 * 60 * 60 * 1000;
    if (Date.now() - entry.timestamp > ttlMs) {
      this.cache.delete(normalized);
      this.cacheSizeBytes = Math.max(0, this.cacheSizeBytes - entry.size);
      return null;
    }
    return entry.value;
  }

  _addToCache(key, value) {
    const normalized = normalizeRequestKey(key);
    const serialized = JSON.stringify(value);
    const size = Buffer.byteLength(serialized, 'utf8');
    const previous = this.cache.get(normalized);
    if (previous) this.cacheSizeBytes -= previous.size;
    this.cache.set(normalized, { value, timestamp: Date.now(), size });
    this.cacheSizeBytes += size;
    this._enforceCacheLimit();
  }

  _enforceCacheLimit() {
    const maxBytes = this.config.maxCacheSizeMB * 1024 * 1024;
    if (this.cacheSizeBytes <= maxBytes) return;
    const entries = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (const [key, entry] of entries) {
      if (this.cacheSizeBytes <= maxBytes) break;
      this.cache.delete(key);
      this.cacheSizeBytes = Math.max(0, this.cacheSizeBytes - entry.size);
    }
  }

  _progress(state, key, details = {}) {
    const event = { state, key, timestamp: Date.now(), ...details };
    this.emit('progress', event);
    try { this.onProgress?.(event); } catch (error) {
      this.api.log?.(`[music-bot] Resolver progress callback failed: ${error.message}`, 'warn');
    }
  }
}

module.exports = MusicResolver;
