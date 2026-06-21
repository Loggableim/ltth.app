# Quiz Plugin - Manual Testing Guide

## Timer Hiding and 6-Second Timing Requirements

### Prerequisites
1. Start the application in development mode
2. Enable the Quiz Show plugin
3. Have at least one question in the database
4. Configure TTS if you want to test audio integration

### Test Case 1: Timer Hiding
**Objective**: Verify timer is hidden after time expires

**Steps**:
1. Start a quiz round
2. Wait for the timer to count down to 0
3. **Expected**: Timer should fade out over ~800ms and disappear completely
4. **Expected**: Timer should be hidden BEFORE the correct answer is revealed

**Pass Criteria**: ✅ Timer is not visible during answer reveal phase

---

### Test Case 2: Answer Display Duration (Minimum 6 Seconds)
**Objective**: Verify answer is displayed for at least 6 seconds

**Steps**:
1. Go to Quiz settings
2. Try to set "Antworteinblendedauer" to less than 6 seconds (e.g., 3)
3. **Expected**: Input should only accept values >= 6
4. Start a quiz round and wait for it to end
5. Measure the time the correct answer is displayed
6. **Expected**: Should be at least 6 seconds

**Pass Criteria**: ✅ Answer displays for minimum 6 seconds

---

### Test Case 3: TTS Integration
**Objective**: Verify TTS has enough time to complete

**Steps**:
1. Enable TTS in Quiz settings
2. Create a question with long info text (e.g., 200+ characters)
3. Start quiz and let timer expire
4. **Expected**: Answer + info text should be read by TTS
5. **Expected**: Answer should remain visible until TTS completes (even if > 6s)

**Pass Criteria**: ✅ TTS completes reading without being cut off

---

### Test Case 4: Leaderboard Display (Fixed 6 Seconds)
**Objective**: Verify leaderboard shows for exactly 6 seconds

**Steps**:
1. Enable "Leaderboard nach Runde anzeigen" in settings
2. Note that "Auto-Hide Verzögerung" is read-only at 6 seconds
3. Start a quiz round with at least one correct answer
4. Wait for round to end
5. Measure time from when leaderboard appears to when it disappears
6. **Expected**: Should be exactly 6 seconds

**Pass Criteria**: ✅ Leaderboard displays for 6 seconds

---

### Test Case 5: Complete Timing Sequence
**Objective**: Verify the full timing sequence

**Steps**:
1. Enable auto mode with default settings
2. Start a quiz
3. Let the round complete naturally
4. Observe the full sequence:
   - Timer expires → hides
   - Answer displays (6s)
   - Leaderboard shows (6s)
   - Auto delay (5s)
   - Next question starts
5. Measure total time: should be ~17 seconds

**Pass Criteria**: ✅ Full sequence works smoothly without gaps or overlaps

---

### Test Case 6: Configuration Persistence
**Objective**: Verify settings are saved correctly

**Steps**:
1. Set answerDisplayDuration to 10 seconds
2. Save configuration
3. Refresh the page
4. **Expected**: Value should still be 10 (>= 6 is valid)
5. Try to manually edit config to set value to 3
6. **Expected**: Should be enforced to minimum 6

**Pass Criteria**: ✅ Minimum values are enforced even on direct config edits

---

## Expected Timeline (Default Settings)

```
Question Start
    ↓
Timer Counts Down (30s default)
    ↓
TIME EXPIRES
    ↓
Timer Fades Out (~0.8s)
    ↓
Correct Answer Revealed + TTS (6s minimum)
    ↓
Leaderboard Displayed (6s fixed)
    ↓
Auto Delay (5s default, if auto mode enabled)
    ↓
Next Question Starts
```

**Total time between questions (auto mode)**: 17 seconds

---

## Common Issues to Watch For

### ❌ Timer Still Visible During Answer
If timer is still visible when correct answer appears:
- Check overlay's TIME_UP state implementation
- Verify timer-fade-out CSS classes are working

### ❌ Answer Displays Less Than 6 Seconds
If answer disappears too quickly:
- Check getAnswerDisplayDuration() is being used
- Verify MIN_ANSWER_DISPLAY_DURATION constant is set to 6
- Check client-side validation in quiz_show.js

### ❌ Leaderboard Shows Wrong Duration
If leaderboard shows for more/less than 6 seconds:
- Verify LEADERBOARD_DISPLAY_DURATION constant usage
- Check both showLeaderboardAfterQuestion() and showLeaderboardAfterRound()

### ❌ TTS Gets Cut Off
If TTS reading is interrupted:
- Increase answerDisplayDuration in settings
- Verify TTS is playing asynchronously during answer display phase

---

## Browser Developer Tools Tips

### Timing Verification
```javascript
// In browser console, watch for socket events:
socket.on('quiz-show:round-ended', (data) => {
    console.log('Answer display duration:', data.answerDisplayDuration, 'seconds');
});

socket.on('quiz-show:show-leaderboard', (data) => {
    console.log('Leaderboard shown at:', new Date().toISOString());
});

socket.on('quiz-show:hide-leaderboard', () => {
    console.log('Leaderboard hidden at:', new Date().toISOString());
});
```

### Visual Inspection
- Use browser DevTools to slow down animations (Settings → More tools → Rendering → Rendering → Emulate CSS media feature prefers-reduced-motion)
- Use Performance tab to record timeline and measure exact durations

---

## Success Criteria Summary

✅ All tests pass
✅ Timer hidden before answer reveal
✅ Answer displays for minimum 6 seconds
✅ TTS completes without interruption
✅ Leaderboard displays for exactly 6 seconds
✅ Full sequence timing is correct (~17s total)
✅ Configuration persistence works
✅ No visual glitches or overlaps

---

## Reporting Issues

If you find any issues:
1. Note the exact steps to reproduce
2. Record the actual vs expected behavior
3. Include browser console logs
4. Note configuration settings used
5. If possible, record a video showing the issue
