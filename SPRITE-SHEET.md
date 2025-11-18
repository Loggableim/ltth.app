# Mascot Sprite Sheet Documentation

## Overview

The mascot sprite sheet system provides an efficient way to display multiple poses of the PupCid mascot using a single image file with CSS positioning.

## File Location

**Sprite Sheet Image**: `/assets/mascot-sprite.png`

## Sprite Sheet Structure

The sprite sheet contains 6 different mascot poses arranged horizontally:

```
[ Default | Waving | Winking | Happy | Excited | Thinking ]
  0-199px   200-399  400-599  600-799  800-999  1000-1199
```

### Dimensions
- **Individual Sprite Size**: 200x200px
- **Total Sprite Sheet Size**: 1200x200px
- **Format**: PNG with transparency
- **Optimization**: Optimized for web with compression

## CSS Implementation

### Base Sprite Class

```css
.mascot-sprite {
    width: 200px;
    height: 200px;
    background-image: url('/assets/mascot-sprite.png');
    background-repeat: no-repeat;
    background-size: 1200px 200px;
    display: inline-block;
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
    transition: background-position 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Sprite Position Classes

```css
/* Default Pose - Neutral standing */
.mascot-default {
    background-position: 0 0;
}

/* Waving Pose - Friendly greeting */
.mascot-waving {
    background-position: -200px 0;
}

/* Winking Pose - Playful expression */
.mascot-winking {
    background-position: -400px 0;
}

/* Happy Pose - Excited/joyful */
.mascot-happy {
    background-position: -600px 0;
}

/* Excited Pose - Very energetic */
.mascot-excited {
    background-position: -800px 0;
}

/* Thinking Pose - Contemplative */
.mascot-thinking {
    background-position: -1000px 0;
}
```

### Hover Effects

```css
.mascot-sprite:hover {
    transform: scale(1.05);
    filter: drop-shadow(0 10px 20px rgba(18, 161, 22, 0.2));
}
```

## HTML Usage

### Basic Usage

```html
<!-- Default pose -->
<div class="mascot-sprite mascot-default"></div>

<!-- Waving pose -->
<div class="mascot-sprite mascot-waving"></div>

<!-- Winking pose -->
<div class="mascot-sprite mascot-winking"></div>
```

### Responsive Sizing

```html
<!-- Small size (100x100) -->
<div class="mascot-sprite mascot-waving" style="width: 100px; height: 100px; background-size: 600px 100px;"></div>

<!-- Large size (300x300) -->
<div class="mascot-sprite mascot-happy" style="width: 300px; height: 300px; background-size: 1800px 300px;"></div>
```

### With Animation

```html
<!-- Animated mascot that cycles through poses -->
<div class="mascot-sprite mascot-default animate-mascot"></div>

<style>
@keyframes mascot-cycle {
    0% { background-position: 0 0; }
    20% { background-position: -200px 0; }
    40% { background-position: -400px 0; }
    60% { background-position: -600px 0; }
    80% { background-position: -800px 0; }
    100% { background-position: -1000px 0; }
}

.animate-mascot {
    animation: mascot-cycle 3s steps(1) infinite;
}
</style>
```

## JavaScript Control

### Dynamic Pose Switching

```javascript
class MascotController {
    constructor(element) {
        this.element = element;
        this.poses = ['default', 'waving', 'winking', 'happy', 'excited', 'thinking'];
        this.currentPose = 0;
    }

    setPose(pose) {
        // Remove all pose classes
        this.poses.forEach(p => {
            this.element.classList.remove(`mascot-${p}`);
        });
        
        // Add new pose class
        this.element.classList.add(`mascot-${pose}`);
    }

    nextPose() {
        this.currentPose = (this.currentPose + 1) % this.poses.length;
        this.setPose(this.poses[this.currentPose]);
    }

    randomPose() {
        const randomIndex = Math.floor(Math.random() * this.poses.length);
        this.setPose(this.poses[randomIndex]);
    }
}

// Usage
const mascot = document.querySelector('.mascot-sprite');
const controller = new MascotController(mascot);

// Change pose every 2 seconds
setInterval(() => {
    controller.nextPose();
}, 2000);
```

### Event-Based Pose Changes

```javascript
// Show excited mascot on successful action
function showSuccess() {
    const mascot = document.querySelector('.mascot-sprite');
    mascot.classList.remove('mascot-default');
    mascot.classList.add('mascot-excited');
    
    // Return to default after 2 seconds
    setTimeout(() => {
        mascot.classList.remove('mascot-excited');
        mascot.classList.add('mascot-default');
    }, 2000);
}

// Show thinking mascot during loading
function showLoading() {
    const mascot = document.querySelector('.mascot-sprite');
    mascot.classList.add('mascot-thinking');
}

// Show waving mascot on page load
document.addEventListener('DOMContentLoaded', () => {
    const mascot = document.querySelector('.mascot-sprite');
    mascot.classList.add('mascot-waving');
    
    setTimeout(() => {
        mascot.classList.remove('mascot-waving');
        mascot.classList.add('mascot-default');
    }, 3000);
});
```

## Use Cases

### 1. Hero Section
```html
<section class="hero">
    <div class="hero-content">
        <h1>Welcome to ltth.app</h1>
        <p>Your TikTok LIVE streaming companion</p>
    </div>
    <div class="mascot-sprite mascot-waving"></div>
</section>
```

### 2. Call-to-Action Section
```html
<section class="cta">
    <div class="mascot-sprite mascot-excited"></div>
    <h2>Ready to start streaming?</h2>
    <button>Download Now</button>
</section>
```

### 3. Loading States
```html
<div class="loading-container">
    <div class="mascot-sprite mascot-thinking"></div>
    <p>Loading...</p>
</div>
```

### 4. Error States
```html
<div class="error-container">
    <div class="mascot-sprite mascot-default"></div>
    <p>Oops! Something went wrong.</p>
</div>
```

### 5. Success Messages
```html
<div class="success-container">
    <div class="mascot-sprite mascot-happy"></div>
    <p>Successfully saved!</p>
</div>
```

## Pose Descriptions

### 1. Default (0px)
- **Emotion**: Neutral, friendly
- **Use**: Default state, general content
- **Expression**: Calm, welcoming

### 2. Waving (-200px)
- **Emotion**: Greeting, friendly
- **Use**: Hero sections, welcome messages, greetings
- **Expression**: Arm raised in wave, smiling

### 3. Winking (-400px)
- **Emotion**: Playful, knowing
- **Use**: Tips, hints, special features
- **Expression**: One eye closed, slight smile

### 4. Happy (-600px)
- **Emotion**: Joyful, satisfied
- **Use**: Success messages, achievements, positive feedback
- **Expression**: Big smile, cheerful

### 5. Excited (-800px)
- **Emotion**: Very enthusiastic, energetic
- **Use**: CTAs, downloads, major announcements
- **Expression**: Wide eyes, big smile, energetic pose

### 6. Thinking (-1000px)
- **Emotion**: Contemplative, processing
- **Use**: Loading states, complex operations, FAQs
- **Expression**: Hand on chin, thoughtful

## Performance Optimization

### Image Optimization
```bash
# Optimize PNG with pngquant
pngquant --quality=65-80 mascot-sprite.png -o mascot-sprite-optimized.png

# Or use ImageMagick
convert mascot-sprite.png -strip -quality 85 mascot-sprite-optimized.png
```

### WebP Support
```html
<picture>
    <source type="image/webp" srcset="/assets/mascot-sprite.webp">
    <img src="/assets/mascot-sprite.png" alt="PupCid mascot" class="mascot-sprite mascot-waving">
</picture>
```

### Lazy Loading
```html
<div class="mascot-sprite mascot-default" loading="lazy"></div>
```

## Accessibility

### Alternative Text
```html
<div class="mascot-sprite mascot-waving" 
     role="img" 
     aria-label="PupCid mascot waving hello"></div>
```

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
    .mascot-sprite {
        transition: none;
        animation: none !important;
    }
    
    .mascot-sprite:hover {
        transform: none;
    }
}
```

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Opera 76+
- ⚠️ IE 11 (with fallback)

## Troubleshooting

### Issue: Sprite appears blurry
**Solution**: Ensure `image-rendering` is set correctly
```css
.mascot-sprite {
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
}
```

### Issue: Wrong sprite showing
**Solution**: Check background-position calculation
```css
/* Position formula: -(sprite_index * sprite_width) 0 */
/* Example for 3rd sprite (index 2): */
background-position: -400px 0; /* -(2 * 200px) */
```

### Issue: Sprite doesn't scale properly
**Solution**: Adjust background-size proportionally
```css
/* For 150x150 display size: */
.mascot-sprite-medium {
    width: 150px;
    height: 150px;
    background-size: 900px 150px; /* 1200px * 0.75 = 900px */
}
```

## Future Enhancements

- [ ] Add animated sprite sequences (walking, dancing)
- [ ] Create seasonal variants (holiday themes)
- [ ] Add more emotional states (sad, surprised, angry)
- [ ] Generate retina (@2x) versions
- [ ] Create SVG version for infinite scaling
- [ ] Add WebP and AVIF formats

## Credits

**Mascot Design**: PupCid  
**Created for**: ltth.app  
**License**: Proprietary - ltth.app branding

---

*Last Updated: November 2024*  
*Version: 2.0.0*
