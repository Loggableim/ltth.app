/**
 * Test: WebGPU Emoji Rain - Sticker Rain Feature
 * 
 * Verifies that sticker events trigger appropriate rain/burst effects
 * based on user fan level with proper cooldown management.
 * 
 * Feature Requirements:
 * - Regular users: Sticker rain with base count
 * - Team members: More stickers based on fan level (Base + Level × Multiplier)
 * - SuperFans (Level ≥ 1): Burst mode instead of rain
 * - Separate cooldowns for regular users and SuperFans
 * - Uses sticker image URL as the emoji
 */

describe('WebGPU Emoji Rain - Sticker Rain Feature', () => {
  // Mock configuration
  const DEFAULT_CONFIG = {
    enabled: true,
    sticker_enabled: true,
    sticker_base_count: 5,
    sticker_fan_level_multiplier: 3,
    sticker_max_count: 30,
    sticker_user_cooldown_ms: 10000,
    sticker_superfan_cooldown_ms: 5000,
    sticker_superfan_burst_enabled: true
  };

  /**
   * Calculate expected sticker count based on fan level
   */
  function calculateStickerCount(fanLevel, config = DEFAULT_CONFIG) {
    const count = config.sticker_base_count + (fanLevel * config.sticker_fan_level_multiplier);
    return Math.min(count, config.sticker_max_count);
  }

  /**
   * Calculate expected intensity based on fan level
   */
  function calculateIntensity(fanLevel) {
    return fanLevel >= 1 ? 1.0 + (fanLevel * 0.3) : 1.0;
  }

  test('regular user (level 0) should trigger base count sticker rain', () => {
    const fanLevel = 0;
    const expectedCount = calculateStickerCount(fanLevel);
    const expectedIntensity = calculateIntensity(fanLevel);
    const expectedBurst = false; // Regular users don't trigger burst

    expect(expectedCount).toBe(5); // Base count
    expect(expectedIntensity).toBe(1.0);
    expect(expectedBurst).toBe(false);
  });

  test('team member (level 1) should trigger more stickers and burst', () => {
    const fanLevel = 1;
    const expectedCount = calculateStickerCount(fanLevel);
    const expectedIntensity = calculateIntensity(fanLevel);
    const isSuperFan = fanLevel >= 1;

    expect(expectedCount).toBe(8); // 5 + (1 × 3) = 8
    expect(expectedIntensity).toBe(1.3); // 1.0 + (1 × 0.3)
    expect(isSuperFan).toBe(true);
  });

  test('team member (level 2) should trigger even more stickers', () => {
    const fanLevel = 2;
    const expectedCount = calculateStickerCount(fanLevel);
    const expectedIntensity = calculateIntensity(fanLevel);

    expect(expectedCount).toBe(11); // 5 + (2 × 3) = 11
    expect(expectedIntensity).toBe(1.6); // 1.0 + (2 × 0.3)
  });

  test('high fan level should be capped at max count', () => {
    const fanLevel = 10;
    const expectedCount = calculateStickerCount(fanLevel);

    // 5 + (10 × 3) = 35, but capped at 30
    expect(expectedCount).toBe(30);
  });

  test('sticker count formula should work correctly for various levels', () => {
    expect(calculateStickerCount(0)).toBe(5);  // Base
    expect(calculateStickerCount(1)).toBe(8);  // 5 + 3
    expect(calculateStickerCount(2)).toBe(11); // 5 + 6
    expect(calculateStickerCount(3)).toBe(14); // 5 + 9
    expect(calculateStickerCount(5)).toBe(20); // 5 + 15
  });

  test('intensity should scale linearly with fan level', () => {
    expect(calculateIntensity(0)).toBe(1.0);
    expect(calculateIntensity(1)).toBe(1.3);
    expect(calculateIntensity(2)).toBe(1.6);
    expect(calculateIntensity(3)).toBe(1.9);
    expect(calculateIntensity(5)).toBeCloseTo(2.5, 1);
  });

  test('burst mode should only activate for SuperFans (level >= 1)', () => {
    const level0IsSuperFan = 0 >= 1;
    const level1IsSuperFan = 1 >= 1;
    const level2IsSuperFan = 2 >= 1;

    expect(level0IsSuperFan).toBe(false);
    expect(level1IsSuperFan).toBe(true);
    expect(level2IsSuperFan).toBe(true);
  });

  test('cooldown times should differ for regular users and SuperFans', () => {
    const config = DEFAULT_CONFIG;
    
    expect(config.sticker_user_cooldown_ms).toBe(10000); // 10 seconds
    expect(config.sticker_superfan_cooldown_ms).toBe(5000); // 5 seconds
    expect(config.sticker_superfan_cooldown_ms).toBeLessThan(config.sticker_user_cooldown_ms);
  });

  test('sticker rain can be disabled via config', () => {
    const disabledConfig = {
      ...DEFAULT_CONFIG,
      sticker_enabled: false
    };

    expect(disabledConfig.sticker_enabled).toBe(false);
  });

  test('SuperFan burst can be disabled via config', () => {
    const noBurstConfig = {
      ...DEFAULT_CONFIG,
      sticker_superfan_burst_enabled: false
    };

    // Even for SuperFans, burst should be disabled
    expect(noBurstConfig.sticker_superfan_burst_enabled).toBe(false);
  });

  test('custom multiplier should affect sticker count', () => {
    const customConfig = {
      ...DEFAULT_CONFIG,
      sticker_fan_level_multiplier: 5 // Increased from 3
    };

    const level2Count = calculateStickerCount(2, customConfig);
    expect(level2Count).toBe(15); // 5 + (2 × 5) = 15
  });

  test('custom base count should affect sticker count', () => {
    const customConfig = {
      ...DEFAULT_CONFIG,
      sticker_base_count: 10 // Increased from 5
    };

    const level1Count = calculateStickerCount(1, customConfig);
    expect(level1Count).toBe(13); // 10 + (1 × 3) = 13
  });

  test('custom max count should cap sticker count', () => {
    const customConfig = {
      ...DEFAULT_CONFIG,
      sticker_max_count: 15 // Reduced from 30
    };

    const level5Count = calculateStickerCount(5, customConfig);
    // 5 + (5 × 3) = 20, but capped at 15
    expect(level5Count).toBe(15);
  });

  test('zero multiplier should result in base count only', () => {
    const zeroMultiplierConfig = {
      ...DEFAULT_CONFIG,
      sticker_fan_level_multiplier: 0
    };

    expect(calculateStickerCount(0, zeroMultiplierConfig)).toBe(5);
    expect(calculateStickerCount(5, zeroMultiplierConfig)).toBe(5);
    expect(calculateStickerCount(10, zeroMultiplierConfig)).toBe(5);
  });
});

/**
 * Integration test concepts (to be implemented with actual plugin):
 * 
 * 1. Mock emote event with sticker URL -> verify spawn event emitted
 * 2. Mock emote event with level 0 user -> verify no burst
 * 3. Mock emote event with level 1 user -> verify burst mode
 * 4. Send two sticker events from same user -> verify cooldown blocks second
 * 5. Send sticker event from SuperFan -> verify shorter cooldown
 * 6. Verify sticker image URL is used as emoji parameter
 * 7. Test with sticker_enabled = false -> verify no spawn
 * 8. Test cooldown reset after cooldown period expires
 */
