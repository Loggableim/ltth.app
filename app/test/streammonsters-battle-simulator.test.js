let BattleSimulator = null;
try {
  BattleSimulator = require('../plugins/streamalchemy/backend/streammonsters/battle-simulator');
} catch {
  BattleSimulator = null;
}

describe('Stream Monsters neutral rules-v3 balance simulator', () => {
  test('runs a deterministic mirrored matrix and keeps all elements within five points of fifty percent', () => {
    expect(BattleSimulator).toEqual(expect.objectContaining({
      runNeutralBalanceMatrix: expect.any(Function)
    }));

    const options = {
      levels: [1, 10],
      statAllocations: [
        { vitality: 7, might: 7, guard: 7, agility: 7 },
        { vitality: 5, might: 9, guard: 8, agility: 6 }
      ],
      personalities: ['Aggressive', 'Defensive', 'Adaptive'],
      seeds: ['balance-a', 'balance-b']
    };
    const first = BattleSimulator.runNeutralBalanceMatrix(options);
    const replay = BattleSimulator.runNeutralBalanceMatrix(options);

    expect(replay).toEqual(first);
    expect(first.elementAdvantageDisabled).toBe(true);
    expect(first.mirroredOpponentSampling).toBe(true);
    expect(first.battleCount).toBe(6_048);
    expect(first.participantSampleCount).toBe(12_096);
    expect(first.crossAllocationBattleCount).toBe(3_024);
    expect(first.crossPersonalityBattleCount).toBe(4_032);
    expect(first.results).toHaveLength(6);
    first.results.forEach(result => {
      expect(result).toEqual(expect.objectContaining({
        element: expect.any(String),
        wins: expect.any(Number),
        losses: expect.any(Number),
        draws: expect.any(Number),
        winRate: expect.any(Number)
      }));
      expect(result.wins + result.losses + result.draws).toBeGreaterThan(0);
      expect(result.draws).toBe(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0.45);
      expect(result.winRate).toBeLessThanOrEqual(0.55);
    });
    expect(first.results.reduce(
      (sum, result) => sum + result.wins + result.losses + result.draws,
      0
    )).toBe(first.battleCount * 2);
  });

  test('keeps the complete default development matrix inside the approved balance band', () => {
    const report = BattleSimulator.runNeutralBalanceMatrix();

    expect(report.battleCount).toBe(12_096);
    expect(report.participantSampleCount).toBe(24_192);
    expect(report.crossAllocationBattleCount).toBe(6_048);
    expect(report.crossPersonalityBattleCount).toBe(8_064);
    report.results.forEach(result => {
      expect(result.draws).toBe(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0.45);
      expect(result.winRate).toBeLessThanOrEqual(0.55);
    });
  });
});
