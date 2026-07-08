#!/usr/bin/env node
/* ==============================================================================
 *  LTTH One-Line Installer (Platform-Neutral, Node.js Fallback)
 *  PupCid's Little TikTool Helper - https://ltth.app
 *
 *  Verwendung:
 *    curl -fsSL https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.js | node
 *
 *  Optionale Umgebungsvariablen:
 *    LTTH_VERSION      - zu installierende Version (Default: latest)
 *    LTTH_DIR          - Installationsverzeichnis
 *    LTTH_PORT         - HTTP-Port (Default: 3000)
 *    LTTH_NO_BROWSER   - Browser nicht oeffnen
 *    LTTH_QUIET        - Reduzierte Ausgabe
 *    LTTH_REPO_BRANCH  - Git-Branch fuer die Installation (Default: main)
 * ============================================================================== */

'use strict';

const { execFile, execFileSync, spawn } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');

const cfg = {
    repoOwner: process.env.LTTH_REPO_OWNER || 'Loggableim',
    repoName: process.env.LTTH_REPO_NAME || 'ltth.app',
    branch: process.env.LTTH_REPO_BRANCH || 'main',
    version: process.env.LTTH_VERSION || 'latest',
    dir: process.env.LTTH_DIR || defaultInstallDir(),
    port: process.env.LTTH_PORT || '3000',
    noBrowser: process.env.LTTH_NO_BROWSER === '1',
    quiet: process.env.LTTH_QUIET === '1'
};
const useLatestBranch = cfg.version === 'latest';
const branchRefSpec = `+refs/heads/${cfg.branch}:refs/remotes/origin/${cfg.branch}`;
const gitHttpVersion = process.env.GIT_HTTP_VERSION || 'HTTP/1.1';

function defaultInstallDir() {
    const home = os.homedir();
    if (process.platform === 'win32') {
        return path.join(process.env.LOCALAPPDATA || home, 'LTTH');
    }
    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'LTTH');
    }
    return path.join(home, '.local', 'share', 'ltth');
}

// ---------- Hilfsfunktionen ----------
const C = { reset: '\x1b[0m', cyan: '\x1b[1;36m', green: '\x1b[1;32m', yellow: '\x1b[1;33m', red: '\x1b[1;31m', gray: '\x1b[90m' };
const useColor = process.stdout.isTTY && !cfg.quiet;
const c = (color, s) => (useColor ? `${C[color]}${s}${C.reset}` : s);

const log = (m) => { if (!cfg.quiet) console.log(`${c('cyan', '[ltth]')} ${m}`); };
const ok = (m) => { if (!cfg.quiet) console.log(`${c('green', '[OK]')}  ${m}`); };
const warn = (m) => console.warn(`${c('yellow', '[!]')}  ${m}`);
const err = (m) => console.error(`${c('red', '[X]')}  ${m}`);

function exec(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env, ...(opts.env || {}) };
        if (path.basename(cmd).toLowerCase().startsWith('git')) {
            env.GIT_HTTP_VERSION = env.GIT_HTTP_VERSION || gitHttpVersion;
        }

        execFile(cmd, args, { ...opts, env, stdio: cfg.quiet ? 'ignore' : 'inherit' }, (e) => {
            if (e) reject(e);
            else resolve();
        });
    });
}

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'ltth-installer' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpsGet(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} fuer ${url}`));
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'ltth-installer' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = new URL(res.headers.location, url).toString();
                res.resume();
                return downloadFile(nextUrl, destination).then(resolve, reject);
            }

            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} fuer ${url}`));
            }

            const file = fs.createWriteStream(destination);
            res.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
            file.on('error', (error) => {
                file.close(() => reject(error));
            });
        }).on('error', reject);
    });
}

async function cloneRepository() {
    const url = `https://github.com/${cfg.repoOwner}/${cfg.repoName}.git`;

    log(`Klone Repository nach ${cfg.dir}...`);
    await exec('git', ['clone', '--depth', '1', '--branch', cfg.branch, '--single-branch', url, cfg.dir]);

    if (!useLatestBranch) {
        try {
            await exec('git', ['-C', cfg.dir, 'fetch', '--depth', '1', 'origin', `refs/tags/v${cfg.version}:refs/tags/v${cfg.version}`]);
            await exec('git', ['-C', cfg.dir, 'checkout', `v${cfg.version}`]);
        } catch {
            try {
                await exec('git', ['-C', cfg.dir, 'fetch', '--depth', '1', 'origin', `${cfg.version}:refs/tags/${cfg.version}`]);
                await exec('git', ['-C', cfg.dir, 'checkout', cfg.version]);
            } catch {
                warn(`Tag nicht verfuegbar, nutze Branch ${cfg.branch}...`);
            }
        }
    }
}

async function replaceWithFreshClone(reason) {
    const backupDir = `${cfg.dir}.broken-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const reasonText = reason ? ` (${reason})` : '';
    let backupCreated = false;

    warn(`Bestehende Installation ist nicht sauber aktualisierbar${reasonText}; erstelle frische Kopie...`);

    try {
        fs.rmSync(backupDir, { recursive: true, force: true });
        fs.renameSync(cfg.dir, backupDir);
        backupCreated = true;
    } catch {
        warn('Bestehende Installation konnte nicht in ein Backup verschoben werden; ueberschreibe sie direkt.');
        fs.rmSync(cfg.dir, { recursive: true, force: true });
    }

    try {
        await cloneRepository();
        if (backupCreated) {
            fs.rmSync(backupDir, { recursive: true, force: true });
        }
    } catch (error) {
        fs.rmSync(cfg.dir, { recursive: true, force: true });
        if (backupCreated) {
            try {
                fs.renameSync(backupDir, cfg.dir);
            } catch {
                // Best effort restore only.
            }
        }
        throw error;
    }
}

function probeExecutable(executable) {
    if (!executable) {
        return null;
    }

    try {
        const version = execFileSync(executable, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (!version) {
            return null;
        }

        return {
            path: executable,
            version
        };
    } catch {
        return null;
    }
}

function commandExists(command) {
    return probeExecutable(command) !== null;
}

function prependPathEntries(entries) {
    const current = process.env.PATH || '';
    const nextEntries = [];
    const seen = new Set();

    for (const entry of entries) {
        if (!entry) {
            continue;
        }

        const normalized = path.resolve(entry);
        if (seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        nextEntries.push(normalized);
    }

    if (nextEntries.length > 0) {
        process.env.PATH = [...nextEntries, current].filter(Boolean).join(path.delimiter);
    }
}

function findGitExecutable() {
    const direct = probeExecutable('git');
    if (direct) {
        return direct;
    }

    const candidates = [];
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
        for (const root of [localAppData, ...programFiles]) {
            candidates.push(
                path.join(root, 'Programs', 'Git', 'cmd', 'git.exe'),
                path.join(root, 'Programs', 'Git', 'bin', 'git.exe'),
                path.join(root, 'Programs', 'Git', 'usr', 'bin', 'git.exe'),
                path.join(root, 'Git', 'cmd', 'git.exe'),
                path.join(root, 'Git', 'bin', 'git.exe'),
                path.join(root, 'Git', 'usr', 'bin', 'git.exe')
            );
        }
    } else if (process.platform === 'darwin') {
        candidates.push('/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git');
    } else {
        candidates.push('/usr/bin/git', '/usr/local/bin/git', '/bin/git', '/snap/bin/git');
    }

    for (const candidate of candidates) {
        const info = probeExecutable(candidate);
        if (info) {
            return info;
        }
    }

    return null;
}

function getBrewExecutable() {
    const direct = probeExecutable('brew');
    if (direct) {
        return direct;
    }

    for (const candidate of ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']) {
        const info = probeExecutable(candidate);
        if (info) {
            return info;
        }
    }

    return null;
}

async function ensureHomebrew() {
    if (process.platform !== 'darwin') {
        return false;
    }

    const brewInfo = getBrewExecutable();
    if (brewInfo) {
        prependPathEntries([path.dirname(brewInfo.path)]);
        return true;
    }

    log('Installiere Homebrew automatisch...');
    try {
        await exec('/bin/bash', ['-lc', 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"']);
    } catch (error) {
        warn(`Homebrew-Installation fehlgeschlagen: ${error.message}`);
        return false;
    }

    const installedBrew = getBrewExecutable();
    if (installedBrew) {
        prependPathEntries([path.dirname(installedBrew.path)]);
        return true;
    }

    warn('Homebrew wurde installiert, konnte aber nicht in PATH gefunden werden.');
    return false;
}

async function installGitOnWindows() {
    if (commandExists('winget')) {
        log('Installiere Git via winget...');
        try {
            await exec('winget', [
                'install',
                '--id', 'Git.Git',
                '-e',
                '--source', 'winget',
                '--silent',
                '--accept-package-agreements',
                '--accept-source-agreements'
            ]);
        } catch (error) {
            warn(`winget-Git-Installation fehlgeschlagen: ${error.message}`);
        }

        const wingetGit = findGitExecutable();
        if (wingetGit) {
            return wingetGit;
        }
    }

    log('Installiere Git ueber die offizielle Git-for-Windows-Quelle...');
    const installPage = await httpsGet('https://git-scm.com/install/windows');
    const archPattern = process.arch === 'arm64'
        ? /https:\/\/github\.com\/git-for-windows\/git\/releases\/download\/[^"]+\/Git-[^"]+-arm64\.exe/
        : /https:\/\/github\.com\/git-for-windows\/git\/releases\/download\/[^"]+\/Git-[^"]+-64-bit\.exe/;
    const match = installPage.match(archPattern);
    if (!match) {
        throw new Error('Konnte den offiziellen Git-for-Windows-Downloadlink nicht ermitteln.');
    }

    const installerUrl = match[0];
    const installerPath = path.join(os.tmpdir(), `git-installer-${Date.now()}-${Math.random().toString(16).slice(2)}.exe`);
    const installDir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Programs', 'Git');

    try {
        await downloadFile(installerUrl, installerPath);
        await exec(installerPath, [
            '/VERYSILENT',
            '/NORESTART',
            '/NOCANCEL',
            '/SP-',
            '/CLOSEAPPLICATIONS',
            '/RESTARTAPPLICATIONS',
            '/COMPONENTS=icons,ext\\reg\\shellhere,assoc,assoc_sh',
            `/DIR=${installDir}`
        ]);
    } finally {
        fs.rmSync(installerPath, { force: true });
    }

    return findGitExecutable();
}

async function installGitOnMac() {
    if (!await ensureHomebrew()) {
        return null;
    }

    log('Installiere Git via Homebrew...');
    try {
        await exec('brew', ['install', 'git']);
    } catch (error) {
        warn(`Homebrew-Git-Installation fehlgeschlagen: ${error.message}`);
        return null;
    }

    const gitInfo = findGitExecutable();
    if (gitInfo && path.isAbsolute(gitInfo.path)) {
        prependPathEntries([path.dirname(gitInfo.path)]);
    }

    return gitInfo;
}

async function installGitOnLinux() {
    const packageManagers = [
        {
            command: 'apt-get',
            setup: async () => {
                const args = ['install', '-y', 'git'];
                if (commandExists('sudo') && typeof process.getuid === 'function' && process.getuid() !== 0) {
                    await exec('sudo', ['apt-get', 'update']);
                    await exec('sudo', args);
                } else {
                    await exec('apt-get', ['update']);
                    await exec('apt-get', args);
                }
            }
        },
        {
            command: 'dnf',
            setup: async () => {
                if (commandExists('sudo') && typeof process.getuid === 'function' && process.getuid() !== 0) {
                    await exec('sudo', ['dnf', 'install', '-y', 'git']);
                } else {
                    await exec('dnf', ['install', '-y', 'git']);
                }
            }
        },
        {
            command: 'yum',
            setup: async () => {
                if (commandExists('sudo') && typeof process.getuid === 'function' && process.getuid() !== 0) {
                    await exec('sudo', ['yum', 'install', '-y', 'git']);
                } else {
                    await exec('yum', ['install', '-y', 'git']);
                }
            }
        },
        {
            command: 'pacman',
            setup: async () => {
                if (commandExists('sudo') && typeof process.getuid === 'function' && process.getuid() !== 0) {
                    await exec('sudo', ['pacman', '-Sy', '--noconfirm', 'git']);
                } else {
                    await exec('pacman', ['-Sy', '--noconfirm', 'git']);
                }
            }
        },
        {
            command: 'zypper',
            setup: async () => {
                if (commandExists('sudo') && typeof process.getuid === 'function' && process.getuid() !== 0) {
                    await exec('sudo', ['zypper', 'install', '-y', 'git']);
                } else {
                    await exec('zypper', ['install', '-y', 'git']);
                }
            }
        },
        {
            command: 'apk',
            setup: async () => {
                if (commandExists('sudo') && typeof process.getuid === 'function' && process.getuid() !== 0) {
                    await exec('sudo', ['apk', 'add', 'git']);
                } else {
                    await exec('apk', ['add', 'git']);
                }
            }
        }
    ];

    for (const manager of packageManagers) {
        if (!commandExists(manager.command)) {
            continue;
        }

        log(`Installiere Git via ${manager.command}...`);
        try {
            await manager.setup();
        } catch (error) {
            warn(`${manager.command}-Git-Installation fehlgeschlagen: ${error.message}`);
            continue;
        }

        return findGitExecutable();
    }

    return null;
}

async function installGitAutomatically() {
    if (process.platform === 'win32') {
        return installGitOnWindows();
    }
    if (process.platform === 'darwin') {
        return installGitOnMac();
    }
    if (process.platform === 'linux') {
        return installGitOnLinux();
    }
    return null;
}

// ---------- Schritte ----------
async function resolveVersion() {
    if (!useLatestBranch) {
        ok(`Verwende angegebene Version: v${cfg.version}`);
        return;
    }

    log(`Ermittle neueste Version vom Branch ${cfg.branch}...`);
    try {
        const data = await httpsGet(`https://raw.githubusercontent.com/${cfg.repoOwner}/${cfg.repoName}/${cfg.branch}/version.json`);
        const versionInfo = JSON.parse(data);
        const resolvedVersion = versionInfo?.downloadVersion || versionInfo?.version;
        if (!resolvedVersion) {
            throw new Error('Keine Version in version.json vorhanden.');
        }
        cfg.version = resolvedVersion;
    } catch (e) {
        err(`Konnte version.json von Branch ${cfg.branch} nicht laden: ${e.message}`);
        process.exit(1);
    }
    ok(`Neueste Version aus Branch ${cfg.branch}: v${cfg.version}`);
}

async function ensureGit() {
    const gitInfo = findGitExecutable();
    if (gitInfo) {
        if (path.isAbsolute(gitInfo.path)) {
            prependPathEntries([path.dirname(gitInfo.path)]);
        }
        ok(`Git ${gitInfo.version} gefunden`);
        return;
    }

    log('Git fehlt - installiere es automatisch...');
    const installedGit = await installGitAutomatically();
    if (installedGit) {
        if (path.isAbsolute(installedGit.path)) {
            prependPathEntries([path.dirname(installedGit.path)]);
        }
        ok(`Git ${installedGit.version} gefunden`);
        return;
    }

    err('Git konnte nicht automatisch installiert werden.');
    err('Bitte installiere Git manuell: https://git-scm.com/downloads');
    process.exit(1);
}

async function ensureNode() {
    const major = parseInt(process.versions.node.split('.')[0], 10);
    if (major < 18 || major >= 25) {
        err(`Node.js ${process.versions.node} ist fuer einen frischen LTTH-Installationslauf nicht geeignet.`);
        err('Bitte installiere Node.js 18/20/22/24 LTS oder nutze den passenden LTTH-Installer fuer dein Betriebssystem.');
        process.exit(1);
    }
    ok(`Node.js ${process.versions.node} gefunden`);
}

async function downloadSource() {
    const gitDir = path.join(cfg.dir, '.git');
    if (fs.existsSync(cfg.dir) && !fs.existsSync(gitDir)) {
        warn('Bestehendes Zielverzeichnis gefunden, aber keine Git-Installation. Bereinige...');
        fs.rmSync(cfg.dir, { recursive: true, force: true });
    }

    fs.mkdirSync(cfg.dir, { recursive: true });

    if (fs.existsSync(gitDir)) {
        log('Bestehende Installation gefunden -- aktualisiere...');
        let refreshRequired = false;
        let refreshReason = '';
        try {
            await exec('git', ['-C', cfg.dir, 'fetch', '--tags', '--prune', 'origin', branchRefSpec]);
        } catch (error) {
            warn(`Git Fetch fehlgeschlagen (${error.message}); pruefe frische Kopie...`);
            refreshRequired = true;
            refreshReason = error.message;
        }

        if (!refreshRequired) {
            if (useLatestBranch) {
                try {
                    await exec('git', ['-C', cfg.dir, 'checkout', cfg.branch]);
                } catch (error) {
                    try {
                        await exec('git', ['-C', cfg.dir, 'checkout', '-B', cfg.branch, `origin/${cfg.branch}`]);
                    } catch (checkoutError) {
                        warn(`Branch-Checkout fehlgeschlagen (${checkoutError.message}); pruefe frische Kopie...`);
                        refreshRequired = true;
                        refreshReason = checkoutError.message;
                    }
                }
            } else {
                try {
                    await exec('git', ['-C', cfg.dir, 'checkout', `v${cfg.version}`]);
                } catch {
                    try {
                        await exec('git', ['-C', cfg.dir, 'checkout', cfg.version]);
                    } catch {
                        warn(`Gewuenschte Version nicht gefunden, nutze Standard-Branch ${cfg.branch}...`);
                        try {
                            await exec('git', ['-C', cfg.dir, 'checkout', cfg.branch]);
                        } catch (error) {
                            warn(`Branch-Checkout fehlgeschlagen (${error.message}), erstelle frische Kopie...`);
                            refreshRequired = true;
                            refreshReason = error.message;
                        }
                    }
                }
            }
        }

        if (refreshRequired) {
            await replaceWithFreshClone(refreshReason);
        }
    } else {
        try {
            await cloneRepository();
        } catch (e) {
            err(`Konnte Repository nicht vom Branch ${cfg.branch} klonen: ${e.message}`);
            process.exit(1);
        }
    }
    ok(`Quellcode bereit in ${cfg.dir}`);
}

async function installDeps() {
    log('Installiere npm-Abhaengigkeiten...');
    await exec('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: path.join(cfg.dir, 'app') });
    ok('Abhaengigkeiten installiert');
}

async function startApp() {
    log(`Starte LTTH im Hintergrund auf Port ${cfg.port}...`);
    const appDir = path.join(cfg.dir, 'app');
    const logFile = path.join(cfg.dir, 'ltth.log');
    const out = fs.openSync(logFile, 'a');
    const child = spawn(process.execPath, ['launch.js'], {
        cwd: appDir,
        detached: true,
        stdio: ['ignore', out, out],
        env: { ...process.env, PORT: cfg.port }
    });
    child.unref();
    fs.writeFileSync(path.join(cfg.dir, 'ltth.pid'), String(child.pid));
    await new Promise((r) => setTimeout(r, 2500));
    try {
        process.kill(child.pid, 0);
        ok(`LTTH laeuft (PID ${child.pid}) auf Port ${cfg.port}`);
    } catch {
        err(`LTTH konnte nicht gestartet werden. Siehe ${logFile}`);
        process.exit(1);
    }
}

function openBrowser() {
    if (cfg.noBrowser) return;
    const url = `http://localhost:${cfg.port}/dashboard.html`;
    log(`Oeffne ${url} ...`);
    if (process.platform === 'win32') {
        const child = spawn('cmd', ['/c', 'start', '', url], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();
        return;
    }
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    try { execFile(opener, [url], { stdio: 'ignore' }); } catch { /* ignore */ }
}

// ---------- Hauptprogramm ----------
async function main() {
    console.log('');
    console.log(c('gray', '  ╔══════════════════════════════════════════════════════════════════════╗'));
    console.log(c('gray', '  ║   PupCid\'s Little TikTool Helper - Universal Installer              ║'));
    console.log(c('gray', '  ╚══════════════════════════════════════════════════════════════════════╝'));
    console.log('');

    log(`Plattform:      ${process.platform}-${process.arch}`);
    log(`Node:           ${process.versions.node}`);
    log(`Installationspfad: ${cfg.dir}`);
    log(`Port:           ${cfg.port}`);
    console.log('');

    await ensureGit();
    await ensureNode();
    await resolveVersion();
    await downloadSource();
    await installDeps();
    await startApp();
    openBrowser();

    console.log('');
    ok('Installation abgeschlossen!');
    console.log('');
    console.log(`  Dashboard:   http://localhost:${cfg.port}/dashboard.html`);
    console.log(`  Log-Datei:   ${path.join(cfg.dir, 'ltth.log')}`);
    console.log(`  Stoppen:     kill $(cat ${path.join(cfg.dir, 'ltth.pid')})`);
    console.log(`  Updates:     cd ${path.join(cfg.dir, 'app')} && git pull && npm install`);
    console.log('');
}

main().catch((e) => { err(e.stack || e.message); process.exit(1); });
