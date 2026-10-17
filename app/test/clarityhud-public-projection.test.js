'use strict';

const express = require('express');
const request = require('supertest');
const ClarityHUDBackend = require('../plugins/clarityhud/backend/api');
const claritySettingsSchema = require('../plugins/clarityhud/lib/settings-schema');
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

  test('SuperFan display preference remains local and is omitted from public settings and state', () => {
    const backend = new ClarityHUDBackend({ emit: jest.fn(), log: jest.fn() });
    const localPreference = { ...backend.settings.full, showSuperFans: false };
    const publicSettings = projectClaritySettingsResponse('full', {
      success: true, dock: 'full', settings: localPreference
    });
    const publicState = projectClarityStateResponse('full', {
      success: true, dock: 'full', settings: localPreference,
      events: { 'superfan-display': [] }
    });

    expect(backend.settings.full.showSuperFans).toBe(true);
    expect(localPreference.showSuperFans).toBe(false);
    expect(publicSettings.settings).not.toHaveProperty('showSuperFans');
    expect(publicState.settings).not.toHaveProperty('showSuperFans');
  });

  test('disabled local SuperFan preference suppresses event before it reaches queue or emitter', async () => {
    const api = { emit: jest.fn(), log: jest.fn() };
    const backend = new ClarityHUDBackend(api);
    backend.settings.full.showSuperFans = false;

    await backend.handleSuperFanDisplayEvent({ eventType: 'superfan', displayName: 'Fixture Viewer', level: 2 });

    expect(api.emit).not.toHaveBeenCalled();
    expect(backend.eventQueues['superfan-display']).toHaveLength(0);
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

  test('public HTTP settings and state use the safe projection while local responses stay unchanged', () => {
    const backend = new ClarityHUDBackend({ emit: jest.fn(), log: jest.fn() });
    const full = { ...backend.settings.full, showSuperFans: false };
    const publicSettings = projectClaritySettingsResponse('full', {
      success: true, dock: 'full', settings: full
    });
    const publicState = projectClarityStateResponse('full', {
      success: true, dock: 'full', settings: full, events: { 'superfan-display': [] }
    });
    expect(publicSettings.settings).not.toHaveProperty('showSuperFans');
    expect(publicState.settings).not.toHaveProperty('showSuperFans');
    expect(full.showSuperFans).toBe(false);
  });

  test('public socket projector strips display preference and retains the local producer payload', () => {
    const payload = { ...new ClarityHUDBackend({ emit: jest.fn(), log: jest.fn() }).settings.full, showSuperFans: false };
    const publicPayload = projectPublicOverlayPayload('clarityhud.settings.full', payload);
    expect(publicPayload).not.toHaveProperty('showSuperFans');
    expect(payload.showSuperFans).toBe(false);
  });

  test('all public full settings, state, and socket channels exclude showSuperFans', () => {
    const localFullSettings = { ...claritySettingsSchema.getDefaults('full'), showSuperFans: false };

    const httpSettings = projectClaritySettingsResponse('full', {
      success: true, dock: 'full', settings: localFullSettings
    });
    const httpState = projectClarityStateResponse('full', {
      success: true, dock: 'full', settings: localFullSettings,
      events: { 'superfan-display': [] }
    });
    const socketSettings = projectPublicOverlayPayload('clarityhud.settings.full', localFullSettings);
    const socketChatUpdate = projectPublicOverlayPayload('clarityhud.update.chat', {
      user: { uniqueId: 'fixture-viewer', nickname: 'Fixture Viewer' },
      message: 'synthetic update', showSuperFans: false
    });
    const socketSuperFanUpdate = projectPublicOverlayPayload('clarityhud.update.superfan-display', {
      eventType: 'superfan', displayName: 'Fixture Viewer', showSuperFans: false
    });

    expect(httpSettings.settings).not.toHaveProperty('showSuperFans');
    expect(httpState.settings).not.toHaveProperty('showSuperFans');
    expect(socketSettings).not.toHaveProperty('showSuperFans');
    expect(socketChatUpdate).not.toHaveProperty('showSuperFans');
    expect(socketSuperFanUpdate).toBeNull();
    expect(localFullSettings.showSuperFans).toBe(false);
  });
});
