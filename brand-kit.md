# ltth.app Brand Kit & Style Guide

> **Version:** 2.0  
> **Last Updated:** November 2024  
> **Author:** Loggableim

---

## 🎨 Brand Overview

**PupCid's Little TikTool Helper (ltth.app)** is a professional TikTok LIVE streaming solution. Our brand identity reflects **modernity, friendliness, technical excellence, and accessibility**.

### Brand Values
- **Professional** - Reliable, high-quality streaming tools
- **Friendly** - Approachable, community-driven
- **Modern** - Cutting-edge features and design
- **Accessible** - Inclusive, barrier-free experience
- **Open** - Transparent, open-source philosophy

---

## 🎨 Color Palette

### Primary Colors

```css
/* Brand Green - Primary */
--color-primary: #12a116;           /* Main branding green */
--color-primary-light: #19c724;     /* Lighter accent green */
--color-primary-hover: #42ff73;     /* Neon green for hover states */
--color-primary-dark: #0d7a10;      /* Darker green for depth */
--color-primary-alpha-10: rgba(18, 161, 22, 0.1);
--color-primary-alpha-20: rgba(18, 161, 22, 0.2);
```

**Usage:**
- CTAs, buttons, links
- Navigation highlights
- Success states
- Brand elements
- Interactive elements

### Secondary Colors (Harmonious Palette)

```css
/* Complementary Colors */
--color-complementary: #6412a1;      /* Purple for visual balance */
--color-complementary-alt: #7a1cd6;  /* Alternative purple accent */
--color-analogous-1: #12a170;        /* Teal-green */
--color-analogous-2: #a19c12;        /* Yellow-green */
```

**Usage:**
- Visual accents
- Gradient combinations
- Feature highlights
- Visual hierarchy

### Neutral Colors

#### Light Mode
```css
--color-bg-light: #f5f7f4;          /* Off-white background */
--color-surface-light: #ffffff;      /* Pure white surface */
--color-text-light: #0e0f10;        /* Deep anthracite text */
--color-text-secondary-light: #4a4b4d;
--color-border-light: #e0e2df;
--color-shadow-light: rgba(0, 0, 0, 0.1);
```

#### Dark Mode
```css
--color-bg-dark: #0e0f10;           /* Deep anthracite background */
--color-bg-dark-alt: #111213;       /* Alternative dark background */
--color-surface-dark: #1a1b1d;      /* Dark surface */
--color-text-dark: #f5f7f4;         /* Off-white text */
--color-text-secondary-dark: #b5b7b4;
--color-border-dark: #2a2b2d;
--color-shadow-dark: rgba(0, 0, 0, 0.3);
```

#### Monochrome Mode (Accessibility)
```css
--color-bg-mono: #ffffff;
--color-surface-mono: #f8f8f8;
--color-text-mono: #000000;
--color-text-secondary-mono: #666666;
--color-border-mono: #cccccc;
```

### Semantic Colors

```css
/* Status Colors */
--color-success: #12a116;           /* Success green */
--color-warning: #ffa726;           /* Warning orange */
--color-error: #ef5350;             /* Error red */
--color-info: #29b6f6;              /* Info blue */

/* Additional States */
--color-success-light: #42ff73;
--color-warning-light: #ffb74d;
--color-error-light: #ff7473;
--color-info-light: #4fc3f7;
```

### Gradient Combinations

```css
/* Primary Gradient */
background: linear-gradient(135deg, #12a116 0%, #19c724 100%);

/* Success Gradient */
background: linear-gradient(135deg, #12a116 0%, #42ff73 100%);

/* Hero Gradient */
background: linear-gradient(135deg, var(--color-bg) 0%, rgba(18, 161, 22, 0.05) 100%);

/* Complementary Gradient */
background: linear-gradient(135deg, #12a116 0%, #6412a1 100%);

/* Neon Glow */
background: linear-gradient(135deg, #42ff73 0%, #19c724 100%);
```

---

## 🔤 Typography

### Font Families

```css
/* Display/Headline Font */
--font-display: 'Inter', 'SF Pro Display', -apple-system, sans-serif;

/* Body/UI Font */
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;

/* Monospace/Code Font */
--font-mono: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Droid Sans Mono', 'Source Code Pro', monospace;
```

### Font Sizes (Fluid Typography)

```css
/* Base Scale */
--text-xs: 0.75rem;      /* 12px */
--text-sm: 0.875rem;     /* 14px */
--text-base: 1rem;       /* 16px */
--text-lg: 1.125rem;     /* 18px */
--text-xl: 1.25rem;      /* 20px */
--text-2xl: 1.5rem;      /* 24px */
--text-3xl: 1.875rem;    /* 30px */
--text-4xl: 2.25rem;     /* 36px */
--text-5xl: 3rem;        /* 48px */
--text-6xl: 3.75rem;     /* 60px */
--text-7xl: 4.5rem;      /* 72px */

/* Mobile Adjustments (< 768px) */
@media (max-width: 767px) {
  --text-5xl: 2.5rem;    /* 40px */
  --text-4xl: 2rem;      /* 32px */
  --text-3xl: 1.75rem;   /* 28px */
}
```

### Font Weights

```css
--font-light: 300;
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
--font-extrabold: 800;
--font-black: 900;
```

### Line Heights

```css
--leading-none: 1;
--leading-tight: 1.2;
--leading-normal: 1.5;
--leading-relaxed: 1.6;
--leading-loose: 2;
```

### Typography Usage

**Headlines (H1-H6)**
- Font: `var(--font-display)`
- Weight: `700` (Bold)
- Line Height: `1.2`
- Color: `var(--color-text)`

**Body Text**
- Font: `var(--font-sans)`
- Weight: `400` (Normal)
- Line Height: `1.6`
- Color: `var(--color-text)`

**UI Elements**
- Font: `var(--font-sans)`
- Weight: `500-600` (Medium-Semibold)
- Color: `var(--color-text)`

**Code Blocks**
- Font: `var(--font-mono)`
- Background: `var(--color-surface)`
- Border: `1px solid var(--color-border)`

---

## 📐 Spacing System

```css
/* Base Spacing Scale (rem-based) */
--space-1: 0.25rem;      /* 4px */
--space-2: 0.5rem;       /* 8px */
--space-3: 0.75rem;      /* 12px */
--space-4: 1rem;         /* 16px */
--space-5: 1.25rem;      /* 20px */
--space-6: 1.5rem;       /* 24px */
--space-8: 2rem;         /* 32px */
--space-10: 2.5rem;      /* 40px */
--space-12: 3rem;        /* 48px */
--space-16: 4rem;        /* 64px */
--space-20: 5rem;        /* 80px */
--space-24: 6rem;        /* 96px */
--space-32: 8rem;        /* 128px */
```

---

## 🎭 Border Radius

```css
--radius-none: 0;
--radius-sm: 0.25rem;    /* 4px */
--radius-md: 0.5rem;     /* 8px */
--radius-lg: 0.75rem;    /* 12px */
--radius-xl: 1rem;       /* 16px */
--radius-2xl: 1.5rem;    /* 24px */
--radius-3xl: 2rem;      /* 32px */
--radius-full: 9999px;   /* Fully rounded */
```

---

## 🌑 Shadows & Depth

```css
/* Elevation System */
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
--shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);

/* Special Effects */
--shadow-glow: 0 0 20px rgba(18, 161, 22, 0.3);
--shadow-glow-strong: 0 0 40px rgba(18, 161, 22, 0.5);
--shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);
```

---

## ⚡ Transitions & Animations

```css
/* Timing Functions */
--ease-linear: linear;
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);

/* Durations */
--transition-fast: 150ms;
--transition-base: 250ms;
--transition-slow: 350ms;
--transition-slower: 500ms;

/* Standard Transitions */
--transition-all: all var(--transition-base) var(--ease-in-out);
--transition-colors: background-color var(--transition-base) var(--ease-in-out), 
                     color var(--transition-base) var(--ease-in-out);
--transition-transform: transform var(--transition-base) var(--ease-out);
```

### Animation Guidelines
- **Hover Effects**: 150-250ms
- **Modal/Drawer**: 250-350ms
- **Page Transitions**: 350-500ms
- **Target FPS**: 120 FPS (use CSS transforms, opacity)
- **Avoid**: Animating width, height, top, left (use transforms instead)

---

## 🖼️ Logo & Brand Assets

### Logo Specifications

**Primary Logo**
- File: `ltthicon.png`, `ltthicon.svg`
- Minimum Size: 32x32px
- Clear Space: 8px on all sides
- Usage: Headers, navigation, favicons

**Mascot (PupCid)**
- Files: 
  - `ltthmascot.png` - Default mascot
  - `winken.png` - Waving mascot
  - `zwinkern.png` - Winking mascot
- Usage: Hero sections, CTAs, emotional touchpoints

### Mascot Sprite Sheet

**File**: `mascot-sprite.png`

```css
/* Sprite Positions */
.mascot-default {
  background-position: 0 0;
}

.mascot-waving {
  background-position: -200px 0;
}

.mascot-winking {
  background-position: -400px 0;
}

.mascot-happy {
  background-position: -600px 0;
}

.mascot-excited {
  background-position: -800px 0;
}

.mascot-thinking {
  background-position: -1000px 0;
}

/* Base Sprite Class */
.mascot-sprite {
  width: 200px;
  height: 200px;
  background-image: url('/assets/mascot-sprite.png');
  background-repeat: no-repeat;
  background-size: 1200px 200px;
  display: inline-block;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}
```

**Sprite Usage Example:**
```html
<div class="mascot-sprite mascot-waving"></div>
```

---

## 🎯 Component Styles

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: var(--color-primary);
  color: white;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-weight: 600;
  transition: var(--transition-all);
  box-shadow: var(--shadow-md);
}

.btn-primary:hover {
  background: var(--color-primary-dark);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: var(--color-text);
  border: 2px solid var(--color-border);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-weight: 600;
  transition: var(--transition-all);
}

.btn-secondary:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-alpha-10);
}
```

### Cards

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  transition: var(--transition-all);
  box-shadow: var(--shadow-md);
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-xl);
  border-color: var(--color-primary);
}
```

---

## ♿ Accessibility Guidelines

### Color Contrast
- **Normal Text**: Minimum 4.5:1 contrast ratio
- **Large Text**: Minimum 3:1 contrast ratio
- **Interactive Elements**: Minimum 3:1 contrast ratio

### Focus States
```css
*:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

*:focus:not(:focus-visible) {
  outline: none;
}

*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### Screen Reader Support
- Always use semantic HTML
- Provide `aria-label` for icon-only buttons
- Use `sr-only` class for visually hidden but accessible text
- Maintain proper heading hierarchy (h1 → h2 → h3)

### Monochrome Mode
For users with color blindness or low vision:
```css
[data-theme="monochrome"] {
  --color-primary: #000000;
  --color-text: #000000;
  --color-bg: #ffffff;
  /* High contrast, grayscale only */
}
```

---

## 📱 Responsive Breakpoints

```css
/* Mobile First Approach */
/* Extra Small: < 576px (default) */
/* Small: 576px - 767px */
@media (min-width: 576px) { ... }

/* Medium: 768px - 991px */
@media (min-width: 768px) { ... }

/* Large: 992px - 1199px */
@media (min-width: 992px) { ... }

/* Extra Large: 1200px - 1399px */
@media (min-width: 1200px) { ... }

/* 2X Large: >= 1400px */
@media (min-width: 1400px) { ... }
```

---

## 🎬 Animation Library

### Keyframe Animations

```css
/* Fade In */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Float (Mascot) */
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-20px); }
}

/* Wave (Mascot) */
@keyframes wave {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-10deg); }
  75% { transform: rotate(10deg); }
}

/* Pulse */
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

/* Shimmer */
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* Heartbeat */
@keyframes heartbeat {
  0%, 100% { transform: scale(1); }
  10%, 30% { transform: scale(1.1); }
  20%, 40% { transform: scale(1); }
}
```

---

## 📊 Usage Examples

### Hero Section
- **Background**: Light gradient with primary color
- **Title**: `var(--text-5xl)` or `var(--text-6xl)`
- **Mascot**: Floating animation
- **CTA**: Primary button with hover effects

### Feature Cards
- **Layout**: CSS Grid, 3 columns on desktop
- **Hover**: Lift effect (`translateY(-4px)`)
- **Icons**: Primary gradient background
- **Text**: Readable contrast

### Navigation
- **Desktop**: Horizontal, sticky header
- **Mobile**: Burger menu, slide-in drawer
- **Active State**: Primary color highlight
- **Theme Toggle**: Sun/Moon icons

---

## 🚀 Performance Guidelines

### CSS
- Use CSS Custom Properties
- Minimize specificity
- Avoid `!important`
- Use CSS Grid and Flexbox
- Prefer transforms over position changes

### JavaScript
- Vanilla JS (no heavy frameworks)
- Use event delegation
- Debounce scroll/resize events
- Lazy load images
- Intersection Observer for animations

### Images
- Use WebP with fallbacks
- Optimize PNGs with compression
- Use SVG for icons and logos
- Implement responsive images
- Lazy load below-the-fold images

---

## 📝 File Naming Conventions

### General
- Lowercase with hyphens: `hero-section.css`
- Descriptive names: `feature-card-grid.js`

### Images
- PNG: `logo-primary.png`, `mascot-waving.png`
- SVG: `icon-download.svg`, `logo.svg`
- WebP: `hero-background.webp`

### CSS
- `main.css` - Core styles
- `utilities.css` - Utility classes
- `components.css` - Reusable components
- `pages.css` - Page-specific styles

---

## ✅ Brand Checklist

- [ ] Use primary green (#12a116) for CTAs
- [ ] Maintain 4.5:1 contrast for text
- [ ] Include mascot in hero/CTA sections
- [ ] Support dark/light modes
- [ ] Use consistent spacing scale
- [ ] Apply hover effects to interactive elements
- [ ] Ensure mobile responsiveness
- [ ] Test accessibility with screen readers
- [ ] Optimize for 120 FPS animations
- [ ] Use semantic HTML5

---

## 📞 Contact & Support

**Repository**: https://github.com/Loggableim/ltth.app  
**Issues**: https://github.com/Loggableim/ltth.app/issues  
**Website**: https://ltth.app

---

*This brand kit is a living document. Updates and improvements are welcome via pull requests.*
