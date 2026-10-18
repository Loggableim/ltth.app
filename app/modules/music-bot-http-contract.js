'use strict';

/**
 * Music-Bot HTTP Contract — `!song <url|query>` gegen den Music-Bot
 * (Bead lt-dja, Epic lt-x16 T1)
 *
 * Dieses Modul ist die verbindliche Schnittstellen-Beschreibung (Contract)
 * zwischen dem Chat-Befehl `!song` und dem Music-Bot. Es enthaelt bewusst
 * KEINE Aufloesungs-, Queue- oder Wiedergabe-Logik: es deklariert die
 * HTTP-Endpunkte, die Ein-/Ausgabeformen, validiert sie und liefert einen
 * Referenz-Client sowie einen In-Memory-Server fuer Tests.
 *
 * Implementierung: `app/plugins/music-bot/` exponiert die Routen; die
 *   Chat-Anbindung (T2) konsumiert sie ueber diesen Contract.
 * Tests: `app/test/music-bot-http-contract.test.js`.
 * Doku: `docs/music-bot-http-contract.md`.
 *
 * --- Ablauf -------------------------------------------------------------------------
 *
 * 1. Der Chat-Parser erkennt `!song <url|query>` und uebergibt den rohen Text.
 * 2. `assertSongRequest({ query, requestedBy })` validiert und normalisiert.
 * 3. Der Client ruft `POST /api/plugins/music-bot/request` auf und liefert
 *    `{ ok: true, position, title }` oder einen Fehler mit `code`/`messageKey`.
 * 4. Weitere Player-Befehle laufen ueber `queue`, `play`, `skip` und `status`.
 *
 * Der Contract behandelt Netzwerkfehler und Timeouts selbst und uebersetzt
 * HTTP-Status und `messageKey` des Backends in stabile Fehlercodes. Die
 * Chat-Schicht lokalisiert ueber `MESSAGE_KEYS` und meldet die Meldung im Chat.
 *
 * --- Transport ----------------------------------------------------------------------
 *
 * Ein Transport ist eine injizierbare Funktion:
 *
 * @typedef {Object} HttpRequest
 * @property {'GET'|'POST'} method
 * @property {string} path        Pfad inkl. `/api/plugins/music-bot`-Prefix.
 * @property {Object|null} body   JSON-Body oder `null`.
 *
 * @typedef {Object} HttpResponse
 * @property {number} status      HTTP-Status.
 * @property {Object} body        Geparste JSON-Antwort.
 *
 * @typedef {(request: HttpRequest) => Promise<HttpResponse>} HttpTransport
 *
 * Der Client erwartet `transport({ method, path, body })`; er baut keine
 * Verbindung selbst auf, fuehrt aber Timeout und Fehler-Mapping aus.
 */

const CONTRACT_VERSION = '1.0.0';

const COMMAND_NAME = 'song';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const BASE_PATH = '/api/plugins/music-bot';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_QUERY_LENGTH = 200;
const DEFAULT_REQUEST_USERNAME = 'dashboard';
const DEFAULT_SKIP_REASON = 'host';

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

const HTTP_STATUS = Object.freeze({
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LOCKED: 423,
  SERVER_ERROR: 500
});

const ENDPOINTS = Object.freeze({
  queue: Object.freeze({
    method: 'GET',
    path: BASE_PATH + '/queue',
    pathTemplate: BASE_PATH + '/queue'
  }),
  request: Object.freeze({
    method: 'POST',
    path: BASE_PATH + '/request',
    pathTemplate: BASE_PATH + '/request'
  }),
  play: Object.freeze({
    method: 'POST',
    path: null,
    pathTemplate: BASE_PATH + '/queue/:index/play'
  }),
  skip: Object.freeze({
    method: 'POST',
    path: BASE_PATH + '/skip',
    pathTemplate: BASE_PATH + '/skip'
  }),
  status: Object.freeze({
    method: 'GET',
    path: BASE_PATH + '/status',
    pathTemplate: BASE_PATH + '/status'
  })
});

const ERROR_CODES = Object.freeze({
  EMPTY_QUERY: 'empty-query',
  INVALID_QUERY: 'invalid-query',
  REQUEST_FAILED: 'request-failed',
  QUEUE_FULL: 'queue-full',
  DUPLICATE: 'duplicate',
  USER_LIMIT: 'user-limit',
  COOLDOWN: 'cooldown',
  USER_BLOCKED: 'user-blocked',
  BANNED: 'banned',
  DURATION: 'duration',
  LOCKED: 'locked',
  STALE: 'stale',
  BAD_INDEX: 'bad-index',
  BUSY: 'busy',
  TIMEOUT: 'timeout',
  UNAVAILABLE: 'unavailable'
});

const MESSAGE_KEY_TO_ERROR_CODE = Object.freeze({
  requestRequired: ERROR_CODES.EMPTY_QUERY,
  queueInvalidSong: ERROR_CODES.INVALID_QUERY,
  queueFull: ERROR_CODES.QUEUE_FULL,
  queueDurationUnknown: ERROR_CODES.DURATION,
  queueDurationTooLong: ERROR_CODES.DURATION,
  queueDuplicate: ERROR_CODES.DUPLICATE,
  queueUserLimit: ERROR_CODES.USER_LIMIT,
  queueCooldown: ERROR_CODES.COOLDOWN,
  requestUserBlocked: ERROR_CODES.USER_BLOCKED,
  requestPending: ERROR_CODES.BUSY,
  requestFailed: ERROR_CODES.REQUEST_FAILED,
  banSong: ERROR_CODES.BANNED,
  banArtist: ERROR_CODES.BANNED,
  banKeyword: ERROR_CODES.BANNED,
  banChannel: ERROR_CODES.BANNED
});

const MESSAGE_KEYS = Object.freeze({
  [ERROR_CODES.EMPTY_QUERY]: 'requestRequired',
  [ERROR_CODES.INVALID_QUERY]: 'queueInvalidSong',
  [ERROR_CODES.REQUEST_FAILED]: 'requestFailed',
  [ERROR_CODES.QUEUE_FULL]: 'queueFull',
  [ERROR_CODES.DUPLICATE]: 'queueDuplicate',
  [ERROR_CODES.USER_LIMIT]: 'queueUserLimit',
  [ERROR_CODES.COOLDOWN]: 'queueCooldown',
  [ERROR_CODES.USER_BLOCKED]: 'requestUserBlocked',
  [ERROR_CODES.BANNED]: 'banSong',
  [ERROR_CODES.DURATION]: 'queueDurationTooLong',
  [ERROR_CODES.LOCKED]: 'safetyLocked',
  [ERROR_CODES.STALE]: 'requestFailed',
  [ERROR_CODES.BAD_INDEX]: 'requestFailed',
  [ERROR_CODES.BUSY]: 'requestFailed',
  [ERROR_CODES.TIMEOUT]: 'requestFailed',
  [ERROR_CODES.UNAVAILABLE]: 'requestFailed'
});

const DEFAULT_MESSAGES = Object.freeze({
  [ERROR_CODES.EMPTY_QUERY]: 'Bitte gib einen Song an.',
  [ERROR_CODES.INVALID_QUERY]: 'Dieser Song kann nicht hinzugefuegt werden.',
  [ERROR_CODES.REQUEST_FAILED]: 'Fehler beim Request.',
  [ERROR_CODES.QUEUE_FULL]: 'Die Warteschlange ist voll.',
  [ERROR_CODES.DUPLICATE]: 'Dieser Song ist bereits in der Warteschlange.',
  [ERROR_CODES.USER_LIMIT]: 'Pro Nutzer sind maximal {maxPerUser} aktive Requests erlaubt.',
  [ERROR_CODES.COOLDOWN]: 'Du kannst in {remaining} Sekunden wieder anfragen.',
  [ERROR_CODES.USER_BLOCKED]: 'Dieser Nutzer darf keine Songs anfragen.',
  [ERROR_CODES.BANNED]: 'Dieser Song ist gesperrt.',
  [ERROR_CODES.DURATION]: 'Die Songdauer ist ungueltig oder zu lang.',
  [ERROR_CODES.LOCKED]: 'Der Soundbot ist durch den Safety-Lock gesperrt.',
  [ERROR_CODES.STALE]: 'Der ausgewaehlte Titel ist nicht mehr in der Queue.',
  [ERROR_CODES.BAD_INDEX]: 'Ungueltige Queue-Position.',
  [ERROR_CODES.BUSY]: 'Ein vorheriger Request wird noch verarbeitet.',
  [ERROR_CODES.TIMEOUT]: 'Der Music Bot hat nicht rechtzeitig geantwortet.',
  [ERROR_CODES.UNAVAILABLE]: 'Der Music Bot ist nicht erreichbar.'
});

const REQUIRED_CLIENT_METHODS = Object.freeze(['queue', 'enqueue', 'play', 'skip', 'status']);
const OPTIONAL_CLIENT_METHODS = Object.freeze(['getBaseUrl', 'getTimeoutMs']);

/**
 * Normalize a raw chat query into the value sent to the Music Bot. Collapses
 * whitespace, trims and rejects control characters, empty input and over-long
 * queries.
 *
 * @param {unknown} value
 * @returns {string} Normalized query, or '' when the input is unusable.
 */
function normalizeSongQuery(value) {
  if (typeof value !== 'string') return '';
  if (CONTROL_CHAR_PATTERN.test(value)) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > MAX_QUERY_LENGTH) return '';
  return normalized;
}

/**
 * Validate and normalize a {@link SongRequest}.
 *
 * @param {unknown} request
 * @returns {Readonly<{query: string, requestedBy: string|null, requesterAvatar: string|null, timestamp: number}>}
 */
function assertSongRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('song request must be an object');
  }

  const rawQuery = typeof request.query === 'string' ? request.query : '';
  const query = normalizeSongQuery(rawQuery);
  if (!query) {
    const reason = CONTROL_CHAR_PATTERN.test(rawQuery) || rawQuery.trim().length > MAX_QUERY_LENGTH
      ? 'invalid'
      : 'empty';
    const error = new TypeError(`song request has an ${reason} query`);
    error.code = reason === 'invalid' ? ERROR_CODES.INVALID_QUERY : ERROR_CODES.EMPTY_QUERY;
    throw error;
  }

  const requestedBy = request.requestedBy === undefined || request.requestedBy === null
    ? null
    : String(request.requestedBy).trim() || null;
  const requesterAvatar = request.requesterAvatar === undefined || request.requesterAvatar === null
    ? null
    : String(request.requesterAvatar).trim() || null;
  const timestamp = Number.isFinite(Number(request.timestamp)) ? Number(request.timestamp) : Date.now();

  return Object.freeze({ query, requestedBy, requesterAvatar, timestamp });
}

/**
 * Boolean variant of {@link assertSongRequest}.
 *
 * @param {unknown} request
 * @returns {boolean}
 */
function isSongRequest(request) {
  try {
    assertSongRequest(request);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the JSON body for `POST /api/plugins/music-bot/request`.
 *
 * @param {unknown} request
 * @param {{ username?: string }} [options]
 * @returns {Readonly<{query: string, username: string, requesterAvatar: string|null}>}
 */
function buildRequestPayload(request, options = {}) {
  const normalized = assertSongRequest(request);
  const explicitUsername = typeof options.username === 'string' ? options.username.trim() : '';
  const username = explicitUsername
    || normalized.requestedBy
    || DEFAULT_REQUEST_USERNAME;
  return Object.freeze({
    query: normalized.query,
    username,
    requesterAvatar: normalized.requesterAvatar
  });
}

/**
 * Build the JSON body for `POST /api/plugins/music-bot/queue/:index/play`.
 *
 * @param {{ index?: unknown, songId?: unknown }} [options]
 * @returns {Readonly<{songId: string|null}>}
 */
function buildQueuePlayPayload(options = {}) {
  const index = options.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    const error = new TypeError('queue play needs a non-negative integer index');
    error.code = ERROR_CODES.BAD_INDEX;
    throw error;
  }
  const songId = typeof options.songId === 'string' ? options.songId.trim() : '';
  return Object.freeze({ songId: songId || null });
}

/**
 * Build the JSON body for `POST /api/plugins/music-bot/skip`.
 *
 * @param {{ reason?: unknown }} [options]
 * @returns {Readonly<{reason: string}>}
 */
function buildSkipPayload(options = {}) {
  const reason = typeof options.reason === 'string' && options.reason.trim()
    ? options.reason.trim()
    : DEFAULT_SKIP_REASON;
  return Object.freeze({ reason });
}

/**
 * Resolve a named endpoint to `{ method, path }`, expanding `:param` segments.
 *
 * @param {string} name
 * @param {Object} [params]
 * @returns {Readonly<{method: string, path: string}>}
 */
function resolveEndpoint(name, params = {}) {
  const endpoint = ENDPOINTS[name];
  if (!endpoint) {
    throw new TypeError(`unknown music-bot endpoint '${String(name)}'`);
  }
  const path = endpoint.pathTemplate.replace(/:(\w+)/g, (match, key) => {
    const value = params[key];
    if (value === undefined || value === null || value === '') {
      throw new TypeError(`music-bot endpoint '${name}' is missing path param '${key}'`);
    }
    return encodeURIComponent(String(value));
  });
  return Object.freeze({ method: endpoint.method, path });
}

/**
 * Build an absolute URL for logs/diagnostics. The transport receives the
 * relative path only; this helper is for callers that need a display URL.
 *
 * @param {string} baseUrl
 * @param {string} path
 * @returns {string}
 */
function buildRequestUrl(baseUrl, path) {
  const base = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : DEFAULT_BASE_URL;
  const suffix = typeof path === 'string' && path.startsWith('/') ? path : `/${String(path || '')}`;
  return base + suffix;
}

function renderMessage(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (
    params[key] === undefined || params[key] === null ? match : String(params[key])
  ));
}

/**
 * Build a failed command result from a known error code.
 *
 * @param {string} errorCode
 * @param {Object} [params]
 * @returns {Readonly<{ok: false, code: string, message: string, messageKey: string, params: Object}>}
 */
function createFailure(errorCode, params = {}) {
  if (!Object.values(ERROR_CODES).includes(errorCode)) {
    throw new TypeError(`unknown music-bot error code '${String(errorCode)}'`);
  }
  const safeParams = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  return Object.freeze({
    ok: false,
    code: errorCode,
    message: renderMessage(DEFAULT_MESSAGES[errorCode], safeParams),
    messageKey: MESSAGE_KEYS[errorCode],
    params: Object.freeze({ ...safeParams })
  });
}

/**
 * Build a successful command result.
 *
 * @param {Object} [data]
 * @returns {Readonly<Object>}
 */
function createSuccess(data = {}) {
  return Object.freeze({ ok: true, ...data });
}

/**
 * Translate an unexpected HTTP response into a stable failure result.
 *
 * @param {HttpResponse|null} response
 * @returns {Readonly<Object>}
 */
function mapResponseToFailure(response) {
  const status = response && typeof response.status === 'number' ? response.status : 0;
  const body = response && response.body && typeof response.body === 'object' ? response.body : {};

  if (status === HTTP_STATUS.LOCKED) {
    return createFailure(ERROR_CODES.LOCKED, body.params || {});
  }
  if (status === HTTP_STATUS.CONFLICT && body.staleQueue) {
    return createFailure(ERROR_CODES.STALE, body.params || {});
  }

  const mappedCode = MESSAGE_KEY_TO_ERROR_CODE[body.messageKey];
  if (mappedCode) {
    return createFailure(mappedCode, body.params || {});
  }

  if (status === HTTP_STATUS.BAD_REQUEST) {
    return createFailure(ERROR_CODES.REQUEST_FAILED, body.params || {});
  }

  return createFailure(ERROR_CODES.UNAVAILABLE, { status });
}

/**
 * Assert that a value satisfies the Music-Bot client interface.
 *
 * @template T
 * @param {T} client
 * @returns {T}
 */
function assertMusicBotClient(client) {
  if (!client || typeof client !== 'object') {
    throw new TypeError('music-bot client must be an object');
  }
  const missing = REQUIRED_CLIENT_METHODS.filter((method) => typeof client[method] !== 'function');
  if (missing.length > 0) {
    throw new TypeError(`music-bot client is missing methods: ${missing.join(', ')}`);
  }
  return client;
}

/**
 * Boolean variant of {@link assertMusicBotClient}.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isMusicBotClient(value) {
  try {
    assertMusicBotClient(value);
    return true;
  } catch {
    return false;
  }
}

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error('music-bot http request timed out');
      error.code = ERROR_CODES.TIMEOUT;
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Create the HTTP client used by the `!song` command. The transport is
 * injected so production code can use the app's HTTP stack and tests can use
 * the in-memory server.
 *
 * @param {{ transport: HttpTransport, baseUrl?: string, timeoutMs?: number }} options
 * @returns {Readonly<Object>}
 */
function createMusicBotHttpClient(options = {}) {
  const transport = options.transport;
  if (typeof transport !== 'function') {
    throw new Error('music-bot http client: transport is required');
  }
  const baseUrl = typeof options.baseUrl === 'string' && options.baseUrl.trim()
    ? options.baseUrl.trim().replace(/\/+$/, '')
    : DEFAULT_BASE_URL;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : DEFAULT_TIMEOUT_MS;

  async function invoke(name, params, body) {
    const endpoint = resolveEndpoint(name, params || {});
    const request = Object.freeze({
      method: endpoint.method,
      path: endpoint.path,
      body: body === undefined ? null : body
    });

    let response;
    try {
      response = await withTimeout(
        Promise.resolve().then(() => transport(request)),
        timeoutMs
      );
    } catch (error) {
      if (error && error.code === ERROR_CODES.TIMEOUT) {
        return { failure: createFailure(ERROR_CODES.TIMEOUT, { path: endpoint.path }) };
      }
      return { failure: createFailure(ERROR_CODES.UNAVAILABLE, { path: endpoint.path }) };
    }

    if (!response || typeof response !== 'object' || typeof response.status !== 'number') {
      return { failure: createFailure(ERROR_CODES.UNAVAILABLE, { path: endpoint.path }) };
    }
    return { response };
  }

  async function queue() {
    const { response, failure } = await invoke('queue');
    if (failure) return failure;
    if (response.status !== HTTP_STATUS.OK || !response.body?.success) {
      return mapResponseToFailure(response);
    }
    const list = Array.isArray(response.body.queue) ? response.body.queue : [];
    return createSuccess({
      length: list.length,
      queue: Object.freeze(list.slice())
    });
  }

  async function enqueue(request, requestOptions = {}) {
    let payload;
    try {
      payload = buildRequestPayload(request, requestOptions);
    } catch (error) {
      return createFailure(error.code || ERROR_CODES.INVALID_QUERY, error.params || {});
    }

    const { response, failure } = await invoke('request', null, payload);
    if (failure) return failure;
    if (response.status === HTTP_STATUS.OK && response.body?.success) {
      const song = response.body.song && typeof response.body.song === 'object'
        ? response.body.song
        : {};
      return createSuccess({
        position: Number.isInteger(response.body.position) ? response.body.position : null,
        title: typeof song.title === 'string' ? song.title : null,
        song: Object.freeze({ ...song })
      });
    }
    return mapResponseToFailure(response);
  }

  async function play(request = {}) {
    let payload;
    try {
      payload = buildQueuePlayPayload(request);
    } catch (error) {
      return createFailure(error.code || ERROR_CODES.BAD_INDEX, error.params || {});
    }

    const { response, failure } = await invoke('play', { index: Number(request.index) }, payload);
    if (failure) return failure;
    if (response.status === HTTP_STATUS.OK && response.body?.success) {
      const track = response.body.track && typeof response.body.track === 'object'
        ? response.body.track
        : (response.body.song && typeof response.body.song === 'object' ? response.body.song : {});
      return createSuccess({
        title: typeof track.title === 'string' ? track.title : null,
        alreadyPlaying: Boolean(response.body.alreadyPlaying)
      });
    }
    return mapResponseToFailure(response);
  }

  async function skip(request = {}) {
    const payload = buildSkipPayload(request);
    const { response, failure } = await invoke('skip', null, payload);
    if (failure) return failure;
    if (response.status === HTTP_STATUS.OK && response.body?.success) {
      const next = response.body.next && typeof response.body.next === 'object'
        ? response.body.next
        : null;
      return createSuccess({
        nextTitle: next && typeof next.title === 'string' ? next.title : null
      });
    }
    return mapResponseToFailure(response);
  }

  async function status() {
    const { response, failure } = await invoke('status');
    if (failure) return failure;
    if (response.status !== HTTP_STATUS.OK || !response.body?.success) {
      return mapResponseToFailure(response);
    }
    const body = response.body;
    return createSuccess({
      nowPlayingTitle: body.nowPlaying && typeof body.nowPlaying.title === 'string'
        ? body.nowPlaying.title
        : null,
      queueLength: Number.isInteger(body.queueLength) ? body.queueLength : 0,
      playbackState: typeof body.playbackState === 'string' ? body.playbackState : 'idle',
      locked: Boolean(body.locked)
    });
  }

  return Object.freeze({
    baseUrl,
    timeoutMs,
    queue,
    enqueue,
    play,
    skip,
    status,
    getBaseUrl: () => baseUrl,
    getTimeoutMs: () => timeoutMs
  });
}

/**
 * Reference HTTP server for tests and dry runs. It mirrors the documented
 * routes, status codes and `messageKey` values of the real plugin so the
 * client can be exercised without starting LTTH or mpv.
 *
 * @param {{
 *   queue?: Array<Object>,
 *   nowPlaying?: Object|null,
 *   playbackState?: string,
 *   locked?: boolean,
 *   failures?: Object<string, Object|Function>
 * }} [options]
 * @returns {Readonly<Object>}
 */
function createInMemoryMusicBotServer(options = {}) {
  let queue = Array.isArray(options.queue) ? options.queue.map((song) => ({ ...song })) : [];
  let nowPlaying = options.nowPlaying ? { ...options.nowPlaying } : null;
  let playbackState = typeof options.playbackState === 'string' ? options.playbackState : 'idle';
  let locked = Boolean(options.locked);
  let songCounter = queue.length;
  const failures = new Map(Object.entries(options.failures || {}));
  const calls = [];

  function lockedResponse() {
    return {
      status: HTTP_STATUS.LOCKED,
      body: {
        success: false,
        locked: true,
        error: 'Der Soundbot ist durch den Safety-Lock gesperrt.'
      }
    };
  }

  function state() {
    return {
      queue: queue.map((song) => ({ ...song })),
      nowPlaying: nowPlaying ? { ...nowPlaying } : null,
      playbackState,
      locked
    };
  }

  function findFailure(path) {
    if (failures.has(path)) return failures.get(path);
    for (const [key, value] of failures) {
      if (key instanceof RegExp && key.test(path)) return value;
    }
    return failures.has('*') ? failures.get('*') : undefined;
  }

  async function transport(request = {}) {
    const method = String(request.method || '').toUpperCase();
    const path = String(request.path || '');
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    calls.push({ method, path, body: { ...body } });

    const override = findFailure(path);
    if (override) {
      return typeof override === 'function' ? override({ method, path, body }) : override;
    }

    if (method === 'GET' && path === ENDPOINTS.queue.path) {
      return { status: HTTP_STATUS.OK, body: { success: true, queue: queue.map((song) => ({ ...song })) } };
    }

    if (method === 'GET' && path === ENDPOINTS.status.path) {
      return {
        status: HTTP_STATUS.OK,
        body: {
          success: true,
          nowPlaying: nowPlaying ? { ...nowPlaying } : null,
          queueLength: queue.length,
          playbackState,
          locked
        }
      };
    }

    if (method === 'POST' && path === ENDPOINTS.request.path) {
      if (locked) return lockedResponse();
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      if (!query) {
        return {
          status: HTTP_STATUS.BAD_REQUEST,
          body: { success: false, error: 'Missing query' }
        };
      }
      songCounter += 1;
      const song = {
        id: `song-${songCounter}`,
        title: query,
        url: `https://example.test/${encodeURIComponent(query)}`,
        requestedBy: typeof body.username === 'string' ? body.username : DEFAULT_REQUEST_USERNAME
      };
      queue.push(song);
      return {
        status: HTTP_STATUS.OK,
        body: { success: true, song: { ...song }, position: queue.length }
      };
    }

    const playMatch = path.match(/^\/api\/plugins\/music-bot\/queue\/(\d+)\/play$/);
    if (method === 'POST' && playMatch) {
      if (locked) return lockedResponse();
      const index = Number(playMatch[1]);
      const songId = typeof body.songId === 'string' ? body.songId : '';
      let currentIndex = index;
      if (songId) {
        currentIndex = queue.findIndex((song) => song.id === songId);
        if (currentIndex === -1) {
          if (nowPlaying && nowPlaying.id === songId) {
            return { status: HTTP_STATUS.OK, body: { success: true, track: { ...nowPlaying }, alreadyPlaying: true } };
          }
          return {
            status: HTTP_STATUS.CONFLICT,
            body: {
              success: false,
              staleQueue: true,
              error: 'Der ausgewaehlte Titel ist nicht mehr in der Queue.'
            }
          };
        }
      }
      const track = queue[currentIndex];
      if (!track) {
        return {
          status: HTTP_STATUS.BAD_REQUEST,
          body: { success: false, error: 'Invalid queue position' }
        };
      }
      queue.splice(currentIndex, 1);
      queue.unshift(track);
      nowPlaying = { ...track };
      playbackState = 'playing';
      return { status: HTTP_STATUS.OK, body: { success: true, track: { ...track } } };
    }

    if (method === 'POST' && path === ENDPOINTS.skip.path) {
      if (locked) return lockedResponse();
      nowPlaying = null;
      playbackState = 'idle';
      const next = queue.shift() || null;
      if (next) {
        nowPlaying = { ...next };
        playbackState = 'playing';
      }
      return {
        status: HTTP_STATUS.OK,
        body: { success: true, next: next ? { ...next } : null }
      };
    }

    return {
      status: HTTP_STATUS.NOT_FOUND,
      body: { success: false, error: 'Not found' }
    };
  }

  return Object.freeze({
    transport,
    calls,
    state,
    setQueue(list) {
      queue = Array.isArray(list) ? list.map((song) => ({ ...song })) : [];
      songCounter = queue.length;
    },
    setNowPlaying(song) {
      nowPlaying = song ? { ...song } : null;
    },
    setPlaybackState(value) {
      playbackState = typeof value === 'string' ? value : 'idle';
    },
    setLocked(value) {
      locked = Boolean(value);
    },
    failWith(path, response) {
      failures.set(path, response);
    },
    clearFailure(path) {
      if (path === undefined) failures.clear();
      else failures.delete(path);
    },
    reset() {
      queue = [];
      nowPlaying = null;
      playbackState = 'idle';
      locked = false;
      songCounter = 0;
      failures.clear();
      calls.length = 0;
    }
  });
}

module.exports = {
  CONTRACT_VERSION,
  COMMAND_NAME,
  DEFAULT_BASE_URL,
  BASE_PATH,
  DEFAULT_TIMEOUT_MS,
  MAX_QUERY_LENGTH,
  DEFAULT_REQUEST_USERNAME,
  DEFAULT_SKIP_REASON,
  HTTP_STATUS,
  ENDPOINTS,
  ERROR_CODES,
  MESSAGE_KEY_TO_ERROR_CODE,
  MESSAGE_KEYS,
  DEFAULT_MESSAGES,
  REQUIRED_CLIENT_METHODS,
  OPTIONAL_CLIENT_METHODS,
  normalizeSongQuery,
  assertSongRequest,
  isSongRequest,
  buildRequestPayload,
  buildQueuePlayPayload,
  buildSkipPayload,
  resolveEndpoint,
  buildRequestUrl,
  createFailure,
  createSuccess,
  mapResponseToFailure,
  assertMusicBotClient,
  isMusicBotClient,
  createMusicBotHttpClient,
  createInMemoryMusicBotServer
};
