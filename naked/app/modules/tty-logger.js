/**
 * TTY-Logger - Platform-agnostisches, TTY-sicheres Logging-System
 * Erkennt automatisch TTY-Umgebungen und passt Ausgabe an
 */

class TTYLogger {
    constructor() {
        // TTY-Erkennung
        this.isTTY = process.stdout.isTTY || false;
        this.hasColors = this.isTTY && process.stdout.hasColors && process.stdout.hasColors();

        // Platform-Erkennung
        this.platform = process.platform;
        this.isWindows = this.platform === 'win32';
        this.isMac = this.platform === 'darwin';
        this.isLinux = this.platform === 'linux';

        // UTF-8 / Emoji-Unterstützung
        this.supportsUTF8 = this.detectUTF8Support();
        this.supportsEmojis = this.isTTY && this.supportsUTF8;

        // ANSI-Farbcodes
        this.colors = {
            reset: '\x1b[0m',
            bright: '\x1b[1m',
            dim: '\x1b[2m',
            // Farben
            black: '\x1b[30m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            white: '\x1b[37m',
            // Hintergründe
            bgRed: '\x1b[41m',
            bgGreen: '\x1b[42m',
            bgYellow: '\x1b[43m',
            bgBlue: '\x1b[44m'
        };

        // Symbole (mit Fallbacks)
        this.symbols = this.getSymbols();
    }

    /**
     * Erkennt UTF-8-Unterstützung
     */
    detectUTF8Support() {
        // Windows CMD/Powershell: Prüfe Codepage
        if (this.isWindows) {
            // UTF-8 Codepage ist 65001
            const env = process.env;
            return env.LC_ALL?.includes('UTF-8') ||
                   env.LANG?.includes('UTF-8') ||
                   env.LC_CTYPE?.includes('UTF-8');
        }

        // Linux/macOS: Prüfe Locale
        const env = process.env;
        return env.LC_ALL?.includes('UTF-8') ||
               env.LANG?.includes('UTF-8') ||
               env.LC_CTYPE?.includes('UTF-8');
    }

    /**
     * Gibt platform-spezifische Symbole zurück
     */
    getSymbols() {
        if (this.supportsEmojis) {
            return {
                check: '🔍',
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️',
                rocket: '🚀',
                package: '📦',
                download: '📥',
                update: '⬇️',
                backup: '💾',
                rollback: '⏪',
                git: '🔀',
                folder: '📁',
                file: '📄',
                clock: '⏱️',
                link: '🔗',
                star: '⭐',
                fire: '🔥',
                shield: '🛡️'
            };
        } else {
            return {
                check: '[*]',
                success: '[OK]',
                error: '[ERROR]',
                warning: '[!]',
                info: '[i]',
                rocket: '>>>',
                package: '[PKG]',
                download: '[DL]',
                update: '[UP]',
                backup: '[BAK]',
                rollback: '[<-]',
                git: '[GIT]',
                folder: '[DIR]',
                file: '[FILE]',
                clock: '[TIME]',
                link: '[LINK]',
                star: '[*]',
                fire: '[!]',
                shield: '[#]'
            };
        }
    }

    /**
     * Wendet Farbe an (nur bei TTY)
     */
    colorize(text, color) {
        if (this.hasColors && this.colors[color]) {
            return `${this.colors[color]}${text}${this.colors.reset}`;
        }
        return text;
    }

    /**
     * Loggt eine Info-Nachricht
     */
    info(message) {
        const symbol = this.symbols.info;
        const coloredSymbol = this.colorize(symbol, 'cyan');
        console.log(`${coloredSymbol} ${message}`);
    }

    /**
     * Loggt eine Erfolgs-Nachricht
     */
    success(message) {
        const symbol = this.symbols.success;
        const coloredSymbol = this.colorize(symbol, 'green');
        const coloredMessage = this.colorize(message, 'green');
        console.log(`${coloredSymbol} ${coloredMessage}`);
    }

    /**
     * Loggt eine Fehler-Nachricht
     */
    error(message) {
        const symbol = this.symbols.error;
        const coloredSymbol = this.colorize(symbol, 'red');
        const coloredMessage = this.colorize(message, 'red');
        console.error(`${coloredSymbol} ${coloredMessage}`);
    }

    /**
     * Loggt eine Warn-Nachricht
     */
    warn(message) {
        const symbol = this.symbols.warning;
        const coloredSymbol = this.colorize(symbol, 'yellow');
        const coloredMessage = this.colorize(message, 'yellow');
        console.log(`${coloredSymbol} ${coloredMessage}`);
    }

    /**
     * Loggt eine Debug-Nachricht
     */
    debug(message) {
        const symbol = this.symbols.check;
        const coloredSymbol = this.colorize(symbol, 'dim');
        const coloredMessage = this.colorize(message, 'dim');
        console.log(`${coloredSymbol} ${coloredMessage}`);
    }

    /**
     * Loggt eine Schritt-Nachricht (z.B. "[1/5]")
     */
    step(current, total, message) {
        const stepText = `[${current}/${total}]`;
        const coloredStep = this.colorize(stepText, 'blue');
        console.log(`${coloredStep} ${message}`);
    }

    /**
     * Loggt eine Header-Zeile
     */
    header(text) {
        const line = '='.repeat(50);
        console.log('');
        console.log(this.colorize(line, 'blue'));
        console.log(this.colorize(`  ${text}`, 'bright'));
        console.log(this.colorize(line, 'blue'));
        console.log('');
    }

    /**
     * Loggt eine Separator-Zeile
     */
    separator() {
        console.log(this.colorize('-'.repeat(50), 'dim'));
    }

    /**
     * Loggt Leerzeile
     */
    newLine() {
        console.log('');
    }

    /**
     * Loggt eine Box mit Text
     */
    box(title, lines) {
        const maxLength = Math.max(title.length, ...lines.map(l => l.length)) + 4;
        const border = '+' + '-'.repeat(maxLength) + '+';

        console.log(this.colorize(border, 'blue'));
        console.log(this.colorize(`| ${title.padEnd(maxLength - 2)} |`, 'bright'));
        console.log(this.colorize(border, 'blue'));

        for (const line of lines) {
            console.log(`| ${line.padEnd(maxLength - 2)} |`);
        }

        console.log(this.colorize(border, 'blue'));
    }

    /**
     * Loggt Progress-Bar
     */
    progress(current, total, message = '') {
        const percentage = Math.floor((current / total) * 100);
        const barLength = 30;
        const filledLength = Math.floor((barLength * current) / total);
        const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

        const progressText = `[${bar}] ${percentage}%`;
        const coloredProgress = this.colorize(progressText, 'cyan');

        // Clear line und schreibe neu (nur bei TTY)
        if (this.isTTY) {
            process.stdout.write(`\r${coloredProgress} ${message}`);
            if (current === total) {
                console.log(''); // Newline am Ende
            }
        } else {
            // Bei non-TTY: Nur bei Meilensteinen ausgeben
            if (current === total || percentage % 20 === 0) {
                console.log(`${progressText} ${message}`);
            }
        }
    }

    /**
     * Loggt Tabelle
     */
    table(headers, rows) {
        const columnWidths = headers.map((header, i) => {
            const maxRowWidth = Math.max(...rows.map(row => String(row[i] || '').length));
            return Math.max(header.length, maxRowWidth) + 2;
        });

        // Header
        const headerLine = headers.map((h, i) => h.padEnd(columnWidths[i])).join(' | ');
        console.log(this.colorize(headerLine, 'bright'));

        // Separator
        const separator = columnWidths.map(w => '-'.repeat(w)).join('-+-');
        console.log(this.colorize(separator, 'dim'));

        // Rows
        for (const row of rows) {
            const rowLine = row.map((cell, i) => String(cell || '').padEnd(columnWidths[i])).join(' | ');
            console.log(rowLine);
        }
    }

    /**
     * Loggt Key-Value-Paare
     */
    keyValue(key, value, color = null) {
        const paddedKey = key.padEnd(20);
        const coloredKey = this.colorize(paddedKey, 'dim');
        const coloredValue = color ? this.colorize(value, color) : value;
        console.log(`${coloredKey}: ${coloredValue}`);
    }

    /**
     * Loggt Liste
     */
    list(items, symbol = '•') {
        for (const item of items) {
            console.log(`  ${symbol} ${item}`);
        }
    }

    /**
     * Löscht Console (nur bei TTY)
     */
    clear() {
        if (this.isTTY) {
            console.clear();
        }
    }

    /**
     * Spinner (nur bei TTY)
     */
    spinner(message) {
        if (!this.isTTY) {
            console.log(message);
            return { stop: () => {} };
        }

        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let frameIndex = 0;

        const interval = setInterval(() => {
            const frame = frames[frameIndex];
            process.stdout.write(`\r${this.colorize(frame, 'cyan')} ${message}`);
            frameIndex = (frameIndex + 1) % frames.length;
        }, 80);

        return {
            stop: (finalMessage = null) => {
                clearInterval(interval);
                process.stdout.write('\r' + ' '.repeat(message.length + 5) + '\r');
                if (finalMessage) {
                    console.log(finalMessage);
                }
            }
        };
    }
}

module.exports = TTYLogger;
