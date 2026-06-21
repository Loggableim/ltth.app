# CoinBattle Pyramid Overlay - Row Count & Responsive Layout Fix

## Problem Statement
1. **Pyramiden-Overlay reagiert nicht auf Änderungen der Reihenanzahl**
   - Das Overlay aktualisiert sich nicht, wenn die Anzahl der Zeilen geändert wird
   
2. **Das HUD muss anpassbar sein für Hoch- oder Querformat**
   - Das Overlay war auf 1920x1080 (Querformat) festgelegt
   - Keine Unterstützung für Hochformat (Portrait) oder andere Bildschirmformate

## Solution Overview

### 1. Dynamic Row Count Updates ✅

**Backend Changes:**
- `pyramid-mode.js`: Added `pyramid:config-updated` socket event emission
- Config changes now immediately notify all connected overlays

**Frontend Changes:**
- `overlay.js`: Added socket listener for `pyramid:config-updated`
- `initializePyramidRows()`: Now completely rebuilds pyramid structure
- `handlePyramidConfigUpdate()`: New function to handle config changes

**Supported Row Configurations:**
```
2 rows: 1 + 2 = 3 slots total
3 rows: 1 + 2 + 4 = 7 slots total
4 rows: 1 + 2 + 4 + 6 = 13 slots total (default)
5 rows: 1 + 2 + 4 + 6 + 8 = 21 slots total
6 rows: 1 + 2 + 4 + 6 + 8 + 10 = 31 slots total
```

### 2. Responsive Layout (Portrait/Landscape) ✅

**Viewport Changes:**
- Changed from fixed `width: 1920px; height: 1080px`
- Now uses `width: 100vw; height: 100vh` for flexibility

**Portrait Mode (@media orientation: portrait):**
```css
- Timer: Smaller (150px), centered at top
- Team Scores: Stacked vertically instead of horizontally
- Leaderboard: Full width (90%), positioned at bottom
- Pyramid: Centered, scaled down avatars
  - Row 1: 80px (was 100px)
  - Row 2: 60px (was 70px)
  - Row 3: 45px (was 50px)
  - Row 4: 35px (was 40px)
  - Row 5: 32px
  - Row 6: 28px
```

**Landscape Mode (@media orientation: landscape):**
```css
- Default layout preserved
- Pyramid container: max 800px width
- All original spacing maintained
```

**Ultra-Wide Support (@media min-aspect-ratio: 21/9):**
```css
- Leaderboard/KOTH: Moved further right (100px)
- Team scores: More top spacing (80px)
```

**Compact Mode (@media max-width: 1280px):**
```css
- Timer: Smaller (120px)
- All containers: Max 90% width
- Pyramid: Reduced font sizes and padding
```

## Technical Implementation

### File Changes

1. **app/plugins/coinbattle/engine/pyramid-mode.js**
   ```javascript
   updateConfig(newConfig) {
     // ... config update logic ...
     this.updateRowSizes();
     const result = this.saveConfig();
     
     // ✨ NEW: Emit config update to overlays
     this.io.emit('pyramid:config-updated', {
       rowSizes: this.rowSizes,
       config: this.getPublicConfig()
     });
     
     return result;
   }
   ```

2. **app/plugins/coinbattle/overlay/overlay.js**
   ```javascript
   // ✨ NEW: Listen for config updates
   socket.on('pyramid:config-updated', (data) => {
     handlePyramidConfigUpdate(data);
   });
   
   // ✨ NEW: Handle config changes
   function handlePyramidConfigUpdate(data) {
     pyramidState.config.rowSizes = data.rowSizes;
     initializePyramidRows(pyramidState.config.rowSizes);
     // Re-render if active
     if (pyramidState.active && pyramidState.pyramid.length > 0) {
       updatePyramidLeaderboard({...});
     }
   }
   
   // ✨ IMPROVED: Rebuild rows completely
   function initializePyramidRows(rowSizes) {
     const rowsContainer = document.getElementById('pyramid-rows');
     rowsContainer.textContent = ''; // Clear all
     
     // Create new rows based on config
     sizes.forEach((slotCount, rowIndex) => {
       // ... create row elements ...
     });
   }
   ```

3. **app/plugins/coinbattle/overlay/styles.css**
   ```css
   /* ✨ NEW: Flexible viewport */
   body {
     width: 100vw;
     height: 100vh;
   }
   
   /* ✨ NEW: Portrait orientation support */
   @media (orientation: portrait) {
     .pyramid-container {
       width: 90%;
       max-width: 600px;
     }
     /* ... responsive adjustments ... */
   }
   
   /* ✨ NEW: Row 5 & 6 avatar sizing */
   .pyramid-avatar-row-5 {
     width: 35px;
     height: 35px;
   }
   .pyramid-avatar-row-6 {
     width: 30px;
     height: 30px;
   }
   ```

4. **app/plugins/coinbattle/overlay/overlay.html**
   ```html
   <!-- ✨ CHANGED: Responsive viewport -->
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   ```

5. **app/plugins/coinbattle/ui.html**
   ```html
   <!-- ✨ NEW: Extended row options -->
   <select id="setting-pyramid-rows">
     <option value="2">2 rows (1+2 = 3 slots)</option>
     <option value="3">3 rows (1+2+4 = 7 slots)</option>
     <option value="4" selected>4 rows (1+2+4+6 = 13 slots)</option>
     <option value="5">5 rows (1+2+4+6+8 = 21 slots)</option>
     <option value="6">6 rows (1+2+4+6+8+10 = 31 slots)</option>
   </select>
   ```

## Testing

### Automated Tests
- ✅ Row count configuration logic validated
- ✅ Row size calculations tested for all configurations (2-6 rows)
- ✅ Socket event emission verified
- ✅ JavaScript syntax validated
- ✅ HTML/CSS structure verified

### Manual Testing Checklist
To test the changes, follow these steps:

#### Test 1: Row Count Changes
1. Open CoinBattle admin panel
2. Navigate to Pyramid Mode settings
3. Start a pyramid round with 4 rows (default)
4. Open overlay in browser: `/plugins/coinbattle/overlay?pyramidMode=true`
5. In admin panel, change row count to 2
6. Click "Save Pyramid Settings"
7. **Expected:** Overlay should immediately update to show only 2 rows
8. Repeat for 3, 5, and 6 rows

#### Test 2: Portrait Orientation
1. Open overlay in browser
2. Resize browser window to portrait aspect ratio (e.g., 1080x1920)
3. **Expected:** Layout should adapt with:
   - Timer at top center
   - Pyramid centered and scaled appropriately
   - All elements visible and properly positioned

#### Test 3: Landscape Orientation
1. Open overlay in browser
2. Resize to landscape (e.g., 1920x1080)
3. **Expected:** Original layout preserved

#### Test 4: Live Updates
1. Have overlay open in OBS or browser
2. Start pyramid round
3. While round is active, change row count in settings
4. **Expected:** Pyramid should rebuild with new row count
5. Players should re-render in new structure

## Browser Compatibility
- ✅ Modern browsers (Chrome, Firefox, Edge)
- ✅ OBS Browser Source
- ✅ CSS Grid/Flexbox supported
- ✅ CSS Media Queries supported

## Performance Considerations
- Minimal DOM manipulation (single rebuild on config change)
- CSS-based responsive design (no JavaScript resize listeners)
- Efficient row rendering using `textContent = ''` for clearing

## Migration Notes
- No breaking changes
- Existing overlays will continue to work
- Row count defaults to 4 (existing behavior)
- Fixed viewport URLs will still work (backward compatible)

## Future Improvements
- [ ] Add animation for row transitions
- [ ] Support custom row size patterns
- [ ] Add orientation-specific URL parameters
- [ ] Save user's preferred orientation in config
