/**
 * Text Effects System for LastEvent Spotlight
 *
 * Provides comprehensive text effects including wave, jitter, bounce, and glow.
 */

class TextEffects {
  constructor() {
    this.activeEffects = new Map();
  }

  normalizeFontToken(font) {
    const trimmed = typeof font === 'string' ? font.trim() : '';
    if (!trimmed) {
      return '';
    }
    if (/^["'].*["']$/.test(trimmed)) {
      return trimmed;
    }
    if (/^[a-z-]+$/i.test(trimmed) && !/\s/.test(trimmed)) {
      return trimmed;
    }
    return /\s/.test(trimmed) ? `'${trimmed}'` : trimmed;
  }

  resolveFontFamily(fontFamily) {
    const fallbackFonts = [
      "'Segoe UI'",
      "'Segoe UI Emoji'",
      "'Segoe UI Symbol'",
      "'Noto Sans'",
      "'Noto Color Emoji'",
      'sans-serif'
    ];
    const configuredFonts = typeof fontFamily === 'string' && fontFamily.trim()
      ? fontFamily.split(',').map(part => this.normalizeFontToken(part)).filter(Boolean)
      : ["'Exo 2'"];

    return [...new Set([...configuredFonts, ...fallbackFonts])].join(', ');
  }

  splitGraphemes(text) {
    if (typeof text !== 'string' || text.length === 0) {
      return [];
    }

    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(text), segment => segment.segment);
    }

    return Array.from(text);
  }

  /**
   * Apply comprehensive effects to a text element
   */
  applyComprehensiveEffects(element, settings) {
    if (!element) return;

    // Clear any existing effects
    this.clearEffects(element);

    // Base styling
    element.style.fontFamily = this.resolveFontFamily(settings.fontFamily);
    element.style.fontSize = settings.fontSize || '32px';
    element.style.lineHeight = settings.fontLineSpacing || '1.2';
    element.style.letterSpacing = settings.fontLetterSpacing || 'normal';
    element.style.color = settings.fontColor || '#FFFFFF';

    // Apply glow if enabled
    if (settings.usernameGlow) {
      this.applyGlow(element, settings.usernameGlowColor || '#00FF00');
    }

    // Apply text effect
    const effect = settings.usernameEffect || 'none';
    if (effect !== 'none') {
      this.applyEffect(element, effect, settings);
    }
  }

  /**
   * Apply glow effect
   */
  applyGlow(element, color) {
    element.style.textShadow = `
      0 0 10px ${color},
      0 0 20px ${color},
      0 0 30px ${color},
      0 0 40px ${color}
    `;
  }

  /**
   * Apply specific text effect
   */
  applyEffect(element, effectType, settings) {
    switch (effectType) {
      case 'wave':
      case 'wave-slow':
      case 'wave-fast':
        this.applyWaveEffect(element, effectType);
        break;
      case 'jitter':
        this.applyJitterEffect(element);
        break;
      case 'bounce':
        this.applyBounceEffect(element);
        break;
    }
  }

  /**
   * Apply wave effect to text
   */
  applyWaveEffect(element, speed = 'wave') {
    const effectState = this.wrapCharacters(element, 'wave-char');

    // Determine animation duration based on speed
    const durations = {
      'wave-slow': 3000,
      'wave': 2000,
      'wave-fast': 1000
    };
    const duration = durations[speed] || 2000;

    // Animate wave
    const waveChars = element.querySelectorAll('.wave-char');
    let startTime = null;

    const animate = (timestamp) => {
      if (!this.activeEffects.has(element)) return;
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      waveChars.forEach((char, index) => {
        const offset = (elapsed / duration) * Math.PI * 2 + (index * 0.5);
        const y = Math.sin(offset) * 10;
        char.style.transform = `translateY(${y}px)`;
      });

      effectState.frame = requestAnimationFrame(animate);
    };

    effectState.frame = requestAnimationFrame(animate);
  }

  /**
   * Apply jitter effect to text
   */
  applyJitterEffect(element) {
    const effectState = this.wrapCharacters(element, 'jitter-char');

    const jitterChars = element.querySelectorAll('.jitter-char');

    const animate = () => {
      if (!this.activeEffects.has(element)) return;
      jitterChars.forEach((char) => {
        const x = (Math.random() - 0.5) * 2;
        const y = (Math.random() - 0.5) * 2;
        char.style.transform = `translate(${x}px, ${y}px)`;
      });

      effectState.timeout = setTimeout(() => {
        effectState.frame = requestAnimationFrame(animate);
      }, 50);
    };

    animate();
  }

  /**
   * Apply bounce effect to text
   */
  applyBounceEffect(element) {
    const effectState = this.wrapCharacters(element, 'bounce-char');

    const bounceChars = element.querySelectorAll('.bounce-char');
    let startTime = null;

    const animate = (timestamp) => {
      if (!this.activeEffects.has(element)) return;
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      bounceChars.forEach((char, index) => {
        const offset = (elapsed / 1000) * Math.PI * 2 + (index * 0.3);
        const y = Math.abs(Math.sin(offset)) * -15;
        char.style.transform = `translateY(${y}px)`;
      });

      effectState.frame = requestAnimationFrame(animate);
    };

    effectState.frame = requestAnimationFrame(animate);
  }

  /**
   * Wrap text characters using DOM APIs so user text is never re-parsed as HTML.
   */
  wrapCharacters(element, className) {
    const text = element.textContent;
    element.textContent = '';

    const effectState = {
      frame: null,
      timeout: null,
      originalText: text
    };
    this.activeEffects.set(element, effectState);

    this.splitGraphemes(text).forEach((char, index) => {
      const span = document.createElement('span');
      span.className = className;
      span.dataset.index = String(index);
      span.style.display = 'inline-block';
      span.textContent = char === ' ' ? '\u00a0' : char;
      element.appendChild(span);
    });

    return effectState;
  }

  /**
   * Clear all effects from element
   */
  clearEffects(element) {
    if (this.activeEffects.has(element)) {
      const effectState = this.activeEffects.get(element);
      if (effectState.frame) {
        cancelAnimationFrame(effectState.frame);
      }
      if (effectState.timeout) {
        clearTimeout(effectState.timeout);
      }
      if (effectState.originalText !== undefined) {
        element.textContent = effectState.originalText;
      }
      this.activeEffects.delete(element);
    }

    // Reset text shadow
    element.style.textShadow = 'none';

    // Reset to plain text if it was split into spans by an older effect instance.
    if (element.querySelector('.wave-char, .jitter-char, .bounce-char')) {
      element.textContent = element.textContent;
    }
  }

  /**
   * Clear all active effects
   */
  clearAll() {
    for (const [element, effectState] of this.activeEffects.entries()) {
      if (effectState.frame) {
        cancelAnimationFrame(effectState.frame);
      }
      if (effectState.timeout) {
        clearTimeout(effectState.timeout);
      }
      if (effectState.originalText !== undefined && element.isConnected) {
        element.textContent = effectState.originalText;
      }
    }
    this.activeEffects.clear();
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.TextEffects = TextEffects;
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextEffects;
}
