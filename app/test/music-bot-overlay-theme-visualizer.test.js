const fs = require('fs');
const path = require('path');

describe('Music Bot overlay theme engine', () => {
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

  test('does not ship the inert MPV-incompatible visualizer', () => {
    expect(overlayHtml).not.toContain('visualizer-canvas');
    expect(overlayHtml).not.toContain('AudioContext');
    expect(overlayHtml).not.toContain('createAnalyser()');
    expect(overlayHtml).not.toContain('getByteFrequencyData');
    expect(overlayHtml).not.toContain('musicBotVisualizerAudio');
    expect(overlayHtml).not.toContain('requestAnimationFrame(draw)');
  });

  test('renders viewer-provided queue labels as text instead of HTML', () => {
    expect(overlayHtml).toContain('function renderTrackList(container, songs, itemClass)');
    expect(overlayHtml).toContain('item.textContent = `${i + 1}. ${label}`;');
    expect(overlayHtml).toContain('container.replaceChildren(fragment);');
    expect(overlayHtml).not.toContain('upNextItems.innerHTML');
    expect(overlayHtml).not.toContain('r.queueItems.innerHTML');
  });

  test('shows an initial idle message so a newly added OBS source is visible', () => {
    expect(overlayHtml).toContain('function showIdleMessage()');
    expect(overlayHtml).toContain("socket.on('connect', () => {");
    expect(overlayHtml).toContain('showIdleMessage();');
  });
});
