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
