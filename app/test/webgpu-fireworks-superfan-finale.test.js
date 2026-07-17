const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_FIREWORKS_CONFIG,
  SUPERFAN_FINALE_COOLDOWN_HOURS,
  normalizeConfig
} = require('../plugins/webgpu-fireworks/lib/config-schema');
const {
  SuperfanFinaleHistory,
  normalizeSuperfanIdentity
} = require('../plugins/webgpu-fireworks/lib/superfan-finale-history');

describe('WebGPU Superfan finale foundation', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-superfan-finale-'));
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  test('normalizes supported cooldowns and intensity', () => {
    expect(SUPERFAN_FINALE_COOLDOWN_HOURS).toEqual([6, 12, 24, 72, 168]);
    expect(normalizeConfig({ superfanFinaleCooldownHours: 12, superfanFinaleIntensity: 99 }))
      .toMatchObject({ superfanFinaleEnabled: true, superfanFinaleCooldownHours: 12, superfanFinaleIntensity: 10 });
    expect(normalizeConfig({ superfanFinaleCooldownHours: 13, superfanFinaleIntensity: 0 }))
      .toMatchObject({
        superfanFinaleCooldownHours: DEFAULT_FIREWORKS_CONFIG.superfanFinaleCooldownHours,
        superfanFinaleIntensity: 1
      });
  });

  test('prefers stable user id and normalizes handle fallbacks', () => {
    expect(normalizeSuperfanIdentity({ userId: 42, uniqueId: 'Ignored' })).toBe('id:42');
    expect(normalizeSuperfanIdentity({ uniqueId: '  Fan.Name  ' })).toBe('user:fan.name');
    expect(normalizeSuperfanIdentity({})).toBeNull();
  });

  test('falls back from a blank top-level user id to the nested user id', () => {
    expect(normalizeSuperfanIdentity({ userId: '  ', user: { id: 42 } })).toBe('id:42');
  });

  test('falls back from a blank unique id to the username', () => {
    expect(normalizeSuperfanIdentity({ uniqueId: '  ', username: 'Valid.Name' })).toBe('user:valid.name');
  });

  test('persists independent timestamps and safely ignores corrupt JSON', () => {
    const filePath = path.join(tempDir, 'superfan-finales.json');
    let now = 1_000_000;
    const first = new SuperfanFinaleHistory({ filePath, now: () => now });
    expect(first.load()).toBe(0);
    first.markAccepted('id:a');
    expect(first.isEligible('id:a', 6, now + 6 * 60 * 60 * 1000 - 1)).toBe(false);
    expect(first.isEligible('id:a', 24, now + 12 * 60 * 60 * 1000)).toBe(false);
    expect(first.isEligible('id:a', 12, now + 12 * 60 * 60 * 1000)).toBe(true);
    expect(first.isEligible('id:b', 6, now)).toBe(true);

    const second = new SuperfanFinaleHistory({ filePath, now: () => now });
    expect(second.load()).toBe(1);
    expect(second.getLastAcceptedAt('id:a')).toBe(now);

    fs.writeFileSync(filePath, '{broken', 'utf8');
    const warnings = [];
    const corrupt = new SuperfanFinaleHistory({ filePath, log: message => warnings.push(message) });
    expect(corrupt.load()).toBe(0);
    expect(corrupt.snapshot()).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  test('keeps the in-memory cooldown when persistence fails', () => {
    const warnings = [];
    const history = new SuperfanFinaleHistory({
      filePath: path.join(tempDir, 'unwritable.json'),
      log: message => warnings.push(message),
      now: () => 1234
    });
    jest.spyOn(history, 'save').mockImplementation(() => { throw new Error('disk full'); });
    history.markAccepted('id:a');
    expect(history.getLastAcceptedAt('id:a')).toBe(1234);
    expect(warnings).toEqual([expect.stringContaining('disk full')]);
  });

  test('discards future history entries while loading a current entry', () => {
    const filePath = path.join(tempDir, 'superfan-finales.json');
    const now = 1_000_000;
    fs.writeFileSync(filePath, JSON.stringify({
      version: 1,
      entries: {
        'id:current': now,
        'id:future': now + 1
      }
    }), 'utf8');
    const history = new SuperfanFinaleHistory({ filePath, now: () => now });

    expect(history.load()).toBe(1);
    expect(history.snapshot()).toEqual({ 'id:current': now });
  });
});
