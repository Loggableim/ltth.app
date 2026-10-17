'use strict';

const {
  createPublicOverlayMiddleware,
  isQuickTunnelRequest
} = require('../modules/public-overlay-access');
const { isHttpAllowed, normalizePublicPath } = require('../modules/public-overlay-registry');

function runMiddleware(req, jsonPayload = { success: true, config: { apiKey: 'raw-local-secret' } }) {
  const status = jest.fn(function setStatus(code) {
    this.statusCode = code;
    return this;
  });
  const originalJson = jest.fn(function sendJson(payload) {
    this.payload = payload;
    return this;
  });
  const res = { statusCode: 200, payload: undefined, status, json: originalJson };
  const next = jest.fn();
  const logger = { warn: jest.fn() };
  const middleware = createPublicOverlayMiddleware({ logger });
  const result = middleware(req, res, next);
  if (next.mock.calls.length) res.json(jsonPayload);
  return { req, res, next, status, originalJson, logger, result };
}

function request({ host = 'quiet-river.trycloudflare.com', url = '/api/weather/config', method = 'GET', headers = {} } = {}) {
  return { headers: { host, ...headers }, originalUrl: url, url, method };
}

describe('Weather public HTTP context boundary', () => {
  test('requires the actual Quick Tunnel Host; forwarded headers cannot grant or remove local context', () => {
    const local = request({ host: '127.0.0.1:3000', headers: { 'x-forwarded-host': 'quiet-river.trycloudflare.com' } });
    const publicWithMisleadingForwardedHost = request({ headers: { 'x-forwarded-host': '127.0.0.1:3000' } });
    const unknown = request({ host: 'unknown.example.test', headers: { 'x-forwarded-host': 'quiet-river.trycloudflare.com' } });

    expect(isQuickTunnelRequest(local)).toBe(false);
    expect(isQuickTunnelRequest(publicWithMisleadingForwardedHost)).toBe(true);
    expect(isQuickTunnelRequest(unknown)).toBe(false);

    const localRun = runMiddleware(local);
    expect(localRun.next).toHaveBeenCalledTimes(1);
    expect(localRun.originalJson).toHaveBeenCalledWith({ success: true, config: { apiKey: 'raw-local-secret' } });

    const publicRun = runMiddleware(publicWithMisleadingForwardedHost);
    expect(publicRun.next).toHaveBeenCalledTimes(1);
    expect(publicRun.originalJson).toHaveBeenCalledWith({ error: 'Response unavailable' });
    expect(publicRun.res.payload).not.toHaveProperty('config.apiKey');

    const unknownRun = runMiddleware(unknown);
    expect(unknownRun.next).toHaveBeenCalledTimes(1);
    expect(unknownRun.originalJson).toHaveBeenCalledWith({ success: true, config: { apiKey: 'raw-local-secret' } });
  });

  test('keeps a missing Host outside public context and fails closed on malformed public producer data', () => {
    const missingHost = runMiddleware({ headers: {}, originalUrl: '/api/weather/config', url: '/api/weather/config', method: 'GET' });
    expect(missingHost.next).toHaveBeenCalledTimes(1);
    expect(missingHost.originalJson).toHaveBeenCalledWith({ success: true, config: { apiKey: 'raw-local-secret' } });

    const malformedPublic = runMiddleware(request(), { success: true, config: { apiKey: 'must-not-escape' } });
    expect(malformedPublic.next).toHaveBeenCalledTimes(1);
    expect(malformedPublic.status).toHaveBeenCalledWith(500);
    expect(malformedPublic.originalJson).toHaveBeenCalledWith({ error: 'Response unavailable' });
  });

  test('path authorization is query-insensitive but rejects aliases, trailing slash, encoded separators, and wrong methods', () => {
    expect(normalizePublicPath('/api/weather/config?view=overlay')).toBe('/api/weather/config');
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/weather/config?view=overlay' })).toBe(true);
    for (const pathname of [
      '/api/weather/config/',
      '/api/weather//config',
      '/api/weather/config/../config',
      '/api/weather%2fconfig'
    ]) {
      expect(isHttpAllowed({ method: 'GET', pathname })).toBe(false);
    }
    expect(isHttpAllowed({ method: 'POST', pathname: '/api/weather/config' })).toBe(false);
  });

  test('keeps repeated response json calls sanitized under the same request context', () => {
    const valid = {
      success: true,
      config: {
        enabled: true,
        qualityPreset: 'high',
        adaptiveQuality: true,
        maxConcurrentEffects: 4,
        effects: {},
        gamification: { enabled: true, overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: true, showRewardFeed: true } }
      }
    };
    const run = runMiddleware(request(), valid);
    expect(run.next).toHaveBeenCalledTimes(1);
    const first = run.res.json(valid);
    expect(first).toBe(run.res);
    expect(run.originalJson).toHaveBeenCalledTimes(2);
    expect(run.originalJson.mock.calls[1][0]).toEqual(valid);

    run.res.json(valid);
    expect(run.originalJson).toHaveBeenCalledTimes(3);
    expect(run.originalJson.mock.calls[2][0]).toEqual(valid);
  });
});
