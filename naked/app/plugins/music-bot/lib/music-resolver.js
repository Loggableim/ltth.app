const { spawn } = require('child_process');
const https = require('https');
let YOUTUBE_DL_PATH = 'yt-dlp';
try {
  const youtubeDlExec = require('youtube-dl-exec');
  if (youtubeDlExec && youtubeDlExec.constants && youtubeDlExec.constants.YOUTUBE_DL_PATH) {
    YOUTUBE_DL_PATH = youtubeDlExec.constants.YOUTUBE_DL_PATH;
  }
} catch (_e) {
  // youtube-dl-exec not installed — fallback to system yt-dlp
}

const DEFAULT_MODERATION = {
  rejectExplicit: false,
  rejectAgeRestricted: true,
  blockedKeywords: []
};

class MusicResolver {
  constructor(config, api) {
    this.api = api;
    this.cache = new Map();
    this.cacheSizeBytes = 0;
    this.updateConfig(config);
  }

  static resolveYtDlpPath(configured) {
    return (!configured || configured === 'yt-dlp') ? YOUTUBE_DL_PATH : configured;
  }

  updateConfig(config = {}) {
    this.config = {
      ...config,
      ytdlpPath: MusicResolver.resolveYtDlpPath(config?.ytdlpPath),
      moderation: {
        ...DEFAULT_MODERATION,
        ...(config?.moderation || {})
      }
    };
  }

  async resolve(query) {
    if (!query) {
      throw new Error('Missing query');
    }

    const trimmed = query.trim();
    const cacheHit = this._fromCache(trimmed);
    if (cacheHit) {
      if (cacheHit.success) {
        const moderationResult = this._applyModeration(cacheHit.song);
        if (moderationResult) {
          return moderationResult;
        }
      }
      return cacheHit;
    }

    const isUrl = /^https?:\/\//i.test(trimmed);

    const target = isUrl ? trimmed : `ytsearch1:${trimmed}`;

    const args = [
      '--no-warnings',
      '--ignore-errors',
      '--skip-download',
      '--no-playlist',
      '--print',
      '%(age_limit)s',
      '--print',
      '%(channel_id)s',
      '--print',
      '%(channel)s',
      '--print',
      '%(categories)s',
      '--dump-json',
      target
    ];

    const output = await this._runYtDlp(args).catch(async (error) => {
      if (error.ytdlpNotFound && isUrl && this._extractYouTubeId(trimmed)) {
        this.api.log('[music-bot] yt-dlp not found; using YouTube oEmbed fallback', 'warn');
        try {
          const oembedResult = await this._resolveViaOEmbed(trimmed);
          const modResult = this._applyModeration(oembedResult.song);
          if (modResult) return modResult;
          this._addToCache(trimmed, oembedResult);
          return oembedResult;
        } catch (oembedError) {
          this.api.log(`[music-bot] oEmbed fallback failed: ${oembedError.message}`, 'warn');
        }
      }
      if (error.ytdlpNotFound && isUrl && this._isSoundCloudUrl(trimmed)) {
        this.api.log('[music-bot] yt-dlp not found; using SoundCloud oEmbed fallback', 'warn');
        try {
          const scResult = await this._resolveSoundCloudOEmbed(trimmed);
          const modResult = this._applyModeration(scResult.song);
          if (modResult) return modResult;
          this._addToCache(trimmed, scResult);
          return scResult;
        } catch (scError) {
          this.api.log(`[music-bot] SoundCloud oEmbed fallback failed: ${scError.message}`, 'warn');
        }
      }
      throw error;
    });

    // If the oEmbed fallback already returned a full result object, return it directly
    if (output && typeof output === 'object' && 'success' in output) {
      return output;
    }

    const { data, meta } = this._parseYtDlpOutput(output);

    const ageLimit = Number.isFinite(meta.ageLimit) ? meta.ageLimit : Number(data.age_limit ?? NaN);
    const channelId = data.channel_id || meta.channelId || null;
    const channelName = data.channel || data.uploader || meta.channelName || '';
    const categories = Array.isArray(data.categories) && data.categories.length ? data.categories : meta.categories;

    const song = {
      title: data.title || trimmed,
      artist: data.artist || data.uploader || '',
      duration: data.duration || null,
      thumbnail: Array.isArray(data.thumbnails) ? data.thumbnails.at(-1)?.url : data.thumbnail,
      url: data.webpage_url || data.url || trimmed,
      localPath: null,
      source: data.extractor || (isUrl ? 'url' : 'youtube'),
      youtubeId: data.id || null,
      channelId: channelId || null,
      channelName,
      ageLimit: Number.isFinite(ageLimit) ? ageLimit : null,
      categories: categories || []
    };

    const moderationResult = this._applyModeration(song);
    if (moderationResult) {
      return moderationResult;
    }

    const response = { success: true, song };
    this._addToCache(trimmed, response);
    return response;
  }

  async _runYtDlp(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.ytdlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timeoutMs = Number.isFinite(this.config.searchTimeout) ? this.config.searchTimeout : 15000;
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('yt-dlp timed out'));
      }, timeoutMs);

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        if (error?.code === 'ENOENT') {
          const err = new Error(
            `yt-dlp not found at "${this.config.ytdlpPath}". Install yt-dlp or set resolver.ytdlpPath in Music Bot settings (e.g., /usr/local/bin/yt-dlp).`
          );
          err.ytdlpNotFound = true;
          reject(err);
          return;
        }
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          const message = stderr || `yt-dlp exited with code ${code}`;
          this.api.log(`[music-bot] yt-dlp failed: ${message}`, 'error');
          reject(new Error(message));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  _parseYtDlpOutput(raw) {
    const lines = String(raw || '')
      .trim()
      .split('\n')
      .filter(Boolean);
    if (!lines.length) {
      throw new Error('Empty yt-dlp response');
    }
    const jsonLine = lines.pop();
    let data;
    try {
      data = JSON.parse(jsonLine);
    } catch (error) {
      throw new Error('Invalid yt-dlp JSON response');
    }

    const metaLines = lines.slice(-4);
    const meta = {
      ageLimit: Number.parseInt(metaLines[0], 10),
      channelId: metaLines[1] || null,
      channelName: metaLines[2] || null,
      categories: this._parseCategories(metaLines[3])
    };

    return { data, meta };
  }

  _parseCategories(raw) {
    if (!raw) return [];
    try {
      const normalized = raw.replace(/'/g, '"');
      const parsed = JSON.parse(normalized);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (typeof raw === 'string') {
        return raw
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
      }
      return [];
    }
  }

  _applyModeration(song) {
    const moderation = this.config.moderation || {};
    const ageLimit = Number.isFinite(song.ageLimit) ? song.ageLimit : null;
    if (ageLimit !== null && ageLimit >= 18 && moderation.rejectAgeRestricted) {
      return { success: false, reason: 'age_restricted', message: 'This video is age-restricted and cannot be played' };
    }

    const blockedKeywords = Array.isArray(moderation.blockedKeywords) ? moderation.blockedKeywords : [];
    const title = String(song.title || '').toLowerCase();
    const channelName = String(song.channelName || '').toLowerCase();
    for (const keyword of blockedKeywords) {
      const needle = String(keyword || '').toLowerCase();
      if (!needle) continue;
      if (title.includes(needle) || channelName.includes(needle)) {
        return {
          success: false,
          reason: 'blocked_keyword',
          keyword,
          message: `This song is blocked (keyword: "${keyword}")`
        };
      }
    }

    if (moderation.rejectExplicit) {
      const categories = Array.isArray(song.categories) ? song.categories.map((c) => String(c || '').toLowerCase()) : [];
      const explicitWords = ['explicit', 'nsfw', 'adult', 'porn', 'sexual', '18+', 'age-restricted'];
      if (categories.some((c) => explicitWords.some((w) => c.includes(w)))) {
        return {
          success: false,
          reason: 'explicit',
          message: 'This song was rejected due to explicit metadata'
        };
      }
    }

    return null;
  }

  _extractYouTubeId(url) {
    try {
      const parsed = new URL(url);
      const h = parsed.hostname.replace(/^www\./, '');
      if (h === 'youtu.be') {
        return parsed.pathname.slice(1).split('?')[0] || null;
      }
      if (h === 'youtube.com' || h === 'm.youtube.com') {
        if (parsed.pathname === '/watch') {
          return parsed.searchParams.get('v') || null;
        }
        if (parsed.pathname.startsWith('/embed/')) {
          return parsed.pathname.slice(7).split('?')[0] || null;
        }
        if (parsed.pathname.startsWith('/shorts/')) {
          return parsed.pathname.slice(8).split('?')[0] || null;
        }
      }
    } catch (e) {
      // ignore parse error
    }
    return null;
  }

  _resolveViaOEmbed(url) {
    return new Promise((resolve, reject) => {
      const apiUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const req = https.get(apiUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`oEmbed HTTP ${res.statusCode}`));
            return;
          }
          try {
            const json = JSON.parse(data);
            const youtubeId = this._extractYouTubeId(url);
            resolve({
              success: true,
              song: {
                title: json.title || url,
                artist: json.author_name || '',
                duration: null,
                thumbnail: json.thumbnail_url || null,
                url,
                localPath: null,
                source: 'youtube',
                youtubeId,
                channelId: null,
                channelName: json.author_name || '',
                ageLimit: null,
                categories: []
              }
            });
          } catch (e) {
            reject(new Error(`oEmbed parse error: ${e.message}`));
          }
        });
      });
      req.on('error', (e) => reject(new Error(`oEmbed request failed: ${e.message}`)));
      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error('oEmbed request timed out'));
      });
    });
  }

  _isSoundCloudUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'soundcloud.com' || parsed.hostname === 'on.soundcloud.com';
    } catch (e) {
      return false;
    }
  }

  async _resolveSoundCloudOEmbed(url) {
    const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    return new Promise((resolve, reject) => {
      const req = https.get(oembedUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`SoundCloud oEmbed HTTP ${res.statusCode}`));
            return;
          }
          try {
            const json = JSON.parse(data);
            resolve({
              success: true,
              song: {
                title: json.title || url,
                artist: json.author_name || '',
                duration: null,
                thumbnail: json.thumbnail_url || null,
                url,
                localPath: null,
                source: 'soundcloud',
                youtubeId: null,
                channelId: null,
                channelName: json.author_name || '',
                ageLimit: null,
                categories: []
              }
            });
          } catch (e) {
            reject(new Error(`SoundCloud oEmbed parse error: ${e.message}`));
          }
        });
      });
      req.on('error', (e) => reject(new Error(`SoundCloud oEmbed request failed: ${e.message}`)));
      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error('SoundCloud oEmbed request timed out'));
      });
    });
  }

  _fromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const ttlMs = this.config.cacheTTLDays * 24 * 60 * 60 * 1000;
    if (Date.now() - entry.timestamp > ttlMs) {
      this.cache.delete(key);
      this.cacheSizeBytes -= entry.size;
      return null;
    }

    return entry.value;
  }

  _addToCache(key, value) {
    const serialized = JSON.stringify(value);
    const size = Buffer.byteLength(serialized, 'utf8');
    this.cache.set(key, { value, timestamp: Date.now(), size });
    this.cacheSizeBytes += size;
    this._enforceCacheLimit();
  }

  _enforceCacheLimit() {
    const maxBytes = this.config.maxCacheSizeMB * 1024 * 1024;
    if (this.cacheSizeBytes <= maxBytes) return;

    const entries = Array.from(this.cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (const [key, entry] of entries) {
      if (this.cacheSizeBytes <= maxBytes) break;
      this.cache.delete(key);
      this.cacheSizeBytes -= entry.size;
    }
  }
}

module.exports = MusicResolver;
