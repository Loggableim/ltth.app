/**
 * Text Effects System for LastEvent Spotlight
 *
 * Provides comprehensive text effects including wave, jitter, bounce, and glow.
 */

class TextEffects {
  constructor() {
    this.activeEffects = new Map();
  }

  /**
   * Apply comprehensive effects to a text element
   */
  applyComprehensiveEffects(element, settings) {
    if (!element) return;

    // Clear any existing effects
    this.clearEffects(element);

    // Base styling
    element.style.fontFamily = settings.fontFamily || 'Exo 2';
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
    const text = element.textContent;
    const chars = text.split('');

    // Wrap each character in a span
    element.innerHTML = chars.map((char, index) => {
      if (char === ' ') return '<span style="display: inline-block;">&nbsp;</span>';
      return `<span class="wave-char" data-index="${index}" style="display: inline-block;">${char}</span>`;
    }).join('');

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
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      waveChars.forEach((char, index) => {
        const offset = (elapsed / duration) * Math.PI * 2 + (index * 0.5);
        const y = Math.sin(offset) * 10;
        char.style.transform = `translateY(${y}px)`;
      });

      const animationId = requestAnimationFrame(animate);
      this.activeEffects.set(element, animationId);
    };

    const animationId = requestAnimationFrame(animate);
    this.activeEffects.set(element, animationId);
  }

  /**
   * Apply jitter effect to text
   */
  applyJitterEffect(element) {
    const text = element.textContent;
    const chars = text.split('');

    // Wrap each character in a span
    element.innerHTML = chars.map((char, index) => {
      if (char === ' ') return '<span style="display: inline-block;">&nbsp;</span>';
      return `<span class="jitter-char" data-index="${index}" style="display: inline-block;">${char}</span>`;
    }).join('');

    const jitterChars = element.querySelectorAll('.jitter-char');

    const animate = () => {
      jitterChars.forEach((char) => {
        const x = (Math.random() - 0.5) * 2;
        const y = (Math.random() - 0.5) * 2;
        char.style.transform = `translate(${x}px, ${y}px)`;
      });

      const timeoutId = setTimeout(() => {
        const animationId = requestAnimationFrame(animate);
        this.activeEffects.set(element, animationId);
      }, 50);
    };

    animate();
  }

  /**
   * Apply bounce effect to text
   */
  applyBounceEffect(element) {
    const text = element.textContent;
    const chars = text.split('');

    // Wrap each character in a span
    element.innerHTML = chars.map((char, index) => {
      if (char === ' ') return '<span style="display: inline-block;">&nbsp;</span>';
      return `<span class="bounce-char" data-index="${index}" style="display: inline-block;">${char}</span>`;
    }).join('');

    const bounceChars = element.querySelectorAll('.bounce-char');
    let startTime = null;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      bounceChars.forEach((char, index) => {
        const offset = (elapsed / 1000) * Math.PI * 2 + (index * 0.3);
        const y = Math.abs(Math.sin(offset)) * -15;
        char.style.transform = `translateY(${y}px)`;
      });

      const animationId = requestAnimationFrame(animate);
      this.activeEffects.set(element, animationId);
    };

    const animationId = requestAnimationFrame(animate);
    this.activeEffects.set(element, animationId);
  }

  /**
   * Clear all effects from element
   */
  clearEffects(element) {
    if (this.activeEffects.has(element)) {
      cancelAnimationFrame(this.activeEffects.get(element));
      this.activeEffects.delete(element);
    }

    // Reset text shadow
    element.style.textShadow = 'none';

    // Reset to plain text if it was split into spans
    if (element.querySelector('.wave-char, .jitter-char, .bounce-char')) {
      element.textContent = element.textContent; // This strips all HTML
    }
  }

  /**
   * Clear all active effects
   */
  clearAll() {
    for (const animationId of this.activeEffects.values()) {
      cancelAnimationFrame(animationId);
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
