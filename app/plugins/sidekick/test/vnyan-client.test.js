/**
 * Unit Tests for Sidekick AvatarDriver & VNyanClient
 */

const { BaseAvatarDriver } = require('../backend/avatarDriver');
const { VNyanClient } = require('../backend/vnyanClient');

// Mock API
function createMockApi() {
  return {
    log: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn()
  };
}

describe('BaseAvatarDriver', () => {
  it('throws error when abstract methods are called directly', async () => {
    const api = createMockApi();
    const driver = new BaseAvatarDriver(api, {});

    await expect(driver.connect()).rejects.toThrow('connect() must be implemented');
    expect(() => driver.disconnect()).toThrow('disconnect() must be implemented');
    expect(driver.getStatus()).toEqual({
      name: 'BaseAvatarDriver',
      isConnected: false,
      isSpeaking: false
    });
  });
});

describe('VNyanClient', () => {
  let mockApi;
  let client;

  beforeEach(() => {
    mockApi = createMockApi();
    client = new VNyanClient(mockApi, {
      avatar: {
        driver: 'vnyan',
        vnyan: {
          host: '127.0.0.1',
          port: 8000,
          path: '/vnyan',
          autoConnect: false,
          reconnectOnDisconnect: false,
          sendPlainTriggers: true,
          triggers: {
            speechStart: 'CUSTOM_Speak_Start',
            speechEnd: 'CUSTOM_Speak_End',
            gift: 'CUSTOM_Gift',
            like: 'CUSTOM_Like'
          }
        }
      }
    });
  });

  afterEach(() => {
    if (client) {
      client.destroy();
    }
  });

  it('correctly constructs WebSocket URI from config', () => {
    expect(client.getUri()).toBe('ws://127.0.0.1:8000/vnyan');

    // Test without leading slash in path
    client.updateConfig({
      avatar: {
        vnyan: {
          host: '192.168.1.50',
          port: 9999,
          path: 'customPath'
        }
      }
    });
    expect(client.getUri()).toBe('ws://192.168.1.50:9999/customPath');
  });

  it('formats and sends triggers correctly when connected', () => {
    const sentMessages = [];
    client.isConnected = true;
    client.ws = {
      readyState: 1, // WebSocket.OPEN
      send: jest.fn((msg) => sentMessages.push(msg))
    };

    const success = client.sendTrigger('TEST_TRIGGER', { foo: 'bar' });
    expect(success).toBe(true);

    // Should send JSON first
    expect(sentMessages.length).toBe(2);
    const parsedJson = JSON.parse(sentMessages[0]);
    expect(parsedJson.action).toBe('trigger');
    expect(parsedJson.name).toBe('TEST_TRIGGER');
    expect(parsedJson.data).toEqual({ foo: 'bar' });

    // Should also send plain text trigger
    expect(sentMessages[1]).toBe('TEST_TRIGGER');
    expect(client.stats.messagesSent).toBe(2);
    expect(client.stats.lastTriggerSent.name).toBe('TEST_TRIGGER');
  });

  it('does not send plain triggers if sendPlainTriggers is false', () => {
    client.config.avatar.vnyan.sendPlainTriggers = false;
    const sentMessages = [];
    client.isConnected = true;
    client.ws = {
      readyState: 1,
      send: jest.fn((msg) => sentMessages.push(msg))
    };

    client.sendTrigger('TEST_ONLY_JSON', { count: 1 });
    expect(sentMessages.length).toBe(1);
    const parsed = JSON.parse(sentMessages[0]);
    expect(parsed.name).toBe('TEST_ONLY_JSON');
  });

  it('handles setSpeaking(true) and setSpeaking(false)', async () => {
    const triggers = [];
    client.sendTrigger = jest.fn((name, data) => {
      triggers.push({ name, data });
      return true;
    });

    await client.setSpeaking(true, 'Hallo Welt');
    expect(client.isSpeaking).toBe(true);
    expect(client.speechState.isSpeaking).toBe(true);
    expect(triggers[0].name).toBe('CUSTOM_Speak_Start');
    expect(triggers[0].data.text).toBe('Hallo Welt');
    expect(triggers[0].data.isSpeaking).toBe(true);

    await client.setSpeaking(false);
    expect(client.isSpeaking).toBe(false);
    expect(client.speechState.isSpeaking).toBe(false);
    expect(triggers[1].name).toBe('CUSTOM_Speak_End');
    expect(triggers[1].data.isSpeaking).toBe(false);
  });

  it('handles triggerExpression with clamping', async () => {
    const triggers = [];
    client.sendTrigger = jest.fn((name, data) => {
      triggers.push({ name, data });
    });

    await client.triggerExpression('happy', 1.5);
    expect(triggers[0].name).toBe('SK_Emotion_happy');
    expect(triggers[0].data.emotion).toBe('happy');
    expect(triggers[0].data.intensity).toBe(1.0); // clamped to 1.0

    await client.triggerExpression('sad', -0.5);
    expect(triggers[1].name).toBe('SK_Emotion_sad');
    expect(triggers[1].data.intensity).toBe(0.0); // clamped to 0.0
  });

  it('handles stream events (gift, like, follow, chat)', async () => {
    const triggers = [];
    client.sendTrigger = jest.fn((name, data) => {
      triggers.push({ name, data });
    });

    // Gift event should trigger base gift AND named gift
    await client.handleStreamEvent('gift', {
      giftName: 'Rose',
      diamondCount: 1,
      repeatCount: 5,
      nickname: 'TestUser'
    });

    expect(triggers.length).toBe(2);
    expect(triggers[0].name).toBe('CUSTOM_Gift');
    expect(triggers[0].data.giftName).toBe('Rose');
    expect(triggers[0].data.diamonds).toBe(1);
    expect(triggers[1].name).toBe('CUSTOM_Gift_Rose');

    // Like event
    await client.handleStreamEvent('like', { likeCount: 15, nickname: 'TestUser' });
    expect(triggers[2].name).toBe('CUSTOM_Like');
    expect(triggers[2].data.likeCount).toBe(15);
  });

  it('triggers emotion with auto-reset to Neutral after duration', () => {
    jest.useFakeTimers();
    const triggers = [];
    client.sendTrigger = jest.fn((name, data) => {
      triggers.push({ name, data });
      return true;
    });

    client.triggerEmotion('Blush', 3000, 0.9);
    expect(client.currentEmotion).toBe('Blush');
    expect(client.emotionExpiresAt).toBeGreaterThan(Date.now());
    expect(triggers[0].name).toBe('SK_Emotion_Blush');
    expect(triggers[0].data.emotion).toBe('Blush');
    expect(triggers[0].data.intensity).toBe(0.9);
    expect(triggers[0].data.durationMs).toBe(3000);

    // Fast forward timer
    jest.advanceTimersByTime(3000);

    expect(client.currentEmotion).toBe('Neutral');
    expect(triggers[1].name).toBe('SK_Emotion_Neutral');
    expect(triggers[1].data.isReset).toBe(true);
    jest.useRealTimers();
  });

  it('triggers item drop in VNyan with count clamping', () => {
    const triggers = [];
    client.sendTrigger = jest.fn((name, data) => {
      triggers.push({ name, data });
      return true;
    });

    // Valid drop
    const res = client.triggerItemDrop('Rose', 5, 'Viewer42');
    expect(res).toBe(true);
    expect(triggers[0].name).toBe('SK_ItemDrop');
    expect(triggers[0].data.item).toBe('Rose');
    expect(triggers[0].data.count).toBe(5);
    expect(triggers[0].data.user).toBe('Viewer42');

    // Clamped count
    client.triggerItemDrop('Cake', 100, 'Viewer42');
    expect(triggers[1].data.count).toBe(30); // maxDropPerGift defaults to 30
  });

  it('matches gift rules by name and by diamond count', () => {
    client.updateConfig({
      avatar: {
        vnyan: {
          giftRules: [
            { id: 'r1', matchType: 'name', matchValue: 'Galaxy', trigger: 'SK_Galaxy', emotion: 'Surprised' },
            { id: 'r2', matchType: 'minDiamonds', matchValue: 500, trigger: 'SK_BigDiamonds', emotion: 'Happy' }
          ]
        }
      }
    });

    // Match by name
    const matchName = client.matchGiftRule('Mini Galaxy', 10, 1);
    expect(matchName).toBeDefined();
    expect(matchName.id).toBe('r1');
    expect(matchName.trigger).toBe('SK_Galaxy');

    // Match by minDiamonds
    const matchDiamonds = client.matchGiftRule('RandomChest', 100, 5); // 500 diamonds
    expect(matchDiamonds).toBeDefined();
    expect(matchDiamonds.id).toBe('r2');
    expect(matchDiamonds.trigger).toBe('SK_BigDiamonds');

    // No match
    const noMatch = client.matchGiftRule('SmallCoin', 5, 1);
    expect(noMatch).toBeNull();
  });

  it('executes custom gift rule actions during handleStreamEvent', async () => {
    client.updateConfig({
      avatar: {
        vnyan: {
          giftRules: [
            {
              id: 'rule_rose',
              matchType: 'name',
              matchValue: 'Rose',
              trigger: 'CUSTOM_SK_ROSE',
              emotion: 'Blush',
              durationMs: 2500,
              itemDrop: true,
              dropCount: 4
            }
          ]
        }
      }
    });

    const triggers = [];
    client.sendTrigger = jest.fn((name, data) => {
      triggers.push({ name, data });
      return true;
    });

    await client.handleStreamEvent('gift', {
      giftName: 'Rose',
      diamondCount: 1,
      repeatCount: 2,
      nickname: 'RoseGiver'
    });

    // Should fire:
    // 1) Rule custom trigger (CUSTOM_SK_ROSE)
    // 2) Emotion trigger (SK_Emotion_Blush)
    // 3) Item drop trigger (SK_ItemDrop with count 4)
    // 4) Base gift trigger (SK_Gift)
    // 5) Named gift trigger (SK_Gift_Rose)
    const triggerNames = triggers.map(t => t.name);
    expect(triggerNames).toContain('CUSTOM_SK_ROSE');
    expect(triggerNames).toContain('SK_Emotion_Blush');
    expect(triggerNames).toContain('SK_ItemDrop');
    expect(triggerNames).toContain('SK_Gift');
    expect(triggerNames).toContain('SK_Gift_Rose');
  });

  it('handles event emotions for follow, subscribe, and question chats', async () => {
    client.updateConfig({
      avatar: {
        vnyan: {
          emotions: {
            eventEmotions: {
              follow: { emotion: 'Happy', durationMs: 3000 },
              subscribe: { emotion: 'Joy', durationMs: 5000 },
              question: { emotion: 'Thinking', durationMs: 4000 }
            }
          }
        }
      }
    });

    const triggers = [];
    client.sendTrigger = jest.fn((name, data) => {
      triggers.push({ name, data });
      return true;
    });

    // Follow event
    await client.handleStreamEvent('follow', { nickname: 'NewFollower' });
    expect(triggers.some(t => t.name === 'SK_Emotion_Happy')).toBe(true);

    // Subscribe event
    await client.handleStreamEvent('subscribe', { nickname: 'NewSub' });
    expect(triggers.some(t => t.name === 'SK_Emotion_Joy')).toBe(true);

    // Chat question
    await client.handleStreamEvent('chat', { comment: 'Wie geht es dir?' });
    expect(triggers.some(t => t.name === 'SK_Emotion_Thinking')).toBe(true);
  });

  it('returns comprehensive status information', () => {
    const status = client.getStatus();
    expect(status.driver).toBe('vnyan');
    expect(status.isConnected).toBe(false);
    expect(status.uri).toBe('ws://127.0.0.1:8000/vnyan');
    expect(status.stats).toBeDefined();
    expect(status.speechState).toBeDefined();
    expect(status.currentEmotion).toBe('Neutral');
  });

  it('handles disconnect and cleanup cleanly', () => {
    client.isConnected = true;
    const mockClose = jest.fn();
    client.ws = { close: mockClose };

    client.disconnect();
    expect(client.isConnected).toBe(false);
    expect(mockClose).toHaveBeenCalled();
    expect(client.isManualDisconnect).toBe(true);
    expect(client.currentEmotion).toBe('Neutral');
  });
});
