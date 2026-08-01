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

  test('renders Connect4 master mute controls and persists them with the game settings', () => {
    expect(ui).toContain('id="connect4-sound-enabled"');
    expect(ui).toContain('id="connect4-sound-volume"');
    expect(ui).toContain("soundEnabled: document.getElementById('connect4-sound-enabled').checked");
    expect(ui).toContain("soundVolume: parseFloat(document.getElementById('connect4-sound-volume').value)");
    expect(ui).toContain("document.getElementById('connect4-sound-enabled').checked = config.soundEnabled");
    expect(ui).toContain("document.getElementById('connect4-sound-volume').value = config.soundVolume");
  });

  test('renders Connect4 timeout lockout controls and server-backed unlock actions', () => {
    expect(ui).toContain('id="connect4-timeout-lockout-minutes"');
    expect(ui).toContain('id="connect4-timeout-lockouts"');
    expect(ui).toContain('min="0" max="10080" step="1"');
    expect(ui).toContain("timeoutLockoutMinutes: Number(document.getElementById('connect4-timeout-lockout-minutes').value)");
    expect(ui).toContain("document.getElementById('connect4-timeout-lockout-minutes').value = config.timeoutLockoutMinutes");
    expect(ui).toContain('async function loadConnect4TimeoutLockouts()');
    expect(ui).toContain("fetch('/api/game-engine/connect4/lockouts')");
    expect(ui).toContain("'/api/game-engine/connect4/lockouts/' + encodeURIComponent(username)");
    expect(ui).toContain('username.textContent = lockout.username;');
    expect(ui).toContain("button.addEventListener('click', () => unlockConnect4Player(lockout.username));");
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

  test('keeps a background viewer timer visually paused across same-state rerenders', () => {
    const functionSource = ui.match(
      /    function renderInteractiveBackground\(state\) \{[\s\S]*?\r?\n    \}(?=\r?\n\r?\n    function renderInteractiveState)/
    )?.[0];
    expect(functionSource).toEqual(expect.any(String));
    const dom = new JSDOM('<div id="interactive-background-matches"></div>');
    let now = 1000000;
    const DateStub = { now: () => now };
    const interactiveElement = (tag, className = '', text = '') => {
      const element = dom.window.document.createElement(tag);
      element.className = className;
      element.textContent = text;
      return element;
    };
    const runtimeText = (key, params = {}) => {
      if (key.endsWith('viewer_timer')) return `viewer timer ${params.time}`;
      if (key.endsWith('background_summary')) return `${params.player}: ${params.timer}`;
      return key;
    };
    const render = new Function(
      'document',
      'Date',
      'runtimeText',
      'interactiveFormatDuration',
      'interactiveElement',
      'renderInteractiveBoard',
      'interactiveCancelButton',
      `const interactiveAdminStateReceivedAt = 1000000; ${functionSource}; return renderInteractiveBackground;`
    )(
      dom.window.document,
      DateStub,
      runtimeText,
      milliseconds => `${milliseconds}ms`,
      interactiveElement,
      () => {},
      () => dom.window.document.createElement('button')
    );
    const state = {
      serverTimestamp: 1000000,
      display: { displaySessionId: 99 },
      activeSessions: [{
        sessionId: 1,
        gameType: 'connect4',
        viewerDisplayName: 'Paused Viewer',
        hostDisplayName: 'Host',
        turnRole: 'viewer',
        viewerTimeRemainingMs: 5000,
        lastActivityAt: 999000,
        moveCount: 1,
        state: { board: [[0]] }
      }]
    };

    render(state);
    const initial = dom.window.document.querySelector('summary').textContent;
    now += 2000;
    render(state);

    expect(initial).toContain('5000ms');
    expect(dom.window.document.querySelector('summary').textContent).toBe(initial);
    dom.window.close();
  });

  test('uses dedicated namespaced interactive copy instead of legacy Connect4 translations', () => {
    expect(ui).toContain('data-i18n="plugins.game-engine.ui.interactive.title">Interactive Games</h3>');
    expect(ui).toContain('id="game-status" data-i18n="plugins.game-engine.ui.interactive.waiting_for_move"');
    expect(ui).not.toContain('data-i18n="game_engine.connect4_running"');
  });


  test('persists Chess streamer autoplay settings with safe defaults', () => {
    expect(ui).toContain('id="chess-autoplay-enabled"');
    expect(ui).toContain('id="chess-autoplay-elo-offset" value="0" min="-400" max="400"');
    expect(ui).toContain('id="chess-autoplay-move-delay" value="750" min="250" max="5000"');
    expect(ui).toContain("autoplay: {");
    expect(ui).toContain("enabled: document.getElementById('chess-autoplay-enabled').checked");
    expect(ui).toContain("eloOffset: parseInt(document.getElementById('chess-autoplay-elo-offset').value)");
    expect(ui).toContain("moveDelayMs: parseInt(document.getElementById('chess-autoplay-move-delay').value)");
    expect(ui).toContain("document.getElementById('chess-autoplay-enabled').checked = autoplay.enabled");
    expect(ui).toContain("document.getElementById('chess-autoplay-elo-offset').value = autoplay.eloOffset");
    expect(ui).toContain("document.getElementById('chess-autoplay-move-delay').value = autoplay.moveDelayMs");
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
    expect(ui).toContain('plugins.game-engine.ui.audio.save_custom_sound');
    expect(ui).toContain("e.target.closest('.audio-toggle-btn')");

    const connect4Events = [
      'new_challenger', 'challenge_accepted', 'piece_drop', 'player_1_wins',
      'player_2_wins', 'game_over', 'timer_warning'
    ];
    const wheelEvents = ['spinning', 'prize1', 'prize2', 'prize3', 'lost'];
    const slotEvents = ['spin', 'small_win', 'medium_win', 'big_win', 'jackpot', 'near_miss', 'reel_stop'];
    const dom = new JSDOM(ui);
    const eventsIn = selector => [...dom.window.document.querySelectorAll(selector)]
      .map(button => button.dataset.audioEvent);

    expect(eventsIn('#media-section-connect4 .audio-toggle-btn').sort()).toEqual([...connect4Events].sort());
    expect(eventsIn('#tab-wheel .audio-toggle-btn').sort()).toEqual([...wheelEvents].sort());
    expect(eventsIn('#media-section-wheel .audio-toggle-btn').sort()).toEqual([...wheelEvents].sort());
    const slotMediaRenderer = ui.match(/    async function renderSlotMediaSounds\(machineId\) \{[\s\S]*?\n    \}/)?.[0] || '';
    const slotTabRenderer = ui.match(/    async function renderSlotSoundManagement\(machineId\) \{[\s\S]*?\n    \}/)?.[0] || '';
    const slotAudioTypesSource = ui.match(/    const SLOT_AUDIO_TYPES = \[[\s\S]*?\n    \];/)?.[0] || '';
    const configuredSlotEvents = [...slotAudioTypesSource.matchAll(/type: '([^']+)'/g)]
      .map(([, event]) => event);
    expect(configuredSlotEvents).toEqual(slotEvents);
    expect(slotMediaRenderer).toContain('for (const { type, label, sync } of SLOT_AUDIO_TYPES)');
    expect(slotTabRenderer).toContain('for (const { type, label, sync } of SLOT_AUDIO_TYPES)');
    expect(slotMediaRenderer).toContain("audioToggleMarkup('slot', type, machineId, setting.enabled !== false)");
    expect(slotTabRenderer).toContain("audioToggleMarkup('slot', type, machineId, setting.enabled !== false)");
    dom.window.close();
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
