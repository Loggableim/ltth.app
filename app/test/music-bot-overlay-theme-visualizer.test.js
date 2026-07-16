const fs = require('fs');
const path = require('path');

describe('Music Bot overlay theme and layout engine', () => {
  let overlayHtml;

  beforeAll(() => {
    overlayHtml = fs.readFileSync(
      path.join(__dirname, '../plugins/music-bot/overlay.html'),
      'utf8'
    );
  });

  test('supports required theme names in URL parsing', () => {
    expect(overlayHtml).toContain('const allowedThemes = new Set');
    expect(overlayHtml).toContain("'default'");
    expect(overlayHtml).toContain("'cyberpunk'");
    expect(overlayHtml).toContain("'minimal'");
    expect(overlayHtml).toContain("'neon'");
    expect(overlayHtml).toContain('themeAliases');
    expect(overlayHtml).toContain("glass: 'default'");
    expect(overlayHtml).toContain("sunset: 'cyberpunk'");
  });

  test('supports all configured overlay layouts', () => {
    expect(overlayHtml).toContain("const allowedDesigns = new Set(['compact', 'fullwidth', 'minimal', 'card'])");
    expect(overlayHtml).toContain('id="widget-compact"');
    expect(overlayHtml).toContain('id="widget-fullwidth"');
    expect(overlayHtml).toContain('id="widget-minimal"');
    expect(overlayHtml).toContain('id="widget-card"');
  });

  test('renders queued song labels through textContent instead of HTML injection', () => {
    expect(overlayHtml).toContain("const item = document.createElement('div');");
    expect(overlayHtml).toContain('item.textContent = `${i + 1}. ${label}`;');
    expect(overlayHtml).toContain('container.replaceChildren(fragment);');
  });

  test('shows an initial idle message so a newly added OBS source is visible', () => {
    expect(overlayHtml).toContain('function showIdleMessage()');
    expect(overlayHtml).toContain("socket.on('connect', () => {");
    expect(overlayHtml).toContain('showIdleMessage();');
  });
});
