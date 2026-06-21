/**
 * ClarityHUD - Stream Animations
 *
 * Enhanced animation effects for the stream overlay.
 * Provides particle bursts, confetti, screen flash, floating text,
 * shake effects, and a CSS class injector for dynamic keyframes.
 *
 * All methods are static — no instantiation required.
 * Call StreamAnimations.injectStyles() once during overlay init.
 */

class StreamAnimations {
  /** @private Track whether styles have already been injected */
  static _stylesInjected = false;

  /** @private Active particle/confetti animation frame IDs for cleanup */
  static _activeFrames = new Set();

  // ==================== CSS INJECTOR ====================

  /**
   * Inject a <style> block with additional animation keyframes and
   * effect classes used by particle, confetti, flash, and floating-text
   * helpers. Safe to call multiple times (no-op after first injection).
   */
  static injectStyles() {
    if (StreamAnimations._stylesInjected) return;

    const style = document.createElement('style');
    style.id = 'stream-animations-css';
    style.textContent = `
      /* ==================== PARTICLE ==================== */
      .sa-particle {
        position: absolute;
        pointer-events: none;
        border-radius: 50%;
        will-change: transform, opacity;
        z-index: 9999;
      }

      @keyframes saParticleFly {
        0%   { opacity: 1; transform: translate(0, 0) scale(1); }
        100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.2); }
      }

      /* ==================== CONFETTI ==================== */
      .sa-confetti {
        position: absolute;
        pointer-events: none;
        width: 8px;
        height: 12px;
        will-change: transform, opacity;
        z-index: 9999;
      }

      @keyframes saConfettiFall {
        0%   { opacity: 1; transform: translate(0, 0) rotate(0deg) scale(1); }
        100% { opacity: 0; transform: translate(var(--cx), var(--cy)) rotate(var(--cr)) scale(0.5); }
      }

      /* ==================== SCREEN FLASH ==================== */
      .sa-flash-overlay {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 10000;
        will-change: opacity;
      }

      @keyframes saFlash {
        0%   { opacity: var(--flash-intensity, 0.35); }
        100% { opacity: 0; }
      }

      /* ==================== FLOATING TEXT ==================== */
      .sa-floating-text {
        position: absolute;
        pointer-events: none;
        font-weight: 800;
        white-space: nowrap;
        will-change: transform, opacity;
        z-index: 9998;
        text-shadow: 0 0 12px currentColor, 0 2px 6px rgba(0,0,0,0.8);
      }

      @keyframes saFloatUp {
        0%   { opacity: 1; transform: translateY(0) scale(1); }
        70%  { opacity: 1; }
        100% { opacity: 0; transform: translateY(-80px) scale(1.15); }
      }

      /* ==================== SHAKE ==================== */
      @keyframes saShake {
        0%, 100% { transform: translateX(0); }
        10%      { transform: translateX(-6px) rotate(-0.5deg); }
        20%      { transform: translateX(6px) rotate(0.5deg); }
        30%      { transform: translateX(-5px) rotate(-0.3deg); }
        40%      { transform: translateX(5px) rotate(0.3deg); }
        50%      { transform: translateX(-3px); }
        60%      { transform: translateX(3px); }
        70%      { transform: translateX(-2px); }
        80%      { transform: translateX(2px); }
        90%      { transform: translateX(-1px); }
      }

      .sa-shake {
        animation: saShake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards;
      }

      /* ==================== SHINE SWEEP ==================== */
      @keyframes saShineSweep {
        0%   { background-position: -200% center; }
        100% { background-position: 200% center; }
      }

      .sa-shine {
        background-image: linear-gradient(
          110deg,
          transparent 30%,
          rgba(255, 255, 255, 0.15) 45%,
          rgba(255, 255, 255, 0.25) 50%,
          rgba(255, 255, 255, 0.15) 55%,
          transparent 70%
        );
        background-size: 200% 100%;
        animation: saShineSweep 1.2s ease-in-out;
      }

      /* ==================== COMBO COUNTER ==================== */
      .sa-combo {
        position: absolute;
        pointer-events: none;
        font-weight: 900;
        font-size: 2em;
        white-space: nowrap;
        will-change: transform, opacity;
        z-index: 9998;
        text-shadow: 0 0 16px currentColor, 0 2px 8px rgba(0,0,0,0.9);
      }

      @keyframes saComboAppear {
        0%   { opacity: 0; transform: scale(0.3) translateY(10px); }
        60%  { opacity: 1; transform: scale(1.15) translateY(-4px); }
        80%  { transform: scale(0.95) translateY(0); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }

      @keyframes saComboFade {
        0%   { opacity: 1; transform: scale(1) translateY(0); }
        100% { opacity: 0; transform: scale(1.2) translateY(-30px); }
      }
    `;

    document.head.appendChild(style);
    StreamAnimations._stylesInjected = true;
    console.log('[CLARITY STREAM] StreamAnimations styles injected');
  }

  // ==================== PARTICLE BURST ====================

  /**
   * Spawn a burst of circular particles radiating outward from an element.
   * Used for gift / treasure / sub highlight events.
   *
   * @param {HTMLElement} target  - The card element to burst around
   * @param {object}      opts
   * @param {string}      opts.color    - CSS color (default: accent color)
   * @param {number}      opts.count    - Number of particles (default: 18)
   * @param {number}      opts.duration - Animation duration ms (default: 800)
   * @param {number}      opts.spread   - Max px travel distance (default: 120)
   * @param {number}      opts.size     - Base particle size px (default: 8)
   */
  static spawnParticles(target, opts = {}) {
    if (!target || document.body.classList.contains('reduce-motion')) return;

    const {
      color = 'var(--accent)',
      count = 18,
      duration = 800,
      spread = 120,
      size = 8,
    } = opts;

    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
    document.body.appendChild(container);

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const dist = spread * (0.5 + Math.random() * 0.5);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const pSize = size * (0.6 + Math.random() * 0.8);

      const p = document.createElement('div');
      p.className = 'sa-particle';
      p.style.cssText = `
        left: ${cx - pSize / 2}px;
        top: ${cy - pSize / 2}px;
        width: ${pSize}px;
        height: ${pSize}px;
        background: ${color};
        box-shadow: 0 0 ${pSize}px ${color};
        --dx: ${dx}px;
        --dy: ${dy}px;
        animation: saParticleFly ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        animation-delay: ${Math.random() * 80}ms;
      `;
      container.appendChild(p);
    }

    // Cleanup after animation completes
    setTimeout(() => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, duration + 200);
  }

  // ==================== CONFETTI BURST ====================

  /**
   * Spawn confetti pieces that fall/scatter from an element.
   * Used for high-value gifts and treasure chests.
   *
   * @param {HTMLElement} target  - The card element
   * @param {object}      opts
   * @param {number}      opts.count    - Number of confetti pieces (default: 30)
   * @param {number}      opts.duration - Animation duration ms (default: 1200)
   * @param {string[]}    opts.colors   - Array of CSS colors
   */
  static spawnConfetti(target, opts = {}) {
    if (!target || document.body.classList.contains('reduce-motion')) return;

    const {
      count = 30,
      duration = 1200,
      colors = ['#ffc107', '#ff5722', '#4caf50', '#2196f3', '#e91e63', '#9c27b0', '#00bcd4'],
    } = opts;

    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 3;

    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
    document.body.appendChild(container);

    for (let i = 0; i < count; i++) {
      const color = colors[i % colors.length];
      const dx = (Math.random() - 0.5) * 300;
      const dy = 100 + Math.random() * 250;
      const rotation = (Math.random() - 0.5) * 720;

      const c = document.createElement('div');
      c.className = 'sa-confetti';
      c.style.cssText = `
        left: ${cx}px;
        top: ${cy}px;
        background: ${color};
        border-radius: ${Math.random() > 0.5 ? '2px' : '50%'};
        width: ${6 + Math.random() * 6}px;
        height: ${8 + Math.random() * 8}px;
        --cx: ${dx}px;
        --cy: ${dy}px;
        --cr: ${rotation}deg;
        animation: saConfettiFall ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        animation-delay: ${Math.random() * 150}ms;
      `;
      container.appendChild(c);
    }

    setTimeout(() => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, duration + 300);
  }

  // ==================== SCREEN FLASH ====================

  /**
   * Brief full-screen color flash for dramatic events.
   *
   * @param {object} opts
   * @param {string} opts.color     - CSS color (default: white)
   * @param {number} opts.duration  - Flash duration ms (default: 400)
   * @param {number} opts.intensity - Opacity 0-1 (default: 0.35)
   */
  static screenFlash(opts = {}) {
    if (document.body.classList.contains('reduce-motion')) return;

    const {
      color = 'rgba(255, 255, 255, 0.5)',
      duration = 400,
      intensity = 0.35,
    } = opts;

    const overlay = document.createElement('div');
    overlay.className = 'sa-flash-overlay';
    overlay.style.cssText = `
      background: ${color};
      --flash-intensity: ${intensity};
      animation: saFlash ${duration}ms ease-out forwards;
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, duration + 100);
  }

  // ==================== FLOATING TEXT ====================

  /**
   * Show animated floating text above an element (e.g. "+250 🪙").
   *
   * @param {HTMLElement} target   - Element to float above
   * @param {string}      text     - Text to display
   * @param {object}      opts
   * @param {string}      opts.color    - CSS color (default: #ffc107)
   * @param {number}      opts.duration - Duration ms (default: 1500)
   * @param {string}      opts.fontSize - Font size (default: 1.5em)
   */
  static floatingText(target, text, opts = {}) {
    if (!target || document.body.classList.contains('reduce-motion')) return;

    const {
      color = '#ffc107',
      duration = 1500,
      fontSize = '1.5em',
    } = opts;

    const rect = target.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'sa-floating-text';
    el.textContent = text;
    el.style.cssText = `
      left: ${rect.left + rect.width / 2}px;
      top: ${rect.top - 10}px;
      transform: translateX(-50%);
      color: ${color};
      font-size: ${fontSize};
      animation: saFloatUp ${duration}ms ease-out forwards;
    `;

    // Needs a fixed container so position works correctly
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998;';
    container.appendChild(el);
    document.body.appendChild(container);

    setTimeout(() => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, duration + 100);
  }

  // ==================== SHAKE ====================

  /**
   * Apply a shake animation to an element.
   *
   * @param {HTMLElement} element  - Element to shake
   * @param {number}      duration - Duration ms (default: 500)
   */
  static shake(element, duration = 500) {
    if (!element || document.body.classList.contains('reduce-motion')) return;

    element.classList.add('sa-shake');
    element.style.animationDuration = `${duration}ms`;

    const onEnd = () => {
      element.classList.remove('sa-shake');
      element.style.animationDuration = '';
      element.removeEventListener('animationend', onEnd);
    };
    element.addEventListener('animationend', onEnd, { once: true });

    // Fallback cleanup
    setTimeout(onEnd, duration + 100);
  }

  // ==================== SHINE SWEEP ====================

  /**
   * Apply a highlight shine sweep across a card.
   *
   * @param {HTMLElement} element  - Element to shine
   * @param {number}      duration - Duration ms (default: 1200)
   */
  static shine(element, duration = 1200) {
    if (!element || document.body.classList.contains('reduce-motion')) return;

    element.classList.add('sa-shine');
    element.style.setProperty('--sa-shine-dur', `${duration}ms`);

    const onEnd = () => {
      element.classList.remove('sa-shine');
      element.removeEventListener('animationend', onEnd);
    };
    element.addEventListener('animationend', onEnd, { once: true });

    // Fallback cleanup
    setTimeout(onEnd, duration + 100);
  }

  // ==================== COMBO COUNTER ====================

  /**
   * Show an animated combo counter at a position (e.g. "x5" for gift combos).
   *
   * @param {HTMLElement} target - Element to position near
   * @param {string}      text   - Combo text (e.g. "x5")
   * @param {object}      opts
   * @param {string}      opts.color    - CSS color
   * @param {number}      opts.duration - Total visible duration ms (default: 2000)
   */
  static comboCounter(target, text, opts = {}) {
    if (!target || document.body.classList.contains('reduce-motion')) return;

    const {
      color = '#ffc107',
      duration = 2000,
    } = opts;

    const rect = target.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'sa-combo';
    el.textContent = text;
    el.style.cssText = `
      left: ${rect.right + 8}px;
      top: ${rect.top + rect.height / 2}px;
      transform: translateY(-50%);
      color: ${color};
      animation: saComboAppear 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    `;

    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998;';
    container.appendChild(el);
    document.body.appendChild(container);

    // Start fade-out before removal
    const fadeStart = Math.max(duration - 500, 400);
    setTimeout(() => {
      el.style.animation = 'saComboFade 0.5s ease-out forwards';
    }, fadeStart);

    setTimeout(() => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, duration + 200);
  }

  // ==================== HIGHLIGHT EFFECTS BUNDLE ====================

  /**
   * Play a bundle of effects appropriate for a highlight card.
   * Automatically scales intensity based on the event type and coin value.
   *
   * @param {HTMLElement} cardElement - The highlight card DOM element
   * @param {string}      type        - Event type ('gift', 'sub', 'treasure')
   * @param {object}      data        - Event data from backend
   */
  static playHighlightEffects(cardElement, type, data) {
    if (!cardElement || document.body.classList.contains('reduce-motion')) return;

    const coins = data.gift?.coins || data.coins || 0;
    const accentColor = getComputedStyle(cardElement).getPropertyValue('--accent').trim() || '#ffc107';

    // Shine sweep on every highlight card
    StreamAnimations.shine(cardElement);

    if (type === 'treasure') {
      // Treasure: confetti + particles + flash
      StreamAnimations.spawnConfetti(cardElement, { count: 40 });
      StreamAnimations.spawnParticles(cardElement, { color: accentColor, count: 24, spread: 150 });
      StreamAnimations.screenFlash({ color: `${accentColor}33`, intensity: 0.25 });
    } else if (type === 'gift') {
      if (coins >= 500) {
        // Big gift: confetti + particles + flash + floating coin text
        StreamAnimations.spawnConfetti(cardElement, { count: 35 });
        StreamAnimations.spawnParticles(cardElement, { color: accentColor, count: 22, spread: 140 });
        StreamAnimations.screenFlash({ color: `${accentColor}33`, intensity: 0.2 });
        StreamAnimations.floatingText(cardElement, `+${coins} 🪙`, { color: '#ffc107', fontSize: '2em' });
      } else if (coins >= 100) {
        // Medium gift: particles + floating coin text
        StreamAnimations.spawnParticles(cardElement, { color: accentColor, count: 16, spread: 110 });
        StreamAnimations.floatingText(cardElement, `+${coins} 🪙`, { color: '#ffc107' });
      } else {
        // Small highlighted gift: just particles
        StreamAnimations.spawnParticles(cardElement, { color: accentColor, count: 10, spread: 80 });
      }

      // Combo counter for multi-count gifts
      const giftCount = data.gift?.count || data.repeatCount || 1;
      if (giftCount > 1) {
        StreamAnimations.comboCounter(cardElement, `x${giftCount}`, { color: accentColor });
      }
    } else if (type === 'sub') {
      // Sub: particles + light flash
      StreamAnimations.spawnParticles(cardElement, { color: accentColor, count: 14, spread: 100 });
      StreamAnimations.screenFlash({ color: `${accentColor}22`, intensity: 0.15, duration: 300 });
    }
  }

  // ==================== CLEANUP ====================

  /**
   * Remove all injected effect elements and cancel pending frames.
   * Call during overlay teardown if needed.
   */
  static cleanup() {
    // Remove injected style
    const style = document.getElementById('stream-animations-css');
    if (style) style.remove();
    StreamAnimations._stylesInjected = false;

    // Remove any lingering effect containers
    document.querySelectorAll('.sa-particle, .sa-confetti, .sa-flash-overlay, .sa-floating-text, .sa-combo').forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });

    // Cancel any tracked animation frames
    for (const id of StreamAnimations._activeFrames) {
      cancelAnimationFrame(id);
    }
    StreamAnimations._activeFrames.clear();
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.StreamAnimations = StreamAnimations;
}

// Export for Node.js / test usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StreamAnimations };
}
