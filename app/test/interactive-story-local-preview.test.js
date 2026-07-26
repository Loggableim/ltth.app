const fs = require('fs');
const path = require('path');
const {
  isPublicQuickTunnelHostname,
  postJsonLocalOnly
} = require('../public/js/public-overlay-render-mode');

describe('Interactive Story local vote preview', () => {
  test('wires the shipped test control to the local voting-preview workflow', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'interactive-story', 'ui.html'), 'utf8');

    expect(source).toContain("document.getElementById('testChoicesPreviewBtn')?.addEventListener('click', testChoicesPreview)");
    expect(source).toContain("socket.emit('story:voting-started'");
    expect(source).toContain("socket.emit('story:vote-update'");
  });

  test('keeps local position saving available', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });

    const result = await postJsonLocalOnly(
      '/api/interactive-story/overlay-positions',
      { positions: { title: { top: 10, left: 20 } } },
      {
        hostname: '127.0.0.1',
        fetchImpl
      }
    );

    expect(result).toEqual({
      skipped: false,
      response: { ok: true }
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/interactive-story/overlay-positions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions: { title: { top: 10, left: 20 } }
        })
      }
    );
  });

  test('does not issue a position write in public Quick Tunnel render mode', async () => {
    const fetchImpl = jest.fn();

    await expect(postJsonLocalOnly(
      '/api/interactive-story/overlay-positions',
      { positions: {} },
      {
        hostname: 'quiet-river.trycloudflare.com',
        fetchImpl
      }
    )).resolves.toEqual({ skipped: true, response: null });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(isPublicQuickTunnelHostname('trycloudflare.com')).toBe(false);
    expect(isPublicQuickTunnelHostname('trycloudflare.com.example.org')).toBe(false);
  });

  test('the shipped overlay uses the local-only write guard', () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'plugins',
        'interactive-story',
        'overlay.html'
      ),
      'utf8'
    );

    expect(source).toContain(
      '<script src="/js/public-overlay-render-mode.js"></script>'
    );
    expect(source).toContain(
      'LTTHPublicOverlayRenderMode.postJsonLocalOnly('
    );
    expect(source).toContain(
      'LTTHPublicOverlayRenderMode.isPublicQuickTunnelHostname('
    );
  });
});
