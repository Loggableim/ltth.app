'use strict';

const express = require('express');
const request = require('supertest');
const {
  normalizeHostname,
  isQuickTunnelHost,
  isQuickTunnelRequest,
  createPublicOverlayMiddleware,
  protectPublicSocket
} = require('../modules/public-overlay-access');

function createApp() {
  const app = express();
  app.use(createPublicOverlayMiddleware({
    logger: { warn: jest.fn() }
  }));
  app.use(express.json());
  app.get('/dashboard.html', (_req, res) => {
    res.type('html').send('<h1>Dashboard</h1>');
  });
  app.get('/api/weather/config', (_req, res) => {
    res.json({
      enabled: true,
      apiKey: 'must-not-leak',
      nested: { accessToken: 'must-not-leak', intensity: 0.7 }
    });
  });
  app.get('/api/stable-overlay-routing/status', (_req, res) => {
    res.json({ connected: true, routeKey: 'must-stay-local' });
  });
  app.get('/api/stable-overlay-routing/account', (_req, res) => {
    res.json({ username: 'must-stay-local' });
  });
  app.post('/api/game-engine/manual/move', (req, res) => {
    res.json({ accepted: true, move: req.body.move });
  });
  return app;
}

describe('public overlay hostname classification', () => {
  test.each([
    ['Quiet-River.trycloudflare.com', 'quiet-river.trycloudflare.com'],
    ['quiet-river.trycloudflare.com:443', 'quiet-river.trycloudflare.com']
  ])('normalizes %s', (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });

  test.each([
    'quiet-river.trycloudflare.com',
    'a.trycloudflare.com'
  ])('classifies valid Quick Tunnel host %s', hostname => {
    expect(isQuickTunnelHost(hostname)).toBe(true);
  });

  test.each([
    'trycloudflare.com',
    'quiet-river.trycloudflare.com.evil.example',
    'nested.quiet-river.trycloudflare.com',
    'overlay.ltth.app',
    'r-4m7k9p2x.ltth.app',
    'public.example.com',
    'localhost',
    ''
  ])('does not classify lookalike host %s', hostname => {
    expect(isQuickTunnelHost(hostname)).toBe(false);
  });

  test('classifies solely from the exact Host header', () => {
    expect(isQuickTunnelRequest({
      headers: {
        host: 'quiet-river.trycloudflare.com',
        'x-forwarded-host': 'overlay.ltth.app'
      }
    })).toBe(true);
    expect(isQuickTunnelRequest({
      headers: {
        host: 'overlay.ltth.app',
        'x-forwarded-host': 'quiet-river.trycloudflare.com'
      }
    })).toBe(false);
  });
});

describe('public overlay Express middleware', () => {
  test('leaves localhost routes unchanged', async () => {
    const response = await request(createApp())
      .get('/dashboard.html')
      .set('Host', '127.0.0.1:3000');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Dashboard');
  });

  test('allows a registered route and redacts credential-shaped JSON keys', async () => {
    const response = await request(createApp())
      .get('/api/weather/config')
      .set('Host', 'quiet-river.trycloudflare.com');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: true,
      nested: { intensity: 0.7 }
    });
  });

  test('denies game-control writes publicly while preserving the local route', async () => {
    const publicResponse = await request(createApp())
      .post('/api/game-engine/manual/move')
      .set('Host', 'quiet-river.trycloudflare.com')
      .send({ move: 'A1' });
    const localResponse = await request(createApp())
      .post('/api/game-engine/manual/move')
      .set('Host', '127.0.0.1:3000')
      .send({ move: 'A1' });

    expect(publicResponse.status).toBe(404);
    expect(publicResponse.body).toEqual({ error: 'Not found' });
    expect(localResponse.status).toBe(200);
    expect(localResponse.body).toEqual({ accepted: true, move: 'A1' });
  });

  test.each([
    '/api/stable-overlay-routing/status',
    '/api/stable-overlay-routing/account'
  ])('keeps local stable-routing management path %s off the public surface', async pathname => {
    const publicResponse = await request(createApp())
      .get(pathname)
      .set('Host', 'quiet-river.trycloudflare.com');
    const localResponse = await request(createApp())
      .get(pathname)
      .set('Host', '127.0.0.1:3000');

    expect(publicResponse.status).toBe(404);
    expect(publicResponse.body).toEqual({ error: 'Not found' });
    expect(localResponse.status).toBe(200);
    expect(localResponse.body).not.toEqual({ error: 'Not found' });
  });

  test.each([
    '/dashboard.html',
    '/api/network/config',
    '/plugins/game-engine/ui.html',
    '/does-not-exist'
  ])('returns the same neutral 404 for denied public path %s', async pathname => {
    const response = await request(createApp())
      .get(pathname)
      .set('Host', 'quiet-river.trycloudflare.com');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  test.each([
    'overlay.ltth.app',
    'r-4m7k9p2x.ltth.app',
    'public.example.com'
  ])('does not apply the local public-surface policy to non-Quick-Tunnel Host %s', async host => {
    const response = await request(createApp())
      .get('/dashboard.html')
      .set('Host', host)
      .set('X-Forwarded-Host', 'quiet-river.trycloudflare.com');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Dashboard');
  });

  test('rejects method override headers on a public host', async () => {
    const response = await request(createApp())
      .get('/api/weather/config')
      .set('Host', 'quiet-river.trycloudflare.com')
      .set('X-HTTP-Method-Override', 'DELETE');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  test('uses Host instead of X-Forwarded-Host for classification', async () => {
    const localResponse = await request(createApp())
      .get('/dashboard.html')
      .set('Host', '127.0.0.1:3000')
      .set('X-Forwarded-Host', 'quiet-river.trycloudflare.com');
    const publicResponse = await request(createApp())
      .get('/dashboard.html')
      .set('Host', 'quiet-river.trycloudflare.com')
      .set('X-Forwarded-Host', '127.0.0.1:3000');

    expect(localResponse.status).toBe(200);
    expect(publicResponse.status).toBe(404);
  });
});

describe('public overlay socket protection', () => {
  function createSocket(host, forwardedHost, origin) {
    const socket = {
      handshake: {
        headers: {
          host,
          ...(forwardedHost ? { 'x-forwarded-host': forwardedHost } : {}),
          ...(origin ? { origin } : {})
        }
      },
      data: {},
      join: jest.fn(),
      use: jest.fn(handler => {
        socket.incomingMiddleware = handler;
      }),
      emit: jest.fn(() => true)
    };
    return socket;
  }

  test('limits incoming and direct outgoing events for a public socket', () => {
    const logger = { warn: jest.fn() };
    const socket = createSocket(
      'quiet-river.trycloudflare.com',
      'overlay.ltth.app',
      'https://quiet-river.trycloudflare.com'
    );
    const originalEmit = socket.emit;

    protectPublicSocket({ socket, logger });

    expect(socket.data.publicQuickTunnel).toBe(true);
    expect(socket.join).toHaveBeenCalledWith('__ltth_public_quick_tunnel__');

    const registeredNext = jest.fn();
    socket.incomingMiddleware(['weather:client-ready', { renderer: 'overlay' }], registeredNext);
    expect(registeredNext).toHaveBeenCalledWith();

    const deniedNext = jest.fn();
    const secretPayload = { token: 'never log this' };
    socket.incomingMiddleware(['admin:reload', secretPayload], deniedNext);
    expect(deniedNext.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(logger.warn.mock.calls.flat().join(' ')).not.toContain('never log this');

    expect(socket.emit('weather:trigger', { intensity: 1 })).toBe(true);
    expect(socket.emit('admin:settings-updated', secretPayload)).toBe(false);
    expect(originalEmit).toHaveBeenCalledTimes(1);
    const warningText = logger.warn.mock.calls.flat().join(' ');
    expect(warningText).not.toContain('quiet-river.trycloudflare.com');
    expect(warningText).not.toContain(
      'https://quiet-river.trycloudflare.com'
    );
    expect(warningText).not.toContain('admin:reload');
    expect(warningText).not.toContain('admin:settings-updated');
  });

  test.each([
    '127.0.0.1:3000',
    'overlay.ltth.app',
    'r-4m7k9p2x.ltth.app',
    'public.example.com'
  ])('does not restrict non-Quick-Tunnel socket Host %s', host => {
    const socket = createSocket(host, 'quiet-river.trycloudflare.com');
    const originalEmit = socket.emit;

    protectPublicSocket({ socket, logger: { warn: jest.fn() } });

    expect(socket.data.publicQuickTunnel).toBe(false);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.use).not.toHaveBeenCalled();
    expect(socket.emit).toBe(originalEmit);
  });
});
