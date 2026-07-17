const fs = require('fs');
const path = require('path');

const ui = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');

describe('interactive games admin UI contract', () => {
  test('renders now-on-stream, host queue, and background matches', () => {
    expect(ui).toContain('id="interactive-now-on-stream"');
    expect(ui).toContain('id="interactive-matchup"');
    expect(ui).toContain('id="interactive-board-preview"');
    expect(ui).toContain('id="interactive-host-queue"');
    expect(ui).toContain('id="interactive-background-matches"');
  });

  test('submits revisioned Connect4 and chess host moves', () => {
    expect(ui).toContain("socket.emit('game-engine:interactive-host-move'");
    expect(ui).toContain('sessionRevision: display.sessionRevision');
    expect(ui).toContain('displayRevision: display.displayRevision');
    expect(ui).toContain('data-interactive-column');
    expect(ui).toContain('interactiveSelectedChessSquare');
  });

  test('consumes authoritative state and persists interactive settings', () => {
    expect(ui).toContain("socket.on('game-engine:interactive-state'");
    expect(ui).toContain("fetch('/api/game-engine/interactive/state')");
    expect(ui).toContain("fetch('/api/game-engine/config/interactive'");
    expect(ui).toContain('connect4ViewerResponseSeconds');
    expect(ui).toContain('chessViewerResponseSeconds');
    expect(ui).toContain('maxConcurrentInteractiveSessions');
    expect(ui).toContain('interactiveResultDisplaySeconds');
  });

  test('keeps every inline admin script syntactically valid', () => {
    const scripts = [...ui.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, source] of scripts) expect(() => new Function(source)).not.toThrow();
  });
});
