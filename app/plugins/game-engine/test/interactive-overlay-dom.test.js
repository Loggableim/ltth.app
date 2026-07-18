const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const overlayDir = path.join(__dirname, '..', 'overlay');

function loadOverlay(name) {
  const listeners = new Map();
  const audioPlay = jest.fn(() => Promise.resolve());
  const socket = {
    on: jest.fn((event, handler) => listeners.set(event, handler)),
    emit: jest.fn()
  };
  let now = 100000;
  let nextIntervalId = 1;
  const intervals = new Map();
  const source = fs.readFileSync(path.join(overlayDir, name), 'utf8')
    .replace(/<script[^>]+src=[^>]*><\/script>/gi, '');
  const dom = new JSDOM(source, {
    url: `http://localhost/overlay/game-engine/${name.replace('.html', '')}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.io = () => socket;
      window.fetch = jest.fn(() => new Promise(() => {}));
      window.Date.now = () => now;
      window.setInterval = callback => {
        const id = nextIntervalId++;
        intervals.set(id, callback);
        return id;
      };
      window.clearInterval = id => intervals.delete(id);
      window.Audio = class Audio {
        play() {
          return audioPlay();
        }
      };
    }
  });
  return {
    dom,
    listeners,
    audioPlay,
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

describe('interactive overlay countdown DOM', () => {
  test.each([
    ['connect4.html', 'interactive-viewer-countdown'],
    ['unified.html', 'interactive-viewer-countdown']
  ])('%s ticks an authoritative viewer countdown, warns, and clears it on a newer phase', (name, countdownId) => {
    const { dom, listeners, advance } = loadOverlay(name);
    const countdown = dom.window.document.getElementById(countdownId);
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

  test('direct Connect4 plays one move sound for each newly visible session and move number', () => {
    const { dom, listeners, audioPlay } = loadOverlay('connect4.html');
    const applyState = listeners.get('game-engine:interactive-state');

    applyState(connect4State());
    applyState(connect4State({ displayRevision: 2 }));
    expect(audioPlay).toHaveBeenCalledTimes(1);

    applyState(connect4State({ displayRevision: 3, sessionRevision: 2, moveNumber: 2 }));
    expect(audioPlay).toHaveBeenCalledTimes(2);

    applyState(connect4State({ displayRevision: 4, sessionRevision: 1, sessionId: 8, moveNumber: 2 }));
    expect(audioPlay).toHaveBeenCalledTimes(3);

    dom.window.close();
  });

  test('unified overlay ignores a stale session revision at the current display revision', () => {
    const { dom, listeners } = loadOverlay('unified.html');
    const countdown = dom.window.document.getElementById('interactive-viewer-countdown');
    const applyState = listeners.get('game-engine:interactive-state');

    applyState(connect4State({ displayRevision: 4, sessionRevision: 2, deadline: 104000 }));
    expect(countdown.textContent).toContain('4');

    applyState(connect4State({ displayRevision: 4, sessionRevision: 1, deadline: 120000 }));
    expect(countdown.textContent).toContain('4');
    expect(countdown.textContent).not.toContain('20');

    dom.window.close();
  });
});
