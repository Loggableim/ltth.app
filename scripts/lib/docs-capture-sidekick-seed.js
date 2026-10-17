'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseDocsCapturePluginIds } = require('./docs-capture-plugin-fixture');

const SIDEKICK_DOCS_CAPTURE_CONFIG = Object.freeze({
  avatar: Object.freeze({
    driver: 'vnyan',
    vnyan: Object.freeze({
      autoConnect: false,
      reconnectOnDisconnect: false
    })
  }),
  animaze: Object.freeze({
    enabled: false,
    autoConnect: false,
    reconnectOnDisconnect: false
  }),
  muted: true,
  comment: Object.freeze({ enabled: false }),
  joinRules: Object.freeze({ enabled: false })
});

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath !== ''
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath);
}

function seedSidekickDocsCaptureProfile(repoRoot, profileDir, allowedPluginIds) {
  const resolvedRepoRoot = path.resolve(repoRoot || '');
  if (!fs.existsSync(path.join(resolvedRepoRoot, 'app', 'package.json'))) {
    throw new Error('Sidekick documentation capture seed requires the LTTH app root');
  }
  const allowedIds = parseDocsCapturePluginIds(allowedPluginIds);
  if (allowedIds.length !== 1 || allowedIds[0] !== 'sidekick') {
    throw new Error('Sidekick documentation capture seed requires the exact [sidekick] allowlist');
  }

  const profileRoot = path.resolve(profileDir || '');
  if (!profileDir || !isPathInside(os.tmpdir(), profileRoot)) {
    throw new Error('Sidekick documentation capture seed requires an isolated temporary profile');
  }

  const fixtureManifest = path.join(profileRoot, 'docs-capture-app', 'plugins', 'sidekick', 'plugin.json');
  if (!fs.existsSync(fixtureManifest)) {
    throw new Error('Sidekick documentation capture fixture must exist before profile seeding');
  }
  const manifest = JSON.parse(fs.readFileSync(fixtureManifest, 'utf8'));
  if (manifest.id !== 'sidekick' || manifest.enabled !== true) {
    throw new Error('Sidekick documentation capture fixture must be canonical and enabled');
  }

  const profileName = 'default';
  const configDir = path.join(profileRoot, 'ltth.app', 'user_configs');
  const dbPath = path.join(configDir, `${profileName}.db`);
  const activeProfilePath = path.join(configDir, '.active_profile');
  if (fs.existsSync(configDir)) {
    throw new Error('Sidekick documentation capture profile config directory already exists');
  }

  const { createRequire } = require('module');
  const requireAppDependency = createRequire(path.join(resolvedRepoRoot, 'app', 'package.json'));
  const Database = requireAppDependency('better-sqlite3');
  fs.mkdirSync(configDir, { recursive: true });
  const db = new Database(dbPath);
  try {
    db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`)
      .run('plugin:sidekick:config', JSON.stringify(SIDEKICK_DOCS_CAPTURE_CONFIG));
  } finally {
    db.close();
  }
  fs.writeFileSync(activeProfilePath, profileName, 'utf8');

  return Object.freeze({ profileName, configKey: 'plugin:sidekick:config' });
}

module.exports = {
  SIDEKICK_DOCS_CAPTURE_CONFIG,
  seedSidekickDocsCaptureProfile
};
