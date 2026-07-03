const fs = require('fs');
const path = require('path');
const Database = require('./database');
const ConfigPathManager = require('./config-path-manager');

/**
 * UserProfileManager - Verwaltet User-spezifische Konfigurationsdateien
 *
 * Jeder User bekommt eine eigene SQLite-Datenbank in user_configs/
 * Diese Dateien werden in einem persistenten Verzeichnis außerhalb des
 * Anwendungsverzeichnisses gespeichert, um Updates zu überleben.
 */
class UserProfileManager {
    constructor(configPathManager = null) {
        // Use provided ConfigPathManager or create a new one
        this.configPathManager = configPathManager || new ConfigPathManager();
        
        // Ensure directories exist
        this.configPathManager.ensureDirectoriesExist();
        
        // Migrate from old location if needed
        this.configPathManager.migrateFromAppDirectory();
        
        // Use persistent config directory
        this.configDir = this.configPathManager.getUserConfigsDir();
        this.activeProfilePath = path.join(this.configDir, '.active_profile');

        // Sicherstellen, dass der Config-Ordner existiert
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
    }

    /**
     * Gibt den Pfad zur Datenbank-Datei für einen User zurück
     */
    getProfilePath(username) {
        // Sanitize username (nur alphanumerisch, - und _)
        const sanitized = username.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.configDir, `${sanitized}.db`);
    }

    /**
     * Listet alle verfügbaren User-Profile auf
     */
    listProfiles() {
        if (!fs.existsSync(this.configDir)) {
            return [];
        }

        const files = fs.readdirSync(this.configDir);
        const profiles = files
            .filter(file => file.endsWith('.db'))
            .map(file => {
                const username = file.replace('.db', '');
                const filePath = path.join(this.configDir, file);
                const stats = fs.statSync(filePath);

                return {
                    username,
                    path: filePath,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    size: stats.size
                };
            })
            .sort((a, b) => b.modified - a.modified); // Neueste zuerst

        return profiles;
    }

    /**
     * Prüft, ob ein Profil existiert
     */
    profileExists(username) {
        const profilePath = this.getProfilePath(username);
        return fs.existsSync(profilePath);
    }

    /**
     * Erstellt ein neues User-Profil
     */
    createProfile(username) {
        const profilePath = this.getProfilePath(username);

        if (this.profileExists(username)) {
            throw new Error(`Profile "${username}" already exists`);
        }

        // Erstelle die Datenbank durch Initialisierung eines DatabaseManager
        // Dies stellt sicher, dass alle Tabellen und Default-Einstellungen erstellt werden
        const db = new Database(profilePath);
        db.close();

        return {
            username,
            path: profilePath,
            created: new Date()
        };
    }

    /**
     * Löscht ein User-Profil
     */
    deleteProfile(username) {
        const profilePath = this.getProfilePath(username);

        if (!this.profileExists(username)) {
            throw new Error(`Profile "${username}" does not exist`);
        }

        // Wenn dies das aktive Profil ist, löschen wir die Referenz
        const activeProfile = this.getActiveProfile();
        if (activeProfile === username) {
            this.clearActiveProfile();
        }

        // Lösche die Datenbank-Datei und zugehörige WAL/SHM Dateien
        fs.unlinkSync(profilePath);

        const walPath = `${profilePath}-wal`;
        const shmPath = `${profilePath}-shm`;

        if (fs.existsSync(walPath)) {
            fs.unlinkSync(walPath);
        }
        if (fs.existsSync(shmPath)) {
            fs.unlinkSync(shmPath);
        }

        return true;
    }

    /**
     * Setzt das aktive Profil (wird in einer versteckten Datei gespeichert)
     */
    setActiveProfile(username) {
        fs.writeFileSync(this.activeProfilePath, username, 'utf8');
    }

    /**
     * Gibt den Namen des aktiven Profils zurück
     */
    getActiveProfile() {
        if (!fs.existsSync(this.activeProfilePath)) {
            return null;
        }

        const username = fs.readFileSync(this.activeProfilePath, 'utf8').trim();

        // Validiere, dass das Profil noch existiert
        if (!this.profileExists(username)) {
            this.clearActiveProfile();
            return null;
        }

        return username;
    }

    /**
     * Löscht die Referenz zum aktiven Profil
     */
    clearActiveProfile() {
        if (fs.existsSync(this.activeProfilePath)) {
            fs.unlinkSync(this.activeProfilePath);
        }
    }

    /**
     * Migriert die alte database.db zu einem User-Profil
     */
    migrateOldDatabase(username) {
        const oldDbPath = path.join(__dirname, '..', 'database.db');

        if (!fs.existsSync(oldDbPath)) {
            return false;
        }

        const newDbPath = this.getProfilePath(username);

        if (this.profileExists(username)) {
            throw new Error(`Cannot migrate: Profile "${username}" already exists`);
        }

        // Kopiere die alte Datenbank zum neuen Profil
        fs.copyFileSync(oldDbPath, newDbPath);

        // Kopiere auch WAL und SHM Dateien falls vorhanden
        const oldWalPath = `${oldDbPath}-wal`;
        const oldShmPath = `${oldDbPath}-shm`;

        if (fs.existsSync(oldWalPath)) {
            fs.copyFileSync(oldWalPath, `${newDbPath}-wal`);
        }
        if (fs.existsSync(oldShmPath)) {
            fs.copyFileSync(oldShmPath, `${newDbPath}-shm`);
        }

        console.log(`✅ Migrated old database to profile: ${username}`);

        return true;
    }

    /**
     * Erstellt ein Backup eines Profils
     */
    backupProfile(username) {
        const profilePath = this.getProfilePath(username);

        if (!this.profileExists(username)) {
            throw new Error(`Profile "${username}" does not exist`);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(
            this.configDir,
            `${username}_backup_${timestamp}.db`
        );

        fs.copyFileSync(profilePath, backupPath);

        return {
            username,
            backupPath,
            timestamp: new Date()
        };
    }
}

module.exports = UserProfileManager;
