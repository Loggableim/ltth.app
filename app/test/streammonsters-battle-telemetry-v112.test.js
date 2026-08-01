'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const BattleMatchService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-match-service'
);

function addMatch(sqlite, id, durationMs, completion = 'battle') {
  const openedAtMs = 1_000_000;
  sqlite.prepare(`
    INSERT INTO streammonsters_matches (
      match_id, state, phase_version, seed, rules_version,
      matchmaking_level_gap, matchmaking_power_gap, round_number,
      action_opened_at_ms, result_json, created_at_ms, updated_at_ms,
      completed_at_ms
    ) VALUES (?, 'completed', 1, ?, 8, 2, 10, 4, ?, ?, ?, ?, ?)
  `).run(
    id,
    `seed-${id}`,
    openedAtMs,
    JSON.stringify({ completion }),
    openedAtMs - 5_000,
    openedAtMs + durationMs,
    openedAtMs + durationMs
  );
}

describe('Stream Monsters 1.12 battle duration telemetry', () => {
  test('reports P50/P95 for completed non-forfeit fights only', () => {
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    addMatch(sqlite, 'm-30', 30_000);
    addMatch(sqlite, 'm-40', 40_000);
    addMatch(sqlite, 'm-70', 70_000);
    addMatch(sqlite, 'm-forfeit', 500_000, 'forfeit');
    const service = new BattleMatchService({ store, autoStart: false });
    expect(service.getBattleDurationTelemetry()).toEqual({
      sampleSize: 3,
      p50Ms: 40_000,
      p95Ms: 70_000,
      target: { p50MinMs: 30_000, p50MaxMs: 40_000, p95MaxMs: 75_000 },
      p50WithinTarget: true,
      p95WithinTarget: true
    });
    service.destroy();
    sqlite.close();
  });

  test('creator state exposes telemetry without adding it to public GET state', () => {
    const source = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'stream-monsters',
      'backend',
      'streammonsters',
      'routes.js'
    ), 'utf8');
    expect(source).toContain('battleTelemetry: this.getBattleTelemetry()');
    expect(source).not.toMatch(/getPublicSnapshot\([^)]*battleTelemetry/);
  });
});
