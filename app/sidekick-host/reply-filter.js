'use strict';

const MAX_LENGTH = 200;

// Minimal output filter. Anything that fails returns null and is not spoken or shown.
const BLOCKED_PATTERNS = [
  /\bkill\s+yourself\b/i,
  /\bnigg(er|a)\b/i,
  /\bchild\s+porn/i
];

function applyReplyFilter(text) {
  let cleaned = String(text ?? '')
    .replace(/https?:\/\/\S+/gi, 'link')
    .replace(/[@<>{}[\]\\`]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  if (BLOCKED_PATTERNS.some(pattern => pattern.test(cleaned))) return null;
  if (cleaned.length > MAX_LENGTH) cleaned = `${cleaned.slice(0, MAX_LENGTH - 1).trim()}.`;
  return cleaned;
}

module.exports = { applyReplyFilter, MAX_LENGTH };
