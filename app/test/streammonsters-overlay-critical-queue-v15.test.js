'use strict';

const StreamMonstersPublicEventProjector = require(
  '../plugins/stream-monsters/backend/streammonsters/public-event-projector'
);
const runtime = require('../plugins/stream-monsters/streammonsters-overlay-runtime');

function publicEnvelope(projector, type, payload) {
  const eventType = `streammonsters:${type}`;
  return {
    ...projector.project(eventType, payload),
    ...projector.identifiers(eventType, payload)
  };
}

describe('Stream Monsters public critical overlay queue', () => {
  test('groups projected egg, evolution and battle flows by their public correlation id', () => {
    const projector = new StreamMonstersPublicEventProjector();
    const queue = runtime.createPriorityQueue({ maxSize: 20 });
    const egg = {
      egg_id: 'private-egg-7',
      element: 'Lunar',
      state: 'ready'
    };
    const monster = {
      monster_id: 'private-monster-7',
      name: 'Selene',
      element: 'Lunar'
    };

    for (const type of ['egg_spawned', 'hatch_started', 'egg_hatched']) {
      queue.enqueue(type, publicEnvelope(projector, type, {
        egg,
        ...(type === 'egg_hatched' ? { monster } : {})
      }));
    }
    for (const type of ['monster_evolved', 'monster_visual_evolved']) {
      queue.enqueue(type, publicEnvelope(projector, type, { monster }));
    }
    for (const [index, type] of [
      'battle_match_found',
      'battle_skill_used',
      'battle_completed'
    ].entries()) {
      queue.enqueue(type, publicEnvelope(projector, type, {
        eventId: `public-match:event:${index + 1}`,
        correlationId: 'public-match-correlation',
        matchId: 'internal-match-id'
      }));
    }

    const entries = queue.snapshot();
    expect(entries.every(entry => entry.data.egg?.egg_id == null)).toBe(true);
    expect(entries.every(entry => entry.data.monster?.monster_id == null)).toBe(true);

    const eggCorrelationId = entries.find(entry => entry.type === 'egg_spawned')
      .data.correlationId;
    const evolutionCorrelationId = entries.find(entry => entry.type === 'monster_evolved')
      .data.correlationId;
    expect(entries.slice(0, 3).map(entry => entry.groupKey)).toEqual(
      Array(3).fill(`critical:${eggCorrelationId}`)
    );
    expect(entries.slice(3, 5).map(entry => entry.groupKey)).toEqual(
      Array(2).fill(`critical:${evolutionCorrelationId}`)
    );
    expect(entries.slice(5).map(entry => entry.groupKey)).toEqual(
      Array(3).fill('critical:public-match-correlation')
    );
  });

  test('allowlists evolution stats and staged skill presentation without combat internals', () => {
    const projector = new StreamMonstersPublicEventProjector();
    const projected = projector.project('streammonsters:monster_evolved', {
      userId: 'private-viewer',
      evolutionStage: 3,
      statsBefore: { vitality: 7, might: 10, guard: 6, agility: 8 },
      statsAfter: { vitality: 7, might: 12, guard: 6, agility: 9 },
      statChanges: { vitality: 0, might: 2, guard: 0, agility: 1 },
      unlockedSkill: {
        id: 'private-skill-id',
        choice: 'C',
        icon: '☄️',
        name: 'Inferno Heart III',
        nameKey: 'skillNameAshfangCStage3',
        shortText: 'A staged blaze.',
        shortTextKey: 'skillEffectAshfangCStage3',
        evolutionStage: 3,
        chargeRequired: 100,
        effects: [{ type: 'damage', power: 99 }]
      },
      monster: {
        monster_id: 'private-monster',
        name: 'Ashfang',
        element: 'Ember',
        template_id: 'ashfang',
        evolution_stage: 3,
        image_url: '/plugins/streamalchemy/assets/streammonsters/furry/evolution/ember/ashfang-stage3.png',
        stats: { vitality: 7, might: 12, guard: 6, agility: 9 },
        seed: 'private-seed'
      }
    });

    expect(projected).toEqual(expect.objectContaining({
      displayName: 'Viewer',
      evolutionStage: 3,
      statsBefore: { vitality: 7, might: 10, guard: 6, agility: 8 },
      statsAfter: { vitality: 7, might: 12, guard: 6, agility: 9 },
      statChanges: { vitality: 0, might: 2, guard: 0, agility: 1 },
      unlockedSkill: {
        choice: 'C',
        icon: '☄️',
        name: 'Inferno Heart III',
        nameKey: 'skillNameAshfangCStage3',
        shortText: 'A staged blaze.',
        shortTextKey: 'skillEffectAshfangCStage3',
        evolutionStage: 3,
        chargeRequired: 100
      },
      monster: expect.objectContaining({
        name: 'Ashfang',
        evolutionStage: 3
      })
    }));
    expect(JSON.stringify(projected)).not.toMatch(
      /private-viewer|private-monster|private-skill-id|private-seed|effects|power/
    );
  });

  test('retains every critical group under overload and evicts only noncritical work', () => {
    const queue = runtime.createPriorityQueue({
      maxSize: 3,
      maxCriticalOverflow: 0
    });
    queue.enqueue('chat_result', { result: { message: 'replaceable' } }, 1);
    queue.enqueue('hype_changed', { points: 25 }, 2);
    queue.enqueue('quest_completed', { quest: 'daily' }, 3);

    const expected = [];
    for (let group = 1; group <= 6; group += 1) {
      const correlationId = `public-battle-${group}`;
      for (const [offset, type] of [
        'battle_match_found',
        'battle_skill_used',
        'battle_completed'
      ].entries()) {
        const eventId = `${correlationId}:event:${offset + 1}`;
        expected.push({ type, groupKey: `critical:${correlationId}` });
        queue.enqueue(type, {
          eventId,
          correlationId,
          matchId: `private-match-${group}`
        }, 10 + expected.length);
      }
    }
    queue.prependSnapshot({ cursor: 44 }, 100);

    const snapshot = queue.snapshot();
    expect(snapshot[0]).toEqual(expect.objectContaining({ type: 'state_snapshot' }));
    expect(snapshot.slice(1).map(({ type, groupKey }) => ({ type, groupKey })))
      .toEqual(expected);
    expect(snapshot.some(entry => entry.priority < 3)).toBe(false);
    expect(queue.size()).toBe(1 + expected.length);

    const drained = [];
    for (let entry = queue.shift(101); entry; entry = queue.shift(101)) {
      drained.push({ type: entry.type, groupKey: entry.groupKey });
    }
    expect(drained[0].type).toBe('state_snapshot');
    expect(drained.slice(1)).toEqual(expected);
  });

  test('normalizes planned battle aliases before queue dedupe to render one logical event', () => {
    const normalize = runtime.normalizeBattleEventType || (type => type);
    const queue = runtime.createPriorityQueue({ maxSize: 20 });
    const event = {
      eventId: 'match-15:event:3',
      correlationId: 'match-15',
      matchId: 'match-15',
      round: 1,
      action: { actorSlot: 1, targetSlot: 2, terminal: true }
    };

    expect(normalize('battle_skill_prompt')).toBe('battle_choice_opened');
    expect(normalize('battle_skill_locked')).toBe('battle_choice_locked');
    expect(normalize('battle_action')).toBe('battle_skill_used');
    expect(normalize('battle_knockout')).toBe('battle_skill_used');

    expect(queue.enqueue(normalize('battle_skill_used'), event, 1)).toBe(true);
    expect(queue.enqueue(normalize('battle_action'), event, 2)).toBe(false);
    expect(queue.enqueue(normalize('battle_knockout'), event, 3)).toBe(false);
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({
        type: 'battle_skill_used',
        data: event
      })
    ]);
  });

  test('keeps the sealed reveal in its battle group before the queued skill action', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 20 });
    const matchId = 'match-sealed-order';
    const correlationId = 'sealed-order-correlation';
    queue.enqueue('battle_choice_locked', {
      eventId: 'sealed-lock', matchId, correlationId, decision: { slot: 1, locked: true }
    }, 1);
    queue.enqueue('battle_choices_revealed', {
      eventId: 'sealed-reveal', matchId, correlationId,
      choices: [{ slot: 1, choice: 'A' }, { slot: 2, choice: 'C' }]
    }, 2);
    queue.enqueue('battle_skill_used', {
      eventId: 'sealed-skill', matchId, correlationId,
      action: { actorSlot: 1, targetSlot: 2, type: 'attack' }
    }, 3);

    expect(queue.snapshot().map(entry => entry.groupKey)).toEqual([
      `critical:${correlationId}`,
      `critical:${correlationId}`,
      `critical:${correlationId}`
    ]);
    expect([queue.shift(), queue.shift(), queue.shift()].map(entry => entry.type)).toEqual([
      'battle_choice_locked',
      'battle_choices_revealed',
      'battle_skill_used'
    ]);
  });
});
