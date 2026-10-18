'use strict';

/**
 * Plugin-Scheduler Contract — zeitbasierter Plugin-Wechsel nach Showplan
 * (Bead lt-9y3, Epic lt-5df T1)
 *
 * Dieses Modul ist die verbindliche Schnittstellen-Beschreibung (Contract) fuer
 * den zeitgesteuerten Plugin-Wechsel. Es enthaelt bewusst KEINE Scheduler-Logik:
 * es deklariert die Schnittstelle, validiert sie und liefert einen
 * Referenz-Controller (In-Memory) fuer Tests.
 *
 * Implementierung: `app/modules/plugin-scheduler.js` (lt-5df T2) — implementiert
 *   `normalizeShowplan`, `PluginScheduler`, `createPluginScheduler` und
 *   `createPluginLoaderController` gegen diesen Contract.
 * Tests: `app/test/plugin-scheduler-contract.test.js` (T1), `app/test/plugin-scheduler.test.js` (T2/T3).
 *
 * --- Showplan ------------------------------------------------------------------------
 *
 * Ein Showplan ist eine Liste von Schaltpunkten (Zeit -> Plugin). Der Contract
 * definiert die Eingabeform, die Implementierung loest sie in absolute
 * Schaltzeiten auf (`NormalizedSwitchpoint`).
 *
 * @typedef {Object} ShowplanEntry
 * @property {string} pluginId               Plugin-Id, nicht leer.
 * @property {'enable'|'disable'} [action]   Default 'enable'.
 * @property {number} [at]                   Absoluter Zeitpunkt (Epoch-ms).
 * @property {string} [time]                 Lokale Tageszeit 'HH:MM' oder 'HH:MM:SS'.
 *                                           Genau EINES von `at`/`time` ist erlaubt.
 *
 * @typedef {Object} NormalizedSwitchpoint
 * @property {number} at                     Aufgeloester, absoluter Schaltzeitpunkt (Epoch-ms).
 * @property {string} pluginId
 * @property {'enable'|'disable'} action
 *
 * --- Controller ----------------------------------------------------------------------
 *
 * Der Scheduler kennt keine Plugins direkt. Er schaltet ueber einen injizierten
 * Controller; die Anbindung an den echten PluginLoader passiert ausserhalb
 * (siehe `createPluginLoaderController` in `plugin-scheduler.js`).
 *
 * @typedef {Object} SchedulerController
 * @property {(pluginId: string) => boolean} isKnown               Ist das Plugin installiert?
 * @property {(pluginId: string) => boolean} [isEnabled]           Ist es aktuell aktiv? (optional)
 * @property {(pluginId: string) => Promise<boolean|void>} enable  Aktivieren.
 * @property {(pluginId: string) => Promise<boolean|void>} disable Deaktivieren.
 *
 * --- Status / Events -----------------------------------------------------------------
 *
 * @typedef {Object} SchedulerStatus
 * @property {string} name
 * @property {boolean} started
 * @property {number|null} startedAt
 * @property {number} toleranceMs
 * @property {number} count
 * @property {number} applied
 * @property {number} skipped
 * @property {number} failed
 * @property {number} pending
 * @property {number|null} nextAt
 * @property {string|null} activePluginId
 * @property {ReadonlyArray<Object>} entries
 *
 * Events (EventEmitter): 'switch' (angewendet), 'skip' (uebersprungen), 'error' (fehlgeschlagen).
 */

const CONTRACT_VERSION = '1.0.0';

const ACTIONS = Object.freeze(['enable', 'disable']);

const ENTRY_STATES = Object.freeze({
  pending: 'pending',
  applied: 'applied',
  skipped: 'skipped',
  failed: 'failed'
});

const SKIP_REASONS = Object.freeze({
  beforeStart: 'before-start',
  late: 'late',
  unknownPlugin: 'unknown-plugin',
  alreadyEnabled: 'already-enabled',
  alreadyDisabled: 'already-disabled'
});

const SCHEDULER_EVENTS = Object.freeze(['switch', 'skip', 'error']);

const DEFAULT_TOLERANCE_MS = 60000;

const REQUIRED_CONTROLLER_METHODS = Object.freeze(['isKnown', 'enable', 'disable']);
const OPTIONAL_CONTROLLER_METHODS = Object.freeze(['isEnabled']);

const TIME_OF_DAY_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Validate a 'HH:MM' or 'HH:MM:SS' local time-of-day string.
 * @param {unknown} value
 * @returns {boolean}
 */
function isTimeOfDay(value) {
  if (typeof value !== 'string') return false;
  const match = TIME_OF_DAY_PATTERN.exec(value.trim());
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  return hours <= 23 && minutes <= 59 && seconds <= 59;
}

/**
 * Validate a single showplan entry against the contract without resolving
 * `time` to an absolute instant (that needs a `startOfDay` and happens in the
 * implementation). Cross-entry rules (sorting, duplicate switch times) are the
 * scheduler's job.
 *
 * @param {unknown} entry
 * @param {number} [index] Optional position for error messages.
 * @returns {Readonly<{ pluginId: string, action: string, at: number|null, time: string|null }>}
 */
function assertShowplanEntry(entry, index) {
  const where = index === undefined ? 'showplan entry' : `showplan entry #${index}`;

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError(`${where} must be an object`);
  }

  const pluginId = typeof entry.pluginId === 'string' ? entry.pluginId.trim() : '';
  if (!pluginId) {
    throw new TypeError(`${where} needs a non-empty string 'pluginId'`);
  }

  const action = entry.action === undefined || entry.action === null ? 'enable' : entry.action;
  if (!ACTIONS.includes(action)) {
    throw new TypeError(`${where} has invalid action '${String(action)}'`);
  }

  const hasAt = entry.at !== undefined && entry.at !== null;
  const hasTime = entry.time !== undefined && entry.time !== null;
  if (hasAt === hasTime) {
    throw new TypeError(`${where} must set exactly one of 'at' or 'time'`);
  }

  if (hasAt && !Number.isFinite(Number(entry.at))) {
    throw new TypeError(`${where} 'at' must be a finite number`);
  }
  if (hasTime && !isTimeOfDay(entry.time)) {
    throw new TypeError(`${where} 'time' must be 'HH:MM' or 'HH:MM:SS'`);
  }

  return Object.freeze({
    pluginId,
    action,
    at: hasAt ? Number(entry.at) : null,
    time: hasTime ? String(entry.time).trim() : null
  });
}

/**
 * Check whether a value structurally satisfies {@link SchedulerController}.
 * @param {unknown} value
 * @returns {boolean}
 */
function isSchedulerController(value) {
  if (!value || typeof value !== 'object') return false;
  return REQUIRED_CONTROLLER_METHODS.every((method) => typeof value[method] === 'function');
}

/**
 * Assert that a controller satisfies the scheduler contract. Returns the
 * controller unchanged so it can be used inline.
 * @template T
 * @param {T} controller
 * @returns {T}
 */
function assertSchedulerController(controller) {
  if (!controller || typeof controller !== 'object') {
    throw new TypeError('scheduler controller must be an object');
  }
  const missing = REQUIRED_CONTROLLER_METHODS.filter(
    (method) => typeof controller[method] !== 'function'
  );
  if (missing.length > 0) {
    throw new TypeError(`scheduler controller is missing required method(s): ${missing.join(', ')}`);
  }
  return controller;
}

/**
 * Reference implementation of the {@link SchedulerController} contract for tests.
 * It keeps the known/enabled plugin sets in memory and records every switch call.
 * Use `failFor` to simulate a switching failure for a plugin id.
 *
 * @param {{ known?: Iterable<string>, enabled?: Iterable<string>, failFor?: Iterable<string> }} [options]
 * @returns {{
 *   controller: SchedulerController,
 *   known: Set<string>,
 *   enabled: Set<string>,
 *   calls: Array<{ action: string, pluginId: string }>,
 *   failFor: Set<string>,
 *   setKnown: (pluginId: string, value: boolean) => void,
 *   setEnabled: (pluginId: string, value: boolean) => void,
 *   reset: () => void
 * }}
 */
function createInMemoryController(options = {}) {
  const known = new Set(options.known || []);
  const enabled = new Set(options.enabled || []);
  const failFor = new Set(options.failFor || []);
  const calls = [];

  const controller = {
    isKnown(pluginId) {
      return known.has(pluginId);
    },
    isEnabled(pluginId) {
      return enabled.has(pluginId);
    },
    async enable(pluginId) {
      calls.push({ action: 'enable', pluginId });
      if (failFor.has(pluginId)) {
        throw new Error(`in-memory controller: enable failed for '${pluginId}'`);
      }
      const changed = !enabled.has(pluginId);
      enabled.add(pluginId);
      return changed;
    },
    async disable(pluginId) {
      calls.push({ action: 'disable', pluginId });
      if (failFor.has(pluginId)) {
        throw new Error(`in-memory controller: disable failed for '${pluginId}'`);
      }
      const changed = enabled.has(pluginId);
      enabled.delete(pluginId);
      return changed;
    }
  };

  return {
    controller,
    known,
    enabled,
    calls,
    failFor,
    setKnown(pluginId, value) {
      if (value) known.add(pluginId);
      else known.delete(pluginId);
    },
    setEnabled(pluginId, value) {
      if (value) enabled.add(pluginId);
      else enabled.delete(pluginId);
    },
    reset() {
      calls.length = 0;
    }
  };
}

module.exports = {
  CONTRACT_VERSION,
  ACTIONS,
  ENTRY_STATES,
  SKIP_REASONS,
  SCHEDULER_EVENTS,
  DEFAULT_TOLERANCE_MS,
  REQUIRED_CONTROLLER_METHODS,
  OPTIONAL_CONTROLLER_METHODS,
  TIME_OF_DAY_PATTERN,
  isTimeOfDay,
  assertShowplanEntry,
  isSchedulerController,
  assertSchedulerController,
  createInMemoryController
};
