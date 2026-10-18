'use strict';

/**
 * Plugin-Scheduler — zeitgesteuerter Plugin-Wechsel nach Showplan (lt-5df T2)
 *
 * Ein Showplan ist eine geordnete Liste von Schaltpunkten (Zeit -> Plugin). Der
 * Scheduler aktiviert/deaktiviert Plugins zur geplanten Zeit und stellt sicher,
 * dass sich Uebergaenge nicht ueberlappen und kein Schaltpunkt doppelt ausgefuehrt
 * wird.
 *
 * --- Contract / Interface (lt-5df T1) -------------------------------------------------
 *
 * Showplan-Eintrag:
 *   { pluginId: string, action?: 'enable'|'disable', at?: number, time?: 'HH:MM[:SS]' }
 *   - `at`   : absoluter Zeitpunkt in Epoch-Millisekunden.
 *   - `time` : lokale Tageszeit; wird gegen `startOfDay` aufgeloest (siehe unten).
 *   - Je Eintrag ist genau EINES von `at` oder `time` erlaubt.
 *   - `action` ist optional und defaultet auf 'enable'.
 *
 * `normalizeShowplan(rawPlan, { startOfDay })`
 *   - validiert, loest `time` gegen `startOfDay` (Epoch-ms des lokalen Tagesbeginns)
 *     auf, sortiert aufsteigend und friert das Ergebnis ein.
 *   - wirft bei ungueltigem Eintrag, unbekannter `action`, doppeltem `at`
 *     (mehrdeutiger Doppelwechsel) oder `time` vor `startOfDay`.
 *
 * `PluginScheduler` (auch via `createPluginScheduler(options)`):
 *   - `new PluginScheduler({ plan, controller, clock?, logger?, toleranceMs?, name? })`
 *   - `controller` (injizierbar): {
 *       isKnown(pluginId): boolean,
 *       isEnabled?(pluginId): boolean,
 *       enable(pluginId): Promise<boolean|void>,
 *       disable(pluginId): Promise<boolean|void>
 *     }
 *   - `clock()`: injizierbare Uhr (Default `() => Date.now()`) — macht Zeit logik testbar.
 *   - `start()`     : markiert Schaltpunkte vor dem Start als 'before-start' und startet.
 *   - `tick()`      : fuehrt alle faelligen Schaltpunkte der Reihe nach aus (single-flight).
 *   - `stop()`      : stoppt den Scheduler (kein interner Timer; `tick` treibt ihn).
 *   - `getStatus()` : Zustand inkl. naechstem Schaltpunkt.
 *   - Events: 'switch', 'skip', 'error'.
 *
 * --- Toleranz ------------------------------------------------------------------------
 *
 * Der Scheduler fuehrt keinen eigenen Timer. Der Aufrufer ruft `tick()` (z. B. alle
 * paar Sekunden). `toleranceMs` (Default 60000 = 1 Minute) legt fest, wie spaet ein
 * Schaltpunkt nach seiner geplanten Zeit noch ausgefuehrt werden darf:
 *   - `now - at <= toleranceMs`  -> wird ausgefuehrt (leicht verspaetet, normal).
 *   - `now - at >  toleranceMs`  -> wird als 'late' uebersprungen und geloggt.
 * Das verhindert ueberraschende Nachtschaltungen, wenn der Prozess pausiert war.
 * Schaltpunkte vor `start()` werden als 'before-start' uebersprungen, damit ein
 * spaeter Start nicht den halben Tag nachspielt.
 *
 * --- Fehlerfaelle --------------------------------------------------------------------
 *
 *   - Unbekanntes Plugin (`controller.isKnown` === false) -> 'unknown-plugin', geloggt, uebersprungen.
 *   - Fehler beim Schalten (z. B. Plugin laedt nicht) -> 'error', geloggt, uebersprungen;
 *     der Scheduler laeuft weiter und verarbeitet spaetere Schaltpunkte.
 *
 * Kein Overlap: Schaltpunkte werden strikt sequentiell und hoechstens einmal
 * ausgefuehrt; ein waehrend eines Laufs ausgeloester `tick()` teilt sich denselben Lauf.
 */

const EventEmitter = require('events');
const defaultLogger = require('./logger');

const ACTIONS = Object.freeze(['enable', 'disable']);
const DEFAULT_TOLERANCE_MS = 60000;

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

function parseTimeOfDay(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return { hours, minutes, seconds };
}

function resolveEntryAt(entry, startOfDay) {
  const hasAt = entry.at !== undefined && entry.at !== null;
  const hasTime = entry.time !== undefined && entry.time !== null;

  if (hasAt && hasTime) {
    throw new Error(`showplan entry must not set both 'at' and 'time' (${entry.pluginId || '?'})`);
  }

  if (hasAt) {
    const at = Number(entry.at);
    if (!Number.isFinite(at)) {
      throw new Error(`showplan entry 'at' must be a number (${entry.pluginId || '?'})`);
    }
    return at;
  }

  if (hasTime) {
    if (!Number.isFinite(Number(startOfDay))) {
      throw new Error("showplan entry uses 'time' but no 'startOfDay' was provided");
    }
    const parsed = parseTimeOfDay(entry.time);
    if (!parsed) {
      throw new Error(`showplan entry 'time' must be 'HH:MM' or 'HH:MM:SS' (${entry.time})`);
    }
    const at = Number(startOfDay) + ((parsed.hours * 60 + parsed.minutes) * 60 + parsed.seconds) * 1000;
    if (at < Number(startOfDay)) {
      throw new Error(`showplan entry 'time' resolves before startOfDay (${entry.time})`);
    }
    return at;
  }

  throw new Error(`showplan entry needs 'at' or 'time' (${entry.pluginId || '?'})`);
}

/**
 * Validate a raw showplan and resolve every entry to an absolute epoch-ms switch time.
 * @param {Array<object>} rawPlan
 * @param {{ startOfDay?: number }} [options]
 * @returns {ReadonlyArray<{ at: number, pluginId: string, action: string }>}
 */
function normalizeShowplan(rawPlan, options = {}) {
  if (!Array.isArray(rawPlan)) {
    throw new Error('showplan must be an array');
  }
  if (rawPlan.length === 0) {
    throw new Error('showplan must not be empty');
  }

  const startOfDay = options.startOfDay;
  const seenAt = new Map();

  const normalized = rawPlan.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`showplan entry #${index} must be an object`);
    }
    const pluginId = typeof entry.pluginId === 'string' ? entry.pluginId.trim() : '';
    if (!pluginId) {
      throw new Error(`showplan entry #${index} needs a non-empty 'pluginId'`);
    }
    const action = entry.action === undefined || entry.action === null ? 'enable' : entry.action;
    if (!ACTIONS.includes(action)) {
      throw new Error(`showplan entry #${index} has invalid action '${action}'`);
    }
    const at = resolveEntryAt(entry, startOfDay);

    if (seenAt.has(at)) {
      throw new Error(`showplan has two switches at the same time (${at}); ambiguous double switch`);
    }
    seenAt.set(at, pluginId);

    return Object.freeze({ at, pluginId, action });
  });

  normalized.sort((left, right) => left.at - right.at || left.pluginId.localeCompare(right.pluginId));
  return Object.freeze(normalized);
}

/**
 * Adapter that drives the real LTTH PluginLoader through the scheduler contract.
 * The loader is injected so the scheduler stays decoupled from server wiring.
 * @param {object} pluginLoader
 * @returns {{ isKnown: Function, isEnabled: Function, enable: Function, disable: Function }}
 */
function createPluginLoaderController(pluginLoader) {
  if (!pluginLoader || typeof pluginLoader.enablePlugin !== 'function' ||
      typeof pluginLoader.disablePlugin !== 'function') {
    throw new Error('createPluginLoaderController requires a PluginLoader with enablePlugin/disablePlugin');
  }

  return Object.freeze({
    isKnown(pluginId) {
      try {
        return Boolean(pluginLoader.resolvePluginInstallation(pluginId));
      } catch (error) {
        return false;
      }
    },
    isEnabled(pluginId) {
      try {
        return pluginLoader.isPluginEnabledFromDisk(pluginId) === true;
      } catch (error) {
        return false;
      }
    },
    async enable(pluginId) {
      return pluginLoader.enablePlugin(pluginId);
    },
    async disable(pluginId) {
      return pluginLoader.disablePlugin(pluginId);
    }
  });
}

class PluginScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    const { plan, controller, clock, logger, toleranceMs, name } = options;

    if (!controller || typeof controller.isKnown !== 'function' ||
        typeof controller.enable !== 'function' || typeof controller.disable !== 'function') {
      throw new Error('PluginScheduler requires a controller with isKnown/enable/disable');
    }
    if (clock !== undefined && typeof clock !== 'function') {
      throw new Error('PluginScheduler clock must be a function');
    }
    if (toleranceMs !== undefined && (!Number.isFinite(Number(toleranceMs)) || Number(toleranceMs) < 0)) {
      throw new Error('PluginScheduler toleranceMs must be a non-negative number');
    }

    this.name = typeof name === 'string' && name ? name : 'plugin-scheduler';
    this.clock = clock || (() => Date.now());
    this.logger = logger || defaultLogger;
    this.toleranceMs = toleranceMs === undefined ? DEFAULT_TOLERANCE_MS : Number(toleranceMs);
    this.controller = controller;
    this.entries = normalizeShowplan(plan).map((entry) => ({
      ...entry,
      state: ENTRY_STATES.pending,
      reason: null,
      appliedAt: null
    }));

    this.started = false;
    this.startedAt = null;
    this.activePluginId = null;
    this._running = null;
  }

  _log(level, message) {
    const fn = this.logger && typeof this.logger[level] === 'function' ? this.logger[level] : null;
    if (fn) fn.call(this.logger, `[${this.name}] ${message}`);
  }

  _mark(entry, state, reason) {
    entry.state = state;
    entry.reason = reason || null;
    if (state === ENTRY_STATES.applied) entry.appliedAt = this.clock();
  }

  /**
   * Start the scheduler at the current clock time. Switch points before this
   * instant are skipped as 'before-start' so a late start never replays the day.
   */
  start() {
    const now = this.clock();
    this.started = true;
    this.startedAt = now;
    for (const entry of this.entries) {
      if (entry.state !== ENTRY_STATES.pending) continue;
      if (entry.at < now) {
        this._mark(entry, ENTRY_STATES.skipped, SKIP_REASONS.beforeStart);
        this.emit('skip', { entry: this._publicEntry(entry), reason: SKIP_REASONS.beforeStart });
        this._log('warn', `skip ${entry.pluginId} ${entry.action} at ${entry.at}: ${SKIP_REASONS.beforeStart}`);
      }
    }
    this._log('info', `scheduler started (${this.entries.length} entries, tolerance ${this.toleranceMs}ms)`);
    return this.getStatus();
  }

  stop() {
    this.started = false;
    this._log('info', 'scheduler stopped');
    return this.getStatus();
  }

  /**
   * Apply every due switch point in order. Single-flight: concurrent calls share
   * one run, so transitions never overlap.
   */
  tick() {
    if (this._running) return this._running;
    const run = (async () => {
      const now = this.clock();
      for (const entry of this.entries) {
        if (entry.state !== ENTRY_STATES.pending) continue;
        if (entry.at > now) break;
        await this._apply(entry, now);
      }
      return this.getStatus();
    })();
    this._running = run.finally(() => {
      this._running = null;
    });
    return this._running;
  }

  async _apply(entry, now) {
    const { pluginId, action } = entry;
    const publicEntry = () => this._publicEntry(entry);

    if (now - entry.at > this.toleranceMs) {
      this._mark(entry, ENTRY_STATES.skipped, SKIP_REASONS.late);
      this.emit('skip', { entry: publicEntry(), reason: SKIP_REASONS.late });
      this._log('warn', `skip ${pluginId} ${action} at ${entry.at}: ${SKIP_REASONS.late} (${now - entry.at}ms late)`);
      return;
    }

    let known = false;
    try {
      known = this.controller.isKnown(pluginId) === true;
    } catch (error) {
      this._fail(entry, error);
      return;
    }
    if (!known) {
      this._mark(entry, ENTRY_STATES.skipped, SKIP_REASONS.unknownPlugin);
      this.emit('skip', { entry: publicEntry(), reason: SKIP_REASONS.unknownPlugin });
      this._log('warn', `skip ${pluginId} ${action}: ${SKIP_REASONS.unknownPlugin}`);
      return;
    }

    const enabled = this._currentEnabled(pluginId);
    if (action === 'enable' && enabled === true) {
      this._mark(entry, ENTRY_STATES.skipped, SKIP_REASONS.alreadyEnabled);
      this.emit('skip', { entry: publicEntry(), reason: SKIP_REASONS.alreadyEnabled });
      this._log('info', `skip ${pluginId} enable: ${SKIP_REASONS.alreadyEnabled}`);
      return;
    }
    if (action === 'disable' && enabled === false) {
      this._mark(entry, ENTRY_STATES.skipped, SKIP_REASONS.alreadyDisabled);
      this.emit('skip', { entry: publicEntry(), reason: SKIP_REASONS.alreadyDisabled });
      this._log('info', `skip ${pluginId} disable: ${SKIP_REASONS.alreadyDisabled}`);
      return;
    }

    try {
      if (action === 'enable') {
        await this.controller.enable(pluginId);
        this.activePluginId = pluginId;
      } else {
        await this.controller.disable(pluginId);
        if (this.activePluginId === pluginId) this.activePluginId = null;
      }
    } catch (error) {
      this._fail(entry, error);
      return;
    }

    this._mark(entry, ENTRY_STATES.applied, null);
    this.emit('switch', { entry: publicEntry() });
    this._log('info', `applied ${action} ${pluginId} at ${entry.at}`);
  }

  _currentEnabled(pluginId) {
    if (typeof this.controller.isEnabled !== 'function') return null;
    try {
      const value = this.controller.isEnabled(pluginId);
      return value === true ? true : value === false ? false : null;
    } catch (error) {
      return null;
    }
  }

  _fail(entry, error) {
    this._mark(entry, ENTRY_STATES.failed, 'error');
    const message = error && error.message ? error.message : String(error);
    this.emit('error', { entry: this._publicEntry(entry), error });
    this._log('error', `failed ${entry.action} ${entry.pluginId}: ${message}`);
  }

  _publicEntry(entry) {
    return Object.freeze({
      at: entry.at,
      pluginId: entry.pluginId,
      action: entry.action,
      state: entry.state,
      reason: entry.reason,
      appliedAt: entry.appliedAt
    });
  }

  /** Next not-yet-applied switch time, or null when the showplan is done. */
  nextAt() {
    const next = this.entries.find((entry) => entry.state === ENTRY_STATES.pending);
    return next ? next.at : null;
  }

  getStatus() {
    const applied = this.entries.filter((entry) => entry.state === ENTRY_STATES.applied).length;
    const skipped = this.entries.filter((entry) => entry.state === ENTRY_STATES.skipped).length;
    const failed = this.entries.filter((entry) => entry.state === ENTRY_STATES.failed).length;
    const pending = this.entries.filter((entry) => entry.state === ENTRY_STATES.pending).length;
    return {
      name: this.name,
      started: this.started,
      startedAt: this.startedAt,
      toleranceMs: this.toleranceMs,
      count: this.entries.length,
      applied,
      skipped,
      failed,
      pending,
      nextAt: this.nextAt(),
      activePluginId: this.activePluginId,
      entries: this.entries.map((entry) => this._publicEntry(entry))
    };
  }
}

function createPluginScheduler(options) {
  return new PluginScheduler(options);
}

module.exports = {
  PluginScheduler,
  createPluginScheduler,
  createPluginLoaderController,
  normalizeShowplan,
  parseTimeOfDay,
  DEFAULT_TOLERANCE_MS,
  ACTIONS,
  ENTRY_STATES,
  SKIP_REASONS
};
