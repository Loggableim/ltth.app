#!/usr/bin/env node
/* ==============================================================================
 *  LTTH One-Line Installer (Platform-Neutral, Node.js Fallback)
 *  PupCid's Little TikTool Helper - https://ltth.app
 *
 *  Verwendung:
 *    curl -fsSL https://raw.githubusercontent.com/Loggableim/ltth.app/ltth.app/install/install.js | node
 *
 *  Optionale Umgebungsvariablen:
 *    LTTH_VERSION      - zu installierende Version (Default: latest)
 *    LTTH_DIR          - Installationsverzeichnis
 *    LTTH_PORT         - HTTP-Port (Default: 3000)
 *    LTTH_NO_BROWSER   - Browser nicht oeffnen
 *    LTTH_QUIET        - Reduzierte Ausgabe
 *    LTTH_REPO_BRANCH  - Git-Branch fuer die Installation (Default: ltth.app)
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
    branch: process.env.LTTH_REPO_BRANCH || 'ltth.app',
    version: process.env.LTTH_VERSION || 'latest',
    dir: process.env.LTTH_DIR || defaultInstallDir(),
    port: process.env.LTTH_PORT || '3000',
    noBrowser: process.env.LTTH_NO_BROWSER === '1',
    quiet: process.env.LTTH_QUIET === '1'
};
const useLatestBranch = cfg.version === 'latest';
const branchRefSpec = `+refs/heads/${cfg.branch}:refs/remotes/origin/${cfg.branch}`;

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
        execFile(cmd, args, { ...opts, stdio: cfg.quiet ? 'ignore' : 'inherit' }, (e) => {
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
    try { execFileSync('git', ['--version'], { stdio: 'ignore' }); }
    catch {
        err('Git fehlt. Bitte installiere git (https://git-scm.com).');
        process.exit(1);
    }
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
        try {
            await exec('git', ['-C', cfg.dir, 'fetch', '--tags', '--prune', 'origin', branchRefSpec]);
        } catch {
            warn('Git Fetch fehlgeschlagen, verwende vorhandene lokale Branch-Struktur...');
        }

        if (useLatestBranch) {
            try {
                await exec('git', ['-C', cfg.dir, 'checkout', cfg.branch]);
            } catch {
                await exec('git', ['-C', cfg.dir, 'checkout', '-B', cfg.branch, `origin/${cfg.branch}`]);
            }
        } else {
            try {
                await exec('git', ['-C', cfg.dir, 'checkout', `v${cfg.version}`]);
            } catch {
                try {
                    await exec('git', ['-C', cfg.dir, 'checkout', cfg.version]);
                } catch {
                    warn(`Gewuenschte Version nicht gefunden, nutze Standard-Branch ${cfg.branch}...`);
                    await exec('git', ['-C', cfg.dir, 'checkout', cfg.branch]);
                }
            }
        }
    } else {
        log(`Klone Repository nach ${cfg.dir}...`);
        const url = `https://github.com/${cfg.repoOwner}/${cfg.repoName}.git`;
        try {
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
