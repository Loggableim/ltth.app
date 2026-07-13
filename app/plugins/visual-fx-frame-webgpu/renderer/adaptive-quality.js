(function registerAdaptiveQuality(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.VisualFxAdaptiveQuality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAdaptiveQuality() {
  const QUALITY_PROFILES = Object.freeze({
    'low-load': Object.freeze({ maxParticles: 24000, fieldResolution: 128, bloomLevels: 2, lightningBranches: 64, minScale: 0.5 }),
    'obs-safe': Object.freeze({ maxParticles: 65536, fieldResolution: 256, bloomLevels: 3, lightningBranches: 128, minScale: 0.65 }),
    'max-quality': Object.freeze({ maxParticles: 131072, fieldResolution: 384, bloomLevels: 4, lightningBranches: 256, minScale: 0.75 })
  });

  class AdaptiveQualityController {
    constructor(profileName = 'obs-safe', options = {}) {
      this.profileName = QUALITY_PROFILES[profileName] ? profileName : 'obs-safe';
      this.profile = QUALITY_PROFILES[this.profileName];
      this.renderScale = this._round(Math.min(1, Math.max(this.profile.minScale, options.initialScale ?? 1)));
      this.budgetScale = this.renderScale;
      this.cooldownRemaining = this.renderScale < 1 ? 180 : 0;
      this.slowFrames = 0;
      this.fastFrames = 0;
      this.fastSamples = [];
    }

    recordFrame(frameTimeMs) {
      const duration = Number(frameTimeMs);
      if (!Number.isFinite(duration) || duration <= 0) return this.getState();
      if (this.cooldownRemaining > 0) {
        this.cooldownRemaining -= 1;
        return this.getState();
      }

      if (duration > 18.5) {
        this.slowFrames += 1;
        this.fastFrames = 0;
        this.fastSamples.length = 0;
        if (this.slowFrames >= 120) this._stepDown();
      } else if (duration < 13.5) {
        this.fastFrames += 1;
        this.slowFrames = 0;
        this.fastSamples.push(duration);
        if (this.fastSamples.length > 600) this.fastSamples.shift();
        if (this.fastFrames >= 600 && this._percentile(this.fastSamples, 0.95) < 16.67) this._stepUp();
      } else {
        this.slowFrames = 0;
        this.fastFrames = 0;
        this.fastSamples.length = 0;
      }
      return this.getState();
    }

    getState() {
      return {
        profile: this.profileName,
        renderScale: this.renderScale,
        budgetScale: this.budgetScale,
        maxParticles: Math.floor(this.profile.maxParticles * this.budgetScale),
        fieldResolution: Math.max(32, Math.floor(this.profile.fieldResolution * this.budgetScale)),
        bloomLevels: Math.max(1, Math.ceil(this.profile.bloomLevels * this.budgetScale)),
        lightningBranches: Math.max(8, Math.floor(this.profile.lightningBranches * this.budgetScale))
      };
    }

    _stepDown() {
      this.renderScale = this._round(Math.max(this.profile.minScale, this.renderScale - 0.1));
      this.budgetScale = this.renderScale;
      this._resetAfterStep();
    }

    _stepUp() {
      this.renderScale = this._round(Math.min(1, this.renderScale + 0.1));
      this.budgetScale = this.renderScale;
      this._resetAfterStep();
    }

    _resetAfterStep() {
      this.cooldownRemaining = 180;
      this.slowFrames = 0;
      this.fastFrames = 0;
      this.fastSamples.length = 0;
    }

    _round(value) {
      return Math.round(value * 100) / 100;
    }

    _percentile(values, percentile) {
      if (!values.length) return Infinity;
      const sorted = [...values].sort((left, right) => left - right);
      return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile))];
    }
  }

  return { AdaptiveQualityController, QUALITY_PROFILES };
});
