'use strict';

const fs = require('fs');
const path = require('path');

const { HostCore } = require('../sidekick-host/host-core');
const { ShowPlanner } = require('../sidekick-host/show-planner');
const { RateLimiter } = require('../sidekick-host/rate-limiter');
const { createReplyEngine } = require('../sidekick-host/llm-reply');
const { createTextAdapter } = require('../sidekick-host/adapters/text-adapter');
const { createMusicBotAdapter } = require('../sidekick-host/adapters/music-bot-adapter');
const { createFakeMusicBot } = require('../sidekick-host/testing/fake-music-bot');
const { createDemoPorts, SONG_ACCEPTED } = require('../sidekick-host/demo-plugins');

function hostFor(ports, now) {
  const spoken = [];
  const host = new HostCore({
    planner: new ShowPlanner(ports),
    output: createTextAdapter({ write: text => spoken.push(text) }),
    replyEngine: createReplyEngine({ apiKey: '' }),
    rateLimiter: new RateLimiter({ maxEvents: 18, windowMs: 60000, now })
  });
  return { host, spoken };
}

describe('music command wiring', () => {
  test('HostCore does not import the music bot', () => {
    const src = fs.readFileSync(path.join(__dirname, '../sidekick-host/host-core.js'), 'utf8');
    expect(src).not.toMatch(/music-bot|createMusicBotAdapter|createFakeMusicBot|mpv/);
  });

  test('!song on an inactive plugin does not call the bot', async () => {
    const calls = [];
    const bot = createFakeMusicBot({ now: () => 0 });
    const adapter = createMusicBotAdapter({
      transport: async (req) => {
        calls.push(req.path);
        return bot.request(req);
      }
    });
    const { host } = hostFor(createDemoPorts({ adapter }), () => 0);
    const result = await host.handleChat({ user: 'viewer_02', text: '!song titel_ok' });
    expect(result).toEqual({ type: 'ignored', reason: 'not-in-active-plugin' });
    expect(calls).toEqual([]);
    expect(bot.resolveCalls()).toBe(0);
    expect(bot.queueLength()).toBe(0);
  });

  test('!sound does not enqueue and !song uses the adapter only on the music plugin', async () => {
    let now = 0;
    const calls = [];
    const bot = createFakeMusicBot({ now: () => now });
    const adapter = createMusicBotAdapter({
      transport: async (req) => {
        calls.push({ method: req.method, path: req.path });
        return bot.request(req);
      }
    });
    const ports = createDemoPorts({ adapter });
    const { host, spoken } = hostFor(ports, () => now);
    host.planner.advance();

    const sound = await host.handleChat({ user: 'viewer_04', text: '!sound' });
    expect(sound.type).toBe('command');
    expect(sound.command).toBe('!sound');
    expect(spoken).toEqual(['Sound abgespielt.']);
    expect(calls).toEqual([]);
    expect(bot.queueLength()).toBe(0);

    const song = await host.handleChat({ user: 'viewer_05', text: '!song titel_ok' });
    expect(song.type).toBe('command');
    expect(song.emitted).toBe(true);
    expect(spoken[1]).toBe(SONG_ACCEPTED);
    expect(calls).toEqual([{ method: 'POST', path: '/api/plugins/music-bot/request' }]);
    expect(bot.queueLength()).toBe(1);

    // A different viewer is not cooled down by viewer_05's request.
    const other = await host.handleChat({ user: 'viewer_06', text: '!song titel_b' });
    expect(other.emitted).toBe(true);
    expect(other.type).toBe('command');
    expect(spoken[2]).toBe(SONG_ACCEPTED);
    expect(bot.queueLength()).toBe(2);
    expect(calls).toHaveLength(2);

    // The same viewer is cooled down while the per-user window is open.
    const cooled = await host.handleChat({ user: 'viewer_05', text: '!song titel_c' });
    expect(cooled.emitted).toBe(true);
    expect(cooled.type).toBe('command');
    expect(spoken[3]).toMatch(/Sekunden/);
    expect(bot.queueLength()).toBe(2);
    expect(calls).toHaveLength(3);

    now = 30000;
    const again = await host.handleChat({ user: 'viewer_05', text: '!song titel_c' });
    expect(again.emitted).toBe(true);
    expect(spoken[4]).toBe(SONG_ACCEPTED);
    expect(bot.queueLength()).toBe(3);

    host.planner.switchTo('connect4');
    const blocked = await host.handleChat({ user: 'viewer_08', text: '!song titel_c' });
    expect(blocked).toEqual({ type: 'ignored', reason: 'not-in-active-plugin' });
    expect(bot.queueLength()).toBe(3);
    expect(calls).toHaveLength(4);
  });
});
