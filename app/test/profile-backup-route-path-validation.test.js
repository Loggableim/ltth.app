'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const express = require('express');
const request = require('supertest');
const { Validators, ValidationError } = require('../modules/validators');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const profileSource = fs.readFileSync(path.join(__dirname, '..', 'modules', 'user-profiles.js'), 'utf8');

function extractRouteHandler(app, profileManager, logger) {
  const start = serverSource.indexOf("app.post('/api/profiles/:username/backup'");
  const end = serverSource.indexOf('// Get profile integrity status', start);
  if (start < 0 || end < 0) throw new Error('Could not locate profile backup route');
  vm.runInNewContext(serverSource.slice(start, end), {
    app,
    apiLimiter: (_req, _res, next) => next(),
    profileManager,
    Validators,
    ValidationError,
    logger
  });
}

function createProfileManager(configDir) {
  const methodStart = profileSource.indexOf('    backupProfile(username) {');
  const methodEnd = profileSource.indexOf('\n    /**\n     * Find a profile', methodStart);
  if (methodStart < 0 || methodEnd < 0) throw new Error('Could not locate backupProfile method');
  const methods = vm.runInNewContext(`({${profileSource.slice(methodStart, methodEnd).trim()}})`, { fs, path });

  return Object.assign({
    configDir,
    getProfilePath(username) {
      const sanitized = username.replace(/[^a-zA-Z0-9_-]/g, '_');
      return path.join(this.configDir, `${sanitized}.db`);
    },
    profileExists(username) {
      return fs.existsSync(this.getProfilePath(username));
    }
  }, methods);
}

describe('profile backup route path validation', () => {
  let tempRoot;
  let configDir;
  let app;
  let profileManager;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-backup-route-'));
    configDir = path.join(tempRoot, 'user_configs');
    fs.mkdirSync(configDir, { recursive: true });
    profileManager = createProfileManager(configDir);
    app = express();
    extractRouteHandler(app, profileManager, { info: jest.fn(), warn: jest.fn(), error: jest.fn() });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('backs up an existing valid profile within the synthetic profile directory', async () => {
    const profilePath = profileManager.getProfilePath('creator_1');
    fs.writeFileSync(profilePath, 'synthetic-profile-bytes');

    const response = await request(app)
      .post('/api/profiles/creator_1/backup')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(path.dirname(response.body.backup.backupPath)).toBe(configDir);
    expect(fs.readFileSync(profilePath, 'utf8')).toBe('synthetic-profile-bytes');
    expect(fs.readFileSync(response.body.backup.backupPath, 'utf8')).toBe('synthetic-profile-bytes');
  });

  test.each([
    ['encoded backslash traversal', '/api/profiles/%2E%2E%5Cescape/backup'],
    ['encoded slash traversal', '/api/profiles/%2E%2Fescape/backup'],
    ['dot segment', '/api/profiles/%2E%2E/backup']
  ])('rejects %s and preserves existing synthetic profiles', async (_label, url) => {
    const existingProfiles = ['creator_1', 'other_profile'];
    for (const name of existingProfiles) {
      fs.writeFileSync(profileManager.getProfilePath(name), `${name}-original`);
    }
    const namesBefore = fs.readdirSync(tempRoot).sort();
    const profileBytesBefore = Object.fromEntries(existingProfiles.map(name => [
      name,
      fs.readFileSync(profileManager.getProfilePath(name), 'utf8')
    ]));

    const response = await request(app).post(url);

    expect([400, 404]).toContain(response.status);
    expect(fs.readdirSync(tempRoot).sort()).toEqual(namesBefore);
    for (const name of existingProfiles) {
      expect(fs.readFileSync(profileManager.getProfilePath(name), 'utf8')).toBe(profileBytesBefore[name]);
    }
    expect(fs.readdirSync(configDir).sort()).toEqual(existingProfiles.map(name => `${name}.db`).sort());
  });
});
