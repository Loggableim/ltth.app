'use strict';

const {
  GAMEPLAY_PACES,
  normalizeGameplayPace,
  resolvePaceWindows,
  PRESENTATION_TIMING
} = require('../plugins/streamalchemy/streammonsters-gameplay-pace');
const {
  resolvePrimaryCta
} = require('../plugins/streamalchemy/backend/streammonsters/primary-cta');

describe('Stream Monsters 1.12 gameplay pace contract', () => {
  test.each([
    ['arcade', 1, 6_000, 10_000],
    ['arcade', 2, 8_000, 12_000],
    ['standard', 1, 8_000, 12_000],
    ['standard', 2, 10_000, 15_000],
    ['accessible', 1, 10_000, 15_000],
    ['accessible', 2, 12_000, 18_000]
  ])('%s with %i locale(s) has exact input/stat windows', (
    pace,
    localeCount,
    inputMs,
    statMs
  ) => {
    expect(resolvePaceWindows(pace, localeCount)).toEqual({
      inputMs,
      rosterMs: inputMs,
      skillMs: inputMs,
      statMs
    });
  });

  test('uses Arcade for new and migrated setups and retains the legacy alias', () => {
    expect(GAMEPLAY_PACES).toEqual(['arcade', 'standard', 'accessible']);
    expect(normalizeGameplayPace()).toBe('arcade');
    expect(normalizeGameplayPace('arcade-rally')).toBe('arcade');
    expect(normalizeGameplayPace('arcade')).toBe('arcade');
    expect(normalizeGameplayPace('standard')).toBe('standard');
    expect(normalizeGameplayPace('accessible')).toBe('accessible');
    expect(normalizeGameplayPace('unknown')).toBe('arcade');
  });

  test('uses the exact short action presentation timing and compact threshold', () => {
    expect(PRESENTATION_TIMING).toEqual({
      standardActionMs: 1_600,
      specialActionMs: 2_400,
      terminalActionMs: 2_800,
      compactRepeatFrom: 3
    });
  });
});

describe('Stream Monsters 1.12 primary CTA arbitration', () => {
  const battle = {
    kind: 'battle_input',
    command: 'A / B',
    fighterSlot: 1
  };
  const journey = {
    nextStep: 'egg_hatched'
  };
  const egg = {
    kind: 'egg_ready',
    command: '!hatch 1'
  };
  const overlayHint = {
    kind: 'hint',
    command: '!monsters'
  };

  test('returns exactly the highest-priority CTA and never a CTA list', () => {
    const resolved = resolvePrimaryCta({
      battleInput: battle,
      journey,
      criticalEgg: egg,
      overlayHint
    });

    expect(resolved).toEqual(battle);
    expect(Array.isArray(resolved)).toBe(false);
  });

  test('uses the personal five-step journey before egg and contextual hints', () => {
    expect(resolvePrimaryCta({
      journey,
      criticalEgg: egg,
      overlayHint
    })).toEqual({
      kind: 'journey',
      stepKey: 'egg_hatched',
      command: '!hatch'
    });
  });

  test('shows only !hatch after the first free egg was received', () => {
    const cta = resolvePrimaryCta({
      journey: {
        completedSteps: ['egg_received'],
        nextStep: 'egg_hatched'
      },
      criticalEgg: {
        kind: 'egg_received',
        command: '!eggs'
      },
      overlayHint
    });

    expect(cta).toEqual({
      kind: 'journey',
      stepKey: 'egg_hatched',
      command: '!hatch'
    });
    expect(JSON.stringify(cta)).not.toMatch(/!eggs|!adopt/);
  });

  test('falls through to egg, hint, then no CTA', () => {
    expect(resolvePrimaryCta({ criticalEgg: egg, overlayHint })).toEqual(egg);
    expect(resolvePrimaryCta({ overlayHint })).toEqual(overlayHint);
    expect(resolvePrimaryCta({})).toBeNull();
  });
});
