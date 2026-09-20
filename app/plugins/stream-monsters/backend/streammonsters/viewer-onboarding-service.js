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
    this.countSteps = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_viewer_onboarding
      WHERE user_id = ?
    `);
    this.insertCohort = this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_viewer_journey_cohorts (
        user_id, stream_key, started_at_ms
      ) VALUES (?, ?, ?)
    `);
    this.selectCohortSize = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_viewer_journey_cohorts
      WHERE stream_key = ?
    `);
    this.selectCohortStepCounts = this.db.prepare(`
      SELECT onboarding.step_key, COUNT(*) AS count
      FROM streammonsters_viewer_journey_cohorts cohort
      JOIN streammonsters_viewer_onboarding onboarding
        ON onboarding.user_id = cohort.user_id
      WHERE cohort.stream_key = ?
      GROUP BY onboarding.step_key
    `);
  }

  resolveViewerId(viewerId) {
    const value = String(viewerId || '').trim();
    if (!value) return null;
    return this.store.resolveKnownViewerId?.(value) || value;
  }

  recordStep(viewerId, step, atMs = Date.now(), streamKey = null) {
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
    const inserted = this.insertStep.run(
      resolvedViewerId,
      stepKey,
      Math.round(completedAtMs)
    ).changes > 0;
    const normalizedStreamKey = String(streamKey || '').trim();
    if (
      inserted &&
      normalizedStreamKey &&
      normalizedStreamKey !== 'offline' &&
      Number(this.countSteps.get(resolvedViewerId)?.count) === 1
    ) {
      this.insertCohort.run(
        resolvedViewerId,
        normalizedStreamKey.slice(0, 256),
        Math.round(completedAtMs)
      );
    }
    return inserted;
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

  getCohortFunnel(streamKey) {
    const normalizedStreamKey = String(streamKey || '').trim();
    const counts = new Map(
      normalizedStreamKey
        ? this.selectCohortStepCounts.all(normalizedStreamKey)
          .map(row => [row.step_key, Number(row.count) || 0])
        : []
    );
    return {
      streamKey: normalizedStreamKey || null,
      cohortSize: normalizedStreamKey
        ? Number(this.selectCohortSize.get(normalizedStreamKey)?.count) || 0
        : 0,
      steps: JOURNEY_STEPS.map(stepKey => ({
        stepKey,
        completed: counts.get(stepKey) || 0
      }))
    };
  }
}

module.exports = ViewerOnboardingService;
module.exports.JOURNEY_STEPS = JOURNEY_STEPS;
