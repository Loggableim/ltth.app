/**
 * Launcher - Platform-agnostisches Launcher-Modul
 * Prüft Node.js, npm, Dependencies und Updates vor Server-Start
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - npm version caching (24h TTL) reduces startup by 100-300ms
 * - Async version checks where possible
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, exec, execFileSync } = require('child_process');
const TTYLogger = require('./tty-logger');

// PERFORMANCE: Cache file for npm/node version checks
const ENV_CACHE_FILE = path.join(os.tmpdir(), 'ltth-env-cache.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

class Launcher {
    constructor() {
        this.log = new TTYLogger();
        this.projectRoot = path.join(__dirname, '..');
        this.rootLogsDir = path.resolve(this.projectRoot, '..', 'logs');
        this.minNodeVersion = 18;
        this.maxNodeVersion = 24;
        this._envCache = null;
        this.logArchiveDone = false;
    }
    
    /**
     * PERFORMANCE: Load cached environment info (npm version)
     * Reduces startup time by 100-300ms on subsequent launches
     */
    _loadEnvCache() {
        try {
            if (fs.existsSync(ENV_CACHE_FILE)) {
                const cache = JSON.parse(fs.readFileSync(ENV_CACHE_FILE, 'utf8'));
                if (Date.now() - cache.timestamp < CACHE_TTL) {
                    return cache;
                }
            }
        } catch {
            // Cache read errors are expected (file corrupted, permissions, etc.)
            // Silently fall back to fresh version check
        }
        return null;
    }
    
    /**
     * PERFORMANCE: Save environment info to cache
     */
    _saveEnvCache(npmVersion) {
        try {
            const cache = {
                npmVersion,
                timestamp: Date.now()
            };
            fs.writeFileSync(ENV_CACHE_FILE, JSON.stringify(cache));
        } catch {
            // Ignore cache save errors
        }
    }
    
    /**
     * PERFORMANCE: Async npm version check to avoid blocking main thread
     * @returns {Promise<string>} npm version string
     */
    _checkNpmAsync() {
        return new Promise((resolve, reject) => {
            exec('npm -v', { encoding: 'utf8', timeout: 10000 }, (err, stdout, stderr) => {
                if (err) {
                    const errorMsg = stderr ? `${err.message}: ${stderr}` : err.message;
                    reject(new Error(errorMsg));
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }

    /**
     * Haupt-Launch-Routine
     */
    async launch() {
        try {
            this.log.clear();
            this.log.header('TikTok Stream Tool - Launcher');
            
            // Load cache once at start
            this._envCache = this._loadEnvCache();

            // 1. Node.js prüfen
            this.log.step(1, 4, 'Prüfe Node.js Installation...');
            await this.checkNode();
            this.log.newLine();

            // 2. npm prüfen
            this.log.step(2, 4, 'Prüfe npm Installation...');
            await this.checkNpm();
            this.log.newLine();

            // 3. Dependencies prüfen
            this.log.step(3, 4, 'Prüfe Dependencies...');
            await this.checkDependencies();
            this.log.newLine();

            await this.checkNativeModules();
            this.log.newLine();

            // Update-Check intentionally disabled for local snapshots
            this.log.info('Auto-Update deaktiviert...');
            await this.checkUpdates();
            this.log.newLine();

            // Server starten
            this.log.step(4, 4, 'Starte Server...');
            await this.startServer();

        } catch (error) {
            this.log.error(`Launcher-Fehler: ${error.message}`);
            this.log.newLine();
            this.log.warn('Drücke eine Taste zum Beenden...');

            // Warte auf Benutzer-Input
            await this.waitForKey();
            process.exit(1);
        }
    }

    /**
     * Prüft Node.js Installation und Version
     */
    async checkNode() {
        // Prüfe ob Node verfügbar ist (sollte immer true sein, da wir in Node laufen)
        const nodeVersion = process.version; // z.B. "v20.10.0"
        this.log.success(`Node.js gefunden: ${nodeVersion}`);

        // Parse Version
        const versionMatch = nodeVersion.match(/^v?(\d+)\.(\d+)\.(\d+)/);
        if (!versionMatch) {
            throw new Error(`Ungültige Node.js Version: ${nodeVersion}`);
        }

        const major = parseInt(versionMatch[1]);
        const minor = parseInt(versionMatch[2]);
        const patch = parseInt(versionMatch[3]);

        // Validiere Version
        if (major < this.minNodeVersion) {
            this.log.error(`Node.js Version ${nodeVersion} ist zu alt!`);
            this.log.info(`Erforderlich: Node.js ${this.minNodeVersion}.x bis ${this.maxNodeVersion}.x`);
            this.log.info('Bitte update Node.js von https://nodejs.org');
            throw new Error(`Node.js Version zu alt: ${nodeVersion}`);
        }

        if (major > this.maxNodeVersion) {
            this.log.warn(`Node.js Version ${nodeVersion} ist sehr neu!`);
            this.log.warn(`Empfohlen: Node.js ${this.minNodeVersion}.x bis ${this.maxNodeVersion}.x`);
            this.log.warn('Das Tool könnte instabil sein.');
            this.log.newLine();
        }

        this.log.keyValue('Node Version', `${major}.${minor}.${patch}`, 'green');
        this.log.keyValue('Plattform', process.platform);
        this.log.keyValue('Architektur', process.arch);
    }

    /**
     * Prüft npm Installation und Version
     * PERFORMANCE: Uses cached version if available (saves 100-300ms)
     * PERFORMANCE: Uses async exec to avoid blocking main thread
     */
    async checkNpm() {
        try {
            let npmVersion;
            
            // PERFORMANCE: Use cached npm version if available
            if (this._envCache && this._envCache.npmVersion) {
                npmVersion = this._envCache.npmVersion;
                this.log.success(`npm gefunden: v${npmVersion} (cached)`);
            } else {
                // PERFORMANCE: Fetch npm version asynchronously to avoid blocking
                npmVersion = await this._checkNpmAsync();
                
                // Save to cache for next launch
                this._saveEnvCache(npmVersion);
                this.log.success(`npm gefunden: v${npmVersion}`);
            }

            this.log.keyValue('npm Version', npmVersion, 'green');
        } catch (error) {
            this.log.error('npm ist nicht installiert oder nicht verfügbar!');
            this.log.info('npm sollte normalerweise mit Node.js installiert sein.');
            this.log.info('Bitte reinstalliere Node.js von https://nodejs.org');
            throw new Error('npm nicht gefunden');
        }
    }

    /**
     * Prüft ob kritische Dependencies installiert sind
     */
    verifyCriticalDependencies() {
        const criticalDeps = [
            'dotenv',
            'express',
            'socket.io',
            'better-sqlite3',
            'winston',
            '@eulerstream/euler-websocket-sdk',
            'jsonwebtoken',
            'axios',
            'ws'
        ];

        const missingDeps = [];
        
        for (const dep of criticalDeps) {
            const depPath = path.join(this.projectRoot, 'node_modules', dep);
            if (!fs.existsSync(depPath)) {
                missingDeps.push(dep);
            }
        }

        return {
            valid: missingDeps.length === 0,
            missing: missingDeps
        };
    }

    /**
     * Prüft und installiert Dependencies
     */
    async checkDependencies() {
        const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
        const packageLockPath = path.join(this.projectRoot, 'package-lock.json');

        // Prüfe ob node_modules existiert
        if (!fs.existsSync(nodeModulesPath)) {
            this.log.warn('Dependencies nicht gefunden. Installiere...');
            this.log.newLine();

            await this.installDependencies();

            this.log.newLine();
            this.log.success('Dependencies erfolgreich installiert!');
            return;
        }

        // Prüfe ob kritische Dependencies vorhanden sind
        const verification = this.verifyCriticalDependencies();
        if (!verification.valid) {
            this.log.warn(`Fehlende Dependencies erkannt: ${verification.missing.join(', ')}`);
            this.log.warn('Reinstalliere Dependencies...');
            this.log.newLine();

            await this.installDependencies();

            this.log.newLine();
            this.log.success('Dependencies erfolgreich installiert!');
            return;
        }

        // Prüfe ob package-lock.json neuer ist als node_modules
        const nodeModulesStat = fs.statSync(nodeModulesPath);
        const packageLockStat = fs.existsSync(packageLockPath)
            ? fs.statSync(packageLockPath)
            : null;

        if (packageLockStat && packageLockStat.mtimeMs > nodeModulesStat.mtimeMs) {
            this.log.warn('package-lock.json wurde aktualisiert. Reinstalliere Dependencies...');
            this.log.newLine();

            await this.installDependencies();

            this.log.newLine();
            this.log.success('Dependencies aktualisiert!');
        } else {
            this.log.success('Dependencies bereits installiert');
        }
    }

    /**
     * Installiert Dependencies
     */
    async installDependencies() {
        const packageLockPath = path.join(this.projectRoot, 'package-lock.json');
        let useCI = false;

        // Prüfe ob package-lock.json existiert UND valide ist (lockfileVersion >= 1)
        if (fs.existsSync(packageLockPath)) {
            try {
                const lockContent = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
                useCI = lockContent.lockfileVersion >= 1;
                if (!useCI) {
                    this.log.warn('package-lock.json hat veraltetes Format (lockfileVersion < 1). Nutze npm install statt npm ci.');
                }
            } catch (parseError) {
                this.log.warn(`package-lock.json ist korrupt oder nicht lesbar: ${parseError.message}`);
                this.log.info('Lösche korrupte package-lock.json und nutze npm install...');
                try {
                    fs.unlinkSync(packageLockPath);
                } catch (unlinkError) {
                    this.log.warn(`Konnte package-lock.json nicht löschen: ${unlinkError.message}`);
                }
                useCI = false;
            }
        }

        const command = useCI ? 'npm ci' : 'npm install';
        this.log.info(`Führe "${command}" aus...`);

        try {
            // Spinner starten (nur bei TTY)
            const spinner = this.log.spinner('Installiere Dependencies...');

            // Umgebungsvariablen setzen, um Puppeteer-Downloads zu überspringen
            // Dies verhindert Netzwerkfehler bei der Installation
            const env = this.sanitizeNodeEnvironment(Object.assign({}, process.env, {
                PUPPETEER_SKIP_DOWNLOAD: 'true',
                YOUTUBE_DL_SKIP_PYTHON_CHECK: '1'
            }));

            execSync(command, {
                cwd: this.projectRoot,
                stdio: ['pipe', 'pipe', 'pipe'],
                encoding: 'utf8',
                env: env
            });

            spinner.stop();
            this.log.success('Installation erfolgreich!');
        } catch (error) {
            // Fallback: Wenn npm ci fehlschlägt, versuche npm install
            if (useCI) {
                this.log.warn('npm ci fehlgeschlagen. Versuche Fallback mit npm install...');
                try {
                    execSync('npm install', {
                        cwd: this.projectRoot,
                        stdio: ['pipe', 'pipe', 'pipe'],
                        encoding: 'utf8',
                        env: this.sanitizeNodeEnvironment(Object.assign({}, process.env, {
                            PUPPETEER_SKIP_DOWNLOAD: 'true',
                            YOUTUBE_DL_SKIP_PYTHON_CHECK: '1'
                        }))
                    });
                    this.log.success('Fallback-Installation mit npm install erfolgreich!');
                    return;
                } catch (fallbackError) {
                    this.log.error('Auch npm install fehlgeschlagen!');
                    this.log.error(`Fehler: ${fallbackError.message}`);
                }
            }
            this.log.error('Installation fehlgeschlagen!');
            this.log.error(`Fehler: ${error.message}`);
            this.log.newLine();
            this.log.info('Versuche es manuell mit: npm install');
            throw new Error('Dependency-Installation fehlgeschlagen');
        }
    }

    sanitizeNodeEnvironment(env = {}) {
        const sanitized = Object.assign({}, env);
        delete sanitized.NODE_OPTIONS;
        delete sanitized.node_options;
        delete sanitized.npm_config_node_options;
        delete sanitized.NPM_CONFIG_NODE_OPTIONS;
        return sanitized;
    }

    verifyNativeModules() {
        const script = "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close(); console.log('native-modules-ok')";
        return execFileSync(process.execPath, ['-e', script], {
            cwd: this.projectRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8',
            env: this.sanitizeNodeEnvironment(process.env)
        }).trim();
    }

    rebuildNativeModules() {
        this.log.info('FÃ¼hre "npm rebuild better-sqlite3" aus...');
        return execSync('npm rebuild better-sqlite3', {
            cwd: this.projectRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8',
            env: this.sanitizeNodeEnvironment(Object.assign({}, process.env, {
                PUPPETEER_SKIP_DOWNLOAD: 'true',
                YOUTUBE_DL_SKIP_PYTHON_CHECK: '1'
            }))
        });
    }

    async checkNativeModules() {
        this.log.info('PrÃ¼fe native Node-Module...');
        try {
            const output = this.verifyNativeModules();
            this.log.success(`Native Module OK: ${output}`);
            return;
        } catch (error) {
            this.log.warn('Native Module passen nicht zur aktuellen Node.js-Version.');
            this.log.warn(error.stderr || error.message);
        }

        try {
            const output = this.rebuildNativeModules();
            if (output && output.trim()) {
                this.log.info(output.trim());
            }
            const verifyOutput = this.verifyNativeModules();
            this.log.success(`Native Module repariert: ${verifyOutput}`);
            return;
        } catch (rebuildError) {
            this.log.warn('npm rebuild fehlgeschlagen. Versuche npm install...');
            this.log.warn(rebuildError.stderr || rebuildError.message);
        }

        await this.installDependencies();
        try {
            const verifyOutput = this.verifyNativeModules();
            this.log.success(`Native Module repariert: ${verifyOutput}`);
        } catch (verifyError) {
            this.log.error('Native Module konnten nicht repariert werden.');
            this.log.error(verifyError.stderr || verifyError.message);
            throw new Error('Native Node-Module inkompatibel');
        }
    }

    /**
     * Auto-update is intentionally disabled for this local snapshot.
     */
    async checkUpdates() {
        this.log.info('Auto-Update ist deaktiviert; es werden keine Releases heruntergeladen.');
    }

    /**
     * Startet den Server
     * Unterstützt Auto-Restart via Exit Code 75 (z.B. nach Profilwechsel)
     */
    async startServer() {
        this.log.newLine();
        this.log.header(`${this.log.symbols.rocket} Pup Cids little TikTok Helper wird gestartet...`);

        this.log.newLine();
        this.log.info('Server wird initialisiert...');
        this.log.info('Bitte warten...');
        this.log.separator();
        this.log.newLine();

        const serverPath = path.join(this.projectRoot, 'server.js');

        const spawnServer = () => {
            const { spawn } = require('child_process');

            // Forward PORT env var explicitly so any alternative port set by the
            // Go launcher (or the caller) is reliably passed to the server process.
            const env = this.sanitizeNodeEnvironment(process.env);
            env.LTTH_LOG_DIR = this.rootLogsDir;
            if (this.logArchiveDone) {
                env.LTTH_LOG_ARCHIVE_DONE = 'true';
            }

            const serverProcess = spawn('node', [serverPath], {
                cwd: this.projectRoot,
                stdio: 'inherit',
                env
            });
            this.logArchiveDone = true;

            serverProcess.on('exit', (code) => {
                // Exit Code 75 = Neustart angefordert (z.B. Profilwechsel)
                if (code === 75) {
                    this.log.newLine();
                    this.log.separator();
                    this.log.info('♻️  Server-Neustart wird durchgeführt (Profilwechsel)...');
                    this.log.separator();
                    this.log.newLine();
                    // Kurze Verzögerung damit Datei-Handles sauber geschlossen werden
                    setTimeout(() => spawnServer(), 1500);
                    return;
                }

                this.log.newLine();
                this.log.separator();
                this.log.info(`Server wurde beendet (Exit Code: ${code || 0})`);
                this.log.separator();
                process.exit(code || 0);
            });

            // process.once verhindert das Akkumulieren von Handlern bei wiederholtem Spawn
            process.once('SIGINT', () => {
                this.log.newLine();
                this.log.separator();
                this.log.info('Server wird beendet...');
                serverProcess.kill('SIGINT');
                // Wait for child to exit so port is released before launcher exits
                serverProcess.once('exit', () => process.exit(0));
                // Fallback: force exit after 6s (child has a 5s shutdown timeout)
                const forceTimer = setTimeout(() => process.exit(0), 6000);
                forceTimer.unref();
            });

            process.once('SIGTERM', () => {
                serverProcess.kill('SIGTERM');
                // Wait for child to exit so port is released before launcher exits
                serverProcess.once('exit', () => process.exit(0));
                // Fallback: force exit after 6s (child has a 5s shutdown timeout)
                const forceTimer = setTimeout(() => process.exit(0), 6000);
                forceTimer.unref();
            });
        };

        try {
            spawnServer();
        } catch (error) {
            this.log.error(`Server konnte nicht gestartet werden: ${error.message}`);
            throw error;
        }
    }

    /**
     * Wartet auf Tastendruck (für Error-Handling)
     */
    async waitForKey() {
        return new Promise((resolve) => {
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.once('data', () => {
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    resolve();
                });
            } else {
                // Non-TTY: Warte 5 Sekunden
                setTimeout(resolve, 5000);
            }
        });
    }
}

module.exports = Launcher;
