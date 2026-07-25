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

function httpErrorResponse(status, body = {}) {
  return { ok: false, status, json: jest.fn(() => Promise.resolve(body)) };
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
    socket,
    audioPlay,
    mediaPlay,
    AudioConstructor,
    audioSources,
    pendingTimeoutCount: () => timeouts.size,
    runTimeouts(maxDelay = Number.POSITIVE_INFINITY) {
      const due = Array.from(timeouts.entries())
        .filter(([, entry]) => entry.delay <= maxDelay)
        .sort(([, left], [, right]) => left.delay - right.delay);
      for (const [id, entry] of due) {
        if (!timeouts.delete(id)) continue;
        entry.callback();
      }
    },
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
  test('Connect4 renders safe proxy avatars inside coloured pieces with accessible cell descriptions', () => {
    const { dom, listeners } = loadOverlay('connect4.html');
    const state = connect4State();
    state.display.state.player1.avatarSource = '/api/game-engine/avatar?url=https%3A%2F%2Fp16-sign.tiktokcdn-us.com%2Favatar.jpg';
    state.display.state.player2.avatarSource = 'https://untrusted.example/avatar.jpg';

    listeners.get('game-engine:interactive-state')(state);

    const redPiece = dom.window.document.querySelector('[data-row="5"][data-col="0"] .piece');
    expect(redPiece).not.toBeNull();
    expect(redPiece.classList.contains('player1')).toBe(true);
    const avatar = redPiece.querySelector('.piece-avatar');
    expect(avatar).not.toBeNull();
    expect(avatar.getAttribute('src')).toContain('/api/game-engine/avatar?url=');
    expect(dom.window.document.querySelector('[data-row="5"][data-col="0"]').getAttribute('aria-label'))
      .toContain('Host');

    avatar.dispatchEvent(new dom.window.Event('error'));
    expect(redPiece.isConnected).toBe(true);
    expect(redPiece.querySelector('.piece-avatar')).toBeNull();
    dom.window.close();
  });

  test('Connect4 restores a server-timed matchmaking challenge and clears it from newer state', () => {
    const { dom, listeners, advance } = loadOverlay('connect4.html');
    const state = connect4State({ phase: 'idle', deadline: null, moveNumber: 0 });
    state.connect4Matchmaking = {
      challengeId: 9,
      status: 'open',
      openerId: 'opener',
      openerDisplayName: 'Avatar Player',
      expiresAtMs: 130000
    };

    listeners.get('game-engine:interactive-state')(state);
    const challenge = dom.window.document.getElementById('challenge-screen');
    const timer = dom.window.document.getElementById('challenge-timer');
    expect(challenge.classList.contains('show')).toBe(true);
    expect(dom.window.document.getElementById('challenger-name').textContent).toBe('Avatar Player');
    expect(timer.textContent).toContain('30');

    advance(2000);
    expect(timer.textContent).toContain('28');

    listeners.get('game-engine:interactive-state')({
      ...state,
      serverTimestamp: 102000,
      connect4Matchmaking: null
    });
    expect(challenge.classList.contains('show')).toBe(false);
    dom.window.close();
  });

  test('Connect4 ignores a stale open matchmaking snapshot after a newer challenge clear', () => {
    const { dom, listeners } = loadOverlay('connect4.html');
    const applyState = listeners.get('game-engine:interactive-state');
    const cleared = connect4State({ displayRevision: 8, sessionRevision: 2, phase: 'idle', deadline: null, moveNumber: 0 });
    const staleOpen = connect4State({ displayRevision: 7, sessionRevision: 1, phase: 'idle', deadline: null, moveNumber: 0 });
    staleOpen.connect4Matchmaking = {
      challengeId: 22,
      status: 'open',
      openerDisplayName: 'Stale Viewer',
      expiresAtMs: 130000
    };

    applyState(cleared);
    applyState(staleOpen);

    expect(dom.window.document.getElementById('challenge-screen').classList.contains('show')).toBe(false);
    dom.window.close();
  });

  test('Connect4 rerenders held matchmaking copy after i18n initialization', async () => {
    let resolveReady;
    const i18n = {
      initialized: false,
      ready: new Promise(resolve => { resolveReady = resolve; }),
      t: jest.fn((key, params = {}) => key === 'plugins.game-engine.ui.runtime.connect4.matchmaking_title'
        ? 'Localized challenge'
        : key === 'plugins.game-engine.ui.runtime.connect4.matchmaking_prompt'
          ? `Localized opponent: ${params.player}`
          : key === 'plugins.game-engine.ui.runtime.connect4.matchmaking_countdown'
            ? `Localized ${params.seconds}`
            : key),
      onChange: jest.fn(),
      onLanguageChange: jest.fn()
    };
    const { dom, listeners } = loadOverlay('connect4.html', i18n);
    const state = connect4State({ phase: 'idle', deadline: null, moveNumber: 0 });
    state.connect4Matchmaking = {
      challengeId: 10,
      status: 'open',
      openerDisplayName: 'Viewer',
      expiresAtMs: 130000
    };

    listeners.get('game-engine:interactive-state')(state);
    expect(dom.window.document.getElementById('challenge-title').textContent).toBe('Connect4 Challenge!');

    i18n.initialized = true;
    resolveReady();
    await flushPromises();
    expect(dom.window.document.getElementById('challenge-title').textContent).toBe('Localized challenge');
    dom.window.close();
  });

  test('direct Connect4 leaderboard renders the readable username instead of playerId', async () => {
    const playerId = '7446102145268843553';
    const fetch = jest.fn(url => {
      if (url === '/api/game-engine/lifetime-leaderboard/connect4?limit=10') {
        return Promise.resolve(jsonResponse([{
          playerId,
          username: 'Sam',
          wins: 2,
          total_games: 2
        }]));
      }
      return new Promise(() => {});
    });
    const { dom } = loadOverlay('connect4.html', null, { fetch });

    await dom.window.showLeaderboard('connect4', 'lifetime');

    const leaderboard = dom.window.document.getElementById('leaderboard-content');
    expect(leaderboard.textContent).toContain('Sam');
    expect(leaderboard.textContent).not.toContain(playerId);
    dom.window.close();
  });

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
    dom.window.applyAudioSettings({ player_1_wins: { enabled: true } });
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

  test.each([
    ['completion', { winner: 2, winnerRole: 'viewer', reason: 'win' }],
    ['cancellation', { winner: null, winnerRole: null, reason: 'cancelled' }]
  ])('direct Connect4 renders a hidden-session %s from result-owned state, config, and ID', (_label, outcome) => {
    const { dom, listeners } = loadOverlay('connect4.html');
    const snapshot = connect4State({
      sessionId: 1,
      sessionRevision: 2,
      displayRevision: 8,
      phase: 'result',
      deadline: null,
      moveNumber: 0
    });
    snapshot.display.viewerDisplayName = 'Visible Viewer';
    snapshot.display.config.displayTexts = { labelWin: 'Visible {player} wins' };
    snapshot.display.state.player2.nickname = 'Visible Viewer';

    const resultState = connect4State({
      sessionId: 2,
      sessionRevision: 9,
      phase: 'result',
      deadline: null,
      moveNumber: 0
    }).display.state;
    resultState.board[5][6] = 2;
    resultState.player1.nickname = 'Hidden Host';
    resultState.player2.nickname = 'Hidden Viewer';
    resultState.status = 'completed';
    resultState.winner = outcome.winner;
    snapshot.display.result = {
      sessionId: 2,
      gameType: 'connect4',
      sessionRevision: 9,
      hostDisplayName: 'Hidden Host',
      viewerDisplayName: 'Hidden Viewer',
      state: resultState,
      config: {
        ...snapshot.display.config,
        displayTexts: { labelWin: 'Hidden {player} wins' }
      },
      ...outcome
    };

    listeners.get('game-engine:interactive-state')(snapshot);

    expect(dom.window.document.getElementById('player2-name').textContent).toBe('Hidden Viewer');
    expect(dom.window.document.querySelector('[data-row="5"][data-col="6"] .piece.player2')).not.toBeNull();
    if (outcome.reason === 'cancelled') {
      expect(dom.window.document.getElementById('result-text').textContent)
        .toContain('cancelled');
    } else {
      expect(dom.window.document.getElementById('result-text').textContent)
        .toContain('Hidden Hidden Viewer wins');
    }
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
    dom.window.applyAudioSettings({ piece_drop: { enabled: true } });
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

  test('direct Connect4 stays idle when only activeSessions claims a viewer board', () => {
    const { dom, listeners } = loadOverlay('connect4.html');
    const state = connect4State({ phase: 'idle', deadline: null });
    const viewerSession = {
      sessionId: state.display.displaySessionId,
      gameType: 'connect4',
      sessionRevision: state.display.sessionRevision,
      hostDisplayName: state.display.hostDisplayName,
      viewerDisplayName: state.display.viewerDisplayName,
      turnRole: 'viewer',
      viewerDeadlineMs: 105000,
      config: state.display.config,
      state: state.display.state
    };
    state.activeSessions = [viewerSession];
    Object.assign(state.display, {
      displaySessionId: null,
      gameType: null,
      sessionRevision: null,
      hostDisplayName: null,
      viewerDisplayName: null,
      currentTurnRole: null,
      state: null
    });

    listeners.get('game-engine:interactive-state')(state);

    expect(dom.window.document.getElementById('game-container').classList.contains('active')).toBe(false);
    expect(dom.window.document.getElementById('interactive-viewer-countdown').hidden).toBe(true);
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

  test('Connect4 plays default audio while its initial audio settings request is pending', async () => {
    const media = deferred();
    const fetch = jest.fn(url => url.includes('/media/connect4')
      ? media.promise
      : Promise.resolve(jsonResponse({ soundEnabled: true, soundVolume: 0.5 })));
    const connect4 = loadOverlay('connect4.html', null, { fetch });
    connect4.listeners.get('game-engine:config-updated')({
      gameType: 'connect4',
      config: { soundEnabled: true, soundVolume: 0.5 }
    });

    expect(connect4.dom.window.playEventSound('piece_drop')).toBe(true);
    expect(connect4.audioSources).toEqual(['/game-engine/sounds/default/game start.mp3']);

    media.resolve(jsonResponse([{ media_event: 'piece_drop', enabled: true }]));
    await flushPromises();
    expect(connect4.dom.window.playEventSound('piece_drop')).toBe(true);
    expect(connect4.AudioConstructor).toHaveBeenCalledTimes(2);
    connect4.dom.window.close();
  });

  test('Connect4 keeps default audio when its initial audio settings request returns HTTP 500', async () => {
    const failure = httpErrorResponse(500, [
      { media_event: 'piece_drop', enabled: true }
    ]);
    const fetch = jest.fn(url => url.includes('/media/connect4')
      ? Promise.resolve(failure)
      : Promise.resolve(jsonResponse({ soundEnabled: true, soundVolume: 0.5 })));
    const connect4 = loadOverlay('connect4.html', null, { fetch });
    connect4.listeners.get('game-engine:config-updated')({
      gameType: 'connect4',
      config: { soundEnabled: true, soundVolume: 0.5 }
    });
    await flushPromises();

    expect(failure.json).not.toHaveBeenCalled();
    expect(connect4.dom.window.playEventSound('piece_drop')).toBe(true);
    expect(connect4.audioSources).toEqual(['/game-engine/sounds/default/game start.mp3']);
    connect4.dom.window.close();
  });

  test('Connect4 retains a same-scope socket mute when its HTTP 500 refresh fails', async () => {
    const failure = httpErrorResponse(500, [
      { media_event: 'piece_drop', enabled: true }
    ]);
    let mediaRequestCount = 0;
    const fetch = jest.fn(url => {
      if (!url.includes('/media/connect4')) {
        return Promise.resolve(jsonResponse({ soundEnabled: true, soundVolume: 0.5 }));
      }
      mediaRequestCount++;
      return Promise.resolve(mediaRequestCount === 1
        ? jsonResponse([{ media_event: 'piece_drop', enabled: true }])
        : failure);
    });
    const connect4 = loadOverlay('connect4.html', null, { fetch });
    connect4.listeners.get('game-engine:config-updated')({
      gameType: 'connect4',
      config: { soundEnabled: true, soundVolume: 0.5 }
    });
    await flushPromises();

    connect4.listeners.get('game-engine:audio-state-updated')({
      gameType: 'connect4',
      scopeId: 'default',
      audioEvent: 'piece_drop',
      enabled: false
    });
    await flushPromises();

    expect(failure.json).not.toHaveBeenCalled();
    expect(connect4.dom.window.playEventSound('piece_drop')).toBe(false);
    expect(connect4.AudioConstructor).not.toHaveBeenCalled();
    connect4.dom.window.close();
  });

  test('wheel fails closed while its initial audio settings request is pending', async () => {
    const settings = deferred();
    const wheel = loadOverlay('wheel.html', null, { fetch: jest.fn(() => settings.promise) });
    const spinSound = wheel.dom.window.document.getElementById('spin-sound');

    expect(wheel.dom.window.playWheelEventSound('spinning', spinSound)).toBe(false);
    expect(wheel.mediaPlay).not.toHaveBeenCalled();

    settings.resolve(jsonResponse({ spinning: { enabled: true } }));
    await flushPromises();
    expect(wheel.dom.window.playWheelEventSound('spinning', spinSound)).toBe(true);
    expect(wheel.mediaPlay).toHaveBeenCalledTimes(1);
    wheel.dom.window.close();
  });

  test('wheel fails closed when its initial audio settings request rejects', async () => {
    const wheel = loadOverlay('wheel.html', null, {
      fetch: jest.fn(() => Promise.reject(new Error('initial settings failed')))
    });
    await flushPromises();
    const spinSound = wheel.dom.window.document.getElementById('spin-sound');

    expect(wheel.dom.window.playWheelEventSound('spinning', spinSound)).toBe(false);
    expect(wheel.mediaPlay).not.toHaveBeenCalled();
    wheel.dom.window.close();
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

  test('Connect4 plays the default sound before asynchronous media settings resolve', async () => {
    const settings = deferred();
    const connect4 = loadOverlay('connect4.html', null, {
      fetch: jest.fn(() => settings.promise)
    });
    connect4.listeners.get('game-engine:config-updated')({
      gameType: 'connect4',
      config: { soundEnabled: true, soundVolume: 0.5 }
    });

    expect(connect4.dom.window.playEventSound('piece_drop')).toBe(true);
    expect(connect4.audioSources).toEqual(['/game-engine/sounds/default/game start.mp3']);

    settings.resolve(jsonResponse([{ media_event: 'piece_drop', enabled: false }]));
    await flushPromises();

    expect(connect4.dom.window.playEventSound('piece_drop')).toBe(false);
    expect(connect4.AudioConstructor).toHaveBeenCalledTimes(1);
    connect4.dom.window.close();
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

  test('wheel preserves an immediate mute when its settings refresh rejects', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ spinning: { enabled: true } }))
      .mockRejectedValueOnce(new Error('refresh failed'));
    const wheel = loadOverlay('wheel.html', null, { fetch });
    await flushPromises();

    await wheel.listeners.get('wheel:audio-updated')({
      wheelId: '1',
      audioType: 'spinning',
      enabled: false
    });

    expect(wheel.dom.window.playWheelEventSound(
      'spinning',
      wheel.dom.window.document.getElementById('spin-sound')
    )).toBe(false);
    expect(wheel.mediaPlay).not.toHaveBeenCalled();
    wheel.dom.window.close();
  });

  test('wheel rejects HTTP 500 before parsing and retains its same-scope socket mute', async () => {
    const failure = httpErrorResponse(500, { spinning: { enabled: true } });
    const fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ spinning: { enabled: true } }))
      .mockResolvedValueOnce(failure);
    const wheel = loadOverlay('wheel.html', null, { fetch });
    await flushPromises();

    await wheel.listeners.get('wheel:audio-updated')({
      wheelId: '1',
      audioType: 'spinning',
      enabled: false
    });
    const spinSound = wheel.dom.window.document.getElementById('spin-sound');

    expect(failure.json).not.toHaveBeenCalled();
    expect(wheel.dom.window.playWheelEventSound('spinning', spinSound)).toBe(false);
    expect(wheel.mediaPlay).not.toHaveBeenCalled();
    wheel.dom.window.close();
  });

  test('wheel isolates an old mute when a new scope settings request rejects', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ spinning: { enabled: false } }))
      .mockRejectedValueOnce(new Error('new scope failed'));
    const wheel = loadOverlay('wheel.html', null, { fetch });
    await flushPromises();

    const loaded = await wheel.dom.window.loadWheelAudio('2');
    const spinSound = wheel.dom.window.document.getElementById('spin-sound');

    expect(loaded).toBe(false);
    expect(wheel.dom.window.playWheelEventSound('spinning', spinSound)).toBe(false);
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

  test('slot expires pending first-spin audio when the visual result completes first', async () => {
    const settings = deferred();
    const fetch = jest.fn(() => settings.promise);
    const slot = loadOverlay('slot.html', null, { fetch });

    slot.listeners.get('slot:spin-started')({
      spinId: 'spin-7',
      machineId: '7',
      settings: { soundEnabled: true }
    });
    slot.dom.window.showResult('loss', false, { soundEnabled: true }, 'spin-7');
    expect(slot.dom.window.document.querySelector('#result-text.visible')).not.toBeNull();
    expect(slot.audioPlay).not.toHaveBeenCalled();

    settings.resolve(jsonResponse({ spin: { enabled: true } }));
    await flushPromises();

    expect(slot.audioSources).toEqual([]);
    expect(slot.audioPlay).not.toHaveBeenCalled();
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

  test('slot ignores delayed reels, results, and reward audio from a replaced spin scope', () => {
    const slot = loadOverlay('slot.html');
    const spinStarted = slot.listeners.get('slot:spin-started');
    const spinResult = slot.listeners.get('slot:spin-result');
    const playRewardAudio = slot.listeners.get('slot:play-audio');
    const reels = [
      { emoji: 'A', label: 'A' },
      { emoji: 'A', label: 'A' },
      { emoji: 'A', label: 'A' }
    ];

    spinStarted({
      spinId: 'spin-a',
      machineId: '1',
      symbols: reels,
      settings: { soundEnabled: false, reelStopDelay: 100 }
    });
    spinResult({
      spinId: 'spin-a',
      machineId: '1',
      reels,
      category: 'small_win',
      isWin: true,
      settings: { soundEnabled: true, reelStopDelay: 100 }
    });

    spinStarted({
      spinId: 'spin-b',
      machineId: '2',
      symbols: reels.map(symbol => ({ ...symbol, emoji: 'B', label: 'B' })),
      settings: { soundEnabled: false, reelStopDelay: 100 }
    });
    slot.dom.window.applyAudioSettings({
      small_win: { enabled: true },
      big_win: { enabled: true },
      reel_stop: { enabled: true }
    });
    spinResult({
      spinId: 'spin-b',
      machineId: '2',
      reels: reels.map(symbol => ({ ...symbol, emoji: 'B', label: 'B' })),
      category: 'big_win',
      isWin: true,
      settings: { soundEnabled: true, reelStopDelay: 100 }
    });

    playRewardAudio({ spinId: 'spin-a', machineId: '1', audioType: 'small_win' });
    playRewardAudio({ spinId: 'spin-b', machineId: '2', audioType: 'big_win' });
    expect(slot.audioSources).not.toContain('/game-engine/sounds/slot/custom/2/small_win.mp3');
    expect(slot.audioSources).toContain('/game-engine/sounds/slot/custom/2/big_win.mp3');

    slot.audioPlay.mockClear();
    slot.runTimeouts(200);
    expect(slot.audioPlay).toHaveBeenCalledTimes(3);
    slot.runTimeouts(600);
    slot.runTimeouts(200);

    const completionEvents = slot.socket.emit.mock.calls
      .filter(([event]) => event === 'slot:spin-completed');
    expect(completionEvents).toEqual([[
      'slot:spin-completed',
      expect.objectContaining({ spinId: 'spin-b', machineId: '2', category: 'big_win' })
    ]]);
    expect(slot.dom.window.document.getElementById('result-text').textContent).toContain('Großer Gewinn');
    slot.dom.window.close();
  });

  test.each(['error', 'rejection'])(
    'slot suppresses a stale same-machine fallback after spin replacement on custom audio %s',
    async failure => {
      const customPlayback = deferred();
      const audioPlay = failure === 'rejection'
        ? jest.fn(() => customPlayback.promise)
        : jest.fn(() => Promise.resolve());
      const slot = loadOverlay('slot.html', null, { audioPlay });
      const spinStarted = slot.listeners.get('slot:spin-started');
      spinStarted({ spinId: 'spin-a', machineId: '7', settings: { soundEnabled: true } });
      slot.dom.window.applyAudioSettings({
        spin: { enabled: false },
        small_win: { enabled: true }
      });

      expect(slot.dom.window.playAudio(
        'small_win',
        { soundEnabled: true },
        '7',
        'spin-a'
      )).toBe(true);
      spinStarted({ spinId: 'spin-b', machineId: '7', settings: { soundEnabled: true } });

      if (failure === 'error') {
        slot.AudioConstructor.mock.instances[0]._listeners.get('error')();
      } else {
        customPlayback.reject(new Error('spin-a custom failed'));
      }
      await flushPromises();

      expect(slot.audioSources).toEqual([
        '/game-engine/sounds/slot/custom/7/small_win.mp3'
      ]);
      expect(slot.audioSources).not.toContain('/game-engine/sounds/slot/small-win.mp3');
      slot.dom.window.close();
    }
  );

  test.each([
    ['error', 'error', 'slot:spin-error'],
    ['error', 'rejection', 'slot:spin-error'],
    ['timeout', 'error', 'slot:spin-timeout'],
    ['timeout', 'rejection', 'slot:spin-timeout']
  ])(
    'slot suppresses a stale fallback after the current %s and deferred custom audio %s',
    async (_label, failure, resetEvent) => {
      const customPlayback = deferred();
      const audioPlay = failure === 'rejection'
        ? jest.fn(() => customPlayback.promise)
        : jest.fn(() => Promise.resolve());
      const slot = loadOverlay('slot.html', null, { audioPlay });
      slot.listeners.get('slot:spin-started')({
        spinId: 'spin-a',
        machineId: '7',
        settings: { soundEnabled: true }
      });
      slot.dom.window.applyAudioSettings({
        spin: { enabled: false },
        small_win: { enabled: true }
      });
      expect(slot.dom.window.playAudio(
        'small_win',
        { soundEnabled: true },
        '7',
        'spin-a'
      )).toBe(true);

      slot.listeners.get(resetEvent)({ spinId: 'spin-a', machineId: '7' });
      if (failure === 'error') {
        slot.AudioConstructor.mock.instances[0]._listeners.get('error')();
      } else {
        customPlayback.reject(new Error('spin-a custom failed'));
      }
      await flushPromises();

      expect(slot.audioSources).toEqual([
        '/game-engine/sounds/slot/custom/7/small_win.mp3'
      ]);
      expect(slot.audioSources).not.toContain('/game-engine/sounds/slot/small-win.mp3');
      slot.dom.window.close();
    }
  );

  test.each([
    ['same machine', '7'],
    ['different machine', '8']
  ])('slot rejects a delayed overlay effect after replacement on the %s', (_label, nextMachineId) => {
    const slot = loadOverlay('slot.html');
    const spinStarted = slot.listeners.get('slot:spin-started');
    const overlayEffect = slot.listeners.get('slot:overlay-effect');
    const reelsWrap = slot.dom.window.document.getElementById('reels-wrapper');

    spinStarted({ spinId: 'spin-a', machineId: '7', settings: { soundEnabled: false } });
    spinStarted({ spinId: 'spin-b', machineId: nextMachineId, settings: { soundEnabled: false } });
    overlayEffect({ spinId: 'spin-a', machineId: '7', effect: 'win' });

    expect(reelsWrap.classList.contains('win-glow')).toBe(false);
    expect(Array.from(slot.dom.window.document.querySelectorAll('.reel'))
      .some(reel => reel.classList.contains('win-flash'))).toBe(false);

    overlayEffect({ spinId: 'spin-b', machineId: nextMachineId, effect: 'win' });
    expect(reelsWrap.classList.contains('win-glow')).toBe(true);
    expect(Array.from(slot.dom.window.document.querySelectorAll('.reel'))
      .every(reel => reel.classList.contains('win-flash'))).toBe(true);
    slot.dom.window.close();
  });

  test.each([
    ['replacement', 'slot:spin-started'],
    ['error', 'slot:spin-error'],
    ['timeout', 'slot:spin-timeout']
  ])('slot %s reset removes every result-owned visual class', (_label, resetEvent) => {
    const slot = loadOverlay('slot.html');
    const document = slot.dom.window.document;
    const reelsWrap = document.getElementById('reels-wrapper');
    const result = document.getElementById('result-text');
    const confetti = document.getElementById('confetti-overlay');
    const reels = Array.from(document.querySelectorAll('.reel'));
    slot.listeners.get('slot:spin-started')({
      spinId: 'spin-a',
      machineId: '7',
      settings: { soundEnabled: false }
    });
    reelsWrap.classList.add('win-glow', 'jackpot-glow', 'near-miss-shake');
    result.classList.add('visible', 'jackpot');
    result.textContent = 'stale result';
    confetti.appendChild(document.createElement('i'));
    reels.forEach(reel => reel.classList.add('win-flash'));

    if (resetEvent === 'slot:spin-started') {
      slot.listeners.get(resetEvent)({
        spinId: 'spin-b',
        machineId: '7',
        settings: { soundEnabled: false }
      });
    } else {
      slot.listeners.get(resetEvent)({ spinId: 'spin-a', machineId: '7' });
    }

    expect(reelsWrap.classList.contains('win-glow')).toBe(false);
    expect(reelsWrap.classList.contains('jackpot-glow')).toBe(false);
    expect(reelsWrap.classList.contains('near-miss-shake')).toBe(false);
    expect(result.className).toBe('');
    expect(result.textContent).toBe('');
    expect(confetti.children).toHaveLength(0);
    expect(reels.every(reel => !reel.classList.contains('win-flash'))).toBe(true);
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

  test.each(['error', 'rejection'])(
    'slot does not fall back after custom audio %s when the global sound setting was disabled meanwhile',
    async failure => {
      const audioPlay = jest.fn(() => Promise.resolve());
      if (failure === 'rejection') audioPlay.mockRejectedValueOnce(new Error('custom failed'));
      const slot = loadOverlay('slot.html', null, { audioPlay });
      slot.listeners.get('slot:spin-started')({
        spinId: 'spin-7',
        machineId: '7',
        settings: { soundEnabled: false }
      });
      slot.dom.window.applyAudioSettings({ spin: { enabled: true } });

      expect(slot.dom.window.playAudio('spin', { soundEnabled: true }, '7')).toBe(true);
      slot.listeners.get('slot:spin-result')({
        spinId: 'spin-7',
        machineId: '7',
        reels: [],
        settings: { soundEnabled: false }
      });
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

  test('unified forwards an open Connect4 matchmaking challenge while the display router is idle', () => {
    const { dom, listeners } = loadOverlay('unified.html');
    const applyState = listeners.get('game-engine:interactive-state');
    const frame = dom.window.document.getElementById('frame-connect4');
    const postMessage = jest.fn();
    frame.dataset.loaded = 'true';
    frame.dataset.ready = 'true';
    frame.contentWindow.postMessage = postMessage;
    const idleState = connect4State({ displayRevision: 6, sessionRevision: 1, phase: 'idle', deadline: null, moveNumber: 0 });
    Object.assign(idleState.display, {
      displaySessionId: null,
      gameType: null,
      sessionRevision: null,
      state: null
    });
    const state = {
      ...idleState,
      serverTimestamp: 101000,
      connect4Matchmaking: {
        challengeId: 21,
        status: 'open',
        openerDisplayName: 'Challenge Viewer',
        expiresAtMs: 130000
      }
    };

    applyState(idleState);
    applyState(state);

    expect(frame.classList.contains('active')).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0].payload.connect4Matchmaking).toEqual(state.connect4Matchmaking);
    expect(dom.window.document.getElementById('idle-state').classList.contains('visible')).toBe(false);
    dom.window.close();
  });

  test('unified highlights the displayed round-robin actor while keeping both player names visible', () => {
    const i18n = {
      initialized: true,
      t: (key, params = {}) => key === 'plugins.game-engine.ui.runtime.unified.active_turn'
        ? `CURRENT TURN: ${params.player}`
        : key
    };
    const { dom, listeners } = loadOverlay('unified.html', i18n);
    const state = connect4State();
    state.display.hostDisplayName = 'Streamer';
    state.display.viewerDisplayName = 'Anna';
    state.display.currentTurnRole = 'viewer';
    state.display.activePlayerDisplayName = 'Anna';

    listeners.get('game-engine:interactive-state')(state);

    const host = dom.window.document.getElementById('interactive-host-player');
    const viewer = dom.window.document.getElementById('interactive-viewer-player');
    const banner = dom.window.document.getElementById('interactive-active-player');
    expect(host).not.toBeNull();
    expect(viewer).not.toBeNull();
    expect(banner).not.toBeNull();
    expect(host.textContent).toBe('Streamer');
    expect(viewer.textContent).toBe('Anna');
    expect(banner.textContent).toBe('CURRENT TURN: Anna');
    expect(host.classList.contains('is-active-player')).toBe(false);
    expect(viewer.classList.contains('is-active-player')).toBe(true);

    state.display.displayRevision += 1;
    state.display.currentTurnRole = 'host';
    state.display.activePlayerDisplayName = 'Streamer';
    listeners.get('game-engine:interactive-state')(state);

    expect(host.classList.contains('is-active-player')).toBe(true);
    expect(viewer.classList.contains('is-active-player')).toBe(false);
    expect(banner.textContent).toBe('CURRENT TURN: Streamer');
    dom.window.close();
  });

  test('unified stays idle when only activeSessions claims a viewer board', () => {
    const { dom, listeners } = loadOverlay('unified.html');
    const state = connect4State({ phase: 'idle', deadline: null });
    const viewerSession = {
      sessionId: state.display.displaySessionId,
      gameType: 'connect4',
      sessionRevision: state.display.sessionRevision,
      hostDisplayName: state.display.hostDisplayName,
      viewerDisplayName: state.display.viewerDisplayName,
      turnRole: 'viewer',
      viewerDeadlineMs: 105000,
      config: state.display.config,
      state: state.display.state
    };
    state.activeSessions = [viewerSession];
    Object.assign(state.display, {
      displaySessionId: null,
      gameType: null,
      sessionRevision: null,
      hostDisplayName: null,
      viewerDisplayName: null,
      currentTurnRole: null,
      state: null
    });

    listeners.get('game-engine:interactive-state')(state);

    expect(dom.window.document.getElementById('interactive-matchup').classList.contains('visible')).toBe(false);
    expect(dom.window.document.getElementById('idle-state').classList.contains('visible')).toBe(true);
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
    const activePlayer = dom.window.document.getElementById('interactive-active-player');
    listeners.get('game-engine:interactive-state')(connect4State());
    expect(activePlayer.textContent).not.toBe('');
    expect(i18n.t).not.toHaveBeenCalled();

    i18n.initialized = true;
    resolveReady();
    await Promise.resolve();
    expect(activePlayer.textContent).toContain('en:');
    language = 'de';
    onChange();
    expect(activePlayer.textContent).toContain('de:');
    language = 'fr';
    onLanguageChange();
    expect(activePlayer.textContent).toContain('fr:');
    dom.window.close();
  });
});
