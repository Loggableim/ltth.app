'use strict';

const TalkingHeadsPlugin = require('../plugins/talking-heads/main');
const AssetSpriteLibrary = require('../plugins/talking-heads/engines/asset-sprite-library');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const CacheManager = require('../plugins/talking-heads/utils/cache-manager');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createTalkingHeads({ assetRequests } = {}) {
  let spinNumber = 0;
  const plugin = Object.create(TalkingHeadsPlugin.prototype);
  plugin.config = { enabled: true, spinDurationMs: 12 };
  plugin.api = {};
  plugin.animationController = null;
  plugin.pendingAvatarSpins = new Map();
  plugin.initialAvatarPlaybackReservations = new Map();
  plugin.initialAvatarPreparations = new Map();
  plugin.committedAssignments = new Map();
  plugin.pendingGiftRerolls = new Map();
  plugin.generatedAssetCleanupTimers = new Map();
  plugin.cacheManager = { releaseGeneratedAssetOwner: jest.fn().mockResolvedValue(true) };
  plugin.logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
  plugin.io = { emit: jest.fn() };
  plugin._resolveViewerIdentity = jest.fn(() => ({ userId: 'fixture-user', username: 'Fixture' }));
  plugin._getExistingCachedAvatar = jest.fn(() => null);
  plugin.prepareAvatarAssignment = jest.fn(({ userId }) => {
    const assignment = { userId: userId || 'fixture-user', characterId: 'Fox' };
    plugin.committedAssignments.set(assignment.userId, assignment);
    return {
      created: true,
      selection: { packId: 'boba', characterId: 'Fox', options: {} },
      reason: 'assigned-voice',
      assignment
    };
  });
  plugin._createSpinId = jest.fn(() => `fixture-spin-${++spinNumber}`);
  plugin._getRelativeSpritePaths = jest.fn(sprites => sprites);
  plugin._scheduleGeneratedAssetRelease = jest.fn();
  plugin.assetSpriteLibrary = {
    getLotteryCandidates: jest.fn(() => [
      { packId: 'boba', characterId: 'Cat', options: {} },
      { packId: 'boba', characterId: 'Dog', options: {} },
      { packId: 'boba', characterId: 'Bear', options: {} }
    ]),
    getSpriteSet: assetRequests || jest.fn(async () => ({
      sprites: { idle_neutral: '/fixture.svg', happy: '/happy.svg' }
    }))
  };
  return plugin;
}

describe('Talking Heads avatar setup cancellation', () => {
  test('a pre-aborted request does not persist an assignment or reserve a user', async () => {
    const plugin = createTalkingHeads();
    const controller = new AbortController();
    controller.abort('fixture');

    const result = await plugin.prepareAvatarForPlayback({ playbackId: 'pre-aborted' }, {
      signal: controller.signal
    });

    expect(result).toEqual({ created: false, spinStatus: 'aborted' });
    expect(plugin.prepareAvatarAssignment).not.toHaveBeenCalled();
    expect(plugin.assetSpriteLibrary.getSpriteSet).not.toHaveBeenCalled();
    expect(plugin.initialAvatarPlaybackReservations.size).toBe(0);
  });

  test('an abort after assignment commit starts owner release immediately and suppresses the late spin', async () => {
    const requests = Array.from({ length: 4 }, () => deferred());
    const resolvedOwners = [];
    const assetRequests = jest.fn((selection, options) => {
      const request = requests[assetRequests.mock.calls.length - 1];
      return request.promise.then(value => {
        resolvedOwners.push(options.ownerId);
        return value;
      });
    });
    const plugin = createTalkingHeads({ assetRequests });
    const controller = new AbortController();
    const playbackId = 'late-avatar-fixture';
    const preparation = plugin.prepareAvatarForPlayback({ playbackId, userId: 'fixture-user' }, {
      signal: controller.signal
    });

    expect(plugin.prepareAvatarAssignment).toHaveBeenCalledTimes(1);
    expect(plugin.committedAssignments.get('fixture-user')).toEqual({
      userId: 'fixture-user', characterId: 'Fox'
    });
    expect(plugin.initialAvatarPlaybackReservations.get('fixture-user')).toBe(playbackId);
    expect(assetRequests).toHaveBeenCalledTimes(4);
    controller.abort('fixture-abort');
    expect(plugin.initialAvatarPlaybackReservations.has('fixture-user')).toBe(false);
    expect(plugin.initialAvatarPreparations.has(playbackId)).toBe(false);
    await new Promise(resolve => setImmediate(resolve));
    expect(plugin.cacheManager.releaseGeneratedAssetOwner).toHaveBeenCalledTimes(2);

    for (let index = 0; index < 3; index += 1) {
      requests[index].resolve({ sprites: { idle_neutral: `/fixture-${index}.svg` } });
    }
    await new Promise(resolve => setImmediate(resolve));
    expect(plugin.cacheManager.releaseGeneratedAssetOwner).toHaveBeenCalledTimes(2);

    requests[3].resolve({ sprites: { idle_neutral: '/fixture-last.svg' } });
    const result = await preparation;

    expect(result.spinStatus).toBe('aborted');
    expect(plugin.prepareAvatarAssignment).toHaveBeenCalledTimes(1);
    expect(plugin.io.emit).not.toHaveBeenCalledWith('talkingheads:avatar:spin:start', expect.anything());
    expect(plugin.pendingAvatarSpins.size).toBe(0);
    expect(plugin.initialAvatarPlaybackReservations.has('fixture-user')).toBe(false);
    expect(resolvedOwners).toHaveLength(4);
    expect(plugin.cacheManager.releaseGeneratedAssetOwner).toHaveBeenCalledTimes(2);
  });

  test('a failed candidate waits for sibling asset work before releasing its shared owner', async () => {
    const requests = Array.from({ length: 4 }, () => deferred());
    const resolvedOwners = [];
    const assetRequests = jest.fn((selection, options) => (
      requests[assetRequests.mock.calls.length - 1].promise.then(value => {
        resolvedOwners.push(options.ownerId);
        return value;
      })
    ));
    const plugin = createTalkingHeads({ assetRequests });
    const playbackId = 'candidate-failure-fixture';
    const preparation = plugin.prepareAvatarForPlayback({ playbackId, userId: 'fixture-user' });
    requests[0].resolve({ sprites: { idle_neutral: '/winner.svg' } });
    requests[1].reject(new Error('fixture candidate failed'));
    await new Promise(resolve => setImmediate(resolve));
    expect(plugin.cacheManager.releaseGeneratedAssetOwner).not.toHaveBeenCalled();

    requests[2].resolve({ sprites: { idle_neutral: '/sibling-a.svg' } });
    await new Promise(resolve => setImmediate(resolve));
    expect(plugin.cacheManager.releaseGeneratedAssetOwner).not.toHaveBeenCalled();
    requests[3].resolve({ sprites: { idle_neutral: '/sibling-b.svg' } });

    await expect(preparation).rejects.toThrow('fixture candidate failed');
    expect(resolvedOwners).toHaveLength(3);
    expect(plugin.cacheManager.releaseGeneratedAssetOwner).toHaveBeenCalledTimes(2);
    expect(plugin.initialAvatarPlaybackReservations.has('fixture-user')).toBe(false);
  });

  test('a never-resolving asset sibling does not retain the aborted reservation or defer owner-release start', async () => {
    const requests = Array.from({ length: 4 }, () => deferred());
    const assetRequests = jest.fn(() => requests[assetRequests.mock.calls.length - 1].promise);
    const plugin = createTalkingHeads({ assetRequests });
    const controller = new AbortController();
    const playbackId = 'never-resolving-assets';
    const preparation = plugin.prepareAvatarForPlayback({ playbackId, userId: 'fixture-user' }, {
      signal: controller.signal
    });
    controller.abort('fixture-abort');
    await new Promise(resolve => setImmediate(resolve));

    expect(plugin.initialAvatarPreparations.has(playbackId)).toBe(false);
    expect(plugin.initialAvatarPlaybackReservations.has('fixture-user')).toBe(false);
    expect(plugin.cacheManager.releaseGeneratedAssetOwner).toHaveBeenCalledTimes(2);
    await expect(Promise.race([
      preparation.then(() => 'settled', () => 'settled'),
      new Promise(resolve => setTimeout(() => resolve('still-pending'), 20))
    ])).resolves.toBe('still-pending');
  });

  test('asset-layer resolution after abort cannot register an owner', async () => {
    const layers = deferred();
    const controller = new AbortController();
    const registry = { materializeGeneratedAssets: jest.fn() };
    const library = Object.create(AssetSpriteLibrary.prototype);
    library.dataDir = 'fixture-data-dir';
    library.generatedAssetRegistry = registry;
    library.normalizeSelection = jest.fn(selection => selection);
    library._getFrameLayers = jest.fn(() => layers.promise);

    const spriteSet = library.getSpriteSet({ packId: 'boba', characterId: 'Fox', options: {} }, {
      ownerId: 'fixture-owner',
      signal: controller.signal
    });
    controller.abort('fixture-abort');
    layers.resolve({});

    await expect(spriteSet).rejects.toMatchObject({ name: 'AbortError' });
    expect(registry.materializeGeneratedAssets).not.toHaveBeenCalled();
  });

  test('abort during SVG composition prevents the later file write', async () => {
    const composition = deferred();
    const controller = new AbortController();
    const registry = {
      materializeGeneratedAssets: jest.fn((ownerId, paths, expiry, materialize) => materialize())
    };
    const library = Object.create(AssetSpriteLibrary.prototype);
    library.dataDir = 'fixture-data-dir';
    library.generatedAssetRegistry = registry;
    library.normalizeSelection = jest.fn(selection => selection);
    library._getFrameLayers = jest.fn().mockResolvedValue({ idle_neutral: 'fixture-layer' });
    library._composeSvg = jest.fn(() => composition.promise);
    const mkdir = jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    const access = jest.spyOn(fs, 'access').mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const writeFile = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

    try {
      const spriteSet = library.getSpriteSet({ packId: 'boba', characterId: 'Fox', options: {} }, {
        frameNames: ['idle_neutral'],
        ownerId: 'fixture-owner',
        signal: controller.signal
      });
      for (let attempt = 0; attempt < 20 && !library._composeSvg.mock.calls.length; attempt += 1) {
        await new Promise(resolve => setImmediate(resolve));
      }
      controller.abort('fixture-abort');
      composition.resolve('<svg/>');

      await expect(spriteSet).rejects.toMatchObject({ name: 'AbortError' });
      expect(registry.materializeGeneratedAssets).toHaveBeenCalledTimes(1);
      expect(writeFile).not.toHaveBeenCalled();
    } finally {
      mkdir.mockRestore();
      access.mockRestore();
      writeFile.mockRestore();
    }
  });

  test('real cache registry aborts queued registration and rolls back an in-flight owner under its lock', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'talking-heads-abort-registry-'));
    const db = new DatabaseSync(':memory:');
    const cacheManager = new CacheManager(dataDir, db, {
      info: jest.fn(), warn: jest.fn(), error: jest.fn()
    }, { cacheEnabled: true, cacheDuration: 60000 });
    await cacheManager.init();
    const firstPath = path.join(dataDir, 'avatars', 'asset_boba_abcdef123456_idle_neutral.svg');
    const queuedPath = path.join(dataDir, 'avatars', 'asset_boba_abcdef123457_idle_neutral.svg');
    const existingPath = path.join(dataDir, 'avatars', 'asset_boba_abcdef123458_idle_neutral.svg');

    try {
      let releaseLock;
      let lockStarted;
      const lockStartedPromise = new Promise(resolve => { lockStarted = resolve; });
      const lockGate = new Promise(resolve => { releaseLock = resolve; });
      const blocker = cacheManager._withGeneratedAssetLock(async () => {
        lockStarted();
        await lockGate;
      });
      await lockStartedPromise;

      const queuedController = new AbortController();
      const queuedRegistration = cacheManager.registerGeneratedAssets(
        'fixture-queued-owner', [queuedPath], Date.now() + 60000, { signal: queuedController.signal }
      );
      queuedController.abort('fixture-abort');
      releaseLock();
      await blocker;
      await expect(queuedRegistration).rejects.toMatchObject({ name: 'AbortError' });
      expect(db.prepare('SELECT owner_id FROM talking_heads_generated_assets').all()).toEqual([]);

      const controller = new AbortController();
      let materializationStarted;
      const started = new Promise(resolve => { materializationStarted = resolve; });
      let releaseMaterializer;
      const materializerGate = new Promise(resolve => { releaseMaterializer = resolve; });
      const ownerId = 'fixture-in-flight-owner';
      const materialization = cacheManager.materializeGeneratedAssets(
        ownerId,
        [firstPath],
        Date.now() + 60000,
        async () => {
          materializationStarted();
          await materializerGate;
        },
        { signal: controller.signal }
      );
      await started;
      expect(db.prepare('SELECT owner_id FROM talking_heads_generated_assets WHERE asset_path = ?')
        .all(firstPath)).toEqual([{ owner_id: ownerId }]);

      controller.abort('fixture-abort');
      const releaseAfterAbort = cacheManager.releaseGeneratedAssetOwner(ownerId);
      const lateRegistration = cacheManager.materializeGeneratedAssets(
        ownerId,
        [firstPath],
        Date.now() + 60000,
        async () => fs.writeFile(firstPath, '<svg/>'),
        { signal: controller.signal }
      );
      releaseMaterializer();

      await expect(materialization).rejects.toMatchObject({ name: 'AbortError' });
      await releaseAfterAbort;
      await expect(lateRegistration).rejects.toMatchObject({ name: 'AbortError' });
      expect(db.prepare('SELECT owner_id FROM talking_heads_generated_assets WHERE asset_path = ?')
        .all(firstPath)).toEqual([]);

      const partialPaths = [
        path.join(dataDir, 'avatars', 'asset_boba_abcdef123459_idle_neutral.svg'),
        path.join(dataDir, 'avatars', 'asset_boba_abcdef12345a_idle_neutral.svg')
      ];
      db.exec(`
        CREATE TRIGGER fixture_generated_asset_insert_failure
        BEFORE INSERT ON talking_heads_generated_assets
        WHEN NEW.owner_id = 'fixture-partial-owner'
          AND NEW.asset_path LIKE '%abcdef12345a%'
        BEGIN
          SELECT RAISE(FAIL, 'fixture insertion failure');
        END;
      `);
      await expect(cacheManager.materializeGeneratedAssets(
        'fixture-partial-owner',
        partialPaths,
        Date.now() + 60000,
        async () => { throw new Error('materializer must not run after partial registration failure'); }
      )).rejects.toThrow('fixture insertion failure');
      db.exec('DROP TRIGGER fixture_generated_asset_insert_failure');
      expect(db.prepare('SELECT owner_id FROM talking_heads_generated_assets WHERE owner_id = ?')
        .all('fixture-partial-owner')).toEqual([]);

      await expect(fs.access(firstPath)).rejects.toMatchObject({ code: 'ENOENT' });

      const existingOwner = 'fixture-existing-owner';
      await cacheManager.materializeGeneratedAssets(
        existingOwner,
        [existingPath],
        123456,
        async () => {
          await fs.mkdir(path.dirname(existingPath), { recursive: true });
          await fs.writeFile(existingPath, '<svg/>');
        }
      );
      const priorRow = db.prepare('SELECT asset_path, owner_id, created_at, expires_at FROM talking_heads_generated_assets WHERE owner_id = ?')
        .get(existingOwner);
      const retryController = new AbortController();
      let retryStarted;
      const retryStartedPromise = new Promise(resolve => { retryStarted = resolve; });
      let releaseRetry;
      const retryGate = new Promise(resolve => { releaseRetry = resolve; });
      const retry = cacheManager.materializeGeneratedAssets(
        existingOwner,
        [existingPath],
        987654,
        async () => {
          retryStarted();
          await retryGate;
        },
        { signal: retryController.signal }
      );
      await retryStartedPromise;
      expect(db.prepare('SELECT expires_at FROM talking_heads_generated_assets WHERE owner_id = ?')
        .get(existingOwner).expires_at).toBe(987654);
      retryController.abort('fixture-abort');
      releaseRetry();
      await expect(retry).rejects.toMatchObject({ name: 'AbortError' });
      expect(db.prepare('SELECT asset_path, owner_id, created_at, expires_at FROM talking_heads_generated_assets WHERE owner_id = ?')
        .get(existingOwner)).toEqual(priorRow);
      await expect(fs.access(existingPath)).resolves.toBeUndefined();
      await cacheManager.releaseGeneratedAssetOwner(existingOwner);
      await expect(fs.access(existingPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      db.close();
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  test('unload aborts in-flight setup and late asset completion only releases its leases', async () => {
    const requests = Array.from({ length: 4 }, () => deferred());
    const assetRequests = jest.fn((selection, options) => (
      requests[assetRequests.mock.calls.length - 1].promise.then(value => value)
    ));
    const plugin = createTalkingHeads({ assetRequests });
    const preparation = plugin.prepareAvatarForPlayback({
      playbackId: 'unload-avatar-preparation',
      userId: 'fixture-user'
    });
    expect(assetRequests).toHaveBeenCalledTimes(4);

    await plugin.destroy();
    expect(plugin.initialAvatarPreparations.size).toBe(0);

    requests.forEach((request, index) => request.resolve({
      sprites: { idle_neutral: `/late-${index}.svg` }
    }));
    await expect(preparation).resolves.toMatchObject({ spinStatus: 'aborted', created: true });
    expect(plugin.io.emit).not.toHaveBeenCalledWith('talkingheads:avatar:spin:start', expect.anything());
    expect(plugin.cacheManager.releaseGeneratedAssetOwner).toHaveBeenCalledTimes(2);
  });

  test('normal spin still accepts completion after reveal time', async () => {
    const plugin = createTalkingHeads();
    const onPhase = jest.fn();
    const playbackId = 'normal-avatar-spin';
    const preparation = plugin.prepareAvatarForPlayback({ playbackId, userId: 'fixture-user' }, { onPhase });

    for (let attempt = 0; attempt < 20 && !plugin.io.emit.mock.calls.some(([event]) => event === 'talkingheads:avatar:spin:start'); attempt += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
    const spinPayload = plugin.io.emit.mock.calls.find(([event]) => event === 'talkingheads:avatar:spin:start')[1];
    expect(onPhase).toHaveBeenCalledWith('spin-started');
    expect(plugin.pendingAvatarSpins.get(playbackId).spinId).toBe(spinPayload.spinId);

    await new Promise(resolve => setTimeout(resolve, spinPayload.duration + 5));
    expect(plugin._completeAvatarSpin({
      playbackId,
      userId: 'fixture-user',
      spinId: spinPayload.spinId
    })).toBe(true);
    await expect(preparation).resolves.toMatchObject({ spinStatus: 'complete' });
  });
});
