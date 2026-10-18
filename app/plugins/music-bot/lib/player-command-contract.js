/**
 * Kanonischer, abhaengigkeitsfreier Contract fuer die Player-Chatbefehle
 * `!play`, `!skip` und `!status` (lt-j9s T1).
 *
 * Dieses Modul definiert ausschliesslich die Schnittstelle: erkannte Befehle,
 * Aliase, Default-Rechte, Argument-Regeln, die kanonische Payload-Form sowie
 * die Statusausgabe-Form. Es enthaelt bewusst KEINE Plugin-Logik und greift
 * nicht auf Playback, Queue oder Datenbank zu.
 *
 * Die Implementierung (Anbindung an den Music-Bot) liegt in T2
 * (app/plugins/music-bot/main.js). Dieser Contract ist die verbindliche
 * Referenz fuer beide Teile.
 *
 * @typedef {'play'|'skip'|'status'} PlayerCommandType
 *
 * @typedef {Object} PlayerCommandPayload
 * @property {PlayerCommandType} type - Kanonischer Befehlstyp.
 * @property {number|null} [index] - Nur `play`: 0-basierte Queue-Position,
 *   `null` bedeutet "starten/fortsetzen".
 * @property {boolean} [force] - Nur `skip`: erzwingt den Skip (true), wenn die
 *   ausfuehrende Rolle den Viewer-Level ueberschreitet.
 *
 * @typedef {Object} PlayerStatusState
 * @property {boolean} [safetyLocked] - Safety-Lock aktiv.
 * @property {string} [state] - Interner Player-Zustand (z. B. `playing`,
 *   `paused`, `idle`).
 * @property {{title?: string}|null} [nowPlaying] - Aktuell laufender Track.
 * @property {number} [queueLength] - Anzahl wartender Songs.
 *
 * @typedef {Object} PlayerStatusSnapshot
 * @property {boolean} safetyLocked
 * @property {string} state
 * @property {string|null} nowPlayingTitle
 * @property {number} queueLength
 */

'use strict';

/** @type {PlayerCommandType[]} */
const PLAYER_COMMAND_TYPES = ['play', 'skip', 'status'];

/** Default-Befehlsnamen (Prefix wird separat gesetzt). */
const PLAYER_COMMAND_NAMES = Object.freeze({
  play: 'play',
  skip: 'skip',
  status: 'status'
});

/** Default-Aliase passend zu T2 (main.js DEFAULT_CONFIG.commandAliases). */
const PLAYER_COMMAND_ALIASES = Object.freeze({
  play: ['resumeplay'],
  skip: [],
  status: ['state']
});

/** Default-Berechtigungen passend zu T2 (main.js DEFAULT_CONFIG.permissions). */
const PLAYER_COMMAND_PERMISSIONS = Object.freeze({
  play: 'mod',
  skip: 'viewer',
  status: 'viewer'
});

/** Spam-Schutz fuer Player-Steuerbefehle aus dem Chat (Millisekunden). */
const DEFAULT_CHAT_PLAYER_COMMAND_COOLDOWN_MS = 5000;

const DEFAULT_COMMAND_PREFIX = '!';

/**
 * Normalisiert einen Command-Key: trimmt, lowercase und entfernt ein
 * fuehrendes Prefix.
 * @param {unknown} value
 * @param {string} [prefix]
 * @returns {string}
 */
function normalizeCommandKey(value, prefix = DEFAULT_COMMAND_PREFIX) {
  const key = String(value == null ? '' : value).trim().toLowerCase();
  const normalizedPrefix = String(prefix == null ? '' : prefix).trim().toLowerCase();
  if (normalizedPrefix && key.startsWith(normalizedPrefix)) {
    return key.slice(normalizedPrefix.length).trim();
  }
  return key;
}

/**
 * Loest einen eingegebenen Command-Key auf einen der Player-Typen auf.
 * Reihenfolge: Default-Name, konfigurierter Name, Alias.
 * @param {string} key
 * @param {{prefix?: string, commands?: Record<string,string>, aliases?: Record<string,string[]>}} [options]
 * @returns {PlayerCommandType|null}
 */
function resolvePlayerCommandType(key, options = {}) {
  const normalized = normalizeCommandKey(key, options.prefix);
  if (!normalized) return null;

  const commands = { ...PLAYER_COMMAND_NAMES, ...(options.commands || {}) };
  const aliases = { ...PLAYER_COMMAND_ALIASES, ...(options.aliases || {}) };

  for (const type of PLAYER_COMMAND_TYPES) {
    if (normalizeCommandKey(commands[type], options.prefix) === normalized) return type;
  }
  for (const type of PLAYER_COMMAND_TYPES) {
    const list = aliases[type] || [];
    if (list.some((alias) => normalizeCommandKey(alias, options.prefix) === normalized)) {
      return type;
    }
  }
  return null;
}

/**
 * Baut die kanonische Payload fuer einen Player-Befehl.
 * @param {PlayerCommandType} type
 * @param {string[]} [args] - Token nach dem Befehlswort.
 * @param {string} [requiredPermission] - Effektives Recht (fuer `skip.force`).
 * @returns {PlayerCommandPayload|null}
 */
function buildPlayerCommandPayload(type, args = [], requiredPermission = 'viewer') {
  const tokens = Array.isArray(args) ? args : [];
  switch (type) {
    case 'play': {
      const rawIndex = Number(tokens[0]);
      if (Number.isFinite(rawIndex) && rawIndex > 0) {
        return { type, index: Math.floor(rawIndex) - 1 };
      }
      return { type, index: null };
    }
    case 'skip':
      return { type, force: requiredPermission !== 'viewer' };
    case 'status':
      return { type };
    default:
      return null;
  }
}

/**
 * Parst eine Chat-Nachricht in eine kanonische Player-Command-Payload.
 * Reine Funktion: keine Berechtigungspruefung, kein Cooldown, kein I/O.
 * @param {unknown} rawMessage
 * @param {{prefix?: string, commands?: Record<string,string>, aliases?: Record<string,string[]>, permission?: string}} [options]
 * @returns {PlayerCommandPayload|null} `null`, wenn kein Player-Befehl erkannt wird.
 */
function parsePlayerCommand(rawMessage, options = {}) {
  const prefix = options.prefix == null ? DEFAULT_COMMAND_PREFIX : String(options.prefix);
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  if (!prefix || !message.startsWith(prefix)) return null;

  const [commandKey, ...args] = message.slice(prefix.length).trim().split(/\s+/);
  if (!commandKey) return null;

  const type = resolvePlayerCommandType(commandKey, { ...options, prefix });
  if (!type) return null;

  const permission = options.permission
    || PLAYER_COMMAND_PERMISSIONS[type]
    || 'viewer';
  return buildPlayerCommandPayload(type, args, permission);
}

/**
 * Prueft strukturell, ob eine Payload dem Contract genuegt.
 * @param {unknown} payload
 * @returns {boolean}
 */
function isValidPlayerCommandPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!PLAYER_COMMAND_TYPES.includes(payload.type)) return false;
  if (payload.type === 'play') {
    return payload.index === null
      || (Number.isInteger(payload.index) && payload.index >= 0);
  }
  if (payload.type === 'skip') {
    return typeof payload.force === 'boolean';
  }
  return true;
}

/**
 * Cooldown-Schluessel fuer Player-Befehle (pro Nutzer und Befehl).
 * @param {string} type
 * @param {string} [username]
 * @returns {string}
 */
function createCooldownKey(type, username) {
  return `${type}:${String(username || 'viewer').toLowerCase()}`;
}

/**
 * Normalisiert den internen Player-Zustand zu einem Status-Snapshot.
 * @param {PlayerStatusState} [playerState]
 * @returns {PlayerStatusSnapshot}
 */
function buildPlayerStatusSnapshot(playerState = {}) {
  const safetyLocked = playerState.safetyLocked === true;
  const queueLength = Number.isFinite(playerState.queueLength)
    ? Math.max(0, Math.trunc(playerState.queueLength))
    : 0;
  const nowPlaying = playerState.nowPlaying || null;
  const title = nowPlaying && typeof nowPlaying.title === 'string' && nowPlaying.title
    ? nowPlaying.title
    : null;
  return {
    safetyLocked,
    state: typeof playerState.state === 'string' && playerState.state
      ? playerState.state
      : 'idle',
    nowPlayingTitle: title,
    queueLength
  };
}

/**
 * Formatiert die Statusausgabe konsistent zum internen Player-Zustand.
 * Format (identisch zu T2 _formatChatStatus):
 * - Safety-Lock:   `Status: gesperrt (Safety-Lock) | Queue: <n>`
 * - sonst:         `Status: <state> | Jetzt läuft: <titel> | Queue: <n>`
 *                  bzw. `Status: <state> | Nichts läuft | Queue: <n>`
 * @param {PlayerStatusState} [playerState]
 * @returns {string}
 */
function formatPlayerStatusMessage(playerState = {}) {
  const snapshot = buildPlayerStatusSnapshot(playerState);
  if (snapshot.safetyLocked) {
    return `Status: gesperrt (Safety-Lock) | Queue: ${snapshot.queueLength}`;
  }
  const nowPlaying = snapshot.nowPlayingTitle
    ? `Jetzt läuft: ${snapshot.nowPlayingTitle}`
    : 'Nichts läuft';
  return `Status: ${snapshot.state} | ${nowPlaying} | Queue: ${snapshot.queueLength}`;
}

module.exports = {
  PLAYER_COMMAND_TYPES,
  PLAYER_COMMAND_NAMES,
  PLAYER_COMMAND_ALIASES,
  PLAYER_COMMAND_PERMISSIONS,
  DEFAULT_CHAT_PLAYER_COMMAND_COOLDOWN_MS,
  DEFAULT_COMMAND_PREFIX,
  normalizeCommandKey,
  resolvePlayerCommandType,
  buildPlayerCommandPayload,
  parsePlayerCommand,
  isValidPlayerCommandPayload,
  createCooldownKey,
  buildPlayerStatusSnapshot,
  formatPlayerStatusMessage
};
