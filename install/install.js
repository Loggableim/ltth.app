#!/usr/bin/env node
/* ==============================================================================
 *  LTTH One-Line Installer (Platform-Neutral, Node.js Fallback)
 *  PupCid's Little TikTool Helper - https://ltth.app
 *
 *  Verwendung:
 *    curl -fsSL https://ltth.app/install/install.js | node
 *
 *  Optionale Umgebungsvariablen:
 *    LTTH_VERSION      - zu installierende Version (Default: latest)
 *    LTTH_DIR          - Installationsverzeichnis
 *    LTTH_PORT         - HTTP-Port (Default: 3000)
 *    LTTH_NO_BROWSER   - Browser nicht oeffnen
 *    LTTH_QUIET        - Reduzierte Ausgabe
 *    LTTH_REPO_BRANCH  - Git-Branch (requires LTTH_DEVELOPER=1)
 *    LTTH_DEVELOPER    - explicit source checkout, developer channel
 *    LTTH_OFFLINE_UPDATE - set to 1 only after stopping an existing app
 * ============================================================================== */

'use strict';

const { execFile, execFileSync, spawn } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');

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
const developerMode = process.env.LTTH_DEVELOPER === '1';
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

// Recovery never removes old checkouts or partially cloned content.
async function recoverDeveloperCheckout(directory, clone, rename = fs.renameSync, nonce = crypto.randomBytes(12).toString('hex')) {
    const backup = `${directory}.recovery-backup-${nonce}`;
    const failedClone = `${directory}.failed-clone-${nonce}`;
    const exists = (location) => {
        try { fs.lstatSync(location); return true; }
        catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    };
    if (!exists(directory)) throw new Error(`Recovery target missing: ${directory}; nothing changed.`);
    if (exists(backup) || exists(failedClone)) throw new Error(`Recovery destination already exists: ${backup} or ${failedClone}; nothing changed.`);
    try { rename(directory, backup); }
    catch (error) { throw new Error(`Could not preserve existing checkout ${directory} at ${backup}: ${error.message}; clone was not attempted.`); }
    try {
        await clone();
        if (!exists(directory)) throw new Error('Clone returned without creating its target.');
        return { directory, backup };
    } catch (error) {
        // A failed clone may contain diagnostic/user files: retain it separately
        // before restoring the original. If any move fails, leave every copy.
        if (exists(directory)) {
            try { rename(directory, failedClone); }
            catch (moveError) {
                throw new Error(`Clone failed: ${error.message}; could not preserve partial clone ${directory} at ${failedClone}: ${moveError.message}. Original checkout remains at ${backup}; manual recovery required.`);
            }
        }
        try { rename(backup, directory); }
        catch (restoreError) {
            throw new Error(`Clone failed: ${error.message}; RESTORE FAILED: ${restoreError.message}. Original checkout: ${backup}; partial clone (if created): ${failedClone}; target: ${directory}. Nothing deleted; manual recovery required.`);
        }
        throw new Error(`Clone failed: ${error.message}; original checkout restored at ${directory}; partial clone (if created) retained at ${failedClone}.`);
    }
}

async function replaceWithFreshClone(reason) {
    const reasonText = reason ? ` (${reason})` : '';
    warn(`Developer checkout recovery${reasonText}; preserving the original directory.`);
    const result = await recoverDeveloperCheckout(cfg.dir, cloneRepository);
    warn(`Original checkout retained at ${result.backup}. Profiles, logs and .config_path are not automatically migrated to the new checkout; review this recovery copy before starting the app.`);
    // A fresh checkout cannot safely inherit arbitrary legacy/profile data.
    // Stop before dependency installation/startup until migration is reviewed.
    throw new Error(`Fresh Developer checkout prepared at ${result.directory}; original checkout retained at ${result.backup}. Manual profile/config migration required before continuing; no app started.`);
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


// Public installs use immutable release assets, never a source-checkout fallback.
const publicZipLimit = 512 * 1024 * 1024;
function assertInstallMode() {
  if (!developerMode && (cfg.repoOwner !== 'Loggableim' || cfg.repoName !== 'ltth.app' || cfg.branch !== 'main' || !useLatestBranch)) {
    throw new Error('Custom repository/branch/version requires explicit LTTH_DEVELOPER=1.');
  }
}

function boundedReleaseGet(address, limit, redirects = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(address);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || redirects > 8) return reject(new Error('Unsafe release URL/redirect.'));
    const request = https.get(parsed, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return boundedReleaseGet(new URL(response.headers.location, parsed).toString(), limit, redirects + 1).then(resolve, reject);
      }
      if (response.statusCode !== 200) { response.resume(); return reject(new Error(`Release HTTP ${response.statusCode}`)); }
      if (Number(response.headers['content-length']) > limit) { response.destroy(); return reject(new Error('Release exceeds download limit.')); }
      const chunks = []; let length = 0;
      response.on('data', (chunk) => { length += chunk.length; if (length > limit) { response.destroy(new Error('Release exceeds download limit.')); } else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.setTimeout(120000, () => request.destroy(new Error('Release download timeout.')));
    request.on('error', reject);
  });
}

function releaseManifest(data) {
  const m = JSON.parse(data.toString('utf8'));
  const fields = ['schema', 'component', 'version', 'tag', 'commitSha', 'bytes', 'sha256'];
  if (Object.keys(m).length !== fields.length || Object.keys(m).some((key) => !fields.includes(key)) || m.schema !== 1 || m.component !== 'ltth_latest.zip' ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(m.version) || m.tag !== `v${m.version}` ||
      !/^[a-f0-9]{40}$/.test(m.commitSha) || !/^[a-f0-9]{64}$/.test(m.sha256) || !Number.isSafeInteger(m.bytes) || m.bytes <= 0 || m.bytes > publicZipLimit) {
    throw new Error('Invalid public release manifest.');
  }
  return m;
}

function publicCRC(data) {
  let crc = 0xffffffff;
  for (const value of data) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizedPluginPath(value) {
  let normalized = value.normalize('NFKC');
  for (let attempt = 0; attempt < 8 && normalized.includes('%'); attempt += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded.normalize('NFKC');
    } catch {
      break;
    }
  }
  return normalized.normalize('NFKC').toLowerCase();
}

function publicZipEntries(buffer, version) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) throw new Error('Unsupported ZIP end/disk.');
  const count = buffer.readUInt16LE(end + 10); const offset = buffer.readUInt32LE(end + 16); const size = buffer.readUInt32LE(end + 12);
  if (count === 0xffff || offset === 0xffffffff || count !== buffer.readUInt16LE(end + 8) || offset + size !== end) throw new Error('Unsupported ZIP64 or invalid directory.');
  const entries = new Map(); let cursor = offset; let expanded = 0;
  const root = `ltth_${version}/`;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
    const flags = buffer.readUInt16LE(cursor + 8); const method = buffer.readUInt16LE(cursor + 10); const crc = buffer.readUInt32LE(cursor + 16);
    const compressed = buffer.readUInt32LE(cursor + 20); const length = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28); const extra = buffer.readUInt16LE(cursor + 30); const comment = buffer.readUInt16LE(cursor + 32);
    const external = buffer.readUInt32LE(cursor + 38); const local = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extra + comment;
    if (next > end || (flags & 1) || ![0, 8].includes(method) || (external >>> 16 & 0xf000) === 0xa000 || length > 128 * 1024 * 1024) throw new Error('Unsafe/unsupported ZIP member.');
    const rawName = buffer.subarray(cursor + 46, cursor + 46 + nameLength); const name = rawName.toString('utf8');
    if (!Buffer.from(name).equals(rawName) || !name.startsWith(root) || name.includes('\\')) throw new Error('Unexpected release root/name.');
    const relative = name.slice(root.length).replace(/\/$/, '');
    if (relative && relative.split('/').some((part) => !part || part === '.' || part === '..' || /[:\x00-\x1f]/.test(part) || /[. ]$/.test(part))) throw new Error('Unsafe ZIP path.');
    const leaf = relative.split('/').at(-1).replace(/[. ]+$/, '').toLowerCase();
    if (leaf === '.env' || leaf.startsWith('.env.')) {
      const canonicalTemplate = `${root}app/.env.example`;
      if (name.endsWith('/') || name !== canonicalTemplate) throw new Error('Unapproved environment file in public release.');
    }
    if (local + 30 > offset || buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 8) !== method) throw new Error('Invalid ZIP local header.');
    const localNameLength = buffer.readUInt16LE(local + 26); const start = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
    if (!buffer.subarray(local + 30, local + 30 + localNameLength).equals(rawName) || start + compressed > offset) throw new Error('Invalid ZIP member range.');
    expanded += length; if (expanded > 1024 * 1024 * 1024) throw new Error('Expanded ZIP limit exceeded.');
    const key = relative.toLowerCase();
    if ((key === 'app' && relative !== 'app') || (key.startsWith('app/') && !relative.startsWith('app/'))) throw new Error('Noncanonical app directory case.');
    if (key === 'app/.config_path') throw new Error('Public release must not include a bootstrap config pointer.');
    if (entries.has(key)) throw new Error('Duplicate ZIP path.');
    if (relative) entries.set(key, { relative, directory: name.endsWith('/'), data() {
      const input = buffer.subarray(start, start + compressed);
      const output = method === 0 ? input : zlib.inflateRawSync(input, { maxOutputLength: Math.max(1, length) });
      if (output.length !== length || publicCRC(output) !== crc) throw new Error('ZIP CRC/size mismatch.');
      return output;
    } });
    cursor = next;
  }
  if (cursor !== end) throw new Error('ZIP directory count mismatch.');
  return entries;
}

function validatePublicZip(buffer, m) {
  if (buffer.length !== m.bytes || crypto.createHash('sha256').update(buffer).digest('hex') !== m.sha256) throw new Error('Release ZIP bytes/SHA256 mismatch.');
  const entries = publicZipEntries(buffer, m.version);
  const json = (name) => { const entry = entries.get(name); if (!entry || entry.directory || entry.relative !== name) throw new Error(`Missing/noncanonical ${name}`); const data = entry.data(); if (data.length > 1024 * 1024) throw new Error('Oversized metadata'); return JSON.parse(data.toString('utf8')); };
  if (json('app/package.json').version !== m.version) throw new Error('Release package version mismatch.');
  const marker = json('app/config/distribution-mode.json'); if (Object.keys(marker).length !== 1 || marker.channel !== 'public') throw new Error('Non-public release marker.');
  const policy = json('app/config/plugin-release-policy.json');
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.closedBeta) || !policy.closedBeta.length || Object.keys(policy).some((key) => !['schemaVersion', 'closedBeta', 'aliases', 'publicRuntimeExcluded', 'publicAssetPathOwners'].includes(key))) throw new Error('Invalid release policy.');
  if (policy.publicRuntimeExcluded !== undefined && !Array.isArray(policy.publicRuntimeExcluded)) throw new Error('Invalid public runtime exclusions.');
  if (policy.aliases !== undefined && (!policy.aliases || Array.isArray(policy.aliases) || typeof policy.aliases !== 'object')) throw new Error('Invalid alias policy.');
  if (policy.publicAssetPathOwners !== undefined && (!policy.publicAssetPathOwners || Array.isArray(policy.publicAssetPathOwners) || typeof policy.publicAssetPathOwners !== 'object')) throw new Error('Invalid asset policy.');
  const blocked = new Set(['chatango']); const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
  for (const id of [...policy.closedBeta, ...(policy.publicRuntimeExcluded || [])]) { if (typeof id !== 'string' || !idPattern.test(id) || blocked.has(id)) throw new Error('Invalid policy ID.'); blocked.add(id); }
  for (const [alias, target] of Object.entries(policy.aliases || {})) { if (typeof target !== 'string' || !idPattern.test(alias) || !blocked.has(target) || blocked.has(alias)) throw new Error('Invalid policy alias.'); blocked.add(alias); }
  const deniedAssets = new Set(['app/public/js/chatango-theme-adapter.js']);
  for (const [asset, owner] of Object.entries(policy.publicAssetPathOwners || {})) {
    if (!blocked.has(owner) || !asset.startsWith('/') || asset.slice(1).split('/').some((part) => !part || part === '.' || part === '..' || /[\\%?#:]/.test(part))) throw new Error('Invalid asset policy.');
    deniedAssets.add(`app/public${asset}`.toLowerCase());
  }
  for (const required of ['app/launch.js', 'app/server.js', 'app/package-lock.json']) {
    const entry = entries.get(required);
    if (!entry || entry.directory || entry.relative !== required) throw new Error(`Missing/noncanonical ${required}`);
  }
  for (const [key, entry] of entries) {
    if (deniedAssets.has(key)) throw new Error('Withdrawn public asset present.');
    const normalizedKey = normalizedPluginPath(key);
    if (normalizedKey.startsWith('app/plugins/') && normalizedKey.includes('%')) throw new Error('Invalid encoded plugin path.');
    if (normalizedKey.startsWith('app/plugins/')) {
      if (normalizedKey.split('/').slice(2).some((part) => blocked.has(part))) throw new Error('Withdrawn plugin directory present.');
      if (normalizedKey.endsWith('/plugin.json')) { const manifest = JSON.parse(entry.data().toString('utf8')); const ids = [manifest.id, ...(manifest.aliases || []), ...(manifest.replaces || [])]; if (ids.some((id) => typeof id !== 'string' || !idPattern.test(id) || blocked.has(id))) throw new Error('Withdrawn/invalid plugin identity present.'); }
    }
    if (!entry.directory) entry.data(); // CRC validation before any destination mutation.
  }
  return entries;
}

function rejectUnsafeExistingApp(appDir, installDir, releaseEntries = new Map()) {
  const pidFile = path.join(installDir, 'ltth.pid');
  if (fs.existsSync(pidFile)) throw new Error(`PID file ${pidFile} exists. Stop LTTH, verify that its recorded process is no longer LTTH/running; never terminate an unidentified process. Only then remove this PID file, set LTTH_OFFLINE_UPDATE=1 and repeat the original installer with the same LTTH_DIR. Nothing replaced.`);
  if (!fs.existsSync(appDir)) return;
  if (fs.lstatSync(appDir).isSymbolicLink()) throw new Error('Symlink app directory requires manual migration.');
  if (process.env.LTTH_OFFLINE_UPDATE !== '1') throw new Error('Existing app: stop it first, then explicitly set LTTH_OFFLINE_UPDATE=1; nothing replaced.');
  const pointer = path.join(appDir, '.config_path');
  if (fs.existsSync(pointer)) {
    const value = fs.readFileSync(pointer, 'utf8').trim();
    if (value) {
      const resolved = fs.existsSync(value) ? fs.realpathSync(value) : path.resolve(value);
      const relative = path.relative(fs.realpathSync(appDir), resolved);
      if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Custom config path inside app: offline data migration required.');
    }
  }
  const inspect = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const location = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Existing app has symlinks; manual migration required.');
      const relative = path.relative(appDir, location).split(path.sep);
      const dataNames = ['user_data', 'user_configs', 'uploads', 'logs', 'data'];
      const nestedData = relative.slice(0, entry.isDirectory() ? undefined : -1).some((part) => dataNames.includes(part));
      const releaseKey = `app/${relative.join('/')}`.toLowerCase();
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        if (dir === appDir && dataNames.includes(entry.name) && fs.readdirSync(location).length) throw new Error('Existing persistent app data: safe offline migration required; nothing replaced.');
        if (nestedData && !releaseEntries.has(releaseKey) && ![...releaseEntries.keys()].some((key) => key.startsWith(releaseKey + '/'))) throw new Error('Unexpected app-local data directory: offline migration required; nothing replaced.');
        inspect(location);
      }
      else if (nestedData && !releaseEntries.has(releaseKey)) throw new Error('Unexpected app-local data file: offline migration required; nothing replaced.');
      else if (/\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm))?$|\.log$/i.test(entry.name)) throw new Error('Existing SQLite data: consistent offline migration required; nothing replaced.');
    }
  };
  inspect(appDir);
}

function applyPublicEntries(entries, installDir, rename = fs.renameSync) {
  const appDir = path.join(installDir, 'app'); rejectUnsafeExistingApp(appDir, installDir, entries);
  if (fs.existsSync(appDir)) {
    const oldVersion = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).version;
    const newVersion = JSON.parse(entries.get('app/package.json').data().toString('utf8')).version;
    const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
    if (!pattern.test(oldVersion) || !pattern.test(newVersion)) throw new Error('Version migration requires manual review.');
    const oldParts = oldVersion.split('.').map(BigInt); const newParts = newVersion.split('.').map(BigInt);
    let order = 0; for (let i = 0; i < 3 && !order; i++) order = newParts[i] > oldParts[i] ? 1 : newParts[i] < oldParts[i] ? -1 : 0;
    if (order <= 0) throw new Error('Public release is not newer than installed app.');
  }
  fs.mkdirSync(installDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(installDir, '.ltth-release-')); const staged = path.join(work, 'app'); const backup = path.join(work, 'previous-app');
  let moved = false; let installed = false;
  try {
    for (const entry of entries.values()) {
      if (!entry.relative.startsWith('app/')) continue;
      const target = path.join(staged, ...entry.relative.slice(4).split('/'));
      if (entry.directory) fs.mkdirSync(target, { recursive: true });
      else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, entry.data(), { flag: 'wx', mode: 0o600 }); }
    }
    // Existing config-path selection and secrets/configs survive; release policy
    // and public marker always come from the freshly verified artifact.
    if (fs.existsSync(appDir)) {
      for (const name of ['.config_path', '.env']) if (fs.existsSync(path.join(appDir, name))) fs.copyFileSync(path.join(appDir, name), path.join(staged, name));
      const config = path.join(appDir, 'config');
      if (fs.existsSync(config)) for (const name of fs.readdirSync(config)) {
        if (['plugin-release-policy.json', 'distribution-mode.json'].includes(name)) continue;
        fs.cpSync(path.join(config, name), path.join(staged, 'config', name), { recursive: true, errorOnExist: false });
      }
      rename(appDir, backup); moved = true;
    }
    rename(staged, appDir); installed = true;
    return { backup: moved ? backup : null, appDir };
  } catch (error) {
    if (installed) fs.rmSync(appDir, { recursive: true, force: true });
    if (moved) { try { rename(backup, appDir); } catch (restore) { throw new Error(`${error.message}; RESTORE FAILED: ${restore.message}; old app retained at ${backup}`); } }
    throw error;
  } finally {
    // Never discard a previous app/recovery copy or its persistent files.
    if (!moved) fs.rmSync(work, { recursive: true, force: true });
  }
}

async function installPublicRelease() {
  const manifest = releaseManifest(await boundedReleaseGet('https://github.com/Loggableim/ltth.app/releases/latest/download/ltth_latest.json', 65536));
  const bytes = await boundedReleaseGet(`https://github.com/Loggableim/ltth.app/releases/download/${manifest.tag}/ltth_latest.zip`, manifest.bytes);
  const entries = validatePublicZip(bytes, manifest);
  const result = applyPublicEntries(entries, cfg.dir);
  cfg.version = manifest.version;
  if (result.backup) log(`Previous app retained for recovery: ${result.backup}`);
}

function assertDeveloperCloneTarget(directory) {
  if (!fs.existsSync(directory)) return;
  const info = fs.lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Developer target must be an ordinary directory; nothing removed.');
  if (!fs.existsSync(path.join(directory, '.git')) && fs.readdirSync(directory).length !== 0) {
    throw new Error('Nonempty non-Git Developer target rejected; profiles, configs and logs remain untouched. Choose an empty target.');
  }
}

async function downloadSource() {
    assertInstallMode();
    if (!developerMode) return installPublicRelease();
    const gitDir = path.join(cfg.dir, '.git');
    assertDeveloperCloneTarget(cfg.dir);

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
    const configDir = path.join(cfg.dir, 'app', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'distribution-mode.json'), JSON.stringify({ channel: developerMode ? 'developer' : 'public' }) + '\n');
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

    assertInstallMode();
    if (developerMode) await ensureGit();
    await ensureNode();
    if (developerMode) await resolveVersion();
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
    if (developerMode) console.log(`  Updates:     cd ${path.join(cfg.dir, 'app')} && git pull && npm install`);
    else {
        console.log('  Updates:     stop LTTH first; verify that its recorded PID is no longer running as LTTH.');
        console.log(`  PID file:    ${path.join(cfg.dir, 'ltth.pid')} (remove only after confirming LTTH stopped; never terminate an unidentified process).`);
        console.log(process.platform === 'win32' ? "  Offline flag (PowerShell): $env:LTTH_OFFLINE_UPDATE='1'" : '  Offline flag (shell): export LTTH_OFFLINE_UPDATE=1');
        console.log(`  Then repeat the original official installer, using the same LTTH_DIR: ${cfg.dir}`);
        console.log('  Legacy app-local profiles/SQLite/uploads require a separate offline migration; this installer refuses to replace them.');
    }
    console.log('');
}

// Node's pipe / `node -` entry is [stdin]; imported modules retain their file ID.
if (require.main === module || (module.id === '[stdin]' && !module.parent)) main().catch((e) => { err(e.stack || e.message); process.exit(1); });
module.exports = { releaseManifest, publicCRC, publicZipEntries, validatePublicZip, applyPublicEntries, assertInstallMode, rejectUnsafeExistingApp, assertDeveloperCloneTarget, recoverDeveloperCheckout };
