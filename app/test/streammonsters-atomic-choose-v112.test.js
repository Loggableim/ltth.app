'use strict';

const ChatCommands = require(
  '../plugins/stream-monsters/backend/streammonsters/chat-commands'
);

function createHarness(rosterLock) {
  const monster = {
    monster_id: 'monster-candidate',
    user_id: 'viewer-a',
    name: 'Cinderfox'
  };
  const store = {
    getViewerMonsters: jest.fn(() => [monster]),
    selectMonster: jest.fn(() => ({ ...monster, is_selected: 1 }))
  };
  const battleMatchService = {
    lockRoster: jest.fn(() => rosterLock)
  };
  const commands = new ChatCommands({
    store,
    engine: {},
    battleService: {},
    battleMatchService
  });
  return { commands, store, battleMatchService, monster };
}

describe('Stream Monsters 1.12 atomic !choose', () => {
  test('does not mutate global selection after a roster rejection', () => {
    const harness = createHarness({
      accepted: false,
      reason: 'monster_out_of_power_range',
      slot: 1,
      requestedChoice: 1
    });

    const result = harness.commands.choose('viewer-a', '1');

    expect(result).toEqual(expect.objectContaining({
      success: false,
      status: 'roster_rejected',
      reason: 'monster_out_of_power_range',
      slot: 1,
      requestedChoice: 1
    }));
    expect(harness.store.selectMonster).not.toHaveBeenCalled();
    expect(harness.battleMatchService.lockRoster).toHaveBeenCalledWith({
      userId: 'viewer-a',
      monsterId: 'monster-candidate',
      source: 'viewer',
      selectGlobally: true,
      requestedChoice: 1
    });
  });

  test('uses the service transaction for an accepted roster lock', () => {
    const harness = createHarness({
      accepted: true,
      selectionSource: 'viewer',
      slot: 1,
      requestedChoice: 1
    });

    const result = harness.commands.choose('viewer-a', '1');

    expect(result).toEqual(expect.objectContaining({
      success: true,
      status: 'roster_locked'
    }));
    expect(harness.store.selectMonster).not.toHaveBeenCalled();
  });

  test('retains ordinary collection selection outside a roster window', () => {
    const harness = createHarness({
      accepted: false,
      reason: 'no_roster_window'
    });

    const result = harness.commands.choose('viewer-a', '1');

    expect(result).toEqual(expect.objectContaining({
      success: true,
      status: 'selected'
    }));
    expect(harness.store.selectMonster).toHaveBeenCalledWith(
      'viewer-a',
      'monster-candidate'
    );
  });
});
