const BattleSimulator = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-simulator'
);

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
    const report = BattleSimulator.runNeutralBalanceMatrix();

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
