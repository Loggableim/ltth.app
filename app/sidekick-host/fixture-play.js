'use strict';

// Offline playback of the synthetic comparison feed.
// Does not read a key and does not open the network.
// gapMs advances a virtual clock so idle gaps open the rate-limit window without sleeping.
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ShowPlanner } = require('./show-planner');
const { HostCore } = require('./host-core');
const { RateLimiter } = require('./rate-limiter');
const { createReplyEngine } = require('./llm-reply');
const { createTextAdapter } = require('./adapters/text-adapter');
const { createDemoPorts } = require('./demo-plugins');
const { applyReplyFilter } = require('./reply-filter');

// Same cadence as demo.js SWITCH_EVERY.
const SWITCH_EVERY = 4;
const FEED_PATH = path.join(__dirname, 'demo', 'fixture-feed.jsonl');
const LOG_PATH = path.join(os.tmpdir(), 'ltth-sidekick-fixture.log');

function readFeed(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function inputWouldBeBlocked(text) {
  const raw = String(text ?? '');
  if (!raw.trim()) return false;
  return applyReplyFilter(raw) === null;
}

function refuseNetwork() {
  throw new Error('fixture playback must not use the network');
}

async function playFixture({
  feedPath = FEED_PATH,
  logPath = LOG_PATH,
  request = refuseNetwork
} = {}) {
  const messages = readFeed(feedPath);
  let clock = 0;
  const lines = [];
  const log = entry => {
    lines.push(JSON.stringify({ atMs: clock, ...entry }));
  };

  // The fake music-bot cooldown reads this virtual clock. HostCore stays unchanged.
  const planner = new ShowPlanner(createDemoPorts({ now: () => clock }));
  const spoken = [];
  const output = createTextAdapter({
    write: text => {
      spoken.push(text);
      log({ kind: 'say', text });
    }
  });
  const replyEngine = createReplyEngine({ apiKey: '', timeoutMs: 4000, request });
  const host = new HostCore({
    planner,
    output,
    replyEngine,
    rateLimiter: new RateLimiter({ maxEvents: 18, windowMs: 60000, now: () => clock }),
    log
  });

  const counts = {
    total: messages.length,
    emitted: 0,
    command: 0,
    chatReply: 0,
    ignored: 0,
    rateLimited: 0,
    filtered: 0,
    fallback: 0,
    fallbackEmitted: 0,
    pluginSwitch: 0,
    inputBlocked: 0,
    byCommand: {},
    byTag: {}
  };

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    clock += Number(message.gapMs) || 0;
    if (message.tag) counts.byTag[message.tag] = (counts.byTag[message.tag] || 0) + 1;
    if (inputWouldBeBlocked(message.text)) counts.inputBlocked++;

    if (i > 0 && i % SWITCH_EVERY === 0) {
      const plugin = planner.advance();
      counts.pluginSwitch++;
      log({ kind: 'plugin-switch', plugin });
    }

    const result = await host.handleChat(message);
    if (result.type === 'command') {
      counts.command++;
      counts.byCommand[result.command] = (counts.byCommand[result.command] || 0) + 1;
    }
    if (result.type === 'chat-reply') counts.chatReply++;
    if (result.type === 'ignored') counts.ignored++;
    if (result.type === 'chat-reply' && result.source === 'fallback') {
      counts.fallback++;
      if (result.emitted) counts.fallbackEmitted++;
    }
    if (result.emitted) counts.emitted++;
    else if (result.reason === 'rate-limited') counts.rateLimited++;
    else if (result.reason === 'filtered') counts.filtered++;
    log({
      kind: 'result',
      type: result.type,
      emitted: Boolean(result.emitted),
      reason: result.reason || null,
      source: result.source || null,
      command: result.command || null
    });
  }

  fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');
  const responseRate = counts.total === 0 ? 0 : counts.emitted / counts.total;
  return { counts, responseRate, logPath, spoken, llm: replyEngine.enabled, clockMs: clock };
}

function formatSummary(result) {
  const counts = result.counts;
  const commands = Object.keys(counts.byCommand).sort()
    .map(name => `${name}=${counts.byCommand[name]}`)
    .join(',');
  return [
    `[fixture] total=${counts.total}`,
    `emitted=${counts.emitted}`,
    `responseRate=${result.responseRate.toFixed(4)}`,
    `pluginSwitch=${counts.pluginSwitch}`,
    `filtered=${counts.filtered}`,
    `fallback=${counts.fallback}`,
    `fallbackEmitted=${counts.fallbackEmitted}`,
    `rateLimited=${counts.rateLimited}`,
    `ignored=${counts.ignored}`,
    `command=${counts.command}`,
    `chatReply=${counts.chatReply}`,
    `inputBlocked=${counts.inputBlocked}`,
    `commands=${commands}`,
    `llm=${result.llm ? 'enabled' : 'disabled'}`,
    `log=${result.logPath}`
  ].join(' ');
}

if (require.main === module) {
  playFixture().then(result => {
    process.stdout.write(`${formatSummary(result)}\n`);
    process.exitCode = 0;
  }).catch(error => {
    process.stderr.write(`[fixture] failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { playFixture, formatSummary, FEED_PATH, SWITCH_EVERY, readFeed };
