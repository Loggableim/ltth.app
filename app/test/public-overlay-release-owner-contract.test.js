'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { spawnSync } = require('child_process');
const { createPluginReleasePolicy } = require('../modules/plugin-release-policy');
const { createPublicReleaseEventGuard } = require('../modules/public-overlay-release-event-policy');
const moduleDir = path.resolve(__dirname, '../modules');
const originalMapBytes = fs.readFileSync(path.join(moduleDir, 'public-overlay-release-event-owners.json'));
const mapping = JSON.parse(originalMapBytes);
const pairs = Object.entries(mapping.events).flatMap(([direction, entries]) => Object.keys(entries).map(name => [direction, name]));
const hardeningSource = fs.readFileSync(path.join(moduleDir, 'public-overlay-release-event-policy.js'), 'utf8');
const baselineSource = require('./fixtures/public-overlay-original-sources').loadOriginalSource('ownerPolicy7eb');

function evaluate(source, bytes = originalMapBytes, readError) {
  const context = {
    module: { exports: {} }, __dirname: moduleDir, Buffer,
    require(name) {
      if (name === 'fs') return { readFileSync() { if (readError) throw readError; return bytes; } };
      if (name === './public-overlay-release-event-owners.json') return JSON.parse(bytes);
      if (name.startsWith('.')) return require(path.resolve(moduleDir, name));
      return require(name);
    }
  };
  vm.runInNewContext(source, context, { filename: 'original-release-event-policy.js' });
  return context.module.exports;
}
const publicPolicy = {
  getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true }),
  isClosedBetaId: () => true
};
const baselinePublicPolicy = { getSnapshot: () => ({ publicMode: true }), isClosedBetaId: () => true };

test('baseline original body proves missing128 mappings and changed owner reopen admission', () => {
  const empty = JSON.parse(originalMapBytes);
  empty.events = { outgoing: {}, incoming: {} };
  const guard = evaluate(baselineSource, Buffer.from(JSON.stringify(empty))).createPublicReleaseEventGuard(baselinePublicPolicy);
  for (const [direction, name] of pairs) expect(guard(direction, name)).toBe(true);
  const changed = JSON.parse(originalMapBytes);
  changed.events.outgoing['story:chapter-ready'].owner = 'weather-control';
  const policy = { getSnapshot: () => ({ publicMode: true }), isClosedBetaId: owner => owner !== 'weather-control' };
  expect(evaluate(baselineSource, Buffer.from(JSON.stringify(changed))).createPublicReleaseEventGuard(policy)('outgoing', 'story:chapter-ready')).toBe(true);
});

const invalidMaps = [
  ['empty event mapping', value => { value.events = { outgoing: {}, incoming: {} }; }],
  ['missing one known event', value => { delete value.events.outgoing['story:chapter-ready']; }],
  ['unknown schema', value => { value.schemaVersion = 2; }],
  ['missing direction', value => { delete value.events.incoming; }],
  ['unknown direction', value => { value.events.other = {}; }],
  ['public owner substituted', value => { value.events.outgoing['story:chapter-ready'].owner = 'weather-control'; }],
  ['alias owner substituted without reviewed map update', value => { value.events.outgoing['streammonsters:battle_action'].owner = 'streamalchemy'; }],
  ['invalid owner type', value => { value.events.outgoing['story:chapter-ready'].owner = null; }],
  ['invented shared ownership', value => { value.events.outgoing['weather:clear'] = { owner: 'webgpu-weather-control', ownership: 'reserved-exclusive-namespace' }; }]
];
test.each(invalidMaps)('malformed map %s blocks initialization before any dispatch', (label, mutate) => {
  const value = JSON.parse(originalMapBytes);
  mutate(value);
  const dispatch = jest.fn();
  let error;
  try { evaluate(hardeningSource, Buffer.from(JSON.stringify(value))); dispatch(); } catch (caught) { error = caught; }
  expect(error.code).toBe('PUBLIC_RELEASE_EVENT_OWNER_CONTRACT_INVALID');
  expect(dispatch).not.toHaveBeenCalled();
  expect(error.message).toBe('Public release event ownership contract is unavailable');
});

test.each([
  ['JSON parse error', Buffer.from('{'), undefined],
  ['missing file', originalMapBytes, Object.assign(new Error('private filesystem detail'), { code: 'ENOENT' })],
  ['unreadable file', originalMapBytes, Object.assign(new Error('private filesystem detail'), { code: 'EACCES' })]
])('%s cannot create public transport guard or reveal filesystem details', (label, bytes, readError) => {
  expect(() => evaluate(hardeningSource, bytes, readError)).toThrow('Public release event ownership contract is unavailable');
});

test('unknown direction and unowned event names are denied', () => {
  const guard = createPublicReleaseEventGuard(publicPolicy);
  expect(guard('other', 'story:chapter-ready')).toBe(false);
  expect(guard(undefined, 'story:chapter-ready')).toBe(false);
  expect(guard('outgoing', 'weather:clear')).toBe(false);
  expect(guard('outgoing', 'musicbot:unknown')).toBe(false);
  expect(guard('outgoing', undefined)).toBe(false);
  expect(guard('outgoing', 'toString')).toBe(false);
});

test.each([
  ['throwing snapshot', { getPublicSurfaceSnapshot() { throw new ReferenceError('preinit'); } }],
  ['undefined snapshot', { getPublicSurfaceSnapshot() {} }],
  ['malformed snapshot', { getPublicSurfaceSnapshot: () => ({}) }],
  ['invalid public policy', { getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true, policyInvalid: true }), isClosedBetaId: () => false }],
  ['contradictory invalid local snapshot', { getPublicSurfaceSnapshot: () => ({ publicMode: false, publicSurface: true, policyInvalid: true }), isClosedBetaId: () => false }],
  ['undefined owner verdict', { getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true }), isClosedBetaId() {} }]
])('%s fails closed for all mapped names', (label, policy) => {
  const guard = createPublicReleaseEventGuard(policy);
  for (const [direction, name] of pairs) expect(guard(direction, name)).toBe(false);
  expect(guard('outgoing', 'weather:clear')).toBe(false);
});

test('public-surface owner policy is dynamic and independent of distribution mode', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-owner-contract-'));
  try {
    fs.mkdirSync(path.join(temp, 'config'));
    fs.copyFileSync(path.join(__dirname, '../config/plugin-release-policy.json'), path.join(temp, 'config/plugin-release-policy.json'));
    const policy = createPluginReleasePolicy({ appRoot: temp });
    const guard = createPublicReleaseEventGuard(policy);
    const configured = JSON.parse(fs.readFileSync(path.join(temp, 'config/plugin-release-policy.json'), 'utf8'));
    const betaOwners = new Set(configured.closedBeta);
    const expectMappedEvents = () => {
      for (const [direction, name] of pairs) {
        const owner = mapping.events[direction][name].owner;
        expect(guard(direction, name)).toBe(!betaOwners.has(owner));
      }
    };
    expect(policy.getSnapshot().publicMode).toBe(false);
    expect(policy.getPublicSurfaceSnapshot().publicSurface).toBe(true);
    expectMappedEvents();
    expect(policy.isClosedBetaId('streamalchemy', policy.getPublicSurfaceSnapshot())).toBe(true);
    fs.writeFileSync(path.join(temp, 'config/distribution-mode.json'), JSON.stringify({ channel: 'public' }));
    expect(policy.isClosedBetaId('streamalchemy')).toBe(true);
    expect(policy.isClosedBetaId('stream-monsters')).toBe(true);
    expectMappedEvents();
    fs.writeFileSync(path.join(temp, 'config/distribution-mode.json'), JSON.stringify({ channel: 'local' }));
    expectMappedEvents();
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test.each(['intact packaged bytes', 'malformed JSON', 'unknown schema', 'missing file'])('native Node22 require startup contract: %s', kind => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-native-owner-contract-'));
  try {
    for (const name of ['public-overlay-release-event-policy.js', 'plugin-release-policy.js', 'plugin-paths.js', 'plugin-identities.js', 'plugin-retirement.js']) {
      fs.copyFileSync(path.join(moduleDir, name), path.join(temp, name));
    }
    const packaged = fs.readFileSync(path.join(moduleDir, 'public-overlay-release-event-owners.json'));
    expect(packaged.equals(originalMapBytes)).toBe(true);
    let bytes = packaged;
    if (kind === 'malformed JSON') bytes = Buffer.from('{');
    if (kind === 'unknown schema') {
      const value = JSON.parse(packaged);
      value.schemaVersion = 2;
      bytes = Buffer.from(JSON.stringify(value));
    }
    if (kind !== 'missing file') fs.writeFileSync(path.join(temp, 'public-overlay-release-event-owners.json'), bytes);
    const body = "try { require(process.argv[1]); process.stdout.write('INITIALIZED'); } catch (e) { process.stdout.write(JSON.stringify({code:e.code,message:e.message})); process.exitCode=11; }";
    const result = spawnSync(process.execPath, ['-e', body, path.join(temp, 'public-overlay-release-event-policy.js')], { encoding: 'utf8', timeout: 3000, env: { ...process.env, NODE_OPTIONS: '' } });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    if (kind === 'intact packaged bytes') {
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('INITIALIZED');
    } else {
      expect(result.status).toBe(11);
      expect(JSON.parse(result.stdout)).toEqual({ code: 'PUBLIC_RELEASE_EVENT_OWNER_CONTRACT_INVALID', message: 'Public release event ownership contract is unavailable' });
    }
    expect(result.stderr).toBe('');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
