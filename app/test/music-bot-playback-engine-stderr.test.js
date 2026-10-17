const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

const { spawn } = require('child_process');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');

function createChildProcess(pid = 9876) {
  return Object.assign(new EventEmitter(), {
    pid,
    stderr: new PassThrough(),
    stdout: new EventEmitter(),
    exitCode: null,
    kill: jest.fn()
  });
}

describe('Music Bot MPV stderr handling', () => {
  let child;
  let engine;

  beforeEach(() => {
    jest.clearAllMocks();
    child = createChildProcess();
    spawn.mockReturnValue(child);
    engine = new PlaybackEngine({ defaultVolume: 50, mpvPath: 'mpv' }, { log: jest.fn() });
    engine._getAudioOutputArgs = () => [];
    engine._connectSocket = jest.fn(async () => new EventEmitter());
  });

  test('does not treat a harmless stderr message containing error as a process error', async () => {
    const errors = [];
    engine.on('error', (error) => errors.push(error));
    await engine._startProcess();

    child.stderr.write('[cplayer] Metadata field contains the word error but playback is healthy.\n');

    expect(errors).toEqual([]);
    expect(engine.state).toBe('idle');
    expect(engine.process).toBe(child);
  });

  test('keeps actual MPV IPC end-file errors visible after stderr output', async () => {
    const trackEnds = [];
    await engine._startProcess();
    engine.nowPlaying = { id: 'failed-track', title: 'Failed track' };
    engine.state = 'playing';
    engine.on('track-end', (event) => trackEnds.push(event));

    child.stderr.write('[cplayer] Error opening a recoverable probe.\n');
    engine._handleMessage(JSON.stringify({
      event: 'end-file',
      reason: 'error',
      error: 'Failed to open stream'
    }));

    expect(trackEnds).toEqual([expect.objectContaining({
      track: expect.objectContaining({ id: 'failed-track' }),
      reason: 'error',
      error: 'Failed to open stream'
    })]);
    expect(engine.state).toBe('idle');
  });

  test('continues to emit genuine child process errors', async () => {
    const errors = [];
    engine.on('error', (error) => errors.push(error));
    await engine._startProcess();
    const processError = Object.assign(new Error('MPV process spawn failed'), { code: 'EACCES' });

    child.emit('error', processError);

    expect(errors).toEqual([processError]);
  });

  test('ignores empty and ordinary stderr output without changing playback state', async () => {
    const errors = [];
    engine.on('error', (error) => errors.push(error));
    await engine._startProcess();
    engine.nowPlaying = { id: 'healthy-track', title: 'Healthy track' };
    engine.state = 'playing';

    child.stderr.write(Buffer.alloc(0));
    child.stderr.write('[cplayer] Playing: local-track.wav\n');

    expect(errors).toEqual([]);
    expect(engine.state).toBe('playing');
    expect(engine.nowPlaying).toEqual({ id: 'healthy-track', title: 'Healthy track' });
  });

  test('logs a rate-limited debug line for MPV stderr output', async () => {
    await engine._startProcess();

    child.stderr.write('[cplayer] Playing: local-track.wav\n');

    expect(engine.api.log).toHaveBeenCalledTimes(1);
    expect(engine.api.log).toHaveBeenCalledWith(
      expect.stringContaining('[music-bot] MPV stderr: [cplayer] Playing: local-track.wav'),
      'debug'
    );
  });

  test('suppresses repeated stderr lines inside the interval and logs again afterwards', async () => {
    let clock = 1000;
    const clockedEngine = new PlaybackEngine({ defaultVolume: 50, mpvPath: 'mpv' }, { log: jest.fn() }, { now: () => clock });
    clockedEngine._getAudioOutputArgs = () => [];
    clockedEngine._connectSocket = jest.fn(async () => new EventEmitter());
    const clockedChild = createChildProcess(4321);
    spawn.mockReturnValue(clockedChild);
    await clockedEngine._startProcess();

    clockedChild.stderr.write('[cplayer] first line\n');
    clock = 1400;
    clockedChild.stderr.write('[cplayer] second line\n');
    clock = 2600;
    clockedChild.stderr.write('[cplayer] third line\n');

    expect(clockedEngine.api.log).toHaveBeenCalledTimes(2);
    expect(clockedEngine.api.log.mock.calls[0][0]).toContain('first line');
    expect(clockedEngine.api.log.mock.calls[1][0]).toContain('third line');
  });

  test('does not log blank stderr output', async () => {
    await engine._startProcess();

    child.stderr.write('   \n\t\n');

    expect(engine.api.log).not.toHaveBeenCalled();
  });

  test('caps the logged stderr snippet and stays on a single line', async () => {
    await engine._startProcess();

    child.stderr.write(`${'x'.repeat(500)}\nsecond line\n`);

    expect(engine.api.log).toHaveBeenCalledTimes(1);
    const [message, level] = engine.api.log.mock.calls[0];
    expect(level).toBe('debug');
    expect(message).not.toContain('\n');
    expect(message.length).toBeLessThan(300);
    expect(message.endsWith('…')).toBe(true);
  });
});
