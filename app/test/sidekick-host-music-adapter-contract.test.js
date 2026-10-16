'use strict';

const { createFakeMusicBot } = require('../sidekick-host/testing/fake-music-bot');
const { createContractMusicAdapter } = require('../sidekick-host/testing/contract-music-adapter');
const { defineMusicAdapterContract } = require('../sidekick-host/testing/music-adapter-contract');
const { HostCore } = require('../sidekick-host/host-core');
const { ShowPlanner } = require('../sidekick-host/show-planner');
const { createPluginPort } = require('../sidekick-host/plugin-port');
const { createTextAdapter } = require('../sidekick-host/adapters/text-adapter');
const { createReplyEngine } = require('../sidekick-host/llm-reply');
const { RateLimiter } = require('../sidekick-host/rate-limiter');

function createHarness(options = {}) {
  if (options.transport) {
    return {
      adapter: createContractMusicAdapter({ transport: options.transport }),
      bot: {
        events: [],
        playCalls: () => 0,
        resolveCalls: () => 0,
        queueLength: () => 0,
        hold() {},
        setLocked() {},
        setMpvAvailable() {}
      }
    };
  }
  const bot = createFakeMusicBot(options);
  return { adapter: createContractMusicAdapter({ transport: bot.request }), bot };
}

describe('music adapter contract against the fake', () => {
  defineMusicAdapterContract(createHarness);
});

describe('host core boundaries for the music port', () => {
  function build(options) {
    const { adapter, bot } = createHarness(options);
    const portCalls = [];
    const quiz = createPluginPort({
      id: 'quiz-show',
      commands: ['!quiz'],
      handle: async () => ({ text: 'Quiz' })
    });
    const music = createPluginPort({
      id: 'music-sound',
      commands: ['!song', '!sound'],
      handle: async (command, args) => {
        portCalls.push(command);
        if (command === '!sound') return { text: 'Sound abgespielt.' };
        const result = await adapter.enqueue({ query: args[0] || '', requestedBy: 'viewer_01' });
        return { text: result.ok ? `angenommen ${result.title}` : result.text };
      }
    });
    const spoken = [];
    const host = new HostCore({
      planner: new ShowPlanner([quiz, music]),
      output: createTextAdapter({ write: text => spoken.push(text) }),
      replyEngine: createReplyEngine({ apiKey: '' }),
      rateLimiter: new RateLimiter({ maxEvents: 18, windowMs: 60000, now: () => 0 })
    });
    return { host, spoken, portCalls, bot };
  }

  test('!song while quiz is active is ignored and does not touch the music bot', async () => {
    const { host, spoken, portCalls, bot } = build();
    const result = await host.handleChat({ user: 'viewer_01', text: '!song titel_ok' });
    expect(result).toMatchObject({ type: 'ignored', reason: 'not-in-active-plugin' });
    expect(portCalls).toEqual([]);
    expect(spoken).toEqual([]);
    expect(bot.resolveCalls()).toBe(0);
    expect(bot.playCalls()).toBe(0);
  });

  test('!sound on the music port speaks text and does not enqueue or play', async () => {
    const { host, spoken, bot } = build();
    host.planner.advance();
    const result = await host.handleChat({ user: 'viewer_01', text: '!sound' });
    expect(result).toMatchObject({ type: 'command', command: '!sound', emitted: true });
    expect(spoken).toEqual(['Sound abgespielt.']);
    expect(bot.resolveCalls()).toBe(0);
    expect(bot.playCalls()).toBe(0);
    expect(bot.queueLength()).toBe(0);
  });

  test('a queue-full failure is spoken by the host and does not throw', async () => {
    const { host, spoken, bot } = build({ maxLength: 1 });
    host.planner.advance();
    const first = await host.handleChat({ user: 'viewer_01', text: '!song titel_ok' });
    const second = await host.handleChat({ user: 'viewer_02', text: '!song titel_b' });
    expect(first.emitted).toBe(true);
    expect(second.emitted).toBe(true);
    expect(spoken).toEqual(['angenommen Titel Ok', 'Queue is full']);
    expect(bot.queueLength()).toBe(1);
    expect(bot.playCalls()).toBe(0);
  });
});
