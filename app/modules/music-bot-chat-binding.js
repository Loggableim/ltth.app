'use strict';

/**
 * Music-Bot Chat Binding — `!song` gegen den HTTP-Contract
 * (Bead lt-q71, Epic lt-x16 T2)
 *
 * Dieses Modul verbindet den Chat-Befehl `!song` mit dem in T1 definierten
 * HTTP-Contract (`app/modules/music-bot-http-contract.js`). Es enthaelt:
 *
 * 1. einen echten `fetch`-Transport, der `{ method, path, body }` in einen
 *    HTTP-Aufruf uebersetzt und `{ status, body }` zurueckliefert;
 * 2. eine Chat-Anbindung, die geparste Chat-Kommandos (`type: 'request'`)
 *    ueber den Contract-Client an `POST /api/plugins/music-bot/request`
 *    uebergibt;
 * 3. Fehlerpfade, die jeden Contract-Fehlercode in eine Chat-Meldung
 *    uebersetzen (ueber `MESSAGE_KEYS`/`DEFAULT_MESSAGES` oder eine
 *    injizierte `translate`-Funktion).
 *
 * Der Transport ist injizierbar, damit Tests den In-Memory-Server aus dem
 * Contract nutzen koennen. Produktion verwendet `globalThis.fetch` (Node 20/22).
 *
 * --- Ablauf -------------------------------------------------------------------------
 *
 * ```js
 * const { createMusicBotChatClient, createMusicBotChatBinding } =
 *   require('./music-bot-chat-binding');
 *
 * const client = createMusicBotChatClient({ baseUrl: 'http://127.0.0.1:3000' });
 * const binding = createMusicBotChatBinding({ client });
 *
 * const result = await binding.handle(
 *   { type: 'request', query: 'never gonna give you up' },
 *   { username: 'viewer-1' }
 * );
 * // Erfolg: { handled: true, ok: true, message: 'Hinzugefügt: ... (#3)', ... }
 * // Fehler: { handled: true, ok: false, code: 'timeout', message: '...' }
 * ```
 */

const {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  ERROR_CODES,
  MESSAGE_KEYS,
  DEFAULT_MESSAGES,
  createMusicBotHttpClient,
  assertMusicBotClient
} = require('./music-bot-http-contract');

const CHAT_BINDING_VERSION = '1.0.0';
const DEFAULT_SERVER_PORT = 3000;
const REQUEST_COMMAND_TYPE = 'request';
const UNSUPPORTED_COMMAND_CODE = 'unsupported-command';
const SUPPORTED_COMMAND_TYPES = Object.freeze([REQUEST_COMMAND_TYPE]);

/**
 * Normalize a base URL. Trailing slashes are removed; non-strings and empty
 * values yield ''.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeBaseUrl(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
}

/**
 * Resolve the base URL of the local LTTH HTTP server. An explicit base URL
 * wins; otherwise the port comes from the host config (`server_port`), the
 * `PORT` environment variable or the default port.
 *
 * @param {{ baseUrl?: unknown, port?: unknown, envPort?: unknown, getConfig?: Function }} [options]
 * @returns {string}
 */
function resolveMusicBotBaseUrl(options = {}) {
  const explicit = normalizeBaseUrl(options.baseUrl);
  if (explicit) return explicit;

  let port = options.port;
  if ((port === undefined || port === null || port === '') && typeof options.getConfig === 'function') {
    port = options.getConfig('server_port');
  }
  if (port === undefined || port === null || port === '') port = options.envPort;

  const numeric = Number(port);
  const resolvedPort = Number.isInteger(numeric) && numeric > 0 ? numeric : DEFAULT_SERVER_PORT;
  return `http://127.0.0.1:${resolvedPort}`;
}

/**
 * Build an absolute URL from a base URL and a contract path. Absolute request
 * paths are passed through unchanged.
 *
 * @param {string} baseUrl
 * @param {string} requestPath
 * @returns {string}
 */
function buildAbsoluteUrl(baseUrl, requestPath) {
  const base = normalizeBaseUrl(baseUrl) || DEFAULT_BASE_URL;
  const requestPathString = typeof requestPath === 'string' ? requestPath : '';
  if (/^https?:\/\//i.test(requestPathString)) return requestPathString;
  const suffix = requestPathString.startsWith('/') ? requestPathString : `/${requestPathString}`;
  return base + suffix;
}

async function readJsonBody(response) {
  if (!response || typeof response.json !== 'function') return {};
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Create a real HTTP transport for the Music-Bot contract. The transport
 * returns `{ status, body }` and lets `fetch` rejections propagate; the
 * contract client maps them to `unavailable`/`timeout`.
 *
 * @param {{ fetchImpl?: Function, baseUrl?: string, defaultHeaders?: Object }} [options]
 * @returns {(request: Object) => Promise<{ status: number, body: Object }>}
 */
function createFetchTransport(options = {}) {
  const fetchImpl = typeof options.fetchImpl === 'function'
    ? options.fetchImpl
    : (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  if (!fetchImpl) {
    throw new Error('music-bot chat transport: no fetch implementation available');
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl) || DEFAULT_BASE_URL;
  const baseHeaders = options.defaultHeaders && typeof options.defaultHeaders === 'object'
    ? { ...options.defaultHeaders }
    : {};
  if (!baseHeaders.Accept && !baseHeaders.accept) baseHeaders.Accept = 'application/json';

  return async function transport(request = {}) {
    const method = String(request.method || 'GET').toUpperCase();
    const url = buildAbsoluteUrl(baseUrl, request.path);
    const headers = { ...baseHeaders };
    const init = { method, headers };

    if (request.body !== null && request.body !== undefined) {
      init.body = JSON.stringify(request.body);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const response = await fetchImpl(url, init);
    const body = await readJsonBody(response);
    const status = response && typeof response.status === 'number' ? response.status : 0;
    return { status, body };
  };
}

/**
 * Translate a failed contract result into a chat message. Uses an optional
 * `translate(messageKey, params)` function first, then the contract's rendered
 * German fallback, then `DEFAULT_MESSAGES[code]`.
 *
 * @param {Object} result
 * @param {Function} [translate]
 * @returns {string}
 */
function localizeFailure(result, translate) {
  if (!result || typeof result !== 'object') return '';
  const params = result.params && typeof result.params === 'object' ? result.params : {};

  if (typeof translate === 'function') {
    const key = result.messageKey || MESSAGE_KEYS[result.code];
    if (key) {
      const translated = translate(key, params);
      if (typeof translated === 'string' && translated.trim()) return translated;
    }
  }

  if (typeof result.message === 'string' && result.message.trim()) return result.message;
  const fallback = DEFAULT_MESSAGES[result.code];
  return typeof fallback === 'string' ? fallback : '';
}

/**
 * Build the German success message used by the existing chat command.
 *
 * @param {{ title?: unknown, artist?: unknown, position?: unknown }} [song]
 * @returns {string}
 */
function formatAddedMessage(song = {}) {
  const title = typeof song.title === 'string' && song.title.trim() ? song.title.trim() : 'Song';
  const artist = typeof song.artist === 'string' && song.artist.trim()
    ? ` von ${song.artist.trim()}`
    : '';
  const position = Number.isInteger(song.position) && song.position > 0
    ? ` (#${song.position})`
    : '';
  return `Hinzugefügt: ${title}${artist}${position}`;
}

/**
 * Create the chat binding.
 *
 * @param {{ client: Object, translate?: Function, logger?: Function }} options
 * @returns {Readonly<Object>}
 */
function createMusicBotChatBinding(options = {}) {
  const client = assertMusicBotClient(options.client);
  const translate = typeof options.translate === 'function' ? options.translate : null;
  const logger = typeof options.logger === 'function' ? options.logger : null;

  function fail(result) {
    const code = result && result.code ? result.code : ERROR_CODES.REQUEST_FAILED;
    return Object.freeze({
      handled: true,
      ok: false,
      code,
      messageKey: (result && result.messageKey) || MESSAGE_KEYS[code] || null,
      params: Object.freeze({ ...(result && result.params ? result.params : {}) }),
      message: localizeFailure(result, translate)
    });
  }

  async function request(command, context = {}) {
    const safeCommand = command && typeof command === 'object' ? command : {};
    const safeContext = context && typeof context === 'object' ? context : {};
    const username = typeof safeContext.username === 'string' ? safeContext.username : undefined;
    const requestedBy = typeof safeContext.requestedBy === 'string' && safeContext.requestedBy.trim()
      ? safeContext.requestedBy.trim()
      : username;
    const requesterAvatar = typeof safeContext.requesterAvatar === 'string' && safeContext.requesterAvatar.trim()
      ? safeContext.requesterAvatar.trim()
      : null;

    let result;
    try {
      result = await client.enqueue(
        { query: safeCommand.query, requestedBy, requesterAvatar },
        { username }
      );
    } catch (error) {
      if (logger) logger(`chat request failed before transport: ${error && error.message ? error.message : error}`);
      return fail({
        code: ERROR_CODES.UNAVAILABLE,
        messageKey: MESSAGE_KEYS[ERROR_CODES.UNAVAILABLE],
        message: DEFAULT_MESSAGES[ERROR_CODES.UNAVAILABLE]
      });
    }

    if (!result || result.ok !== true) return fail(result);

    const song = result.song && typeof result.song === 'object' ? result.song : {};
    const title = typeof result.title === 'string' ? result.title : (typeof song.title === 'string' ? song.title : null);
    const position = Number.isInteger(result.position) ? result.position : null;
    return Object.freeze({
      handled: true,
      ok: true,
      code: null,
      messageKey: null,
      position,
      title,
      song: Object.freeze({ ...song }),
      message: formatAddedMessage({ title, artist: song.artist, position })
    });
  }

  async function handle(command, context) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      return fail({ code: ERROR_CODES.INVALID_QUERY });
    }
    if (command.type === REQUEST_COMMAND_TYPE) {
      return request(command, context);
    }
    return Object.freeze({
      handled: false,
      ok: false,
      code: UNSUPPORTED_COMMAND_CODE,
      messageKey: null,
      params: Object.freeze({}),
      message: ''
    });
  }

  return Object.freeze({
    version: CHAT_BINDING_VERSION,
    supportedCommandTypes: SUPPORTED_COMMAND_TYPES,
    handle,
    request,
    localize: (result) => localizeFailure(result, translate)
  });
}

/**
 * Convenience factory: build the contract client with a fetch transport unless
 * a transport is injected explicitly.
 *
 * @param {{ transport?: Function, fetchImpl?: Function, baseUrl?: string,
 *   timeoutMs?: number, headers?: Object }} [options]
 * @returns {Readonly<Object>}
 */
function createMusicBotChatClient(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl) || DEFAULT_BASE_URL;
  const transport = typeof options.transport === 'function'
    ? options.transport
    : createFetchTransport({
      fetchImpl: options.fetchImpl,
      baseUrl,
      defaultHeaders: options.headers
    });
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  return createMusicBotHttpClient({ transport, baseUrl, timeoutMs });
}

module.exports = {
  CHAT_BINDING_VERSION,
  DEFAULT_SERVER_PORT,
  REQUEST_COMMAND_TYPE,
  UNSUPPORTED_COMMAND_CODE,
  SUPPORTED_COMMAND_TYPES,
  normalizeBaseUrl,
  resolveMusicBotBaseUrl,
  buildAbsoluteUrl,
  createFetchTransport,
  localizeFailure,
  formatAddedMessage,
  createMusicBotChatBinding,
  createMusicBotChatClient
};
