'use strict';

/**
 * Soundboard Command Client — `!sound <name>` an das echte Soundboard-Backend
 * (Bead lt-6rm, Epic lt-mx7 T2)
 *
 * Dieser Adapter bindet den Chat-Befehl `!sound <name>` an das bestehende
 * Soundboard-Backend an: `SoundboardManager.playSound` fuer die Wiedergabe und
 * die vorhandenen Soundquellen (Gift-Sounds aus der Datenbank, lokale Dateien
 * unter `public/sounds`, externe URLs und MyInstants) fuer die Aufloesung.
 *
 * Die Ein-/Ausgabeform entspricht dem Contract aus `docs/soundboard-contract.md`
 * (T1, lt-0rr):
 *   - `resolve(name)` liefert ein `ResolvedSound` oder `null` (unbekannt).
 *   - `play(sound, { requestedBy })` liefert ein `PlaybackResult`.
 * Backend-Fehler werden bewusst geworfen; der Handler (`command-handler.js`)
 * uebersetzt sie in klare Chat-Fehlermeldungen.
 */

const fsDefault = require('fs');
const path = require('path');

const CONTRACT_VERSION = '1.0.0';

const COMMAND_NAME = 'sound';

const RESOLUTION_SOURCES = Object.freeze({
  gift: 'gift',
  local: 'local',
  url: 'url',
  myinstants: 'myinstants'
});

// Aufloesungsreihenfolge: Gift (kuratiert) -> lokal -> URL -> MyInstants.
const SOURCE_ORDER = Object.freeze([
  RESOLUTION_SOURCES.gift,
  RESOLUTION_SOURCES.local,
  RESOLUTION_SOURCES.url,
  RESOLUTION_SOURCES.myinstants
]);

const AUDIO_TARGETS = Object.freeze(['dashboard', 'obs_overlay', 'both']);
const DEFAULT_AUDIO_TARGET = 'both';

const DEFAULT_VOLUME = 1.0;
const MAX_NAME_LENGTH = 100;

const COMMAND_EVENT_TYPE = 'command';

const ERROR_CODES = Object.freeze({
  INVALID_NAME: 'SOUND_INVALID_NAME',
  EMPTY_NAME: 'SOUND_EMPTY_NAME',
  INVALID_VOLUME: 'SOUND_INVALID_VOLUME',
  SOUND_NOT_FOUND: 'SOUND_NOT_FOUND',
  SOUNDBOARD_DISABLED: 'SOUNDBOARD_DISABLED',
  RESOLVE_FAILED: 'SOUND_RESOLVE_FAILED',
  PLAYBACK_FAILED: 'SOUND_PLAYBACK_FAILED'
});

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const EXTERNAL_URL_PATTERN = /^https?:\/\//i;

/**
 * Normalize a raw chat name into a lookup key. Collapses whitespace, trims and
 * rejects control characters, empty input and over-long names.
 *
 * @param {unknown} value
 * @returns {string} Normalized name, or '' when the input is unusable.
 */
function normalizeSoundName(value) {
  if (typeof value !== 'string') return '';
  if (CONTROL_CHAR_PATTERN.test(value)) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > MAX_NAME_LENGTH) return '';
  return normalized;
}

/**
 * Case-insensitive lookup key for a sound name. `!sound` matching is
 * case-insensitive; display names keep their original case.
 *
 * @param {unknown} value
 * @returns {string}
 */
function soundKey(value) {
  return normalizeSoundName(value).toLowerCase();
}

/**
 * Build a validated `ResolvedSound`, or `null` when it is unusable (missing
 * url/name). The returned object is frozen.
 *
 * @param {{name: string, url: string, volume?: number, label?: string, source: string, giftId?: number|null}} sound
 * @returns {Readonly<object>|null}
 */
function makeResolvedSound(sound) {
  const name = normalizeSoundName(sound && sound.name);
  const url = typeof (sound && sound.url) === 'string' ? sound.url.trim() : '';
  if (!name || !url) return null;
  if (!SOURCE_ORDER.includes(sound.source)) return null;

  const rawVolume = sound.volume === undefined || sound.volume === null
    ? DEFAULT_VOLUME
    : Number(sound.volume);
  const volume = Number.isFinite(rawVolume) && rawVolume >= 0 && rawVolume <= 1
    ? rawVolume
    : DEFAULT_VOLUME;

  const label = typeof sound.label === 'string' && sound.label.trim() ? sound.label.trim() : name;

  let giftId = null;
  if (sound.giftId !== undefined && sound.giftId !== null) {
    const parsed = Number(sound.giftId);
    if (Number.isFinite(parsed) && parsed > 0) giftId = parsed;
  }

  return Object.freeze({ name, url, volume, label, source: sound.source, giftId });
}

/**
 * Build a failed `PlaybackResult` (contract shape).
 *
 * @param {string} errorCode
 * @param {Object} [params]
 * @returns {Readonly<object>}
 */
function createPlaybackError(errorCode, params = {}) {
  return Object.freeze({
    success: false,
    sound: null,
    errorCode,
    params: Object.freeze({ ...params }),
    audioTarget: null
  });
}

/**
 * Adapter that implements the soundboard client interface on top of the real
 * `SoundboardManager` and the plugin's data sources.
 */
class SoundboardCommandClient {
  /**
   * @param {{
   *   soundboard: { playSound: Function, getAllGiftSounds?: Function, getGiftSound?: Function },
   *   db?: { db?: { prepare: Function }, getSetting?: Function },
   *   logger?: { info?: Function, warn?: Function, error?: Function, debug?: Function },
   *   soundsDir?: string|null,
   *   fs?: { readdirSync?: Function },
   *   myinstants?: { search?: Function, resolvePageUrl?: Function, isValidMyInstantsUrl?: Function },
   *   fetcher?: { validateExternalUrl?: Function },
   *   searchMyInstants?: boolean,
   *   maxMyInstantsResults?: number
   * }} options
   */
  constructor(options = {}) {
    if (!options.soundboard || typeof options.soundboard.playSound !== 'function') {
      throw new TypeError('SoundboardCommandClient requires a soundboard with playSound()');
    }

    this.soundboard = options.soundboard;
    this.db = options.db || null;
    this.logger = options.logger || {};
    this.soundsDir = options.soundsDir || null;
    this.fs = options.fs || fsDefault;
    this.myinstants = options.myinstants || null;
    this.fetcher = options.fetcher || null;
    this.searchMyInstants = options.searchMyInstants !== false;
    this.maxMyInstantsResults = Number.isFinite(options.maxMyInstantsResults)
      ? Math.max(1, Number(options.maxMyInstantsResults))
      : 5;
  }

  /**
   * Whether the soundboard is currently enabled. Matches the frontend/events
   * behaviour: disabled only when the setting is explicitly 'false'.
   *
   * @returns {boolean}
   */
  isEnabled() {
    try {
      return this._getSetting('soundboard_enabled') !== 'false';
    } catch (error) {
      this._warn(`Soundboard enabled-check failed: ${error.message}`);
      return true;
    }
  }

  /**
   * Current audio target setting, validated against the known targets.
   *
   * @returns {string}
   */
  getAudioTarget() {
    let target = null;
    try {
      target = this._getSetting('soundboard_audio_target');
    } catch (error) {
      this._warn(`Soundboard audio-target lookup failed: ${error.message}`);
    }
    return AUDIO_TARGETS.includes(target) ? target : DEFAULT_AUDIO_TARGET;
  }

  /**
   * Resolve a chat name to a playable sound.
   *
   * @param {string} name
   * @returns {Promise<Readonly<object>|null>} `null` when the name is unknown.
   */
  async resolve(name) {
    const key = soundKey(name);
    if (!key) return null;

    // Explicit URLs are resolved directly (MyInstants page first, then the
    // whitelisted external URL); they never fall through to a name search.
    if (EXTERNAL_URL_PATTERN.test(name)) {
      return this._resolveExternalUrl(name);
    }

    const gift = this._resolveGift(key);
    if (gift) return gift;

    const local = this._resolveLocal(key);
    if (local) return local;

    return this._resolveMyInstantsSearch(name, key);
  }

  /**
   * Play a resolved sound through the real soundboard backend.
   *
   * @param {object} sound
   * @param {{ requestedBy?: string|null }} [options]
   * @returns {Promise<Readonly<object>>} `PlaybackResult`
   */
  async play(sound, options = {}) {
    const resolved = makeResolvedSound(sound);
    if (!resolved) {
      throw new TypeError('play() requires a resolved sound with a valid name and url');
    }

    if (!this.isEnabled()) {
      return createPlaybackError(ERROR_CODES.SOUNDBOARD_DISABLED);
    }

    const requestedBy = options.requestedBy === undefined || options.requestedBy === null
      ? null
      : String(options.requestedBy);

    await this.soundboard.playSound(resolved.url, resolved.volume, resolved.label, {
      eventType: COMMAND_EVENT_TYPE,
      giftId: resolved.giftId,
      requestedBy
    });

    return Object.freeze({
      success: true,
      sound: resolved,
      errorCode: null,
      params: Object.freeze({}),
      audioTarget: this.getAudioTarget()
    });
  }

  _resolveGift(key) {
    if (!this.db || !this.db.db || typeof this.soundboard.getAllGiftSounds !== 'function') {
      return null;
    }

    const gifts = this.soundboard.getAllGiftSounds() || [];
    const byLabel = gifts.find(gift => soundKey(gift && gift.label) === key);
    if (byLabel) return this._resolvedFromGift(byLabel);

    try {
      const row = this.db.db
        .prepare('SELECT id FROM gift_catalog WHERE name = ? COLLATE NOCASE')
        .get(key);
      if (!row || typeof this.soundboard.getGiftSound !== 'function') return null;
      const byCatalog = this.soundboard.getGiftSound(row.id);
      return byCatalog ? this._resolvedFromGift(byCatalog) : null;
    } catch (error) {
      this._warn(`Gift lookup failed for "${key}": ${error.message}`);
      return null;
    }
  }

  _resolvedFromGift(gift) {
    if (!gift) return null;
    return makeResolvedSound({
      name: gift.label,
      url: gift.mp3Url,
      volume: gift.volume,
      label: gift.label,
      source: RESOLUTION_SOURCES.gift,
      giftId: gift.giftId
    });
  }

  _resolveLocal(key) {
    if (!this.soundsDir || typeof this.fs.readdirSync !== 'function') return null;

    let files;
    try {
      files = this.fs.readdirSync(this.soundsDir);
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    }

    const match = files.find(file => soundKey(path.parse(file).name) === key);
    if (!match) return null;

    const label = path.parse(match).name;
    return makeResolvedSound({
      name: label,
      url: `/sounds/${encodeURIComponent(match)}`,
      volume: DEFAULT_VOLUME,
      label,
      source: RESOLUTION_SOURCES.local,
      giftId: null
    });
  }

  _resolveExternalUrl(name) {
    if (this.myinstants
      && typeof this.myinstants.isValidMyInstantsUrl === 'function'
      && this.myinstants.isValidMyInstantsUrl(name)
      && typeof this.myinstants.resolvePageUrl === 'function') {
      return this.myinstants.resolvePageUrl(name).then((mp3Url) => makeResolvedSound({
        name,
        url: mp3Url,
        volume: DEFAULT_VOLUME,
        label: name,
        source: RESOLUTION_SOURCES.myinstants,
        giftId: null
      }));
    }

    let url = name;
    if (this.fetcher && typeof this.fetcher.validateExternalUrl === 'function') {
      const validation = this.fetcher.validateExternalUrl(name);
      if (!validation || !validation.valid) return null;
      url = validation.url || name;
    }

    return makeResolvedSound({
      name,
      url,
      volume: DEFAULT_VOLUME,
      label: name,
      source: RESOLUTION_SOURCES.url,
      giftId: null
    });
  }

  async _resolveMyInstantsSearch(name, key) {
    if (!this.searchMyInstants || !this.myinstants) return null;
    if (typeof this.myinstants.search !== 'function') return null;

    const results = await this.myinstants.search(key, 1, this.maxMyInstantsResults);
    if (!Array.isArray(results)) return null;

    const match = results.find(entry => entry && typeof entry.url === 'string' && entry.url.trim());
    if (!match) return null;

    const label = normalizeSoundName(match.name) || name;
    return makeResolvedSound({
      name: label,
      url: match.url,
      volume: DEFAULT_VOLUME,
      label,
      source: RESOLUTION_SOURCES.myinstants,
      giftId: null
    });
  }

  _getSetting(key) {
    if (!this.db || typeof this.db.getSetting !== 'function') return null;
    return this.db.getSetting(key);
  }

  _warn(message) {
    if (this.logger && typeof this.logger.warn === 'function') this.logger.warn(message);
  }
}

module.exports = {
  CONTRACT_VERSION,
  COMMAND_NAME,
  RESOLUTION_SOURCES,
  SOURCE_ORDER,
  AUDIO_TARGETS,
  DEFAULT_AUDIO_TARGET,
  DEFAULT_VOLUME,
  MAX_NAME_LENGTH,
  COMMAND_EVENT_TYPE,
  ERROR_CODES,
  normalizeSoundName,
  soundKey,
  makeResolvedSound,
  createPlaybackError,
  SoundboardCommandClient
};
