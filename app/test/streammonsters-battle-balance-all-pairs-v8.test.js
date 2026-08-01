const BattleSimulator = require('../plugins/streamalchemy/backend/streammonsters/battle-simulator');

function expectNeutralRate(row, field, sampleField) {
  const samples = Math.max(1, Number(row[sampleField]) || 0);
  const halfSampleQuantum = 0.5 / samples;
  expect(row[field]).toBeGreaterThanOrEqual(0.45 - halfSampleQuantum);
  expect(row[field]).toBeLessThanOrEqual(0.55 + halfSampleQuantum);
}

describe('Stream Monsters Rules-v8 all-pairs neutral balance', () => {
  test('keeps every template and element fair across every neutral cross-role pairing', () => {
    expect(typeof BattleSimulator.runV8AllPairsNeutralMatrix).toBe('function');

    const options = {
      levels: [1],
      stages: [1],
      statProfiles: ['balanced'],
      skillSequences: ['AAA', 'ABA', 'ABB', 'BAB', 'BBA', 'BBC'],
      seeds: [
        'v8-all-pairs-0',
        'v8-all-pairs-1',
        'v8-all-pairs-2',
        'v8-all-pairs-3',
        'v8-all-pairs-4',
        'v8-all-pairs-5'
      ],
      maxRounds: 64
    };
    const report = BattleSimulator.runV8AllPairsNeutralMatrix(options);
    const replay = BattleSimulator.runV8AllPairsNeutralMatrix(options);

    expect(JSON.stringify(replay)).toBe(JSON.stringify(report));
    expect(report).toEqual(expect.objectContaining({
      rulesVersion: 8,
      knockoutOnly: true,
      arenaCollapseWarningRound: 3,
      arenaCollapseRound: 4,
      maxRounds: 64,
      elementAdvantageDisabled: true,
      allUnorderedTemplatePairs: true,
      pairCount: 276,
      battleCount: 19_872,
      participantSampleCount: 39_744,
      mirroredBattleCount: 9_936,
      illegalChoiceFallbackCount: 0
    }));
    expect(
      report.resolvedBattleCount +
      report.doubleKnockoutCount +
      report.guardBoundCount
    )
      .toBe(report.battleCount);
    expect(report.guardBoundRate).toBeLessThanOrEqual(0.05);
    expect(report.doubleKnockoutRate).toBeLessThanOrEqual(0.05);
    expect(report.templateResults).toHaveLength(24);
    expect(report.elementResults).toHaveLength(6);
    expect(report.pairResults).toHaveLength(276);

    report.templateResults.forEach(row => {
      expect(row.samples).toBe(1_656);
      expect(row.resolvedSamples + row.draws).toBe(row.samples);
      expectNeutralRate(row, 'drawInclusiveWinRate', 'samples');
      expectNeutralRate(row, 'resolvedWinRate', 'resolvedSamples');
    });
    report.elementResults.forEach(row => {
      expect(row.samples).toBe(6_624);
      expect(row.resolvedSamples + row.draws).toBe(row.samples);
      expectNeutralRate(row, 'drawInclusiveWinRate', 'samples');
      expectNeutralRate(row, 'resolvedWinRate', 'resolvedSamples');
    });
  });
});
