'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createDocsCaptureChildEnvironment } = require('../../scripts/lib/docs-capture-child-env');
const {
  getDocumentationCaptureAllowedEnvironmentKeys,
  getValidatedDocumentationCaptureProfileRoot,
  isDocumentationCapture,
  parseAllowedPluginIds,
  shouldLoadDotenv,
  shouldStartExternalConnectors,
  validateDocumentationCaptureEnvironment
} = require('../modules/docs-capture-policy');

describe('documentation capture server policy', () => {
  let tempDir;
  let profileDir;
  let pluginDir;
  let env;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-policy-'));
    profileDir = path.join(tempDir, 'profile');
    pluginDir = path.join(profileDir, 'plugins');
    fs.mkdirSync(pluginDir, { recursive: true });
    env = {
      TEMP: tempDir,
      TMP: tempDir,
      ...(process.platform === 'win32' ? { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' } : { TMPDIR: tempDir }),
      LOCALAPPDATA: profileDir,
      LTTH_LOG_DIR: path.join(profileDir, 'logs'),
      LTTH_PORT: '32123',
      LTTH_DOCS_CAPTURE: 'true',
      LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS: '',
      LTTH_DISABLE_TIKTOK_AUTO_RECONNECT: 'true',
      LTTH_NO_BROWSER: 'true',
      DISABLE_SWAGGER: 'true',
      LTTH_BIND_ADDRESS: '127.0.0.1'
    };
  });

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('skips dotenv and all external connector startup in docs mode', () => {
    expect(isDocumentationCapture(env)).toBe(true);
    expect(shouldLoadDotenv(env)).toBe(false);
    expect(shouldStartExternalConnectors(env)).toBe(false);
    expect(shouldLoadDotenv({})).toBe(true);
    expect(shouldStartExternalConnectors({})).toBe(true);
  });

  test('accepts a clean health environment with an empty plugin allowlist', () => {
    const allowed = validateDocumentationCaptureEnvironment(env, { tempDir, platform: process.platform });
    expect(allowed).toEqual(new Set());
    expect(getValidatedDocumentationCaptureProfileRoot(allowed)).toBe(profileDir);
    expect(() => getValidatedDocumentationCaptureProfileRoot(new Set())).toThrow(/validated capture policy/);
  });

  test('round-trips the exact builder environment through a synthetic Node child', () => {
    const builtEnvironment = createDocsCaptureChildEnvironment({
      profileDir,
      port: 32123,
      allowedPluginIds: [],
      pluginDir,
      inheritedEnv: process.env,
      tempDir,
      platform: process.platform
    });
    const result = spawnSync(process.execPath, [
      '-p', 'JSON.stringify({ keys: Object.keys(process.env).sort(), populatedWindowsKeys: Object.keys(process.env).filter(key => ["HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "PATH", "SYSTEMDRIVE", "USERDOMAIN", "USERNAME", "USERPROFILE"].includes(key) && process.env[key]) })'
    ], { env: builtEnvironment, encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);

    const { keys: childNames, populatedWindowsKeys } = JSON.parse(result.stdout.trim());
    const allowedNames = getDocumentationCaptureAllowedEnvironmentKeys(process.platform);
    const unexpectedNames = childNames.filter(name => !allowedNames.has(name));
    const normalizedNames = childNames.map(name => name.toLowerCase());
    const duplicateNames = normalizedNames.filter((name, index) => normalizedNames.indexOf(name) !== index);
    expect({ unexpectedNames, duplicateNames }).toEqual({ unexpectedNames: [], duplicateNames: [] });
    expect(populatedWindowsKeys).toEqual([]);
    expect(() => validateDocumentationCaptureEnvironment(builtEnvironment, {
      tempDir,
      platform: process.platform
    })).not.toThrow();
  });

  test('rejects inherited credentials and unsafe plugin environment before startup', () => {
    expect(() => validateDocumentationCaptureEnvironment({
      ...env,
      OPENAI_API_KEY: 'never-read-or-reported'
    }, { tempDir, platform: process.platform })).toThrow(/unapproved variables/);
    expect(() => validateDocumentationCaptureEnvironment({
      ...env,
      LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS: 'sidekick,sidekick'
    }, { tempDir, platform: process.platform })).toThrow(/duplicates/);
    expect(() => validateDocumentationCaptureEnvironment({
      ...env,
      LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS: 'sidekick, bad id'
    }, { tempDir, platform: process.platform })).toThrow(/invalid/);
    expect(() => validateDocumentationCaptureEnvironment({
      ...env,
      SystemRoot: 'synthetic-system-root',
      SYSTEMROOT: 'synthetic-case-duplicate'
    }, { tempDir, platform: 'win32' })).toThrow(/duplicate variable names/);
  });

  test('accepts only a fixture exactly matching the explicit plugin allowlist', () => {
    const allowedPluginDir = path.join(pluginDir, 'sidekick');
    fs.mkdirSync(allowedPluginDir, { recursive: true });
    fs.writeFileSync(path.join(allowedPluginDir, 'plugin.json'), JSON.stringify({ id: 'sidekick' }));
    env.LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS = 'sidekick';
    env.LTTH_DOCS_CAPTURE_PLUGIN_DIR = pluginDir;

    expect(validateDocumentationCaptureEnvironment(env, { tempDir, platform: process.platform }))
      .toEqual(new Set(['sidekick']));
    fs.writeFileSync(path.join(allowedPluginDir, 'plugin.json'), JSON.stringify({ id: 'Sidekick' }));
    expect(() => validateDocumentationCaptureEnvironment(env, { tempDir, platform: process.platform }))
      .toThrow(/invalid manifest ID/);
    fs.writeFileSync(path.join(allowedPluginDir, 'plugin.json'), JSON.stringify({ id: 'sidekick' }));
    fs.mkdirSync(path.join(pluginDir, 'extra-plugin'));
    fs.writeFileSync(path.join(pluginDir, 'extra-plugin', 'plugin.json'), JSON.stringify({ id: 'extra-plugin' }));
    expect(() => validateDocumentationCaptureEnvironment(env, { tempDir, platform: process.platform }))
      .toThrow(/manifest ID must match|does not match its explicit allowlist/);
  });

  test('rejects fixture and log paths that escape the temporary profile', () => {
    expect(() => validateDocumentationCaptureEnvironment({
      ...env,
      LTTH_LOG_DIR: path.join(tempDir, 'outside-logs')
    }, { tempDir, platform: process.platform })).toThrow(/paths must stay inside/);
    env.LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS = 'sidekick';
    env.LTTH_DOCS_CAPTURE_PLUGIN_DIR = path.join(tempDir, 'outside-plugins');
    expect(() => validateDocumentationCaptureEnvironment(env, { tempDir, platform: process.platform }))
      .toThrow(/fixture must remain inside/);
  });

  test('rejects a profile path that resolves through a symlink outside the temporary root', () => {
    const linkedProfileDir = path.join(tempDir, 'linked-profile');
    fs.symlinkSync(path.resolve(__dirname, '../..'), linkedProfileDir,
      process.platform === 'win32' ? 'junction' : 'dir');
    env.LOCALAPPDATA = linkedProfileDir;
    env.LTTH_LOG_DIR = path.join(linkedProfileDir, 'logs');

    expect(() => validateDocumentationCaptureEnvironment(env, { tempDir, platform: process.platform }))
      .toThrow(/profile must resolve inside/);
  });

  test('parses an empty allowlist as no plugins and rejects malformed or duplicate IDs', () => {
    expect(parseAllowedPluginIds('')).toEqual(new Set());
    expect(() => parseAllowedPluginIds('sidekick,,quiz-show')).toThrow(/invalid/);
    expect(() => parseAllowedPluginIds('sidekick,sidekick')).toThrow(/duplicates/);
  });

  test('wires fail-closed validation before dotenv, plugin, and connector startup', () => {
    const serverSource = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
    const validationIndex = serverSource.indexOf('validateDocumentationCaptureEnvironment(process.env)');
    const dotenvIndex = serverSource.indexOf("require('dotenv').config()");
    const clerkFallbackCall = serverSource.indexOf('loadClerkEnvFallback();');
    const clerkFallbackGuard = serverSource.lastIndexOf(
      'if (docsCapturePolicy.shouldLoadDotenv(process.env))',
      clerkFallbackCall
    );

    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(dotenvIndex).toBeGreaterThan(validationIndex);
    expect(clerkFallbackGuard).toBeGreaterThan(serverSource.indexOf('function loadClerkEnvFallback()'));
    expect(serverSource).toContain('if (docsCapturePolicy.shouldLoadDotenv(process.env))');
    expect(serverSource).toContain('docsCaptureAllowedPluginIds.size === 0');
    expect(serverSource).toContain('{ allowedPluginIds: docsCaptureAllowedPluginIds }');
    expect(serverSource).toContain('{ docsCapture: docsCaptureMode, docsCaptureProfileRoot }');
    expect(serverSource).toMatch(/if \(!docsCaptureMode\)\s*\{[\s\S]{0,200}iftttEngine\.init\(/);
    expect(serverSource).toContain('if (!docsCaptureMode && obsConfigStr)');
    expect(serverSource).toContain('if (!docsCaptureMode && networkManager.tunnelEnabled)');
    expect(serverSource).toMatch(/if \(!docsCaptureMode\)\s*\{\s*try\s*\{\s*await cloudSync\.initialize\(/);
    expect(serverSource).toMatch(/if \(!docsCaptureMode\)\s+\{\s+try\s+\{\s+writeCurrentPortFile\(PORT\)/);
  });
});
