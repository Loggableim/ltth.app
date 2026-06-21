const fs = require('fs');
const path = require('path');
const SQLite = require('better-sqlite3');
const DatabaseManager = require('./database');

class ConfigRepair {
    constructor(configPathManager, profileManager, logger = console) {
        this.configPathManager = configPathManager;
        this.profileManager = profileManager;
        this.logger = logger;
        this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.report = {
            checkedAt: new Date().toISOString(),
            configDir: configPathManager.getConfigDir(),
            repairs: [],
            warnings: [],
            errors: []
        };
    }

    runStartupRepair(options = {}) {
        const repairProfileDatabases = options.repairProfileDatabases !== false;
        this.info('Starting config folder analysis and repair');

        try {
            this.configPathManager.ensureDirectoriesExist();
            this.assertWritable(this.configPathManager.getConfigDir());
            this.repairOrphanedSqliteSidecars();
            if (repairProfileDatabases) {
                this.repairProfileDatabases(options.profileDatabaseOptions || {});
            } else {
                this.warn('Skipped profile database integrity repair during blocking startup path');
            }
            this.recoverBackedUpBrokenProfiles();
            this.repairActiveProfile();
            this.writeReportIfNeeded();
        } catch (error) {
            this.error(`Config repair failed: ${error.message}`);
        }

        this.info(`Config repair complete: ${this.report.repairs.length} repair(s), ${this.report.warnings.length} warning(s), ${this.report.errors.length} error(s)`);
        return this.report;
    }

    info(message) {
        this.logger.info?.(`[ConfigRepair] ${message}`);
    }

    warn(message) {
        this.report.warnings.push(message);
        this.logger.warn?.(`[ConfigRepair] ${message}`);
    }

    error(message) {
        this.report.errors.push(message);
        this.logger.error?.(`[ConfigRepair] ${message}`);
    }

    repair(message) {
        this.report.repairs.push(message);
        this.logger.info?.(`[ConfigRepair] ${message}`);
    }

    assertWritable(dir) {
        const testPath = path.join(dir, `.ltth_write_test_${process.pid}`);
        try {
            fs.writeFileSync(testPath, 'ok');
            fs.unlinkSync(testPath);
        } catch (error) {
            throw new Error(`Config directory is not writable: ${dir} (${error.message})`);
        }
    }

    listProfileDbFiles() {
        const dir = this.configPathManager.getUserConfigsDir();
        if (!fs.existsSync(dir)) {
            return [];
        }

        return fs.readdirSync(dir)
            .filter(file => this.isProfileDbFile(file))
            .map(file => ({
                file,
                username: file.replace(/\.db$/i, ''),
                path: path.join(dir, file),
                modified: fs.statSync(path.join(dir, file)).mtime
            }))
            .sort((a, b) => b.modified - a.modified);
    }

    isProfileDbFile(file) {
        if (!file.toLowerCase().endsWith('.db')) {
            return false;
        }

        return !file.includes('_backup_') && !file.includes('.corrupted.');
    }

    sanitizeProfileName(username) {
        return String(username || '').replace(/\.db$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    repairActiveProfile() {
        const profiles = this.listProfileDbFiles();
        const activeProfilePath = this.profileManager.activeProfilePath;

        if (profiles.length === 0) {
            if (fs.existsSync(activeProfilePath)) {
                fs.unlinkSync(activeProfilePath);
                this.repair('Removed stale active profile marker because no valid profile database exists');
            }
            return;
        }

        const rawActive = fs.existsSync(activeProfilePath)
            ? fs.readFileSync(activeProfilePath, 'utf8').trim()
            : '';
        const sanitizedActive = this.sanitizeProfileName(rawActive);
        const matched = profiles.find(profile => profile.username.toLowerCase() === sanitizedActive.toLowerCase());

        if (matched) {
            if (rawActive !== matched.username) {
                fs.writeFileSync(activeProfilePath, matched.username, 'utf8');
                this.repair(`Normalized active profile marker to "${matched.username}"`);
            }
            return;
        }

        const selected = profiles[0];
        fs.writeFileSync(activeProfilePath, selected.username, 'utf8');
        if (rawActive) {
            this.repair(`Active profile "${rawActive}" was missing; selected newest valid profile "${selected.username}"`);
        } else {
            this.repair(`Active profile marker was missing; selected newest valid profile "${selected.username}"`);
        }
    }

    repairOrphanedSqliteSidecars() {
        const dir = this.configPathManager.getUserConfigsDir();
        if (!fs.existsSync(dir)) {
            return;
        }

        for (const file of fs.readdirSync(dir)) {
            const lower = file.toLowerCase();
            if (!lower.endsWith('.db-wal') && !lower.endsWith('.db-shm')) {
                continue;
            }

            const sidecarPath = path.join(dir, file);
            const baseDbPath = sidecarPath.replace(/-(wal|shm)$/i, '');
            if (fs.existsSync(baseDbPath)) {
                continue;
            }

            const destPath = path.join(this.getRepairBackupDir('orphaned-sidecars'), file);
            this.moveFile(sidecarPath, destPath);
            this.repair(`Moved orphaned SQLite sidecar "${file}" to repair backup`);
        }
    }

    repairProfileDatabases(options = {}) {
        const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : Infinity;
        const skipUsernames = new Set(options.skipUsernames || []);
        for (const profile of this.listProfileDbFiles()) {
            if (skipUsernames.has(profile.username)) {
                this.warn(`Skipped profile database repair for active profile ${profile.file}`);
                continue;
            }

            const size = fs.statSync(profile.path).size;
            if (size > maxBytes) {
                this.warn(`Skipped profile database repair for ${profile.file}: ${size} bytes exceeds max ${maxBytes}`);
                continue;
            }
            this.repairProfileDatabase(profile);
        }
    }

    repairProfileDatabase(profile) {
        let db;
        try {
            db = new SQLite(profile.path);
            const integrity = db.pragma('integrity_check');
            const ok = Array.isArray(integrity) && integrity.length > 0 && integrity[0].integrity_check === 'ok';
            if (!ok) {
                throw new Error(`integrity_check failed: ${JSON.stringify(integrity)}`);
            }

            this.checkpointWal(db, profile.file);
            this.repairCopiedConfigPaths(db, profile.file);
        } catch (error) {
            if (db) {
                try { db.close(); } catch (closeError) { this.warn(`Failed to close ${profile.file}: ${closeError.message}`); }
            }
            const quarantine = this.quarantineBrokenProfile(profile, error);
            if (quarantine?.dbPath) {
                this.recoverBrokenProfileDatabase(quarantine.dbPath, profile.username, {
                    activate: this.wasActiveProfile(profile.username),
                    reason: `startup quarantine of ${profile.file}`
                });
            }
            return;
        }

        try {
            db.close();
        } catch (error) {
            this.warn(`Failed to close ${profile.file}: ${error.message}`);
        }
    }

    checkpointWal(db, profileFile) {
        try {
            db.pragma('wal_checkpoint(TRUNCATE)');
        } catch (error) {
            this.warn(`Could not checkpoint WAL for ${profileFile}: ${error.message}`);
        }
    }

    repairCopiedConfigPaths(db, profileFile) {
        const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
        if (!table) {
            return;
        }

        const rows = db.prepare('SELECT key, value FROM settings').all();
        const update = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
        let changed = 0;

        const transaction = db.transaction(() => {
            for (const row of rows) {
                if (typeof row.value !== 'string') {
                    continue;
                }

                const repaired = this.rewriteCopiedConfigPath(row.value);
                if (repaired !== row.value) {
                    update.run(repaired, row.key);
                    changed++;
                }
            }
        });

        transaction();

        if (changed > 0) {
            this.repair(`Rewrote ${changed} copied config path setting(s) in ${profileFile}`);
        }
    }

    rewriteCopiedConfigPath(value) {
        const currentConfigDir = this.configPathManager.getConfigDir();
        const currentEscaped = currentConfigDir.replace(/\\/g, '\\\\');

        return value
            .replace(/[A-Za-z]:\\Users\\[^\\]+\\AppData\\Local\\pupcidslittletiktokhelper/gi, () => currentConfigDir)
            .replace(/[A-Za-z]:\\\\Users\\\\[^\\]+\\\\AppData\\\\Local\\\\pupcidslittletiktokhelper/gi, () => currentEscaped);
    }

    quarantineBrokenProfile(profile, error) {
        this.warn(`Profile database "${profile.file}" could not be opened or failed integrity check: ${error.message}`);

        const backupDir = this.getRepairBackupDir('broken-profiles');
        const files = [profile.path, `${profile.path}-wal`, `${profile.path}-shm`];
        let movedAny = false;
        let dbPath = null;

        for (const source of files) {
            if (!fs.existsSync(source)) {
                continue;
            }

            const dest = path.join(backupDir, path.basename(source));
            try {
                this.moveFile(source, dest);
                movedAny = true;
                if (source === profile.path) {
                    dbPath = dest;
                }
            } catch (moveError) {
                this.error(`Could not move broken profile file ${source}: ${moveError.message}`);
            }
        }

        if (movedAny) {
            this.repair(`Moved broken profile "${profile.file}" to ${backupDir}`);
        }

        return { backupDir, dbPath };
    }

    recoverBackedUpBrokenProfiles() {
        const repairBackupsDir = path.join(this.configPathManager.getConfigDir(), 'repair_backups');
        if (!fs.existsSync(repairBackupsDir)) {
            return;
        }

        const ledger = this.readRecoveryLedger();
        const candidates = [];

        for (const timestampDir of fs.readdirSync(repairBackupsDir)) {
            const brokenDir = path.join(repairBackupsDir, timestampDir, 'broken-profiles');
            if (!fs.existsSync(brokenDir)) {
                continue;
            }

            for (const file of fs.readdirSync(brokenDir)) {
                if (!this.isProfileDbFile(file)) {
                    continue;
                }

                const sourcePath = path.join(brokenDir, file);
                const stat = fs.statSync(sourcePath);
                candidates.push({
                    sourcePath,
                    username: this.sanitizeProfileName(file.replace(/\.db$/i, '')),
                    modified: stat.mtime,
                    sourceId: this.getRecoverySourceId(sourcePath, stat)
                });
            }
        }

        candidates.sort((a, b) => b.modified - a.modified);

        for (const candidate of candidates) {
            if (ledger.sources[candidate.sourceId]) {
                continue;
            }

            const livePath = this.getProfilePath(candidate.username);
            if (fs.existsSync(livePath) && candidate.username.toLowerCase() !== 'default') {
                ledger.sources[candidate.sourceId] = {
                    skippedAt: new Date().toISOString(),
                    reason: 'live profile already exists',
                    profile: candidate.username
                };
                continue;
            }

            const active = this.getRawActiveProfile();
            const shouldActivate = !active || active.toLowerCase() === 'default';
            const recovered = this.recoverBrokenProfileDatabase(candidate.sourcePath, candidate.username, {
                activate: shouldActivate,
                reason: 'previous repair backup'
            });

            if (recovered) {
                ledger.sources[candidate.sourceId] = {
                    recoveredAt: new Date().toISOString(),
                    source: candidate.sourcePath,
                    target: recovered.targetPath,
                    profile: recovered.username
                };
            }
        }

        this.writeRecoveryLedger(ledger);
    }

    recoverBrokenProfileDatabase(sourcePath, username, options = {}) {
        const sourceInfo = this.inspectRecoverableDatabase(sourcePath);
        if (!sourceInfo.ok) {
            this.warn(`Could not recover "${path.basename(sourcePath)}": ${sourceInfo.error}`);
            return null;
        }

        const target = this.resolveRecoveryTarget(username);
        if (target.existed) {
            this.backupRecoveryTarget(target.path, target.username);
        } else {
            this.createFreshProfileDatabase(target.path, target.username);
        }

        const copied = this.copyRecoverableTables(sourcePath, target.path, sourceInfo.tables);
        if (copied.rows === 0) {
            if (!target.existed && fs.existsSync(target.path)) {
                fs.unlinkSync(target.path);
            }
            this.warn(`Recovery from "${path.basename(sourcePath)}" copied no rows; leaving backup untouched`);
            return null;
        }

        if (options.activate) {
            fs.writeFileSync(this.profileManager.activeProfilePath, target.username, 'utf8');
            this.repair(`Activated recovered profile "${target.username}"`);
        }

        this.repair(`Recovered ${copied.rows} row(s) from broken profile backup "${path.basename(sourcePath)}" into profile "${target.username}" (${copied.tables} table(s))`);
        return {
            username: target.username,
            targetPath: target.path,
            rows: copied.rows,
            tables: copied.tables,
            reason: options.reason || 'recovery'
        };
    }

    inspectRecoverableDatabase(sourcePath) {
        let db;
        try {
            db = new SQLite(sourcePath, { readonly: true, fileMustExist: true });
            const tables = db.prepare(`
                SELECT name, sql
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'sqlite_%'
                  AND sql IS NOT NULL
                ORDER BY name
            `).all();

            return { ok: tables.length > 0, tables, error: tables.length > 0 ? null : 'no readable user tables found' };
        } catch (error) {
            return { ok: false, tables: [], error: error.message };
        } finally {
            if (db) {
                try { db.close(); } catch { /* ignore */ }
            }
        }
    }

    resolveRecoveryTarget(username) {
        const sanitized = this.sanitizeProfileName(username) || 'recovered';
        const preferredPath = this.getProfilePath(sanitized);

        if (!fs.existsSync(preferredPath)) {
            return { username: sanitized, path: preferredPath, existed: false };
        }

        if (sanitized.toLowerCase() === 'default') {
            return { username: sanitized, path: preferredPath, existed: true };
        }

        for (let index = 1; index < 1000; index++) {
            const candidate = `${sanitized}_recovered${index === 1 ? '' : `_${index}`}`;
            const candidatePath = this.getProfilePath(candidate);
            if (!fs.existsSync(candidatePath)) {
                return { username: candidate, path: candidatePath, existed: false };
            }
        }

        throw new Error(`Could not choose recovery target for profile "${username}"`);
    }

    createFreshProfileDatabase(targetPath, username) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        const db = new DatabaseManager(targetPath, username);
        db.close();
    }

    backupRecoveryTarget(targetPath, username) {
        if (!fs.existsSync(targetPath)) {
            return;
        }

        const backupDir = this.getRepairBackupDir('recovery-target-backups');
        for (const source of [targetPath, `${targetPath}-wal`, `${targetPath}-shm`]) {
            if (!fs.existsSync(source)) {
                continue;
            }
            const dest = path.join(backupDir, `${username}.${path.basename(source)}`);
            fs.copyFileSync(source, this.uniquePath(dest));
        }
    }

    copyRecoverableTables(sourcePath, targetPath, sourceTables) {
        const targetDb = new SQLite(targetPath);
        let copiedTables = 0;
        let copiedRows = 0;

        try {
            targetDb.pragma('foreign_keys = OFF');
            targetDb.prepare('ATTACH DATABASE ? AS source').run(sourcePath);

            const copyTransaction = targetDb.transaction(() => {
                for (const table of sourceTables) {
                    const tableName = table.name;
                    if (!this.ensureRecoveryTargetTable(targetDb, table)) {
                        continue;
                    }

                    const sourceColumns = this.getTableColumns(targetDb, 'source', tableName);
                    const targetColumns = this.getTableColumns(targetDb, 'main', tableName);
                    const commonColumns = sourceColumns.filter(column => targetColumns.includes(column));
                    if (commonColumns.length === 0) {
                        continue;
                    }

                    const tableSql = this.quoteIdentifier(tableName);
                    const columnsSql = commonColumns.map(column => this.quoteIdentifier(column)).join(', ');
                    const copySql = `
                        INSERT OR REPLACE INTO main.${tableSql} (${columnsSql})
                        SELECT ${columnsSql} FROM source.${tableSql}
                    `;

                    try {
                        const result = targetDb.prepare(copySql).run();
                        copiedRows += result.changes;
                        copiedTables++;
                    } catch (error) {
                        const fallbackSql = `
                            INSERT OR IGNORE INTO main.${tableSql} (${columnsSql})
                            SELECT ${columnsSql} FROM source.${tableSql}
                        `;
                        try {
                            const result = targetDb.prepare(fallbackSql).run();
                            copiedRows += result.changes;
                            copiedTables++;
                            this.warn(`Recovered table "${tableName}" with INSERT OR IGNORE after conflict: ${error.message}`);
                        } catch (fallbackError) {
                            this.warn(`Could not recover table "${tableName}": ${fallbackError.message}`);
                        }
                    }
                }
            });

            copyTransaction();
            targetDb.prepare('DETACH DATABASE source').run();
            targetDb.pragma('foreign_keys = ON');
            targetDb.pragma('wal_checkpoint(TRUNCATE)');
        } finally {
            targetDb.close();
        }

        return { tables: copiedTables, rows: copiedRows };
    }

    ensureRecoveryTargetTable(targetDb, sourceTable) {
        const existing = targetDb.prepare(
            "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name = ?"
        ).get(sourceTable.name);

        if (existing) {
            return true;
        }

        if (!sourceTable.sql) {
            return false;
        }

        try {
            const createSql = sourceTable.sql.replace(/^CREATE\s+TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
            targetDb.exec(createSql);
            return true;
        } catch (error) {
            this.warn(`Could not recreate table "${sourceTable.name}" during recovery: ${error.message}`);
            return false;
        }
    }

    getTableColumns(db, schema, tableName) {
        const schemaPrefix = schema === 'source' ? 'source.' : '';
        return db.prepare(`PRAGMA ${schemaPrefix}table_info(${this.quoteIdentifier(tableName)})`)
            .all()
            .map(column => column.name);
    }

    quoteIdentifier(identifier) {
        return `"${String(identifier).replace(/"/g, '""')}"`;
    }

    getProfilePath(username) {
        if (typeof this.profileManager.getProfilePath === 'function') {
            return this.profileManager.getProfilePath(username);
        }
        return path.join(this.configPathManager.getUserConfigsDir(), `${this.sanitizeProfileName(username)}.db`);
    }

    getRawActiveProfile() {
        const activeProfilePath = this.profileManager.activeProfilePath;
        return fs.existsSync(activeProfilePath)
            ? fs.readFileSync(activeProfilePath, 'utf8').trim()
            : '';
    }

    wasActiveProfile(username) {
        return this.getRawActiveProfile().toLowerCase() === String(username || '').toLowerCase();
    }

    readRecoveryLedger() {
        const ledgerPath = this.getRecoveryLedgerPath();
        if (!fs.existsSync(ledgerPath)) {
            return { sources: {} };
        }

        try {
            const parsed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
            return parsed && typeof parsed === 'object' && parsed.sources ? parsed : { sources: {} };
        } catch {
            return { sources: {} };
        }
    }

    writeRecoveryLedger(ledger) {
        const ledgerPath = this.getRecoveryLedgerPath();
        fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
        fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    }

    getRecoveryLedgerPath() {
        return path.join(this.configPathManager.getConfigDir(), 'repair_reports', 'recovered-sources.json');
    }

    getRecoverySourceId(sourcePath, stat = fs.statSync(sourcePath)) {
        return `${path.resolve(sourcePath)}|${stat.size}|${Math.round(stat.mtimeMs)}`;
    }

    uniquePath(dest) {
        if (!fs.existsSync(dest)) {
            return dest;
        }

        const ext = path.extname(dest);
        const base = dest.slice(0, dest.length - ext.length);
        for (let index = 1; index < 1000; index++) {
            const candidate = `${base}-${index}${ext}`;
            if (!fs.existsSync(candidate)) {
                return candidate;
            }
        }

        return `${base}-${Date.now()}${ext}`;
    }

    getRepairBackupDir(category) {
        const dir = path.join(this.configPathManager.getConfigDir(), 'repair_backups', this.timestamp, category);
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    moveFile(source, dest) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });

        if (fs.existsSync(dest)) {
            const ext = path.extname(dest);
            const base = dest.slice(0, dest.length - ext.length);
            dest = `${base}-${Date.now()}${ext}`;
        }

        fs.renameSync(source, dest);
        return dest;
    }

    writeReportIfNeeded() {
        if (this.report.repairs.length === 0 && this.report.warnings.length === 0 && this.report.errors.length === 0) {
            return;
        }

        const reportDir = path.join(this.configPathManager.getConfigDir(), 'repair_reports');
        fs.mkdirSync(reportDir, { recursive: true });
        const latestPath = path.join(reportDir, 'latest-startup-repair.json');
        fs.writeFileSync(latestPath, JSON.stringify(this.report, null, 2));

        if (this.report.repairs.length > 0 || this.report.errors.length > 0) {
            const timestampedPath = path.join(reportDir, `startup-repair-${this.timestamp}.json`);
            fs.writeFileSync(timestampedPath, JSON.stringify(this.report, null, 2));
        }
    }
}

module.exports = ConfigRepair;
