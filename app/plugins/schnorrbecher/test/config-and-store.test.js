const fs = require('fs');
const os = require('os');
const path = require('path');

const { DEFAULT_STATE, normalizeConfig } = require('../lib/config');
const CoinJarStore = require('../lib/state-store');

describe('Schnorrbecher configuration and store', () => {
  let dataDir;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schnorrbecher-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('clamps unsafe display and physics values', () => {
    expect(normalizeConfig({
      jarWidth: -3,
      jarHeight: 99999,
      maxPhysicalIcons: 99999,
      giftSize1: 0,
      giftSize1000To1999: 99999,
      spawnDelayMs: 0,
      persistenceMode: 'invalid',
      soundVolume: 5
    })).toMatchObject({
      jarWidth: 160,
      jarHeight: 1400,
      maxPhysicalIcons: 3000,
      giftSize1: 16,
      giftSize1000To1999: 240,
      spawnDelayMs: 20,
      persistenceMode: 'session',
      soundVolume: 1
    });
  });

  test('uses a safe classic glass style unless a supported style is selected', () => {
    expect(normalizeConfig({}).jarStyle).toBe('classic');
    expect(normalizeConfig({ jarStyle: 'arcade' }).jarStyle).toBe('arcade');
    expect(normalizeConfig({ jarStyle: 'unknown' }).jarStyle).toBe('classic');
  });

  test('persists state atomically and clears it to defaults', () => {
    const store = new CoinJarStore(dataDir);
    store.saveState({
      totalCoinValue: 125,
      visualCoinCount: 9,
      lastProcessedEventIds: ['gift-1']
    });

    expect(store.loadState()).toMatchObject({
      totalCoinValue: 125,
      visualCoinCount: 9,
      lastProcessedEventIds: ['gift-1']
    });
    expect(fs.existsSync(path.join(dataDir, 'coin-jar-state.json.tmp'))).toBe(false);

    store.clearState();
    expect(store.loadState()).toEqual(DEFAULT_STATE);
  });
});
