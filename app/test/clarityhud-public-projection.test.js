'use strict';

const express = require('express');
const request = require('supertest');
const ClarityHUDBackend = require('../plugins/clarityhud/backend/api');
const {
  projectPublicOverlayPayload,
  projectClaritySettingsResponse,
  projectClarityStateResponse
} = require('../modules/public-overlay-payload-projection');
const { createPublicOverlayMiddleware, protectPublicSocket } = require('../modules/public-overlay-access');

function createSocket(host) {
  return {
    handshake: { headers: { host } },
    data: {},
    join: jest.fn(),
    use: jest.fn(),
    emit: jest.fn(() => true)
  };
}

describe('ClarityHUD public projections', () => {
  test('live chat and state history correlate by raw object while hiding platform identity', async () => {
    const api = { emit: jest.fn(), log: jest.fn() };
    const backend = new ClarityHUDBackend(api);
    const fixture = {
      username: 'viewer_handle', nickname: 'Viewer Nick', message: 'hello from fixture',
      userId: 'platform-id-must-not-leak', isModerator: true, isSubscriber: true,
      teamMemberLevel: 4, debugExtra: 'private-extra'
    };
    await backend.handleChatEvent(fixture);
    const localLive = api.emit.mock.calls.find(([event]) => event === 'clarityhud.update.chat')[1];
    const history = backend.eventQueues.chat[0];
    expect(history.raw).toBe(localLive.raw);

    const publicLive = projectPublicOverlayPayload('clarityhud.update.chat', localLive);
    const publicState = projectClarityStateResponse('chat', {
      success: true, dock: 'chat', settings: backend.settings.chat, events: { chat: [history] }
    });
    expect(publicState).not.toBeNull();
    const liveToken = publicLive.raw.userId;
    const historyToken = publicState.events.chat[0].raw.userId;
    expect(liveToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(historyToken).toBe(liveToken);
    expect(publicLive.raw.uniqueId).toBe('viewer_handle');
    expect(publicLive.raw).not.toHaveProperty('debugExtra');
    expect(JSON.stringify(publicLive)).not.toContain('platform-id-must-not-leak');

    const cloned = projectPublicOverlayPayload('clarityhud.update.chat', {
      ...localLive, raw: { ...localLive.raw }
    });
    expect(cloned.raw.userId).not.toBe(liveToken);
    expect(localLive.raw.userId).toBe('platform-id-must-not-leak');
  });

  test('settings projection keeps supported visual fields and neutralizes multi-stream identities', () => {
    const backend = new ClarityHUDBackend({ emit: jest.fn(), log: jest.fn() });
    const multi = {
      ...backend.settings.multi,
      streams: [{ enabled: true, username: 'secret_handle', displayName: 'Secret Name', textColor: '#112233', bgColor: '#223344', accentColor: '#334455' }],
      internalAdminNote: 'must-not-leak'
    };
    const projected = projectClaritySettingsResponse('multi', { success: true, dock: 'multi', settings: multi });
    expect(projected.settings.streams[0]).toMatchObject({ enabled: true, username: 'configured', displayName: '' });
    expect(projected.settings).not.toHaveProperty('internalAdminNote');
    expect(JSON.stringify(projected)).not.toContain('secret_handle');
    expect(projectPublicOverlayPayload('clarityhud.settings.chat', {
      ...backend.settings.chat, privateOption: 'must-not-leak'
    })).not.toHaveProperty('privateOption');
  });

  test('multi events use neutral source labels and remove raw connector payloads', () => {
    const api = { emit: jest.fn(), log: jest.fn() };
    const backend = new ClarityHUDBackend(api);
    const raw = { uniqueId: 'stream-viewer', nickname: 'Viewer', comment: 'hello', userId: 'stream-platform-id', private: 'secret' };
    backend.handleMultiStreamChat(raw, 1, 'stream2', 'private channel name', {
      textColor: '#112233', bgColor: '#223344', accentColor: '#334455'
    });
    const localEvent = api.emit.mock.calls[0][1];
    const publicEvent = projectPublicOverlayPayload('clarityhud:multi:chat', localEvent);
    expect(publicEvent.sourceLabel).toBe('Stream 2');
    expect(publicEvent.raw.userId).not.toBe('stream-platform-id');
    expect(publicEvent.raw).not.toHaveProperty('private');
    expect(JSON.stringify(publicEvent)).not.toContain('private channel name');
    expect(localEvent.raw).toBe(raw);
    expect(localEvent.sourceLabel).toBe('private channel name');
  });

  test('public HTTP settings and history use the same projection, local responses stay unchanged', async () => {
    const backend = new ClarityHUDBackend({ emit: jest.fn(), log: jest.fn() });
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/clarityhud/settings/chat', (_req, res) => res.json({
      success: true, dock: 'chat', settings: { ...backend.settings.chat, apiKey: 'private' }
    }));
    app.get('/api/clarityhud/state/chat', (_req, res) => res.json({
      success: true, dock: 'chat', settings: backend.settings.chat, events: { chat: [] }, internal: 'private'
    }));
    const publicSettings = await request(app).get('/api/clarityhud/settings/chat').set('Host', 'quiet-river.trycloudflare.com');
    const publicState = await request(app).get('/api/clarityhud/state/chat').set('Host', 'quiet-river.trycloudflare.com');
    const localSettings = await request(app).get('/api/clarityhud/settings/chat').set('Host', '127.0.0.1:3000');
    expect(publicSettings.status).toBe(200);
    expect(publicSettings.body.settings).not.toHaveProperty('apiKey');
    expect(publicState.status).toBe(200);
    expect(publicState.body).not.toHaveProperty('internal');
    expect(localSettings.body.settings).toHaveProperty('apiKey', 'private');
  });

  test('public sockets project Clarity events and local sockets keep the producer payload', async () => {
    const publicSocket = createSocket('quiet-river.trycloudflare.com');
    const localSocket = createSocket('127.0.0.1:3000');
    const publicEmit = publicSocket.emit;
    const localEmit = localSocket.emit;
    protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });
    protectPublicSocket({ socket: localSocket, logger: { warn: jest.fn() } });
    const payload = {
      user: { uniqueId: 'handle', nickname: 'Viewer', profilePictureUrl: null, badge: null },
      message: 'fixture', raw: { userId: 'platform-id', username: 'handle', nickname: 'Viewer', message: 'fixture', extra: 'private' }
    };
    publicSocket.emit('clarityhud.update.chat', payload);
    localSocket.emit('clarityhud.update.chat', payload);
    const publicPayload = publicEmit.mock.calls[0][1];
    expect(publicPayload.raw.userId).not.toBe('platform-id');
    expect(publicPayload.raw).not.toHaveProperty('extra');
    expect(localEmit.mock.calls[0][1]).toBe(payload);
  });
});
