# Wheel Starting Position Reset - Manual Verification Test

## Overview
This test verifies that the wheel correctly resets to position 0° (segment 0 at top) before each spin, ensuring the visual overlay matches the server-selected winning segment.

## Problem Being Fixed
Previously, the wheel would remain at its landing position from the previous spin. When a new spin started, the server would calculate rotation assuming start position = 0°, but the wheel would actually be at a different position, causing mismatches.

## Test Setup

1. **Open the wheel overlay in OBS or a browser:**
   ```
   http://localhost:3000/game-engine/overlay/wheel?testMode=true
   ```

2. **Configure a wheel with easily identifiable segments:**
   - 5 segments (72° each) is recommended for easy visual verification
   - Use distinct colors: Red, Blue, Green, Yellow, Purple
   - Label segments clearly: "Segment 0", "Segment 1", "Segment 2", "Segment 3", "Segment 4"

## Test Cases

### Test 1: First Spin (Baseline)
**Objective:** Verify first spin works correctly

**Steps:**
1. Ensure wheel is visible and at default position (Segment 0 at top)
2. Trigger a spin (via test mode button or actual gift)
3. Observe the landing segment
4. Check browser console for: `✅ Spin config applied` message
5. Verify no warning messages about wheel position

**Expected Result:**
- Wheel starts with Segment 0 at top (under pointer)
- Wheel spins smoothly and lands on correct segment
- Console shows no warnings about starting position

### Test 2: Second Spin (Starting Position Reset)
**Objective:** Verify wheel resets to 0° before second spin

**Steps:**
1. After first spin completes, note the landing position (e.g., Segment 3 at top)
2. Wait for result display to finish
3. Trigger a second spin
4. **CRITICAL:** Observe wheel position BEFORE spin animation starts
5. Check console for reset message: `🔄 Resetting wheel from XXX° to 0° before spin`
6. Verify wheel visually shows Segment 0 at top when spin starts
7. Observe landing segment

**Expected Result:**
- Console shows: `🔄 Resetting wheel from [non-zero]° to 0° before spin`
- Wheel visually resets to Segment 0 at top
- Spin starts from correct position
- Landing segment matches server expectation

### Test 3: Multiple Consecutive Spins
**Objective:** Verify reset works consistently across multiple spins

**Steps:**
1. Trigger 5-10 spins consecutively with short delays between them
2. After each spin, verify the wheel resets before the next one
3. Check console for reset messages before each spin
4. Verify no mismatch warnings: `Wheel landing mismatch!`

**Expected Result:**
- Every spin shows reset message (except first spin if already at 0°)
- No landing mismatch warnings in console
- All spins land on expected segments

### Test 4: Quick Succession Spins
**Objective:** Verify reset works even with rapid spins (queue system)

**Steps:**
1. Trigger multiple spins rapidly (queue them up)
2. Observe that each spin from the queue resets position
3. Check console logs for consistent reset behavior

**Expected Result:**
- Each queued spin resets wheel to 0° when it starts
- No accumulated rotation errors
- All spins land correctly

### Test 5: Different Segment Counts
**Objective:** Verify fix works with various wheel configurations

**Steps:**
1. Test with 3 segments (120° each)
2. Test with 8 segments (45° each)
3. Test with 12 segments (30° each)
4. For each configuration, perform 3-5 spins

**Expected Result:**
- Reset works correctly regardless of segment count
- No landing mismatches for any configuration

## Console Log Messages to Look For

### ✅ Good Messages (Expected)
```
✅ Spin config applied: 5 segments, winning index: 2 (Prize 3), rotation: 2124.00°
🔄 Resetting wheel from 324.0° to 0° before spin
```

### ⚠️ Warning Messages (Should NOT appear after fix)
```
⚠️ Wheel was not at starting position! currentRotation=324, forcing reset to 0°
Wheel landing mismatch! Expected segment 2 (Prize 3), but landed on segment 0
⚠️ Wheel spin desync detected: expected 2 but overlay reported 0
```

### ❌ Error Messages (Should NEVER appear)
```
Invalid landing calculation: segment X does not exist
```

## Verification Checklist

- [ ] First spin: Segment 0 starts at top under pointer
- [ ] Second spin: Wheel resets to Segment 0 before animation
- [ ] Console shows reset message before each spin (except first if already at 0°)
- [ ] No "landing mismatch" warnings in console
- [ ] No "was not at starting position" warnings in spinWheel()
- [ ] Visual wheel position matches calculation for all spins
- [ ] Works with different segment counts (3, 5, 8, 12)
- [ ] Works with queued spins (rapid succession)

## Success Criteria

**Fix is successful if:**
1. ✅ Console shows `🔄 Resetting wheel` message before spins (when needed)
2. ✅ NO landing mismatch warnings appear
3. ✅ NO starting position warnings appear
4. ✅ Visual wheel always starts at Segment 0 (top) before spinning
5. ✅ All spins land on the segment indicated by server

## Debugging

If issues are found:

1. **Check console logs:**
   - Look for the exact rotation values
   - Check if reset is happening
   - Note any warning/error messages

2. **Verify segment at top:**
   - Use browser DevTools to inspect canvas
   - Check which segment is actually at top before spin

3. **Test with specific target:**
   - Use test mode to force landing on specific segment
   - Verify multiple spins to same target land correctly

4. **Check server logs:**
   - Look for rotation calculation debug logs
   - Verify server and client calculations match

## Related Files

- `/app/plugins/game-engine/overlay/wheel.html` (lines 1336-1345) - Reset logic
- `/app/plugins/game-engine/overlay/wheel.html` (lines 920-945) - Spin animation
- `/app/plugins/game-engine/games/wheel.js` (lines 402-430) - Server calculation
