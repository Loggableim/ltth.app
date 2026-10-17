'use strict';

const WINDOWS_BASE_KEYS = Object.freeze([
  'PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'
]);
const WINDOWS_USER_PATH_KEYS = Object.freeze([
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'APPDATA', 'LOCALAPPDATA'
]);
const PROXY_KEYS = Object.freeze(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']);

function readWindowsEnvValue(env, key, { preferLowercase = false } = {}) {
  const lowerKey = key.toLowerCase();
  const upperKey = key.toUpperCase();
  const candidates = Object.keys(env);
  const exactCandidates = preferLowercase ? [lowerKey, upperKey] : [key, upperKey, lowerKey];

  for (const candidate of exactCandidates) {
    if (Object.prototype.hasOwnProperty.call(env, candidate)) return env[candidate];
  }

  const matchingKey = candidates.find((candidate) => candidate.toLowerCase() === lowerKey);
  return matchingKey ? env[matchingKey] : undefined;
}

function addAllowedValue(output, sourceEnv, key, options) {
  const value = readWindowsEnvValue(sourceEnv, key, options);
  if (typeof value === 'string') output[key] = value;
}

/**
 * Build the environment for Music Bot external children.
 * Non-Windows platforms intentionally keep their existing inherited environment
 * until their supported audio-session variables can be audited on-platform.
 * The setup/version/install probes in main.js are a separate, unchanged exception
 * and still inherit their parent environment pending their own follow-up.
 */
function buildMusicBotChildEnv(kind, sourceEnv = process.env, platform = process.platform) {
  if (platform !== 'win32') return undefined;
  if (!['yt-dlp', 'mpv', 'taskkill', 'process-probe'].includes(kind)) {
    throw new TypeError(`Unknown Music Bot child kind: ${kind}`);
  }

  const output = {};
  for (const key of WINDOWS_BASE_KEYS) addAllowedValue(output, sourceEnv, key);

  if (kind === 'yt-dlp' || kind === 'mpv') {
    for (const key of WINDOWS_USER_PATH_KEYS) addAllowedValue(output, sourceEnv, key);
  }

  if (kind === 'yt-dlp' || kind === 'mpv') {
    for (const key of PROXY_KEYS) {
      // Python's proxy discovery gives lowercase names precedence if both spellings exist.
      addAllowedValue(output, sourceEnv, key, { preferLowercase: true });
    }
    addAllowedValue(output, sourceEnv, 'no_proxy', { preferLowercase: true });
  }

  return output;
}

module.exports = {
  PROXY_KEYS,
  WINDOWS_BASE_KEYS,
  WINDOWS_USER_PATH_KEYS,
  buildMusicBotChildEnv
};
