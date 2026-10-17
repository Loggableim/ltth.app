'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const {
  LIMITS,
  MAX_KEYS_PER_ROUTE,
  createDashboardRequestLimiters,
  createIpRateLimiter
} = require('../plugins/music-bot/lib/dashboard-request-rate-limit');

function invoke(middleware, { ip = '192.0.2.10', peerAddress = ip, headers = {} } = {}) {
  const response = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    }
  };
  const next = jest.fn();
  middleware({ ip, socket: { remoteAddress: peerAddress }, headers }, response, next);
  return { response, next };
}

describe('Music Bot dashboard IP rate limits', () => {
  test('allows 30 resolver calls and stops the 31st before its handler', () => {
    const { resolve } = createDashboardRequestLimiters();
    const calls = Array.from({ length: 31 }, () => invoke(resolve));

    expect(LIMITS.resolve).toBe(30);
    expect(calls.slice(0, 30).every(({ response, next }) => response.statusCode === 200 && next.mock.calls.length === 1)).toBe(true);
    expect(calls[30].response).toMatchObject({
      statusCode: 429,
      body: { code: 'MUSIC_BOT_RATE_LIMITED' }
    });
    expect(calls[30].next).not.toHaveBeenCalled();
    expect(calls[30].response.headers['retry-after']).toBe('60');
  });

  test('allows 10 dashboard submissions and stops the 11th before its handler', () => {
    const { request: requestLimit } = createDashboardRequestLimiters();
    const calls = Array.from({ length: 11 }, () => invoke(requestLimit));

    expect(LIMITS.request).toBe(10);
    expect(calls.slice(0, 10).every(({ response, next }) => response.statusCode === 200 && next.mock.calls.length === 1)).toBe(true);
    expect(calls[10].response).toMatchObject({
      statusCode: 429,
      body: { code: 'MUSIC_BOT_RATE_LIMITED' }
    });
    expect(calls[10].next).not.toHaveBeenCalled();
  });

  test('keeps route budgets independent and uses one shared IPv4/IPv6 loopback bucket', () => {
    const limits = createDashboardRequestLimiters();
    const loopbackPeers = [
      '127.0.0.1',
      '127.255.255.254',
      '::1',
      '0:0:0:0:0:0:0:1',
      '::ffff:127.0.0.1'
    ];
    for (let index = 0; index < LIMITS.resolve; index += 1) {
      expect(invoke(limits.resolve, { peerAddress: loopbackPeers[index % loopbackPeers.length] }).next).toHaveBeenCalledTimes(1);
    }

    expect(invoke(limits.resolve, { peerAddress: '127.0.0.2' }).response.statusCode).toBe(429);
    for (let index = 0; index < LIMITS.request; index += 1) {
      expect(invoke(limits.request, { peerAddress: loopbackPeers[index % loopbackPeers.length] }).next).toHaveBeenCalledTimes(1);
    }
    expect(invoke(limits.request, { peerAddress: '::1' }).response.statusCode).toBe(429);
    expect(invoke(limits.request, { peerAddress: '192.0.2.200' }).next).toHaveBeenCalledTimes(1);
  });

  test('keys by direct socket peer and ignores req.ip and caller-supplied forwarding headers', () => {
    const { resolve } = createDashboardRequestLimiters();
    const calls = Array.from({ length: LIMITS.resolve + 1 }, (_unused, index) => invoke(resolve, {
      ip: `198.51.100.${index + 1}`,
      peerAddress: '192.0.2.25',
      headers: { 'x-forwarded-for': `203.0.113.${index + 1}` }
    }));

    expect(calls.at(-1).response.statusCode).toBe(429);
    expect(calls.at(-1).next).not.toHaveBeenCalled();
  });

  test('separates direct peers and normalizes IPv4-mapped IPv6 peers', () => {
    const { request: requestLimit } = createDashboardRequestLimiters();
    for (let index = 0; index < LIMITS.request; index += 1) {
      expect(invoke(requestLimit, { peerAddress: '192.0.2.40' }).next).toHaveBeenCalledTimes(1);
    }

    expect(invoke(requestLimit, { peerAddress: '192.0.2.40' }).response.statusCode).toBe(429);
    expect(invoke(requestLimit, { peerAddress: '::ffff:192.0.2.40' }).response.statusCode).toBe(429);
    expect(invoke(requestLimit, { peerAddress: '192.0.2.41' }).next).toHaveBeenCalledTimes(1);
  });

  test('normalizes IPv6 clients to the same /56 and keeps other subnets separate', () => {
    const { resolve } = createDashboardRequestLimiters();
    const addresses = [
      ...Array.from({ length: 15 }, (_unused, index) => `2001:db8:abcd:1200::${index + 1}`),
      ...Array.from({ length: 15 }, (_unused, index) => `2001:db8:abcd:12ff::${index + 1}`)
    ];
    const calls = addresses.map(ip => invoke(resolve, { ip }));

    expect(calls.every(({ response, next }) => response.statusCode === 200 && next.mock.calls.length === 1)).toBe(true);
    const sameSubnetNext = invoke(resolve, { ip: '2001:db8:abcd:12aa::99' });
    expect(sameSubnetNext.response.statusCode).toBe(429);
    expect(sameSubnetNext.next).not.toHaveBeenCalled();
    expect(invoke(resolve, { ip: '2001:db8:abcd:1300::1' }).next).toHaveBeenCalledTimes(1);
  });

  test('resets an expired bucket at 60 seconds', () => {
    let now = 1_000;
    const { request: requestLimit } = createDashboardRequestLimiters({ now: () => now });
    for (let index = 0; index < LIMITS.request; index += 1) invoke(requestLimit);

    expect(invoke(requestLimit).response.statusCode).toBe(429);
    now += 60_000;
    expect(invoke(requestLimit).next).toHaveBeenCalledTimes(1);
  });

  test('bounds each route store and expires keys before admitting a new IP', () => {
    let now = 50;
    const { resolve, request: requestLimit } = createDashboardRequestLimiters({
      maxKeys: 1,
      now: () => now
    });
    expect(MAX_KEYS_PER_ROUTE).toBe(10_000);

    expect(invoke(resolve, { ip: '192.0.2.1' }).next).toHaveBeenCalledTimes(1);
    expect(invoke(resolve, { ip: '192.0.2.2' }).response).toMatchObject({
      statusCode: 429,
      body: { code: 'MUSIC_BOT_RATE_LIMIT_CAPACITY' }
    });
    expect(invoke(requestLimit, { ip: '192.0.2.2' }).next).toHaveBeenCalledTimes(1);

    now += 60_000;
    expect(invoke(resolve, { ip: '192.0.2.2' }).next).toHaveBeenCalledTimes(1);
  });

  test('fails closed when the socket peer is unavailable, even if req.ip and XFF exist', () => {
    const { resolve } = createDashboardRequestLimiters();
    const result = invoke(resolve, {
      ip: '198.51.100.9',
      peerAddress: null,
      headers: { 'x-forwarded-for': '198.51.100.9' }
    });

    expect(result.response).toMatchObject({
      statusCode: 503,
      body: { code: 'MUSIC_BOT_RATE_LIMIT_IP_UNAVAILABLE' }
    });
    expect(result.next).not.toHaveBeenCalled();
  });

  test('ignores XFF even when Express trust proxy=1 changes req.ip', async () => {
    function makeApp(trustProxy) {
      const app = express();
      const seenIps = [];
      app.set('trust proxy', trustProxy);
      app.use((req, _res, next) => {
        seenIps.push(req.ip);
        next();
      });
      app.get('/limit', createIpRateLimiter({ limit: 1 }), (req, res) => res.json({ ip: req.ip }));
      return { app, seenIps };
    }

    const direct = makeApp(false);
    const directFirst = await request(direct.app).get('/limit').set('X-Forwarded-For', '198.51.100.1');
    const directSecond = await request(direct.app).get('/limit').set('X-Forwarded-For', '198.51.100.2');
    expect(directFirst.status).toBe(200);
    expect(directSecond.status).toBe(429);
    expect(direct.seenIps[0]).toBe(direct.seenIps[1]);

    const proxied = makeApp(1);
    const trustedHopFirst = await request(proxied.app).get('/limit').set('X-Forwarded-For', '198.51.100.1');
    const trustedHopSecond = await request(proxied.app).get('/limit').set('X-Forwarded-For', '198.51.100.2');
    expect(trustedHopFirst.status).toBe(200);
    expect(trustedHopSecond.status).toBe(429);
    expect(proxied.seenIps).toEqual(['198.51.100.1', '198.51.100.2']);

    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    expect(serverSource).toContain("if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production')");
    expect(serverSource).toContain("app.set('trust proxy', 1)");
  });
});
