'use strict';

const fs = require('fs');
const path = require('path');
const {
  isIncomingSocketEventAllowed,
  isOutgoingSocketEventAllowed
} = require('../modules/public-overlay-registry');

const appRoot = path.resolve(__dirname, '..');
const overlaySources = [
  'public/animation-overlay.html',
  'plugins/advanced-timer/overlay/index.html',
  'plugins/advanced-timer/overlay/overlay.js',
  'plugins/animazingpal/overlay/stream-assistant-hud.html',
  'plugins/clarityhud/overlays/chat.js',
  'plugins/clarityhud/overlays/full.js',
  'plugins/clarityhud/overlays/multi.js',
  'plugins/clarityhud/overlays/stream.js',
  'plugins/coinbattle/overlay/overlay.js',
  'plugins/emoji-rain/obs-hud.html',
  'public/js/emoji-rain-obs-hud.js',
  'plugins/fireworks/overlay.html',
  'plugins/flame-overlay/renderer/index.html',
  'plugins/game-engine/overlay/arena.html',
  'plugins/game-engine/overlay/chess.html',
  'plugins/game-engine/overlay/connect4.html',
  'plugins/game-engine/overlay/game-hud.html',
  'plugins/game-engine/overlay/plinko.html',
  'plugins/game-engine/overlay/slot.html',
  'plugins/game-engine/overlay/unified.html',
  'plugins/game-engine/overlay/wheel.html',
  'plugins/gcce/overlay-hud.html',
  'plugins/goals/overlay/overlay.js',
  'plugins/goals/overlay/multigoal.js',
  'plugins/interactive-story/overlay.html',
  'plugins/music-bot/overlay.html',
  'plugins/openshock/overlay/zappiehell-overlay.html',
  'plugins/quiz-show/quiz_show_overlay.js',
  'plugins/quiz-show/quiz_show_leaderboard_overlay.html',
  'plugins/schnorrbecher/overlay/coincup.js',
  'plugins/spotlight/overlays/single-overlay.js',
  'plugins/spotlight/overlays/multihud.js',
  'plugins/streamalchemy/streammonsters-overlay.html',
  'plugins/stt-ticker/overlay/ticker.html',
  'plugins/toptier/assets/overlay.js',
  'plugins/visual-fx-frame-webgpu/renderer/overlay-controller.js',
  'plugins/weather-control/overlay.html',
  'plugins/webgpu-emoji-rain/obs-hud.html',
  'plugins/webgpu-fireworks/overlay.html',
  'plugins/webgpu-weather-control/overlay.html'
];

const lifecycleEvents = new Set([
  'connect',
  'connect_error',
  'disconnect',
  'error',
  'reconnect',
  'reconnect_attempt',
  'reconnect_failed'
]);

function collectEvents(method) {
  const events = new Map();
  const expression = new RegExp(
    String.raw`(?:\bsocket|this\.socket|root\.socket|state\.socket)\s*\??\.\s*${method}\s*\(\s*['"]([^'"]+)['"]`,
    'g'
  );

  for (const relativePath of overlaySources) {
    const absolutePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing registered overlay source: ${relativePath}`);
    }
    const source = fs.readFileSync(absolutePath, 'utf8');
    for (const match of source.matchAll(expression)) {
      if (!events.has(match[1])) events.set(match[1], []);
      events.get(match[1]).push(relativePath);
    }
  }
  return events;
}

describe('public overlay Socket.IO source contract', () => {
  test('every literal overlay-to-server event is explicitly registered', () => {
    const incomingEvents = collectEvents('emit');
    const unregistered = [];
    for (const [eventName, sources] of incomingEvents) {
      if (!isIncomingSocketEventAllowed(eventName)) {
        unregistered.push({ eventName, sources });
      }
    }
    expect(unregistered).toEqual([]);
  });

  test('every literal server-to-overlay event is explicitly registered', () => {
    const outgoingEvents = collectEvents('(?:on|once)');
    const unregistered = [];
    for (const [eventName, sources] of outgoingEvents) {
      if (
        !lifecycleEvents.has(eventName) &&
        !isOutgoingSocketEventAllowed(eventName)
      ) {
        unregistered.push({ eventName, sources });
      }
    }
    expect(unregistered).toEqual([]);
  });

  test('every Stream Monsters event from its data-driven listener map is explicitly registered', () => {
    const relativePath = 'plugins/streamalchemy/streammonsters-overlay.html';
    const source = fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
    const eventNames = new Set(
      [...source.matchAll(/['"](streammonsters:[A-Za-z0-9:_-]+)['"]\s*:/g)]
        .map(match => match[1])
    );

    expect(eventNames.size).toBeGreaterThan(0);
    expect(
      [...eventNames].filter(eventName => !isOutgoingSocketEventAllowed(eventName))
    ).toEqual([]);
  });

  test.each([
    'test:alert',
    'test:goal:increment',
    'test:goal:reset',
    'test:goal:set',
    'minigame:request',
    'plugins:reload',
    'settings:update',
    'stable-overlay-routing:recover'
  ])('keeps privileged or mutating incoming event %s off the public surface', eventName => {
    expect(isIncomingSocketEventAllowed(eventName)).toBe(false);
  });

  test.each([
    'init:state',
    'tiktok:status',
    'tiktok:stats',
    'plugin:error',
    'admin:settings-updated',
    'stable-overlay-routing:status'
  ])('keeps private direct outgoing event %s off the public surface', eventName => {
    expect(isOutgoingSocketEventAllowed(eventName)).toBe(false);
  });

  test('the initial public surface uses Socket.IO instead of raw WebSocket clients', () => {
    const offenders = [];
    for (const relativePath of overlaySources) {
      const source = fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
      if (/\bnew\s+WebSocket\s*\(/.test(source)) offenders.push(relativePath);
    }
    expect(offenders).toEqual([]);
  });
});
