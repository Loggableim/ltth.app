function getTierRank(tier) {
  return {
    small: 1,
    medium: 2,
    big: 3,
    massive: 4
  }[tier] || 2;
}

function clampParticleCount(count, maxTotalParticles) {
  const value = Number.isFinite(Number(count)) ? Math.round(Number(count)) : 50;
  return Math.max(1, Math.min(Math.max(1, maxTotalParticles), value));
}

function evaluateTriggerPolicy({ trigger = {}, config = {}, health = {} }) {
  const maxConcurrentFireworks = Math.max(1, Math.min(20, Number(config.maxConcurrentFireworks) || 12));
  const maxTotalParticles = Math.max(200, Math.min(3000, Number(config.maxTotalParticles) || 1400));
  const minFps = Math.max(15, Math.min(60, Number(config.minFps) || 24));
  const currentFps = Number(health.currentFps) || 0;
  const activeFireworkCount = Math.max(0, Number(health.activeFireworkCount) || 0);
  const queueDepth = Math.max(0, Number(health.queueDepth) || 0);
  const tier = trigger.tier || 'medium';
  const tierRank = getTierRank(tier);
  const reason = trigger.reason || 'manual';
  const bypassEnabled = trigger.bypassEnabled === true || reason === 'finale';
  const pressureRatio = activeFireworkCount / maxConcurrentFireworks;
  const hasFpsReading = currentFps > 0;
  let particleCount = clampParticleCount(trigger.particleCount, maxTotalParticles);
  let reduced = false;

  if (bypassEnabled) {
    return {
      allowed: true,
      reduced: false,
      particleCount,
      reason: 'bypass'
    };
  }

  if (reason === 'gift' && tierRank === 1 && hasFpsReading && currentFps < minFps) {
    return {
      allowed: false,
      reduced: false,
      particleCount: 0,
      reason: 'low-fps-small-gift'
    };
  }

  if (reason === 'gift' && tierRank <= 2 && pressureRatio >= 1) {
    return {
      allowed: false,
      reduced: false,
      particleCount: 0,
      reason: 'concurrent-limit'
    };
  }

  if (reason === 'gift' && tierRank === 1 && pressureRatio >= 0.6) {
    return {
      allowed: false,
      reduced: false,
      particleCount: 0,
      reason: 'high-load-small-gift'
    };
  }

  if (reason === 'gift' && pressureRatio >= 0.6) {
    particleCount = Math.max(1, Math.min(particleCount, Math.floor(maxTotalParticles * 0.5)));
    reduced = true;
  }

  if (queueDepth >= Math.max(1, Number(config.maxRocketsPerSecond) || 5) && tierRank < 3) {
    particleCount = Math.max(1, Math.floor(particleCount * 0.5));
    reduced = true;
  }

  return {
    allowed: true,
    reduced,
    particleCount,
    reason: reduced ? 'high-load-reduced' : 'allowed'
  };
}

module.exports = {
  evaluateTriggerPolicy
};
