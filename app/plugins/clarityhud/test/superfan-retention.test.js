'use strict';

const ClarityHUDBackend = require('../backend/api');
const fs = require('fs');
const path = require('path');
const { retainRecentSuperFanEvents, SUPERFAN_HISTORY_TTL_MS } = require('../lib/superfan-retention');
const { projectClarityStateResponse } = require('../../../modules/public-overlay-payload-projection');

describe('ClarityHUD SuperFan DTO retention', () => {
  test('stores only bounded display fields in memory and clears them on cleanup', async () => {
    const api = {
      emit: jest.fn(),
      log: jest.fn(),
      setConfig: jest.fn(async () => {}),
      getSocketIO: jest.fn(() => ({}))
    };
    const backend = new ClarityHUDBackend(api);
    backend.settings.full.maxLines = 2;
    const privateInput = {
      eventType: 'superfan',
      displayName: 'Fixture Viewer',
      level: 4,
      profilePictureUrl: 'https://p16-sign.tiktokcdn.com/fixture.jpg',
      userId: 'synthetic-private-id',
      raw: { userId: 'synthetic-private-id', secret: 'synthetic-raw-payload' }
    };

    await backend.handleSuperFanDisplayEvent(privateInput);
    await backend.handleSuperFanDisplayEvent({ ...privateInput, displayName: 'Second Fixture' });
    await backend.handleSuperFanDisplayEvent({ ...privateInput, displayName: 'Newest Fixture' });

    expect(backend.eventQueues['superfan-display']).toHaveLength(2);
    expect(backend.eventQueues['superfan-display'].map(event => event.displayName)).toEqual([
      'Newest Fixture', 'Second Fixture'
    ]);
    expect(backend.eventQueues['superfan-display'][0]).toEqual({
      type: 'superfan-display',
      timestamp: expect.any(Number),
      eventType: 'superfan',
      displayName: 'Newest Fixture',
      level: 4,
      profilePictureUrl: 'https://p16-sign.tiktokcdn.com/fixture.jpg'
    });
    expect(JSON.stringify(backend.eventQueues['superfan-display'])).not.toContain('synthetic-private-id');
    expect(JSON.stringify(backend.eventQueues['superfan-display'])).not.toContain('synthetic-raw-payload');
    expect(JSON.stringify(api.emit.mock.calls)).not.toContain('synthetic-private-id');
    expect(JSON.stringify(api.emit.mock.calls)).not.toContain('synthetic-raw-payload');
    expect(JSON.stringify(api.log.mock.calls)).not.toContain('Fixture Viewer');
    expect(JSON.stringify(api.log.mock.calls)).not.toContain('synthetic-private-id');

    await backend.cleanup();

    expect(backend.eventQueues['superfan-display']).toEqual([]);
    expect(JSON.stringify(api.setConfig.mock.calls)).not.toContain('Fixture Viewer');
    expect(JSON.stringify(api.setConfig.mock.calls)).not.toContain('synthetic-private-id');
  });

  test('caps SuperFan history at 500 when persisted maxLines is invalidly large', async () => {
    const backend = new ClarityHUDBackend({
      emit: jest.fn(),
      log: jest.fn()
    });
    backend.settings.full.maxLines = Number.MAX_SAFE_INTEGER;

    for (let index = 0; index < 503; index += 1) {
      await backend.handleSuperFanDisplayEvent({
        eventType: 'superfan',
        displayName: `Fixture ${index}`
      });
    }

    expect(backend.eventQueues['superfan-display']).toHaveLength(500);
    expect(backend.eventQueues['superfan-display'][0].displayName).toBe('Fixture 502');
    expect(backend.eventQueues['superfan-display'][499].displayName).toBe('Fixture 3');
  });

  test('does not pass initial display history to browser debug logging', () => {
    const overlayPath = path.join(__dirname, '..', 'overlays', 'full.js');
    const source = fs.readFileSync(overlayPath, 'utf8');
    expect(source).not.toMatch(/HUD_LOG\.debug\(['"]Initial state loaded:['"],\s*STATE\.events\)/);
  });

  test('expires entries older than ten minutes at enqueue and every state output, retaining the exact boundary', async () => {
    const now = new Date('2026-10-08T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const routes = new Map();
    const api = {
      emit: jest.fn(),
      log: jest.fn(),
      setConfig: jest.fn(async () => {}),
      registerRoute: jest.fn((method, route, handler) => routes.set(`${method.toLowerCase()} ${route}`, handler))
    };
    const backend = new ClarityHUDBackend(api);
    backend.settings.full.maxLines = 500;
    backend.registerRoutes();
    const makeQueueEvent = (displayName, timestamp) => ({
      type: 'superfan-display', timestamp, eventType: 'superfan', displayName
    });

    try {
      backend.eventQueues['superfan-display'] = [
        makeQueueEvent('expired by one millisecond', now.getTime() - SUPERFAN_HISTORY_TTL_MS - 1),
        makeQueueEvent('exactly ten minutes old', now.getTime() - SUPERFAN_HISTORY_TTL_MS)
      ];
      await backend.handleSuperFanDisplayEvent({ eventType: 'superfan', displayName: 'new event' });
      expect(backend.eventQueues['superfan-display'].map(event => event.displayName)).toEqual([
        'new event', 'exactly ten minutes old'
      ]);

      backend.eventQueues['superfan-display'].push(
        makeQueueEvent('stale before state response', now.getTime() - SUPERFAN_HISTORY_TTL_MS - 1)
      );
      const stateHandler = routes.get('get /api/clarityhud/state/:dock');
      const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; }
      };
      await stateHandler({ params: { dock: 'full' } }, res);

      expect(res.body.events['superfan-display'].map(event => event.displayName)).toEqual([
        'new event', 'exactly ten minutes old'
      ]);
      const publicState = projectClarityStateResponse('full', res.body);
      expect(publicState.events['superfan-display'].map(event => event.displayName)).toEqual([
        'new event', 'exactly ten minutes old'
      ]);
      for (const event of publicState.events['superfan-display']) {
        expect(Object.keys(event).sort()).toEqual(['displayName', 'eventType']);
        expect(event).not.toHaveProperty('type');
        expect(event).not.toHaveProperty('timestamp');
      }
      expect(retainRecentSuperFanEvents([
        makeQueueEvent('expired', now.getTime() - SUPERFAN_HISTORY_TTL_MS - 1),
        makeQueueEvent('boundary', now.getTime() - SUPERFAN_HISTORY_TTL_MS)
      ]).map(event => event.displayName)).toEqual(['boundary']);
    } finally {
      jest.useRealTimers();
    }
  });
});
