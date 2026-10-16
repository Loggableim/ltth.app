'use strict';

// Fallback lines used when the LLM is unavailable, disabled or too slow.
const FALLBACK_LINES = Object.freeze([
  'Danke fürs Zuschauen! Gleich geht es weiter.',
  'Schön, dass du dabei bist. Schreib gern einen Befehl in den Chat.',
  'Ich habe deine Nachricht gesehen. Gleich mehr dazu.',
  'Der Host ist kurz nachdenklich. Bleib dran!'
]);

function fallbackReply(seed = '') {
  const index = Math.abs(String(seed).length) % FALLBACK_LINES.length;
  return FALLBACK_LINES[index];
}

module.exports = { FALLBACK_LINES, fallbackReply };
