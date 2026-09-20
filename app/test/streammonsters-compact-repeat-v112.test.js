'use strict';

const BattleMatchService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-match-service'
);
const ArenaView = require('../plugins/stream-monsters/streammonsters-arena-view');

function action(choice = 'A', skillId = 'ashfang-a') {
  return { choice, skill: { id: skillId, name: 'Flamefang' } };
}

describe('Stream Monsters 1.12 compact repeated standard skills', () => {
  test('marks the third consecutive same standard skill by one fighter', () => {
    const prior = [action(), action()]
      .map(value => ({ action_json: JSON.stringify(value) }));
    const service = Object.assign(Object.create(BattleMatchService.prototype), {
      db: { prepare: () => ({ all: () => prior }) }
    });
    expect(service.actionRepeatPresentation('match-1', 'participant-1', action()))
      .toEqual({ repeatCount: 3, compactRepeat: true });
  });

  test('resets on a different skill and never compacts specials', () => {
    const service = Object.assign(Object.create(BattleMatchService.prototype), {
      db: {
        prepare: () => ({
          all: () => [{ action_json: JSON.stringify(action('B', 'ashfang-b')) }]
        })
      }
    });
    expect(service.actionRepeatPresentation('match-1', 'participant-1', action()))
      .toEqual({ repeatCount: 1, compactRepeat: false });
    expect(service.actionRepeatPresentation('match-1', 'participant-1', action('C', 'ashfang-c')))
      .toEqual({ repeatCount: 1, compactRepeat: false });
  });

  test('renderer consumes the durable compact-repeat annotation', () => {
    expect(ArenaView.isCompactRepeat({
      choice: 'A',
      presentation: { repeatCount: 3, compactRepeat: true }
    })).toBe(true);
    expect(ArenaView.isCompactRepeat({
      choice: 'C',
      presentation: { repeatCount: 4, compactRepeat: true }
    })).toBe(false);
  });
});
