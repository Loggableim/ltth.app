const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('../modules/database');
const GiftMilestonePlugin = require('../plugins/gift-milestone/main');

function createTempDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-gift-milestone-'));
  const dbPath = path.join(dir, 'test.db');
  const db = new Database(dbPath, 'streamer-a');

  return {
    db,
    dir,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function createPlugin(db) {
  const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-gift-milestone-data-'));
  const api = {
    emit: jest.fn(),
    getDatabase: () => db,
    getPluginDataDir: () => pluginDataDir,
    ensurePluginDataDir: () => {
      fs.mkdirSync(pluginDataDir, { recursive: true });
      return pluginDataDir;
    },
    log: jest.fn()
  };

  const plugin = new GiftMilestonePlugin(api);

  return {
    plugin,
    api,
    cleanup() {
      plugin.destroy();
      fs.rmSync(pluginDataDir, { recursive: true, force: true });
    }
  };
}

describe('Gift Milestone regression coverage', () => {
  test('config updates preserve existing media paths when fields are omitted and clear them when null is explicit', () => {
    const ctx = createTempDatabase();

    try {
      ctx.db.updateMilestoneConfig({
        enabled: true,
        threshold: 1000,
        mode: 'auto_increment',
        increment_step: 1000,
        animation_gif_path: '/gift-milestone/uploads/global.gif',
        animation_video_path: '/gift-milestone/uploads/global.mp4',
        animation_audio_path: '/gift-milestone/uploads/global.mp3',
        audio_volume: 80,
        playback_mode: 'exclusive',
        animation_duration: 0,
        session_reset: false
      });

      ctx.db.updateMilestoneConfig({
        enabled: true,
        threshold: 1000,
        mode: 'auto_increment',
        increment_step: 1000,
        audio_volume: 35,
        playback_mode: 'parallel',
        animation_duration: 5000,
        session_reset: false
      });

      let config = ctx.db.getMilestoneConfig();
      expect(config.animation_gif_path).toBe('/gift-milestone/uploads/global.gif');
      expect(config.animation_video_path).toBe('/gift-milestone/uploads/global.mp4');
      expect(config.animation_audio_path).toBe('/gift-milestone/uploads/global.mp3');
      expect(config.audio_volume).toBe(35);
      expect(config.playback_mode).toBe('parallel');

      ctx.db.updateMilestoneConfig({
        ...config,
        animation_gif_path: null
      });

      config = ctx.db.getMilestoneConfig();
      expect(config.animation_gif_path).toBeNull();
      expect(config.animation_video_path).toBe('/gift-milestone/uploads/global.mp4');
      expect(config.animation_audio_path).toBe('/gift-milestone/uploads/global.mp3');
    } finally {
      ctx.cleanup();
    }
  });

  test('disabled milestone config prevents all global, user, and shared-stat counting', () => {
    const ctx = createTempDatabase();
    const pluginCtx = createPlugin(ctx.db);

    try {
      ctx.db.toggleMilestone(false);

      pluginCtx.plugin.handleGiftEvent({
        coins: 1000,
        userId: 'user-1',
        uniqueId: 'gift_sender',
        nickname: 'Gift Sender',
        profilePictureUrl: 'https://example.test/avatar.png'
      });

      expect(ctx.db.getMilestoneStats().cumulative_coins).toBe(0);
      expect(ctx.db.getUserMilestoneStats('user-1')).toBeUndefined();
      expect(ctx.db.getUserStatistics('user-1')).toBeUndefined();
      expect(pluginCtx.api.emit).not.toHaveBeenCalledWith('milestone:user-stats-update', expect.any(Object));
      expect(pluginCtx.api.emit).not.toHaveBeenCalledWith('milestone:celebrate', expect.any(Object));
    } finally {
      pluginCtx.cleanup();
      ctx.cleanup();
    }
  });

  test('single gift that reaches global and per-user thresholds emits one celebration with user tier priority', () => {
    const ctx = createTempDatabase();
    const pluginCtx = createPlugin(ctx.db);

    try {
      pluginCtx.plugin.handleGiftEvent({
        coins: 1000,
        userId: 'user-1',
        uniqueId: 'gift_sender',
        nickname: 'Gift Sender'
      });

      const celebrations = pluginCtx.api.emit.mock.calls.filter(([event]) => event === 'milestone:celebrate');
      expect(celebrations).toHaveLength(1);
      expect(celebrations[0][1]).toEqual(expect.objectContaining({
        milestone: 1000,
        tier: 'Bronze',
        userId: 'user-1',
        username: 'Gift Sender'
      }));
    } finally {
      pluginCtx.cleanup();
      ctx.cleanup();
    }
  });

  test('large first gift celebrates every reached user tier while suppressing the duplicate global celebration', () => {
    const ctx = createTempDatabase();
    const pluginCtx = createPlugin(ctx.db);

    try {
      pluginCtx.plugin.handleGiftEvent({
        coins: 6000,
        userId: 'user-1',
        uniqueId: 'gift_sender',
        nickname: 'Gift Sender'
      });

      const celebrations = pluginCtx.api.emit.mock.calls
        .filter(([event]) => event === 'milestone:celebrate')
        .map(([, payload]) => payload);

      expect(celebrations).toHaveLength(2);
      expect(celebrations.map(celebration => celebration.tier)).toEqual(['Bronze', 'Silver']);
      expect(celebrations.every(celebration => celebration.userId === 'user-1')).toBe(true);
    } finally {
      pluginCtx.cleanup();
      ctx.cleanup();
    }
  });

  test('large global gifts advance the next milestone beyond the new cumulative total', () => {
    const ctx = createTempDatabase();

    try {
      const result = ctx.db.addCoinsToMilestone(2500);
      const stats = ctx.db.getMilestoneStats();

      expect(result.triggered).toBe(true);
      expect(result.milestone).toBe(1000);
      expect(result.nextMilestone).toBe(3000);
      expect(stats.current_milestone).toBe(3000);
    } finally {
      ctx.cleanup();
    }
  });

  test('media validation enforces per-type sizes and accepts common browser MIME variants', () => {
    const ctx = createTempDatabase();
    const pluginCtx = createPlugin(ctx.db);

    try {
      expect(pluginCtx.plugin.validateUploadedMediaFile('gif', {
        originalname: 'celebration.gif',
        mimetype: 'image/gif',
        size: 25 * 1024 * 1024
      })).toEqual({ valid: true });

      expect(pluginCtx.plugin.validateUploadedMediaFile('gif', {
        originalname: 'too-big.gif',
        mimetype: 'image/gif',
        size: 25 * 1024 * 1024 + 1
      })).toEqual(expect.objectContaining({ valid: false }));

      expect(pluginCtx.plugin.validateUploadedMediaFile('video', {
        originalname: 'clip.mov',
        mimetype: 'video/quicktime',
        size: 100
      })).toEqual({ valid: true });

      expect(pluginCtx.plugin.validateUploadedMediaFile('audio', {
        originalname: 'sound.m4a',
        mimetype: 'audio/mp4',
        size: 100
      })).toEqual({ valid: true });
    } finally {
      pluginCtx.cleanup();
      ctx.cleanup();
    }
  });

  test('plugin serves uploads through lifecycle-managed routes instead of direct app middleware', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'gift-milestone', 'main.js'), 'utf8');

    expect(mainSource).not.toContain("getApp().use('/gift-milestone/uploads'");
    expect(mainSource).toContain("registerRoute('get', '/gift-milestone/uploads/:filename'");
  });

  test('admin UI escapes dynamic tier and user text before writing list markup', () => {
    const uiSource = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'gift-milestone', 'ui.js'), 'utf8');

    expect(uiSource).toContain('function escapeHtml');
    expect(uiSource).toContain('escapeHtml(tier.name)');
    expect(uiSource).toContain('escapeHtml(user.username || user.user_id)');
    expect(uiSource).toContain('encodeURIComponent(user.user_id)');
  });
});
