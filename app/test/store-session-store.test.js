const crypto = require('crypto');
const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');

const StoreSessionStore = require('../modules/store-session-store');

const DAY_MS = 24 * 60 * 60 * 1000;

function createAccount(overrides = {}) {
  return {
    userId: 'user_123',
    sessionId: 'sess_123',
    license: {
      active: true,
      status: 'active',
      plan: 'beta-free',
      licenseId: 'ltth_beta_user_123'
    },
    access: {
      groups: ['beta'],
      closedBetaPlugins: ['weather-control'],
      features: ['plugin-store']
    },
    ...overrides
  };
}

describe('StoreSessionStore', () => {
  let sqlite;
  let now;
  let store;

  beforeEach(() => {
    now = new Date('2026-07-21T12:00:00.000Z');
    sqlite = new Database(':memory:');
    store = new StoreSessionStore(sqlite, {
      now: () => now
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('persists only the hash of an opaque session token', () => {
    const issued = store.issue(createAccount());
    const row = sqlite.prepare('SELECT * FROM store_sessions').get();

    expect(issued.token).toHaveLength(64);
    expect(row.token_hash).toBe(crypto.createHash('sha256').update(issued.token).digest('hex'));
    expect(row.token_hash).not.toContain(issued.token);
    expect(JSON.stringify(row)).not.toContain(issued.token);

    const restored = store.read(issued.token);
    expect(restored).toMatchObject({
      status: 'active',
      account: {
        userId: 'user_123',
        sessionId: 'sess_123',
        license: { plan: 'beta-free' },
        access: { groups: ['beta'] }
      }
    });
  });

  it('restores an active session from the same profile database after an app restart', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-store-session-restart-'));
    const databasePath = path.join(directory, 'profile.db');
    const firstDatabase = new Database(databasePath);
    const firstStore = new StoreSessionStore(firstDatabase, { now: () => now });
    const issued = firstStore.issue(createAccount());

    firstDatabase.close();

    const restartedDatabase = new Database(databasePath);
    const restartedStore = new StoreSessionStore(restartedDatabase, { now: () => now });
    expect(restartedStore.read(issued.token)).toMatchObject({
      status: 'active',
      account: { userId: 'user_123' }
    });

    restartedDatabase.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('rolls the 28-day expiry forward on use but requires Clerk verification after seven days', () => {
    const issued = store.issue(createAccount());

    now = new Date(now.getTime() + (6 * DAY_MS));
    const active = store.read(issued.token);
    expect(active.status).toBe('active');
    expect(active.expiresAt).toBe(now.getTime() + (28 * DAY_MS));

    now = new Date(now.getTime() + (2 * DAY_MS));
    const verification = store.read(issued.token);
    expect(verification).toMatchObject({
      status: 'revalidation_required',
      account: { userId: 'user_123' }
    });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM store_sessions').get().count).toBe(1);
  });

  it('rejects an expired session and removes it from storage', () => {
    const issued = store.issue(createAccount());

    now = new Date(now.getTime() + (29 * DAY_MS));
    expect(store.read(issued.token)).toEqual({ status: 'expired' });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM store_sessions').get().count).toBe(0);
  });

  it('revokes only the supplied local session', () => {
    const first = store.issue(createAccount({ userId: 'user_123' }));
    const second = store.issue(createAccount({ userId: 'user_456', sessionId: 'sess_456' }));

    expect(store.revoke(first.token)).toBe(true);
    expect(store.read(first.token)).toEqual({ status: 'missing' });
    expect(store.read(second.token)).toMatchObject({
      status: 'active',
      account: { userId: 'user_456' }
    });
  });
});
