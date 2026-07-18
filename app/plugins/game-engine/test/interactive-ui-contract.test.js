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
    expect(ui).toContain('#interactive-connect4-controls[hidden]');
  });

  test('submits revisioned Connect4 and chess host moves', () => {
    expect(ui).toContain("socket.emit('game-engine:interactive-host-move'");
    expect(ui).toContain('sessionRevision: display.sessionRevision');
    expect(ui).toContain('displayRevision: display.displayRevision');
    expect(ui).toContain('data-interactive-column');
    expect(ui).toContain('interactiveSelectedChessSquare');
    expect(ui).toContain('function refreshInteractiveClocks()');
    expect(ui).not.toContain('if (latestInteractiveAdminState) renderInteractiveState(latestInteractiveAdminState);');
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

  test('keeps one viewer-turn session cancelable when no host move is displayed', () => {
    expect(ui).toContain('function interactiveCancelableSessionId(');
    expect(ui).toContain('state?.activeSessions?.length === 1');
    expect(ui).toContain('const sessionId = interactiveCancelableSessionId(state);');
    expect(ui).toContain('interactiveCancelableSessionId(latestInteractiveAdminState)');
  });

  test('renders the sole viewer-turn session when no host move is displayed', () => {
    expect(ui).toContain('function interactiveFallbackSession(');
    expect(ui).toContain("display?.phase !== 'idle'");
    expect(ui).toContain('const fallbackSession = interactiveFallbackSession(state);');
    expect(ui).toContain('const gameType = display.gameType || fallbackSession?.gameType || null;');
    expect(ui).toContain('interactiveTimerLabel(display, fallbackSession)');
  });

  test('uses interactive copy that cannot be overwritten by legacy Connect4 translations', () => {
    expect(ui).toContain('<h3>Interactive Games</h3>');
    expect(ui).toContain('<p id="game-status">Waiting for move…</p>');
    expect(ui).not.toContain('data-i18n="game_engine.connect4_running"');
    expect(ui).not.toContain('id="game-status" data-i18n=');
  });

  test('keeps every inline admin script syntactically valid', () => {
    const scripts = [...ui.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, source] of scripts) expect(() => new Function(source)).not.toThrow();
  });
});
