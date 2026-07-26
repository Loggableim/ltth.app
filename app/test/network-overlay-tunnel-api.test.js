'use strict';

const express = require('express');
const request = require('supertest');
const {
  createPublicOverlayMiddleware
} = require('../modules/public-overlay-access');
const {
  registerOverlayTunnelRoutes
} = require('../modules/overlay-tunnel-routes');

function createHarness(managerOverrides = {}) {
  const networkManager = {
    ensureOverlayQuickTunnel: jest.fn().mockResolvedValue({
      tunnelURL: 'https://quiet-river.trycloudflare.com',
      reused: false
    }),
    stopOverlayQuickTunnel: jest.fn(),
    ...managerOverrides
  };
  const app = express();
  app.use(createPublicOverlayMiddleware({ logger: { warn() {} } }));
  app.use(express.json());
  registerOverlayTunnelRoutes({
    app,
    networkManager,
    getPort: () => 3000,
    apiLimiter: (_req, _res, next) => next(),
    logger: { info() {}, warn() {}, error() {} }
  });
  return { app, networkManager };
}

describe('overlay Quick Tunnel API', () => {
  test('rejects a missing overlayURL before starting cloudflared', async () => {
    const { app, networkManager } = createHarness();

    const response = await request(app)
      .post('/api/network/overlay-tunnel/ensure')
      .set('Host', '127.0.0.1:3000')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      code: 'OVERLAY_URL_REQUIRED',
      error: 'Overlay URL is required'
    });
    expect(networkManager.ensureOverlayQuickTunnel).not.toHaveBeenCalled();
  });

  test('rejects an unregistered local URL before starting cloudflared', async () => {
    const { app, networkManager } = createHarness();

    const response = await request(app)
      .post('/api/network/overlay-tunnel/ensure')
      .set('Host', '127.0.0.1:3000')
      .send({ overlayURL: 'http://127.0.0.1:3000/dashboard.html' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('OVERLAY_URL_NOT_REGISTERED');
    expect(networkManager.ensureOverlayQuickTunnel).not.toHaveBeenCalled();
  });

  test('starts once and returns a server-built public URL', async () => {
    const { app, networkManager } = createHarness();

    const response = await request(app)
      .post('/api/network/overlay-tunnel/ensure')
      .set('Host', '127.0.0.1:3000')
      .send({
        overlayURL: 'http://localhost:3000/goals/overlay?id=goal-7'
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      tunnelURL: 'https://quiet-river.trycloudflare.com',
      publicURL: 'https://quiet-river.trycloudflare.com/goals/overlay?id=goal-7',
      reused: false
    });
    expect(networkManager.ensureOverlayQuickTunnel).toHaveBeenCalledWith(3000);
  });

  test('reports reused state from the shared tunnel lifecycle', async () => {
    const { app } = createHarness({
      ensureOverlayQuickTunnel: jest.fn().mockResolvedValue({
        tunnelURL: 'https://quiet-river.trycloudflare.com',
        reused: true
      })
    });

    const response = await request(app)
      .post('/api/network/overlay-tunnel/ensure')
      .set('Host', 'localhost:3000')
      .send({
        overlayURL: 'http://localhost:3000/animation-overlay.html'
      });

    expect(response.body.reused).toBe(true);
  });

  test('returns a retryable bounded error when installation or startup fails', async () => {
    const failure = Object.assign(
      new Error('C:\\Users\\private\\runtime raw cloudflared output'),
      { code: 'OVERLAY_TUNNEL_INSTALL_FAILED' }
    );
    const { app } = createHarness({
      ensureOverlayQuickTunnel: jest.fn().mockRejectedValue(failure)
    });

    const response = await request(app)
      .post('/api/network/overlay-tunnel/ensure')
      .set('Host', '127.0.0.1:3000')
      .send({
        overlayURL: 'http://127.0.0.1:3000/animation-overlay.html'
      });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      code: 'OVERLAY_TUNNEL_INSTALL_FAILED',
      error: 'Quick Tunnel could not be prepared. Retry the copy action.'
    });
    expect(JSON.stringify(response.body)).not.toContain('C:\\Users');
  });

  test('stops the overlay tunnel idempotently', async () => {
    const { app, networkManager } = createHarness();

    const response = await request(app)
      .post('/api/network/overlay-tunnel/stop')
      .set('Host', '127.0.0.1:3000');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(networkManager.stopOverlayQuickTunnel).toHaveBeenCalledTimes(1);
  });

  test.each([
    '/api/network/overlay-tunnel/ensure',
    '/api/network/overlay-tunnel/stop'
  ])('denies management endpoint %s through a Quick Tunnel host', async pathname => {
    const { app } = createHarness();

    const response = await request(app)
      .post(pathname)
      .set('Host', 'quiet-river.trycloudflare.com')
      .send({
        overlayURL: 'http://127.0.0.1:3000/animation-overlay.html'
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });
});
