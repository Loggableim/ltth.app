'use strict';

const express = require('express');
const request = require('supertest');
const SidekickPlugin = require('../plugins/sidekick/main');
const { createPublicOverlayMiddleware } = require('../modules/public-overlay-access');

describe('Sidekick public events HTTP contract', () => {
  test('serves only bounded projected chat/gift rows and denies public writes', async () => {
    const sourceEvents = [
      ...Array.from({ length: 6 }, (_, index) => ({
        type: 'chat', ts: index, uid: `private-user-${index}`, nickname: `Viewer ${index}`,
        payload: { comment: `Fixture comment ${index}`, accessToken: 'synthetic-secret' }, databaseRowId: index
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        type: 'gift', ts: index + 10, uid: `private-gifter-${index}`, nickname: `Gifter ${index}`,
        payload: { giftName: `Fixture gift ${index}`, coinValue: 1000 }, databaseRowId: index + 10
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        type: 'follow', ts: index + 20, uid: `private-follower-${index}`, payload: { raw: 'must not be displayed' }
      }))
    ];
    const eventBus = { getRecentEvents: jest.fn(() => sourceEvents) };
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    const api = {
      getSocketIO: () => ({ emit: jest.fn(), to: () => ({ emit: jest.fn() }) }),
      getDatabase: () => ({}),
      log: jest.fn(),
      registerRoute: (method, routePath, handler) => app[method](routePath, handler)
    };
    const plugin = new SidekickPlugin(api);
    plugin.eventBus = eventBus;
    plugin._registerRoutes();

    const publicResponse = await request(app)
      .get('/api/sidekick/public-events?limit=999999')
      .set('Host', 'quiet-river.trycloudflare.com');
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.events).toHaveLength(10);
    expect(publicResponse.body.events.every(event => ['chat', 'gift'].includes(event.type))).toBe(true);
    expect(publicResponse.body.events[0]).toMatchObject({
      type: 'chat', nickname: 'Viewer 1', payload: { comment: 'Fixture comment 1', commentTruncated: false }
    });
    expect(publicResponse.body.events.at(-1)).toMatchObject({
      type: 'gift', nickname: 'Gifter 4', payload: { giftName: 'Fixture gift 4' }
    });
    expect(JSON.stringify(publicResponse.body)).not.toMatch(/private-user|private-gifter|private-follower|databaseRowId|coinValue|accessToken|synthetic-secret|must not be displayed/);
    expect(eventBus.getRecentEvents).toHaveBeenCalledWith(null, 40);

    const deniedWrite = await request(app)
      .post('/api/sidekick/public-events')
      .set('Host', 'quiet-river.trycloudflare.com')
      .send({ events: sourceEvents });
    expect(deniedWrite.status).toBe(404);
    expect(eventBus.getRecentEvents).toHaveBeenCalledTimes(1);
  });
});
