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
    expect(html).toContain('forwardInteractiveSnapshot(frame, interactiveState);');
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

  test('overlays never invent a display from the active session list', () => {
    const unified = readOverlay('unified.html');
    const connect4 = readOverlay('connect4.html');

    expect(unified).toContain('function interactiveOverlayPresentation(');
    expect(unified).not.toContain('state?.activeSessions?.length === 1');
    expect(unified).not.toContain('viewerTurnSession');
    expect(unified).toContain('switchToGame(presentationDisplay.gameType, interactiveState);');
    expect(connect4).toContain('function interactiveConnect4Presentation(');
    expect(connect4).not.toContain('state?.activeSessions?.length === 1');
    expect(connect4).not.toContain('viewerTurnSession');
    expect(connect4).toContain("socket.emit('game-engine:request-state');");
  });

  test('overlays render the authoritative leaderboard phase and clear it for newer boards', () => {
    const unified = readOverlay('unified.html');
    const connect4 = readOverlay('connect4.html');
    const chess = readOverlay('chess.html');

    expect(unified).toContain("'leaderboard'");
    expect(unified).toContain("presentationDisplay.phase === 'leaderboard'");
    expect(connect4).toContain("display.phase === 'leaderboard'");
    expect(connect4).toContain('showLeaderboard(display.gameType, display.leaderboard.type, displayRevision);');
    expect(chess).toContain("display.phase === 'leaderboard'");
    expect(chess).toContain("socket.emit('game-engine:request-state');");
  });

  test('live player names and status text are not overwritten by translations', () => {
    const connect4 = readOverlay('connect4.html');
    const chess = readOverlay('chess.html');

    expect(connect4).not.toMatch(/id="(?:game-title|game-status|player1-name|player2-name)"\s+data-i18n=/);
    expect(chess).not.toMatch(/id="(?:black-name|white-name|game-over-title)"\s+data-i18n=/);
  });

  test('newer Connect4 revisions cancel all local result and leaderboard presentation', () => {
    const html = readOverlay('connect4.html');

    expect(html).toContain('function clearInteractivePresentation()');
    expect(html).toContain('clearInteractivePresentation();');
    expect(html).toContain('function showResult(data, { authoritative = false, suppressEffects = false } = {})');
    expect(html).toContain('{ authoritative: true, suppressEffects }');
    expect(html).toContain('applyInteractiveSnapshot(latestInteractiveState, { force: true, suppressEffects: true })');
    expect(html).toContain('if (!authoritative)');
    expect(html).not.toContain('interactiveLeaderboardTimer = setTimeout');
  });

  test('direct Connect4 owns the sole compact revision-cleared viewer countdown', () => {
    const direct = readOverlay('connect4.html');
    const unified = readOverlay('unified.html');
    const unifiedMatchup = unified.match(/function showInteractiveMatchup\([\s\S]*?function hideInteractiveMatchup/)?.[0] || '';

    expect(direct).toContain('id="interactive-viewer-countdown"');
    expect(direct).toContain('viewerDeadlineMs');
    expect(direct).toContain('serverTimestamp');
    expect(direct).toContain('connect4ViewerWarningSeconds');
    expect(direct).toContain('clearInteractiveViewerCountdown');
    expect(unified).toContain('id="frame-connect4"');
    expect(unified).toContain('forwardInteractiveSnapshot(frame, interactiveState)');
    expect(unified).not.toContain('id="interactive-viewer-countdown"');
    expect(unified).not.toContain('interactiveViewerCountdownInterval');
    expect(unified).not.toContain('startInteractiveViewerCountdown');
    expect(unifiedMatchup).not.toContain('viewerDeadlineMs');
  });

  test('direct Connect4 move audio is deduplicated by session and move number', () => {
    const html = readOverlay('connect4.html');

    expect(html).toContain('highestAudibleMoveBySession');
    expect(html).toMatch(/lastMove\?\.moveNumber/);
    expect(html).toContain('highestAudibleMoveBySession.get(sessionId)');
  });

  test('Connect4 stores enabled state and optional URLs in its audio event map', () => {
    const html = readOverlay('connect4.html');

    expect(html).toContain('function applyAudioSettings(settings)');
    expect(html).toContain('enabled: setting?.enabled !== false');
    expect(html).toContain('if (setting?.url) entry.url = setting.url;');
    expect(html).toContain("if (audioSettingsByEvent.get(mediaEvent)?.enabled === false) return false;");
    expect(html).toContain('connect4AudioSettingsGeneration');
    expect(html).toContain('generation !== connect4AudioSettingsGeneration');
  });

  test('wheel guards every configured sound event with enriched enabled state', () => {
    const html = readOverlay('wheel.html');

    expect(html).toContain('function applyAudioSettings(settings)');
    expect(html).toContain('function playWheelEventSound(audioEvent, audioElement)');
    expect(html).toContain('wheelAudioSettingsGeneration');
    expect(html).toContain('scopeId !== String(currentWheelId)');
    for (const event of ['spinning', 'prize1', 'prize2', 'prize3', 'lost']) {
      expect(html).toContain(`${event}:`);
    }
  });

  test('slot guards every configured sound event and reloads state-only socket updates', () => {
    const html = readOverlay('slot.html');

    expect(html).toContain('function applyAudioSettings(settings)');
    expect(html).toContain('async function loadAudioSettings(machineId)');
    expect(html).toContain('slotAudioSettingsGeneration');
    expect(html).toContain('pendingSpinAudioIntent');
    expect(html).toContain("if (audioSettingsByEvent.get(audioType)?.enabled === false) return false;");
    for (const event of ['spin', 'small_win', 'medium_win', 'big_win', 'jackpot', 'near_miss', 'reel_stop']) {
      expect(html).toContain(`${event}:`);
    }
    expect(html).toContain("socket.on('slot:audio-updated', async (data) =>");
  });

  test('authoritative cancellations render neutral results instead of a winner or draw', () => {
    const connect4 = readOverlay('connect4.html');
    const chess = readOverlay('chess.html');

    expect(connect4).toContain("if (data.reason === 'cancelled')");
    expect(connect4).toContain("runtimeText('plugins.game-engine.runtime.common.cancelled')");

    const interactiveResultStart = chess.indexOf('function showInteractiveResult(result)');
    const interactiveResultEnd = chess.indexOf('function hideInteractiveLeaderboard()', interactiveResultStart);
    const interactiveResult = chess.slice(interactiveResultStart, interactiveResultEnd);

    expect(interactiveResult).toMatch(
      /if \(result\.reason === 'cancelled'\)[\s\S]*?winnerName\.textContent = '';[\s\S]*?return;[\s\S]*?title\.textContent = winner \?/
    );
    expect(interactiveResult).toContain("runtimeText('plugins.game-engine.runtime.common.cancelled')");
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
