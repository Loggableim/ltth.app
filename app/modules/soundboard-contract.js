'use strict';

/**
 * Soundboard Contract — `!sound <name>` gegen das echte Soundboard-Backend
 * (Bead lt-0rr, Epic lt-mx7 T1)
 *
 * Dieses Modul ist die verbindliche Schnittstellen-Beschreibung (Contract)
 * zwischen dem Chat-Befehl `!sound` und dem Soundboard-Backend. Es enthaelt
 * bewusst KEINE Auflösungs- oder Wiedergabe-Logik: es deklariert die
 * Eingabe-/Ausgabeformen, validiert sie und liefert einen Referenz-Client
 * (In-Memory) fuer Tests.
 *
 * Implementierung: `app/plugins/soundboard/` (lt-mx7 T2) bindet den echten
 *   `SoundboardManager.playSound` und die Sound-Aufloesung gegen diesen
 *   Contract an.
 * Tests: `app/test/soundboard-contract.test.js` (T1) und
 *   `app/test/soundboard-command.test.js` (T2).
 * Doku: `docs/soundboard-contract.md`.
 *
 * --- Ablauf -------------------------------------------------------------------------
 *
 * 1. GCCE parst `!sound <name>` und uebergibt den rohen Namen.
 * 2. `normalizeSoundRequest({ name, requestedBy })` validiert und normalisiert.
 * 3. `client.resolve(name)` loest den Namen zu einem `ResolvedSound` auf
 *    (`null`, wenn unbekannt). Quellen siehe `RESOLUTION_SOURCES`.
 * 4. `client.play(sound, { requestedBy })` spielt ueber das Soundboard-Backend
 *    (Socket.io-Event `soundboard:play`) und liefert ein `PlaybackResult`.
 * 5. `toCommandResult(result)` uebersetzt das Ergebnis in die GCCE-Antwortform.
 *
 * Cooldown und Rechte prueft GCCE selbst (COMMAND_ON_COOLDOWN /
 * PERMISSION_DENIED). Der Contract fuehrt die Codes nur fuer den
 * Sound-Kontext mit, damit Fehlerpfade einheitlich benannt sind.
 *
 * --- Eingabe ------------------------------------------------------------------------
 *
 * @typedef {Object} SoundRequest
 * @property {string} name                 Roher Name aus dem Chat, nicht leer nach Trim.
 * @property {string|null} [requestedBy]   userId des Ausloesers (Audit), optional.
 * @property {number|null} [volume]        Optionale Lautstaerke 0..1 (Override).
 * @property {string|null} [source]        Optionale erzwungene Quelle (RESOLUTION_SOURCES).
 * @property {number} [timestamp]          Epoch-ms, Default `Date.now()`.
 *
 * --- Aufloesung ---------------------------------------------------------------------
 *
 * @typedef {Object} ResolvedSound
 * @property {string} name                 Normalisierter Anzeigename.
 * @property {string} url                  Abspielbare Quelle (HTTP-URL).
 * @property {number} volume               Lautstaerke 0..1.
 * @property {string} label                Label fuer Log/Overlay.
 * @property {string} source               Quelle (RESOLUTION_SOURCES).
 * @property {number|null} giftId          Gift-ID, falls die Quelle ein Gift-Sound ist.
 *
 * --- Wiedergabe ---------------------------------------------------------------------
 *
 * @typedef {Object} PlaybackResult
 * @property {boolean} success
 * @property {ResolvedSound|null} sound     Der gespielte Sound (bei Erfolg).
 * @property {string|null} errorCode        Fehlercode aus ERROR_CODES (bei Misserfolg).
 * @property {string|null} message          Fallback-Text (EN), T2 lokalisiert via MESSAGE_KEYS.
 * @property {Object} params                Parameter fuer die Lokalisierung (z. B. `{ name }`).
 * @property {string|null} audioTarget      Ziel aus AUDIO_TARGETS (bei Erfolg).
 *
 * --- GCCE-Antwort -------------------------------------------------------------------
 *
 * @typedef {Object} CommandResult
 * @property {boolean} success
 * @property {string} [message]
 * @property {string} [error]
 * @property {string} [errorCode]
 * @property {boolean} [displayOverlay]
 */

const CONTRACT_VERSION = '1.0.0';

const COMMAND_NAME = 'sound';

const RESOLUTION_SOURCES = Object.freeze({
  gift: 'gift',
  local: 'local',
  url: 'url',
  myinstants: 'myinstants'
});

const SOURCE_ORDER = Object.freeze([
  RESOLUTION_SOURCES.gift,
  RESOLUTION_SOURCES.local,
  RESOLUTION_SOURCES.url,
  RESOLUTION_SOURCES.myinstants
]);

const EVENT_TYPES = Object.freeze([
  'gift',
  'follow',
  'subscribe',
  'share',
  'like',
  'test',
  'preview',
  'animation',
  'command'
]);

const COMMAND_EVENT_TYPE = 'command';

const AUDIO_TARGETS = Object.freeze(['dashboard', 'obs_overlay', 'both']);
const DEFAULT_AUDIO_TARGET = 'both';

const DEFAULT_VOLUME = 1.0;
const MAX_NAME_LENGTH = 100;

const ERROR_CODES = Object.freeze({
  INVALID_NAME: 'SOUND_INVALID_NAME',
  EMPTY_NAME: 'SOUND_EMPTY_NAME',
  INVALID_VOLUME: 'SOUND_INVALID_VOLUME',
  SOUND_NOT_FOUND: 'SOUND_NOT_FOUND',
  SOUNDBOARD_DISABLED: 'SOUNDBOARD_DISABLED',
  RESOLVE_FAILED: 'SOUND_RESOLVE_FAILED',
  PLAYBACK_FAILED: 'SOUND_PLAYBACK_FAILED',
  COOLDOWN_ACTIVE: 'SOUND_COOLDOWN_ACTIVE',
  PERMISSION_DENIED: 'SOUND_PERMISSION_DENIED'
});

const MESSAGE_KEYS = Object.freeze({
  [ERROR_CODES.INVALID_NAME]: 'soundboard.command.errors.invalidName',
  [ERROR_CODES.EMPTY_NAME]: 'soundboard.command.errors.emptyName',
  [ERROR_CODES.INVALID_VOLUME]: 'soundboard.command.errors.invalidVolume',
  [ERROR_CODES.SOUND_NOT_FOUND]: 'soundboard.command.errors.notFound',
  [ERROR_CODES.SOUNDBOARD_DISABLED]: 'soundboard.command.errors.disabled',
  [ERROR_CODES.RESOLVE_FAILED]: 'soundboard.command.errors.resolveFailed',
  [ERROR_CODES.PLAYBACK_FAILED]: 'soundboard.command.errors.playbackFailed',
  [ERROR_CODES.COOLDOWN_ACTIVE]: 'soundboard.command.errors.cooldown',
  [ERROR_CODES.PERMISSION_DENIED]: 'soundboard.command.errors.permissionDenied'
});

const DEFAULT_MESSAGES = Object.freeze({
  [ERROR_CODES.INVALID_NAME]: 'That sound name is not valid.',
  [ERROR_CODES.EMPTY_NAME]: 'Please name a sound, e.g. !sound airhorn.',
  [ERROR_CODES.INVALID_VOLUME]: 'Volume must be between 0 and 1.',
  [ERROR_CODES.SOUND_NOT_FOUND]: 'Unknown sound "{name}".',
  [ERROR_CODES.SOUNDBOARD_DISABLED]: 'The soundboard is currently disabled.',
  [ERROR_CODES.RESOLVE_FAILED]: 'Could not look up the sound. Please try again later.',
  [ERROR_CODES.PLAYBACK_FAILED]: 'Could not play the sound. Please try again later.',
  [ERROR_CODES.COOLDOWN_ACTIVE]: 'Please wait {remaining} seconds before playing another sound.',
  [ERROR_CODES.PERMISSION_DENIED]: 'You are not allowed to play sounds.'
});

const REQUIRED_CLIENT_METHODS = Object.freeze(['isEnabled', 'resolve', 'play']);
const OPTIONAL_CLIENT_METHODS = Object.freeze(['getAudioTarget']);

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

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
 * Validate and normalize a {@link SoundRequest}.
 *
 * @param {unknown} request
 * @returns {Readonly<SoundRequest>}
 */
function assertSoundRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('sound request must be an object');
  }

  const rawName = typeof request.name === 'string' ? request.name : '';
  const name = normalizeSoundName(rawName);
  if (!name) {
    const reason = CONTROL_CHAR_PATTERN.test(rawName) || rawName.trim().length > MAX_NAME_LENGTH
      ? 'invalid'
      : 'empty';
    const error = new TypeError(`sound request has an ${reason} name`);
    error.code = reason === 'invalid' ? ERROR_CODES.INVALID_NAME : ERROR_CODES.EMPTY_NAME;
    throw error;
  }

  const volume = request.volume === undefined || request.volume === null
    ? DEFAULT_VOLUME
    : Number(request.volume);
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    const error = new TypeError('sound request volume must be between 0 and 1');
    error.code = ERROR_CODES.INVALID_VOLUME;
    throw error;
  }

  const source = request.source === undefined || request.source === null
    ? null
    : request.source;
  if (source !== null && !SOURCE_ORDER.includes(source)) {
    throw new TypeError(`sound request has unknown source '${String(source)}'`);
  }

  const requestedBy = request.requestedBy === undefined || request.requestedBy === null
    ? null
    : String(request.requestedBy);

  const timestamp = Number.isFinite(Number(request.timestamp)) ? Number(request.timestamp) : Date.now();

  return Object.freeze({ name, requestedBy, volume, source, timestamp });
}

/**
 * Boolean variant of {@link assertSoundRequest}.
 *
 * @param {unknown} request
 * @returns {boolean}
 */
function isSoundRequest(request) {
  try {
    assertSoundRequest(request);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and normalize a {@link ResolvedSound}.
 *
 * @param {unknown} sound
 * @returns {Readonly<ResolvedSound>}
 */
function assertResolvedSound(sound) {
  if (!sound || typeof sound !== 'object' || Array.isArray(sound)) {
    throw new TypeError('resolved sound must be an object');
  }

  const name = normalizeSoundName(sound.name);
  if (!name) {
    throw new TypeError('resolved sound needs a valid name');
  }

  const url = typeof sound.url === 'string' ? sound.url.trim() : '';
  if (!url) {
    throw new TypeError('resolved sound needs a non-empty url');
  }

  const source = sound.source;
  if (!SOURCE_ORDER.includes(source)) {
    throw new TypeError(`resolved sound has unknown source '${String(source)}'`);
  }

  const rawVolume = sound.volume === undefined || sound.volume === null ? DEFAULT_VOLUME : Number(sound.volume);
  if (!Number.isFinite(rawVolume) || rawVolume < 0 || rawVolume > 1) {
    throw new TypeError('resolved sound volume must be between 0 and 1');
  }

  let giftId = null;
  if (sound.giftId !== undefined && sound.giftId !== null) {
    const parsedGiftId = Number(sound.giftId);
    if (!Number.isFinite(parsedGiftId) || parsedGiftId <= 0) {
      throw new TypeError('resolved sound giftId must be a positive number');
    }
    giftId = parsedGiftId;
  }

  const label = typeof sound.label === 'string' && sound.label.trim() ? sound.label.trim() : name;

  return Object.freeze({ name, url, volume: rawVolume, label, source, giftId });
}

/**
 * Build a failed {@link PlaybackResult} from a known error code. The message is
 * an English fallback; the command layer localizes via {@link MESSAGE_KEYS}.
 *
 * @param {string} errorCode
 * @param {Object} [params]
 * @returns {Readonly<PlaybackResult>}
 */
function createPlaybackError(errorCode, params = {}) {
  if (!Object.values(ERROR_CODES).includes(errorCode)) {
    throw new TypeError(`unknown playback error code '${String(errorCode)}'`);
  }
  const template = DEFAULT_MESSAGES[errorCode] || 'Sound command failed.';
  const message = template.replace(/\{(\w+)\}/g, (match, key) => (
    params[key] === undefined || params[key] === null ? match : String(params[key])
  ));
  return Object.freeze({
    success: false,
    sound: null,
    errorCode,
    message,
    params: Object.freeze({ ...params }),
    audioTarget: null
  });
}

/**
 * Build a successful {@link PlaybackResult}.
 *
 * @param {unknown} sound
 * @param {{ audioTarget?: string }} [options]
 * @returns {Readonly<PlaybackResult>}
 */
function createPlaybackSuccess(sound, options = {}) {
  const resolved = assertResolvedSound(sound);
  const audioTarget = options.audioTarget === undefined || options.audioTarget === null
    ? DEFAULT_AUDIO_TARGET
    : options.audioTarget;
  if (!AUDIO_TARGETS.includes(audioTarget)) {
    throw new TypeError(`unknown audio target '${String(audioTarget)}'`);
  }
  return Object.freeze({
    success: true,
    sound: resolved,
    errorCode: null,
    message: null,
    params: Object.freeze({}),
    audioTarget
  });
}

/**
 * Translate a {@link PlaybackResult} into the GCCE command response shape.
 *
 * @param {Readonly<PlaybackResult>} result
 * @returns {Readonly<CommandResult>}
 */
function toCommandResult(result) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('playback result must be an object');
  }
  if (result.success) {
    const label = result.sound ? result.sound.label : 'sound';
    return Object.freeze({ success: true, message: `Playing "${label}"` });
  }
  return Object.freeze({
    success: false,
    error: result.message || 'Sound command failed.',
    errorCode: result.errorCode || ERROR_CODES.PLAYBACK_FAILED,
    displayOverlay: true
  });
}

/**
 * Check whether a value structurally satisfies the soundboard client
 * interface required by the `!sound` command.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isSoundboardClient(value) {
  if (!value || typeof value !== 'object') return false;
  return REQUIRED_CLIENT_METHODS.every((method) => typeof value[method] === 'function');
}

/**
 * Assert that a value satisfies the soundboard client contract. Returns the
 * client unchanged so it can be used inline.
 *
 * @template T
 * @param {T} client
 * @returns {T}
 */
function assertSoundboardClient(client) {
  if (!client || typeof client !== 'object') {
    throw new TypeError('soundboard client must be an object');
  }
  const missing = REQUIRED_CLIENT_METHODS.filter((method) => typeof client[method] !== 'function');
  if (missing.length > 0) {
    throw new TypeError(`soundboard client is missing required method(s): ${missing.join(', ')}`);
  }
  return client;
}

/**
 * Reference implementation of the soundboard client contract for tests. Sounds
 * are held in memory and keyed by normalized name; every call is recorded.
 * Use `failResolveFor` / `failPlayFor` to simulate backend failures.
 *
 * `sounds` accepts either a `Map`/plain object (`name -> url | ResolvedSound`)
 * or an array of `ResolvedSound`-shaped entries.
 *
 * @param {{
 *   enabled?: boolean,
 *   audioTarget?: string,
 *   sounds?: Iterable<Object> | Record<string, string|Object> | Map<string, string|Object>,
 *   failResolveFor?: Iterable<string>,
 *   failPlayFor?: Iterable<string>
 * }} [options]
 * @returns {{
 *   client: { isEnabled: () => boolean, getAudioTarget: () => string, resolve: Function, play: Function },
 *   sounds: Map<string, Readonly<ResolvedSound>>,
 *   resolveCalls: string[],
 *   playCalls: Array<{ name: string, requestedBy: string|null }>,
 *   enabled: boolean,
 *   audioTarget: string,
 *   setEnabled: (value: boolean) => void,
 *   addSound: (sound: Object) => void,
 *   removeSound: (name: string) => void,
 *   reset: () => void
 * }}
 */
function createInMemorySoundboardClient(options = {}) {
  const enabled = options.enabled === undefined ? true : Boolean(options.enabled);
  const audioTarget = options.audioTarget === undefined || options.audioTarget === null
    ? DEFAULT_AUDIO_TARGET
    : options.audioTarget;
  if (!AUDIO_TARGETS.includes(audioTarget)) {
    throw new TypeError(`unknown audio target '${String(audioTarget)}'`);
  }

  const sounds = new Map();
  const failResolveFor = new Set(options.failResolveFor || []);
  const failPlayFor = new Set(options.failPlayFor || []);
  const resolveCalls = [];
  const playCalls = [];

  const addSound = (entry) => {
    const resolved = assertResolvedSound(entry);
    sounds.set(soundKey(resolved.name), resolved);
    return resolved;
  };

  const sourceSounds = options.sounds;
  const fromPair = (name, value) => (typeof value === 'string'
    ? { name, url: value, source: RESOLUTION_SOURCES.url }
    : { name, ...value });

  if (sourceSounds instanceof Map) {
    for (const [name, value] of sourceSounds.entries()) addSound(fromPair(name, value));
  } else if (Array.isArray(sourceSounds)) {
    for (const entry of sourceSounds) addSound(entry);
  } else if (sourceSounds && typeof sourceSounds === 'object') {
    for (const [name, value] of Object.entries(sourceSounds)) addSound(fromPair(name, value));
  }

  let currentEnabled = enabled;
  let currentTarget = audioTarget;

  const client = {
    isEnabled() {
      return currentEnabled;
    },
    getAudioTarget() {
      return currentTarget;
    },
    async resolve(name) {
      const key = soundKey(name);
      resolveCalls.push(key);
      if (!key) return null;
      if (failResolveFor.has(key)) {
        throw new Error(`in-memory soundboard client: resolve failed for '${key}'`);
      }
      const sound = sounds.get(key);
      return sound || null;
    },
    async play(sound, playOptions = {}) {
      const resolved = assertResolvedSound(sound);
      const requestedBy = playOptions.requestedBy === undefined || playOptions.requestedBy === null
        ? null
        : String(playOptions.requestedBy);
      playCalls.push({ name: resolved.name, requestedBy });
      if (!currentEnabled) {
        return createPlaybackError(ERROR_CODES.SOUNDBOARD_DISABLED);
      }
      if (failPlayFor.has(soundKey(resolved.name))) {
        throw new Error(`in-memory soundboard client: play failed for '${resolved.name}'`);
      }
      return createPlaybackSuccess(resolved, { audioTarget: currentTarget });
    }
  };

  return {
    client,
    sounds,
    resolveCalls,
    playCalls,
    get enabled() {
      return currentEnabled;
    },
    get audioTarget() {
      return currentTarget;
    },
    setEnabled(value) {
      currentEnabled = Boolean(value);
    },
    setAudioTarget(value) {
      if (!AUDIO_TARGETS.includes(value)) {
        throw new TypeError(`unknown audio target '${String(value)}'`);
      }
      currentTarget = value;
    },
    addSound,
    removeSound(name) {
      sounds.delete(soundKey(name));
    },
    reset() {
      resolveCalls.length = 0;
      playCalls.length = 0;
    }
  };
}

module.exports = {
  CONTRACT_VERSION,
  COMMAND_NAME,
  RESOLUTION_SOURCES,
  SOURCE_ORDER,
  EVENT_TYPES,
  COMMAND_EVENT_TYPE,
  AUDIO_TARGETS,
  DEFAULT_AUDIO_TARGET,
  DEFAULT_VOLUME,
  MAX_NAME_LENGTH,
  ERROR_CODES,
  MESSAGE_KEYS,
  DEFAULT_MESSAGES,
  REQUIRED_CLIENT_METHODS,
  OPTIONAL_CLIENT_METHODS,
  normalizeSoundName,
  soundKey,
  assertSoundRequest,
  isSoundRequest,
  assertResolvedSound,
  createPlaybackError,
  createPlaybackSuccess,
  toCommandResult,
  isSoundboardClient,
  assertSoundboardClient,
  createInMemorySoundboardClient
};
