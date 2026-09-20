const DEFAULT_INTERVAL_SECONDS = 90;
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 300;

const HINTS = Object.freeze({
  adopt: Object.freeze({ command: 'adopt', titleKey: 'tutorialHintAdoptTitle', bodyKey: 'tutorialHintAdoptBody', title: 'Free egg available', body: 'Adopt the next free egg in chat.' }),
  hatch: Object.freeze({ command: 'hatch', titleKey: 'tutorialHintHatchTitle', bodyKey: 'tutorialHintHatchBody', title: 'Egg ready', body: 'Hatch a ready egg by its slot.' }),
  eggs: Object.freeze({ command: 'eggs', titleKey: 'tutorialHintEggsTitle', bodyKey: 'tutorialHintEggsBody', title: 'Egg inventory', body: 'Check the eggs currently waiting for you.' }),
  collection: Object.freeze({ command: 'monsters', titleKey: 'tutorialHintCollectionTitle', bodyKey: 'tutorialHintCollectionBody', title: 'Collection updated', body: 'View every monster you have discovered.' }),
  monster: Object.freeze({ command: 'monster', titleKey: 'tutorialHintMonsterTitle', bodyKey: 'tutorialHintMonsterBody', title: 'Monster card', body: 'Open one monster card by its slot.' }),
  battle: Object.freeze({ command: 'battle', titleKey: 'tutorialHintBattleTitle', bodyKey: 'tutorialHintBattleBody', title: 'Battle ready', body: 'Join the next viewer battle.' }),
  roster: Object.freeze({ command: 'choose', titleKey: 'tutorialHintRosterTitle', bodyKey: 'tutorialHintRosterBody', title: 'Choose your fighter', body: 'Lock a monster for this battle.' }),
  skills: Object.freeze({ responses: Object.freeze(['A', 'B', 'C']), titleKey: 'tutorialHintSkillsTitle', bodyKey: 'tutorialHintSkillsBody', title: 'Choose a skill', body: 'Reply A, B, or C before the timer expires.' }),
  stats: Object.freeze({ responses: Object.freeze(['1', '2', '3', '4']), titleKey: 'tutorialHintStatsTitle', bodyKey: 'tutorialHintStatsBody', title: 'Spend a stat point', body: 'Reply 1, 2, 3, or 4 to allocate it.' })
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

const JOURNEY_HINT_KINDS = Object.freeze({
  egg_received: 'adopt',
  egg_hatched: 'hatch',
  monster_selected: 'roster',
  battle_joined: 'battle',
  battle_completed: 'skills'
});

const JOURNEY_HINT_COPY = Object.freeze({
  egg_received: Object.freeze({
    titleKey: 'onboardingHintEggReceivedTitle',
    bodyKey: 'onboardingHintEggReceivedBody',
    title: 'Claim your first egg',
    body: 'Use the shown command to adopt your first egg.'
  }),
  egg_hatched: Object.freeze({
    titleKey: 'onboardingHintEggHatchedTitle',
    bodyKey: 'onboardingHintEggHatchedBody',
    title: 'Hatch your egg',
    body: 'Use the shown command and egg slot when it is ready.'
  }),
  monster_selected: Object.freeze({
    titleKey: 'onboardingHintMonsterSelectedTitle',
    bodyKey: 'onboardingHintMonsterSelectedBody',
    title: 'Choose your fighter',
    body: 'Use the shown command and monster slot.'
  }),
  battle_joined: Object.freeze({
    titleKey: 'onboardingHintBattleJoinedTitle',
    bodyKey: 'onboardingHintBattleJoinedBody',
    title: 'Join your first battle',
    body: 'Use the shown command to enter the battle queue.'
  }),
  battle_completed: Object.freeze({
    titleKey: 'onboardingHintBattleCompletedTitle',
    bodyKey: 'onboardingHintBattleCompletedBody',
    title: 'Finish your first battle',
    body: 'Reply A, B, or C when your skill window opens.'
  })
});

class TutorialHintDirector {
  constructor({
    getCommandReference = () => '',
    getJourney = null,
    intervalSeconds = DEFAULT_INTERVAL_SECONDS
  } = {}) {
    this.getCommandReference = getCommandReference;
    this.getJourney = typeof getJourney === 'function' ? getJourney : null;
    this.intervalMs = DEFAULT_INTERVAL_SECONDS * 1000;
    this.nextAllowedAtMs = 0;
    this.pendingKind = null;
    this.pendingViewerId = null;
    this.pendingStepKey = null;
    this.pendingContextual = false;
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
    const eventKind = EVENT_KINDS[String(state?.eventType || '')] || null;
    const viewerId = String(state?.viewerId || '').trim() || null;
    let kind = eventKind;
    let stepKey = null;
    let contextual = false;
    if (viewerId && this.getJourney) {
      const journey = this.getJourney(viewerId) || {};
      if (journey.complete || !journey.nextStep) {
        contextual = eventKind === 'stats';
        kind = contextual ? eventKind : null;
      } else {
        stepKey = String(journey.nextStep);
        kind = JOURNEY_HINT_KINDS[stepKey] || null;
      }
    }
    if (kind) {
      this.pendingKind = kind;
      this.pendingViewerId = viewerId;
      this.pendingStepKey = stepKey;
      this.pendingContextual = contextual;
    }
    if (state?.critical || state?.criticalSequence) return null;
    if (!this.pendingKind || nowMs < this.nextAllowedAtMs) return null;
    if (this.pendingViewerId && this.getJourney && !this.pendingContextual) {
      const journey = this.getJourney(this.pendingViewerId) || {};
      if (journey.complete || !journey.nextStep) {
        this.clearPending();
        return null;
      }
      this.pendingStepKey = String(journey.nextStep);
      this.pendingKind = JOURNEY_HINT_KINDS[this.pendingStepKey] || null;
      if (!this.pendingKind) {
        this.clearPending();
        return null;
      }
    }
    const nextKind = this.pendingKind;
    const nextStepKey = this.pendingStepKey;
    const isContextual = this.pendingContextual;
    this.pendingKind = null;
    this.pendingViewerId = null;
    this.pendingStepKey = null;
    this.pendingContextual = false;
    const definition = {
      ...HINTS[nextKind],
      ...(nextStepKey ? JOURNEY_HINT_COPY[nextStepKey] : null)
    };
    const command = Array.isArray(definition.responses)
      ? definition.responses.join(' / ')
      : String(this.getCommandReference(definition.command) || '').trim();
    if (!command) return null;
    this.nextAllowedAtMs = nowMs + this.intervalMs;
    return Object.freeze({
      kind: nextKind,
      label: 'NEXT',
      titleKey: definition.titleKey,
      bodyKey: definition.bodyKey,
      title: definition.title,
      body: definition.body,
      command,
      commands: Object.freeze([command]),
      params: Object.freeze({ command }),
      ...(nextStepKey ? { stepKey: nextStepKey } : {}),
      ...(isContextual ? { contextual: true } : {})
    });
  }

  clearPending() {
    this.pendingKind = null;
    this.pendingViewerId = null;
    this.pendingStepKey = null;
    this.pendingContextual = false;
  }
}

module.exports = TutorialHintDirector;
module.exports.DEFAULT_INTERVAL_SECONDS = DEFAULT_INTERVAL_SECONDS;
module.exports.MIN_INTERVAL_SECONDS = MIN_INTERVAL_SECONDS;
module.exports.MAX_INTERVAL_SECONDS = MAX_INTERVAL_SECONDS;
