const OSCBridgePlugin = require('../main');
const { normalizeConfig } = require('../modules/OscBridgeConfig');
const fs = require('fs');
const path = require('path');

function createBridge() {
  const api = {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    },
    log: jest.fn(),
    emit: jest.fn()
  };
  const bridge = new OSCBridgePlugin(api);
  bridge.isRunning = true;
  bridge.config = {
    chatbox: {
      enabled: true,
      showTyping: true,
      notificationSound: false
    }
  };
  bridge.send = jest.fn(() => true);
  return { bridge, api };
}

describe('OSC Bridge STT Ticker chatbox intents', () => {
  test('defaults VRChat Chatbox notification sound to off', () => {
    expect(normalizeConfig({}).chatbox.notificationSound).toBe(false);
  });

  test('turns off typing and sends a final STT message silently', () => {
    const { bridge } = createBridge();

    const handled = bridge.handleSttTickerChatboxIntent({
      type: 'send',
      messages: ['Hallo VRChat']
    });

    expect(handled).toBe(true);
    expect(bridge.send).toHaveBeenNthCalledWith(1, '/chatbox/typing', false);
    expect(bridge.send).toHaveBeenNthCalledWith(2, '/chatbox/input', 'Hallo VRChat', true, false);
  });

  test('forwards the STT typing state only when global chatbox typing is enabled', () => {
    const { bridge } = createBridge();

    bridge.handleSttTickerChatboxIntent({ type: 'typing', visible: true });
    expect(bridge.send).toHaveBeenCalledWith('/chatbox/typing', true);

    bridge.send.mockClear();
    bridge.config.chatbox.showTyping = false;
    bridge.handleSttTickerChatboxIntent({ type: 'typing', visible: true });
    expect(bridge.send).not.toHaveBeenCalled();
  });

  test('offers global typing and notification-sound controls in the OSC Bridge UI', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../ui.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '../../../public/js/osc-bridge-ui.js'), 'utf8');

    expect(ui).toContain('id="chatbox-show-typing"');
    expect(ui).toContain('id="chatbox-notification-sound"');
    expect(script).toContain('chatbox-notification-sound');
  });
});
