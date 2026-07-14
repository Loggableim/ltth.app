const fs = require('fs');
const path = require('path');
const SttTickerPlugin = require('../plugins/stt-ticker/main');

function createPlugin() {
  const handlers = {};
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    log: jest.fn(),
    registerSocket: jest.fn((event, handler) => { handlers[event] = handler; })
  };
  const plugin = new SttTickerPlugin(api);
  plugin.config = { enabled: true };
  plugin.asrPipeline = {
    getEffectiveProvider: jest.fn(() => 'deepgram')
  };
  plugin.deepgramLiveSessions = {
    start: jest.fn().mockResolvedValue({ ok: true, state: 'open' }),
    sendAudio: jest.fn(() => true),
    finalize: jest.fn(() => true),
    stop: jest.fn().mockResolvedValue(true)
  };
  plugin._registerSocketEvents();
  return { plugin, handlers };
}

describe('STT Ticker Deepgram capture routing', () => {
  test('registers start, binary audio, finalize, and stop socket events', async () => {
    const { plugin, handlers } = createPlugin();
    const socket = { id: 'capture-1', emit: jest.fn() };
    const ack = jest.fn();

    await handlers['stt-ticker:deepgram:start'](socket, { sampleRate: 16000, channels: 1 }, ack);
    await handlers['stt-ticker:deepgram:audio'](socket, Buffer.from([1, 2]));
    await handlers['stt-ticker:deepgram:finalize'](socket);
    await handlers['stt-ticker:deepgram:stop'](socket);

    expect(plugin.deepgramLiveSessions.start).toHaveBeenCalledWith(socket, {
      sampleRate: 16000,
      channels: 1
    });
    expect(plugin.deepgramLiveSessions.sendAudio).toHaveBeenCalledWith('capture-1', expect.any(Buffer));
    expect(plugin.deepgramLiveSessions.finalize).toHaveBeenCalledWith('capture-1');
    expect(plugin.deepgramLiveSessions.stop).toHaveBeenCalledWith('capture-1', 'capture-stop');
    expect(ack).toHaveBeenCalledWith({ ok: true, state: 'open' });
  });

  test('capture page routes Deepgram over Socket.IO while retaining WAV upload for chunk providers', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'stt-ticker', 'capture.html'),
      'utf8'
    );

    expect(html).toContain("effectiveProvider === 'deepgram'");
    expect(html).toContain("socket.emit('stt-ticker:deepgram:audio'");
    expect(html).toContain("socket.emit('stt-ticker:deepgram:finalize'");
    expect(html).toContain("fetch(API + '/api/stt-ticker/transcribe'");
    expect(html).toContain("new Blob([buffer], { type: 'audio/wav' })");
  });
});
