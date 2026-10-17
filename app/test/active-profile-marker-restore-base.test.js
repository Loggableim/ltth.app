'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadImporter() {
  const sourcePath = process.env.LTTH_BACKUP_IMPORTER_SOURCE;
  const anchorPath = process.env.LTTH_BACKUP_IMPORTER_ANCHOR;
  if (!sourcePath || !anchorPath) return require('../modules/backup/importer');
  const loaded = new Module(anchorPath, module);
  loaded.filename = anchorPath;
  loaded.paths = Module._nodeModulePaths(path.dirname(anchorPath));
  loaded._compile(fs.readFileSync(sourcePath, 'utf8'), anchorPath);
  return loaded.exports;
}

const { performImport } = loadImporter();

describe('active profile marker restore-base guard', () => {
  test('restores an active profile marker inside a normal user-config directory', async () => {
    const tempBase = path.resolve(os.tmpdir());
    const root = fs.mkdtempSync(path.join(tempBase, 'synthetic-active-marker-'));
    const relativeRoot = path.relative(tempBase, path.resolve(root));
    if (!relativeRoot || relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) {
      throw new Error('Synthetic test root escaped the OS temp directory');
    }
    const configDir = path.join(root, 'user_configs');
    const incomingMarker = path.join(root, 'incoming-active-profile');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(incomingMarker, 'profile_imported');
    try {
      const result = await performImport({
        manifest: { profileScopedDataPlugins: [] },
        globalSettings: null,
        pluginSettings: {},
        dataFiles: {},
        userConfigsFiles: [{ relPath: '.active_profile', tmpPath: incomingMarker }],
        uploadFiles: [],
        userDataFiles: [],
        warnings: [],
        errors: []
      }, {
        db: {},
        configPathManager: { getUserConfigsDir: () => configDir }
      }, {
        mode: 'replace',
        confirmProfileReplacement: true,
        includeGlobalSettings: false,
        includePluginSettings: false,
        includePluginData: false,
        includeUserConfigs: true,
        includeUploads: false,
        includeUserData: false
      });
      expect(result.success).toBe(true);
      expect(fs.readFileSync(path.join(configDir, '.active_profile'), 'utf8')).toBe('profile_imported');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects a synthetic user-config junction before touching the outside marker', async () => {
    const tempBase = path.resolve(os.tmpdir());
    const root = fs.mkdtempSync(path.join(tempBase, 'synthetic-active-marker-junction-'));
    const relativeRoot = path.relative(tempBase, path.resolve(root));
    if (!relativeRoot || relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) {
      throw new Error('Synthetic test root escaped the OS temp directory');
    }
    const configDir = path.join(root, 'user_configs');
    const outsideDir = path.join(root, 'outside-user-configs');
    const outsideMarker = path.join(outsideDir, '.active_profile');
    const incomingMarker = path.join(root, 'incoming-active-profile');
    const realLstat = fs.lstatSync;
    const realRename = fs.renameSync;
    const restoreBaseChecks = [];
    const markerRenameAttempts = [];
    let junctionCreated = false;
    let lstatSpy;
    let renameSpy;

    try {
      fs.mkdirSync(outsideDir, { recursive: true });
      fs.writeFileSync(outsideMarker, 'outside-sentinel');
      fs.writeFileSync(incomingMarker, 'profile_imported');
      // This test creates a junction only inside its freshly owned OS-temp root.
      fs.symlinkSync(outsideDir, configDir, 'junction');
      junctionCreated = true;

      const parsed = {
        manifest: { profileScopedDataPlugins: [] },
        globalSettings: null,
        pluginSettings: {},
        dataFiles: {},
        userConfigsFiles: [{ relPath: '.active_profile', tmpPath: incomingMarker }],
        uploadFiles: [],
        userDataFiles: [],
        warnings: [],
        errors: []
      };
      const deps = {
        db: {},
        configPathManager: { getUserConfigsDir: () => configDir }
      };
      lstatSpy = jest.spyOn(fs, 'lstatSync').mockImplementation((candidate, ...args) => {
        if (path.resolve(String(candidate)) === path.resolve(configDir)) restoreBaseChecks.push(path.resolve(String(candidate)));
        return realLstat.call(fs, candidate, ...args);
      });
      renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination, ...args) => {
        if (path.resolve(String(destination)) === path.resolve(path.join(configDir, '.active_profile'))) {
          markerRenameAttempts.push({ source: String(source), destination: String(destination) });
        }
        return realRename.call(fs, source, destination, ...args);
      });

      const result = await performImport(parsed, deps, {
        mode: 'replace',
        confirmProfileReplacement: true,
        includeGlobalSettings: false,
        includePluginSettings: false,
        includePluginData: false,
        includeUserConfigs: true,
        includeUploads: false,
        includeUserData: false
      });

      // The marker reached the transaction if its rename was attempted (pre-fix)
      // or its restore base was inspected (fixed); an early unrelated rejection fails this assertion.
      expect(markerRenameAttempts.length > 0 || restoreBaseChecks.length > 0).toBe(true);
      expect(fs.readFileSync(outsideMarker, 'utf8')).toBe('outside-sentinel');
      // In this flow only a queued restore entry with restoreBase reaches this lstat.
      expect(restoreBaseChecks).toContain(path.resolve(configDir));
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/symbolic link|unsafe restore destination/i);
      expect(markerRenameAttempts).toHaveLength(0);
    } finally {
      lstatSpy?.mockRestore();
      renameSpy?.mockRestore();
      if (junctionCreated) fs.unlinkSync(configDir);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
