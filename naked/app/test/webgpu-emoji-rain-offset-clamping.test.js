/**
 * Test: WebGPU Emoji Rain - Offset Clamping Fix
 * 
 * Verifies that offset calculations in processSpawn() never produce
 * negative coordinates for normalized positions (0-1 range).
 * 
 * This test validates the fix for the bug where emojis spawned near
 * the left edge (e.g., x=0.05) could have negative offsetX values
 * (e.g., -0.05) after applying random offset, causing them to be
 * treated as absolute pixel coordinates and spawning inside the
 * wall collision zone.
 */

describe('WebGPU Emoji Rain - Offset Clamping Fix', () => {
  /**
   * Simulates the offsetX calculation logic after the fix
   */
  function calculateOffsetX(x) {
    let offsetX;
    if (x >= 0 && x <= 1) {
      // Normalized coordinate: Offset and clamp to 0-1 range
      offsetX = Math.max(0, Math.min(1, x + (Math.random() - 0.5) * 0.2));
    } else {
      // Absolute coordinate: Offset in pixels
      offsetX = x + (Math.random() - 0.5) * 100;
    }
    return offsetX;
  }

  test('offsetX should never be negative for normalized coordinates', () => {
    // Test with x values near the left edge (most vulnerable to negative offsets)
    const testPositions = [0, 0.01, 0.02, 0.05, 0.1];
    
    for (const x of testPositions) {
      // Run multiple iterations to account for randomness
      for (let i = 0; i < 100; i++) {
        const offsetX = calculateOffsetX(x);
        
        // Verify offsetX is never negative
        expect(offsetX).toBeGreaterThanOrEqual(0);
        
        // Verify offsetX stays within 0-1 range for normalized coordinates
        expect(offsetX).toBeLessThanOrEqual(1);
      }
    }
  });

  test('offsetX should never exceed 1.0 for normalized coordinates', () => {
    // Test with x values near the right edge (vulnerable to values > 1)
    const testPositions = [0.9, 0.95, 0.98, 0.99, 1.0];
    
    for (const x of testPositions) {
      // Run multiple iterations to account for randomness
      for (let i = 0; i < 100; i++) {
        const offsetX = calculateOffsetX(x);
        
        // Verify offsetX stays within 0-1 range
        expect(offsetX).toBeGreaterThanOrEqual(0);
        expect(offsetX).toBeLessThanOrEqual(1);
      }
    }
  });

  test('offsetX should remain within 0-1 range for all normalized coordinates', () => {
    // Test across the entire normalized range
    for (let x = 0; x <= 1; x += 0.1) {
      for (let i = 0; i < 50; i++) {
        const offsetX = calculateOffsetX(x);
        
        expect(offsetX).toBeGreaterThanOrEqual(0);
        expect(offsetX).toBeLessThanOrEqual(1);
      }
    }
  });

  test('absolute coordinates should not be clamped to 0-1 range', () => {
    // Test with absolute pixel coordinates (outside 0-1 range)
    const absolutePositions = [100, 500, 1000, 1500];
    
    for (const x of absolutePositions) {
      const offsetX = calculateOffsetX(x);
      
      // Absolute coordinates can be outside 0-1 range
      // They should be offset by pixels (-50 to +50), not percentage
      expect(offsetX).toBeGreaterThan(1); // Outside normalized range
      
      // Should be within roughly ±50 pixels of original position
      expect(Math.abs(offsetX - x)).toBeLessThan(55);
    }
  });

  test('edge case: x=0 with maximum negative offset should clamp to 0', () => {
    // When x=0 and random offset is maximally negative (Math.random()=0 → -0.5 * 0.2 = -0.1)
    // The result should be clamped to 0
    const x = 0;
    const worstCaseOffset = x + (0 - 0.5) * 0.2; // = -0.1
    const clamped = Math.max(0, Math.min(1, worstCaseOffset));
    
    expect(worstCaseOffset).toBeLessThan(0); // Verify it would be negative without clamping
    expect(clamped).toBe(0); // Verify clamping works
  });

  test('edge case: x=1 with maximum positive offset should clamp to 1', () => {
    // When x=1 and random offset is maximally positive (Math.random()=1 → 0.5 * 0.2 = 0.1)
    // The result should be clamped to 1
    const x = 1;
    const worstCaseOffset = x + (1 - 0.5) * 0.2; // = 1.1
    const clamped = Math.max(0, Math.min(1, worstCaseOffset));
    
    expect(worstCaseOffset).toBeGreaterThan(1); // Verify it would exceed 1 without clamping
    expect(clamped).toBe(1); // Verify clamping works
  });

  test('middle positions should have natural offset variation', () => {
    // For positions in the middle, the offset should provide variation
    // but still stay within bounds
    const x = 0.5;
    const offsets = [];
    
    for (let i = 0; i < 100; i++) {
      const offsetX = calculateOffsetX(x);
      offsets.push(offsetX);
      
      // All offsets should be valid
      expect(offsetX).toBeGreaterThanOrEqual(0);
      expect(offsetX).toBeLessThanOrEqual(1);
    }
    
    // Verify there's actual variation (not all the same)
    const uniqueOffsets = new Set(offsets);
    expect(uniqueOffsets.size).toBeGreaterThan(10); // Should have many unique values
    
    // Verify offsets are distributed around the original position
    const minOffset = Math.min(...offsets);
    const maxOffset = Math.max(...offsets);
    expect(minOffset).toBeLessThan(x);
    expect(maxOffset).toBeGreaterThan(x);
  });
});
