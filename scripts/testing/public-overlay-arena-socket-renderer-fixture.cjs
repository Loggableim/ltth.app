'use strict';

// Isolated source-contract fixture: no server, Socket.IO listener, browser,
// child process, or network. It carries one synthetic Arena update through
// the actual public socket guard and DTO projection into the renderer's
// original drawPlayer implementation with a CPU-only canvas stub.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

const appRoot = path.resolve(__dirname, '../../app');
const accessPath = path.join(appRoot, 'modules/public-overlay-access.js');
const releasePolicyPath = path.join(appRoot, 'modules/public-overlay-release-event-policy.js');
const registryPath = path.join(appRoot, 'modules/public-overlay-registry.js');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === accessPath && request === './public-overlay-release-event-policy') {
    return { createPublicReleaseEventGuard: () => () => true };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let protectPublicSocket;
let projectPublicOverlayPayload;
let isHttpAllowed;
try {
  ({ protectPublicSocket } = require(accessPath));
  ({ projectPublicOverlayPayload } = require(path.join(appRoot, 'modules/public-overlay-payload-projection.js')));
  ({ isHttpAllowed } = require(registryPath));
} finally {
  Module._load = originalLoad;
}

assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined, 'logger.js must stay unloaded');

const entrypoint = '/overlay/game-engine/arena';
assert.equal(isHttpAllowed({ method: 'GET', pathname: entrypoint }), true);

const received = [];
const socket = {
  handshake: { headers: { host: 'arena-fixture.trycloudflare.com' } },
  data: {},
  join() {},
  use() {},
  emit(eventName, payload) { received.push([eventName, payload]); return true; }
};
protectPublicSocket({ socket, logger: { warn() {} } });

const sourceState = {
  gameType: 'arena',
  config: { arenaWidth: 1080, arenaHeight: 720, giftWeaponMappings: { privateGiftId: { weaponType: 'mine' } } },
  fever: { active: true, scheduleId: 'private-schedule' },
  players: [{
    username: 'Fixture Viewer', nickname: 'Public Name', x: 100, y: 80, vx: 1, vy: 2,
    radius: 16, mass: 75, score: 8, kills: 2, color: 'hsl(120, 78%, 58%)',
    profilePictureUrl: 'https://private.invalid/avatar',
    abilities: {
      boost: { ready: true, chargeProgress: 1 },
      shield: { ready: false, chargeProgress: 0.5 },
      bomb: { ready: true }
    },
    strategy: null,
    activeRole: null,
    ai: { state: 'farming', reason: 'private rationale' },
    weapon: { type: 'mine', sourceGift: 'private gift' }
  }],
  food: [], weaponPickups: [], mines: [], bombs: [], leaderboard: [],
  privateCanary: 'PRIVATE_ARENA_CANARY'
};

const overlayPath = path.join(appRoot, 'plugins/game-engine/overlay/arena.html');
const overlaySource = fs.readFileSync(overlayPath, 'utf8');
const strategyStart = overlaySource.indexOf('    function strategyLabelForPlayer(player) {');
const strategyEnd = overlaySource.indexOf('    function drawStrategyLabel(player, point) {', strategyStart);
const avatarStart = overlaySource.indexOf('    function avatarRenderUrl(player) {');
const avatarEnd = overlaySource.indexOf('    function normalizeGiftCatalogEntry(gift) {', avatarStart);
const drawStart = overlaySource.indexOf('    function drawPlayer(player, now) {');
const drawEnd = overlaySource.indexOf('    function drawAbilityRings(player, point, now) {', drawStart);
assert([strategyStart, strategyEnd, avatarStart, avatarEnd, drawStart, drawEnd].every(index => index >= 0));

const safeDraws = [];
const context = {
  ctx: {
    save() {}, restore() {}, fillText() {}, strokeText() {},
    set globalAlpha(_value) {}, font: '', textBaseline: '', fillStyle: '', strokeStyle: '', lineWidth: 1
  },
  state: { players: [] },
  renderStats: { quality: 0.5 },
  project: () => ({ x: 24, y: 32, radius: 18 }),
  playerVisualAlpha: () => 1,
  updateTrail() {}, drawWeapon() {}, drawAvatarImage: () => false,
  drawFallbackOrb(player, point) { safeDraws.push({ player, point }); },
  drawAvatarChrome() {}, drawAnimatedWeaponAttachment() {}, drawAbilityRings() {}, drawStrategyLabel() {},
  clampText: value => String(value || ''),
  window: { innerWidth: 100, innerHeight: 100 }
};
vm.runInNewContext(
  `${overlaySource.slice(strategyStart, strategyEnd)};` +
  `${overlaySource.slice(avatarStart, avatarEnd)};` +
  `${overlaySource.slice(drawStart, drawEnd)};` +
  'globalThis.renderPlayer = drawPlayer;',
  context
);

socket.on = (eventName, handler) => {
  if (eventName === 'arena:state') socket.handlePublicState = handler;
};
socket.on('arena:state', payload => {
  context.state.players = payload.players;
  context.renderPlayer(payload.players[0], 100);
});
assert.equal(socket.emit('arena:state', sourceState), true);
assert.equal(received.length, 1);
const [eventName, publicState] = received[0];
assert.equal(eventName, 'arena:state');
assert.deepEqual(publicState, projectPublicOverlayPayload('arena:state', sourceState));
assert.equal(publicState.players[0].username, 'Fixture Viewer');
assert.equal(publicState.players[0].profilePictureUrl, undefined);
assert.equal(publicState.players[0].ai.reason, undefined);
assert.equal(publicState.players[0].weapon.sourceGift, undefined);
assert.equal(JSON.stringify(publicState).includes('PRIVATE_ARENA_CANARY'), false);
assert.equal(sourceState.privateCanary, 'PRIVATE_ARENA_CANARY', 'local producer object must remain intact');

socket.handlePublicState(publicState);
assert.equal(safeDraws.length, 1);
assert.equal(safeDraws[0].player, publicState.players[0]);
assert.deepEqual(safeDraws[0].point, { x: 24, y: 32, radius: 18 });
console.log('PASS: Arena entrypoint registry → public socket projection → original drawPlayer; local payload unchanged, no server/listener/browser/network/process');
