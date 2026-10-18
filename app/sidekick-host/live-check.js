'use strict';

// Short live check of openrouter/free. Opt-in only: SIDEKICK_LIVE=1. At most 10 requests.
// Prints counts and the model id only. Never prints the key.
const { createReplyEngine, FIXED_MODEL } = require('./llm-reply');
const { readApiKey, liveEnabled } = require('./demo');

const MAX_REQUESTS = 10;
const PROBES = [
  'Sag kurz Hallo.',
  'Wie spät ist es?',
  'Nenne eine Farbe.',
  'Danke fürs Zuschauen.',
  'Was macht ein Host?',
  'Antworte in einem Satz.',
  'Gib eine Zahl zwischen eins und zehn.',
  'Ist heute ein guter Tag?',
  'Erzähle einen Witz in einem Satz.',
  'Verabschiede dich kurz.'
];

async function main() {
  if (!liveEnabled()) {
    process.stderr.write('live-check: refused. Set SIDEKICK_LIVE=1 to allow network use.\n');
    process.exitCode = 2;
    return;
  }
  const apiKey = readApiKey();
  if (!apiKey) {
    process.stderr.write('live-check: no key found in the allowed sources. No request sent.\n');
    process.exitCode = 2;
    return;
  }
  const engine = createReplyEngine({ apiKey, timeoutMs: 15000, model: FIXED_MODEL, maxLiveRequests: MAX_REQUESTS });
  const counts = { llm: 0, fallback: 0 };
  const reasons = {};
  for (const probe of PROBES) {
    const reply = await engine.reply(probe);
    counts[reply.source] = (counts[reply.source] || 0) + 1;
    if (reply.reason) reasons[reply.reason] = (reasons[reply.reason] || 0) + 1;
  }
  process.stdout.write(`[live-check] model=${FIXED_MODEL} probes=${PROBES.length} live_requests=${engine.liveRequests()} llm=${counts.llm} fallback=${counts.fallback} reasons=${JSON.stringify(reasons)}\n`);
  process.exitCode = 0;
}

main().catch(error => {
  // Error text may echo provider details. Print only the class name.
  process.stderr.write(`live-check: failed (${error.name || 'Error'})\n`);
  process.exitCode = 1;
});
