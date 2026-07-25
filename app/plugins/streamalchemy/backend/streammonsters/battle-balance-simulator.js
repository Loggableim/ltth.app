const SKILL_SEQUENCES = Object.freeze([
  Object.freeze({ label: 'A/A -> B/B -> C/C', rounds: [['A', 'A'], ['B', 'B'], ['C', 'C']] }),
  Object.freeze({ label: 'B/B -> A/A -> C/C', rounds: [['B', 'B'], ['A', 'A'], ['C', 'C']] }),
  Object.freeze({ label: 'B/B -> B/B -> C/C', rounds: [['B', 'B'], ['B', 'B'], ['C', 'C']] })
]);

const TACTICAL_SKILL_SEQUENCES = Object.freeze([
  Object.freeze({ label: 'A/B -> B/A -> C/C', rounds: [['A', 'B'], ['B', 'A'], ['C', 'C']] })
]);

function statsForLevel(level) {
  const points = Math.max(0, Math.min(19, Number(level) - 1));
  return {
    vitality: 7 + Math.floor(points / 4),
    might: 7 + Math.floor((points + 2) / 4),
    guard: 7 + Math.floor((points + 1) / 4),
    agility: 7 + Math.floor((points + 3) / 4)
  };
}

function makeMonster(template, side, level) {
  return {
    monster_id: `${template.templateId}-${side}`,
    user_id: `sim-${side}`,
    template_id: template.templateId,
    visual_key: `furry:${template.templateId}`,
    name: template.name,
    element: template.element,
    personality: 'Balanced',
    level,
    stats: statsForLevel(level)
  };
}

function simulateSymmetricBalance({ battleService, templates, levels, seedsPerTemplate = 100 }) {
  if (!battleService || !Array.isArray(templates)) throw new Error('STREAM_MONSTERS_BALANCE_SIMULATOR_REQUIRES_BATTLE_SERVICE');
  const entries = [];
  let samples = 0;
  let tacticalSamples = 0;

  for (const template of templates) {
    for (const level of levels) {
      const a = makeMonster(template, 'a', level);
      const b = makeMonster(template, 'b', level);
      let wins = 0;
      let total = 0;
      for (let seedNumber = 0; seedNumber < seedsPerTemplate; seedNumber += 1) {
        for (const sequence of SKILL_SEQUENCES) {
          const seed = `balance:${template.templateId}:${level}:${seedNumber}:${sequence.label}`;
          const sides = [[a, b], [b, a]];
          const choicesByMonster = {
            [a.monster_id]: sequence.rounds.map(([aChoice]) => aChoice),
            [b.monster_id]: sequence.rounds.map(([, bChoice]) => bChoice)
          };
          for (const [first, second] of sides) {
            let state = battleService.createBattleState(first, second, seed);
            for (let roundIndex = 0; roundIndex < sequence.rounds.length; roundIndex += 1) {
              state = battleService.resolveRound(state, {
                [first.monster_id]: choicesByMonster[first.monster_id][roundIndex],
                [second.monster_id]: choicesByMonster[second.monster_id][roundIndex]
              }).state;
              if (state.finished) break;
            }
            if (!state.finished) state = battleService.resolveRound(state, {}).state;
            if (state.winnerId === a.monster_id) wins += 1;
            total += 1;
            samples += 1;
          }
        }
      }
      const winRate = total ? wins / total : 0.5;
      entries.push({
        templateId: template.templateId,
        level,
        samples: total,
        winRate,
        deviation: Math.abs(winRate - 0.5),
        sequences: SKILL_SEQUENCES.map(sequence => sequence.label)
      });
      for (let seedNumber = 0; seedNumber < seedsPerTemplate; seedNumber += 1) {
        for (const sequence of TACTICAL_SKILL_SEQUENCES) {
          let state = battleService.createBattleState(a, b, `tactical:${template.templateId}:${level}:${seedNumber}:${sequence.label}`);
          for (const [aChoice, bChoice] of sequence.rounds) {
            state = battleService.resolveRound(state, {
              [a.monster_id]: aChoice,
              [b.monster_id]: bChoice
            }).state;
            if (state.finished) break;
          }
          if (!state.finished) state = battleService.resolveRound(state, {}).state;
          if (!state.finished || state.rounds.length > 3) throw new Error('STREAM_MONSTERS_TACTICAL_SIMULATION_INCOMPLETE');
          tacticalSamples += 1;
        }
      }
    }
  }

  return {
    samples,
    tacticalSamples,
    entries,
    maxDeviation: Math.max(0, ...entries.map(entry => entry.deviation))
  };
}

module.exports = { SKILL_SEQUENCES, TACTICAL_SKILL_SEQUENCES, statsForLevel, simulateSymmetricBalance };
