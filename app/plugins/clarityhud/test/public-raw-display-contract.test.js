'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ClarityHUDBackend = require('../backend/api');
const settingsSchema = require('../lib/settings-schema');
const {
  projectPublicOverlayPayload,
  projectClarityStateResponse
} = require('../../../modules/public-overlay-payload-projection');

const pluginRoot = path.resolve(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function createDom(dock) {
  const markup = dock === 'chat'
    ? '<!doctype html><html><body><div id="chat-container"><div id="messages"></div></div></body></html>'
    : dock === 'multi'
      ? '<!doctype html><html><body><div id="multi-container"></div><div id="messages"></div><div id="debug-streams"></div></body></html>'
      : '<!doctype html><html><body><div id="overlay-container"><div class="feed-container"></div></div></body></html>';
  const dom = new JSDOM(markup, { url: 'http://localhost/', runScripts: 'outside-only' });
  const { window } = dom;
  window.ClarityHUDI18n = { text: (_key, fallback = '') => fallback };
  window.i18n = { ready: new Promise(() => {}) };
  window.io = jest.fn(() => ({ on: jest.fn(), emit: jest.fn() }));
  window.fetch = jest.fn(() => new Promise(() => {}));
  window.requestAnimationFrame = callback => callback();
  for (const library of ['lib/message-parser.js', 'lib/badge-renderer.js', 'lib/emoji-parser.js']) {
    window.eval(source(library));
  }
  if (dock === 'chat') {
    window.eval(`${source('overlays/chat.js')}\nwindow.__clarityFixture = { STATE, addMessage };`);
    const fixture = window.__clarityFixture;
    fixture.STATE.messagesContainer = window.document.getElementById('messages');
    fixture.STATE.settings = { ...settingsSchema.getDefaults('chat'), showTimestamps: false };
    fixture.STATE.badgeRenderer = new window.BadgeRenderer(fixture.STATE.settings);
    fixture.STATE.emojiParser = new window.EmojiParser();
    fixture.STATE.animationRenderer = null;
  } else if (dock === 'multi') {
    window.eval(`${source('overlays/multi.js')}\nwindow.__clarityFixture = { STATE, applySettings, handleChatEvent, handleGiftEvent };`);
    const fixture = window.__clarityFixture;
    fixture.STATE.multiContainer = window.document.getElementById('multi-container');
    fixture.STATE.messagesContainer = window.document.getElementById('messages');
    fixture.STATE.settings = { ...settingsSchema.getDefaults('multi'), maxMessages: 300 };
    fixture.STATE.badgeRenderer = new window.BadgeRenderer(fixture.STATE.settings);
    fixture.STATE.messageParser = new window.MessageParser();
    fixture.STATE.emojiParser = new window.EmojiParser();
  } else {
    window.eval(`${source('overlays/full.js')}\nwindow.__clarityFixture = { STATE, loadInitialState, createEventElement };`);
    const fixture = window.__clarityFixture;
    fixture.STATE.container = window.document.getElementById('overlay-container');
    fixture.STATE.settings = { ...settingsSchema.getDefaults('full'), useVirtualScrolling: false };
    fixture.STATE.badgeRenderer = new window.BadgeRenderer(fixture.STATE.settings);
    fixture.STATE.messageParser = new window.MessageParser();
    fixture.STATE.emojiParser = new window.EmojiParser();
    fixture.STATE.animationRenderer = null;
  }
  const fixture = window.__clarityFixture;
  return { dom, window, fixture };
}

function visibleEvidence(element) {
  return {
    text: element.textContent,
    badges: [...element.querySelectorAll('.badge')].map(badge => badge.className).sort()
  };
}

async function createProducerFixture() {
  const api = { emit: jest.fn(), log: jest.fn() };
  const backend = new ClarityHUDBackend(api);
  const chatInput = {
    username: 'viewer_handle',
    nickname: 'Viewer Nick',
    message: 'fixture hello',
    userId: 'stable-platform-user-id-123',
    profilePictureUrl: null,
    teamMemberLevel: 4,
    isModerator: true,
    isSubscriber: true,
    timestamp: '2026-10-07T12:00:00.000Z',
    debugExtra: 'not-rendered-chat-extra'
  };
  await backend.handleChatEvent(chatInput);
  const chatPayload = api.emit.mock.calls.find(([event]) => event === 'clarityhud.update.chat')[1];
  const chatHistory = backend.eventQueues.chat[0];

  await backend.handleGiftEvent({
    username: 'gifter_handle',
    nickname: 'Gift Sender',
    userId: 'stable-platform-user-id-456',
    giftName: 'Rose',
    giftId: 'gift-catalog-id-91',
    giftPictureUrl: 'https://fixture.invalid/rose.png',
    repeatCount: 2,
    diamondCount: 5,
    coins: 10,
    totalCoins: 910,
    giftType: 0,
    createTime: '2026-10-07T12:00:01.000Z',
    timestamp: '2026-10-07T12:00:01.000Z'
  });
  const giftPayload = api.emit.mock.calls.find(([event]) => event === 'clarityhud.update.gift')[1];
  const giftHistory = backend.eventQueues.gift[0];
  return { api, backend, chatPayload, chatHistory, giftPayload, giftHistory };
}

describe('ClarityHUD public raw payload display contract', () => {
  test('chat live and history keep display and parser correlation with an opaque public token', async () => {
    const { chatPayload, chatHistory } = await createProducerFixture();
    expect(chatPayload.raw).toMatchObject({
      userId: 'stable-platform-user-id-123',
      username: 'viewer_handle',
      nickname: 'Viewer Nick',
      message: 'fixture hello',
      teamMemberLevel: 4,
      isModerator: true,
      isSubscriber: true
    });
    expect(chatHistory.raw).toBe(chatPayload.raw);

    const originalDom = createDom('full');
    const projectedDom = createDom('full');
    const originalChatDom = createDom('chat');
    const projectedChatDom = createDom('chat');
    try {
      const projectedLivePayload = projectPublicOverlayPayload('clarityhud.update.chat', chatPayload);
      const projectedState = projectClarityStateResponse('full', {
        success: true,
        dock: 'full',
        events: { chat: [chatHistory] },
        settings: settingsSchema.getDefaults('full')
      });
      expect(projectedState).not.toBeNull();
      expect(projectedLivePayload.raw.userId).toBe(projectedState.events.chat[0].raw.userId);
      const original = originalDom.fixture;
      originalDom.window.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ success: true, events: { chat: [chatHistory] } })
      });
      await original.loadInitialState();
      const historyEvent = original.STATE.events.chat[0];
      const originalHistoryElement = original.createEventElement(historyEvent, 'singleStream');
      const originalLiveElement = original.createEventElement({ type: 'chat', id: 'live', data: chatPayload }, 'singleStream');

      const projected = projectedDom.fixture;
      const candidateHistory = projectedState.events.chat[0];
      projectedDom.window.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ success: true, events: { chat: [candidateHistory] } })
      });
      await projected.loadInitialState();
      const projectedHistoryElement = projected.createEventElement(projected.STATE.events.chat[0], 'singleStream');
      const projectedLiveElement = projected.createEventElement({
        type: 'chat', id: 'live', data: projectedLivePayload
      }, 'singleStream');

      expect(visibleEvidence(originalHistoryElement)).toEqual(visibleEvidence(projectedHistoryElement));
      expect(visibleEvidence(originalLiveElement)).toEqual(visibleEvidence(projectedLiveElement));
      expect(visibleEvidence(projectedLiveElement)).toMatchObject({
        text: expect.stringContaining('Viewer Nick'),
        badges: expect.arrayContaining(['badge badge-moderator', 'badge badge-subscriber'])
      });

      const originalFormatted = original.STATE.messageParser.createFormattedMessage(chatPayload.raw);
      const projectedRaw = projectedLivePayload.raw;
      const projectedFormatted = projected.STATE.messageParser.createFormattedMessage(projectedRaw);
      expect(originalFormatted.text).toBe(projectedFormatted.text);
      expect(originalFormatted.user.nickname).toBe(projectedFormatted.user.nickname);
      expect(originalFormatted.user.uniqueId).toBe('stable-platform-user-id-123');
      expect(projectedFormatted.user.uniqueId).toBe('viewer_handle');
      expect(projectedFormatted.id).not.toContain('stable-platform-user-id-123');
      expect(projectedFormatted.id).toContain(projectedRaw.userId);
      expect(projected.STATE.messageParser.getCacheKey(projectedRaw)).toContain(projectedRaw.userId);

      originalChatDom.fixture.addMessage(chatPayload);
      projectedChatDom.fixture.addMessage(projectedLivePayload);
      const originalChatElement = originalChatDom.window.document.querySelector('.chat-message');
      const projectedChatElement = projectedChatDom.window.document.querySelector('.chat-message');
      expect(visibleEvidence(originalChatElement)).toEqual(visibleEvidence(projectedChatElement));
      expect(visibleEvidence(projectedChatElement)).toMatchObject({
        text: expect.stringContaining('fixture hello'),
        badges: expect.arrayContaining(['badge badge-moderator', 'badge badge-subscriber'])
      });
    } finally {
      originalDom.dom.window.close();
      projectedDom.dom.window.close();
      originalChatDom.dom.window.close();
      projectedChatDom.dom.window.close();
    }
  });

  test('gift catalog ID and raw-only metadata do not affect the original Full HUD rendering', async () => {
    const { giftPayload, giftHistory } = await createProducerFixture();
    expect(giftPayload.raw).toMatchObject({
      userId: 'stable-platform-user-id-456',
      giftId: 'gift-catalog-id-91',
      totalCoins: 910,
      createTime: '2026-10-07T12:00:01.000Z'
    });
    expect(giftHistory.raw).toBe(giftPayload.raw);

    const dom = createDom('full');
    try {
      const { fixture, window } = dom;
      fixture.STATE.settings = {
        ...fixture.STATE.settings,
        showGiftImages: false,
        showGifts: true
      };
      window.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ success: true, events: { gift: [giftHistory] } })
      });
      await fixture.loadInitialState();
      const loadedHistory = fixture.STATE.events.gift[0];
      const original = fixture.createEventElement(loadedHistory, 'singleStream');
      const projectedData = { ...loadedHistory.data };
      delete projectedData.raw;
      const projected = fixture.createEventElement({ ...loadedHistory, data: projectedData }, 'singleStream');

      expect(visibleEvidence(original)).toEqual(visibleEvidence(projected));
      expect(visibleEvidence(projected).text).toContain('Rose');
      expect(visibleEvidence(projected).text).toContain('10 coins');
      expect(settingsSchema.getDefaults('full')).not.toHaveProperty('apiKey');
      expect(settingsSchema.getDefaults('full')).not.toHaveProperty('password');
    } finally {
      dom.dom.window.close();
    }
  });

  test('multi overlay only needs whether each configured stream handle is present', () => {
    const { dom, window, fixture } = createDom('multi');
    try {
      const originalSettings = settingsSchema.getDefaults('multi');
      originalSettings.streams = originalSettings.streams.map((stream, index) => ({
        ...stream,
        enabled: index < 2,
        username: index < 2 ? `synthetic_viewer_${index}` : '',
        displayName: index < 2 ? `Synthetic Display ${index}` : ''
      }));
      const projectedSettings = {
        ...originalSettings,
        streams: originalSettings.streams.map(stream => ({
          ...stream,
          username: stream.enabled && stream.username ? 'configured' : '',
          displayName: ''
        }))
      };

      fixture.applySettings(originalSettings);
      const originalView = {
        activeStreams: fixture.STATE.activeStreams,
        debugCount: window.document.getElementById('debug-streams').textContent,
        containerClass: fixture.STATE.multiContainer.className,
        bodyClass: window.document.body.className
      };
      fixture.applySettings(projectedSettings);

      expect({
        activeStreams: fixture.STATE.activeStreams,
        debugCount: window.document.getElementById('debug-streams').textContent,
        containerClass: fixture.STATE.multiContainer.className,
        bodyClass: window.document.body.className
      }).toEqual(originalView);
      expect(fixture.STATE.settings.streams.map(stream => stream.username)).toEqual(['configured', 'configured', '']);
    } finally {
      dom.window.close();
    }
  });

  test('multi chat and gift live events render the same visible fields after public projection', () => {
    const api = { emit: jest.fn(), log: jest.fn() };
    const backend = new ClarityHUDBackend(api);
    const streamConfig = { textColor: '#112233', bgColor: '#223344', accentColor: '#334455' };
    backend.handleMultiStreamChat({
      uniqueId: 'stream_handle', nickname: 'Stream Viewer', comment: 'multi chat fixture',
      userId: 'multi-platform-id', isModerator: true, isSubscriber: true
    }, 0, 'stream1', 'Private Creator Name', streamConfig);
    backend.handleMultiStreamGift({
      uniqueId: 'gifter_handle', nickname: 'Gift Viewer', userId: 'gift-platform-id',
      giftName: 'Rose', repeatCount: 2, diamondCount: 3, coins: 6, giftPictureUrl: null
    }, 0, 'stream1', 'Private Creator Name', streamConfig);
    const localChat = api.emit.mock.calls.find(([name]) => name === 'clarityhud:multi:chat')[1];
    const localGift = api.emit.mock.calls.find(([name]) => name === 'clarityhud:multi:gift')[1];
    const publicChat = projectPublicOverlayPayload('clarityhud:multi:chat', localChat);
    const publicGift = projectPublicOverlayPayload('clarityhud:multi:gift', localGift);
    const originalDom = createDom('multi');
    const projectedDom = createDom('multi');
    try {
      for (const fixture of [originalDom.fixture, projectedDom.fixture]) {
        fixture.applySettings({ ...settingsSchema.getDefaults('multi'), messageStyle: 'badge' });
      }
      originalDom.fixture.handleChatEvent(localChat);
      projectedDom.fixture.handleChatEvent(publicChat);
      originalDom.fixture.handleGiftEvent(localGift);
      projectedDom.fixture.handleGiftEvent(publicGift);
      const originalMessages = [...originalDom.window.document.querySelectorAll('.chat-message')].map(visibleEvidence);
      const projectedMessages = [...projectedDom.window.document.querySelectorAll('.chat-message')].map(visibleEvidence);
      expect(projectedMessages).toEqual(originalMessages.map(message => ({
        ...message,
        text: message.text.replaceAll('Private Creator Name', 'Stream 1')
      })));
      expect(JSON.stringify(projectedMessages)).not.toContain('Private Creator Name');
      expect(publicGift).not.toHaveProperty('raw');
      expect(publicChat.sourceLabel).toBe('Stream 1');
    } finally {
      originalDom.dom.window.close();
      projectedDom.dom.window.close();
    }
  });

  test('message parser keeps its cache bounded after opaque event tokens rotate', () => {
    const { dom, fixture } = createDom('full');
    try {
      for (let index = 0; index < 125; index += 1) {
        fixture.STATE.messageParser.parseMessage({
          uniqueId: 'viewer_handle', userId: `opaque-${index}`, timestamp: index,
          comment: `message ${index}`
        });
      }
      expect(fixture.STATE.messageParser.cacheSize).toBe(100);
      expect(fixture.STATE.messageParser.messageCache.size).toBe(100);
    } finally {
      dom.window.close();
    }
  });
});
