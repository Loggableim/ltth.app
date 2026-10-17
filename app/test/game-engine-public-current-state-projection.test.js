'use strict';

const fs = require('fs');
const path = require('path');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');
const { createPublicOverlayAdapter } = require('../modules/public-overlay-socket-adapter');

class RecordingAdapter {
  constructor() {
    this.broadcastCalls = [];
  }

  broadcast(packet, options) {
    this.broadcastCalls.push({ packet, options });
  }
}

describe('Game Engine public reconnect state projection', () => {
  test('keeps the fields consumed by the unified overlay and strips the internal session id', () => {
    const sourceRoot = path.join(__dirname, '..', 'plugins', 'game-engine');
    const producer = fs.readFileSync(path.join(sourceRoot, 'main.js'), 'utf8');
    const consumer = fs.readFileSync(path.join(sourceRoot, 'overlay', 'unified.html'), 'utf8');
    expect(producer).toMatch(/socket\.emit\('game-engine:current-state',\s*\{\s*hasActiveGame:\s*true,\s*gameType:\s*session\.game_type,\s*sessionId,\s*useUnified/);
    expect(consumer).toContain("socket.on('game-engine:current-state', (data) => {");
    expect(consumer).toContain('if (data.hasActiveGame && data.useUnified) {');
    expect(consumer).toContain('switchToGame(data.gameType);');

    const source = {
      hasActiveGame: true,
      gameType: 'plinko',
      sessionId: 'internal-session-fixture',
      useUnified: true,
      privateMetadata: 'local-only'
    };
    const projected = projectPublicOverlayPayload('game-engine:current-state', source);
    expect(projected).toEqual({ hasActiveGame: true, gameType: 'plinko', useUnified: true });
    expect(projected).not.toHaveProperty('sessionId');
    expect(projected).not.toHaveProperty('privateMetadata');
  });

  test('keeps the original local broadcast intact while projecting its public packet', () => {
    const Adapter = createPublicOverlayAdapter(RecordingAdapter);
    const adapter = new Adapter({ name: '/' });
    const source = {
      hasActiveGame: true,
      gameType: 'plinko',
      sessionId: 'internal-session-fixture',
      useUnified: false
    };
    const options = { rooms: new Set(), except: new Set() };

    adapter.broadcast({ data: ['game-engine:current-state', source] }, options);

    expect(adapter.broadcastCalls).toHaveLength(2);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(source);
    expect(adapter.broadcastCalls[1].packet.data).toEqual([
      'game-engine:current-state',
      { hasActiveGame: true, gameType: 'plinko', useUnified: false }
    ]);
  });

  test('fails closed for malformed state and emits a minimal idle state', () => {
    expect(projectPublicOverlayPayload('game-engine:current-state', { hasActiveGame: false, sessionId: 'ignored' }))
      .toEqual({ hasActiveGame: false });
    expect(projectPublicOverlayPayload('game-engine:current-state', { hasActiveGame: true, gameType: 'plinko' }))
      .toBeNull();
    expect(projectPublicOverlayPayload('game-engine:current-state', {
      hasActiveGame: true, gameType: 'x'.repeat(81), useUnified: true
    })).toBeNull();
    expect(projectPublicOverlayPayload('game-engine:current-state', null)).toBeNull();
  });
});
