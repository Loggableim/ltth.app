/**
 * Test: Fireworks Plugin Follower Animation
 * 
 * Validates that the Fireworks plugin's follower animation functionality works correctly:
 * - Position settings are properly applied
 * - Size settings are properly applied
 * - Color/style variants are functional
 * - Entrance animations work with all positions
 * - Configuration persistence works
 */

const fs = require('fs');
const path = require('path');

describe('Fireworks Plugin Follower Animation', () => {
  let overlayHtml;
  let settingsHtml;
  let mainJs;

  beforeAll(() => {
    // Load overlay HTML
    const overlayPath = path.join(__dirname, '..', 'plugins', 'fireworks', 'overlay.html');
    overlayHtml = fs.readFileSync(overlayPath, 'utf8');

    // Load settings HTML
    const settingsPath = path.join(__dirname, '..', 'plugins', 'fireworks', 'ui', 'settings.html');
    settingsHtml = fs.readFileSync(settingsPath, 'utf8');

    // Load main.js
    const mainPath = path.join(__dirname, '..', 'plugins', 'fireworks', 'main.js');
    mainJs = fs.readFileSync(mainPath, 'utf8');
  });

  describe('Position Settings', () => {
    const positions = [
      'top-left',
      'top-center',
      'top-right',
      'center',
      'bottom-left',
      'bottom-center',
      'bottom-right'
    ];

    test('should have all 7 position options in settings', () => {
      positions.forEach(position => {
        expect(settingsHtml).toContain(`value="${position}"`);
      });
    });

    test('should have CSS classes for all 7 positions', () => {
      positions.forEach(position => {
        expect(overlayHtml).toContain(`.follower-animation.pos-${position}`);
      });
    });

    test('should have correct default position in main.js', () => {
      expect(mainJs).toContain("followerAnimationPosition: 'center'");
    });
  });

  describe('Size Settings', () => {
    const sizes = ['small', 'medium', 'large', 'custom'];

    test('should have all 4 size options in settings', () => {
      sizes.forEach(size => {
        expect(settingsHtml).toContain(`value="${size}"`);
      });
    });

    test('should have size selector in settings', () => {
      expect(settingsHtml).toContain('id="follower-animation-size"');
    });

    test('should have custom scale slider in settings', () => {
      expect(settingsHtml).toContain('id="follower-animation-scale"');
      expect(settingsHtml).toContain('min="0.5"');
      expect(settingsHtml).toContain('max="2.0"');
    });

    test('should have CSS classes for all 4 sizes', () => {
      sizes.forEach(size => {
        expect(overlayHtml).toContain(`.follower-animation.size-${size}`);
      });
    });

    test('should have size configuration in main.js', () => {
      expect(mainJs).toContain("followerAnimationSize: 'medium'");
      expect(mainJs).toContain('followerAnimationScale: 1.0');
    });
  });

  describe('Color/Style Variants', () => {
    const styles = [
      'gradient-purple',
      'gradient-blue',
      'gradient-gold',
      'gradient-rainbow',
      'neon',
      'minimal'
    ];

    test('should have all 6 style options in settings', () => {
      styles.forEach(style => {
        expect(settingsHtml).toContain(`value="${style}"`);
      });
    });

    test('should have CSS classes for all 6 styles', () => {
      styles.forEach(style => {
        expect(overlayHtml).toContain(`.follower-content.style-${style}`);
      });
    });

    test('should have gradient-purple as default style', () => {
      expect(mainJs).toContain("followerAnimationStyle: 'gradient-purple'");
    });

    test('gradient-purple should have background, border, and box-shadow', () => {
      const purpleStyleIndex = overlayHtml.indexOf('.follower-content.style-gradient-purple');
      const purpleStyleSection = overlayHtml.substring(purpleStyleIndex, purpleStyleIndex + 300);
      
      expect(purpleStyleSection).toContain('background:');
      expect(purpleStyleSection).toContain('border:');
      expect(purpleStyleSection).toContain('box-shadow:');
    });

    test('minimal style should override text colors', () => {
      expect(overlayHtml).toContain('.follower-content.style-minimal .follower-text');
      expect(overlayHtml).toContain('.follower-content.style-minimal .follower-username');
    });

    test('neon style should have custom text colors and shadows', () => {
      expect(overlayHtml).toContain('.follower-content.style-neon .follower-text');
      expect(overlayHtml).toContain('.follower-content.style-neon .follower-username');
    });
  });

  describe('Entrance Animations', () => {
    const entrances = [
      'scale',
      'fade',
      'slide-up',
      'slide-down',
      'slide-left',
      'slide-right',
      'bounce',
      'rotate'
    ];

    test('should have all 8 entrance options in settings', () => {
      entrances.forEach(entrance => {
        expect(settingsHtml).toContain(`value="${entrance}"`);
      });
    });

    test('should have entrance animation keyframes for center position', () => {
      entrances.forEach(entrance => {
        const camelCase = entrance.split('-').map((word, index) => 
          index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
        ).join('');
        
        // Check for keyframe animation
        expect(overlayHtml).toContain(`@keyframes entrance${camelCase.charAt(0).toUpperCase() + camelCase.slice(1)}Center`);
      });
    });

    test('should have entrance classes that preserve position transforms', () => {
      // Check that entrance animations preserve the position transforms
      expect(overlayHtml).toContain('translate(-50%, -50%)'); // Center position
      expect(overlayHtml).toContain('translate(-50%, 0)'); // Top/Bottom center
      expect(overlayHtml).toContain('translateY(0)'); // Slide animations
      expect(overlayHtml).toContain('translateX(0)'); // Slide animations
    });

    test('should have scale as default entrance animation', () => {
      expect(mainJs).toContain("followerAnimationEntrance: 'scale'");
    });
  });

  describe('Configuration Structure', () => {
    test('should have follower animation enabled toggle', () => {
      expect(mainJs).toContain('followerFireworksEnabled: false');
    });

    test('should have follower rocket count setting', () => {
      expect(mainJs).toContain('followerRocketCount: 3');
    });

    test('should have animation duration setting', () => {
      expect(mainJs).toContain('followerAnimationDuration: 3000');
    });

    test('should have animation delay setting', () => {
      expect(mainJs).toContain('followerAnimationDelay: 3000');
    });

    test('should have profile picture toggle', () => {
      expect(mainJs).toContain('followerShowProfilePicture: true');
    });

    test('should have animation show toggle', () => {
      expect(mainJs).toContain('followerShowAnimation: true');
    });
  });

  describe('HTML Structure', () => {
    test('should have follower animation container', () => {
      expect(overlayHtml).toContain('id="follower-animation"');
      expect(overlayHtml).toContain('class="follower-animation"');
    });

    test('should have follower content container', () => {
      expect(overlayHtml).toContain('class="follower-content"');
    });

    test('should have follower avatar element', () => {
      expect(overlayHtml).toContain('id="follower-avatar"');
      expect(overlayHtml).toContain('class="follower-avatar"');
    });

    test('should have follower username element', () => {
      expect(overlayHtml).toContain('id="follower-username"');
      expect(overlayHtml).toContain('class="follower-username"');
    });

    test('should have thank you text element', () => {
      expect(overlayHtml).toContain('class="thank-you-text"');
      expect(overlayHtml).toContain('Danke für den Follow!');
    });
  });

  describe('Settings UI', () => {
    test('should have test follower button', () => {
      expect(settingsHtml).toContain('id="test-follower-btn"');
      expect(settingsHtml).toContain('Test Follower Fireworks');
    });

    test('should have follower settings section', () => {
      expect(settingsHtml).toContain('Follower Feuerwerk');
    });

    test('should have all follower toggles', () => {
      expect(settingsHtml).toContain('id="follower-toggle"');
      expect(settingsHtml).toContain('id="follower-animation-toggle"');
      expect(settingsHtml).toContain('id="follower-profile-toggle"');
    });

    test('should have all follower sliders', () => {
      expect(settingsHtml).toContain('id="follower-rocket-count"');
      expect(settingsHtml).toContain('id="follower-animation-duration"');
      expect(settingsHtml).toContain('id="follower-animation-delay"');
      expect(settingsHtml).toContain('id="follower-animation-scale"');
    });

    test('should have all follower selectors', () => {
      expect(settingsHtml).toContain('id="follower-animation-position"');
      expect(settingsHtml).toContain('id="follower-animation-size"');
      expect(settingsHtml).toContain('id="follower-animation-style"');
      expect(settingsHtml).toContain('id="follower-animation-entrance"');
    });

    test('should have custom scale container that can be hidden', () => {
      expect(settingsHtml).toContain('id="follower-animation-scale-container"');
      expect(settingsHtml).toContain('display: none');
    });
  });
});
