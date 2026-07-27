const DEFAULT_INTERVAL_SECONDS = 90;
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 300;

const HINTS = Object.freeze({
  adopt: Object.freeze({ command: 'adopt', title: 'Free egg available', body: 'Adopt the next free egg in chat.' }),
  hatch: Object.freeze({ command: 'hatch', title: 'Egg ready', body: 'Hatch a ready egg by its slot.' }),
  eggs: Object.freeze({ command: 'eggs', title: 'Egg inventory', body: 'Check the eggs currently waiting for you.' }),
  collection: Object.freeze({ command: 'monsters', title: 'Collection updated', body: 'View every monster you have discovered.' }),
  monster: Object.freeze({ command: 'monster', title: 'Monster card', body: 'Open one monster card by its slot.' }),
  battle: Object.freeze({ command: 'battle', title: 'Battle ready', body: 'Join the next viewer battle.' }),
  roster: Object.freeze({ command: 'choose', title: 'Choose your fighter', body: 'Lock a monster for this battle.' }),
  skills: Object.freeze({ command: 'battle', title: 'Choose a skill', body: 'Reply A, B, or C before the timer expires.' }),
  stats: Object.freeze({ command: 'choose', title: 'Spend a stat point', body: 'Reply 1, 2, 3, or 4 to allocate it.' })
});

const EVENT_KINDS = Object.freeze({
  'streammonsters:free_egg_offered': 'adopt',
  'streammonsters:free_egg_claimed': 'eggs',
  'streammonsters:egg_spawned': 'eggs',
  'streammonsters:egg_ready': 'hatch',
  'streammonsters:egg_hatched': 'monster',
  'streammonsters:monster_discovered': 'collection',
  'streammonsters:battle_match_found': 'battle',
  'streammonsters:battle_roster_locked': 'roster',
  'streammonsters:battle_choice_opened': 'skills',
  'streammonsters:stat_choice_opened': 'stats',
  'streammonsters:monster_stat_prompt': 'stats'
});

class TutorialHintDirector {
  constructor({ getCommandReference = () => '', intervalSeconds = DEFAULT_INTERVAL_SECONDS } = {}) {
    this.getCommandReference = getCommandReference;
    this.intervalMs = DEFAULT_INTERVAL_SECONDS * 1000;
    this.nextAllowedAtMs = 0;
    this.pendingKind = null;
    this.setIntervalSeconds(intervalSeconds);
  }

  setIntervalSeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < MIN_INTERVAL_SECONDS || seconds > MAX_INTERVAL_SECONDS) {
      return this.intervalMs / 1000;
    }
    this.intervalMs = Math.round(seconds) * 1000;
    return this.intervalMs / 1000;
  }

  nextHint(state = {}, nowMs = Date.now()) {
    if (state?.critical || state?.criticalSequence) return null;
    const kind = EVENT_KINDS[String(state?.eventType || '')] || null;
    if (kind) this.pendingKind = kind;
    if (!this.pendingKind || nowMs < this.nextAllowedAtMs) return null;
    const nextKind = this.pendingKind;
    this.pendingKind = null;
    const definition = HINTS[nextKind];
    const command = String(this.getCommandReference(definition.command) || '').trim();
    if (!command) return null;
    this.nextAllowedAtMs = nowMs + this.intervalMs;
    return Object.freeze({
      kind: nextKind,
      title: definition.title,
      body: definition.body,
      command
    });
  }
}

module.exports = TutorialHintDirector;
module.exports.DEFAULT_INTERVAL_SECONDS = DEFAULT_INTERVAL_SECONDS;
module.exports.MIN_INTERVAL_SECONDS = MIN_INTERVAL_SECONDS;
module.exports.MAX_INTERVAL_SECONDS = MAX_INTERVAL_SECONDS;
