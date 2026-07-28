const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dashboardPath = path.join(__dirname, '..', 'public', 'js', 'dashboard.js');

function loadDashboardPlayback({ atob, createObjectURL } = {}) {
  const socket = { emit: jest.fn() };
  const audio = {
    volume: 1,
    playbackRate: 1,
    src: ''
  };
  const document = {
    addEventListener: jest.fn(),
    getElementById: jest.fn((id) => (id === 'dashboard-tts-audio' ? audio : null))
  };
  const window = {
    socket: null,
    DashboardTTSRenderer: null
  };
  const context = vm.createContext({
    Blob,
    Map,
    Set,
    Uint8Array,
    URL: {
      createObjectURL: createObjectURL || (() => 'blob:dashboard-tts'),
      revokeObjectURL: jest.fn()
    },
    alert: jest.fn(),
    atob: atob || ((value) => Buffer.from(value, 'base64').toString('binary')),
    clearInterval,
    clearTimeout,
    console: {
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn()
    },
    document,
    fetch: jest.fn(),
    localStorage: { getItem: jest.fn(), setItem: jest.fn() },
    setInterval,
    setTimeout,
    window
  });

  vm.runInContext(fs.readFileSync(dashboardPath, 'utf8'), context, { filename: dashboardPath });
  context.__socket = socket;
  vm.runInContext('socket = __socket; audioUnlocked = true;', context);

  return {
    audio,
    context,
    failures: () => socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:failed'),
    socket
  };
}

describe('Dashboard TTS initialization failures', () => {
  test('reports one terminal failure when a normal TTS payload cannot decode', async () => {
    const dashboard = loadDashboardPlayback({
      atob: () => {
        const error = new Error('invalid base64');
        error.name = 'InvalidCharacterError';
        throw error;
      }
    });
    const playDashboardTTS = vm.runInContext('playDashboardTTS', dashboard.context);

    await playDashboardTTS({
      playbackId: 'invalid-normal-audio',
      audioData: 'not-valid-base64',
      text: 'must never leave the queue waiting'
    });

    expect(dashboard.failures()).toEqual([
      ['tts:renderer:failed', {
        playbackId: 'invalid-normal-audio',
        reason: 'InvalidCharacterError'
      }]
    ]);
    expect(dashboard.failures()[0][1]).not.toHaveProperty('audioData');
    expect(dashboard.failures()[0][1]).not.toHaveProperty('text');
  });

  test('reports one terminal failure and releases a buffered stream when its object URL cannot initialize', async () => {
    const dashboard = loadDashboardPlayback({
      createObjectURL: () => {
        const error = new Error('object URL unavailable');
        error.name = 'ObjectUrlError';
        throw error;
      }
    });
    const handleStreamChunk = vm.runInContext('handleStreamChunk', dashboard.context);
    const handleStreamEnd = vm.runInContext('handleStreamEnd', dashboard.context);

    handleStreamChunk({
      playbackId: 'stream-object-url-error',
      chunk: 'AQ==',
      isFirst: true,
      format: 'mp3'
    });
    handleStreamEnd({ playbackId: 'stream-object-url-error' });
    await Promise.resolve();

    expect(dashboard.failures()).toEqual([
      ['tts:renderer:failed', {
        playbackId: 'stream-object-url-error',
        reason: 'ObjectUrlError'
      }]
    ]);
    expect(vm.runInContext("streamingBuffers.has('stream-object-url-error')", dashboard.context)).toBe(false);
    expect(dashboard.failures()[0][1]).not.toHaveProperty('audioData');
    expect(dashboard.failures()[0][1]).not.toHaveProperty('text');
  });
});
