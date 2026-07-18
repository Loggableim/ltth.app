'use strict';

const MAX_ANIMAL_COMMANDS = 50;
const COMMAND_NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;
const RESERVED_ANIMAL_COMMAND_NAMES = new Set([
  'rain',
  'emoji',
  'storm',
  'herzballons',
  'rainstop'
]);

const DEFAULT_ANIMAL_COMMANDS = Object.freeze([
  Object.freeze({ command: 'beans', enabled: true, asset_type: 'emoji', asset_value: '🐾' }),
  Object.freeze({ command: 'miau', enabled: true, asset_type: 'emoji', asset_value: '🐱' }),
  Object.freeze({ command: 'rawr', enabled: true, asset_type: 'emoji', asset_value: '🦖' }),
  Object.freeze({ command: 'woof', enabled: true, asset_type: 'emoji', asset_value: '🐶' }),
  Object.freeze({ command: 'wuff', enabled: true, asset_type: 'emoji', asset_value: '🐶' })
]);

const DEFAULT_ANIMAL_COMMAND_SETTINGS = Object.freeze({
  animal_commands_allow_team_members: true,
  animal_command_user_cooldown_ms: 60000,
  animal_command_superfan_cooldown_ms: 15000,
  animal_command_global_cooldown_ms: 15000
});

const MAX_COOLDOWN_MS = 24 * 60 * 60 * 1000;

class AnimalCommandValidationError extends Error {
  constructor(issues) {
    super('Invalid EmojiRain command configuration');
    this.name = 'AnimalCommandValidationError';
    this.code = 'INVALID_ANIMAL_COMMANDS';
    this.issues = issues;
  }
}

function cloneDefaultCommands() {
  return DEFAULT_ANIMAL_COMMANDS.map(entry => ({ ...entry }));
}

function normalizeCommandName(value) {
  return String(value ?? '')
    .trim()
    .replace(/^!+/, '')
    .toLowerCase();
}

function isValidEmoji(value) {
  if (typeof value !== 'string') return false;
  const candidate = value.trim();
  if (!candidate || candidate.length > 64) return false;
  return /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u.test(candidate);
}

function isValidHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch (_) {
    return false;
  }
}

function isValidGalleryPath(value, prefixes) {
  if (typeof value !== 'string') return false;

  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch (_) {
    return false;
  }

  if (decoded.includes('..') || decoded.includes('\\') || /[?#\u0000-\u001f]/.test(decoded)) {
    return false;
  }

  return prefixes.some(prefix => {
    if (typeof prefix !== 'string' || !prefix || !decoded.startsWith(prefix)) return false;
    const filename = decoded.slice(prefix.length);
    return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/.test(filename);
  });
}

function isValidAsset(type, value, imagePathPrefixes) {
  if (type === 'emoji') return isValidEmoji(value);
  if (type !== 'image' || typeof value !== 'string') return false;
  const candidate = value.trim();
  return isValidHttpsUrl(candidate) || isValidGalleryPath(candidate, imagePathPrefixes);
}

function normalizeCooldown(value, fallback, field, strict, issues) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > MAX_COOLDOWN_MS) {
    if (strict) issues.push({ field, code: 'invalid_cooldown' });
    return fallback;
  }
  return Math.floor(numeric);
}

function normalizeAnimalCommandSettings(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const strict = options.strict === true;
  const imagePathPrefixes = Array.isArray(options.imagePathPrefixes)
    ? options.imagePathPrefixes
    : [];
  const issues = [];
  const hasCommandList = Object.prototype.hasOwnProperty.call(source, 'animal_commands');
  let rawCommands = hasCommandList ? source.animal_commands : cloneDefaultCommands();

  if (!Array.isArray(rawCommands)) {
    issues.push({ field: 'animal_commands', code: 'invalid_list' });
    rawCommands = [];
  }

  if (rawCommands.length > MAX_ANIMAL_COMMANDS) {
    issues.push({ field: 'animal_commands', code: 'too_many_commands', max: MAX_ANIMAL_COMMANDS });
  }

  const normalizedCommands = [];
  const seenNames = new Set();
  rawCommands.slice(0, MAX_ANIMAL_COMMANDS).forEach((rawEntry, index) => {
    const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry : {};
    const command = normalizeCommandName(entry.command);
    const assetType = String(entry.asset_type ?? '').trim().toLowerCase();
    const assetValue = typeof entry.asset_value === 'string' ? entry.asset_value.trim() : '';
    const entryIssues = [];

    if (!COMMAND_NAME_PATTERN.test(command)) {
      entryIssues.push({ index, field: 'command', code: 'invalid_name', command });
    } else if (RESERVED_ANIMAL_COMMAND_NAMES.has(command)) {
      entryIssues.push({ index, field: 'command', code: 'reserved_name', command });
    } else if (seenNames.has(command)) {
      entryIssues.push({ index, field: 'command', code: 'duplicate_name', command });
    }

    if (!isValidAsset(assetType, assetValue, imagePathPrefixes)) {
      entryIssues.push({ index, field: 'asset_value', code: 'invalid_asset', command });
    }

    if (entryIssues.length > 0) {
      issues.push(...entryIssues);
      return;
    }

    seenNames.add(command);
    normalizedCommands.push({
      command,
      enabled: entry.enabled !== false,
      asset_type: assetType,
      asset_value: assetValue
    });
  });

  const allowTeamMembersValue = source.animal_commands_allow_team_members;
  let allowTeamMembers = DEFAULT_ANIMAL_COMMAND_SETTINGS.animal_commands_allow_team_members;
  if (allowTeamMembersValue !== undefined) {
    if (typeof allowTeamMembersValue !== 'boolean' && strict) {
      issues.push({ field: 'animal_commands_allow_team_members', code: 'invalid_boolean' });
    } else {
      allowTeamMembers = allowTeamMembersValue === true;
    }
  }

  const result = {
    animal_commands: normalizedCommands,
    animal_commands_allow_team_members: allowTeamMembers,
    animal_command_user_cooldown_ms: normalizeCooldown(
      source.animal_command_user_cooldown_ms,
      DEFAULT_ANIMAL_COMMAND_SETTINGS.animal_command_user_cooldown_ms,
      'animal_command_user_cooldown_ms',
      strict,
      issues
    ),
    animal_command_superfan_cooldown_ms: normalizeCooldown(
      source.animal_command_superfan_cooldown_ms,
      DEFAULT_ANIMAL_COMMAND_SETTINGS.animal_command_superfan_cooldown_ms,
      'animal_command_superfan_cooldown_ms',
      strict,
      issues
    ),
    animal_command_global_cooldown_ms: normalizeCooldown(
      source.animal_command_global_cooldown_ms,
      DEFAULT_ANIMAL_COMMAND_SETTINGS.animal_command_global_cooldown_ms,
      'animal_command_global_cooldown_ms',
      strict,
      issues
    )
  };

  if (strict && issues.length > 0) {
    throw new AnimalCommandValidationError(issues);
  }

  return result;
}

function isExplicitPaidSubscriberFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  return ['true', '1'].includes(value.trim().toLowerCase());
}

function hasPaidSuperfanStatus(contextOrRawData = {}) {
  const candidate = contextOrRawData && typeof contextOrRawData === 'object'
    ? contextOrRawData
    : {};
  const rawData = Object.prototype.hasOwnProperty.call(candidate, 'rawData')
    ? candidate.rawData
    : candidate;
  const data = rawData && typeof rawData === 'object' ? rawData : {};
  const user = data.user && typeof data.user === 'object' ? data.user : {};
  const identity = data.userIdentity && typeof data.userIdentity === 'object'
    ? data.userIdentity
    : {};

  return [
    data.isSubscriber,
    data.isSub,
    data.isSuperFan,
    data.isSuperfan,
    data.superFan,
    user.isSubscriber,
    user.isSub,
    user.isSuperFan,
    user.isSuperfan,
    user.superFan,
    identity.isSubscriberOfAnchor
  ].some(isExplicitPaidSubscriberFlag);
}

function getTeamMemberLevel(context = {}) {
  const values = [
    context?.userData?.teamMemberLevel,
    context?.rawData?.teamMemberLevel,
    context?.teamMemberLevel
  ];
  const value = values.find(candidate => Number.isFinite(Number(candidate)));
  if (value === undefined) return 0;
  return Math.min(50, Math.max(0, Math.floor(Number(value))));
}

function getAnimalCommandCount(context = {}) {
  return Math.max(1, getTeamMemberLevel(context));
}

function evaluateAnimalCommandAccess(context = {}, settings = {}) {
  const isPaidSubscriber = hasPaidSuperfanStatus(context);
  const teamMemberLevel = getTeamMemberLevel(context);
  const allowTeamMembers = settings.animal_commands_allow_team_members !== false;
  return {
    allowed: isPaidSubscriber || (allowTeamMembers && teamMemberLevel >= 1),
    isPaidSubscriber,
    teamMemberLevel,
    count: Math.max(1, teamMemberLevel),
    userCooldownMs: isPaidSubscriber
      ? Number(settings.animal_command_superfan_cooldown_ms ?? DEFAULT_ANIMAL_COMMAND_SETTINGS.animal_command_superfan_cooldown_ms)
      : Number(settings.animal_command_user_cooldown_ms ?? DEFAULT_ANIMAL_COMMAND_SETTINGS.animal_command_user_cooldown_ms)
  };
}

class AnimalCommandCooldowns {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.userTimestamps = new Map();
    this.globalTimestamps = new Map();
  }

  check({ command, username, userCooldownMs, globalCooldownMs }) {
    const now = this.now();
    const commandKey = normalizeCommandName(command);
    const userKey = `${commandKey}:${String(username ?? '').trim().toLowerCase()}`;
    const userRemaining = this.remaining(
      this.userTimestamps.get(userKey),
      userCooldownMs,
      now
    );
    if (userRemaining > 0) {
      return { allowed: false, retryAfterMs: userRemaining, scope: 'user' };
    }

    const globalRemaining = this.remaining(
      this.globalTimestamps.get(commandKey),
      globalCooldownMs,
      now
    );
    if (globalRemaining > 0) {
      return { allowed: false, retryAfterMs: globalRemaining, scope: 'global' };
    }

    return { allowed: true, retryAfterMs: 0, scope: null };
  }

  record({ command, username }) {
    const now = this.now();
    const commandKey = normalizeCommandName(command);
    const userKey = `${commandKey}:${String(username ?? '').trim().toLowerCase()}`;
    this.userTimestamps.set(userKey, now);
    this.globalTimestamps.set(commandKey, now);
  }

  remaining(timestamp, duration, now) {
    if (!Number.isFinite(timestamp)) return 0;
    const normalizedDuration = Math.max(0, Number(duration) || 0);
    return Math.max(0, Math.ceil(timestamp + normalizedDuration - now));
  }

  clear() {
    this.userTimestamps.clear();
    this.globalTimestamps.clear();
  }
}

module.exports = {
  COMMAND_NAME_PATTERN,
  DEFAULT_ANIMAL_COMMANDS,
  DEFAULT_ANIMAL_COMMAND_SETTINGS,
  MAX_ANIMAL_COMMANDS,
  RESERVED_ANIMAL_COMMAND_NAMES,
  AnimalCommandCooldowns,
  AnimalCommandValidationError,
  evaluateAnimalCommandAccess,
  getAnimalCommandCount,
  getTeamMemberLevel,
  hasPaidSuperfanStatus,
  isValidAsset,
  normalizeAnimalCommandName: normalizeCommandName,
  normalizeAnimalCommandSettings
};
