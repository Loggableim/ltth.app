# Interactive Story Generator - Bug Fixes & Feature Implementation

## Summary
This document describes the fixes and improvements made to the Interactive Story Generator plugin to address CSP violations, image loading issues, and add manual mode functionality.

---

## 1. CSP (Content Security Policy) Violations Fixed ✅

### Problem
Inline event handlers (onclick attributes) were blocked by CSP, causing buttons to be non-functional:
- `testApiKey()` button
- `copyOverlayUrl()` button
- `openOverlayInNewTab()` button
- `toggleOverlayPreview()` button
- `testTitlePreview()` button
- `testChapterPreview()` button
- `testChoicesPreview()` button
- `clearOverlayPreview()` button
- Admin choice selection buttons

### Solution
**File: `app/plugins/interactive-story/ui.html`**
- Removed all `onclick="function()"` attributes from HTML buttons
- Added unique IDs to all affected buttons
- Added event listeners in the DOMContentLoaded block using `addEventListener()`

Example change:
```html
<!-- Before -->
<button onclick="testApiKey()">Test API Key</button>

<!-- After -->
<button id="testApiKeyBtn">Test API Key</button>

<!-- In JavaScript -->
document.getElementById('testApiKeyBtn').addEventListener('click', testApiKey);
```

---

## 2. Image Loading Issue Fixed ✅

### Problem
Images were not loading because full Windows file paths were being sent to the overlay (e.g., `C:\Users\...\image.png`), and the overlay's path splitting logic `imagePath.split('/').pop()` didn't work with backslashes.

Error example:
```
GET http://localhost:3000/api/interactive-story/image/C:/Users/logga/AppData/Lo…mages/1766669508969_Character_introduced_in_chapter_0_and_Character_in.png 404 (Not Found)
```

### Solution
**File: `app/plugins/interactive-story/main.js`**

Added helper methods:
```javascript
_extractFilename(imagePath) {
  if (!imagePath) return null;
  return path.basename(imagePath); // Handles both Windows and Unix paths
}

_prepareChapterForEmit(chapter) {
  if (!chapter) return null;
  const prepared = { ...chapter };
  if (prepared.imagePath) {
    prepared.imagePath = this._extractFilename(prepared.imagePath);
  }
  return prepared;
}
```

Updated all socket emissions:
- `this.io.emit('story:chapter-ready', this._prepareChapterForEmit(finalChapter))`
- `this.io.emit('story:image-updated', { imagePath: this._extractFilename(imagePath) })`

**File: `app/plugins/interactive-story/overlay.html`**
- Simplified image path handling (no longer needs to extract filename)
- Changed from: `const filename = chapter.imagePath.split('/').pop(); storyImage.src = /api/interactive-story/image/${filename}`
- Changed to: `storyImage.src = /api/interactive-story/image/${chapter.imagePath}`

---

## 3. Manual Mode Implementation ✅

### Problem
The plugin only supported automatic mode where the story automatically progressed after each voting round. Users wanted a manual mode where they could:
- Manually advance each round
- See voting results before advancing
- Optionally disable TTS to read the story aloud themselves

### Solution

#### Configuration Options
**File: `app/plugins/interactive-story/ui.html`**

Added two new checkboxes in the Generation Settings section:
1. **Manual Mode**: Enable manual round advancement
2. **Use TTS in Manual Mode**: Toggle TTS on/off when using manual mode

#### UI Controls
**File: `app/plugins/interactive-story/ui.html`**

Added a new Manual Mode Control Panel that shows when a story is active and manual mode is enabled:
```html
<div id="manualModeSection">
  <!-- Current Round Info -->
  <div id="manualModeChapterInfo">
    - Chapter number / total chapters
    - Voting active status
  </div>
  
  <!-- Voting Results -->
  <div id="manualModeVoting">
    - Current voting results with percentages
    - Progress bars for each choice
  </div>
  
  <!-- Control Buttons -->
  - "Advance to Next Round" button (enabled when voting completes)
  - "Show Voting Results" button (view results anytime)
</div>
```

#### Backend Implementation
**File: `app/plugins/interactive-story/main.js`**

1. **Configuration Storage**
   ```javascript
   _loadConfig() {
     return {
       ...
       manualMode: false,
       manualModeTTS: true,
       ...
     };
   }
   ```

2. **Vote Result Handling**
   Modified `_handleVoteResults()` to:
   - Store voting results in `this.lastVoteResults`
   - Check if manual mode is enabled
   - Skip auto-advancement if in manual mode
   ```javascript
   async _handleVoteResults(results) {
     this.lastVoteResults = results;
     // ... save to database ...
     
     if (config.manualMode) {
       this.logger.info('Manual mode - waiting for user to manually advance');
       return; // Don't auto-generate next chapter
     }
     
     await this._generateNextChapterFromChoice(results.winnerIndex);
   }
   ```

3. **Manual Advance API Route**
   Added new route: `POST /api/interactive-story/manual-advance`
   ```javascript
   this.api.registerRoute('post', '/api/interactive-story/manual-advance', async (req, res) => {
     // Check manual mode is enabled
     // Check voting is complete
     // Use stored lastVoteResults to generate next chapter
     await this._handleVoteResults(this.lastVoteResults);
   });
   ```

4. **TTS Control in Manual Mode**
   Modified `_generateChapterTTS()` and `_generateChoicesTTS()` to respect manual mode TTS setting:
   ```javascript
   const ttsEnabled = config.manualMode ? config.manualModeTTS : config.autoGenerateTTS;
   
   if (!ttsEnabled) {
     // Skip TTS, just wait for reading time
     return;
   }
   ```

#### JavaScript Functions
**File: `app/plugins/interactive-story/ui.html`**

Added functions:
- `updateManualModeDisplay()`: Updates manual mode UI with current chapter and voting info
- `manualAdvanceRound()`: Calls API to advance to next round
- `manualShowResults()`: Displays and scrolls to voting results
- `updateAdminChoiceButtons()`: Updated to show/hide manual mode section

---

## Testing Checklist

### CSP Fixes
- [ ] Test API Key button works
- [ ] Copy overlay URL button works
- [ ] Open overlay in new tab button works
- [ ] Toggle overlay preview button works
- [ ] Test title/chapter/choices preview buttons work
- [ ] Clear overlay preview button works
- [ ] Admin choice buttons work in offline mode

### Image Loading
- [ ] Images load correctly in overlay
- [ ] Images show correct path in browser network tab
- [ ] Works with both Windows and Unix file paths

### Manual Mode
- [ ] Enable manual mode in configuration
- [ ] Start a story
- [ ] Verify chapter displays correctly
- [ ] Verify voting starts after TTS (if TTS enabled)
- [ ] View voting results using "Show Results" button
- [ ] Verify "Advance" button is disabled during voting
- [ ] Verify "Advance" button enables after voting ends
- [ ] Click "Advance" to generate next chapter
- [ ] Verify next chapter generates correctly
- [ ] Test with TTS enabled in manual mode
- [ ] Test with TTS disabled in manual mode
- [ ] Verify story progresses through all chapters
- [ ] Verify final chapter works correctly

---

## Files Modified

1. **app/plugins/interactive-story/main.js**
   - Added `_extractFilename()` helper method
   - Added `_prepareChapterForEmit()` helper method
   - Updated all `story:chapter-ready` emissions
   - Updated `story:image-updated` emission
   - Added `manualMode` and `manualModeTTS` config options
   - Added `lastVoteResults` state variable
   - Modified `_handleVoteResults()` to support manual mode
   - Added `/api/interactive-story/manual-advance` route
   - Modified `_generateChapterTTS()` to respect `manualModeTTS`
   - Modified `_generateChoicesTTS()` to respect `manualModeTTS`

2. **app/plugins/interactive-story/ui.html**
   - Removed all inline `onclick` handlers
   - Added IDs to all buttons
   - Added event listeners in DOMContentLoaded
   - Added manual mode configuration checkboxes
   - Added manual mode control panel UI
   - Added `updateManualModeDisplay()` function
   - Added `manualAdvanceRound()` function
   - Added `manualShowResults()` function
   - Updated `updateAdminChoiceButtons()` to handle manual mode
   - Updated config loading/saving to include manual mode settings

3. **app/plugins/interactive-story/overlay.html**
   - Simplified image path handling (removed filename extraction)
   - Updated `story:chapter-ready` handler
   - Updated `story:image-updated` handler

---

## Benefits

1. **Security**: All CSP violations resolved, improving application security
2. **Cross-platform**: Image loading now works on both Windows and Unix systems
3. **Flexibility**: Users can choose between automatic or manual story progression
4. **Accessibility**: Manual mode with optional TTS allows streamers to narrate stories themselves
5. **Control**: Manual mode gives complete control over pacing and story flow

---

## Notes

- Manual mode and offline mode can work independently
- In manual mode, voting still happens automatically but progression is manual
- The manual advance button is disabled during active voting
- All changes maintain backward compatibility with existing stories and configurations
