'use strict';

const StreamMonstersPlugin = require('../plugins/streamalchemy');

function harness() {
  const journeys = new Map();
  const api = { emit: jest.fn() };
  const plugin = Object.assign(Object.create(StreamMonstersPlugin.prototype), {
    api,
    streamMonstersOnboarding: {
      recordStep(viewerId, step) {
        const completed = new Set(journeys.get(viewerId) || []);
        completed.add(step);
        journeys.set(viewerId, [...completed]);
        return true;
      },
      getJourney(viewerId) {
        const steps = [
          'egg_received',
          'egg_hatched',
          'monster_selected',
          'battle_joined',
          'battle_completed'
        ];
        const completed = new Set(journeys.get(viewerId) || []);
        const nextStep = steps.find(step => !completed.has(step)) || null;
        return { nextStep, complete: nextStep === null };
      }
    },
    streamMonstersPublicEventProjector: {
      identifiers: () => ({ eventId: 'event-1', correlationId: 'correlation-1' }),
      project: (_eventType, payload) => ({ ...payload }),
      isCritical: () => false
    },
    streamMonstersStore: null,
    streamMonstersBattleViewerIds: () => ['viewer-a'],
    emitStreamMonstersTutorialHint: jest.fn(),
    logStructured: jest.fn()
  });
  return { plugin, api };
}

describe('Stream Monsters 1.12 primary CTA runtime wiring', () => {
  test('a received first egg emits only the next !hatch journey CTA', () => {
    const { plugin } = harness();
    const emitted = plugin.emitStreamMonsters('streammonsters:egg_spawned', {
      userId: 'viewer-a'
    });
    expect(emitted.primaryCta).toEqual({
      kind: 'journey',
      stepKey: 'egg_hatched',
      command: '!hatch'
    });
    expect(Object.keys(emitted).filter(key => /cta/i.test(key))).toEqual(['primaryCta']);
  });

  test('active battle input overrides the personal journey CTA', () => {
    const { plugin } = harness();
    const emitted = plugin.emitStreamMonsters(
      'streammonsters:battle_choice_opened',
      { matchId: 'match-1', choices: ['A', 'B'] }
    );
    expect(emitted.primaryCta).toEqual({
      kind: 'battle_input',
      command: 'A / B'
    });
  });
});
