const {
  resolveInteractiveRound
} = require('../plugins/streamalchemy/backend/streammonsters/battle-rules-v5');

function totalDamage(templateId, level) {
  return Array.from({ length: 64 }, (_, index) => {
    const result = resolveInteractiveRound({
      fighters: [
        {
          monster_id: 'evolved-gale-attacker',
          template_id: templateId,
          element: 'Gale',
          evolution_stage: 2,
          level,
          stats: { vitality: 7, might: 10, guard: 0, agility: 20 }
        },
        {
          monster_id: 'evolved-gale-target',
          template_id: 'ripple',
          element: 'Tide',
          evolution_stage: 2,
          level: 1,
          stats: { vitality: 100, might: 0, guard: 0, agility: 1 }
        }
      ],
      choices: {
        'evolved-gale-attacker': 'A',
        'evolved-gale-target': 'B'
      },
      seed: `evolved-gale-compensation-${templateId}-${index}`,
      round: 1,
      state: {},
      disableElementAdvantage: true,
      rulesVersion: 8
    });
    return result.actions[0].hits
      .reduce((sum, hit) => sum + hit.requestedDamage, 0);
  }).reduce((sum, damage) => sum + damage, 0);
}

test('does not apply the level-one Gale bonus to evolved sustain templates', () => {
  expect(totalDamage('skyrend', 1)).toBeGreaterThan(totalDamage('skyrend', 5));
  expect(totalDamage('gusttail', 1)).toBe(totalDamage('gusttail', 5));
});
