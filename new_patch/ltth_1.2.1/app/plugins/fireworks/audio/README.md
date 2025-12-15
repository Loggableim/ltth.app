# Fireworks Audio Files

This directory contains synchronized audio files for the fireworks plugin with realistic rocket launches, explosions, and atmospheric effects.

## 🎵 Audio System Overview

The fireworks plugin uses an intelligent audio system with **TWO primary synchronization strategies**:

1. **COMBINED AUDIO (PRIMARY - 60-80%)**: Pre-recorded woosh+explosion files - PERFECT sync because launch and explosion are one recording
2. **CALLBACK AUDIO (FALLBACK - 20-40%)**: Separate sounds with explosion triggered when visual explodes - GUARANTEED sync via callback

Audio selection is automatic based on:
- **Firework tier** (small, medium, big, massive)
- **Combo level** (consecutive gifts)
- **Random variety** (to prevent repetitiveness)

## 🎯 Synchronization Strategies Explained

### 1. Combined Audio Strategy (PRIMARY - Used 60-80% of time)
- Uses pre-recorded `woosh_abheben_*_bang.mp3` files
- Launch + explosion in one authentic audio sequence
- **PERFECT SYNCHRONIZATION** because explosion timing is baked into the audio file
- Most authentic sound because launch and explosion were recorded together
- Example: `woosh_crackling_bang.mp3` has explosion at ~4.8s mark

### 2. Callback Audio Strategy (FALLBACK - Used 20-40% of time)
- Launch plays immediately when rocket fires
- Explosion triggers via callback exactly when visual firework explodes
- **GUARANTEED SYNC** because explosion sound is triggered by actual explosion event
- Provides variety by mixing and matching different launch + explosion combinations
- Crackling can be layered with explosion for atmospheric effects

## 📁 Audio File Analysis (22 Total)

### Combined Audio (Launch + Explosion in one file)

**Deep Analysis - Explosion Timing** (based on file size, bitrate, and audio structure):

| File | Size | Duration | Explosion At | Used For |
|------|------|----------|--------------|----------|
| `woosh_tiny-bang.mp3` (1-3) | 37-38KB | ~1.15-1.19s | **~1.0s** | Small (80%) |
| `woosh_tiny-bang4.mp3` | 107KB | ~3.42s | **~3.3s** | Medium (35%) |
| `woosh_normal-bang.mp3` | 107KB | ~3.39s | **~3.3s** | Medium (35%) |
| `woosh_crackling_bang.mp3` | 155KB | ~4.94s | **~4.8s** | Big (60%), Massive (80%) |

### Launch-Only Audio (for Callback combinations)

| File | Size | Duration | Description | Used In |
|------|------|----------|-------------|---------|
| `woosh_mit-pfeifen_no-bang.mp3` | 42KB | ~1.3s | Whistle launch | Callback combinations |
| `woosh_nocrackling_no-bang.mp3` | 47KB | ~1.5s | Smooth launch | Callback combinations |
| `woosh_nocrackling_no-bang2.mp3` | 42KB | ~1.7s | Smooth launch (alt) | Callback combinations |
| `abschussgeraeusch.mp3` | 16KB | ~0.8s | Short ignition | Callback Small/Medium |
| `abschussgeraeusch2.mp3` | 11KB | ~0.6s | Short ignition (alt) | Callback Small/Medium |
| `rocket.mp3` | 6KB | ~0.4s | Quick launch | Callback Small |

### Explosion Sounds (for Callback Audio)

**Small Explosions:**
- `explosion.mp3` (5KB, ~0.3s) - Quick, sharp explosion
- `explosion_small1.mp3` (37KB, ~3.7s) - Small explosion with reverb
- `explosion2.mp3` (28KB, ~2.8s) - Alternative small explosion

**Medium Explosions:**
- `explosion_medium.mp3` (32KB, ~3.2s) - Medium-sized explosion
- `explosion3.mp3` (36KB, ~3.6s) - Alternative medium explosion
- `explosion Pop,Sharp,.mp3` (45KB, ~4.6s) - Sharp popping explosion

**Big Explosions:**
- `explosion_big.mp3` (34KB, ~3.5s) - Big powerful explosion
- `explosion_huge.mp3` (58KB, ~5.9s) - Huge dramatic explosion (longest)

### Crackling Sounds (Atmospheric Layers)

- `crackling.mp3` (100KB, ~10.2s) - Long atmospheric crackling
- `crackling2.mp3` (58KB, ~5.9s) - Medium atmospheric crackling

Used 40-70% of time with Big/Massive callback audio for added atmosphere.

**🎚️ Fade-Out Behavior:**
Crackling sounds now use intelligent fade-out to match visual firework particle lifespans:
- **Massive tier**: 2.0s playback + 0.8s fade-out (total ~2.8s)
- **Big tier**: 1.5s playback + 0.8s fade-out (total ~2.3s)
- **Medium/Small tier**: 1.2s playback + 0.8s fade-out (total ~2.0s)
- **Secondary bursts**: 1.0s playback + 0.5s fade-out (total ~1.5s)

This prevents crackling from continuing long after visual particles have faded, providing perfect synchronization between audio and visual effects.

## 🔊 Volume Balancing

To ensure consistent perceived loudness across all audio files, per-file volume multipliers are applied:

**Loud sounds (reduced volume):**
- `explosion_huge.mp3`: 0.7x (very loud)
- `explosion_big.mp3`: 0.8x
- `explosion_pop.mp3`: 0.75x (sharp and loud)
- `crackling.mp3`: 0.6x (long and loud)
- `crackling2.mp3`: 0.7x

**Quiet sounds (boosted volume):**
- `explosion.mp3`: 1.3x (very short/quiet)
- `explosion2.mp3`: 1.1x
- `rocket.mp3`: 1.2x (very short)
- Launch sounds: 1.0-1.1x

**Volume Constants:**
- Combined audio: 0.65
- Launch audio: 0.45
- Normal explosions: 0.7
- Instant explosions: 0.25
- Crackling: 0.35

## 🎚️ Automatic Audio Selection

The system intelligently selects audio based on firework tier:

### Small Tier (0-99 coins)
- **80%**: Combined `tiny-bang` (1-3) - Explosion at 1.0s - Quick and snappy
- **20%**: Callback (basic launch + small explosion) - Variety

### Medium Tier (100-499 coins)
- **70%**: Combined `normal-bang` or `tiny-bang4` - Explosion at 3.3s - Impactful
- **30%**: Callback (smooth/varied launch + medium explosion) - Variety

### Big Tier (500-999 coins)
- **60%**: Combined `crackling-bang` - Explosion at 4.8s - Epic with crackling
- **40%**: Callback (whistle + big explosion + 40% crackling layer) - Varied epic

### Massive Tier (1000+ coins)
- **80%**: Combined `crackling-bang` - Maximum impact!
- **20%**: Callback (whistle + huge explosion + 70% crackling layer) - Variety

### High Combos (5+)
- **80%**: Combined `tiny-bang` (fast for rapid combos)
- **20%**: Callback (basic launch + small explosion)

### Instant Explosions (8+ combo)
- Small explosion sound only (no launch, no rocket animation)

## 🔧 Technical Implementation

### Combined Audio Playback
```javascript
// Single file plays entire sequence
audioManager.play('combined-crackling-bang', COMBINED_AUDIO_VOLUME);
// Explosion happens at pre-recorded timing (~4.8s) - PERFECT SYNC
```

### Callback Audio Playback
```javascript
// Launch plays immediately
audioManager.play('launch-whistle', LAUNCH_AUDIO_VOLUME);

// Explosion triggers when visual explodes
firework.onExplodeSound = (intensity) => {
    audioManager.play('explosion-big', intensity * EXPLOSION_VOLUME);
    // Optional crackling layer
    if (hasCrackling) {
        audioManager.play('crackling-medium', CRACKLING_VOLUME);
    }
};
// GUARANTEED SYNC - sound plays exactly when visual explodes
```

## 🎯 Why This Approach Works

1. **Combined audio (60-80%)** provides the most authentic sound because the launch and explosion were recorded together with proper timing
2. **Callback audio (20-40%)** provides variety and guarantees sync even when flight time varies
3. **All 22 audio files are actively used** for maximum variety
4. **Volume balancing** ensures consistent experience regardless of which sound plays
5. **Tier-appropriate sounds** match the visual impact (small sounds for small, huge for massive)

## 🐛 Troubleshooting

**Explosions sound too late:**
- The system now prioritizes combined audio (80% for small/massive, 70% for medium, 60% for big)
- Combined audio has perfect timing because explosion is in the file
- Callback audio uses visual explosion trigger, not calculated timing

**Sounds too loud or too quiet:**
- Per-file volume multipliers are applied automatically
- Check volume constants in AudioManager class
- Adjust multipliers in AUDIO_VOLUME_MULTIPLIERS map

**Too much repetition:**
- System uses randomization within tier
- Multiple combined audio files per tier
- Callback combinations provide additional variety

**No sound playing:**
- Check browser console for audio loading messages
- Ensure audio files are in the `audio/` directory
- Check if audio is enabled in settings
- User interaction may be required to start AudioContext
- **`explosion_huge.mp3`** (~5.9s) - Huge dramatic explosion

### Crackling Sounds (Atmospheric Layers)
These crackling sounds layer over fireworks for added atmospheric depth:

- **`crackling.mp3`** (~10.2s) - Long crackling effect
- **`crackling2.mp3`** (~5.9s) - Medium crackling effect

Used for: **Big** (40-50% chance) and **Massive** (60-70% chance) fireworks, plays with explosion for dramatic effect.

## 🎯 Tier-Based Audio Selection

The system calculates rocket flight time and selects the best audio strategy:

| Tier | Flight Time | Primary Strategy | Secondary Strategy | Crackling |
|------|-------------|------------------|-------------------|-----------|
| **Small** | 1.0-1.5s | 60% Combined tiny-bang | 40% Layered (launch+explosion) | No |
| **Medium** | 2.0-3.0s | 40% Combined normal-bang | 60% Layered (smooth+explosion) | No |
| **Big** | 3.0-4.5s | 35% Combined crackling-bang | 65% Layered (whistle+big explosion) | 40-50% |
| **Massive** | 4.0-5.5s | 50% Combined crackling-bang | 50% Layered (whistle+huge) | 60-70% |
| **Combo 5+** | Varies | Combined if matches | Layered for sync | Rare |
| **Combo 8+** | 0s | Explosion only | Instant | No |

### Example Audio Combinations

**Small Firework (1.2s flight):**
- Combined: `woosh_tiny-bang.mp3` (explosion at 1.0s) ✓ Good match
- Layered: `abschussgeraeusch.mp3` → 1.2s delay → `explosion_small1.mp3` ✓ Perfect sync

**Medium Firework (3.0s flight):**
- Combined: `woosh_normal-bang.mp3` (explosion at 3.3s) ✓ Close match
- Layered: `woosh_nocrackling_no-bang.mp3` → 3.0s delay → `explosion_medium.mp3` ✓ Perfect sync

**Big Firework (4.5s flight):**
- Combined: `woosh_crackling_bang.mp3` (explosion at 4.8s) ✓ Close match
- Layered: `launch-whistle` → 4.5s delay → `explosion_big.mp3` + `crackling2.mp3` ✓ Perfect sync + effects

**Massive Firework (5.0s flight):**
- Combined: `woosh_crackling_bang.mp3` (explosion at 4.8s) ✓ Good match
- Layered: `launch-whistle` → 5.0s delay → `explosion_huge.mp3` + `crackling.mp3` ✓ Perfect sync + heavy effects

## 🔧 Technical Details - Three Synchronization Methods

### Method 1: Combined Audio (Pre-Synchronized)
```javascript
// Play woosh+explosion file immediately
audioManager.play('combined-whistle-normal', COMBINED_AUDIO_VOLUME);
// Explosion is at 3.3s in the audio file
// Used when rocket flight time ≈ 3.0-3.5s
```

**Advantages:**
- Authentic woosh-to-explosion transition
- Natural sound progression
- Lower complexity

**Requirements:**
- Rocket flight time must match explosion timing in audio
- System selects combined audio only when flight time is within ±0.3s of explosion timing

### Method 2: Layered Audio (Timed Overlapping)
```javascript
// 1. Launch plays immediately
audioManager.play('launch-whistle', LAUNCH_AUDIO_VOLUME);

// 2. Explosion scheduled at calculated flight time
audioManager.playDelayed('explosion-big', flightTime, EXPLOSION_VOLUME);

// 3. Crackling added at explosion time
audioManager.playDelayed('crackling-medium', flightTime, CRACKLING_VOLUME);
```

**Advantages:**
- **Perfect synchronization** - explosion timed to exact rocket flight duration
- Maximum flexibility - can combine any sounds
- Crackling can be added/removed independently

**How it works:**
- Calculates rocket flight time from physics (velocity, acceleration, target height)
- Plays launch sound immediately
- Schedules explosion via `playDelayed()` to trigger exactly when visual explodes
- Optional crackling layers at explosion time

### Method 3: Callback Audio (Visual-Triggered)

1. **Combined audio files** contain both launch and explosion
2. Explosion timing is **baked into the audio file**:
   - Tiny explosions: explosion at ~1.2s mark in audio
   - Normal explosions: explosion at ~2.2s mark in audio  
   - Big explosions (crackling): explosion at ~3.2s mark in audio
3. Visual rocket is timed to match these audio explosion points

### Method 2: Callback-Synchronized Separate Audio
For separate launch + explosion combinations:

1. **Launch sound plays** immediately when rocket starts
2. **Visual rocket flies** until it reaches peak or target
3. **Visual explosion triggers** when rocket should explode
4. **Explosion sound plays** via `onExplodeSound` callback at exact moment of visual explosion
5. **Result**: Perfect synchronization regardless of rocket flight duration

### Method 3: Layered Crackling Effects
Optional atmospheric enhancement:

1. Crackling sounds can layer over combined or separate audio
2. Plays simultaneously with explosion (not independently timed)
3. Adds depth and drama without affecting core synchronization
4. Used for 30-40% of Big/Massive fireworks

### Volume Levels
- Launch sounds: 0.4 volume
- Combined audio: 0.6 volume
- Explosion sounds: 0.6 volume (scaled by intensity)
- Crackling sounds: 0.3 volume (layered effect, quieter)
- Instant explosions: 0.2 volume (quieter for rapid combos)

## 🎨 Customization

To customize audio behavior, edit the `selectAudio()` method in `gpu/engine.js`:

```javascript
// Example: Always use crackling bang for big fireworks
case 'big':
    return {
        useCombinedAudio: true,
        combinedSound: 'combined-crackling-bang',
        explosionDelay: 3.2
    };
```

## 🔄 Adding New Audio Files

1. Place MP3 file in this directory
2. Add preload in `gpu/engine.js`:
   ```javascript
   await engine.audioManager.preload('/plugins/fireworks/audio/yourfile.mp3', 'your-name');
   ```
3. Update `selectAudio()` method to use the new audio
4. Document timing if it's a combined audio file
5. Ensure audio files don't contain internal repetition or excessive reverb

**⚠️ Audio Quality Guidelines:**
- Explosion sounds should be clean, single-burst effects
- Avoid files with internal repetition or looping
- Reverb/echo should be minimal to prevent perceived repetition
- Test audio files before integration to ensure they match expected duration

## 🐛 Troubleshooting

- **No sound?** Click anywhere on the overlay page to enable audio (browser requirement)
- **Wrong sounds?** Clear browser cache and reload the page
- **Audio too loud/quiet?** Adjust volume in the plugin settings UI
- **Sounds out of sync?** Check explosion timing values in `selectAudio()` method
- **Missing audio?** Check browser console for loading errors
- **Crackling lasts too long?** Crackling now uses automatic fade-out (1.2-2.0s + 0.5-0.8s fade)
- **Sound seems to repeat?** Check if audio file contains internal repetition or heavy reverb/echo - audio files should contain single, clean effects without looping
- **Combined audio not playing?** The system currently uses callback-based audio exclusively for perfect synchronization. Combined audio files are preloaded but not actively used in the current implementation.
