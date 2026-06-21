/**
 * Wheel Landing Calculation Test
 * 
 * Tests to verify the wheel landing calculation matches between server and client.
 * This test validates the coordinate system and angle calculations.
 */

describe('Wheel Landing Calculation Coordinate System', () => {
  
  /**
   * Simulate server calculation of totalRotation
   * @param {number} winningSegmentIndex - The segment we want to land on
   * @param {number} numSegments - Total number of segments
   * @param {number} fullRotations - Number of full rotations (typically 5-7)
   * @returns {object} { totalRotation, landingAngle, segmentAngle }
   */
  function serverCalculation(winningSegmentIndex, numSegments, fullRotations = 5) {
    const segmentAngle = 360 / numSegments;
    const LANDING_ZONE_START = 0.1;
    const LANDING_ZONE_SIZE = 0.8;
    
    // Calculate landing angle within the winning segment (use middle for predictability)
    const offset = (segmentAngle * LANDING_ZONE_START) + (segmentAngle * LANDING_ZONE_SIZE / 2);
    const landingAngle = (winningSegmentIndex * segmentAngle) + offset;
    
    // Total rotation
    const totalRotation = (fullRotations * 360) + (360 - landingAngle);
    
    return { totalRotation, landingAngle, segmentAngle };
  }
  
  /**
   * Simulate client calculation of which segment was landed on
   * This is the inverse of the server calculation
   * @param {number} rotation - Total rotation applied to wheel
   * @param {number} numSegments - Total number of segments
   * @returns {number} Segment index (0-based)
   */
  function clientCalculation(rotation, numSegments) {
    const segmentAngle = 360 / numSegments;
    
    // Normalize rotation to 0-360 range
    const finalAngle = ((rotation % 360) + 360) % 360;
    
    // Reverse server formula: totalRotation = (fullRotations * 360) + (360 - landingAngle)
    // So: finalAngle = (360 - landingAngle) % 360
    // Therefore: landingAngle = (360 - finalAngle) % 360
    const landingAngle = (360 - finalAngle) % 360;
    
    // landingAngle = winningSegmentIndex * segmentAngle + offset
    // So: winningSegmentIndex = floor(landingAngle / segmentAngle)
    let segmentIndex = Math.floor(landingAngle / segmentAngle);
    
    // Ensure within valid range
    if (segmentIndex < 0) segmentIndex = 0;
    if (segmentIndex >= numSegments) segmentIndex = numSegments - 1;
    
    return segmentIndex;
  }
  
  test('5 segments - should correctly reconstruct segment 0', () => {
    const numSegments = 5;
    const targetSegment = 0;
    
    const { totalRotation, landingAngle, segmentAngle } = serverCalculation(targetSegment, numSegments);
    const reconstructed = clientCalculation(totalRotation, numSegments);
    
    console.log(`Target: ${targetSegment}, Rotation: ${totalRotation.toFixed(2)}°, Landing: ${landingAngle.toFixed(2)}°, Reconstructed: ${reconstructed}`);
    
    expect(reconstructed).toBe(targetSegment);
  });
  
  test('5 segments - should correctly reconstruct segment 2', () => {
    const numSegments = 5;
    const targetSegment = 2;
    
    const { totalRotation } = serverCalculation(targetSegment, numSegments);
    const reconstructed = clientCalculation(totalRotation, numSegments);
    
    expect(reconstructed).toBe(targetSegment);
  });
  
  test('5 segments - should correctly reconstruct segment 4', () => {
    const numSegments = 5;
    const targetSegment = 4;
    
    const { totalRotation } = serverCalculation(targetSegment, numSegments);
    const reconstructed = clientCalculation(totalRotation, numSegments);
    
    expect(reconstructed).toBe(targetSegment);
  });
  
  test('8 segments - should correctly reconstruct all segments', () => {
    const numSegments = 8;
    
    for (let targetSegment = 0; targetSegment < numSegments; targetSegment++) {
      const { totalRotation } = serverCalculation(targetSegment, numSegments);
      const reconstructed = clientCalculation(totalRotation, numSegments);
      
      expect(reconstructed).toBe(targetSegment);
    }
  });
  
  test('12 segments - should correctly reconstruct all segments', () => {
    const numSegments = 12;
    
    for (let targetSegment = 0; targetSegment < numSegments; targetSegment++) {
      const { totalRotation } = serverCalculation(targetSegment, numSegments);
      const reconstructed = clientCalculation(totalRotation, numSegments);
      
      expect(reconstructed).toBe(targetSegment);
    }
  });
  
  test('3 segments - edge case with large segments', () => {
    const numSegments = 3;
    
    for (let targetSegment = 0; targetSegment < numSegments; targetSegment++) {
      const { totalRotation } = serverCalculation(targetSegment, numSegments);
      const reconstructed = clientCalculation(totalRotation, numSegments);
      
      expect(reconstructed).toBe(targetSegment);
    }
  });
  
  test('should handle edge case at segment boundary', () => {
    const numSegments = 5;
    const segmentAngle = 360 / numSegments; // 72°
    
    // Test at exact segment boundaries
    for (let i = 0; i < numSegments; i++) {
      const exactBoundaryAngle = i * segmentAngle;
      // Reverse calculation to get rotation
      const totalRotation = 1800 + (360 - exactBoundaryAngle);
      const reconstructed = clientCalculation(totalRotation, numSegments);
      
      // Should land on segment i (since we're at the start of segment i)
      expect(reconstructed).toBe(i);
    }
  });
  
  test('should handle rotation values near 360 degrees', () => {
    const numSegments = 5;
    
    // Test with rotation that's just under 360°
    const totalRotation = 1800 + 359;
    const reconstructed = clientCalculation(totalRotation, numSegments);
    
    // finalAngle = 359, landingAngle = 360 - 359 = 1, segmentIndex = floor(1/72) = 0
    expect(reconstructed).toBe(0);
  });
  
  test('should handle multiple full rotations correctly', () => {
    const numSegments = 5;
    const targetSegment = 2;
    
    // Test with 5, 6, and 7 full rotations
    for (let fullRotations = 5; fullRotations <= 7; fullRotations++) {
      const { totalRotation } = serverCalculation(targetSegment, numSegments, fullRotations);
      const reconstructed = clientCalculation(totalRotation, numSegments);
      
      expect(reconstructed).toBe(targetSegment);
    }
  });
  
  /**
   * Visual coordinate system test
   * This test documents how the drawing coordinate system should work
   */
  test('coordinate system documentation', () => {
    // Server calculation coordinate system:
    // - Segment 0 starts at 0° (top/12 o'clock where pointer is)
    // - Segments increase clockwise
    // - segmentAngle = 360 / numSegments
    // - Segment i spans from (i * segmentAngle) to ((i+1) * segmentAngle)
    
    // Canvas drawing coordinate system:
    // - Canvas angle 0 is at 3 o'clock (right)
    // - To align with server's 0° at top, we need -90° offset (-Math.PI/2)
    // - When we rotate the canvas by rotation°, the wheel rotates clockwise
    // - The pointer stays at top (visual top = 12 o'clock)
    
    // Drawing segment i:
    // - startAngle = i * (2π / numSegments) - π/2
    // - This puts segment 0 starting at -π/2 (top), matching pointer position
    
    const numSegments = 5;
    const segmentAngleRad = (Math.PI * 2) / numSegments;
    
    // Segment 0 should start at -π/2 (top/12 o'clock)
    const segment0Start = 0 * segmentAngleRad - Math.PI / 2;
    expect(segment0Start).toBeCloseTo(-Math.PI / 2);
    
    // Segment 1 should start at segment0Start + segmentAngle
    const segment1Start = 1 * segmentAngleRad - Math.PI / 2;
    expect(segment1Start).toBeCloseTo(-Math.PI / 2 + segmentAngleRad);
    
    // When converted to degrees for comparison:
    const segment0StartDeg = (segment0Start * 180 / Math.PI + 360) % 360;
    expect(segment0StartDeg).toBeCloseTo(270); // -90° = 270° in 0-360 range
    
    // This matches the server assumption that segment 0 is at 0° in "wheel space"
    // because the pointer is also at top (0° in wheel space, 270° in canvas space)
  });
});
