const fs = require('fs');
const path = require('path');

const overlayDir = path.join(__dirname, '..', 'overlay');

function readOverlay(name) {
  return fs.readFileSync(path.join(overlayDir, name), 'utf8');
}

describe('interactive overlay contract', () => {
  test('unified overlay renders the authoritative matchup and forwards revisioned snapshots', () => {
    const html = readOverlay('unified.html');

    expect(html).toContain('id="interactive-matchup"');
    expect(html).toContain("socket.on('game-engine:interactive-state'");
    expect(html).toContain('display.displayRevision');
    expect(html).toContain("type: 'game-engine:interactive-snapshot'");
    expect(html).toContain("window.location.origin");
    expect(html).toContain('hostDisplayName');
    expect(html).toContain('viewerDisplayName');
    expect(html).toContain('viewerDeadlineMs');
    expect(html).toContain('hostTimeRemainingMs');
  });

  test.each(['connect4.html', 'chess.html'])(
    '%s accepts only same-origin, newer interactive snapshots',
    filename => {
      const html = readOverlay(filename);

      expect(html).toContain("event.origin !== window.location.origin");
      expect(html).toContain("game-engine:interactive-snapshot");
      expect(html).toContain('lastInteractiveDisplayRevision');
      expect(html).toContain('lastInteractiveSessionRevision');
    }
  );

  test('interactive board animations use the configured animation speed', () => {
    expect(readOverlay('connect4.html')).toContain('--interactive-animation-ms');
    expect(readOverlay('chess.html')).toContain('--interactive-animation-ms');
  });

  test('Connect4 leaderboard rotation is suppressed until the host queue is idle', () => {
    const html = readOverlay('connect4.html');

    expect(html).toContain('latestInteractiveQueueIdle');
    expect(html).toContain('if (!latestInteractiveQueueIdle) return;');
  });

  test.each(['unified.html', 'connect4.html', 'chess.html'])(
    '%s contains syntactically valid inline scripts',
    filename => {
      const scripts = [...readOverlay(filename).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
      expect(scripts.length).toBeGreaterThan(0);
      for (const [, source] of scripts) {
        expect(() => new Function(source)).not.toThrow();
      }
    }
  );
});
