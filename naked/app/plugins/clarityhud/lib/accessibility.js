/**
 * Accessibility Manager for ClarityHUD
 *
 * Provides comprehensive accessibility features including contrast modes,
 * colorblind-safe palettes, dyslexia fonts, and motion preferences.
 */

class AccessibilityManager {
  constructor(container) {
    this.container = container;
    this.settings = {
      mode: 'day',
      highContrast: false,
      colorblindSafe: false,
      visionImpaired: false,
      reduceMotion: false,
      dyslexiaFont: false
    };
    this.styleElement = null;
    this.initializeStyles();
    this.detectSystemPreferences();
  }

  /**
   * Initialize custom styles
   */
  initializeStyles() {
    if (typeof document === 'undefined') return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'clarityhud-accessibility-styles';
    document.head.appendChild(this.styleElement);
  }

  /**
   * Detect system preferences
   */
  detectSystemPreferences() {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    // Detect dark mode preference
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    if (darkModeQuery.matches) {
      this.settings.mode = 'night';
    }

    // Detect reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) {
      this.settings.reduceMotion = true;
    }

    // Detect high contrast preference
    const contrastQuery = window.matchMedia('(prefers-contrast: high)');
    if (contrastQuery.matches) {
      this.settings.highContrast = true;
    }
  }

  /**
   * Apply day/night mode
   */
  applyMode(mode) {
    this.settings.mode = mode;
    this.updateStyles();
    return this;
  }

  /**
   * Apply high contrast mode
   */
  applyHighContrast(enabled) {
    this.settings.highContrast = enabled;
    this.updateStyles();
    return this;
  }

  /**
   * Apply colorblind-safe colors
   */
  applyColorblindSafe(enabled) {
    this.settings.colorblindSafe = enabled;
    this.updateStyles();
    return this;
  }

  /**
   * Apply vision impaired enhancements
   */
  applyVisionImpaired(enabled) {
    this.settings.visionImpaired = enabled;
    this.updateStyles();
    return this;
  }

  /**
   * Apply reduced motion preference
   */
  applyReduceMotion(enabled) {
    this.settings.reduceMotion = enabled;
    this.updateStyles();
    return this;
  }

  /**
   * Apply dyslexia-friendly font
   */
  applyDyslexiaFont(enabled) {
    this.settings.dyslexiaFont = enabled;
    if (enabled) {
      this.loadDyslexiaFont();
    }
    this.updateStyles();
    return this;
  }

  /**
   * Load OpenDyslexic font dynamically
   */
  loadDyslexiaFont() {
    if (typeof document === 'undefined') return;

    // Check if font is already loaded
    if (document.getElementById('opendyslexic-font')) return;

    const link = document.createElement('link');
    link.id = 'opendyslexic-font';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/opendyslexic@3.0.1/opendyslexic-regular.css';
    document.head.appendChild(link);
  }

  /**
   * Apply a preset configuration
   */
  applyPreset(presetName) {
    const presets = {
      'default': {
        mode: 'day',
        highContrast: false,
        colorblindSafe: false,
        visionImpaired: false,
        reduceMotion: false,
        dyslexiaFont: false
      },
      'highContrast': {
        mode: 'day',
        highContrast: true,
        colorblindSafe: false,
        visionImpaired: true,
        reduceMotion: false,
        dyslexiaFont: false
      },
      'visionImpaired': {
        mode: 'day',
        highContrast: true,
        colorblindSafe: true,
        visionImpaired: true,
        reduceMotion: true,
        dyslexiaFont: false
      },
      'motionSensitive': {
        mode: 'day',
        highContrast: false,
        colorblindSafe: false,
        visionImpaired: false,
        reduceMotion: true,
        dyslexiaFont: false
      },
      'dyslexia': {
        mode: 'day',
        highContrast: false,
        colorblindSafe: false,
        visionImpaired: false,
        reduceMotion: false,
        dyslexiaFont: true
      }
    };

    const preset = presets[presetName];
    if (preset) {
      this.settings = { ...this.settings, ...preset };
      if (preset.dyslexiaFont) {
        this.loadDyslexiaFont();
      }
      this.updateStyles();
    } else {
      console.warn(`Preset "${presetName}" not found`);
    }

    return this;
  }

  /**
   * Get color scheme based on settings
   */
  getColorScheme() {
    const schemes = {
      // Standard day mode
      day_standard: {
        background: '#FFFFFF',
        surface: '#F5F5F5',
        text: '#000000',
        textSecondary: '#555555',
        border: '#CCCCCC',
        follow: '#FF6B9D',
        share: '#4A90E2',
        like: '#E74C3C',
        gift: '#9B59B6',
        comment: '#2ECC71'
      },
      // Standard night mode
      night_standard: {
        background: '#1A1A1A',
        surface: '#2D2D2D',
        text: '#FFFFFF',
        textSecondary: '#AAAAAA',
        border: '#444444',
        follow: '#FF6B9D',
        share: '#4A90E2',
        like: '#E74C3C',
        gift: '#9B59B6',
        comment: '#2ECC71'
      },
      // High contrast day mode
      day_highContrast: {
        background: '#FFFFFF',
        surface: '#F0F0F0',
        text: '#000000',
        textSecondary: '#000000',
        border: '#000000',
        follow: '#D60050',
        share: '#0066CC',
        like: '#CC0000',
        gift: '#7700AA',
        comment: '#008800'
      },
      // High contrast night mode
      night_highContrast: {
        background: '#000000',
        surface: '#1A1A1A',
        text: '#FFFFFF',
        textSecondary: '#FFFFFF',
        border: '#FFFFFF',
        follow: '#FF80B0',
        share: '#66B3FF',
        like: '#FF6666',
        gift: '#CC88EE',
        comment: '#66FF66'
      },
      // Colorblind-safe palette (protanopia/deuteranopia friendly)
      colorblindSafe: {
        follow: '#0173B2',    // Blue
        share: '#029E73',     // Teal
        like: '#D55E00',      // Orange
        gift: '#CC78BC',      // Pink
        comment: '#ECE133'    // Yellow
      }
    };

    const mode = this.settings.mode;
    const variant = this.settings.highContrast ? 'highContrast' : 'standard';
    const key = `${mode}_${variant}`;

    let colors = schemes[key] || schemes.day_standard;

    // Override with colorblind-safe colors if enabled
    if (this.settings.colorblindSafe) {
      colors = { ...colors, ...schemes.colorblindSafe };
    }

    return colors;
  }

  /**
   * Update CSS custom properties and styles
   */
  updateStyles() {
    if (!this.container || !this.styleElement) return;

    const colors = this.getColorScheme();

    // Set CSS custom properties on container
    this.container.style.setProperty('--clarity-bg', colors.background);
    this.container.style.setProperty('--clarity-surface', colors.surface);
    this.container.style.setProperty('--clarity-text', colors.text);
    this.container.style.setProperty('--clarity-text-secondary', colors.textSecondary);
    this.container.style.setProperty('--clarity-border', colors.border);
    this.container.style.setProperty('--clarity-follow', colors.follow);
    this.container.style.setProperty('--clarity-share', colors.share);
    this.container.style.setProperty('--clarity-like', colors.like);
    this.container.style.setProperty('--clarity-gift', colors.gift);
    this.container.style.setProperty('--clarity-comment', colors.comment);

    // Build comprehensive CSS rules
    const css = `
      #${this.container.id} {
        ${this.settings.dyslexiaFont ? 'font-family: "OpenDyslexic", sans-serif !important;' : ''}
        ${this.settings.visionImpaired ? `
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          font-size: 1.2em;
          line-height: 1.6;
          letter-spacing: 0.05em;
        ` : ''}
        ${this.settings.reduceMotion ? `
          animation: none !important;
          transition: none !important;
        ` : ''}
      }

      #${this.container.id} * {
        ${this.settings.dyslexiaFont ? 'font-family: "OpenDyslexic", sans-serif !important;' : ''}
        ${this.settings.reduceMotion ? `
          animation: none !important;
          transition: none !important;
        ` : ''}
      }

      ${this.settings.highContrast ? `
        #${this.container.id} .event-item {
          border: 2px solid var(--clarity-border) !important;
        }

        #${this.container.id} .event-label {
          font-weight: 700 !important;
        }
      ` : ''}

      ${this.settings.visionImpaired ? `
        #${this.container.id} .event-username {
          font-weight: 600;
          text-shadow: 0 0 1px rgba(0, 0, 0, 0.3);
        }

        #${this.container.id} .event-timestamp {
          font-size: 1.1em;
        }
      ` : ''}
    `;

    this.styleElement.textContent = css;
  }

  /**
   * Get current settings
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Apply multiple settings at once
   */
  applySettings(settings) {
    this.settings = { ...this.settings, ...settings };
    if (settings.dyslexiaFont) {
      this.loadDyslexiaFont();
    }
    this.updateStyles();
    return this;
  }

  /**
   * Clean up
   */
  destroy() {
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
    }
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.AccessibilityManager = AccessibilityManager;
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AccessibilityManager;
}
