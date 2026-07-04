const { evaluateTriggerPolicy } = require('../plugins/fireworks/lib/trigger-policy');
const { normalizeConfig } = require('../plugins/fireworks/lib/config-schema');

describe('Fireworks trigger policy', () => {
  test('always allows bypassed finale or manual triggers even under heavy load', () => {
    const decision = evaluateTriggerPolicy({
      trigger: {
        reason: 'manual',
        bypassEnabled: true,
        tier: 'small',
        particleCount: 3000
      },
      config: normalizeConfig({ maxTotalParticles: 400, minFps: 60 }),
      health: { currentFps: 5, activeFireworkCount: 20, queueDepth: 20 }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('bypass');
  });

  test('drops small gift triggers when overlay fps is below the configured minimum', () => {
    const decision = evaluateTriggerPolicy({
      trigger: {
        reason: 'gift',
        tier: 'small',
        particleCount: 30
      },
      config: normalizeConfig({ minFps: 30 }),
      health: { currentFps: 18, activeFireworkCount: 2, queueDepth: 0 }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('low-fps-small-gift');
  });

  test('prefers large gifts during high active firework load', () => {
    const config = normalizeConfig({ maxConcurrentFireworks: 10, maxTotalParticles: 1000 });
    const smallGift = evaluateTriggerPolicy({
      trigger: { reason: 'gift', tier: 'small', particleCount: 50 },
      config,
      health: { currentFps: 60, activeFireworkCount: 7, queueDepth: 0 }
    });
    const massiveGift = evaluateTriggerPolicy({
      trigger: { reason: 'gift', tier: 'massive', particleCount: 900 },
      config,
      health: { currentFps: 60, activeFireworkCount: 7, queueDepth: 0 }
    });

    expect(smallGift.allowed).toBe(false);
    expect(smallGift.reason).toBe('high-load-small-gift');
    expect(massiveGift.allowed).toBe(true);
    expect(massiveGift.particleCount).toBeLessThanOrEqual(500);
  });

  test('reduces medium gifts and budgets particle count under pressure', () => {
    const decision = evaluateTriggerPolicy({
      trigger: {
        reason: 'gift',
        tier: 'medium',
        particleCount: 900
      },
      config: normalizeConfig({ maxConcurrentFireworks: 10, maxTotalParticles: 600 }),
      health: { currentFps: 60, activeFireworkCount: 7, queueDepth: 0 }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reduced).toBe(true);
    expect(decision.particleCount).toBe(300);
    expect(decision.reason).toBe('high-load-reduced');
  });
});
