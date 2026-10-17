'use strict';

const {
  PUBLIC_QUICK_TUNNEL_ROOM,
  createPublicOverlayAdapter
} = require('../modules/public-overlay-socket-adapter');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class RecordingAdapter {
  constructor() {
    this.calls = [];
  }

  broadcast(packet, options) {
    this.calls.push({ packet, options });
    return true;
  }
}

describe('FlameOverlay public trigger projection', () => {
  test('replaces internal trigger ID with ephemeral opaque token and strips source/internal fields', () => {
    const payload = {
      id: '1712345678900-private-trigger-suffix',
      type: 'dramatic',
      duration: 8000,
      revert: true,
      source: 'rule:private-gift-threshold',
      effect: 'lightning',
      intensityBoost: 0.8,
      bloomOverride: { enabled: true, intensity: 1.6, internal: 'no-forward' },
      cooldownKey: 'private-rule-key',
      bypassCooldown: true,
      debug: { payload: true }
    };

    const first = projectPublicOverlayPayload('flame-overlay:trigger', payload);
    const second = projectPublicOverlayPayload('flame-overlay:trigger', payload);

    expect(first).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      type: 'dramatic',
      duration: 8000,
      revert: true,
      effect: 'lightning',
      intensityBoost: 0.8,
      bloomOverride: { enabled: true, intensity: 1.6 }
    });
    expect(first.id).not.toBe(payload.id);
    expect(second.id).not.toBe(first.id);
    expect(JSON.stringify(first)).not.toMatch(/private-gift-threshold|private-rule-key|bypassCooldown|1712345678900/);
  });

  test('retains only renderer-consumed fields for all supported trigger actions', () => {
    const cases = [
      [{ type: 'flash', duration: 800, source: 'internal' }, { type: 'flash', duration: 800 }],
      [{ type: 'intensity-boost', duration: 5000, amount: 0.5, source: 'rule:hidden' }, { type: 'intensity-boost', duration: 5000, amount: 0.5 }],
      [{ type: 'pulse', duration: 1500, intensity: 0.3, source: 'rule:hidden' }, { type: 'pulse', duration: 1500, intensity: 0.3 }],
      [{ type: 'effect-switch', duration: 3000, effect: 'particles', source: 'rule:hidden' }, { type: 'effect-switch', duration: 3000, effect: 'particles' }],
      [{ type: 'color-flash', duration: 5000, color: '#ffd700', bloom: true, source: 'chat:!gold' }, { type: 'color-flash', duration: 5000, color: '#ffd700', bloom: true }],
      [{ type: 'color-change', duration: 15000, color: '#0066ff', source: 'chat:!blue' }, { type: 'color-change', duration: 15000, color: '#0066ff' }]
    ];

    for (const [input, expected] of cases) {
      const result = projectPublicOverlayPayload('flame-overlay:trigger', input);
      expect(result).toMatchObject({ id: expect.stringMatching(/^[0-9a-f-]{36}$/i), ...expected });
      expect(result).not.toHaveProperty('source');
    }
  });

  test.each([
    { type: 'unknown-action', duration: 1000 },
    { type: 'flash', duration: 99 },
    { type: 'flash', duration: 30001 },
    { type: 'effect-switch', effect: 'private-effect', duration: 1000 },
    { type: 'color-change', color: 'red', duration: 1000 },
    { type: 'pulse', intensity: 8, duration: 1000 },
    { type: 'dramatic', bloomOverride: { enabled: true, intensity: 999 }, duration: 1000 }
  ])('withholds malformed trigger payload %#', payload => {
    expect(projectPublicOverlayPayload('flame-overlay:trigger', payload)).toBeNull();
  });

  test('projects only the public room copy while local overlay consumers retain the original trigger', () => {
    const Adapter = createPublicOverlayAdapter(RecordingAdapter);
    const adapter = new Adapter();
    const options = { rooms: new Set([PUBLIC_QUICK_TUNNEL_ROOM]), except: new Set() };
    const payload = {
      id: 'backend-trigger-id', type: 'flash', duration: 800, revert: true,
      source: 'rule:internal-rule-id', privateContext: 'local-only'
    };

    adapter.broadcast({ data: ['flame-overlay:trigger', payload] }, options);

    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[0].packet.data).toEqual(['flame-overlay:trigger', payload]);
    expect(adapter.calls[1].packet.data[0]).toBe('flame-overlay:trigger');
    expect(adapter.calls[1].packet.data[1]).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i), type: 'flash', duration: 800, revert: true
    });
    expect(adapter.calls[1].packet.data[1]).not.toHaveProperty('source');
    expect(adapter.calls[1].packet.data[1]).not.toHaveProperty('privateContext');
    expect(adapter.calls[1].packet.data[1].id).not.toBe(payload.id);
  });

  test('original EffectsEngine uses only the opaque id as its local timer key and clears all timers without an id', () => {
    const source = fs.readFileSync(path.join(__dirname, '../plugins/flame-overlay/renderer/effects-engine.js'), 'utf8');
    const context = {
      console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      window: { addEventListener: jest.fn() }, document: { addEventListener: jest.fn() }, Date, Math, JSON, Number,
      setTimeout: jest.fn(() => ({ timer: true })),
      clearTimeout: jest.fn(),
      requestAnimationFrame: jest.fn(() => 1),
      cancelAnimationFrame: jest.fn()
    };
    vm.createContext(context);
    vm.runInContext(`${source}\nglobalThis.EffectsEngine = EffectsEngine;`, context, { filename: 'flame-effects-engine.js' });
    const engine = Object.create(context.EffectsEngine.prototype);
    Object.assign(engine, {
      config: { effectType: 'flames', flameIntensity: 1, flameBrightness: 0.3, flameColor: '#ff6600' },
      baseConfig: null,
      activeTriggers: [],
      triggerTimers: new Map(),
      defaultTriggerDuration: 5000,
      maxTriggerDuration: 30000,
      destroyed: false,
      switchEffect: jest.fn(() => true),
      updateUniforms: jest.fn()
    });
    const publicTrigger = projectPublicOverlayPayload('flame-overlay:trigger', {
      id: 'private-backend-trigger-id', type: 'flash', duration: 1000, source: 'rule:private-rule'
    });

    engine.handleTrigger(publicTrigger);

    expect(engine.activeTriggers[0].id).toBe(publicTrigger.id);
    expect(engine.triggerTimers.has(publicTrigger.id)).toBe(true);
    expect(engine.triggerTimers.has('private-backend-trigger-id')).toBe(false);
    engine.clearTriggers();
    expect(engine.activeTriggers).toEqual([]);
    expect(engine.triggerTimers.size).toBe(0);
  });

  test('keeps whole-trigger clear as the existing empty public payload', () => {
    expect(projectPublicOverlayPayload('flame-overlay:clear-triggers', {})).toBeUndefined();
  });
});
