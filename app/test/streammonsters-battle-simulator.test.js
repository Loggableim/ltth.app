const BattleSimulator = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-simulator'
);
const {
  getTemplate
} = require('../plugins/streamalchemy/backend/streammonsters/catalog');

describe('Stream Monsters neutral rules-v5 balance simulator', () => {
  test('rejects illegal early specials while accepting guaranteed round-three C', () => {
    expect(BattleSimulator.assertLegalSequence('BBC')).toBe('BBC');
    expect(() => BattleSimulator.assertLegalSequence('ABC'))
      .toThrow('STREAM_MONSTERS_SIMULATOR_SPECIAL_NOT_GUARANTEED');
    expect(() => BattleSimulator.assertLegalSequence('AB'))
      .toThrow('STREAM_MONSTERS_SIMULATOR_REQUIRES_THREE_LEGAL_CHOICES');
  });

  test('replays every template, level and legal skill family deterministically', () => {
    const options = {
      levels: [1, 5],
      skillSequences: ['AAA', 'BAB', 'BBC'],
      seeds: ['balance-a', 'balance-b']
    };
    const first = BattleSimulator.runV5BalanceMatrix(options);
    const replay = BattleSimulator.runV5BalanceMatrix(options);

    expect(replay).toEqual(first);
    expect(first).toEqual(expect.objectContaining({
      rulesVersion: 5,
      elementAdvantageDisabled: true,
      mirroredOpponentSampling: true,
      levels: [1, 5],
      skillSequences: ['AAA', 'BAB', 'BBC'],
      templates: expect.any(Array),
      templateResults: expect.any(Array),
      elementResults: expect.any(Array)
    }));
    expect(first.templates).toHaveLength(24);
    expect(first.templateResults).toHaveLength(24);
    expect(first.elementResults).toHaveLength(6);
    expect(first.battleCount).toBe(7_200);
    expect(first.mirroredBattleCount).toBe(first.battleCount / 2);
    expect(first.specialSequenceBattleCount).toBeGreaterThan(0);
  });

  test('keeps the complete levels 1/5/10/15/20 matrix inside five percentage points', () => {
    const report = BattleSimulator.runV5BalanceMatrix();

    expect(report.levels).toEqual([1, 5, 10, 15, 20]);
    expect(report.skillSequences).toEqual(expect.arrayContaining([
      'AAA',
      'ABA',
      'ABB',
      'BAB',
      'BBA',
      'BBC'
    ]));
    expect(report.templates).toHaveLength(24);
    expect(report.battleCount).toBe(72_000);
    expect(report.participantSampleCount).toBe(144_000);
    expect(report.maxTemplateDeviation).toBeLessThanOrEqual(0.05);
    expect(report.maxElementDeviation).toBeLessThanOrEqual(0.05);
    report.templateResults.forEach(result => {
      expect(result.samples).toBeGreaterThan(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0.45);
      expect(result.winRate).toBeLessThanOrEqual(0.55);
    });
    report.elementResults.forEach(result => {
      expect(result.samples).toBeGreaterThan(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0.45);
      expect(result.winRate).toBeLessThanOrEqual(0.55);
    });
  });
});

describe('Stream Monsters Rules-v8 knockout balance simulator', () => {
  test('continues living fighters beyond round three and stops only at the guard bound', () => {
    const result = BattleSimulator.simulateRulesV8Match({
      leftTemplate: getTemplate('ashfang'),
      rightTemplate: getTemplate('ripple'),
      level: 1,
      leftSequence: 'BBB',
      rightSequence: 'BBB',
      seed: 'v8-no-tie-break',
      maxRounds: 5,
      disableElementAdvantage: true
    });

    expect(result).toEqual(expect.objectContaining({
      rulesVersion: 8,
      terminal: false,
      terminalReason: 'guard_bound',
      winnerTemplateId: null,
      rounds: 5
    }));
    expect(result.history).toHaveLength(5);
    expect(result.history[2]).toEqual(expect.objectContaining({
      round: 3,
      terminal: false
    }));
    expect(result.history[3].collapse).toBeNull();
    expect(result.history[4].collapse).toEqual(expect.objectContaining({
      round: 5,
      damage: 2
    }));
    expect(Object.values(result.state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ hp: expect.any(Number), shield: expect.any(Number) })
    ]));
  });

  test('uses passive charge, legal action availability and stage-aware Specials', () => {
    const result = BattleSimulator.simulateRulesV8Match({
      leftTemplate: getTemplate('ashfang'),
      rightTemplate: getTemplate('ripple'),
      level: 5,
      leftStage: 3,
      rightStage: 3,
      leftSequence: 'BBC',
      rightSequence: 'BBC',
      seed: 'v8-special-charge',
      maxRounds: 3,
      disableElementAdvantage: true
    });
    const leftId = 'sim-left';

    expect(result.history[1].availability[leftId]).toEqual({
      charge: 100,
      choices: ['A', 'B', 'C']
    });
    expect(result.history[2].choices[leftId]).toBe('C');
    expect(result.history[2].actions.find(action => (
      action.actorId === leftId
    )).skill).toEqual(expect.objectContaining({
      choice: 'C',
      evolutionStage: 3
    }));
    expect(result.illegalChoiceFallbackCount).toBe(0);
  });

  test('reaches a deterministic monster knockout without an HP tie-break', () => {
    const input = {
      leftTemplate: getTemplate('ashfang'),
      rightTemplate: getTemplate('ripple'),
      level: 5,
      leftStage: 2,
      rightStage: 2,
      leftSequence: 'AAA',
      rightSequence: 'ABA',
      seed: 'v8-deterministic-ko',
      maxRounds: 64,
      disableElementAdvantage: true
    };
    const first = BattleSimulator.simulateRulesV8Match(input);

    expect(BattleSimulator.simulateRulesV8Match(input)).toEqual(first);
    expect(first).toEqual(expect.objectContaining({
      terminal: true,
      terminalReason: 'knockout',
      winnerTemplateId: expect.stringMatching(/^(ashfang|ripple)$/)
    }));
    expect(first.rounds).toBeGreaterThan(3);
    expect(Object.values(first.state).filter(state => state.hp > 0)).toHaveLength(1);
  });

  test('replays the representative Rules v8 matrix deterministically across all templates and stages', () => {
    const options = {
      levels: [1],
      stages: [1, 2, 3],
      statProfiles: ['balanced'],
      skillSequences: ['AAA', 'ABA', 'ABB', 'BAB', 'BBA', 'BBC'],
      seeds: ['v8-gate-0', 'v8-gate-1', 'v8-gate-2', 'v8-gate-3', 'v8-gate-4', 'v8-gate-5'],
      maxRounds: 64
    };
    const first = BattleSimulator.runNeutralBalanceMatrix(options);
    const replay = BattleSimulator.runNeutralBalanceMatrix(options);

    expect(replay).toEqual(first);
    expect(first).toEqual(expect.objectContaining({
      rulesVersion: 8,
      knockoutOnly: true,
      arenaCollapseRound: 5,
      maxRounds: 64,
      levels: [1],
      stages: [1, 2, 3],
      statProfiles: ['balanced'],
      skillSequences: ['AAA', 'ABA', 'ABB', 'BAB', 'BBA', 'BBC'],
      seeds: [
        'v8-gate-0',
        'v8-gate-1',
        'v8-gate-2',
        'v8-gate-3',
        'v8-gate-4',
        'v8-gate-5'
      ],
      templates: expect.any(Array),
      templateResults: expect.any(Array),
      elementResults: expect.any(Array)
    }));
    expect(first.templates).toHaveLength(24);
    expect(first.templateResults).toHaveLength(24);
    expect(first.elementResults).toHaveLength(6);
    expect(first.battleCount).toBe(5_184);
    expect(
      first.resolvedBattleCount +
      first.doubleKnockoutCount +
      first.guardBoundCount
    ).toBe(first.battleCount);
    expect(first.illegalChoiceFallbackCount).toBe(0);
    expect(first.guardBoundRate).toBeLessThanOrEqual(0.05);
    expect(first.doubleKnockoutRate).toBeLessThanOrEqual(0.05);
    first.templateResults.forEach(result => {
      expect(result.samples).toBeGreaterThan(0);
      expect(result.wins + result.losses + result.draws).toBe(result.samples);
    });
    first.elementResults.forEach(result => {
      expect(result.samples).toBeGreaterThan(0);
      expect(result.wins + result.losses + result.draws).toBe(result.samples);
    });
  });

  test('keeps the Rules v8 level, stage and stat edge matrix inside five percentage points', () => {
    const report = BattleSimulator.runNeutralBalanceMatrix({
      levels: [1, 20],
      stages: [1, 3]
    });

    expect(report).toEqual(expect.objectContaining({
      rulesVersion: 8,
      knockoutOnly: true,
      levels: [1, 20],
      stages: [1, 3],
      statProfiles: ['balanced', 'power', 'guard'],
      battleCount: 20_736,
      participantSampleCount: 41_472
    }));
    expect(
      report.resolvedBattleCount +
      report.doubleKnockoutCount +
      report.guardBoundCount
    )
      .toBe(report.battleCount);
    const sampleResolution = 0.5 / Math.min(
      ...report.templateResults.map(result => result.samples)
    );
    expect(report.guardBoundRate).toBeLessThanOrEqual(0.05);
    expect(report.doubleKnockoutRate).toBeLessThanOrEqual(0.05);
    expect(report.maxTemplateDeviation).toBeLessThanOrEqual(
      0.05 + sampleResolution
    );
    expect(report.maxElementDeviation).toBeLessThanOrEqual(0.05);
    report.templateResults.forEach(result => {
      expect(result.samples).toBeGreaterThan(0);
      expect(result.winRate).toBeGreaterThanOrEqual(
        0.45 - sampleResolution
      );
      expect(result.winRate).toBeLessThanOrEqual(
        0.55 + sampleResolution
      );
    });
    report.elementResults.forEach(result => {
      expect(result.samples).toBeGreaterThan(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0.45);
      expect(result.winRate).toBeLessThanOrEqual(0.55);
    });
  });
});

describe('Stream Monsters Rules-v7 evolution balance simulator', () => {
  test('replays all templates across three stages with mirrored legal inputs', () => {
    expect(typeof BattleSimulator.runV7EvolutionBalanceMatrix).toBe('function');
    const options = {
      levels: [1, 5],
      skillSequences: ['AAA', 'BBC'],
      seeds: ['evolution-a', 'evolution-b']
    };
    const first = BattleSimulator.runV7EvolutionBalanceMatrix(options);
    const replay = BattleSimulator.runV7EvolutionBalanceMatrix(options);

    expect(replay).toEqual(first);
    expect(first).toEqual(expect.objectContaining({
      rulesVersion: 7,
      levels: [1, 5],
      stages: [1, 2, 3],
      skillSequences: ['AAA', 'BBC'],
      seeds: ['evolution-a', 'evolution-b'],
      mirroredOpponentSampling: true,
      templates: expect.any(Array),
      sameStageResults: expect.any(Array),
      crossStageResults: expect.any(Array)
    }));
    expect(first.templates).toHaveLength(24);
    expect(first.sameStageResults.map(row => row.stage)).toEqual([1, 2, 3]);
    expect(first.crossStageResults.map(row => [
      row.higherStage,
      row.lowerStage
    ])).toEqual([[2, 1], [3, 2], [3, 1]]);
    expect(first.battleCount).toBe(2_304);
    expect(first.mirroredBattleCount).toBe(first.battleCount / 2);
  });

  test('keeps same-stage neutrality and monotonic cross-stage gains in power range', () => {
    expect(typeof BattleSimulator.runV7EvolutionBalanceMatrix).toBe('function');
    const report = BattleSimulator.runV7EvolutionBalanceMatrix();
    const cross = Object.fromEntries(report.crossStageResults.map(row => [
      `${row.higherStage}:${row.lowerStage}`,
      row
    ]));

    expect(report.levels).toEqual([1, 5, 10, 15, 20]);
    expect(report.stages).toEqual([1, 2, 3]);
    expect(report.templates).toHaveLength(24);
    expect(report.skillSequences).toEqual(expect.arrayContaining([
      'AAA',
      'ABA',
      'ABB',
      'BAB',
      'BBA',
      'BBC'
    ]));
    expect(report.battleCount).toBe(51_840);
    report.sameStageResults.forEach(row => {
      expect(row.winRate).toBeGreaterThanOrEqual(0.47);
      expect(row.winRate).toBeLessThanOrEqual(0.53);
    });
    expect(cross['2:1'].winRate).toBeGreaterThan(0.5);
    expect(cross['3:2'].winRate).toBeGreaterThan(0.5);
    expect(cross['3:1'].winRate).toBeGreaterThanOrEqual(cross['2:1'].winRate);
    expect(cross['3:1'].winRate).toBeGreaterThanOrEqual(cross['3:2'].winRate);
    report.crossStageResults.forEach(row => {
      expect(row.maxPowerGap).toBeLessThanOrEqual(report.admittedPowerGap);
    });
  });
});
