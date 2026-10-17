'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');
const ClarityHUDBackend = require('../plugins/clarityhud/backend/api');
const {
  classifySuperFanBarrage,
  projectSuperFanDisplayMessage
} = require('../plugins/clarityhud/lib/superfan-classifier');
const {
  projectPublicOverlayPayload,
  projectClarityStateResponse,
  projectViewerXpAvatarUrl
} = require('../modules/public-overlay-payload-projection');
const { protectPublicSocket } = require('../modules/public-overlay-access');

function messageWithMarker(displayType) {
  return {
    content: {
      displayType,
      piecesList: [{ userValue: { user: {
        nickname: 'Synthetic viewer',
        fansClubInfo: { fansLevel: '8' },
        profilePicture: { url: ['https://p16-sign.tiktokcdn.com/fixture.png'] },
        userId: 'private-fixture-id'
      } } }]
    }
  };
}

test('characterizes broad substring matches as a display heuristic, not provider role proof', () => {
  assert.equal(classifySuperFanBarrage(messageWithMarker('ttlive_unrelated')), null);
  assert.equal(classifySuperFanBarrage(messageWithMarker('prefix_ttlive_superfan_suffix')), 'superfan');
  assert.equal(classifySuperFanBarrage(messageWithMarker('ttlive_superfanish')), 'superfan');
  assert.equal(classifySuperFanBarrage(messageWithMarker('ttlive_superfan_joined')), 'superfan');
});

test('projects only the approved SuperFan display DTO through public QuickTunnel egress', async () => {
  const source = Object.create(EulerstreamAdapter.prototype);
  EventEmitter.call(source);
  source.logger = { warn() {}, info() {}, debug() {} };
  const normalized = [];
  source.on('superfan-display', event => normalized.push(event));
  source._dispatchEulerstreamMessage({
    type: 'WebcastBarrageMessage',
    data: messageWithMarker('ttlive_superfan_commentnotif_superfanjoined')
  });
  assert.deepEqual(normalized, [{
    eventType: 'superfan-join',
    displayName: 'Synthetic viewer',
    level: 8,
    profilePictureUrl: 'https://p16-sign.tiktokcdn.com/fixture.png'
  }]);
  assert.doesNotMatch(JSON.stringify(normalized), /private-fixture-id/);

  const emitted = [];
  const backend = new ClarityHUDBackend({
    emit: (event, payload) => emitted.push({ event, payload }),
    log() {}
  });
  backend.settings.full.showSuperFans = true;
  await backend.handleSuperFanDisplayEvent({
    ...normalized[0],
    raw: { private: 'must drop' },
    settings: { private: 'must drop' },
    apiKey: 'must drop'
  });
  const event = emitted[0];
  assert.equal(event.event, 'clarityhud.update.superfan-display');
  const liveProjection = projectPublicOverlayPayload(event.event, event.payload);
  assert.deepEqual(liveProjection, normalized[0]);

  const publicState = projectClarityStateResponse('full', {
    success: true,
    dock: 'full',
    settings: backend.settings.full,
    events: backend.eventQueues
  });
  assert.deepEqual(publicState.events['superfan-display'], [normalized[0]]);

  const sent = [];
  const socket = {
    handshake: { headers: { host: 'fixture.trycloudflare.com' } },
    data: {},
    join() {},
    use() {},
    emit(name, payload) { sent.push([name, payload]); return true; }
  };
  protectPublicSocket({
    socket,
    logger: { warn() {} },
    pluginReleasePolicy: {
      getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true, policyInvalid: false }),
      isClosedBetaId: () => false
    }
  });
  socket.emit(event.event, normalized[0]);
  assert.deepEqual(sent, [[event.event, normalized[0]]]);
  const rejected = socket.emit(event.event, {
    ...event.payload,
    userId: 'private-fixture-id',
    raw: { private: 'must drop' },
    settings: { private: 'must drop' }
  });
  assert.equal(rejected, false);
  assert.equal(sent.length, 1);
  assert.doesNotMatch(JSON.stringify(sent), /private-fixture-id|must drop/);

  assert.equal(projectViewerXpAvatarUrl('http://p16-sign.tiktokcdn.com/avatar.png'), null);
});
