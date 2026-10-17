'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const BetterSqlite3 = require('better-sqlite3');
const { JSDOM } = require('jsdom');
const CoinBattleDatabase = require('../plugins/coinbattle/backend/database');
const { createPublicOverlayMiddleware } = require('../modules/public-overlay-access');

const overlaySource = fs.readFileSync(
  path.join(__dirname, '..', 'plugins', 'coinbattle', 'overlay', 'overlay.js'),
  'utf8'
);

function createConsumer(payload) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="post-match-leaderboard"><div id="post-match-lb-title"></div><div id="post-match-lb-list"></div></div>
  </body></html>`, { url: 'http://localhost/', runScripts: 'outside-only' });
  const { window } = dom;
  window.io = () => ({ on() {}, emit() {} });
  window.i18n = { t: key => key };
  window.fetch = async () => ({ json: async () => payload });
  window.setTimeout = callback => {
    callback();
    return 1;
  };
  const instrumented = overlaySource.replace(/\n\}\)\(\);\s*$/, '\nwindow.__coinBattleFixture = { showSingleLeaderboard };\n})();');
  window.eval(instrumented);
  return { dom, window, fixture: window.__coinBattleFixture };
}

describe('CoinBattle public leaderboard field projection', () => {
  let rawDb;
  let db;
  let sourceResponse;

  beforeAll(() => {
    rawDb = new BetterSqlite3(':memory:');
    db = new CoinBattleDatabase(rawDb, { info() {}, warn() {}, error() {} });
    db.initializeTables();
    const player = db.getOrCreatePlayer({
      userId: 'platform-user-id-canary',
      uniqueId: 'fixture_handle',
      nickname: 'Fixture Viewer',
      profilePictureUrl: 'https://assets.invalid/avatar.png'
    });
    db.updatePlayerLifetimeStats(player.id, 321, 4, false, false);
    rawDb.prepare('UPDATE coinbattle_players SET last_seen = ?, current_title = ? WHERE id = ?')
      .run(1791342000, 'private-title', player.id);
    sourceResponse = { success: true, data: db.getLifetimeLeaderboard(10) };
  });

  afterAll(() => {
    db.destroy();
    rawDb.close();
  });

  test('serves only the fields read by the shipped post-match leaderboard consumer', async () => {
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn() {} } }));
    app.get('/api/plugins/coinbattle/leaderboard/lifetime', (_req, res) => res.json(sourceResponse));

    const publicResponse = await request(app)
      .get('/api/plugins/coinbattle/leaderboard/lifetime?limit=10')
      .set('Host', 'quiet-river.trycloudflare.com');
    const localResponse = await request(app)
      .get('/api/plugins/coinbattle/leaderboard/lifetime?limit=10')
      .set('Host', '127.0.0.1:3000');

    expect(sourceResponse.data[0]).toMatchObject({
      user_id: 'platform-user-id-canary', unique_id: 'fixture_handle', nickname: 'Fixture Viewer',
      profile_picture_url: 'https://assets.invalid/avatar.png', total_coins: 321, current_title: 'private-title'
    });
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body).toEqual({
      success: true,
      data: [{
        nickname: 'Fixture Viewer', unique_id: 'fixture_handle',
        profile_picture_url: 'https://assets.invalid/avatar.png', total_coins: 321
      }]
    });
    expect(JSON.stringify(publicResponse.body)).not.toContain('platform-user-id-canary');
    expect(JSON.stringify(publicResponse.body)).not.toContain('private-title');
    expect(localResponse.body.data[0]).toMatchObject({ user_id: 'platform-user-id-canary', current_title: 'private-title' });

    const original = createConsumer(sourceResponse);
    const projected = createConsumer(publicResponse.body);
    try {
      await original.fixture.showSingleLeaderboard('lifetime', 0, []);
      await projected.fixture.showSingleLeaderboard('lifetime', 0, []);
      const rendered = context => ({
        title: context.window.document.getElementById('post-match-lb-title').textContent,
        row: context.window.document.querySelector('.post-match-lb-entry').textContent,
        avatar: context.window.document.querySelector('.post-match-lb-avatar')?.src || ''
      });
      expect(rendered(projected)).toEqual(rendered(original));
    } finally {
      original.dom.window.close();
      projected.dom.window.close();
    }
  });
});
