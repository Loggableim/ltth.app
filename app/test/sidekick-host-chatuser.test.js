'use strict';

const { HostCore } = require('../sidekick-host/host-core');
const { ShowPlanner } = require('../sidekick-host/show-planner');
const { RateLimiter } = require('../sidekick-host/rate-limiter');
const { createReplyEngine } = require('../sidekick-host/llm-reply');
const { createTextAdapter } = require('../sidekick-host/adapters/text-adapter');
const { createPluginPort } = require('../sidekick-host/plugin-port');
const { createMusicBotAdapter } = require('../sidekick-host/adapters/music-bot-adapter');
const { createFakeMusicBot } = require('../sidekick-host/testing/fake-music-bot');
const { createDemoPorts, SONG_ACCEPTED } = require('../sidekick-host/demo-plugins');

function hostFor(ports, now) {
  const spoken = [];
  const host = new HostCore({
    planner: new ShowPlanner(ports),
    output: createTextAdapter({ write: text => spoken.push(text) }),
    replyEngine: createReplyEngine({ apiKey: '' }),
    rateLimiter: new RateLimiter({ maxEvents: 50, windowMs: 60000, now })
  });
  return { host, spoken };
}

function musicHost() {
  let now = 0;
  const bot = createFakeMusicBot({ now: () => now });
  const adapter = createMusicBotAdapter({ transport: req => bot.request(req) });
  const { host, spoken } = hostFor(createDemoPorts({ adapter }), () => now);
  host.planner.advance();
  return { host, spoken, bot, setNow: value => { now = value; } };
}

describe('chat user identity reaches plugin adapters', () => {
  test('two different viewers each get their own !song cooldown', async () => {
    const { host, spoken, bot } = musicHost();
    const a = await host.handleChat({ uniqueId: 'viewer_a', nickname: 'Alice', text: '!song titel_ok' });
    const b = await host.handleChat({ uniqueId: 'viewer_b', nickname: 'Bob', text: '!song titel_b' });
    expect(a.emitted).toBe(true);
    expect(b.emitted).toBe(true);
    expect(spoken).toEqual([SONG_ACCEPTED, SONG_ACCEPTED]);
    expect(bot.queueLength()).toBe(2);
  });

  test('the same viewer is blocked by the cooldown while another is not', async () => {
    const { host, spoken, bot } = musicHost();
    await host.handleChat({ uniqueId: 'viewer_a', text: '!song titel_ok' });
    const blocked = await host.handleChat({ uniqueId: 'viewer_a', text: '!song titel_b' });
    expect(blocked.emitted).toBe(true);
    expect(spoken[1]).toMatch(/Sekunden/);
    expect(bot.queueLength()).toBe(1);

    const other = await host.handleChat({ uniqueId: 'viewer_b', text: '!song titel_b' });
    expect(other.emitted).toBe(true);
    expect(spoken[2]).toBe(SONG_ACCEPTED);
    expect(bot.queueLength()).toBe(2);
  });

  test('the same viewer is accepted again after the cooldown window', async () => {
    const { host, spoken, bot, setNow } = musicHost();
    await host.handleChat({ uniqueId: 'viewer_a', text: '!song titel_ok' });
    setNow(30000);
    const again = await host.handleChat({ uniqueId: 'viewer_a', text: '!song titel_b' });
    expect(again.emitted).toBe(true);
    expect(spoken[1]).toBe(SONG_ACCEPTED);
    expect(bot.queueLength()).toBe(2);
  });

  test('HostCore forwards uniqueId first and falls back to nickname', async () => {
    const seen = [];
    const capture = createPluginPort({
      id: 'quiz-show',
      commands: ['!quiz'],
      handle: async (command, args, context) => {
        seen.push(context);
        return { text: 'ok' };
      }
    });
    const other = createPluginPort({
      id: 'connect4',
      commands: ['!connect4'],
      handle: async () => ({ text: 'ok' })
    });
    const { host } = hostFor([capture, other], () => 0);
    await host.handleChat({ uniqueId: 'uid-1', user: 'viewer_01', nickname: 'Nick', text: '!quiz' });
    await host.handleChat({ nickname: 'OnlyNick', text: '!quiz' });
    expect(seen[0]).toEqual({ user: 'uid-1' });
    expect(seen[1]).toEqual({ user: 'OnlyNick' });
  });
});
