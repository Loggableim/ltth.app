const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const overlayDir = path.join(__dirname, '..', 'overlay');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function jsonResponse(body) {
  return { ok: true, json: () => Promise.resolve(body) };
}

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

function loadOverlay(name, i18n = null, options = {}) {
  const listeners = new Map();
  const audioPlay = options.audioPlay || jest.fn(() => Promise.resolve());
  const mediaPlay = options.mediaPlay || jest.fn(() => Promise.resolve());
  const audioSources = [];
  const AudioConstructor = jest.fn(function Audio(src) {
    this.src = src;
    this._listeners = new Map();
    audioSources.push(src);
    this.addEventListener = (event, handler) => this._listeners.set(event, handler);
    this.play = audioPlay;
  });
  const socket = {
    on: jest.fn((event, handler) => listeners.set(event, handler)),
    emit: jest.fn()
  };
  let now = 100000;
  let nextIntervalId = 1;
  let nextTimeoutId = 1;
  const intervals = new Map();
  const timeouts = new Map();
  const source = fs.readFileSync(path.join(overlayDir, name), 'utf8')
    .replace(/<script[^>]+src=[^>]*><\/script>/gi, '');
  const dom = new JSDOM(source, {
    url: `http://localhost/overlay/game-engine/${name.replace('.html', '')}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.io = () => socket;
      window.i18n = i18n || {
        initialized: true,
        t: (key, params = {}) => params.seconds == null ? key : `Viewer: ${params.seconds}s`
      };
      window.fetch = options.fetch || jest.fn(() => new Promise(() => {}));
      window.Date.now = () => now;
      window.setInterval = callback => {
        const id = nextIntervalId++;
        intervals.set(id, callback);
        return id;
      };
      window.clearInterval = id => intervals.delete(id);
      window.setTimeout = (callback, delay = 0) => {
        const id = nextTimeoutId++;
        timeouts.set(id, { callback, delay });
        return id;
      };
      window.clearTimeout = id => timeouts.delete(id);
      window.requestAnimationFrame = jest.fn(() => 1);
      window.cancelAnimationFrame = jest.fn();
      window.Audio = AudioConstructor;
      window.HTMLMediaElement.prototype.play = mediaPlay;
      window.HTMLMediaElement.prototype.pause = jest.fn();
      window.HTMLMediaElement.prototype.load = jest.fn();
      window.HTMLCanvasElement.prototype.getContext = () => ({
        clearRect: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        translate: jest.fn(),
        rotate: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        arc: jest.fn(),
        closePath: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        fillText: jest.fn(),
        measureText: jest.fn(() => ({ width: 100 })),
        createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() }))
      });
    }
  });
  return {
    dom,
    listeners,
    audioPlay,
    mediaPlay,
    AudioConstructor,
    audioSources,
    pendingTimeoutCount: () => timeouts.size,
    advance(milliseconds) {
      now += milliseconds;
      for (const callback of [...intervals.values()]) callback();
    }
  };
}

function connect4State({
  displayRevision = 1,
  sessionRevision = 1,
  sessionId = 7,
  phase = 'playing',
  deadline = 105000,
  moveNumber = 1
} = {}) {
  const board = Array.from({ length: 6 }, () => Array(7).fill(0));
  if (moveNumber > 0) board[5][0] = 1;
  return {
    serverTimestamp: 100000,
    configuration: {
      connect4ViewerTimeoutEnabled: true,
      connect4ViewerResponseSeconds: 30,
      connect4ViewerWarningSeconds: 3
    },
    hostQueue: [],
    activeSessions: [],
    display: {
      displaySessionId: sessionId,
      gameType: 'connect4',
      sessionRevision,
      displayRevision,
      hostDisplayName: 'Host',
      viewerDisplayName: 'Viewer',
      currentTurnRole: 'viewer',
      viewerDeadlineMs: deadline,
      serverTimestamp: 100000,
      phase,
      config: {
        soundEnabled: true,
        soundVolume: 0.5,
        roundWarningTime: 3,
        animationSpeed: 500
      },
      state: {
        sessionId,
        board,
        currentPlayer: 2,
        player1: { username: 'host', nickname: 'Host', role: 'streamer', color: '#f00' },
        player2: { username: 'viewer', nickname: 'Viewer', role: 'viewer', color: '#ff0' },
        moveCount: moveNumber,
        lastMove: moveNumber > 0 ? { player: 1, column: 0, row: 5, moveNumber } : null,
        winner: null,
        winningCells: [],
        status: 'active'
      }
    }
  };
}

function chessState({
  displayRevision = 1,
  sessionRevision = 1,
  sessionId = 11,
  phase = 'playing',
  currentTurnRole = 'host',
  viewerDeadlineMs = null,
  hostTimeRemainingMs = 5000,
  config = {},
  lastMove = { from: 'e2', to: 'e4' },
  inCheck = true,
  capturedPieces = { white: { p: 1 }, black: {} }
} = {}) {
  return {
    serverTimestamp: 100000,
    hostQueue: [],
    activeSessions: [],
    display: {
      displaySessionId: sessionId,
      gameType: 'chess',
      sessionRevision,
      displayRevision,
      hostDisplayName: 'Host',
      viewerDisplayName: 'Viewer',
      currentTurnRole,
      viewerDeadlineMs,
      hostTimeRemainingMs,
      serverTimestamp: 100000,
      phase,
      config: {
        soundEnabled: false,
        soundVolume: 0.5,
        timerWarningTime: 30,
        animationSpeed: 300,
        boardTheme: 'dark',
        backgroundColor: '#1a1a2e',
        whiteColor: '#4CAF50',
        blackColor: '#2196F3',
        fontFamily: 'Arial, sans-serif',
        showCoordinates: true,
        highlightLastMove: true,
        highlightCheck: true,
        showCapturedPieces: true,
        celebrationEnabled: false,
        ...config
      },
      state: {
        sessionId,
        fen: '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1',
        currentPlayer: 'white',
        inCheck,
        whitePlayer: { username: 'host', nickname: 'Host', role: 'streamer' },
        blackPlayer: { username: 'viewer', nickname: 'Viewer', role: 'viewer' },
        timers: { white: 50000, black: 5000 },
        capturedPieces,
        lastMove,
        status: phase === 'result' ? 'completed' : 'active'
      }
    }
  };
}

describe('interactive overlay countdown DOM', () => {
  test('direct Connect4 replays held authoritative text after i18n ready and language changes', async () => {
    let resolveReady;
    let onChange;
    let onLanguageChange;
    let language = 'en';
    const i18n = {
      initialized: false,
      ready: new Promise(resolve => { resolveReady = resolve; }),
      t: jest.fn((key, params = {}) => `${language}: ${params.seconds ?? key}`),
      onChange: callback => { onChange = callback; },
      onLanguageChange: callback => { onLanguageChange = callback; }
    };
    const { dom, listeners, advance } = loadOverlay('connect4.html', i18n);
    const countdown = dom.window.document.getElementById('interactive-viewer-countdown');

    listeners.get('game-engine:interactive-state')(connect4State());
    expect(countdown.textContent).not.toBe('');
    expect(i18n.t).not.toHaveBeenCalled();

    i18n.initialized = true;
    resolveReady();
    await Promise.resolve();
    expect(countdown.textContent).toContain('en:');

    advance(2000);
    expect(countdown.textContent).toContain('3');
    language = 'de';
    onChange();
    expect(countdown.textContent).toContain('de:');
    expect(countdown.textContent).toContain('3');
    language = 'fr';
    onLanguageChange();
    expect(countdown.textContent).toContain('fr:');
    expect(countdown.textContent).toContain('3');
    dom.window.close();
  });

  test('direct Connect4 replays a localized winner result without repeating audio or confetti effects', async () => {
    let resolveReady;
    let onChange;
    let onLanguageChange;
    let language = 'en';
    const i18n = {
      initialized: false,
      ready: new Promise(resolve => { resolveReady = resolve; }),
      t: jest.fn(key => key),
      onChange: callback => { onChange = callback; },
      onLanguageChange: callback => { onLanguageChange = callback; }
    };
    const { dom, listeners, audioPlay, pendingTimeoutCount } = loadOverlay('connect4.html', i18n);
    const resultState = connect4State({ phase: 'result', deadline: null, moveNumber: 0 });
    resultState.display.config.celebrationEnabled = true;
    resultState.display.config.displayTexts = {};
    Object.defineProperty(resultState.display.config.displayTexts, 'labelWin', {
      enumerable: true,
      get: () => `${language}: {player} wins`
    });
    resultState.display.state.status = 'completed';
    resultState.display.state.winner = 1;
    resultState.display.result = {
      sessionId: resultState.display.displaySessionId,
      winner: 1,
      winnerRole: 'host',
      reason: 'win'
    };
    const applyState = listeners.get('game-engine:interactive-state');
    const resultText = dom.window.document.getElementById('result-text');

    applyState(resultState);
    expect(resultText.textContent).toContain('en: Host wins');
    expect(audioPlay).toHaveBeenCalledTimes(1);
    const initialConfettiTimeouts = pendingTimeoutCount();
    expect(initialConfettiTimeouts).toBeGreaterThan(0);

    i18n.initialized = true;
    resolveReady();
    await Promise.resolve();
    expect(resultText.textContent).toContain('en: Host wins');
    expect(audioPlay).toHaveBeenCalledTimes(1);
    expect(pendingTimeoutCount()).toBe(initialConfettiTimeouts);

    language = 'de';
    onChange();
    expect(resultText.textContent).toContain('de: Host wins');
    expect(audioPlay).toHaveBeenCalledTimes(1);
    expect(pendingTimeoutCount()).toBe(initialConfettiTimeouts);

    language = 'fr';
    onLanguageChange();
    expect(resultText.textContent).toContain('fr: Host wins');
    expect(audioPlay).toHaveBeenCalledTimes(1);
    expect(pendingTimeoutCount()).toBe(initialConfettiTimeouts);
    dom.window.close();
  });

  test('direct chess language replay preserves elapsed authoritative host time', () => {
    let onChange;
    const i18n = {
      initialized: true,
      ready: new Promise(() => {}),
      t: jest.fn(key => key),
      onChange: callback => { onChange = callback; },
      onLanguageChange: jest.fn()
    };
    const { dom, listeners, advance } = loadOverlay('chess.html', i18n);
    const state = {
      display: {
        displaySessionId: 11,
        gameType: 'chess',
        sessionRevision: 1,
        displayRevision: 1,
        currentTurnRole: 'host',
        hostTimeRemainingMs: 5000,
        phase: 'playing',
        config: {},
        state: {
          sessionId: 11,
          fen: '8/8/8/8/8/8/8/8 w - - 0 1',
          currentPlayer: 'white',
          whitePlayer: { username: 'host', nickname: 'Host', role: 'streamer' },
          blackPlayer: { username: 'viewer', nickname: 'Viewer', role: 'viewer' },
          timers: { white: 5000, black: 5000 },
          capturedPieces: { white: {}, black: {} },
          lastMove: null
        }
      }
    };

    listeners.get('game-engine:interactive-state')(state);
    const hostTimer = dom.window.document.getElementById('white-timer');
    expect(hostTimer.textContent).toBe('0:05');
    advance(2000);
    expect(hostTimer.textContent).toBe('0:03');
    onChange();
    expect(hostTimer.textContent).toBe('0:03');
    dom.window.close();
  });

  test('direct chess applies visual config gates, colors, theme, and timer warning threshold', () => {
    const { dom, listeners } = loadOverlay('chess.html');
    const applyState = listeners.get('game-engine:interactive-state');
    const disabled = chessState({
      hostTimeRemainingMs: 50000,
      config: {
        boardTheme: 'light',
        backgroundColor: '#123456',
        whiteColor: '#abcdef',
        blackColor: '#fedcba',
        fontFamily: 'Verdana, sans-serif',
        showCoordinates: false,
        highlightLastMove: false,
        highlightCheck: false,
        showCapturedPieces: false,
        timerWarningTime: 60
      }
    });

    applyState(disabled);
    expect(dom.window.document.querySelectorAll('.coord-row, .coord-col')).toHaveLength(0);
    expect(dom.window.document.querySelectorAll('.square.last-move')).toHaveLength(0);
    expect(dom.window.document.querySelectorAll('.square.check')).toHaveLength(0);
    expect(dom.window.document.querySelectorAll('.captured-piece')).toHaveLength(0);
    expect(dom.window.document.body.style.fontFamily).toContain('Verdana');
    expect(dom.window.document.querySelector('.glass-container').style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(dom.window.document.getElementById('white-name').style.color).toBe('rgb(171, 205, 239)');
    expect(dom.window.document.getElementById('black-name').style.color).toBe('rgb(254, 220, 186)');
    expect(dom.window.document.getElementById('white-timer').classList.contains('warning')).toBe(true);

    applyState(chessState({
      displayRevision: 2,
      sessionRevision: 2,
      config: {
        showCoordinates: true,
        highlightLastMove: true,
        highlightCheck: true,
        showCapturedPieces: true
      }
    }));
    expect(dom.window.document.querySelectorAll('.coord-row, .coord-col')).toHaveLength(16);
    expect(dom.window.document.querySelectorAll('.square.last-move')).toHaveLength(2);
    expect(dom.window.document.querySelectorAll('.square.check')).toHaveLength(1);
    expect(dom.window.document.querySelectorAll('.captured-piece')).toHaveLength(1);

    dom.window.close();
  });

  test('direct chess renders and ticks a viewer response countdown', () => {
    const { dom, listeners, advance } = loadOverlay('chess.html');
    const countdown = dom.window.document.getElementById('interactive-viewer-countdown');
    const applyState = listeners.get('game-engine:interactive-state');

    applyState(chessState({ currentTurnRole: 'viewer', viewerDeadlineMs: 105000 }));
    expect(countdown.hidden).toBe(false);
    expect(countdown.textContent).toContain('5');
    advance(2000);
    expect(countdown.textContent).toContain('3');

    applyState(chessState({
      displayRevision: 2,
      sessionRevision: 2,
      phase: 'result',
      currentTurnRole: 'viewer',
      viewerDeadlineMs: null
    }));
    expect(countdown.hidden).toBe(true);
    expect(countdown.textContent).toBe('');

    dom.window.close();
  });

  test('direct chess maps interactive terminal reasons to readable text', () => {
    const { dom, listeners } = loadOverlay('chess.html');
    const result = chessState({ phase: 'result', hostTimeRemainingMs: null });
    result.display.result = {
      sessionId: result.display.displaySessionId,
      winner: 'black',
      winnerRole: 'viewer',
      winnerDisplayName: 'Viewer',
      reason: 'host_timeout'
    };

    listeners.get('game-engine:interactive-state')(result);
    const reason = dom.window.document.getElementById('game-over-reason');
    expect(reason.textContent).toContain('Timeout');
    expect(reason.textContent).not.toBe('host_timeout');

    dom.window.close();
  });

  test('direct Connect4 ticks an authoritative viewer countdown, warns, and clears it on a newer phase', () => {
    const { dom, listeners, advance } = loadOverlay('connect4.html');
    const countdown = dom.window.document.getElementById('interactive-viewer-countdown');
    const applyState = listeners.get('game-engine:interactive-state');

    applyState(connect4State());
    expect(countdown.hidden).toBe(false);
    expect(countdown.textContent).toContain('5');

    advance(2000);
    expect(countdown.textContent).toContain('3');
    expect(countdown.classList.contains('warning')).toBe(true);

    applyState(connect4State({ displayRevision: 2, sessionRevision: 2, phase: 'result', deadline: null }));
    expect(countdown.hidden).toBe(true);
    expect(countdown.textContent).toBe('');

    dom.window.close();
  });

  test('direct Connect4 never replays an audible move after queue rotation, background, or stale snapshots', () => {
    const { dom, listeners, audioPlay } = loadOverlay('connect4.html');
    const applyState = listeners.get('game-engine:interactive-state');

    applyState(connect4State({ displayRevision: 1, sessionId: 7, moveNumber: 1 }));
    applyState(connect4State({ displayRevision: 2, sessionId: 8, moveNumber: 1 }));
    expect(audioPlay).toHaveBeenCalledTimes(2);

    const backgroundSnapshot = connect4State({ displayRevision: 3, sessionId: 8, moveNumber: 1 });
    backgroundSnapshot.activeSessions = [{
      sessionId: 7,
      gameType: 'connect4',
      sessionRevision: 1,
      turnRole: 'viewer',
      state: connect4State({ sessionId: 7, moveNumber: 1 }).display.state
    }];
    applyState(backgroundSnapshot);
    expect(audioPlay).toHaveBeenCalledTimes(2);

    applyState(connect4State({ displayRevision: 4, sessionId: 7, moveNumber: 1 }));
    expect(audioPlay).toHaveBeenCalledTimes(2);

    applyState(connect4State({ displayRevision: 3, sessionRevision: 2, sessionId: 7, moveNumber: 2 }));
    expect(audioPlay).toHaveBeenCalledTimes(2);

    applyState(connect4State({ displayRevision: 5, sessionRevision: 2, sessionId: 7, moveNumber: 2 }));
    expect(audioPlay).toHaveBeenCalledTimes(3);

    dom.window.close();
  });

  test('direct Connect4 uses custom audio for moves, timer warning, and the winning player', async () => {
    let media = [
      { media_event: 'piece_drop', url: '/game-engine/media/connect4/piece_drop?v=1' },
      { media_event: 'timer_warning', url: '/game-engine/media/connect4/timer_warning?v=2' },
      { media_event: 'player_2_wins', url: '/game-engine/media/connect4/player_2_wins?v=3' }
    ];
    const fetch = jest.fn(url => {
      if (url === '/api/game-engine/media/connect4') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(media) });
      }
      return new Promise(() => {});
    });
    const { dom, listeners, audioSources, advance } = loadOverlay('connect4.html', null, { fetch });
    await new Promise(resolve => setImmediate(resolve));
    expect(fetch).toHaveBeenCalledWith('/api/game-engine/media/connect4', { cache: 'no-store' });
    const applyState = listeners.get('game-engine:interactive-state');

    applyState(connect4State({ displayRevision: 1, moveNumber: 1 }));
    expect(audioSources).toContain('/game-engine/media/connect4/piece_drop?v=1');

    advance(2000);
    expect(audioSources).toContain('/game-engine/media/connect4/timer_warning?v=2');
    const warningCount = audioSources.filter(src => src.includes('/timer_warning')).length;
    advance(1000);
    expect(audioSources.filter(src => src.includes('/timer_warning'))).toHaveLength(warningCount);

    media = [
      { media_event: 'piece_drop', url: '/game-engine/media/connect4/piece_drop?v=4' },
      { media_event: 'timer_warning', url: '/game-engine/media/connect4/timer_warning?v=2' },
      { media_event: 'player_2_wins', url: '/game-engine/media/connect4/player_2_wins?v=3' }
    ];
    listeners.get('game-engine:media-updated')({ gameType: 'connect4', mediaEvent: 'piece_drop' });
    await new Promise(resolve => setImmediate(resolve));
    applyState(connect4State({ displayRevision: 2, sessionRevision: 2, moveNumber: 2 }));
    expect(audioSources).toContain('/game-engine/media/connect4/piece_drop?v=4');

    const result = connect4State({
      displayRevision: 3,
      sessionRevision: 3,
      phase: 'result',
      deadline: null,
      moveNumber: 0
    });
    result.display.state.status = 'completed';
    result.display.state.winner = 2;
    result.display.result = {
      sessionId: result.display.displaySessionId,
      winner: 2,
      winnerRole: 'viewer',
      reason: 'win'
    };
    applyState(result);

    expect(audioSources).toContain('/game-engine/media/connect4/player_2_wins?v=3');
    dom.window.close();
  });

  test('direct Connect4 never constructs audio or falls back for a disabled custom event', () => {
    const { dom, AudioConstructor, audioPlay } = loadOverlay('connect4.html');

    dom.window.applyAudioSettings({
      piece_drop: { enabled: false, url: '/custom/drop.mp3' }
    });

    expect(dom.window.playEventSound('piece_drop')).toBe(false);
    expect(AudioConstructor).not.toHaveBeenCalled();
    expect(audioPlay).not.toHaveBeenCalled();
    dom.window.close();
  });

  test.each(['spinning', 'prize1', 'prize2', 'prize3', 'lost'])(
    'wheel never plays disabled %s audio',
    audioEvent => {
      const { dom, mediaPlay } = loadOverlay('wheel.html');
      const elementIds = {
        spinning: 'spin-sound',
        prize1: 'prize-1-sound',
        prize2: 'prize-2-sound',
        prize3: 'prize-3-sound',
        lost: 'lost-sound'
      };
      dom.window.applyAudioSettings({
        [audioEvent]: { enabled: false, url: `/custom/${audioEvent}.mp3` }
      });

      expect(dom.window.playWheelEventSound(
        audioEvent,
        dom.window.document.getElementById(elementIds[audioEvent])
      )).toBe(false);
      expect(mediaPlay).not.toHaveBeenCalled();
      dom.window.close();
    }
  );

  test.each(['spin', 'small_win', 'medium_win', 'big_win', 'jackpot', 'near_miss', 'reel_stop'])(
    'slot never constructs audio or falls back for disabled %s audio',
    audioEvent => {
      const { dom, AudioConstructor, audioPlay } = loadOverlay('slot.html');
      dom.window.applyAudioSettings({
        [audioEvent]: { enabled: false, url: `/custom/${audioEvent}.mp3` }
      });

      expect(dom.window.playAudio(audioEvent, { soundEnabled: true }, '7')).toBe(false);
      expect(AudioConstructor).not.toHaveBeenCalled();
      expect(audioPlay).not.toHaveBeenCalled();
      dom.window.close();
    }
  );

  test('audio-state socket updates mute immediately without replaying any overlay sound', () => {
    const connect4 = loadOverlay('connect4.html');
    connect4.dom.window.applyAudioSettings({ piece_drop: { enabled: true } });
    connect4.listeners.get('game-engine:audio-state-updated')({
      gameType: 'connect4',
      scopeId: 'default',
      audioEvent: 'piece_drop',
      enabled: false
    });
    expect(connect4.dom.window.playEventSound('piece_drop')).toBe(false);
    expect(connect4.audioPlay).not.toHaveBeenCalled();
    connect4.dom.window.close();

    const wheel = loadOverlay('wheel.html');
    wheel.dom.window.loadWheelAudio('7');
    wheel.dom.window.applyAudioSettings({ spinning: { enabled: true } });
    wheel.listeners.get('wheel:audio-updated')({ wheelId: '7', audioType: 'spinning', enabled: false });
    expect(wheel.dom.window.playWheelEventSound(
      'spinning',
      wheel.dom.window.document.getElementById('spin-sound')
    )).toBe(false);
    expect(wheel.mediaPlay).not.toHaveBeenCalled();
    wheel.dom.window.close();

    const slot = loadOverlay('slot.html');
    slot.dom.window.applyAudioSettings({ spin: { enabled: true } });
    slot.listeners.get('slot:spin-started')({ machineId: '7', settings: { soundEnabled: true } });
    slot.listeners.get('slot:audio-updated')({ machineId: '7', audioType: 'spin', enabled: false });
    expect(slot.dom.window.playAudio('spin', { soundEnabled: true }, '7')).toBe(false);
    expect(slot.audioPlay).not.toHaveBeenCalled();
    slot.dom.window.close();
  });

  test('Connect4 socket state wins over an older in-flight settings response', async () => {
    const initial = deferred();
    const refreshed = deferred();
    const fetch = jest.fn()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(refreshed.promise);
    const connect4 = loadOverlay('connect4.html', null, { fetch });
    connect4.listeners.get('game-engine:config-updated')({
      gameType: 'connect4',
      config: { soundEnabled: true, soundVolume: 0.5 }
    });

    connect4.listeners.get('game-engine:audio-state-updated')({
      gameType: 'connect4',
      scopeId: 'default',
      audioEvent: 'piece_drop',
      enabled: false
    });
    initial.resolve(jsonResponse([
      { media_event: 'piece_drop', enabled: true, url: '/stale/drop.mp3' }
    ]));
    await flushPromises();

    expect(connect4.dom.window.playEventSound('piece_drop')).toBe(false);
    expect(connect4.AudioConstructor).not.toHaveBeenCalled();

    refreshed.resolve(jsonResponse([{ media_event: 'piece_drop', enabled: false }]));
    await flushPromises();
    connect4.dom.window.close();
  });

  test('wheel ignores an older scope response that resolves after the active wheel', async () => {
    const wheelA = deferred();
    const wheelB = deferred();
    const fetch = jest.fn()
      .mockReturnValueOnce(wheelA.promise)
      .mockReturnValueOnce(wheelB.promise);
    const wheel = loadOverlay('wheel.html', null, { fetch });

    const loadB = wheel.dom.window.loadWheelAudio('2');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/game-engine/wheel/audio/settings?wheelId=1',
      '/api/game-engine/wheel/audio/settings?wheelId=2'
    ]);
    wheelB.resolve(jsonResponse({ spinning: { enabled: false } }));
    expect(await loadB).toBe(true);
    wheelA.resolve(jsonResponse({ spinning: { enabled: true } }));
    await flushPromises();

    expect(wheel.dom.window.playWheelEventSound(
      'spinning',
      wheel.dom.window.document.getElementById('spin-sound')
    )).toBe(false);
    expect(wheel.mediaPlay).not.toHaveBeenCalled();
    wheel.dom.window.close();
  });

  test('slot plays the first spin sound exactly once after matching scoped settings resolve', async () => {
    const settings = deferred();
    const fetch = jest.fn(() => settings.promise);
    const slot = loadOverlay('slot.html', null, { fetch });

    slot.listeners.get('slot:spin-started')({
      spinId: 'spin-7',
      machineId: '7',
      settings: { soundEnabled: true }
    });
    expect(slot.audioPlay).not.toHaveBeenCalled();

    settings.resolve(jsonResponse({ spin: { enabled: true } }));
    await flushPromises();

    expect(slot.audioSources).toEqual(['/game-engine/sounds/slot/custom/7/spin.mp3']);
    expect(slot.audioPlay).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(slot.audioPlay).toHaveBeenCalledTimes(1);
    slot.dom.window.close();
  });

  test('slot ignores stale machine settings and stale spin playback intents', async () => {
    const machineA = deferred();
    const machineB = deferred();
    const fetch = jest.fn()
      .mockReturnValueOnce(machineA.promise)
      .mockReturnValueOnce(machineB.promise);
    const slot = loadOverlay('slot.html', null, { fetch });

    slot.listeners.get('slot:spin-started')({
      spinId: 'spin-a',
      machineId: '1',
      settings: { soundEnabled: true }
    });
    slot.listeners.get('slot:spin-started')({
      spinId: 'spin-b',
      machineId: '2',
      settings: { soundEnabled: true }
    });

    machineB.resolve(jsonResponse({ spin: { enabled: true } }));
    await flushPromises();
    expect(slot.audioSources).toEqual(['/game-engine/sounds/slot/custom/2/spin.mp3']);
    expect(slot.audioPlay).toHaveBeenCalledTimes(1);

    machineA.resolve(jsonResponse({ spin: { enabled: false } }));
    await flushPromises();
    expect(slot.audioSources).not.toContain('/game-engine/sounds/slot/custom/1/spin.mp3');
    expect(slot.audioPlay).toHaveBeenCalledTimes(1);
    expect(slot.dom.window.playAudio('spin', { soundEnabled: true }, '2')).toBe(true);
    slot.dom.window.close();
  });

  test.each(['error', 'rejection'])(
    'Connect4 does not fall back after custom audio %s when the event was muted meanwhile',
    async failure => {
      const audioPlay = jest.fn(() => Promise.resolve());
      if (failure === 'rejection') audioPlay.mockRejectedValueOnce(new Error('custom failed'));
      const connect4 = loadOverlay('connect4.html', null, { audioPlay });
      connect4.listeners.get('game-engine:config-updated')({
        gameType: 'connect4',
        config: { soundEnabled: true, soundVolume: 0.5 }
      });
      connect4.dom.window.applyAudioSettings({
        piece_drop: { enabled: true, url: '/custom/drop.mp3' }
      });

      expect(connect4.dom.window.playEventSound('piece_drop')).toBe(true);
      connect4.dom.window.applyAudioSettings({ piece_drop: { enabled: false } });
      if (failure === 'error') connect4.AudioConstructor.mock.instances[0].onerror();
      await flushPromises();

      expect(connect4.audioSources).toEqual(['/custom/drop.mp3']);
      expect(connect4.AudioConstructor).toHaveBeenCalledTimes(1);
      connect4.dom.window.close();
    }
  );

  test.each(['error', 'rejection'])(
    'slot does not fall back after custom audio %s when the event was muted meanwhile',
    async failure => {
      const audioPlay = jest.fn(() => Promise.resolve());
      if (failure === 'rejection') audioPlay.mockRejectedValueOnce(new Error('custom failed'));
      const slot = loadOverlay('slot.html', null, { audioPlay });
      slot.dom.window.applyAudioSettings({ spin: { enabled: true } });

      expect(slot.dom.window.playAudio('spin', { soundEnabled: true }, '7')).toBe(true);
      slot.dom.window.applyAudioSettings({ spin: { enabled: false } });
      if (failure === 'error') {
        slot.AudioConstructor.mock.instances[0]._listeners.get('error')();
      }
      await flushPromises();

      expect(slot.audioSources).toEqual(['/game-engine/sounds/slot/custom/7/spin.mp3']);
      expect(slot.AudioConstructor).toHaveBeenCalledTimes(1);
      slot.dom.window.close();
    }
  );

  test('slot falls back to default after an enabled custom source rejects', async () => {
    const audioPlay = jest.fn(() => Promise.resolve());
    audioPlay.mockRejectedValueOnce(new Error('custom failed'));
    const slot = loadOverlay('slot.html', null, { audioPlay });
    slot.dom.window.applyAudioSettings({ spin: { enabled: true } });

    expect(slot.dom.window.playAudio('spin', { soundEnabled: true }, '7')).toBe(true);
    await flushPromises();

    expect(slot.audioSources).toEqual([
      '/game-engine/sounds/slot/custom/7/spin.mp3',
      '/game-engine/sounds/slot/spin.mp3'
    ]);
    expect(audioPlay).toHaveBeenCalledTimes(2);
    slot.dom.window.close();
  });

  test('unified delegates countdown rendering to the child and ignores a stale session revision', () => {
    const { dom, listeners } = loadOverlay('unified.html');
    const applyState = listeners.get('game-engine:interactive-state');
    const frame = dom.window.document.getElementById('frame-connect4');
    const postMessage = jest.fn();
    frame.dataset.loaded = 'true';
    frame.dataset.ready = 'true';
    frame.contentWindow.postMessage = postMessage;

    applyState(connect4State({ displayRevision: 4, sessionRevision: 2, deadline: 104000 }));
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0].payload.display.viewerDeadlineMs).toBe(104000);

    applyState(connect4State({ displayRevision: 4, sessionRevision: 1, deadline: 120000 }));
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(dom.window.document.getElementById('interactive-viewer-countdown')).toBeNull();

    dom.window.close();
  });

  test('unified rerenders its held matchup after i18n ready and language changes', async () => {
    let resolveReady;
    let onChange;
    let onLanguageChange;
    let language = 'en';
    const i18n = {
      initialized: false,
      ready: new Promise(resolve => { resolveReady = resolve; }),
      t: jest.fn((key, params = {}) => `${language}: ${params.host || params.game || key}`),
      onChange: callback => { onChange = callback; },
      onLanguageChange: callback => { onLanguageChange = callback; }
    };
    const { dom, listeners } = loadOverlay('unified.html', i18n);
    const matchup = dom.window.document.getElementById('interactive-matchup-names');
    listeners.get('game-engine:interactive-state')(connect4State());
    expect(matchup.textContent).not.toBe('');
    expect(i18n.t).not.toHaveBeenCalled();

    i18n.initialized = true;
    resolveReady();
    await Promise.resolve();
    expect(matchup.textContent).toContain('en:');
    language = 'de';
    onChange();
    expect(matchup.textContent).toContain('de:');
    language = 'fr';
    onLanguageChange();
    expect(matchup.textContent).toContain('fr:');
    dom.window.close();
  });
});
