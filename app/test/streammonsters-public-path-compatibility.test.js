'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const PluginLoader = require('../modules/plugin-loader');
const { PluginAPI } = require('../modules/plugin-loader');
const { mountPluginStaticAliases } = require('../modules/plugin-static-aliases');
const {
  isHttpAllowed,
  isRegisteredEntrypoint
} = require('../modules/public-overlay-registry');

const appRoot = path.resolve(__dirname, '..');
const pluginsDir = path.join(appRoot, 'plugins');

function logger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
}

describe('Stream Monsters 1.12 canonical source identity', () => {
  test('ships only the current source under its canonical directory and manifest id', () => {
    const canonicalDir = path.join(pluginsDir, 'stream-monsters');
    const manifest = JSON.parse(fs.readFileSync(path.join(canonicalDir, 'plugin.json'), 'utf8'));
    const PluginClass = require(path.join(canonicalDir, 'index.js'));

    expect(fs.existsSync(canonicalDir)).toBe(true);
    expect(fs.existsSync(path.join(pluginsDir, 'streamalchemy'))).toBe(false);
    expect(manifest).toEqual(expect.objectContaining({
      id: 'stream-monsters',
      name: 'Stream Monsters',
      version: '1.12.0',
      minLtthVersion: '1.4.2'
    }));
    expect(manifest.icon).toMatch(/^\/plugins\/stream-monsters\//);
    expect(manifest.logo).toMatch(/^\/plugins\/stream-monsters\//);
    expect(PluginClass.name).toBe('StreamMonstersPlugin');
  });

  test('projects dashboard navigation and locale namespaces canonically with legacy fallback', () => {
    const dashboard = fs.readFileSync(path.join(appRoot, 'public', 'dashboard.html'), 'utf8');
    const navigation = fs.readFileSync(path.join(appRoot, 'public', 'js', 'navigation.js'), 'utf8');
    expect(dashboard).toContain('id="view-stream-monsters"');
    expect(dashboard).toContain('data-plugin="stream-monsters"');
    expect(dashboard).toContain('data-plugin-alias="streamalchemy"');
    expect(dashboard).toContain('data-src="/stream-monsters/ui"');
    expect(dashboard).not.toContain('id="view-streamalchemy"');
    expect(navigation).toContain("streamalchemy: 'stream-monsters'");
    expect(navigation).toContain("view: 'stream-monsters', plugin: 'stream-monsters'");

    jest.resetModules();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const i18n = require('../modules/i18n');
    log.mockRestore();
    const canonical = i18n.t(
      'plugins.stream-monsters.ui.monsters.heroTitle', {}, 'en'
    );
    expect(canonical).not.toBe('plugins.stream-monsters.ui.monsters.heroTitle');
    expect(i18n.t('plugins.streamalchemy.ui.monsters.heroTitle', {}, 'en')).toBe(canonical);
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const catalog = JSON.parse(fs.readFileSync(path.join(appRoot, 'locales', `${locale}.json`), 'utf8'));
      expect(catalog.navigation['stream-monsters']).toBe('Stream Monsters');
      expect(catalog.navigation.streamalchemy).toBe('Stream Monsters');
    }
  });
});

describe('Stream Monsters canonical and permanent path aliases', () => {
  test('registers canonical API/UI aliases without reviving retired Art Lab APIs', async () => {
    const app = express();
    const loader = new PluginLoader(
      pluginsDir,
      app,
      { emit: jest.fn(), sockets: { sockets: new Map() } },
      {},
      logger(),
      { getPluginDataDir: jest.fn() }
    );
    const api = new PluginAPI(
      'streamalchemy',
      path.join(pluginsDir, 'stream-monsters'),
      app,
      {},
      {},
      logger(),
      loader,
      {}
    );
    loader.plugins.set('stream-monsters', { api });
    api.registerRoute('GET', '/streammonsters/ui', (_req, res) => res.send('ui'));
    api.registerRoute('GET', '/api/streammonsters/state', (_req, res) => res.json({ ok: true }));
    api.registerRoute('GET', '/api/streamalchemy/config', (_req, res) => res.status(410).json({ retired: true }));

    await request(app).get('/stream-monsters/ui').expect(200, 'ui');
    await request(app).get('/streammonsters/ui').expect(200, 'ui');
    await request(app).get('/api/stream-monsters/state').expect(200, { ok: true });
    await request(app).get('/api/streammonsters/state').expect(200, { ok: true });
    await request(app).get('/api/streamalchemy/config').expect(410, { retired: true });
    await request(app).get('/api/streamalchemy/state').expect(404);
  });

  test('serves canonical and legacy static aliases with identical validators and bytes', async () => {
    const app = express();
    mountPluginStaticAliases(app, pluginsDir, 'stream-monsters', {
      etag: true,
      maxAge: '1h'
    });
    const canonical = await request(app)
      .get('/plugins/stream-monsters/plugin.json')
      .expect(200);
    const legacy = await request(app)
      .get('/plugins/streamalchemy/plugin.json')
      .expect(200);

    expect(canonical.text).toBe(legacy.text);
    expect(canonical.headers['content-type']).toBe(legacy.headers['content-type']);
    expect(canonical.headers['cache-control']).toBe(legacy.headers['cache-control']);
    expect(canonical.headers.etag).toBe(legacy.headers.etag);
  });

  test.each([
    '/stream-monsters/overlay',
    '/streammonsters/overlay',
    '/streamalchemy/overlay'
  ])('allows the public overlay entrypoint %s for Quick Tunnel projection', pathname => {
    expect(isRegisteredEntrypoint(pathname)).toBe(true);
    expect(isHttpAllowed({ method: 'GET', pathname })).toBe(true);
  });

  test.each([
    '/api/stream-monsters/state',
    '/api/streammonsters/state'
  ])('allows canonical and compact public API dependency %s', pathname => {
    expect(isHttpAllowed({ method: 'GET', pathname })).toBe(true);
  });
});
