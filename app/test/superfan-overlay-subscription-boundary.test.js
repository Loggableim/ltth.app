const fs = require('fs');
const path = require('path');
const vm = require('vm');
const parser = require('@babel/parser');
const reviewRoot = path.resolve(__dirname, '../../..');
function method(side, file, name) {
  const source = fs.readFileSync(path.join(reviewRoot, side, 'app/plugins', file), 'utf8');
  const ast = parser.parse(source, { sourceType: 'script' });
  const clazz = ast.program.body.find(node => node.type === 'ClassDeclaration');
  const node = clazz.body.body.find(node => node.key && node.key.name === name);
  if (!node) throw new Error('Missing original method ' + name);
  const text = source.slice(node.start, node.end).replace(/^(async )?[a-zA-Z0-9_]+\(/, (_match, asyncWord) => (asyncWord || '') + 'function(');
  return vm.runInNewContext('(' + text + ')');
}
function fixture(side, family) {
  const handlers = new Map();
  const api = { registerTikTokEvent: (name, fn) => handlers.set(name, fn), log: jest.fn(), emit: jest.fn() };
  let target;
  if (family === 'spotlight') {
    target = { api, eventTypes: { subscriber: { label: 'New Subscriber' } }, sessionId: 'own-fixture', lastUsers: { subscriber: { nickname: 'Existing subscriber' } }, highVolumeEventTypes: new Set(), persistConfig: jest.fn(), broadcastOverlayUser: jest.fn(), normalizeImageUrl: () => '', extractProfilePictureUrl: () => '' };
    for (const name of ['registerEventListeners', 'handleEvent', 'extractUserData', 'saveLastUser']) target[name] = method(side, 'spotlight/main.js', name);
  } else {
    const backend = { api, settings: { full: { showSubs: true, maxLines: 10 }, chat: { maxLines: 10 } }, eventQueues: { subscribe: [{ user: { nickname: 'Existing subscriber' } }] } };
    for (const name of ['handleSubscribeEvent', 'addToQueue']) backend[name] = method(side, 'clarityhud/backend/api.js', name);
    target = { api, backend, registerEventListeners: method(side, 'clarityhud/main.js', 'registerEventListeners') };
  }
  target.registerEventListeners();
  return { handlers, api, target, send: async (name, data) => { if (handlers.has(name)) await handlers.get(name)(data); } };
}
test.each(['spotlight', 'clarityhud'])('baseline reproduces SuperFan→subscription side effect: %s', async family => {
  const f = fixture('baseline', family);
  await f.send('superfan', { username: 'synthetic', nickname: 'SuperFan join viewer', superFanEventType: 'join' });
  if (family === 'spotlight') {
    expect(f.target.lastUsers.subscriber.nickname).toBe('SuperFan join viewer');
    expect(f.target.persistConfig).toHaveBeenCalledWith('lastuser:subscriber', expect.anything());
    expect(f.target.broadcastOverlayUser).toHaveBeenCalledWith('subscriber', expect.anything());
  } else {
    expect(f.target.backend.eventQueues.subscribe).toHaveLength(2);
    expect(f.api.emit).toHaveBeenCalledWith('clarityhud.update.subscribe', expect.objectContaining({ subscribeType: 'subscribe' }));
  }
});
test.each(['spotlight', 'clarityhud'])('candidate keeps real subscribe handler and behavior: %s', async family => {
  const f = fixture('work', family);
  await f.send('subscribe', { username: 'real-sub-fixture', nickname: 'Subscriber' });
  if (family === 'spotlight') {
    expect(f.target.lastUsers.subscriber.nickname).toBe('Subscriber');
    expect(f.target.persistConfig).toHaveBeenCalledTimes(1);
    expect(f.target.broadcastOverlayUser).toHaveBeenCalledWith('subscriber', expect.objectContaining({ label: 'New Subscriber' }));
  } else {
    expect(f.target.backend.eventQueues.subscribe).toHaveLength(2);
    expect(f.api.emit).toHaveBeenCalledWith('clarityhud.update.subscribe', expect.objectContaining({ subscribeType: 'subscribe' }));
  }
});
test.each([['spotlight', 'join'], ['spotlight', 'became'], ['clarityhud', 'join'], ['clarityhud', 'became']])('candidate does not promote %s %s into subscription', async (family, kind) => {
  const f = fixture('work', family);
  expect(f.handlers.has('superfan')).toBe(false);
  await f.send('superfan', { username: 'synthetic', nickname: 'SuperFan viewer', superFanEventType: kind });
  if (family === 'spotlight') {
    expect(f.target.lastUsers.subscriber.nickname).toBe('Existing subscriber');
    expect(f.target.persistConfig).not.toHaveBeenCalled();
    expect(f.target.broadcastOverlayUser).not.toHaveBeenCalled();
  } else {
    expect(f.target.backend.eventQueues.subscribe).toHaveLength(1);
    expect(f.api.emit).not.toHaveBeenCalled();
  }
});
