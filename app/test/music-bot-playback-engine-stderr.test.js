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
});
