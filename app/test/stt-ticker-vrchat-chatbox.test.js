const SttTickerPlugin = require('../plugins/stt-ticker/main');
const { DEFAULT_CONFIG } = require('../plugins/stt-ticker/backend/config');
const fs = require('fs');
const path = require('path');

function createPlugin() {
  const api = {
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    emit: jest.fn(),
    log: jest.fn(),
    pluginLoader: {
      getPluginInstance: jest.fn(() => ({ isRunning: true }))
    }
  };
  const plugin = new SttTickerPlugin(api);
  plugin.config = {
    vrchatChatbox: { enabled: true }
  };
  return { plugin, api };
}

describe('STT Ticker VRChat chatbox output', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('keeps VRChat Chatbox output disabled by default', () => {
    expect(DEFAULT_CONFIG.vrchatChatbox).toEqual({ enabled: false });
  });

  test('bundles final original-language captions for 700 ms before emitting them', () => {
    const { plugin, api } = createPlugin();

    plugin._queueVrchatChatboxText('Hello everyone.');
    plugin._queueVrchatChatboxText('Hallo zusammen.');

    expect(api.emit).toHaveBeenCalledWith('stt-ticker:vrchat-chatbox', {
      type: 'typing',
      visible: true
    });

    jest.advanceTimersByTime(699);
    expect(api.emit).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    expect(api.emit).toHaveBeenLastCalledWith('stt-ticker:vrchat-chatbox', {
      type: 'send',
      messages: ['Hello everyone. Hallo zusammen.']
    });
  });

  test('splits outgoing text at word boundaries and preserves an oversized word', () => {
    const { plugin, api } = createPlugin();
    const oversizedWord = 'x'.repeat(145);

    plugin._queueVrchatChatboxText(`eins zwei ${oversizedWord} drei`);
    jest.advanceTimersByTime(700);

    const intent = api.emit.mock.calls.at(-1)[1];
    expect(intent.messages).toEqual([
      'eins zwei',
      'x'.repeat(144),
      'x drei'
    ]);
    expect(intent.messages.every(message => message.length <= 144)).toBe(true);
  });

  test('does not queue chatbox text while the feature is disabled', () => {
    const { plugin, api } = createPlugin();
    plugin.config.vrchatChatbox.enabled = false;

    plugin._queueVrchatChatboxText('Nicht senden');
    jest.runOnlyPendingTimers();

    expect(api.emit).not.toHaveBeenCalled();
  });

  test('drops chatbox text when the OSC Bridge is unavailable', () => {
    const { plugin, api } = createPlugin();
    api.pluginLoader.getPluginInstance.mockReturnValue(null);

    plugin._queueVrchatChatboxText('Nicht puffern');
    jest.runOnlyPendingTimers();

    expect(api.emit).not.toHaveBeenCalled();
    expect(plugin._getStatus().vrchatChatbox).toMatchObject({
      enabled: true,
      bridgeAvailable: false,
      lastError: 'OSC Bridge nicht verfuegbar'
    });
  });

  test('offers a VRChat Chatbox toggle and bridge status in the STT UI', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../plugins/stt-ticker/ui.html'), 'utf8');

    expect(ui).toContain('id="vrchat-chatbox-enabled"');
    expect(ui).toContain('id="vrchat-chatbox-status"');
  });
});
