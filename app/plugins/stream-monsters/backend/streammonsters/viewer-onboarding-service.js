const JOURNEY_STEPS = Object.freeze([
  'egg_received',
  'egg_hatched',
  'monster_selected',
  'battle_joined',
  'battle_completed'
]);

const JOURNEY_STEP_SET = new Set(JOURNEY_STEPS);

class ViewerOnboardingService {
  constructor({ store }) {
    this.store = store;
    this.db = store.db;
    this.insertStep = this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_viewer_onboarding (
        user_id, step_key, completed_at_ms
      ) VALUES (?, ?, ?)
    `);
    this.selectSteps = this.db.prepare(`
      SELECT step_key
      FROM streammonsters_viewer_onboarding
      WHERE user_id = ?
    `);
  }

  resolveViewerId(viewerId) {
    const value = String(viewerId || '').trim();
    if (!value) return null;
    return this.store.resolveKnownViewerId?.(value) || value;
  }

  recordStep(viewerId, step, atMs = Date.now()) {
    const resolvedViewerId = this.resolveViewerId(viewerId);
    const stepKey = String(step || '').trim();
    const completedAtMs = Number(atMs);
    if (
      !resolvedViewerId ||
      !JOURNEY_STEP_SET.has(stepKey) ||
      !Number.isFinite(completedAtMs) ||
      completedAtMs < 0
    ) {
      return false;
    }
    return this.insertStep.run(
      resolvedViewerId,
      stepKey,
      Math.round(completedAtMs)
    ).changes > 0;
  }

  getJourney(viewerId) {
    const resolvedViewerId = this.resolveViewerId(viewerId);
    const completed = new Set(
      resolvedViewerId
        ? this.selectSteps.all(resolvedViewerId).map(row => row.step_key)
        : []
    );
    const completedSteps = JOURNEY_STEPS.filter(step => completed.has(step));
    const nextStep = JOURNEY_STEPS.find(step => !completed.has(step)) || null;
    return {
      completedSteps,
      nextStep,
      complete: nextStep === null
    };
  }

  nextStep(viewerId) {
    return this.getJourney(viewerId).nextStep;
  }
}

module.exports = ViewerOnboardingService;
module.exports.JOURNEY_STEPS = JOURNEY_STEPS;
