/**
 * Advanced Timer Rotator Service
 *
 * Two responsibilities, one module:
 *   1) Rotator  — keeps a ring buffer of the N most recent time-deltas per timer
 *      (with gift / override / like / follow metadata), and pushes it to OBS
 *      overlays via the `advanced-timer:rotator-snapshot` socket event.
 *   2) Threshold Effects — when |delta| exceeds the configured threshold
 *      (and direction matches), emits `advanced-timer:threshold-effect`
 *      carrying the chosen built-in animation name and the next uploaded
 *      frame URL (if any).
 *
 * The module is *passive*: it hooks into the engine's existing
 * 'time-added' / 'time-removed' events without modifying them.
 */

const MAX_SLOTS = 8;          // hard ceiling — UI clamps to 8 but be safe
const BUILTIN_ANIMATIONS = ['flame','lightning','sparks','pulse-glow','rainbow-shake','gold-flux'];

class RotatorService {
    constructor(plugin) {
        this.plugin = plugin;
        this.api = plugin.api;

        // Per-timer ring buffer of { ts, amount, sourceType, ...meta } entries
        this.history = new Map(); // timerId -> array (newest first)

        // Settings caches (loaded once at init, refreshed on save)
        this.rotatorSettings = new Map();   // timerId -> normalized settings
        this.thresholdSettings = new Map(); // timerId -> { enabled, threshold_seconds, direction, duration_ms, builtin_animation, intensity, frames, sound, lastFireMs }
        this.uploadedFrames = new Map();    // timerId -> Map<slot, {url,filename,label}>

        // Throttle for rotator snapshots (avoid flooding clients on like spam)
        this._lastSnapshot = new Map();     // timerId -> timestamp ms
        this._snapshotIntervalMs = 250;

        // Per-direction last-fire timestamp for threshold effect (cooldown)
        this._lastThresholdFire = new Map(); // timerId -> timestamp ms
        this._thresholdCooldownMs = 1500;   // global cooldown (configurable)
    }

    // ─── Initialization ──────────────────────────────────────────────────

    init() {
        try {
            this.refreshSettings();
            this.hookEngine();
            this.api.log('Rotator service ready', 'debug');
        } catch (error) {
            this.api.log(`Rotator init error: ${error.message}`, 'error');
        }
    }

    refreshSettings() {
        try {
            this.rotatorSettings.clear();
            this.thresholdSettings.clear();
            this.uploadedFrames.clear();

            const rList = this.plugin.db.loadAllRotatorSettings();
            for (const r of rList) this.rotatorSettings.set(r.timer_id, r);

            const tList = this.plugin.db.loadAllThresholdSettings();
            for (const t of tList) {
                const frames = new Map();
                for (const f of (t.uploaded_frames || [])) {
                    frames.set(f.slot, { url: f.url, filename: f.filename, label: f.label });
                }
                this.uploadedFrames.set(t.timer_id, frames);
                this.thresholdSettings.set(t.timer_id, {
                    enabled: !!t.enabled,
                    threshold_seconds: parseFloat(t.threshold_seconds) || 60,
                    direction: ['both','positive','negative'].includes(t.direction) ? t.direction : 'both',
                    duration_ms: parseInt(t.duration_ms) || 1500,
                    builtin_animation: BUILTIN_ANIMATIONS.includes(t.builtin_animation) ? t.builtin_animation : 'flame',
                    intensity: parseFloat(t.intensity) || 1.0,
                    sound: t.sound || '',
                    frames,
                    // coalesce duplicate fires from rapid-fire likes
                    _lastDirectionFire: { positive: 0, negative: 0 }
                });
            }
        } catch (error) {
            this.api.log(`Rotator refreshSettings error: ${error.message}`, 'error');
        }
    }

    getRotatorSettings(timerId) {
        return this.rotatorSettings.get(timerId) || null;
    }

    getThresholdSettings(timerId) {
        return this.thresholdSettings.get(timerId) || null;
    }

    getUploadedFrames(timerId) {
        return this.uploadedFrames.get(timerId) || new Map();
    }

    // ─── Engine subscription ─────────────────────────────────────────────

    hookEngine() {
        const engine = this.plugin.engine;
        // The engine forwards Timer events as 'timer:<eventName>'.
        engine.on('timer:time-added', (data) => this._handleDelta(data, +Math.abs(data.amount || 0)));
        engine.on('timer:time-removed', (data) => this._handleDelta(data, -Math.abs(data.amount || 0)));
    }

    _handleDelta(data, signedDelta) {
        const timerId = data && data.id;
        if (!timerId) return;
        // Normalize: gift override path uses positive signed amount, but
        // we still want to know the source meta
        const meta = data.meta || {};
        const amount = signedDelta != null ? signedDelta : parseFloat(data.amount) || 0;

        // ── Threshold check ─────────────────────────────────────────────
        const threshold = this.thresholdSettings.get(timerId);
        if (threshold && threshold.enabled) {
            const absAmount = Math.abs(amount);
            if (absAmount >= threshold.threshold_seconds) {
                const matchesDirection =
                    threshold.direction === 'both' ||
                    (threshold.direction === 'positive' && amount > 0) ||
                    (threshold.direction === 'negative' && amount < 0);
                if (matchesDirection) {
                    const lastFire = threshold._lastDirectionFire[amount >= 0 ? 'positive' : 'negative'] || 0;
                    if (Date.now() - lastFire >= this._thresholdCooldownMs) {
                        threshold._lastDirectionFire[amount >= 0 ? 'positive' : 'negative'] = Date.now();
                        this._emitThresholdEffect(timerId, amount, meta);
                    }
                }
            }
        }

        // ── Rotator ingest ──────────────────────────────────────────────
        const rotator = this.rotatorSettings.get(timerId);
        if (!rotator || !rotator.enabled) return;

        const sources = (rotator.include_sources || '').split(',').map(s => s.trim()).filter(Boolean);
        const srcType = meta.sourceType || this._inferSourceType(data.source);
        if (srcType && !sources.includes(srcType)) {
            // Skip this delta — its source isn't configured to be shown
            // But still keep an empty history entry so timestamps advance
            // (we don't want an old entry to suddenly reappear if a source is re-enabled)
        }

        const minSeconds = parseFloat(rotator.min_seconds_to_show) || 0;
        if (Math.abs(amount) < minSeconds && minSeconds > 0) return;

        // Build the slide entry
        const slide = {
            ts: Date.now(),
            amount,
            direction: amount >= 0 ? 'positive' : 'negative',
            sourceType: srcType,
            sourceRaw: data.source || null,
            meta: this._redactMeta(meta),
            sign: amount >= 0 ? '+' : '−'
        };

        let entries = this.history.get(timerId);
        if (!entries) {
            entries = [];
            this.history.set(timerId, entries);
        }
        // Add at head, trim to slot_count
        const maxKeep = Math.max(1, Math.min(MAX_SLOTS, rotator.slot_count || 1));
        entries.unshift(slide);
        if (entries.length > maxKeep) entries.length = maxKeep;

        // Throttle snapshot emission
        const lastSnap = this._lastSnapshot.get(timerId) || 0;
        if (Date.now() - lastSnap >= this._snapshotIntervalMs) {
            this._lastSnapshot.set(timerId, Date.now());
            this._emitSnapshot(timerId);
        }
    }

    _inferSourceType(sourceStr) {
        if (!sourceStr) return 'manual';
        const prefix = String(sourceStr).split(':')[0];
        if (prefix === 'gift') return 'gift';
        if (prefix === 'like') return 'like';
        if (prefix === 'follow') return 'follow';
        if (prefix === 'share') return 'share';
        if (prefix === 'subscribe') return 'subscribe';
        if (prefix === 'chat') return 'chat';
        if (prefix === 'flow') return 'flow';
        if (prefix === 'rule') return 'rule';
        return 'manual';
    }

    _redactMeta(meta) {
        if (!meta || typeof meta !== 'object') return null;
        // Keep only fields the overlay actually needs (small + non-sensitive)
        return {
            sourceType: meta.sourceType || null,
            isOverride: !!meta.isOverride,
            viaAdvancedRule: !!meta.viaAdvancedRule,
            giftId: meta.giftId != null ? Number(meta.giftId) : null,
            giftName: meta.giftName || null,
            giftImage: meta.giftImage || null,
            diamonds: meta.diamondCount || meta.coins || null,
            nickname: meta.nickname || null,
            uniqueId: meta.uniqueId || null,
            likeCount: meta.likeCount || null,
            comment: meta.comment || null
        };
    }

    // ─── Emitters ────────────────────────────────────────────────────────

    _emitSnapshot(timerId) {
        const entries = this.history.get(timerId) || [];
        const settings = this.rotatorSettings.get(timerId);
        const io = this._io();
        if (!io) return;

        io.emit('advanced-timer:rotator-snapshot', {
            timerId,
            settings: settings ? {
                enabled: !!settings.enabled,
                slot_count: settings.slot_count,
                position: settings.position,
                show_gift_images: !!settings.show_gift_images,
                show_gift_names: !!settings.show_gift_names,
                show_time_delta: !!settings.show_time_delta,
                show_source_emoji: !!settings.show_source_emoji,
                rotation_interval_ms: settings.rotation_interval_ms,
                slide_in_ms: settings.slide_in_ms,
                slide_out_ms: settings.slide_out_ms,
                fade_alpha: settings.fade_alpha,
                font_scale: settings.font_scale
            } : null,
            entries: entries.slice(0, settings ? settings.slot_count : 1)
        });
    }

    _emitThresholdEffect(timerId, amount, meta) {
        const ts = this.thresholdSettings.get(timerId);
        if (!ts) return;
        // Pick a frame to show — round-robin through uploaded frames; falls back to built-in animation.
        const frames = Array.from(ts.frames.entries()).sort((a, b) => a[0] - b[0]);
        const nextIdx = ((ts._lastFrameIdx = (ts._lastFrameIdx || 0) + 1) % Math.max(1, frames.length));
        const frameSlot = frames.length > 0 ? frames[nextIdx % frames.length] : null;

        const io = this._io();
        if (!io) return;
        io.emit('advanced-timer:threshold-effect', {
            timerId,
            amount,
            direction: amount >= 0 ? 'positive' : 'negative',
            builtin: ts.builtin_animation,
            intensity: ts.intensity,
            duration_ms: ts.duration_ms,
            // Per-shot frame URL (or null → built-in CSS animation only)
            frameUrl: frameSlot ? frameSlot[1].url : null,
            frameSlot: frameSlot ? frameSlot[0] : null,
            meta: this._redactMeta(meta),
            ts: Date.now()
        });

        // Optional sound hook — UI is responsible for triggering the actual sound;
        // we just emit a hint so overlays can decide whether to play one.
        if (ts.sound) {
            io.emit('advanced-timer:threshold-sound', { timerId, sound: ts.sound });
        }
    }

    _io() {
        try {
            if (typeof this.api.getSocketIO === 'function') return this.api.getSocketIO();
        } catch (_) { /* ignore */ }
        return null;
    }

    // ─── Settings mutation hooks ──────────────────────────────────────────

    onRotatorSaved(timerId, settings) {
        this.rotatorSettings.set(timerId, settings);
        // Push an updated snapshot immediately so connected overlays can refresh their position
        this._emitSnapshot(timerId);
    }

    onThresholdSaved(timerId, settings, uploadedFrames) {
        // Rebuild the threshold settings object with updated frames
        const frames = new Map();
        for (const f of (uploadedFrames || [])) frames.set(f.slot, { url: f.url, filename: f.filename, label: f.label });
        this.uploadedFrames.set(timerId, frames);
        this.thresholdSettings.set(timerId, {
            enabled: !!settings.enabled,
            threshold_seconds: parseFloat(settings.threshold_seconds) || 60,
            direction: settings.direction || 'both',
            duration_ms: parseInt(settings.duration_ms) || 1500,
            builtin_animation: settings.builtin_animation || 'flame',
            intensity: parseFloat(settings.intensity) || 1.0,
            sound: settings.sound || '',
            frames,
            _lastDirectionFire: { positive: 0, negative: 0 }
        });
    }

    onFrameDeleted(timerId, slot) {
        const frames = this.uploadedFrames.get(timerId);
        if (frames) frames.delete(slot);
        const ts = this.thresholdSettings.get(timerId);
        if (ts && ts.frames) ts.frames.delete(slot);
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────

    destroy() {
        try {
            const engine = this.plugin.engine;
            if (engine) {
                engine.removeAllListeners && engine.removeAllListeners('timer:time-added');
                engine.removeAllListeners && engine.removeAllListeners('timer:time-removed');
            }
        } catch (_) { /* ignore */ }
        this.history.clear();
        this.rotatorSettings.clear();
        this.thresholdSettings.clear();
        this.uploadedFrames.clear();
        this._lastSnapshot.clear();
        this._lastThresholdFire.clear();
    }
}

module.exports = RotatorService;
module.exports.MAX_SLOTS = MAX_SLOTS;
module.exports.BUILTIN_ANIMATIONS = BUILTIN_ANIMATIONS;
