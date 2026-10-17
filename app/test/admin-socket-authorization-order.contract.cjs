'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createAdminSocketAuthorization } = require('../modules/admin-socket-authorization');
const { protectPublicSocket } = require('../modules/public-overlay-access');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function createSocket({ address = '192.0.2.40', auth = {}, headers = {} } = {}) {
  const packetMiddlewares = [];
  const outbound = [];
  return {
    handshake: { address, auth, headers },
    data: {},
    outbound,
    join() {},
    use(middleware) { packetMiddlewares.push(middleware); },
    emit(event, payload) { outbound.push([event, payload]); },
    packetMiddlewares
  };
}

function runMiddleware(middleware, socket) {
  return new Promise((resolve, reject) => {
    middleware(socket, error => error ? reject(error) : resolve());
  });
}

test('server installs public projection and admin authorization before the connection handler', () => {
  const publicPolicy = serverSource.indexOf('attachPublicSocketPolicy({ io, logger });');
  const adminAuthorization = serverSource.indexOf('io.use(createAdminSocketAuthorization({ logger }));');
  const connectionHandler = serverSource.indexOf("io.on('connection', (socket) => {");

  assert.notEqual(publicPolicy, -1);
  assert.notEqual(adminAuthorization, -1);
  assert.notEqual(connectionHandler, -1);
  assert.ok(publicPolicy < adminAuthorization);
  assert.ok(adminAuthorization < connectionHandler);
});

for (const [label, auth] of [['missing token', {}], ['invalid token', { adminToken: 'wrong-fixture-token' }]]) {
  test(`remote sockets with ${label} fail before connection work can emit private state`, async () => {
    const socket = createSocket({ auth });
    let connectionEntered = false;
    const accept = async () => {
      await runMiddleware(createAdminSocketAuthorization({ token: 'fixture-admin-token' }), socket);
      connectionEntered = true;
      socket.emit('init:state', { privateFixture: true });
    };

    await assert.rejects(
      accept(),
      { data: { code: 'SOCKET_ADMIN_AUTH_REQUIRED' } }
    );
    assert.equal(connectionEntered, false);
    assert.deepEqual(socket.outbound, []);
  });
}

test('remote admin with a valid central token passes the connection gate', async () => {
  const socket = createSocket({ auth: { adminToken: 'fixture-admin-token' } });
  await runMiddleware(createAdminSocketAuthorization({ token: 'fixture-admin-token' }), socket);
  assert.equal(socket.data.ltthSocketAccess, 'admin');
});

test('loopback remains available without a token', async () => {
  const socket = createSocket({ address: '::1' });
  await runMiddleware(createAdminSocketAuthorization({ token: 'fixture-admin-token' }), socket);
  assert.equal(socket.data.ltthSocketAccess, 'loopback-admin');
});

test('QuickTunnel keeps the public projection and suppresses unprojected global state', async () => {
  const socket = createSocket({
    headers: { host: 'fixture.trycloudflare.com' }
  });
  const pluginReleasePolicy = {
    getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true, policyInvalid: false }),
    isClosedBetaId: () => false
  };

  protectPublicSocket({ socket, pluginReleasePolicy });
  await runMiddleware(createAdminSocketAuthorization({ token: 'fixture-admin-token' }), socket);
  socket.emit('musicbot:now-playing', {
    title: 'Fixture Track',
    id: 'private-track-id',
    playbackId: 'private-playback-id',
    url: 'https://private.invalid/stream',
    requesterAvatar: 'https://images.invalid/avatar.png'
  });
  socket.emit('init:state', { privateFixture: true });

  assert.equal(socket.data.ltthSocketAccess, 'public-overlay');
  assert.deepEqual(socket.outbound, [['musicbot:now-playing', {
    title: 'Fixture Track',
    requesterAvatar: 'https://images.invalid/avatar.png'
  }]]);
  assert.doesNotMatch(JSON.stringify(socket.outbound), /private-track-id|private-playback-id|private\.invalid\/stream/);
});
