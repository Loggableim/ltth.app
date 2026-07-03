/**
 * Update-Manager - Git-unabhängiges Update-System mit Backup/Rollback
 * Unterstützt:
 * - Git-basierte Updates (wenn .git vorhanden)
 * - GitHub Release ZIP Downloads (ohne Git)
 * - Automatisches Backup vor Update
 * - Rollback bei Fehlern
 */

// Defensive imports - catch missing dependencies early
let axios;
try {
    axios = require('axios');
} catch (error) {
    throw new Error('Update-Manager benötigt axios. Bitte führe "npm install" aus.');
}

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(require('child_process').exec);

class UpdateManager {
    constructor(logger) {
        this.logger = logger;
        this.githubRepo = 'Loggableim/pupcidslittletiktokhelper';
        this.projectRoot = path.join(__dirname, '..');
        this.currentVersion = this.getCurrentVersion();
        this.backupDir = path.join(this.projectRoot, '.backups');
        this.isGitRepo = this.checkIsGitRepo();
        // Base URL for installer downloads
        this.installerBaseUrl = 'https://ltth.app/downloads';
    }

    /**
     * Generates the download URL for an installer for a specific version
     * @param {string} version - The version string (e.g., "1.1.0" or "1.0.0")
     * @returns {string} The installer download URL
     */
    getInstallerUrl(version) {
        // Format: ltth.app/downloads/ltthsetup1.0.0, ltth.app/downloads/ltthsetup1.1.0
        return `${this.installerBaseUrl}/ltthsetup${version}`;
    }

    /**
     * Liest aktuelle Version aus package.json
     */
    getCurrentVersion() {
        try {
            const packagePath = path.join(this.projectRoot, 'package.json');
            const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            return packageData.version || '0.0.0';
        } catch (error) {
            this.logger?.warn(`Could not read current version: ${error.message}`);
            return '0.0.0';
        }
    }

    /**
     * Prüft ob Projekt ein Git-Repository ist
     */
    checkIsGitRepo() {
        const gitDir = path.join(this.projectRoot, '.git');
        return fs.existsSync(gitDir);
    }

    /**
     * Prüft auf neue Versionen via GitHub API
     */
    async checkForUpdates() {
        try {
            const url = `https://api.github.com/repos/${this.githubRepo}/releases/latest`;

            this.logger?.info('Prüfe auf Updates...');

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'PupCids-TikTok-Helper',
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });

            const release = response.data;
            const latestVersion = release.tag_name.replace(/^v/, '');
            const isNewVersion = this.compareVersions(latestVersion, this.currentVersion) > 0;

            const updateInfo = {
                available: isNewVersion,
                currentVersion: this.currentVersion,
                latestVersion: latestVersion,
                releaseUrl: release.html_url,
                releaseName: release.name,
                releaseNotes: release.body,
                publishedAt: release.published_at,
                downloadUrl: release.zipball_url,
                tarballUrl: release.tarball_url,
                installerUrl: this.getInstallerUrl(latestVersion),
                updateMethod: this.isGitRepo ? 'git' : 'zip',
                updateCommand: this.isGitRepo ? 'git pull' : 'download-zip'
            };

            if (isNewVersion) {
                this.logger?.info(`Neue Version verfügbar: ${latestVersion} (aktuell: ${this.currentVersion})`);
            } else {
                this.logger?.info(`Bereits auf dem neuesten Stand: ${this.currentVersion}`);
            }

            return {
                success: true,
                ...updateInfo
            };
        } catch (error) {
            if (error.response && error.response.status === 404) {
                this.logger?.info(`Keine Releases gefunden für ${this.githubRepo}`);
                return {
                    success: false,
                    error: 'Keine Releases verfügbar',
                    currentVersion: this.currentVersion,
                    available: false
                };
            }

            this.logger?.warn(`Update-Check fehlgeschlagen: ${error.message}`);
            return {
                success: false,
                error: error.message,
                currentVersion: this.currentVersion,
                available: false
            };
        }
    }

    /**
     * Vergleicht zwei Semantic Versioning Strings
     */
    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(n => parseInt(n) || 0);
        const parts2 = v2.split('.').map(n => parseInt(n) || 0);

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;

            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }

        return 0;
    }

    /**
     * Erstellt Backup von wichtigen Dateien/Ordnern
     */
    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupPath = path.join(this.backupDir, `backup_${timestamp}`);

        this.logger?.info(`Erstelle Backup in: ${backupPath}`);

        try {
            // Erstelle Backup-Verzeichnis
            if (!fs.existsSync(this.backupDir)) {
                fs.mkdirSync(this.backupDir, { recursive: true });
            }

            fs.mkdirSync(backupPath, { recursive: true });

            // Backup user_data/
            const userDataSrc = path.join(this.projectRoot, 'user_data');
            if (fs.existsSync(userDataSrc)) {
                const userDataDest = path.join(backupPath, 'user_data');
                this.copyRecursive(userDataSrc, userDataDest);
                this.logger?.info('user_data/ gesichert');
            }

            // Backup user_configs/
            const userConfigsSrc = path.join(this.projectRoot, 'user_configs');
            if (fs.existsSync(userConfigsSrc)) {
                const userConfigsDest = path.join(backupPath, 'user_configs');
                this.copyRecursive(userConfigsSrc, userConfigsDest);
                this.logger?.info('user_configs/ gesichert');
            }

            // Backup package.json, package-lock.json
            const packageFiles = ['package.json', 'package-lock.json'];
            for (const file of packageFiles) {
                const srcPath = path.join(this.projectRoot, file);
                if (fs.existsSync(srcPath)) {
                    const destPath = path.join(backupPath, file);
                    fs.copyFileSync(srcPath, destPath);
                    this.logger?.info(`${file} gesichert`);
                }
            }

            this.logger?.info(`Backup erfolgreich erstellt: ${backupPath}`);

            return {
                success: true,
                backupPath
            };
        } catch (error) {
            this.logger?.error(`Backup fehlgeschlagen: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Kopiert Verzeichnis rekursiv
     */
    copyRecursive(src, dest) {
        if (!fs.existsSync(src)) return;

        if (fs.statSync(src).isDirectory()) {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }

            const entries = fs.readdirSync(src);
            for (const entry of entries) {
                this.copyRecursive(path.join(src, entry), path.join(dest, entry));
            }
        } else {
            fs.copyFileSync(src, dest);
        }
    }

    /**
     * Führt Update aus (Git oder ZIP)
     */
    async performUpdate() {
        try {
            // 1. Backup erstellen
            this.logger?.info('Schritt 1: Backup erstellen...');
            const backupResult = await this.createBackup();

            if (!backupResult.success) {
                throw new Error('Backup fehlgeschlagen');
            }

            const backupPath = backupResult.backupPath;

            try {
                // 2. Update durchführen
                this.logger?.info('Schritt 2: Update herunterladen...');

                let updateResult;
                if (this.isGitRepo) {
                    updateResult = await this.updateViaGit();
                } else {
                    updateResult = await this.updateViaZip();
                }

                if (!updateResult.success) {
                    throw new Error(updateResult.error || 'Update fehlgeschlagen');
                }

                // 3. Dependencies aktualisieren (wenn nötig)
                if (updateResult.needsDependencyUpdate) {
                    this.logger?.info('Schritt 3: Dependencies aktualisieren...');
                    await this.updateDependencies();
                }

                this.logger?.info('Update erfolgreich abgeschlossen!');
                this.logger?.info('Bitte starte den Server neu um die Änderungen zu übernehmen.');

                return {
                    success: true,
                    message: 'Update erfolgreich',
                    needsRestart: true,
                    backupPath
                };
            } catch (updateError) {
                // Rollback bei Fehler
                this.logger?.error(`Update fehlgeschlagen: ${updateError.message}`);
                this.logger?.warn('Führe Rollback durch...');

                await this.performRollback(backupPath);

                return {
                    success: false,
                    error: updateError.message,
                    rolledBack: true
                };
            }
        } catch (error) {
            this.logger?.error(`Update fehlgeschlagen: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update via Git
     */
    async updateViaGit() {
        try {
            // Prüfe ob Git verfügbar ist
            try {
                execSync('git --version', { stdio: 'ignore' });
            } catch (error) {
                throw new Error('Git ist nicht installiert');
            }

            // Prüfe auf lokale Änderungen
            const status = execSync('git status --porcelain', {
                cwd: this.projectRoot,
                encoding: 'utf8'
            }).trim();

            if (status) {
                this.logger?.warn('Lokale Änderungen gefunden. Diese werden gesichert...');
                execSync('git stash save "Auto-stash vor Update"', {
                    cwd: this.projectRoot,
                    stdio: 'inherit'
                });
            }

            // Git pull
            this.logger?.info('Führe git pull aus...');
            const { stdout, stderr } = await execAsync('git pull', {
                cwd: this.projectRoot
            });

            this.logger?.info('Git pull output:', stdout);
            if (stderr && !stderr.includes('Already up to date')) {
                this.logger?.warn('Git stderr:', stderr);
            }

            // Prüfe ob package.json geändert wurde
            const needsDependencyUpdate = stdout.includes('package.json') ||
                                         stdout.includes('package-lock.json');

            return {
                success: true,
                needsDependencyUpdate,
                output: stdout
            };
        } catch (error) {
            throw new Error(`Git update fehlgeschlagen: ${error.message}`);
        }
    }

    /**
     * Update via ZIP-Download
     */
    async updateViaZip() {
        const zipPath = path.join(this.projectRoot, 'update.zip');
        const tempDir = path.join(this.projectRoot, '.update-temp');

        try {
            // 1. Hole Release-Info
            const url = `https://api.github.com/repos/${this.githubRepo}/releases/latest`;
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'PupCids-TikTok-Helper',
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });

            const downloadUrl = response.data.zipball_url;

            // 2. Lade ZIP herunter
            this.logger?.info('Lade Update-Archiv herunter...');
            this.logger?.info(`Download URL: ${downloadUrl}`);

            const zipResponse = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'PupCids-TikTok-Helper'
                },
                timeout: 120000, // 2 Minuten für größere Dateien
                maxContentLength: 100 * 1024 * 1024 // 100 MB max
            });

            this.logger?.info(`Download abgeschlossen (${(zipResponse.data.length / 1024 / 1024).toFixed(2)} MB)`);

            fs.writeFileSync(zipPath, zipResponse.data);

            // 3. Entpacke ZIP
            this.logger?.info('Entpacke Update-Archiv...');

            let zl;
            try {
                zl = require('zip-lib');
            } catch (error) {
                throw new Error('zip-lib ist nicht installiert. Bitte führe "npm install" aus.');
            }

            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const unzip = new zl.Unzip();
            await unzip.extract(zipPath, tempDir);

            this.logger?.info('Archiv erfolgreich entpackt');

            // 4. Finde extrahierten Ordner (GitHub ZIP enthält root-Ordner mit Repo-Namen)
            const entries = fs.readdirSync(tempDir);
            const extractedDir = entries.find(e => {
                const fullPath = path.join(tempDir, e);
                return fs.statSync(fullPath).isDirectory();
            });

            if (!extractedDir) {
                throw new Error('Extrahierter Ordner nicht gefunden. Gefundene Einträge: ' + entries.join(', '));
            }

            const sourceDir = path.join(tempDir, extractedDir);
            this.logger?.info(`Quelldaten gefunden in: ${extractedDir}`);

            // 5. Kopiere Dateien (außer user_data/ und user_configs/)
            this.logger?.info('Kopiere aktualisierte Dateien...');

            const entriesToCopy = fs.readdirSync(sourceDir);
            const excludeDirs = ['user_data', 'user_configs', 'node_modules', '.git', '.backups', '.update-temp'];

            let copiedCount = 0;
            for (const entry of entriesToCopy) {
                if (excludeDirs.includes(entry)) {
                    this.logger?.info(`Überspringe: ${entry}`);
                    continue;
                }

                const srcPath = path.join(sourceDir, entry);
                const destPath = path.join(this.projectRoot, entry);

                // Lösche Ziel falls existiert (außer Verzeichnisse die wir behalten wollen)
                if (fs.existsSync(destPath) && !excludeDirs.includes(entry)) {
                    fs.rmSync(destPath, { recursive: true, force: true });
                }

                // Kopiere neu
                this.copyRecursive(srcPath, destPath);
                copiedCount++;
                this.logger?.info(`Kopiert: ${entry}`);
            }

            this.logger?.info(`${copiedCount} Einträge erfolgreich kopiert`);

            // 6. Cleanup
            this.logger?.info('Räume temporäre Dateien auf...');
            if (fs.existsSync(zipPath)) {
                fs.rmSync(zipPath, { force: true });
            }
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }

            this.logger?.info('ZIP-Update erfolgreich abgeschlossen!');

            return {
                success: true,
                needsDependencyUpdate: true // Bei ZIP immer Dependencies neu installieren
            };
        } catch (error) {
            // Cleanup bei Fehler
            this.logger?.error(`ZIP-Update Fehler: ${error.message}`);

            try {
                if (fs.existsSync(zipPath)) {
                    fs.rmSync(zipPath, { force: true });
                }
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            } catch (cleanupError) {
                this.logger?.warn(`Cleanup fehlgeschlagen: ${cleanupError.message}`);
            }

            throw new Error(`ZIP update fehlgeschlagen: ${error.message}`);
        }
    }

    /**
     * Aktualisiert Dependencies
     */
    async updateDependencies() {
        try {
            const packageLockPath = path.join(this.projectRoot, 'package-lock.json');
            const command = fs.existsSync(packageLockPath) ? 'npm ci' : 'npm install';

            this.logger?.info(`Führe "${command}" aus...`);

            execSync(command, {
                cwd: this.projectRoot,
                stdio: 'inherit'
            });

            this.logger?.info('Dependencies erfolgreich aktualisiert!');
        } catch (error) {
            throw new Error(`Dependency-Update fehlgeschlagen: ${error.message}`);
        }
    }

    /**
     * Rollback zu Backup
     */
    async performRollback(backupPath) {
        try {
            this.logger?.info(`Führe Rollback durch aus: ${backupPath}`);

            // Restore user_data/
            const userDataBackup = path.join(backupPath, 'user_data');
            if (fs.existsSync(userDataBackup)) {
                const userDataDest = path.join(this.projectRoot, 'user_data');
                fs.rmSync(userDataDest, { recursive: true, force: true });
                this.copyRecursive(userDataBackup, userDataDest);
                this.logger?.info('user_data/ wiederhergestellt');
            }

            // Restore user_configs/
            const userConfigsBackup = path.join(backupPath, 'user_configs');
            if (fs.existsSync(userConfigsBackup)) {
                const userConfigsDest = path.join(this.projectRoot, 'user_configs');
                fs.rmSync(userConfigsDest, { recursive: true, force: true });
                this.copyRecursive(userConfigsBackup, userConfigsDest);
                this.logger?.info('user_configs/ wiederhergestellt');
            }

            // Restore package.json, package-lock.json
            const packageFiles = ['package.json', 'package-lock.json'];
            for (const file of packageFiles) {
                const backupFile = path.join(backupPath, file);
                if (fs.existsSync(backupFile)) {
                    const destPath = path.join(this.projectRoot, file);
                    fs.copyFileSync(backupFile, destPath);
                    this.logger?.info(`${file} wiederhergestellt`);
                }
            }

            this.logger?.info('Rollback erfolgreich!');

            return {
                success: true
            };
        } catch (error) {
            this.logger?.error(`Rollback fehlgeschlagen: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Startet automatische Update-Prüfung
     */
    startAutoCheck(intervalHours = 24) {
        // Clear existing interval first
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        const intervalMs = intervalHours * 60 * 60 * 1000;

        // Initial check
        this.checkForUpdates().catch(err => {
            this.logger?.warn(`Initial update check failed: ${err.message}`);
        });

        // Periodisch prüfen
        this.checkInterval = setInterval(() => {
            this.checkForUpdates().catch(err => {
                this.logger?.warn(`Scheduled update check failed: ${err.message}`);
            });
        }, intervalMs);

        this.logger?.info(`Auto-update check gestartet (alle ${intervalHours}h)`);
    }

    /**
     * Stoppt automatische Update-Prüfung
     */
    stopAutoCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            this.logger?.info('Auto-update check gestoppt');
        }
    }
}

module.exports = UpdateManager;
