/**
 * Test for template-renderer.js CSP compliance
 * Ensures that image error handlers work without inline event handlers
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('TemplateRenderer CSP Compliance', () => {
  let TemplateRenderer;
  let dom;
  let document;
  let container;

  beforeEach(() => {
    // Set up a DOM environment
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="test-container"></div></body></html>');
    global.document = dom.window.document;
    global.window = dom.window;
    global.Image = dom.window.Image;
    document = dom.window.document;

    // Load the TemplateRenderer module
    const rendererPath = path.join(__dirname, '../plugins/lastevent-spotlight/lib/template-renderer.js');
    delete require.cache[require.resolve(rendererPath)];
    TemplateRenderer = require(rendererPath);

    container = document.getElementById('test-container');
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
    delete global.Image;
  });

  test('should not contain inline onerror handlers in rendered HTML', async () => {
    const renderer = new TemplateRenderer(container, {
      showProfilePicture: true,
      showUsername: true,
      profilePictureSize: '80px',
      fontSize: '32px'
    });

    const userData = {
      uniqueId: 'testuser',
      nickname: 'Test User',
      profilePictureUrl: 'https://example.com/profile.jpg',
      eventType: 'gifter',
      label: 'Gifter',
      metadata: {
        giftName: 'Test Gift',
        giftPictureUrl: 'https://example.com/gift.png',
        giftCount: 5,
        coins: 100
      }
    };

    await renderer.render(userData);

    const html = container.innerHTML;
    
    // Check that there are no inline onerror handlers
    expect(html).not.toContain('onerror=');
    
    // Check that data-fallback attribute is present
    expect(html).toContain('data-fallback=');
    
    // Check that images are present
    const images = container.querySelectorAll('img');
    expect(images.length).toBeGreaterThan(0);
  });

  test('should attach error handlers to images after rendering', async () => {
    const renderer = new TemplateRenderer(container, {
      showProfilePicture: true,
      profilePictureSize: '80px'
    });

    const userData = {
      uniqueId: 'testuser',
      nickname: 'Test User',
      profilePictureUrl: 'https://example.com/profile.jpg',
      eventType: 'follower',
      label: 'Follower'
    };

    await renderer.render(userData);

    const images = container.querySelectorAll('img[data-fallback]');
    expect(images.length).toBeGreaterThan(0);

    // Check that images have error handlers attached
    images.forEach(img => {
      expect(img._errorHandler).toBeDefined();
      expect(typeof img._errorHandler).toBe('function');
    });
  });

  test('should switch to fallback image on error', async () => {
    const renderer = new TemplateRenderer(container, {
      showProfilePicture: true,
      profilePictureSize: '80px'
    });

    const userData = {
      uniqueId: 'testuser',
      nickname: 'T',
      profilePictureUrl: 'https://example.com/invalid-image.jpg',
      eventType: 'follower',
      label: 'Follower'
    };

    await renderer.render(userData);

    const img = container.querySelector('img[data-fallback]');
    expect(img).toBeTruthy();

    const originalSrc = img.src;
    const fallbackSrc = img.getAttribute('data-fallback');
    expect(fallbackSrc).toBeTruthy();
    expect(fallbackSrc).toContain('data:image/svg+xml');

    // Simulate an error event
    const errorEvent = new dom.window.Event('error');
    img.dispatchEvent(errorEvent);

    // Check that the src has been changed to the fallback
    expect(img.src).toBe(fallbackSrc);
  });

  test('should generate valid SVG fallback with user initials', () => {
    const renderer = new TemplateRenderer(container, {});
    
    const fallbackSvg = renderer.generateFallbackSvg('T', {
      backgroundColor: '#4a5568',
      textColor: 'white',
      fontSize: '40',
      borderRadius: '50'
    });

    expect(fallbackSvg).toContain('data:image/svg+xml');
    expect(fallbackSvg).toContain('T');
    expect(fallbackSvg).toContain('4a5568');
  });

  test('should handle gift icons with fallback', async () => {
    const renderer = new TemplateRenderer(container, {
      showProfilePicture: true,
      profilePictureSize: '80px'
    });

    const userData = {
      uniqueId: 'testuser',
      nickname: 'Test User',
      profilePictureUrl: 'https://example.com/profile.jpg',
      eventType: 'topgift',
      label: 'Top Gift',
      metadata: {
        giftName: 'Diamond',
        giftPictureUrl: 'https://example.com/diamond.png',
        giftCount: 10
      }
    };

    await renderer.render(userData);

    const images = container.querySelectorAll('img[data-fallback]');
    expect(images.length).toBeGreaterThan(1); // Profile pic + gift icon

    // All images should have fallback attribute
    images.forEach(img => {
      expect(img.getAttribute('data-fallback')).toBeTruthy();
    });
  });

  test('should render gift images when the source is an object URL list', async () => {
    const renderer = new TemplateRenderer(container, {
      showProfilePicture: false,
      showUsername: true,
      preloadImages: false
    });

    const userData = {
      uniqueId: 'testuser',
      nickname: 'Test User',
      eventType: 'gifter',
      label: 'Gifter',
      metadata: {
        giftName: 'Rose',
        giftPictureUrl: {
          url: ['https://example.com/rose.png']
        },
        giftCount: 1,
        coins: 1
      }
    };

    await expect(renderer.render(userData)).resolves.toBeUndefined();

    const giftImage = container.querySelector('.gift-icon img');
    expect(giftImage).toBeTruthy();
    expect(giftImage.getAttribute('src')).toBe('https://example.com/rose.png');
  });

  test('clear prevents settings updates from re-rendering stale users', async () => {
    const renderer = new TemplateRenderer(container, {
      showProfilePicture: false,
      showUsername: true
    });

    await renderer.render({
      uniqueId: 'olduser',
      nickname: 'Old User',
      eventType: 'follower',
      label: 'Follower'
    });

    renderer.clear();
    renderer.updateSettings({ fontSize: '40px' });

    expect(container.textContent).not.toContain('Old User');
  });

  test('turning off center alignment clears flex centering styles', async () => {
    const renderer = new TemplateRenderer(container, {
      showProfilePicture: false,
      showUsername: true,
      alignCenter: true
    });

    await renderer.render({
      uniqueId: 'testuser',
      nickname: 'Test User',
      eventType: 'follower',
      label: 'Follower'
    });

    renderer.updateSettings({ alignCenter: false });

    expect(container.style.justifyContent).toBe('flex-start');
    expect(container.style.alignItems).toBe('flex-start');
    expect(container.style.textAlign).toBe('left');
  });

  test('username text effects wrap only the actual username characters', async () => {
    const textEffectsPath = path.join(__dirname, '../plugins/lastevent-spotlight/lib/text-effects.js');
    const TextEffects = require(textEffectsPath);
    window.TextEffects = TextEffects;
    global.requestAnimationFrame = jest.fn(() => 1);
    global.cancelAnimationFrame = jest.fn();

    const renderer = new TemplateRenderer(container, {
      showProfilePicture: false,
      showUsername: true,
      usernameEffect: 'wave'
    });

    await renderer.render({
      uniqueId: 'testuser',
      nickname: 'Ab',
      eventType: 'follower',
      label: 'Follower'
    });

    expect(container.querySelector('.username').textContent).toBe('Ab');
    expect(container.querySelectorAll('.username .wave-char')).toHaveLength(2);
  });

  test('username text effects keep multi-code-point grapheme clusters together', async () => {
    const textEffectsPath = path.join(__dirname, '../plugins/lastevent-spotlight/lib/text-effects.js');
    const TextEffects = require(textEffectsPath);
    window.TextEffects = TextEffects;
    global.requestAnimationFrame = jest.fn(() => 1);
    global.cancelAnimationFrame = jest.fn();

    const renderer = new TemplateRenderer(container, {
      showProfilePicture: false,
      showUsername: true,
      usernameEffect: 'wave'
    });

    const familyEmoji = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';
    const nickname = `A${familyEmoji}B`;
    const expectedGraphemes = ['A', familyEmoji, 'B'];

    await renderer.render({
      uniqueId: 'testuser',
      nickname,
      eventType: 'follower',
      label: 'Follower'
    });

    const wrappedChars = Array.from(container.querySelectorAll('.username .wave-char')).map(node => node.textContent);
    expect(wrappedChars).toEqual(expectedGraphemes);
    expect(container.querySelector('.username').textContent).toBe(nickname);
  });

  test('username styles include unicode-safe font fallbacks for OBS/browser rendering', async () => {
    const renderer = new TemplateRenderer(container, {
      showProfilePicture: false,
      showUsername: true,
      fontFamily: 'Exo 2'
    });

    await renderer.render({
      uniqueId: 'unicode-user',
      nickname: 'Łukasz ❤️',
      eventType: 'follower',
      label: 'Follower'
    });

    const usernameStyle = container.querySelector('.username').getAttribute('style');
    expect(usernameStyle).toContain('Segoe UI Emoji');
    expect(usernameStyle).toContain('sans-serif');
  });

  test('rendering null clears active text effects', async () => {
    const textEffectsPath = path.join(__dirname, '../plugins/lastevent-spotlight/lib/text-effects.js');
    const TextEffects = require(textEffectsPath);
    window.TextEffects = TextEffects;
    global.requestAnimationFrame = jest.fn(() => 1);
    global.cancelAnimationFrame = jest.fn();

    const renderer = new TemplateRenderer(container, {
      showProfilePicture: false,
      showUsername: true,
      usernameEffect: 'wave',
      hideOnNullUser: true
    });

    await renderer.render({
      uniqueId: 'testuser',
      nickname: 'Ab',
      eventType: 'follower',
      label: 'Follower'
    });

    expect(renderer.textEffects.activeEffects.size).toBe(1);

    await renderer.render(null);

    expect(renderer.textEffects.activeEffects.size).toBe(0);
  });
});
