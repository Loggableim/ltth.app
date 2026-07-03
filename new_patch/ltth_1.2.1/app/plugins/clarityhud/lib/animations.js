/**
 * Animation System for ClarityHUD
 *
 * Provides a modular animation registry and renderer with accessibility support.
 */

class AnimationRegistry {
  constructor() {
    this.animations = new Map();
    this.reduceMotion = false;
    this.registerDefaultAnimations();
    this.detectReducedMotion();
  }

  /**
   * Detect user's motion preference
   */
  detectReducedMotion() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reduceMotion = mediaQuery.matches;

      // Listen for changes
      mediaQuery.addEventListener('change', (e) => {
        this.reduceMotion = e.matches;
      });
    }
  }

  /**
   * Set reduced motion manually
   */
  setReducedMotion(enabled) {
    this.reduceMotion = enabled;
  }

  /**
   * Register default animations
   */
  registerDefaultAnimations() {
    // Fade animations
    this.register('fade', {
      in: (element, speed) => {
        const duration = this.getDuration(speed);

        if (this.reduceMotion) {
          element.style.opacity = '1';
          return 0;
        }

        element.style.transition = `opacity ${duration}ms ease-in-out`;
        element.style.opacity = '0';
        element.style.willChange = 'opacity';

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.style.opacity = '1';
          });
        });

        return duration;
      },
      out: (element, speed) => {
        const duration = this.getDuration(speed);

        if (this.reduceMotion) {
          element.style.opacity = '0';
          return 0;
        }

        element.style.transition = `opacity ${duration}ms ease-in-out`;
        element.style.opacity = '0';
        element.style.willChange = 'opacity';
        return duration;
      }
    });

    // Slide animations
    this.register('slide', {
      in: (element, speed) => {
        const duration = this.getDuration(speed);

        if (this.reduceMotion) {
          element.style.opacity = '1';
          element.style.transform = 'none';
          return 0;
        }

        element.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
        element.style.transform = 'translateX(-100%)';
        element.style.opacity = '0';
        element.style.willChange = 'transform, opacity';

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.style.transform = 'translateX(0)';
            element.style.opacity = '1';
          });
        });

        return duration;
      },
      out: (element, speed) => {
        const duration = this.getDuration(speed);

        if (this.reduceMotion) {
          element.style.opacity = '0';
          element.style.transform = 'none';
          return 0;
        }

        element.style.transition = `transform ${duration}ms ease-in, opacity ${duration}ms ease-in`;
        element.style.transform = 'translateX(100%)';
        element.style.opacity = '0';
        element.style.willChange = 'transform, opacity';
        return duration;
      }
    });

    // Pop animations
    this.register('pop', {
      in: (element, speed) => {
        const duration = this.getDuration(speed);

        if (this.reduceMotion) {
          element.style.opacity = '1';
          element.style.transform = 'none';
          return 0;
        }

        element.style.transition = `transform ${duration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity ${duration}ms ease-out`;
        element.style.transform = 'scale(0.5)';
        element.style.opacity = '0';
        element.style.willChange = 'transform, opacity';

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.style.transform = 'scale(1)';
            element.style.opacity = '1';
          });
        });

        return duration;
      },
      out: (element, speed) => {
        const duration = this.getDuration(speed);

        if (this.reduceMotion) {
          element.style.opacity = '0';
          element.style.transform = 'none';
          return 0;
        }

        element.style.transition = `transform ${duration}ms ease-in, opacity ${duration}ms ease-in`;
        element.style.transform = 'scale(0.5)';
        element.style.opacity = '0';
        element.style.willChange = 'transform, opacity';
        return duration;
      }
    });

    // Zoom animations
    this.register('zoom', {
      in: (element, speed) => {
        const duration = this.getDuration(speed);

        if (this.reduceMotion) {
          element.style.opacity = '1';
          element.style.transform = 'none';
          return 0;
        }

        element.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
        element.style.transform = 'scale(0.3)';
        element.style.opacity = '0';
        element.style.willChange = 'transform, opacity';

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.style.transform = 'scale(1)';
            element.style.opacity = '1';
          });
        });

        return duration;
      },
      out: (element, speed) => {
        const duration = this.getDuration(speed);

        if (this.reduceMotion) {
          element.style.opacity = '0';
          element.style.transform = 'none';
          return 0;
        }

        element.style.transition = `transform ${duration}ms ease-in, opacity ${duration}ms ease-in`;
        element.style.transform = 'scale(1.5)';
        element.style.opacity = '0';
        element.style.willChange = 'transform, opacity';
        return duration;
      }
    });

    // None (instant)
    this.register('none', {
      in: (element, speed) => {
        element.style.opacity = '1';
        element.style.transform = 'none';
        element.style.filter = 'none';
        element.style.willChange = 'auto';
        return 0;
      },
      out: (element, speed) => {
        element.style.opacity = '0';
        element.style.willChange = 'auto';
        return 0;
      }
    });
  }

  /**
   * Register a custom animation
   */
  register(name, animation) {
    this.animations.set(name, animation);
  }

  /**
   * Get animation by name
   */
  get(name) {
    return this.animations.get(name) || this.animations.get('fade');
  }

  /**
   * Get duration in milliseconds from speed setting
   */
  getDuration(speed) {
    const durations = {
      'slow': 800,
      'medium': 500,
      'fast': 300
    };
    return durations[speed] || durations['medium'];
  }
}

/**
 * Animation Renderer
 */
class AnimationRenderer {
  constructor(registry) {
    this.registry = registry || new AnimationRegistry();
    this.activeAnimations = new Map();
  }

  /**
   * Animate element in
   */
  async animateIn(element, type, speed = 'medium') {
    if (!element) {
      console.warn('AnimationRenderer.animateIn: element is null or undefined');
      return;
    }

    // Cancel any active animation on this element
    this.cancel(element);

    const animation = this.registry.get(type);
    if (!animation || !animation.in) {
      console.warn(`Animation "${type}" not found or has no "in" handler`);
      return;
    }

    const duration = animation.in(element, speed);

    // Track animation
    if (duration > 0) {
      const promise = new Promise(resolve => {
        const timeoutId = setTimeout(() => {
          this.activeAnimations.delete(element);
          // Clean up will-change for performance
          element.style.willChange = 'auto';
          resolve();
        }, duration);

        this.activeAnimations.set(element, { timeoutId, resolve });
      });

      return promise;
    } else {
      // Clean up will-change immediately for instant animations
      element.style.willChange = 'auto';
    }
  }

  /**
   * Animate element out
   */
  async animateOut(element, type, speed = 'medium') {
    if (!element) {
      console.warn('AnimationRenderer.animateOut: element is null or undefined');
      return;
    }

    // Cancel any active animation on this element
    this.cancel(element);

    const animation = this.registry.get(type);
    if (!animation || !animation.out) {
      console.warn(`Animation "${type}" not found or has no "out" handler`);
      return;
    }

    const duration = animation.out(element, speed);

    // Track animation
    if (duration > 0) {
      const promise = new Promise(resolve => {
        const timeoutId = setTimeout(() => {
          this.activeAnimations.delete(element);
          // Clean up will-change for performance
          element.style.willChange = 'auto';
          resolve();
        }, duration);

        this.activeAnimations.set(element, { timeoutId, resolve });
      });

      return promise;
    } else {
      // Clean up will-change immediately for instant animations
      element.style.willChange = 'auto';
    }
  }

  /**
   * Cancel active animation on element
   */
  cancel(element) {
    if (this.activeAnimations.has(element)) {
      const { timeoutId, resolve } = this.activeAnimations.get(element);
      clearTimeout(timeoutId);
      this.activeAnimations.delete(element);
      if (resolve) resolve();
    }
  }

  /**
   * Cancel all active animations
   */
  cancelAll() {
    for (const { timeoutId, resolve } of this.activeAnimations.values()) {
      clearTimeout(timeoutId);
      if (resolve) resolve();
    }
    this.activeAnimations.clear();
  }

  /**
   * Set reduced motion preference
   */
  setReducedMotion(enabled) {
    this.registry.setReducedMotion(enabled);
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.AnimationRegistry = AnimationRegistry;
  window.AnimationRenderer = AnimationRenderer;
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AnimationRegistry, AnimationRenderer };
}
