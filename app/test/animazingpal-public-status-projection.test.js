'use strict';

const express = require('express');
const request = require('supertest');
const AnimazingPalPlugin = require('../plugins/animazingpal/main');
const { createPublicOverlayMiddleware } = require('../modules/public-overlay-access');
const { projectAnimazingPalStreamAssistantStatusResponse } = require('../modules/public-overlay-payload-projection');

describe('AnimazingPal Stream Assistant public status projection', () => {
  const fixture = {
    success: true,
    config: { enabled: true, muted: false, overlayUrl: '/admin-only' },
    runtime: {
      diagnostics: {
        processedEvents: 8, respondedEvents: 3, dedupedEvents: 1,
        lastEventResult: { eventType: 'chat', reason: 'answered', checkedAt: 'private', decision: { prompt: 'private' } },
        sourceAccount: 'private'
      },
      sourceStatus: { privateAccount: 'private' }
    },
    analytics: { processedEvents: 8, respondedEvents: 3, dedupedEvents: 1, skippedEvents: 5, sessionStartedAt: 'private' },
    events: [{ eventType: 'chat', reason: 'answered', checkedAt: 'private', decision: { prompt: 'private' } }]
  };

  test('projects the actual status producer to the original HUD fields on Quick Tunnel only', async () => {
    const plugin = Object.create(AnimazingPalPlugin.prototype);
    plugin.config = { brain: { liveHost: { streamAssistant: { enabled: true, muted: false } } } };
    plugin.getLiveHostRuntimeStatus = jest.fn(() => fixture.runtime);
    plugin.getStreamAssistantAnalytics = jest.fn(() => fixture.analytics);
    plugin.getStreamAssistantEvents = jest.fn(() => fixture.events);
    const produced = { success: true, ...plugin.getStreamAssistantStatus() };
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/animazingpal/live-host/stream-assistant/status', (_req, res) => res.json(produced));

    const [publicResponse, localResponse] = await Promise.all([
      request(app).get('/api/animazingpal/live-host/stream-assistant/status').set('Host', 'fixture.trycloudflare.com'),
      request(app).get('/api/animazingpal/live-host/stream-assistant/status').set('Host', '127.0.0.1:3000')
    ]);

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body).toEqual({
      success: true,
      config: { enabled: true, muted: false },
      runtime: { diagnostics: {
        processedEvents: 8, respondedEvents: 3, dedupedEvents: 1,
        lastEventResult: { eventType: 'chat', reason: 'answered' }
      } },
      analytics: { processedEvents: 8, respondedEvents: 3, dedupedEvents: 1 },
      events: [{ eventType: 'chat', reason: 'answered' }]
    });
    expect(JSON.stringify(publicResponse.body)).not.toMatch(/private|prompt|checkedAt|skippedEvents/);
    expect(localResponse.status).toBe(200);
    expect(localResponse.body).toEqual(produced);
    expect(plugin.getLiveHostRuntimeStatus).toHaveBeenCalledTimes(1);
    expect(plugin.getStreamAssistantAnalytics).toHaveBeenCalledTimes(1);
    expect(plugin.getStreamAssistantEvents).toHaveBeenCalledWith(20);
  });

  test('fails closed on malformed counts or event display fields', () => {
    expect(projectAnimazingPalStreamAssistantStatusResponse({
      ...fixture,
      analytics: { ...fixture.analytics, processedEvents: -1 }
    })).toBeNull();
    const safe = projectAnimazingPalStreamAssistantStatusResponse({
      ...fixture,
      events: [{ eventType: 'chat', reason: 'ok', private: 'field'.repeat(200) }]
    });
    expect(safe.events).toEqual([{ eventType: 'chat', reason: 'ok' }]);
    expect(projectAnimazingPalStreamAssistantStatusResponse({
      ...fixture,
      events: [{ eventType: 'x'.repeat(81), reason: 'ok' }]
    })).toBeNull();
  });
});
