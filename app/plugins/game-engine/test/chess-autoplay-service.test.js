const ChessAutoplayService = require('../backend/chess-autoplay-service');
const { Chess } = require('chess.js');

let hasLocalStockfish = true;
try {
  require.resolve('stockfish');
} catch (_) {
  hasLocalStockfish = false;
}
const realStockfishTest = hasLocalStockfish ? test : test.skip;

function createWorker({ onGo } = {}) {
  const worker = {
    messages: [],
    terminated: false,
    onmessage: null,
    postMessage(message) {
      this.messages.push(message);
      onGo?.(message, this);
    },
    terminate: jest.fn(function terminate() {
      this.terminated = true;
    })
  };
  return worker;
}

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const legalMoves = [
  { from: 'g1', to: 'f3' },
  { from: 'e2', to: 'e4' },
  { from: 'b1', to: 'c3' }
];

describe('ChessAutoplayService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('uses a seed-deterministic legal fallback when no local engine is available', async () => {
    const service = new ChessAutoplayService({ workerFactory: () => null });
    const request = {
      fen: initialFen,
      legalMoves: [...legalMoves].reverse(),
      seed: 'session-42',
      targetElo: 1200
    };

    const first = await service.selectMove(request);
    const second = await service.selectMove(request);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ source: 'fallback', timedOut: false });
    expect(['g1f3', 'e2e4', 'b1c3']).toContain(first.move);

    await service.destroy();
  });

  test('keeps one lazy worker, configures its fixed limits, and accepts only a legal bestmove', async () => {
    const worker = createWorker({
      onGo(message, instance) {
        if (message === 'go nodes 1200') {
          queueMicrotask(() => instance.onmessage?.({ data: 'bestmove g1f3' }));
        }
      }
    });
    const workerFactory = jest.fn(() => worker);
    const service = new ChessAutoplayService({ workerFactory });

    const first = await service.selectMove({
      fen: initialFen,
      legalMoves,
      seed: 'a',
      targetElo: 2000
    });
    const second = await service.selectMove({
      fen: initialFen,
      legalMoves,
      seed: 'b',
      targetElo: 2000
    });

    expect(first).toMatchObject({ move: 'g1f3', source: 'stockfish', timedOut: false });
    expect(second).toMatchObject({ move: 'g1f3', source: 'stockfish', timedOut: false });
    expect(workerFactory).toHaveBeenCalledTimes(1);
    expect(worker.messages).toEqual(expect.arrayContaining([
      'uci',
      'setoption name Hash value 16',
      'setoption name Threads value 1',
      'setoption name MultiPV value 8',
      'go nodes 1200'
    ]));

    await service.destroy();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  test('falls back when the engine proposes a move outside the legal move set', async () => {
    const worker = createWorker({
      onGo(message, instance) {
        if (message === 'go nodes 1200') {
          queueMicrotask(() => instance.onmessage?.({ data: 'bestmove a1a8' }));
        }
      }
    });
    const service = new ChessAutoplayService({ workerFactory: () => worker });

    const result = await service.selectMove({
      fen: initialFen,
      legalMoves,
      seed: 'illegal-engine-move',
      targetElo: 1800
    });

    expect(result).toMatchObject({ source: 'fallback', timedOut: false });
    expect(['g1f3', 'e2e4', 'b1c3']).toContain(result.move);

    await service.destroy();
  });

  test('enforces the 250 ms worker deadline and keeps the fallback legal', async () => {
    jest.useFakeTimers();
    const worker = createWorker();
    const service = new ChessAutoplayService({
      workerFactory: () => worker,
      timeoutMs: 1000
    });

    const pending = service.selectMove({
      fen: initialFen,
      legalMoves,
      seed: 'deadline',
      targetElo: 1600
    });
    let settled = false;
    pending.then(() => { settled = true; });

    await jest.advanceTimersByTimeAsync(249);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({ source: 'fallback', timedOut: true });
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    await service.destroy();
  });

  test('cancels an active worker request and terminates it during destroy', async () => {
    const worker = createWorker();
    const service = new ChessAutoplayService({ workerFactory: () => worker });
    const pending = service.selectMove({
      fen: initialFen,
      legalMoves,
      seed: 'destroy',
      targetElo: 1600
    });

    await service.destroy();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  test('recreates a healthy worker after an aborted autoplay selection', async () => {
    const firstWorker = createWorker();
    const secondWorker = createWorker({
      onGo(message, instance) {
        if (message === 'go nodes 1200') {
          queueMicrotask(() => instance.onmessage?.({ data: 'bestmove e2e4' }));
        }
      }
    });
    const workerFactory = jest.fn()
      .mockReturnValueOnce(firstWorker)
      .mockReturnValueOnce(secondWorker);
    const service = new ChessAutoplayService({ workerFactory });
    const abortController = new AbortController();
    const pending = service.selectMove({
      fen: initialFen,
      legalMoves,
      seed: 'manual-takeover',
      targetElo: 1600,
      signal: abortController.signal
    });

    abortController.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);

    await expect(service.selectMove({
      fen: initialFen,
      legalMoves,
      seed: 'next-visible-turn',
      targetElo: 1600
    })).resolves.toMatchObject({ move: 'e2e4', source: 'stockfish' });
    expect(workerFactory).toHaveBeenCalledTimes(2);

    await service.destroy();
  });

  realStockfishTest('runs one local Lite-Single WASM worker and returns a legal UCI move', async () => {
    jest.useRealTimers();
    const chess = new Chess(initialFen);
    const service = new ChessAutoplayService();
    const rssBefore = process.memoryUsage().rss;
    const cpuBefore = process.cpuUsage();
    const warmed = await service.warm({ timeoutMs: 10000 });

    expect(warmed).toBe(true);
    const worker = service.worker;
    expect(worker?.pid).toEqual(expect.any(Number));

    const result = await service.selectMove({
      fen: chess.fen(),
      legalMoves: chess.moves({ verbose: true }),
      seed: 'real-worker-smoke',
      targetElo: 1800
    });
    const cpuUsed = process.cpuUsage(cpuBefore);
    const rssAfter = process.memoryUsage().rss;

    expect(result).toMatchObject({ source: 'stockfish', timedOut: false });
    expect(chess.moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion || ''}`)).toContain(result.move);
    expect(service.worker).toBe(worker);
    expect(rssBefore).toBeGreaterThan(0);
    expect(rssAfter).toBeGreaterThan(0);
    expect(cpuUsed.user + cpuUsed.system).toBeGreaterThanOrEqual(0);

    await service.destroy();
    expect(service.worker).toBeNull();
  }, 15000);
});
