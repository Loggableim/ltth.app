/**
 * Action-Queue-Manager
 *
 * Verwaltet eine Priority-Queue für HybridShock Actions mit:
 * - Rate-Limiting (max X Actions pro Sekunde)
 * - Priority-basierte Verarbeitung
 * - Retry-Logic mit exponential backoff
 * - Dead-Letter-Queue für dauerhaft fehlgeschlagene Actions
 * - Queue-Statistiken und Monitoring
 */

const EventEmitter = require('events');

class ActionQueue extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            maxRatePerSecond: config.maxRatePerSecond || 10,
            maxQueueSize: config.maxQueueSize || 1000,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            retryBackoffMultiplier: config.retryBackoffMultiplier || 2,
            processingInterval: config.processingInterval || 100
        };

        // Queues
        this.queue = [];
        this.processing = false;
        this.deadLetterQueue = [];

        // Rate-Limiting
        this.actionTimestamps = [];
        this.processingTimer = null;

        // Statistics
        this.stats = {
            totalQueued: 0,
            totalProcessed: 0,
            totalSuccess: 0,
            totalFailed: 0,
            totalRetried: 0,
            currentQueueSize: 0,
            deadLetterQueueSize: 0,
            averageProcessingTime: 0,
            processingTimes: []
        };
    }

    /**
     * Action zur Queue hinzufügen
     * @param {object} action - Action-Objekt
     * @param {number} priority - Priority (höher = wichtiger)
     * @returns {boolean}
     */
    enqueue(action, priority = 0) {
        if (this.queue.length >= this.config.maxQueueSize) {
            this.emit('queue:full', { action, queueSize: this.queue.length });
            return false;
        }

        const queueItem = {
            id: this.generateId(),
            action,
            priority,
            retries: 0,
            enqueuedAt: Date.now(),
            status: 'pending'
        };

        this.queue.push(queueItem);
        this.stats.totalQueued++;
        this.stats.currentQueueSize = this.queue.length;

        // Nach Priority sortieren (höchste zuerst)
        this.queue.sort((a, b) => b.priority - a.priority);

        this.emit('queue:enqueued', queueItem);

        // Processing starten falls nicht aktiv
        if (!this.processing) {
            this.startProcessing();
        }

        return true;
    }

    /**
     * Queue-Verarbeitung starten
     */
    startProcessing() {
        if (this.processing) {
            return;
        }

        this.processing = true;
        this.emit('queue:processing:started');

        this.processingTimer = setInterval(() => {
            this.processNext();
        }, this.config.processingInterval);
    }

    /**
     * Queue-Verarbeitung stoppen
     */
    stopProcessing() {
        if (!this.processing) {
            return;
        }

        this.processing = false;
        this.emit('queue:processing:stopped');

        if (this.processingTimer) {
            clearInterval(this.processingTimer);
            this.processingTimer = null;
        }
    }

    /**
     * Nächste Action verarbeiten
     */
    async processNext() {
        // Queue leer?
        if (this.queue.length === 0) {
            this.stopProcessing();
            return;
        }

        // Rate-Limit erreicht?
        if (!this.canProcessAction()) {
            return; // Warten bis Rate-Limit OK
        }

        // Nächste Action holen (höchste Priority)
        const queueItem = this.queue.shift();
        this.stats.currentQueueSize = this.queue.length;

        queueItem.status = 'processing';
        queueItem.processingStartedAt = Date.now();

        this.emit('queue:processing', queueItem);

        try {
            // Action ausführen (via Event)
            const result = await this.executeAction(queueItem.action);

            // Erfolg
            this.handleSuccess(queueItem, result);

        } catch (error) {
            // Fehler
            this.handleError(queueItem, error);
        }
    }

    /**
     * Action ausführen (muss von außen gehookt werden)
     */
    async executeAction(action) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Action execution timeout'));
            }, 10000);

            this.emit('action:execute', action, (error, result) => {
                clearTimeout(timeout);

                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    }

    /**
     * Erfolgreiche Action-Verarbeitung
     */
    handleSuccess(queueItem, result) {
        const processingTime = Date.now() - queueItem.processingStartedAt;

        this.stats.totalProcessed++;
        this.stats.totalSuccess++;
        this.updateAverageProcessingTime(processingTime);
        this.recordActionTimestamp();

        queueItem.status = 'success';
        queueItem.result = result;
        queueItem.completedAt = Date.now();
        queueItem.processingTime = processingTime;

        this.emit('queue:success', queueItem);
    }

    /**
     * Fehlerhafte Action-Verarbeitung
     */
    async handleError(queueItem, error) {
        const processingTime = Date.now() - queueItem.processingStartedAt;

        this.recordActionTimestamp();
        this.updateAverageProcessingTime(processingTime);

        queueItem.lastError = error.message;
        queueItem.processingTime = processingTime;

        // Retry?
        if (queueItem.retries < this.config.maxRetries) {
            queueItem.retries++;
            this.stats.totalRetried++;

            // Retry-Delay berechnen (exponential backoff)
            const retryDelay = this.config.retryDelay * Math.pow(
                this.config.retryBackoffMultiplier,
                queueItem.retries - 1
            );

            queueItem.status = 'retrying';
            queueItem.retryAt = Date.now() + retryDelay;

            this.emit('queue:retry', {
                queueItem,
                retryDelay,
                error: error.message
            });

            // Nach Delay wieder in Queue
            setTimeout(() => {
                queueItem.status = 'pending';
                this.queue.push(queueItem);
                this.queue.sort((a, b) => b.priority - a.priority);
                this.stats.currentQueueSize = this.queue.length;
            }, retryDelay);

        } else {
            // Max Retries erreicht -> Dead Letter Queue
            this.stats.totalProcessed++;
            this.stats.totalFailed++;

            queueItem.status = 'failed';
            queueItem.failedAt = Date.now();

            this.deadLetterQueue.push(queueItem);
            this.stats.deadLetterQueueSize = this.deadLetterQueue.length;

            this.emit('queue:failed', queueItem);
        }
    }

    /**
     * Prüfe ob Action verarbeitet werden kann (Rate-Limit)
     */
    canProcessAction() {
        // Alte Timestamps entfernen (> 1 Sekunde)
        const now = Date.now();
        this.actionTimestamps = this.actionTimestamps.filter(
            timestamp => now - timestamp < 1000
        );

        // Rate-Limit erreicht?
        return this.actionTimestamps.length < this.config.maxRatePerSecond;
    }

    /**
     * Timestamp für verarbeitete Action speichern
     */
    recordActionTimestamp() {
        this.actionTimestamps.push(Date.now());
    }

    /**
     * Durchschnittliche Verarbeitungszeit aktualisieren
     */
    updateAverageProcessingTime(processingTime) {
        this.stats.processingTimes.push(processingTime);

        // Nur letzte 100 behalten für Rolling Average
        if (this.stats.processingTimes.length > 100) {
            this.stats.processingTimes.shift();
        }

        const sum = this.stats.processingTimes.reduce((a, b) => a + b, 0);
        this.stats.averageProcessingTime = Math.round(sum / this.stats.processingTimes.length);
    }

    /**
     * Aktuelle Rate (Actions/Sekunde) abrufen
     */
    getCurrentRate() {
        const now = Date.now();
        const recentActions = this.actionTimestamps.filter(
            timestamp => now - timestamp < 1000
        );
        return recentActions.length;
    }

    /**
     * Queue leeren
     */
    clear() {
        const clearedCount = this.queue.length;
        this.queue = [];
        this.stats.currentQueueSize = 0;

        this.emit('queue:cleared', { clearedCount });
        return clearedCount;
    }

    /**
     * Dead Letter Queue leeren
     */
    clearDeadLetterQueue() {
        const clearedCount = this.deadLetterQueue.length;
        this.deadLetterQueue = [];
        this.stats.deadLetterQueueSize = 0;

        this.emit('deadletter:cleared', { clearedCount });
        return clearedCount;
    }

    /**
     * Einzelne Action aus Queue entfernen
     */
    remove(actionId) {
        const index = this.queue.findIndex(item => item.id === actionId);
        if (index !== -1) {
            const removed = this.queue.splice(index, 1)[0];
            this.stats.currentQueueSize = this.queue.length;
            this.emit('queue:removed', removed);
            return true;
        }
        return false;
    }

    /**
     * Action-Status abrufen
     */
    getActionStatus(actionId) {
        const queueItem = this.queue.find(item => item.id === actionId);
        if (queueItem) {
            return queueItem;
        }

        const deadLetterItem = this.deadLetterQueue.find(item => item.id === actionId);
        return deadLetterItem || null;
    }

    /**
     * Queue-Status abrufen
     */
    getStatus() {
        return {
            processing: this.processing,
            queueSize: this.queue.length,
            deadLetterQueueSize: this.deadLetterQueue.length,
            currentRate: this.getCurrentRate(),
            maxRate: this.config.maxRatePerSecond,
            stats: { ...this.stats }
        };
    }

    /**
     * Dead Letter Queue Items abrufen
     */
    getDeadLetterQueue() {
        return [...this.deadLetterQueue];
    }

    /**
     * Dead Letter Queue Item requeue (erneut versuchen)
     */
    requeueDeadLetter(actionId) {
        const index = this.deadLetterQueue.findIndex(item => item.id === actionId);
        if (index === -1) {
            return false;
        }

        const item = this.deadLetterQueue.splice(index, 1)[0];
        this.stats.deadLetterQueueSize = this.deadLetterQueue.length;

        // Retries zurücksetzen
        item.retries = 0;
        item.status = 'pending';
        delete item.lastError;
        delete item.failedAt;

        this.queue.push(item);
        this.queue.sort((a, b) => b.priority - a.priority);
        this.stats.currentQueueSize = this.queue.length;

        this.emit('deadletter:requeued', item);

        if (!this.processing) {
            this.startProcessing();
        }

        return true;
    }

    /**
     * Unique ID generieren
     */
    generateId() {
        return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Statistiken zurücksetzen
     */
    resetStats() {
        this.stats = {
            totalQueued: 0,
            totalProcessed: 0,
            totalSuccess: 0,
            totalFailed: 0,
            totalRetried: 0,
            currentQueueSize: this.queue.length,
            deadLetterQueueSize: this.deadLetterQueue.length,
            averageProcessingTime: 0,
            processingTimes: []
        };

        this.emit('stats:reset');
    }

    /**
     * Cleanup & Destroy
     */
    destroy() {
        this.stopProcessing();
        this.clear();
        this.clearDeadLetterQueue();
        this.removeAllListeners();
    }
}

module.exports = ActionQueue;
