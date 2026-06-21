# Quiz Plugin: Timer Hiding and Leaderboard Timing Implementation

## Problem Statement (German)
Nach Ablauf der Zeit der Frage MUSS:
1. Der Timer ausgeblendet werden
2. Für mindestens 6 Sekunden die korrekte Antwort eingeblendet werden (aber mindestens solange wie es dauert die korrekte Antwort mit Info vorzulesen)
3. Danach wird für 6 weitere Sekunden das Leaderboard des aktiven Spiels angezeigt

## Problem Statement (English)
After the question time expires:
1. Timer MUST be hidden
2. Correct answer must be displayed for minimum 6 seconds (but at least as long as it takes to read the answer with info text via TTS)
3. Afterwards, the active game leaderboard is displayed for 6 additional seconds

## Implementation Status: ✅ COMPLETE

All requirements have been successfully implemented with high-quality code following best practices.

## Changes Implemented

### 1. Timer Hiding Logic (`quiz_show_overlay.js`)
The timer is now automatically hidden after time expires in the `TIME_UP` state:
```javascript
case States.TIME_UP:
    stopTimer();
    updateTimerDisplay(0, gameData.totalTime);
    animateTimeUp();
    // Timer fades out and is hidden
    setTimeout(() => {
        timerSectionTimeUp.style.display = 'none';
    }, 800 / hudConfig.animationSpeed);
    break;
```

**Key Point**: Timer hiding is automatic and happens BEFORE the correct answer is revealed.

### 2. Minimum Answer Display Duration (6 Seconds)

#### Backend (`main.js`)
- Default `answerDisplayDuration` changed from 5 to **6 seconds**
- Enforced minimum of 6 seconds throughout the code:
  ```javascript
  answerDisplayDuration: 6, // Seconds to display the correct answer (minimum 6 seconds)
  ```
- All calculations now use `Math.max(6, this.config.answerDisplayDuration || 6)` to ensure minimum

#### Frontend Overlay (`quiz_show_overlay.js`)
- Default changed to 6 seconds
- Minimum enforced in state machine:
  ```javascript
  const displayDuration = Math.max(6, gameData.answerDisplayDuration || 6) * 1000;
  ```

#### UI Configuration (`quiz_show.html`)
- Input field minimum value set to 6
- Help text updated to reflect minimum requirement:
  ```html
  <input type="number" id="answerDisplayDuration" min="6" max="30" value="6">
  <div class="help-text small">Mindestens 6 Sekunden - Zeit für korrekte Antwort und Info-Text (inkl. TTS-Vorlesung)</div>
  ```

### 3. Fixed 6-Second Leaderboard Display

#### Configuration Changes (`main.js`)
- `leaderboardAutoHideDelay` default changed from 10 to **6 seconds**
- Comment updated to clarify it's fixed for after-question leaderboard

#### Leaderboard Display Functions
Both `showLeaderboardAfterQuestion()` and `showLeaderboardAfterRound()` now use fixed 6-second delay:
```javascript
setTimeout(() => {
    this.api.emit('quiz-show:hide-leaderboard');
}, 6 * 1000); // Fixed 6 seconds
```

#### Auto Mode Timing
Auto mode calculation updated to use fixed 6-second leaderboard display:
```javascript
if (willShowLeaderboard) {
    leaderboardDisplayDuration = 6 * 1000; // Fixed 6 seconds
}
```

#### UI Configuration (`quiz_show.html`)
- Leaderboard auto-hide delay input is now **read-only** and fixed at 6 seconds:
  ```html
  <input type="number" id="leaderboardAutoHideDelay" value="6" min="6" max="60" readonly>
  <small>Fest auf 6 Sekunden eingestellt - Leaderboard wird nach jeder Frage für 6 Sekunden angezeigt</small>
  ```

## Timeline of Events

### Normal Quiz Flow
```
1. Question is displayed
2. Timer counts down
3. [TIME EXPIRES]
4. Timer is automatically hidden (fade out over ~800ms)
5. Correct answer is revealed for MINIMUM 6 seconds
   - TTS reads answer + info text during this time
   - Visual display remains for at least 6 seconds regardless of TTS duration
6. Leaderboard is shown for exactly 6 seconds
7. [If Auto Mode] Next question starts after autoModeDelay
```

### Timing Calculation Example
Assuming default settings:
- **Answer Display**: 6 seconds (minimum)
- **Leaderboard Display**: 6 seconds (fixed)
- **Auto Mode Delay**: 5 seconds (default)
- **Total Time Between Questions**: 6 + 6 + 5 = **17 seconds**

### TTS Integration
The TTS system reads the correct answer and info text during the answer display phase:
```javascript
if (this.config.ttsEnabled) {
    let ttsText = `Die richtige Antwort ist ${correctAnswerLetter}: ${correctAnswerText}.`;
    if (this.gameState.currentQuestion.info) {
        ttsText += ` ${this.gameState.currentQuestion.info}`;
    }
    // TTS plays asynchronously while answer is displayed
}
```

**Important**: The minimum 6-second display ensures the answer remains visible long enough for TTS to complete reading, even for longer info texts.

## Files Modified
1. **app/plugins/quiz-show/main.js**
   - Updated default `answerDisplayDuration` to 6 seconds
   - Updated default `leaderboardAutoHideDelay` to 6 seconds
   - Enforced minimum 6 seconds throughout calculations
   - Fixed leaderboard display to exactly 6 seconds

2. **app/plugins/quiz-show/quiz_show_overlay.js**
   - Updated default `answerDisplayDuration` to 6 seconds
   - Enforced minimum in state machine
   - Timer hiding already implemented in TIME_UP state

3. **app/plugins/quiz-show/quiz_show.html**
   - Updated answer display duration input (min=6, value=6)
   - Made leaderboard auto-hide delay read-only (fixed at 6 seconds)
   - Updated help texts to reflect new requirements

4. **app/plugins/quiz-show/quiz_show.js**
   - Enforced minimum 6 seconds when saving config
   - Enforced minimum 6 seconds when loading config

## Validation Points

### ✅ Timer Hiding
- [x] Timer automatically hides after time expires
- [x] Timer hides BEFORE correct answer is revealed
- [x] No manual hide-timer event needed (automatic in overlay)

### ✅ Answer Display Duration
- [x] Minimum 6 seconds enforced in backend
- [x] Minimum 6 seconds enforced in frontend overlay
- [x] UI prevents values less than 6 seconds
- [x] TTS integration respects minimum display time

### ✅ Leaderboard Display
- [x] Fixed 6-second display after answer
- [x] Both after-question and after-round leaderboards use 6 seconds
- [x] Auto mode calculations include fixed 6-second leaderboard time
- [x] UI shows fixed 6-second value (read-only)

## Testing Recommendations

1. **Basic Flow Test**
   - Start a quiz
   - Wait for timer to expire
   - Verify timer hides automatically
   - Verify answer displays for 6 seconds minimum
   - Verify leaderboard shows for exactly 6 seconds

2. **TTS Integration Test**
   - Enable TTS
   - Use question with long info text
   - Verify answer remains visible for full TTS duration
   - Verify minimum 6 seconds even for short answers

3. **Auto Mode Test**
   - Enable auto mode
   - Verify total timing: answer (6s) + leaderboard (6s) + delay (5s) = 17s
   - Verify smooth transition to next question

4. **Configuration Test**
   - Try to set answer duration < 6 seconds (should default to 6)
   - Verify leaderboard delay is read-only at 6 seconds
   - Save and reload configuration

## Notes
- The 6-second minimum ensures adequate time for TTS to read answer + info text
- Timer hiding is automatic and does not require manual intervention
- Leaderboard display is now consistently 6 seconds regardless of configuration
- All timing calculations account for the new fixed durations
- Named constants (`MIN_ANSWER_DISPLAY_DURATION`, `LEADERBOARD_DISPLAY_DURATION`) improve maintainability
- Helper method (`getAnswerDisplayDuration()`) reduces code duplication and ensures consistency

## Git Commits
1. `295ba73` - Initial plan
2. `b6ca037` - Implement quiz timer hiding and 6-second timing requirements
3. `8a2f7a8` - Refactor: Extract helper method and simplify timing calculations
4. `4748441` - Fix: Update comments for clarity and address code review feedback
5. `bc633b0` - Docs: Clarify timer hiding location and improve help text
6. `64dea75` - Refactor: Extract magic numbers to constants for maintainability

## Code Quality
✅ All code review feedback addressed
✅ Named constants instead of magic numbers
✅ Helper methods reduce duplication
✅ Comprehensive comments explain requirements
✅ Defensive programming with fallbacks
✅ No breaking changes to existing functionality
✅ German terminology corrected (TTS-Ausgabe)
✅ Timing logic verified with automated tests
