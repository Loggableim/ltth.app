'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPluginReleasePolicy } = require('../modules/plugin-release-policy');

const root = path.resolve(__dirname, '../..');
const policyBytes = fs.readFileSync(path.join(root, 'app/config/plugin-release-policy.json'));
const closedBeta = JSON.parse(policyBytes).closedBeta;
const PluginLoader = require('../modules/plugin-loader');
const express = require('express');

test('explicit JS and shell developer installer markers preserve local access and public-surface denial', () => {
  const js = fs.readFileSync(path.join(root, 'install/install.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'install/install.sh'), 'utf8');
  expect(js).toContain("channel: developerMode ? 'developer' : 'public'");
  expect(shell).toContain('{"channel":"developer"}');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-developer-marker-'));
  try {
    fs.mkdirSync(path.join(temp, 'config'));
    fs.writeFileSync(path.join(temp, 'config/plugin-release-policy.json'), policyBytes);
    const releasePolicy = createPluginReleasePolicy({ appRoot: temp });
    for (const channel of ['local', 'developer']) {
      fs.writeFileSync(path.join(temp, 'config/distribution-mode.json'), JSON.stringify({ channel }));
      expect(releasePolicy.getSnapshot().publicMode).toBe(false);
      expect(releasePolicy.getSnapshot().policyInvalid).toBeUndefined();
      for (const id of [...closedBeta, 'streamalchemy']) {
        expect(() => releasePolicy.assertAllowed(id)).not.toThrow();
        expect(releasePolicy.isClosedBetaId(id, releasePolicy.getPublicSurfaceSnapshot())).toBe(true);
        expect(() => releasePolicy.assertAllowed(id, releasePolicy.getPublicSurfaceSnapshot()))
          .toThrow(expect.objectContaining({ code: 'PLUGIN_CLOSED_BETA_PUBLIC' }));
      }
    }
    for (const channel of ['public', 'unknown']) {
      fs.writeFileSync(path.join(temp, 'config/distribution-mode.json'), JSON.stringify({ channel }));
      expect(releasePolicy.getSnapshot().publicMode).toBe(true);
      expect(() => releasePolicy.assertAllowed('music-bot')).toThrow();
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('source removal and local/public/developer transitions retain only known beta state', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-beta-retention-'));
  try {
    const appRoot = path.join(temp, 'app');
    const pluginsDir = path.join(temp, 'plugins');
    fs.mkdirSync(path.join(appRoot, 'config'), { recursive: true });
    fs.mkdirSync(pluginsDir);
    fs.writeFileSync(path.join(appRoot, 'config/plugin-release-policy.json'), policyBytes);
    const loader = new PluginLoader(pluginsDir, express(),
      { emit: jest.fn(), sockets: { sockets: new Map() } }, {},
      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      { getPluginDataDir: id => path.join(temp, 'data', id) }, null,
      { releasePolicy: { appRoot } });
    const ids = [...closedBeta, 'streamalchemy'];
    const original = Object.fromEntries(ids.map(id => [id, {
      enabled: true, enabledAt: 123, settings: { opaque: id, nested: [1, false, null] }
    }]));
    loader.state = JSON.parse(JSON.stringify(original));
    const save = jest.spyOn(loader, 'saveState').mockReturnValue(true);
    for (const channel of ['local', 'public', 'developer', 'public', 'local']) {
      fs.writeFileSync(path.join(appRoot, 'config/distribution-mode.json'), JSON.stringify({ channel }));
      loader.pruneStalePluginState([]);
      expect(JSON.stringify(loader.state)).toBe(JSON.stringify(original));
      expect(save).not.toHaveBeenCalled();
      for (const id of closedBeta) expect(loader.isPluginEnabledFromDisk(id)).toBe(false);
      const guard = loader.releasePolicy.createRequestGuard();
      const next = jest.fn();
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      guard({ path: '/plugins/music-bot/ui.html' }, res, next);
      if (channel === 'public') {
        expect(res.status).toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
      } else expect(next).toHaveBeenCalled();
    }
    loader.state['orphan-unknown-plugin'] = { enabled: true };
    loader.pruneStalePluginState([]);
    expect(loader.state['orphan-unknown-plugin']).toBeUndefined();
    expect(JSON.stringify(loader.state)).toBe(JSON.stringify(original));
    expect(save).toHaveBeenCalledTimes(1);
    for (const id of closedBeta) {
      fs.mkdirSync(path.join(pluginsDir, id));
      fs.writeFileSync(path.join(pluginsDir, id, 'plugin.json'), JSON.stringify({
        id, name: id, entry: 'index.js', enabled: false
      }));
      expect(loader.isPluginEnabledFromDisk(id)).toBe(true);
    }
    fs.writeFileSync(path.join(appRoot, 'config/distribution-mode.json'), JSON.stringify({ channel: 'public' }));
    for (const id of closedBeta) expect(loader.isPluginEnabledFromDisk(id)).toBe(false);
    expect(JSON.stringify(loader.state)).toBe(JSON.stringify(original));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
