/**
 * Test: WebGPU Emoji Rain - Spawn Position Safety
 * 
 * Verifies that emojis spawn with adequate margin from walls to prevent
 * them from getting stuck in the top-left corner or edges.
 * 
 * Background:
 * - Left wall extends from x=-50 to x=50 (100px thickness, centered at x=-50)
 * - Right wall extends from x=(canvasWidth-50) to x=(canvasWidth+50)
 * - Emojis must spawn with their center position far enough from wall edges
 *   to ensure their physics body (circle with radius = size/2) doesn't overlap
 */

describe('WebGPU Emoji Rain - Spawn Position Safety', () => {
  // Test configuration
  const WALL_THICKNESS = 100;
  const CANVAS_WIDTH = 1920;
  const EMOJI_MIN_SIZE = 40;
  const EMOJI_MAX_SIZE = 80;

  /**
   * Calculate spawn position for normalized x (0-1)
   * This replicates the logic from webgpu-emoji-rain-engine.js
   */
  function calculateSpawnX(normalizedX, size, canvasWidth) {
    const minMargin = WALL_THICKNESS / 2 + size / 2 + 1;
    const safeWidth = canvasWidth - (minMargin * 2);
    
    if (safeWidth > 0) {
      return minMargin + (normalizedX * safeWidth);
    } else {
      return canvasWidth / 2;
    }
  }

  /**
   * Check if emoji overlaps with left wall
   */
  function overlapsLeftWall(emojiX, emojiRadius) {
    const leftWallRight = WALL_THICKNESS / 2; // 50px
    const emojiLeft = emojiX - emojiRadius;
    return emojiLeft < leftWallRight;
  }

  /**
   * Check if emoji overlaps with right wall
   */
  function overlapsRightWall(emojiX, emojiRadius, canvasWidth) {
    const rightWallLeft = canvasWidth - (WALL_THICKNESS / 2); // 1870px for 1920px canvas
    const emojiRight = emojiX + emojiRadius;
    return emojiRight > rightWallLeft;
  }

  test('emojis with x=0 (far left) should not overlap left wall', () => {
    const normalizedX = 0;
    
    // Test with minimum size emoji
    const minSizeRadius = EMOJI_MIN_SIZE / 2;
    const spawnX = calculateSpawnX(normalizedX, EMOJI_MIN_SIZE, CANVAS_WIDTH);
    
    expect(overlapsLeftWall(spawnX, minSizeRadius)).toBe(false);
    expect(spawnX).toBeGreaterThan(WALL_THICKNESS / 2 + minSizeRadius);
    
    // Test with maximum size emoji
    const maxSizeRadius = EMOJI_MAX_SIZE / 2;
    const spawnXMax = calculateSpawnX(normalizedX, EMOJI_MAX_SIZE, CANVAS_WIDTH);
    
    expect(overlapsLeftWall(spawnXMax, maxSizeRadius)).toBe(false);
    expect(spawnXMax).toBeGreaterThan(WALL_THICKNESS / 2 + maxSizeRadius);
  });

  test('emojis with x=1 (far right) should not overlap right wall', () => {
    const normalizedX = 1;
    
    // Test with minimum size emoji
    const minSizeRadius = EMOJI_MIN_SIZE / 2;
    const spawnX = calculateSpawnX(normalizedX, EMOJI_MIN_SIZE, CANVAS_WIDTH);
    
    expect(overlapsRightWall(spawnX, minSizeRadius, CANVAS_WIDTH)).toBe(false);
    expect(spawnX).toBeLessThan(CANVAS_WIDTH - (WALL_THICKNESS / 2 + minSizeRadius));
    
    // Test with maximum size emoji
    const maxSizeRadius = EMOJI_MAX_SIZE / 2;
    const spawnXMax = calculateSpawnX(normalizedX, EMOJI_MAX_SIZE, CANVAS_WIDTH);
    
    expect(overlapsRightWall(spawnXMax, maxSizeRadius, CANVAS_WIDTH)).toBe(false);
    expect(spawnXMax).toBeLessThan(CANVAS_WIDTH - (WALL_THICKNESS / 2 + maxSizeRadius));
  });

  test('emojis with x=0.5 (center) should spawn in middle of canvas', () => {
    const normalizedX = 0.5;
    const size = (EMOJI_MIN_SIZE + EMOJI_MAX_SIZE) / 2;
    const spawnX = calculateSpawnX(normalizedX, size, CANVAS_WIDTH);
    
    // Should be roughly in the center, with some tolerance for margins
    expect(spawnX).toBeGreaterThan(CANVAS_WIDTH * 0.4);
    expect(spawnX).toBeLessThan(CANVAS_WIDTH * 0.6);
  });

  test('spawn margin should be at least wall thickness/2 + emoji radius', () => {
    // Test various emoji sizes
    const testSizes = [40, 50, 60, 70, 80];
    
    testSizes.forEach(size => {
      const radius = size / 2;
      const expectedMinMargin = WALL_THICKNESS / 2 + radius;
      
      // Spawn at x=0 (leftmost position)
      const spawnX = calculateSpawnX(0, size, CANVAS_WIDTH);
      
      // The spawn position should be at least expectedMinMargin from left edge
      expect(spawnX).toBeGreaterThanOrEqual(expectedMinMargin);
      
      // And the emoji should not overlap with the wall
      expect(overlapsLeftWall(spawnX, radius)).toBe(false);
    });
  });

  test('spawn positions should be evenly distributed across safe zone', () => {
    const size = 60; // Mid-size emoji
    const positions = [];
    
    // Test 10 evenly distributed positions
    for (let i = 0; i <= 10; i++) {
      const normalizedX = i / 10;
      const spawnX = calculateSpawnX(normalizedX, size, CANVAS_WIDTH);
      positions.push(spawnX);
    }
    
    // Positions should be monotonically increasing
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
    
    // Check that distribution is relatively even
    const differences = [];
    for (let i = 1; i < positions.length; i++) {
      differences.push(positions[i] - positions[i - 1]);
    }
    
    // All differences should be roughly the same (within 10% tolerance)
    const avgDiff = differences.reduce((a, b) => a + b) / differences.length;
    differences.forEach(diff => {
      expect(diff).toBeGreaterThan(avgDiff * 0.9);
      expect(diff).toBeLessThan(avgDiff * 1.1);
    });
  });

  test('edge case: very small canvas should center emoji', () => {
    const tinyCanvas = 200; // Smaller than safe zone
    const size = 80;
    const spawnX = calculateSpawnX(0.5, size, tinyCanvas);
    
    // Should fall back to centering
    expect(spawnX).toBe(tinyCanvas / 2);
  });
});
