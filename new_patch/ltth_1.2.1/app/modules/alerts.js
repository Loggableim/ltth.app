class AlertManager {
    constructor(io, db, logger, pluginLoader = null) {
        this.io = io;
        this.db = db;
        this.logger = logger;
        this.pluginLoader = pluginLoader;
        this.queue = [];
        this.isProcessing = false;
        this.currentAlert = null;
        this.MAX_QUEUE_SIZE = 100;
        this.QUEUE_WARNING_THRESHOLD = 80; // 80%
    }

    /**
     * Set plugin loader reference (called after plugin system is initialized)
     */
    setPluginLoader(pluginLoader) {
        this.pluginLoader = pluginLoader;
    }

    addAlert(type, data, customConfig = null) {
        try {
            // Alert-Konfiguration aus DB oder Custom-Config
            let config = customConfig;
            if (!config) {
                config = this.db.getAlertConfig(type);
            }

            // Wenn kein Config vorhanden, Default-Config erstellen
            if (!config) {
                config = this.getDefaultConfig(type);
            }

            // Alert nur hinzufuegen wenn enabled
            if (!config.enabled) {
                console.log(`Alert fuer ${type} ist deaktiviert`);
                return;
            }

            // Text-Template mit Daten rendern
            const renderedText = this.renderTemplate(config.text_template || '', data);

            // Pruefe, ob Soundboard-Plugin fuer dieses Event den Sound uebernimmt
            let soundFile = config.sound_file;
            let soundVolume = config.sound_volume || 80;

            // Verhindere doppelte Sound-Wiedergabe wenn Soundboard-Plugin aktiv ist
            try {
                if (this.pluginLoader && this.pluginLoader.isPluginEnabled && this.pluginLoader.isPluginEnabled('soundboard')) {
                    const soundboardPlugin = this.pluginLoader.getPluginInstance('soundboard');
                    if (soundboardPlugin && soundboardPlugin.soundboard) {
                        const soundboardDb = this.db;
                        const soundboardEnabled = soundboardDb.getSetting('soundboard_enabled') === 'true';

                        if (soundboardEnabled) {
                            let soundboardHasSound = false;

                            // Pruefe je nach Event-Typ, ob Soundboard einen Sound konfiguriert hat
                            if (type === 'gift' && data.giftId) {
                                const giftSound = soundboardPlugin.soundboard.getGiftSound(data.giftId);
                                soundboardHasSound = !!giftSound;
                            } else if (type === 'follow') {
                                const followSound = soundboardDb.getSetting('soundboard_follow_sound');
                                soundboardHasSound = !!followSound;
                            } else if (type === 'subscribe') {
                                const subscribeSound = soundboardDb.getSetting('soundboard_subscribe_sound');
                                soundboardHasSound = !!subscribeSound;
                            } else if (type === 'share') {
                                const shareSound = soundboardDb.getSetting('soundboard_share_sound');
                                soundboardHasSound = !!shareSound;
                            }

                            // Wenn Soundboard Sound uebernimmt, Alert ohne Sound
                            if (soundboardHasSound) {
                                soundFile = null;
                                soundVolume = 0;
                                if (this.logger) {
                                    this.logger.info(`Alert fuer ${type} (${data.giftName || data.username}): Sound durch Soundboard-Plugin uebernommen`);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                // Fehler beim Soundboard-Check ignorieren, Alert mit Sound fortsetzen
                if (this.logger) {
                    this.logger.warn(`Soundboard-Check fehlgeschlagen: ${err.message}`);
                }
            }

            // Alert-Objekt erstellen
            const alert = {
                type: type,
                data: data,
                text: renderedText,
                soundFile: soundFile,
                soundVolume: soundVolume,
                duration: (config.duration || 5) * 1000, // in Millisekunden
                image: data.giftPictureUrl || data.profilePictureUrl || null,
                timestamp: Date.now()
            };

            // Queue-Size-Limit pruefen - REJECT statt löschen
            if (this.queue.length >= this.MAX_QUEUE_SIZE) {
                const errorMsg = `Alert queue full (${this.MAX_QUEUE_SIZE}), alert rejected: ${type}`;
                if (this.logger) {
                    this.logger.error(errorMsg);
                } else {
                    console.error(`[X] ${errorMsg}`);
                }

                // Emittiere Backpressure-Event (statt Datenverlust)
                this.io.emit('alert:queue-full', {
                    type,
                    queueSize: this.queue.length,
                    maxSize: this.MAX_QUEUE_SIZE,
                    rejectedAlert: { type, text: renderedText }
                });

                return; // Alert NICHT hinzufügen
            }

            // Warning bei 80% Fuellung
            if (this.queue.length >= this.MAX_QUEUE_SIZE * (this.QUEUE_WARNING_THRESHOLD / 100)) {
                if (this.logger) {
                    this.logger.warn(`Alert queue at ${this.queue.length}/${this.MAX_QUEUE_SIZE} capacity (${Math.round(this.queue.length / this.MAX_QUEUE_SIZE * 100)}%)`);
                } else {
                    console.warn(`[!] Alert queue at ${this.queue.length}/${this.MAX_QUEUE_SIZE} capacity`);
                }

                // Emittiere Warning-Event
                this.io.emit('alert:queue-warning', {
                    queueSize: this.queue.length,
                    maxSize: this.MAX_QUEUE_SIZE,
                    percentFull: Math.round(this.queue.length / this.MAX_QUEUE_SIZE * 100)
                });
            }

            // In Queue einreihen
            this.queue.push(alert);
            console.log(`[ALERT] Alert queued: ${type} - ${renderedText} (Queue: ${this.queue.length}/${this.MAX_QUEUE_SIZE})`);

            // Verarbeitung starten
            this.processQueue();

        } catch (error) {
            if (this.logger) {
                this.logger.error('Alert Error:', error);
            } else {
                console.error('[X] Alert Error:', error.message);
            }
        }
    }

    processQueue() {
        // Wenn bereits Processing oder Queue leer
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        this.currentAlert = this.queue.shift();

        // Alert an Overlay senden
        this.io.emit('alert:show', {
            type: this.currentAlert.type,
            text: this.currentAlert.text,
            soundFile: this.currentAlert.soundFile,
            soundVolume: this.currentAlert.soundVolume,
            duration: this.currentAlert.duration,
            image: this.currentAlert.image,
            data: this.currentAlert.data
        });

        console.log(`[ALERT] Alert showing: ${this.currentAlert.type}`);

        // Nach Alert-Dauer naechsten Alert anzeigen
        setTimeout(() => {
            this.isProcessing = false;
            this.currentAlert = null;
            this.processQueue(); // Rekursiv naechsten Alert
        }, this.currentAlert.duration + 500); // +500ms Puffer zwischen Alerts
    }

    renderTemplate(template, data) {
        if (!template) {
            return this.getDefaultText(data);
        }

        let rendered = template;

        // Verfuegbare Variablen mit robusteren Fallbacks
        const variables = {
            '{username}': data.username || data.uniqueId || data.nickname || 'Viewer',
            '{nickname}': data.nickname || data.username || data.uniqueId || 'Viewer',
            '{message}': data.message || '',
            '{gift_name}': data.giftName || '',
            '{coins}': data.coins || 0,
            '{repeat_count}': data.repeatCount || 1,
            '{like_count}': data.likeCount || 1,
            '{total_coins}': data.totalCoins || 0
        };

        // Variablen ersetzen
        Object.entries(variables).forEach(([key, value]) => {
            rendered = rendered.replace(new RegExp(key, 'g'), value);
        });

        return rendered;
    }

    getDefaultText(data) {
        // Default-Texte basierend auf Event-Typ
        const username = data.username || data.uniqueId || data.nickname || 'Viewer';

        if (data.giftName) {
            return `${username} sent ${data.giftName}${data.repeatCount > 1 ? ' x' + data.repeatCount : ''}!`;
        } else if (data.message) {
            return `${username}: ${data.message}`;
        } else {
            return `${username}`;
        }
    }

    getDefaultConfig(type) {
        const defaults = {
            'gift': {
                event_type: 'gift',
                sound_file: null,
                sound_volume: 80,
                text_template: '{username} sent {gift_name} x{repeat_count}! ({coins} coins)',
                duration: 5,
                enabled: true
            },
            'follow': {
                event_type: 'follow',
                sound_file: null,
                sound_volume: 80,
                text_template: '{username} followed!',
                duration: 4,
                enabled: true
            },
            'subscribe': {
                event_type: 'subscribe',
                sound_file: null,
                sound_volume: 100,
                text_template: '{username} subscribed!',
                duration: 6,
                enabled: true
            },
            'share': {
                event_type: 'share',
                sound_file: null,
                sound_volume: 80,
                text_template: '{username} shared the stream!',
                duration: 4,
                enabled: true
            },
            'like': {
                event_type: 'like',
                sound_file: null,
                sound_volume: 50,
                text_template: '{username} liked!',
                duration: 2,
                enabled: false // Likes normalerweise deaktiviert (zu viele)
            }
        };

        return defaults[type] || {
            event_type: type,
            sound_file: null,
            sound_volume: 80,
            text_template: '{username}',
            duration: 5,
            enabled: true
        };
    }

    clearQueue() {
        this.queue = [];
        this.currentAlert = null;
        this.isProcessing = false;
        console.log('[CLEAR] Alert queue cleared');
    }

    skipCurrent() {
        if (this.currentAlert) {
            console.log('[SKIP] Skipping current alert');
            this.io.emit('alert:hide');
            this.isProcessing = false;
            this.currentAlert = null;
            this.processQueue();
        }
    }

    getQueueLength() {
        return this.queue.length;
    }

    testAlert(type, testData = {}) {
        // Test-Daten fuer verschiedene Alert-Typen
        const testDataDefaults = {
            gift: {
                username: 'TestUser',
                nickname: 'Test User',
                giftName: 'Rose',
                repeatCount: 5,
                coins: 50,
                giftPictureUrl: null
            },
            follow: {
                username: 'NewFollower',
                nickname: 'New Follower'
            },
            subscribe: {
                username: 'Subscriber123',
                nickname: 'Subscriber 123'
            },
            share: {
                username: 'ShareUser',
                nickname: 'Share User'
            }
        };

        const data = { ...testDataDefaults[type], ...testData };
        this.addAlert(type, data);
    }
}

module.exports = AlertManager;
