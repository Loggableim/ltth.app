'use strict';

// Demo runner: reads the local test feed only. No live stream connection.
// Run: npm run sidekick:demo (from app/)
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ShowPlanner } = require('./show-planner');
const { HostCore } = require('./host-core');
const { RateLimiter } = require('./rate-limiter');
const { createReplyEngine } = require('./llm-reply');
const { createTextAdapter } = require('./adapters/text-adapter');
const { createDemoPorts } = require('./demo-plugins');

const FEED_PATH = path.join(__dirname, 'demo', 'test-feed.jsonl');
const LOG_PATH = path.join(os.tmpdir(), 'ltth-sidekick-demo.log');
const LOCAL_CONFIG = path.join(__dirname, 'local-config.json');
const SWITCH_EVERY = 4;

// The key is read from the environment or a git-ignored local config. It is never logged.
function readApiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    const local = JSON.parse(fs.readFileSync(LOCAL_CONFIG, 'utf8'));
    return typeof local.openrouterApiKey === 'string' ? local.openrouterApiKey : '';
  } catch {
    return '';
  }
}

function readFeed(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

async function runDemo({ feedPath = FEED_PATH, logPath = LOG_PATH, apiKey = readApiKey(), request } = {}) {
  const lines = [];
  const log = entry => {
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
    lines.push(line);
  };

  const ports = createDemoPorts();
  const planner = new ShowPlanner(ports);
  const output = createTextAdapter({ write: text => { process.stdout.write(`[host] ${text}\n`); log({ kind: 'say', text }); } });
  const replyEngine = createReplyEngine({ apiKey, timeoutMs: 4000, request });
  const host = new HostCore({ planner, output, replyEngine, rateLimiter: new RateLimiter({ maxEvents: 18, windowMs: 60000 }), log });

  log({ kind: 'start', feed: path.basename(feedPath), llm: replyEngine.enabled ? 'openrouter/free' : 'disabled-no-key' });
  const messages = readFeed(feedPath);
  const counts = { total: messages.length, command: 0, chatReply: 0, ignored: 0, emitted: 0, suppressed: 0 };

  for (let i = 0; i < messages.length; i++) {
    if (i > 0 && i % SWITCH_EVERY === 0) {
      const plugin = planner.advance();
      log({ kind: 'plugin-switch', plugin });
    }
    const result = await host.handleChat(messages[i]);
    if (result.type === 'command') counts.command++;
    if (result.type === 'chat-reply') counts.chatReply++;
    if (result.type === 'ignored') counts.ignored++;
    if (result.emitted) counts.emitted++;
    else if (result.type !== 'ignored' && result.reason) counts.suppressed++;
  }

  fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');
  return { counts, logPath, llm: replyEngine.enabled };
}

if (require.main === module) {
  runDemo().then(result => {
    process.stdout.write(`[demo] feed=${result.counts.total} command=${result.counts.command} chat-reply=${result.counts.chatReply} ignored=${result.counts.ignored} emitted=${result.counts.emitted} suppressed=${result.counts.suppressed}\n`);
    process.stdout.write(`[demo] llm=${result.llm ? 'openrouter/free' : 'disabled (no key, fallback lines)'} log=${result.logPath}\n`);
    process.exitCode = 0;
  }).catch(error => {
    process.stderr.write(`[demo] failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { runDemo, readApiKey };
