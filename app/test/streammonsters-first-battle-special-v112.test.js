'use strict';

const BattleMatchService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-match-service'
);
const { projectBattleSkill } = require(
  '../plugins/stream-monsters/backend/streammonsters/public-event-projector'
);

function harness(battleCount) {
  const service = Object.assign(Object.create(BattleMatchService.prototype), {
    store: { getViewerBattleStats: () => ({ battle_count: battleCount }) },
    isRulesV6: () => true,
    isRulesV7: () => true,
    isRulesV8: () => true,
    isDefenseLocked: () => false,
    chargeWindow: () => null
  });
  const participant = {
    participantId: 'p1',
    viewerId: 'viewer-a',
    combatState: { charge: 0 },
    roster: {
      element: 'Ember',
      template_id: 'ashfang',
      evolution_stage: 1,
      skills: ['A', 'B', 'C'].map(choice => ({
        choice,
        icon: choice,
        name: `Skill ${choice}`,
        nameKey: `skill${choice}`,
        shortText: `Effect ${choice}`,
        shortTextKey: `effect${choice}`,
        type: choice === 'C' ? 'special' : 'attack',
        chargeRequired: choice === 'C' ? 100 : 0,
        effects: []
      }))
    }
  };
  const opponent = {
    participantId: 'p2',
    viewerId: 'viewer-b',
    roster: { element: 'Tide' }
  };
  return { service, participant, match: { rulesVersion: 8, participants: [participant, opponent] } };
}

describe('Stream Monsters 1.12 first-battle special teaching', () => {
  test('first battle hides C until the fighter actually reaches charge', () => {
    const { service, participant, match } = harness(0);
    const hidden = service.projectPublicSkillDeck(participant, match, { charge: 0 });
    expect(hidden.find(skill => skill.choice === 'C')).toEqual(expect.objectContaining({
      visible: false,
      available: false,
      chargeRequired: 100
    }));
    const revealed = service.projectPublicSkillDeck(participant, match, { charge: 100 });
    expect(revealed.find(skill => skill.choice === 'C')).toEqual(expect.objectContaining({
      visible: true,
      available: true
    }));
  });

  test('later battles expose disabled C and the public projector preserves visibility', () => {
    const { service, participant, match } = harness(1);
    const skill = service.projectPublicSkillDeck(participant, match, { charge: 35 })
      .find(entry => entry.choice === 'C');
    expect(projectBattleSkill(skill)).toEqual(expect.objectContaining({
      choice: 'C',
      visible: true,
      available: false,
      chargeRequired: 100
    }));
  });
});
