'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { playFixture, FEED_PATH, SWITCH_EVERY } = require('../sidekick-host/fixture-play');
const { applyReplyFilter } = require('../sidekick-host/reply-filter');

const noNetwork = jest.fn(() => {
  throw new Error('network must not be used');
});

function loadFeed() {
  return fs.readFileSync(FEED_PATH, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

describe('synthetic comparison feed', () => {
  const feed = loadFeed();

  test('has 200 synthetic messages and every fixed command', () => {
    expect(feed).toHaveLength(200);
    const blob = feed.map(line => line.text).join('\n').toLowerCase();
    expect(blob).toContain('!quiz');
    expect(blob).toContain('!song');
    expect(blob).toContain('!sound');
    expect(blob).toContain('!connect4');
    const tags = feed.reduce((acc, line) => {
      acc[line.tag] = (acc[line.tag] || 0) + 1;
      return acc;
    }, {});
    expect(tags).toEqual({ command: 40, spam: 30, insult: 16, injection: 20, idle: 10, chat: 84 });
    feed.forEach(line => {
      expect(line.user).toMatch(/^viewer_\d{2}$/);
      expect(line.text).not.toMatch(/@(?!host\b)[A-Za-z0-9_]{3,}/);
    });
    expect(feed.filter(line => line.tag === 'idle' && line.gapMs >= 60000)).toHaveLength(10);
  });

  test('uses the same plugin cadence as the demo', () => {
    const demo = fs.readFileSync(path.join(__dirname, '../sidekick-host/demo.js'), 'utf8');
    expect(demo).toContain(`const SWITCH_EVERY = ${SWITCH_EVERY}`);
  });
});

describe('offline fixture playback', () => {
  test('counts replies, switches, filters and template fallbacks without network', async () => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    const savedLive = process.env.SIDEKICK_LIVE;
    process.env.OPENROUTER_API_KEY = 'test-key-not-real';
    process.env.SIDEKICK_LIVE = '1';
    const logPath = path.join(os.tmpdir(), `ltth-fixture-${process.pid}.log`);
    try {
      const result = await playFixture({ request: noNetwork, logPath });
      expect(result.llm).toBe(false);
      expect(noNetwork).not.toHaveBeenCalled();
      expect(result.counts.total).toBe(200);
      expect(result.counts.pluginSwitch).toBe(49);
      expect(result.counts.command).toBe(24);
      expect(result.counts.byCommand).toEqual({ '!quiz': 6, '!song': 6, '!sound': 6, '!connect4': 6 });
      expect(result.counts.ignored).toBe(16);
      expect(result.counts.fallback).toBe(160);
      expect(result.counts.fallbackEmitted).toBe(45);
      expect(result.counts.rateLimited).toBe(117);
      expect(result.counts.emitted).toBe(67);
      expect(result.responseRate).toBeCloseTo(0.335, 3);
      expect(result.counts.filtered).toBe(0);
      expect(result.counts.inputBlocked).toBe(1);
      expect(result.responseRate).toBe(result.counts.emitted / result.counts.total);
      result.spoken.forEach(text => {
        expect(applyReplyFilter(text)).toBe(text);
        expect(text.toLowerCase()).not.toContain('kill yourself');
      });
      expect(fs.existsSync(logPath)).toBe(true);
      fs.unlinkSync(logPath);
    } finally {
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = savedKey;
      if (savedLive === undefined) delete process.env.SIDEKICK_LIVE;
      else process.env.SIDEKICK_LIVE = savedLive;
    }
  });
});
