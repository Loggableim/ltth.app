const fs = require('fs');
const os = require('os');
const path = require('path');

const UpdateManager = require('../modules/update-manager');

function makeTempApp(version = '1.3.9') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-update-manager-'));
  const appRoot = path.join(root, 'app');
  fs.mkdirSync(appRoot, { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ version }, null, 2));
  fs.writeFileSync(path.join(appRoot, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }, null, 2));
  return { root, appRoot };
}

describe('UpdateManager', () => {
  test('detects a newer GitHub release and git checkout state', async () => {
    const { root, appRoot } = makeTempApp('1.3.9');
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const execImpl = jest.fn(async (command, args) => {
      const normalizedCommand = command.replace(/\.exe$/i, '').replace(/\.cmd$/i, '');
      const key = `${normalizedCommand} ${args.join(' ')}`;

      switch (key) {
        case 'git status --porcelain':
          return { stdout: '' };
        case 'git rev-parse HEAD':
          return { stdout: 'oldsha' };
        case 'git branch --show-current':
          return { stdout: 'main' };
        case 'git rev-parse --abbrev-ref --symbolic-full-name @{u}':
          return { stdout: 'origin/main' };
        case 'git rev-list --left-right --count HEAD...origin/main':
          return { stdout: '0 1' };
        default:
          throw new Error(`Unexpected command: ${key}`);
      }
    });

    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'v1.4.0',
        name: 'v1.4.0',
        body: 'Release notes',
        published_at: '2026-07-05T00:00:00Z',
        html_url: 'https://github.com/Loggableim/ltth.app/releases/tag/v1.4.0',
        zipball_url: 'https://github.com/Loggableim/ltth.app/archive/refs/tags/v1.4.0.zip'
      })
    }));

    const manager = new UpdateManager(logger, {
      repoRoot: root,
      appRoot,
      isGitRepo: true,
      execImpl,
      fetchImpl
    });

    const result = await manager.checkForUpdates();

    expect(result.success).toBe(true);
    expect(result.available).toBe(true);
    expect(result.latestVersion).toBe('1.4.0');
    expect(result.updateMethod).toBe('git');
    expect(result.releaseUrl).toContain('releases/tag/v1.4.0');
  });

  test('refuses updates when the working tree is dirty', async () => {
    const { root, appRoot } = makeTempApp('1.3.9');
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const execImpl = jest.fn(async (command, args) => {
      const normalizedCommand = command.replace(/\.exe$/i, '').replace(/\.cmd$/i, '');
      const key = `${normalizedCommand} ${args.join(' ')}`;

      switch (key) {
        case 'git status --porcelain':
          return { stdout: ' M app/server.js' };
        case 'git rev-parse HEAD':
          return { stdout: 'oldsha' };
        case 'git branch --show-current':
          return { stdout: 'main' };
        case 'git rev-parse --abbrev-ref --symbolic-full-name @{u}':
          return { stdout: 'origin/main' };
        default:
          return { stdout: '' };
      }
    });

    const manager = new UpdateManager(logger, {
      repoRoot: root,
      appRoot,
      isGitRepo: true,
      execImpl,
      fetchImpl: jest.fn()
    });

    const result = await manager.performUpdate();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Working tree must be clean/i);
    expect(execImpl).toHaveBeenCalledWith(expect.stringMatching(/^git(\.exe)?$/i), ['status', '--porcelain'], expect.any(Object));
    expect(execImpl).not.toHaveBeenCalledWith(expect.stringMatching(/^git(\.exe)?$/i), ['reset', '--hard', 'newsha'], expect.any(Object));
  });

  test('performs a git update and refreshes dependencies when package files changed', async () => {
    const { root, appRoot } = makeTempApp('1.3.9');
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const execImpl = jest.fn(async (command, args, options) => {
      const normalizedCommand = command.replace(/\.exe$/i, '').replace(/\.cmd$/i, '');
      const key = `${normalizedCommand} ${args.join(' ')}`;

      switch (key) {
        case 'git status --porcelain':
          return { stdout: '' };
        case 'git rev-parse HEAD':
          return { stdout: 'oldsha' };
        case 'git branch --show-current':
          return { stdout: 'main' };
        case 'git rev-parse --abbrev-ref --symbolic-full-name @{u}':
          return { stdout: 'origin/main' };
        case 'git fetch --prune origin':
          return { stdout: '' };
        case 'git rev-parse origin/main':
          return { stdout: 'newsha' };
        case 'git reset --hard newsha':
          return { stdout: '' };
        case 'git diff --name-only oldsha newsha -- package.json package-lock.json app/package.json app/package-lock.json':
          return { stdout: 'app/package.json\n' };
        case 'npm ci':
          expect(options.cwd).toBe(appRoot);
          return { stdout: '' };
        default:
          throw new Error(`Unexpected command: ${key}`);
      }
    });

    const manager = new UpdateManager(logger, {
      repoRoot: root,
      appRoot,
      isGitRepo: true,
      execImpl,
      fetchImpl: jest.fn()
    });

    const result = await manager.performUpdate();

    expect(result.success).toBe(true);
    expect(result.needsRestart).toBe(true);
    expect(result.dependencyUpdated).toBe(true);
    expect(result.updateMethod).toBe('git');
    expect(result.previousHead).toBe('oldsha');
    expect(result.gitHead).toBe('newsha');
  });
});
