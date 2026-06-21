'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { archiveStartupLogs } = require('../modules/log-paths');

describe('log path startup archiving', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-log-paths-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('archives old root logs while keeping the current launcher log', () => {
    const rootLogsDir = path.join(tempDir, 'logs');
    const legacyLogsDir = path.join(tempDir, 'app', 'logs');
    const archiveBaseDir = path.join(rootLogsDir, 'archive', 'startup');
    fs.mkdirSync(rootLogsDir, { recursive: true });

    const oldLog = path.join(rootLogsDir, 'app-2026-04-27.log');
    const currentLauncherLog = path.join(rootLogsDir, 'launcher_current.log');
    fs.writeFileSync(oldLog, 'old');
    fs.writeFileSync(currentLauncherLog, 'current');

    const result = archiveStartupLogs({
      rootLogsDir,
      legacyLogsDir,
      archiveBaseDir,
      archiveRootLogs: true,
      archiveLegacyLogs: false,
      skipPaths: [currentLauncherLog]
    });

    expect(result.errors).toHaveLength(0);
    expect(result.archived).toHaveLength(1);
    expect(fs.existsSync(oldLog)).toBe(false);
    expect(fs.existsSync(currentLauncherLog)).toBe(true);
    expect(fs.readFileSync(path.join(archiveBaseDir, 'root', 'app-2026-04-27.log'), 'utf8')).toBe('old');
  });

  test('archives legacy app logs into a separate archive bucket', () => {
    const rootLogsDir = path.join(tempDir, 'logs');
    const legacyLogsDir = path.join(tempDir, 'app', 'logs');
    const archiveBaseDir = path.join(rootLogsDir, 'archive', 'startup');
    fs.mkdirSync(legacyLogsDir, { recursive: true });

    const legacyLog = path.join(legacyLogsDir, 'error-2026-04-27.log');
    fs.writeFileSync(legacyLog, 'legacy');

    const result = archiveStartupLogs({
      rootLogsDir,
      legacyLogsDir,
      archiveBaseDir,
      archiveRootLogs: false,
      archiveLegacyLogs: true
    });

    expect(result.errors).toHaveLength(0);
    expect(result.archived).toHaveLength(1);
    expect(fs.existsSync(legacyLog)).toBe(false);
    expect(fs.readFileSync(path.join(archiveBaseDir, 'app-legacy', 'error-2026-04-27.log'), 'utf8')).toBe('legacy');
  });
});
