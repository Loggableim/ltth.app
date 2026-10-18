'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

let temp;
let fixtureApp;
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-public-default-policy-'));
  fixtureApp = path.join(temp, 'app');
  fs.mkdirSync(path.join(fixtureApp, 'config'), { recursive: true });
  fs.cpSync(path.join(__dirname, '../modules'), path.join(fixtureApp, 'modules'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../config/plugin-release-policy.json'), path.join(fixtureApp, 'config/plugin-release-policy.json'));
  fs.writeFileSync(path.join(fixtureApp, 'config/distribution-mode.json'), JSON.stringify({ channel: 'public' }));
  const schema = path.join(fixtureApp, 'plugins/clarityhud/lib/settings-schema.js');
  fs.mkdirSync(path.dirname(schema), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../plugins/clarityhud/lib/settings-schema.js'), schema);
});
afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

function runOriginal(body) {
  const result = spawnSync(process.execPath, ['-e', body, fixtureApp], {
    encoding: 'utf8', timeout: 5000, env: { ...process.env, NODE_OPTIONS: '' }
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.signal).toBeNull();
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout);
}

test('default original helper uses owned actual public marker without injected policy', () => {
  const result = runOriginal(`
    const path = require('path');
    const root = process.argv[1];
    const { createPublicReleaseEventGuard } = require(path.join(root, 'modules/public-overlay-release-event-policy'));
    const owners = require(path.join(root, 'modules/public-overlay-release-event-owners.json'));
    const guard = createPublicReleaseEventGuard();
    const results = Object.entries(owners.events).flatMap(([direction, entries]) => Object.keys(entries).map(name => guard(direction, name)));
    process.stdout.write(JSON.stringify({ count: results.length, denied: results.every(value => value === false), weather: guard('outgoing', 'weather:clear'), tts: guard('outgoing', 'tts:playback:ended') }));
  `);
  expect(result).toEqual({ count: 128, denied: true, weather: true, tts: true });
});

test('default original direct socket with owned public marker denies reserved packet and preserves local payload', () => {
  const result = runOriginal(`
    const path = require('path');
    const { protectPublicSocket } = require(path.join(process.argv[1], 'modules/public-overlay-access'));
    function make(host) {
      const delivered = [];
      const socket = { handshake: { headers: { host } }, join() {}, use() {}, emit(...args) { delivered.push(args); } };
      protectPublicSocket({ socket, logger: { warn() {} } });
      return { socket, delivered };
    }
    const payload = { internal: 'controlled-marker' };
    const publicClient = make('owned.trycloudflare.com');
    const localClient = make('localhost:43219');
    publicClient.socket.emit('sidekick:public-status', payload);
    localClient.socket.emit('sidekick:public-status', payload);
    process.stdout.write(JSON.stringify({ publicCount: publicClient.delivered.length, localIdentity: localClient.delivered[0][1] === payload, localEvent: localClient.delivered[0][0] }));
  `);
  expect(result).toEqual({ publicCount: 0, localIdentity: true, localEvent: 'sidekick:public-status' });
});
