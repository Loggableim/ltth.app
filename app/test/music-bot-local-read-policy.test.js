'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createMusicBotLocalReadPolicy, isLoopbackRemoteAddress, isMusicBotConfigPath } = require('../modules/music-bot-local-read-policy');

function invoke({ method = 'GET', originalUrl = '/api/plugins/music-bot/queue', remoteAddress = '192.0.2.9', headers = {} } = {}) {
  const middleware = createMusicBotLocalReadPolicy();
  let nextCalled = false;
  let response = null;
  const res = {
    status(code) { response = { status: code }; return this; },
    json(body) { response = { ...response, body }; return response; }
  };
  middleware({ method, originalUrl, headers, socket: { remoteAddress } }, res, () => { nextCalled = true; });
  return { nextCalled, response };
}

test('remote data GET/HEAD are denied regardless of token headers', () => {
  for (const method of ['GET', 'HEAD']) {
    for (const headers of [{}, { authorization: 'Bearer test-token' }, { 'x-ltth-admin-token': 'test-token' }]) {
      const result = invoke({ method, remoteAddress: '192.0.2.9', headers });
      expect(result.nextCalled).toBe(false);
      expect(result.response.status).toBe(403);
      expect(result.response.body.code).toBe('MUSIC_BOT_LOCAL_READS_ONLY');
      expect(JSON.stringify(result.response)).not.toContain('test-token');
    }
  }
});

test('direct IPv4, IPv6, and IPv4-mapped IPv6 loopback pass', () => {
  for (const address of ['127.0.0.1', '127.22.3.4', '::1', '[::1]', '::ffff:127.0.0.1', '::FFFF:127.0.0.1', '::ffff:7f00:1']) {
    expect(isLoopbackRemoteAddress(address)).toBe(true);
    expect(invoke({ remoteAddress: address }).nextCalled).toBe(true);
  }
  expect(isLoopbackRemoteAddress('192.168.1.4')).toBe(false);
  expect(isLoopbackRemoteAddress('2001:db8::1')).toBe(false);
  expect(isLoopbackRemoteAddress('::ffff:c0a8:104')).toBe(false);
});

test('forwarding headers defeat loopback spoofing', () => {
  for (const header of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto']) {
    const result = invoke({ remoteAddress: '127.0.0.1', headers: { [header]: '127.0.0.1' } });
    expect(result.nextCalled).toBe(false);
    expect(result.response.status).toBe(403);
  }
});

test('config remains under its existing route-local policy and writes defer to AdminAuth', () => {
  expect(isMusicBotConfigPath('/api/plugins/music-bot/config?x=1')).toBe(true);
  expect(isMusicBotConfigPath('/api/plugins/music-bot/config/')).toBe(true);
  expect(invoke({ originalUrl: '/api/plugins/music-bot/config', remoteAddress: '192.0.2.9' }).nextCalled).toBe(true);
  expect(invoke({ method: 'POST', remoteAddress: '192.0.2.9' }).nextCalled).toBe(true);
  const pluginSource = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/main.js'), 'utf8');
  const configHandler = pluginSource.match(/registerRoute\('get', '\/api\/plugins\/music-bot\/config',[\s\S]*?\n    \}\);/);
  expect(configHandler).toBeTruthy();
  expect(configHandler[0]).toMatch(/!isLoopbackAddress\(getRequestAddress\(req\)\)\s*\|\|\s*hasForwardingHeaders\(req\)/);
  expect(configHandler[0]).toMatch(/MUSIC_BOT_CONFIG_LOCAL_ONLY/);
});

test('server mounts the prefix guard after QuickTunnel policy and before plugin routes, without adding a tunnel exception', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const overlayIndex = serverSource.indexOf("app.use(createPublicOverlayMiddleware({ logger }));");
  const localReadIndex = serverSource.indexOf("app.use('/api/plugins/music-bot', createMusicBotLocalReadPolicy());");
  const adminIndex = serverSource.indexOf("app.use('/api', (req, res, next) => {");
  expect(overlayIndex >= 0 && localReadIndex > overlayIndex && adminIndex > localReadIndex).toBe(true);
  const routeSource = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/main.js'), 'utf8');
  const apiGets = [...routeSource.matchAll(/registerRoute\('get', '(\/api\/plugins\/music-bot\/[^']+)'/g)].map(match => match[1]);
  expect(apiGets).toHaveLength(17);
  expect(apiGets).toContain('/api/plugins/music-bot/config');
  const overlaySource = fs.readFileSync(path.join(__dirname, '../modules/public-overlay-access.js'), 'utf8');
  expect(overlaySource).not.toMatch(/\/api\/plugins\/music-bot/);
  for (const uiPath of ['/plugins/music-bot/ui', '/plugins/music-bot/assets/ui-style.css', '/plugins/music-bot/assets/ui.js', '/plugins/music-bot/overlay']) {
    expect(routeSource).toContain(`'${uiPath}'`);
  }
});
