/**
 * Animation System for LastEvent Spotlight
 *
 * Provides a modular animation registry and renderer for smooth transitions.
 */

class AnimationRegistry {
  constructor() {
    this.animations = new Map();
    this.registerDefaultAnimations();
  }

  /**
   * Register default animations
   */
  registerDefaultAnimations() {
    // Fade animations
    this.register('fade', {
      in: (element, speed) => {
        const duration = this.getDuration(speed);
        element.style.transition = `opacity ${duration}ms ease-in-out`;
        element.style.opacity = '0';

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.style.opacity = '1';
          });
        });

        return duration;
      },
      out: (element, speed) => {
        const duration = this.getDuration(speed);
        element.style.transition = `opacity ${duration}ms ease-in-out`;
        element.style.opacity = '0';
        return duration;
      }
    });

    // Slide animations
    this.register('slide', {
      in: (element, speed) => {
        const duration = this.getDuration(speed);
        element.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
        element.style.transform = 'translateX(-100%)';
        element.style.opacity = '0';

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
        element.style.transition = `transform ${duration}ms ease-in, opacity ${duration}ms ease-in`;
        element.style.transform = 'translateX(100%)';
        element.style.opacity = '0';
        return duration;
      }
    });

    // Pop animations
    this.register('pop', {
      in: (element, speed) => {
        const duration = this.getDuration(speed);
        element.style.transition = `transform ${duration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity ${duration}ms ease-out`;
        element.style.transform = 'scale(0)';
        element.style.opacity = '0';

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
        element.style.transition = `transform ${duration}ms ease-in, opacity ${duration}ms ease-in`;
        element.style.transform = 'scale(0)';
        element.style.opacity = '0';
        return duration;
      }
    });

    // Zoom animations
    this.register('zoom', {
      in: (element, speed) => {
        const duration = this.getDuration(speed);
        element.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
        element.style.transform = 'scale(0.5)';
        element.style.opacity = '0';

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
        element.style.transition = `transform ${duration}ms ease-in, opacity ${duration}ms ease-in`;
        element.style.transform = 'scale(1.5)';
        element.style.opacity = '0';
        return duration;
      }
    });

    // Glow animations
    this.register('glow', {
      in: (element, speed) => {
        const duration = this.getDuration(speed);
        element.style.transition = `opacity ${duration}ms ease-out, filter ${duration}ms ease-out`;
        element.style.opacity = '0';
        element.style.filter = 'brightness(3) blur(10px)';

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.style.opacity = '1';
            element.style.filter = 'brightness(1) blur(0)';
          });
        });

        return duration;
      },
      out: (element, speed) => {
        const duration = this.getDuration(speed);
        element.style.transition = `opacity ${duration}ms ease-in, filter ${duration}ms ease-in`;
        element.style.opacity = '0';
        element.style.filter = 'brightness(3) blur(10px)';
        return duration;
      }
    });

    // Bounce animations
    this.register('bounce', {
      in: (element, speed) => {
        const duration = this.getDuration(speed);
        element.style.transition = `transform ${duration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity ${duration}ms ease-out`;
        element.style.transform = 'translateY(-100%)';
        element.style.opacity = '0';

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.style.transform = 'translateY(0)';
            element.style.opacity = '1';
          });
        });

        return duration;
      },
      out: (element, speed) => {
        const duration = this.getDuration(speed);
        element.style.transition = `transform ${duration}ms cubic-bezier(0.6, -0.28, 0.735, 0.045), opacity ${duration}ms ease-in`;
        element.style.transform = 'translateY(100%)';
        element.style.opacity = '0';
        return duration;
      }
    });

    // None (instant)
    this.register('none', {
      in: (element, speed) => {
        element.style.opacity = '1';
        element.style.transform = 'none';
        element.style.filter = 'none';
        return 0;
      },
      out: (element, speed) => {
        element.style.opacity = '0';
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
      'slow': 1000,
      'medium': 500,
      'fast': 250
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
      const animationId = setTimeout(() => {
        this.activeAnimations.delete(element);
      }, duration);

      this.activeAnimations.set(element, animationId);

      // Wait for animation to complete
      await new Promise(resolve => setTimeout(resolve, duration));
    }
  }

  /**
   * Animate element out
   */
  async animateOut(element, type, speed = 'medium') {
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
      const animationId = setTimeout(() => {
        this.activeAnimations.delete(element);
      }, duration);

      this.activeAnimations.set(element, animationId);

      // Wait for animation to complete
      await new Promise(resolve => setTimeout(resolve, duration));
    }
  }

  /**
   * Cancel active animation on element
   */
  cancel(element) {
    if (this.activeAnimations.has(element)) {
      clearTimeout(this.activeAnimations.get(element));
      this.activeAnimations.delete(element);
    }
  }

  /**
   * Cancel all active animations
   */
  cancelAll() {
    for (const timeout of this.activeAnimations.values()) {
      clearTimeout(timeout);
    }
    this.activeAnimations.clear();
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
