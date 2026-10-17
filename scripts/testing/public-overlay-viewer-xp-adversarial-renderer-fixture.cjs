'use strict';

// Adversarial renderer-safety fixture for already-approved Viewer-XP display
// events. Uses original overlay HTML, the real public socket guard and payload
// projector, with synthetic in-memory sockets/DOM only (no server or network).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const appRoot = path.resolve(__dirname, '../../app');
const { JSDOM } = require(path.join(appRoot, 'node_modules/jsdom'));
const { protectPublicSocket } = require(path.join(appRoot, 'modules/public-overlay-access.js'));
const { projectPublicOverlayPayload } = require(path.join(appRoot, 'modules/public-overlay-payload-projection.js'));
const { isOutgoingSocketEventAllowed } = require(path.join(appRoot, 'modules/public-overlay-registry.js'));

assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined, 'logger.js must stay unloaded');

const overlayRoot = path.join(appRoot, 'plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays');
const fixtures = [];
const privateCanaries = [
  'XP_PRIVATE_USER_ID_CANARY', 'XP_PRIVATE_SETTINGS_CANARY', 'XP_PRIVATE_API_KEY_CANARY',
  'XP_PRIVATE_RAW_METADATA_CANARY', 'XP_PRIVATE_ANNOUNCEMENT_CANARY'
];
const publicPolicy = {
  getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true, policyInvalid: false }),
  isClosedBetaId: () => false
};

function createSocketPair() {
  const listeners = new Map();
  const clientEmits = [];
  const received = [];
  const client = {
    connected: false,
    on(eventName, handler) {
      const handlers = listeners.get(eventName) || [];
      handlers.push(handler);
      listeners.set(eventName, handlers);
      return this;
    },
    off(eventName, handler) {
      listeners.set(eventName, (listeners.get(eventName) || []).filter(item => item !== handler));
      return this;
    },
    emit(eventName, ...args) { clientEmits.push([eventName, ...args]); return true; },
    disconnect() { this.connected = false; }
  };
  const serverSocket = {
    handshake: { headers: { host: 'viewerxp-renderer-fixture.trycloudflare.com' } },
    data: {},
    join() {},
    use() {},
    emit(eventName, payload) {
      received.push([eventName, payload]);
      for (const handler of listeners.get(eventName) || []) handler(payload);
      return true;
    }
  };
  protectPublicSocket({ socket: serverSocket, logger: { warn() {} }, pluginReleasePolicy: publicPolicy });
  return { client, serverSocket, clientEmits, received };
}

function createRenderer(page, query = '') {
  const rendererPath = path.join(overlayRoot, page === 'xp-bar' ? 'xp-bar.html' : 'level-up.html');
  const source = fs.readFileSync(rendererPath, 'utf8').replace(/<script[^>]+src=[^>]*><\/script>/gi, '');
  const socket = createSocketPair();
  const errors = [];
  let nextTimerId = 0;
  const timers = new Map();
  const dom = new JSDOM(source, {
    url: `http://127.0.0.1/overlay/viewer-xp/${page}${query}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  fixtures.push(dom);
  dom.window.addEventListener('error', event => errors.push(event.message));
  dom.window.io = () => socket.client;
  dom.window.console = { log() {}, info() {}, warn() {}, error: error => errors.push(String(error)) };
  dom.window.ViewerXpI18n = {
    text(_key, fallback, params = {}) {
      return String(fallback || '').replace(/\{([^}]+)\}/g, (match, key) => params[key] ?? match);
    }
  };
  dom.window.i18n = { onLanguageChange() {} };
  dom.window.setTimeout = callback => {
    const id = ++nextTimerId;
    timers.set(id, callback);
    return id;
  };
  dom.window.clearTimeout = id => timers.delete(id);
  for (const script of dom.window.document.querySelectorAll('script:not([src])')) dom.window.eval(script.textContent);
  return { dom, socket, errors, timers };
}

function noPrivateCanaryIn(fixture) {
  const rendered = fixture.dom.window.document.documentElement.outerHTML;
  const received = JSON.stringify(fixture.socket.received);
  for (const canary of privateCanaries) {
    assert.equal(rendered.includes(canary), false, `private canary reached DOM: ${canary}`);
    assert.equal(received.includes(canary), false, `private canary crossed public socket guard: ${canary}`);
  }
  assert.deepEqual(fixture.errors, []);
}

function emitProjected(fixture, eventName, payload) {
  assert.equal(isOutgoingSocketEventAllowed(eventName), true, `${eventName} must be on the exact existing event allowlist`);
  const projected = projectPublicOverlayPayload(eventName, payload);
  assert.notEqual(projected, undefined);
  assert.notEqual(projected, null);
  assert.equal(fixture.socket.serverSocket.emit(eventName, payload), true);
  assert.deepEqual(fixture.socket.received.at(-1), [eventName, projected]);
  return projected;
}

function testXpBarHostileTextAndAllowedAvatar() {
  const fixture = createRenderer('xp-bar', '?autoHide=false&showPic=true');
  const { document } = fixture.dom.window;
  const hostileName = 'Viewer <img id="name-injected" src=x onerror="window.__xss=true">';
  const hostileTitle = '<svg id="title-injected" onload="window.__xss=true">Sponsor</svg>';
  const safeCdnUrl = 'https://p16-common-sign.tiktokcdn-eu.com/avatar.webp?note=%22%3E%3Cimg%20id%3Davatar-injected';
  const rawProfile = {
    username: hostileName,
    name_color: '#12abef',
    title: hostileTitle,
    level: 8,
    xp_progress: 24,
    xp_for_next_level: 80,
    xp_progress_percent: 30,
    profilePictureUrl: safeCdnUrl,
    user_id: privateCanaries[0],
    settings: { private: privateCanaries[1] },
    apiKey: privateCanaries[2],
    raw: privateCanaries[3]
  };
  const projected = emitProjected(fixture, 'viewer-xp:public-profile', rawProfile);
  assert.equal(projected.profilePictureUrl, new URL(safeCdnUrl).toString());
  assert.equal(document.querySelector('#username').textContent, hostileName);
  assert.equal(document.querySelector('#title').textContent, hostileTitle);
  assert.equal(document.querySelector('#name-injected'), null);
  assert.equal(document.querySelector('#title-injected'), null);
  assert.equal(document.querySelector('#avatar-injected'), null);
  assert.equal(document.querySelector('#xpContainer').classList.contains('visible'), true);
  const image = document.querySelector('#profilePic');
  assert.equal(image.getAttribute('src'), new URL(safeCdnUrl).toString());
  assert.equal(new URL(image.src).protocol, 'https:');
  assert.equal(new URL(image.src).hostname, 'p16-common-sign.tiktokcdn-eu.com');

  const update = {
    username: hostileName,
    amount: 13,
    profile: { ...rawProfile, xp_progress: 37, xp_progress_percent: 46 },
    metadata: privateCanaries[3]
  };
  emitProjected(fixture, 'viewer-xp:public-update', update);
  assert.equal(document.querySelector('#username').textContent, hostileName);
  assert.equal(document.querySelector('#title').textContent, hostileTitle);
  assert.equal(document.querySelector('#name-injected'), null);
  assert.equal(document.querySelector('#title-injected'), null);
  noPrivateCanaryIn(fixture);
}

function testXpBarRejectsUntrustedAvatarUrl() {
  const fixture = createRenderer('xp-bar', '?autoHide=false&showPic=true');
  const hostileUrl = 'javascript:alert(1)';
  const projected = emitProjected(fixture, 'viewer-xp:public-profile', {
    username: 'No Avatar', title: 'Safe text', name_color: '#abc', level: 2,
    xp_progress: 0, xp_for_next_level: 10, xp_progress_percent: 0,
    profilePictureUrl: hostileUrl, apiKey: privateCanaries[2]
  });
  assert.equal(projected.profilePictureUrl, null);
  const image = fixture.dom.window.document.querySelector('#profilePic');
  assert.equal(image.getAttribute('src'), '');
  assert.equal(image.style.display, 'none');
  assert.equal(fixture.dom.window.document.querySelector('script[src^="javascript:"]'), null);
  noPrivateCanaryIn(fixture);
}

function testLevelUpHostileTextAndPrivateFields() {
  const fixture = createRenderer('level-up', '?sound=false');
  const document = fixture.dom.window.document;
  const hostileName = '<img id="level-name-injected" src=x onerror="window.__xss=true"> Viewer';
  const hostileReward = '<svg id="reward-injected" onload="window.__xss=true">Champion</svg>';
  const rawLevelUp = {
    username: hostileName,
    oldLevel: 8,
    newLevel: 9,
    rewards: {
      title: hostileReward,
      name_color: '#abc123',
      announcement_message: privateCanaries[4],
      special_effects: { animation: privateCanaries[3] },
      secret: privateCanaries[1]
    },
    user_id: privateCanaries[0],
    settings: privateCanaries[1],
    apiKey: privateCanaries[2],
    raw: privateCanaries[3]
  };
  const projected = emitProjected(fixture, 'viewer-xp:public-level-up', rawLevelUp);
  assert.deepEqual(projected, {
    username: hostileName,
    oldLevel: 8,
    newLevel: 9,
    rewards: { title: hostileReward, name_color: '#abc123' }
  });
  assert.equal(document.querySelector('#username').textContent, hostileName);
  assert.equal(document.querySelector('#oldLevel').textContent, '8');
  assert.equal(document.querySelector('#newLevel').textContent, '9');
  assert.equal(document.querySelector('#level-name-injected'), null);
  assert.equal(document.querySelector('#reward-injected'), null);
  assert.equal(document.querySelector('.reward-badge').textContent, `✨ ${hostileReward}`);
  assert.equal(fixture.dom.window.__xss, undefined);
  noPrivateCanaryIn(fixture);
}

try {
  testXpBarHostileTextAndAllowedAvatar();
  testXpBarRejectsUntrustedAvatarUrl();
  testLevelUpHostileTextAndPrivateFields();
  assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined);
  console.log('PASS: Viewer-XP XP-bar/level-up original renderers display HTML-like public text as text; actual public socket guard/projectors strip private canaries, and profile image URLs remain HTTPS/CDN-validated; synthetic in-memory fixture only');
} finally {
  for (const fixture of fixtures) fixture.window.close();
}
