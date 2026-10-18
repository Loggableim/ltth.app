'use strict';

/**
 * Soundboard Command Handler — `!sound <name>` (Bead lt-6rm, Epic lt-mx7 T2)
 *
 * Uebersetzt die Schritte Validierung -> Enabled-Pruefung -> Aufloesung ->
 * Wiedergabe in die GCCE-Antwortform und liefert pro Fehlerpfad eine klare
 * Chat-Meldung. Cooldown und Rechte prueft GCCE selbst
 * (`COMMAND_ON_COOLDOWN` / `PERMISSION_DENIED`); dieser Handler fuehrt nur die
 * Sound-spezifischen Fehlerpfade.
 */

const { ERROR_CODES, normalizeSoundName } = require('./command-client');

const MESSAGE_KEYS = Object.freeze({
  [ERROR_CODES.INVALID_NAME]: 'soundboard.command.errors.invalidName',
  [ERROR_CODES.EMPTY_NAME]: 'soundboard.command.errors.emptyName',
  [ERROR_CODES.INVALID_VOLUME]: 'soundboard.command.errors.invalidVolume',
  [ERROR_CODES.SOUND_NOT_FOUND]: 'soundboard.command.errors.notFound',
  [ERROR_CODES.SOUNDBOARD_DISABLED]: 'soundboard.command.errors.disabled',
  [ERROR_CODES.RESOLVE_FAILED]: 'soundboard.command.errors.resolveFailed',
  [ERROR_CODES.PLAYBACK_FAILED]: 'soundboard.command.errors.playbackFailed'
});

const DEFAULT_MESSAGES = Object.freeze({
  [ERROR_CODES.INVALID_NAME]: 'That sound name is not valid.',
  [ERROR_CODES.EMPTY_NAME]: 'Please name a sound, e.g. !sound airhorn.',
  [ERROR_CODES.INVALID_VOLUME]: 'Volume must be between 0 and 1.',
  [ERROR_CODES.SOUND_NOT_FOUND]: 'Unknown sound "{name}".',
  [ERROR_CODES.SOUNDBOARD_DISABLED]: 'The soundboard is currently disabled.',
  [ERROR_CODES.RESOLVE_FAILED]: 'Could not look up the sound. Please try again later.',
  [ERROR_CODES.PLAYBACK_FAILED]: 'Could not play the sound. Please try again later.'
});

/**
 * Interpolate `{param}` placeholders. Unknown placeholders are left untouched.
 *
 * @param {string} template
 * @param {Object} params
 * @returns {string}
 */
function interpolate(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (
    params[key] === undefined || params[key] === null ? match : String(params[key])
  ));
}

/**
 * Orchestrates the `!sound` command against a soundboard client.
 */
class SoundboardCommandHandler {
  /**
   * @param {{
   *   client: { isEnabled: Function, resolve: Function, play: Function },
   *   messages?: Object,
   *   logger?: { info?: Function, warn?: Function, error?: Function, debug?: Function }
   * }} options
   */
  constructor(options = {}) {
    const client = options.client;
    if (!client || typeof client.isEnabled !== 'function'
      || typeof client.resolve !== 'function' || typeof client.play !== 'function') {
      throw new TypeError('SoundboardCommandHandler requires a client with isEnabled(), resolve() and play()');
    }

    this.client = client;
    this.messages = options.messages || DEFAULT_MESSAGES;
    this.logger = options.logger || {};
  }

  /**
   * GCCE command handler. `args` is the whitespace-split argument list; the
   * sound name may contain spaces, so it is re-joined.
   *
   * @param {string[]|string} args
   * @param {{ userId?: string, username?: string }} [context]
   * @returns {Promise<object>} GCCE command result
   */
  async handle(args, context = {}) {
    const rawName = Array.isArray(args) ? args.join(' ') : String(args === undefined || args === null ? '' : args);
    const requestedBy = context.userId !== undefined && context.userId !== null
      ? String(context.userId)
      : (context.username !== undefined && context.username !== null ? String(context.username) : null);

    const trimmed = rawName.trim();
    if (!trimmed) {
      return this._failure(ERROR_CODES.EMPTY_NAME, {});
    }

    const name = normalizeSoundName(trimmed);
    if (!name) {
      return this._failure(ERROR_CODES.INVALID_NAME, {});
    }

    if (!this.client.isEnabled()) {
      return this._failure(ERROR_CODES.SOUNDBOARD_DISABLED, {});
    }

    let sound;
    try {
      sound = await this.client.resolve(name);
    } catch (error) {
      this._error(`Sound resolution failed for "${name}": ${error.message}`);
      return this._failure(ERROR_CODES.RESOLVE_FAILED, { name });
    }

    if (!sound) {
      return this._failure(ERROR_CODES.SOUND_NOT_FOUND, { name });
    }

    let result;
    try {
      result = await this.client.play(sound, { requestedBy });
    } catch (error) {
      this._error(`Sound playback failed for "${name}": ${error.message}`);
      return this._failure(ERROR_CODES.PLAYBACK_FAILED, { name });
    }

    if (!result || !result.success) {
      const errorCode = (result && result.errorCode) || ERROR_CODES.PLAYBACK_FAILED;
      const params = (result && result.params) || { name };
      return this._failure(errorCode, params);
    }

    const label = (result.sound && result.sound.label) || sound.label || name;
    this._info(`Playing sound "${label}" for ${requestedBy || 'unknown viewer'}`);

    return Object.freeze({
      success: true,
      message: `Playing "${label}"`,
      errorCode: null,
      data: { sound: result.sound, audioTarget: result.audioTarget || null }
    });
  }

  _failure(errorCode, params) {
    return Object.freeze({
      success: false,
      error: this._message(errorCode, params),
      errorCode,
      displayOverlay: true
    });
  }

  _message(errorCode, params) {
    const template = this.messages[errorCode] || DEFAULT_MESSAGES[errorCode] || 'Sound command failed.';
    return interpolate(template, params || {});
  }

  _info(message) {
    if (this.logger && typeof this.logger.info === 'function') this.logger.info(message);
  }

  _error(message) {
    if (this.logger && typeof this.logger.error === 'function') this.logger.error(message);
  }
}

module.exports = {
  MESSAGE_KEYS,
  DEFAULT_MESSAGES,
  interpolate,
  SoundboardCommandHandler
};
