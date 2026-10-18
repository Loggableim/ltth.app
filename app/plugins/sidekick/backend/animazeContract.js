/**
 * Sidekick Plugin - Animaze/ChatPal Wire Contract
 *
 * Dependency-free definition of the message contract between LTTH (Sidekick)
 * and Animaze ChatPal. This module is the canonical source for the wire format;
 * the transport implementation (`animazeTransport.js`, lt-k02 T2) and the test
 * doubles (`animazeMock.js`) build on it.
 *
 * Transport
 * ---------
 * WebSocket, default `ws://127.0.0.1:9000` (see `buildAnimazeUri`).
 *
 * Downstream (LTTH -> Animaze) command envelope:
 *   {
 *     action: 'ChatbotSendMessage',   // required, non-empty string
 *     message: 'text to speak',       // required for ChatbotSendMessage
 *     priority: 1,                    // optional, higher = earlier
 *     id: 'sidekick_1_<ts>'           // optional, request/response correlation
 *   }
 *
 * Upstream (Animaze -> LTTH) message envelope:
 *   { action: 'ChatbotSpeechStarted' }   // avatar started speaking
 *   { action: 'ChatbotSpeechEnded' }     // avatar stopped speaking
 *   { id: 'sidekick_1_<ts>', ... }       // response to a command carrying an id
 *   { error: 'description' }             // server-side error
 *
 * Encode/decode rules
 * -------------------
 * `encodeCommand` validates the envelope and throws a `TypeError` only for an
 * invalid *outbound* envelope (programming error).
 * `decodeMessage` never throws: malformed or non-object payloads return `null`
 * so an unreachable or misbehaving Animaze can never crash the caller.
 *
 * @typedef {Object} AnimazeCommand
 * @property {string} action                       Downstream action name.
 * @property {string} [message]                    Text to speak.
 * @property {number} [priority]                   Higher values are spoken first.
 * @property {string} [id]                         Correlation id for responses.
 *
 * @typedef {Object} AnimazeEvent
 * @property {string} [action]                     Upstream action name.
 * @property {string} [id]                         Response correlation id.
 * @property {string} [error]                      Server-side error description.
 *
 * @typedef {('command'|'speech-started'|'speech-ended'|'response'|'error'|'unknown'|null)} AnimazeMessageKind
 */

'use strict';

/**
 * Downstream/upstream action names.
 * @type {Readonly<{SEND_MESSAGE: string, SPEECH_STARTED: string, SPEECH_ENDED: string}>}
 */
const ANIMAZE_ACTIONS = Object.freeze({
  SEND_MESSAGE: 'ChatbotSendMessage',
  SPEECH_STARTED: 'ChatbotSpeechStarted',
  SPEECH_ENDED: 'ChatbotSpeechEnded'
});

/**
 * Classified message kinds returned by {@link classifyMessage}.
 * @type {Readonly<{COMMAND: string, SPEECH_STARTED: string, SPEECH_ENDED: string, RESPONSE: string, ERROR: string, UNKNOWN: string}>}
 */
const ANIMAZE_MESSAGE_KINDS = Object.freeze({
  COMMAND: 'command',
  SPEECH_STARTED: 'speech-started',
  SPEECH_ENDED: 'speech-ended',
  RESPONSE: 'response',
  ERROR: 'error',
  UNKNOWN: 'unknown'
});

/**
 * Default endpoint of the Animaze ChatPal WebSocket server.
 * @type {Readonly<{host: string, port: number}>}
 */
const ANIMAZE_ENDPOINT = Object.freeze({
  host: '127.0.0.1',
  port: 9000
});

/**
 * Check whether a value is a plain, non-array object.
 * @param {*} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);
}

/**
 * Check whether a value is a non-empty (trimmed) string.
 * @param {*} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Build the WebSocket URI for an Animaze endpoint. Accepts either a plain
 * `{host, port}` object or a Sidekick config object carrying `animaze`.
 * @param {{host?: string, port?: number, animaze?: {host?: string, port?: number}}} [config]
 * @returns {string}
 */
function buildAnimazeUri(config = {}) {
  const source = (config && config.animaze) || config || {};
  const host = isNonEmptyString(source.host) ? source.host : ANIMAZE_ENDPOINT.host;
  const port = Number.isInteger(source.port) ? source.port : ANIMAZE_ENDPOINT.port;
  return `ws://${host}:${port}`;
}

/**
 * Build a correlation id for a request/response round-trip.
 * @param {number} sequence
 * @param {number} [timestamp]
 * @returns {string}
 */
function buildRequestId(sequence, timestamp = Date.now()) {
  const safeSequence = Number.isFinite(sequence) ? Math.trunc(sequence) : 0;
  return `sidekick_${safeSequence}_${timestamp}`;
}

/**
 * Validate a downstream command envelope.
 * @param {*} value
 * @returns {boolean} True when the value can be sent to Animaze.
 */
function isValidCommand(value) {
  if (!isPlainObject(value) || !isNonEmptyString(value.action)) {
    return false;
  }
  if (value.action === ANIMAZE_ACTIONS.SEND_MESSAGE && !isNonEmptyString(value.message)) {
    return false;
  }
  if (value.id !== undefined && !isNonEmptyString(value.id)) {
    return false;
  }
  if (value.priority !== undefined && typeof value.priority !== 'number') {
    return false;
  }
  return true;
}

/**
 * Validate an upstream event envelope.
 * @param {*} value
 * @returns {boolean} True when the value is a recognized Animaze event.
 */
function isValidEvent(value) {
  if (!isPlainObject(value)) {
    return false;
  }
  const action = isNonEmptyString(value.action) ? value.action : value.event;
  if (action === ANIMAZE_ACTIONS.SPEECH_STARTED || action === ANIMAZE_ACTIONS.SPEECH_ENDED) {
    return true;
  }
  return isNonEmptyString(value.id) || isNonEmptyString(value.error);
}

/**
 * Classify an inbound message into one of {@link ANIMAZE_MESSAGE_KINDS}.
 * @param {*} value
 * @returns {AnimazeMessageKind} The kind, or `null` when the value is not an object.
 */
function classifyMessage(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  const action = isNonEmptyString(value.action) ? value.action : value.event;
  if (action === ANIMAZE_ACTIONS.SPEECH_STARTED) {
    return ANIMAZE_MESSAGE_KINDS.SPEECH_STARTED;
  }
  if (action === ANIMAZE_ACTIONS.SPEECH_ENDED) {
    return ANIMAZE_MESSAGE_KINDS.SPEECH_ENDED;
  }
  if (action === ANIMAZE_ACTIONS.SEND_MESSAGE) {
    return ANIMAZE_MESSAGE_KINDS.COMMAND;
  }
  if (isNonEmptyString(value.id)) {
    return ANIMAZE_MESSAGE_KINDS.RESPONSE;
  }
  if (isNonEmptyString(value.error)) {
    return ANIMAZE_MESSAGE_KINDS.ERROR;
  }
  return ANIMAZE_MESSAGE_KINDS.UNKNOWN;
}

/**
 * Encode an outbound command envelope as JSON.
 * @param {AnimazeCommand} command
 * @returns {string}
 * @throws {TypeError} when the envelope is invalid.
 */
function encodeCommand(command) {
  if (!isPlainObject(command)) {
    throw new TypeError('command must be a plain object');
  }
  if (!isNonEmptyString(command.action)) {
    throw new TypeError('command.action must be a non-empty string');
  }
  if (command.action === ANIMAZE_ACTIONS.SEND_MESSAGE && !isNonEmptyString(command.message)) {
    throw new TypeError('command.message must be a non-empty string for ChatbotSendMessage');
  }
  if (command.id !== undefined && !isNonEmptyString(command.id)) {
    throw new TypeError('command.id must be a non-empty string when provided');
  }
  if (command.priority !== undefined && typeof command.priority !== 'number') {
    throw new TypeError('command.priority must be a number when provided');
  }
  return JSON.stringify(command);
}

/**
 * Decode an inbound message. Accepts a JSON string, a Buffer or an already
 * parsed object. Never throws; malformed or non-object payloads return `null`.
 * @param {string|Buffer|AnimazeEvent|Object|null|undefined} raw
 * @returns {AnimazeEvent|null}
 */
function decodeMessage(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (isPlainObject(raw)) {
    return raw;
  }

  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  if (text.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

/**
 * Build a `ChatbotSendMessage` command envelope.
 * @param {string} text
 * @param {{priority?: number, requestId?: string}} [options]
 * @returns {AnimazeCommand}
 * @throws {TypeError} when text is empty.
 */
function buildSendMessageCommand(text, options = {}) {
  const message = isNonEmptyString(text) ? text.trim() : '';
  if (!message) {
    throw new TypeError('text must be a non-empty string');
  }

  const command = {
    action: ANIMAZE_ACTIONS.SEND_MESSAGE,
    message
  };

  if (options.priority !== undefined) {
    command.priority = options.priority;
  }
  if (options.requestId !== undefined && options.requestId !== null && options.requestId !== '') {
    command.id = options.requestId;
  }

  return command;
}

module.exports = {
  ANIMAZE_ACTIONS,
  ANIMAZE_MESSAGE_KINDS,
  ANIMAZE_ENDPOINT,
  isPlainObject,
  isNonEmptyString,
  buildAnimazeUri,
  buildRequestId,
  isValidCommand,
  isValidEvent,
  classifyMessage,
  encodeCommand,
  decodeMessage,
  buildSendMessageCommand
};
