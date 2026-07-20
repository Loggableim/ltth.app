const {
  DEFAULT_ANIMAL_COMMANDS,
  AnimalCommandCooldowns,
  AnimalCommandValidationError,
  evaluateAnimalCommandAccess,
  getAnimalCommandCount,
  getTeamMemberLevel,
  hasPaidSuperfanStatus,
  normalizeAnimalCommandSettings
} = require('../modules/emoji-rain-animal-commands');

const CLASSIC_IMAGE_PREFIXES = [
  '/emoji-rain/uploads/',
  '/uploads/emoji-rain/'
];

function command(command, assetType = 'emoji', assetValue = '🐾', enabled = true) {
  return {
    command,
    enabled,
    asset_type: assetType,
    asset_value: assetValue
  };
}

describe('EmojiRain animal command configuration', () => {
  test('migrates a missing list to five independent default rows', () => {
    const normalized = normalizeAnimalCommandSettings({});

    expect(normalized.animal_commands).toEqual(DEFAULT_ANIMAL_COMMANDS);
    expect(normalized.animal_commands).not.toBe(DEFAULT_ANIMAL_COMMANDS);
    expect(normalized).toMatchObject({
      animal_commands_allow_team_members: true,
      animal_command_user_cooldown_ms: 60000,
      animal_command_superfan_cooldown_ms: 15000,
      animal_command_global_cooldown_ms: 15000,
      animal_command_despawn_ms: 8000
    });
  });

  test.each([999, 120001, 1500.5, 'eight seconds'])(
    'strict validation rejects invalid command despawn %p',
    value => {
      expect(() => normalizeAnimalCommandSettings({
        animal_commands: [],
        animal_command_despawn_ms: value
      }, { strict: true })).toThrow(expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({
            field: 'animal_command_despawn_ms',
            code: 'invalid_despawn'
          })
        ])
      }));
    }
  );

  test.each([1000, 8000, 120000])('accepts command despawn %i', value => {
    expect(normalizeAnimalCommandSettings({
      animal_commands: [],
      animal_command_despawn_ms: value
    }, { strict: true }).animal_command_despawn_ms).toBe(value);
  });

  test('preserves an explicit empty list as the disabled state', () => {
    expect(normalizeAnimalCommandSettings({ animal_commands: [] }).animal_commands).toEqual([]);
  });

  test('normalizes command names and valid emoji and image targets', () => {
    const normalized = normalizeAnimalCommandSettings({
      animal_commands: [
        command(' !BEANS ', 'emoji', '🐾'),
        command('Sticker_1', 'image', '/emoji-rain/uploads/cat.png'),
        command('remote-dog', 'image', 'https://cdn.example.test/dog.webp')
      ]
    }, {
      strict: true,
      imagePathPrefixes: CLASSIC_IMAGE_PREFIXES
    });

    expect(normalized.animal_commands).toEqual([
      command('beans', 'emoji', '🐾'),
      command('sticker_1', 'image', '/emoji-rain/uploads/cat.png'),
      command('remote-dog', 'image', 'https://cdn.example.test/dog.webp')
    ]);
  });

  test.each([
    [[command('bad name')], 'invalid_name'],
    [[command('rain')], 'reserved_name'],
    [[command('dupe'), command('DUPE', 'emoji', '🐶')], 'duplicate_name'],
    [[command('empty', 'emoji', '')], 'invalid_asset'],
    [[command('text', 'emoji', 'not-an-emoji')], 'invalid_asset'],
    [[command('http-image', 'image', 'http://example.test/cat.png')], 'invalid_asset'],
    [[command('path-image', 'image', '/other/uploads/cat.png')], 'invalid_asset'],
    [[command('traversal', 'image', '/emoji-rain/uploads/../secret.png')], 'invalid_asset']
  ])('strict validation rejects the complete list (%s)', (animalCommands, issueCode) => {
    expect(() => normalizeAnimalCommandSettings({ animal_commands: animalCommands }, {
      strict: true,
      imagePathPrefixes: CLASSIC_IMAGE_PREFIXES
    })).toThrow(expect.objectContaining({
      name: AnimalCommandValidationError.name,
      issues: expect.arrayContaining([expect.objectContaining({ code: issueCode })])
    }));
  });

  test('strict validation rejects more than 50 rows and tolerant startup keeps at most 50', () => {
    const animalCommands = Array.from({ length: 51 }, (_, index) => (
      command(`animal-${index}`, 'emoji', index % 2 === 0 ? '🐱' : '🐶')
    ));

    expect(() => normalizeAnimalCommandSettings({ animal_commands: animalCommands }, {
      strict: true
    })).toThrow(expect.objectContaining({
      issues: expect.arrayContaining([expect.objectContaining({ code: 'too_many_commands' })])
    }));

    expect(normalizeAnimalCommandSettings({ animal_commands: animalCommands }).animal_commands).toHaveLength(50);
  });

  test('tolerant startup drops invalid and duplicate legacy rows without restoring defaults', () => {
    const normalized = normalizeAnimalCommandSettings({
      animal_commands: [
        command('valid', 'emoji', '🐱'),
        command('bad name', 'emoji', '🐶'),
        command('VALID', 'emoji', '🦖')
      ]
    });

    expect(normalized.animal_commands).toEqual([command('valid', 'emoji', '🐱')]);
  });
});

describe('EmojiRain animal command eligibility and count', () => {
  test.each([
    [{ rawData: { isSubscriber: true } }, true],
    [{ rawData: { isSub: '1' } }, true],
    [{ rawData: { user: { isSuperFan: 'true' } } }, true],
    [{ rawData: { userIdentity: { isSubscriberOfAnchor: 1 } } }, true],
    [{ rawData: {}, userData: { isSubscriber: true, teamMemberLevel: 8 } }, false],
    [{ userData: { isSubscriber: true } }, false],
    [{ rawData: { isSubscriber: false, teamMemberLevel: 12 } }, false]
  ])('detects paid status only from explicit raw TikTok fields', (context, expected) => {
    expect(hasPaidSuperfanStatus(context)).toBe(expected);
  });

  test.each([
    [undefined, 0, 1],
    [-4, 0, 1],
    ['invalid', 0, 1],
    [0, 0, 1],
    [1.9, 1, 1],
    [50, 50, 50],
    [999, 50, 50]
  ])('normalizes level %s to %s and count %s', (input, expectedLevel, expectedCount) => {
    const context = { userData: { teamMemberLevel: input } };
    expect(getTeamMemberLevel(context)).toBe(expectedLevel);
    expect(getAnimalCommandCount(context)).toBe(expectedCount);
  });

  test('falls back to the raw Teamlevel when the enriched value is empty', () => {
    const context = {
      userData: { teamMemberLevel: null },
      rawData: { teamMemberLevel: 12 }
    };
    expect(getTeamMemberLevel(context)).toBe(12);
    expect(getAnimalCommandCount(context)).toBe(12);
  });

  test('paid subscribers are always allowed and use the lower cooldown', () => {
    expect(evaluateAnimalCommandAccess({
      rawData: { isSubscriber: true },
      userData: { teamMemberLevel: 0 }
    }, {
      animal_commands_allow_team_members: false,
      animal_command_user_cooldown_ms: 60000,
      animal_command_superfan_cooldown_ms: 15000
    })).toEqual({
      allowed: true,
      isPaidSubscriber: true,
      teamMemberLevel: 0,
      count: 1,
      userCooldownMs: 15000
    });
  });

  test('Teamlevel-only members follow the access toggle and regular viewers stay excluded', () => {
    const member = { rawData: {}, userData: { teamMemberLevel: 7, isSubscriber: true } };
    const viewer = { rawData: {}, userData: { teamMemberLevel: 0 } };
    const base = {
      animal_command_user_cooldown_ms: 60000,
      animal_command_superfan_cooldown_ms: 15000
    };

    expect(evaluateAnimalCommandAccess(member, {
      ...base,
      animal_commands_allow_team_members: true
    })).toMatchObject({ allowed: true, isPaidSubscriber: false, count: 7, userCooldownMs: 60000 });
    expect(evaluateAnimalCommandAccess(member, {
      ...base,
      animal_commands_allow_team_members: false
    }).allowed).toBe(false);
    expect(evaluateAnimalCommandAccess(viewer, {
      ...base,
      animal_commands_allow_team_members: true
    }).allowed).toBe(false);
  });
});

describe('EmojiRain animal command cooldowns', () => {
  let now;
  let cooldowns;

  beforeEach(() => {
    now = 100000;
    cooldowns = new AnimalCommandCooldowns({ now: () => now });
  });

  test('records cooldowns only when explicitly told after a successful spawn', () => {
    const request = {
      command: 'beans',
      username: 'Member',
      userCooldownMs: 60000,
      globalCooldownMs: 15000
    };

    expect(cooldowns.check(request)).toEqual({ allowed: true, retryAfterMs: 0, scope: null });
    expect(cooldowns.check(request)).toEqual({ allowed: true, retryAfterMs: 0, scope: null });

    cooldowns.record(request);
    expect(cooldowns.check(request)).toEqual({ allowed: false, retryAfterMs: 60000, scope: 'user' });
  });

  test('applies 60s to Teamlevel members after the 15s global window', () => {
    const request = {
      command: 'beans',
      username: 'member',
      userCooldownMs: 60000,
      globalCooldownMs: 15000
    };
    cooldowns.record(request);
    now += 15000;

    expect(cooldowns.check(request)).toEqual({ allowed: false, retryAfterMs: 45000, scope: 'user' });
  });

  test('paid subscribers become eligible after 15s', () => {
    const request = {
      command: 'beans',
      username: 'subscriber',
      userCooldownMs: 15000,
      globalCooldownMs: 15000
    };
    cooldowns.record(request);
    now += 14999;
    expect(cooldowns.check(request).allowed).toBe(false);
    now += 1;
    expect(cooldowns.check(request)).toEqual({ allowed: true, retryAfterMs: 0, scope: null });
  });

  test('global cooldown blocks another user but a different command stays independent', () => {
    cooldowns.record({
      command: 'beans',
      username: 'first',
      userCooldownMs: 15000,
      globalCooldownMs: 15000
    });

    expect(cooldowns.check({
      command: 'beans',
      username: 'second',
      userCooldownMs: 15000,
      globalCooldownMs: 15000
    })).toEqual({ allowed: false, retryAfterMs: 15000, scope: 'global' });
    expect(cooldowns.check({
      command: 'miau',
      username: 'second',
      userCooldownMs: 15000,
      globalCooldownMs: 15000
    })).toEqual({ allowed: true, retryAfterMs: 0, scope: null });
  });
});
