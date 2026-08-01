'use strict';

const ArenaDirector = require('../plugins/streamalchemy/streammonsters-arena-director');

function actionTimeline(choice, { terminal = false } = {}) {
  return ArenaDirector.buildArcadeTimeline('battle_skill_used', {
    rulesVersion: 8,
    eventId: `paced-${choice}-${terminal}`,
    action: {
      rulesVersion: 8,
      choice,
      terminal,
      actorSlot: 1,
      targetSlot: 2,
      skill: {
        name: choice === 'C' ? 'Wildfire Rush' : 'Flamefang',
        type: choice === 'C' ? 'special' : 'attack'
      },
      effects: [],
      hits: [],
      actorState: { hp: 10 },
      targetState: { hp: terminal ? 0 : 10 }
    }
  });
}

describe('Stream Monsters 1.12 action presentation pacing', () => {
  test('holds standard, special, and terminal actions for the exact contract', () => {
    expect(actionTimeline('A').durationMs).toBe(1_600);
    expect(actionTimeline('C').durationMs).toBe(2_400);
    expect(actionTimeline('A', { terminal: true }).durationMs).toBe(2_800);
  });
});
