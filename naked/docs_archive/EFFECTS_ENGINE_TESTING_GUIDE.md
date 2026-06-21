# Effects Engine Refactor - Testing Guide

## Quick Test (5 minutes)

### 1. Basic Functionality
```bash
# Start the application
npm start
```

1. Open browser to flame-overlay renderer: `http://localhost:3000/plugins/flame-overlay/renderer/`
2. **Verify**: Flames render at bottom of screen
3. **Verify**: No console errors
4. **Verify**: Canvas is transparent (check with colored background behind)

### 2. Socket.io Live Updates
1. Open settings UI: `http://localhost:3000/plugins/flame-overlay/ui`
2. Change flame color to blue (#0066ff)
3. **Verify**: Renderer updates immediately (no page refresh)
4. Change frame mode to "All Edges"
5. **Verify**: Flames appear on all 4 edges

### 3. Effect Switching
1. In settings UI, change effect type to "Particles"
2. **Verify**: Particles render instead of flames
3. Change to "Energy"
4. **Verify**: Energy waves render
5. Change to "Lightning"
6. **Verify**: Lightning bolts render
7. Change back to "Flames"

## Feature Tests (15 minutes)

### 4. Multi-Layer Flames
1. Settings UI → Enable "Multi-layer flames"
2. Set layer count to 3
3. Set parallax to 0.5
4. **Verify**: Flames have depth with 3 distinct layers
5. **Verify**: Layers move at different speeds

### 5. Bloom Post-Processing
1. Enable "Bloom effect"
2. Set bloom intensity to 1.0
3. Set bloom threshold to 0.5
4. **Verify**: Bright areas glow
5. **Verify**: FPS is still acceptable (check browser DevTools)
6. Disable bloom
7. **Verify**: Returns to crisp rendering

### 6. Smoke Layer
1. Enable "Smoke effect"
2. Set smoke intensity to 0.6
3. Set smoke speed to 0.5
4. Change smoke color to gray (#666666)
5. **Verify**: Wispy smoke rises from flames
6. **Verify**: Smoke dissipates as it rises

### 7. Animation Easing
1. Set animation easing to "Sine"
2. **Verify**: Flame animation has smooth, wave-like motion
3. Change to "Elastic"
4. **Verify**: Flame animation bounces
5. Change to "Quad"
6. **Verify**: Flame animation accelerates

### 8. Pulse Effect
1. Enable "Pulse effect"
2. Set pulse amount to 0.5
3. Set pulse speed to 1.5
4. **Verify**: Flames breathe in and out
5. **Verify**: Pulse is smooth, not jerky

### 9. Edge Effects
1. Set edge feather to 0.5
2. **Verify**: Flame edges are soft/blurred
3. Set frame curve to 0.3
4. **Verify**: Corners are rounded
5. Set frame noise amount to 0.5
6. **Verify**: Frame edges have organic, wavy appearance

### 10. Quality Settings
1. Set noise octaves to 12 (max)
2. **Verify**: Flames have more detail
3. **Verify**: Performance impact is acceptable
4. Set noise octaves to 4 (min)
5. **Verify**: Flames are smoother/simpler
6. **Verify**: Performance improves

## Performance Tests (10 minutes)

### 11. Baseline Performance
1. Disable all effects (bloom, smoke, layers, pulse)
2. Set effect to "Flames"
3. Open browser DevTools → Performance tab
4. Record for 5 seconds
5. **Verify**: Consistent 60 FPS (or monitor refresh rate)
6. **Note**: Baseline FPS for comparison

### 12. All Features Enabled
1. Enable bloom (intensity 0.8)
2. Enable smoke (intensity 0.4)
3. Enable multi-layer (3 layers, parallax 0.3)
4. Enable pulse (amount 0.2, speed 1.0)
5. Set noise octaves to 10
6. Set frame curve to 0.2
7. Set edge feather to 0.4
8. Record performance for 5 seconds
9. **Verify**: FPS above 30 (acceptable for effects)
10. **Note**: FPS drop from baseline

### 13. Resolution Scaling
1. Window size 720x1280 (TikTok portrait)
   - **Verify**: Flames render correctly
   - **Note**: FPS
2. Window size 1920x1080 (HD landscape)
   - **Verify**: Flames render correctly
   - **Verify**: Detail scale adjusted (flames have finer detail)
   - **Note**: FPS
3. Window size 3840x2160 (4K)
   - **Verify**: Flames render correctly
   - **Verify**: Detail scale high (very fine detail)
   - **Note**: FPS (expect significant drop)

## Edge Case Tests (5 minutes)

### 14. Config Update During Bloom
1. Enable bloom
2. Wait for 2 seconds
3. While rendering, change flame color rapidly (5 times)
4. **Verify**: No crashes
5. **Verify**: No visual glitches
6. **Verify**: PostProcessor resizes correctly

### 15. Smoke Without Flames
1. Set effect to "Particles"
2. Enable smoke
3. **Verify**: Smoke renders with particles
4. Set effect to "Energy"
5. **Verify**: Smoke renders with energy waves
6. Set effect to "Lightning"
7. **Verify**: Smoke renders with lightning

### 16. Extreme Values
1. Set flame speed to 3.0 (max)
   - **Verify**: Very fast animation
2. Set flame intensity to 3.0 (high)
   - **Verify**: Chaotic flames
3. Set frame thickness to 500 (large)
   - **Verify**: Thick frame
4. Set bloom radius to 10 (max)
   - **Verify**: Wide glow
5. **Verify**: No crashes with any extreme value

### 17. PostProcessor Not Available
1. Edit `renderer/index.html`
2. Comment out PostProcessor script:
   ```html
   <!-- <script src="post-processor.js"></script> -->
   ```
3. Reload renderer
4. Enable bloom in settings
5. **Verify**: Console warning "PostProcessor not available"
6. **Verify**: Flames still render (fallback to direct rendering)
7. **Verify**: No crashes
8. Restore PostProcessor script

## Browser Compatibility (5 minutes)

### 18. Chrome/Edge
- **Verify**: All features work
- **Verify**: Performance is good

### 19. Firefox
- **Verify**: All features work
- **Verify**: Performance is acceptable
- **Note**: May be slightly slower than Chrome

### 20. Safari (macOS/iOS)
- **Verify**: All features work
- **Note**: WebGL performance varies

## OBS Integration Test (5 minutes)

### 21. OBS Browser Source
1. Open OBS Studio
2. Add Browser Source
3. URL: `http://localhost:3000/plugins/flame-overlay/renderer/`
4. Width: 720, Height: 1280
5. **Verify**: Flames render in OBS
6. **Verify**: Background is transparent
7. **Verify**: No visible lag in OBS preview
8. Start streaming/recording
9. **Verify**: Flames appear in output
10. Change flame color while streaming
11. **Verify**: Update appears in stream

## Regression Tests (5 minutes)

### 22. Original Features Still Work
1. Test each original frame mode:
   - Bottom only ✓
   - Top only ✓
   - Sides only ✓
   - All edges ✓
2. Test original effects:
   - Flames ✓
   - Particles ✓
   - Energy ✓
   - Lightning ✓
3. Test original settings:
   - Flame color ✓
   - Flame speed ✓
   - Flame intensity ✓
   - Flame brightness ✓
   - Frame thickness ✓
   - Mask edges ✓

## Test Results Template

```
Date: _______________
Tester: _____________
Browser: _____________ (version)
OS: _________________

Quick Test:
[ ] Basic functionality
[ ] Socket.io updates
[ ] Effect switching

Feature Tests:
[ ] Multi-layer flames
[ ] Bloom post-processing
[ ] Smoke layer
[ ] Animation easing
[ ] Pulse effect
[ ] Edge effects
[ ] Quality settings

Performance Tests:
[ ] Baseline: ____ FPS
[ ] All features: ____ FPS
[ ] 720p: ____ FPS
[ ] 1080p: ____ FPS
[ ] 4K: ____ FPS

Edge Cases:
[ ] Config update during bloom
[ ] Smoke without flames
[ ] Extreme values
[ ] PostProcessor unavailable

Browser Compatibility:
[ ] Chrome/Edge
[ ] Firefox
[ ] Safari

OBS Integration:
[ ] Renders in OBS
[ ] Transparent background
[ ] Live updates work

Regression:
[ ] Original frame modes
[ ] Original effects
[ ] Original settings

Issues Found:
_________________________________
_________________________________
_________________________________

Overall Result: PASS / FAIL
```

## Performance Benchmarks (Expected)

### Desktop (GTX 1060 / Ryzen 5)
- Baseline (flames only): 60 FPS
- All features (bloom + smoke + layers): 45-55 FPS
- 4K resolution: 30-40 FPS

### Laptop (Intel UHD 620)
- Baseline: 45-60 FPS
- All features: 25-35 FPS
- 4K resolution: 15-25 FPS

### Known Limitations
- WebGL 1.0 required (no fallback)
- Bloom has significant performance cost
- High octave counts impact performance
- 4K resolution challenging for integrated graphics

## Debugging Tips

### Console Warnings/Errors
```javascript
// Expected warnings (safe to ignore):
"PostProcessor not available" - if script not loaded
"Socket.io connection error" - if backend not running

// Critical errors (must fix):
"WebGL not supported" - browser too old
"Shader compile error" - shader syntax issue
"Program link error" - shader mismatch
"Canvas element not found" - HTML issue
```

### Visual Issues
- **Black screen**: Check console for shader errors
- **Flickering**: Check FPS, may be performance issue
- **No updates**: Check socket.io connection
- **Wrong colors**: Check hex color format (#RRGGBB)
- **No bloom**: Check PostProcessor script loaded

### Performance Issues
- Disable bloom first (biggest cost)
- Reduce noise octaves to 6
- Disable smoke
- Reduce layer count to 1
- Lower resolution

## Success Criteria

✅ **Must Pass:**
1. All original features work (regression test)
2. No crashes or errors in console
3. Baseline performance ≥ 30 FPS
4. Socket.io updates work
5. OBS integration works

✅ **Should Pass:**
6. Bloom renders correctly
7. Smoke renders correctly
8. Multi-layer flames work
9. Animation easing works
10. All features together ≥ 25 FPS

✅ **Nice to Have:**
11. 60 FPS with all features
12. 4K resolution performant
13. Safari compatibility perfect
