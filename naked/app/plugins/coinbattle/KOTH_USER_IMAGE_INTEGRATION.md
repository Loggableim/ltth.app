# King of the Hill Pyramid Mode - User Image Integration

## Overview
Enhanced the King of the Hill (KOTH) pyramid mode in the CoinBattle plugin with improved user image integration and visual design.

## Features Implemented

### 1. **Enhanced Visual Pyramid Structure**
- Clear visual hierarchy with King at top and 3 challengers below
- Pyramid-shaped layout with proper sizing and spacing
- Animated header with "👑 KING OF THE HILL" title

### 2. **Prominent User Profile Pictures**
- **King (1st Place)**: 100px circular avatar with gold border
- **Challengers (#2-4)**: 60px circular avatars with semi-transparent borders
- Automatic fallback to generated avatars for users without profile pictures
- Lazy loading and error handling for all images

### 3. **Fallback Avatar System**
- Generated avatars using Canvas API
- Shows user's first initial on colored background
- Color generated from username hash for consistency
- Seamless fallback when profile pictures fail to load

### 4. **Visual Enhancements**

#### King Section
- Gold gradient background with glowing animation
- 3D crown emoji with bounce animation
- Large 100px profile picture with gold border and glow effect
- Username in gold with shadow effects
- Coin count in large, prominent text
- Hover effect: Avatar scales up to 110%

#### Challengers Section
- Rank-based colored left borders:
  - #2: Silver (#c0c0c0)
  - #3: Bronze (#cd7f32)
  - #4: Purple (#667eea)
- 60px profile pictures with semi-transparent borders
- Username and coin count clearly displayed
- Hover effects: 
  - Slide left animation
  - Avatar scales up to 115%
  - Border becomes more opaque

### 5. **Animations**
- **King Glow**: Pulsing shadow effect (2s cycle)
- **Crown Bounce**: Vertical bounce animation (2s cycle)
- **Title Pulse**: Text shadow pulsing effect (3s cycle)
- **Hover Interactions**: Smooth scale and transform effects

## Technical Implementation

### Files Modified
1. **overlay.html**: Added KOTH header structure
2. **overlay.js**: Enhanced avatar handling with fallback system
3. **styles.css**: Complete visual redesign with animations

### Key Functions

#### `createAvatar(user, className, size)`
Creates an avatar element with fallback support:
- Attempts to load user's profile picture
- Falls back to generated avatar on error
- Uses avatar caching for performance
- Supports lazy loading

#### `createDefaultAvatar(name, size)`
Generates a canvas-based avatar:
- Extracts first initial from username
- Generates consistent color from username hash
- Creates circular avatar with initial centered
- Returns data URL for img src

### CSS Classes

#### King Styles
- `.koth-header`: Title container
- `.koth-title`: Animated title text
- `.koth-king`: King container with gold styling
- `.koth-king-crown`: Animated crown emoji
- `.koth-king-avatar`: Large profile picture (100px)
- `.koth-king-name`: Gold username text
- `.koth-king-coins`: Coin count display

#### Challenger Styles
- `.koth-challengers`: Challenger list container
- `.koth-challenger`: Individual challenger card
- `.koth-challenger-rank`: Rank number (#2, #3, #4)
- `.koth-challenger-avatar`: Profile picture (60px)
- `.koth-challenger-info`: Name and coins container
- `.koth-challenger-name`: Username text
- `.koth-challenger-coins`: Coin count

## Usage

### Enable KOTH Mode
Add the `kothMode=true` parameter to the overlay URL:

```
/plugins/coinbattle/overlay?kothMode=true&theme=dark
```

### Full URL Examples

**Standard KOTH with Dark Theme:**
```
http://localhost:3000/plugins/coinbattle/overlay?kothMode=true&theme=dark
```

**KOTH with Custom Skin:**
```
http://localhost:3000/plugins/coinbattle/overlay?kothMode=true&theme=dark&skin=neon
```

### OBS Integration
1. Add a Browser Source in OBS
2. Set URL to the KOTH overlay with `kothMode=true`
3. Set dimensions to 1920x1080
4. Enable "Shutdown source when not visible" for performance

## Visual Preview

### Structure
```
┌─────────────────────────────────┐
│   👑 KING OF THE HILL          │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│          👑                     │
│      [Avatar 100px]             │
│      KingPlayer123              │
│      15,432 🪙                 │
└─────────────────────────────────┘
         ▼ KING ▼

┌─────────────────────────────────┐
│ #2  [Avatar]  SilverRunner      │
│               12,345 🪙         │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ #3  [Avatar]  BronzeHero        │
│               8,765 🪙          │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ #4  [Avatar]  RisingStar        │
│               5,432 🪙          │
└─────────────────────────────────┘
```

## Performance Considerations

1. **Avatar Caching**: Profile pictures are cached to reduce network requests
2. **Lazy Loading**: Images load only when needed
3. **Canvas Fallbacks**: Generated avatars are lightweight data URLs
4. **CSS Animations**: Hardware-accelerated transforms and opacity
5. **Efficient DOM Updates**: Only updates changed elements

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- OBS Browser: Full support

## Future Enhancements (Not Implemented)

- Multi-level pyramid (5+ levels)
- King duration timer
- Bonus points indicator
- Crown transfer animation
- King history tracking

## Troubleshooting

### Avatars Not Showing
- Check network connection
- Verify profile_picture_url is valid
- Fallback avatars should still appear

### Animations Not Working
- Ensure browser supports CSS animations
- Check if hardware acceleration is enabled
- Verify no conflicting CSS rules

### Performance Issues
- Reduce number of concurrent overlays
- Enable "Shutdown source when not visible" in OBS
- Check CPU/GPU usage

## Credits

- **Plugin**: CoinBattle - PupCid's Little TikTool Helper
- **Author**: Pup Cid
- **Enhancement**: King of the Hill Pyramid Mode with User Image Integration

## Version History

- **v1.1.0** (2024-12-14): Enhanced KOTH pyramid mode with user image integration
  - Added fallback avatar system
  - Improved visual design with animations
  - Enhanced user experience with hover effects
  - Added comprehensive documentation

- **v1.0.0** (2024-12-13): Initial KOTH implementation
  - Basic pyramid structure
  - Profile picture support
  - Rank display
