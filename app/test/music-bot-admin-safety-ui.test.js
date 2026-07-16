const fs = require('fs');
const path = require('path');

describe('Music Bot admin safety UI', () => {
  let html;
  let script;

  beforeAll(() => {
    const root = path.join(__dirname, '..', 'plugins', 'music-bot');
    html = fs.readFileSync(path.join(root, 'ui.html'), 'utf8');
    script = fs.readFileSync(path.join(root, 'assets', 'ui.js'), 'utf8');
  });

  test('exposes emergency stop, persistent lock, player reset, test tone and diagnostics', () => {
    [
      'musicbot-safety-panel',
      'safety-lock-status',
      'emergency-stop-btn',
      'safety-unlock-btn',
      'player-reset-btn',
      'test-tone-btn',
      'health-refresh-btn',
      'diagnostics-export-btn',
      'health-ipc-latency',
      'health-media-title',
      'health-cache'
    ].forEach((id) => expect(html).toContain(`id="${id}"`));
    expect(script).toContain("post('/emergency-stop'");
    expect(script).toContain("post('/safety-lock', { locked: false }");
    expect(script).toContain("post('/player/reset'");
    expect(script).toContain("post('/player/test-tone'");
    expect(script).toContain("get('/diagnostics')");
  });

  test('updates lock and health state from additive socket snapshots', () => {
    expect(script).toContain("socket.on('musicbot:runtime'");
    expect(script).toContain("socket.on('musicbot:resolver'");
    expect(script).toContain("socket.on('musicbot:health'");
    expect(script).toContain('function renderSafetyState');
    expect(script).toContain('function renderHealth');
    expect(script).toContain("document.documentElement.toggleAttribute('data-musicbot-locked'");
  });

  test('disables playback-producing controls while locked but keeps request controls active', () => {
    expect(script).toContain("document.querySelectorAll('[data-playback-action]')");
    expect(html).toContain('id="resume-btn" class="btn icon-btn primary" data-playback-action');
    expect(html).toContain('id="skip-btn" class="btn icon-btn ghost" data-playback-action');
    expect(html).not.toContain('id="request-btn" class="btn primary" data-playback-action');
  });

  test('validates thumbnail and preview YouTube IDs before constructing URLs', () => {
    expect(script).toContain('function isValidYouTubeId');
    expect(script).toContain('isValidYouTubeId(item.youtubeId)');
    expect(script).toContain('if (!previewFrame || !isValidYouTubeId(youtubeId)) return;');
  });

  test('resets inactive tabs to tabindex minus one', () => {
    expect(script).toContain("t.setAttribute('tabindex', isActive ? '0' : '-1');");
  });

  test('keeps safety, health and ban-menu keys in DE, EN, ES and FR', () => {
    const root = path.join(__dirname, '..', 'plugins', 'music-bot', 'locales');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(path.join(root, `${locale}.json`), 'utf8'));
      expect(translations.music_bot.ui.safety).toEqual(expect.objectContaining({
        emergencyStop: expect.any(String),
        unlock: expect.any(String),
        reset: expect.any(String),
        testTone: expect.any(String)
      }));
      expect(translations.music_bot.ui.health).toEqual(expect.objectContaining({
        refresh: expect.any(String),
        export: expect.any(String),
        ipcLatency: expect.any(String),
        mediaTitle: expect.any(String),
        cache: expect.any(String)
      }));
      expect(translations.music_bot.ui.banMenu).toEqual(expect.objectContaining({
        track: expect.any(String),
        artist: expect.any(String),
        channel: expect.any(String),
        keyword: expect.any(String)
      }));
    }
  });

  test('offers an accessible authoritative ban menu on current, queue and history tracks', () => {
    expect(html).toContain('id="track-ban-menu"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    ['track', 'artist', 'channel', 'keyword'].forEach((scope) => {
      expect(html).toContain(`data-track-ban-scope="${scope}"`);
    });
    expect(script).toContain("post('/bans/from-track'");
    expect(script).toContain("aria-haspopup=\"dialog\"");
    expect(script).toContain("if (event.key === 'Escape')");
    expect(script).toContain("if (event.key === 'Tab')");
    expect(script).toContain("['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']");
    expect(script).toContain('trackBanReturnFocus?.focus();');
  });
});
