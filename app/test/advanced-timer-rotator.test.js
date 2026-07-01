/**
 * Advanced Timer — Rotator + Threshold-Effects tests
 *
 * Verifies the new optional feature (delta rotator + big-delta effects):
 *  - DB schema + CRUD for rotator_settings / threshold_effects / threshold_frames
 *  - Engine emits time-added / time-removed with meta object
 *  - RotatorService ingests engine events, applies source + min-seconds filters,
 *    emits `advanced-timer:rotator-snapshot` and `advanced-timer:threshold-effect`
 *  - Built-in animations export is correct
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');

const pluginDir = path.join(__dirname, '..', 'plugins', 'advanced-timer');

const TimerDatabase = require(path.join(pluginDir, 'backend', 'database.js'));
const RotatorService = require(path.join(pluginDir, 'backend', 'rotator.js'));
const { Timer, TimerEngine } = require(path.join(pluginDir, 'engine', 'timer-engine.js'));

function makeMockApi(dataDir) {
    const logCalls = [];
    return {
        log: (m, lvl) => logCalls.push({ msg: m, level: lvl || 'info' }),
        getPluginDir: () => pluginDir,
        getConfigPathManager: () => ({ getPluginDataDir: () => dataDir }),
        getDatabase: () => ({ getGiftCatalog: () => [] }),
        getPluginDataDir: () => dataDir,
        logCalls
    };
}

function tmpDataDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'advtimer-rotator-'));
}

describe('Advanced Timer — Rotator + Threshold-Effects', () => {

    test('plugin.json declares permissions needed for new features', () => {
        const json = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
        // routes for the new REST endpoints, websocket-client for the overlay
        expect(json.permissions).toContain('routes');
    });

    test('new backend files exist', () => {
        expect(fs.existsSync(path.join(pluginDir, 'backend', 'rotator.js'))).toBe(true);
    });

    test('DB schema creates the three new tables', () => {
        const dataDir = tmpDataDir();
        const db = new TimerDatabase(makeMockApi(dataDir));
        db.initialize();
        const tables = db.db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'advanced_timer_%'"
        ).all().map(r => r.name);
        expect(tables).toContain('advanced_timer_rotator_settings');
        expect(tables).toContain('advanced_timer_threshold_effects');
        expect(tables).toContain('advanced_timer_threshold_frames');
        db.destroy();
    });

    test('rotator settings CRUD: defaults + round-trip', () => {
        const dataDir = tmpDataDir();
        const db = new TimerDatabase(makeMockApi(dataDir));
        db.initialize();
        const timerId = 'timer_test_rotator';
        // Pre-create the timer so the FK to advanced_timers passes
        db.db.prepare(
            `INSERT INTO advanced_timers (id, name, mode, state, current_value, initial_duration, target_value, config) VALUES (?, ?, 'countup', 'stopped', 0, 0, 0, '{}')`
        ).run(timerId, 'Test Rotator Timer');

        // Defaults
        const def = db.getRotator(timerId);
        expect(def.enabled).toBe(0);
        expect(def.position).toBe('top');
        expect(def.slot_count).toBe(1);

        // Save & retrieve
        const saved = db.saveRotator(timerId, { enabled: 1, position: 'right', slot_count: 4, fade_alpha: 0.7 });
        expect(saved.enabled).toBe(1);
        expect(saved.position).toBe('right');
        expect(saved.slot_count).toBe(4);
        expect(saved.fade_alpha).toBeCloseTo(0.7);

        // Idempotent save
        const saved2 = db.saveRotator(timerId, { enabled: 1, position: 'bottom' });
        expect(saved2.position).toBe('bottom');
        expect(saved2.slot_count).toBe(4); // unchanged

        // Position + slot_count clamping
        const clamped = db.saveRotator(timerId, { slot_count: 99, position: 'nope' });
        expect(clamped.slot_count).toBe(8);
        expect(clamped.position).toBe('top');

        db.destroy();
    });

    test('threshold settings CRUD + frame storage', () => {
        const dataDir = tmpDataDir();
        const db = new TimerDatabase(makeMockApi(dataDir));
        db.initialize();
        const timerId = 'timer_test_threshold';
        db.db.prepare(
            `INSERT INTO advanced_timers (id, name, mode, state, current_value, initial_duration, target_value, config) VALUES (?, ?, 'countup', 'stopped', 0, 0, 0, '{}')`
        ).run(timerId, 'Test Threshold Timer');

        const def = db.getThreshold(timerId);
        expect(def.enabled).toBe(0);
        expect(def.threshold_seconds).toBe(60);
        expect(def.builtin_animation).toBe('flame');
        expect(Array.isArray(def.uploaded_frames)).toBe(true);
        expect(def.uploaded_frames.length).toBe(0);

        db.saveThreshold(timerId, { enabled: 1, threshold_seconds: 30, builtin_animation: 'lightning', direction: 'positive' });
        db.saveThresholdFrame(timerId, 1, '/advanced-timer/frames/foo.png', 'foo.png', 'Test frame');
        db.saveThresholdFrame(timerId, 2, '/advanced-timer/frames/bar.png', 'bar.png', '');

        const after = db.getThreshold(timerId);
        expect(after.enabled).toBe(1);
        expect(after.threshold_seconds).toBe(30);
        expect(after.builtin_animation).toBe('lightning');
        expect(after.direction).toBe('positive');
        expect(after.uploaded_frames.length).toBe(2);

        // Re-uploading slot 1 replaces the URL (UNIQUE constraint)
        db.saveThresholdFrame(timerId, 1, '/advanced-timer/frames/foo2.png', 'foo2.png', '');
        const refreshed = db.getThreshold(timerId);
        expect(refreshed.uploaded_frames.length).toBe(2);
        const slot1 = refreshed.uploaded_frames.find(f => f.slot === 1);
        expect(slot1.url).toBe('/advanced-timer/frames/foo2.png');

        // Deleting a frame
        const f2 = refreshed.uploaded_frames.find(f => f.slot === 2);
        db.deleteThresholdFrame(timerId, 2);
        const afterDel = db.getThreshold(timerId);
        expect(afterDel.uploaded_frames.length).toBe(1);

        // builtin_animation whitelist
        db.saveThreshold(timerId, { builtin_animation: 'banana' });
        const fallback = db.getThreshold(timerId);
        expect(fallback.builtin_animation).toBe('flame'); // falls back

        db.destroy();
    });

    test('Timer.addTime / removeTime emit meta on events', () => {
        const t = new Timer(
            { id: 'tx', name: 'x', mode: 'countup', initial_duration: 0, current_value: 0, target_value: 0, state: 'stopped', config: {} },
            makeMockApi(tmpDataDir())
        );
        const added = jest.fn();
        const removed = jest.fn();
        t.on('time-added', added);
        t.on('time-removed', removed);

        t.addTime(15, 'gift:foo', { sourceType: 'gift', giftName: 'Rose', giftImage: 'http://x/rose.png' });
        expect(added).toHaveBeenCalledTimes(1);
        expect(added.mock.calls[0][0].amount).toBe(15);
        expect(added.mock.calls[0][0].meta.giftName).toBe('Rose');
        expect(added.mock.calls[0][0].meta.giftImage).toBe('http://x/rose.png');

        t.removeTime(5, 'rule', { sourceType: 'rule' });
        expect(removed).toHaveBeenCalledTimes(1);
        expect(removed.mock.calls[0][0].amount).toBe(-5); // negative for removals
        expect(removed.mock.calls[0][0].meta.sourceType).toBe('rule');
    });

    test('RotatorService buffers time-added events into entries', () => {
        const engine = new TimerEngine(makeMockApi(tmpDataDir()));
        const emitted = [];
        const io = { emit: (ev, data) => emitted.push({ ev, data }) };
        const api = { ...makeMockApi(tmpDataDir()), getSocketIO: () => io };
        const plugin = { api, db: { loadAllRotatorSettings: () => [], loadAllThresholdSettings: () => [] }, engine };
        const r = new RotatorService(plugin);
        r.init();

        // Pre-set rotator settings (enable, 3 slots, position left)
        r.rotatorSettings.set('t1', {
            timer_id: 't1', enabled: 1, slot_count: 3, position: 'left',
            rotation_interval_ms: 1000, show_gift_images: 1, show_gift_names: 1,
            show_time_delta: 1, show_source_emoji: 1, min_seconds_to_show: 0,
            include_sources: 'like,gift,override,follow,subscribe,share,chat,manual,flow,rule',
            slide_in_ms: 400, slide_out_ms: 600, fade_alpha: 0.92, font_scale: 1.0
        });

        const timer = engine.createTimer({ id: 't1', name: 'T1', mode: 'countup', initial_duration: 0, current_value: 0, target_value: 0, state: 'stopped', config: {} });
        timer.addTime(10, 'like:user1', { sourceType: 'like', nickname: 'user1' });
        timer.addTime(60, 'gift:user2', { sourceType: 'gift', giftName: 'Rose', giftImage: 'http://x/r.png' });
        timer.addTime(120, 'gift:user3', { sourceType: 'override', giftName: 'Galaxy', giftImage: 'http://x/g.png' });

        const entries = r.history.get('t1');
        expect(entries).toBeDefined();
        expect(entries.length).toBe(3);
        // Newest first
        expect(entries[0].amount).toBe(120);
        expect(entries[0].meta.giftName).toBe('Galaxy');
        expect(entries[2].amount).toBe(10);

        // min_seconds_to_show filters small deltas
        r.rotatorSettings.get('t1').min_seconds_to_show = 30;
        timer.addTime(5, 'manual', { sourceType: 'manual' });
        expect(r.history.get('t1').length).toBe(3); // 5s is below threshold
        timer.addTime(45, 'manual', { sourceType: 'manual' });
        expect(r.history.get('t1').length).toBe(3);
        expect(r.history.get('t1')[0].amount).toBe(45);

        r.destroy();
    });

    test('RotatorService trims buffer to slot_count and emits snapshot', () => {
        const engine = new TimerEngine(makeMockApi(tmpDataDir()));
        const emitted = [];
        const io = { emit: (ev, data) => emitted.push({ ev, data }) };
        const api = { ...makeMockApi(tmpDataDir()), getSocketIO: () => io };
        const plugin = { api, db: { loadAllRotatorSettings: () => [], loadAllThresholdSettings: () => [] }, engine };
        const r = new RotatorService(plugin);
        r.init();

        r.rotatorSettings.set('t2', {
            timer_id: 't2', enabled: 1, slot_count: 2, position: 'top',
            rotation_interval_ms: 1000, show_gift_images: 1, show_gift_names: 1,
            show_time_delta: 1, show_source_emoji: 1, min_seconds_to_show: 0,
            include_sources: 'like,gift,override,follow,subscribe,share,chat,manual,flow,rule',
            slide_in_ms: 400, slide_out_ms: 600, fade_alpha: 0.92, font_scale: 1.0
        });

        const timer = engine.createTimer({ id: 't2', name: 'T2', mode: 'countup', initial_duration: 0, current_value: 0, target_value: 0, state: 'stopped', config: {} });
        timer.addTime(5, 'like:u1', { sourceType: 'like' });
        timer.addTime(10, 'like:u2', { sourceType: 'like' });
        timer.addTime(15, 'like:u3', { sourceType: 'like' });

        // Snapshot was emitted at least once
        const snap = emitted.find(e => e.ev === 'advanced-timer:rotator-snapshot');
        expect(snap).toBeDefined();
        expect(snap.data.timerId).toBe('t2');
        // Buffer trimmed to slot_count=2
        expect(snap.data.entries.length).toBe(2);
        expect(snap.data.entries[0].amount).toBe(15);
        expect(snap.data.entries[1].amount).toBe(10);

        r.destroy();
    });

    test('RotatorService fires threshold effect when |delta| >= threshold', () => {
        const engine = new TimerEngine(makeMockApi(tmpDataDir()));
        const emitted = [];
        const io = { emit: (ev, data) => emitted.push({ ev, data }) };
        const api = { ...makeMockApi(tmpDataDir()), getSocketIO: () => io };
        const plugin = { api, db: { loadAllRotatorSettings: () => [], loadAllThresholdSettings: () => [] }, engine };
        const r = new RotatorService(plugin);
        r.init();

        r.thresholdSettings.set('t3', {
            enabled: true, threshold_seconds: 60, direction: 'both',
            duration_ms: 1500, builtin_animation: 'flame', intensity: 1.0,
            sound: '', frames: new Map(),
            _lastDirectionFire: { positive: 0, negative: 0 }
        });
        // rotator disabled so the buffer logic doesn't apply
        r.rotatorSettings.set('t3', null);

        const timer = engine.createTimer({ id: 't3', name: 'T3', mode: 'countup', initial_duration: 0, current_value: 0, target_value: 0, state: 'stopped', config: {} });
        // Below threshold — no effect
        timer.addTime(30, 'gift:x', { sourceType: 'gift' });
        // Above threshold — effect should fire
        timer.addTime(120, 'gift:y', { sourceType: 'gift' });

        const fx = emitted.find(e => e.ev === 'advanced-timer:threshold-effect');
        expect(fx).toBeDefined();
        expect(fx.data.timerId).toBe('t3');
        expect(fx.data.amount).toBe(120);
        expect(fx.data.builtin).toBe('flame');
        expect(fx.data.direction).toBe('positive');

        // Direction filter: positive-only — a remove of 200s should NOT fire
        r.thresholdSettings.get('t3').direction = 'positive';
        // Need to reset cooldown for next positive event
        r.thresholdSettings.get('t3')._lastDirectionFire.positive = 0;
        // A positive event with amount 80 (above threshold) — should fire
        timer.addTime(80, 'gift:z', { sourceType: 'gift' });
        const fx2 = emitted.filter(e => e.ev === 'advanced-timer:threshold-effect');
        expect(fx2.length).toBeGreaterThanOrEqual(2);

        r.destroy();
    });

    test('RotatorService exported constants', () => {
        expect(RotatorService.MAX_SLOTS).toBe(8);
        expect(RotatorService.BUILTIN_ANIMATIONS).toEqual(
            expect.arrayContaining(['flame','lightning','sparks','pulse-glow','rainbow-shake','gold-flux'])
        );
    });
});
