const fs = require('fs');
const path = require('path');
const fsp = require('fs/promises');
const MusicBotPlugin = require('../plugins/music-bot/main');

const windowsTest = process.platform === 'win32' ? test : test.skip;
const TRUSTED_CHOCO = 'C:\\ProgramData\\chocolatey\\bin\\choco.exe';

function createPlugin(executables = {}) {
  const plugin = new MusicBotPlugin({
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    log: jest.fn()
  });
  plugin._resolveExecutable = jest.fn(async name => executables[name] || null);
  plugin._buildWindowsElevatedCommand = jest.fn(() => {
    throw new Error('The Chocolatey fallback must not build an elevated command');
  });
  return plugin;
}

function mockPreplantedUserWritableChocolateyPath() {
  jest.spyOn(fsp, 'realpath').mockResolvedValue(TRUSTED_CHOCO);
  jest.spyOn(fsp, 'stat').mockResolvedValue({ isFile: () => true });
}

describe('Music Bot Chocolatey elevated fallback is disabled', () => {
  afterEach(() => jest.restoreAllMocks());

  windowsTest('does not elevate a preplanted user-writable choco.exe at the canonical path', async () => {
    mockPreplantedUserWritableChocolateyPath();
    const plugin = createPlugin({ choco: TRUSTED_CHOCO });

    const command = await plugin._getMpvInstallCommand();

    expect(command).toBeNull();
    expect(plugin._resolveExecutable).toHaveBeenCalledWith('winget');
    expect(plugin._resolveExecutable).toHaveBeenCalledWith('scoop');
    expect(plugin._resolveExecutable).not.toHaveBeenCalledWith('choco');
    expect(plugin._buildWindowsElevatedCommand).not.toHaveBeenCalled();
    expect(fsp.realpath).not.toHaveBeenCalled();
    expect(fsp.stat).not.toHaveBeenCalled();
  });

  windowsTest.each([
    ['current-directory', 'C:\\Users\\logga\\Documents\\project\\choco.exe'],
    ['PATH', 'C:\\Users\\logga\\AppData\\Local\\Programs\\chocolatey\\bin\\choco.exe'],
    ['ChocolateyInstall environment', 'D:\\tools\\chocolatey\\bin\\choco.exe']
  ])('never promotes a %s Chocolatey candidate to elevated execution', async (_label, candidate) => {
    mockPreplantedUserWritableChocolateyPath();
    const plugin = createPlugin({ choco: candidate });

    const command = await plugin._getMpvInstallCommand();

    expect(command).toBeNull();
    expect(plugin._buildWindowsElevatedCommand).not.toHaveBeenCalled();
    expect(fsp.realpath).not.toHaveBeenCalled();
    expect(fsp.stat).not.toHaveBeenCalled();
  });

  windowsTest('reports automatic install unavailable so setup keeps its manual path guidance', async () => {
    mockPreplantedUserWritableChocolateyPath();
    const plugin = createPlugin({ choco: TRUSTED_CHOCO });

    const status = await plugin._startMpvInstall();

    expect(status).toEqual(expect.objectContaining({
      state: 'unavailable',
      messageKey: 'mpvPackageManagerUnavailable',
      command: null
    }));
    expect(plugin._buildWindowsElevatedCommand).not.toHaveBeenCalled();
    expect(plugin._resolveExecutable).not.toHaveBeenCalledWith('choco');
    expect(fsp.realpath).not.toHaveBeenCalled();
    expect(fsp.stat).not.toHaveBeenCalled();
    expect(plugin._mpvInstallChild).toBeNull();
  });

  windowsTest('ignores a ChocolateyInstall override when selecting automatic installers', async () => {
    const previousChocolateyInstall = process.env.ChocolateyInstall;
    process.env.ChocolateyInstall = 'D:\\user-writable\\chocolatey';
    try {
      const plugin = createPlugin({ choco: 'D:\\user-writable\\chocolatey\\bin\\choco.exe' });

      await expect(plugin._getMpvInstallCommand()).resolves.toBeNull();
      expect(plugin._resolveExecutable).not.toHaveBeenCalledWith('choco');
      expect(plugin._buildWindowsElevatedCommand).not.toHaveBeenCalled();
    } finally {
      if (previousChocolateyInstall === undefined) delete process.env.ChocolateyInstall;
      else process.env.ChocolateyInstall = previousChocolateyInstall;
    }
  });

  test('manual MPV guidance does not recommend Chocolatey and tells users to configure the path', () => {
    const localesDir = path.join(__dirname, '../plugins/music-bot/locales');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), 'utf8'));
      const ui = translations.plugins['music-bot'].music_bot.ui.shell;
      expect(ui.setupMpvInstallWindows.toLowerCase()).not.toContain('choco');
      expect(ui.mpvPackageManagerUnavailable.toLowerCase()).not.toContain('choco');
      expect(ui.setupMpvInstallWindows.toLowerCase()).toContain('mpv.io');
      expect(ui.setupMpvConfigurePath).toBeTruthy();
      expect(ui.mpvPackageManagerUnavailable.toLowerCase()).toContain('mpv.io');
    }
  });

  test('documents every supported Linux MPV package manager in all locales', () => {
    const localesDir = path.join(__dirname, '../plugins/music-bot/locales');
    const buttonByLocale = { de: 'button', en: 'button', es: 'botón', fr: 'bouton' };
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), 'utf8'));
      const instructions = translations.plugins['music-bot'].music_bot.ui.shell.setupMpvInstallLinux.toLowerCase();
      for (const manager of ['apt', 'dnf', 'pacman', 'zypper']) {
        expect(instructions).toContain(manager);
      }
      expect(instructions).toContain(buttonByLocale[locale]);
    }
  });

  test('reachable install failures use neutral, non-elevating guidance in every locale', () => {
    const plugin = createPlugin();
    expect(plugin._summarizeMpvInstallFailure("Unable to obtain lock file access on 'C:\\ProgramData\\package.lock'", 1).messageKey)
      .toBe('mpvInstallChocolateyLock');
    expect(plugin._summarizeMpvInstallFailure('not running from an elevated prompt', 1).messageKey)
      .toBe('mpvInstallAdminConfirmation');
    expect(plugin._summarizeMpvInstallFailure('Access is denied', 1).messageKey)
      .toBe('mpvInstallPermissionDenied');

    const localesDir = path.join(__dirname, '../plugins/music-bot/locales');
    const messageKeys = [
      'mpvInstallTimedOut',
      'mpvInstallWindowsPrompt',
      'mpvInstallChocolateyLock',
      'mpvInstallAdminConfirmation',
      'mpvInstallPermissionDenied'
    ];
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), 'utf8'));
      const ui = translations.plugins['music-bot'].music_bot.ui.shell;
      for (const key of messageKeys) {
        expect(ui[key].toLowerCase()).not.toMatch(/chocolatey|administrator dialog|dialogue administrateur|diálogo de administrador|start ltth as administrator|starte ltth als administrator|inicia ltth como administrador|lancez ltth comme administrateur/);
      }
    }
  });

  windowsTest('keeps the supported Winget and Scoop command contracts unchanged', async () => {
    const winget = createPlugin({ winget: 'C:\\Windows\\System32\\winget.exe' });
    const wingetCommand = await winget._getMpvInstallCommand();
    expect(wingetCommand).toEqual({
      executable: 'C:\\Windows\\System32\\winget.exe',
      args: ['install', '--id', 'shinchiro.mpv', '-e', '--accept-package-agreements', '--accept-source-agreements'],
      label: 'winget install shinchiro.mpv'
    });

    const scoop = createPlugin({ scoop: 'C:\\Users\\logga\\scoop\\shims\\scoop.ps1' });
    const scoopCommand = await scoop._getMpvInstallCommand();
    expect(scoopCommand).toEqual({
      executable: 'C:\\Users\\logga\\scoop\\shims\\scoop.ps1',
      args: ['install', 'mpv'],
      label: 'scoop install mpv'
    });
  });
});
