'use strict';

const fs = require('fs/promises');
const path = require('path');
const {
  CATEGORIES, FileSnapshotStore, SnapshotCoordinator, sha256
} = require('./snapshot-coordinator');

const emptySelection = () => Object.fromEntries(CATEGORIES.map(category => [category, false]));
const settle = () => new Promise(resolve => setImmediate(resolve));
let root;
let clock;
let store;
let coordinator;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(__dirname, 'test-tmp-'));
  clock = 1000;
  store = new FileSnapshotStore(path.join(root, 'private-artifacts'));
  coordinator = new SnapshotCoordinator({ store, now: () => clock, ttlMs: 60_000, maxArtifacts: 3, maxTotalBytes: 128 });
});
afterEach(async () => {
  if (coordinator && !coordinator.closed && coordinator.pendingGenerations === 0) await coordinator.close();
  await fs.rm(root, { recursive: true, force: true });
});

async function makePreview(overrides = {}) {
  const selection = { ...emptySelection(), pluginFiles: true };
  return coordinator.preview({
    selection, pluginFilter: ['SideKick', 'soundboard'], consents: { unknown: true },
    generate: async options => {
      expect(options.pluginFilter).toEqual(['sidekick', 'soundboard']);
      return Buffer.from('synthetic archive payload');
    },
    ...overrides
  });
}
function confirmInput(preview, overrides = {}) {
  return { operation: preview.operation, previewToken: preview.previewToken, archiveHash: preview.archiveHash,
    selection: preview.selection, pluginFilter: preview.pluginFilter, profileBinding: preview.profileBinding,
    warnings: preview.warnings, consents: { unknown: true }, ...overrides };
}

test('preview hash and confirmed download refer to identical immutable synthetic bytes', async () => {
  const preview = await makePreview();
  expect(preview.archiveHash).toBe(sha256(Buffer.from('synthetic archive payload')));
  const confirmed = await coordinator.confirm(confirmInput(preview));
  const artifact = coordinator.previews.get(preview.previewToken).artifact;
  const result = await coordinator.download({ previewToken: preview.previewToken, downloadToken: confirmed.downloadToken });
  expect(result.bytes).toEqual(Buffer.from('synthetic archive payload'));
  expect(result.archiveHash).toBe(preview.archiveHash);
  await expect(fs.access(artifact.directory)).rejects.toThrow();
});

test('selection or plugin filter mismatch invalidates preview and removes its temporary artifact', async () => {
  const preview = await makePreview();
  const artifact = coordinator.previews.get(preview.previewToken).artifact;
  await expect(coordinator.confirm(confirmInput(preview, { pluginFilter: ['other'] }))).rejects.toThrow(/selection or archive hash changed/i);
  await expect(fs.access(artifact.directory)).rejects.toThrow();
});

test('archive hash mismatch yields no bytes and removes the prepared artifact', async () => {
  const preview = await makePreview();
  const confirmed = await coordinator.confirm(confirmInput(preview));
  const artifact = coordinator.previews.get(preview.previewToken).artifact;
  await fs.writeFile(artifact.file, 'changed bytes');
  await expect(coordinator.download({ previewToken: preview.previewToken, downloadToken: confirmed.downloadToken })).rejects.toThrow(/hash mismatch/i);
  await expect(fs.access(artifact.directory)).rejects.toThrow();
});

test('confirmation and download tokens are one-time and replay is rejected', async () => {
  const preview = await makePreview();
  const confirmed = await coordinator.confirm(confirmInput(preview));
  await coordinator.download({ previewToken: preview.previewToken, downloadToken: confirmed.downloadToken });
  await expect(coordinator.download({ previewToken: preview.previewToken, downloadToken: confirmed.downloadToken })).rejects.toThrow(/invalid or already-used/i);
  await expect(coordinator.confirm(confirmInput(preview))).rejects.toThrow(/expired or already consumed/i);
});

test('expired prepared snapshots are removed and cannot be confirmed', async () => {
  const preview = await makePreview();
  const artifact = coordinator.previews.get(preview.previewToken).artifact;
  clock += 60_000;
  await expect(coordinator.confirm(confirmInput(preview))).rejects.toThrow(/expired/i);
  await expect(fs.access(artifact.directory)).rejects.toThrow();
});

test('failed and canceled synthetic generation leave no prepared files', async () => {
  await expect(makePreview({ generate: async () => { throw new Error('synthetic generation failed'); } })).rejects.toThrow(/synthetic generation failed/i);
  const controller = new AbortController();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const canceled = coordinator.preview({ selection: { ...emptySelection(), pluginFiles: true }, consents: { unknown: true },
    signal: controller.signal, generate: async () => { await waiting; return Buffer.from('should not be stored'); } });
  controller.abort();
  release();
  await expect(canceled).rejects.toThrow(/canceled/i);
  await settle();
  await expect(fs.readdir(path.join(root, 'private-artifacts'))).rejects.toThrow();
});

test('generation timeout aborts and waits for synthetic producer cleanup before releasing capacity', async () => {
  coordinator.generationTimeoutMs = 10;
  const generate = jest.fn((_options, { signal }) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve(Buffer.from('discarded')), { once: true });
  }));
  await expect(makePreview({ generate })).rejects.toThrow(/timed out/i);
  expect(coordinator.pendingGenerations).toBe(0);
  await expect(fs.readdir(path.join(root, 'private-artifacts'))).rejects.toThrow();
});

test('full, sensitive, unknown, and legacy unsigned confirmations are individually required', async () => {
  const fullSelection = Object.fromEntries(CATEGORIES.map(category => [category, true]));
  const generate = async () => Buffer.from('full synthetic bytes');
  await expect(coordinator.preview({ selection: fullSelection, profileBinding: { activeProfileId: 'profile-a' },
    consents: { sensitive: true, unknown: true }, generate })).rejects.toThrow(/full/i);
  const full = await coordinator.preview({ selection: fullSelection, profileBinding: { activeProfileId: 'profile-a', pluginIds: ['schnorrbecher'] },
    consents: { full: true, sensitive: true, unknown: true }, generate });
  expect(full.requiredConfirmations).toEqual({ full: true, sensitive: true, unknown: true, legacyUnsigned: false });
  const artifact = coordinator.previews.get(full.previewToken).artifact;
  await expect(coordinator.confirm(confirmInput(full, { consents: { full: true, unknown: true } }))).rejects.toThrow(/sensitive/i);
  await coordinator.cancel(full.previewToken);
  await expect(fs.access(artifact.directory)).rejects.toThrow();

  await expect(coordinator.preview({ selection: { ...emptySelection(), pluginFiles: true }, consents: {}, generate })).rejects.toThrow(/unknown/i);
  const unsigned = await coordinator.preview({ operation: 'import', selection: emptySelection(), risk: { legacyUnsigned: true },
    consents: { legacyUnsigned: true, unknown: true }, generate });
  await expect(coordinator.confirm(confirmInput(unsigned, { consents: {} }))).rejects.toThrow(/unknown|legacyUnsigned/i);
  const signedConsent = await coordinator.confirm(confirmInput(unsigned, { consents: { legacyUnsigned: true, unknown: true } }));
  expect(signedConsent.archiveHash).toBe(unsigned.archiveHash);
});

test('direct export facade rejects attempts without the prepared preview flow', async () => {
  const exportCalls = jest.fn();
  await expect(coordinator.directExport({ selection: emptySelection(), consents: { full: true }, exportCalls }))
    .rejects.toThrow(/requires the preview/i);
  await expect(coordinator.directExport({ previewToken: 'mismatch', archiveHash: 'bad', exportCalls }))
    .rejects.toThrow(/requires the preview/i);
  expect(exportCalls).not.toHaveBeenCalled();
});

test('UI retry of a consumed download URL cannot regenerate or serve a second archive', async () => {
  const generate = jest.fn(async () => Buffer.from('one only'));
  const preview = await makePreview({ generate });
  const confirmed = await coordinator.confirm(confirmInput(preview));
  const urlToken = { previewToken: preview.previewToken, downloadToken: confirmed.downloadToken };
  const first = await coordinator.download(urlToken);
  expect(first.bytes).toEqual(Buffer.from('one only'));
  await expect(coordinator.download(urlToken)).rejects.toThrow(/already-used/i);
  expect(generate).toHaveBeenCalledTimes(1);
});

test('profile-scoped selection requires plugin files and Schnorrbecher state requires scoped data', async () => {
  await expect(makePreview({ selection: { ...emptySelection(), profileScopedPluginData: true }, pluginFilter: null, consents: { unknown: true } })).rejects.toThrow(/requires Plugin Data Files/i);
  await expect(makePreview({ selection: { ...emptySelection(), pluginFiles: true, schnorrbecherPersistentState: true }, pluginFilter: null, consents: { unknown: true } })).rejects.toThrow(/requires profile-scoped plugin data/i);
});

test('artifact count and aggregate byte quotas bound concurrently prepared files', async () => {
  await makePreview();
  await makePreview();
  await makePreview();
  await expect(makePreview()).rejects.toThrow(/quota exceeded/i);
});

test('preparing slots and streamed byte reservations are enforced under concurrency', async () => {
  coordinator.maxArtifacts = 1;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = coordinator.preview({ selection: { ...emptySelection(), pluginFiles: true }, consents: { unknown: true },
    generate: async () => { await gate; return Buffer.from('first'); } });
  await expect(makePreview()).rejects.toThrow(/quota exceeded/i);
  release();
  await first;

  await coordinator.close();
  coordinator = new SnapshotCoordinator({ store, now: () => clock, ttlMs: 60_000, maxArtifacts: 2, maxTotalBytes: 30 });
  const options = { selection: { ...emptySelection(), pluginFiles: true }, consents: { unknown: true },
    generate: async () => Buffer.alloc(20, 7) };
  const outcomes = await Promise.allSettled([coordinator.preview(options), coordinator.preview(options)]);
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1);
});

test('aggregate byte quota blocks an oversized collection of synthetic artifacts', async () => {
  coordinator.maxTotalBytes = 40;
  await makePreview();
  await expect(makePreview()).rejects.toThrow(/byte quota exceeded/i);
});

test('late finalization warnings require a separate final confirmation bound to the preview hash', async () => {
  const preview = await makePreview({ generate: async () => ({ bytes: Buffer.from('finalized synthetic bytes'), finalized: true,
    warnings: ['late archive warning'], warningRisk: { sensitive: true } }) });
  await expect(coordinator.confirm(confirmInput(preview))).rejects.toThrow(/sensitive|warnings/i);
  await expect(coordinator.confirm(confirmInput(preview, { consents: { unknown: true, warnings: true } }))).rejects.toThrow(/sensitive/i);
  const confirmed = await coordinator.confirm(confirmInput(preview, { consents: { unknown: true, sensitive: true, warnings: true } }));
  expect(confirmed.archiveHash).toBe(preview.archiveHash);
});

test('a source swap after verification cannot change the already-read delivery bytes', async () => {
  const originalRead = store.read.bind(store);
  let reads = 0;
  store.read = async artifact => {
    const bytes = await originalRead(artifact);
    reads += 1;
    if (reads === 2) await fs.writeFile(artifact.file, 'swap after read');
    return bytes;
  };
  const preview = await makePreview();
  const confirmed = await coordinator.confirm(confirmInput(preview));
  const result = await coordinator.download({ previewToken: preview.previewToken, downloadToken: confirmed.downloadToken });
  expect(result.bytes).toEqual(Buffer.from('synthetic archive payload'));
  expect(result.archiveHash).toBe(preview.archiveHash);
});

test('clock reversal fails closed and cleans the owned artifact', async () => {
  const preview = await makePreview();
  const artifact = coordinator.previews.get(preview.previewToken).artifact;
  clock -= 1;
  await expect(coordinator.confirm(confirmInput(preview))).rejects.toThrow(/expired/i);
  await expect(fs.access(artifact.directory)).rejects.toThrow();
});

test('startup cleanup removes only marked direct children in the owned root', async () => {
  const preview = await makePreview();
  const artifact = coordinator.previews.get(preview.previewToken).artifact;
  await coordinator.cancel(preview.previewToken);
  const staleArtifact = path.join(path.dirname(artifact.directory), 'a'.repeat(48));
  await fs.mkdir(staleArtifact);
  await fs.writeFile(path.join(staleArtifact, '.ltth-export-owner'), 'ltth-eonly-export-v1\n');
  const stranger = path.join(path.dirname(artifact.directory), 'f'.repeat(48));
  await fs.mkdir(stranger);
  await store.cleanupOwnedArtifacts();
  await expect(fs.access(staleArtifact)).rejects.toThrow();
  await expect(fs.access(stranger)).resolves.toBeUndefined();
});

test('owned-root cleanup refuses to remove any path outside the configured root', async () => {
  const outside = path.join(root, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, '.ltth-export-owner'), 'ltth-eonly-export-v1\n');
  await expect(store.remove({ directory: outside })).rejects.toThrow(/outside the private artifact root/i);
  await expect(fs.access(outside)).resolves.toBeUndefined();
});

test('import confirmation is bound to final archive hash, selection, and resolved target profile', async () => {
  const selection = { ...emptySelection(), profileDatabases: true };
  const profileBinding = { sourceProfileId: 'source-a', targetProfileId: 'target-a', activeProfileId: 'active-a' };
  const preview = await coordinator.preview({ operation: 'import', selection, profileBinding,
    risk: { legacyUnsigned: true }, consents: { unknown: true, legacyUnsigned: true },
    generate: async () => Buffer.from('synthetic unsigned import archive') });
  await expect(coordinator.confirm(confirmInput(preview, { archiveHash: '0'.repeat(64), consents: { unknown: true, legacyUnsigned: true } })))
    .rejects.toThrow(/selection or archive hash changed/i);

  const second = await coordinator.preview({ operation: 'import', selection, profileBinding,
    risk: { legacyUnsigned: true }, consents: { unknown: true, legacyUnsigned: true },
    generate: async () => Buffer.from('synthetic unsigned import archive') });
  await expect(coordinator.confirm(confirmInput(second, { profileBinding: { ...profileBinding, targetProfileId: 'target-b' },
    consents: { unknown: true, legacyUnsigned: true } }))).rejects.toThrow(/selection or archive hash changed/i);
  const third = await coordinator.preview({ operation: 'import', selection, profileBinding,
    risk: { legacyUnsigned: true }, consents: { unknown: true, legacyUnsigned: true },
    generate: async () => Buffer.from('synthetic unsigned import archive') });
  const confirmed = await coordinator.confirm(confirmInput(third, { consents: { unknown: true, legacyUnsigned: true } }));
  const imported = await coordinator.consumeImport({ previewToken: third.previewToken, downloadToken: confirmed.downloadToken });
  expect(imported.bytes).toEqual(Buffer.from('synthetic unsigned import archive'));
  expect(imported.archiveHash).toBe(third.archiveHash);
  await expect(coordinator.consumeImport({ previewToken: third.previewToken, downloadToken: confirmed.downloadToken })).rejects.toThrow(/already-used/i);
});

test('direct import without proof is rejected before any synthetic import generation', async () => {
  const generate = jest.fn();
  await expect(coordinator.directImport({ generate })).rejects.toThrow(/requires the preview/i);
  await expect(coordinator.directImport({ previewToken: 'mismatch', archiveHash: 'bad', generate })).rejects.toThrow(/requires the preview/i);
  expect(generate).not.toHaveBeenCalled();
});

test('incomplete finalization and a failing archive stream never become ready artifacts', async () => {
  await expect(makePreview({ generate: async () => ({ bytes: Buffer.from('partial'), finalized: false }) }))
    .rejects.toThrow(/did not finalize/i);
  async function* brokenStream() {
    yield Buffer.from('part');
    throw new Error('synthetic late archive failure');
  }
  await expect(makePreview({ generate: async () => ({ bytes: brokenStream(), finalized: true }) }))
    .rejects.toThrow(/synthetic late archive failure/i);
  await expect(fs.readdir(path.join(root, 'private-artifacts'))).rejects.toThrow();
});

test('resolved profile identity and plugin selection are bound to the preview', async () => {
  const selection = { ...emptySelection(), profileDatabases: true };
  await expect(coordinator.preview({ selection, consents: { unknown: true }, generate: async () => Buffer.from('x') }))
    .rejects.toThrow(/active profile ID/i);
  const preview = await coordinator.preview({ selection, profileBinding: { activeProfileId: 'profile-a', pluginIds: ['timer'] },
    consents: { unknown: true }, generate: async options => Buffer.from(JSON.stringify(options.profileBinding)) });
  await expect(coordinator.confirm(confirmInput(preview, { profileBinding: { activeProfileId: 'profile-b', pluginIds: ['timer'] } })))
    .rejects.toThrow(/selection or archive hash changed/i);
});
