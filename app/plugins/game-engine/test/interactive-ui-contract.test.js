const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

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
    expect(ui).toContain('connect4ViewerTimeoutEnabled');
    expect(ui).toContain('connect4ViewerResponseSeconds');
    expect(ui).toContain('connect4ViewerWarningSeconds');
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

  test('submits revisioned cancellation and host-turn skip controls from authoritative dashboard state', () => {
    expect(ui).toContain("socket.emit('game-engine:cancel-game'");
    expect(ui).toContain("socket.emit('game-engine:interactive-skip-host-turn'");
    expect(ui).toContain('gameType: display.gameType');
    expect(ui).toContain('sessionRevision: display.sessionRevision');
    expect(ui).toContain('displayRevision: display.displayRevision');
    expect(ui).toContain('interactiveCancellationEnvelope(state, session.sessionId)');
    expect(ui).toContain("'plugins.game-engine.runtime.dashboard.cancel_confirm'");
    expect(ui).toContain("'plugins.game-engine.runtime.dashboard.skip_confirm'");
  });

  test('shows only applicable admin controls and labels the streamer side dynamically', () => {
    expect(ui).toContain('function interactiveStreamerRoleLabel(');
    expect(ui).toContain("streamerRole === 'player1'");
    expect(ui).toContain("streamerRole === 'white'");
    expect(ui).toContain('cancelButton.hidden =');
    expect(ui).toContain('skipButton.hidden =');
  });

  test('offers all chess promotion pieces and removes obsolete challenge controls', () => {
    expect(ui).toContain('id="interactive-chess-promotion"');
    for (const piece of ['q', 'r', 'b', 'n']) {
      expect(ui).toContain(`data-promotion-piece="${piece}"`);
    }
    expect(ui).toContain('function showInteractivePromotionChooser(');
    expect(ui).toContain('function submitInteractiveHostPromotion(');
    expect(ui).not.toContain('id="chess-challenge-screen"');
    expect(ui).not.toContain('id="chess-challenge-timeout"');
  });

  test('renders canonical Connect4 timer settings read-only and shows the untimed label', () => {
    expect(ui).toContain('id="interactive-connect4-response" type="text" readonly');
    expect(ui).toContain("runtimeText('plugins.game-engine.runtime.dashboard.no_time_limit')");
    expect(ui).not.toContain("runtimeText('plugins.game-engine.runtime.dashboard.no_time_limit') ||");
    expect(ui).not.toContain("connect4ViewerResponseSeconds: Number(document.getElementById('interactive-connect4-response').value)");
    expect(ui).not.toContain("fetch('/api/game-engine/round-timer/connect4'");
  });

  test('applies server-returned canonical timer values after save and renders timed and untimed states', () => {
    const functionSource = ui.match(/    function applyInteractiveSettings\(config\) \{[\s\S]*?\n    \}/)?.[0];
    expect(functionSource).toEqual(expect.any(String));
    const dom = new JSDOM(`
      <input id="interactive-connect4-response">
      <input id="interactive-chess-response">
      <input id="interactive-max-sessions">
      <input id="interactive-result-seconds">
    `);
    const apply = new Function(
      'document',
      'runtimeText',
      `${functionSource}; return applyInteractiveSettings;`
    )(dom.window.document, (key, params = {}) => key.endsWith('no_time_limit')
      ? 'No time limit'
      : `${params.seconds}s · ${params.warningSeconds}s`);
    const connect4 = dom.window.document.getElementById('interactive-connect4-response');

    apply({
      connect4ViewerTimeoutEnabled: true,
      connect4ViewerResponseSeconds: 45,
      connect4ViewerWarningSeconds: 12
    });
    expect(connect4.value).toContain('45s');
    expect(connect4.value).toContain('12s');

    apply({ connect4ViewerTimeoutEnabled: false });
    expect(connect4.value).toBe('No time limit');
    expect(ui).toContain('const savedConfig = (await response.json()).config;');
    expect(ui).toContain('applyInteractiveSettings(savedConfig);');
  });

  test('renders the sole viewer-turn session when no host move is displayed', () => {
    expect(ui).toContain('function interactiveFallbackSession(');
    expect(ui).toContain("display?.phase !== 'idle'");
    expect(ui).toContain('const fallbackSession = interactiveFallbackSession(state);');
    expect(ui).toContain('const gameType = display.gameType || fallbackSession?.gameType || null;');
    expect(ui).toContain('interactiveTimerLabel(display, fallbackSession)');
  });

  test('uses dedicated namespaced interactive copy instead of legacy Connect4 translations', () => {
    expect(ui).toContain('data-i18n="plugins.game-engine.ui.interactive.title">Interactive Games</h3>');
    expect(ui).toContain('id="game-status" data-i18n="plugins.game-engine.ui.interactive.waiting_for_move"');
    expect(ui).not.toContain('data-i18n="game_engine.connect4_running"');
  });

  test('keeps every inline admin script syntactically valid', () => {
    const scripts = [...ui.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, source] of scripts) expect(() => new Function(source)).not.toThrow();
  });

  test('language replay prioritizes active interactive state, then legacy game, then idle', () => {
    const functionSource = ui.match(/    function localizedAdminReplayTarget\([\s\S]*?\n    \}/)?.[0];
    expect(functionSource).toEqual(expect.any(String));
    const selectTarget = new Function(`${functionSource}; return localizedAdminReplayTarget;`)();
    const idle = { activeSessions: [], display: { phase: 'idle' } };
    const active = { activeSessions: [{ sessionId: 1 }], display: { phase: 'playing' } };

    expect(selectTarget(active, { sessionId: 9 })).toBe('interactive');
    expect(selectTarget(idle, { sessionId: 9 })).toBe('legacy');
    expect(selectTarget(idle, null)).toBe('idle');
    expect(selectTarget(null, null)).toBe(null);
  });

  test('renders one shared localized audio toggle contract for Connect4, wheel, and slot rows', () => {
    expect(ui).toContain('class="secondary audio-toggle-btn"');
    expect(ui).toContain('function renderAudioToggle(button, enabled)');
    expect(ui).toContain("'plugins.game-engine.ui.audio.enabled'");
    expect(ui).toContain("'plugins.game-engine.ui.audio.disabled'");
    expect(ui).toContain("'plugins.game-engine.ui.audio.enable'");
    expect(ui).toContain("'plugins.game-engine.ui.audio.disable'");
    expect(ui).toContain("e.target.closest('.audio-toggle-btn')");

    for (const event of [
      'new_challenger', 'challenge_accepted', 'piece_drop', 'player_1_wins',
      'player_2_wins', 'game_over', 'timer_warning'
    ]) {
      expect(ui).toContain(`data-audio-event="${event}"`);
    }
    expect(ui).toContain("const audioTypes = ['spinning', 'prize1', 'prize2', 'prize3', 'lost'];");
    expect(ui).toContain("type: 'reel_stop'");
  });

  test('sends the inverse enabled state through the shared audio-state endpoint', async () => {
    const functionSource = ui.match(/    async function setAudioEventEnabled\(button\) \{[\s\S]*?\n    \}/)?.[0];
    expect(functionSource).toEqual(expect.any(String));
    const fetch = jest.fn(() => Promise.resolve({ ok: true }));
    const renderAudioToggle = jest.fn();
    const setAudioEventEnabled = new Function(
      'fetch',
      'renderAudioToggle',
      `${functionSource}; return setAudioEventEnabled;`
    )(fetch, renderAudioToggle);
    const button = {
      dataset: {
        gameType: 'wheel',
        audioEvent: 'prize2',
        scopeId: '7',
        enabled: 'true'
      }
    };

    await setAudioEventEnabled(button);

    expect(fetch).toHaveBeenCalledWith('/api/game-engine/audio-state/wheel/prize2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scopeId: '7', enabled: false })
    });
    expect(button.dataset.enabled).toBe('false');
    expect(renderAudioToggle).toHaveBeenCalledWith(button, false);
  });

  test('renders toggle state from enriched settings without coupling preview to mute state', () => {
    expect(ui).toContain('renderAudioToggle(button, item.enabled !== false);');
    expect(ui).toContain('renderAudioToggle(button, setting?.enabled !== false);');
    expect(ui).toContain('renderAudioToggle(button, setting.enabled !== false);');
    expect(ui).toContain('function previewMediaAudio(audioPath)');
    expect(ui).toContain('function previewWheelAudio(audioType)');
    const mediaPreview = ui.match(/    function previewMediaAudio\(audioPath\) \{[\s\S]*?\n    \}/)?.[0] || '';
    const wheelPreview = ui.match(/    function previewWheelAudio\(audioType\) \{[\s\S]*?\n    \}/)?.[0] || '';
    expect(mediaPreview).not.toContain('dataset.enabled');
    expect(wheelPreview).not.toContain('dataset.enabled');
  });
});
