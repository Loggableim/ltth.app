'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../../..');

function invokeEmojiRainObsHudRoute() {
  const registrations = [];
  const api = {
    registerRoute(method, routePath, handler) {
      registrations.push({ method: method.toUpperCase(), routePath, handler });
    },
    registerMiddleware() {
      // The route-registration method also declares upload middleware; this
      // isolated test records but never mounts or invokes it.
    },
    log() {}
  };
  // Avoid the constructor: it asks for runtime services. The route registration
  // and selected handler below are the actual plugin source methods.
  const plugin = Object.create(require('../../../app/plugins/emoji-rain/main.js').prototype);
  plugin.api = api;
  plugin.uploadDir = path.join(ROOT, 'app/plugins/emoji-rain/uploads');
  plugin.registerRoutes();
  const route = registrations.find((item) => item.method === 'GET' && item.routePath === '/emoji-rain/obs-hud');
  assert.ok(route, 'the canonical OBS HUD GET handler must be registered');
  const sent = [];
  route.handler({}, { sendFile(filePath) { sent.push(path.resolve(filePath)); } });
  return sent;
}

test('EmojiRain obs-hud GET handler sends obs-hud.html, not overlay.html', () => {
  const sent = invokeEmojiRainObsHudRoute();
  assert.deepEqual(sent, [path.join(ROOT, 'app/plugins/emoji-rain/obs-hud.html')]);
  assert.equal(fs.existsSync(sent[0]), true);
});

test('EmojiRain obs-hud HTML loads the HUD renderer and its locale bootstrap', () => {
  const html = fs.readFileSync(path.join(ROOT, 'app/plugins/emoji-rain/obs-hud.html'), 'utf8');
  assert.match(html, /\/js\/i18n-client\.js/);
  assert.match(html, /\/js\/emoji-rain-obs-hud\.js/);
  assert.doesNotMatch(html, /\/js\/emoji-rain-engine\.js/);
});

