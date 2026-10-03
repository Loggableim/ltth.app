'use strict';

const { simulateRulesV8Match } = require('../plugins/stream-monsters/backend/streammonsters/battle-simulator');
const {
  ARENA_COLLAPSE_ENFORCED_KO_ROUND,
  ARENA_COLLAPSE_DEFENSE_LOCK_ROUND
} = require('../plugins/stream-monsters/backend/streammonsters/battle-rules-v8');
const { TEMPLATE_CATALOG } = require('../plugins/stream-monsters/backend/streammonsters/catalog');

// Standard "BBB" stall sequence — max shield/heal pressure
const STALL_SEQUENCE = 'BBB';
// Balanced attack sequence
const ATTACK_SEQUENCE = 'AAA';
// Mix: attack into special
const MIX_SEQUENCE = 'AAC';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function runBatch({ battleType, leftSequence, rightSequence, count = 100 }) {
  const results = [];
  const leftTemplate = TEMPLATE_CATALOG.find(t => t.role === 'attacker') || TEMPLATE_CATALOG[0];
  const rightTemplate = TEMPLATE_CATALOG.find(t => t.role === 'attacker' && t.templateId !== leftTemplate.templateId) || TEMPLATE_CATALOG[1];

  for (let i = 0; i < count; i++) {
    const seed = `pacing-batch-${battleType}-${i}`;
    const result = simulateRulesV8Match({
      leftTemplate,
      rightTemplate,
      level: 1,
      leftSequence,
      rightSequence,
      seed,
      statProfile: 'balanced',
      leftStage: 1,
      rightStage: 1,
      disableElementAdvantage: true,
      maxRounds: 64,
      battleType
    });
    results.push(result);
  }
  return results;
}

describe('Stream Monsters – Combat Pacing v8 (M3)', () => {
  describe('ARENA_COLLAPSE_ENFORCED_KO_ROUND constant', () => {
    it('exports ARENA_COLLAPSE_ENFORCED_KO_ROUND = 12', () => {
      expect(ARENA_COLLAPSE_ENFORCED_KO_ROUND).toBe(12);
    });

    it('ARENA_COLLAPSE_DEFENSE_LOCK_ROUND = 8', () => {
      expect(ARENA_COLLAPSE_DEFENSE_LOCK_ROUND).toBe(8);
    });
  });

  describe('Standard battles (battleType=standard) – 3–5 round median', () => {
    let results;
    beforeAll(() => {
      results = runBatch({
        battleType: 'standard',
        leftSequence: ATTACK_SEQUENCE,
        rightSequence: ATTACK_SEQUENCE,
        count: 100
      });
    });

    it('all 100 battles terminate', () => {
      const terminated = results.filter(r => r.terminal);
      expect(terminated.length).toBe(100);
    });

    it('median round count is 3–5 for standard battles', () => {
      const rounds = results.map(r => r.rounds);
      const med = median(rounds);
      expect(med).toBeGreaterThanOrEqual(3);
      expect(med).toBeLessThanOrEqual(5);
    });

    it('all standard battles produce a decisive winner (no draws)', () => {
      const withWinner = results.filter(r => r.winnerId != null);
      expect(withWinner.length).toBe(100);
    });
  });

  describe('Boss/jackpot battles (battleType=boss) – 8–12 round median', () => {
    let bossResults;
    let jackpotResults;
    beforeAll(() => {
      bossResults = runBatch({
        battleType: 'boss',
        leftSequence: STALL_SEQUENCE,
        rightSequence: STALL_SEQUENCE,
        count: 100
      });
      jackpotResults = runBatch({
        battleType: 'jackpot',
        leftSequence: STALL_SEQUENCE,
        rightSequence: STALL_SEQUENCE,
        count: 100
      });
    });

    it('boss battles: median round count is 8–12', () => {
      const rounds = bossResults.map(r => r.rounds);
      const med = median(rounds);
      expect(med).toBeGreaterThanOrEqual(8);
      expect(med).toBeLessThanOrEqual(12);
    });

    it('jackpot battles: median round count is 8–12', () => {
      const rounds = jackpotResults.map(r => r.rounds);
      const med = median(rounds);
      expect(med).toBeGreaterThanOrEqual(8);
      expect(med).toBeLessThanOrEqual(12);
    });

    it('boss battles all terminate', () => {
      const terminated = bossResults.filter(r => r.terminal);
      expect(terminated.length).toBe(100);
    });

    it('jackpot battles all terminate', () => {
      const terminated = jackpotResults.filter(r => r.terminal);
      expect(terminated.length).toBe(100);
    });

    it('boss battles: all produce a decisive winner (no draws)', () => {
      const withWinner = bossResults.filter(r => r.winnerId != null);
      expect(withWinner.length).toBe(100);
    });

    it('jackpot battles: all produce a decisive winner (no draws)', () => {
      const withWinner = jackpotResults.filter(r => r.terminal && r.winnerId != null);
      expect(withWinner.length).toBe(100);
    });
  });

  describe('Stall build (BBB vs BBB) – enforced K.O. by round 12', () => {
    let stallResults;
    beforeAll(() => {
      const sustainLeft = TEMPLATE_CATALOG.find(t => t.role === 'sustain') || TEMPLATE_CATALOG[0];
      const sustainRight = TEMPLATE_CATALOG.find(t => t.role === 'sustain' && t.templateId !== sustainLeft.templateId)
        || TEMPLATE_CATALOG[1];

      stallResults = [];
      for (let i = 0; i < 100; i++) {
        const result = simulateRulesV8Match({
          leftTemplate: sustainLeft,
          rightTemplate: sustainRight,
          level: 1,
          leftSequence: STALL_SEQUENCE,
          rightSequence: STALL_SEQUENCE,
          seed: `stall-ko-test-${i}`,
          statProfile: 'balanced',
          leftStage: 1,
          rightStage: 1,
          disableElementAdvantage: true,
          maxRounds: 64,
          battleType: 'boss'
        });
        stallResults.push(result);
      }
    });

    it('all stall battles terminate (no guard-bound draws)', () => {
      const terminated = stallResults.filter(r => r.terminal);
      expect(terminated.length).toBe(100);
    });

    it('stall builds cannot exceed 12 rounds before Arena Collapse enforces K.O.', () => {
      const overLimit = stallResults.filter(r => r.rounds > 12);
      expect(overLimit.length).toBe(0);
    });

    it('all stall battles produce a decisive winner (winnerId truthy)', () => {
      const decisive = stallResults.filter(r => r.winnerId != null);
      expect(decisive.length).toBe(100);
    });
  });

  describe('Mixed sequence battles across 100+ seeds', () => {
    it('standard battles (mix sequence) have median 3–5 rounds', () => {
      const results = runBatch({
        battleType: 'standard',
        leftSequence: MIX_SEQUENCE,
        rightSequence: ATTACK_SEQUENCE,
        count: 100
      });
      const med = median(results.map(r => r.rounds));
      expect(med).toBeGreaterThanOrEqual(3);
      expect(med).toBeLessThanOrEqual(5);
    });

    it('all mixed battles have truthy winnerId', () => {
      const results = runBatch({
        battleType: 'standard',
        leftSequence: MIX_SEQUENCE,
        rightSequence: ATTACK_SEQUENCE,
        count: 100
      });
      const decisive = results.filter(r => r.winnerId != null);
      expect(decisive.length).toBe(100);
    });
  });
});
